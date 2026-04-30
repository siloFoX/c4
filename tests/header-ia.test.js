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
});
