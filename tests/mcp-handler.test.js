const { describe, test, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const McpHandler = require('../src/mcp-handler');

// Mock PtyManager
function createMockManager() {
  return {
    create: mock.fn(() => ({ name: 'w1', pid: 1234, status: 'running' })),
    sendTask: mock.fn(() => ({ success: true, branch: 'c4/w1', worktree: '/tmp/wt' })),
    list: mock.fn(() => ({
      workers: [{ name: 'w1', status: 'idle', unreadSnapshots: 2 }],
      queuedTasks: [],
      lostWorkers: [],
      lastHealthCheck: Date.now()
    })),
    read: mock.fn(() => ({ content: 'hello world', status: 'idle', snapshotsRead: 1 })),
    readNow: mock.fn(() => ({ content: 'screen now', status: 'busy' })),
    waitAndRead: mock.fn(async () => ({ content: 'waited', status: 'idle' })),
    close: mock.fn(() => ({ success: true, name: 'w1' })),
  };
}

describe('McpHandler', () => {
  let handler, manager;

  beforeEach(() => {
    manager = createMockManager();
    handler = new McpHandler(manager);
  });

  test('rejects non-JSON-RPC 2.0 requests', async () => {
    const res = await handler.handle({ jsonrpc: '1.0', id: 1, method: 'initialize' });
    assert.ok(res.error !== undefined);
    assert.strictEqual(res.error.code, -32600);
  });

  test('initialize returns server info', async () => {
    const res = await handler.handle({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    assert.strictEqual(res.result.serverInfo.name, 'c4-mcp');
    assert.ok(res.result.capabilities.tools !== undefined);
  });

  test('tools/list returns all 5 tools', async () => {
    const res = await handler.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    assert.strictEqual(res.result.tools.length, 5);
    const names = res.result.tools.map(t => t.name);
    assert.ok(names.includes('create_worker'));
    assert.ok(names.includes('send_task'));
    assert.ok(names.includes('list_workers'));
    assert.ok(names.includes('read_output'));
    assert.ok(names.includes('close_worker'));
  });

  test('tools/call create_worker', async () => {
    const res = await handler.handle({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'create_worker', arguments: { name: 'w1' } }
    });
    assert.ok(!res.result.isError);
    assert.strictEqual(manager.create.mock.callCount(), 1);
    assert.deepStrictEqual(manager.create.mock.calls[0].arguments, ['w1', 'claude', [], { target: 'local', cwd: '' }]);
  });

  test('tools/call create_worker with options', async () => {
    await handler.handle({
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'create_worker', arguments: { name: 'w2', command: 'bash', target: 'dgx', cwd: '/home' } }
    });
    assert.deepStrictEqual(manager.create.mock.calls[0].arguments, ['w2', 'bash', [], { target: 'dgx', cwd: '/home' }]);
  });

  test('tools/call send_task', async () => {
    const res = await handler.handle({
      jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: { name: 'send_task', arguments: { name: 'w1', task: 'add logging' } }
    });
    assert.ok(!res.result.isError);
    assert.deepStrictEqual(manager.sendTask.mock.calls[0].arguments, ['w1', 'add logging', {}]);
  });

  test('tools/call send_task with branch and scope', async () => {
    await handler.handle({
      jsonrpc: '2.0', id: 6, method: 'tools/call',
      params: { name: 'send_task', arguments: { name: 'w1', task: 'fix bug', branch: 'fix/bug', scope: { allowFiles: ['src/*'] } } }
    });
    assert.deepStrictEqual(manager.sendTask.mock.calls[0].arguments, ['w1', 'fix bug', { branch: 'fix/bug', scope: { allowFiles: ['src/*'] } }]);
  });

  test('tools/call list_workers', async () => {
    const res = await handler.handle({
      jsonrpc: '2.0', id: 7, method: 'tools/call',
      params: { name: 'list_workers', arguments: {} }
    });
    assert.ok(!res.result.isError);
    assert.strictEqual(manager.list.mock.callCount(), 1);
  });

  test('tools/call read_output default mode (snapshots)', async () => {
    const res = await handler.handle({
      jsonrpc: '2.0', id: 8, method: 'tools/call',
      params: { name: 'read_output', arguments: { name: 'w1' } }
    });
    assert.ok(!res.result.isError);
    assert.deepStrictEqual(manager.read.mock.calls[0].arguments, ['w1']);
  });

  test('tools/call read_output mode=now', async () => {
    await handler.handle({
      jsonrpc: '2.0', id: 9, method: 'tools/call',
      params: { name: 'read_output', arguments: { name: 'w1', mode: 'now' } }
    });
    assert.deepStrictEqual(manager.readNow.mock.calls[0].arguments, ['w1']);
  });

  test('tools/call read_output mode=wait', async () => {
    await handler.handle({
      jsonrpc: '2.0', id: 10, method: 'tools/call',
      params: { name: 'read_output', arguments: { name: 'w1', mode: 'wait', timeout: 5000 } }
    });
    assert.deepStrictEqual(manager.waitAndRead.mock.calls[0].arguments, ['w1', 5000]);
  });

  test('tools/call close_worker', async () => {
    const res = await handler.handle({
      jsonrpc: '2.0', id: 11, method: 'tools/call',
      params: { name: 'close_worker', arguments: { name: 'w1' } }
    });
    assert.ok(!res.result.isError);
    assert.deepStrictEqual(manager.close.mock.calls[0].arguments, ['w1']);
  });

  test('tools/call with missing name param returns error', async () => {
    const res = await handler.handle({
      jsonrpc: '2.0', id: 12, method: 'tools/call',
      params: { name: 'create_worker', arguments: {} }
    });
    assert.strictEqual(res.result.isError, true);
  });

  test('tools/call with unknown tool returns error', async () => {
    const res = await handler.handle({
      jsonrpc: '2.0', id: 13, method: 'tools/call',
      params: { name: 'unknown_tool', arguments: {} }
    });
    assert.ok(res.error !== undefined);
    assert.strictEqual(res.error.code, -32602);
  });

  test('unknown method returns -32601', async () => {
    const res = await handler.handle({ jsonrpc: '2.0', id: 14, method: 'foo/bar' });
    assert.strictEqual(res.error.code, -32601);
  });

  test('manager error is returned as isError content', async () => {
    manager.create.mock.mockImplementation(() => ({ error: "Worker 'w1' already exists" }));
    const res = await handler.handle({
      jsonrpc: '2.0', id: 15, method: 'tools/call',
      params: { name: 'create_worker', arguments: { name: 'w1' } }
    });
    assert.strictEqual(res.result.isError, true);
    const text = JSON.parse(res.result.content[0].text);
    assert.ok(text.error.includes('already exists'));
  });

  test('send_task missing task returns error', async () => {
    const res = await handler.handle({
      jsonrpc: '2.0', id: 16, method: 'tools/call',
      params: { name: 'send_task', arguments: { name: 'w1' } }
    });
    assert.strictEqual(res.result.isError, true);
  });

  test('notifications/initialized returns empty result', async () => {
    const res = await handler.handle({ jsonrpc: '2.0', id: null, method: 'notifications/initialized' });
    assert.deepStrictEqual(res.result, {});
  });
});
