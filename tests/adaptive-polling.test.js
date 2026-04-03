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
    expect(state.dataTimestamps).toEqual([]);
    expect(state.currentInterval).toBe(3000);
  });

  test('getInterval returns base when no activity', () => {
    const state = ap.createState();
    const interval = ap.getInterval(state);
    // No activity → max interval
    expect(interval).toBe(5000);
  });

  test('getInterval returns min when busy', () => {
    const state = ap.createState();
    const now = Date.now();
    // Simulate 10 data events in quick succession
    for (let i = 0; i < 10; i++) {
      state.dataTimestamps.push(now - i * 100);
    }
    const interval = ap.getInterval(state);
    expect(interval).toBe(500);
  });

  test('getInterval interpolates for moderate activity', () => {
    const state = ap.createState();
    const now = Date.now();
    // 2 events out of 5 threshold → moderate
    state.dataTimestamps.push(now - 100);
    state.dataTimestamps.push(now - 200);
    const interval = ap.getInterval(state);
    // Should be between min(500) and max(5000)
    expect(interval).toBeGreaterThan(500);
    expect(interval).toBeLessThan(5000);
  });

  test('recordActivity adds timestamp and trims old', () => {
    const state = ap.createState();
    ap.recordActivity(state);
    expect(state.dataTimestamps).toHaveLength(1);

    // Add old timestamp
    state.dataTimestamps.unshift(Date.now() - 20000); // 20s ago, outside 10s window
    ap.recordActivity(state);
    // Old one should be trimmed
    expect(state.dataTimestamps).toHaveLength(2); // new one + previous one (not old)
  });

  test('getInterval trims old timestamps', () => {
    const state = ap.createState();
    // All timestamps outside window
    state.dataTimestamps = [
      Date.now() - 20000,
      Date.now() - 15000,
    ];
    const interval = ap.getInterval(state);
    expect(interval).toBe(5000); // No recent activity → max
    expect(state.dataTimestamps).toHaveLength(0);
  });

  test('getActivityLevel returns busy/moderate/idle', () => {
    const state = ap.createState();
    expect(ap.getActivityLevel(state)).toBe('idle');

    const now = Date.now();
    state.dataTimestamps.push(now);
    expect(ap.getActivityLevel(state)).toBe('moderate');

    for (let i = 0; i < 10; i++) {
      state.dataTimestamps.push(now - i * 100);
    }
    expect(ap.getActivityLevel(state)).toBe('busy');
  });

  test('getActivityLevel returns unknown for null state', () => {
    expect(ap.getActivityLevel(null)).toBe('unknown');
  });

  test('getInterval returns base for null state', () => {
    expect(ap.getInterval(null)).toBe(3000);
  });

  test('recordActivity handles null state gracefully', () => {
    expect(() => ap.recordActivity(null)).not.toThrow();
  });

  test('custom options are respected', () => {
    const custom = new AdaptivePolling({
      minIntervalMs: 200,
      maxIntervalMs: 10000,
      baseIntervalMs: 1000,
      windowMs: 5000,
      busyThreshold: 3,
    });
    expect(custom.minIntervalMs).toBe(200);
    expect(custom.maxIntervalMs).toBe(10000);
    expect(custom.baseIntervalMs).toBe(1000);
    expect(custom.busyThreshold).toBe(3);

    const state = custom.createState();
    expect(state.currentInterval).toBe(1000);
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

    expect(interval0).toBeGreaterThan(interval1);
    expect(interval1).toBeGreaterThan(interval3);
  });

  test('busy → idle transition increases interval', () => {
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

    expect(busyInterval).toBe(500);
    expect(idleInterval).toBe(5000);
  });

  test('defaults are used when no options provided', () => {
    const defaultAp = new AdaptivePolling();
    expect(defaultAp.minIntervalMs).toBe(500);
    expect(defaultAp.maxIntervalMs).toBe(5000);
    expect(defaultAp.baseIntervalMs).toBe(3000);
    expect(defaultAp.windowMs).toBe(10000);
    expect(defaultAp.busyThreshold).toBe(5);
  });
});
