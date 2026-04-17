'use strict';

// History view tests (TODO 8.7).
//
// Covers the pure helpers in src/history-view.js that the daemon uses to
// build the /history, /history/:name, and /scribe-context responses, plus
// source-wiring greps on src/daemon.js, web/src/components/HistoryView.tsx,
// and web/src/App.tsx so the endpoint shapes, component imports, and tab
// wiring cannot silently drift from the spec.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, it } = require('node:test');

const historyView = require('../src/history-view');

const RECORDS = [
  {
    name: 'alpha',
    task: 'Fix lint errors in src/',
    branch: 'c4/alpha-1',
    startedAt: '2026-04-10T10:00:00.000Z',
    completedAt: '2026-04-10T10:45:00.000Z',
    commits: [{ hash: 'aaaa111', message: 'fix: lint' }],
    status: 'closed',
  },
  {
    name: 'alpha',
    task: 'Add test coverage',
    branch: 'c4/alpha-2',
    startedAt: '2026-04-12T09:00:00.000Z',
    completedAt: '2026-04-12T09:30:00.000Z',
    commits: [],
    status: 'exited',
  },
  {
    name: 'beta',
    task: 'Implement feature X',
    branch: 'c4/beta',
    startedAt: '2026-04-15T08:00:00.000Z',
    completedAt: '2026-04-15T11:00:00.000Z',
    commits: [{ hash: 'bbbb222', message: 'feat: X' }],
    status: 'closed',
  },
  {
    name: 'beta',
    task: null,
    branch: null,
    startedAt: null,
    completedAt: '2026-04-16T07:00:00.000Z',
    commits: [],
    status: 'closed',
  },
];

describe('historyView.filterRecords', () => {
  it('returns every record when no filters are applied', () => {
    const out = historyView.filterRecords(RECORDS, {});
    assert.strictEqual(out.length, RECORDS.length);
  });

  it('filters by worker name', () => {
    const out = historyView.filterRecords(RECORDS, { worker: 'alpha' });
    assert.strictEqual(out.length, 2);
    assert.deepStrictEqual(out.map((r) => r.name), ['alpha', 'alpha']);
  });

  it('filters by status', () => {
    const out = historyView.filterRecords(RECORDS, { status: 'exited' });
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].status, 'exited');
  });

  it('filters by since / until (inclusive iso boundaries)', () => {
    const out = historyView.filterRecords(RECORDS, {
      since: '2026-04-12T00:00:00.000Z',
      until: '2026-04-15T23:59:59.999Z',
    });
    assert.strictEqual(out.length, 2);
    const completedAts = out.map((r) => r.completedAt);
    assert.ok(completedAts.includes('2026-04-12T09:30:00.000Z'));
    assert.ok(completedAts.includes('2026-04-15T11:00:00.000Z'));
  });

  it('matches q against name / task / branch (case-insensitive)', () => {
    const byTask = historyView.filterRecords(RECORDS, { q: 'lint' });
    assert.strictEqual(byTask.length, 1);
    assert.match(byTask[0].task || '', /lint/i);

    const byBranch = historyView.filterRecords(RECORDS, { q: 'alpha-2' });
    assert.strictEqual(byBranch.length, 1);
    assert.strictEqual(byBranch[0].branch, 'c4/alpha-2');

    const byName = historyView.filterRecords(RECORDS, { q: 'BETA' });
    assert.strictEqual(byName.length, 2);
  });

  it('applies limit after filtering (keeps last N)', () => {
    const out = historyView.filterRecords(RECORDS, { worker: 'alpha', limit: 1 });
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].branch, 'c4/alpha-2');
  });

  it('drops malformed entries instead of throwing', () => {
    const mixed = [null, undefined, 42, 'nope', {}, RECORDS[0]];
    const out = historyView.filterRecords(mixed, {});
    assert.strictEqual(out.length, 2);
    assert.strictEqual(out[1].name, 'alpha');
  });
});

describe('historyView.summarizeWorkers', () => {
  it('aggregates per-worker task counts and last-task metadata', () => {
    const summary = historyView.summarizeWorkers(RECORDS, []);
    const byName = Object.fromEntries(summary.map((s) => [s.name, s]));
    assert.strictEqual(byName.alpha.taskCount, 2);
    assert.strictEqual(byName.alpha.firstTaskAt, '2026-04-10T10:45:00.000Z');
    assert.strictEqual(byName.alpha.lastTaskAt, '2026-04-12T09:30:00.000Z');
    assert.strictEqual(byName.alpha.lastTask, 'Add test coverage');
    assert.strictEqual(byName.alpha.lastStatus, 'exited');

    assert.strictEqual(byName.beta.taskCount, 2);
    assert.strictEqual(byName.beta.lastTaskAt, '2026-04-16T07:00:00.000Z');
    assert.ok(byName.beta.branches.includes('c4/beta'));
  });

  it('orders newest lastTaskAt first with tie-break on name', () => {
    const summary = historyView.summarizeWorkers(RECORDS, []);
    assert.deepStrictEqual(summary.map((s) => s.name), ['beta', 'alpha']);
  });

  it('merges live workers in - marks alive and captures liveStatus + branches', () => {
    const live = [
      { name: 'alpha', status: 'idle', branch: 'c4/alpha-3' },
      { name: 'gamma', status: 'busy', branch: 'c4/gamma' },
    ];
    const summary = historyView.summarizeWorkers(RECORDS, live);
    const byName = Object.fromEntries(summary.map((s) => [s.name, s]));
    assert.strictEqual(byName.alpha.alive, true);
    assert.strictEqual(byName.alpha.liveStatus, 'idle');
    assert.ok(byName.alpha.branches.includes('c4/alpha-3'));
    // Historical branches still surface
    assert.ok(byName.alpha.branches.includes('c4/alpha-1'));
    assert.ok(byName.gamma);
    assert.strictEqual(byName.gamma.taskCount, 0);
    assert.strictEqual(byName.gamma.alive, true);
    assert.strictEqual(byName.beta.alive, false);
  });

  it('treats status=exited as not alive', () => {
    const summary = historyView.summarizeWorkers([], [
      { name: 'ghost', status: 'exited', branch: null },
    ]);
    assert.strictEqual(summary[0].alive, false);
    assert.strictEqual(summary[0].liveStatus, 'exited');
  });

  it('skips records without a name', () => {
    const summary = historyView.summarizeWorkers([{ name: null, task: 'x' }], []);
    assert.strictEqual(summary.length, 0);
  });
});

describe('historyView.readScribeContext', () => {
  it('returns exists:false without throwing when the file is missing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-scribe-'));
    try {
      const res = historyView.readScribeContext(tmp);
      assert.strictEqual(res.exists, false);
      assert.strictEqual(res.size, 0);
      assert.strictEqual(res.content, '');
      assert.ok(res.path.endsWith(path.join('docs', 'session-context.md')));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns content + size + updatedAt for an existing file', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-scribe-'));
    try {
      const docsDir = path.join(tmp, 'docs');
      fs.mkdirSync(docsDir);
      const filePath = path.join(docsDir, 'session-context.md');
      const body = '# session\n\n- first entry\n- second entry\n';
      fs.writeFileSync(filePath, body, 'utf8');
      const res = historyView.readScribeContext(tmp);
      assert.strictEqual(res.exists, true);
      assert.strictEqual(res.content, body);
      assert.strictEqual(res.size, Buffer.byteLength(body, 'utf8'));
      assert.ok(res.updatedAt && /T/.test(res.updatedAt));
      assert.strictEqual(res.truncated, false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('honors a custom outputPath option', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-scribe-'));
    try {
      const customPath = path.join(tmp, 'custom.md');
      fs.writeFileSync(customPath, 'custom body', 'utf8');
      const res = historyView.readScribeContext(tmp, { outputPath: 'custom.md' });
      assert.strictEqual(res.exists, true);
      assert.strictEqual(res.content, 'custom body');
      assert.strictEqual(res.path, customPath);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('truncates to the last maxBytes bytes when the file is larger', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-scribe-'));
    try {
      const docsDir = path.join(tmp, 'docs');
      fs.mkdirSync(docsDir);
      const filePath = path.join(docsDir, 'session-context.md');
      const head = 'A'.repeat(200);
      const tail = 'B'.repeat(100);
      fs.writeFileSync(filePath, head + tail, 'utf8');
      const res = historyView.readScribeContext(tmp, { maxBytes: 100 });
      assert.strictEqual(res.exists, true);
      assert.strictEqual(res.truncated, true);
      assert.strictEqual(res.content, tail);
      assert.strictEqual(res.size, 300);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('daemon.js wiring', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'daemon.js'), 'utf8');

  it('requires src/history-view.js', () => {
    assert.match(src, /require\(\s*['"]\.\/history-view['"]\s*\)/);
  });

  it('keeps the GET /history route and uses historyView helpers', () => {
    assert.match(src, /route === '\/history'/);
    assert.match(src, /historyView\.filterRecords/);
    assert.match(src, /historyView\.summarizeWorkers/);
  });

  it('exposes GET /history/:name via path-param regex', () => {
    assert.match(src, /\/\^\\\/history\\\/\(\[\^\\\/\]\+\)\$\//);
    assert.match(src, /historyWorkerName/);
  });

  it('reads scribe context through GET /scribe-context', () => {
    assert.match(src, /route === '\/scribe-context'/);
    assert.match(src, /historyView\.readScribeContext/);
  });

  it('accepts worker/limit/status/since/until/q query params on /history', () => {
    assert.match(src, /url\.searchParams\.get\('worker'\)/);
    assert.match(src, /url\.searchParams\.get\('status'\)/);
    assert.match(src, /url\.searchParams\.get\('since'\)/);
    assert.match(src, /url\.searchParams\.get\('until'\)/);
    assert.match(src, /url\.searchParams\.get\('q'\)/);
  });
});

describe('HistoryView.tsx wiring', () => {
  const file = path.join(__dirname, '..', 'web', 'src', 'components', 'HistoryView.tsx');
  const src = fs.readFileSync(file, 'utf8');

  it('imports apiGet from the shared api module', () => {
    assert.match(src, /from '\.\.\/lib\/api'/);
    assert.match(src, /apiGet/);
  });

  it('fetches the summary from /api/history with URLSearchParams', () => {
    assert.match(src, /URLSearchParams/);
    assert.match(src, /\/api\/history/);
  });

  it('fetches per-worker detail from /api/history/:name', () => {
    assert.match(src, /\/api\/history\/\$\{encodeURIComponent\(name\)\}/);
  });

  it('fetches scribe context from /api/scribe-context', () => {
    assert.match(src, /\/api\/scribe-context/);
  });

  it('renders search + status + date filters', () => {
    assert.match(src, /placeholder="Search name \/ task \/ branch"/);
    assert.match(src, /aria-label="Filter by status"/);
    assert.match(src, /aria-label="Since date"/);
    assert.match(src, /aria-label="Until date"/);
  });

  it('renders a Scribe button that opens the session-context viewer', () => {
    assert.match(src, /\n\s*Scribe\s*\n/);
    assert.match(src, /openScribe/);
  });

  it('exports the default HistoryView component + key types', () => {
    assert.match(src, /export default function HistoryView/);
    assert.match(src, /export interface HistoryWorkerSummary/);
    assert.match(src, /export interface HistoryWorkerDetail/);
  });
});

describe('App.tsx integration for history tab', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'App.tsx'), 'utf8');

  it('imports HistoryView', () => {
    assert.match(src, /import HistoryView from '\.\/components\/HistoryView'/);
  });

  it('persists topView selection to localStorage', () => {
    assert.match(src, /TOP_VIEW_KEY\s*=\s*'c4\.topView'/);
    assert.match(src, /localStorage\.setItem\(TOP_VIEW_KEY/);
  });

  it('renders Workers + History top-level tab buttons', () => {
    assert.match(src, /setTopView\('workers'\)/);
    assert.match(src, /setTopView\('history'\)/);
    assert.match(src, /\n\s*Workers\s*\n/);
    assert.match(src, /\n\s*History\s*\n/);
  });

  it('renders <HistoryView /> when topView === history', () => {
    assert.match(src, /topView === 'history' \? \(/);
    assert.match(src, /<HistoryView \/>/);
  });
});
