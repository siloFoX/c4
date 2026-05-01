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
//   - Routes that need a specific resource id we can't fabricate.
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
  'GET /wait-read',                  // blocks for a worker
  'GET /wait-read-multi',            // blocks for a worker
  'GET /watch',                      // SSE
  'GET /read',                       // requires worker name + a live worker
  'GET /read-now',                   // requires live worker
  'GET /scrollback',                 // requires live worker
  'GET /session-id',                 // requires worker
  'GET /plan',                       // requires worker + plan
  'GET /plan-revisions',             // requires worker
  'GET /scribe-context',             // queries scribe with no worker arg
  'GET /swarm',                      // requires worker
  'GET /events/context',             // requires `target` param
]);

function _ok(label) { console.log(`✔ ${label}`); }
function _fail(label, detail) { console.log(`✗ ${label}${detail ? ` :: ${detail}` : ''}`); }

async function _hit(method, routePath) {
  const url = `${base}/api${routePath}`;
  const headers = { 'Accept': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { method, headers });
  // SSE / HTML / non-JSON: accept and skip
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return { skip: true, status: res.status, contentType: ct };
  const body = await res.json().catch(() => null);
  return { status: res.status, body, contentType: ct };
}

async function main() {
  let pass = 0, fail = 0, skipped = 0;
  for (const key of Object.keys(ROUTE_SCHEMAS).sort()) {
    if (!key.startsWith('GET ')) continue;
    if (SKIP_ROUTES.has(key)) { skipped++; continue; }
    const route = key.slice(4); // drop "GET "
    const schemas = ROUTE_SCHEMAS[key];
    if (!schemas.response) { skipped++; continue; }
    if (schemas.response.type === 'string') { skipped++; continue; }

    let result;
    try {
      result = await _hit('GET', route);
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
    // return 400 with `{error: ...}`. That IS a valid response — but
    // not the happy path we're trying to validate. Skip instead of
    // flagging.
    if (result.status === 400 || result.status === 404) {
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

  console.log('');
  console.log(`Runtime drift: ${pass} pass, ${fail} fail, ${skipped} skipped (mutators / streams / auth / unfillable params)`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error('Runtime check failed:', e);
  process.exit(2);
});
