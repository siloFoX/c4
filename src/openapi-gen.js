'use strict';

// Auto-generate a minimal OpenAPI 3.0 spec from daemon.js route handlers.
// The grep-based extractor walks the if/else-if chain in dispatchRequest,
// pairs each (method, route) with the immediate JSDoc-style comment block
// above its branch (when present), and produces a paths{} map. Run-time
// generation keeps the spec in sync with the code without a separate
// build step or hand-maintained YAML file.
//
// Limitations: schemas live as `application/json` blobs without
// concrete type info — operators get the route list and HTTP method,
// not the parameter shapes (those still live in `docs/api.md` / each
// patch note). The 1.6.17-cumulative cherry-pick (8a43044) had curated
// per-route summaries baked in; follow-up work can fold those into
// ROUTE_SUMMARIES below as they're collected.

const fs = require('fs');
const path = require('path');

// Optional curated summaries — keyed as `<METHOD> <route>`.
// New entries land here as operator docs evolve.
const ROUTE_SUMMARIES = {
  'GET /health': 'Daemon liveness probe — returns {ok, version, workers}.',
  'GET /metrics': 'Per-worker + daemon CPU/RSS snapshot (worker-metrics module).',
  'GET /workspaces': 'Multi-repo workspace listing (config.workspaces).',
  'GET /list': 'List all known workers (live + queued + lost).',
  'POST /create': 'Create a new worker.',
  'POST /send': 'Send text to a worker PTY.',
  'POST /key': 'Send a special key (Enter / Escape / etc) to a worker.',
  'GET /read': 'Read worker output (idle-state only).',
  'GET /read-now': 'Read worker output immediately (any state).',
  'POST /task': 'Send a task to a worker (auto-spawn if missing).',
  'POST /merge': 'Merge a worker branch to main after pre-merge checks.',
  'POST /close': 'Close a worker.',
  'GET /events': 'SSE stream of all daemon events.',
  'GET /sessions': 'Claude Code session JSONL listing.',
  'POST /attach': 'Attach an external claude session by JSONL path.',
  'GET /attach/list': 'List all attached external sessions.',
  'GET /workflows': 'List defined workflows.',
  'POST /workflows': 'Create a new workflow definition.',
  'GET /openapi.json': 'This document — auto-generated OpenAPI spec.',
  'POST /auth/login': 'Authenticate with username/password — returns JWT.',
  'POST /auth/logout': 'Invalidate the caller\'s session.',
  'GET /auth/status': 'Whether auth is enabled + which actions allowed.',
  'GET /audit/verify': 'Verify the audit-log hash chain (?includeRotated=1 for full history).',
  'GET /wait-read': 'Block until a worker is idle, then return its scrollback.',
  'GET /wait-read-multi': 'Multi-worker waitRead — first idle worker returns first.',
  'GET /tree': 'Hierarchical worker tree (parent/child topology).',
  'POST /approve': 'Approve a critical command awaiting human review.',
  'POST /rollback': 'Roll back a worker branch (reset --hard to base).',
  'POST /cleanup': 'Sweep orphaned worktrees / branches / temp dirs.',
  'GET /config': 'Get the live daemon config (sans secrets).',
  'POST /config/reload': 'Reload config.json from disk; restart sub-systems as needed.',
  'POST /autonomous/pause': 'Pause the TODO auto-dispatch loop (8.28).',
  'POST /autonomous/resume': 'Resume the TODO auto-dispatch loop.',
  'POST /scribe/start': 'Start a scribe session — record manager context periodically.',
  'POST /scribe/stop': 'Stop the active scribe session.',
  'GET /scribe/status': 'Get scribe session state (active / interval / last record).',
  'POST /scribe/scan': 'Force one immediate scribe scan (debug).',
  'GET /token-usage': 'Per-worker token usage roll-up + cost estimate.',
  'GET /scrollback': 'Get worker terminal scrollback (?lines=N).',
  'POST /plan': 'Send a planner-mode task to a worker (--branch, --output).',
  'GET /plan': 'Read the most recent plan output for a worker.',
  'GET /plan-revisions': 'List plan revisions for a worker.',
  'POST /mcp': 'MCP tool invocation passthrough.',
  'GET /templates': 'List built-in worker templates (planner / executor / reviewer / generic).',
  'GET /profiles': 'List configured permission profiles (RBAC).',
  'GET /swarm': 'Get sub-worker swarm topology for a manager.',
  'POST /auto': 'Spawn the autonomous manager + scribe pair.',
  'POST /morning': 'Generate the morning report (overnight activity summary).',
  'POST /status-update': 'Post a manual Slack status message tagged with a worker.',
};

// Optional curated request/response schemas — populates the OpenAPI
// `requestBody` (for POST/PUT/PATCH) and `parameters` (for GET query
// strings). Only seed routes operators actually call from Swagger UI;
// the rest get the bare `summary + responses[200..500]` envelope.
//
// Schema dialect: subset of JSON Schema Draft-07 (OpenAPI 3.0
// compatible). When a route has no entry here, the generated spec
// is still valid — Swagger UI just shows "(no parameters)".
const ROUTE_SCHEMAS = {
  'POST /auth/login': {
    requestBody: {
      required: ['user', 'password'],
      properties: {
        user: { type: 'string', description: 'Username' },
        password: { type: 'string', description: 'Plain-text password' },
      },
      example: { user: 'admin', password: 'admin123' },
    },
    response: {
      properties: {
        token: { type: 'string', description: 'JWT bearer token' },
        user: { type: 'string' },
        role: { type: 'string', enum: ['admin', 'manager', 'viewer'] },
      },
    },
  },
  'POST /auth/logout': {
    response: { properties: { ok: { type: 'boolean' } } },
  },
  'GET /auth/status': {
    response: {
      properties: {
        enabled: { type: 'boolean' },
      },
    },
  },
  'GET /health': {
    response: {
      properties: {
        ok: { type: 'boolean' },
        workers: { type: 'integer' },
        version: { type: 'string', nullable: true },
      },
    },
  },
  'GET /metrics': {
    response: {
      properties: {
        daemon: {
          properties: {
            pid: { type: 'integer' },
            uptimeSec: { type: 'number' },
            rssKb: { type: 'number' },
            heapUsedKb: { type: 'number' },
            heapTotalKb: { type: 'number' },
            cpus: { type: 'integer' },
            loadavg: { type: 'array', items: { type: 'number' } },
          },
        },
        workers: { type: 'array' },
        totals: { type: 'object' },
      },
    },
  },
  'GET /workspaces': {
    response: {
      properties: {
        workspaces: {
          type: 'array',
          items: {
            properties: {
              name: { type: 'string' },
              path: { type: 'string' },
              exists: { type: 'boolean' },
              isGitRepo: { type: 'boolean' },
            },
          },
        },
      },
    },
  },
  'POST /create': {
    requestBody: {
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Worker name (unique)' },
        command: { type: 'string', description: 'Override claude binary path' },
        target: { type: 'string', description: "'local' | 'dgx' | fleet alias" },
        cwd: { type: 'string', description: 'Working directory' },
        parent: { type: 'string', description: 'Parent worker name (for hierarchy)' },
        tier: { type: 'string', description: "'manager' | 'worker' | string" },
        pinnedMemory: { type: 'array', items: { type: 'string' } },
        pinRole: { type: 'string', enum: ['manager', 'worker', 'attached'] },
      },
      example: { name: 'worker-1', target: 'local', tier: 'worker' },
    },
  },
  'POST /send': {
    requestBody: {
      required: ['name', 'text'],
      properties: {
        name: { type: 'string' },
        text: { type: 'string' },
      },
      example: { name: 'worker-1', text: 'List the files in src/' },
    },
  },
  'POST /key': {
    requestBody: {
      required: ['name', 'key'],
      properties: {
        name: { type: 'string' },
        key: { type: 'string', description: 'Enter | Escape | Tab | C-c | Up | Down | etc' },
      },
      example: { name: 'worker-1', key: 'Enter' },
    },
  },
  'GET /read': {
    parameters: [
      { name: 'name', in: 'query', required: true, schema: { type: 'string' } },
    ],
  },
  'GET /read-now': {
    parameters: [
      { name: 'name', in: 'query', required: true, schema: { type: 'string' } },
    ],
  },
  'POST /task': {
    requestBody: {
      required: ['task'],
      properties: {
        name: { type: 'string', description: 'Worker name (auto-generated if omitted)' },
        task: { type: 'string', description: 'Task prompt' },
        branch: { type: 'string' },
        useBranch: { type: 'boolean' },
        useWorktree: { type: 'boolean' },
        projectRoot: { type: 'string' },
        cwd: { type: 'string' },
        workspace: { type: 'string', description: 'config.workspaces[name] lookup' },
        profile: { type: 'string', description: 'Built-in template alias' },
        autoMode: { type: 'boolean' },
        budgetUsd: { type: 'number' },
        maxRetries: { type: 'integer' },
        model: { type: 'string', description: 'Override Claude model' },
      },
      example: { task: 'Add a unit test for the parseConfig() helper', autoMode: true },
    },
  },
  'POST /merge': {
    requestBody: {
      properties: {
        name: { type: 'string' },
        branch: { type: 'string' },
        skipChecks: { type: 'boolean' },
      },
      example: { name: 'worker-1' },
    },
  },
  'POST /close': {
    requestBody: {
      required: ['name'],
      properties: {
        name: { type: 'string' },
      },
      example: { name: 'worker-1' },
    },
  },
  'GET /list': {
    response: {
      properties: {
        workers: { type: 'array' },
        queuedTasks: { type: 'array' },
        lostWorkers: { type: 'array' },
      },
    },
  },
  'GET /sessions': {
    parameters: [
      { name: 'workerName', in: 'query', schema: { type: 'string' } },
      { name: 'limit', in: 'query', schema: { type: 'integer' } },
    ],
  },
  'POST /attach': {
    requestBody: {
      required: ['jsonlPath'],
      properties: {
        jsonlPath: { type: 'string', description: 'Absolute path to claude session JSONL' },
        name: { type: 'string', description: 'Display name (defaults to UUID)' },
        role: { type: 'string', enum: ['manager', 'worker', 'planner', 'executor', 'reviewer', 'generic'] },
      },
      example: { jsonlPath: '/home/user/.claude/projects/-myproject/abc-uuid.jsonl' },
    },
  },
  'POST /approve': {
    requestBody: {
      required: ['name'],
      properties: {
        name: { type: 'string' },
        option: { type: 'integer', description: 'Option number for TUI prompts' },
      },
      example: { name: 'worker-1', option: 1 },
    },
  },
  'POST /rollback': {
    requestBody: {
      required: ['name'],
      properties: {
        name: { type: 'string' },
      },
      example: { name: 'worker-1' },
    },
  },
  'GET /scrollback': {
    parameters: [
      { name: 'name', in: 'query', required: true, schema: { type: 'string' } },
      { name: 'lines', in: 'query', schema: { type: 'integer' } },
    ],
  },
  'GET /audit/verify': {
    parameters: [
      { name: 'includeRotated', in: 'query', schema: { type: 'string', enum: ['0', '1'] } },
    ],
    response: {
      properties: {
        valid: { type: 'boolean' },
        corruptedAt: { type: 'integer', nullable: true },
        total: { type: 'integer' },
        rotatedTotal: { type: 'integer' },
      },
    },
  },
  'GET /audit/export': {
    parameters: [
      { name: 'from', in: 'query', schema: { type: 'string', description: 'ISO timestamp' } },
      { name: 'to', in: 'query', schema: { type: 'string' } },
      { name: 'type', in: 'query', schema: { type: 'string' } },
      { name: 'target', in: 'query', schema: { type: 'string' } },
      { name: 'limit', in: 'query', schema: { type: 'integer' } },
      { name: 'bom', in: 'query', schema: { type: 'string', enum: ['0', '1'] } },
    ],
  },
  'GET /openapi.json': {
    response: {
      properties: {
        openapi: { type: 'string', example: '3.0.3' },
        info: { type: 'object' },
        paths: { type: 'object' },
      },
    },
  },
  'GET /audit/query': {
    parameters: [
      { name: 'from', in: 'query', schema: { type: 'string', description: 'ISO timestamp' } },
      { name: 'to', in: 'query', schema: { type: 'string' } },
      { name: 'type', in: 'query', schema: { type: 'string' } },
      { name: 'target', in: 'query', schema: { type: 'string' } },
      { name: 'actor', in: 'query', schema: { type: 'string' } },
      { name: 'limit', in: 'query', schema: { type: 'integer', default: 1000 } },
    ],
  },
  'GET /rbac/roles': {
    response: {
      properties: {
        roles: {
          type: 'array',
          items: {
            properties: {
              name: { type: 'string', enum: ['admin', 'manager', 'viewer'] },
              actions: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
  },
  'GET /rbac/users': {
    response: {
      properties: {
        users: {
          type: 'array',
          items: {
            properties: {
              user: { type: 'string' },
              role: { type: 'string' },
              grants: { type: 'object' },
            },
          },
        },
      },
    },
  },
  'POST /rbac/role/assign': {
    requestBody: {
      required: ['user', 'role'],
      properties: {
        user: { type: 'string' },
        role: { type: 'string', enum: ['admin', 'manager', 'viewer'] },
      },
      example: { user: 'alice', role: 'manager' },
    },
  },
  'POST /rbac/grant/project': {
    requestBody: {
      required: ['user', 'project'],
      properties: {
        user: { type: 'string' },
        project: { type: 'string' },
      },
    },
  },
  'POST /rbac/grant/machine': {
    requestBody: {
      required: ['user', 'machine'],
      properties: {
        user: { type: 'string' },
        machine: { type: 'string' },
      },
    },
  },
  'POST /rbac/revoke/project': {
    requestBody: {
      required: ['user', 'project'],
      properties: {
        user: { type: 'string' },
        project: { type: 'string' },
      },
    },
  },
  'POST /rbac/revoke/machine': {
    requestBody: {
      required: ['user', 'machine'],
      properties: {
        user: { type: 'string' },
        machine: { type: 'string' },
      },
    },
  },
  'POST /rbac/check': {
    requestBody: {
      required: ['user', 'action'],
      properties: {
        user: { type: 'string' },
        action: { type: 'string', description: 'Canonical action name (e.g., worker.create)' },
        resource: {
          properties: {
            type: { type: 'string', enum: ['project', 'machine'] },
            id: { type: 'string' },
          },
        },
      },
      example: { user: 'alice', action: 'worker.create', resource: { type: 'project', id: 'main' } },
    },
    response: {
      properties: { allowed: { type: 'boolean' } },
    },
  },
  'GET /tree': {
    response: {
      properties: {
        tree: { type: 'array', description: 'Worker tree (nested by parent/child)' },
      },
    },
  },
  'POST /workflows': {
    requestBody: {
      required: ['name', 'nodes', 'edges'],
      properties: {
        id: { type: 'string', description: 'Auto-generated if omitted' },
        name: { type: 'string' },
        description: { type: 'string' },
        nodes: { type: 'array', items: { type: 'object' } },
        edges: { type: 'array', items: { type: 'object' } },
        config: {
          properties: {
            maxConcurrency: { type: 'integer', default: 1 },
          },
        },
      },
      example: {
        id: 'wf-deploy',
        name: 'Deploy pipeline',
        nodes: [
          { id: 'a', type: 'task', name: 'build', config: { template: 'executor' } },
          { id: 'b', type: 'task', name: 'test', config: { template: 'reviewer' } },
          { id: 'end1', type: 'end', name: 'end' },
        ],
        edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'end1' }],
        config: { maxConcurrency: 2 },
      },
    },
  },
  'GET /workflows': {
    parameters: [
      { name: 'enabled', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
      { name: 'nameContains', in: 'query', schema: { type: 'string' } },
    ],
  },
  'POST /schedules': {
    requestBody: {
      required: ['name', 'cron', 'task'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        cron: { type: 'string' },
        task: { type: 'string', description: 'Task prompt' },
        target: { type: 'string' },
        enabled: { type: 'boolean', default: true },
      },
      example: { name: 'morning-report', cron: '0 9 * * 1-5', task: 'Run morning report', enabled: true },
    },
  },
  'GET /schedules': {
    response: {
      properties: { schedules: { type: 'array' } },
    },
  },
  'POST /projects': {
    requestBody: {
      required: ['id', 'name'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
      },
    },
  },
  'GET /projects': {
    response: {
      properties: { projects: { type: 'array' } },
    },
  },
  'POST /recover': {
    requestBody: {
      required: ['name'],
      properties: {
        name: { type: 'string' },
        category: { type: 'string', enum: ['tool-deny', 'timeout', 'test-fail', 'build-fail', 'dependency', 'unknown'] },
      },
    },
  },
  'GET /recovery-history': {
    parameters: [
      { name: 'name', in: 'query', schema: { type: 'string' } },
      { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
    ],
  },
  'POST /cancel': {
    requestBody: {
      required: ['name'],
      properties: { name: { type: 'string' } },
    },
  },
  'POST /restart': {
    requestBody: {
      required: ['name'],
      properties: { name: { type: 'string' } },
    },
  },
  'POST /resize': {
    requestBody: {
      required: ['name', 'cols', 'rows'],
      properties: {
        name: { type: 'string' },
        cols: { type: 'integer' },
        rows: { type: 'integer' },
      },
    },
  },
  'POST /resume': {
    requestBody: {
      required: ['name'],
      properties: { name: { type: 'string' } },
    },
  },
  'POST /batch': {
    requestBody: {
      properties: {
        task: { type: 'string', description: 'Task prompt for all workers' },
        count: { type: 'integer', description: 'Number of workers (count mode)' },
        tasksText: { type: 'string', description: 'Newline-separated tasks (file mode)' },
        branch: { type: 'string', description: 'Branch prefix' },
        autoMode: { type: 'boolean' },
        profile: { type: 'string' },
      },
      example: { task: 'Fix lint errors in src/', count: 3, autoMode: true },
    },
  },
  'POST /cleanup': {
    requestBody: {
      properties: {
        dryRun: { type: 'boolean', default: false },
      },
    },
  },
  'POST /scribe/start': {
    requestBody: {
      properties: {
        intervalMs: { type: 'integer', description: 'Sampling interval (default 5min)' },
      },
    },
  },
  'POST /autonomous/pause': {
    requestBody: {
      properties: {
        reason: { type: 'string', description: 'Operator-supplied pause reason' },
      },
    },
  },
  'GET /autonomous/status': {
    response: {
      properties: {
        enabled: { type: 'boolean' },
        paused: { type: 'boolean' },
        pauseReason: { type: 'string', nullable: true },
        consecutiveHalts: { type: 'integer' },
        circuitThreshold: { type: 'integer' },
        lastDispatchId: { type: 'string', nullable: true },
        lastDispatchAt: { type: 'string', nullable: true },
      },
    },
  },
  'GET /history': {
    parameters: [
      { name: 'name', in: 'query', schema: { type: 'string' } },
      { name: 'last', in: 'query', schema: { type: 'integer' } },
    ],
  },
  'GET /events/query': {
    parameters: [
      { name: 'from', in: 'query', schema: { type: 'string' } },
      { name: 'to', in: 'query', schema: { type: 'string' } },
      { name: 'type', in: 'query', schema: { type: 'string' } },
      { name: 'worker', in: 'query', schema: { type: 'string' } },
      { name: 'limit', in: 'query', schema: { type: 'integer' } },
      { name: 'reverse', in: 'query', schema: { type: 'string', enum: ['0', '1'] } },
    ],
  },
  'GET /events/context': {
    parameters: [
      { name: 'around', in: 'query', required: true, schema: { type: 'string', description: 'Event id or ISO timestamp' } },
      { name: 'window', in: 'query', schema: { type: 'integer', default: 5 } },
    ],
  },
  'GET /quota': {
    response: {
      properties: {
        tiers: { type: 'array' },
        depts: { type: 'array' },
      },
    },
  },
  'GET /token-usage': {
    parameters: [
      { name: 'name', in: 'query', schema: { type: 'string' } },
      { name: 'groupBy', in: 'query', schema: { type: 'string', enum: ['session', 'project', 'tier', 'dept'] } },
    ],
  },
  'GET /watch': {
    parameters: [
      { name: 'name', in: 'query', required: true, schema: { type: 'string', description: 'Worker name to tail' } },
    ],
  },
  'GET /events': {
    response: {
      properties: {
        type: { type: 'string', description: 'SSE event type ("connected" first, then live events)' },
      },
    },
  },
  'POST /transfer': {
    requestBody: {
      required: ['alias', 'type'],
      properties: {
        alias: { type: 'string', description: 'Fleet peer alias' },
        type: { type: 'string', enum: ['rsync', 'git'] },
        src: { type: 'string', description: 'For type=rsync' },
        dest: { type: 'string', description: 'For type=rsync' },
        branch: { type: 'string', description: 'For type=git' },
        remoteRepoPath: { type: 'string', description: 'For type=git' },
        opts: { type: 'object' },
      },
    },
  },
  'POST /nl/chat': {
    requestBody: {
      required: ['text'],
      properties: {
        text: { type: 'string', description: 'Natural-language command' },
        sessionId: { type: 'string' },
      },
    },
  },
  'POST /mcp/servers': {
    requestBody: {
      required: ['name', 'command'],
      properties: {
        name: { type: 'string' },
        command: { type: 'string' },
        args: { type: 'array', items: { type: 'string' } },
        env: { type: 'object' },
      },
    },
  },
  'POST /cicd/webhook': {
    requestBody: {
      description: 'GitHub webhook payload (HMAC verified via X-Hub-Signature-256)',
      properties: {
        action: { type: 'string' },
        repository: { type: 'object' },
        pull_request: { type: 'object' },
      },
    },
  },
  'POST /cicd/pipelines': {
    requestBody: {
      required: ['name', 'repo', 'workflow', 'triggers', 'actions'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        repo: { type: 'string' },
        workflow: { type: 'string' },
        triggers: {
          type: 'array',
          items: { type: 'string', enum: ['pr.opened', 'pr.merged', 'pr.closed', 'merge.main', 'tag.created'] },
        },
        actions: { type: 'array', items: { type: 'object' } },
      },
    },
  },
  'GET /api-docs': {
    response: {
      description: 'Swagger UI HTML page (Content-Type: text/html)',
      type: 'string',
    },
  },
  'GET /attach/list': {
    response: {
      properties: {
        sessions: { type: 'array' },
        total: { type: 'integer' },
      },
    },
  },
};

function _readDaemonSource(daemonPath) {
  return fs.readFileSync(daemonPath, 'utf8');
}

// Extract every `req.method === 'X' && route === '/y'` clause.
// The route portion may be a literal string or a startsWith / regex check;
// we only emit literal-string branches because those are the only ones
// the operator can reliably hit with a fixed URL.
//
// Also harvests an inline summary from the first `//` comment line
// inside each branch's body (the convention daemon.js follows
// consistently): a single-line note immediately after the opening
// brace describing what the route does. Multi-line comment blocks
// concatenate up to the first non-comment line. Result lands on the
// route entry as `inlineSummary`. Curated `ROUTE_SUMMARIES` still
// wins; this is the fallback for routes the curated map has not
// caught up with yet.
function extractRoutes(source) {
  const re = /req\.method\s*===\s*'(GET|POST|PUT|DELETE|PATCH)'\s*&&\s*route\s*===\s*'([^']+)'\)\s*\{([^}]{0,400})/g;
  const seen = new Set();
  const routes = [];
  let m;
  while ((m = re.exec(source)) !== null) {
    const method = m[1];
    const routePath = m[2];
    const body = m[3] || '';
    const key = `${method} ${routePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // First contiguous run of `//` comment lines from the start of
    // the body (skipping leading whitespace/newlines).
    const lines = body.split('\n');
    const commentLines = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (l === '') {
        if (commentLines.length === 0) continue;
        break;
      }
      if (l.startsWith('//')) commentLines.push(l.replace(/^\/\/\s?/, ''));
      else break;
    }
    const inlineSummary = commentLines.join(' ').trim();
    routes.push({ method, path: routePath, inlineSummary });
  }
  return routes;
}

function buildSpec({ daemonPath, version, baseUrl } = {}) {
  const dp = daemonPath || path.join(__dirname, 'daemon.js');
  const source = _readDaemonSource(dp);
  const routes = extractRoutes(source);

  const paths = {};
  for (const r of routes) {
    const apiPath = `/api${r.path}`;
    if (!paths[apiPath]) paths[apiPath] = {};
    // Resolution order: curated > inline-comment harvest > fallback.
    const key = `${r.method} ${r.path}`;
    const curated = ROUTE_SUMMARIES[key] || '';
    const harvested = !curated && r.inlineSummary ? r.inlineSummary : '';
    const summary = curated || harvested || key;
    const op = {
      summary,
      responses: {
        '200': { description: 'Success' },
        '400': { description: 'Bad request (invalid params)' },
        '401': { description: 'Unauthorized (auth required)' },
        '403': { description: 'Forbidden (RBAC)' },
        '404': { description: 'Not found' },
        '500': { description: 'Internal error' },
      },
    };
    // Curated parameter / requestBody / response schemas. Each entry
    // is a partial spec — buildSpec coerces the body schema into the
    // OpenAPI 3.0 `requestBody.content.application/json.schema`
    // envelope and the response schema into `responses.200.content.
    // application/json.schema`.
    const schemas = ROUTE_SCHEMAS[key];
    if (schemas) {
      if (schemas.parameters) {
        op.parameters = schemas.parameters;
      }
      if (schemas.requestBody) {
        // OpenAPI 3.0 distinguishes between schema (the type
        // contract) and example (a concrete value rendered in
        // Swagger UI's "Try it out" surface). Pull out `example`
        // before merging so it lands on the mediaType, not the
        // schema, and keeps `additionalProperties: false`-style
        // validators happy.
        const { example, ...bodyShape } = schemas.requestBody;
        const mediaType = {
          schema: { type: 'object', ...bodyShape },
        };
        if (example !== undefined) mediaType.example = example;
        op.requestBody = {
          required: true,
          content: { 'application/json': mediaType },
        };
      }
      if (schemas.response) {
        op.responses['200'] = {
          description: 'Success',
          content: {
            'application/json': {
              schema: { type: 'object', ...schemas.response },
            },
          },
        };
      }
    }
    paths[apiPath][r.method.toLowerCase()] = op;
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'C4 daemon API',
      version: version || '1.7.0',
      description:
        'Auto-generated from src/daemon.js route handlers. ' +
        'See `docs/api-reference.md` for the curated mapping table ' +
        'and `docs/api.md` for payload shape examples.',
    },
    servers: baseUrl ? [{ url: baseUrl }] : [{ url: 'http://localhost:3456' }],
    paths,
  };
}

module.exports = {
  buildSpec,
  extractRoutes,
  ROUTE_SUMMARIES,
  ROUTE_SCHEMAS,
};
