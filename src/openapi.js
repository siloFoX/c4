// /openapi.json — auto-extract routes from daemon.js so the spec stays in
// sync as new routes land. We parse the source for `req.method === 'X' &&
// route === '/path'` patterns plus the comment line directly above each
// match to build a one-line summary. Hand-curated overrides in
// `OVERRIDES` win when they're set.

'use strict';

const fs = require('fs');
const path = require('path');

const OVERRIDES = {
  'GET /health':          'Daemon health probe',
  'GET /metrics':         'Daemon + per-worker CPU/RSS snapshot',
  'GET /workspaces':      'List configured multi-repo workspaces',
  'POST /auth/login':     '10.1 issue HMAC token',
  'GET /auth/whoami':     'Return current bearer payload',
  'GET /openapi.json':    'This document',
  'POST /create':         'Create a worker (PTY or non-PTY via adapter)',
  'POST /task':           'Send a task (auto branch + worktree)',
  'GET /list':            'All workers + queued + lost',
  'POST /dispatch':       '9.7 pick best peer + run task',
  'GET /fleet/peers':     'Peer health',
  'GET /fleet/list':      'Aggregated worker list across fleet',
  'POST /workflow/run':   '11.3 run a workflow definition',
  'POST /nl/run':         '11.4 parse + execute',
  'GET /audit':           '10.2 audit log query',
  'POST /backup':         'Tar.gz of persistent state (admin)',
  'POST /restore':        'Restore tar.gz backup (admin)',
};

// 87 raw routes in daemon.js as of 1.6.16 — but the source-of-truth is the
// daemon file itself. This list is parsed dynamically on first request.
let _cache = null;

function _extractRoutes() {
  const file = path.join(__dirname, 'daemon.js');
  let text;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch { return []; }
  const lines = text.split('\n');
  const matches = [];
  // Strict pattern: `req.method === 'GET' && route === '/path'`
  const RE = /req\.method\s*===\s*'(GET|POST|PUT|DELETE|PATCH)'\s*&&\s*route\s*===\s*'([^']+)'/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(RE);
    if (!m) continue;
    const method = m[1];
    const route = m[2];
    // Look backwards up to 5 lines for `// summary` comment.
    let summary = '';
    for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
      const c = lines[j].trim();
      if (!c) continue;
      if (c.startsWith('//')) {
        summary = c.replace(/^\/\/\s*/, '').replace(/\s+$/, '');
        break;
      }
      // Stop scanning past a non-comment line.
      break;
    }
    matches.push({ method, route, summary });
  }
  // Dedupe (some routes appear twice — GET vs POST share strings)
  const seen = new Set();
  const out = [];
  for (const m of matches) {
    const key = `${m.method} ${m.route}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

function build(version) {
  if (_cache && _cache.version === version) return _cache.doc;
  const routes = _extractRoutes();
  const paths = {};
  for (const { method, route, summary } of routes) {
    if (!paths[route]) paths[route] = {};
    const key = `${method} ${route}`;
    paths[route][method.toLowerCase()] = {
      summary: OVERRIDES[key] || summary || `${method} ${route}`,
      responses: {
        '200': { description: 'ok' },
        '400': { description: 'invalid request' },
        '401': { description: 'auth required' },
        '403': { description: 'role insufficient' },
      },
    };
  }
  // Always advertise /openapi.json itself even though daemon.js handles it
  // before the route table.
  if (!paths['/openapi.json']) {
    paths['/openapi.json'] = { get: { summary: OVERRIDES['GET /openapi.json'], responses: { '200': { description: 'ok' } } } };
  }

  const doc = {
    openapi: '3.1.0',
    info: {
      title: 'C4 daemon',
      version: version || '0.0.0',
      description: 'Claude {Claude Code} Code orchestrator REST API. Auth + per-route role gates documented in src/auth.js. This document is auto-generated from src/daemon.js routes.',
    },
    servers: [{ url: 'http://127.0.0.1:3456' }],
    components: {
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'c4-hmac' },
      },
    },
    security: [{ bearer: [] }],
    paths,
  };
  _cache = { version, doc };
  return doc;
}

// Test hook so tests can clear the cache between calls.
function _resetCache() { _cache = null; }

module.exports = { build, _resetCache, _extractRoutes };
