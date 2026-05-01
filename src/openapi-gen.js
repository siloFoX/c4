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
    },
  },
  'POST /send': {
    requestBody: {
      required: ['name', 'text'],
      properties: {
        name: { type: 'string' },
        text: { type: 'string' },
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
    },
  },
  'POST /merge': {
    requestBody: {
      properties: {
        name: { type: 'string' },
        branch: { type: 'string' },
        skipChecks: { type: 'boolean' },
      },
    },
  },
  'POST /close': {
    requestBody: {
      required: ['name'],
      properties: {
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
  },
  'POST /attach': {
    requestBody: {
      required: ['jsonlPath'],
      properties: {
        jsonlPath: { type: 'string', description: 'Absolute path to claude session JSONL' },
        name: { type: 'string', description: 'Display name (defaults to UUID)' },
        role: { type: 'string', enum: ['manager', 'worker', 'planner', 'executor', 'reviewer', 'generic'] },
      },
    },
  },
  'POST /approve': {
    requestBody: {
      required: ['name'],
      properties: {
        name: { type: 'string' },
        option: { type: 'integer', description: 'Option number for TUI prompts' },
      },
    },
  },
  'POST /rollback': {
    requestBody: {
      required: ['name'],
      properties: {
        name: { type: 'string' },
      },
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
        op.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', ...schemas.requestBody },
            },
          },
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
