// (10.3) Project-specific dashboard tests.
//
// Exercises src/project-dashboard.js with real ProjectBoard +
// AuditLogger + CostReporter collaborators backed by tmpdirs so the
// suite never touches ~/.c4/*. Worker lists are inline arrays and a
// controllable `now` clock lets us test cache TTL deterministically.
//
// Coverage targets (30+ assertions):
//  - snapshot shape: project, activeWorkers, recentMerges, todoStats,
//                    tokenUsage, contributors, velocity, generatedAt
//  - empty project returns zero-filled stats
//  - contributor aggregation sums tasks and tokens per user
//  - velocity averages tasks/merges over past N weeks (default + weeks override)
//  - cache hit within TTL, cache invalidation on project update
//  - missing project returns null
//  - recentMerges filters by branch prefix and sorts newest-first
//  - activeWorkers matches by branch prefix / exact branch / project field
//  - tokens: per-user and per-model buckets
//  - projectBranchMatches helper contract
//  - getSnapshot handles missing collaborators gracefully

'use strict';
require('./jest-shim');

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ProjectDashboard,
  VELOCITY_WEEKS_DEFAULT,
  CACHE_TTL_DEFAULT_MS,
  WEEK_MS,
  projectBranchMatches,
} = require('../src/project-dashboard');
const { ProjectBoard } = require('../src/project-mgmt');
const { AuditLogger } = require('../src/audit-log');
const { CostReporter } = require('../src/cost-report');

function mkTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'c4-dash-test-'));
}

function setupFixture(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const projectsDir = mkTmpDir('c4-dash-board-');
  const auditDir = mkTmpDir('c4-dash-audit-');
  const board = new ProjectBoard({ projectsDir });
  const auditLogger = new AuditLogger({ logPath: path.join(auditDir, 'audit.jsonl') });
  const costReporter = new CostReporter({
    records: Array.isArray(o.costRecords) ? o.costRecords : [],
  });
  const workers = Array.isArray(o.workers) ? o.workers : [];
  let clock = typeof o.clock === 'number' ? o.clock : Date.UTC(2026, 3, 17, 12, 0, 0);
  const nowFn = () => clock;
  const tickTo = (ms) => { clock = ms; };

  const dashboard = new ProjectDashboard({
    board,
    auditLogger,
    costReporter,
    workers,
    now: nowFn,
    cacheTtlMs: Number.isFinite(o.cacheTtlMs) ? o.cacheTtlMs : undefined,
    velocityWeeks: Number.isFinite(o.velocityWeeks) ? o.velocityWeeks : undefined,
  });
  return { dashboard, board, auditLogger, costReporter, workers, tickTo, nowFn };
}

describe('(10.3) exports and helpers', () => {
  test('(a) module exports ProjectDashboard and constants', () => {
    expect(typeof ProjectDashboard).toBe('function');
    expect(VELOCITY_WEEKS_DEFAULT).toBe(4);
    expect(CACHE_TTL_DEFAULT_MS).toBe(30000);
    expect(WEEK_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(typeof projectBranchMatches).toBe('function');
  });

  test('(b) projectBranchMatches covers exact, prefix, and no-match cases', () => {
    expect(projectBranchMatches('c4/demo', 'demo')).toBe(true);
    expect(projectBranchMatches('c4/demo-feature', 'demo')).toBe(true);
    expect(projectBranchMatches('c4/demo/sub', 'demo')).toBe(true);
    expect(projectBranchMatches('demo', 'demo')).toBe(true);
    expect(projectBranchMatches('c4/other', 'demo')).toBe(false);
    expect(projectBranchMatches('', 'demo')).toBe(false);
    expect(projectBranchMatches(null, 'demo')).toBe(false);
  });

  test('(c) constructor applies defaults when options omitted', () => {
    const d = new ProjectDashboard();
    expect(d.cacheTtlMs).toBe(CACHE_TTL_DEFAULT_MS);
    expect(d.velocityWeeks).toBe(VELOCITY_WEEKS_DEFAULT);
    expect(d.board).toBeNull();
    expect(d.auditLogger).toBeNull();
    expect(d.costReporter).toBeNull();
    expect(Array.isArray(d._getWorkers())).toBe(true);
  });

  test('(d) constructor accepts overrides', () => {
    const d = new ProjectDashboard({ cacheTtlMs: 500, velocityWeeks: 8 });
    expect(d.cacheTtlMs).toBe(500);
    expect(d.velocityWeeks).toBe(8);
  });
});

describe('(10.3) snapshot shape', () => {
  test('(a) getSnapshot returns all required top-level fields', () => {
    const { dashboard, board } = setupFixture();
    board.createProject({ id: 'demo', name: 'Demo' });
    board.addTask('demo', { title: 'A', status: 'done', assignee: 'alice' });
    const snap = dashboard.getSnapshot('demo');
    expect(snap).not.toBeNull();
    expect(snap.project).toBeDefined();
    expect(snap.project.id).toBe('demo');
    expect(Array.isArray(snap.activeWorkers)).toBe(true);
    expect(Array.isArray(snap.recentMerges)).toBe(true);
    expect(typeof snap.todoStats).toBe('object');
    expect(typeof snap.tokenUsage).toBe('object');
    expect(Array.isArray(snap.contributors)).toBe(true);
    expect(typeof snap.velocity).toBe('object');
    expect(typeof snap.generatedAt).toBe('string');
  });

  test('(b) missing project returns null', () => {
    const { dashboard } = setupFixture();
    expect(dashboard.getSnapshot('nope')).toBeNull();
    expect(dashboard.getContributors('nope')).toBeNull();
    expect(dashboard.getVelocity('nope')).toBeNull();
    expect(dashboard.getTokenUsage('nope')).toBeNull();
  });

  test('(c) empty project produces zero-filled counters', () => {
    const { dashboard, board } = setupFixture();
    board.createProject({ id: 'empty' });
    const snap = dashboard.getSnapshot('empty');
    expect(snap.todoStats).toEqual({ open: 0, done: 0, total: 0, done_pct: 0 });
    expect(snap.tokenUsage).toEqual({ total: 0, byUser: {}, byModel: {} });
    expect(snap.contributors).toEqual([]);
    expect(snap.activeWorkers).toEqual([]);
    expect(snap.recentMerges).toEqual([]);
    expect(snap.velocity.tasksPerWeek).toBe(0);
    expect(snap.velocity.mergesPerWeek).toBe(0);
  });
});

describe('(10.3) todoStats', () => {
  test('(a) counts open vs done and computes done_pct', () => {
    const { dashboard, board } = setupFixture();
    board.createProject({ id: 'p' });
    board.addTask('p', { title: 'a', status: 'done' });
    board.addTask('p', { title: 'b', status: 'in_progress' });
    board.addTask('p', { title: 'c', status: 'todo' });
    board.addTask('p', { title: 'd', status: 'done' });
    const stats = dashboard.getSnapshot('p').todoStats;
    expect(stats.total).toBe(4);
    expect(stats.done).toBe(2);
    expect(stats.open).toBe(2);
    expect(stats.done_pct).toBe(50);
  });

  test('(b) all-done project reports 100%', () => {
    const { dashboard, board } = setupFixture();
    board.createProject({ id: 'p' });
    board.addTask('p', { title: 'a', status: 'done' });
    board.addTask('p', { title: 'b', status: 'done' });
    expect(dashboard.getSnapshot('p').todoStats.done_pct).toBe(100);
  });
});

describe('(10.3) activeWorkers', () => {
  test('(a) matches branches that equal or prefix the project id', () => {
    const { dashboard, board } = setupFixture({
      workers: [
        { name: 'w1', branch: 'c4/demo', status: 'busy', startedAt: '2026-04-17T10:00:00Z' },
        { name: 'w2', branch: 'c4/demo-feature', status: 'idle', startedAt: '2026-04-17T09:00:00Z' },
        { name: 'w3', branch: 'c4/other', status: 'busy' },
        { name: 'w4', project: 'demo', status: 'idle' },
      ],
    });
    board.createProject({ id: 'demo' });
    const active = dashboard.getSnapshot('demo').activeWorkers;
    const names = active.map((a) => a.name).sort();
    expect(names).toEqual(['w1', 'w2', 'w4']);
  });

  test('(b) workers can be supplied as a function', () => {
    const { board } = setupFixture();
    board.createProject({ id: 'demo' });
    let calls = 0;
    const d = new ProjectDashboard({
      board,
      workers: () => { calls += 1; return [{ name: 'w', branch: 'c4/demo', status: 'idle' }]; },
      cacheTtlMs: 0,
    });
    const a = d.getSnapshot('demo').activeWorkers;
    const b = d.getSnapshot('demo').activeWorkers;
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  test('(c) activeWorkers carries name/branch/status/startedAt', () => {
    const { dashboard, board } = setupFixture({
      workers: [{ name: 'w1', branch: 'c4/demo', status: 'busy', startedAt: '2026-04-17T10:00:00Z' }],
    });
    board.createProject({ id: 'demo' });
    const [w] = dashboard.getSnapshot('demo').activeWorkers;
    expect(w.name).toBe('w1');
    expect(w.branch).toBe('c4/demo');
    expect(w.status).toBe('busy');
    expect(w.startedAt).toBe('2026-04-17T10:00:00Z');
  });
});

describe('(10.3) recentMerges', () => {
  test('(a) filters merge.performed events by project branch', () => {
    const { dashboard, board, auditLogger } = setupFixture();
    board.createProject({ id: 'demo' });
    auditLogger.record('merge.performed', { commit: 'abc' },
      { target: 'c4/demo', timestamp: '2026-04-10T00:00:00Z' });
    auditLogger.record('merge.performed', { commit: 'def' },
      { target: 'c4/demo-feature', timestamp: '2026-04-12T00:00:00Z' });
    auditLogger.record('merge.performed', { commit: 'xyz' },
      { target: 'c4/other', timestamp: '2026-04-11T00:00:00Z' });
    const merges = dashboard.getSnapshot('demo').recentMerges;
    expect(merges).toHaveLength(2);
    // Newest first.
    expect(merges[0].branch).toBe('c4/demo-feature');
    expect(merges[0].commit).toBe('def');
    expect(merges[1].branch).toBe('c4/demo');
  });

  test('(b) ignores non-merge event types', () => {
    const { dashboard, board, auditLogger } = setupFixture();
    board.createProject({ id: 'demo' });
    auditLogger.record('worker.created', {}, { target: 'c4/demo' });
    auditLogger.record('task.sent', {}, { target: 'c4/demo' });
    expect(dashboard.getSnapshot('demo').recentMerges).toEqual([]);
  });
});

describe('(10.3) tokenUsage', () => {
  test('(a) sums input and output tokens and buckets by user and model', () => {
    const records = [
      { timestamp: '2026-04-10T00:00:00Z', project: 'demo', user: 'alice', model: 'claude-opus', inputTokens: 100, outputTokens: 50 },
      { timestamp: '2026-04-10T01:00:00Z', project: 'demo', user: 'alice', model: 'claude-sonnet', inputTokens: 10, outputTokens: 5 },
      { timestamp: '2026-04-10T02:00:00Z', project: 'demo', user: 'bob', model: 'claude-opus', inputTokens: 200, outputTokens: 100 },
      { timestamp: '2026-04-10T03:00:00Z', project: 'other', user: 'alice', model: 'claude-opus', inputTokens: 999, outputTokens: 999 },
    ];
    const { dashboard, board } = setupFixture({ costRecords: records });
    board.createProject({ id: 'demo' });
    const usage = dashboard.getSnapshot('demo').tokenUsage;
    expect(usage.total).toBe(465);
    expect(usage.byUser.alice).toBe(165);
    expect(usage.byUser.bob).toBe(300);
    expect(usage.byModel['claude-opus']).toBe(450);
    expect(usage.byModel['claude-sonnet']).toBe(15);
  });

  test('(b) unknown user/model labels fall back to "unknown"', () => {
    const { dashboard, board } = setupFixture({
      costRecords: [
        { timestamp: '2026-04-10T00:00:00Z', project: 'p', user: '', model: '', inputTokens: 10, outputTokens: 20 },
      ],
    });
    board.createProject({ id: 'p' });
    const usage = dashboard.getSnapshot('p').tokenUsage;
    expect(usage.byUser.unknown).toBe(30);
    expect(usage.byModel.unknown).toBe(30);
  });
});

describe('(10.3) contributors', () => {
  test('(a) aggregates tasks per assignee and tokens per user', () => {
    const records = [
      { timestamp: '2026-04-10T00:00:00Z', project: 'demo', user: 'alice', model: 'claude-opus', inputTokens: 100, outputTokens: 0 },
      { timestamp: '2026-04-11T00:00:00Z', project: 'demo', user: 'bob',   model: 'claude-opus', inputTokens: 200, outputTokens: 0 },
      { timestamp: '2026-04-11T00:00:00Z', project: 'demo', user: 'alice', model: 'claude-opus', inputTokens: 50,  outputTokens: 25 },
      { timestamp: '2026-04-11T00:00:00Z', project: 'other', user: 'alice', model: 'claude-opus', inputTokens: 9999, outputTokens: 9999 },
    ];
    const { dashboard, board } = setupFixture({ costRecords: records });
    board.createProject({ id: 'demo' });
    board.addTask('demo', { title: 'a', status: 'done', assignee: 'alice' });
    board.addTask('demo', { title: 'b', status: 'todo', assignee: 'alice' });
    board.addTask('demo', { title: 'c', status: 'done', assignee: 'bob' });
    board.addTask('demo', { title: 'd', status: 'todo' }); // unassigned
    const contribs = dashboard.getSnapshot('demo').contributors;
    const alice = contribs.find((c) => c.user === 'alice');
    const bob = contribs.find((c) => c.user === 'bob');
    const un = contribs.find((c) => c.user === 'unassigned');
    expect(alice.tasks).toBe(2);
    expect(alice.tokens).toBe(175);
    expect(bob.tasks).toBe(1);
    expect(bob.tokens).toBe(200);
    expect(un.tasks).toBe(1);
    expect(un.tokens).toBe(0);
    // Sorted by tokens desc: bob (200) before alice (175) before unassigned (0).
    expect(contribs[0].user).toBe('bob');
    expect(contribs[1].user).toBe('alice');
    expect(contribs[2].user).toBe('unassigned');
  });

  test('(b) getContributors() is a direct accessor', () => {
    const { dashboard, board } = setupFixture();
    board.createProject({ id: 'demo' });
    board.addTask('demo', { title: 'a', status: 'todo', assignee: 'alice' });
    const list = dashboard.getContributors('demo');
    expect(list).toHaveLength(1);
    expect(list[0].user).toBe('alice');
  });
});

describe('(10.3) velocity', () => {
  test('(a) averages tasks and merges over the default 4-week window', () => {
    const now = Date.UTC(2026, 3, 17, 12, 0, 0);
    const within = (daysAgo) => new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString();

    const { dashboard, board, auditLogger } = setupFixture({ clock: now });
    board.createProject({ id: 'demo' });
    // 4 done tasks within the last 4 weeks -> 1.0/week.
    const t1 = board.addTask('demo', { title: 'a', status: 'done' });
    const t2 = board.addTask('demo', { title: 'b', status: 'done' });
    const t3 = board.addTask('demo', { title: 'c', status: 'done' });
    const t4 = board.addTask('demo', { title: 'd', status: 'done' });
    board.updateTask('demo', t1.id, { status: 'done', description: 'x' });
    // Poke updatedAt manually via direct file write so timestamps fall
    // within the 4-week window deterministically.
    const projPath = path.join(board.projectsDir, 'demo.json');
    const raw = JSON.parse(fs.readFileSync(projPath, 'utf8'));
    raw.tasks[0].updatedAt = within(2);
    raw.tasks[1].updatedAt = within(7);
    raw.tasks[2].updatedAt = within(20);
    raw.tasks[3].updatedAt = within(25);
    fs.writeFileSync(projPath, JSON.stringify(raw, null, 2));

    // One merge inside window, one outside.
    auditLogger.record('merge.performed', {}, {
      target: 'c4/demo', timestamp: within(3),
    });
    auditLogger.record('merge.performed', {}, {
      target: 'c4/demo', timestamp: within(60), // outside window
    });
    auditLogger.record('merge.performed', {}, {
      target: 'c4/demo-feature', timestamp: within(10),
    });

    const v = dashboard.getSnapshot('demo').velocity;
    expect(v.windowWeeks).toBe(4);
    expect(v.tasks).toBe(4);
    expect(v.merges).toBe(2);
    expect(v.tasksPerWeek).toBe(1);
    expect(v.mergesPerWeek).toBe(0.5);
    expect(typeof v.windowStart).toBe('string');
    expect(typeof v.windowEnd).toBe('string');
  });

  test('(b) getVelocity(projectId, weeks) honours the override', () => {
    const now = Date.UTC(2026, 3, 17, 12, 0, 0);
    const within = (daysAgo) => new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString();
    const { dashboard, board } = setupFixture({ clock: now });
    board.createProject({ id: 'demo' });
    const t = board.addTask('demo', { title: 'a', status: 'done' });
    const projPath = path.join(board.projectsDir, 'demo.json');
    const raw = JSON.parse(fs.readFileSync(projPath, 'utf8'));
    raw.tasks[0].updatedAt = within(40); // outside 4-week default, inside 8-week override
    fs.writeFileSync(projPath, JSON.stringify(raw, null, 2));
    const v4 = dashboard.getVelocity('demo');
    const v8 = dashboard.getVelocity('demo', 8);
    expect(v4.tasks).toBe(0);
    expect(v8.tasks).toBe(1);
    expect(v8.windowWeeks).toBe(8);
    expect(v8.tasksPerWeek).toBe(0.13);
  });
});

describe('(10.3) cache behaviour', () => {
  test('(a) returns cached snapshot within TTL', () => {
    const { dashboard, board, tickTo, nowFn } = setupFixture({ cacheTtlMs: 60000 });
    board.createProject({ id: 'demo' });
    const first = dashboard.getSnapshot('demo');
    // Tick 10s forward; cache should still serve.
    tickTo(nowFn() + 10000);
    const second = dashboard.getSnapshot('demo');
    expect(second).toBe(first); // same reference
  });

  test('(b) invalidates cache on project mutation via signature', () => {
    const { dashboard, board, tickTo, nowFn } = setupFixture({ cacheTtlMs: 60000 });
    board.createProject({ id: 'demo' });
    const first = dashboard.getSnapshot('demo');
    expect(first.todoStats.total).toBe(0);
    // Add a task (signature changes — tasks.length goes 0 -> 1).
    board.addTask('demo', { title: 'new', status: 'todo' });
    tickTo(nowFn() + 5000); // still within TTL window
    const second = dashboard.getSnapshot('demo');
    expect(second).not.toBe(first);
    expect(second.todoStats.total).toBe(1);
  });

  test('(c) invalidate(projectId) clears a single entry', () => {
    const { dashboard, board, tickTo, nowFn } = setupFixture({ cacheTtlMs: 60000 });
    board.createProject({ id: 'demo' });
    const first = dashboard.getSnapshot('demo');
    dashboard.invalidate('demo');
    tickTo(nowFn() + 1);
    const second = dashboard.getSnapshot('demo');
    expect(second).not.toBe(first);
  });

  test('(d) invalidateAll() clears the map', () => {
    const { dashboard, board } = setupFixture();
    board.createProject({ id: 'a' });
    board.createProject({ id: 'b' });
    dashboard.getSnapshot('a');
    dashboard.getSnapshot('b');
    expect(dashboard._cache.size).toBe(2);
    dashboard.invalidateAll();
    expect(dashboard._cache.size).toBe(0);
  });

  test('(e) TTL expiry forces recompute', () => {
    const { dashboard, board, tickTo, nowFn } = setupFixture({ cacheTtlMs: 1000 });
    board.createProject({ id: 'demo' });
    const first = dashboard.getSnapshot('demo');
    tickTo(nowFn() + 5000);
    const second = dashboard.getSnapshot('demo');
    expect(second).not.toBe(first);
  });
});

describe('(10.3) resilience', () => {
  test('(a) getSnapshot works without auditLogger or costReporter', () => {
    const projectsDir = mkTmpDir('c4-dash-board-');
    const board = new ProjectBoard({ projectsDir });
    board.createProject({ id: 'p' });
    board.addTask('p', { title: 'a', status: 'done', assignee: 'alice' });
    const dashboard = new ProjectDashboard({ board });
    const snap = dashboard.getSnapshot('p');
    expect(snap.recentMerges).toEqual([]);
    expect(snap.tokenUsage.total).toBe(0);
    expect(snap.contributors[0].user).toBe('alice');
  });

  test('(b) getSnapshot returns null when board is missing', () => {
    const d = new ProjectDashboard({});
    expect(d.getSnapshot('anything')).toBeNull();
  });

  test('(c) malformed worker entries are skipped', () => {
    const { dashboard, board } = setupFixture({
      workers: [null, 'garbage', { branch: 'c4/demo', status: 'busy' }],
    });
    board.createProject({ id: 'demo' });
    const workers = dashboard.getSnapshot('demo').activeWorkers;
    expect(workers).toHaveLength(1);
  });
});
