const assert = require('assert');
const { describe, it, beforeEach, afterEach } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Hook Event JSONL Persistence (4.2)', () => {
  let tmpDir;
  let mgr;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-event-log-'));
    mgr = createMockManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createMockManager(logsDir) {
    return {
      logsDir,
      _appendEventLog(workerName, hookEntry) {
        if (!workerName || typeof workerName !== 'string') return;
        if (!hookEntry || typeof hookEntry !== 'object') return;

        try {
          const dir = this.logsDir;
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          const logFile = path.join(dir, `events-${workerName}.jsonl`);
          const line = JSON.stringify(hookEntry) + '\n';
          fs.appendFileSync(logFile, line, 'utf8');
        } catch (err) {
          // Log write failures should not break hook processing
        }
      }
    };
  }

  // --- Normal event logging ---

  it('creates JSONL file and writes event', () => {
    const entry = { hook_type: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' }, receivedAt: Date.now() };
    mgr._appendEventLog('worker1', entry);

    const logFile = path.join(tmpDir, 'events-worker1.jsonl');
    assert.ok(fs.existsSync(logFile), 'JSONL file should be created');

    const content = fs.readFileSync(logFile, 'utf8');
    const parsed = JSON.parse(content.trim());
    assert.strictEqual(parsed.hook_type, 'PreToolUse');
    assert.strictEqual(parsed.tool_name, 'Bash');
    assert.strictEqual(parsed.tool_input.command, 'ls');
  });

  it('appends multiple events to same file', () => {
    const entry1 = { hook_type: 'PreToolUse', tool_name: 'Bash', receivedAt: 1000 };
    const entry2 = { hook_type: 'PostToolUse', tool_name: 'Write', receivedAt: 2000 };
    const entry3 = { hook_type: 'PreToolUse', tool_name: 'Edit', receivedAt: 3000 };

    mgr._appendEventLog('w1', entry1);
    mgr._appendEventLog('w1', entry2);
    mgr._appendEventLog('w1', entry3);

    const logFile = path.join(tmpDir, 'events-w1.jsonl');
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
    assert.strictEqual(lines.length, 3);

    const parsed0 = JSON.parse(lines[0]);
    const parsed1 = JSON.parse(lines[1]);
    const parsed2 = JSON.parse(lines[2]);
    assert.strictEqual(parsed0.tool_name, 'Bash');
    assert.strictEqual(parsed1.tool_name, 'Write');
    assert.strictEqual(parsed2.tool_name, 'Edit');
  });

  it('writes separate files for different workers', () => {
    mgr._appendEventLog('alpha', { hook_type: 'PreToolUse', receivedAt: 1 });
    mgr._appendEventLog('beta', { hook_type: 'PostToolUse', receivedAt: 2 });

    assert.ok(fs.existsSync(path.join(tmpDir, 'events-alpha.jsonl')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'events-beta.jsonl')));
  });

  it('preserves all hook entry fields', () => {
    const entry = {
      hook_type: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
      tool_error: 'Error: test failed',
      receivedAt: 1712200000000
    };
    mgr._appendEventLog('w1', entry);

    const logFile = path.join(tmpDir, 'events-w1.jsonl');
    const parsed = JSON.parse(fs.readFileSync(logFile, 'utf8').trim());
    assert.strictEqual(parsed.hook_type, 'PostToolUse');
    assert.strictEqual(parsed.tool_name, 'Bash');
    assert.strictEqual(parsed.tool_input.command, 'npm test');
    assert.strictEqual(parsed.tool_error, 'Error: test failed');
    assert.strictEqual(parsed.receivedAt, 1712200000000);
  });

  it('each line is valid JSON (JSONL format)', () => {
    for (let i = 0; i < 10; i++) {
      mgr._appendEventLog('w1', { hook_type: 'PreToolUse', tool_name: 'Read', index: i, receivedAt: Date.now() });
    }

    const logFile = path.join(tmpDir, 'events-w1.jsonl');
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
    assert.strictEqual(lines.length, 10);

    lines.forEach((line, i) => {
      const parsed = JSON.parse(line);
      assert.strictEqual(parsed.index, i);
    });
  });

  // --- Invalid input handling ---

  it('ignores null workerName', () => {
    mgr._appendEventLog(null, { hook_type: 'PreToolUse' });
    const files = fs.readdirSync(tmpDir);
    assert.strictEqual(files.length, 0);
  });

  it('ignores undefined workerName', () => {
    mgr._appendEventLog(undefined, { hook_type: 'PreToolUse' });
    const files = fs.readdirSync(tmpDir);
    assert.strictEqual(files.length, 0);
  });

  it('ignores empty string workerName', () => {
    mgr._appendEventLog('', { hook_type: 'PreToolUse' });
    const files = fs.readdirSync(tmpDir);
    assert.strictEqual(files.length, 0);
  });

  it('ignores non-string workerName', () => {
    mgr._appendEventLog(123, { hook_type: 'PreToolUse' });
    const files = fs.readdirSync(tmpDir);
    assert.strictEqual(files.length, 0);
  });

  it('ignores null hookEntry', () => {
    mgr._appendEventLog('w1', null);
    const logFile = path.join(tmpDir, 'events-w1.jsonl');
    assert.ok(!fs.existsSync(logFile));
  });

  it('ignores undefined hookEntry', () => {
    mgr._appendEventLog('w1', undefined);
    const logFile = path.join(tmpDir, 'events-w1.jsonl');
    assert.ok(!fs.existsSync(logFile));
  });

  it('ignores non-object hookEntry', () => {
    mgr._appendEventLog('w1', 'string-value');
    const logFile = path.join(tmpDir, 'events-w1.jsonl');
    assert.ok(!fs.existsSync(logFile));
  });

  // --- File creation/append behavior ---

  it('creates logs directory if it does not exist', () => {
    const nestedDir = path.join(tmpDir, 'nested', 'logs');
    mgr.logsDir = nestedDir;

    mgr._appendEventLog('w1', { hook_type: 'PreToolUse', receivedAt: 1 });

    assert.ok(fs.existsSync(nestedDir), 'Nested directory should be created');
    assert.ok(fs.existsSync(path.join(nestedDir, 'events-w1.jsonl')));
  });

  it('appends to existing file without overwriting', () => {
    const logFile = path.join(tmpDir, 'events-w1.jsonl');
    fs.writeFileSync(logFile, '{"existing":true}\n', 'utf8');

    mgr._appendEventLog('w1', { hook_type: 'PostToolUse', receivedAt: 2 });

    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
    assert.strictEqual(lines.length, 2);
    assert.deepStrictEqual(JSON.parse(lines[0]), { existing: true });
    assert.strictEqual(JSON.parse(lines[1]).hook_type, 'PostToolUse');
  });

  it('does not throw on write failure (read-only dir simulation)', () => {
    mgr.logsDir = path.join(tmpDir, 'nonexistent', '\0invalid');
    assert.doesNotThrow(() => {
      mgr._appendEventLog('w1', { hook_type: 'PreToolUse', receivedAt: 1 });
    });
  });

  it('handles empty object hookEntry', () => {
    mgr._appendEventLog('w1', {});
    const logFile = path.join(tmpDir, 'events-w1.jsonl');
    assert.ok(fs.existsSync(logFile));
    const parsed = JSON.parse(fs.readFileSync(logFile, 'utf8').trim());
    assert.deepStrictEqual(parsed, {});
  });
});
