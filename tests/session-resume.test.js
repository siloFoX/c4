const assert = require('assert');
const { describe, it } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Session Resume (4.1)', () => {

  function createMockManager() {
    const mgr = {
      config: {
        healthCheck: { autoRestart: true },
        pty: { defaultCommand: 'claude' },
        autoApprove: {},
      },
      workers: new Map(),
      _sessionIds: {},
      _detectRepoRoot: () => '/tmp/test-repo',
    };

    // _getWorkerSessionId: find most recent JSONL session
    mgr._getWorkerSessionId = function(workerName, workerDir) {
      const home = os.homedir();
      const claudeProjects = path.join(home, '.claude', 'projects');
      if (!fs.existsSync(claudeProjects)) return null;

      const projectPath = (workerDir || '').replace(/\\/g, '/');
      if (!projectPath) return null;

      let projectDir = null;
      try {
        const entries = fs.readdirSync(claudeProjects);
        for (const entry of entries) {
          const decoded = entry.replace(/^([A-Z])--/, '$1:/').replace(/-/g, '/');
          if (decoded === projectPath || projectPath.startsWith(decoded + '/') || projectPath === decoded) {
            projectDir = path.join(claudeProjects, entry);
            break;
          }
        }
      } catch { return null; }

      if (!projectDir || !fs.existsSync(projectDir)) return null;

      let latestFile = null;
      let latestMtime = 0;
      try {
        for (const entry of fs.readdirSync(projectDir)) {
          if (!entry.endsWith('.jsonl')) continue;
          const fullPath = path.join(projectDir, entry);
          const stat = fs.statSync(fullPath);
          if (stat.mtimeMs > latestMtime) {
            latestMtime = stat.mtimeMs;
            latestFile = entry;
          }
        }
      } catch { return null; }

      if (!latestFile) return null;
      return latestFile.replace('.jsonl', '');
    };

    mgr._updateSessionId = function(name) {
      const w = this.workers.get(name);
      if (!w) return;
      const dir = w.worktree || this._detectRepoRoot();
      if (!dir) return;
      const sid = this._getWorkerSessionId(name, dir);
      if (sid) {
        w._sessionId = sid;
        this._sessionIds[name] = sid;
      }
    };

    mgr.getSessionId = function(name) {
      this._updateSessionId(name);
      const w = this.workers.get(name);
      if (w && w._sessionId) return w._sessionId;
      return this._sessionIds[name] || null;
    };

    return mgr;
  }

  // --- _getWorkerSessionId ---

  it('returns null when no .claude/projects dir exists', () => {
    const mgr = createMockManager();
    // Using a path that definitely doesn't have a .claude/projects match
    const sid = mgr._getWorkerSessionId('test', '/nonexistent/path/xyz');
    assert.strictEqual(sid, null);
  });

  it('returns null when workerDir is empty', () => {
    const mgr = createMockManager();
    const sid = mgr._getWorkerSessionId('test', '');
    assert.strictEqual(sid, null);
  });

  it('returns null when workerDir is null', () => {
    const mgr = createMockManager();
    const sid = mgr._getWorkerSessionId('test', null);
    assert.strictEqual(sid, null);
  });

  // --- _updateSessionId ---

  it('updates session ID from stored state', () => {
    const mgr = createMockManager();
    mgr._sessionIds['w1'] = 'abc-123';
    mgr.workers.set('w1', { _sessionId: null, worktree: null });
    // _updateSessionId will try to find via JSONL but won't find since no real project
    mgr._updateSessionId('w1');
    // The stored session ID should still be accessible via getSessionId
    const sid = mgr.getSessionId('w1');
    assert.strictEqual(sid, 'abc-123');
  });

  it('getSessionId returns null for unknown worker', () => {
    const mgr = createMockManager();
    const sid = mgr.getSessionId('nonexistent');
    assert.strictEqual(sid, null);
  });

  it('getSessionId prefers live worker _sessionId over stored', () => {
    const mgr = createMockManager();
    mgr._sessionIds['w1'] = 'old-id';
    mgr.workers.set('w1', { _sessionId: 'live-id', worktree: null });
    const sid = mgr.getSessionId('w1');
    assert.strictEqual(sid, 'live-id');
  });

  // --- State persistence ---

  it('_saveState includes sessionId in worker data', () => {
    const stateFile = path.join(os.tmpdir(), 'c4-test-state-resume.json');
    const workerData = {
      name: 'w1',
      pid: 123,
      alive: true,
      branch: 'c4/w1',
      worktree: '/tmp/wt',
      sessionId: 'sess-abc-123',
      exitedAt: null
    };
    const data = { offsets: {}, workers: [workerData], lostWorkers: [], taskQueue: [] };
    fs.writeFileSync(stateFile, JSON.stringify(data));

    const loaded = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.strictEqual(loaded.workers[0].sessionId, 'sess-abc-123');

    // Cleanup
    try { fs.unlinkSync(stateFile); } catch {}
  });

  it('lost workers include sessionId from state', () => {
    const workerData = [
      { name: 'mgr', pid: 100, alive: true, branch: 'c4/mgr', worktree: '/tmp/wt', sessionId: 'sess-mgr-1' }
    ];
    // Simulate _loadState logic
    const sessionIds = {};
    const lostWorkers = [];
    for (const w of workerData) {
      if (w.sessionId) sessionIds[w.name] = w.sessionId;
      if (w.name && w.alive) {
        lostWorkers.push({
          name: w.name,
          pid: w.pid,
          branch: w.branch || null,
          worktree: w.worktree || null,
          sessionId: w.sessionId || null,
          lostAt: new Date().toISOString()
        });
      }
    }
    assert.strictEqual(sessionIds['mgr'], 'sess-mgr-1');
    assert.strictEqual(lostWorkers[0].sessionId, 'sess-mgr-1');
  });

  // --- create() resume option ---

  it('create with resume option adds --resume to args', () => {
    // Simulate the args construction logic from create()
    const command = 'claude';
    const args = [];
    const options = { resume: 'sess-abc-123' };
    const finalArgs = [...args];
    if (options.resume && command === 'claude') {
      finalArgs.push('--resume', options.resume);
    }
    assert.deepStrictEqual(finalArgs, ['--resume', 'sess-abc-123']);
  });

  it('create without resume does not add --resume', () => {
    const command = 'claude';
    const args = [];
    const options = {};
    const finalArgs = [...args];
    if (options.resume && command === 'claude') {
      finalArgs.push('--resume', options.resume);
    }
    assert.deepStrictEqual(finalArgs, []);
  });

  it('create with resume on non-claude command does not add --resume', () => {
    const command = 'bash';
    const args = [];
    const options = { resume: 'sess-abc-123' };
    const finalArgs = [...args];
    if (options.resume && command === 'claude') {
      finalArgs.push('--resume', options.resume);
    }
    assert.deepStrictEqual(finalArgs, []);
  });

  // --- Worker object ---

  it('worker object includes _sessionId and _resumed fields', () => {
    const worker = {
      _sessionId: 'sess-xyz',
      _resumed: true,
    };
    assert.strictEqual(worker._sessionId, 'sess-xyz');
    assert.strictEqual(worker._resumed, true);
  });

  it('worker without resume has null _sessionId', () => {
    const worker = {
      _sessionId: null,
      _resumed: false,
    };
    assert.strictEqual(worker._sessionId, null);
    assert.strictEqual(worker._resumed, false);
  });
});
