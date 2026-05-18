#!/usr/bin/env node
// bundle-budget.mjs -- production build byte-budget guard.
//
// (v1.11.358, TODO 11.340) `npm run bundle-budget` runs
// this script. The CI gate fails when any of the
// budgets are exceeded.
//
// Usage:
//
//   npm run bundle-budget
//   node web/scripts/bundle-budget.mjs --dist=web/dist
//
// The script walks the supplied `dist/assets/` directory,
// gzips each `.js` chunk on the fly, classifies it as
// `main` / `vendor` / `route`, sums per-class bytes, and
// compares the totals to the budgets defined below.
//
// Exit codes:
//   0 = within budget
//   1 = budget exceeded OR dist missing
//   2 = usage / argv error
//
// The PURE logic (classifyChunk + checkBundleBudgets) is
// exported so the companion test file can exercise it
// against synthetic inputs without running the real
// build.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, isAbsolute } from 'node:path';
import { gzipSync } from 'node:zlib';

// Budgets in BYTES (post-gzip). Sourced from the
// dispatch: main < 500KB, vendor < 800KB. The route /
// async chunks share a smaller cap so a single feature
// page cannot blow up to multi-MB unnoticed.
export const DEFAULT_BUNDLE_BUDGETS = Object.freeze({
  main: 500 * 1024,
  vendor: 800 * 1024,
  route: 200 * 1024,
});

// (v1.11.358, TODO 11.340) Chunk class names:
// 'main' | 'vendor' | 'route'. Documented via JSDoc
// only since this file is plain JS executed by node.

// (v1.11.358, TODO 11.340) Classifier: maps a chunk
// filename to one of the three budget buckets.
//
//   - `vendor-*.js` -> vendor (matches the
//     manualChunks names in vite.config.ts:
//     vendor / vendor-react / vendor-react-dom /
//     vendor-xterm / vendor-lucide).
//   - `index-*.js` or `main-*.js` -> main (the entry
//     chunk vite emits for the App).
//   - everything else -> route (per-page async chunks
//     vite emits for lazy() imports).
export function classifyChunk(filename) {
  if (filename.startsWith('vendor')) return 'vendor';
  if (filename.startsWith('index') || filename.startsWith('main')) return 'main';
  return 'route';
}

// Pure compute step. Takes a list of
// `{ name, gzipSize }` records + the budget map and
// returns a structured report. The shape is stable so
// the companion test asserts every branch (within /
// over / per-class breakdown) without touching the
// filesystem.
export function checkBundleBudgets(records, budgets = DEFAULT_BUNDLE_BUDGETS) {
  const perClass = { main: 0, vendor: 0, route: 0 };
  const byClass = { main: [], vendor: [], route: [] };
  for (const rec of records) {
    const cls = classifyChunk(rec.name);
    perClass[cls] += rec.gzipSize;
    byClass[cls].push(rec);
  }
  const breaches = [];
  for (const cls of /** @type {const} */ (['main', 'vendor', 'route'])) {
    const budget = budgets[cls];
    if (typeof budget !== 'number' || !Number.isFinite(budget)) continue;
    if (perClass[cls] > budget) {
      breaches.push({
        class: cls,
        actual: perClass[cls],
        budget,
        delta: perClass[cls] - budget,
      });
    }
  }
  return {
    ok: breaches.length === 0,
    perClass,
    byClass,
    breaches,
    budgets,
  };
}

// I/O step. Walks the supplied dist directory for
// `*.js` chunks, gzips each one, and returns the
// `{ name, rawSize, gzipSize }` records the pure step
// consumes. Throws when the directory is missing.
export function collectChunkRecords(distDir) {
  const assetsDir = join(distDir, 'assets');
  let entries;
  try {
    entries = readdirSync(assetsDir);
  } catch (e) {
    throw new Error(
      `bundle-budget: dist/assets not found at ${assetsDir}. Run 'npm run build' first.`,
    );
  }
  const records = [];
  for (const name of entries) {
    if (!name.endsWith('.js')) continue;
    const full = join(assetsDir, name);
    const st = statSync(full);
    if (!st.isFile()) continue;
    const buf = readFileSync(full);
    const gz = gzipSync(buf);
    records.push({ name, rawSize: buf.length, gzipSize: gz.length });
  }
  return records;
}

export function formatReport(report) {
  const lines = [];
  lines.push('Bundle budget report:');
  for (const cls of /** @type {const} */ (['main', 'vendor', 'route'])) {
    const budget = report.budgets[cls];
    const actual = report.perClass[cls];
    const status = actual > budget ? 'OVER' : 'ok';
    lines.push(
      `  [${status}] ${cls}: ${fmtKB(actual)} / ${fmtKB(budget)} budget`,
    );
    for (const rec of report.byClass[cls]) {
      lines.push(`      ${rec.name}  ${fmtKB(rec.gzipSize)} gz (${fmtKB(rec.rawSize)} raw)`);
    }
  }
  if (report.breaches.length > 0) {
    lines.push('');
    lines.push('Breaches:');
    for (const b of report.breaches) {
      lines.push(
        `  ${b.class}: ${fmtKB(b.actual)} > ${fmtKB(b.budget)} (over by ${fmtKB(b.delta)})`,
      );
    }
  }
  return lines.join('\n');
}

function fmtKB(bytes) {
  if (!Number.isFinite(bytes)) return '?';
  if (bytes < 1024) return `${bytes}B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)}KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)}MB`;
}

function parseArgs(argv) {
  const out = { dist: 'web/dist' };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--dist=')) {
      out.dist = a.slice('--dist='.length);
    }
  }
  return out;
}

// Only run main() when invoked directly. `import { ... }
// from './bundle-budget.mjs'` from the test file MUST
// NOT trigger the side-effect path.
const isDirectInvocation =
  // eslint-disable-next-line no-undef
  import.meta.url === `file://${process.argv[1]}`;

if (isDirectInvocation) {
  try {
    const args = parseArgs(process.argv);
    const distDir = isAbsolute(args.dist) ? args.dist : resolve(args.dist);
    const records = collectChunkRecords(distDir);
    const report = checkBundleBudgets(records);
    // eslint-disable-next-line no-console
    console.log(formatReport(report));
    process.exit(report.ok ? 0 : 1);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(String(e?.message ?? e));
    process.exit(1);
  }
}
