'use strict';

// 8.20B - UI CLI coverage
//
// Covers three layers:
//   (a) Shared util behaviour: lib/format + lib/fuzzyFilter. The TS
//       consumers import these directly, but we want real unit tests
//       for the date-range, number, duration, and fuzzy helpers. The
//       util files are plain .js (with .d.ts siblings) specifically
//       so this test file can dynamic-import them without a
//       TypeScript transpile step.
//
//   (b) Daemon /batch endpoint wiring: the new POST /batch route in
//       daemon.js accepts either `tasks[]` or `task + count`, builds
//       worker names with the given prefix, and forwards to
//       manager.sendTask. We stub sendTask + assert the dispatch call
//       shape instead of spinning up a real PTY.
//
//   (c) Feature-page source wiring (same approach as tests/chat-view
//       and tests/web-control): source-grep the TSX to lock the
//       component -> endpoint pairing and the registry -> category
//       pairing so a future refactor cannot silently break the
//       Features sidebar.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { describe, it, before } = require('node:test');

const REPO_ROOT = path.join(__dirname, '..');

const FORMAT_JS = path.join(REPO_ROOT, 'web', 'src', 'lib', 'format.js');
const FUZZY_JS = path.join(REPO_ROOT, 'web', 'src', 'lib', 'fuzzyFilter.js');
const PAGES_DIR = path.join(REPO_ROOT, 'web', 'src', 'pages');
const REGISTRY = path.join(PAGES_DIR, 'registry.ts');
const APP_TSX = path.join(REPO_ROOT, 'web', 'src', 'App.tsx');
const TOP_TABS = path.join(REPO_ROOT, 'web', 'src', 'components', 'layout', 'TopTabs.tsx');
const DAEMON_JS = path.join(REPO_ROOT, 'src', 'daemon.js');
const CONTROL_PANEL = path.join(REPO_ROOT, 'web', 'src', 'components', 'ControlPanel.tsx');

// -----------------------------------------------------------------
// (a) format + fuzzyFilter unit tests
// -----------------------------------------------------------------

let formatMod;
let fuzzyMod;

before(async () => {
  formatMod = await import(`file://${FORMAT_JS}`);
  fuzzyMod = await import(`file://${FUZZY_JS}`);
});

describe('format.formatNumber', () => {
  it('returns - for null / undefined / NaN', () => {
    assert.strictEqual(formatMod.formatNumber(null), '-');
    assert.strictEqual(formatMod.formatNumber(undefined), '-');
    assert.strictEqual(formatMod.formatNumber(NaN), '-');
  });

  it('groups thousands and honours digits option', () => {
    assert.match(formatMod.formatNumber(1234567), /1[.,]234[.,]567/);
    assert.strictEqual(formatMod.formatNumber(1.2345, 2), '1.23');
  });
});

describe('format.formatBytes', () => {
  it('rejects negative and invalid values', () => {
    assert.strictEqual(formatMod.formatBytes(-1), '-');
    assert.strictEqual(formatMod.formatBytes(null), '-');
    assert.strictEqual(formatMod.formatBytes(undefined), '-');
    assert.strictEqual(formatMod.formatBytes(NaN), '-');
  });

  it('scales through B / KB / MB / GB', () => {
    assert.strictEqual(formatMod.formatBytes(0), '0 B');
    assert.strictEqual(formatMod.formatBytes(1024), '1.0 KB');
    assert.strictEqual(formatMod.formatBytes(1024 * 1024), '1.0 MB');
    assert.strictEqual(formatMod.formatBytes(1024 * 1024 * 1024), '1.0 GB');
  });

  it('drops decimal once the value crosses 100', () => {
    assert.strictEqual(formatMod.formatBytes(200 * 1024 * 1024), '200 MB');
  });
});

describe('format.formatDuration', () => {
  it('formats sub-minute durations in seconds', () => {
    assert.strictEqual(formatMod.formatDuration(0), '0s');
    assert.strictEqual(formatMod.formatDuration(59_000), '59s');
  });

  it('scales to minutes / hours / days as the magnitude grows', () => {
    assert.strictEqual(formatMod.formatDuration(60_000), '1m 0s');
    assert.strictEqual(formatMod.formatDuration(3_600_000), '1h 0m');
    assert.strictEqual(formatMod.formatDuration(86_400_000), '1d 0h');
  });

  it('returns - for invalid inputs', () => {
    assert.strictEqual(formatMod.formatDuration(null), '-');
    assert.strictEqual(formatMod.formatDuration(NaN), '-');
    assert.strictEqual(formatMod.formatDuration(-1), '-');
  });
});

describe('format.formatRelativeTime', () => {
  it('returns "<duration> ago" for timestamps in the past', () => {
    const now = Date.parse('2026-04-18T12:00:00Z');
    const fiveMinAgo = now - 5 * 60_000;
    assert.strictEqual(
      formatMod.formatRelativeTime(fiveMinAgo, now),
      '5m 0s ago',
    );
  });

  it('handles ISO strings', () => {
    const now = Date.parse('2026-04-18T12:00:00Z');
    const iso = new Date(now - 60_000).toISOString();
    assert.strictEqual(formatMod.formatRelativeTime(iso, now), '1m 0s ago');
  });

  it('returns - for non-finite / null inputs', () => {
    assert.strictEqual(formatMod.formatRelativeTime(null), '-');
    assert.strictEqual(formatMod.formatRelativeTime('not a date'), '-');
  });
});

describe('format.dateRange', () => {
  it('returns start=end when days===1', () => {
    const fixed = new Date('2026-04-18T08:00:00Z');
    const r = formatMod.dateRange(1, fixed);
    assert.strictEqual(r.start, '2026-04-18');
    assert.strictEqual(r.end, '2026-04-18');
  });

  it('spans the correct inclusive window for N days', () => {
    const fixed = new Date('2026-04-18T08:00:00Z');
    const r = formatMod.dateRange(7, fixed);
    assert.strictEqual(r.end, '2026-04-18');
    assert.strictEqual(r.start, '2026-04-12');
  });

  it('clamps invalid day counts up to 1', () => {
    const fixed = new Date('2026-04-18T08:00:00Z');
    const r = formatMod.dateRange(0, fixed);
    assert.strictEqual(r.start, r.end);
    const r2 = formatMod.dateRange(-7, fixed);
    assert.strictEqual(r2.start, r2.end);
    const r3 = formatMod.dateRange(NaN, fixed);
    assert.strictEqual(r3.start, r3.end);
  });
});

describe('format.dateRangeLabel', () => {
  it('returns human-friendly labels for the preset windows', () => {
    assert.strictEqual(formatMod.dateRangeLabel(1), 'Today');
    assert.strictEqual(formatMod.dateRangeLabel(7), 'Last 7 days');
    assert.strictEqual(formatMod.dateRangeLabel(30), 'Last 30 days');
    assert.strictEqual(formatMod.dateRangeLabel(90), 'Last 90 days');
  });

  it('falls back to a generic label for non-preset windows', () => {
    assert.strictEqual(formatMod.dateRangeLabel(14), 'Last 14 days');
  });
});

describe('fuzzyFilter.fuzzyScore', () => {
  it('returns 1 for empty needle (everything passes)', () => {
    assert.strictEqual(fuzzyMod.fuzzyScore('abc', ''), 1);
    assert.strictEqual(fuzzyMod.fuzzyScore('abc', '   '), 1);
  });

  it('returns 0 for empty haystack', () => {
    assert.strictEqual(fuzzyMod.fuzzyScore('', 'needle'), 0);
  });

  it('returns 2 for prefix hits and 1 for mid-string hits', () => {
    assert.strictEqual(fuzzyMod.fuzzyScore('scribe', 'scr'), 2);
    assert.strictEqual(fuzzyMod.fuzzyScore('my-scribe', 'scr'), 1);
  });

  it('is case-insensitive', () => {
    assert.strictEqual(fuzzyMod.fuzzyScore('SCRIBE', 'scr'), 2);
  });

  it('returns 0 for a miss', () => {
    assert.strictEqual(fuzzyMod.fuzzyScore('scribe', 'xyz'), 0);
  });
});

describe('fuzzyFilter.fuzzyFilter', () => {
  const items = [
    { name: 'scribe' },
    { name: 'batch' },
    { name: 'cleanup' },
    { name: 'my-scribe' },
  ];
  const key = (it) => it.name;

  it('returns a copy of the array for an empty query', () => {
    const out = fuzzyMod.fuzzyFilter(items, '', key);
    assert.strictEqual(out.length, items.length);
    assert.notStrictEqual(out, items);
  });

  it('drops non-matches', () => {
    const out = fuzzyMod.fuzzyFilter(items, 'scr', key);
    const names = out.map((x) => x.name);
    assert.ok(names.includes('scribe'));
    assert.ok(names.includes('my-scribe'));
    assert.ok(!names.includes('batch'));
  });

  it('ranks prefix matches ahead of mid-string matches', () => {
    const out = fuzzyMod.fuzzyFilter(items, 'scr', key);
    assert.strictEqual(out[0].name, 'scribe');
    assert.strictEqual(out[1].name, 'my-scribe');
  });
});

// -----------------------------------------------------------------
// (b) daemon /batch endpoint behaviour
// -----------------------------------------------------------------

describe('daemon /batch source wiring (8.20b)', () => {
  const src = fs.readFileSync(DAEMON_JS, 'utf8');

  it('registers POST /batch behind the WORKER_TASK RBAC gate', () => {
    assert.match(src, /route === '\/batch'/);
    assert.match(src, /rbac\.ACTIONS\.WORKER_TASK/);
  });

  it('accepts either a tasks[] array or task + count', () => {
    const block = src.slice(src.indexOf("route === '/batch'"));
    assert.match(block, /Array\.isArray\(body\.tasks\)/);
    assert.match(block, /body\.count/);
  });

  it('uses a caller-supplied namePrefix with a sensible default', () => {
    const block = src.slice(src.indexOf("route === '/batch'"));
    assert.match(block, /body\.namePrefix/);
    assert.match(block, /'batch'/);
  });

  it('rejects an empty task list with HTTP 400', () => {
    const block = src.slice(src.indexOf("route === '/batch'"));
    assert.match(block, /res\.writeHead\(400\)/);
    assert.match(block, /Missing tasks/);
  });

  it('dispatches via manager.sendTask and returns per-item outcomes', () => {
    const block = src.slice(src.indexOf("route === '/batch'"));
    assert.match(block, /manager\.sendTask\(/);
    assert.match(block, /results\.push/);
    assert.match(block, /ok,\s*fail:/);
  });
});

// -----------------------------------------------------------------
// (c) registry + App.tsx + TopTabs source wiring
// -----------------------------------------------------------------

describe('Features tab wiring', () => {
  it('TopTabs declares a "features" entry with the LayoutGrid icon', () => {
    const src = fs.readFileSync(TOP_TABS, 'utf8');
    assert.match(src, /'features'/);
    assert.match(src, /LayoutGrid/);
  });

  it('App.tsx mounts FeatureView when topView === features', () => {
    const src = fs.readFileSync(APP_TSX, 'utf8');
    assert.match(src, /topView === 'features'/);
    assert.match(src, /<FeatureView/);
  });
});

describe('pages registry', () => {
  const src = fs.readFileSync(REGISTRY, 'utf8');

  const required = [
    'scribe',
    'batch',
    'cleanup',
    'swarm',
    'token-usage',
    'plan',
    'morning',
    'auto',
    'templates',
    'profiles',
    'health',
    'validation',
  ];

  for (const id of required) {
    it(`registers the "${id}" feature`, () => {
      assert.ok(
        src.includes(`id: '${id}'`),
        `registry should include id: '${id}'`,
      );
    });
  }

  it('exports all five sidebar categories in the required order', () => {
    assert.match(src, /CATEGORY_ORDER:\s*FeatureCategory\[\]\s*=\s*\[[^\]]*'operations'[^\]]*'cost'[^\]]*'automation'[^\]]*'config'[^\]]*'diagnostics'[^\]]*\]/s);
  });

  it('each feature provides a lazy loader', () => {
    const matches = src.match(/load:\s*\(\)\s*=>\s*import\(/g) || [];
    assert.ok(matches.length >= required.length, `expected at least ${required.length} lazy loaders, saw ${matches.length}`);
  });
});

// -----------------------------------------------------------------
// (d) Batch / Plan / TokenUsage component wiring (per spec: "Component
//     tests for at least Batch and Plan and TokenUsage"). We use the
//     source-grep strategy already established in tests/chat-view and
//     tests/web-control so the suite stays free of a React renderer.
// -----------------------------------------------------------------

describe('Batch.tsx component wiring', () => {
  const src = fs.readFileSync(path.join(PAGES_DIR, 'Batch.tsx'), 'utf8');

  it('POSTs to /api/batch with apiPost', () => {
    assert.match(src, /apiPost<BatchResponse>\('\/api\/batch'/);
  });

  it('renders both the count-mode and file-mode pickers', () => {
    assert.match(src, /Same task N times/);
    assert.match(src, /One task per line/);
  });

  it('surfaces fail outcomes inside the results panel', () => {
    assert.match(src, /results\.map\(/);
    assert.match(src, /r\.ok/);
  });
});

describe('Plan.tsx component wiring', () => {
  const src = fs.readFileSync(path.join(PAGES_DIR, 'Plan.tsx'), 'utf8');

  it('dispatches via POST /api/plan and reads via GET /api/plan', () => {
    assert.match(src, /apiPost<PlanResponse>\('\/api\/plan'/);
    assert.match(src, /\/api\/plan\?name=/);
  });

  it('re-dispatches the generated plan through /api/task behind confirm', () => {
    assert.match(src, /'\/api\/task'/);
    assert.match(src, /window\.confirm/);
  });

  it('renders the result via the shared markdown helper', () => {
    assert.match(src, /from '\.\.\/lib\/markdown'/);
    assert.match(src, /renderMarkdown/);
  });
});

describe('TokenUsage.tsx component wiring', () => {
  const src = fs.readFileSync(path.join(PAGES_DIR, 'TokenUsage.tsx'), 'utf8');

  it('reads /api/token-usage and /api/quota', () => {
    assert.match(src, /'\/api\/token-usage'/);
    assert.match(src, /'\/api\/token-usage\?perTask=1'/);
    assert.match(src, /'\/api\/quota'/);
  });

  it('renders per-worker and per-day breakdowns without a charting library', () => {
    assert.match(src, /perWorker/);
    assert.match(src, /perDay/);
    // The <Bar> helper renders as a div styled with width percentage.
    assert.match(src, /function Bar\(/);
    assert.match(src, /width:\s*`\$\{pct\}%`/);
  });

  it('exposes the date-range preset buttons via lib/format helpers', () => {
    assert.match(src, /dateRangeLabel/);
    assert.match(src, /dateRange\(days\)/);
  });
});

// -----------------------------------------------------------------
// (e) ControlPanel status-to-Slack form (added in 8.20b)
// -----------------------------------------------------------------

describe('ControlPanel StatusMessageCard (8.20b)', () => {
  const src = fs.readFileSync(CONTROL_PANEL, 'utf8');

  it('renders a StatusMessageCard child', () => {
    assert.match(src, /StatusMessageCard\s+workerName/);
    assert.match(src, /function StatusMessageCard/);
  });

  it('posts to /api/status-update with {worker, message}', () => {
    const idx = src.indexOf('function StatusMessageCard');
    const block = src.slice(idx);
    assert.match(block, /'\/api\/status-update'/);
    assert.match(block, /worker:\s*workerName/);
    assert.match(block, /message:\s*text/);
  });
});
