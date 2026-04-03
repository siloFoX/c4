'use strict';

// Minimal Jest compatibility shim for tests using describe/test/expect/jest.fn
// No external dependencies — uses only Node.js built-ins

const { deepStrictEqual } = require('assert');

// --- State ---
const suites = [];
let currentSuite = null;
let totalPass = 0;
let totalFail = 0;
let failures = [];

// --- jest.fn ---
function createMockFn(impl) {
  const calls = [];
  const fn = function (...args) {
    calls.push(args);
    return fn._impl ? fn._impl(...args) : undefined;
  };
  fn._impl = impl || null;
  fn.mock = { get calls() { return calls; } };
  fn.mockReturnValue = (val) => { fn._impl = () => val; return fn; };
  fn.mockImplementation = (impl) => { fn._impl = impl; return fn; };
  return fn;
}

global.jest = { fn: createMockFn };

// --- expect ---
function expectFn(actual) {
  const matchers = buildMatchers(actual, false);
  matchers.not = buildMatchers(actual, true);
  return matchers;
}

function buildMatchers(actual, negated) {
  const assert = (pass, msg) => {
    if (negated ? pass : !pass) throw new Error(msg);
  };

  return {
    toBe(expected) {
      assert(actual === expected,
        `Expected ${fmt(actual)} ${negated ? 'not ' : ''}to be ${fmt(expected)}`);
    },
    toEqual(expected) {
      let pass = true;
      try { deepStrictEqual(actual, expected); } catch { pass = false; }
      assert(pass,
        `Expected ${fmt(actual)} ${negated ? 'not ' : ''}to deep-equal ${fmt(expected)}`);
    },
    toBeNull() {
      assert(actual === null,
        `Expected ${fmt(actual)} ${negated ? 'not ' : ''}to be null`);
    },
    toBeDefined() {
      assert(actual !== undefined,
        `Expected value ${negated ? 'not ' : ''}to be defined`);
    },
    toBeUndefined() {
      assert(actual === undefined,
        `Expected ${fmt(actual)} ${negated ? 'not ' : ''}to be undefined`);
    },
    toBeTruthy() {
      assert(!!actual,
        `Expected ${fmt(actual)} ${negated ? 'not ' : ''}to be truthy`);
    },
    toBeFalsy() {
      assert(!actual,
        `Expected ${fmt(actual)} ${negated ? 'not ' : ''}to be falsy`);
    },
    toContain(item) {
      const pass = typeof actual === 'string'
        ? actual.includes(item)
        : Array.isArray(actual) && actual.includes(item);
      assert(pass,
        `Expected ${fmt(actual)} ${negated ? 'not ' : ''}to contain ${fmt(item)}`);
    },
    toHaveLength(len) {
      assert(actual != null && actual.length === len,
        `Expected length ${actual?.length} ${negated ? 'not ' : ''}to be ${len}`);
    },
    toBeGreaterThan(n) {
      assert(actual > n,
        `Expected ${actual} ${negated ? 'not ' : ''}to be > ${n}`);
    },
    toBeLessThan(n) {
      assert(actual < n,
        `Expected ${actual} ${negated ? 'not ' : ''}to be < ${n}`);
    },
    toBeGreaterThanOrEqual(n) {
      assert(actual >= n,
        `Expected ${actual} ${negated ? 'not ' : ''}to be >= ${n}`);
    },
    toBeLessThanOrEqual(n) {
      assert(actual <= n,
        `Expected ${actual} ${negated ? 'not ' : ''}to be <= ${n}`);
    },
    toThrow(expected) {
      let threw = false, error;
      try { actual(); } catch (e) { threw = true; error = e; }
      assert(threw,
        `Expected function ${negated ? 'not ' : ''}to throw`);
      if (!negated && threw && expected) {
        const msg = error?.message || '';
        const match = typeof expected === 'string' ? msg.includes(expected)
          : expected instanceof RegExp ? expected.test(msg) : false;
        assert(match, `Expected thrown error "${msg}" to match ${expected}`);
      }
    },
    toMatch(pattern) {
      const pass = pattern instanceof RegExp ? pattern.test(actual) : actual.includes(pattern);
      assert(pass,
        `Expected ${fmt(actual)} ${negated ? 'not ' : ''}to match ${pattern}`);
    },
    toBeInstanceOf(cls) {
      assert(actual instanceof cls,
        `Expected value ${negated ? 'not ' : ''}to be instance of ${cls.name}`);
    },
    // Mock matchers
    toHaveBeenCalled() {
      assert(actual?.mock?.calls?.length > 0,
        `Expected mock ${negated ? 'not ' : ''}to have been called`);
    },
    toHaveBeenCalledWith(...expected) {
      const calls = actual?.mock?.calls || [];
      let pass = false;
      for (const call of calls) {
        try { deepStrictEqual(call, expected); pass = true; break; } catch {}
      }
      assert(pass,
        `Expected mock ${negated ? 'not ' : ''}to have been called with ${fmt(expected)}`);
    },
    toHaveBeenCalledTimes(n) {
      const count = actual?.mock?.calls?.length || 0;
      assert(count === n,
        `Expected mock ${negated ? 'not ' : ''}to have been called ${n} times, got ${count}`);
    },
  };
}

function fmt(v) {
  try { return JSON.stringify(v); } catch { return String(v); }
}

global.expect = expectFn;

// --- describe / test / beforeEach ---
global.describe = function describe(name, fn) {
  const suite = { name, tests: [], beforeEachFns: [], parent: currentSuite };
  if (currentSuite) {
    currentSuite.tests.push({ type: 'suite', suite });
  } else {
    suites.push(suite);
  }
  const prev = currentSuite;
  currentSuite = suite;
  fn();
  currentSuite = prev;
};

global.test = global.it = function test(name, fn) {
  if (!currentSuite) throw new Error('test() must be inside describe()');
  currentSuite.tests.push({ type: 'test', name, fn });
};

global.beforeEach = function beforeEach(fn) {
  if (!currentSuite) throw new Error('beforeEach() must be inside describe()');
  currentSuite.beforeEachFns.push(fn);
};

// --- Runner (executes after test file finishes loading) ---
async function runSuite(suite, depth = 0) {
  const indent = '  '.repeat(depth);
  console.log(`${indent}${suite.name}`);

  for (const entry of suite.tests) {
    if (entry.type === 'suite') {
      await runSuite(entry.suite, depth + 1);
      continue;
    }

    // Collect all beforeEach from ancestors
    const hooks = [];
    let s = suite;
    while (s) { hooks.unshift(...s.beforeEachFns); s = s.parent; }

    try {
      for (const hook of hooks) await hook();
      await entry.fn();
      totalPass++;
      console.log(`${indent}  \u2713 ${entry.name}`);
    } catch (err) {
      totalFail++;
      console.log(`${indent}  \u2717 ${entry.name}`);
      console.log(`${indent}    ${err.message}`);
      failures.push(`${suite.name} > ${entry.name}: ${err.message}`);
    }
  }
}

process.on('beforeExit', async () => {
  for (const suite of suites) {
    await runSuite(suite);
  }
  console.log(`\n${totalPass} passed, ${totalFail} failed`);
  if (totalFail > 0) process.exitCode = 1;
});
