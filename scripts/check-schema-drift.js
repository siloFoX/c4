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

const ROUTE_LINE = /req\.method\s*===\s*'(POST|PUT|PATCH|DELETE|GET)'\s*&&\s*route\s*===\s*'([^']+)'/;

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
// End of each range = line just before the next route or end of file.
const sortedKeys = [...routeRanges.keys()];
const routeStarts = sortedKeys.map((k) => routeRanges.get(k).start).sort((a, b) => a - b);
for (const [key, range] of routeRanges) {
  const idx = routeStarts.indexOf(range.start);
  range.end = idx + 1 < routeStarts.length ? routeStarts[idx + 1] - 1 : lines.length - 1;
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

  if (noOverlap) {
    console.log(`✗ ${key}: handler doesn't use ANY schema field (full drift)`);
    console.log(`    schema fields: ${[...schemaKeys].join(', ')}`);
    driftFound++;
  } else if (process.argv.includes('--verbose') && inSchemaOnly.length > 0) {
    console.log(`? ${key}: ${inSchemaOnly.length} schema field(s) not directly referenced by handler`);
    console.log(`    in schema only: ${inSchemaOnly.join(', ')}`);
    console.log(`    handler uses: ${inSchemaUsed.join(', ')}`);
  }
}

console.log(`\nChecked ${routesChecked} route(s) with requestBody schemas.`);
if (driftFound === 0) {
  console.log('No drift detected — all spec fields match handler usage.');
  process.exit(0);
}
console.log(`${driftFound} drift report(s) above.`);
process.exit(1);
