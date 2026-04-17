'use strict';

// MCP (Model Context Protocol) handler for C4.
//
// Implements the server side of JSON-RPC 2.0 over a transport-agnostic
// shape: the transport layer (HTTP POST /mcp, stdio, or SSE) hands a
// parsed JSON-RPC object to handle() and takes back either a response
// object or null (for pure notifications that carry no id).
//
// Primitives supported:
//   - tools        (tools/list, tools/call)
//   - resources    (resources/list, resources/templates/list, resources/read)
//   - prompts      (prompts/list, prompts/get)
//   - logging      (logging/setLevel)
//   - ping         (ping)
// Capability declared for sampling so clients that support it know they
// may receive sampling/createMessage requests; the actual request is a
// server-to-client call initiated via emitServerRequest() and is left
// inert in the default handler (the daemon wires it up when used).
//
// Protocol version negotiation: we prefer the newest version we speak
// (2025-06-18). If the client advertises an older supported version we
// respond with that version; unknown versions fall back to the server
// default so the handshake still completes.

const PROTOCOL_VERSION = '2025-06-18';
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const SERVER_INFO = Object.freeze({
  name: 'c4-mcp',
  title: 'C4 Worker Orchestrator',
  version: '1.7.7',
});

// Per MCP logging spec the allowed levels are the syslog set.
const LOG_LEVELS = ['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency'];

// Tool catalogue. Each entry carries JSON Schema for inputs; MCP clients
// use inputSchema to render forms and validate arguments. `title` is the
// human-readable label (2025-06-18 addition); older clients ignore it.
const TOOLS = [
  {
    name: 'create_worker',
    title: 'Create Worker',
    description: 'Create a new Claude Code worker process.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Worker name' },
        command: { type: 'string', description: 'Command to run (default: claude)' },
        target: { type: 'string', description: 'Target (local or SSH target name)' },
        cwd: { type: 'string', description: 'Working directory' },
        parent: { type: 'string', description: 'Parent worker name (for hierarchy)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'send_task',
    title: 'Send Task',
    description: 'Send a task to a worker with auto branch/worktree isolation.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Worker name (auto-created if missing)' },
        task: { type: 'string', description: 'Task description to send' },
        branch: { type: 'string', description: 'Git branch name (default: c4/<name>)' },
        scope: { type: 'object', description: 'Scope restrictions (allowFiles, denyFiles, allowBash, denyBash)' },
        contextFrom: { type: 'string', description: 'Copy context from another worker' },
        plan: { type: 'boolean', description: 'Plan-only mode: generate plan without executing' },
        autoMode: { type: 'boolean', description: 'Run with --dangerously-skip-permissions style auto mode' },
        budgetUsd: { type: 'number', description: 'Spawn-time token budget cap in USD (9.10)' },
        maxRetries: { type: 'number', description: 'Safety-stop retry cap (9.10)' },
      },
      required: ['name', 'task'],
    },
  },
  {
    name: 'list_workers',
    title: 'List Workers',
    description: 'List all workers with status, unread snapshots, and intervention state.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_worker_state',
    title: 'Get Worker State',
    description: 'Return the live record for a single worker (status, branch, intervention, phase).',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Worker name' } },
      required: ['name'],
    },
  },
  {
    name: 'read_output',
    title: 'Read Worker Output',
    description: 'Read worker output. mode=snapshots (default) returns new snapshots, mode=now returns the current screen, mode=wait blocks until the worker is idle.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Worker name' },
        mode: { type: 'string', enum: ['snapshots', 'now', 'wait'], description: 'Read mode' },
        timeout: { type: 'number', description: 'Timeout ms for wait mode (default 120000)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_scrollback',
    title: 'Get Scrollback',
    description: 'Read the last N lines of scrollback for a worker.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Worker name' },
        lines: { type: 'number', description: 'Number of lines (default 200)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'approve_worker',
    title: 'Approve Worker Prompt',
    description: 'Send an approval response to a worker sitting at a permission prompt.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Worker name' },
        optionNumber: { type: 'number', description: 'Menu option number (1=Yes, 2=Yes-always, 3=No by default)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'cancel_task',
    title: 'Cancel Task',
    description: 'Cancel a pending, queued, or in-flight task without destroying the worker.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Worker name' } },
      required: ['name'],
    },
  },
  {
    name: 'restart_worker',
    title: 'Restart Worker',
    description: 'Kill the worker PTY and respawn in the same worktree (branch preserved).',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Worker name' } },
      required: ['name'],
    },
  },
  {
    name: 'rollback_worker',
    title: 'Rollback Worker',
    description: 'git reset --soft the worker to the pre-task commit.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Worker name' } },
      required: ['name'],
    },
  },
  {
    name: 'merge_worker',
    title: 'Merge Worker Branch',
    description: 'Merge the worker branch into main (no pre-flight validation checks).',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Worker or branch name' } },
      required: ['name'],
    },
  },
  {
    name: 'close_worker',
    title: 'Close Worker',
    description: 'Close a worker and clean up its worktree.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Worker name to close' } },
      required: ['name'],
    },
  },
  {
    name: 'get_token_usage',
    title: 'Get Token Usage',
    description: 'Return the daily token usage summary, optionally with per-task rollup.',
    inputSchema: {
      type: 'object',
      properties: { perTask: { type: 'boolean', description: 'Include per-task breakdown (9.10)' } },
      required: [],
    },
  },
  {
    name: 'get_validation',
    title: 'Get Worker Validation',
    description: 'Return the structured completion object (.c4-validation.json) for a worker (9.9).',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Worker name' } },
      required: ['name'],
    },
  },
];

// Static resources expose daemon-wide state without per-worker routing.
// Worker-scoped resources live behind URI templates so a single
// resources/read against c4://worker/<name>/scrollback works for any
// live worker without enumerating every instance in resources/list.
const RESOURCES = [
  {
    uri: 'c4://workers',
    name: 'workers',
    title: 'C4 Workers',
    description: 'Current worker roster (same shape as list_workers tool).',
    mimeType: 'application/json',
  },
  {
    uri: 'c4://token-usage',
    name: 'token-usage',
    title: 'Token Usage',
    description: 'Daily token usage aggregate.',
    mimeType: 'application/json',
  },
  {
    uri: 'c4://session-context',
    name: 'session-context',
    title: 'Scribe Session Context',
    description: 'Latest scribe session context snapshot (markdown).',
    mimeType: 'text/markdown',
  },
];

const RESOURCE_TEMPLATES = [
  {
    uriTemplate: 'c4://worker/{name}/state',
    name: 'worker-state',
    title: 'Worker State',
    description: 'Single worker record (status, branch, intervention, etc.).',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'c4://worker/{name}/scrollback',
    name: 'worker-scrollback',
    title: 'Worker Scrollback',
    description: 'Last 200 lines of scrollback for a worker.',
    mimeType: 'text/plain',
  },
  {
    uriTemplate: 'c4://worker/{name}/validation',
    name: 'worker-validation',
    title: 'Worker Validation Object',
    description: 'Structured completion contract captured at close time (9.9).',
    mimeType: 'application/json',
  },
];

const PROMPTS = [
  {
    name: 'run-task',
    title: 'Run C4 Task',
    description: 'Spawn or reuse a worker, dispatch the described work on an auto branch, and wait for the first idle snapshot.',
    arguments: [
      { name: 'worker', description: 'Worker name (auto-created if missing)', required: true },
      { name: 'task', description: 'What the worker should do', required: true },
      { name: 'branch', description: 'Optional branch override', required: false },
    ],
  },
  {
    name: 'triage-worker',
    title: 'Triage Worker',
    description: 'Inspect scrollback, validation object, and intervention state for a worker so the operator can decide whether to approve, cancel, rollback, or close.',
    arguments: [
      { name: 'worker', description: 'Worker name', required: true },
    ],
  },
  {
    name: 'review-merge',
    title: 'Review Before Merge',
    description: 'Summarize the validation object and diff for a worker before calling merge_worker.',
    arguments: [
      { name: 'worker', description: 'Worker name', required: true },
    ],
  },
];

// JSON-RPC error codes (spec section 5.1) plus MCP conventions.
const ERR = Object.freeze({
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
});

function isNotification(request) {
  // A notification is a request with no id field. JSON-RPC 2.0 spec says
  // notifications MUST NOT receive a response; the server must not send one.
  return request && !('id' in request);
}

function negotiateProtocolVersion(requested) {
  if (typeof requested === 'string' && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) {
    return requested;
  }
  return PROTOCOL_VERSION;
}

function filterToolsByAllowList(tools, allowedTools) {
  if (!Array.isArray(allowedTools) || allowedTools.length === 0) return tools;
  const allow = new Set(allowedTools);
  return tools.filter((t) => allow.has(t.name));
}

function parseTemplateUri(uri) {
  // Lightweight RFC 6570 level 1 matcher for c4://worker/{name}/<suffix>.
  // Returns {template, name} on match, null otherwise.
  if (typeof uri !== 'string') return null;
  const workerMatch = uri.match(/^c4:\/\/worker\/([^/]+)\/(state|scrollback|validation)$/);
  if (!workerMatch) return null;
  return { kind: workerMatch[2], name: decodeURIComponent(workerMatch[1]) };
}

function textContent(obj) {
  return {
    content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }],
    isError: false,
  };
}

function toolErrorContent(message) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: String(message || 'unknown error') }) }],
    isError: true,
  };
}

class McpHandler {
  constructor(manager, options = {}) {
    this.manager = manager;
    this.options = options || {};
    this.logLevel = typeof this.options.logLevel === 'string' && LOG_LEVELS.includes(this.options.logLevel)
      ? this.options.logLevel
      : 'info';
    this.initialized = false;
    this.clientInfo = null;
    this.negotiatedVersion = null;
    this._toolDispatch = this._buildToolDispatch();
  }

  // Config knobs resolved at handle time so live reloads are picked up.
  _getConfig() {
    try {
      if (this.manager && typeof this.manager.getConfig === 'function') {
        return this.manager.getConfig() || {};
      }
    } catch {}
    return this.options.config || {};
  }

  _allowedTools() {
    const cfg = this._getConfig();
    const mcpCfg = (cfg && cfg.mcp) || {};
    if (Array.isArray(this.options.allowedTools) && this.options.allowedTools.length) {
      return this.options.allowedTools;
    }
    if (Array.isArray(mcpCfg.allowedTools) && mcpCfg.allowedTools.length) {
      return mcpCfg.allowedTools;
    }
    return null;
  }

  listTools() {
    const allow = this._allowedTools();
    return filterToolsByAllowList(TOOLS, allow);
  }

  listResources() {
    return RESOURCES;
  }

  listResourceTemplates() {
    return RESOURCE_TEMPLATES;
  }

  listPrompts() {
    return PROMPTS;
  }

  async handle(request) {
    if (!request || typeof request !== 'object') {
      return this._error(null, ERR.InvalidRequest, 'Invalid Request: expected JSON object');
    }
    const { jsonrpc, id, method, params } = request;
    if (jsonrpc !== '2.0') {
      return this._error(id ?? null, ERR.InvalidRequest, 'Invalid Request: must be JSON-RPC 2.0');
    }
    if (typeof method !== 'string') {
      return this._error(id ?? null, ERR.InvalidRequest, 'Invalid Request: missing method');
    }

    // Notifications MUST NOT receive a response per JSON-RPC 2.0. We still
    // process their side-effects (e.g. notifications/initialized flips the
    // handler into initialized state) and return null so the transport
    // knows not to write anything back.
    if (isNotification(request)) {
      this._handleNotification(method, params);
      return null;
    }

    try {
      switch (method) {
        case 'initialize':
          return this._onInitialize(id, params || {});
        case 'ping':
          return this._result(id, {});
        case 'tools/list':
          return this._result(id, { tools: this.listTools() });
        case 'tools/call':
          return this._onToolsCall(id, params || {});
        case 'resources/list':
          return this._result(id, { resources: this.listResources() });
        case 'resources/templates/list':
          return this._result(id, { resourceTemplates: this.listResourceTemplates() });
        case 'resources/read':
          return this._onResourcesRead(id, params || {});
        case 'prompts/list':
          return this._result(id, { prompts: this.listPrompts() });
        case 'prompts/get':
          return this._onPromptsGet(id, params || {});
        case 'logging/setLevel':
          return this._onLoggingSetLevel(id, params || {});
        // notifications/initialized handled above as notification; if a
        // client mistakenly sends it as a request (id present) return {}
        // so the handshake does not hang.
        case 'notifications/initialized':
          this.initialized = true;
          return this._result(id, {});
        default:
          return this._error(id, ERR.MethodNotFound, `Method not found: ${method}`);
      }
    } catch (err) {
      return this._error(id, ERR.InternalError, err && err.message ? err.message : String(err));
    }
  }

  _handleNotification(method, params) {
    if (method === 'notifications/initialized') {
      this.initialized = true;
      return;
    }
    if (method === 'notifications/cancelled' || method === 'notifications/cancel') {
      // No long-running streaming in this handler; nothing to cancel.
      return;
    }
    // Unknown notifications are silently ignored per JSON-RPC 2.0.
  }

  _onInitialize(id, params) {
    const requestedVersion = params.protocolVersion;
    this.negotiatedVersion = negotiateProtocolVersion(requestedVersion);
    this.clientInfo = params.clientInfo || null;
    return this._result(id, {
      protocolVersion: this.negotiatedVersion,
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
        prompts: { listChanged: false },
        logging: {},
        experimental: { sampling: {} },
      },
      serverInfo: SERVER_INFO,
      instructions: 'C4 orchestrates Claude Code workers. Call tools/list to discover worker-management operations, or read c4://workers to see the live roster.',
    });
  }

  async _onToolsCall(id, params) {
    const { name, arguments: args } = params;
    if (!name || typeof name !== 'string') {
      return this._error(id, ERR.InvalidParams, 'Missing tool name');
    }
    const allow = this._allowedTools();
    if (allow && !allow.includes(name)) {
      return this._error(id, ERR.InvalidParams, `Tool not allowed by config.mcp.allowedTools: ${name}`);
    }
    const dispatch = this._toolDispatch[name];
    if (!dispatch) {
      return this._error(id, ERR.InvalidParams, `Unknown tool: ${name}`);
    }
    try {
      const result = await dispatch(args || {});
      const isError = !!(result && (result.error || result.isError));
      if (isError) return this._result(id, toolErrorContent(result.error || 'tool error'));
      return this._result(id, textContent(result));
    } catch (err) {
      return this._result(id, toolErrorContent(err && err.message ? err.message : String(err)));
    }
  }

  _onResourcesRead(id, params) {
    const uri = params.uri;
    if (typeof uri !== 'string' || !uri) {
      return this._error(id, ERR.InvalidParams, 'Missing uri');
    }
    const contents = this._readResource(uri);
    if (contents && contents._notFound) {
      return this._error(id, ERR.InvalidParams, `Unknown resource: ${uri}`);
    }
    if (contents && contents._error) {
      return this._error(id, ERR.InternalError, contents._error);
    }
    return this._result(id, { contents: [contents] });
  }

  _readResource(uri) {
    if (uri === 'c4://workers') {
      const data = this._safeCall(() => this.manager.list(), { workers: [] });
      return { uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) };
    }
    if (uri === 'c4://token-usage') {
      const data = this._safeCall(() => this.manager.getTokenUsage({}), {});
      return { uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) };
    }
    if (uri === 'c4://session-context') {
      const text = this._readSessionContext();
      return { uri, mimeType: 'text/markdown', text };
    }
    const parsed = parseTemplateUri(uri);
    if (parsed) {
      if (parsed.kind === 'state') {
        const list = this._safeCall(() => this.manager.list(), { workers: [] });
        const record = (list.workers || []).find((w) => w.name === parsed.name) || null;
        return { uri, mimeType: 'application/json', text: JSON.stringify(record, null, 2) };
      }
      if (parsed.kind === 'scrollback') {
        const data = this._safeCall(() => this.manager.getScrollback(parsed.name, 200), { content: '' });
        const text = typeof data === 'string' ? data : (data.content || data.scrollback || JSON.stringify(data));
        return { uri, mimeType: 'text/plain', text };
      }
      if (parsed.kind === 'validation') {
        const data = this._safeCall(() => this.manager.getValidation(parsed.name), null);
        return { uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) };
      }
    }
    return { _notFound: true };
  }

  _readSessionContext() {
    try {
      const cfg = this._getConfig();
      const outputPath = (cfg.scribe && cfg.scribe.outputPath) || 'docs/session-context.md';
      const path = require('path');
      const fs = require('fs');
      const abs = path.isAbsolute(outputPath) ? outputPath : path.resolve(process.cwd(), outputPath);
      return fs.readFileSync(abs, 'utf8');
    } catch {
      return '';
    }
  }

  _onPromptsGet(id, params) {
    const name = params.name;
    const args = params.arguments || {};
    const prompt = PROMPTS.find((p) => p.name === name);
    if (!prompt) {
      return this._error(id, ERR.InvalidParams, `Unknown prompt: ${name}`);
    }
    // Check required args.
    for (const arg of prompt.arguments || []) {
      if (arg.required && !args[arg.name]) {
        return this._error(id, ERR.InvalidParams, `Missing required argument: ${arg.name}`);
      }
    }
    const messages = this._buildPromptMessages(prompt, args);
    return this._result(id, {
      description: prompt.description,
      messages,
    });
  }

  _buildPromptMessages(prompt, args) {
    const worker = args.worker || args.name || '';
    switch (prompt.name) {
      case 'run-task': {
        const branch = args.branch ? ` on branch ${args.branch}` : '';
        const task = args.task || '';
        return [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Dispatch this work to C4 worker "${worker}"${branch} using the send_task tool, then call read_output with mode=wait to confirm the worker finished. Task:\n\n${task}`,
            },
          },
        ];
      }
      case 'triage-worker':
        return [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Inspect C4 worker "${worker}" by calling get_worker_state, get_scrollback, and get_validation. Decide whether to approve_worker, cancel_task, rollback_worker, or close_worker based on the intervention state and validation object. Explain your reasoning before acting.`,
            },
          },
        ];
      case 'review-merge':
        return [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Read c4://worker/${worker}/validation and summarize test_passed, test_count, files_changed, and merge_commit_hash. Only call merge_worker if validation is complete and consistent with the scrollback.`,
            },
          },
        ];
      default:
        return [];
    }
  }

  _onLoggingSetLevel(id, params) {
    const level = params.level;
    if (!LOG_LEVELS.includes(level)) {
      return this._error(id, ERR.InvalidParams, `Unsupported log level: ${level}. Expected one of ${LOG_LEVELS.join(',')}`);
    }
    this.logLevel = level;
    return this._result(id, {});
  }

  // Tool dispatch table. Each function receives the validated args and
  // returns a plain object. Throwing yields an isError tool result.
  _buildToolDispatch() {
    const m = () => this.manager;
    return {
      create_worker: (a) => {
        if (!a.name) throw new Error('name is required');
        return m().create(a.name, a.command || 'claude', [], {
          target: a.target || 'local',
          cwd: a.cwd || '',
          parent: a.parent || undefined,
        });
      },
      send_task: (a) => {
        if (!a.name) throw new Error('name is required');
        if (!a.task) throw new Error('task is required');
        const opts = {};
        if (a.branch) opts.branch = a.branch;
        if (a.scope) opts.scope = a.scope;
        if (a.contextFrom) opts.contextFrom = a.contextFrom;
        if (a.plan) opts.planOnly = true;
        if (typeof a.autoMode === 'boolean') opts.autoMode = a.autoMode;
        if (typeof a.budgetUsd === 'number') opts.budgetUsd = a.budgetUsd;
        if (typeof a.maxRetries === 'number') opts.maxRetries = a.maxRetries;
        return m().sendTask(a.name, a.task, opts);
      },
      list_workers: () => m().list(),
      get_worker_state: (a) => {
        if (!a.name) throw new Error('name is required');
        const data = m().list();
        const record = (data.workers || []).find((w) => w.name === a.name);
        if (!record) return { error: `Worker '${a.name}' not found` };
        return record;
      },
      read_output: async (a) => {
        if (!a.name) throw new Error('name is required');
        if (a.mode === 'now') return m().readNow(a.name);
        if (a.mode === 'wait') return await m().waitAndRead(a.name, a.timeout || 120000);
        return m().read(a.name);
      },
      get_scrollback: (a) => {
        if (!a.name) throw new Error('name is required');
        return m().getScrollback(a.name, typeof a.lines === 'number' ? a.lines : 200);
      },
      approve_worker: (a) => {
        if (!a.name) throw new Error('name is required');
        return m().approve(a.name, a.optionNumber);
      },
      cancel_task: (a) => {
        if (!a.name) throw new Error('name is required');
        return m().cancelTask(a.name);
      },
      restart_worker: (a) => {
        if (!a.name) throw new Error('name is required');
        return m().restart(a.name);
      },
      rollback_worker: (a) => {
        if (!a.name) throw new Error('name is required');
        return m().rollback(a.name);
      },
      merge_worker: (a) => {
        if (!a.name) throw new Error('name is required');
        if (typeof m().mergeBranch === 'function') return m().mergeBranch(a.name);
        return { error: 'merge via MCP requires daemon mergeBranch() which is not implemented; use c4 merge CLI or POST /merge' };
      },
      close_worker: (a) => {
        if (!a.name) throw new Error('name is required');
        return m().close(a.name);
      },
      get_token_usage: (a) => m().getTokenUsage({ perTask: !!a.perTask }),
      get_validation: (a) => {
        if (!a.name) throw new Error('name is required');
        return m().getValidation(a.name);
      },
    };
  }

  _safeCall(fn, fallback) {
    try { return fn(); } catch { return fallback; }
  }

  _result(id, result) {
    return { jsonrpc: '2.0', id: id ?? null, result };
  }

  _error(id, code, message, data) {
    const err = { code, message };
    if (data !== undefined) err.data = data;
    return { jsonrpc: '2.0', id: id ?? null, error: err };
  }
}

module.exports = McpHandler;
module.exports.McpHandler = McpHandler;
module.exports.PROTOCOL_VERSION = PROTOCOL_VERSION;
module.exports.SUPPORTED_PROTOCOL_VERSIONS = SUPPORTED_PROTOCOL_VERSIONS;
module.exports.SERVER_INFO = SERVER_INFO;
module.exports.LOG_LEVELS = LOG_LEVELS;
module.exports.TOOLS = TOOLS;
module.exports.RESOURCES = RESOURCES;
module.exports.RESOURCE_TEMPLATES = RESOURCE_TEMPLATES;
module.exports.PROMPTS = PROMPTS;
module.exports.ERR = ERR;
module.exports.parseTemplateUri = parseTemplateUri;
module.exports.negotiateProtocolVersion = negotiateProtocolVersion;
module.exports.filterToolsByAllowList = filterToolsByAllowList;
