const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert');
const StateMachine = require('../src/state-machine');

describe('StateMachine', () => {
  let sm;

  beforeEach(() => {
    sm = new StateMachine({ maxTestFails: 3 });
  });

  test('createState returns initial state in edit phase', () => {
    const state = sm.createState();
    assert.strictEqual(state.phase, 'edit');
    assert.strictEqual(state.testFailCount, 0);
    assert.strictEqual(state.escalated, false);
    assert.deepStrictEqual(state.history, []);
  });

  // --- Phase detection ---

  test('detectPhase returns test for npm test output', () => {
    assert.strictEqual(sm.detectPhase('Running npm test...'), 'test');
  });

  test('detectPhase returns test for jest output', () => {
    assert.strictEqual(sm.detectPhase('jest --no-coverage'), 'test');
  });

  test('detectPhase returns test for Korean test pattern', () => {
    assert.strictEqual(sm.detectPhase('\ud14c\uc2a4\ud2b8 \uc2e4\ud589 \uc911'), 'test');
  });

  test('detectPhase returns edit for git commit', () => {
    assert.strictEqual(sm.detectPhase('git commit -m "feat: add feature"'), 'edit');
  });

  test('detectPhase returns edit for implement keyword', () => {
    assert.strictEqual(sm.detectPhase('\uad6c\ud604 \uc911...'), 'edit');
  });

  test('detectPhase returns plan for plan.md', () => {
    assert.strictEqual(sm.detectPhase('Writing plan.md with implementation steps'), 'plan');
  });

  test('detectPhase returns fix for fix keyword', () => {
    assert.strictEqual(sm.detectPhase('fixing the broken import'), 'fix');
  });

  test('detectPhase returns null for unrelated text', () => {
    assert.strictEqual(sm.detectPhase('hello world'), null);
  });

  // --- Test result detection ---

  test('detectTestResult returns fail for failed tests', () => {
    assert.strictEqual(sm.detectTestResult('Tests: 3 failed, 10 total'), 'fail');
  });

  test('detectTestResult returns fail for FAIL marker', () => {
    assert.strictEqual(sm.detectTestResult('FAIL src/app.test.js'), 'fail');
  });

  test('detectTestResult returns pass for passed tests', () => {
    assert.strictEqual(sm.detectTestResult('Tests: 10 passed, 10 total'), 'pass');
  });

  test('detectTestResult returns pass for PASS marker', () => {
    assert.strictEqual(sm.detectTestResult('PASS src/app.test.js'), 'pass');
  });

  test('detectTestResult returns null for unrelated text', () => {
    assert.strictEqual(sm.detectTestResult('hello world'), null);
  });

  // --- State updates ---

  test('update transitions phase on detection', () => {
    const state = sm.createState();
    const result = sm.update(state, 'npm test running...');
    assert.strictEqual(result.phase, 'test');
    assert.deepStrictEqual(result.transition, { from: 'edit', to: 'test' });
    assert.strictEqual(state.phase, 'test');
  });

  test('update records history', () => {
    const state = sm.createState();
    sm.update(state, 'npm test running...');
    assert.strictEqual(state.history.length, 1);
    assert.strictEqual(state.history[0].from, 'edit');
    assert.strictEqual(state.history[0].to, 'test');
  });

  test('update does not transition if same phase', () => {
    const state = sm.createState();
    state.phase = 'test';
    const result = sm.update(state, 'jest --watch');
    assert.strictEqual(result.transition, null);
  });

  test('update tracks test failure', () => {
    const state = sm.createState();
    state.phase = 'test';
    const result = sm.update(state, 'Tests: 2 failed, 5 total');
    assert.strictEqual(result.testResult, 'fail');
    assert.strictEqual(state.testFailCount, 1);
    assert.strictEqual(state.totalTestFails, 1);
  });

  test('update resets fail count on test pass', () => {
    const state = sm.createState();
    state.testFailCount = 2;
    const result = sm.update(state, 'Tests: 5 passed, 5 total');
    assert.strictEqual(result.testResult, 'pass');
    assert.strictEqual(state.testFailCount, 0);
  });

  test('update transitions test->fix on failure', () => {
    const state = sm.createState();
    state.phase = 'test';
    const result = sm.update(state, 'Tests: 1 failed, 3 total');
    assert.strictEqual(state.phase, 'fix');
    assert.deepStrictEqual(result.transition, { from: 'test', to: 'fix' });
  });

  // --- Escalation ---

  test('escalation after 3 consecutive test failures', () => {
    const state = sm.createState();
    state.phase = 'test';

    let result;
    result = sm.update(state, 'FAIL src/a.test.js');
    assert.strictEqual(result.escalation, null);

    state.phase = 'test';
    result = sm.update(state, 'FAIL src/b.test.js');
    assert.strictEqual(result.escalation, null);

    state.phase = 'test';
    result = sm.update(state, 'FAIL src/c.test.js');
    assert.ok(result.escalation !== null);
    assert.strictEqual(result.escalation.failCount, 3);
    assert.strictEqual(state.escalated, true);
  });

  test('escalation resets after test pass', () => {
    const state = sm.createState();
    state.testFailCount = 3;
    state.escalated = true;
    sm.update(state, 'Tests: 5 passed, 5 total');
    assert.strictEqual(state.escalated, false);
    assert.strictEqual(state.testFailCount, 0);
  });

  test('custom maxTestFails', () => {
    const sm2 = new StateMachine({ maxTestFails: 2 });
    const state = sm2.createState();
    state.phase = 'test';

    sm2.update(state, 'FAIL a');
    state.phase = 'test';
    const result = sm2.update(state, 'FAIL b');
    assert.ok(result.escalation !== null);
    assert.strictEqual(result.escalation.failCount, 2);
  });

  // --- Summary ---

  test('summary returns readable string', () => {
    const state = sm.createState();
    assert.strictEqual(sm.summary(state), 'phase=edit');
  });

  test('summary includes fail count and ESCALATED', () => {
    const state = sm.createState();
    state.phase = 'fix';
    state.testFailCount = 3;
    state.totalTestRuns = 5;
    state.escalated = true;
    assert.strictEqual(sm.summary(state), 'phase=fix fails=3 tests=5 ESCALATED');
  });

  test('summary handles null state', () => {
    assert.strictEqual(sm.summary(null), 'no state');
  });

  // --- History bounding ---

  test('history is bounded to 50 entries', () => {
    const state = sm.createState();
    for (let i = 0; i < 60; i++) {
      state.phase = i % 2 === 0 ? 'edit' : 'test';
      sm.update(state, i % 2 === 0 ? 'npm test' : '\uad6c\ud604 \uc911');
    }
    assert.ok(state.history.length <= 50);
  });

  test('update returns null for null state', () => {
    assert.strictEqual(sm.update(null, 'text'), null);
  });
});
