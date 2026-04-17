const http = require('http');
const path = require('path');
const PtyManager = require('./pty-manager');
const McpHandler = require('./mcp-handler');
const Planner = require('./planner');
const Scribe = require('./scribe');
const Notifications = require('./notifications');
const { resolveBindHost } = require('./web-external');
const staticServer = require('./static-server');
const auth = require('./auth');
const historyView = require('./history-view');
const recovery = require('./recovery');

const WEB_DIST = path.resolve(__dirname, '..', 'web', 'dist');

const manager = new PtyManager();
const mcpHandler = new McpHandler(manager);
const planner = new Planner(manager);
const cfg = manager.getConfig();
const PORT = parseInt(process.env.PORT || cfg.daemon?.port || '3456');
const HOST = process.env.C4_BIND_HOST || resolveBindHost(cfg);
const notifications = new Notifications(cfg.notifications || {});
manager.setNotifications(notifications);

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
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

async function handleRequest(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const url = new URL(req.url, `http://${HOST}`);
  const rawPath = url.pathname;
  // Built web UI calls /api/* (vite dev server strips the prefix via proxy).
  // In prod the daemon serves both on port 3456, so alias /api/<x> -> /<x>.
  const { isApi: isApiPrefixed, route } = staticServer.resolveApiRoute(rawPath);

  // Validation object (9.9): also recognize path-param form
  // /worker/<name>/validation so the REST shape matches the TODO spec.
  // The query-param alias /validation?name=<x> is handled in the normal
  // route table below.
  let workerValidationName = null;
  {
    const m = route.match(/^\/worker\/([^\/]+)\/validation$/);
    if (m) workerValidationName = decodeURIComponent(m[1]);
  }

  // Per-worker history view (8.7): GET /history/<name>. The bare
  // /history endpoint keeps the backwards-compatible summary shape and
  // is handled in the main route table.
  let historyWorkerName = null;
  {
    const m = route.match(/^\/history\/([^\/]+)$/);
    if (m) historyWorkerName = decodeURIComponent(m[1]);
  }

  try {
    // Session auth middleware (8.14). Only API routes go through the check
    // so the built Web UI (static assets) can still load the login page
    // without a token. /dashboard is legacy HTML that we still protect when
    // auth is enabled.
    const cfg = manager.getConfig();
    const needsAuthCheck = isApiPrefixed || route === '/dashboard';
    if (needsAuthCheck) {
      const check = auth.checkRequest(cfg, req, route);
      if (!check.allow) {
        res.writeHead(check.status || 401);
        res.end(JSON.stringify(check.body || { error: 'Authentication required' }));
        return;
      }
    }

    let result;

    if (req.method === 'POST' && route === '/auth/login') {
      const body = await parseBody(req);
      const loginResult = auth.login(cfg, body);
      if (!loginResult.ok) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: loginResult.error || 'Login failed' }));
        return;
      }
      result = { token: loginResult.token, user: loginResult.user };

    } else if (req.method === 'POST' && route === '/auth/logout') {
      // Stateless JWT logout: client discards the token. We still return ok
      // so the UI can clear localStorage without a special-case branch.
      result = { ok: true };

    } else if (req.method === 'GET' && route === '/auth/status') {
      // Lets the Web UI know whether auth is enabled before rendering.
      result = { enabled: auth.isAuthEnabled(cfg) };

    } else if (req.method === 'GET' && route === '/health') {
      result = {
        ok: true,
        workers: manager.list().workers.length,
        version: manager._daemonVersion || null,
      };

    } else if (req.method === 'POST' && route === '/create') {
      const { name, command, args, target, cwd, parent } = await parseBody(req);
      result = manager.create(name, command, args || [], { target, cwd, parent });

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
      const waitAll = url.searchParams.get('waitAll') === '1';
      if (names.length === 0) {
        result = { error: 'No worker names specified' };
      } else {
        result = await manager.waitAndReadMulti(names, timeout, { interruptOnIntervention, waitAll });
      }

    } else if (req.method === 'GET' && route === '/list') {
      result = manager.list();

    } else if (req.method === 'GET' && route === '/tree') {
      const tree = require('./hierarchy-tree');
      const listData = manager.list();
      result = {
        roots: tree.buildTree(listData.workers || []),
        queuedTasks: listData.queuedTasks || [],
        lostWorkers: listData.lostWorkers || [],
      };

    } else if (req.method === 'POST' && route === '/task') {
      const { name, task, branch, useBranch, useWorktree, projectRoot, cwd, scope, scopePreset, after, command, target, contextFrom, reuse, profile, autoMode, budgetUsd, maxRetries } = await parseBody(req);
      result = manager.sendTask(name, task, { branch, useBranch, useWorktree, projectRoot, cwd, scope, scopePreset, after, command, target, contextFrom, reuse, profile, autoMode, budgetUsd, maxRetries });

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

    } else if (req.method === 'POST' && route === '/recover') {
      // 8.4: manual recovery pass. Runs the same strategy picker as the
      // automatic escalation hook but forces enabled=true so operators can
      // trigger recovery even when config.recovery.enabled is false.
      const { name, category } = await parseBody(req);
      if (!name) {
        result = { error: 'Missing name' };
      } else {
        result = recovery.recoverWorker(manager, name, { manual: true, categoryHint: category });
      }

    } else if (req.method === 'GET' && route === '/recovery-history') {
      // 8.4: read the append-only history for audit / debugging.
      const name = url.searchParams.get('name') || '';
      const limit = parseInt(url.searchParams.get('limit') || '0') || 0;
      const cfgNow = manager.getConfig();
      const projectRoot = cfgNow.worktree?.projectRoot || path.resolve(__dirname, '..');
      const records = recovery.readHistory(projectRoot, {
        worker: name || undefined,
        limit: limit || undefined,
      });
      result = { records, path: recovery.historyPath(projectRoot) };

    } else if (req.method === 'POST' && route === '/cancel') {
      // 8.8: cancel pending/queued/active task without destroying the worker.
      const { name } = await parseBody(req);
      if (!name) {
        result = { error: 'Missing name' };
      } else {
        result = manager.cancelTask(name);
      }

    } else if (req.method === 'POST' && route === '/restart') {
      // 8.8: kill + respawn a worker's PTY while preserving branch/worktree.
      const { name } = await parseBody(req);
      if (!name) {
        result = { error: 'Missing name' };
      } else {
        result = manager.restart(name);
      }

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

    } else if (req.method === 'POST' && route === '/scribe/start') {
      result = manager.scribeStart();

    } else if (req.method === 'POST' && route === '/scribe/stop') {
      result = manager.scribeStop();

    } else if (req.method === 'GET' && route === '/scribe/status') {
      result = manager.scribeStatus();

    } else if (req.method === 'POST' && route === '/scribe/scan') {
      result = manager.scribeScan();

    } else if (req.method === 'GET' && route === '/token-usage') {
      const perTask = url.searchParams.get('perTask') === '1';
      result = manager.getTokenUsage({ perTask });

    } else if (req.method === 'GET' && (route === '/validation' || workerValidationName)) {
      // Validation object (9.9): returns parsed JSON from
      // <worktree>/.c4-validation.json, falling back to a synthesized
      // object from git state when the file is missing or malformed.
      const name = workerValidationName || url.searchParams.get('name');
      if (!name) {
        result = { error: 'Missing name parameter' };
      } else {
        result = manager.getValidation(name);
      }

    } else if (req.method === 'GET' && route === '/scrollback') {
      const name = url.searchParams.get('name');
      const lines = parseInt(url.searchParams.get('lines') || '200') || 200;
      result = manager.getScrollback(name, lines);

    } else if (req.method === 'POST' && route === '/resize') {
      // 8.13: Web UI viewport resize -> server PTY + ScreenBuffer resize
      const { name, cols, rows } = await parseBody(req);
      if (!name || cols == null || rows == null) {
        result = { error: 'Missing name, cols or rows' };
      } else {
        result = manager.resize(name, cols, rows);
      }

    } else if (req.method === 'POST' && route === '/hook-event') {
      // Hook architecture (3.15): receive structured events from Claude Code hooks
      const body = await parseBody(req);
      const workerName = body.worker || '';
      console.error(`[DAEMON] /hook-event received: worker=${workerName} hook_type=${body.hook_type || ''} tool=${body.tool_name || ''}`);
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

    } else if (req.method === 'GET' && route === '/history') {
      // 8.7: richer summary shape for the Web UI. Query params stay
      // backwards compatible with the 3.7 CLI (`worker`, `limit`) and add
      // search/filter parameters (`q`, `status`, `since`, `until`).
      const worker = url.searchParams.get('worker') || '';
      const limit = parseInt(url.searchParams.get('limit') || '0') || 0;
      const status = url.searchParams.get('status') || '';
      const since = url.searchParams.get('since') || '';
      const until = url.searchParams.get('until') || '';
      const q = url.searchParams.get('q') || '';
      const all = manager.getHistory();
      const allRecords = Array.isArray(all.records) ? all.records : [];
      const records = historyView.filterRecords(allRecords, {
        worker: worker || undefined,
        limit: limit || undefined,
        status: status || undefined,
        since: since || undefined,
        until: until || undefined,
        q: q || undefined,
      });
      const liveWorkers = (manager.list().workers || []);
      const workers = historyView.summarizeWorkers(allRecords, liveWorkers);
      result = { records, workers, total: allRecords.length };

    } else if (req.method === 'GET' && historyWorkerName) {
      // 8.7: per-worker detail - past tasks + live scrollback (if alive).
      const all = manager.getHistory();
      const records = historyView.filterRecords(all.records || [], { worker: historyWorkerName });
      const liveList = manager.list().workers || [];
      const live = liveList.find((w) => w.name === historyWorkerName) || null;
      let scrollback = null;
      if (manager.workers && manager.workers.has(historyWorkerName)) {
        const linesParam = parseInt(url.searchParams.get('lines') || '2000') || 2000;
        const sb = manager.getScrollback(historyWorkerName, linesParam);
        if (!sb.error) scrollback = sb;
      }
      const lastBranch = records.length > 0 ? records[records.length - 1].branch : null;
      result = {
        name: historyWorkerName,
        records,
        alive: live ? live.status !== 'exited' : false,
        status: live ? live.status : null,
        branch: live ? live.branch : lastBranch,
        worktree: live ? live.worktree : null,
        scrollback,
      };

    } else if (req.method === 'GET' && route === '/scribe-context') {
      // 8.7: scribe session-context.md viewer. Reads docs/session-context.md
      // from the project root (or from config.scribe.outputPath if set).
      const cfgNow = manager.getConfig();
      const scribeCfg = cfgNow.scribe || {};
      const repoRoot = cfgNow.worktree?.projectRoot || path.resolve(__dirname, '..');
      const maxBytesParam = parseInt(url.searchParams.get('maxBytes') || '0') || 0;
      result = historyView.readScribeContext(repoRoot, {
        outputPath: scribeCfg.outputPath,
        maxBytes: maxBytesParam || undefined,
      });

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

    } else {
      // Static fallback for built web UI (8.12): serve web/dist for any
      // unmatched GET/HEAD that is not under the /api prefix. SPA routes
      // fall back to index.html inside serveStatic.
      if ((req.method === 'GET' || req.method === 'HEAD') && !isApiPrefixed) {
        const served = staticServer.serveStatic(req, res, {
          webDist: WEB_DIST,
          urlPath: rawPath,
        });
        if (served) return;
      }
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    if (!res.headersSent) {
      res.writeHead(result.error ? 400 : 200);
    }
    res.end(JSON.stringify(result));

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

// Smart recovery auto-hook (8.4). When a worker's intervention transitions
// to 'escalation' the daemon classifies the failure from scrollback and
// picks a strategy. Per-worker debounce keeps a stuck loop from retrying
// every frame — recoverWorker is re-entrant-safe but expensive, so we
// gate on a 30s minimum gap per worker.
const _recoveryLastRun = new Map();
const RECOVERY_DEBOUNCE_MS = 30000;

manager.on('sse', (event) => {
  if (!event || event.type !== 'error' || !event.escalation || !event.worker) return;
  const cfgNow = manager.getConfig();
  if (!cfgNow.recovery || cfgNow.recovery.enabled !== true) return;
  const last = _recoveryLastRun.get(event.worker) || 0;
  if (Date.now() - last < RECOVERY_DEBOUNCE_MS) return;
  _recoveryLastRun.set(event.worker, Date.now());
  try {
    const res = recovery.recoverWorker(manager, event.worker, { manual: false });
    if (res && res.recovered) {
      console.log(`[RECOVERY] auto-hook: ${event.worker} strategy=${res.strategy} category=${res.category} attempt=${res.attempt}`);
    } else if (res && res.skipped) {
      console.log(`[RECOVERY] auto-hook: ${event.worker} skipped (${res.reason})`);
    }
  } catch (err) {
    console.error(`[RECOVERY] auto-hook failed for ${event.worker}:`, err && err.message ? err.message : err);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`C4 daemon running on http://${HOST}:${PORT} (version ${manager._daemonVersion || 'unknown'})`);
  // Persist daemon version to state.json (7.15)
  try { manager._saveState(); } catch (e) { console.error('[DAEMON] _saveState on startup failed:', e.message); }
  manager.startHealthCheck();
  manager.startWorktreeGc();
  notifications.startPeriodicSlack();
});

process.on('SIGINT', () => {
  notifications.stopPeriodicSlack();
  manager.stopHealthCheck();
  manager.stopWorktreeGc();
  manager.closeAll();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  notifications.stopPeriodicSlack();
  manager.stopHealthCheck();
  manager.stopWorktreeGc();
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
