// (11.1) MCP Hub tests.
//
// Exercises src/mcp-hub.js against an isolated tmpdir so the suite
// never writes to the operator's real ~/.c4/mcp-servers.json.
//
// Coverage targets:
//  - registerServer validates required fields (name, command) and
//    transport enum
//  - listServers filters by enabled + transport
//  - enable/disable gates .mcp.json generation
//  - updateServer patches individual fields (command, args, env,
//    transport, description, enabled)
//  - unregisterServer / getServerConfig behaviour
//  - Storage roundtrip (reload, missing file, malformed JSON)
//  - Duplicate name rejection + invalid transport rejection
//  - buildMcpJson shape for stdio + http transports
//  - writeWorkerMcpJson writes the file, returns the path, and
//    produces no file when no servers selected
//  - Profile integration: profile.mcpServers -> .mcp.json content
//    (bridges the hub + the pty-manager layer that consumes it)
//  - ensureShape / normalizeServer edge cases

'use strict';
require('./jest-shim');

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  McpHub,
  VALID_TRANSPORTS,
  DEFAULT_TRANSPORT,
  NAME_PATTERN,
  defaultStorePath,
  isValidName,
  isValidTransport,
  normalizeServer,
  freshState,
  ensureShape,
} = require('../src/mcp-hub');

function mkTmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-mcp-test-'));
  return path.join(dir, 'mcp-servers.json');
}

function mkTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix + '-'));
}

function newHub() {
  return new McpHub({ storePath: mkTmpStore() });
}

describe('(11.1) mcp-hub helpers', () => {
  test('(a) defaultStorePath resolves under homedir/.c4/mcp-servers.json', () => {
    const p = defaultStorePath();
    expect(p.endsWith(path.join('.c4', 'mcp-servers.json'))).toBe(true);
    expect(p.startsWith(os.homedir())).toBe(true);
  });

  test('(b) VALID_TRANSPORTS lists stdio + http, DEFAULT_TRANSPORT is stdio', () => {
    expect(VALID_TRANSPORTS.includes('stdio')).toBe(true);
    expect(VALID_TRANSPORTS.includes('http')).toBe(true);
    expect(VALID_TRANSPORTS.length).toBe(2);
    expect(DEFAULT_TRANSPORT).toBe('stdio');
  });

  test('(c) NAME_PATTERN accepts dots/underscores/hyphens but rejects spaces', () => {
    expect(NAME_PATTERN.test('chrome-devtools')).toBe(true);
    expect(NAME_PATTERN.test('google_cal')).toBe(true);
    expect(NAME_PATTERN.test('v1.2')).toBe(true);
    expect(NAME_PATTERN.test('bad name')).toBe(false);
    expect(NAME_PATTERN.test('bad/name')).toBe(false);
  });

  test('(d) isValidName + isValidTransport reject empty + unknown values', () => {
    expect(isValidName('good')).toBe(true);
    expect(isValidName('')).toBe(false);
    expect(isValidName(null)).toBe(false);
    expect(isValidTransport('stdio')).toBe(true);
    expect(isValidTransport('http')).toBe(true);
    expect(isValidTransport('grpc')).toBe(false);
    expect(isValidTransport('')).toBe(false);
  });

  test('(e) normalizeServer fills defaults and coerces bad input', () => {
    const s = normalizeServer({ name: 's', command: 'cmd' });
    expect(s.enabled).toBe(true);
    expect(s.transport).toBe('stdio');
    expect(s.args).toEqual([]);
    expect(s.env).toEqual({});
    expect(s.description).toBe('');
  });

  test('(f) normalizeServer drops non-string args + env entries', () => {
    const s = normalizeServer({
      name: 's',
      command: 'cmd',
      args: ['ok', 7, null, 'two'],
      env: { A: 'a', B: 5, C: 'c' },
    });
    expect(s.args).toEqual(['ok', 'two']);
    expect(s.env).toEqual({ A: 'a', C: 'c' });
  });

  test('(g) normalizeServer preserves enabled=false + http transport', () => {
    const s = normalizeServer({
      name: 's',
      command: 'https://example',
      enabled: false,
      transport: 'http',
    });
    expect(s.enabled).toBe(false);
    expect(s.transport).toBe('http');
  });

  test('(h) freshState returns an empty servers map', () => {
    expect(freshState()).toEqual({ servers: {} });
  });

  test('(i) ensureShape drops entries with missing command or invalid name', () => {
    const shaped = ensureShape({
      servers: {
        'good': { command: 'cmd' },
        '': { command: 'cmd' },
        'bad name': { command: 'cmd' },
        'missing-cmd': { command: '' },
      },
    });
    expect(Object.keys(shaped.servers)).toEqual(['good']);
    expect(shaped.servers.good.command).toBe('cmd');
  });
});

describe('(11.1) registerServer', () => {
  test('(a) registerServer persists and returns the server object', () => {
    const hub = newHub();
    const s = hub.registerServer({ name: 'chrome', command: 'npx chrome-mcp' });
    expect(s.name).toBe('chrome');
    expect(s.command).toBe('npx chrome-mcp');
    expect(s.enabled).toBe(true);
    expect(s.transport).toBe('stdio');
    expect(hub.getServerConfig('chrome').name).toBe('chrome');
  });

  test('(b) registerServer rejects missing name', () => {
    const hub = newHub();
    let err;
    try { hub.registerServer({ command: 'cmd' }); } catch (e) { err = e; }
    expect(Boolean(err)).toBe(true);
    expect(err.message.includes('name')).toBe(true);
  });

  test('(c) registerServer rejects missing command', () => {
    const hub = newHub();
    let err;
    try { hub.registerServer({ name: 'x' }); } catch (e) { err = e; }
    expect(Boolean(err)).toBe(true);
    expect(err.message.includes('command')).toBe(true);
  });

  test('(d) registerServer rejects duplicate names', () => {
    const hub = newHub();
    hub.registerServer({ name: 'dup', command: 'a' });
    let err;
    try { hub.registerServer({ name: 'dup', command: 'b' }); } catch (e) { err = e; }
    expect(Boolean(err)).toBe(true);
    expect(err.message.includes('already exists')).toBe(true);
  });

  test('(e) registerServer rejects invalid transport', () => {
    const hub = newHub();
    let err;
    try {
      hub.registerServer({ name: 'x', command: 'a', transport: 'grpc' });
    } catch (e) { err = e; }
    expect(Boolean(err)).toBe(true);
    expect(err.message.includes('transport')).toBe(true);
  });

  test('(f) registerServer rejects invalid name with spaces', () => {
    const hub = newHub();
    let err;
    try {
      hub.registerServer({ name: 'bad name', command: 'a' });
    } catch (e) { err = e; }
    expect(Boolean(err)).toBe(true);
  });

  test('(g) registerServer accepts http transport with URL command', () => {
    const hub = newHub();
    const s = hub.registerServer({
      name: 'remote',
      command: 'https://mcp.example.com/stream',
      transport: 'http',
      env: { 'X-Api-Key': 'k1' },
    });
    expect(s.transport).toBe('http');
    expect(s.command).toBe('https://mcp.example.com/stream');
    expect(s.env['X-Api-Key']).toBe('k1');
  });
});

describe('(11.1) list / update / delete', () => {
  test('(a) listServers filters by enabled', () => {
    const hub = newHub();
    hub.registerServer({ name: 'a', command: 'ca' });
    hub.registerServer({ name: 'b', command: 'cb', enabled: false });
    const allOn = hub.listServers({ enabled: true });
    const allOff = hub.listServers({ enabled: false });
    expect(allOn.length).toBe(1);
    expect(allOn[0].name).toBe('a');
    expect(allOff.length).toBe(1);
    expect(allOff[0].name).toBe('b');
  });

  test('(b) listServers filters by transport', () => {
    const hub = newHub();
    hub.registerServer({ name: 'a', command: 'ca', transport: 'stdio' });
    hub.registerServer({ name: 'b', command: 'https://b', transport: 'http' });
    expect(hub.listServers({ transport: 'http' }).length).toBe(1);
    expect(hub.listServers({ transport: 'stdio' }).length).toBe(1);
  });

  test('(c) listServers returns sorted by name with no filter', () => {
    const hub = newHub();
    hub.registerServer({ name: 'zeta', command: 'z' });
    hub.registerServer({ name: 'alpha', command: 'a' });
    hub.registerServer({ name: 'mid', command: 'm' });
    const names = hub.listServers().map((s) => s.name);
    expect(names).toEqual(['alpha', 'mid', 'zeta']);
  });

  test('(d) updateServer patches command, args, env, description', () => {
    const hub = newHub();
    hub.registerServer({ name: 'x', command: 'orig' });
    const updated = hub.updateServer('x', {
      command: 'new',
      args: ['--flag'],
      env: { K: 'V' },
      description: 'better',
    });
    expect(updated.command).toBe('new');
    expect(updated.args).toEqual(['--flag']);
    expect(updated.env).toEqual({ K: 'V' });
    expect(updated.description).toBe('better');
  });

  test('(e) updateServer rejects invalid transport', () => {
    const hub = newHub();
    hub.registerServer({ name: 'x', command: 'c' });
    let err;
    try { hub.updateServer('x', { transport: 'grpc' }); } catch (e) { err = e; }
    expect(Boolean(err)).toBe(true);
  });

  test('(f) updateServer throws when server missing', () => {
    const hub = newHub();
    let err;
    try { hub.updateServer('none', { command: 'x' }); } catch (e) { err = e; }
    expect(Boolean(err)).toBe(true);
    expect(err.message.includes('not found')).toBe(true);
  });

  test('(g) unregisterServer returns false for missing, true for present', () => {
    const hub = newHub();
    expect(hub.unregisterServer('nope')).toBe(false);
    hub.registerServer({ name: 'tmp', command: 'c' });
    expect(hub.unregisterServer('tmp')).toBe(true);
    expect(hub.getServerConfig('tmp')).toBe(null);
  });

  test('(h) enableServer + disableServer flip the flag and persist', () => {
    const hub = newHub();
    hub.registerServer({ name: 'x', command: 'c' });
    const off = hub.disableServer('x');
    expect(off.enabled).toBe(false);
    const on = hub.enableServer('x');
    expect(on.enabled).toBe(true);
  });
});

describe('(11.1) storage roundtrip', () => {
  test('(a) state survives reload through a fresh McpHub on the same path', () => {
    const storePath = mkTmpStore();
    const hub1 = new McpHub({ storePath });
    hub1.registerServer({ name: 'keep', command: 'c', description: 'persists' });
    const hub2 = new McpHub({ storePath });
    const got = hub2.getServerConfig('keep');
    expect(got && got.name).toBe('keep');
    expect(got && got.description).toBe('persists');
  });

  test('(b) missing file produces empty state, no throw', () => {
    const storePath = path.join(mkTmpDir('c4-mcp-missing'), 'none.json');
    const hub = new McpHub({ storePath });
    expect(hub.listServers()).toEqual([]);
  });

  test('(c) malformed JSON falls back to fresh state without throwing', () => {
    const storePath = mkTmpStore();
    fs.writeFileSync(storePath, '{not-valid-json');
    const hub = new McpHub({ storePath });
    expect(hub.listServers()).toEqual([]);
  });

  test('(d) reload() re-reads the file and picks up external mutations', () => {
    const storePath = mkTmpStore();
    const hub = new McpHub({ storePath });
    hub.registerServer({ name: 'a', command: 'c' });
    // Externally mutate: drop the server from the file
    fs.writeFileSync(storePath, JSON.stringify({ servers: {} }, null, 2) + '\n');
    hub.reload();
    expect(hub.listServers()).toEqual([]);
  });
});

describe('(11.1) buildMcpJson / writeWorkerMcpJson', () => {
  test('(a) buildMcpJson emits stdio entries with command/args/env', () => {
    const hub = newHub();
    hub.registerServer({
      name: 'chrome',
      command: 'npx',
      args: ['@anthropic-ai/chrome-devtools-mcp@latest'],
      env: { PORT: '9222' },
    });
    const out = hub.buildMcpJson(['chrome']);
    expect(out.mcpServers.chrome.command).toBe('npx');
    expect(out.mcpServers.chrome.args).toEqual(['@anthropic-ai/chrome-devtools-mcp@latest']);
    expect(out.mcpServers.chrome.env.PORT).toBe('9222');
  });

  test('(b) buildMcpJson emits http entries with type+url+headers', () => {
    const hub = newHub();
    hub.registerServer({
      name: 'remote',
      command: 'https://mcp.example/stream',
      transport: 'http',
      env: { Authorization: 'Bearer t1' },
    });
    const out = hub.buildMcpJson(['remote']);
    expect(out.mcpServers.remote.type).toBe('http');
    expect(out.mcpServers.remote.url).toBe('https://mcp.example/stream');
    expect(out.mcpServers.remote.headers.Authorization).toBe('Bearer t1');
  });

  test('(c) buildMcpJson skips disabled servers (enable/disable gate)', () => {
    const hub = newHub();
    hub.registerServer({ name: 'on', command: 'a' });
    hub.registerServer({ name: 'off', command: 'b', enabled: false });
    const out = hub.buildMcpJson(['on', 'off']);
    expect(Object.keys(out.mcpServers)).toEqual(['on']);
  });

  test('(d) buildMcpJson skips unknown names without throwing', () => {
    const hub = newHub();
    hub.registerServer({ name: 'real', command: 'c' });
    const out = hub.buildMcpJson(['real', 'ghost', 'invalid name']);
    expect(Object.keys(out.mcpServers)).toEqual(['real']);
  });

  test('(e) writeWorkerMcpJson writes .mcp.json and returns the path', () => {
    const hub = newHub();
    hub.registerServer({ name: 'cal', command: 'npx', args: ['cal-mcp'] });
    const worktree = mkTmpDir('c4-mcp-wt');
    const target = hub.writeWorkerMcpJson(worktree, ['cal']);
    expect(target).toBe(path.join(worktree, '.mcp.json'));
    const written = JSON.parse(fs.readFileSync(target, 'utf8'));
    expect(written.mcpServers.cal.command).toBe('npx');
  });

  test('(f) writeWorkerMcpJson returns null when no names provided', () => {
    const hub = newHub();
    const worktree = mkTmpDir('c4-mcp-empty');
    expect(hub.writeWorkerMcpJson(worktree, [])).toBe(null);
    expect(fs.existsSync(path.join(worktree, '.mcp.json'))).toBe(false);
  });

  test('(g) writeWorkerMcpJson returns null when all names are disabled/unknown', () => {
    const hub = newHub();
    hub.registerServer({ name: 'off', command: 'c', enabled: false });
    const worktree = mkTmpDir('c4-mcp-allblocked');
    expect(hub.writeWorkerMcpJson(worktree, ['off', 'ghost'])).toBe(null);
    expect(fs.existsSync(path.join(worktree, '.mcp.json'))).toBe(false);
  });

  test('(h) disabled server that gets re-enabled lands in next .mcp.json', () => {
    const hub = newHub();
    hub.registerServer({ name: 'toggle', command: 'c', enabled: false });
    const wt1 = mkTmpDir('c4-mcp-toggle1');
    expect(hub.writeWorkerMcpJson(wt1, ['toggle'])).toBe(null);
    hub.enableServer('toggle');
    const wt2 = mkTmpDir('c4-mcp-toggle2');
    const target = hub.writeWorkerMcpJson(wt2, ['toggle']);
    expect(target).not.toBe(null);
    const written = JSON.parse(fs.readFileSync(target, 'utf8'));
    expect(Object.keys(written.mcpServers)).toEqual(['toggle']);
  });
});

describe('(11.1) profile integration', () => {
  test('(a) profile.mcpServers -> .mcp.json content via pty-manager seam', () => {
    // Simulate the pty-manager seam: profile lists a subset of hub
    // server names; we expect the generated .mcp.json to contain only
    // those that are both registered AND enabled.
    const hub = newHub();
    hub.registerServer({ name: 'gmail', command: 'npx gmail-mcp' });
    hub.registerServer({ name: 'cal', command: 'npx cal-mcp' });
    hub.registerServer({ name: 'slack', command: 'npx slack-mcp', enabled: false });
    const profile = { mcpServers: ['gmail', 'slack'] };
    const worktree = mkTmpDir('c4-mcp-profile');
    const target = hub.writeWorkerMcpJson(worktree, profile.mcpServers);
    expect(target).not.toBe(null);
    const written = JSON.parse(fs.readFileSync(target, 'utf8'));
    expect(Object.keys(written.mcpServers).sort()).toEqual(['gmail']);
  });

  test('(b) profile with no mcpServers field yields no .mcp.json', () => {
    const hub = newHub();
    hub.registerServer({ name: 'x', command: 'c' });
    const worktree = mkTmpDir('c4-mcp-noprofile');
    // pty-manager guards against empty profile.mcpServers; simulate it.
    const names = Array.isArray(undefined) ? undefined : [];
    const target = hub.writeWorkerMcpJson(worktree, names);
    expect(target).toBe(null);
  });

  test('(c) profile listing a ghost server produces no file when all miss', () => {
    const hub = newHub();
    hub.registerServer({ name: 'present', command: 'c' });
    const worktree = mkTmpDir('c4-mcp-ghost');
    expect(hub.writeWorkerMcpJson(worktree, ['ghost-only'])).toBe(null);
  });

  test('(d) pty-manager listProfiles surfaces the mcpServers field', () => {
    // This asserts the contract between profile config and the CLI/UI
    // that reads `listProfiles`: the mcpServers array must survive the
    // mapping so operators know which servers a profile will auto-load.
    const PtyManager = require('../src/pty-manager');
    const mgr = new PtyManager();
    // Inject a synthetic profile so we avoid touching config.json.
    mgr.config = Object.assign({}, mgr.config, {
      profiles: {
        automation: {
          description: 'bundle for automation workers',
          permissions: { allow: ['Read'], deny: [] },
          mcpServers: ['gmail', 'cal'],
        },
      },
    });
    const listed = mgr.listProfiles();
    expect(listed.automation.mcpServers).toEqual(['gmail', 'cal']);
  });
});
