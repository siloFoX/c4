'use strict';

// 7.16: Hook error messages must be ASCII-only.
// On Korean Windows, non-ASCII stderr from hook commands gets mangled by the
// Windows PTY into "?????", which Claude Code then reports as
// "Failed with non-blocking status code" and loops forever, triggering
// escalation false-positives.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SRC_DIR = path.join(__dirname, '..', 'src');
const COMPOUND_CHECK = path.join(SRC_DIR, 'compound-check.js');

function isAscii(str) {
  return /^[\x00-\x7F]*$/.test(str);
}

function firstNonAsciiAt(str) {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code > 0x7F) {
      const start = Math.max(0, i - 20);
      const end = Math.min(str.length, i + 20);
      return { index: i, codepoint: code.toString(16), context: str.slice(start, end) };
    }
  }
  return null;
}

// Mirrors pty-manager.js _buildHookCommands — kept in sync so this file can
// verify the string without requiring node-pty.
function buildHookCommandsLike(workerName, { port = 3456, host = '127.0.0.1', isWin = process.platform === 'win32' } = {}) {
  const baseUrl = `http://${host}:${port}`;
  const curlCmd = isWin
    ? `powershell -NoProfile -Command "$ErrorActionPreference='SilentlyContinue';try{$body=[Console]::In.ReadToEnd();Invoke-RestMethod -Uri '${baseUrl}/hook-event' -Method Post -ContentType 'application/json' -Body $body -ErrorAction SilentlyContinue | Out-Null}catch{};exit 0"`
    : `curl -s -X POST -H 'Content-Type: application/json' -d @- '${baseUrl}/hook-event' 2>/dev/null; exit 0`;
  return {
    PreToolUse: [{ hooks: [{ type: 'command', command: curlCmd }] }],
    PostToolUse: [{ hooks: [{ type: 'command', command: curlCmd }] }]
  };
}

describe('7.16: hook error messages are ASCII-only', () => {
  test('src/compound-check.js source is pure ASCII', () => {
    const src = fs.readFileSync(COMPOUND_CHECK, 'utf8');
    const bad = firstNonAsciiAt(src);
    expect(bad).toBeNull();
  });

  test('compound-check.js stderr for compound command is ASCII', () => {
    const payload = JSON.stringify({ tool_input: { command: 'echo a && echo b' } });
    const r = spawnSync(process.execPath, [COMPOUND_CHECK], {
      input: payload,
      encoding: 'utf8',
      timeout: 5000
    });
    expect(r.status).toBe(0);
    expect(r.stderr.length).toBeGreaterThan(0);
    expect(isAscii(r.stderr)).toBe(true);
    expect(r.stderr).toContain('WARNING');
    expect(r.stderr).toContain('compound');
  });

  test('compound-check.js emits nothing for safe command', () => {
    const payload = JSON.stringify({ tool_input: { command: 'echo hello' } });
    const r = spawnSync(process.execPath, [COMPOUND_CHECK], {
      input: payload,
      encoding: 'utf8',
      timeout: 5000
    });
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
  });

  test('compound-check.js swallows malformed JSON silently', () => {
    const r = spawnSync(process.execPath, [COMPOUND_CHECK], {
      input: 'this is not json {{{',
      encoding: 'utf8',
      timeout: 5000
    });
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
  });

  test('_buildHookCommands output is ASCII (windows branch)', () => {
    const hooks = buildHookCommandsLike('w1', { isWin: true });
    const cmd = hooks.PreToolUse[0].hooks[0].command;
    expect(isAscii(cmd)).toBe(true);
    expect(cmd).toContain('SilentlyContinue');
    expect(cmd).toContain('exit 0');
  });

  test('_buildHookCommands output is ASCII (unix branch)', () => {
    const hooks = buildHookCommandsLike('w1', { isWin: false });
    const cmd = hooks.PreToolUse[0].hooks[0].command;
    expect(isAscii(cmd)).toBe(true);
    expect(cmd).toContain('2>/dev/null');
    expect(cmd).toContain('exit 0');
  });

  test('hook commands in real pty-manager.js source are ASCII', () => {
    const src = fs.readFileSync(path.join(SRC_DIR, 'pty-manager.js'), 'utf8');
    const fnMatch = src.match(/_buildHookCommands\s*\([\s\S]*?\n\s{2}\}/);
    expect(fnMatch).not.toBeNull();
    const body = fnMatch[0];
    // The function body itself may cite the bug in comments using ASCII only.
    // The template literals that end up in the command must be ASCII.
    const templates = body.match(/`[^`]*`/g) || [];
    expect(templates.length).toBeGreaterThan(0);
    for (const tpl of templates) {
      expect(isAscii(tpl)).toBe(true);
    }
  });
});
