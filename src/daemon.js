const http = require('http');
const PtyManager = require('./pty-manager');
const McpHandler = require('./mcp-handler');
const Planner = require('./planner');
const Scribe = require('./scribe');
const Notifications = require('./notifications');

const manager = new PtyManager();
const mcpHandler = new McpHandler(manager);
const planner = new Planner(manager);
const cfg = manager.getConfig();
const PORT = parseInt(process.env.PORT || cfg.daemon?.port || '3456');
const HOST = cfg.daemon?.host || '127.0.0.1';
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
  const route = url.pathname;

  try {
    let result;

    if (req.method === 'GET' && route === '/health') {
      result = { ok: true, workers: manager.list().workers.length };

    } else if (req.method === 'POST' && route === '/create') {
      const { name, command, args, target, cwd } = await parseBody(req);
      result = manager.create(name, command, args || [], { target, cwd });

    } else if (req.method === 'POST' && route === '/send') {
      const { name, input, keys } = await parseBody(req);
      result = await manager.send(name, input, keys || false);

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
      if (names.length === 0) {
        result = { error: 'No worker names specified' };
      } else {
        result = await manager.waitAndReadMulti(names, timeout, { interruptOnIntervention });
      }

    } else if (req.method === 'GET' && route === '/list') {
      result = manager.list();

    } else if (req.method === 'POST' && route === '/task') {
      const { name, task, branch, useBranch, useWorktree, projectRoot, scope, scopePreset, after, command, target, contextFrom, reuse, profile, autoMode } = await parseBody(req);
      result = manager.sendTask(name, task, { branch, useBranch, useWorktree, projectRoot, scope, scopePreset, after, command, target, contextFrom, reuse, profile, autoMode });

    } else if (req.method === 'POST' && route === '/approve') {
      const { name, optionNumber } = await parseBody(req);
      result = manager.approve(name, optionNumber);

    } else if (req.method === 'POST' && route === '/rollback') {
      const { name } = await parseBody(req);
      result = manager.rollback(name);

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
      result = manager.getTokenUsage();

    } else if (req.method === 'GET' && route === '/scrollback') {
      const name = url.searchParams.get('name');
      const lines = parseInt(url.searchParams.get('lines') || '200') || 200;
      result = manager.getScrollback(name, lines);

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

    } else if (req.method === 'GET' && route === '/dashboard') {
      // Dashboard Web UI (4.3)
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const listData = manager.list();
      const html = renderDashboard(listData);
      res.writeHead(200);
      res.end(html);
      return;

    } else {
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

server.listen(PORT, HOST, () => {
  console.log(`C4 daemon running on http://${HOST}:${PORT}`);
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
