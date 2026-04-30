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
        useBranch: { type: 'boolean', description: 'Skip branch/worktree creation when false' },
        scope: { type: 'object', description: 'Scope restrictions (allowFiles, denyFiles, allowBash, denyBash)' },
        contextFrom: { type: 'string', description: 'Copy context from another worker' },
        autoMode: { type: 'boolean', description: 'Run worker with full-autonomy permissions' },
        plan: { type: 'boolean', description: 'Plan-only mode — generate plan without executing' }
      },
      required: ['name', 'task']
    }
  },
  {
    name: 'list_workers',
    description: 'List all workers with status, unread snapshots, and intervention state',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'read_output',
    description: 'Read worker output (new snapshots, current screen, or scrollback)',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Worker name' },
        mode: {
          type: 'string',
          enum: ['snapshots', 'now', 'wait', 'scrollback'],
          description: 'snapshots (default) | now | wait (block until idle) | scrollback'
        },
        timeout: { type: 'number', description: 'Timeout in ms for wait mode (default: 120000)' },
        lines: { type: 'number', description: 'Lines for scrollback mode (default 200)' }
      },
      required: ['name']
    }
  },
  {
    name: 'send_input',
    description: 'Send raw text input to a worker (text + Enter)',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Worker name' },
        input: { type: 'string', description: 'Text to send' }
      },
      required: ['name', 'input']
    }
  },
  {
    name: 'send_key',
    description: 'Send a special key to a worker',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Worker name' },
        key: { type: 'string', description: 'Enter, C-c, Escape, Up, Down, Tab, Backspace, etc.' }
      },
      required: ['name', 'key']
    }
  },
  {
    name: 'approve_critical',
    description: 'Approve a critical command pending in critical_deny intervention',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Worker name' },
        optionNumber: { type: 'number', description: 'TUI option to select (1-based)' }
      },
      required: ['name']
    }
  },
  {
    name: 'suspend_worker',
    description: 'Suspend a worker (SIGSTOP). Unix only.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name']
    }
  },
  {
    name: 'resume_worker',
    description: 'Resume a suspended worker (SIGCONT). Unix only.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name']
    }
  },
  {
    name: 'rollback_worker',
    description: 'Reset the worker branch to its pre-task commit',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name']
    }
  },
  {
    name: 'merge_worker',
    description: 'Merge worker branch into main',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        skipChecks: { type: 'boolean', description: 'Skip pre-merge tests / docs checks' }
      },
      required: ['name']
    }
  },
  {
    name: 'close_worker',
    description: 'Close a worker and clean up its worktree',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Worker name to close' } },
      required: ['name']
    }
  },
  {
    name: 'task_history',
    description: 'Read past task history from history.jsonl',
    inputSchema: {
      type: 'object',
      properties: {
        worker: { type: 'string', description: 'Filter by worker name' },
        limit: { type: 'number', description: 'Max records (default: all)' }
      }
    }
  },
  {
    name: 'token_usage',
    description: 'Daily token usage and limits',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'scribe_context',
    description: 'Read accumulated docs/session-context.md',
    inputSchema: { type: 'object', properties: {} }
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
      case 'initialize': {
        // 9.4: negotiate protocol version. Client passes its preferred version
        // in params.protocolVersion; we echo back ours from the supported set.
        // Fall back to a recent stable version if the client didn't send one.
        const SUPPORTED = ['2025-03-26', '2024-11-05'];
        const requested = params && params.protocolVersion;
        const version = SUPPORTED.includes(requested) ? requested : SUPPORTED[0];
        return this._result(id, {
          protocolVersion: version,
          capabilities: {
            tools: { listChanged: true },
            logging: {},
          },
          serverInfo: { name: 'c4-mcp', version: this._serverVersion() }
        });
      }

      case 'notifications/initialized':
      case 'initialized':
        return this._result(id, {});

      case 'ping':
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
          const { name: wName, task, branch, useBranch, scope, contextFrom, plan, autoMode } = args || {};
          if (!wName) return this._toolError(id, 'name is required');
          if (!task) return this._toolError(id, 'task is required');
          const options = {};
          if (branch) options.branch = branch;
          if (useBranch === false) options.useBranch = false;
          if (scope) options.scope = scope;
          if (contextFrom) options.contextFrom = contextFrom;
          if (plan) options.planOnly = true;
          if (autoMode) options.autoMode = true;
          result = this.manager.sendTask(wName, task, options);
          break;
        }

        case 'list_workers': {
          result = this.manager.list();
          break;
        }

        case 'read_output': {
          const { name: wName, mode, timeout, lines } = args || {};
          if (!wName) return this._toolError(id, 'name is required');
          if (mode === 'now') {
            result = this.manager.readNow(wName);
          } else if (mode === 'wait') {
            result = await this.manager.waitAndRead(wName, timeout || 120000);
          } else if (mode === 'scrollback') {
            result = this.manager.getScrollback(wName, lines || 200);
          } else {
            result = this.manager.read(wName);
          }
          break;
        }

        case 'send_input': {
          const { name: wName, input } = args || {};
          if (!wName) return this._toolError(id, 'name is required');
          if (input == null) return this._toolError(id, 'input is required');
          result = await this.manager.send(wName, input, false);
          break;
        }

        case 'send_key': {
          const { name: wName, key } = args || {};
          if (!wName) return this._toolError(id, 'name is required');
          if (!key) return this._toolError(id, 'key is required');
          result = await this.manager.send(wName, key, true);
          break;
        }

        case 'approve_critical': {
          const { name: wName, optionNumber } = args || {};
          if (!wName) return this._toolError(id, 'name is required');
          result = this.manager.approve(wName, optionNumber);
          break;
        }

        case 'suspend_worker': {
          const { name: wName } = args || {};
          if (!wName) return this._toolError(id, 'name is required');
          result = this.manager.suspend(wName);
          break;
        }

        case 'resume_worker': {
          const { name: wName } = args || {};
          if (!wName) return this._toolError(id, 'name is required');
          result = this.manager.resumeWorker(wName);
          break;
        }

        case 'rollback_worker': {
          const { name: wName } = args || {};
          if (!wName) return this._toolError(id, 'name is required');
          result = this.manager.rollback(wName);
          break;
        }

        case 'merge_worker': {
          const { name: wName, skipChecks } = args || {};
          if (!wName) return this._toolError(id, 'name is required');
          // Delegate to mergeWorker if available, otherwise manager.merge.
          if (typeof this.manager.mergeWorker === 'function') {
            result = this.manager.mergeWorker(wName, { skipChecks: !!skipChecks });
          } else if (typeof this.manager.merge === 'function') {
            result = this.manager.merge(wName, { skipChecks: !!skipChecks });
          } else {
            result = { error: 'merge not exposed on manager' };
          }
          break;
        }

        case 'close_worker': {
          const { name: wName } = args || {};
          if (!wName) return this._toolError(id, 'name is required');
          result = this.manager.close(wName);
          break;
        }

        case 'task_history': {
          const { worker, limit } = args || {};
          result = this.manager.getHistory({ worker, limit });
          break;
        }

        case 'token_usage': {
          if (typeof this.manager.getTokenUsage === 'function') {
            result = this.manager.getTokenUsage();
          } else {
            result = { error: 'token usage not available' };
          }
          break;
        }

        case 'scribe_context': {
          if (typeof this.manager.scribeContext === 'function') {
            result = this.manager.scribeContext();
          } else {
            result = { error: 'scribe context not available' };
          }
          break;
        }

        default:
          return this._error(id, -32602, `Unknown tool: ${name}`);
      }

      const isError = !!(result && result.error);
      return this._result(id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError
      });

    } catch (err) {
      return this._toolError(id, err.message);
    }
  }

  _serverVersion() {
    try {
      // Lazy require so unit tests with a mock manager don't blow up.
      // eslint-disable-next-line global-require
      return require('../package.json').version || '0.0.0';
    } catch {
      return '0.0.0';
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
