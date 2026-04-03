const McpHandler = require('../src/mcp-handler');

// Mock PtyManager
function createMockManager() {
  return {
    create: jest.fn(() => ({ name: 'w1', pid: 1234, status: 'running' })),
    sendTask: jest.fn(() => ({ success: true, branch: 'c4/w1', worktree: '/tmp/wt' })),
    list: jest.fn(() => ({
      workers: [{ name: 'w1', status: 'idle', unreadSnapshots: 2 }],
      queuedTasks: [],
      lostWorkers: [],
      lastHealthCheck: Date.now()
    })),
    read: jest.fn(() => ({ content: 'hello world', status: 'idle', snapshotsRead: 1 })),
    readNow: jest.fn(() => ({ content: 'screen now', status: 'busy' })),
    waitAndRead: jest.fn(async () => ({ content: 'waited', status: 'idle' })),
    close: jest.fn(() => ({ success: true, name: 'w1' })),
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
    expect(res.error).toBeDefined();
    expect(res.error.code).toBe(-32600);
  });

  test('initialize returns server info', async () => {
    const res = await handler.handle({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    expect(res.result.serverInfo.name).toBe('c4-mcp');
    expect(res.result.capabilities.tools).toBeDefined();
  });

  test('tools/list returns all 5 tools', async () => {
    const res = await handler.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(res.result.tools).toHaveLength(5);
    const names = res.result.tools.map(t => t.name);
    expect(names).toContain('create_worker');
    expect(names).toContain('send_task');
    expect(names).toContain('list_workers');
    expect(names).toContain('read_output');
    expect(names).toContain('close_worker');
  });

  test('tools/call create_worker', async () => {
    const res = await handler.handle({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'create_worker', arguments: { name: 'w1' } }
    });
    expect(res.result.isError).toBeFalsy();
    expect(manager.create).toHaveBeenCalledWith('w1', 'claude', [], { target: 'local', cwd: '' });
  });

  test('tools/call create_worker with options', async () => {
    await handler.handle({
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'create_worker', arguments: { name: 'w2', command: 'bash', target: 'dgx', cwd: '/home' } }
    });
    expect(manager.create).toHaveBeenCalledWith('w2', 'bash', [], { target: 'dgx', cwd: '/home' });
  });

  test('tools/call send_task', async () => {
    const res = await handler.handle({
      jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: { name: 'send_task', arguments: { name: 'w1', task: 'add logging' } }
    });
    expect(res.result.isError).toBeFalsy();
    expect(manager.sendTask).toHaveBeenCalledWith('w1', 'add logging', {});
  });

  test('tools/call send_task with branch and scope', async () => {
    await handler.handle({
      jsonrpc: '2.0', id: 6, method: 'tools/call',
      params: { name: 'send_task', arguments: { name: 'w1', task: 'fix bug', branch: 'fix/bug', scope: { allowFiles: ['src/*'] } } }
    });
    expect(manager.sendTask).toHaveBeenCalledWith('w1', 'fix bug', { branch: 'fix/bug', scope: { allowFiles: ['src/*'] } });
  });

  test('tools/call list_workers', async () => {
    const res = await handler.handle({
      jsonrpc: '2.0', id: 7, method: 'tools/call',
      params: { name: 'list_workers', arguments: {} }
    });
    expect(res.result.isError).toBeFalsy();
    expect(manager.list).toHaveBeenCalled();
  });

  test('tools/call read_output default mode (snapshots)', async () => {
    const res = await handler.handle({
      jsonrpc: '2.0', id: 8, method: 'tools/call',
      params: { name: 'read_output', arguments: { name: 'w1' } }
    });
    expect(res.result.isError).toBeFalsy();
    expect(manager.read).toHaveBeenCalledWith('w1');
  });

  test('tools/call read_output mode=now', async () => {
    await handler.handle({
      jsonrpc: '2.0', id: 9, method: 'tools/call',
      params: { name: 'read_output', arguments: { name: 'w1', mode: 'now' } }
    });
    expect(manager.readNow).toHaveBeenCalledWith('w1');
  });

  test('tools/call read_output mode=wait', async () => {
    await handler.handle({
      jsonrpc: '2.0', id: 10, method: 'tools/call',
      params: { name: 'read_output', arguments: { name: 'w1', mode: 'wait', timeout: 5000 } }
    });
    expect(manager.waitAndRead).toHaveBeenCalledWith('w1', 5000);
  });

  test('tools/call close_worker', async () => {
    const res = await handler.handle({
      jsonrpc: '2.0', id: 11, method: 'tools/call',
      params: { name: 'close_worker', arguments: { name: 'w1' } }
    });
    expect(res.result.isError).toBeFalsy();
    expect(manager.close).toHaveBeenCalledWith('w1');
  });

  test('tools/call with missing name param returns error', async () => {
    const res = await handler.handle({
      jsonrpc: '2.0', id: 12, method: 'tools/call',
      params: { name: 'create_worker', arguments: {} }
    });
    expect(res.result.isError).toBe(true);
  });

  test('tools/call with unknown tool returns error', async () => {
    const res = await handler.handle({
      jsonrpc: '2.0', id: 13, method: 'tools/call',
      params: { name: 'unknown_tool', arguments: {} }
    });
    expect(res.error).toBeDefined();
    expect(res.error.code).toBe(-32602);
  });

  test('unknown method returns -32601', async () => {
    const res = await handler.handle({ jsonrpc: '2.0', id: 14, method: 'foo/bar' });
    expect(res.error.code).toBe(-32601);
  });

  test('manager error is returned as isError content', async () => {
    manager.create.mockReturnValue({ error: "Worker 'w1' already exists" });
    const res = await handler.handle({
      jsonrpc: '2.0', id: 15, method: 'tools/call',
      params: { name: 'create_worker', arguments: { name: 'w1' } }
    });
    expect(res.result.isError).toBe(true);
    const text = JSON.parse(res.result.content[0].text);
    expect(text.error).toContain('already exists');
  });

  test('send_task missing task returns error', async () => {
    const res = await handler.handle({
      jsonrpc: '2.0', id: 16, method: 'tools/call',
      params: { name: 'send_task', arguments: { name: 'w1' } }
    });
    expect(res.result.isError).toBe(true);
  });

  test('notifications/initialized returns empty result', async () => {
    const res = await handler.handle({ jsonrpc: '2.0', id: null, method: 'notifications/initialized' });
    expect(res.result).toEqual({});
  });
});
