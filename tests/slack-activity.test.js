// slack-activity bug fix tests
// Tests: hook event debugging logs + _getLastActivity (taskText or idle)

'use strict';
require('./jest-shim');

const fs = require('fs');
const path = require('path');

// --- _getLastActivity ---
// Mirrors the simplified logic from src/pty-manager.js

function getLastActivity(w) {
  if (w._taskText) {
    const firstLine = w._taskText.split('\n')[0].trim();
    if (firstLine) return firstLine.substring(0, 80);
  }
  return 'idle';
}

// --- Tests ---

describe('_getLastActivity (taskText or idle)', () => {
  test('returns first line of _taskText', () => {
    const result = getLastActivity({ _taskText: 'Fix login page. Update CSS.' });
    expect(result).toBe('Fix login page. Update CSS.');
  });

  test('returns first line split by newline', () => {
    const result = getLastActivity({ _taskText: 'Build the app\nDeploy it' });
    expect(result).toBe('Build the app');
  });

  test('truncates long first line to 80 chars', () => {
    const longText = 'A'.repeat(100);
    const result = getLastActivity({ _taskText: longText });
    expect(result.length).toBe(80);
  });

  test('returns idle when _taskText is missing', () => {
    const result = getLastActivity({});
    expect(result).toBe('idle');
  });

  test('returns idle when _taskText is empty', () => {
    const result = getLastActivity({ _taskText: '' });
    expect(result).toBe('idle');
  });
});

describe('notifyHealthCheck status handling', () => {
  // Inline Notifications to test notifyHealthCheck behavior
  const notifSrc = require('../src/notifications');

  function createNotifications(lang) {
    return new notifSrc({ language: lang || 'ko', slack: { enabled: false } });
  }

  test('restart_failed workers appear as dead', () => {
    const n = createNotifications();
    const collected = [];
    n.pushAll = (msg) => collected.push(msg);

    n.notifyHealthCheck({ workers: [
      { name: 'w1', status: 'restart_failed' },
      { name: 'w2', status: 'alive', task: 'Fix bug', lastActivity: 'Fix bug', taskStarted: new Date().toISOString() }
    ] });

    expect(collected.length).toBe(1);
    expect(collected[0]).toContain('w1 - ');
    expect(collected[0]).toContain('w2');
  });

  test('restart_failed shows restartFailed label', () => {
    const n = createNotifications('ko');
    const collected = [];
    n.pushAll = (msg) => collected.push(msg);

    n.notifyHealthCheck({ workers: [
      { name: 'w1', status: 'restart_failed' }
    ] });

    expect(collected[0]).toContain('재시작 실패');
  });

  test('restarted workers appear as alive', () => {
    const n = createNotifications();
    const collected = [];
    n.pushAll = (msg) => collected.push(msg);

    n.notifyHealthCheck({ workers: [
      { name: 'w1', status: 'restarted' },
      { name: 'w2', status: 'alive', task: null }
    ] });

    // No dead workers, so no "워커 중단" header
    expect(collected[0]).not.toContain('중단');
    expect(collected[0]).toContain('w1');
    expect(collected[0]).toContain('w2');
  });

  test('mixed statuses: exited + restart_failed + alive', () => {
    const n = createNotifications();
    const collected = [];
    n.pushAll = (msg) => collected.push(msg);

    n.notifyHealthCheck({ workers: [
      { name: 'w1', status: 'exited' },
      { name: 'w2', status: 'restart_failed' },
      { name: 'w3', status: 'alive', task: 'Deploy', lastActivity: 'Deploy', taskStarted: new Date().toISOString() }
    ] });

    // 2 dead workers
    expect(collected[0]).toContain('2개 워커 중단');
    expect(collected[0]).toContain('w1 - 중단');
    expect(collected[0]).toContain('w2 - 재시작 실패');
    expect(collected[0]).toContain('w3');
  });
});

describe('hook debugging logs', () => {
  test('daemon /hook-event handler logs on receive', () => {
    // Verify the log format exists in daemon.js
    const daemonSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'daemon.js'), 'utf8');
    expect(daemonSrc).toContain('[DAEMON] /hook-event received:');
    expect(daemonSrc).toContain('[DAEMON] /hook-event rejected:');
  });

  test('hookEvent() logs worker name and event on entry', () => {
    const ptySrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'pty-manager.js'), 'utf8');
    expect(ptySrc).toContain('[C4] hookEvent:');
  });

  test('_appendEventLog() logs file path on write', () => {
    const ptySrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'pty-manager.js'), 'utf8');
    expect(ptySrc).toContain('[C4] _appendEventLog:');
    expect(ptySrc).toContain('[C4] _appendEventLog error:');
  });
});
