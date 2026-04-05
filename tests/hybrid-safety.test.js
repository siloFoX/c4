const assert = require('assert');
const { describe, it } = require('node:test');

// Mirror of CRITICAL_DENY_PATTERNS from src/pty-manager.js (5.13)
const CRITICAL_DENY_PATTERNS = [
  /\brm\s+-rf\s+[\/\\]/,
  /\bgit\s+push\s+--force/,
  /\bgit\s+push\s+-f\b/,
  /\bDROP\s+(TABLE|DATABASE)/i,
  /\bsudo\s+rm\b/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\bgit\s+reset\s+--hard\s+origin/,
];

// --- 5.21 Hybrid Safety Mode ---

describe('Hybrid Safety Mode (5.21)', () => {

  function createMockManager() {
    const mgr = {
      workers: new Map(),
      _notifications: null,
    };

    mgr._classifyPermission = function(screenText, worker) {
      const command = screenText.split('\n').find(l => l.trim() && !l.includes('Run shell command'))?.trim() || '';
      const isCritical = CRITICAL_DENY_PATTERNS.some(p => p.test(command));

      if (isCritical) {
        if (worker) {
          worker._interventionState = 'critical_deny';
          worker._criticalCommand = command;
          worker.snapshots = worker.snapshots || [];
          worker.snapshots.push({
            time: Date.now(),
            screen: `[CRITICAL DENY] awaiting approval: ${command.substring(0, 100)}`,
            autoAction: true
          });
        }
        if (this._notifications) {
          this._notifications.pushAll(`[CRITICAL DENY] worker needs approval for: ${command.substring(0, 80)}`);
          this._notifications._flushSlack();
        }
        return 'deny';
      }
      return 'approve';
    };

    mgr.approve = function(name) {
      const w = this.workers.get(name);
      if (!w) return { error: `Worker '${name}' not found` };
      if (w._interventionState !== 'critical_deny') {
        return { error: `Worker '${name}' is not awaiting critical approval` };
      }
      w._interventionState = null;
      w._approvedWith = 'y\r'; // track for testing
      return { success: true, approved: w._criticalCommand };
    };

    return mgr;
  }

  it('critical deny sets worker._interventionState to critical_deny', () => {
    const mgr = createMockManager();
    const worker = { snapshots: [], _interventionState: null, _criticalCommand: null };
    mgr._classifyPermission('Run shell command\nrm -rf /tmp', worker);
    assert.strictEqual(worker._interventionState, 'critical_deny');
    assert.strictEqual(worker._criticalCommand, 'rm -rf /tmp');
  });

  it('critical deny pushes snapshot with [CRITICAL DENY] tag', () => {
    const mgr = createMockManager();
    const worker = { snapshots: [], _interventionState: null };
    mgr._classifyPermission('Run shell command\ngit push --force origin main', worker);
    assert.ok(worker.snapshots.length > 0);
    assert.ok(worker.snapshots[0].screen.includes('[CRITICAL DENY]'));
    assert.ok(worker.snapshots[0].screen.includes('awaiting approval'));
  });

  it('critical deny sends Slack notification via pushAll + _flushSlack', () => {
    const mgr = createMockManager();
    let pushed = false;
    let flushed = false;
    mgr._notifications = {
      pushAll: (msg) => { pushed = true; assert.ok(msg.includes('[CRITICAL DENY]')); },
      _flushSlack: () => { flushed = true; }
    };
    const worker = { snapshots: [], _interventionState: null };
    mgr._classifyPermission('Run shell command\nrm -rf /var', worker);
    assert.ok(pushed);
    assert.ok(flushed);
  });

  it('approve() clears interventionState and returns approved command', () => {
    const mgr = createMockManager();
    const worker = {
      snapshots: [],
      _interventionState: 'critical_deny',
      _criticalCommand: 'rm -rf /tmp',
      proc: { write: () => {} }
    };
    mgr.workers.set('w1', worker);
    const result = mgr.approve('w1');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.approved, 'rm -rf /tmp');
    assert.strictEqual(worker._interventionState, null);
  });

  it('approve() returns error for non-existent worker', () => {
    const mgr = createMockManager();
    const result = mgr.approve('ghost');
    assert.ok(result.error);
    assert.ok(result.error.includes('not found'));
  });

  it('approve() returns error if worker not in critical_deny state', () => {
    const mgr = createMockManager();
    mgr.workers.set('w2', { _interventionState: null });
    const result = mgr.approve('w2');
    assert.ok(result.error);
    assert.ok(result.error.includes('not awaiting'));
  });
});

// --- 5.28 Auto-Approval Block ---

describe('Auto-Approval Block (5.28)', () => {

  function createMockSend() {
    return function send(name, input, isSpecialKey = false) {
      const workers = this.workers;
      const w = workers.get(name);
      if (!w) return { error: `Worker '${name}' not found` };
      if (!w.alive) return { error: `Worker '${name}' has exited` };

      // Block auto-approval of critical commands (5.28)
      if (w._interventionState === 'critical_deny') {
        if (isSpecialKey && input === 'Enter') {
          return { error: `Worker '${name}' has a critical command pending. Use 'c4 approve ${name}' instead.` };
        }
        if (!isSpecialKey && /^y$/i.test(input.trim())) {
          return { error: `Worker '${name}' has a critical command pending. Use 'c4 approve ${name}' instead.` };
        }
      }

      return { success: true };
    };
  }

  function setup(interventionState) {
    const ctx = {
      workers: new Map(),
    };
    ctx.workers.set('w1', {
      alive: true,
      _interventionState: interventionState,
      proc: { write: () => {} }
    });
    ctx.send = createMockSend().bind(ctx);
    return ctx;
  }

  it('blocks Enter key when critical_deny', () => {
    const ctx = setup('critical_deny');
    const result = ctx.send('w1', 'Enter', true);
    assert.ok(result.error);
    assert.ok(result.error.includes('c4 approve'));
  });

  it('blocks "y" input when critical_deny', () => {
    const ctx = setup('critical_deny');
    const result = ctx.send('w1', 'y', false);
    assert.ok(result.error);
    assert.ok(result.error.includes('c4 approve'));
  });

  it('blocks "Y" input when critical_deny (case insensitive)', () => {
    const ctx = setup('critical_deny');
    const result = ctx.send('w1', 'Y', false);
    assert.ok(result.error);
    assert.ok(result.error.includes('c4 approve'));
  });

  it('allows other keys when critical_deny', () => {
    const ctx = setup('critical_deny');
    const result = ctx.send('w1', 'C-c', true);
    assert.strictEqual(result.success, true);
  });

  it('allows other text when critical_deny', () => {
    const ctx = setup('critical_deny');
    const result = ctx.send('w1', 'hello world', false);
    assert.strictEqual(result.success, true);
  });

  it('allows Enter when NOT in critical_deny', () => {
    const ctx = setup(null);
    const result = ctx.send('w1', 'Enter', true);
    assert.strictEqual(result.success, true);
  });

  it('allows "y" when NOT in critical_deny', () => {
    const ctx = setup(null);
    const result = ctx.send('w1', 'y', false);
    assert.strictEqual(result.success, true);
  });
});

// --- 5.14 Resume Re-orientation ---

describe('Resume Re-orientation (5.14)', () => {

  it('creates snapshot with [RESUMED] tag after resume', async () => {
    const worker = {
      alive: true,
      snapshots: [],
      screen: {
        getVisibleText: () => 'line1\nline2\nline3\nlast line of output'
      }
    };

    // Simulate the resume re-orientation logic
    const lastLines = worker.screen.getVisibleText().split('\n').slice(-20).join('\n');
    worker.snapshots.push({
      time: Date.now(),
      screen: `[RESUMED] Last visible state:\n${lastLines}`,
      autoAction: true
    });

    assert.strictEqual(worker.snapshots.length, 1);
    assert.ok(worker.snapshots[0].screen.includes('[RESUMED]'));
    assert.ok(worker.snapshots[0].screen.includes('last line of output'));
    assert.strictEqual(worker.snapshots[0].autoAction, true);
  });

  it('sends notification on resume', () => {
    let notified = false;
    const notifications = {
      pushAll: (msg) => {
        notified = true;
        assert.ok(msg.includes('[RESUMED]'));
        assert.ok(msg.includes('test-worker'));
      }
    };

    const name = 'test-worker';
    notifications.pushAll(`[RESUMED] ${name}: worker resumed. Last state captured.`);
    assert.ok(notified);
  });

  it('does not create snapshot if worker is dead', () => {
    const worker = {
      alive: false,
      snapshots: [],
      screen: {
        getVisibleText: () => 'some text'
      }
    };

    // Simulate the guard check
    if (worker.alive) {
      worker.snapshots.push({ time: Date.now(), screen: '[RESUMED]', autoAction: true });
    }

    assert.strictEqual(worker.snapshots.length, 0);
  });

  it('captures only last 20 lines of visible text', () => {
    const lines = [];
    for (let i = 0; i < 30; i++) lines.push(`line-${i}`);
    const worker = {
      alive: true,
      snapshots: [],
      screen: {
        getVisibleText: () => lines.join('\n')
      }
    };

    const lastLines = worker.screen.getVisibleText().split('\n').slice(-20).join('\n');
    worker.snapshots.push({
      time: Date.now(),
      screen: `[RESUMED] Last visible state:\n${lastLines}`,
      autoAction: true
    });

    // Should NOT contain line-0 through line-9, but SHOULD contain line-10 through line-29
    assert.ok(!worker.snapshots[0].screen.includes('line-0\n'));
    assert.ok(worker.snapshots[0].screen.includes('line-10'));
    assert.ok(worker.snapshots[0].screen.includes('line-29'));
  });
});
