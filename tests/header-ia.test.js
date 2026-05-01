// (TODO 8.37) Source-grep tests for the header IA + worker grouping:
// - Logo relocated from Sidebar to AppHeader
// - WorkerList partitions into Managers / Workers buckets with
//   collapsible sections, count badges, and persistent open state
// - daemon /list endpoint folds tier into the response

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SIDEBAR = path.join(ROOT, 'web/src/components/layout/Sidebar.tsx');
const APP_HEADER = path.join(ROOT, 'web/src/components/layout/AppHeader.tsx');
const WORKER_LIST = path.join(ROOT, 'web/src/components/WorkerList.tsx');
const TYPES = path.join(ROOT, 'web/src/types.ts');
const DAEMON = path.join(ROOT, 'src/daemon.js');

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

describe('AppHeader hosts the C4 logo', () => {
  const src = readText(APP_HEADER);
  it('renders the logo.svg image', () => {
    assert.match(src, /<img\s+src="\/logo\.svg"/);
  });
  it('keeps the C4 Dashboard wordmark', () => {
    assert.match(src, /C4 Dashboard/);
  });
});

describe('Sidebar drops the logo and just labels Workers', () => {
  const src = readText(SIDEBAR);
  it('no longer renders /logo.svg inside the sidebar', () => {
    assert.doesNotMatch(src, /<img\s+src="\/logo\.svg"/);
  });
  it('keeps the Workers section label', () => {
    assert.match(src, />\s*Workers\s*</);
  });
});

describe('Worker type carries an optional tier', () => {
  const src = readText(TYPES);
  it('declares tier as part of the Worker shape', () => {
    assert.match(src, /tier\?: 'manager' \| 'worker' \| string/);
  });
});

describe('daemon /list folds tierWorkerMap into each worker', () => {
  const src = readText(DAEMON);
  it('walks listed.workers and writes w.tier from tierWorkerMap', () => {
    assert.match(src, /listed\.workers/);
    assert.match(src, /w\.tier = tierWorkerMap\.get\(w\.name\) \|\| 'worker'/);
  });
});

describe('WorkerList groups by tier with collapsible sections', () => {
  const src = readText(WORKER_LIST);

  it('exports a groupOf helper that defaults to worker', () => {
    assert.match(src, /function groupOf\(w: Worker\)/);
    assert.match(src, /if \(w\.tier === 'manager'\) return 'manager'/);
  });

  it('falls back to a name-pattern heuristic for pre-8.37 daemons', () => {
    assert.match(src, /\/\^c4-mgr\/i\.test\(w\.name\)/);
    assert.match(src, /\/\^auto-mgr\/i\.test\(w\.name\)/);
    assert.match(src, /\/-mgr-\/i\.test\(w\.name\)/);
  });

  it('renders a GroupHeader with crown + wrench lucide icons', () => {
    assert.match(src, /function GroupHeader\(/);
    assert.match(src, /Crown/);
    assert.match(src, /Wrench/);
  });

  it('exposes per-group open state (managers + workers) and persists each', () => {
    assert.match(src, /MGR_OPEN_KEY = 'c4\.workerList\.managers\.open'/);
    assert.match(src, /WRK_OPEN_KEY = 'c4\.workerList\.workers\.open'/);
    assert.match(src, /managersOpen/);
    assert.match(src, /workersOpen/);
  });

  it('partitions workers and sorts each group by name', () => {
    assert.match(src, /m\.sort\(\(a, b\) => a\.name\.localeCompare\(b\.name\)\)/);
    assert.match(src, /r\.sort\(\(a, b\) => a\.name\.localeCompare\(b\.name\)\)/);
    assert.match(src, /return \{ managers: m, regular: r \}/);
  });

  it('marks manager rows with a primary accent border', () => {
    assert.match(src, /accent === 'primary' && 'border-l-2 border-l-primary\/40'/);
  });

  it('does not render either group when the bucket is empty', () => {
    assert.match(src, /managers\.length > 0/);
    assert.match(src, /regular\.length > 0/);
  });

  it('exposes aria-expanded + aria-controls on each group header', () => {
    assert.match(src, /aria-expanded=\{open\}/);
    assert.match(src, /aria-controls=\{`worker-group-\$\{label\.toLowerCase\(\)\}`\}/);
  });

  // (review fix 2026-05-01) Originally the `worker-group-*` panels
  // were conditionally rendered, leaving the GroupHeader's
  // `aria-controls` pointing at a missing DOM node when the group
  // was collapsed. The panel must always render with the native
  // `hidden` attribute toggling visibility so the ARIA reference
  // stays valid in either state.
  it('renders worker-group panels unconditionally with the hidden attribute', () => {
    assert.match(src, /id="worker-group-managers"[^>]*\n[^<]*hidden=\{!managersOpen\}/);
    assert.match(src, /id="worker-group-workers"[^>]*\n[^<]*hidden=\{!workersOpen\}/);
    // The previous conditional `{managersOpen && (` wrapper around the
    // panel must no longer exist for the worker-group panels.
    assert.doesNotMatch(src, /\{managersOpen && \(\s*\n\s*<div id="worker-group-managers"/);
    assert.doesNotMatch(src, /\{workersOpen && \(\s*\n\s*<div id="worker-group-workers"/);
  });
});

// (review fix 2026-05-01) Behavioural tests for the pure groupOf
// helper. The source-grep tests above lock in the heuristic
// patterns; this suite exercises the actual algorithm so a regex
// regression surfaces immediately.
describe('groupOf (manager / worker bucket assignment)', () => {
  function groupOf(w) {
    if (w.tier === 'manager') return 'manager';
    if (w.tier && w.tier !== 'worker') return 'worker';
    if (/^c4-mgr/i.test(w.name)) return 'manager';
    if (/^auto-mgr/i.test(w.name)) return 'manager';
    if (/-mgr-/i.test(w.name)) return 'manager';
    return 'worker';
  }

  it('explicit tier=manager wins over name', () => {
    assert.strictEqual(groupOf({ name: 'plain-name', tier: 'manager' }), 'manager');
  });

  it("non-manager / non-worker tier falls into 'worker' bucket", () => {
    assert.strictEqual(groupOf({ name: 'foo', tier: 'admin' }), 'worker');
    assert.strictEqual(groupOf({ name: 'foo', tier: 'reviewer' }), 'worker');
  });

  it('falls back to name-pattern heuristic when tier is missing', () => {
    assert.strictEqual(groupOf({ name: 'c4-mgr-auto' }), 'manager');
    assert.strictEqual(groupOf({ name: 'C4-MGR-FOO' }), 'manager'); // case-insensitive
    assert.strictEqual(groupOf({ name: 'auto-mgr-2026' }), 'manager');
    assert.strictEqual(groupOf({ name: 'team-mgr-foo' }), 'manager');
  });

  it("returns 'worker' for plain worker names", () => {
    assert.strictEqual(groupOf({ name: 'worker-1' }), 'worker');
    assert.strictEqual(groupOf({ name: 'feature-branch-x' }), 'worker');
    assert.strictEqual(groupOf({ name: 'planner' }), 'worker');
  });

  it("doesn't mistake a name containing 'mgr' but not -mgr- for manager", () => {
    assert.strictEqual(groupOf({ name: 'mgrant-task' }), 'worker');
    assert.strictEqual(groupOf({ name: 'imgr' }), 'worker');
  });

  it('source mirrors the shim', () => {
    const wl = readText(WORKER_LIST);
    assert.match(wl, /function groupOf\(w: Worker\): 'manager' \| 'worker'/);
    assert.match(wl, /\/\^c4-mgr\/i\.test\(w\.name\)/);
    assert.match(wl, /\/\^auto-mgr\/i\.test\(w\.name\)/);
    assert.match(wl, /\/-mgr-\/i\.test\(w\.name\)/);
  });
});

// (review fix 2026-05-01) Logo a11y — alt text and aria-hidden are
// mutually exclusive. Pair them correctly: decorative logo gets
// alt="" + aria-hidden so the wordmark is the single accessible
// name.
describe('AppHeader logo is decorative', () => {
  const src = readText(APP_HEADER);

  it('uses empty alt + aria-hidden for the logo image', () => {
    assert.match(src, /<img\s+src="\/logo\.svg"\s+alt=""\s+className="h-7 w-7 shrink-0"\s+aria-hidden="true"\s*\/>/);
  });

  it('does NOT pair non-empty alt with aria-hidden (the original bug)', () => {
    assert.doesNotMatch(src, /<img\s+src="\/logo\.svg"\s+alt="C4"\s+[^>]*aria-hidden/);
  });
});
