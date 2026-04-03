/**
 * AdaptivePolling (3.12)
 *
 * Dynamically adjusts idle detection interval based on output activity.
 * Busy workers get shorter intervals (faster snapshots), idle workers get longer ones.
 */

class AdaptivePolling {
  /**
   * @param {object} options
   * @param {number} options.minIntervalMs  - Minimum interval when busy (default: 500)
   * @param {number} options.maxIntervalMs  - Maximum interval when idle (default: 5000)
   * @param {number} options.baseIntervalMs - Default/base interval (default: 3000)
   * @param {number} options.windowMs       - Time window to measure activity (default: 10000)
   * @param {number} options.busyThreshold  - Data events in window to be "busy" (default: 5)
   */
  constructor(options = {}) {
    this.minIntervalMs = options.minIntervalMs || 500;
    this.maxIntervalMs = options.maxIntervalMs || 5000;
    this.baseIntervalMs = options.baseIntervalMs || 3000;
    this.windowMs = options.windowMs || 10000;
    this.busyThreshold = options.busyThreshold || 5;
  }

  /**
   * Create per-worker polling state.
   */
  createState() {
    return {
      dataTimestamps: [],     // Recent data event timestamps within window
      currentInterval: this.baseIntervalMs,
    };
  }

  /**
   * Record a data event (called on each PTY onData).
   */
  recordActivity(state) {
    if (!state) return;
    const now = Date.now();
    state.dataTimestamps.push(now);
    // Trim timestamps outside window
    const cutoff = now - this.windowMs;
    while (state.dataTimestamps.length > 0 && state.dataTimestamps[0] < cutoff) {
      state.dataTimestamps.shift();
    }
  }

  /**
   * Calculate the current interval based on activity.
   * Call this when resetting the idle timer.
   */
  getInterval(state) {
    if (!state) return this.baseIntervalMs;

    const now = Date.now();
    const cutoff = now - this.windowMs;

    // Clean old timestamps
    while (state.dataTimestamps.length > 0 && state.dataTimestamps[0] < cutoff) {
      state.dataTimestamps.shift();
    }

    const count = state.dataTimestamps.length;

    if (count >= this.busyThreshold) {
      // Busy: use min interval (fast snapshots)
      state.currentInterval = this.minIntervalMs;
    } else if (count === 0) {
      // No activity: use max interval (slow polling)
      state.currentInterval = this.maxIntervalMs;
    } else {
      // Proportional: interpolate between min and max
      const ratio = count / this.busyThreshold; // 0..1
      state.currentInterval = Math.round(
        this.maxIntervalMs - ratio * (this.maxIntervalMs - this.minIntervalMs)
      );
    }

    return state.currentInterval;
  }

  /**
   * Get activity level description.
   */
  getActivityLevel(state) {
    if (!state) return 'unknown';
    const count = state.dataTimestamps.length;
    if (count >= this.busyThreshold) return 'busy';
    if (count === 0) return 'idle';
    return 'moderate';
  }
}

module.exports = AdaptivePolling;
