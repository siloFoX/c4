'use strict';

// 7.23 regression: PostToolUse hook setup must not error on worker spawn.
//
// The 7.16 fix replaced the legacy PowerShell/curl hook commands with a
// single Node.js relay script (src/hook-relay.js) that always exits 0.
// This test locks that behavior in so a future revert to
// PowerShell/curl — which produced "Failed with non-blocking status code"
// loops on Korean Windows — is caught by CI instead of in production.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { describe, it } = require('node:test');

const SRC_DIR = path.join(__dirname, '..', 'src');
const PTY_MANAGER = path.join(SRC_DIR, 'pty-manager.js');
const HOOK_RELAY = path.join(SRC_DIR, 'hook-relay.js');

// Extract _buildHookCommands from pty-manager.js source so we can invoke it
// without requiring node-pty (which isn't resolvable inside this worktree).
function loadBuildHookCommandsImpl() {
  const src = fs.readFileSync(PTY_MANAGER, 'utf8');
  const match = src.match(/_buildHookCommands\(workerName\)\s*\{[\s\S]*?\n  \}/);
  if (!match) {
    throw new Error('Could not locate _buildHookCommands in pty-manager.js');
  }
  const body = match[0]
    .replace(/^_buildHookCommands\(workerName\)\s*\{/, '')
    .replace(/\}$/, '');
  return new Function(
    'path',
    '__dirname',
    'return function(workerName) {' + body + '};'
  )(path, SRC_DIR);
}

const buildHookCommands = loadBuildHookCommandsImpl();

function makeMgr(config) {
  return { config };
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('7.23: _buildHookCommands produces the expected shape', () => {
  it('returns PreToolUse + PostToolUse groups with one command each', () => {
    const mgr = makeMgr({ daemon: { port: 3456, host: '127.0.0.1' } });
    const hooks = buildHookCommands.call(mgr, 'w1');
    assert.ok(Array.isArray(hooks.PreToolUse), 'PreToolUse must be an array');
    assert.ok(Array.isArray(hooks.PostToolUse), 'PostToolUse must be an array');
    assert.strictEqual(hooks.PreToolUse.length, 1);
    assert.strictEqual(hooks.PostToolUse.length, 1);
    for (const group of [hooks.PreToolUse[0], hooks.PostToolUse[0]]) {
      assert.ok(Array.isArray(group.hooks));
      assert.strictEqual(group.hooks.length, 1);
      assert.strictEqual(group.hooks[0].type, 'command');
      assert.strictEqual(typeof group.hooks[0].command, 'string');
      assert.ok(group.hooks[0].command.length > 0);
    }
  });

  it('invokes node hook-relay.js — no powershell, no curl', () => {
    const mgr = makeMgr({ daemon: { port: 3456, host: '127.0.0.1' } });
    const cmd = buildHookCommands.call(mgr, 'w1').PostToolUse[0].hooks[0].command;
    assert.match(cmd, /^node\s/, 'command must start with "node "');
    assert.match(cmd, /hook-relay\.js/, 'command must reference hook-relay.js');
    assert.doesNotMatch(cmd, /powershell/i, 'must not reintroduce PowerShell');
    assert.doesNotMatch(cmd, /Invoke-RestMethod/i, 'must not reintroduce IRM');
    assert.doesNotMatch(cmd, /(^|\s)curl(\s|$)/, 'must not reintroduce curl');
  });

  it('contains no compound shell operators', () => {
    const cmd = buildHookCommands.call(makeMgr({}), 'w1').PostToolUse[0].hooks[0].command;
    assert.ok(!cmd.includes('&&'), 'command must not contain &&');
    assert.ok(!cmd.includes('||'), 'command must not contain ||');
    assert.ok(!cmd.includes(';'), 'command must not contain ;');
    const withoutUrl = cmd.replace(/https?:\/\/[^\s]+/g, '');
    assert.ok(!withoutUrl.includes('|'), 'command must not pipe');
  });

  it('uses configured daemon port + host', () => {
    const mgr = makeMgr({ daemon: { port: 9876, host: '10.0.0.5' } });
    const cmd = buildHookCommands.call(mgr, 'w1').PreToolUse[0].hooks[0].command;
    assert.ok(
      cmd.includes('http://10.0.0.5:9876/hook-event'),
      `expected configured URL in: ${cmd}`
    );
  });

  it('falls back to 127.0.0.1:3456 when config is absent', () => {
    const cmd = buildHookCommands.call(makeMgr({}), 'w1').PostToolUse[0].hooks[0].command;
    assert.ok(
      cmd.includes('http://127.0.0.1:3456/hook-event'),
      `expected default URL in: ${cmd}`
    );
  });

  it('references an on-disk hook-relay.js (path is absolute + exists)', () => {
    const cmd = buildHookCommands.call(makeMgr({}), 'w1').PostToolUse[0].hooks[0].command;
    const pathMatch = cmd.match(/node\s+"([^"]+hook-relay\.js)"/);
    assert.ok(pathMatch, `expected quoted absolute path to hook-relay.js in: ${cmd}`);
    const scriptPath = pathMatch[1];
    assert.ok(
      path.isAbsolute(scriptPath) || /^[A-Za-z]:\//.test(scriptPath),
      `hook-relay.js path should be absolute, got: ${scriptPath}`
    );
    assert.ok(fs.existsSync(scriptPath), `hook-relay.js not found at: ${scriptPath}`);
  });

  it('emits pure ASCII (no mojibake source)', () => {
    const cmd = buildHookCommands.call(makeMgr({}), 'w1').PostToolUse[0].hooks[0].command;
    assert.ok(/^[\x00-\x7F]+$/.test(cmd), `hook command contains non-ASCII: ${cmd}`);
  });
});

describe('7.23: hook-relay.js never fails the Claude Code hook contract', () => {
  const DAEMON_UNREACHABLE = 'http://127.0.0.1:1/does-not-exist';
  const DAEMON_FAKE = 'http://127.0.0.1:3456/hook-event';

  it('exits 0 when the daemon URL is unreachable', () => {
    const r = spawnSync(process.execPath, [HOOK_RELAY, DAEMON_UNREACHABLE], {
      input: JSON.stringify({
        hook_type: 'PostToolUse',
        tool_name: 'Read',
        tool_input: {}
      }),
      encoding: 'utf8',
      timeout: 10000
    });
    assert.strictEqual(r.status, 0, `stdout=${r.stdout} stderr=${r.stderr}`);
  });

  it('exits 0 with empty stdin', () => {
    const r = spawnSync(process.execPath, [HOOK_RELAY, DAEMON_FAKE], {
      input: '',
      encoding: 'utf8',
      timeout: 10000
    });
    assert.strictEqual(r.status, 0);
  });

  it('exits 0 with malformed JSON stdin', () => {
    const r = spawnSync(process.execPath, [HOOK_RELAY, DAEMON_FAKE], {
      input: 'not json {{{',
      encoding: 'utf8',
      timeout: 10000
    });
    assert.strictEqual(r.status, 0);
  });

  it('exits 0 when the URL arg is missing', () => {
    const r = spawnSync(process.execPath, [HOOK_RELAY], {
      input: JSON.stringify({ hook_type: 'PostToolUse' }),
      encoding: 'utf8',
      timeout: 10000
    });
    assert.strictEqual(r.status, 0);
  });

  it('exits 0 when the URL arg is malformed', () => {
    const r = spawnSync(process.execPath, [HOOK_RELAY, 'not-a-url-at-all'], {
      input: JSON.stringify({ hook_type: 'PostToolUse' }),
      encoding: 'utf8',
      timeout: 10000
    });
    assert.strictEqual(r.status, 0);
  });

  it('prints nothing to stderr under any failure mode', () => {
    const r = spawnSync(process.execPath, [HOOK_RELAY, DAEMON_UNREACHABLE], {
      input: 'garbage',
      encoding: 'utf8',
      timeout: 10000
    });
    assert.strictEqual(r.stderr, '', `unexpected stderr: ${r.stderr}`);
  });
});

describe('7.23: source hygiene — guard rails against regression', () => {
  it('hook-relay.js source is pure ASCII', () => {
    const src = fs.readFileSync(HOOK_RELAY, 'utf8');
    assert.ok(
      /^[\x00-\x7F]*$/.test(src),
      'hook-relay.js contains non-ASCII characters'
    );
  });

  it('_buildHookCommands body does not re-introduce powershell or Invoke-RestMethod', () => {
    const src = fs.readFileSync(PTY_MANAGER, 'utf8');
    const match = src.match(/_buildHookCommands\(workerName\)\s*\{[\s\S]*?\n  \}/);
    assert.ok(match, 'could not locate _buildHookCommands');
    const codeOnly = stripComments(match[0]);
    assert.doesNotMatch(codeOnly, /powershell/i, 'body must not spawn PowerShell');
    assert.doesNotMatch(codeOnly, /Invoke-RestMethod/i, 'body must not call IRM');
    assert.doesNotMatch(codeOnly, /(^|[\s"'`])curl(\s|$)/, 'body must not spawn curl');
  });

  it('_buildHookCommands body routes all hooks through hook-relay.js', () => {
    const src = fs.readFileSync(PTY_MANAGER, 'utf8');
    const match = src.match(/_buildHookCommands\(workerName\)\s*\{[\s\S]*?\n  \}/);
    const body = match[0];
    assert.ok(
      /hook-relay\.js/.test(body),
      '_buildHookCommands must reference src/hook-relay.js'
    );
  });
});
