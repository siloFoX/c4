/**
 * StateMachine (3.11)
 *
 * Tracks worker phase: plan → edit → test → fix
 * Detects test failures and escalates after N consecutive failures.
 */

const PHASES = ['plan', 'edit', 'test', 'fix'];

// Patterns that indicate a phase transition
const PHASE_PATTERNS = {
  plan: [
    /plan\.md/i,
    /설계|계획|design|planning/i,
    /구현 순서|implementation plan/i,
  ],
  edit: [
    /\b(Write|Edit|Create)\b.*file/i,
    /수정|작성|구현|implement/i,
    /\bgit add\b/i,
    /\bgit commit\b/i,
  ],
  test: [
    /npm test/i,
    /jest|mocha|pytest/i,
    /test.*(?:pass|fail|run)/i,
    /테스트.*(?:실행|통과|실패)/i,
  ],
  fix: [
    /fix|수정|고침|patch/i,
    /FAIL.*→.*fix/i,
    /에러.*수정/i,
  ],
};

// Patterns that indicate test failure
const TEST_FAIL_PATTERNS = [
  /Tests?:\s+\d+ failed/i,
  /FAIL\s/,
  /test.*failed/i,
  /테스트.*실패/i,
  /npm ERR!.*test/i,
  /AssertionError/i,
  /Expected.*Received/i,
];

// Patterns that indicate test success
const TEST_PASS_PATTERNS = [
  /Tests?:\s+\d+ passed,\s+\d+ total/i,
  /All tests passed/i,
  /테스트.*통과/i,
  /PASS\s/,
];

class StateMachine {
  /**
   * @param {object} options
   * @param {number} options.maxTestFails - Consecutive test failures before escalation (default: 3)
   */
  constructor(options = {}) {
    this.maxTestFails = options.maxTestFails || 3;
  }

  /**
   * Create initial state for a worker.
   */
  createState() {
    return {
      phase: 'edit',          // Current phase
      prevPhase: null,        // Previous phase
      testFailCount: 0,       // Consecutive test failures
      totalTestRuns: 0,       // Total test executions
      totalTestFails: 0,      // Total test failures
      escalated: false,       // Whether escalation was triggered
      history: [],            // Phase transition history: { from, to, time }
    };
  }

  /**
   * Detect the likely phase from screen text.
   * Returns the detected phase or null if unclear.
   */
  detectPhase(screenText) {
    // Check test phase first (highest priority — test output is distinctive)
    for (const pattern of PHASE_PATTERNS.test) {
      if (pattern.test(screenText)) return 'test';
    }
    for (const pattern of PHASE_PATTERNS.fix) {
      if (pattern.test(screenText)) return 'fix';
    }
    for (const pattern of PHASE_PATTERNS.plan) {
      if (pattern.test(screenText)) return 'plan';
    }
    for (const pattern of PHASE_PATTERNS.edit) {
      if (pattern.test(screenText)) return 'edit';
    }
    return null;
  }

  /**
   * Detect test result from screen text.
   * Returns 'pass', 'fail', or null.
   */
  detectTestResult(screenText) {
    for (const pattern of TEST_FAIL_PATTERNS) {
      if (pattern.test(screenText)) return 'fail';
    }
    for (const pattern of TEST_PASS_PATTERNS) {
      if (pattern.test(screenText)) return 'pass';
    }
    return null;
  }

  /**
   * Update worker state based on screen output.
   * Returns { phase, transition, testResult, escalation } or null if no change.
   */
  update(state, screenText) {
    if (!state) return null;

    const result = {
      phase: state.phase,
      transition: null,
      testResult: null,
      escalation: null,
    };

    // Detect phase
    const detected = this.detectPhase(screenText);
    if (detected && detected !== state.phase) {
      result.transition = { from: state.phase, to: detected };
      state.prevPhase = state.phase;
      state.phase = detected;
      result.phase = detected;
      state.history.push({
        from: result.transition.from,
        to: result.transition.to,
        time: Date.now()
      });
      // Keep history bounded
      if (state.history.length > 50) {
        state.history = state.history.slice(-50);
      }
    }

    // Detect test result
    const testResult = this.detectTestResult(screenText);
    if (testResult) {
      result.testResult = testResult;
      state.totalTestRuns++;

      if (testResult === 'fail') {
        state.testFailCount++;
        state.totalTestFails++;

        // Check for escalation
        if (state.testFailCount >= this.maxTestFails && !state.escalated) {
          state.escalated = true;
          result.escalation = {
            reason: `test failed ${state.testFailCount} consecutive times`,
            failCount: state.testFailCount,
            totalRuns: state.totalTestRuns,
          };
        }

        // Auto-transition to fix phase on failure
        if (state.phase === 'test') {
          result.transition = { from: 'test', to: 'fix' };
          state.prevPhase = 'test';
          state.phase = 'fix';
          result.phase = 'fix';
          state.history.push({ from: 'test', to: 'fix', time: Date.now() });
        }
      } else if (testResult === 'pass') {
        state.testFailCount = 0;
        state.escalated = false; // Reset escalation on success
      }
    }

    return result;
  }

  /**
   * Get a human-readable summary of worker state.
   */
  summary(state) {
    if (!state) return 'no state';
    const parts = [`phase=${state.phase}`];
    if (state.testFailCount > 0) parts.push(`fails=${state.testFailCount}`);
    if (state.totalTestRuns > 0) parts.push(`tests=${state.totalTestRuns}`);
    if (state.escalated) parts.push('ESCALATED');
    return parts.join(' ');
  }
}

module.exports = StateMachine;
