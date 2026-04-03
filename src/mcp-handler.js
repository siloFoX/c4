/**
 * MCP (Model Context Protocol) Handler for C4
 *
 * Exposes C4 worker management as MCP tools via JSON-RPC 2.0.
 * Endpoint: POST /mcp
 */

const MCP_TOOLS = [
  {
    name: 'create_worker',
    description: 'Create a new Claude Code worker process',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Worker name' },
        command: { type: 'string', description: 'Command to run (default: claude)' },
        target: { type: 'string', description: 'Target (local or SSH target name)' },
        cwd: { type: 'string', description: 'Working directory' }
      },
      required: ['name']
    }
  },
  {
    name: 'send_task',
    description: 'Send a task to a worker with auto branch/worktree isolation',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Worker name (auto-created if not exists)' },
        task: { type: 'string', description: 'Task description to send' },
        branch: { type: 'string', description: 'Git branch name (default: c4/<name>)' },
        scope: { type: 'object', description: 'Scope restrictions (allowFiles, denyFiles, allowBash, denyBash)' },
        contextFrom: { type: 'string', description: 'Copy context from another worker' },
        plan: { type: 'boolean', description: 'Plan-only mode — generate plan without executing' }
      },
      required: ['name', 'task']
    }
  },
  {
    name: 'list_workers',
    description: 'List all workers with status, unread snapshots, and intervention state',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'read_output',
    description: 'Read worker output (new snapshots or current screen)',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Worker name' },
        mode: { type: 'string', enum: ['snapshots', 'now', 'wait'], description: 'Read mode: snapshots (default), now (current screen), wait (block until idle)' },
        timeout: { type: 'number', description: 'Timeout in ms for wait mode (default: 120000)' }
      },
      required: ['name']
    }
  },
  {
    name: 'close_worker',
    description: 'Close a worker and clean up its worktree',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Worker name to close' }
      },
      required: ['name']
    }
  }
];

class McpHandler {
  constructor(manager) {
    this.manager = manager;
  }

  async handle(request) {
    const { jsonrpc, id, method, params } = request;

    if (jsonrpc !== '2.0') {
      return this._error(id, -32600, 'Invalid Request: must be JSON-RPC 2.0');
    }

    switch (method) {
      case 'initialize':
        return this._result(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'c4-mcp', version: '0.13.0' }
        });

      case 'notifications/initialized':
        return this._result(id, {});

      case 'tools/list':
        return this._result(id, { tools: MCP_TOOLS });

      case 'tools/call':
        return this._callTool(id, params);

      default:
        return this._error(id, -32601, `Method not found: ${method}`);
    }
  }

  async _callTool(id, params) {
    const { name, arguments: args } = params || {};
    if (!name) {
      return this._error(id, -32602, 'Missing tool name');
    }

    try {
      let result;

      switch (name) {
        case 'create_worker': {
          const { name: wName, command, target, cwd } = args || {};
          if (!wName) return this._toolError(id, 'name is required');
          result = this.manager.create(wName, command || 'claude', [], { target: target || 'local', cwd: cwd || '' });
          break;
        }

        case 'send_task': {
          const { name: wName, task, branch, scope, contextFrom, plan } = args || {};
          if (!wName) return this._toolError(id, 'name is required');
          if (!task) return this._toolError(id, 'task is required');
          const options = {};
          if (branch) options.branch = branch;
          if (scope) options.scope = scope;
          if (contextFrom) options.contextFrom = contextFrom;
          if (plan) options.planOnly = true;
          result = this.manager.sendTask(wName, task, options);
          break;
        }

        case 'list_workers': {
          result = this.manager.list();
          break;
        }

        case 'read_output': {
          const { name: wName, mode, timeout } = args || {};
          if (!wName) return this._toolError(id, 'name is required');
          if (mode === 'now') {
            result = this.manager.readNow(wName);
          } else if (mode === 'wait') {
            result = await this.manager.waitAndRead(wName, timeout || 120000);
          } else {
            result = this.manager.read(wName);
          }
          break;
        }

        case 'close_worker': {
          const { name: wName } = args || {};
          if (!wName) return this._toolError(id, 'name is required');
          result = this.manager.close(wName);
          break;
        }

        default:
          return this._error(id, -32602, `Unknown tool: ${name}`);
      }

      const isError = !!result.error;
      return this._result(id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError
      });

    } catch (err) {
      return this._toolError(id, err.message);
    }
  }

  _result(id, result) {
    return { jsonrpc: '2.0', id, result };
  }

  _error(id, code, message) {
    return { jsonrpc: '2.0', id, error: { code, message } };
  }

  _toolError(id, message) {
    return this._result(id, {
      content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
      isError: true
    });
  }
}

module.exports = McpHandler;
