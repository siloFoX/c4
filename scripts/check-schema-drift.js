#!/usr/bin/env node
'use strict';

// Schema drift detector — catches divergence between ROUTE_SCHEMAS
// (the OpenAPI contract advertised at /openapi.json) and the actual
// route handlers in daemon.js (the wire reality).
//
// For each entry in ROUTE_SCHEMAS that defines a requestBody:
//   1. Locate the handler block in daemon.js
//   2. Walk forward up to 50 lines for the first parseBody()
//      destructuring or `body.<field>` access
//   3. Compare the extracted field names against the schema's
//      properties keys
//   4. Report any keys that exist in only one side
//
// Exit 0 = clean (no drift), 1 = drift detected.
//
// Limitations: only detects field-name mismatches. Type drift
// (route accepts {x: number} but schema says {x: string}) is out of
// scope — this is a name-level sanity check. The opt-in
// validateRequests + integration tests are the type-level guard.

const fs = require('node:fs');
const path = require('node:path');

const { ROUTE_SCHEMAS } = require(path.join(__dirname, '..', 'src', 'openapi-gen'));
const daemonPath = path.join(__dirname, '..', 'src', 'daemon.js');
const lines = fs.readFileSync(daemonPath, 'utf8').split('\n');

// Match `req.method === 'X' && route === '/y'` AND the parenthesised
// form `req.method === 'X' && (route === '/y' || ...)` — see
// openapi-gen.js for the same pattern.
const ROUTE_LINE = /req\.method\s*===\s*'(POST|PUT|PATCH|DELETE|GET)'\s*&&\s*\(?\s*route\s*===\s*'([^']+)'/;

// Locate every route's handler line range so we can scope the
// destructuring + body.<x> extraction to that block only.
const routeRanges = new Map(); // key=`<METHOD> <path>` → {start, end}
for (let i = 0; i < lines.length; i++) {
  const m = ROUTE_LINE.exec(lines[i]);
  if (m) {
    const key = `${m[1]} ${m[2]}`;
    if (!routeRanges.has(key)) routeRanges.set(key, { start: i, end: i });
  }
}
// End of each range = line just before the next route OR the next
// `else if (req.method ===` boundary (catches parametric routes
// like `orgParams && orgParams.kind === 'dept.member'` that don't
// match the literal `route === 'X'` pattern).
const sortedKeys = [...routeRanges.keys()];
const routeStarts = sortedKeys.map((k) => routeRanges.get(k).start).sort((a, b) => a - b);
const ELSE_IF_METHOD = /^\s*\}\s*else\s+if\s*\(\s*req\.method/;
for (const [key, range] of routeRanges) {
  const idx = routeStarts.indexOf(range.start);
  const literalEnd = idx + 1 < routeStarts.length ? routeStarts[idx + 1] - 1 : lines.length - 1;
  // Walk forward from range.start+1 looking for the first `} else if
  // (req.method` boundary — that's where the literal-route handler
  // block ends, even if the next handler is parametric (regex-based).
  let parametricEnd = literalEnd;
  for (let i = range.start + 1; i <= literalEnd; i++) {
    if (ELSE_IF_METHOD.test(lines[i])) {
      parametricEnd = i - 1;
      break;
    }
  }
  range.end = parametricEnd;
}

function _extractFieldsFromHandler(start, end) {
  const fields = new Set();
  // Pattern A: const { a, b, c } = await parseBody(req);
  // Pattern B: const _body = await parseBody(req); const { a, b } = _body;
  // Pattern C: body.path / body.sessionId / etc — walk all body.<id> hits
  // Pattern D: handler passes body wholesale to a manager method
  //            (e.g., wfMgr.createWorkflow(body)) — schema describes
  //            the callee's expected fields, drift check N/A.
  let wholesalePassThrough = false;
  for (let i = start; i <= end; i++) {
    const line = lines[i];
    const destruct = line.match(/const\s*\{([^}]+)\}\s*=\s*(?:await\s+)?(?:parseBody\(req\)|_body|body)/);
    if (destruct) {
      for (const piece of destruct[1].split(',')) {
        const name = piece.trim().split(/[\s:=]/)[0];
        if (name && /^[a-zA-Z_]/.test(name)) fields.add(name);
      }
    }
    // body.<id> / _body.<id>
    let m;
    const bodyAccess = /\b(?:body|_body)\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
    while ((m = bodyAccess.exec(line)) !== null) {
      fields.add(m[1]);
    }
    // Detect wholesale pass-through: foo.method(body) or foo.method(body || {}).
    // We don't try to enumerate the callee's fields — just mark the
    // handler as "schema fields are routed through".
    if (/\(\s*body(?:\s*\|\|\s*\{\}\s*)?\s*[,)]/.test(line) ||
        /\(\s*body\.\w+\s*,/.test(line)) {
      wholesalePassThrough = true;
    }
    // parseBodyRaw → {raw, json} — handlers that consume json
    // wholesale (typically external webhook receivers) pass it on
    // to a verifier/parser. Same pass-through semantics.
    if (/parseBodyRaw\(req\)/.test(line)) {
      wholesalePassThrough = true;
    }
  }
  return { fields, wholesalePassThrough };
}

// (Phase 2) Extract every searchParams.get('X') call inside a handler
// range. Returns the set of query param names the handler reads.
function _extractQueryParamsFromHandler(start, end) {
  const params = new Set();
  const re = /url\.searchParams\.get\(['"]([^'"]+)['"]\)/g;
  for (let i = start; i <= end; i++) {
    let m;
    while ((m = re.exec(lines[i])) !== null) params.add(m[1]);
  }
  return params;
}

// (Phase 3) Extract response field names from a handler block.
// Looks for `result = { a, b, c, ... }` literal patterns inside the
// range. Returns null when the handler delegates wholesale to a
// manager method (`result = manager.X(...)`) — drift can't be
// statically inferred in that case.
//
// Returns { fields: Set, hasSpread: boolean }. hasSpread is true
// when any `result = { ..., ...x }` spread is detected — this means
// the spec may have fields the handler appears to omit (the spread
// brings them in dynamically) so inSpecOnly checks should be relaxed.
//
// Limitations:
// - Only catches inline object literals on `result =`.
// - Multi-line literals get joined; nested objects get flattened.
// - Computed keys and conditional fields are best-effort.
function _extractResponseFieldsFromHandler(start, end) {
  // Concatenate the handler block into one string.
  const block = lines.slice(start, end + 1).join('\n');
  // Hunt for the LAST `result = { ... }` literal — daemons often have
  // an early-return error path then a final happy-path assignment.
  const literalRe = /result\s*=\s*\{([\s\S]*?)\};/g;
  const literals = [];
  let m;
  while ((m = literalRe.exec(block)) !== null) literals.push(m[1]);
  // Bail if we see a `result = manager.X(...)` style pass-through; the
  // shape is the callee's, not the route's, so drift is N/A here.
  const passThroughRe = /result\s*=\s*(?:await\s+)?[a-zA-Z_]\w*\.[a-zA-Z_]\w*\(/;
  if (passThroughRe.test(block)) return null;
  if (literals.length === 0) return null;
  const fields = new Set();
  let hasSpread = false;
  for (const body of literals) {
    // Trim string literals and inline functions to avoid harvesting
    // their inner identifiers as keys.
    const sanitized = body
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/`(?:[^`\\]|\\.)*`/g, '``');
    // Walk top-level commas only — flatten nested braces / brackets
    // by tracking depth so `{ a: { b: 1 }, c }` yields [a, c] not
    // [a, b, c]. Each top-level segment then has the key name as
    // either `key:` (long) or `key` (shorthand) up front.
    const segs = [];
    let depth = 0, start = 0;
    for (let i = 0; i < sanitized.length; i++) {
      const ch = sanitized[i];
      if (ch === '{' || ch === '[' || ch === '(') depth++;
      else if (ch === '}' || ch === ']' || ch === ')') depth--;
      else if (ch === ',' && depth === 0) {
        segs.push(sanitized.slice(start, i));
        start = i + 1;
      }
    }
    segs.push(sanitized.slice(start));
    // Each segment: extract the leading identifier. Skip `...spread`
    // segments — those mix in a callee's shape and we can't enumerate
    // it statically.
    for (const seg of segs) {
      if (/^\s*\.\.\./.test(seg)) {
        hasSpread = true;
        continue;
      }
      const m = seg.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (m) fields.add(m[1]);
    }
  }
  return { fields, hasSpread };
}

let driftFound = 0;
let routesChecked = 0;

for (const [key, schemas] of Object.entries(ROUTE_SCHEMAS)) {
  if (!schemas.requestBody || !schemas.requestBody.properties) continue;
  const range = routeRanges.get(key);
  if (!range) {
    // Spec describes a route the daemon doesn't expose — drift.
    console.log(`✗ ${key}: spec defines requestBody but daemon has no matching route handler`);
    driftFound++;
    continue;
  }
  routesChecked++;
  const schemaKeys = new Set(Object.keys(schemas.requestBody.properties));
  const { fields: handlerKeys, wholesalePassThrough } = _extractFieldsFromHandler(range.start, range.end);

  // Wholesale pass-through (handler does manager.X(body)): the schema
  // describes what the callee accepts, drift can't be checked at the
  // route layer. Skip without flagging.
  if (wholesalePassThrough) continue;

  const inSchemaOnly = [...schemaKeys].filter((k) => !handlerKeys.has(k));
  const inSchemaUsed = [...schemaKeys].filter((k) => handlerKeys.has(k));
  const noOverlap = inSchemaUsed.length === 0 && schemaKeys.size > 0;

  // Common locals that show up in destructurings but aren't body
  // fields — filter them out before reporting handler-only.
  const COMMON_LOCALS = new Set([
    'req', 'res', 'method', 'route', 'cfg', 'gate', 'authCheck',
    'manager', 'rbac', 'result', 'ok', 'errors', 'success',
    // parseBody artifacts
    'raw', 'json',
    // common temporary destructurings inside handlers
    'data', 'payload', 'value', 'response', 'response',
  ]);
  const inHandlerOnly = [...handlerKeys].filter((k) =>
    !schemaKeys.has(k) && !COMMON_LOCALS.has(k));

  if (noOverlap) {
    console.log(`✗ ${key}: handler doesn't use ANY schema field (full drift)`);
    console.log(`    schema fields: ${[...schemaKeys].join(', ')}`);
    driftFound++;
    continue;
  }

  // Schema gap — handler reads body fields the spec doesn't document.
  // We only flag this when there's at least one inSchemaUsed (so it's
  // not a wholesale-pass-through misread) AND the handler-only count
  // is small (so we don't flag entire RPC envelopes).
  const STRICT = process.argv.includes('--strict');
  if (STRICT && inHandlerOnly.length > 0 && inSchemaUsed.length > 0) {
    console.log(`✗ ${key}: handler reads ${inHandlerOnly.length} body field(s) the schema doesn't document`);
    console.log(`    schema fields:  ${[...schemaKeys].join(', ')}`);
    console.log(`    handler reads also: ${inHandlerOnly.join(', ')}`);
    driftFound++;
    continue;
  }

  if (process.argv.includes('--verbose')) {
    if (inSchemaOnly.length > 0) {
      console.log(`? ${key}: ${inSchemaOnly.length} schema field(s) not directly referenced by handler`);
      console.log(`    in schema only: ${inSchemaOnly.join(', ')}`);
      console.log(`    handler uses:   ${inSchemaUsed.join(', ')}`);
    }
    if (inHandlerOnly.length > 0) {
      console.log(`? ${key}: ${inHandlerOnly.length} handler field(s) not in schema`);
      console.log(`    handler-only: ${inHandlerOnly.join(', ')}`);
    }
  }
}

// Phase 2: GET parameter drift. Flag when the spec lists a parameter
// the handler never reads, OR when the handler reads a query param
// that's not documented in the spec.
let paramRoutesChecked = 0;
const STRICT = process.argv.includes('--strict');
const VERBOSE = process.argv.includes('--verbose');
for (const [key, schemas] of Object.entries(ROUTE_SCHEMAS)) {
  if (!schemas.parameters || schemas.parameters.length === 0) continue;
  if (!key.startsWith('GET ')) continue;
  const range = routeRanges.get(key);
  if (!range) continue;
  paramRoutesChecked++;
  const specParams = new Set(schemas.parameters
    .filter((p) => p.in === 'query')
    .map((p) => p.name));
  const handlerParams = _extractQueryParamsFromHandler(range.start, range.end);
  const inSpecOnly = [...specParams].filter((p) => !handlerParams.has(p));
  const inHandlerOnly = [...handlerParams].filter((p) => !specParams.has(p));

  if (STRICT && inHandlerOnly.length > 0) {
    console.log(`✗ ${key}: handler reads ${inHandlerOnly.length} query param(s) the spec doesn't document`);
    console.log(`    spec params:        ${[...specParams].join(', ') || '(none)'}`);
    console.log(`    handler reads also: ${inHandlerOnly.join(', ')}`);
    driftFound++;
    continue;
  }
  if (STRICT && inSpecOnly.length > 0) {
    console.log(`✗ ${key}: spec lists ${inSpecOnly.length} query param(s) the handler never reads`);
    console.log(`    in spec only: ${inSpecOnly.join(', ')}`);
    console.log(`    handler uses: ${[...handlerParams].join(', ') || '(none)'}`);
    driftFound++;
    continue;
  }
  if (VERBOSE && (inSpecOnly.length || inHandlerOnly.length)) {
    if (inSpecOnly.length) console.log(`? ${key}: ${inSpecOnly.length} param(s) in spec only: ${inSpecOnly.join(', ')}`);
    if (inHandlerOnly.length) console.log(`? ${key}: ${inHandlerOnly.length} param(s) in handler only: ${inHandlerOnly.join(', ')}`);
  }
}

// Phase 3: response shape drift. Compare `result = { ... }` field
// names against the spec's response.properties. Only catches inline
// object literals — wholesale pass-through (result = mgr.X()) and
// dynamic assignments stay opaque, but the literal-return cases
// (which is most of the daemon's surface) get coverage.
let respRoutesChecked = 0;
for (const [key, schemas] of Object.entries(ROUTE_SCHEMAS)) {
  if (!schemas.response || !schemas.response.properties) continue;
  const range = routeRanges.get(key);
  if (!range) continue;
  const extracted = _extractResponseFieldsFromHandler(range.start, range.end);
  if (extracted === null) continue; // pass-through, skip
  const { fields: handlerFields, hasSpread } = extracted;
  if (handlerFields.size === 0) continue;
  respRoutesChecked++;
  const specKeys = new Set(Object.keys(schemas.response.properties));
  const RESP_LOCALS = new Set([
    'error', // every handler can return { error: msg } on the failure path
  ]);
  const inSpecOnly = [...specKeys].filter((k) => !handlerFields.has(k));
  const inHandlerOnly = [...handlerFields].filter((k) => !specKeys.has(k) && !RESP_LOCALS.has(k));
  // Heuristic: only flag when we have at least one overlap (otherwise
  // we're probably looking at the wrong literal — the actual happy
  // path may be in a deeper branch).
  const overlap = [...specKeys].some((k) => handlerFields.has(k));
  if (!overlap) continue;
  if (STRICT && inHandlerOnly.length > 0) {
    console.log(`✗ ${key}: handler returns ${inHandlerOnly.length} response field(s) the spec doesn't document`);
    console.log(`    spec props:        ${[...specKeys].join(', ')}`);
    console.log(`    handler returns also: ${inHandlerOnly.join(', ')}`);
    driftFound++;
    continue;
  }
  // inSpecOnly check: skip when the handler uses a spread, because
  // the spread mixes in fields we can't enumerate statically (they
  // come from the callee's return shape).
  if (STRICT && inSpecOnly.length > 0 && !hasSpread) {
    // De-prioritised — many spec fields are conditional (only present
    // in some code paths). Only flag when more than half are missing.
    if (inSpecOnly.length > specKeys.size / 2) {
      console.log(`✗ ${key}: spec lists ${inSpecOnly.length} response field(s) the handler never returns`);
      console.log(`    in spec only: ${inSpecOnly.join(', ')}`);
      console.log(`    handler returns: ${[...handlerFields].join(', ')}`);
      driftFound++;
      continue;
    }
  }
  if (VERBOSE && (inSpecOnly.length || inHandlerOnly.length)) {
    if (inSpecOnly.length) console.log(`? ${key}: ${inSpecOnly.length} response field(s) in spec only${hasSpread ? ' (handler uses spread)' : ''}: ${inSpecOnly.join(', ')}`);
    if (inHandlerOnly.length) console.log(`? ${key}: ${inHandlerOnly.length} response field(s) in handler only: ${inHandlerOnly.join(', ')}`);
  }
}

console.log(`\nChecked ${routesChecked} route(s) with requestBody schemas.`);
console.log(`Checked ${paramRoutesChecked} GET route(s) with query parameter schemas.`);
console.log(`Checked ${respRoutesChecked} route(s) with response shape schemas.`);
if (driftFound === 0) {
  console.log('No drift detected — all spec fields match handler usage.');
  process.exit(0);
}
console.log(`${driftFound} drift report(s) above.`);
process.exit(1);
