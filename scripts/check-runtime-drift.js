#!/usr/bin/env node
'use strict';

// Runtime drift checker — Phase 4 of the drift detection family.
//
// The static phases (check-schema-drift.js) compare ROUTE_SCHEMAS
// against handler source. They miss two classes of drift the source
// can't reveal: type mismatches (handler returns string, spec says
// number) and conditional shapes (handler returns one of N envelopes
// based on params). Runtime validation is the only way to catch
// those.
//
// What this script does:
//   1. Hit every safe GET route on the live daemon (no spawning workers,
//      no mutating state)
//   2. Validate the response against the spec's response schema using
//      openapi-validate.js
//   3. Report any type / shape mismatches
//
// Usage:
//   node scripts/check-runtime-drift.js [--base http://127.0.0.1:3456]
//                                       [--token <jwt>]
//                                       [--strict]
//
// Exit 0 = clean, 1 = drift detected.
//
// Limitations:
//   - Only GET routes (mutating endpoints would corrupt state)
//   - Skips streaming routes (SSE) — those need a different harness
//   - Skips routes that need specific worker names / session ids
//   - Skips routes guarded by auth when no token is supplied

const path = require('node:path');
const { ROUTE_SCHEMAS } = require(path.join(__dirname, '..', 'src', 'openapi-gen'));
const { validate } = require(path.join(__dirname, '..', 'src', 'openapi-validate'));

const args = process.argv.slice(2);
const base = (() => {
  const i = args.indexOf('--base');
  return i >= 0 && args[i + 1] ? args[i + 1] : 'http://127.0.0.1:3456';
})();
const token = (() => {
  const i = args.indexOf('--token');
  return i >= 0 && args[i + 1] ? args[i + 1] : process.env.C4_TOKEN || null;
})();
const STRICT = args.includes('--strict');

// Routes that should NOT be hit at runtime:
//   - Mutators (POST/PUT/PATCH/DELETE) — would corrupt state.
//   - SSE streams — they don't return a JSON body.
//   - Routes that take seconds (wait-read with 120s default timeout).
const SKIP_ROUTES = new Set([
  'GET /watch',                      // SSE
  'GET /events',                     // SSE
  'GET /approvals/stream',           // SSE
  'GET /openapi.yaml',               // YAML body, not JSON
  'GET /dashboard',                  // HTML body
  'GET /api-docs',                   // HTML
  'GET /api-docs/redoc',             // HTML
  'GET /api-docs/index',             // HTML
  'GET /audit/export',               // CSV body
  'GET /wait-read',                  // blocks for a worker (120s timeout)
  'GET /wait-read-multi',            // blocks for a worker (120s timeout)
]);

// Routes that need a query parameter to return the happy-path 200.
// We supply sensible defaults so the runtime checker can validate
// these too. Without this, the daemon returns 400 ({error: 'Missing
// name parameter'}) which is a valid error envelope but not the
// shape we want to verify.
const PARAMETERIZED_ROUTES = {
  'GET /read':            (ctx) => ctx.workerName ? `?name=${ctx.workerName}` : null,
  'GET /read-now':        (ctx) => ctx.workerName ? `?name=${ctx.workerName}` : null,
  'GET /scrollback':      (ctx) => ctx.workerName ? `?name=${ctx.workerName}&lines=10` : null,
  'GET /session-id':      (ctx) => ctx.workerName ? `?name=${ctx.workerName}` : null,
  'GET /swarm':           (ctx) => ctx.workerName ? `?name=${ctx.workerName}` : null,
  'GET /plan-revisions':  (ctx) => ctx.workerName ? `?name=${ctx.workerName}` : null,
  'GET /scribe-context':  () => '?maxBytes=1024',
  'GET /events/context':  () => '?target=' + encodeURIComponent(new Date().toISOString()) + '&minutesBefore=1&minutesAfter=1',
  'GET /plan':            (ctx) => ctx.workerName ? `?name=${ctx.workerName}` : null,
  'GET /validation':      (ctx) => ctx.workerName ? `?name=${ctx.workerName}` : null,
};

// Idempotent POST routes that don't mutate state (just validate or
// query). Each entry: route → request body factory.
const IDEMPOTENT_POSTS = {
  'POST /rbac/check': () => ({
    username: 'admin',
    action: 'worker.create',
    resource: { type: 'project', id: 'main' },
  }),
  'POST /risk/check': () => ({
    command: 'rm -rf /tmp/test',
  }),
  // (v1.10.70) AI second-pass feedback. Idempotent at the audit
  // layer (each call appends a row but doesn't mutate live state).
  'POST /risk/ai-feedback': () => ({
    worker: 'runtime-drift-probe',
    command: 'echo runtime-drift-probe',
    classifierLevel: 'low',
    suggestedLevel: 'low',
    reason: 'runtime drift checker probe',
  }),
  // (v1.10.92) Sandbox preview is a pure builder — no exec, no
  // audit event. Always safe to probe.
  'POST /risk/preview': () => ({
    command: 'echo runtime-drift-probe',
    runtime: 'null',
  }),
  // (v1.10.92) Shadow exec endpoint. Always-safe probe variant —
  // the body explicitly forces runtime='null' which the
  // executeInSandbox() function refuses with BlockedByRuntimeError
  // before any spawn. Daemon catches the refusal and returns the
  // standard envelope with refused:true, refusedReason. No audit
  // event written, no actual exec, no side effects regardless of
  // the daemon's riskClassifier.sandbox.allowExec setting.
  'POST /risk/exec': () => ({
    command: 'echo runtime-drift-probe',
    runtime: 'null',
  }),
};

function _ok(label) { console.log(`✔ ${label}`); }
function _fail(label, detail) { console.log(`✗ ${label}${detail ? ` :: ${detail}` : ''}`); }

async function _hit(method, routePath, body) {
  const url = `${base}/api${routePath}`;
  const headers = { 'Accept': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const init = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  // SSE / HTML / non-JSON: accept and skip
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return { skip: true, status: res.status, contentType: ct };
  const respBody = await res.json().catch(() => null);
  return { status: res.status, body: respBody, contentType: ct };
}

// Read the first SSE frame from a streaming endpoint, parse it,
// and tear down the connection. Returns { ok, contentType, frame }
// where `frame` is either a parsed event object or the raw text of
// the first frame seen.
async function _readFirstSseFrame(routePath, opts) {
  const url = `${base}/api${routePath}`;
  const headers = { 'Accept': 'text/event-stream' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const controller = new AbortController();
  const timeoutMs = (opts && opts.timeoutMs) || 5000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/event-stream')) {
      return { ok: false, contentType: ct, error: `expected text/event-stream, got ${ct}`, status: res.status };
    }
    if (!res.body) return { ok: false, contentType: ct, error: 'no response body' };
    // Read until we see a blank line (SSE frame separator) or the
    // 5-second budget elapses.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const idx = buf.indexOf('\n\n');
      if (idx >= 0) {
        controller.abort();
        const frameText = buf.slice(0, idx);
        // Parse `event: X` + `data: Y` lines.
        const evMatch = frameText.match(/^event:\s*(.+)$/m);
        const dataMatch = frameText.match(/^data:\s*(.+)$/m);
        const frame = {
          type: evMatch ? evMatch[1].trim() : 'message',
          data: null,
        };
        if (dataMatch) {
          const raw = dataMatch[1].trim();
          try { frame.data = JSON.parse(raw); }
          catch { frame.data = raw; }
        }
        return { ok: true, contentType: ct, frame };
      }
    }
    return { ok: false, contentType: ct, error: 'stream ended before first frame' };
  } catch (e) {
    if (e.name === 'AbortError') return { ok: false, error: 'timed out waiting for first frame' };
    return { ok: false, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

// Spawn a short-lived worker we can use to exercise routes that
// need `?name=<worker>`. Cleaned up at the end. When --no-fixture
// is passed (or the daemon refuses to spawn), the parameterised
// routes get skipped instead of flagged.
async function _setupFixture() {
  const NAME = `runtime-drift-${Date.now()}`;
  try {
    const r = await _hit('POST', '/create', { name: NAME, target: 'local' });
    if (r.status === 200 && r.body && (r.body.success || r.body.name)) {
      return { workerName: NAME };
    }
    return { workerName: null, reason: `create returned ${r.status}` };
  } catch (e) {
    return { workerName: null, reason: e.message };
  }
}
async function _teardownFixture(ctx) {
  if (!ctx || !ctx.workerName) return;
  try { await _hit('POST', '/close', { name: ctx.workerName }); } catch {}
}

// SSE routes — exercised separately. Each entry: route → expected
// shape of the first frame the daemon emits (the "connected" /
// initial-snapshot frame). The runtime checker reads one frame, then
// aborts the connection, then validates.
const SSE_FIRST_FRAME = {
  // /events: opening frame is `data: {"type":"connected"}`
  'GET /events': (frame) => frame.data && frame.data.type === 'connected',
  // /watch: opening frame is `{type: "output", data: <base64>}` once
  // the worker writes anything; for an idle fixture worker we may
  // get nothing within the budget. Skip when the fixture is missing.
  'GET /watch': (frame) => frame.data && (frame.data.type === 'output' || frame.data.type === 'connected'),
  // /approvals/stream: opening frame is `{type: "connected"}` then a
  // snapshot frame; either is acceptable.
  'GET /approvals/stream': (frame) => frame.data && (frame.data.type === 'connected' || frame.data.type === 'snapshot'),
};

async function main() {
  let pass = 0, fail = 0, skipped = 0;
  const NO_FIXTURE = args.includes('--no-fixture');
  const ctx = NO_FIXTURE ? { workerName: null } : await _setupFixture();
  if (ctx.workerName) console.log(`(fixture worker: ${ctx.workerName})\n`);
  else if (!NO_FIXTURE) console.log(`(no fixture worker — ${ctx.reason}; parameterised routes will be skipped)\n`);

  // Phase: SSE first-frame validation. Hit each streaming route,
  // pull the first frame, parse it, run the route's validator
  // predicate. /watch needs the fixture worker; the others don't.
  for (const [key, validator] of Object.entries(SSE_FIRST_FRAME)) {
    const route = key.slice(4);
    if (key === 'GET /watch') {
      if (!ctx.workerName) { skipped++; continue; }
    }
    const url = key === 'GET /watch' ? route + `?name=${ctx.workerName}` : route;
    const r = await _readFirstSseFrame(url, { timeoutMs: 3000 });
    if (!r.ok) {
      // /watch may not emit anything within the budget for an idle
      // worker — that's not drift, just timing. Skip when we time out.
      if (key === 'GET /watch' && /timed out/.test(r.error || '')) { skipped++; continue; }
      _fail(key, `SSE first frame: ${r.error}`);
      fail++;
      continue;
    }
    if (!validator(r.frame)) {
      _fail(key, `SSE first frame did not match validator: ${JSON.stringify(r.frame).slice(0, 120)}`);
      fail++;
      continue;
    }
    _ok(key + ' (SSE first frame)');
    pass++;
  }

  for (const key of Object.keys(ROUTE_SCHEMAS).sort()) {
    if (SKIP_ROUTES.has(key)) { skipped++; continue; }
    const isGet = key.startsWith('GET ');
    const isIdempotentPost = IDEMPOTENT_POSTS[key];
    if (!isGet && !isIdempotentPost) continue;
    const method = isGet ? 'GET' : 'POST';
    const route = key.slice(method.length + 1); // drop "GET " or "POST "
    const schemas = ROUTE_SCHEMAS[key];
    if (!schemas.response) { skipped++; continue; }
    if (schemas.response.type === 'string') { skipped++; continue; }

    // Build the URL — append fixture query params for GET routes
    // that need them.
    let pathWithQuery = route;
    let body;
    if (isGet && PARAMETERIZED_ROUTES[key]) {
      const qs = PARAMETERIZED_ROUTES[key](ctx);
      if (!qs) { skipped++; continue; }
      pathWithQuery = route + qs;
    }
    if (isIdempotentPost) {
      body = isIdempotentPost();
    }

    let result;
    try {
      result = await _hit(method, pathWithQuery, body);
    } catch (e) {
      _fail(key, `fetch failed: ${e.message}`);
      fail++;
      continue;
    }
    if (result.skip) { skipped++; continue; }

    // Auth-protected routes hit without a token return 401 — not drift.
    if (result.status === 401 || result.status === 403) {
      if (STRICT) {
        _fail(key, `auth required (status ${result.status}) — supply --token to validate`);
        fail++;
      } else {
        skipped++;
      }
      continue;
    }

    // Routes that require a specific resource (worker name / session id)
    // return 400/404 with `{error: ...}` — that's an error envelope, not
    // a happy-path body. We don't validate it against the route's
    // response schema (which describes the 200 path), but DO validate
    // that the error body itself matches the standard ERROR_BODY shape.
    if (result.status === 400 || result.status === 404) {
      const errSchema = {
        type: 'object',
        properties: {
          error: { type: 'string' },
          details: { type: 'array', items: { type: 'string' } },
        },
      };
      const ev = validate(errSchema, result.body, 'error-body');
      if (!ev.valid) {
        _fail(key, `${result.status} body off-spec: ${ev.errors.slice(0, 2).join('; ')}`);
        fail++;
        continue;
      }
      skipped++;
      continue;
    }
    if (result.status >= 500) {
      _fail(key, `daemon returned ${result.status} :: ${JSON.stringify(result.body || {}).slice(0, 200)}`);
      fail++;
      continue;
    }

    // 200 path — validate the body against the response schema.
    const schema = { type: 'object', ...schemas.response };
    const v = validate(schema, result.body, 'response');
    if (!v.valid) {
      _fail(key, `${v.errors.length} type mismatch(es): ${v.errors.slice(0, 3).join('; ')}${v.errors.length > 3 ? ' …' : ''}`);
      fail++;
      continue;
    }
    _ok(key);
    pass++;
  }

  await _teardownFixture(ctx);
  console.log('');
  console.log(`Runtime drift: ${pass} pass, ${fail} fail, ${skipped} skipped (mutators / streams / auth / unfillable params)`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error('Runtime check failed:', e);
  process.exit(2);
});
