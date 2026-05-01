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
    const curated = ROUTE_SUMMARIES[`${r.method} ${r.path}`] || '';
    const harvested = !curated && r.inlineSummary ? r.inlineSummary : '';
    const summary = curated || harvested || `${r.method} ${r.path}`;
    paths[apiPath][r.method.toLowerCase()] = {
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
};
