const { describe, test, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const Planner = require('../src/planner');
const fs = require('fs');
const path = require('path');
const os = require('os');

function createMockManager() {
  return {
    workers: new Map(),
    sendTask: mock.fn(() => ({ success: true, branch: 'c4/planner', worktree: '/tmp/wt' })),
    _detectRepoRoot: mock.fn(() => os.tmpdir()),
  };
}

describe('Planner', () => {
  let planner, manager;

  beforeEach(() => {
    manager = createMockManager();
    planner = new Planner(manager);
  });

  test('buildPlanPrompt includes task and plan mode header', () => {
    const prompt = planner.buildPlanPrompt('Add user auth');
    assert.ok(prompt.includes('[C4 PLAN MODE'));
    assert.ok(prompt.includes('Add user auth'));
    assert.ok(prompt.includes('plan.md'));
    assert.ok(prompt.includes('\uc218\uc815\ud560 \ud30c\uc77c \ubaa9\ub85d'));
    assert.ok(prompt.includes('\ud14c\uc2a4\ud2b8 \uacc4\ud68d'));
  });

  test('buildPlanPrompt uses custom outputPath', () => {
    const prompt = planner.buildPlanPrompt('task', { outputPath: 'docs/plan-auth.md' });
    assert.ok(prompt.includes('docs/plan-auth.md'));
    assert.ok(!prompt.includes('plan.md\n'));
  });

  test('sendPlan calls sendTask with plan prompt', () => {
    const result = planner.sendPlan('w1', 'Add logging');
    assert.strictEqual(result.success, true);
    assert.strictEqual(manager.sendTask.mock.callCount(), 1);
    const args = manager.sendTask.mock.calls[0].arguments;
    assert.strictEqual(args[0], 'w1');
    assert.ok(args[1].includes('[C4 PLAN MODE'));
    assert.ok(args[1].includes('Add logging'));
  });

  test('sendPlan passes branch and scope options', () => {
    planner.sendPlan('w1', 'task', { branch: 'plan/feature', scopePreset: 'backend' });
    const options = manager.sendTask.mock.calls[0].arguments[2];
    assert.strictEqual(options.branch, 'plan/feature');
    assert.strictEqual(options.scopePreset, 'backend');
  });

  test('readPlan returns error for unknown worker', () => {
    const result = planner.readPlan('unknown');
    assert.ok(result.error.includes('not found'));
  });

  test('readPlan reads plan.md from worktree', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-planner-'));
    const planPath = path.join(tmpDir, 'plan.md');
    fs.writeFileSync(planPath, '# Plan\n\n1. Step one\n2. Step two\n');

    manager.workers.set('w1', { worktree: tmpDir });
    const result = planner.readPlan('w1');
    assert.strictEqual(result.success, true);
    assert.ok(result.content.includes('# Plan'));
    assert.ok(result.content.includes('Step one'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('readPlan returns error if plan.md not found', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-planner-'));
    manager.workers.set('w1', { worktree: tmpDir });
    const result = planner.readPlan('w1');
    assert.ok(result.error.includes('Plan not found'));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('readPlan reads custom output path', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-planner-'));
    const docsDir = path.join(tmpDir, 'docs');
    fs.mkdirSync(docsDir);
    fs.writeFileSync(path.join(docsDir, 'my-plan.md'), '# Custom Plan');

    manager.workers.set('w1', { worktree: tmpDir });
    const result = planner.readPlan('w1', { outputPath: 'docs/my-plan.md' });
    assert.strictEqual(result.success, true);
    assert.ok(result.content.includes('# Custom Plan'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
