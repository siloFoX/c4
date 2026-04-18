/**
 * Planner Back-propagation loop (9.12) tests.
 *
 * Covers:
 *   - setPlanDocPath / getPlanDocPath round-trip
 *   - appendNeedsRevision appends a block to the plan document
 *   - replan invokes the planner factory, writes docs/plans/<name>-revN.md,
 *     increments replan_count, and updates plan_doc_path
 *   - loop limit rejection with the exact "Loop limit N exceeded" message
 *     plus Slack notification side-effect
 *   - listRevisions returns the recorded history
 *   - redispatch calls sendTask with the revised plan
 *   - setPlanDocPath metadata survives into listRevisions output
 *
 * The planner factory is always mocked — no real Claude session is spawned.
 */

const { describe, test, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Planner = require('../src/planner');

function createMockManager(base) {
  const notifications = { messages: [] };
  notifications.pushAll = mock.fn((msg) => { notifications.messages.push(msg); });
  notifications._flushAll = mock.fn(() => Promise.resolve());
  return {
    workers: new Map(),
    sendTask: mock.fn(() => ({ success: true, branch: 'c4/test', worktree: base })),
    _detectRepoRoot: mock.fn(() => base),
    _notifications: notifications,
    config: {},
  };
}

function makeWorker(base, extras = {}) {
  return {
    worktree: base,
    branch: 'c4/test',
    _taskText: 'Original task: add feature X',
    ...extras,
  };
}

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'c4-planner-loop-'));
}

describe('Planner Back-propagation (9.12)', () => {
  let base, manager, planner;

  beforeEach(() => {
    base = mkTmp();
    manager = createMockManager(base);
    planner = new Planner(manager);
  });

  test('setPlanDocPath stores metadata on the worker', () => {
    manager.workers.set('w1', makeWorker(base));
    const res = planner.setPlanDocPath('w1', 'docs/plans/initial.md');
    assert.strictEqual(res.success, true);
    assert.strictEqual(planner.getPlanDocPath('w1'), 'docs/plans/initial.md');
    const w = manager.workers.get('w1');
    assert.strictEqual(w.plan_doc_path, 'docs/plans/initial.md');
    assert.strictEqual(w.replan_count, 0);
    assert.deepStrictEqual(w.plan_revisions, []);
  });

  test('setPlanDocPath rejects unknown worker / empty path', () => {
    assert.ok(planner.setPlanDocPath('missing', 'docs/x.md').error.includes('not found'));
    manager.workers.set('w1', makeWorker(base));
    assert.ok(planner.setPlanDocPath('w1', '').error.includes('non-empty'));
    assert.strictEqual(planner.getPlanDocPath('missing'), null);
  });

  test('appendNeedsRevision appends a block with when/reason/evidence', () => {
    const planPath = path.join(base, 'plan.md');
    fs.writeFileSync(planPath, '# Plan\n\n1. Do things\n');
    manager.workers.set('w1', makeWorker(base, { plan_doc_path: 'plan.md' }));

    const res = planner.appendNeedsRevision('w1', 'blocked by missing dep', 'npm ERR! cannot find foo');
    assert.strictEqual(res.success, true);
    const body = fs.readFileSync(planPath, 'utf8');
    assert.ok(body.includes('## Needs Revision'));
    assert.ok(body.includes('- Reason: blocked by missing dep'));
    assert.ok(body.includes('- Evidence: npm ERR! cannot find foo'));
    assert.ok(/- When: \d{4}-\d{2}-\d{2}T/.test(body));
    assert.ok(manager.workers.get('w1')._pendingRevision);
  });

  test('appendNeedsRevision fails without plan_doc_path or missing file', () => {
    manager.workers.set('w1', makeWorker(base));
    assert.ok(planner.appendNeedsRevision('w1', 'x', 'y').error.includes('plan_doc_path'));
    manager.workers.get('w1').plan_doc_path = 'missing.md';
    assert.ok(planner.appendNeedsRevision('w1', 'x', 'y').error.includes('not found'));
  });

  test('replan invokes factory and writes docs/plans/<name>-rev1.md', () => {
    fs.writeFileSync(path.join(base, 'plan.md'), '# Original\n');
    manager.workers.set('w1', makeWorker(base, { plan_doc_path: 'plan.md' }));

    const factory = mock.fn((input) => {
      assert.strictEqual(input.workerName, 'w1');
      assert.strictEqual(input.originalTask, 'Original task: add feature X');
      assert.strictEqual(input.reason, 'dep missing');
      assert.strictEqual(input.evidence, 'ENOENT foo');
      assert.strictEqual(input.revisionNumber, 1);
      return { content: `# Rev${input.revisionNumber} plan for ${input.workerName}\n\n- try bar instead of foo\n` };
    });
    planner.setPlannerFactory(factory);

    const res = planner.replan('w1', 'dep missing', 'ENOENT foo');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.revisionNumber, 1);
    assert.strictEqual(res.replanCount, 1);
    const revPath = path.join(base, 'docs', 'plans', 'w1-rev1.md');
    assert.strictEqual(res.revisionPath, revPath);
    assert.ok(fs.existsSync(revPath));
    const revBody = fs.readFileSync(revPath, 'utf8');
    assert.ok(revBody.includes('# Rev1 plan for w1'));

    const w = manager.workers.get('w1');
    assert.strictEqual(w.replan_count, 1);
    assert.strictEqual(w.plan_doc_path, revPath);
    assert.strictEqual(w.plan_revisions.length, 1);
    assert.strictEqual(w.plan_revisions[0].rev, 1);
    assert.strictEqual(w.plan_revisions[0].reason, 'dep missing');
    assert.strictEqual(factory.mock.callCount(), 1);
  });

  test('replan count increments across multiple revisions and writes rev2', () => {
    fs.writeFileSync(path.join(base, 'plan.md'), '# Original\n');
    manager.workers.set('w1', makeWorker(base, { plan_doc_path: 'plan.md' }));
    planner.setPlannerFactory((input) => ({ content: `# rev${input.revisionNumber}\n` }));

    const r1 = planner.replan('w1', 'first', 'evidence1');
    const r2 = planner.replan('w1', 'second', 'evidence2');
    assert.strictEqual(r1.revisionNumber, 1);
    assert.strictEqual(r2.revisionNumber, 2);
    assert.ok(fs.existsSync(path.join(base, 'docs', 'plans', 'w1-rev1.md')));
    assert.ok(fs.existsSync(path.join(base, 'docs', 'plans', 'w1-rev2.md')));
    const w = manager.workers.get('w1');
    assert.strictEqual(w.replan_count, 2);
    assert.strictEqual(w.plan_revisions.length, 2);
  });

  test('replan rejects once loop limit (default 3) is exceeded and pings Slack', () => {
    manager.workers.set('w1', makeWorker(base, { plan_doc_path: 'plan.md', replan_count: 3 }));
    planner.setPlannerFactory(() => { throw new Error('should not be called'); });

    const res = planner.replan('w1', 'too many', 'evidence');
    assert.ok(res.error.includes('Loop limit 3 exceeded'));
    assert.ok(res.error.includes('manual intervention required'));
    assert.strictEqual(res.loopLimitExceeded, true);
    // Slack notifier got the loop-limit message.
    const msgs = manager._notifications.messages;
    assert.strictEqual(msgs.length, 1);
    assert.ok(msgs[0].includes('[PLANNER LOOP LIMIT]'));
    assert.ok(msgs[0].includes('w1'));
  });

  test('config.plannerLoop.maxReplans overrides the default', () => {
    manager.config = { plannerLoop: { maxReplans: 1 } };
    planner = new Planner(manager);
    fs.writeFileSync(path.join(base, 'plan.md'), '# p\n');
    manager.workers.set('w1', makeWorker(base, { plan_doc_path: 'plan.md' }));
    planner.setPlannerFactory(() => ({ content: '# new\n' }));

    const r1 = planner.replan('w1', 'r', 'e');
    assert.strictEqual(r1.success, true);
    const r2 = planner.replan('w1', 'r2', 'e2');
    assert.ok(r2.error.includes('Loop limit 1 exceeded'));
  });

  test('redispatch re-sends the updated plan via sendTask with contextFrom', () => {
    fs.writeFileSync(path.join(base, 'plan.md'), '# p\n');
    manager.workers.set('w1', makeWorker(base, { plan_doc_path: 'plan.md' }));
    planner.setPlannerFactory(() => ({ content: '# rev\n' }));

    const replan = planner.replan('w1', 'oops', 'ev');
    assert.strictEqual(replan.success, true);

    const res = planner.redispatch('w1');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.replanCount, 1);
    assert.strictEqual(manager.sendTask.mock.callCount(), 1);
    const args = manager.sendTask.mock.calls[0].arguments;
    assert.strictEqual(args[0], 'w1');
    assert.ok(args[1].includes('[C4 PLANNER LOOP'));
    assert.ok(args[1].includes(res.planDocPath));
    assert.ok(args[1].includes('Original task: add feature X'));
    assert.strictEqual(args[2].contextFrom, 'w1');
  });

  test('updateAndMaybeReplan chains append + replan + redispatch atomically', () => {
    const planPath = path.join(base, 'plan.md');
    fs.writeFileSync(planPath, '# p\n');
    manager.workers.set('w1', makeWorker(base, { plan_doc_path: 'plan.md' }));

    const factory = mock.fn(() => ({ content: '# revised\n' }));
    planner.setPlannerFactory(factory);

    const res = planner.updateAndMaybeReplan('w1', 'bad', 'log', { replan: true, redispatch: true });
    assert.strictEqual(res.success, true);
    assert.ok(res.append.success);
    assert.ok(res.replan.success);
    assert.ok(res.redispatch.success);
    // append block went into the original plan
    assert.ok(fs.readFileSync(planPath, 'utf8').includes('## Needs Revision'));
    // replan wrote rev1 AND sendTask fired
    assert.strictEqual(factory.mock.callCount(), 1);
    assert.strictEqual(manager.sendTask.mock.callCount(), 1);
  });

  test('updateAndMaybeReplan without flags only appends, no factory call', () => {
    fs.writeFileSync(path.join(base, 'plan.md'), '# p\n');
    manager.workers.set('w1', makeWorker(base, { plan_doc_path: 'plan.md' }));
    const factory = mock.fn(() => ({ content: 'x' }));
    planner.setPlannerFactory(factory);

    const res = planner.updateAndMaybeReplan('w1', 'reason', 'evidence');
    assert.strictEqual(res.success, true);
    assert.ok(res.append.success);
    assert.strictEqual(res.replan, undefined);
    assert.strictEqual(factory.mock.callCount(), 0);
  });

  test('updateAndMaybeReplan surfaces loop-limit error without redispatching', () => {
    manager.workers.set('w1', makeWorker(base, { plan_doc_path: 'plan.md', replan_count: 3 }));
    fs.writeFileSync(path.join(base, 'plan.md'), '# p\n');
    planner.setPlannerFactory(() => ({ content: 'should not run' }));

    const res = planner.updateAndMaybeReplan('w1', 'too late', 'ev', { replan: true, redispatch: true });
    assert.strictEqual(res.success, false);
    assert.ok(res.error.includes('Loop limit 3 exceeded'));
    assert.strictEqual(res.loopLimitExceeded, true);
    assert.strictEqual(manager.sendTask.mock.callCount(), 0);
  });

  test('listRevisions returns the recorded history + maxReplans', () => {
    fs.writeFileSync(path.join(base, 'plan.md'), '# p\n');
    manager.workers.set('w1', makeWorker(base, { plan_doc_path: 'plan.md' }));
    planner.setPlannerFactory((input) => ({ content: `# rev${input.revisionNumber}\n` }));

    planner.replan('w1', 'r1', 'e1');
    planner.replan('w1', 'r2', 'e2');

    const res = planner.listRevisions('w1');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.worker, 'w1');
    assert.strictEqual(res.replanCount, 2);
    assert.strictEqual(res.maxReplans, 3);
    assert.strictEqual(res.revisions.length, 2);
    assert.strictEqual(res.revisions[0].rev, 1);
    assert.strictEqual(res.revisions[1].rev, 2);
    assert.ok(res.current.endsWith('w1-rev2.md'));
  });

  test('listRevisions rejects unknown worker', () => {
    assert.ok(planner.listRevisions('missing').error.includes('not found'));
  });

  test('default planner factory produces a revised plan when none is wired', () => {
    fs.writeFileSync(path.join(base, 'plan.md'), '# original\n');
    manager.workers.set('w1', makeWorker(base, { plan_doc_path: 'plan.md' }));
    // No factory set — falls back to _defaultPlannerFactory
    const res = planner.replan('w1', 'default-case', 'smoke');
    assert.strictEqual(res.success, true);
    const body = fs.readFileSync(res.revisionPath, 'utf8');
    assert.ok(body.includes('Revised Plan'));
    assert.ok(body.includes('default-case'));
    assert.ok(body.includes('smoke'));
  });

  test('replan refuses to run when factory returns error or empty content', () => {
    fs.writeFileSync(path.join(base, 'plan.md'), '# p\n');
    manager.workers.set('w1', makeWorker(base, { plan_doc_path: 'plan.md' }));

    planner.setPlannerFactory(() => ({ error: 'no LLM available' }));
    let res = planner.replan('w1', 'a', 'b');
    assert.ok(res.error.includes('no LLM available'));

    planner.setPlannerFactory(() => ({ content: '' }));
    res = planner.replan('w1', 'a', 'b');
    assert.ok(res.error.includes('empty content'));

    // worker state untouched on failure
    assert.strictEqual(manager.workers.get('w1').replan_count || 0, 0);
  });
});
