const assert = require('assert');
const { describe, it } = require('node:test');
const fs = require('fs');
const path = require('path');

describe('Manager Handoff Summary (5.12)', () => {

  function createMockManager(configOverrides = {}) {
    const mgr = {
      config: {
        daemon: { port: 3456, host: '127.0.0.1' },
        managerRotation: { compactThreshold: 0 },
        ...configOverrides
      },
      workers: new Map(),
      _notifications: null,
      _sseClients: new Set(),
      projectRoot: null,
    };

    mgr._emitSSE = function() {};
    mgr.scribeScan = function() { return { scanned: 0 }; };
    mgr._updateSessionId = function() {};
    mgr._detectRepoRoot = function() { return '/tmp/c4-test'; };
    mgr.close = function(name) { this.workers.delete(name); return { success: true }; };
    mgr.sendTask = function(name, task, options) {
      this.workers.set(name, {
        alive: true, _taskText: task, _autoWorker: options?._autoWorker || false,
        snapshots: [], _compactCount: 0, branch: options?.branch || null,
        worktree: null, worktreeRepoRoot: null, lastDataTime: Date.now(),
      });
      return { success: true, name };
    };

    // Inline _injectDecisionSummary from pty-manager.js (5.12)
    mgr._injectDecisionSummary = function(workerName, worker) {
      try {
        const sessionContextPath = path.join(this.projectRoot || path.join(__dirname, '..'), 'docs', 'session-context.md');
        const recentSnapshots = (worker.snapshots || []).slice(-20);
        const summaryLines = [];

        if (worker._taskText) {
          summaryLines.push(`Task: ${worker._taskText.substring(0, 100)}`);
        }
        summaryLines.push(`Progress: ${worker._compactCount || 0} compactions, branch: ${worker.branch || 'unknown'}`);

        const interventions = recentSnapshots.filter(s => s.intervention);
        if (interventions.length > 0) {
          summaryLines.push(`Warnings: ${interventions.length} interventions detected`);
        }

        const activeCount = [...this.workers.values()].filter(w => w.alive).length;
        summaryLines.push(`Active workers: ${activeCount}`);

        const header = `<!-- Manager Handoff Summary (${new Date().toISOString()}) -->\n` +
          `## Manager Handoff\n` +
          summaryLines.map(l => `- ${l}`).join('\n') +
          `\n---\n\n`;

        let existing = '';
        if (fs.existsSync(sessionContextPath)) {
          existing = fs.readFileSync(sessionContextPath, 'utf8');
        }
        fs.writeFileSync(sessionContextPath, header + existing, 'utf8');
      } catch {} // Non-fatal
    };

    return mgr;
  }

  const tmpDir = path.join(__dirname, '..', '__test-tmp-handoff');
  const docsDir = path.join(tmpDir, 'docs');
  const sessionContextPath = path.join(docsDir, 'session-context.md');

  function setup() {
    fs.mkdirSync(docsDir, { recursive: true });
    if (fs.existsSync(sessionContextPath)) fs.unlinkSync(sessionContextPath);
  }
  function cleanup() {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }

  it('injects summary into session-context.md', () => {
    setup();
    try {
      const mgr = createMockManager();
      mgr.projectRoot = tmpDir;
      mgr.workers.set('mgr', {
        alive: true, snapshots: [], _compactCount: 3,
        _autoWorker: true, _taskText: 'Build feature X', branch: 'c4/mgr',
      });

      mgr._injectDecisionSummary('mgr', mgr.workers.get('mgr'));

      assert.ok(fs.existsSync(sessionContextPath), 'session-context.md should exist');
      const content = fs.readFileSync(sessionContextPath, 'utf8');
      assert.ok(content.includes('Manager Handoff Summary'));
      assert.ok(content.includes('Task: Build feature X'));
      assert.ok(content.includes('compactions'));
      assert.ok(content.includes('Active workers:'));
    } finally {
      cleanup();
    }
  });

  it('prepends to existing session-context.md', () => {
    setup();
    try {
      fs.writeFileSync(sessionContextPath, '# Existing Content\nSome old data\n', 'utf8');
      const mgr = createMockManager();
      mgr.projectRoot = tmpDir;
      mgr.workers.set('mgr', {
        alive: true, snapshots: [], _compactCount: 2,
        _autoWorker: true, _taskText: 'Task Y', branch: 'c4/mgr',
      });

      mgr._injectDecisionSummary('mgr', mgr.workers.get('mgr'));

      const content = fs.readFileSync(sessionContextPath, 'utf8');
      assert.ok(content.startsWith('<!-- Manager Handoff Summary'));
      assert.ok(content.includes('# Existing Content'));
      assert.ok(content.includes('Some old data'));
    } finally {
      cleanup();
    }
  });

  it('includes intervention warnings when present', () => {
    setup();
    try {
      const mgr = createMockManager();
      mgr.projectRoot = tmpDir;
      const worker = {
        alive: true, _compactCount: 1, _autoWorker: true,
        _taskText: 'Task Z', branch: 'c4/mgr',
        snapshots: [
          { time: Date.now(), intervention: true, screen: 'test' },
          { time: Date.now(), intervention: true, screen: 'test2' },
        ],
      };
      mgr.workers.set('mgr', worker);

      mgr._injectDecisionSummary('mgr', worker);

      const content = fs.readFileSync(sessionContextPath, 'utf8');
      assert.ok(content.includes('Warnings: 2 interventions detected'));
    } finally {
      cleanup();
    }
  });

  it('handles missing task text gracefully', () => {
    setup();
    try {
      const mgr = createMockManager();
      mgr.projectRoot = tmpDir;
      mgr.workers.set('mgr', {
        alive: true, snapshots: [], _compactCount: 1,
        _autoWorker: true, _taskText: null, branch: 'c4/mgr',
      });

      mgr._injectDecisionSummary('mgr', mgr.workers.get('mgr'));

      const content = fs.readFileSync(sessionContextPath, 'utf8');
      assert.ok(content.includes('Manager Handoff'));
      assert.ok(!content.includes('Task:'));
    } finally {
      cleanup();
    }
  });
});

describe('Hook Slack Routing on Deny (5.10)', () => {

  function createMockPreToolUse() {
    const messages = [];
    const flushed = [];
    const mgr = {
      _notifications: {
        pushAll: (msg) => messages.push(msg),
        _flushSlack: () => flushed.push(true),
      },
      _sseClients: new Set(),
    };
    mgr._emitSSE = function() {};

    // Inline _handlePreToolUse with 5.10 addition
    mgr._handlePreToolUse = function(workerName, worker, toolName, toolInput) {
      const result = { received: true, worker: workerName, hook_type: 'PreToolUse' };

      // Scope guard check
      if (worker.scopeGuard && worker.scopeGuard.hasRestrictions()) {
        if (toolName === 'Bash' || toolName === 'bash') {
          const command = toolInput.command || '';
          const scopeResult = worker.scopeGuard.checkBash(command);
          if (scopeResult && !scopeResult.allowed) {
            result.action = 'deny';
            result.reason = scopeResult.reason;
          }
        }
      }

      // Hook permission Slack routing (5.10)
      if (result.decision === 'block' || result.action === 'deny') {
        const toolDesc = `${toolName}: ${JSON.stringify(toolInput).substring(0, 100)}`;
        if (this._notifications) {
          this._notifications.pushAll(`[HOOK DENY] ${workerName}: ${toolDesc}`);
          this._notifications._flushSlack();
        }
      }

      return result;
    };

    return { mgr, messages, flushed };
  }

  it('sends Slack notification when tool is denied', () => {
    const { mgr, messages, flushed } = createMockPreToolUse();
    const worker = {
      scopeGuard: {
        hasRestrictions: () => true,
        checkBash: () => ({ allowed: false, reason: 'out of scope' }),
      },
    };

    const result = mgr._handlePreToolUse('w1', worker, 'Bash', { command: 'rm -rf /' });

    assert.strictEqual(result.action, 'deny');
    assert.strictEqual(messages.length, 1);
    assert.ok(messages[0].includes('[HOOK DENY]'));
    assert.ok(messages[0].includes('w1'));
    assert.ok(messages[0].includes('Bash'));
    assert.strictEqual(flushed.length, 1);
  });

  it('does not send Slack when tool is allowed', () => {
    const { mgr, messages } = createMockPreToolUse();
    const worker = {};

    const result = mgr._handlePreToolUse('w1', worker, 'Bash', { command: 'ls' });

    assert.strictEqual(result.received, true);
    assert.strictEqual(messages.length, 0);
  });

  it('handles missing _notifications gracefully', () => {
    const { mgr } = createMockPreToolUse();
    mgr._notifications = null;
    const worker = {
      scopeGuard: {
        hasRestrictions: () => true,
        checkBash: () => ({ allowed: false, reason: 'blocked' }),
      },
    };

    // Should not throw
    const result = mgr._handlePreToolUse('w1', worker, 'Bash', { command: 'danger' });
    assert.strictEqual(result.action, 'deny');
  });
});

describe('Custom Agent Definition (5.8)', () => {

  it('.claude/agents/manager.md exists', () => {
    const agentPath = path.join(__dirname, '..', '.claude', 'agents', 'manager.md');
    assert.ok(fs.existsSync(agentPath), 'manager.md should exist');
  });

  it('has correct frontmatter fields', () => {
    const agentPath = path.join(__dirname, '..', '.claude', 'agents', 'manager.md');
    const content = fs.readFileSync(agentPath, 'utf8');

    assert.ok(content.includes('name: C4 Manager'));
    assert.ok(content.includes('model: claude-opus-4-6'));
    assert.ok(content.includes('Bash(c4:*)'));
    assert.ok(content.includes('Agent'));
  });

  it('denies direct code tools', () => {
    const agentPath = path.join(__dirname, '..', '.claude', 'agents', 'manager.md');
    const content = fs.readFileSync(agentPath, 'utf8');

    const denySection = content.split('deny:')[1];
    assert.ok(denySection, 'should have deny section');
    assert.ok(denySection.includes('Read'));
    assert.ok(denySection.includes('Write'));
    assert.ok(denySection.includes('Edit'));
    assert.ok(denySection.includes('Grep'));
    assert.ok(denySection.includes('Glob'));
  });

  it('contains delegation rules in body', () => {
    const agentPath = path.join(__dirname, '..', '.claude', 'agents', 'manager.md');
    const content = fs.readFileSync(agentPath, 'utf8');

    assert.ok(content.includes('NEVER modify code directly'));
    assert.ok(content.includes('c4 new'));
    assert.ok(content.includes('c4 task'));
    assert.ok(content.includes('c4 merge'));
  });
});
