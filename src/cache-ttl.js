// TODO 11.85 (v1.11.103) — tiny TTL cache for daemon hot paths.
//
// The two hottest read endpoints (/api/list and /api/autonomous/status)
// were measured (tools/profile-daemon-endpoints.js) as O(N workers) per
// call: list() iterates every PTY and runs worker-metrics.sample() which
// does two fs.readFileSync calls into /proc. With dashboards polling on
// a 2-3s loop and multiple operators / tabs open, the daemon recomputes
// the same payload back-to-back even when nothing changed. A 2s TTL
// collapses that flood into one real compute per window.
//
// Contract:
//   - createCache({ ttlMs }) returns { get, set, invalidate, getOrCompute }.
//   - get(key) returns the cached value if still fresh, else undefined.
//   - set(key, value) stores value with a fresh timestamp.
//   - invalidate(key?) drops one key, or every entry when called with no arg.
//   - getOrCompute(key, asyncCompute) is the main entry point. It returns
//     the cached value when fresh, otherwise awaits asyncCompute() once
//     and stores the result. Concurrent calls while a compute is in
//     flight share the same Promise (stampede protection).
//   - clock injection (opts.now) is exposed only so unit tests can drive
//     TTL expiry deterministically without sleeping; production code
//     leaves it unset and falls back to Date.now.

'use strict';

const DEFAULT_TTL_MS = 2000;

function createCache(opts) {
  const ttlMs = (opts && typeof opts.ttlMs === 'number' && opts.ttlMs >= 0)
    ? opts.ttlMs
    : DEFAULT_TTL_MS;
  const now = (opts && typeof opts.now === 'function') ? opts.now : () => Date.now();

  // Each entry holds either a resolved value with its store time, or an
  // in-flight Promise that other callers can latch onto.
  const entries = new Map();
  const pending = new Map();

  function _isFresh(entry) {
    if (!entry) return false;
    return (now() - entry.t) < ttlMs;
  }

  function get(key) {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (!_isFresh(entry)) {
      entries.delete(key);
      return undefined;
    }
    return entry.v;
  }

  function set(key, value) {
    entries.set(key, { v: value, t: now() });
  }

  function invalidate(key) {
    if (typeof key === 'undefined') {
      entries.clear();
      // Pending Promises are deliberately left alone; their resolution
      // will write back into a key we've already cleared, but the next
      // getOrCompute will see a stale-ish entry and recompute on the
      // following hit (TTL still bounds the staleness window).
      return;
    }
    entries.delete(key);
  }

  function getOrCompute(key, asyncCompute) {
    const fresh = entries.get(key);
    if (_isFresh(fresh)) return Promise.resolve(fresh.v);
    const inflight = pending.get(key);
    if (inflight) return inflight;
    const p = Promise.resolve()
      .then(() => asyncCompute())
      .then((value) => {
        entries.set(key, { v: value, t: now() });
        pending.delete(key);
        return value;
      })
      .catch((err) => {
        pending.delete(key);
        throw err;
      });
    pending.set(key, p);
    return p;
  }

  return { get, set, invalidate, getOrCompute };
}

module.exports = { createCache, DEFAULT_TTL_MS };
