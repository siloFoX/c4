'use strict';

const { describe, test, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const McpHandler = require('../src/mcp-handler');
const {
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  LOG_LEVELS,
  TOOLS,
  RESOURCES,
  RESOURCE_TEMPLATES,
  PROMPTS,
  parseTemplateUri,
  negotiateProtocolVersion,
  filterToolsByAllowList,
} = require('../src/mcp-handler');

function makeManager(overrides = {}) {
  const base = {
    create: mock.fn(() => ({ name: 'w1', pid: 1234, status: 'running' })),
    sendTask: mock.fn(() => ({ success: true, branch: 'c4/w1', worktree: '/tmp/wt' })),
    list: mock.fn(() => ({
      workers: [{ name: 'w1', status: 'idle', branch: 'c4/w1', unreadSnapshots: 2, totalSnapshots: 5 }],
      queuedTasks: [],
      lostWorkers: [],
      lastHealthCheck: Date.now(),
    })),
    read: mock.fn(() => ({ content: 'new snapshot', status: 'idle' })),
    readNow: mock.fn(() => ({ content: 'screen now', status: 'busy' })),
    waitAndRead: mock.fn(async () => ({ content: 'waited', status: 'idle' })),
    getScrollback: mock.fn(() => ({ content: 'line1\nline2', lines: 2 })),
    approve: mock.fn(() => ({ success: true })),
    cancelTask: mock.fn(() => ({ success: true, kind: 'interrupt' })),
    restart: mock.fn(() => ({ success: true })),
    rollback: mock.fn(() => ({ success: true, commit: 'abc123' })),
    close: mock.fn(() => ({ success: true })),
    mergeBranch: mock.fn(() => ({ success: true, merged: 'c4/w1' })),
    getTokenUsage: mock.fn(() => ({ today: { total: 100 }, perTask: [] })),
    getValidation: mock.fn(() => ({ name: 'w1', validation: { test_passed: true, test_count: 70 } })),
    getConfig: mock.fn(() => ({})),
  };
  return Object.assign(base, overrides);
}

function rpc(id, method, params) {
  const req = { jsonrpc: '2.0', method };
  if (id !== undefined) req.id = id;
  if (params !== undefined) req.params = params;
  return req;
}

describe('McpHandler - protocol basics', () => {
  let manager, handler;
  beforeEach(() => {
    manager = makeManager();
    handler = new McpHandler(manager);
  });

  test('rejects non-JSON-RPC 2.0 requests', async () => {
    const res = await handler.handle({ jsonrpc: '1.0', id: 1, method: 'initialize' });
    assert.ok(res.error);
    assert.strictEqual(res.error.code, -32600);
  });

  test('rejects missing method', async () => {
    const res = await handler.handle({ jsonrpc: '2.0', id: 1 });
    assert.ok(res.error);
    assert.strictEqual(res.error.code, -32600);
  });

  test('invalid body type returns InvalidRequest', async () => {
    const res = await handler.handle(null);
    assert.ok(res.error);
    assert.strictEqual(res.error.code, -32600);
  });

  test('unknown method returns -32601', async () => {
    const res = await handler.handle(rpc(1, 'foo/bar'));
    assert.strictEqual(res.error.code, -32601);
  });

  test('ping returns empty result', async () => {
    const res = await handler.handle(rpc(1, 'ping'));
    assert.deepStrictEqual(res.result, {});
  });

  test('notifications (no id) produce no response', async () => {
    const res = await handler.handle({ jsonrpc: '2.0', method: 'notifications/initialized' });
    assert.strictEqual(res, null);
    assert.strictEqual(handler.initialized, true);
  });

  test('notifications/initialized with id still resolves for compatibility', async () => {
    const res = await handler.handle(rpc(1, 'notifications/initialized'));
    assert.deepStrictEqual(res.result, {});
    assert.strictEqual(handler.initialized, true);
  });

  test('unknown notification is ignored', async () => {
    const res = await handler.handle({ jsonrpc: '2.0', method: 'notifications/unknown' });
    assert.strictEqual(res, null);
  });
});

describe('McpHandler - initialize handshake', () => {
  let handler;
  beforeEach(() => { handler = new McpHandler(makeManager()); });

  test('advertises the full capability set', async () => {
    const res = await handler.handle(rpc(1, 'initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    }));
    assert.strictEqual(res.result.serverInfo.name, 'c4-mcp');
    assert.strictEqual(res.result.protocolVersion, PROTOCOL_VERSION);
    const caps = res.result.capabilities;
    assert.ok(caps.tools);
    assert.ok(caps.resources);
    assert.ok(caps.prompts);
    assert.ok(caps.logging);
    assert.ok(caps.experimental && caps.experimental.sampling);
  });

  test('negotiates older supported protocol version', async () => {
    const res = await handler.handle(rpc(2, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
    }));
    assert.strictEqual(res.result.protocolVersion, '2024-11-05');
  });

  test('falls back to server default for unknown protocol version', async () => {
    const res = await handler.handle(rpc(3, 'initialize', {
      protocolVersion: '1999-01-01',
      capabilities: {},
    }));
    assert.strictEqual(res.result.protocolVersion, PROTOCOL_VERSION);
  });

  test('stores clientInfo for later inspection', async () => {
    await handler.handle(rpc(4, 'initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'claude-desktop', version: '0.11' },
    }));
    assert.strictEqual(handler.clientInfo.name, 'claude-desktop');
  });
});

describe('McpHandler - tools primitives', () => {
  let manager, handler;
  beforeEach(() => { manager = makeManager(); handler = new McpHandler(manager); });

  test('tools/list returns all 14 registered tools', async () => {
    const res = await handler.handle(rpc(1, 'tools/list'));
    const names = res.result.tools.map((t) => t.name).sort();
    assert.strictEqual(res.result.tools.length, TOOLS.length);
    for (const expected of [
      'create_worker', 'send_task', 'list_workers', 'get_worker_state',
      'read_output', 'get_scrollback', 'approve_worker', 'cancel_task',
      'restart_worker', 'rollback_worker', 'merge_worker', 'close_worker',
      'get_token_usage', 'get_validation',
    ]) {
      assert.ok(names.includes(expected), `missing tool: ${expected}`);
    }
    for (const t of res.result.tools) {
      assert.ok(t.inputSchema && t.inputSchema.type === 'object', `tool ${t.name} missing inputSchema`);
    }
  });

  test('tools/list honors allowedTools filter from config', async () => {
    manager.getConfig = () => ({ mcp: { allowedTools: ['list_workers', 'close_worker'] } });
    const res = await handler.handle(rpc(1, 'tools/list'));
    const names = res.result.tools.map((t) => t.name).sort();
    assert.deepStrictEqual(names, ['close_worker', 'list_workers']);
  });

  test('tools/call create_worker passes name', async () => {
    const res = await handler.handle(rpc(2, 'tools/call', { name: 'create_worker', arguments: { name: 'w1' } }));
    assert.ok(!res.result.isError);
    assert.strictEqual(manager.create.mock.callCount(), 1);
    assert.deepStrictEqual(manager.create.mock.calls[0].arguments, ['w1', 'claude', [], { target: 'local', cwd: '', parent: undefined }]);
  });

  test('tools/call create_worker with parent + target', async () => {
    await handler.handle(rpc(3, 'tools/call', { name: 'create_worker', arguments: { name: 'w2', target: 'dgx', cwd: '/home', parent: 'w1' } }));
    const call = manager.create.mock.calls[0].arguments;
    assert.strictEqual(call[0], 'w2');
    assert.deepStrictEqual(call[3], { target: 'dgx', cwd: '/home', parent: 'w1' });
  });

  test('tools/call send_task forwards all optional flags', async () => {
    await handler.handle(rpc(4, 'tools/call', { name: 'send_task', arguments: { name: 'w1', task: 'do', branch: 'fix/x', scope: { allowFiles: ['src/*'] }, contextFrom: 'w0', plan: true, autoMode: true, budgetUsd: 2.5, maxRetries: 1 } }));
    const call = manager.sendTask.mock.calls[0].arguments;
    assert.strictEqual(call[0], 'w1');
    assert.strictEqual(call[1], 'do');
    assert.deepStrictEqual(call[2], { branch: 'fix/x', scope: { allowFiles: ['src/*'] }, contextFrom: 'w0', planOnly: true, autoMode: true, budgetUsd: 2.5, maxRetries: 1 });
  });

  test('tools/call list_workers', async () => {
    const res = await handler.handle(rpc(5, 'tools/call', { name: 'list_workers', arguments: {} }));
    assert.ok(!res.result.isError);
    const payload = JSON.parse(res.result.content[0].text);
    assert.strictEqual(payload.workers.length, 1);
  });

  test('tools/call get_worker_state returns single record', async () => {
    const res = await handler.handle(rpc(6, 'tools/call', { name: 'get_worker_state', arguments: { name: 'w1' } }));
    const payload = JSON.parse(res.result.content[0].text);
    assert.strictEqual(payload.name, 'w1');
    assert.strictEqual(payload.status, 'idle');
  });

  test('tools/call get_worker_state returns error on missing worker', async () => {
    const res = await handler.handle(rpc(6, 'tools/call', { name: 'get_worker_state', arguments: { name: 'missing' } }));
    assert.strictEqual(res.result.isError, true);
  });

  test('tools/call read_output default mode', async () => {
    await handler.handle(rpc(7, 'tools/call', { name: 'read_output', arguments: { name: 'w1' } }));
    assert.deepStrictEqual(manager.read.mock.calls[0].arguments, ['w1']);
  });

  test('tools/call read_output mode=now', async () => {
    await handler.handle(rpc(8, 'tools/call', { name: 'read_output', arguments: { name: 'w1', mode: 'now' } }));
    assert.deepStrictEqual(manager.readNow.mock.calls[0].arguments, ['w1']);
  });

  test('tools/call read_output mode=wait respects timeout', async () => {
    await handler.handle(rpc(9, 'tools/call', { name: 'read_output', arguments: { name: 'w1', mode: 'wait', timeout: 5000 } }));
    assert.deepStrictEqual(manager.waitAndRead.mock.calls[0].arguments, ['w1', 5000]);
  });

  test('tools/call get_scrollback forwards lines', async () => {
    await handler.handle(rpc(10, 'tools/call', { name: 'get_scrollback', arguments: { name: 'w1', lines: 50 } }));
    assert.deepStrictEqual(manager.getScrollback.mock.calls[0].arguments, ['w1', 50]);
  });

  test('tools/call approve_worker forwards optionNumber', async () => {
    await handler.handle(rpc(11, 'tools/call', { name: 'approve_worker', arguments: { name: 'w1', optionNumber: 2 } }));
    assert.deepStrictEqual(manager.approve.mock.calls[0].arguments, ['w1', 2]);
  });

  test('tools/call cancel_task invokes manager.cancelTask', async () => {
    await handler.handle(rpc(12, 'tools/call', { name: 'cancel_task', arguments: { name: 'w1' } }));
    assert.strictEqual(manager.cancelTask.mock.callCount(), 1);
  });

  test('tools/call restart_worker invokes manager.restart', async () => {
    await handler.handle(rpc(13, 'tools/call', { name: 'restart_worker', arguments: { name: 'w1' } }));
    assert.strictEqual(manager.restart.mock.callCount(), 1);
  });

  test('tools/call rollback_worker invokes manager.rollback', async () => {
    await handler.handle(rpc(14, 'tools/call', { name: 'rollback_worker', arguments: { name: 'w1' } }));
    assert.strictEqual(manager.rollback.mock.callCount(), 1);
  });

  test('tools/call merge_worker uses mergeBranch when available', async () => {
    const res = await handler.handle(rpc(15, 'tools/call', { name: 'merge_worker', arguments: { name: 'w1' } }));
    assert.strictEqual(manager.mergeBranch.mock.callCount(), 1);
    const payload = JSON.parse(res.result.content[0].text);
    assert.strictEqual(payload.merged, 'c4/w1');
  });

  test('tools/call merge_worker returns error when manager lacks mergeBranch', async () => {
    delete manager.mergeBranch;
    const res = await handler.handle(rpc(16, 'tools/call', { name: 'merge_worker', arguments: { name: 'w1' } }));
    assert.strictEqual(res.result.isError, true);
  });

  test('tools/call close_worker invokes manager.close', async () => {
    await handler.handle(rpc(17, 'tools/call', { name: 'close_worker', arguments: { name: 'w1' } }));
    assert.strictEqual(manager.close.mock.callCount(), 1);
  });

  test('tools/call get_token_usage forwards perTask flag', async () => {
    await handler.handle(rpc(18, 'tools/call', { name: 'get_token_usage', arguments: { perTask: true } }));
    assert.deepStrictEqual(manager.getTokenUsage.mock.calls[0].arguments, [{ perTask: true }]);
  });

  test('tools/call get_validation', async () => {
    await handler.handle(rpc(19, 'tools/call', { name: 'get_validation', arguments: { name: 'w1' } }));
    assert.deepStrictEqual(manager.getValidation.mock.calls[0].arguments, ['w1']);
  });

  test('tools/call with missing required arg returns isError', async () => {
    const res = await handler.handle(rpc(20, 'tools/call', { name: 'create_worker', arguments: {} }));
    assert.strictEqual(res.result.isError, true);
  });

  test('tools/call with unknown tool returns InvalidParams', async () => {
    const res = await handler.handle(rpc(21, 'tools/call', { name: 'unknown', arguments: {} }));
    assert.strictEqual(res.error.code, -32602);
  });

  test('tools/call blocked by allowedTools is rejected', async () => {
    manager.getConfig = () => ({ mcp: { allowedTools: ['list_workers'] } });
    const res = await handler.handle(rpc(22, 'tools/call', { name: 'close_worker', arguments: { name: 'w1' } }));
    assert.strictEqual(res.error.code, -32602);
    assert.ok(/allowedTools/.test(res.error.message));
  });

  test('tools/call propagates manager error as isError content', async () => {
    manager.create.mock.mockImplementation(() => ({ error: 'already exists' }));
    const res = await handler.handle(rpc(23, 'tools/call', { name: 'create_worker', arguments: { name: 'dup' } }));
    assert.strictEqual(res.result.isError, true);
    const payload = JSON.parse(res.result.content[0].text);
    assert.ok(payload.error.includes('already'));
  });
});

describe('McpHandler - resources primitives', () => {
  let manager, handler;
  beforeEach(() => { manager = makeManager(); handler = new McpHandler(manager); });

  test('resources/list returns the static catalogue', async () => {
    const res = await handler.handle(rpc(1, 'resources/list'));
    const names = res.result.resources.map((r) => r.name).sort();
    assert.deepStrictEqual(names, ['session-context', 'token-usage', 'workers']);
  });

  test('resources/templates/list returns worker-scoped URI templates', async () => {
    const res = await handler.handle(rpc(2, 'resources/templates/list'));
    const templates = res.result.resourceTemplates.map((t) => t.uriTemplate).sort();
    assert.ok(templates.includes('c4://worker/{name}/state'));
    assert.ok(templates.includes('c4://worker/{name}/scrollback'));
    assert.ok(templates.includes('c4://worker/{name}/validation'));
  });

  test('resources/read c4://workers returns JSON', async () => {
    const res = await handler.handle(rpc(3, 'resources/read', { uri: 'c4://workers' }));
    assert.strictEqual(res.result.contents[0].mimeType, 'application/json');
    const parsed = JSON.parse(res.result.contents[0].text);
    assert.ok(Array.isArray(parsed.workers));
  });

  test('resources/read c4://token-usage calls manager.getTokenUsage', async () => {
    await handler.handle(rpc(4, 'resources/read', { uri: 'c4://token-usage' }));
    assert.strictEqual(manager.getTokenUsage.mock.callCount(), 1);
  });

  test('resources/read worker state template resolves to single record', async () => {
    const res = await handler.handle(rpc(5, 'resources/read', { uri: 'c4://worker/w1/state' }));
    const parsed = JSON.parse(res.result.contents[0].text);
    assert.strictEqual(parsed.name, 'w1');
  });

  test('resources/read worker scrollback template calls getScrollback', async () => {
    await handler.handle(rpc(6, 'resources/read', { uri: 'c4://worker/w1/scrollback' }));
    assert.strictEqual(manager.getScrollback.mock.callCount(), 1);
    assert.deepStrictEqual(manager.getScrollback.mock.calls[0].arguments, ['w1', 200]);
  });

  test('resources/read worker validation template calls getValidation', async () => {
    await handler.handle(rpc(7, 'resources/read', { uri: 'c4://worker/w1/validation' }));
    assert.strictEqual(manager.getValidation.mock.callCount(), 1);
  });

  test('resources/read rejects unknown URI', async () => {
    const res = await handler.handle(rpc(8, 'resources/read', { uri: 'c4://nonsense' }));
    assert.strictEqual(res.error.code, -32602);
  });

  test('resources/read rejects missing URI', async () => {
    const res = await handler.handle(rpc(9, 'resources/read', {}));
    assert.strictEqual(res.error.code, -32602);
  });

  test('parseTemplateUri helper extracts name and kind', () => {
    assert.deepStrictEqual(parseTemplateUri('c4://worker/w1/state'), { kind: 'state', name: 'w1' });
    assert.deepStrictEqual(parseTemplateUri('c4://worker/w%20one/scrollback'), { kind: 'scrollback', name: 'w one' });
    assert.strictEqual(parseTemplateUri('c4://worker/w1/bogus'), null);
    assert.strictEqual(parseTemplateUri('not a uri'), null);
  });
});

describe('McpHandler - prompts primitives', () => {
  let handler;
  beforeEach(() => { handler = new McpHandler(makeManager()); });

  test('prompts/list returns all registered prompts', async () => {
    const res = await handler.handle(rpc(1, 'prompts/list'));
    const names = res.result.prompts.map((p) => p.name).sort();
    assert.deepStrictEqual(names, ['review-merge', 'run-task', 'triage-worker']);
  });

  test('prompts/get run-task builds task message', async () => {
    const res = await handler.handle(rpc(2, 'prompts/get', { name: 'run-task', arguments: { worker: 'w1', task: 'fix auth bug', branch: 'fix/auth' } }));
    assert.ok(res.result.messages.length >= 1);
    const text = res.result.messages[0].content.text;
    assert.ok(text.includes('w1'));
    assert.ok(text.includes('fix auth bug'));
    assert.ok(text.includes('fix/auth'));
  });

  test('prompts/get triage-worker requires worker arg', async () => {
    const res = await handler.handle(rpc(3, 'prompts/get', { name: 'triage-worker', arguments: {} }));
    assert.strictEqual(res.error.code, -32602);
  });

  test('prompts/get rejects unknown prompt', async () => {
    const res = await handler.handle(rpc(4, 'prompts/get', { name: 'nonsense' }));
    assert.strictEqual(res.error.code, -32602);
  });
});

describe('McpHandler - logging primitive', () => {
  let handler;
  beforeEach(() => { handler = new McpHandler(makeManager()); });

  test('defaults to info', () => {
    assert.strictEqual(handler.logLevel, 'info');
  });

  test('logging/setLevel accepts every syslog level', async () => {
    for (const level of LOG_LEVELS) {
      const res = await handler.handle(rpc(1, 'logging/setLevel', { level }));
      assert.deepStrictEqual(res.result, {});
      assert.strictEqual(handler.logLevel, level);
    }
  });

  test('logging/setLevel rejects unsupported level', async () => {
    const res = await handler.handle(rpc(2, 'logging/setLevel', { level: 'verbose' }));
    assert.strictEqual(res.error.code, -32602);
  });
});

describe('McpHandler - helpers', () => {
  test('negotiateProtocolVersion pins known versions', () => {
    for (const v of SUPPORTED_PROTOCOL_VERSIONS) {
      assert.strictEqual(negotiateProtocolVersion(v), v);
    }
  });

  test('negotiateProtocolVersion falls back to latest', () => {
    assert.strictEqual(negotiateProtocolVersion('9999-99-99'), PROTOCOL_VERSION);
    assert.strictEqual(negotiateProtocolVersion(undefined), PROTOCOL_VERSION);
  });

  test('filterToolsByAllowList no-op on empty list', () => {
    assert.strictEqual(filterToolsByAllowList(TOOLS, []).length, TOOLS.length);
    assert.strictEqual(filterToolsByAllowList(TOOLS, null).length, TOOLS.length);
  });

  test('filterToolsByAllowList selects requested names only', () => {
    const subset = filterToolsByAllowList(TOOLS, ['list_workers', 'close_worker']);
    assert.deepStrictEqual(subset.map((t) => t.name).sort(), ['close_worker', 'list_workers']);
  });

  test('static catalogues export sane shapes', () => {
    for (const t of TOOLS) {
      assert.ok(t.name && t.description && t.inputSchema);
    }
    for (const r of RESOURCES) {
      assert.ok(r.uri && r.name && r.mimeType);
    }
    for (const tpl of RESOURCE_TEMPLATES) {
      assert.ok(tpl.uriTemplate.includes('{name}'));
    }
    for (const p of PROMPTS) {
      assert.ok(p.name && Array.isArray(p.arguments));
    }
  });
});
