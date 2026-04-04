// Stall detection + notifyStall tests (4.14, 4.15)
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Notifications = require('../src/notifications');

// --- notifyStall tests ---

describe('Notifications.notifyStall()', () => {
  it('returns not-sent when slack is disabled', async () => {
    const n = new Notifications({});
    const result = await n.notifyStall('w1', 'stuck');
    assert.strictEqual(result.sent, false);
  });

  it('returns not-sent when webhookUrl is missing', async () => {
    const n = new Notifications({ slack: { enabled: true } });
    const result = await n.notifyStall('w1', 'stuck');
    assert.strictEqual(result.sent, false);
  });

  it('does not buffer -- sends immediately via webhook', async () => {
    const n = new Notifications({
      slack: { enabled: true, webhookUrl: 'http://localhost:19999/noop' }
    });
    const promise = n.notifyStall('w1', 'intervention: escalation');
    assert.strictEqual(n._slackBuffer.length, 0, 'should not use buffer');
    const result = await promise;
    // Result is per-channel: { slack: { ok: ..., error: ... } }
    assert.ok('slack' in result);
    assert.ok('ok' in result.slack || 'error' in result.slack);
  });

  it('includes [STALL] prefix and worker name in payload', async () => {
    const n = new Notifications({
      slack: { enabled: true, webhookUrl: 'http://localhost:19999/noop' }
    });
    let captured = null;
    // Monkey-patch the channel's _send method
    n.channels.slack._send = (text) => {
      captured = text;
      return Promise.resolve({ ok: true });
    };
    await n.notifyStall('worker3', 'no output for 7min');
    assert.ok(captured);
    assert.ok(captured.includes('[STALL]'));
    assert.ok(captured.includes('worker3'));
    assert.ok(captured.includes('no output for 7min'));
  });
});

// --- _getLastActivity tests (taskText or idle) ---

describe('_getLastActivity (taskText or idle)', () => {
  function getLastActivity(w) {
    if (w._taskText) {
      const firstLine = w._taskText.split('\n')[0].trim();
      if (firstLine) return firstLine.substring(0, 80);
    }
    return 'idle';
  }

  it('returns first line of taskText', () => {
    const result = getLastActivity({ _taskText: 'Fix the login bug. Also update tests.' });
    assert.strictEqual(result, 'Fix the login bug. Also update tests.');
  });

  it('returns idle when no taskText', () => {
    const result = getLastActivity({ _taskText: null });
    assert.strictEqual(result, 'idle');
  });

  it('returns idle when taskText is empty', () => {
    const result = getLastActivity({ _taskText: '' });
    assert.strictEqual(result, 'idle');
  });

  it('truncates long first line to 80 chars', () => {
    const longText = 'A'.repeat(100);
    const result = getLastActivity({ _taskText: longText });
    assert.strictEqual(result.length, 80);
  });
});

// --- healthCheck stall integration (mock-based) ---

describe('healthCheck stall detection (mock)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-hc-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Simulate the stall detection logic from healthCheck
  function detectStalls(workers, notifications) {
    const stallThresholdMs = 300000;
    const results = [];
    const now = Date.now();

    for (const [name, w] of workers) {
      if (!w.alive) continue;
      const idleMs = now - w.lastDataTime;
      results.push({ name, idleMs });

      if (w._interventionState) {
        notifications.notifyStall(name, `intervention: ${w._interventionState}`);
      } else if (w._taskText && idleMs >= stallThresholdMs) {
        notifications.notifyStall(name, `no output for ${Math.round(idleMs / 60000)}min`);
      }
    }
    return results;
  }

  it('calls notifyStall for intervention state workers', () => {
    const workers = new Map();
    workers.set('test-worker', {
      alive: true,
      lastDataTime: Date.now() - 10000,
      _taskText: 'do stuff',
      _interventionState: 'escalation',
    });

    const stallCalls = [];
    const notifications = {
      notifyStall: (name, reason) => { stallCalls.push({ name, reason }); },
    };

    detectStalls(workers, notifications);

    assert.strictEqual(stallCalls.length, 1);
    assert.strictEqual(stallCalls[0].name, 'test-worker');
    assert.ok(stallCalls[0].reason.includes('intervention'));
    assert.ok(stallCalls[0].reason.includes('escalation'));
  });

  it('calls notifyStall for busy workers with 5min+ no output', () => {
    const workers = new Map();
    workers.set('slow-worker', {
      alive: true,
      lastDataTime: Date.now() - 360000, // 6 min ago
      _taskText: 'build feature',
      _interventionState: null,
    });

    const stallCalls = [];
    const notifications = {
      notifyStall: (name, reason) => { stallCalls.push({ name, reason }); },
    };

    detectStalls(workers, notifications);

    assert.strictEqual(stallCalls.length, 1);
    assert.strictEqual(stallCalls[0].name, 'slow-worker');
    assert.ok(stallCalls[0].reason.includes('no output'));
    assert.ok(stallCalls[0].reason.includes('6min'));
  });

  it('does not call notifyStall for healthy workers', () => {
    const workers = new Map();
    workers.set('healthy', {
      alive: true,
      lastDataTime: Date.now() - 5000,
      _taskText: 'normal work',
      _interventionState: null,
    });

    const stallCalls = [];
    const notifications = {
      notifyStall: (name, reason) => { stallCalls.push({ name, reason }); },
    };

    detectStalls(workers, notifications);

    assert.strictEqual(stallCalls.length, 0);
  });
});
