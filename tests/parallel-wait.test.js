// Parallel wait + interrupt-on-intervention tests (5.43, 5.44)
'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('assert');

// Minimal mock of PtyManager's wait methods for unit testing
function createMockManager(workerDefs) {
  const workers = new Map();
  for (const [name, def] of Object.entries(workerDefs)) {
    workers.set(name, {
      alive: def.alive !== undefined ? def.alive : true,
      lastDataTime: def.lastDataTime || Date.now() - 10000,
      _interventionState: def._interventionState || null,
      screen: { rows: [def.screenText || `output of ${name}`] }
    });
  }

  const idleThresholdMs = 3000;

  function _getScreenText(screen) {
    return screen.rows.join('\n');
  }

  return {
    workers,
    idleThresholdMs,

    async waitAndRead(name, timeoutMs = 120000, options = {}) {
      const { interruptOnIntervention = false } = options;
      const w = workers.get(name);
      if (!w) return { error: `Worker '${name}' not found` };

      const startTime = Date.now();
      return new Promise((resolve) => {
        const check = () => {
          if (Date.now() - startTime > timeoutMs) {
            resolve({ content: _getScreenText(w.screen), status: 'timeout' });
            return;
          }
          if (!w.alive) {
            resolve({ content: _getScreenText(w.screen), status: 'exited' });
            return;
          }
          if (interruptOnIntervention && w._interventionState) {
            resolve({
              content: _getScreenText(w.screen),
              status: 'intervention',
              intervention: w._interventionState
            });
            return;
          }
          const idleMs = Date.now() - w.lastDataTime;
          if (idleMs >= idleThresholdMs) {
            resolve({ content: _getScreenText(w.screen), status: 'idle' });
            return;
          }
          setTimeout(check, 100);
        };
        check();
      });
    },

    async waitAndReadMulti(names, timeoutMs = 120000, options = {}) {
      const { interruptOnIntervention = false, waitAll = false } = options;

      let resolvedNames = names;
      if (names.length === 1 && names[0] === '*') {
        resolvedNames = [];
        for (const [n, w] of workers) {
          if (w.alive) resolvedNames.push(n);
        }
        if (resolvedNames.length === 0) {
          return { error: 'No active workers' };
        }
      }

      const entries = [];
      for (const name of resolvedNames) {
        const w = workers.get(name);
        if (!w) return { error: `Worker '${name}' not found` };
        entries.push({ name, worker: w });
      }

      if (waitAll) {
        const startTimeAll = Date.now();
        const describe = ({ name, worker }) => {
          const intervention = worker._interventionState || null;
          let status;
          let settled;
          if (!worker.alive) {
            status = 'exited';
            settled = true;
          } else if (intervention) {
            status = 'intervention';
            settled = true;
          } else if (Date.now() - worker.lastDataTime >= idleThresholdMs) {
            status = 'idle';
            settled = true;
          } else {
            status = 'busy';
            settled = false;
          }
          return {
            settled,
            result: {
              name,
              status,
              intervention,
              content: _getScreenText(worker.screen)
            }
          };
        };
        return new Promise((resolve) => {
          const check = () => {
            const snapshot = entries.map(describe);
            const allSettled = snapshot.every(s => s.settled);
            const timedOut = Date.now() - startTimeAll > timeoutMs;
            if (allSettled || timedOut) {
              resolve({
                status: timedOut && !allSettled ? 'timeout' : 'all-settled',
                results: snapshot.map(s => s.result)
              });
              return;
            }
            setTimeout(check, 100);
          };
          check();
        });
      }

      const startTime = Date.now();
      return new Promise((resolve) => {
        const check = () => {
          if (Date.now() - startTime > timeoutMs) {
            resolve({
              status: 'timeout',
              results: entries.map(({ name, worker }) => {
                const idleMs = Date.now() - worker.lastDataTime;
                return {
                  name,
                  status: !worker.alive ? 'exited' :
                    (idleMs >= idleThresholdMs ? 'idle' : 'busy'),
                  intervention: worker._interventionState || null
                };
              })
            });
            return;
          }

          for (const { name, worker } of entries) {
            if (!worker.alive) {
              resolve({ name, status: 'exited', content: _getScreenText(worker.screen) });
              return;
            }
            const idleMs = Date.now() - worker.lastDataTime;
            if (idleMs >= idleThresholdMs) {
              resolve({ name, status: 'idle', content: _getScreenText(worker.screen) });
              return;
            }
            if (interruptOnIntervention && worker._interventionState) {
              resolve({
                name,
                status: 'intervention',
                intervention: worker._interventionState,
                content: _getScreenText(worker.screen)
              });
              return;
            }
          }

          setTimeout(check, 100);
        };
        check();
      });
    }
  };
}

// --- waitAndRead with interruptOnIntervention ---

describe('waitAndRead with interruptOnIntervention', () => {
  it('returns idle normally when no intervention', async () => {
    const mgr = createMockManager({
      w1: { lastDataTime: Date.now() - 5000 }
    });
    const result = await mgr.waitAndRead('w1', 5000, { interruptOnIntervention: true });
    assert.strictEqual(result.status, 'idle');
    assert.ok(result.content.includes('w1'));
  });

  it('returns intervention status when intervention detected', async () => {
    const mgr = createMockManager({
      w1: { lastDataTime: Date.now(), _interventionState: 'question' }
    });
    const result = await mgr.waitAndRead('w1', 5000, { interruptOnIntervention: true });
    assert.strictEqual(result.status, 'intervention');
    assert.strictEqual(result.intervention, 'question');
  });

  it('ignores intervention when interruptOnIntervention is false', async () => {
    const mgr = createMockManager({
      w1: { lastDataTime: Date.now() - 5000, _interventionState: 'question' }
    });
    const result = await mgr.waitAndRead('w1', 5000, { interruptOnIntervention: false });
    assert.strictEqual(result.status, 'idle');
    assert.strictEqual(result.intervention, undefined);
  });

  it('returns exited when worker dies (even with intervention flag)', async () => {
    const mgr = createMockManager({
      w1: { alive: false, _interventionState: 'escalation' }
    });
    const result = await mgr.waitAndRead('w1', 5000, { interruptOnIntervention: true });
    assert.strictEqual(result.status, 'exited');
  });

  it('returns error for unknown worker', async () => {
    const mgr = createMockManager({});
    const result = await mgr.waitAndRead('unknown', 5000);
    assert.ok(result.error);
    assert.ok(result.error.includes('not found'));
  });
});

// --- waitAndReadMulti ---

describe('waitAndReadMulti', () => {
  it('returns first idle worker', async () => {
    const mgr = createMockManager({
      w1: { lastDataTime: Date.now() },          // busy
      w2: { lastDataTime: Date.now() - 5000 },   // idle
      w3: { lastDataTime: Date.now() }            // busy
    });
    const result = await mgr.waitAndReadMulti(['w1', 'w2', 'w3'], 5000);
    assert.strictEqual(result.name, 'w2');
    assert.strictEqual(result.status, 'idle');
    assert.ok(result.content);
  });

  it('returns first exited worker', async () => {
    const mgr = createMockManager({
      w1: { lastDataTime: Date.now() },  // busy
      w2: { alive: false }               // exited
    });
    const result = await mgr.waitAndReadMulti(['w1', 'w2'], 5000);
    assert.strictEqual(result.name, 'w2');
    assert.strictEqual(result.status, 'exited');
  });

  it('returns intervention when interruptOnIntervention is true', async () => {
    const mgr = createMockManager({
      w1: { lastDataTime: Date.now() },
      w2: { lastDataTime: Date.now(), _interventionState: 'escalation' }
    });
    const result = await mgr.waitAndReadMulti(['w1', 'w2'], 5000, { interruptOnIntervention: true });
    assert.strictEqual(result.name, 'w2');
    assert.strictEqual(result.status, 'intervention');
    assert.strictEqual(result.intervention, 'escalation');
  });

  it('ignores intervention when interruptOnIntervention is false', async () => {
    const mgr = createMockManager({
      w1: { lastDataTime: Date.now() - 5000 },  // idle
      w2: { lastDataTime: Date.now(), _interventionState: 'question' }
    });
    const result = await mgr.waitAndReadMulti(['w1', 'w2'], 5000, { interruptOnIntervention: false });
    assert.strictEqual(result.name, 'w1');
    assert.strictEqual(result.status, 'idle');
  });

  it('resolves * to all active workers', async () => {
    const mgr = createMockManager({
      w1: { lastDataTime: Date.now() - 5000 },  // idle
      w2: { lastDataTime: Date.now() },          // busy
      w3: { alive: false }                       // exited (excluded from *)
    });
    const result = await mgr.waitAndReadMulti(['*'], 5000);
    assert.strictEqual(result.name, 'w1');
    assert.strictEqual(result.status, 'idle');
  });

  it('returns error when * has no active workers', async () => {
    const mgr = createMockManager({
      w1: { alive: false },
      w2: { alive: false }
    });
    const result = await mgr.waitAndReadMulti(['*'], 5000);
    assert.ok(result.error);
    assert.ok(result.error.includes('No active'));
  });

  it('returns error for unknown worker name', async () => {
    const mgr = createMockManager({ w1: {} });
    const result = await mgr.waitAndReadMulti(['w1', 'unknown'], 5000);
    assert.ok(result.error);
    assert.ok(result.error.includes('not found'));
  });

  it('returns timeout with per-worker status when all busy', async () => {
    const now = Date.now();
    const mgr = createMockManager({
      w1: { lastDataTime: now },
      w2: { lastDataTime: now }
    });
    // Force both workers to keep being busy by updating lastDataTime
    const keepBusy = setInterval(() => {
      for (const [, w] of mgr.workers) {
        w.lastDataTime = Date.now();
      }
    }, 50);

    const result = await mgr.waitAndReadMulti(['w1', 'w2'], 300);
    clearInterval(keepBusy);

    assert.strictEqual(result.status, 'timeout');
    assert.ok(Array.isArray(result.results));
    assert.strictEqual(result.results.length, 2);
    assert.strictEqual(result.results[0].name, 'w1');
    assert.strictEqual(result.results[1].name, 'w2');
  });
});

// --- waitAndReadMulti with waitAll (7.21) ---

describe('waitAndReadMulti with waitAll', () => {
  it('returns immediately when every worker is already idle', async () => {
    const past = Date.now() - 5000;
    const mgr = createMockManager({
      w1: { lastDataTime: past },
      w2: { lastDataTime: past },
      w3: { lastDataTime: past }
    });
    const started = Date.now();
    const result = await mgr.waitAndReadMulti(['*'], 5000, { waitAll: true });
    const elapsed = Date.now() - started;

    assert.strictEqual(result.status, 'all-settled');
    assert.ok(elapsed < 500, `expected fast return, took ${elapsed}ms`);
    assert.ok(Array.isArray(result.results));
    assert.strictEqual(result.results.length, 3);
    for (const r of result.results) {
      assert.strictEqual(r.status, 'idle');
      assert.strictEqual(r.intervention, null);
    }
  });

  it('surfaces idle and intervention workers together without hanging', async () => {
    const mgr = createMockManager({
      w1: { lastDataTime: Date.now() - 5000 },
      w2: { lastDataTime: Date.now(), _interventionState: 'question' }
    });
    const started = Date.now();
    const result = await mgr.waitAndReadMulti(['w1', 'w2'], 5000, { waitAll: true });
    const elapsed = Date.now() - started;

    assert.strictEqual(result.status, 'all-settled');
    assert.ok(elapsed < 500, `expected fast return, took ${elapsed}ms`);
    const byName = Object.fromEntries(result.results.map(r => [r.name, r]));
    assert.strictEqual(byName.w1.status, 'idle');
    assert.strictEqual(byName.w1.intervention, null);
    assert.strictEqual(byName.w2.status, 'intervention');
    assert.strictEqual(byName.w2.intervention, 'question');
  });

  it('resolves instead of hanging when every worker is in intervention', async () => {
    const mgr = createMockManager({
      w1: { lastDataTime: Date.now(), _interventionState: 'question' },
      w2: { lastDataTime: Date.now(), _interventionState: 'escalation' }
    });
    const started = Date.now();
    const result = await mgr.waitAndReadMulti(['w1', 'w2'], 5000, { waitAll: true });
    const elapsed = Date.now() - started;

    assert.strictEqual(result.status, 'all-settled');
    assert.ok(elapsed < 500, `expected fast return, took ${elapsed}ms`);
    assert.strictEqual(result.results.length, 2);
    assert.ok(result.results.every(r => r.status === 'intervention'));
    const interventions = result.results.map(r => r.intervention).sort();
    assert.deepStrictEqual(interventions, ['escalation', 'question']);
  });

  it('returns timeout when some workers remain busy', async () => {
    const mgr = createMockManager({
      w1: { lastDataTime: Date.now() - 5000 },
      w2: { lastDataTime: Date.now() }
    });
    const keepBusy = setInterval(() => {
      const w = mgr.workers.get('w2');
      if (w) w.lastDataTime = Date.now();
    }, 30);
    const result = await mgr.waitAndReadMulti(['w1', 'w2'], 300, { waitAll: true });
    clearInterval(keepBusy);

    assert.strictEqual(result.status, 'timeout');
    assert.strictEqual(result.results.length, 2);
    const byName = Object.fromEntries(result.results.map(r => [r.name, r]));
    assert.strictEqual(byName.w1.status, 'idle');
    assert.strictEqual(byName.w2.status, 'busy');
  });
});
