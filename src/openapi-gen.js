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
  'GET /openapi.yaml': 'Same spec as /openapi.json, serialised as YAML.',
  'GET /api-docs/redoc': 'Redoc rendering of the openapi.json spec (alternative to Swagger UI).',
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
        args: { type: 'array', items: { type: 'string' }, description: 'Additional CLI args passed to the worker process' },
        target: { type: 'string', description: "'local' | 'dgx' | fleet alias" },
        cwd: { type: 'string', description: 'Working directory' },
        parent: { type: 'string', description: 'Parent worker name (for hierarchy)' },
        tier: { type: 'string', description: "'manager' | 'worker' | string" },
        pinnedMemory: { type: 'array', items: { type: 'string' } },
        pinRole: { type: 'string', enum: ['manager', 'worker', 'attached'] },
      },
      example: { name: 'worker-1', target: 'local', tier: 'worker' },
    },
    response: {
      properties: {
        success: { type: 'boolean' },
        name: { type: 'string' },
        pid: { type: 'integer' },
        branch: { type: 'string' },
      },
    },
  },
  'POST /send': {
    requestBody: {
      required: ['name', 'input'],
      properties: {
        name: { type: 'string' },
        input: { type: 'string', description: 'Text or keystrokes to write to the PTY' },
        keys: { type: 'boolean', description: 'When true, treat input as keys (Enter / C-c / etc) — see /key for the canonical surface' },
      },
      example: { name: 'worker-1', input: 'List the files in src/' },
    },
    response: {
      properties: {
        success: { type: 'boolean' },
        bytesWritten: { type: 'integer' },
      },
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
    response: {
      properties: {
        success: { type: 'boolean' },
        key: { type: 'string', description: 'Echoed back for confirmation' },
      },
    },
  },
  'GET /read': {
    parameters: [
      { name: 'name', in: 'query', required: true, schema: { type: 'string' } },
    ],
    response: {
      properties: {
        name: { type: 'string' },
        scrollback: { type: 'string', description: 'PTY output (ANSI stripped)' },
        cursor: { type: 'integer', description: 'Last byte offset read' },
      },
    },
  },
  'GET /read-now': {
    parameters: [
      { name: 'name', in: 'query', required: true, schema: { type: 'string' } },
    ],
    response: {
      properties: {
        name: { type: 'string' },
        scrollback: { type: 'string' },
        idle: { type: 'boolean' },
      },
    },
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
        scope: { type: 'string', description: 'Path scope hint passed to the worker (whitelist for tool access)' },
        scopePreset: { type: 'string', description: 'Named scope preset from config' },
        after: { type: 'string', description: 'Wait for this worker to idle before starting' },
        command: { type: 'string', description: 'Override claude binary path' },
        target: { type: 'string' },
        contextFrom: { type: 'string', description: 'Worker name to inherit context from' },
        reuse: { type: 'boolean', description: 'Reuse an existing worker if name matches' },
        tier: { type: 'string', description: "'manager' | 'worker' | string" },
        workspace: { type: 'string', description: 'config.workspaces[name] lookup' },
        profile: { type: 'string', description: 'Built-in template alias' },
        autoMode: { type: 'boolean' },
        budgetUsd: { type: 'number' },
        maxRetries: { type: 'integer' },
        model: { type: 'string', description: 'Override Claude model' },
        planDocPath: { type: 'string', description: 'Anchor a plan-back-prop loop to this doc' },
      },
      example: { task: 'Add a unit test for the parseConfig() helper', autoMode: true },
    },
    response: {
      properties: {
        success: { type: 'boolean' },
        name: { type: 'string', description: 'Auto-generated when caller omitted name' },
        tier: { type: 'string' },
        model: { type: 'string', nullable: true },
        queued: { type: 'boolean', description: 'true when worker spawned + task queued' },
      },
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
    response: {
      properties: {
        success: { type: 'boolean' },
        branch: { type: 'string' },
        sha: { type: 'string', description: 'Merge commit SHA' },
        summary: { type: 'string' },
        reasons: { type: 'array', items: { type: 'string' } },
        resolvedFrom: { type: 'string', enum: ['name', 'branch'] },
      },
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
    response: {
      properties: {
        success: { type: 'boolean' },
        name: { type: 'string' },
      },
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
    response: {
      properties: {
        sessions: {
          type: 'array',
          items: {
            properties: {
              id: { type: 'string' },
              path: { type: 'string' },
              workerName: { type: 'string', nullable: true },
              createdAt: { type: 'string' },
              messageCount: { type: 'integer' },
            },
          },
        },
      },
    },
  },
  'POST /attach': {
    requestBody: {
      // Accept either path OR sessionId — at least one must be set.
      // The validator can't express the "either-or" rule, so neither
      // field is `required`; the route handler returns 400 when both
      // are absent.
      properties: {
        path: { type: 'string', description: 'Absolute path to claude session JSONL' },
        sessionId: { type: 'string', description: 'Bare UUID — daemon resolves to JSONL via sessions.projectsDir' },
        name: { type: 'string', description: 'Display name (defaults to UUID)' },
        role: { type: 'string', enum: ['manager', 'worker', 'planner', 'executor', 'reviewer', 'generic'] },
      },
      example: { path: '/home/user/.claude/projects/-myproject/abc-uuid.jsonl' },
    },
    response: {
      properties: {
        success: { type: 'boolean' },
        name: { type: 'string' },
        role: { type: 'string' },
      },
    },
  },
  'POST /approve': {
    requestBody: {
      required: ['name'],
      properties: {
        name: { type: 'string' },
        optionNumber: { type: 'integer', description: 'Option number for TUI prompts (1 = Yes/proceed, others = decline/custom)' },
      },
      example: { name: 'worker-1', optionNumber: 1 },
    },
    response: { properties: { success: { type: 'boolean' } } },
  },
  'POST /rollback': {
    requestBody: {
      required: ['name'],
      properties: {
        name: { type: 'string' },
      },
      example: { name: 'worker-1' },
    },
    response: {
      properties: {
        success: { type: 'boolean' },
        rolled_back: { type: 'string', description: 'Branch reset target' },
      },
    },
  },
  'GET /scrollback': {
    parameters: [
      { name: 'name', in: 'query', required: true, schema: { type: 'string' } },
      { name: 'lines', in: 'query', schema: { type: 'integer' } },
    ],
    response: {
      properties: {
        scrollback: { type: 'string' },
        lines: { type: 'integer' },
      },
    },
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
    response: {
      description: 'CSV body with UTF-8 BOM + CRLF (text/csv content-type)',
      type: 'string',
    },
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
    response: {
      properties: {
        events: {
          type: 'array',
          items: {
            properties: {
              timestamp: { type: 'string' },
              type: { type: 'string' },
              actor: { type: 'string' },
              target: { type: 'string' },
              details: { type: 'object' },
              hash: { type: 'string', description: 'SHA-256 hash chain link' },
            },
          },
        },
      },
    },
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
      required: ['username', 'role'],
      properties: {
        username: { type: 'string' },
        role: { type: 'string', enum: ['admin', 'manager', 'viewer'] },
      },
      example: { username: 'alice', role: 'manager' },
    },
  },
  'POST /rbac/grant/project': {
    requestBody: {
      required: ['username', 'projectId'],
      properties: {
        username: { type: 'string' },
        projectId: { type: 'string' },
      },
    },
  },
  'POST /rbac/grant/machine': {
    requestBody: {
      required: ['username', 'alias'],
      properties: {
        username: { type: 'string' },
        alias: { type: 'string', description: 'Fleet peer alias' },
      },
    },
  },
  'POST /rbac/revoke/project': {
    requestBody: {
      required: ['username', 'projectId'],
      properties: {
        username: { type: 'string' },
        projectId: { type: 'string' },
      },
    },
  },
  'POST /rbac/revoke/machine': {
    requestBody: {
      required: ['username', 'alias'],
      properties: {
        username: { type: 'string' },
        alias: { type: 'string' },
      },
    },
  },
  'POST /rbac/check': {
    requestBody: {
      required: ['username', 'action'],
      properties: {
        username: { type: 'string' },
        action: { type: 'string', description: 'Canonical action name (e.g., worker.create)' },
        resource: {
          properties: {
            type: { type: 'string', enum: ['project', 'machine'] },
            id: { type: 'string' },
          },
        },
      },
      example: { username: 'alice', action: 'worker.create', resource: { type: 'project', id: 'main' } },
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
    response: {
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        enabled: { type: 'boolean' },
        createdAt: { type: 'string' },
      },
    },
  },
  'GET /workflows': {
    parameters: [
      { name: 'enabled', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
      { name: 'nameContains', in: 'query', schema: { type: 'string' } },
    ],
    response: {
      properties: { workflows: { type: 'array', items: { type: 'object' } } },
    },
  },
  'POST /schedules': {
    requestBody: {
      required: ['name', 'cronExpr', 'taskTemplate'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        cronExpr: { type: 'string', description: 'Cron expression — minute hour dom month dow' },
        taskTemplate: { type: 'string', description: 'Task prompt template' },
        projectId: { type: 'string' },
        assignee: { type: 'string' },
        timezone: { type: 'string', description: 'IANA tz name (e.g., Asia/Seoul)' },
        enabled: { type: 'boolean', default: true },
      },
      example: { name: 'morning-report', cronExpr: '0 9 * * 1-5', taskTemplate: 'Run morning report', timezone: 'Asia/Seoul', enabled: true },
    },
    response: {
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        nextRunAt: { type: 'string', nullable: true },
      },
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
        repoPath: { type: 'string', description: 'Filesystem path to the project repo (for TODO sync)' },
        todoPath: { type: 'string', description: 'Path to TODO.md within the repo (default: TODO.md)' },
      },
    },
    response: {
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        createdAt: { type: 'string' },
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
    response: {
      properties: {
        recovered: { type: 'boolean' },
        strategy: { type: 'string' },
        category: { type: 'string' },
        attempt: { type: 'integer' },
        action: { type: 'string' },
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
    response: { properties: { success: { type: 'boolean' } } },
  },
  'POST /restart': {
    requestBody: {
      required: ['name'],
      properties: { name: { type: 'string' } },
    },
    response: { properties: { success: { type: 'boolean' }, pid: { type: 'integer' } } },
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
    response: { properties: { success: { type: 'boolean' } } },
  },
  'POST /resume': {
    requestBody: {
      required: ['name'],
      properties: {
        name: { type: 'string' },
        sessionId: { type: 'string', description: 'Specific JSONL session id to resume (default: latest)' },
      },
    },
    response: { properties: { success: { type: 'boolean' }, sessionId: { type: 'string' } } },
  },

  // Bulk-defined response shapes for the long tail. Each is the
  // canonical {success: boolean} envelope used by daemon mutators
  // that don't carry richer state. Listed individually so future
  // edits to a specific route don't fall through to a shared shape.
  'POST /auto': {
    requestBody: {
      required: ['task'],
      properties: {
        task: { type: 'string', description: 'Initial task prompt for the autonomous manager' },
        name: { type: 'string', description: 'Manager name (auto-generated when omitted)' },
      },
      example: { task: 'Triage open issues and propose fixes' },
    },
    response: { properties: { success: { type: 'boolean' }, name: { type: 'string' } } },
  },
  'POST /morning': { response: { properties: { success: { type: 'boolean' }, path: { type: 'string', description: 'Path to the generated report' } } } },
  'POST /status-update': {
    requestBody: {
      required: ['message'],
      properties: {
        worker: { type: 'string', description: 'Worker name (defaults to "C4" when omitted)' },
        message: { type: 'string', description: 'Slack message body' },
      },
      example: { worker: 'demo-worker', message: 'Test status update' },
    },
    response: { properties: { sent: { type: 'boolean' } } },
  },
  'POST /scribe/start': { response: { properties: { success: { type: 'boolean' }, intervalMs: { type: 'integer' } } } },
  'POST /scribe/stop': { response: { properties: { success: { type: 'boolean' } } } },
  'POST /scribe/scan': { response: { properties: { success: { type: 'boolean' }, scannedAt: { type: 'string' } } } },
  'GET /scribe/status': { response: { properties: { active: { type: 'boolean' }, intervalMs: { type: 'integer' }, lastRecordAt: { type: 'string', nullable: true } } } },
  'POST /autonomous/pause': { response: { properties: { paused: { type: 'boolean' }, reason: { type: 'string' } } } },
  'POST /autonomous/resume': { response: { properties: { paused: { type: 'boolean' } } } },
  'POST /autonomous/tick': { response: { properties: { dispatched: { type: 'string', nullable: true }, skipped: { type: 'string', nullable: true }, reason: { type: 'string', nullable: true } } } },
  'POST /config/reload': { response: { properties: { ok: { type: 'boolean' } } } },
  'GET /config': { response: { properties: { config: { type: 'object', description: 'Sanitised config (secrets stripped)' } } } },
  'GET /templates': { response: { properties: { templates: { type: 'array', items: { type: 'object' } } } } },
  'GET /profiles': { response: { properties: { profiles: { type: 'array', items: { type: 'object' } } } } },
  'GET /quota': { response: { properties: { tiers: { type: 'array' }, depts: { type: 'array' } } } },
  'GET /swarm': { parameters: [{ name: 'name', in: 'query', schema: { type: 'string' } }], response: { properties: { swarm: { type: 'array' } } } },
  'POST /plan': {
    requestBody: {
      required: ['name', 'task'],
      properties: {
        name: { type: 'string' },
        task: { type: 'string' },
        branch: { type: 'string' },
        outputPath: { type: 'string', description: 'Path for the plan markdown output' },
        scopePreset: { type: 'string' },
        contextFrom: { type: 'string' },
      },
      example: { name: 'planner-1', task: 'Design the migration plan', branch: 'plan/migration', outputPath: 'docs/plan.md' },
    },
    response: { properties: { success: { type: 'boolean' }, planPath: { type: 'string' } } },
  },
  'GET /plan': {
    parameters: [{ name: 'name', in: 'query', required: true, schema: { type: 'string' } }],
    response: { properties: { plan: { type: 'string' }, path: { type: 'string' } } },
  },
  'GET /plan-revisions': {
    parameters: [{ name: 'name', in: 'query', required: true, schema: { type: 'string' } }],
    response: { properties: { revisions: { type: 'array', items: { type: 'object' } } } },
  },
  'POST /plan-update': {
    requestBody: {
      required: ['name'],
      properties: {
        name: { type: 'string' },
        reason: { type: 'string', description: 'Why the plan is being updated' },
        evidence: { type: 'string', description: 'Supporting evidence / scrollback excerpt' },
        replan: { type: 'boolean', description: 'Trigger a fresh planning pass' },
        redispatch: { type: 'boolean', description: 'Redispatch the plan to its anchor task' },
      },
    },
    response: { properties: { success: { type: 'boolean' }, revision: { type: 'integer' } } },
  },
  'GET /api-docs/redoc': {
    response: { type: 'string', description: 'Redoc HTML page (text/html)' },
  },
  'GET /api-docs/index': {
    response: { type: 'string', description: 'Docs landing page HTML (Swagger UI / Redoc picker)' },
  },
  'POST /mcp': {
    requestBody: {
      required: ['method'],
      properties: {
        method: { type: 'string', description: 'MCP tool name' },
        params: { type: 'object' },
      },
    },
    response: { properties: { result: { type: 'object' } } },
  },
  'GET /mcp/servers': {
    response: { properties: { servers: { type: 'array', items: { type: 'object' } } } },
  },
  'GET /computer-use/sessions': {
    response: { properties: { sessions: { type: 'array' } } },
  },
  'POST /computer-use/sessions': {
    requestBody: {
      // Action-multiplexer route — backend selects the session, x/y/
      // button/text/delayMs/key are action-specific args. The router
      // dispatches to click / move / type / keyPress / etc based on
      // which fields are populated.
      properties: {
        backend: { type: 'string', enum: ['stub', 'xdotool', 'mock', 'auto'] },
        x: { type: 'integer', description: 'Click / move x coordinate' },
        y: { type: 'integer', description: 'Click / move y coordinate' },
        button: { type: 'string', enum: ['left', 'right', 'middle'] },
        text: { type: 'string', description: 'Text to type' },
        delayMs: { type: 'integer', description: 'Inter-keystroke delay' },
        key: { type: 'string', description: 'Key name (e.g., Return / Escape / Ctrl+A)' },
      },
    },
    response: { properties: { id: { type: 'string' }, backend: { type: 'string' } } },
  },
  'GET /events': {
    response: { type: 'string', description: 'SSE stream — Content-Type: text/event-stream' },
  },
  'GET /watch': {
    response: { type: 'string', description: 'SSE stream of worker output — Content-Type: text/event-stream' },
  },
  'GET /approvals': {
    response: { properties: { approvals: { type: 'array', items: { type: 'object' } } } },
  },
  'GET /approvals/stream': {
    response: { type: 'string', description: 'SSE stream of approval transitions' },
  },
  'GET /slack/events': {
    response: { type: 'string', description: 'SSE stream of Slack interaction events' },
  },
  'POST /slack/emit': {
    requestBody: {
      required: ['eventType'],
      properties: {
        eventType: { type: 'string', description: 'One of slackEvents.EVENT_TYPES' },
        payload: { type: 'object', description: 'Event-specific payload (worker, message, etc)' },
      },
    },
    response: { properties: { success: { type: 'boolean' } } },
  },
  'GET /scribe-context': {
    parameters: [{ name: 'name', in: 'query', required: true, schema: { type: 'string' } }],
    response: { properties: { context: { type: 'array' } } },
  },
  'GET /fleet/overview': {
    response: { properties: { peers: { type: 'array' }, totalWorkers: { type: 'integer' } } },
  },
  'POST /dispatch': {
    requestBody: {
      properties: {
        task: { type: 'string' },
        target: { type: 'string' },
      },
    },
    response: { properties: { success: { type: 'boolean' }, dispatched: { type: 'string' } } },
  },
  'GET /session-id': {
    parameters: [{ name: 'name', in: 'query', required: true, schema: { type: 'string' } }],
    response: { properties: { sessionId: { type: 'string', nullable: true } } },
  },
  'POST /hook-event': {
    requestBody: {
      properties: {
        worker: { type: 'string', description: 'Worker name the hook fired for' },
        hook_type: { type: 'string', description: 'PreToolUse / PostToolUse / etc' },
        tool_name: { type: 'string' },
        tool_input: { type: 'object' },
        tool_response: { type: 'object' },
      },
    },
    response: { properties: { success: { type: 'boolean' } } },
  },
  'GET /hook-events': {
    parameters: [
      { name: 'name', in: 'query', schema: { type: 'string' } },
      { name: 'limit', in: 'query', schema: { type: 'integer' } },
    ],
    response: { properties: { events: { type: 'array', items: { type: 'object' } } } },
  },
  'POST /compact-event': {
    requestBody: {
      required: ['worker'],
      properties: {
        worker: { type: 'string', description: 'Worker name the compact event fired for' },
      },
    },
    response: { properties: { success: { type: 'boolean' } } },
  },
  'POST /cicd/trigger': {
    requestBody: {
      properties: {
        id: { type: 'string', description: 'Pipeline id (replay)' },
        repo: { type: 'string', description: 'For one-off workflow_dispatch' },
        workflow: { type: 'string' },
        ref: { type: 'string' },
        inputs: { type: 'object' },
      },
    },
    response: { properties: { success: { type: 'boolean' } } },
  },
  'GET /cicd/pipelines': {
    response: { properties: { pipelines: { type: 'array', items: { type: 'object' } } } },
  },
  'GET /nl/sessions': {
    response: { properties: { sessions: { type: 'array' } } },
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
    response: {
      properties: {
        success: { type: 'boolean' },
        spawned: { type: 'array', items: { type: 'string' } },
        count: { type: 'integer' },
      },
    },
  },
  'POST /cleanup': {
    requestBody: {
      properties: {
        dryRun: { type: 'boolean', default: false },
      },
    },
    response: {
      properties: {
        branchesRemoved: { type: 'array', items: { type: 'string' } },
        worktreesRemoved: { type: 'array', items: { type: 'string' } },
        directoriesRemoved: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  'POST /scribe/start': {
    // Handler reads no body fields — interval is config-driven.
    // Empty body still accepted; schema documents the no-op shape.
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
    response: {
      properties: {
        history: {
          type: 'array',
          items: {
            properties: {
              id: { type: 'string' },
              worker: { type: 'string' },
              task: { type: 'string' },
              startedAt: { type: 'string' },
              completedAt: { type: 'string', nullable: true },
              status: { type: 'string' },
            },
          },
        },
      },
    },
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
    response: {
      properties: {
        started: { type: 'boolean' },
        pid: { type: 'integer' },
        transferId: { type: 'string' },
        cmd: { type: 'string' },
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
  // Two-pass scan. Pass 1 locates each `req.method === 'X' && route
  // === '/y') {` marker and records its line index. Pass 2 walks
  // forward up to 40 lines from each marker, harvesting:
  //   (a) the leading `//` comment block (already-existing summary
  //       behaviour)
  //   (b) the first `requireRole(authCheck, rbac.ACTIONS.<NAME>, ...)`
  //       inside the route body (new — feeds `x-rbac-action`).
  // The regex-only approach hit a ceiling on routes with destructured
  // `parseBody` calls because `[^}]` stopped at the destructuring
  // closing brace before the rbac line; the line-window walk is more
  // forgiving without giving up the dedup semantics.
  const lines = source.split('\n');
  const re = /req\.method\s*===\s*'(GET|POST|PUT|DELETE|PATCH)'\s*&&\s*route\s*===\s*'([^']+)'/;
  const seen = new Set();
  const routes = [];
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (!m) continue;
    const method = m[1];
    const routePath = m[2];
    const key = `${method} ${routePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Comment harvest: scan forward until first non-empty,
    // non-`//` line.
    const commentLines = [];
    for (let j = i + 1; j < Math.min(i + 40, lines.length); j++) {
      const l = lines[j].trim();
      if (l === '') {
        if (commentLines.length === 0) continue;
        break;
      }
      if (l.startsWith('//')) commentLines.push(l.replace(/^\/\/\s?/, ''));
      else break;
    }
    const inlineSummary = commentLines.join(' ').trim();
    // RBAC action: walk forward up to 40 lines for the first
    // requireRole(...) call. Once we hit `else if (req.method === 'X'`
    // for a different route we stop — no rbac → null.
    let rbacAction = null;
    for (let j = i + 1; j < Math.min(i + 40, lines.length); j++) {
      if (re.test(lines[j])) break; // entered the next route
      const r = lines[j].match(/requireRole\s*\(\s*\w+\s*,\s*rbac\.ACTIONS\.([A-Z_]+)/);
      if (r) { rbacAction = r[1]; break; }
    }
    routes.push({ method, path: routePath, inlineSummary, rbacAction });
  }
  return routes;
}

// Auto-generate a stable operationId from `<method> <path>` —
// required for Swagger UI's "Generate Client" / Redoc / OpenAPI
// codegen tooling. The id is camelCase, idempotent, and dedupes
// against the global seen-set so duplicate ids never escape.
//
//   GET /api/health                → getHealth
//   POST /api/auth/login           → postAuthLogin
//   GET /api/audit/verify          → getAuditVerify
//   POST /api/rbac/role/assign     → postRbacRoleAssign
function _operationIdFor(method, routePath, seen) {
  const parts = String(routePath).split('/').filter(Boolean);
  const camel = parts
    .map((p) => p.replace(/[^a-zA-Z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')))
    .map((p) => p.replace(/^[a-z]/, (c) => c.toUpperCase()))
    .join('');
  let id = method.toLowerCase() + camel;
  if (!seen.has(id)) {
    seen.add(id);
    return id;
  }
  // Disambiguate via numeric suffix (rare — only happens if path
  // collides after camel-case collapse).
  let n = 2;
  while (seen.has(`${id}${n}`)) n++;
  const dedup = `${id}${n}`;
  seen.add(dedup);
  return dedup;
}

function buildSpec({ daemonPath, version, baseUrl } = {}) {
  const dp = daemonPath || path.join(__dirname, 'daemon.js');
  const source = _readDaemonSource(dp);
  const routes = extractRoutes(source);

  const paths = {};
  const seenOpIds = new Set();
  for (const r of routes) {
    const apiPath = `/api${r.path}`;
    if (!paths[apiPath]) paths[apiPath] = {};
    // Resolution order: curated > inline-comment harvest > fallback.
    const key = `${r.method} ${r.path}`;
    const curated = ROUTE_SUMMARIES[key] || '';
    const harvested = !curated && r.inlineSummary ? r.inlineSummary : '';
    const summary = curated || harvested || key;
    const op = {
      operationId: _operationIdFor(r.method, r.path, seenOpIds),
      summary,
      ...(r.rbacAction ? { 'x-rbac-action': r.rbacAction } : {}),
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

// Minimal JSON-to-YAML serializer for the spec — handles the subset
// of YAML the OpenAPI envelope needs (strings, numbers, bools, null,
// arrays, objects). Avoids a runtime YAML dep + keeps the daemon
// stays lean. Strings get quoted only when they contain special
// chars; numbers + booleans + null pass through unquoted.
function _yamlSerialize(value, indent = 0) {
  const pad = (n) => '  '.repeat(n);
  const needsQuote = (s) => /[:#&*!|>'"%@`,\[\]{}\n]/.test(s) || /^[\s]/.test(s) || /[\s]$/.test(s) || /^(?:true|false|null|yes|no|on|off|~|-?\d)/i.test(s) || s === '';
  const quoteString = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'string') return needsQuote(value) ? quoteString(value) : value;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value.map((v) => {
      const inner = _yamlSerialize(v, indent + 1);
      // Object/array element: continue on next line (each key indents
      // under the dash). Scalar: keep inline after the dash.
      if (typeof v === 'object' && v !== null) {
        const lines = inner.split('\n').filter((l) => l.length);
        if (lines.length === 0) return `\n${pad(indent)}- {}`;
        // First line attaches to the dash; subsequent lines indent.
        return `\n${pad(indent)}- ${lines[0].trimStart()}` +
          lines.slice(1).map((l) => `\n${pad(indent)}  ${l.replace(/^ {2}/, '')}`).join('');
      }
      return `\n${pad(indent)}- ${inner.replace(/^\n/, '')}`;
    }).join('');
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    return keys.map((k) => {
      const v = _yamlSerialize(value[k], indent + 1);
      const isComplex = (typeof value[k] === 'object' && value[k] !== null && (Array.isArray(value[k]) ? value[k].length : Object.keys(value[k]).length));
      if (isComplex) return `\n${pad(indent)}${k}:${v}`;
      return `\n${pad(indent)}${k}: ${v}`;
    }).join('');
  }
  return 'null';
}

function buildYaml(opts) {
  const spec = buildSpec(opts);
  return _yamlSerialize(spec).replace(/^\n/, '');
}

module.exports = {
  buildSpec,
  buildYaml,
  extractRoutes,
  ROUTE_SUMMARIES,
  ROUTE_SCHEMAS,
};
