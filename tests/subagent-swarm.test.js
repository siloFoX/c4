const assert = require('assert');
const { describe, it } = require('node:test');
const { EventEmitter } = require('events');

describe('Subagent Swarm (3.17)', () => {
  function createMockManager(config = {}) {
    const mgr = new EventEmitter();
    mgr.workers = new Map();
    mgr.config = {
      swarm: { enabled: true, maxSubagents: 5, trackUsage: true },
      ...config
    };
    mgr._hookEvents = new Map();
    mgr._sseClients = new Set();

    mgr._emitSSE = function(type, data) {
      const event = { type, ...data, timestamp: Date.now() };
      this.emit('sse', event);
    };

    mgr._getSwarmConfig = function() {
      return this.config.swarm || { enabled: false, maxSubagents: 10, trackUsage: true };
    };

    mgr._trackSubagent = function(workerName, worker, toolInput, event) {
      const swarmCfg = this._getSwarmConfig();
      if (!swarmCfg.enabled) return;
      if (!worker._subagentLog) worker._subagentLog = [];
      const entry = {
        index: (worker._subagentCount || 0),
        prompt: (toolInput.prompt || '').slice(0, 300),
        subagentType: toolInput.subagent_type || 'general-purpose',
        timestamp: Date.now(),
        status: 'spawned'
      };
      worker._subagentLog.push(entry);
      if (worker._subagentLog.length > 100) worker._subagentLog.splice(0, worker._subagentLog.length - 100);
      const maxSubagents = swarmCfg.maxSubagents || 10;
      if ((worker._subagentCount || 0) > maxSubagents) {
        worker.snapshots.push({
          time: Date.now(),
          screen: `[SWARM WARN] subagent limit reached (${worker._subagentCount}/${maxSubagents})`,
          autoAction: true,
          swarmWarn: true
        });
        this._emitSSE('swarm_limit', { worker: workerName, count: worker._subagentCount, max: maxSubagents });
      }
    };

    mgr.getSwarmStatus = function(workerName) {
      const w = this.workers.get(workerName);
      if (!w) return { error: `Worker '${workerName}' not found` };
      const swarmCfg = this._getSwarmConfig();
      return {
        worker: workerName,
        enabled: swarmCfg.enabled !== false,
        maxSubagents: swarmCfg.maxSubagents || 10,
        subagentCount: w._subagentCount || 0,
        subagentLog: (w._subagentLog || []).slice(-20)
      };
    };

    return mgr;
  }

  function addWorker(mgr, name) {
    const worker = {
      alive: true,
      snapshots: [],
      _subagentCount: 0,
      _subagentLog: []
    };
    mgr.workers.set(name, worker);
    return worker;
  }

  // --- _trackSubagent ---

  it('logs subagent spawn in worker log', () => {
    const mgr = createMockManager();
    const w = addWorker(mgr, 'w1');
    w._subagentCount = 1;
    mgr._trackSubagent('w1', w, { prompt: 'Fix tests', subagent_type: 'general-purpose' }, {});
    assert.strictEqual(w._subagentLog.length, 1);
    assert.strictEqual(w._subagentLog[0].subagentType, 'general-purpose');
    assert.ok(w._subagentLog[0].prompt.includes('Fix tests'));
  });

  it('warns when subagent limit exceeded', () => {
    const mgr = createMockManager({ swarm: { enabled: true, maxSubagents: 2 } });
    const w = addWorker(mgr, 'w1');
    w._subagentCount = 3;
    mgr._trackSubagent('w1', w, { prompt: 'Over limit' }, {});
    const warn = w.snapshots.find(s => s.swarmWarn);
    assert.ok(warn);
    assert.ok(warn.screen.includes('SWARM WARN'));
  });

  it('emits swarm_limit SSE event on limit exceeded', (t, done) => {
    const mgr = createMockManager({ swarm: { enabled: true, maxSubagents: 1 } });
    const w = addWorker(mgr, 'w1');
    w._subagentCount = 2;
    mgr.on('sse', (event) => {
      if (event.type === 'swarm_limit') {
        assert.strictEqual(event.worker, 'w1');
        assert.strictEqual(event.max, 1);
        done();
      }
    });
    mgr._trackSubagent('w1', w, { prompt: 'test' }, {});
  });

  it('does not track when swarm disabled', () => {
    const mgr = createMockManager({ swarm: { enabled: false } });
    const w = addWorker(mgr, 'w1');
    w._subagentCount = 1;
    mgr._trackSubagent('w1', w, { prompt: 'test' }, {});
    assert.strictEqual(w._subagentLog.length, 0);
  });

  it('keeps log bounded at 100 entries', () => {
    const mgr = createMockManager();
    const w = addWorker(mgr, 'w1');
    for (let i = 0; i < 110; i++) {
      w._subagentCount = i + 1;
      mgr._trackSubagent('w1', w, { prompt: `task ${i}` }, {});
    }
    assert.ok(w._subagentLog.length <= 100);
  });

  it('records subagent_type in log entry', () => {
    const mgr = createMockManager();
    const w = addWorker(mgr, 'w1');
    w._subagentCount = 1;
    mgr._trackSubagent('w1', w, { prompt: 'explore', subagent_type: 'Explore' }, {});
    assert.strictEqual(w._subagentLog[0].subagentType, 'Explore');
  });

  it('defaults subagent_type to general-purpose', () => {
    const mgr = createMockManager();
    const w = addWorker(mgr, 'w1');
    w._subagentCount = 1;
    mgr._trackSubagent('w1', w, { prompt: 'hello' }, {});
    assert.strictEqual(w._subagentLog[0].subagentType, 'general-purpose');
  });

  // --- getSwarmStatus ---

  it('returns error for unknown worker', () => {
    const mgr = createMockManager();
    const result = mgr.getSwarmStatus('nonexistent');
    assert.ok(result.error);
  });

  it('returns swarm status for known worker', () => {
    const mgr = createMockManager();
    const w = addWorker(mgr, 'w1');
    w._subagentCount = 3;
    w._subagentLog = [
      { index: 1, prompt: 'A', subagentType: 'general-purpose', timestamp: Date.now(), status: 'spawned' },
      { index: 2, prompt: 'B', subagentType: 'Explore', timestamp: Date.now(), status: 'spawned' },
      { index: 3, prompt: 'C', subagentType: 'Plan', timestamp: Date.now(), status: 'spawned' }
    ];
    const status = mgr.getSwarmStatus('w1');
    assert.strictEqual(status.subagentCount, 3);
    assert.strictEqual(status.subagentLog.length, 3);
    assert.strictEqual(status.enabled, true);
    assert.strictEqual(status.maxSubagents, 5);
  });

  it('returns max 20 log entries in status', () => {
    const mgr = createMockManager();
    const w = addWorker(mgr, 'w1');
    w._subagentLog = [];
    for (let i = 0; i < 30; i++) {
      w._subagentLog.push({ index: i, prompt: `task ${i}`, subagentType: 'gp', timestamp: Date.now(), status: 'spawned' });
    }
    const status = mgr.getSwarmStatus('w1');
    assert.strictEqual(status.subagentLog.length, 20);
  });
});
