// slack-activity bug fix tests
// Tests: hook event debugging logs + PTY raw.log fallback in _getLastActivity

'use strict';
require('./jest-shim');

const path = require('path');
const fs = require('fs');
const os = require('os');

// --- _getLastActivity with PTY raw.log fallback ---
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

  // Fallback: parse PTY raw.log for tool usage patterns
  if (workerName) {
    try {
      const rawLogFile = path.join(logsDir, `${workerName}.raw.log`);
      if (fs.existsSync(rawLogFile)) {
        const rawContent = fs.readFileSync(rawLogFile, 'utf8');
        if (rawContent) {
          const clean = rawContent.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
          const toolPattern = /\b(Edit|Write|Read|Bash|Glob|Grep|Agent|NotebookEdit|WebFetch|WebSearch)\b[:\s]+([^\n\r]{1,60})/g;
          const rawActivities = [];
          let match;
          while ((match = toolPattern.exec(clean)) !== null) {
            const toolName = match[1];
            const detail = match[2].trim();
            const fileMatch = detail.match(/([a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+)/);
            if (fileMatch) {
              rawActivities.push(`${toolName}: ${fileMatch[1]}`);
            } else {
              rawActivities.push(toolName);
            }
          }
          if (rawActivities.length > 0) {
            const unique = [...new Set(rawActivities)].slice(-5);
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

describe('_getLastActivity PTY raw.log fallback', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-slack-'));
  });

  test('prefers events.jsonl over raw.log', () => {
    // Write events.jsonl
    const logFile = path.join(tmpDir, 'events-w1.jsonl');
    fs.writeFileSync(logFile, JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: '/src/foo.js' } }) + '\n');

    // Write raw.log with different tool
    const rawFile = path.join(tmpDir, 'w1.raw.log');
    fs.writeFileSync(rawFile, 'Write: bar.js\n');

    const result = getLastActivity(tmpDir, {}, 'w1');
    expect(result).toContain('Edit: foo.js');
    expect(result).not.toContain('bar.js');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('falls back to raw.log when events.jsonl is missing', () => {
    const rawFile = path.join(tmpDir, 'w2.raw.log');
    fs.writeFileSync(rawFile, 'Edit: src/main.js\nWrite: src/helper.js\n');

    const result = getLastActivity(tmpDir, { _taskText: 'some task' }, 'w2');
    expect(result).toContain('Edit: main.js');
    expect(result).toContain('Write: helper.js');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('falls back to raw.log when events.jsonl is empty', () => {
    const logFile = path.join(tmpDir, 'events-w3.jsonl');
    fs.writeFileSync(logFile, '');

    const rawFile = path.join(tmpDir, 'w3.raw.log');
    fs.writeFileSync(rawFile, 'Bash: npm test\n');

    const result = getLastActivity(tmpDir, {}, 'w3');
    expect(result).toContain('Bash');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('falls back to raw.log when events.jsonl has no tool events', () => {
    const logFile = path.join(tmpDir, 'events-w4.jsonl');
    fs.writeFileSync(logFile, JSON.stringify({ some_field: 'value' }) + '\n');

    const rawFile = path.join(tmpDir, 'w4.raw.log');
    fs.writeFileSync(rawFile, 'Read: config.json\n');

    const result = getLastActivity(tmpDir, {}, 'w4');
    expect(result).toContain('Read: config.json');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('strips ANSI escape sequences from raw.log', () => {
    const rawFile = path.join(tmpDir, 'w5.raw.log');
    fs.writeFileSync(rawFile, '\x1b[32mEdit: \x1b[0msrc/app.js\n');

    const result = getLastActivity(tmpDir, {}, 'w5');
    expect(result).toContain('Edit: app.js');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('deduplicates tool entries from raw.log', () => {
    const rawFile = path.join(tmpDir, 'w6.raw.log');
    fs.writeFileSync(rawFile, 'Edit: src/foo.js\nEdit: src/foo.js\nEdit: src/foo.js\n');

    const result = getLastActivity(tmpDir, {}, 'w6');
    const matches = result.split('Edit: foo.js');
    expect(matches.length - 1).toBe(1);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('limits raw.log output to 120 chars', () => {
    const rawFile = path.join(tmpDir, 'w7.raw.log');
    let content = '';
    for (let i = 0; i < 30; i++) {
      content += `Edit: very-long-filename-number-${i}.js\n`;
    }
    fs.writeFileSync(rawFile, content);

    const result = getLastActivity(tmpDir, {}, 'w7');
    expect(result.length).toBeLessThanOrEqual(120);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('takes last 5 unique activities from raw.log', () => {
    const rawFile = path.join(tmpDir, 'w8.raw.log');
    fs.writeFileSync(rawFile,
      'Edit: a.js\nWrite: b.js\nRead: c.js\nBash: npm test\nGrep: pattern\nGlob: *.ts\n'
    );

    const result = getLastActivity(tmpDir, {}, 'w8');
    // Should have last 5 unique: Write, Read, Bash, Grep, Glob
    expect(result).not.toContain('Edit: a.js');
    expect(result).toContain('Glob');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('falls back to _taskText when both JSONL and raw.log are missing', () => {
    const result = getLastActivity(tmpDir, { _taskText: 'Fix login page. Update CSS.' }, 'w9');
    expect(result).toBe('Fix login page');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns empty string when no data available', () => {
    const result = getLastActivity(tmpDir, {}, 'w10');
    expect(result).toBe('');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('raw.log fallback is prioritized over _taskText fallback', () => {
    const rawFile = path.join(tmpDir, 'w11.raw.log');
    fs.writeFileSync(rawFile, 'Write: output.txt\n');

    const result = getLastActivity(tmpDir, { _taskText: 'some generic task' }, 'w11');
    expect(result).toContain('Write: output.txt');
    expect(result).not.toContain('some generic task');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('handles empty raw.log gracefully', () => {
    const rawFile = path.join(tmpDir, 'w12.raw.log');
    fs.writeFileSync(rawFile, '');

    const result = getLastActivity(tmpDir, { _taskText: 'fallback task' }, 'w12');
    expect(result).toBe('fallback task');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('handles raw.log with no tool patterns', () => {
    const rawFile = path.join(tmpDir, 'w13.raw.log');
    fs.writeFileSync(rawFile, 'some random PTY output\nno tools here\njust text\n');

    const result = getLastActivity(tmpDir, { _taskText: 'my task' }, 'w13');
    expect(result).toBe('my task');

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
