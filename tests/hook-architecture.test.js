const assert = require('assert');
const { describe, it } = require('node:test');
const { EventEmitter } = require('events');

// Mock ScopeGuard for testing
class MockScopeGuard {
  constructor(opts = {}) {
    this._restrictions = opts.restrictions || false;
    this._denyBash = opts.denyBash || [];
    this._denyFiles = opts.denyFiles || [];
  }
  hasRestrictions() { return this._restrictions; }
  checkBash(command) {
    const cmd = command.split(/\s+/)[0];
    if (this._denyBash.includes(cmd)) {
      return { allowed: false, reason: `Bash command '${cmd}' denied by scope` };
    }
    return { allowed: true };
  }
  checkFile(filePath) {
    for (const pattern of this._denyFiles) {
      if (filePath.includes(pattern)) {
        return { allowed: false, reason: `File '${filePath}' denied by scope` };
      }
    }
    return { allowed: true };
  }
}

describe('Hook Architecture (3.15)', () => {
  function createMockManager(config = {}) {
    const mgr = new EventEmitter();
    mgr.workers = new Map();
    mgr.config = config;
    mgr._hookEvents = new Map();
    mgr._sseClients = new Set();

    mgr._emitSSE = function(type, data) {
      const event = { type, ...data, timestamp: Date.now() };
      this.emit('sse', event);
    };

    mgr._getInterventionConfig = function() {
      return this.config.intervention || {};
    };

    // Inline hook methods (avoid requiring PtyManager which needs node-pty)
    mgr.hookEvent = function(workerName, event) {
      const w = this.workers.get(workerName);
      if (!w) return { error: `Worker '${workerName}' not found` };
      if (!this._hookEvents.has(workerName)) this._hookEvents.set(workerName, []);
      const events = this._hookEvents.get(workerName);
      const hookEntry = { ...event, receivedAt: Date.now() };
      events.push(hookEntry);
      if (events.length > 500) events.splice(0, events.length - 500);
      this._emitSSE('hook', { worker: workerName, event: hookEntry });
      const hookType = event.hook_type;
      const toolName = event.tool_name || '';
      const toolInput = event.tool_input || {};
      if (hookType === 'PreToolUse') return this._handlePreToolUse(workerName, w, toolName, toolInput, event);
      if (hookType === 'PostToolUse') return this._handlePostToolUse(workerName, w, toolName, toolInput, event);
      return { received: true, worker: workerName };
    };

    mgr._handlePreToolUse = function(workerName, worker, toolName, toolInput, event) {
      const result = { received: true, worker: workerName, hook_type: 'PreToolUse' };
      if (worker.scopeGuard && worker.scopeGuard.hasRestrictions()) {
        if (toolName === 'Bash' || toolName === 'bash') {
          const command = toolInput.command || '';
          const scopeResult = worker.scopeGuard.checkBash(command);
          if (scopeResult && !scopeResult.allowed) {
            worker.snapshots.push({ time: Date.now(), screen: `[HOOK SCOPE DENY] Bash: ${command}\n  reason: ${scopeResult.reason}`, autoAction: true, scopeViolation: true, hookEvent: true });
            this._emitSSE('scope_deny', { worker: workerName, tool: toolName, command, reason: scopeResult.reason });
            result.action = 'deny'; result.reason = scopeResult.reason;
            return result;
          }
        } else if (toolName === 'Write' || toolName === 'Edit') {
          const filePath = toolInput.file_path || toolInput.path || '';
          if (filePath) {
            const scopeResult = worker.scopeGuard.checkFile(filePath);
            if (scopeResult && !scopeResult.allowed) {
              worker.snapshots.push({ time: Date.now(), screen: `[HOOK SCOPE DENY] ${toolName}: ${filePath}\n  reason: ${scopeResult.reason}`, autoAction: true, scopeViolation: true, hookEvent: true });
              this._emitSSE('scope_deny', { worker: workerName, tool: toolName, file: filePath, reason: scopeResult.reason });
              result.action = 'deny'; result.reason = scopeResult.reason;
              return result;
            }
          }
        }
      }
      if (['Bash', 'bash', 'Write', 'Edit', 'NotebookEdit'].includes(toolName)) {
        const detail = toolName === 'Bash' || toolName === 'bash' ? (toolInput.command || '').slice(0, 200) : (toolInput.file_path || toolInput.path || '');
        this._emitSSE('permission', { worker: workerName, promptType: toolName.toLowerCase(), detail, source: 'hook' });
      }
      return result;
    };

    mgr._handlePostToolUse = function(workerName, worker, toolName, toolInput, event) {
      const result = { received: true, worker: workerName, hook_type: 'PostToolUse' };
      const toolError = event.tool_error || '';
      if (toolName === 'Bash' || toolName === 'bash') {
        const command = toolInput.command || '';
        if (/npm test|pytest|jest|mocha/.test(command)) {
          if (!worker._routineState) worker._routineState = { tested: false, docsUpdated: false };
          worker._routineState.tested = true;
        }
        if (/git commit/.test(command)) worker._routineState = { tested: false, docsUpdated: false };
      }
      if ((toolName === 'Write' || toolName === 'Edit') && /TODO\.md|CHANGELOG\.md|README\.md/.test(toolInput.file_path || toolInput.path || '')) {
        if (!worker._routineState) worker._routineState = { tested: false, docsUpdated: false };
        worker._routineState.docsUpdated = true;
      }
      if (toolError) {
        const maxRetries = (this._getInterventionConfig().escalation?.maxRetries) ?? 3;
        if (!worker._errorHistory) worker._errorHistory = [];
        const errLine = toolError.slice(0, 200);
        const existing = worker._errorHistory.find(e => e.line === errLine);
        if (existing) {
          existing.count++;
          if (existing.count >= maxRetries) {
            worker._interventionState = 'escalation';
            worker.snapshots.push({ time: Date.now(), screen: `[HOOK ESCALATION] repeated error (${existing.count}x): ${errLine}`, autoAction: true, intervention: 'escalation', hookEvent: true });
            this._emitSSE('error', { worker: workerName, line: errLine, count: existing.count, escalation: true, source: 'hook' });
            existing.count = 0;
          }
        } else {
          worker._errorHistory.push({ line: errLine, count: 1, firstSeen: Date.now() });
        }
      }
      if (toolName === 'Agent') {
        if (!worker._subagentCount) worker._subagentCount = 0;
        worker._subagentCount++;
        worker.snapshots.push({ time: Date.now(), screen: `[HOOK SUBAGENT] Agent spawned (#${worker._subagentCount}): ${(toolInput.prompt || '').slice(0, 100)}`, autoAction: true, hookEvent: true });
        this._emitSSE('subagent', { worker: workerName, count: worker._subagentCount, prompt: (toolInput.prompt || '').slice(0, 200) });
      }
      return result;
    };

    mgr.getHookEvents = function(workerName, limit = 50) {
      const events = this._hookEvents.get(workerName) || [];
      return { worker: workerName, events: events.slice(-limit), total: events.length };
    };

    mgr._buildHookCommands = function(workerName) {
      const port = this.config.daemon?.port || 3456;
      const host = this.config.daemon?.host || '127.0.0.1';
      const baseUrl = `http://${host}:${port}`;
      const curlCmd = process.platform === 'win32'
        ? `powershell -NoProfile -Command "$input = [Console]::In.ReadToEnd(); Invoke-RestMethod -Uri '${baseUrl}/hook-event' -Method Post -ContentType 'application/json' -Body $input"`
        : `curl -s -X POST -H 'Content-Type: application/json' -d @- '${baseUrl}/hook-event'`;
      return {
        PreToolUse: [{ hooks: [{ type: 'command', command: curlCmd }] }],
        PostToolUse: [{ hooks: [{ type: 'command', command: curlCmd }] }]
      };
    };

    return mgr;
  }

  function addWorker(mgr, name, opts = {}) {
    const worker = {
      alive: true,
      snapshots: [],
      _routineState: { tested: false, docsUpdated: false },
      _errorHistory: [],
      _interventionState: null,
      scopeGuard: opts.scopeGuard || null,
      _subagentCount: 0
    };
    mgr.workers.set(name, worker);
    return worker;
  }

  // --- hookEvent basic ---

  it('returns error for unknown worker', () => {
    const mgr = createMockManager();
    const result = mgr.hookEvent('nonexistent', { hook_type: 'PreToolUse', tool_name: 'Bash' });
    assert.ok(result.error);
  });

  it('stores hook events in buffer', () => {
    const mgr = createMockManager();
    addWorker(mgr, 'w1');
    mgr.hookEvent('w1', { hook_type: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } });
    mgr.hookEvent('w1', { hook_type: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } });
    const events = mgr.getHookEvents('w1');
    assert.strictEqual(events.total, 2);
    assert.strictEqual(events.events.length, 2);
  });

  it('limits buffer to 500 events', () => {
    const mgr = createMockManager();
    addWorker(mgr, 'w1');
    for (let i = 0; i < 510; i++) {
      mgr.hookEvent('w1', { hook_type: 'PreToolUse', tool_name: 'Read', tool_input: {} });
    }
    const events = mgr.getHookEvents('w1');
    assert.strictEqual(events.total, 500);
  });

  it('getHookEvents respects limit parameter', () => {
    const mgr = createMockManager();
    addWorker(mgr, 'w1');
    for (let i = 0; i < 10; i++) {
      mgr.hookEvent('w1', { hook_type: 'PostToolUse', tool_name: 'Read', tool_input: {} });
    }
    const events = mgr.getHookEvents('w1', 3);
    assert.strictEqual(events.events.length, 3);
  });

  // --- PreToolUse: scope checks ---

  it('denies Bash command outside scope', () => {
    const mgr = createMockManager();
    const guard = new MockScopeGuard({ restrictions: true, denyBash: ['rm'] });
    addWorker(mgr, 'w1', { scopeGuard: guard });
    const result = mgr.hookEvent('w1', {
      hook_type: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /tmp/x' }
    });
    assert.strictEqual(result.action, 'deny');
    assert.ok(result.reason);
  });

  it('allows Bash command within scope', () => {
    const mgr = createMockManager();
    const guard = new MockScopeGuard({ restrictions: true, denyBash: ['rm'] });
    addWorker(mgr, 'w1', { scopeGuard: guard });
    const result = mgr.hookEvent('w1', {
      hook_type: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' }
    });
    assert.ok(!result.action || result.action !== 'deny');
  });

  it('denies file Write outside scope', () => {
    const mgr = createMockManager();
    const guard = new MockScopeGuard({ restrictions: true, denyFiles: ['secret'] });
    addWorker(mgr, 'w1', { scopeGuard: guard });
    const result = mgr.hookEvent('w1', {
      hook_type: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: '/home/secret.txt' }
    });
    assert.strictEqual(result.action, 'deny');
  });

  it('denies file Edit outside scope', () => {
    const mgr = createMockManager();
    const guard = new MockScopeGuard({ restrictions: true, denyFiles: ['.env'] });
    addWorker(mgr, 'w1', { scopeGuard: guard });
    const result = mgr.hookEvent('w1', {
      hook_type: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '/app/.env' }
    });
    assert.strictEqual(result.action, 'deny');
  });

  it('adds scope deny snapshot on PreToolUse deny', () => {
    const mgr = createMockManager();
    const guard = new MockScopeGuard({ restrictions: true, denyBash: ['docker'] });
    const w = addWorker(mgr, 'w1', { scopeGuard: guard });
    mgr.hookEvent('w1', {
      hook_type: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'docker build .' }
    });
    const snap = w.snapshots.find(s => s.hookEvent && s.scopeViolation);
    assert.ok(snap);
    assert.ok(snap.screen.includes('HOOK SCOPE DENY'));
  });

  // --- PreToolUse: SSE events ---

  it('emits permission SSE on Bash PreToolUse', (t, done) => {
    const mgr = createMockManager();
    addWorker(mgr, 'w1');
    mgr.on('sse', (event) => {
      if (event.type === 'permission') {
        assert.strictEqual(event.source, 'hook');
        assert.strictEqual(event.promptType, 'bash');
        done();
      }
    });
    mgr.hookEvent('w1', {
      hook_type: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' }
    });
  });

  // --- PostToolUse: routine tracking ---

  it('marks test as run on npm test PostToolUse', () => {
    const mgr = createMockManager();
    const w = addWorker(mgr, 'w1');
    mgr.hookEvent('w1', {
      hook_type: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' }
    });
    assert.strictEqual(w._routineState.tested, true);
  });

  it('marks docs updated on Edit TODO.md', () => {
    const mgr = createMockManager();
    const w = addWorker(mgr, 'w1');
    mgr.hookEvent('w1', {
      hook_type: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '/project/TODO.md' }
    });
    assert.strictEqual(w._routineState.docsUpdated, true);
  });

  it('resets routine state on git commit', () => {
    const mgr = createMockManager();
    const w = addWorker(mgr, 'w1');
    w._routineState.tested = true;
    w._routineState.docsUpdated = true;
    mgr.hookEvent('w1', {
      hook_type: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "feat: add X"' }
    });
    assert.strictEqual(w._routineState.tested, false);
    assert.strictEqual(w._routineState.docsUpdated, false);
  });

  // --- PostToolUse: error escalation ---

  it('escalates repeated errors from hook events', () => {
    const mgr = createMockManager({ intervention: { escalation: { maxRetries: 2 } } });
    const w = addWorker(mgr, 'w1');
    const event = {
      hook_type: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
      tool_error: 'Error: test failed'
    };
    mgr.hookEvent('w1', event);
    mgr.hookEvent('w1', event);
    assert.strictEqual(w._interventionState, 'escalation');
    const snap = w.snapshots.find(s => s.intervention === 'escalation' && s.hookEvent);
    assert.ok(snap);
  });

  // --- PostToolUse: Agent (subagent) tracking ---

  it('tracks Agent tool usage (subagent spawn)', () => {
    const mgr = createMockManager();
    const w = addWorker(mgr, 'w1');
    mgr.hookEvent('w1', {
      hook_type: 'PostToolUse',
      tool_name: 'Agent',
      tool_input: { prompt: 'Fix the test' }
    });
    assert.strictEqual(w._subagentCount, 1);
    const snap = w.snapshots.find(s => s.hookEvent && s.screen.includes('SUBAGENT'));
    assert.ok(snap);
  });

  // --- _buildHookCommands ---

  it('builds hook commands with correct daemon URL', () => {
    const mgr = createMockManager({ daemon: { port: 4567, host: '0.0.0.0' } });
    const hooks = mgr._buildHookCommands('w1');
    assert.ok(hooks.PreToolUse);
    assert.ok(hooks.PostToolUse);
    assert.strictEqual(hooks.PreToolUse.length, 1);
    assert.strictEqual(hooks.PostToolUse.length, 1);
    const cmd = hooks.PreToolUse[0].hooks[0].command;
    assert.ok(cmd.includes('4567'));
  });

  it('getHookEvents returns empty for unknown worker', () => {
    const mgr = createMockManager();
    const events = mgr.getHookEvents('unknown');
    assert.strictEqual(events.total, 0);
    assert.deepStrictEqual(events.events, []);
  });

  // --- SSE emission on hook events ---

  it('emits hook SSE event for every hook event', (t, done) => {
    const mgr = createMockManager();
    addWorker(mgr, 'w1');
    mgr.on('sse', (event) => {
      if (event.type === 'hook') {
        assert.strictEqual(event.worker, 'w1');
        done();
      }
    });
    mgr.hookEvent('w1', { hook_type: 'PostToolUse', tool_name: 'Read', tool_input: {} });
  });
});
