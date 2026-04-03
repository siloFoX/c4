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
    assert.ok('ok' in result || 'error' in result);
  });

  it('includes [STALL] prefix and worker name in payload', async () => {
    const n = new Notifications({
      slack: { enabled: true, webhookUrl: 'http://localhost:19999/noop' }
    });
    let captured = null;
    n._postWebhook = (url, payload) => {
      captured = payload;
      return Promise.resolve({ ok: true });
    };
    await n.notifyStall('worker3', 'no output for 7min');
    assert.ok(captured);
    assert.ok(captured.text.includes('[STALL]'));
    assert.ok(captured.text.includes('worker3'));
    assert.ok(captured.text.includes('no output for 7min'));
  });
});

// --- _getLastActivity tests (JSONL-based, using mock manager) ---

describe('_getLastActivity (JSONL-based)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-stall-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Re-implement _getLastActivity logic as a standalone function for testing
  // This mirrors the exact logic in src/pty-manager.js _getLastActivity
  function getLastActivity(logsDir, w, workerName) {
    workerName = workerName || '';
    if (workerName) {
      try {
        const logFile = path.join(logsDir, `events-${workerName}.jsonl`);
        if (fs.existsSync(logFile)) {
          const content = fs.readFileSync(logFile, 'utf8').trim();
          if (content) {
            const lines = content.split('\n');
            const recent = lines.slice(-20);
            const activities = [];
            for (const line of recent) {
              try {
                const evt = JSON.parse(line);
                const tool = evt.tool_name;
                if (!tool) continue;
                const input = evt.tool_input || {};
                const file = input.file_path || input.command || '';
                const shortFile = file ? path.basename(file) : '';
                if (shortFile) {
                  activities.push(`${tool}: ${shortFile}`);
                } else {
                  activities.push(tool);
                }
              } catch {}
            }
            if (activities.length > 0) {
              const unique = [...new Set(activities)].slice(-5);
              return unique.join(', ').substring(0, 120);
            }
          }
        }
      } catch {}
    }

    if (w._taskText) {
      const firstLine = w._taskText.split(/[\n.]/)[0].trim();
      if (firstLine) return firstLine.substring(0, 80);
    }

    return '';
  }

  function writeEvents(workerName, events) {
    const logFile = path.join(tmpDir, `events-${workerName}.jsonl`);
    const content = events.map(e => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(logFile, content, 'utf8');
  }

  it('returns tool activities from JSONL events', () => {
    writeEvents('w1', [
      { tool_name: 'Edit', tool_input: { file_path: '/project/src/foo.js' } },
      { tool_name: 'Write', tool_input: { file_path: '/project/src/bar.js' } },
    ]);
    const result = getLastActivity(tmpDir, { _taskText: 'some task' }, 'w1');
    assert.ok(result.includes('Edit: foo.js'));
    assert.ok(result.includes('Write: bar.js'));
  });

  it('deduplicates repeated tool actions', () => {
    writeEvents('w2', [
      { tool_name: 'Edit', tool_input: { file_path: '/a/foo.js' } },
      { tool_name: 'Edit', tool_input: { file_path: '/a/foo.js' } },
      { tool_name: 'Edit', tool_input: { file_path: '/a/foo.js' } },
    ]);
    const result = getLastActivity(tmpDir, { _taskText: null }, 'w2');
    const matches = result.split('Edit: foo.js');
    assert.strictEqual(matches.length - 1, 1, 'should deduplicate');
  });

  it('handles Bash with command input', () => {
    writeEvents('w3', [
      { tool_name: 'Bash', tool_input: { command: 'npm test' } },
    ]);
    const result = getLastActivity(tmpDir, { _taskText: null }, 'w3');
    assert.ok(result.includes('Bash'));
  });

  it('falls back to taskText first line when no JSONL file', () => {
    const result = getLastActivity(tmpDir, { _taskText: 'Fix the login bug. Also update tests.' }, 'nofile');
    assert.strictEqual(result, 'Fix the login bug');
  });

  it('returns empty string when no JSONL and no taskText', () => {
    const result = getLastActivity(tmpDir, { _taskText: null }, 'nofile');
    assert.strictEqual(result, '');
  });

  it('returns empty string when JSONL has no tool events', () => {
    writeEvents('w4', [
      { some_field: 'value' },
      { other: 123 },
    ]);
    const result = getLastActivity(tmpDir, { _taskText: null }, 'w4');
    assert.strictEqual(result, '');
  });

  it('limits output to 120 characters', () => {
    const events = [];
    for (let i = 0; i < 30; i++) {
      events.push({ tool_name: 'Edit', tool_input: { file_path: `/long/path/to/very-long-filename-${i}.js` } });
    }
    writeEvents('w5', events);
    const result = getLastActivity(tmpDir, { _taskText: null }, 'w5');
    assert.ok(result.length <= 120);
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
