// slack-activity bug fix tests
// Tests: hook event debugging logs + _getLastActivity (JSONL + task summary fallback)

'use strict';
require('./jest-shim');

const path = require('path');
const fs = require('fs');
const os = require('os');

// --- _getLastActivity (JSONL + task summary fallback) ---
// Mirrors the updated logic from src/pty-manager.js

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

  // Fallback: first line of task text
  if (w._taskText) {
    const firstLine = w._taskText.split(/[\n.]/)[0].trim();
    if (firstLine) return firstLine.substring(0, 80);
  }

  return '';
}

// --- Tests ---

describe('_getLastActivity (JSONL + task summary fallback)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-slack-'));
  });

  test('returns tool activities from events.jsonl', () => {
    const logFile = path.join(tmpDir, 'events-w1.jsonl');
    fs.writeFileSync(logFile, JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: '/src/foo.js' } }) + '\n');

    const result = getLastActivity(tmpDir, {}, 'w1');
    expect(result).toContain('Edit: foo.js');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('falls back to _taskText when events.jsonl is missing', () => {
    const result = getLastActivity(tmpDir, { _taskText: 'Fix login page. Update CSS.' }, 'w9');
    expect(result).toBe('Fix login page');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('falls back to _taskText when events.jsonl is empty', () => {
    const logFile = path.join(tmpDir, 'events-w3.jsonl');
    fs.writeFileSync(logFile, '');

    const result = getLastActivity(tmpDir, { _taskText: 'Build the app' }, 'w3');
    expect(result).toBe('Build the app');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('falls back to _taskText when events.jsonl has no tool events', () => {
    const logFile = path.join(tmpDir, 'events-w4.jsonl');
    fs.writeFileSync(logFile, JSON.stringify({ some_field: 'value' }) + '\n');

    const result = getLastActivity(tmpDir, { _taskText: 'Deploy to staging' }, 'w4');
    expect(result).toBe('Deploy to staging');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns empty string when no data available', () => {
    const result = getLastActivity(tmpDir, {}, 'w10');
    expect(result).toBe('');

    fs.rmSync(tmpDir, { recursive: true, force: true });
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
