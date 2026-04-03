const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert');
const AdaptivePolling = require('../src/adaptive-polling');

describe('AdaptivePolling', () => {
  let ap;

  beforeEach(() => {
    ap = new AdaptivePolling({
      minIntervalMs: 500,
      maxIntervalMs: 5000,
      baseIntervalMs: 3000,
      windowMs: 10000,
      busyThreshold: 5,
    });
  });

  test('createState returns initial state', () => {
    const state = ap.createState();
    assert.deepStrictEqual(state.dataTimestamps, []);
    assert.strictEqual(state.currentInterval, 3000);
  });

  test('getInterval returns base when no activity', () => {
    const state = ap.createState();
    const interval = ap.getInterval(state);
    // No activity -> max interval
    assert.strictEqual(interval, 5000);
  });

  test('getInterval returns min when busy', () => {
    const state = ap.createState();
    const now = Date.now();
    // Simulate 10 data events in quick succession
    for (let i = 0; i < 10; i++) {
      state.dataTimestamps.push(now - i * 100);
    }
    const interval = ap.getInterval(state);
    assert.strictEqual(interval, 500);
  });

  test('getInterval interpolates for moderate activity', () => {
    const state = ap.createState();
    const now = Date.now();
    // 2 events out of 5 threshold -> moderate
    state.dataTimestamps.push(now - 100);
    state.dataTimestamps.push(now - 200);
    const interval = ap.getInterval(state);
    // Should be between min(500) and max(5000)
    assert.ok(interval > 500);
    assert.ok(interval < 5000);
  });

  test('recordActivity adds timestamp and trims old', () => {
    const state = ap.createState();
    ap.recordActivity(state);
    assert.strictEqual(state.dataTimestamps.length, 1);

    // Add old timestamp
    state.dataTimestamps.unshift(Date.now() - 20000); // 20s ago, outside 10s window
    ap.recordActivity(state);
    // Old one should be trimmed
    assert.strictEqual(state.dataTimestamps.length, 2); // new one + previous one (not old)
  });

  test('getInterval trims old timestamps', () => {
    const state = ap.createState();
    // All timestamps outside window
    state.dataTimestamps = [
      Date.now() - 20000,
      Date.now() - 15000,
    ];
    const interval = ap.getInterval(state);
    assert.strictEqual(interval, 5000); // No recent activity -> max
    assert.strictEqual(state.dataTimestamps.length, 0);
  });

  test('getActivityLevel returns busy/moderate/idle', () => {
    const state = ap.createState();
    assert.strictEqual(ap.getActivityLevel(state), 'idle');

    const now = Date.now();
    state.dataTimestamps.push(now);
    assert.strictEqual(ap.getActivityLevel(state), 'moderate');

    for (let i = 0; i < 10; i++) {
      state.dataTimestamps.push(now - i * 100);
    }
    assert.strictEqual(ap.getActivityLevel(state), 'busy');
  });

  test('getActivityLevel returns unknown for null state', () => {
    assert.strictEqual(ap.getActivityLevel(null), 'unknown');
  });

  test('getInterval returns base for null state', () => {
    assert.strictEqual(ap.getInterval(null), 3000);
  });

  test('recordActivity handles null state gracefully', () => {
    assert.doesNotThrow(() => ap.recordActivity(null));
  });

  test('custom options are respected', () => {
    const custom = new AdaptivePolling({
      minIntervalMs: 200,
      maxIntervalMs: 10000,
      baseIntervalMs: 1000,
      windowMs: 5000,
      busyThreshold: 3,
    });
    assert.strictEqual(custom.minIntervalMs, 200);
    assert.strictEqual(custom.maxIntervalMs, 10000);
    assert.strictEqual(custom.baseIntervalMs, 1000);
    assert.strictEqual(custom.busyThreshold, 3);

    const state = custom.createState();
    assert.strictEqual(state.currentInterval, 1000);
  });

  test('interval decreases as activity increases', () => {
    const state = ap.createState();
    const now = Date.now();

    // Start with no activity
    const interval0 = ap.getInterval(state);

    // Add 1 event
    state.dataTimestamps.push(now);
    const interval1 = ap.getInterval(state);

    // Add more events
    state.dataTimestamps.push(now - 100);
    state.dataTimestamps.push(now - 200);
    const interval3 = ap.getInterval(state);

    assert.ok(interval0 > interval1);
    assert.ok(interval1 > interval3);
  });

  test('busy -> idle transition increases interval', () => {
    const state = ap.createState();
    const now = Date.now();

    // Busy state
    for (let i = 0; i < 10; i++) {
      state.dataTimestamps.push(now - i * 100);
    }
    const busyInterval = ap.getInterval(state);

    // Clear all activity (simulate time passing)
    state.dataTimestamps = [];
    const idleInterval = ap.getInterval(state);

    assert.strictEqual(busyInterval, 500);
    assert.strictEqual(idleInterval, 5000);
  });

  test('defaults are used when no options provided', () => {
    const defaultAp = new AdaptivePolling();
    assert.strictEqual(defaultAp.minIntervalMs, 500);
    assert.strictEqual(defaultAp.maxIntervalMs, 5000);
    assert.strictEqual(defaultAp.baseIntervalMs, 3000);
    assert.strictEqual(defaultAp.windowMs, 10000);
    assert.strictEqual(defaultAp.busyThreshold, 5);
  });
});
