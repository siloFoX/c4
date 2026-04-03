const assert = require('assert');
const { describe, it } = require('node:test');

// Mock PtyManager._determineEffort by extracting the logic
function determineEffort(config, taskText) {
  const effortCfg = config.effort || {};
  if (!effortCfg.dynamic) return config.workerDefaults?.effortLevel || 'max';

  const thresholds = effortCfg.thresholds || { high: 100, max: 500 };
  const defaultLevel = effortCfg.default || config.workerDefaults?.effortLevel || 'high';
  const len = (taskText || '').length;

  const entries = Object.entries(thresholds).sort((a, b) => a[1] - b[1]);

  if (entries.length > 0 && len < entries[0][1]) {
    return entries[0][0];
  }

  if (entries.length > 0 && len >= entries[entries.length - 1][1]) {
    return entries[entries.length - 1][0];
  }

  return defaultLevel;
}

describe('Effort Dynamic Adjustment (3.3)', () => {
  const baseConfig = {
    effort: {
      dynamic: true,
      thresholds: { high: 100, max: 500 },
      default: 'high'
    },
    workerDefaults: { effortLevel: 'max' }
  };

  it('short task (<100 chars) → high effort', () => {
    const result = determineEffort(baseConfig, 'Fix a typo');
    assert.strictEqual(result, 'high');
  });

  it('medium task (100-499 chars) → default effort', () => {
    const task = 'a'.repeat(250);
    const result = determineEffort(baseConfig, task);
    assert.strictEqual(result, 'high'); // default is 'high'
  });

  it('long task (>=500 chars) → max effort', () => {
    const task = 'a'.repeat(500);
    const result = determineEffort(baseConfig, task);
    assert.strictEqual(result, 'max');
  });

  it('very long task (1000 chars) → max effort', () => {
    const task = 'a'.repeat(1000);
    const result = determineEffort(baseConfig, task);
    assert.strictEqual(result, 'max');
  });

  it('exactly 100 chars → default (between thresholds)', () => {
    const task = 'a'.repeat(100);
    const result = determineEffort(baseConfig, task);
    assert.strictEqual(result, 'high');
  });

  it('exactly 499 chars → default (between thresholds)', () => {
    const task = 'a'.repeat(499);
    const result = determineEffort(baseConfig, task);
    assert.strictEqual(result, 'high');
  });

  it('dynamic disabled → use static effortLevel', () => {
    const config = {
      effort: { dynamic: false },
      workerDefaults: { effortLevel: 'max' }
    };
    const result = determineEffort(config, 'short');
    assert.strictEqual(result, 'max');
  });

  it('no effort config → use workerDefaults.effortLevel', () => {
    const config = { workerDefaults: { effortLevel: 'max' } };
    const result = determineEffort(config, 'anything');
    assert.strictEqual(result, 'max');
  });

  it('empty task text → short (high)', () => {
    const result = determineEffort(baseConfig, '');
    assert.strictEqual(result, 'high');
  });

  it('null task text → short (high)', () => {
    const result = determineEffort(baseConfig, null);
    assert.strictEqual(result, 'high');
  });

  it('custom thresholds', () => {
    const config = {
      effort: {
        dynamic: true,
        thresholds: { low: 50, medium: 200, max: 800 },
        default: 'medium'
      },
      workerDefaults: { effortLevel: 'high' }
    };
    assert.strictEqual(determineEffort(config, 'hi'), 'low');          // < 50
    assert.strictEqual(determineEffort(config, 'a'.repeat(100)), 'medium');  // 50-199 → default
    assert.strictEqual(determineEffort(config, 'a'.repeat(900)), 'max');     // >= 800
  });

  it('single threshold', () => {
    const config = {
      effort: {
        dynamic: true,
        thresholds: { max: 300 },
        default: 'high'
      },
      workerDefaults: {}
    };
    assert.strictEqual(determineEffort(config, 'short'), 'max');  // below single threshold → that level
    assert.strictEqual(determineEffort(config, 'a'.repeat(300)), 'max');  // at threshold → that level
  });
});
