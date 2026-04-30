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

  // (TODO #112) curated summaries for the rest of the working surface.
  'POST /send':           'Send raw text to a worker stdin',
  'POST /key':            'Send a control key (Enter, C-c, Escape, …)',
  'GET /read':            'Read accumulated worker output (idle gate)',
  'GET /read-now':        'Read worker output immediately',
  'GET /wait-read':       'Block until worker idle then read',
  'GET /wait-read-multi': 'Block until N workers settle (first/all)',
  'GET /scrollback':      'Read worker scrollback (last N lines)',
  'GET /events':          'SSE stream of worker + daemon events',
  'GET /watch':           'SSE stream of a single worker output',
  'POST /merge':          '3.6 merge worker branch into main (admin)',
  'POST /approve':        '5.45 approve worker prompt (option index)',
  'POST /rollback':       '3.6 rollback worker branch (admin)',
  'POST /suspend':        '8.8 SIGSTOP worker process',
  'POST /resume':         '8.8 SIGCONT worker process',
  'POST /restart':        '8.8 close + respawn worker (admin)',
  'POST /cancel':         '8.8 send Ctrl+C to abort current task',
  'POST /batch-action':   '8.8 apply same action across N workers',
  'POST /cleanup':        'Sweep stale worktrees / branches (admin)',
  'POST /close':          'Terminate worker (admin)',
  'GET /config':          'Read current daemon config (redacted)',
  'POST /config/reload':  'Hot-reload config.json (admin)',
  'POST /scribe/start':   '4.7 begin session-context recording',
  'POST /scribe/stop':    '4.7 end session-context recording',
  'GET /scribe/status':   '4.7 scribe state + last scan',
  'GET /scribe/context':  '8.7 docs/session-context.md preview',
  'POST /scribe/scan':    '4.7 force a context snapshot now',
  'GET /token-usage':     '5.1 daily token usage rollup',
  'POST /hook-event':     '5.27 receive Claude Code hook payload',
  'GET /hook-events':     '5.27 hook event ring buffer',
  'GET /audit/export':    '10.2 download audit log (json/jsonl/csv)',
  'GET /projects':        '10.3 project rollup w/ workers + cost',
  'GET /cost-report':     '10.5 token + USD cost rollup',
  'GET /departments':     '10.6 department + quota + budget rollup',
  'GET /schedules':       '10.7 list cron entries',
  'POST /scheduler/start':'10.7 start scheduler tick loop (admin)',
  'POST /scheduler/stop': '10.7 stop scheduler tick loop (admin)',
  'POST /schedule':       '10.7 add a cron entry (admin)',
  'POST /schedule/remove':'10.7 remove a cron entry (admin)',
  'POST /schedule/enable':'10.7 enable/disable a cron entry (admin)',
  'POST /schedule/run':   '10.7 fire a cron entry now (admin)',
  'GET /board':           '10.8 project kanban board snapshot',
  'POST /board/card':     '10.8 create a card',
  'POST /board/update':   '10.8 update card title/desc/tags',
  'POST /board/move':     '10.8 move card between status columns',
  'POST /board/delete':   '10.8 delete a card',
  'POST /board/import-todo': '10.8 import TODO.md rows as cards',
  'GET /workflow/runs':   '11.3 recent workflow execution records',
  'GET /workflow/templates':       '11.3 list saved workflow templates',
  'GET /workflow/template':        '11.3 load a workflow template by name',
  'POST /workflow/template':       '11.3 save a workflow template (admin)',
  'POST /workflow/template/delete':'11.3 delete a workflow template (admin)',
  'POST /fleet/create':   '9.6 create worker on a peer (admin)',
  'POST /fleet/task':     '9.6 send task to a peer worker (admin)',
  'POST /fleet/close':    '9.6 close a peer worker (admin)',
  'POST /fleet/send':     '9.6 send text to peer worker stdin',
  'POST /fleet/transfer': '9.8 rsync between fleet peers (admin)',
  'GET /fleet/transfer':  '9.8 transfer queue snapshot',
  'POST /fleet/transfer/cancel': '9.8 abort a queued transfer',
  'POST /plan':           'Plan-mode task delivery (separate output channel)',
  'POST /mcp':            'JSON-RPC entry for MCP-style tool calls',
  'GET /templates':       'List worker config templates',
  'GET /profiles':        'List worker permission profiles',
  'GET /swarm':           'Subagent swarm state per worker',
  'POST /auto':           '4.8 spawn auto-mode worker w/ scribe',
  'POST /morning':        '4.8 generate morning summary report',
  'POST /status-update':  'External Slack status post (manager-tier)',
  'POST /nl/parse':       '11.4 parse without executing',
  'GET /history':         '3.7 task history (per-worker, optional limit)',
  'POST /compact-event':  '4.6 manager rotation compaction signal',
  'GET /session-id':      'Last Claude Code session id for a worker',
  'GET /dashboard':       'HTML dashboard (legacy template)',
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
