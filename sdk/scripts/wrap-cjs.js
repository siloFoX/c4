#!/usr/bin/env node
'use strict';

// After tsc emits dist/c4-client.js (ESM) + dist/c4-client.d.ts,
// emit a sibling dist/c4-client.cjs that re-exports the ESM via
// dynamic import. CJS consumers do `const { C4Client } =
// require('c4-sdk/typed')`; the resolver picks the .cjs entry.
//
// Also normalises the ESM file extension — tsc with module=esnext
// emits .js without rewriting import paths, but the package's exports
// map points at .js so consumers see exactly what's on disk.

const fs = require('node:fs');
const path = require('node:path');

const dist = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(dist)) {
  console.error('dist/ not found — run `npm run build` first');
  process.exit(1);
}

const cjsShim = `"use strict";
// CJS shim for c4-sdk/typed — re-exports the ESM build.
// Async loader pattern works around CJS-can't-require-ESM.
let _mod;
async function load() {
  if (!_mod) _mod = await import("./c4-client.js");
  return _mod;
}
module.exports = new Proxy({}, {
  get(_target, prop) {
    return async (...args) => {
      const m = await load();
      const v = m[prop];
      if (typeof v === "function") return v(...args);
      return v;
    };
  },
});
module.exports.load = load;
`;

const cjsPath = path.join(dist, 'c4-client.cjs');
fs.writeFileSync(cjsPath, cjsShim);
console.log(`wrote ${path.relative(process.cwd(), cjsPath)}`);

// List dist/ for visibility
for (const f of fs.readdirSync(dist).sort()) {
  const stat = fs.statSync(path.join(dist, f));
  console.log(`  ${stat.size.toString().padStart(8)}  ${f}`);
}
