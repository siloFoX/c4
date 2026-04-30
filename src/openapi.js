// /openapi.json — minimal OpenAPI 3.1 description of the c4 daemon.
// Generated programmatically so the source of truth stays close to daemon.js.
// We don't verify schemas at runtime — the spec is purely for tooling /
// SDK consumers / external integrations.

'use strict';

function build(version) {
  const ROUTES = [
    // Health + auth
    ['GET',  '/health',                  'Daemon health probe'],
    ['POST', '/auth/login',              '10.1 issue HMAC token (admin/manager/viewer)'],
    ['GET',  '/auth/whoami',             'Return current bearer payload'],

    // Worker lifecycle
    ['POST', '/create',                  'Create a worker (PTY or non-PTY via adapter)'],
    ['POST', '/send',                    'Send raw text to worker (text + Enter)'],
    ['POST', '/key',                     'Send special key (Enter, C-c, …)'],
    ['POST', '/task',                    'Send a task (auto branch + worktree)'],
    ['POST', '/approve',                 '5.13 critical-deny manual approval'],
    ['POST', '/rollback',                'Reset worker branch to pre-task commit'],
    ['POST', '/suspend',                 'POSIX SIGSTOP (Unix only)'],
    ['POST', '/resume',                  'POSIX SIGCONT'],
    ['POST', '/restart',                 'Close + respawn (resumes Claude session)'],
    ['POST', '/cancel',                  'Cancel running task (Ctrl+C × 2)'],
    ['POST', '/batch-action',            'Apply one action across multiple workers'],
    ['POST', '/close',                   'Close worker, clean up worktree'],
    ['POST', '/merge',                   'Merge worker branch into main'],
    ['POST', '/cleanup',                 'Remove orphan worktrees / branches'],

    // Reads
    ['GET',  '/read',                    'Read new snapshots (idle only)'],
    ['GET',  '/read-now',                'Read current screen text immediately'],
    ['GET',  '/scrollback',              'Read scrollback (last N lines)'],
    ['GET',  '/wait-read',               'Wait until idle, then read'],
    ['GET',  '/wait-read-multi',         '7.21 wait many workers (mode=first|all)'],
    ['GET',  '/list',                    'All workers + queued + lost'],
    ['GET',  '/history',                 'Past tasks (history.jsonl)'],
    ['GET',  '/audit',                   '10.2 audit log query'],
    ['GET',  '/projects',                '10.3 per-project rollup'],
    ['GET',  '/cost-report',             '10.5 token usage + cost'],
    ['GET',  '/departments',             '10.6 department roll-up'],
    ['GET',  '/schedules',               '10.7 list schedules'],
    ['GET',  '/board',                   '10.8 kanban board for project'],

    // Mutations on Phase 9-11 surfaces
    ['POST', '/dispatch',                '9.7 pick best peer + run task'],
    ['POST', '/scheduler/start',         'Start scheduler tick'],
    ['POST', '/scheduler/stop',          'Stop scheduler tick'],
    ['POST', '/schedule',                'Add a schedule entry'],
    ['POST', '/schedule/remove',         'Remove a schedule entry'],
    ['POST', '/schedule/enable',         'Enable / disable a schedule'],
    ['POST', '/schedule/run',            'Force-run a schedule entry now'],
    ['POST', '/board/card',              'Create a kanban card'],
    ['POST', '/board/move',              'Move a card to a new column'],
    ['POST', '/board/update',            'Update card fields'],
    ['POST', '/board/delete',            'Delete a card'],
    ['POST', '/board/import-todo',       'Import TODO.md into board'],
    ['POST', '/workflow/run',            '11.3 run a workflow definition'],
    ['GET',  '/workflow/runs',           'Past workflow run records'],
    ['GET',  '/workflow/templates',      'List saved workflow templates'],
    ['GET',  '/workflow/template',       'Load a saved workflow template'],
    ['POST', '/workflow/template',       'Save a workflow template'],
    ['POST', '/workflow/template/delete','Delete a workflow template'],
    ['POST', '/nl/parse',                '11.4 NL → workflow plan (preview)'],
    ['POST', '/nl/run',                  '11.4 parse + execute'],

    // Fleet (9.6 / 9.7 / 9.8)
    ['GET',  '/fleet/peers',             'Peer health'],
    ['GET',  '/fleet/list',              'Aggregated worker list across fleet'],
    ['POST', '/fleet/create',            'Create worker on a peer'],
    ['POST', '/fleet/task',              'Send task to a peer'],
    ['POST', '/fleet/close',             'Close worker on a peer'],
    ['POST', '/fleet/send',              'Forward send/key to a peer'],
    ['POST', '/fleet/transfer',          'Start rsync/scp transfer'],
    ['GET',  '/fleet/transfer',          'List or get transfer status'],
    ['POST', '/fleet/transfer/cancel',   'Cancel running transfer'],

    // Webhooks (10.4)
    ['POST', '/webhook/github',          'GitHub PR/push (HMAC verified)'],
    ['POST', '/webhook/gitlab',          'GitLab MR/push (token verified)'],

    // Misc
    ['GET',  '/config',                  'Daemon config snapshot'],
    ['POST', '/config/reload',           'Reload config.json'],
    ['POST', '/scribe/start',            'Start scribe scanner'],
    ['POST', '/scribe/stop',             'Stop scribe scanner'],
    ['GET',  '/scribe/status',           'Scribe status'],
    ['GET',  '/scribe/context',          'docs/session-context.md content'],
    ['POST', '/scribe/scan',             'Force one scribe scan'],
    ['POST', '/hook-event',              '3.15 worker hook payload'],
    ['GET',  '/hook-events',             'Buffered hook events for worker'],
    ['POST', '/compact-event',           'PostCompact hook trigger'],
    ['POST', '/status-update',           'Push notification line'],
    ['GET',  '/events',                  'SSE event stream'],
    ['GET',  '/watch',                   'SSE worker output stream'],
    ['GET',  '/dashboard',               'Built-in HTML dashboard'],
    ['POST', '/backup',                  'Tar.gz of persistent state (admin)'],
    ['POST', '/restore',                 'Restore tar.gz backup (admin)'],
    ['GET',  '/openapi.json',            'This document'],
  ];

  const paths = {};
  for (const [method, route, summary] of ROUTES) {
    if (!paths[route]) paths[route] = {};
    paths[route][method.toLowerCase()] = {
      summary,
      responses: {
        '200': { description: 'ok' },
        '400': { description: 'invalid request' },
        '401': { description: 'auth required' },
        '403': { description: 'role insufficient' },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'C4 daemon',
      version: version || '0.0.0',
      description: 'Claude {Claude Code} Code orchestrator REST API. Auth + per-route role gates documented in src/auth.js.',
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
}

module.exports = { build };
