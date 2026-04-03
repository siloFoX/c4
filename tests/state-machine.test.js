const StateMachine = require('../src/state-machine');

describe('StateMachine', () => {
  let sm;

  beforeEach(() => {
    sm = new StateMachine({ maxTestFails: 3 });
  });

  test('createState returns initial state in edit phase', () => {
    const state = sm.createState();
    expect(state.phase).toBe('edit');
    expect(state.testFailCount).toBe(0);
    expect(state.escalated).toBe(false);
    expect(state.history).toEqual([]);
  });

  // --- Phase detection ---

  test('detectPhase returns test for npm test output', () => {
    expect(sm.detectPhase('Running npm test...')).toBe('test');
  });

  test('detectPhase returns test for jest output', () => {
    expect(sm.detectPhase('jest --no-coverage')).toBe('test');
  });

  test('detectPhase returns test for Korean test pattern', () => {
    expect(sm.detectPhase('테스트 실행 중')).toBe('test');
  });

  test('detectPhase returns edit for git commit', () => {
    expect(sm.detectPhase('git commit -m "feat: add feature"')).toBe('edit');
  });

  test('detectPhase returns edit for implement keyword', () => {
    expect(sm.detectPhase('구현 중...')).toBe('edit');
  });

  test('detectPhase returns plan for plan.md', () => {
    expect(sm.detectPhase('Writing plan.md with implementation steps')).toBe('plan');
  });

  test('detectPhase returns fix for fix keyword', () => {
    expect(sm.detectPhase('fixing the broken import')).toBe('fix');
  });

  test('detectPhase returns null for unrelated text', () => {
    expect(sm.detectPhase('hello world')).toBeNull();
  });

  // --- Test result detection ---

  test('detectTestResult returns fail for failed tests', () => {
    expect(sm.detectTestResult('Tests: 3 failed, 10 total')).toBe('fail');
  });

  test('detectTestResult returns fail for FAIL marker', () => {
    expect(sm.detectTestResult('FAIL src/app.test.js')).toBe('fail');
  });

  test('detectTestResult returns pass for passed tests', () => {
    expect(sm.detectTestResult('Tests: 10 passed, 10 total')).toBe('pass');
  });

  test('detectTestResult returns pass for PASS marker', () => {
    expect(sm.detectTestResult('PASS src/app.test.js')).toBe('pass');
  });

  test('detectTestResult returns null for unrelated text', () => {
    expect(sm.detectTestResult('hello world')).toBeNull();
  });

  // --- State updates ---

  test('update transitions phase on detection', () => {
    const state = sm.createState();
    const result = sm.update(state, 'npm test running...');
    expect(result.phase).toBe('test');
    expect(result.transition).toEqual({ from: 'edit', to: 'test' });
    expect(state.phase).toBe('test');
  });

  test('update records history', () => {
    const state = sm.createState();
    sm.update(state, 'npm test running...');
    expect(state.history).toHaveLength(1);
    expect(state.history[0].from).toBe('edit');
    expect(state.history[0].to).toBe('test');
  });

  test('update does not transition if same phase', () => {
    const state = sm.createState();
    state.phase = 'test';
    const result = sm.update(state, 'jest --watch');
    expect(result.transition).toBeNull();
  });

  test('update tracks test failure', () => {
    const state = sm.createState();
    state.phase = 'test';
    const result = sm.update(state, 'Tests: 2 failed, 5 total');
    expect(result.testResult).toBe('fail');
    expect(state.testFailCount).toBe(1);
    expect(state.totalTestFails).toBe(1);
  });

  test('update resets fail count on test pass', () => {
    const state = sm.createState();
    state.testFailCount = 2;
    const result = sm.update(state, 'Tests: 5 passed, 5 total');
    expect(result.testResult).toBe('pass');
    expect(state.testFailCount).toBe(0);
  });

  test('update transitions test→fix on failure', () => {
    const state = sm.createState();
    state.phase = 'test';
    const result = sm.update(state, 'Tests: 1 failed, 3 total');
    expect(state.phase).toBe('fix');
    expect(result.transition).toEqual({ from: 'test', to: 'fix' });
  });

  // --- Escalation ---

  test('escalation after 3 consecutive test failures', () => {
    const state = sm.createState();
    state.phase = 'test';

    let result;
    result = sm.update(state, 'FAIL src/a.test.js');
    expect(result.escalation).toBeNull();

    state.phase = 'test';
    result = sm.update(state, 'FAIL src/b.test.js');
    expect(result.escalation).toBeNull();

    state.phase = 'test';
    result = sm.update(state, 'FAIL src/c.test.js');
    expect(result.escalation).not.toBeNull();
    expect(result.escalation.failCount).toBe(3);
    expect(state.escalated).toBe(true);
  });

  test('escalation resets after test pass', () => {
    const state = sm.createState();
    state.testFailCount = 3;
    state.escalated = true;
    sm.update(state, 'Tests: 5 passed, 5 total');
    expect(state.escalated).toBe(false);
    expect(state.testFailCount).toBe(0);
  });

  test('custom maxTestFails', () => {
    const sm2 = new StateMachine({ maxTestFails: 2 });
    const state = sm2.createState();
    state.phase = 'test';

    sm2.update(state, 'FAIL a');
    state.phase = 'test';
    const result = sm2.update(state, 'FAIL b');
    expect(result.escalation).not.toBeNull();
    expect(result.escalation.failCount).toBe(2);
  });

  // --- Summary ---

  test('summary returns readable string', () => {
    const state = sm.createState();
    expect(sm.summary(state)).toBe('phase=edit');
  });

  test('summary includes fail count and ESCALATED', () => {
    const state = sm.createState();
    state.phase = 'fix';
    state.testFailCount = 3;
    state.totalTestRuns = 5;
    state.escalated = true;
    expect(sm.summary(state)).toBe('phase=fix fails=3 tests=5 ESCALATED');
  });

  test('summary handles null state', () => {
    expect(sm.summary(null)).toBe('no state');
  });

  // --- History bounding ---

  test('history is bounded to 50 entries', () => {
    const state = sm.createState();
    for (let i = 0; i < 60; i++) {
      state.phase = i % 2 === 0 ? 'edit' : 'test';
      sm.update(state, i % 2 === 0 ? 'npm test' : '구현 중');
    }
    expect(state.history.length).toBeLessThanOrEqual(50);
  });

  test('update returns null for null state', () => {
    expect(sm.update(null, 'text')).toBeNull();
  });
});
