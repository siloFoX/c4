const Planner = require('../src/planner');
const fs = require('fs');
const path = require('path');
const os = require('os');

function createMockManager() {
  return {
    workers: new Map(),
    sendTask: jest.fn(() => ({ success: true, branch: 'c4/planner', worktree: '/tmp/wt' })),
    _detectRepoRoot: jest.fn(() => os.tmpdir()),
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
    expect(prompt).toContain('[C4 PLAN MODE');
    expect(prompt).toContain('Add user auth');
    expect(prompt).toContain('plan.md');
    expect(prompt).toContain('수정할 파일 목록');
    expect(prompt).toContain('테스트 계획');
  });

  test('buildPlanPrompt uses custom outputPath', () => {
    const prompt = planner.buildPlanPrompt('task', { outputPath: 'docs/plan-auth.md' });
    expect(prompt).toContain('docs/plan-auth.md');
    expect(prompt).not.toContain('plan.md\n');
  });

  test('sendPlan calls sendTask with plan prompt', () => {
    const result = planner.sendPlan('w1', 'Add logging');
    expect(result.success).toBe(true);
    expect(manager.sendTask).toHaveBeenCalledTimes(1);
    const [name, prompt, options] = manager.sendTask.mock.calls[0];
    expect(name).toBe('w1');
    expect(prompt).toContain('[C4 PLAN MODE');
    expect(prompt).toContain('Add logging');
  });

  test('sendPlan passes branch and scope options', () => {
    planner.sendPlan('w1', 'task', { branch: 'plan/feature', scopePreset: 'backend' });
    const options = manager.sendTask.mock.calls[0][2];
    expect(options.branch).toBe('plan/feature');
    expect(options.scopePreset).toBe('backend');
  });

  test('readPlan returns error for unknown worker', () => {
    const result = planner.readPlan('unknown');
    expect(result.error).toContain('not found');
  });

  test('readPlan reads plan.md from worktree', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-planner-'));
    const planPath = path.join(tmpDir, 'plan.md');
    fs.writeFileSync(planPath, '# Plan\n\n1. Step one\n2. Step two\n');

    manager.workers.set('w1', { worktree: tmpDir });
    const result = planner.readPlan('w1');
    expect(result.success).toBe(true);
    expect(result.content).toContain('# Plan');
    expect(result.content).toContain('Step one');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('readPlan returns error if plan.md not found', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-planner-'));
    manager.workers.set('w1', { worktree: tmpDir });
    const result = planner.readPlan('w1');
    expect(result.error).toContain('Plan not found');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('readPlan reads custom output path', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-planner-'));
    const docsDir = path.join(tmpDir, 'docs');
    fs.mkdirSync(docsDir);
    fs.writeFileSync(path.join(docsDir, 'my-plan.md'), '# Custom Plan');

    manager.workers.set('w1', { worktree: tmpDir });
    const result = planner.readPlan('w1', { outputPath: 'docs/my-plan.md' });
    expect(result.success).toBe(true);
    expect(result.content).toContain('# Custom Plan');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
