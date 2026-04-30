const http = require('http');
const PtyManager = require('./pty-manager');
const McpHandler = require('./mcp-handler');
const Planner = require('./planner');
const Scribe = require('./scribe');
const Notifications = require('./notifications');
const { Auth } = require('./auth');
const CicdWebhooks = require('./webhooks');

const manager = new PtyManager();
const mcpHandler = new McpHandler(manager);
const planner = new Planner(manager);
const cfg = manager.getConfig();
const PORT = parseInt(process.env.PORT || cfg.daemon?.port || '3456');
const HOST = cfg.daemon?.host || '127.0.0.1';
const notifications = new Notifications(cfg.notifications || {});
manager.setNotifications(notifications);
// (TODO 10.1) Auth gate. Off by default — config.auth.enabled toggles it.
const auth = new Auth(cfg);
// Expose to manager so PtyManager.reloadConfig() can refresh users / secret
// without a restart (hot-reload path).
manager._auth = auth;
// (TODO 10.4) CI/CD webhook receiver
const cicd = new CicdWebhooks(manager);
// Daemon hot-reload: watch config.json so live changes (users, schedules,
// projects, fleet peers) take effect without a restart.
if (typeof manager.watchConfig === 'function') manager.watchConfig();

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      let parsed = {};
      try { parsed = body ? JSON.parse(body) : {}; }
      catch { parsed = {}; }
      // (TODO 10.2) Stash the parsed body on req so the audit step at the
      // end of handleRequest can record it without re-reading the stream.
      req._auditBody = parsed;
      resolve(parsed);
    });
    req.on('error', reject);
  });
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderDashboard(listData) {
  const workers = listData.workers || [];
  const queued = listData.queuedTasks || [];
  const lost = listData.lostWorkers || [];
  const lastHC = listData.lastHealthCheck;

  const statusColor = (s) => {
    if (s === 'idle') return '#2ecc71';
    if (s === 'busy') return '#f39c12';
    if (s === 'exited') return '#e74c3c';
    if (s === 'queued') return '#9b59b6';
    return '#95a5a6';
  };

  let workerRows = '';
  if (workers.length === 0) {
    workerRows = '<tr><td colspan="8" style="text-align:center;color:#888;">No active workers</td></tr>';
  } else {
    for (const w of workers) {
      workerRows += '<tr>'
        + '<td>' + escapeHtml(w.name) + '</td>'
        + '<td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + statusColor(w.status) + ';margin-right:6px;"></span>' + escapeHtml(w.status) + '</td>'
        + '<td>' + escapeHtml(w.target) + '</td>'
        + '<td>' + escapeHtml(w.branch || '-') + '</td>'
        + '<td>' + escapeHtml(w.phase || '-') + '</td>'
        + '<td>' + (w.intervention ? escapeHtml(w.intervention) : '-') + '</td>'
        + '<td>' + w.unreadSnapshots + '/' + w.totalSnapshots + '</td>'
        + '<td>' + (w.pid || '-') + '</td>'
        + '</tr>';
    }
  }

  let queuedRows = '';
  if (queued.length > 0) {
    for (const q of queued) {
      queuedRows += '<tr>'
        + '<td>' + escapeHtml(q.name) + '</td>'
        + '<td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + statusColor('queued') + ';margin-right:6px;"></span>queued</td>'
        + '<td>' + escapeHtml(q.branch || '-') + '</td>'
        + '<td>' + escapeHtml(q.after || '-') + '</td>'
        + '<td>' + escapeHtml(q.task ? q.task.slice(0, 80) : '-') + '</td>'
        + '</tr>';
    }
  }

  let lostRows = '';
  if (lost.length > 0) {
    for (const l of lost) {
      lostRows += '<tr>'
        + '<td>' + escapeHtml(l.name) + '</td>'
        + '<td>' + (l.pid || '-') + '</td>'
        + '<td>' + escapeHtml(l.branch || '-') + '</td>'
        + '<td>' + escapeHtml(l.lostAt || '-') + '</td>'
        + '</tr>';
    }
  }

  const healthCheckInfo = lastHC
    ? 'Last health check: ' + new Date(lastHC).toLocaleString()
    : 'No health check yet';

  return '<!DOCTYPE html>'
    + '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>C4 Dashboard</title>'
    + '<style>'
    + 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:20px;background:#1a1a2e;color:#e0e0e0;}'
    + 'h1{color:#e0e0e0;font-size:1.5em;margin-bottom:4px;}'
    + '.subtitle{color:#888;font-size:0.85em;margin-bottom:20px;}'
    + 'table{width:100%;border-collapse:collapse;margin-bottom:24px;}'
    + 'th{background:#16213e;color:#e0e0e0;padding:10px 12px;text-align:left;font-size:0.85em;border-bottom:2px solid #0f3460;}'
    + 'td{padding:8px 12px;border-bottom:1px solid #16213e;font-size:0.85em;}'
    + 'tr:hover{background:#16213e;}'
    + '.section{margin-bottom:24px;}'
    + '.section-title{font-size:1.1em;color:#e94560;margin-bottom:8px;}'
    + '.stats{display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap;}'
    + '.stat{background:#16213e;padding:12px 20px;border-radius:8px;min-width:120px;}'
    + '.stat-value{font-size:1.4em;font-weight:bold;color:#e94560;}'
    + '.stat-label{font-size:0.75em;color:#888;margin-top:2px;}'
    + '.refresh{color:#888;font-size:0.8em;margin-top:16px;}'
    + '</style></head><body>'
    + '<h1>C4 Dashboard</h1>'
    + '<div class="subtitle">' + escapeHtml(healthCheckInfo) + '</div>'
    + '<div class="stats">'
    + '<div class="stat"><div class="stat-value">' + workers.length + '</div><div class="stat-label">Workers</div></div>'
    + '<div class="stat"><div class="stat-value">' + workers.filter(w => w.status === 'busy').length + '</div><div class="stat-label">Busy</div></div>'
    + '<div class="stat"><div class="stat-value">' + workers.filter(w => w.status === 'idle').length + '</div><div class="stat-label">Idle</div></div>'
    + '<div class="stat"><div class="stat-value">' + workers.filter(w => w.status === 'exited').length + '</div><div class="stat-label">Exited</div></div>'
    + '<div class="stat"><div class="stat-value">' + queued.length + '</div><div class="stat-label">Queued</div></div>'
    + '</div>'
    + '<div class="section"><div class="section-title">Workers</div>'
    + '<table><thead><tr><th>Name</th><th>Status</th><th>Target</th><th>Branch</th><th>Phase</th><th>Intervention</th><th>Snapshots</th><th>PID</th></tr></thead>'
    + '<tbody>' + workerRows + '</tbody></table></div>'
    + (queued.length > 0
      ? '<div class="section"><div class="section-title">Queued Tasks</div>'
        + '<table><thead><tr><th>Name</th><th>Status</th><th>Branch</th><th>After</th><th>Task</th></tr></thead>'
        + '<tbody>' + queuedRows + '</tbody></table></div>'
      : '')
    + (lost.length > 0
      ? '<div class="section"><div class="section-title">Lost Workers</div>'
        + '<table><thead><tr><th>Name</th><th>PID</th><th>Branch</th><th>Lost At</th></tr></thead>'
        + '<tbody>' + lostRows + '</tbody></table></div>'
      : '')
    + '<div class="refresh">Auto-refresh: <script>setTimeout(function(){location.reload()},30000);</script>30s</div>'
    + '</body></html>';
}

// (1.6.16) Static serving for the React SPA bundle in web/dist. Returns
// true if the response was handled. Maps:
//   GET /                 → web/dist/index.html
//   GET /assets/foo.css   → web/dist/assets/foo.css
//   GET /favicon.ico      → web/dist/favicon.ico
//   GET /<anything-else>  → web/dist/index.html (SPA fallback) — only when
//                           the bundle directory exists; otherwise false so
//                           the caller emits a JSON 404.
const path = require('path');
const fsStatic = require('fs');
const STATIC_ROOT = path.resolve(__dirname, '..', 'web', 'dist');
const STATIC_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico':  'image/x-icon',
  '.map':  'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function _serveStatic(route, res) {
  if (!fsStatic.existsSync(STATIC_ROOT)) return false;
  // Path traversal hardening: resolve and ensure inside STATIC_ROOT.
  let rel = decodeURIComponent(route);
  if (rel === '/' || rel === '') rel = '/index.html';
  const target = path.resolve(STATIC_ROOT, '.' + rel);
  if (!target.startsWith(STATIC_ROOT)) return false;
  let filePath = target;
  if (!fsStatic.existsSync(filePath) || fsStatic.statSync(filePath).isDirectory()) {
    // SPA fallback — non-asset routes hit index.html so React Router can pick up.
    if (rel.startsWith('/api/') || rel.startsWith('/assets/')) return false;
    filePath = path.join(STATIC_ROOT, 'index.html');
    if (!fsStatic.existsSync(filePath)) return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = STATIC_MIME[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  // Long cache for /assets/* (vite content-hashes filenames). Short cache
  // for index.html so deploys are immediate.
  res.setHeader('Cache-Control',
    rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.writeHead(200);
  res.end(fsStatic.readFileSync(filePath));
  return true;
}

async function handleRequest(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const url = new URL(req.url, `http://${HOST}`);
  const route = url.pathname;
  // (TODO 10.1) Auth gate. Skipped entirely when config.auth.enabled=false.
  const decision = auth.authorize(req, route);
  if (!decision.ok) {
    res.writeHead(decision.status);
    res.end(JSON.stringify({ error: decision.error }));
    return;
  }
  // Replace anonymous actor with authenticated subject when available.
  const actor = (decision.payload && decision.payload.sub)
    || req.headers['x-c4-actor']
    || 'anonymous';
  // (TODO 10.2) Audit metadata. parseBody stashes the parsed body on req.
  const auditableMethod = req.method !== 'GET' && req.method !== 'OPTIONS';

  try {
    let result;

    if (req.method === 'POST' && route === '/auth/login') {
      const { username, password } = await parseBody(req);
      result = auth.issueToken(username, password);
      res.writeHead(result.error ? 401 : 200);
      res.end(JSON.stringify(result));
      return;
    }
    if (req.method === 'GET' && route === '/auth/whoami') {
      result = decision.payload || { sub: 'anonymous' };
      res.writeHead(200);
      res.end(JSON.stringify(result));
      return;
    }

    if (req.method === 'GET' && route === '/openapi.json') {
      const { build } = require('./openapi');
      result = build(manager._daemonVersion || null);

    } else if (req.method === 'GET' && route === '/health') {
      result = {
        ok: true,
        workers: manager.list().workers.length,
        version: manager._daemonVersion || null,
      };

    } else if (req.method === 'GET' && route === '/metrics') {
      // (TODO #95) Per-worker + daemon process metrics snapshot.
      result = manager.metrics();

    } else if (req.method === 'GET' && route === '/fleet/peers') {
      // 9.6: peer health snapshot across configured fleet daemons.
      result = await manager.fleetPeers();

    } else if (req.method === 'GET' && route === '/fleet/list') {
      // 9.6: aggregated worker list from local + every fleet peer.
      result = await manager.fleetList();

    } else if (req.method === 'POST' && route === '/fleet/create') {
      const { peer, ...args } = await parseBody(req);
      if (!peer) result = { error: 'peer is required' };
      else result = await manager.fleetCreate(peer, args);

    } else if (req.method === 'POST' && route === '/fleet/task') {
      const { peer, ...args } = await parseBody(req);
      if (!peer) result = { error: 'peer is required' };
      else result = await manager.fleetTask(peer, args);

    } else if (req.method === 'POST' && route === '/fleet/close') {
      const { peer, ...args } = await parseBody(req);
      if (!peer) result = { error: 'peer is required' };
      else result = await manager.fleetClose(peer, args);

    } else if (req.method === 'POST' && route === '/fleet/send') {
      const { peer, ...args } = await parseBody(req);
      if (!peer) result = { error: 'peer is required' };
      else result = await manager.fleetSend(peer, args);

    } else if (req.method === 'POST' && route === '/dispatch') {
      // 9.7: pick a peer (local or fleet) and run task there.
      const body = await parseBody(req);
      result = await manager.dispatch(body);

    } else if (req.method === 'POST' && route === '/fleet/transfer') {
      // 9.8: rsync/scp file transfer between local + peers.
      const body = await parseBody(req);
      result = manager.fileTransfer(body);

    } else if (req.method === 'GET' && route === '/fleet/transfer') {
      const id = url.searchParams.get('id');
      if (!id) result = manager.listTransfers({ limit: parseInt(url.searchParams.get('limit') || '50') });
      else result = manager.getTransfer(id);

    } else if (req.method === 'POST' && route === '/fleet/transfer/cancel') {
      const { id } = await parseBody(req);
      result = manager.cancelTransfer(id);

    } else if (req.method === 'POST' && route === '/create') {
      const { name, command, args, target, cwd, adapter, adapterOpts, resume } = await parseBody(req);
      result = manager.create(name, command, args || [], { target, cwd, adapter, adapterOpts, resume });

    } else if (req.method === 'POST' && route === '/send') {
      const { name, input, keys } = await parseBody(req);
      result = await manager.send(name, input, keys || false);

    } else if (req.method === 'POST' && route === '/key') {
      const { name, key } = await parseBody(req);
      if (!name || !key) {
        result = { error: 'Missing name or key' };
      } else {
        result = manager.send(name, key, true);
      }

    } else if (req.method === 'GET' && route === '/read') {
      const name = url.searchParams.get('name');
      result = manager.read(name);

    } else if (req.method === 'GET' && route === '/read-now') {
      const name = url.searchParams.get('name');
      result = manager.readNow(name);

    } else if (req.method === 'GET' && route === '/wait-read') {
      const name = url.searchParams.get('name');
      const timeout = parseInt(url.searchParams.get('timeout') || '120000');
      const interruptOnIntervention = url.searchParams.get('interruptOnIntervention') === '1';
      result = await manager.waitAndRead(name, timeout, { interruptOnIntervention });

    } else if (req.method === 'GET' && route === '/wait-read-multi') {
      const namesParam = url.searchParams.get('names') || '';
      const names = namesParam.split(',').filter(Boolean);
      const timeout = parseInt(url.searchParams.get('timeout') || '120000');
      const interruptOnIntervention = url.searchParams.get('interruptOnIntervention') === '1';
      const mode = url.searchParams.get('mode') === 'all' ? 'all' : 'first';
      if (names.length === 0) {
        result = { error: 'No worker names specified' };
      } else {
        result = await manager.waitAndReadMulti(names, timeout, { interruptOnIntervention, mode });
      }

    } else if (req.method === 'GET' && route === '/list') {
      result = manager.list();

    } else if (req.method === 'POST' && route === '/task') {
      const { name, task, branch, useBranch, useWorktree, projectRoot, cwd, scope, scopePreset, after, command, target, contextFrom, reuse, profile, autoMode } = await parseBody(req);
      result = manager.sendTask(name, task, { branch, useBranch, useWorktree, projectRoot, cwd, scope, scopePreset, after, command, target, contextFrom, reuse, profile, autoMode });

    } else if (req.method === 'POST' && route === '/merge') {
      const { name, skipChecks } = await parseBody(req);
      if (!name) {
        result = { error: 'Missing name' };
      } else {
        try {
          const { execSync } = require('child_process');
          const repoRoot = manager.config.worktree?.projectRoot || path.resolve(__dirname, '..');
          // Resolve worker name to branch
          let branch = name;
          const workerEntry = manager.workers?.get(name);
          if (workerEntry && workerEntry.branch) {
            branch = workerEntry.branch;
          } else {
            const wtPath = path.resolve(repoRoot, '..', `c4-worktree-${name}`);
            try {
              if (fs.existsSync(wtPath)) {
                branch = execSync(`git -C "${wtPath.replace(/\\/g, '/')}" rev-parse --abbrev-ref HEAD`, { encoding: 'utf8', stdio: 'pipe' }).trim();
              }
            } catch {}
          }
          // Verify on main
          const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' }).trim();
          if (currentBranch !== 'main') {
            result = { error: `Must be on main branch (currently on ${currentBranch})` };
          } else {
            execSync(`git merge "${branch}" --no-ff -m "Merge branch '${branch}'"`, { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' });
            result = { success: true, merged: branch };
          }
        } catch (e) {
          result = { error: `Merge failed: ${e.message}` };
        }
      }

    } else if (req.method === 'POST' && route === '/approve') {
      const { name, optionNumber } = await parseBody(req);
      result = manager.approve(name, optionNumber);

    } else if (req.method === 'POST' && route === '/rollback') {
      const { name } = await parseBody(req);
      result = manager.rollback(name);

    } else if (req.method === 'POST' && route === '/suspend') {
      const { name } = await parseBody(req);
      result = manager.suspend(name);

    } else if (req.method === 'POST' && route === '/resume') {
      const { name } = await parseBody(req);
      result = manager.resumeWorker(name);

    } else if (req.method === 'POST' && route === '/restart') {
      const { name, resume } = await parseBody(req);
      result = await manager.restart(name, { resume: resume !== false });

    } else if (req.method === 'POST' && route === '/cancel') {
      const { name } = await parseBody(req);
      result = await manager.cancelTask(name);

    } else if (req.method === 'POST' && route === '/batch-action') {
      const { names, action, args } = await parseBody(req);
      result = await manager.batch(names || [], action, args || {});

    } else if (req.method === 'POST' && route === '/cleanup') {
      const { dryRun } = await parseBody(req);
      result = manager.cleanup(dryRun);

    } else if (req.method === 'POST' && route === '/close') {
      const { name } = await parseBody(req);
      result = manager.close(name);

    } else if (req.method === 'GET' && route === '/config') {
      result = manager.getConfig();

    } else if (req.method === 'POST' && route === '/config/reload') {
      result = manager.reloadConfig();

    } else if (req.method === 'POST' && route === '/backup') {
      // Backup/restore — admin-only via auth route table.
      const { outPath } = await parseBody(req);
      result = manager.backup({ outPath });

    } else if (req.method === 'POST' && route === '/restore') {
      const { archive, dryRun } = await parseBody(req);
      result = manager.restore({ archive, dryRun: !!dryRun });

    } else if (req.method === 'POST' && route === '/scribe/start') {
      result = manager.scribeStart();

    } else if (req.method === 'POST' && route === '/scribe/stop') {
      result = manager.scribeStop();

    } else if (req.method === 'GET' && route === '/scribe/status') {
      result = manager.scribeStatus();

    } else if (req.method === 'GET' && route === '/scribe/context') {
      // 8.7: read the accumulated docs/session-context.md for the Web UI.
      result = manager.scribeContext();

    } else if (req.method === 'POST' && route === '/scribe/scan') {
      result = manager.scribeScan();

    } else if (req.method === 'GET' && route === '/token-usage') {
      result = manager.getTokenUsage();

    } else if (req.method === 'GET' && route === '/scrollback') {
      const name = url.searchParams.get('name');
      const lines = parseInt(url.searchParams.get('lines') || '200') || 200;
      result = manager.getScrollback(name, lines);

    } else if (req.method === 'POST' && route === '/hook-event') {
      // Hook architecture (3.15): receive structured events from Claude Code hooks
      // 7.24: hook-relay.js injects `worker` and aliases hook_event_name →
      // hook_type. Re-apply both fallbacks here so direct POSTs (tests,
      // external relays) also work without going through hook-relay.
      const body = await parseBody(req);
      const workerName = body.worker || '';
      const hookType = body.hook_type || body.hook_event_name || '';
      if (!body.hook_type && body.hook_event_name) body.hook_type = body.hook_event_name;
      console.error(`[DAEMON] /hook-event received: worker=${workerName} hook_type=${hookType} tool=${body.tool_name || ''}`);
      if (!workerName) {
        console.error('[DAEMON] /hook-event rejected: missing worker name');
        result = { error: 'Missing worker name in hook event' };
      } else {
        result = manager.hookEvent(workerName, body);
      }

    } else if (req.method === 'GET' && route === '/hook-events') {
      // Query hook events for a worker (3.15)
      const name = url.searchParams.get('name');
      const limit = parseInt(url.searchParams.get('limit') || '50') || 50;
      if (!name) {
        result = { error: 'Missing name parameter' };
      } else {
        result = manager.getHookEvents(name, limit);
      }

    } else if (req.method === 'GET' && route === '/events') {
      // SSE endpoint (3.5)
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      res.write('data: {"type":"connected"}\n\n');

      const onEvent = (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };
      manager.on('sse', onEvent);
      manager.addSSEClient(res);

      req.on('close', () => {
        manager.removeListener('sse', onEvent);
      });
      return; // Don't end the response

    } else if (req.method === 'POST' && route === '/plan') {
      const { name, task, branch, outputPath, scopePreset, contextFrom } = await parseBody(req);
      result = planner.sendPlan(name, task, { branch, outputPath, scopePreset, contextFrom });

    } else if (req.method === 'GET' && route === '/plan') {
      const name = url.searchParams.get('name');
      const outputPath = url.searchParams.get('outputPath') || '';
      result = planner.readPlan(name, { outputPath: outputPath || undefined });

    } else if (req.method === 'POST' && route === '/mcp') {
      const body = await parseBody(req);
      result = await mcpHandler.handle(body);
      res.writeHead(200);
      res.end(JSON.stringify(result));
      return;

    } else if (req.method === 'GET' && route === '/templates') {
      result = { templates: manager.listTemplates() };

    } else if (req.method === 'GET' && route === '/profiles') {
      result = { profiles: manager.listProfiles() };

    } else if (req.method === 'GET' && route === '/swarm') {
      const name = url.searchParams.get('name');
      if (!name) {
        result = { error: 'Missing name parameter' };
      } else {
        result = manager.getSwarmStatus(name);
      }

    } else if (req.method === 'POST' && route === '/auto') {
      const { task, name } = await parseBody(req);
      result = manager.autoStart(task, { name });

    } else if (req.method === 'POST' && route === '/morning') {
      result = manager.generateMorningReport();

    } else if (req.method === 'POST' && route === '/status-update') {
      const { worker, message } = await parseBody(req);
      notifications.statusUpdate(worker || 'C4', message);
      result = { sent: true };

    } else if (req.method === 'POST' && (route === '/webhook/github' || route === '/webhook/gitlab')) {
      // 10.4 — read raw body for HMAC verification, then JSON.parse for handler.
      const rawBody = await new Promise((resolve, reject) => {
        let buf = '';
        req.on('data', (c) => { buf += c; });
        req.on('end', () => resolve(buf));
        req.on('error', reject);
      });
      let parsed = {};
      try { parsed = rawBody ? JSON.parse(rawBody) : {}; } catch { parsed = {}; }
      req._auditBody = { vendor: route.split('/').pop(), event: req.headers['x-github-event'] || req.headers['x-gitlab-event'] || null };
      const vendor = route === '/webhook/github' ? 'github' : 'gitlab';
      result = await cicd.handle(vendor, req.headers, rawBody, parsed);

    } else if (req.method === 'POST' && route === '/nl/parse') {
      // 11.4 — preview only
      const { text } = await parseBody(req);
      result = manager.parseNL(text || '');
    } else if (req.method === 'POST' && route === '/nl/run') {
      // 11.4 — parse + execute (if confidence > threshold)
      const { text, execute, minConfidence } = await parseBody(req);
      result = await manager.runNL(text || '', { execute, minConfidence });

    } else if (req.method === 'POST' && route === '/workflow/run') {
      // 11.3 — run a workflow definition (JSON in body)
      const body = await parseBody(req);
      result = await manager.runWorkflow(body);

    } else if (req.method === 'GET' && route === '/workflow/runs') {
      // 11.3 follow-up — past workflow runs
      const limit = parseInt(url.searchParams.get('limit') || '50') || 50;
      const name = url.searchParams.get('name') || undefined;
      result = manager.getWorkflowRuns({ limit, name });

    } else if (req.method === 'GET' && route === '/workflow/templates') {
      result = manager.listWorkflowTemplates();
    } else if (req.method === 'GET' && route === '/workflow/template') {
      const name = url.searchParams.get('name');
      result = manager.loadWorkflowTemplate(name);
    } else if (req.method === 'POST' && route === '/workflow/template') {
      const { name, workflow } = await parseBody(req);
      result = manager.saveWorkflowTemplate(name, workflow);
    } else if (req.method === 'POST' && route === '/workflow/template/delete') {
      const { name } = await parseBody(req);
      result = manager.deleteWorkflowTemplate(name);

    } else if (req.method === 'GET' && route === '/board') {
      // 10.8 kanban
      const project = url.searchParams.get('project') || 'default';
      result = manager._ensurePmBoard().get(project);
    } else if (req.method === 'POST' && route === '/board/card') {
      const { project = 'default', ...body } = await parseBody(req);
      result = manager._ensurePmBoard().createCard(project, body);
    } else if (req.method === 'POST' && route === '/board/update') {
      const { project = 'default', cardId, ...patch } = await parseBody(req);
      result = manager._ensurePmBoard().updateCard(project, cardId, patch);
    } else if (req.method === 'POST' && route === '/board/move') {
      const { project = 'default', cardId, to } = await parseBody(req);
      result = manager._ensurePmBoard().moveCard(project, cardId, to);
    } else if (req.method === 'POST' && route === '/board/delete') {
      const { project = 'default', cardId } = await parseBody(req);
      result = manager._ensurePmBoard().deleteCard(project, cardId);
    } else if (req.method === 'POST' && route === '/board/import-todo') {
      const { project = 'default', todoPath } = await parseBody(req);
      result = manager._ensurePmBoard().importTodoMd(project, todoPath);

    } else if (req.method === 'GET' && route === '/departments') {
      // 10.6: department roll-up
      result = manager.listDepartments();

    } else if (req.method === 'GET' && route === '/cost-report') {
      // 10.5: monthly token cost rollup
      const since = url.searchParams.get('since') || undefined;
      const until = url.searchParams.get('until') || undefined;
      const model = url.searchParams.get('model') || undefined;
      result = manager.getCostReport({ since, until, model });

    } else if (req.method === 'GET' && route === '/projects') {
      // 10.3: aggregated project view
      result = manager.listProjects();

    } else if (req.method === 'GET' && route === '/schedules') {
      result = manager.schedulerList();
    } else if (req.method === 'POST' && route === '/scheduler/start') {
      result = manager.schedulerStart();
    } else if (req.method === 'POST' && route === '/scheduler/stop') {
      result = manager.schedulerStop();
    } else if (req.method === 'POST' && route === '/schedule') {
      const body = await parseBody(req);
      result = manager.schedulerAdd(body);
    } else if (req.method === 'POST' && route === '/schedule/remove') {
      const { id } = await parseBody(req);
      result = manager.schedulerRemove(id);
    } else if (req.method === 'POST' && route === '/schedule/enable') {
      const { id, enabled } = await parseBody(req);
      result = manager.schedulerEnable(id, enabled !== false);
    } else if (req.method === 'POST' && route === '/schedule/run') {
      const { id } = await parseBody(req);
      result = await manager.schedulerRunNow(id);

    } else if (req.method === 'GET' && route === '/audit/export') {
      // /audit/export?format=csv|json|jsonl + same filters as /audit
      const since = url.searchParams.get('since') || undefined;
      const until = url.searchParams.get('until') || undefined;
      const actionParam = url.searchParams.get('action') || undefined;
      const worker = url.searchParams.get('worker') || undefined;
      const actorParam = url.searchParams.get('actor') || undefined;
      const format = url.searchParams.get('format') || 'json';
      const out = manager.exportAudit({ since, until, action: actionParam, worker, actor: actorParam, format });
      // Stream non-JSON content types directly so the file downloads cleanly.
      res.writeHead(200, {
        'Content-Type': out.contentType,
        'Content-Disposition': `attachment; filename="c4-audit.${format === 'jsonl' ? 'jsonl' : format}"`,
      });
      res.end(out.body);
      return;

    } else if (req.method === 'GET' && route === '/audit') {
      // 10.2: query audit log
      const since = url.searchParams.get('since') || undefined;
      const until = url.searchParams.get('until') || undefined;
      const action = url.searchParams.get('action') || undefined;
      const worker = url.searchParams.get('worker') || undefined;
      const actorParam = url.searchParams.get('actor') || undefined;
      const limit = parseInt(url.searchParams.get('limit') || '200') || 200;
      result = manager.getAudit({ since, until, action, worker, actor: actorParam, limit });

    } else if (req.method === 'GET' && route === '/history') {
      const worker = url.searchParams.get('worker') || '';
      const limit = parseInt(url.searchParams.get('limit') || '0') || 0;
      result = manager.getHistory({ worker: worker || undefined, limit: limit || undefined });

    } else if (req.method === 'POST' && route === '/compact-event') {
      // Manager auto-replacement (4.7): compact event from PostCompact hook
      const { worker } = await parseBody(req);
      if (!worker) {
        result = { error: 'Missing worker name in compact event' };
      } else {
        result = manager.compactEvent(worker);
      }

    } else if (req.method === 'GET' && route === '/session-id') {
      // Resume support (4.1): get session ID for a worker
      const name = url.searchParams.get('name');
      if (!name) {
        result = { error: 'Missing name parameter' };
      } else {
        const sessionId = manager.getSessionId(name);
        result = { name, sessionId };
      }

    } else if (req.method === 'POST' && route === '/resume') {
      // Resume support (4.1): restart worker with --resume
      const { name, sessionId } = await parseBody(req);
      if (!name) {
        result = { error: 'Missing name parameter' };
      } else {
        const sid = sessionId || manager.getSessionId(name);
        if (!sid) {
          result = { error: `No session ID found for '${name}'` };
        } else {
          // Close existing worker if alive
          const existing = manager.workers.get(name);
          if (existing && existing.alive) {
            manager.close(name);
          } else if (existing) {
            if (existing.idleTimer) clearTimeout(existing.idleTimer);
            if (existing.rawLogStream && !existing.rawLogStream.destroyed) existing.rawLogStream.end();
            manager.workers.delete(name);
          }
          result = manager.create(name, 'claude', ['--resume', sid], { target: 'local' });
        }
      }

    } else if (req.method === 'GET' && route === '/watch') {
      // Watch worker output stream (5.42) — SSE with base64-encoded PTY data
      const name = url.searchParams.get('name');
      if (!name) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing name parameter' }));
        return;
      }

      const unwatch = manager.watchWorker(name, (data) => {
        const encoded = Buffer.from(data).toString('base64');
        res.write(`data: ${JSON.stringify({ type: 'output', data: encoded })}\n\n`);
      });

      if (!unwatch) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: `Worker '${name}' not found` }));
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      res.write(`data: ${JSON.stringify({ type: 'connected', worker: name })}\n\n`);

      req.on('close', () => {
        unwatch();
      });
      return; // Don't end the response

    } else if (req.method === 'GET' && route === '/dashboard') {
      // Dashboard Web UI (4.3)
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const listData = manager.list();
      const html = renderDashboard(listData);
      res.writeHead(200);
      res.end(html);
      return;

    } else if (req.method === 'GET' && _serveStatic(route, res)) {
      // Daemon-served SPA from web/dist (1.6.16). Falls through to 404
      // when the bundle isn't built yet — explicit hint included.
      return;

    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Project-scoped RBAC (post-handler): if the bearer carries a per-user
    // projects[] allow-list, we verify the worker affected by this mutation
    // belongs to one of those projects. Side-effects already happened, but
    // we still flip the response code so callers see the rejection and can
    // alert / reverse manually.
    if (auditableMethod && decision.payload && decision.payload.role !== 'admin') {
      const scope = auth.enforceProjectScope(decision.payload, manager, req._auditBody || {});
      if (!scope.ok) {
        if (!res.headersSent) {
          res.writeHead(scope.status);
          res.end(JSON.stringify({ error: scope.error }));
          // still record the rejection in audit
          if (manager.audit) {
            manager.audit({ actor, action: route, worker: (req._auditBody && req._auditBody.name) || null, ok: false, error: scope.error });
          }
          return;
        }
      }
    }

    if (!res.headersSent) {
      res.writeHead(result.error ? 400 : 200);
    }
    res.end(JSON.stringify(result));

    // (TODO 10.2) Record the mutation. Skip GET/OPTIONS, hook events
    // (huge volume), and dashboard HTML.
    if (auditableMethod && route !== '/hook-event') {
      const body = req._auditBody || {};
      manager.audit({
        actor,
        action: route,
        worker: body.name || body.worker || null,
        ok: !result.error,
        error: result.error || null,
        bodyKeys: Object.keys(body).slice(0, 12),
        bodySummary: typeof body.task === 'string'
          ? { task: body.task.slice(0, 200) }
          : null,
      });
    }

  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500);
    }
    if (!res.writableEnded) {
      res.end(JSON.stringify({ error: err.message }));
    }
  }
}

const server = http.createServer(handleRequest);

server.listen(PORT, HOST, () => {
  console.log(`C4 daemon running on http://${HOST}:${PORT} (version ${manager._daemonVersion || 'unknown'})`);
  // Persist daemon version to state.json (7.15)
  try { manager._saveState(); } catch (e) { console.error('[DAEMON] _saveState on startup failed:', e.message); }
  manager.startHealthCheck();
  notifications.startPeriodicSlack();
});

process.on('SIGINT', () => {
  notifications.stopPeriodicSlack();
  manager.stopHealthCheck();
  manager.closeAll();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  notifications.stopPeriodicSlack();
  manager.stopHealthCheck();
  manager.closeAll();
  server.close();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('[DAEMON] uncaughtException:', err.message);
  // Don't crash — log and continue
});

process.on('unhandledRejection', (err) => {
  console.error('[DAEMON] unhandledRejection:', err);
});
