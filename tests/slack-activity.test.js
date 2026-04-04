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
    const firstLine = w._taskText.split(/[\n.]/)[0].trim();
    if (firstLine) return firstLine.substring(0, 80);
  }
  return 'idle';
}

// --- Tests ---

describe('_getLastActivity (taskText or idle)', () => {
  test('returns first line of _taskText', () => {
    const result = getLastActivity({ _taskText: 'Fix login page. Update CSS.' });
    expect(result).toBe('Fix login page');
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
