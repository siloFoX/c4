// 11.1 MCP hub: ensure _resolveMcpServersForWorker selects the right
// servers from config.mcp.servers and that _buildWorkerSettings injects
// them under settings.mcpServers.

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');

const PtyManager = require('../src/pty-manager');

function makeManager(config) {
  const mgr = Object.create(PtyManager.prototype);
  mgr.config = config;
  // Stubs that _buildWorkerSettings touches but we don't care about here.
  mgr._isAutoModeEnabled = () => false;
  mgr._applyAutoMode = () => {};
  mgr._buildAutoManagerPermissions = () => ({ allow: [], deny: [] });
  mgr._buildHookCommands = () => ({ PreToolUse: [], PostToolUse: [] });
  mgr._buildCompoundBlockCommand = () => 'true';
  mgr.projectRoot = null;
  return mgr;
}

const SERVERS = {
  filesystem: { command: 'npx', args: ['fs-mcp'] },
  github:     { command: 'npx', args: ['gh-mcp'] },
  chrome:     { command: 'npx', args: ['chrome-mcp'] },
};

describe('_resolveMcpServersForWorker (11.1)', () => {
  it('returns null when no defaults / profile / options select anything', () => {
    const mgr = makeManager({ mcp: { servers: SERVERS } });
    assert.strictEqual(mgr._resolveMcpServersForWorker(null, {}), null);
  });

  it('uses workerDefaults.mcpServers when no profile / option override', () => {
    const mgr = makeManager({
      mcp: { servers: SERVERS },
      workerDefaults: { mcpServers: ['filesystem', 'chrome'] },
    });
    const r = mgr._resolveMcpServersForWorker(null, {});
    assert.deepStrictEqual(Object.keys(r).sort(), ['chrome', 'filesystem']);
  });

  it('profile.mcp overrides workerDefaults', () => {
    const mgr = makeManager({
      mcp: { servers: SERVERS },
      workerDefaults: { mcpServers: ['filesystem'] },
    });
    const r = mgr._resolveMcpServersForWorker({ mcp: ['github'] }, {});
    assert.deepStrictEqual(Object.keys(r), ['github']);
  });

  it('options.mcpServers overrides profile + workerDefaults', () => {
    const mgr = makeManager({
      mcp: { servers: SERVERS },
      workerDefaults: { mcpServers: ['filesystem'] },
    });
    const r = mgr._resolveMcpServersForWorker({ mcp: ['github'] }, { mcpServers: ['chrome'] });
    assert.deepStrictEqual(Object.keys(r), ['chrome']);
  });

  it('drops names that are not registered in config.mcp.servers', () => {
    const mgr = makeManager({ mcp: { servers: SERVERS } });
    const r = mgr._resolveMcpServersForWorker(null, { mcpServers: ['filesystem', 'nope'] });
    assert.deepStrictEqual(Object.keys(r), ['filesystem']);
  });
});

describe('_buildWorkerSettings injects mcpServers (11.1)', () => {
  it('attaches mcpServers when selection produces servers', () => {
    const mgr = makeManager({
      mcp: { servers: SERVERS },
      workerDefaults: { mcpServers: ['filesystem'] },
      hooks: { enabled: false },
    });
    const settings = mgr._buildWorkerSettings('w1');
    assert.ok(settings.mcpServers);
    assert.deepStrictEqual(settings.mcpServers.filesystem, SERVERS.filesystem);
  });

  it('omits mcpServers when no servers selected', () => {
    const mgr = makeManager({
      mcp: { servers: SERVERS },
      hooks: { enabled: false },
    });
    const settings = mgr._buildWorkerSettings('w1');
    assert.strictEqual(settings.mcpServers, undefined);
  });
});
