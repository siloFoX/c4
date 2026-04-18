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
const fleet = require('./fleet');
const dispatcher = require('./dispatcher');
const fileTransfer = require('./file-transfer');
const auditLog = require('./audit-log');
const costReport = require('./cost-report');
const projectMgmt = require('./project-mgmt');
const projectDashboard = require('./project-dashboard');
const rbac = require('./rbac');
const cicd = require('./cicd');
const orgMgmt = require('./org-mgmt');
const scheduleMgmt = require('./schedule-mgmt');
const mcpHub = require('./mcp-hub');
const nlInterface = require('./nl-interface');
const workflowMod = require('./workflow');
const computerUseMod = require('./computer-use');

const WEB_DIST = path.resolve(__dirname, '..', 'web', 'dist');

const manager = new PtyManager();
const mcpHandler = new McpHandler(manager);
const planner = new Planner(manager);
const cfg = manager.getConfig();
const PORT = parseInt(process.env.PORT || cfg.daemon?.port || '3456');
const HOST = process.env.C4_BIND_HOST || resolveBindHost(cfg);
const notifications = new Notifications(cfg.notifications || {});
manager.setNotifications(notifications);

// (10.2) Shared audit logger. Writes to ~/.c4/audit.jsonl by default so
// the trail survives daemon restarts. Every security-relevant endpoint
// below records through this instance; the CLI `c4 audit` subcommands
// read/verify the same file. All record() calls are wrapped in
// _safeAudit so a logging failure never breaks the request.
const audit = auditLog.getShared(
  cfg.audit && typeof cfg.audit.path === 'string' ? { logPath: cfg.audit.path } : {}
);
function _auditActor(authCheck) {
  // Prefer the JWT subject when auth is enabled, fall back to "system"
  // for unauthenticated (or auth-disabled) requests so the actor field
  // is always populated.
  if (authCheck && authCheck.decoded && typeof authCheck.decoded.sub === 'string') {
    return authCheck.decoded.sub;
  }
  return 'system';
}
function _safeAudit(type, details, overrides) {
  try { return audit.record(type, details, overrides); }
  catch (e) { console.error('[AUDIT] record failed:', e && e.message ? e.message : e); return null; }
}

// (10.1) Shared RoleManager. Writes to ~/.c4/rbac.json by default; the
// daemon and CLI both go through getShared so a `c4 rbac` mutation is
// visible on the next request without a restart. Tests construct their
// own RoleManager pointed at a tmpdir and never touch the shared one.
const rbacManager = rbac.getShared(
  cfg.rbac && typeof cfg.rbac.path === 'string' ? { storePath: cfg.rbac.path } : {}
);

// roleFor(name) -> string|null. Looks up a user's role in the RBAC store
// first, then in config.auth.users[name].role, so operators who have not
// migrated to ~/.c4/rbac.json yet still get a meaningful role on the JWT.
function roleFor(name) {
  if (!name) return null;
  try {
    const u = rbacManager.getUser(name);
    if (u && u.role) return u.role;
  } catch {}
  const cfgNow = manager.getConfig();
  const cu = cfgNow && cfgNow.auth && cfgNow.auth.users && cfgNow.auth.users[name];
  if (cu && typeof cu.role === 'string') return cu.role;
  return null;
}

// requireRole(authCheck, action, resource?) -> {allow, status?, body?}
// Single decision point for the RBAC gate. When auth is disabled or the
// caller could not be identified we fall back to allow=true so the
// existing behaviour stays intact for operators who have not enabled
// auth yet (they get the RBAC behaviour the moment auth.enabled flips).
function requireRole(authCheck, action, resource) {
  if (!auth.isAuthEnabled(manager.getConfig())) return { allow: true };
  const username = authCheck && authCheck.decoded && typeof authCheck.decoded.sub === 'string'
    ? authCheck.decoded.sub : null;
  if (!username) {
    return { allow: false, status: 401, body: { error: 'Authentication required' } };
  }
  const ok = rbacManager.checkPermission(username, action, resource);
  if (!ok) {
    return {
      allow: false,
      status: 403,
      body: { error: 'Forbidden', action, user: username },
    };
  }
  return { allow: true };
}

function denyOr(res, gate) {
  if (gate.allow) return false;
  res.writeHead(gate.status || 403);
  res.end(JSON.stringify(gate.body || { error: 'Forbidden' }));
  return true;
}

// (10.4) Shared CicdManager. Writes to ~/.c4/cicd.json by default;
// honours config.cicd.path. The dispatchWorker callback auto-creates
// a worker and queues a task whenever a pipeline action of type
// 'worker.task' fires, so operators get a worker per CI event without
// extra wiring. Tests build their own CicdManager with a tmpdir + a
// mock dispatchWorker and never touch this shared instance.
function _buildCicdManagerFromConfig(cfgNow) {
  const cicdCfg = (cfgNow && cfgNow.cicd) || {};
  const mgr = cicd.getShared({
    storePath: typeof cicdCfg.path === 'string' ? cicdCfg.path : undefined,
    webhookSecret: cicdCfg.webhooks && typeof cicdCfg.webhooks.secret === 'string'
      ? cicdCfg.webhooks.secret : '',
    repos: Array.isArray(cicdCfg.repos) ? cicdCfg.repos : [],
    defaultProvider: typeof cicdCfg.provider === 'string' ? cicdCfg.provider : undefined,
  });
  // Wire worker dispatch: each action of type 'worker.task' auto-creates
  // a worker named `cicd-<pipelineId>-<timestamp>` and sends the task
  // through sendTask with branch/profile/autoMode hints from the action.
  mgr.dispatchWorker = function (spec) {
    const base = 'cicd-' + (spec && spec.pipeline ? spec.pipeline : 'run') + '-' + Date.now();
    const name = base.replace(/[^A-Za-z0-9._-]/g, '-');
    try {
      const created = manager.create(name, 'claude', [], { target: 'local' });
      if (created && created.error) return { error: created.error, worker: name };
      manager.sendTask(name, spec.task || 'CI check', {
        branch: spec.branch || '',
        profile: spec.profile || '',
        autoMode: true,
      });
      return { worker: name };
    } catch (e) {
      return { error: e.message, worker: name };
    }
  };
  return mgr;
}
const cicdManager = _buildCicdManagerFromConfig(cfg);

// (10.6) Shared OrgManager. Writes to ~/.c4/org.json by default;
// honour config.org.path. Rebuilt on config reload so a new path is
// picked up without a daemon restart. Tests construct their own
// OrgManager with a tmpdir and never touch this instance.
let _orgManager = null;
function getOrgManager() {
  if (_orgManager) return _orgManager;
  const currentCfg = manager.getConfig();
  const om = currentCfg && currentCfg.org && typeof currentCfg.org.path === 'string'
    ? { storePath: currentCfg.org.path }
    : {};
  _orgManager = new orgMgmt.OrgManager(om);
  return _orgManager;
}

// (10.7) Shared ScheduleManager. Writes to ~/.c4/schedules.json by
// default; honours config.schedules.path. Rebuilt on config reload so
// a new storage path picks up without a daemon restart. Tests build
// their own ScheduleManager with a tmpdir and never touch this
// instance.
let _scheduleManager = null;
function getScheduleManager() {
  if (_scheduleManager) return _scheduleManager;
  const currentCfg = manager.getConfig();
  const sm = currentCfg && currentCfg.schedules && typeof currentCfg.schedules.path === 'string'
    ? { storePath: currentCfg.schedules.path }
    : {};
  _scheduleManager = new scheduleMgmt.ScheduleManager(sm);
  return _scheduleManager;
}

// (11.1) Shared McpHub. Writes to ~/.c4/mcp-servers.json by default;
// honours config.mcp.path. Rebuilt on config reload so a new storage
// path picks up without a daemon restart. Tests build their own McpHub
// with a tmpdir and never touch this instance. pty-manager also reads
// through this singleton so profile -> .mcp.json generation sees live
// registry mutations immediately.
let _mcpHub = null;
function getMcpHub() {
  if (_mcpHub) return _mcpHub;
  const currentCfg = manager.getConfig();
  const opts = currentCfg && currentCfg.mcp && typeof currentCfg.mcp.path === 'string'
    ? { storePath: currentCfg.mcp.path }
    : {};
  _mcpHub = new mcpHub.McpHub(opts);
  return _mcpHub;
}

// (11.3) Shared WorkflowManager + WorkflowExecutor. Writes definitions
// to ~/.c4/workflows.json and run history to ~/.c4/workflow-runs.json
// by default; honours config.workflows.{path,runsPath}. The executor's
// task dispatcher delegates to the in-process PtyManager so a workflow
// can spawn the same workers `c4 task` does. Tests construct their own
// WorkflowManager pointed at a tmpdir and never touch this singleton.
let _workflowManager = null;
let _workflowExecutor = null;
function getWorkflowManager() {
  if (_workflowManager) return _workflowManager;
  const currentCfg = manager.getConfig() || {};
  const wfCfg = currentCfg.workflows || {};
  const opts = {};
  if (typeof wfCfg.path === 'string') opts.workflowsPath = wfCfg.path;
  if (typeof wfCfg.runsPath === 'string') opts.runsPath = wfCfg.runsPath;
  _workflowManager = new workflowMod.WorkflowManager(opts);
  return _workflowManager;
}
function getWorkflowExecutor() {
  if (_workflowExecutor) return _workflowExecutor;
  const wfMgr = getWorkflowManager();
  _workflowExecutor = new workflowMod.WorkflowExecutor({
    manager: wfMgr,
    dispatcher: async ({ node, runId }) => {
      const cfg = node && node.config ? node.config : {};
      const baseName = (cfg.workerName && typeof cfg.workerName === 'string')
        ? cfg.workerName : ('wf-' + (node && node.id ? node.id : 'node'));
      const safe = baseName.replace(/[^A-Za-z0-9._-]/g, '-');
      const name = safe + '-' + (runId ? runId.slice(-6) : Math.floor(Date.now() / 1000).toString(36));
      try {
        const created = manager.create(name, 'claude', [], { target: 'local' });
        if (created && created.error) {
          return { ok: false, error: created.error, name };
        }
        if (typeof cfg.taskTemplate === 'string' && cfg.taskTemplate.length > 0) {
          manager.sendTask(name, cfg.taskTemplate, {
            branch: cfg.branch || (cfg.projectId ? ('c4/' + cfg.projectId) : ''),
            autoMode: cfg.autoMode === false ? false : true,
          });
        }
        return { ok: true, worker: name, branch: cfg.branch || null };
      } catch (e) {
        return { ok: false, error: (e && e.message) ? e.message : String(e), name };
      }
    },
  });
  return _workflowExecutor;
}

// (11.4) Shared NlInterface. Writes chat sessions to
// ~/.c4/nl-sessions.json by default; honours config.nl.sessionsPath.
// Tests construct their own NlInterface with a tmpdir and never touch
// this instance. The adapter wraps the in-process PtyManager so the
// daemon does not have to make HTTP calls against itself.
let _nlInstance = null;
function getNlInterface() {
  if (_nlInstance) return _nlInstance;
  const cfgNow = manager.getConfig();
  const sessionsPath = (cfgNow && cfgNow.nl && typeof cfgNow.nl.sessionsPath === 'string')
    ? cfgNow.nl.sessionsPath : undefined;
  const adapter = {
    async listWorkers() {
      const data = manager.list();
      return { workers: data.workers || [] };
    },
    async createWorker(name) {
      return manager.create(name, 'claude', [], { target: 'local' });
    },
    async sendTask(name, task) {
      return manager.sendTask(name, task, {});
    },
    async getStatus() {
      return {
        ok: true,
        workers: (manager.list().workers || []).length,
        version: manager._daemonVersion || null,
      };
    },
    async getHistory(name) {
      const all = manager.getHistory();
      const records = Array.isArray(all.records) ? all.records : [];
      const filtered = name ? records.filter((r) => r.worker === name || r.name === name) : records;
      return { entries: filtered.slice(-10) };
    },
    async readOutput(name) {
      const r = (manager.readNow ? manager.readNow(name) : manager.read(name)) || {};
      const output = typeof r.output === 'string' ? r.output
        : typeof r.screen === 'string' ? r.screen
        : typeof r.text === 'string' ? r.text
        : '';
      return { output, raw: r };
    },
    async closeWorker(name) {
      return manager.close(name);
    },
  };
  _nlInstance = new nlInterface.NlInterface({ adapter, sessionsPath });
  return _nlInstance;
}

// (11.2) Shared ComputerUseAgent. Writes sessions to
// ~/.c4/computer-use-sessions.json and screenshots to
// ~/.c4/screenshots/<sessionId>/ by default; honours
// config.computerUse.{sessionsPath,screenshotsDir}. Tests construct
// their own agent with a tmpdir and never touch this singleton. The
// agent refuses to start a session until config.computerUse.enabled is
// true - it's a high-risk capability and we prefer opt-in.
let _computerUseAgent = null;
function getComputerUseAgent() {
  if (_computerUseAgent) return _computerUseAgent;
  const currentCfg = manager.getConfig() || {};
  const cu = currentCfg.computerUse || {};
  const opts = { config: currentCfg };
  if (typeof cu.sessionsPath === 'string') opts.storePath = cu.sessionsPath;
  if (typeof cu.screenshotsDir === 'string') opts.screenshotsDir = cu.screenshotsDir;
  _computerUseAgent = new computerUseMod.ComputerUseAgent(opts);
  return _computerUseAgent;
}

// (10.7) scheduleTick dispatcher. When a schedule fires we spawn a
// worker and hand it the templated task. Name collisions are avoided by
// suffixing the tick minute so two schedules that fire at the same
// instant produce distinct workers. The caller is tolerant of dispatch
// failures (they surface as history entries on the schedule) so we
// never rethrow here.
function _scheduleDispatch(schedule, ctx) {
  if (!schedule || typeof schedule !== 'object') return;
  const tickAt = ctx && ctx.tickAt instanceof Date ? ctx.tickAt : new Date();
  const base = 'sched-' + schedule.id + '-' + Math.floor(tickAt.getTime() / 60000);
  const name = base.replace(/[^A-Za-z0-9._-]/g, '-');
  try {
    const created = manager.create(name, 'claude', [], { target: 'local' });
    if (created && created.error) return;
    manager.sendTask(name, schedule.taskTemplate || '', {
      branch: schedule.projectId ? ('c4/' + schedule.projectId) : '',
      autoMode: true,
    });
  } catch {}
}

// (10.7) Kick the scheduler tick. Returns the tick summary so the
// caller can log or emit SSE; the underlying ScheduleManager handles
// persisting run history + recomputing nextRun. Safe to call from any
// polling loop - dispatch is best-effort and never throws.
function runScheduleTick(now) {
  try {
    const mgr = getScheduleManager();
    return mgr.scheduleTick(now || new Date(), _scheduleDispatch);
  } catch (e) {
    console.error('[SCHEDULE] tick failed:', e && e.message ? e.message : e);
    return { tickAt: new Date().toISOString(), dueIds: [], schedules: [] };
  }
}

// (10.8) Shared ProjectBoard. Writes to ~/.c4/projects/<id>.json by
// default; honour config.projects.path for operators who want the
// storage on a different volume. Tests construct their own board with
// a tmpdir and never touch this instance.
let _projectBoard = null;
function getProjectBoard() {
  if (_projectBoard) return _projectBoard;
  const currentCfg = manager.getConfig();
  const pm = currentCfg && currentCfg.projects && typeof currentCfg.projects.path === 'string'
    ? { projectsDir: currentCfg.projects.path }
    : {};
  _projectBoard = new projectMgmt.ProjectBoard(pm);
  return _projectBoard;
}

// (10.3) Shared ProjectDashboard. Joins the shared ProjectBoard (10.8),
// AuditLogger (10.2), and a fresh CostReporter (10.5) into a single
// per-project snapshot. Rebuilt lazily so a `c4 config reload` or a
// projects.path switch picks up the new ProjectBoard instance on the
// next request. Tests never touch this singleton — they construct
// their own ProjectDashboard with tmpdir-backed collaborators.
let _projectDashboard = null;
function getProjectDashboard() {
  if (_projectDashboard) return _projectDashboard;
  _projectDashboard = new projectDashboard.ProjectDashboard({
    board: getProjectBoard(),
    auditLogger: audit,
    costReporter: buildCostReporter(manager),
    workers: () => {
      try { return (manager.list().workers || []); }
      catch { return []; }
    },
  });
  return _projectDashboard;
}

// (10.5) Build a CostReporter seeded from config.costs.models and
// backed by the daemon's history.jsonl. Rebuilt per request so a live
// `c4 config reload` is picked up without a daemon restart.
function buildCostReporter(m) {
  const currentCfg = m && typeof m.getConfig === 'function' ? m.getConfig() : cfg;
  const costsCfg = (currentCfg && currentCfg.costs) || {};
  const models = costsCfg.models && typeof costsCfg.models === 'object' ? costsCfg.models : undefined;
  const warnAt = costsCfg.budget && Number.isFinite(costsCfg.budget.warnAt)
    ? costsCfg.budget.warnAt : 0.8;
  const historyPath = costReport.defaultHistoryPath();
  return new costReport.CostReporter({
    costs: models,
    warnAt,
    loadRecords: () => costReport.loadHistoryRecords(historyPath),
  });
}

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

// Buffer the raw body alongside the parsed JSON so HMAC-authenticated
// endpoints (10.4 /cicd/webhook) can hash exactly what the sender hashed.
// parseBody() is stream-consuming so handlers that need both must use
// this variant.
function parseBodyRaw(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => raw += chunk);
    req.on('end', () => {
      let json = {};
      try { json = raw && raw.length > 0 ? JSON.parse(raw) : {}; }
      catch { json = {}; }
      resolve({ raw, json });
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

  // (10.5) Monthly cost report: GET /cost/monthly/<year>/<month>. Path
  // params are decoded here so the route dispatch below only has to
  // compare strings.
  let costMonthlyParams = null;
  {
    const m = route.match(/^\/cost\/monthly\/(\d{4})\/(\d{1,2})$/);
    if (m) costMonthlyParams = { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
  }

  // (10.4) CI/CD pipeline path params: /cicd/pipelines/<id>.
  let cicdPipelineId = null;
  {
    const m = route.match(/^\/cicd\/pipelines\/([^\/]+)$/);
    if (m) cicdPipelineId = decodeURIComponent(m[1]);
  }

  // (10.6) Org management: decode /orgs/dept/<id>/... path params here
  // so the route dispatch below stays as a flat string match.
  let orgParams = null;
  {
    const mMember = route.match(/^\/orgs\/dept\/([^\/]+)\/member$/);
    const mQuota = route.match(/^\/orgs\/dept\/([^\/]+)\/quota$/);
    const mUsage = route.match(/^\/orgs\/dept\/([^\/]+)\/usage$/);
    const mDept = route.match(/^\/orgs\/dept\/([^\/]+)$/);
    const mTeamMember = route.match(/^\/orgs\/team\/([^\/]+)\/member$/);
    const mTeam = route.match(/^\/orgs\/team\/([^\/]+)$/);
    if (mMember) orgParams = { kind: 'dept.member', deptId: decodeURIComponent(mMember[1]) };
    else if (mQuota) orgParams = { kind: 'dept.quota', deptId: decodeURIComponent(mQuota[1]) };
    else if (mUsage) orgParams = { kind: 'dept.usage', deptId: decodeURIComponent(mUsage[1]) };
    else if (mDept) orgParams = { kind: 'dept', deptId: decodeURIComponent(mDept[1]) };
    else if (mTeamMember) orgParams = { kind: 'team.member', teamId: decodeURIComponent(mTeamMember[1]) };
    else if (mTeam) orgParams = { kind: 'team', teamId: decodeURIComponent(mTeam[1]) };
  }

  // (10.7) Schedule management: decode /schedules/<id>/... path params
  // here so the route dispatch below stays as a flat string match.
  let scheduleParams = null;
  {
    const mRun = route.match(/^\/schedules\/([^\/]+)\/run$/);
    const mHistory = route.match(/^\/schedules\/([^\/]+)\/history$/);
    const mOne = route.match(/^\/schedules\/([^\/]+)$/);
    if (mRun) scheduleParams = { kind: 'run', id: decodeURIComponent(mRun[1]) };
    else if (mHistory) scheduleParams = { kind: 'history', id: decodeURIComponent(mHistory[1]) };
    else if (mOne) scheduleParams = { kind: 'one', id: decodeURIComponent(mOne[1]) };
  }

  // (11.4) NL interface: decode /nl/sessions/<id> path params here so
  // the route dispatch below stays as a flat string match.
  let nlSessionId = null;
  {
    const m = route.match(/^\/nl\/sessions\/([^\/]+)$/);
    if (m) nlSessionId = decodeURIComponent(m[1]);
  }

  // (11.3) Workflow engine: decode /workflows/<id>/... path params here
  // so the route dispatch below stays as a flat string match. Two
  // sub-resources today: /run (POST kicks off an execution) and /runs
  // (GET lists historical runs for the workflow).
  let workflowParams = null;
  {
    const mRun = route.match(/^\/workflows\/([^\/]+)\/run$/);
    const mRuns = route.match(/^\/workflows\/([^\/]+)\/runs$/);
    const mOne = route.match(/^\/workflows\/([^\/]+)$/);
    const mRunOne = route.match(/^\/workflow-runs\/([^\/]+)$/);
    if (mRun) workflowParams = { kind: 'run', id: decodeURIComponent(mRun[1]) };
    else if (mRuns) workflowParams = { kind: 'runs', id: decodeURIComponent(mRuns[1]) };
    else if (mOne) workflowParams = { kind: 'one', id: decodeURIComponent(mOne[1]) };
    else if (mRunOne) workflowParams = { kind: 'runOne', id: decodeURIComponent(mRunOne[1]) };
  }

  // (11.2) Computer Use: decode /computer-use/sessions/<id>/... path
  // params here so the route dispatch below stays as a flat string
  // match. Sub-resources: /screenshot (POST triggers a capture), /click,
  // /type, /key, /screenshots/<screenshotId> (GET image file).
  let cuParams = null;
  {
    const mShot = route.match(/^\/computer-use\/sessions\/([^\/]+)\/screenshot$/);
    const mClick = route.match(/^\/computer-use\/sessions\/([^\/]+)\/click$/);
    const mType = route.match(/^\/computer-use\/sessions\/([^\/]+)\/type$/);
    const mKey = route.match(/^\/computer-use\/sessions\/([^\/]+)\/key$/);
    const mScreenshotOne = route.match(/^\/computer-use\/sessions\/([^\/]+)\/screenshots\/([^\/]+)$/);
    const mOne = route.match(/^\/computer-use\/sessions\/([^\/]+)$/);
    if (mShot) cuParams = { kind: 'screenshot', id: decodeURIComponent(mShot[1]) };
    else if (mClick) cuParams = { kind: 'click', id: decodeURIComponent(mClick[1]) };
    else if (mType) cuParams = { kind: 'type', id: decodeURIComponent(mType[1]) };
    else if (mKey) cuParams = { kind: 'key', id: decodeURIComponent(mKey[1]) };
    else if (mScreenshotOne) cuParams = {
      kind: 'screenshotOne',
      id: decodeURIComponent(mScreenshotOne[1]),
      shotId: decodeURIComponent(mScreenshotOne[2]),
    };
    else if (mOne) cuParams = { kind: 'one', id: decodeURIComponent(mOne[1]) };
  }

  // (11.1) MCP hub: decode /mcp/servers/<name>/... path params here so
  // the route dispatch below stays as a flat string match.
  let mcpParams = null;
  {
    const mEnable = route.match(/^\/mcp\/servers\/([^\/]+)\/enable$/);
    const mDisable = route.match(/^\/mcp\/servers\/([^\/]+)\/disable$/);
    const mTest = route.match(/^\/mcp\/servers\/([^\/]+)\/test$/);
    const mOne = route.match(/^\/mcp\/servers\/([^\/]+)$/);
    if (mEnable) mcpParams = { kind: 'enable', name: decodeURIComponent(mEnable[1]) };
    else if (mDisable) mcpParams = { kind: 'disable', name: decodeURIComponent(mDisable[1]) };
    else if (mTest) mcpParams = { kind: 'test', name: decodeURIComponent(mTest[1]) };
    else if (mOne) mcpParams = { kind: 'one', name: decodeURIComponent(mOne[1]) };
  }

  // (10.8) Project management: decode /projects/<id>/... path params
  // here so the route dispatch below stays as a flat string match.
  let projectParams = null;
  {
    const m1 = route.match(/^\/projects\/([^\/]+)$/);
    const m2 = route.match(/^\/projects\/([^\/]+)\/(tasks|milestones|sprints|progress|sync|dashboard|contributors|velocity|tokens)$/);
    const m3 = route.match(/^\/projects\/([^\/]+)\/tasks\/([^\/]+)$/);
    if (m3) {
      projectParams = {
        kind: 'task',
        projectId: decodeURIComponent(m3[1]),
        taskId: decodeURIComponent(m3[2]),
      };
    } else if (m2) {
      projectParams = {
        kind: m2[2],
        projectId: decodeURIComponent(m2[1]),
      };
    } else if (m1) {
      projectParams = { kind: 'project', projectId: decodeURIComponent(m1[1]) };
    }
  }

  try {
    // Session auth middleware (8.14). Only API routes go through the check
    // so the built Web UI (static assets) can still load the login page
    // without a token. /dashboard is legacy HTML that we still protect when
    // auth is enabled.
    const cfg = manager.getConfig();
    // (10.4) /cicd/webhook authenticates via HMAC-SHA256 on the raw
    // body, not via JWT - the sender is GitHub, not a logged-in user.
    // Skip the JWT gate so bearer-less requests reach the handler where
    // verifySignature does the real auth.
    const isCicdWebhook = route === '/cicd/webhook' && req.method === 'POST';
    const needsAuthCheck = (isApiPrefixed || route === '/dashboard') && !isCicdWebhook;
    let authCheck = { allow: true };
    if (needsAuthCheck) {
      authCheck = auth.checkRequest(cfg, req, route);
      if (!authCheck.allow) {
        res.writeHead(authCheck.status || 401);
        res.end(JSON.stringify(authCheck.body || { error: 'Authentication required' }));
        return;
      }
    }

    let result;

    if (req.method === 'POST' && route === '/auth/login') {
      const body = await parseBody(req);
      const loginResult = auth.login(cfg, body, { roleResolver: roleFor });
      if (!loginResult.ok) {
        _safeAudit('auth.login', { ok: false, reason: loginResult.error || 'failed' },
          { target: (body && typeof body.user === 'string') ? body.user : '', actor: 'anonymous' });
        res.writeHead(401);
        res.end(JSON.stringify({ error: loginResult.error || 'Login failed' }));
        return;
      }
      _safeAudit('auth.login', { ok: true, role: loginResult.role || null },
        { target: loginResult.user, actor: loginResult.user });
      result = { token: loginResult.token, user: loginResult.user, role: loginResult.role || null };

    } else if (req.method === 'POST' && route === '/auth/logout') {
      // Stateless JWT logout: client discards the token. We still return ok
      // so the UI can clear localStorage without a special-case branch.
      _safeAudit('auth.logout', {}, { actor: _auditActor(authCheck), target: _auditActor(authCheck) });
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
      const gate = requireRole(authCheck, rbac.ACTIONS.WORKER_CREATE,
        target ? { type: 'machine', id: target } : null);
      if (denyOr(res, gate)) return;
      result = manager.create(name, command, args || [], { target, cwd, parent });
      if (result && !result.error) {
        _safeAudit('worker.created',
          { command, args: args || [], target: target || 'local', cwd: cwd || '', parent: parent || '', pid: result.pid || null },
          { target: name, actor: _auditActor(authCheck) });
      }

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
      const gate = requireRole(authCheck, rbac.ACTIONS.WORKER_TASK,
        target ? { type: 'machine', id: target } : null);
      if (denyOr(res, gate)) return;
      result = manager.sendTask(name, task, { branch, useBranch, useWorktree, projectRoot, cwd, scope, scopePreset, after, command, target, contextFrom, reuse, profile, autoMode, budgetUsd, maxRetries });
      if (result && !result.error) {
        _safeAudit('task.sent',
          { task: typeof task === 'string' ? task.slice(0, 500) : '', branch: branch || '', profile: profile || '', autoMode: Boolean(autoMode) },
          { target: name, actor: _auditActor(authCheck) });
      }

    } else if (req.method === 'POST' && route === '/merge') {
      const { name, skipChecks } = await parseBody(req);
      const gate = requireRole(authCheck, rbac.ACTIONS.WORKER_MERGE);
      if (denyOr(res, gate)) return;
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
            _safeAudit('merge.performed',
              { branch, skipChecks: Boolean(skipChecks), workerName: name },
              { target: branch, actor: _auditActor(authCheck) });
          }
        } catch (e) {
          result = { error: `Merge failed: ${e.message}` };
        }
      }

    } else if (req.method === 'POST' && route === '/approve') {
      const { name, optionNumber } = await parseBody(req);
      result = manager.approve(name, optionNumber);
      if (result && !result.error) {
        // optionNumber 1 is the common "Yes, proceed" slot in Claude
        // Code's TUI. Anything else (2 = decline, 3 = always-allow, etc.)
        // we treat as denied for audit purposes — granular option text
        // lives in the worker's scrollback, not in the /approve payload.
        const granted = optionNumber === 1 || optionNumber === undefined || optionNumber === null;
        _safeAudit(granted ? 'approval.granted' : 'approval.denied',
          { optionNumber: optionNumber == null ? null : Number(optionNumber) },
          { target: name, actor: _auditActor(authCheck) });
      }

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

    } else if (req.method === 'GET' && route === '/audit/query') {
      // (10.2) Filtered audit log query. Every param is optional; omit
      // all to dump the full log. Limit defaults to 0 (no cap).
      const gate = requireRole(authCheck, rbac.ACTIONS.AUDIT_READ);
      if (denyOr(res, gate)) return;
      const typeParam = url.searchParams.get('type') || '';
      const fromParam = url.searchParams.get('from') || '';
      const toParam = url.searchParams.get('to') || '';
      const targetParam = url.searchParams.get('target') || '';
      const limitParam = parseInt(url.searchParams.get('limit') || '0', 10);
      try {
        const events = audit.query({
          type: typeParam || undefined,
          from: fromParam || undefined,
          to: toParam || undefined,
          target: targetParam || undefined,
          limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined,
        });
        result = { events, count: events.length, path: audit.logPath };
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && route === '/audit/verify') {
      // (10.2) Hash chain integrity check. Returns valid=false +
      // corruptedAt=<line index> when the log has been tampered with or
      // truncated in the middle.
      const gate = requireRole(authCheck, rbac.ACTIONS.AUDIT_READ);
      if (denyOr(res, gate)) return;
      try {
        result = audit.verify();
        result.path = audit.logPath;
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && route === '/rbac/roles') {
      // (10.1) Role + action matrix dump. Useful for the Web UI to
      // render a permissions table without recomputing the matrix in
      // the browser.
      result = { roles: rbacManager.listRoles() };

    } else if (req.method === 'GET' && route === '/rbac/users') {
      // (10.1) List every RBAC user with role + grant lists.
      result = { users: rbacManager.listUsers() };

    } else if (req.method === 'POST' && route === '/rbac/role/assign') {
      // (10.1) Assign a role. Body: { username, role }.
      const gate = requireRole(authCheck, rbac.ACTIONS.AUTH_USER_CREATE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        const u = rbacManager.assignRole(body.username, body.role);
        result = { username: body.username, ...u };
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && route === '/rbac/grant/project') {
      // (10.1) Grant project access. Body: { username, projectId }.
      const gate = requireRole(authCheck, rbac.ACTIONS.AUTH_USER_CREATE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        result = rbacManager.grantProjectAccess(body.username, body.projectId);
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && route === '/rbac/grant/machine') {
      // (10.1) Grant machine access. Body: { username, alias }.
      const gate = requireRole(authCheck, rbac.ACTIONS.AUTH_USER_CREATE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        result = rbacManager.grantMachineAccess(body.username, body.alias);
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && route === '/rbac/revoke/project') {
      // (10.1) Revoke project access. Body: { username, projectId }.
      const gate = requireRole(authCheck, rbac.ACTIONS.AUTH_USER_CREATE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        const ok = rbacManager.revokeProjectAccess(body.username, body.projectId);
        result = { ok };
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && route === '/rbac/revoke/machine') {
      // (10.1) Revoke machine access. Body: { username, alias }.
      const gate = requireRole(authCheck, rbac.ACTIONS.AUTH_USER_CREATE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        const ok = rbacManager.revokeMachineAccess(body.username, body.alias);
        result = { ok };
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && route === '/rbac/check') {
      // (10.1) Check a permission. Body: { username, action, resource? }.
      // Useful for the Web UI to hide buttons the caller cannot reach.
      try {
        const body = await parseBody(req);
        const allowed = rbacManager.checkPermission(body.username, body.action, body.resource);
        result = { allowed, username: body.username, action: body.action };
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && route === '/cost/report') {
      // (10.5) Cost + token aggregation over the daemon's history.jsonl.
      // Never touches live worker state so it is safe to call at any
      // time — the report is pure aggregation over immutable rows.
      try {
        const reporter = buildCostReporter(manager);
        const fromParam = url.searchParams.get('from') || null;
        const toParam = url.searchParams.get('to') || null;
        const groupParam = url.searchParams.get('group') || 'project';
        const includeModels = url.searchParams.get('models') === '1';
        result = reporter.report({
          from: fromParam,
          to: toParam,
          groupBy: groupParam,
          includeModels,
        });
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && costMonthlyParams) {
      // (10.5) Monthly report wraps report() with calendar bounds so the
      // caller does not have to compute month-end edge cases (leap
      // years, variable month length, timezone drift).
      try {
        const reporter = buildCostReporter(manager);
        const groupParam = url.searchParams.get('group') || 'project';
        result = reporter.monthlyReport(costMonthlyParams.year, costMonthlyParams.month, {
          groupBy: groupParam,
        });
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && route === '/cost/budget') {
      // (10.5) Budget check. Body: { limit, period, group, warnAt }.
      // Returns exceeded=true once used >= limit, warning=true once
      // used crosses warnAt (defaults to 0.8) but has not yet exceeded.
      try {
        const body = await parseBody(req);
        const reporter = buildCostReporter(manager);
        result = reporter.budgetCheck({
          limit: Number(body.limit),
          period: body.period || 'month',
          group: body.group || null,
          groupBy: body.groupBy || 'project',
          warnAt: Number.isFinite(body.warnAt) ? body.warnAt : undefined,
        });
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && route === '/orgs/tree') {
      // (10.6) Organization tree. Returns root departments with nested
      // subdepts, teams, and a deduped member list per node. Protected
      // with the ORG_READ action so viewers can see the chart without
      // getting write access.
      const gate = requireRole(authCheck, rbac.ACTIONS.ORG_READ);
      if (denyOr(res, gate)) return;
      try {
        const org = getOrgManager();
        const roots = org.treeView();
        result = { roots, count: roots.length };
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && route === '/orgs/dept') {
      // (10.6) Create a department. Body: { id, name, parentId? }.
      const gate = requireRole(authCheck, rbac.ACTIONS.ORG_MANAGE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        const org = getOrgManager();
        result = org.createDepartment({
          id: body.id,
          name: body.name,
          parentId: body.parentId === undefined ? null : body.parentId,
        });
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && orgParams && orgParams.kind === 'dept.member') {
      // (10.6) Attach a user to a department. Body: { userId, role? }.
      const gate = requireRole(authCheck, rbac.ACTIONS.ORG_MANAGE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        const org = getOrgManager();
        result = org.addMember(orgParams.deptId, body.userId, body.role);
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && route === '/orgs/team') {
      // (10.6) Create a team under a department. Body: { id, deptId, name }.
      const gate = requireRole(authCheck, rbac.ACTIONS.ORG_MANAGE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        const org = getOrgManager();
        result = org.createTeam({
          id: body.id,
          deptId: body.deptId,
          name: body.name,
        });
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && orgParams && orgParams.kind === 'team.member') {
      // (10.6) Attach a user to a team. Body: { userId }.
      const gate = requireRole(authCheck, rbac.ACTIONS.ORG_MANAGE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        const org = getOrgManager();
        result = org.assignMember(orgParams.teamId, body.userId);
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && orgParams && orgParams.kind === 'dept.quota') {
      // (10.6) Set or update a department's quotas.
      // Body: { maxWorkers?, monthlyBudgetUSD?, tokenLimit? }.
      const gate = requireRole(authCheck, rbac.ACTIONS.ORG_MANAGE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        const org = getOrgManager();
        result = org.setQuota(orgParams.deptId, body);
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && orgParams && orgParams.kind === 'dept.usage') {
      // (10.6) Per-department quota usage snapshot. Joins active workers
      // + cost report so admins can see "has team X blown its budget".
      const gate = requireRole(authCheck, rbac.ACTIONS.ORG_READ);
      if (denyOr(res, gate)) return;
      try {
        const org = getOrgManager();
        const workers = (() => {
          try { return (manager.list().workers || []); }
          catch { return []; }
        })();
        result = org.getQuotaUsage(orgParams.deptId, {
          costReporter: buildCostReporter(manager),
          workers,
        });
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && route === '/schedules') {
      // (10.7) List every schedule. Filters: ?enabled=true|false,
      // ?projectId=, ?assignee=. Read-only so viewers can inspect the
      // timeline without getting write access.
      const gate = requireRole(authCheck, rbac.ACTIONS.SCHEDULE_READ);
      if (denyOr(res, gate)) return;
      try {
        const mgr = getScheduleManager();
        const filter = {};
        const enabledParam = url.searchParams.get('enabled');
        if (enabledParam === 'true') filter.enabled = true;
        else if (enabledParam === 'false') filter.enabled = false;
        const projectId = url.searchParams.get('projectId');
        if (projectId) filter.projectId = projectId;
        const assignee = url.searchParams.get('assignee');
        if (assignee) filter.assignee = assignee;
        const schedules = mgr.listSchedules(filter);
        result = { schedules, count: schedules.length };
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && route === '/schedules') {
      // (10.7) Create a schedule. Body: { id?, name, cronExpr,
      // taskTemplate, projectId?, assignee?, timezone?, enabled? }.
      const gate = requireRole(authCheck, rbac.ACTIONS.SCHEDULE_MANAGE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        const mgr = getScheduleManager();
        result = mgr.createSchedule(body || {});
        _safeAudit('schedule.created',
          { id: result.id, cronExpr: result.cronExpr, timezone: result.timezone },
          { actor: _auditActor(authCheck), target: result.id });
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && scheduleParams && scheduleParams.kind === 'one') {
      // (10.7) Show one schedule.
      const gate = requireRole(authCheck, rbac.ACTIONS.SCHEDULE_READ);
      if (denyOr(res, gate)) return;
      const mgr = getScheduleManager();
      const s = mgr.getSchedule(scheduleParams.id);
      if (!s) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Schedule not found: ' + scheduleParams.id }));
        return;
      }
      result = s;

    } else if (req.method === 'PUT' && scheduleParams && scheduleParams.kind === 'one') {
      // (10.7) Patch a schedule. Any subset of createSchedule's fields
      // is accepted; enabled is normalised to a boolean.
      const gate = requireRole(authCheck, rbac.ACTIONS.SCHEDULE_MANAGE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        const mgr = getScheduleManager();
        result = mgr.updateSchedule(scheduleParams.id, body || {});
        _safeAudit('schedule.updated', { id: scheduleParams.id },
          { actor: _auditActor(authCheck), target: scheduleParams.id });
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'DELETE' && scheduleParams && scheduleParams.kind === 'one') {
      // (10.7) Delete a schedule. 404 when not found.
      const gate = requireRole(authCheck, rbac.ACTIONS.SCHEDULE_MANAGE);
      if (denyOr(res, gate)) return;
      const mgr = getScheduleManager();
      const ok = mgr.deleteSchedule(scheduleParams.id);
      if (!ok) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Schedule not found: ' + scheduleParams.id }));
        return;
      }
      _safeAudit('schedule.deleted', { id: scheduleParams.id },
        { actor: _auditActor(authCheck), target: scheduleParams.id });
      result = { deleted: true, id: scheduleParams.id };

    } else if (req.method === 'POST' && scheduleParams && scheduleParams.kind === 'run') {
      // (10.7) Force-run a schedule now. Does not recompute nextRun so
      // the regular cadence still fires.
      const gate = requireRole(authCheck, rbac.ACTIONS.SCHEDULE_MANAGE);
      if (denyOr(res, gate)) return;
      try {
        const mgr = getScheduleManager();
        const schedule = mgr.forceRun(scheduleParams.id);
        _scheduleDispatch(schedule, { tickAt: new Date() });
        _safeAudit('schedule.forced', { id: scheduleParams.id },
          { actor: _auditActor(authCheck), target: scheduleParams.id });
        result = schedule;
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && scheduleParams && scheduleParams.kind === 'history') {
      // (10.7) Return the per-schedule run history (trimmed to the last
      // HISTORY_LIMIT entries by the storage layer).
      const gate = requireRole(authCheck, rbac.ACTIONS.SCHEDULE_READ);
      if (denyOr(res, gate)) return;
      try {
        const mgr = getScheduleManager();
        const history = mgr.history(scheduleParams.id);
        result = { id: scheduleParams.id, history, count: history.length };
      } catch (e) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: e.message }));
        return;
      }

    } else if (req.method === 'POST' && route === '/nl/chat') {
      // (11.4) Natural-language chat turn. Body: { sessionId?, text }.
      // Returns { sessionId, response, intent, params, confidence,
      // result, actions }. Missing sessionId starts a fresh session.
      const gate = requireRole(authCheck, rbac.ACTIONS.NL_CHAT);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        const text = typeof body.text === 'string' ? body.text : '';
        const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
        if (!text.trim()) {
          result = { error: 'Missing text' };
        } else {
          const nl = getNlInterface();
          const out = await nl.handle(sessionId, text);
          _safeAudit('nl.chat',
            { intent: out.intent, confidence: out.confidence },
            { target: out.sessionId, actor: _auditActor(authCheck) });
          result = out;
        }
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && route === '/nl/sessions') {
      // (11.4) List all chat sessions with lightweight metadata.
      const gate = requireRole(authCheck, rbac.ACTIONS.NL_CHAT);
      if (denyOr(res, gate)) return;
      try {
        const nl = getNlInterface();
        const sessions = nl.sessions.listSessions();
        result = { sessions, count: sessions.length };
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && nlSessionId) {
      // (11.4) Fetch a single chat session (full history).
      const gate = requireRole(authCheck, rbac.ACTIONS.NL_CHAT);
      if (denyOr(res, gate)) return;
      const nl = getNlInterface();
      const session = nl.sessions.getSession(nlSessionId);
      if (!session) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Session not found: ' + nlSessionId }));
        return;
      }
      result = session;

    } else if (req.method === 'DELETE' && nlSessionId) {
      // (11.4) Delete a chat session. 404 when not found.
      const gate = requireRole(authCheck, rbac.ACTIONS.NL_CHAT);
      if (denyOr(res, gate)) return;
      const nl = getNlInterface();
      const ok = nl.sessions.deleteSession(nlSessionId);
      if (!ok) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Session not found: ' + nlSessionId }));
        return;
      }
      _safeAudit('nl.session.deleted', { sessionId: nlSessionId },
        { target: nlSessionId, actor: _auditActor(authCheck) });
      result = { deleted: true, id: nlSessionId };

    } else if (req.method === 'GET' && route === '/mcp/servers') {
      // (11.1) List every MCP server in the hub. Filters: ?enabled=
      // true|false, ?transport=stdio|http. Read-only so viewers can
      // inspect the registry without mcp.manage.
      const gate = requireRole(authCheck, rbac.ACTIONS.MCP_READ);
      if (denyOr(res, gate)) return;
      try {
        const hub = getMcpHub();
        const filter = {};
        const enabledParam = url.searchParams.get('enabled');
        if (enabledParam === 'true') filter.enabled = true;
        else if (enabledParam === 'false') filter.enabled = false;
        const transport = url.searchParams.get('transport');
        if (transport) filter.transport = transport;
        const servers = hub.listServers(filter);
        result = { servers, count: servers.length };
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && route === '/mcp/servers') {
      // (11.1) Register a new MCP server. Body: { name, command, args?,
      // env?, description?, enabled?, transport? }. Duplicate names
      // and invalid transports are rejected by the hub.
      const gate = requireRole(authCheck, rbac.ACTIONS.MCP_MANAGE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        const hub = getMcpHub();
        result = hub.registerServer(body || {});
        _safeAudit('mcp.registered',
          { name: result.name, transport: result.transport, enabled: result.enabled },
          { actor: _auditActor(authCheck), target: result.name });
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && mcpParams && mcpParams.kind === 'one') {
      // (11.1) Show a single MCP server.
      const gate = requireRole(authCheck, rbac.ACTIONS.MCP_READ);
      if (denyOr(res, gate)) return;
      const hub = getMcpHub();
      const server = hub.getServerConfig(mcpParams.name);
      if (!server) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'MCP server not found: ' + mcpParams.name }));
        return;
      }
      result = server;

    } else if (req.method === 'PUT' && mcpParams && mcpParams.kind === 'one') {
      // (11.1) Patch an MCP server. Accepts any subset of the register
      // fields. Invalid transport is rejected by the hub.
      const gate = requireRole(authCheck, rbac.ACTIONS.MCP_MANAGE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        const hub = getMcpHub();
        result = hub.updateServer(mcpParams.name, body || {});
        _safeAudit('mcp.updated', { name: mcpParams.name },
          { actor: _auditActor(authCheck), target: mcpParams.name });
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'DELETE' && mcpParams && mcpParams.kind === 'one') {
      // (11.1) Unregister an MCP server. 404 when not found.
      const gate = requireRole(authCheck, rbac.ACTIONS.MCP_MANAGE);
      if (denyOr(res, gate)) return;
      const hub = getMcpHub();
      const ok = hub.unregisterServer(mcpParams.name);
      if (!ok) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'MCP server not found: ' + mcpParams.name }));
        return;
      }
      _safeAudit('mcp.unregistered', { name: mcpParams.name },
        { actor: _auditActor(authCheck), target: mcpParams.name });
      result = { deleted: true, name: mcpParams.name };

    } else if (req.method === 'POST' && mcpParams && mcpParams.kind === 'enable') {
      // (11.1) Enable an MCP server so the next worker spawn picks it
      // up in .mcp.json when the profile lists it.
      const gate = requireRole(authCheck, rbac.ACTIONS.MCP_MANAGE);
      if (denyOr(res, gate)) return;
      try {
        const hub = getMcpHub();
        result = hub.enableServer(mcpParams.name);
        _safeAudit('mcp.enabled', { name: mcpParams.name },
          { actor: _auditActor(authCheck), target: mcpParams.name });
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && mcpParams && mcpParams.kind === 'disable') {
      // (11.1) Disable an MCP server. Existing workers keep their
      // .mcp.json; future spawns will skip the server until re-enabled.
      const gate = requireRole(authCheck, rbac.ACTIONS.MCP_MANAGE);
      if (denyOr(res, gate)) return;
      try {
        const hub = getMcpHub();
        result = hub.disableServer(mcpParams.name);
        _safeAudit('mcp.disabled', { name: mcpParams.name },
          { actor: _auditActor(authCheck), target: mcpParams.name });
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && mcpParams && mcpParams.kind === 'test') {
      // (11.1) Attempt to launch the server and verify it starts.
      // Manage-level because a launch burns resources and shells out.
      const gate = requireRole(authCheck, rbac.ACTIONS.MCP_MANAGE);
      if (denyOr(res, gate)) return;
      try {
        const hub = getMcpHub();
        result = hub.testServer(mcpParams.name);
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && route === '/workflows') {
      // (11.3) List every workflow definition. Filters: ?enabled=true|false,
      // ?nameContains=. Read-only so viewers can inspect the catalog
      // without workflow.manage.
      const gate = requireRole(authCheck, rbac.ACTIONS.WORKFLOW_READ);
      if (denyOr(res, gate)) return;
      try {
        const wfMgr = getWorkflowManager();
        const filter = {};
        const enabledParam = url.searchParams.get('enabled');
        if (enabledParam === 'true') filter.enabled = true;
        else if (enabledParam === 'false') filter.enabled = false;
        const nameContains = url.searchParams.get('nameContains');
        if (nameContains) filter.nameContains = nameContains;
        const workflows = wfMgr.listWorkflows(filter);
        result = { workflows, count: workflows.length };
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && route === '/workflows') {
      // (11.3) Create a workflow. Body: { id?, name, description, nodes,
      // edges, enabled? }. validateGraph runs before the persist call so
      // an invalid graph never lands in workflows.json.
      const gate = requireRole(authCheck, rbac.ACTIONS.WORKFLOW_MANAGE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        const wfMgr = getWorkflowManager();
        result = wfMgr.createWorkflow(body || {});
        _safeAudit('workflow.created',
          { id: result.id, nodes: result.nodes.length, edges: result.edges.length },
          { actor: _auditActor(authCheck), target: result.id });
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && workflowParams && workflowParams.kind === 'one') {
      // (11.3) Show one workflow definition.
      const gate = requireRole(authCheck, rbac.ACTIONS.WORKFLOW_READ);
      if (denyOr(res, gate)) return;
      const wfMgr = getWorkflowManager();
      const wf = wfMgr.getWorkflow(workflowParams.id);
      if (!wf) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Workflow not found: ' + workflowParams.id }));
        return;
      }
      result = wf;

    } else if (req.method === 'PUT' && workflowParams && workflowParams.kind === 'one') {
      // (11.3) Patch a workflow. Re-runs validateGraph when nodes or
      // edges change so the store never holds an invalid graph.
      const gate = requireRole(authCheck, rbac.ACTIONS.WORKFLOW_MANAGE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        const wfMgr = getWorkflowManager();
        result = wfMgr.updateWorkflow(workflowParams.id, body || {});
        _safeAudit('workflow.updated', { id: workflowParams.id },
          { actor: _auditActor(authCheck), target: workflowParams.id });
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'DELETE' && workflowParams && workflowParams.kind === 'one') {
      // (11.3) Delete a workflow definition. 404 when not found.
      const gate = requireRole(authCheck, rbac.ACTIONS.WORKFLOW_MANAGE);
      if (denyOr(res, gate)) return;
      const wfMgr = getWorkflowManager();
      const ok = wfMgr.deleteWorkflow(workflowParams.id);
      if (!ok) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Workflow not found: ' + workflowParams.id }));
        return;
      }
      _safeAudit('workflow.deleted', { id: workflowParams.id },
        { actor: _auditActor(authCheck), target: workflowParams.id });
      result = { deleted: true, id: workflowParams.id };

    } else if (req.method === 'POST' && workflowParams && workflowParams.kind === 'run') {
      // (11.3) Kick off a workflow run. Body: { inputs?: {} }. Returns
      // the WorkflowRun synchronously - the executor is in-process and
      // each task hands off to manager.create which is itself non-blocking.
      const gate = requireRole(authCheck, rbac.ACTIONS.WORKFLOW_MANAGE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        const exec = getWorkflowExecutor();
        const inputs = (body && body.inputs && typeof body.inputs === 'object') ? body.inputs : {};
        const run = await exec.executeWorkflow(workflowParams.id, inputs, {});
        _safeAudit('workflow.run',
          { workflowId: workflowParams.id, runId: run.id, status: run.status },
          { actor: _auditActor(authCheck), target: workflowParams.id });
        result = run;
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && workflowParams && workflowParams.kind === 'runs') {
      // (11.3) List historical runs for one workflow.
      const gate = requireRole(authCheck, rbac.ACTIONS.WORKFLOW_READ);
      if (denyOr(res, gate)) return;
      try {
        const wfMgr = getWorkflowManager();
        const runs = wfMgr.store.listRunsForWorkflow(workflowParams.id);
        result = { workflowId: workflowParams.id, runs, count: runs.length };
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && workflowParams && workflowParams.kind === 'runOne') {
      // (11.3) Show one historical run by id (any workflow).
      const gate = requireRole(authCheck, rbac.ACTIONS.WORKFLOW_READ);
      if (denyOr(res, gate)) return;
      const wfMgr = getWorkflowManager();
      const run = wfMgr.store.getRun(workflowParams.id);
      if (!run) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Workflow run not found: ' + workflowParams.id }));
        return;
      }
      result = run;

    } else if (req.method === 'GET' && route === '/computer-use/sessions') {
      // (11.2) List computer-use sessions with their recorded actions
      // and screenshots. Single powerful `computer.use` action guards the
      // whole surface — granting this is effectively remote desktop.
      const gate = requireRole(authCheck, rbac.ACTIONS.COMPUTER_USE);
      if (denyOr(res, gate)) return;
      try {
        const agent = getComputerUseAgent();
        const sessions = agent.listSessions();
        const backends = computerUseMod.detectAvailableBackends();
        result = { sessions, count: sessions.length, backends };
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && route === '/computer-use/sessions') {
      // (11.2) Start a computer-use session. Body: { backend? }. Refuses
      // when config.computerUse.enabled is false.
      const gate = requireRole(authCheck, rbac.ACTIONS.COMPUTER_USE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        const agent = getComputerUseAgent();
        const entry = agent.startSession(typeof body.backend === 'string' ? body.backend : 'auto');
        _safeAudit('computer-use.session.started',
          { sessionId: entry.id, backend: entry.backend },
          { actor: _auditActor(authCheck), target: entry.id });
        result = entry;
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && cuParams && cuParams.kind === 'one') {
      // (11.2) Show one computer-use session (full action history).
      const gate = requireRole(authCheck, rbac.ACTIONS.COMPUTER_USE);
      if (denyOr(res, gate)) return;
      const agent = getComputerUseAgent();
      const session = agent.getSession(cuParams.id);
      if (!session) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Session not found: ' + cuParams.id }));
        return;
      }
      result = session;

    } else if (req.method === 'DELETE' && cuParams && cuParams.kind === 'one') {
      // (11.2) End (soft-delete) a computer-use session. 404 when not
      // found. Use endSession rather than deleteSession so the audit
      // trail keeps the recorded actions.
      const gate = requireRole(authCheck, rbac.ACTIONS.COMPUTER_USE);
      if (denyOr(res, gate)) return;
      const agent = getComputerUseAgent();
      const ended = agent.endSession(cuParams.id);
      if (!ended) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Session not found: ' + cuParams.id }));
        return;
      }
      _safeAudit('computer-use.session.ended', { sessionId: cuParams.id },
        { actor: _auditActor(authCheck), target: cuParams.id });
      result = ended;

    } else if (req.method === 'POST' && cuParams && cuParams.kind === 'screenshot') {
      // (11.2) Capture a screenshot in the given session. Returns the
      // screenshot metadata; the raw image is served by the /screenshots
      // sub-endpoint below.
      const gate = requireRole(authCheck, rbac.ACTIONS.COMPUTER_USE);
      if (denyOr(res, gate)) return;
      try {
        const agent = getComputerUseAgent();
        result = await agent.screenshot(cuParams.id);
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && cuParams && cuParams.kind === 'click') {
      // (11.2) Click. Body: { x, y, button? }.
      const gate = requireRole(authCheck, rbac.ACTIONS.COMPUTER_USE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        const agent = getComputerUseAgent();
        result = await agent.click(cuParams.id, body.x, body.y, body.button);
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && cuParams && cuParams.kind === 'type') {
      // (11.2) Type. Body: { text, delayMs? }.
      const gate = requireRole(authCheck, rbac.ACTIONS.COMPUTER_USE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        const agent = getComputerUseAgent();
        result = await agent.type(cuParams.id, body.text, body.delayMs);
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && cuParams && cuParams.kind === 'key') {
      // (11.2) Key press. Body: { key }.
      const gate = requireRole(authCheck, rbac.ACTIONS.COMPUTER_USE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        const agent = getComputerUseAgent();
        result = await agent.keyPress(cuParams.id, body.key);
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && cuParams && cuParams.kind === 'screenshotOne') {
      // (11.2) Serve the raw screenshot file for a given session +
      // screenshot id. Streams the file to the client; returns 404 when
      // either the session, screenshot, or on-disk file is missing.
      const gate = requireRole(authCheck, rbac.ACTIONS.COMPUTER_USE);
      if (denyOr(res, gate)) return;
      try {
        const agent = getComputerUseAgent();
        const meta = agent.getScreenshot(cuParams.id, cuParams.shotId);
        if (!meta || !meta.imagePath) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Screenshot not found: ' + cuParams.shotId }));
          return;
        }
        const fs2 = require('fs');
        if (!fs2.existsSync(meta.imagePath)) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Screenshot file missing on disk' }));
          return;
        }
        const stat = fs2.statSync(meta.imagePath);
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': stat.size,
          'Cache-Control': 'no-cache',
        });
        const stream = fs2.createReadStream(meta.imagePath);
        stream.on('error', () => {
          if (!res.headersSent) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Read error' }));
          } else {
            res.end();
          }
        });
        stream.pipe(res);
        return;
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && route === '/projects') {
      // (10.8) List all projects. Returns the full board objects so a
      // caller can render a per-project dashboard without a second trip
      // per project.
      const gate = requireRole(authCheck, rbac.ACTIONS.PROJECT_READ);
      if (denyOr(res, gate)) return;
      try {
        const board = getProjectBoard();
        const projects = board.listProjects();
        result = { projects, count: projects.length };
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && route === '/projects') {
      // (10.8) Create a project. Body: { id, name, description }.
      const gate = requireRole(authCheck, rbac.ACTIONS.PROJECT_CREATE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        const board = getProjectBoard();
        result = board.createProject({
          id: body.id,
          name: body.name,
          description: body.description,
        });
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && projectParams && projectParams.kind === 'project') {
      // (10.8) Show one project (full board).
      const gate = requireRole(authCheck, rbac.ACTIONS.PROJECT_READ,
        { type: 'project', id: projectParams.projectId });
      if (denyOr(res, gate)) return;
      try {
        const board = getProjectBoard();
        const p = board.getProject(projectParams.projectId);
        if (!p) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Project not found: ' + projectParams.projectId }));
          return;
        }
        result = p;
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && projectParams && projectParams.kind === 'tasks') {
      // (10.8) Add a task to a project. Body is the task shape
      // { title, status, assignee, estimate, milestoneId, sprintId, description }.
      const gate = requireRole(authCheck, rbac.ACTIONS.PROJECT_UPDATE,
        { type: 'project', id: projectParams.projectId });
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        const board = getProjectBoard();
        result = board.addTask(projectParams.projectId, body);
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'PATCH' && projectParams && projectParams.kind === 'task') {
      // (10.8) Patch a task. Only provided fields are overwritten; status
      // transitions keep the backlog and sprint invariants consistent.
      const gate = requireRole(authCheck, rbac.ACTIONS.PROJECT_UPDATE,
        { type: 'project', id: projectParams.projectId });
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        const board = getProjectBoard();
        result = board.updateTask(projectParams.projectId, projectParams.taskId, body);
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && projectParams && projectParams.kind === 'milestones') {
      // (10.8) Add a milestone. Body: { id?, name, dueDate, status }.
      try {
        const body = await parseBody(req);
        const board = getProjectBoard();
        result = board.createMilestone(projectParams.projectId, body);
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && projectParams && projectParams.kind === 'sprints') {
      // (10.8) Add a sprint. Body: { id?, name, startDate, endDate, taskIds? }.
      try {
        const body = await parseBody(req);
        const board = getProjectBoard();
        result = board.createSprint(projectParams.projectId, body);
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && projectParams && projectParams.kind === 'progress') {
      // (10.8) Project progress aggregate: counts by status + percent.
      try {
        const board = getProjectBoard();
        result = board.projectProgress(projectParams.projectId);
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && projectParams && projectParams.kind === 'sync') {
      // (10.8) Bidirectional TODO.md sync. Body: { repoPath, todoPath? }.
      // Returns { imported, exported, path }.
      try {
        const body = await parseBody(req);
        const repoPath = typeof body.repoPath === 'string' && body.repoPath.length > 0
          ? body.repoPath
          : process.cwd();
        const board = getProjectBoard();
        result = board.syncTodoMd(projectParams.projectId, repoPath, {
          todoPath: typeof body.todoPath === 'string' && body.todoPath.length > 0 ? body.todoPath : undefined,
        });
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && projectParams && projectParams.kind === 'dashboard') {
      // (10.3) Full dashboard snapshot for one project.
      const gate = requireRole(authCheck, rbac.ACTIONS.PROJECT_READ,
        { type: 'project', id: projectParams.projectId });
      if (denyOr(res, gate)) return;
      try {
        const dashboard = getProjectDashboard();
        const snap = dashboard.getSnapshot(projectParams.projectId);
        if (!snap) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Project not found: ' + projectParams.projectId }));
          return;
        }
        result = snap;
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && projectParams && projectParams.kind === 'contributors') {
      // (10.3) Per-user task and token roll-up for one project.
      const gate = requireRole(authCheck, rbac.ACTIONS.PROJECT_READ,
        { type: 'project', id: projectParams.projectId });
      if (denyOr(res, gate)) return;
      try {
        const dashboard = getProjectDashboard();
        const contributors = dashboard.getContributors(projectParams.projectId);
        if (contributors === null) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Project not found: ' + projectParams.projectId }));
          return;
        }
        result = { projectId: projectParams.projectId, contributors, count: contributors.length };
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && projectParams && projectParams.kind === 'velocity') {
      // (10.3) Velocity over a sliding window. ?weeks=N overrides the
      // default 4-week window so dashboards can show 1/4/12-week views
      // without a daemon restart.
      const gate = requireRole(authCheck, rbac.ACTIONS.PROJECT_READ,
        { type: 'project', id: projectParams.projectId });
      if (denyOr(res, gate)) return;
      try {
        const weeksParam = parseInt(url.searchParams.get('weeks') || '', 10);
        const dashboard = getProjectDashboard();
        const v = dashboard.getVelocity(
          projectParams.projectId,
          Number.isFinite(weeksParam) && weeksParam > 0 ? weeksParam : undefined
        );
        if (!v) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Project not found: ' + projectParams.projectId }));
          return;
        }
        result = v;
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'GET' && projectParams && projectParams.kind === 'tokens') {
      // (10.3) Token usage for one project (total + per-user + per-model).
      const gate = requireRole(authCheck, rbac.ACTIONS.PROJECT_READ,
        { type: 'project', id: projectParams.projectId });
      if (denyOr(res, gate)) return;
      try {
        const dashboard = getProjectDashboard();
        const usage = dashboard.getTokenUsage(projectParams.projectId);
        if (usage === null) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Project not found: ' + projectParams.projectId }));
          return;
        }
        result = Object.assign({ projectId: projectParams.projectId }, usage);
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && route === '/cicd/webhook') {
      // (10.4) GitHub webhook receiver. Auth is HMAC-SHA256 over the raw
      // body matching X-Hub-Signature-256; no JWT expected. Translate
      // X-GitHub-Event + payload.action into our internal event name
      // and forward to handleWebhook. Error codes follow the spec:
      //   200  dispatched (including "no pipeline matched")
      //   400  header/event missing or unroutable
      //   401  bad / missing signature
      const { raw, json } = await parseBodyRaw(req);
      const signatureHeader = req.headers['x-hub-signature-256'] || '';
      const eventHeader = req.headers['x-github-event'] || '';
      const secret = cicdManager.webhookSecret || '';
      if (!secret) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Webhook secret not configured' }));
        return;
      }
      if (!cicd.verifySignature(secret, raw, signatureHeader)) {
        _safeAudit('cicd.webhook', { ok: false, reason: 'bad signature' },
          { actor: 'github', target: 'cicd' });
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Invalid signature' }));
        return;
      }
      if (!eventHeader) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing X-GitHub-Event header' }));
        return;
      }
      const internalEvent = cicd.parseGithubEvent(eventHeader, json);
      if (!internalEvent) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Unknown event: ' + eventHeader }));
        return;
      }
      const outcome = cicdManager.handleWebhook(internalEvent, json);
      _safeAudit('cicd.webhook',
        { ok: true, event: internalEvent, matched: outcome.matched || 0 },
        { actor: 'github', target: 'cicd' });
      result = outcome;

    } else if (req.method === 'GET' && route === '/cicd/pipelines') {
      // (10.4) List every registered pipeline.
      const gate = requireRole(authCheck, rbac.ACTIONS.CICD_READ);
      if (denyOr(res, gate)) return;
      try {
        const pipelines = cicdManager.listPipelines();
        result = { pipelines, count: pipelines.length };
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && route === '/cicd/pipelines') {
      // (10.4) Register a pipeline. Body matches the schema in
      // patches/1.9.5-cicd-integration.md.
      const gate = requireRole(authCheck, rbac.ACTIONS.CICD_MANAGE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        result = cicdManager.registerPipeline(body || {});
        _safeAudit('cicd.pipeline.created',
          { id: result.id, repo: result.repo, triggers: result.triggers },
          { actor: _auditActor(authCheck), target: result.id });
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'DELETE' && cicdPipelineId) {
      // (10.4) Delete a pipeline by id. 404 when not found.
      const gate = requireRole(authCheck, rbac.ACTIONS.CICD_MANAGE);
      if (denyOr(res, gate)) return;
      const ok = cicdManager.deletePipeline(cicdPipelineId);
      if (!ok) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Pipeline not found: ' + cicdPipelineId }));
        return;
      }
      _safeAudit('cicd.pipeline.deleted', { id: cicdPipelineId },
        { actor: _auditActor(authCheck), target: cicdPipelineId });
      result = { deleted: true, id: cicdPipelineId };

    } else if (req.method === 'GET' && cicdPipelineId) {
      // (10.4) Show one pipeline.
      const gate = requireRole(authCheck, rbac.ACTIONS.CICD_READ);
      if (denyOr(res, gate)) return;
      const p = cicdManager.getPipeline(cicdPipelineId);
      if (!p) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Pipeline not found: ' + cicdPipelineId }));
        return;
      }
      result = p;

    } else if (req.method === 'POST' && route === '/cicd/trigger') {
      // (10.4) Manual run of a registered pipeline. Body:
      //   { id }                     -> replay every action on the pipeline
      //   { repo, workflow, inputs } -> one-off workflow_dispatch without a pipeline
      const gate = requireRole(authCheck, rbac.ACTIONS.CICD_MANAGE);
      if (denyOr(res, gate)) return;
      try {
        const body = await parseBody(req);
        if (body && body.id) {
          const pipeline = cicdManager.getPipeline(body.id);
          if (!pipeline) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Pipeline not found: ' + body.id }));
            return;
          }
          // Replay via handleWebhook so the action fan-out stays identical
          // to a webhook-driven run. Use the first configured trigger as
          // the event so actions scoped to e.g. merge.main still fire.
          const event = pipeline.triggers[0] || 'merge.main';
          result = cicdManager.handleWebhook(event, body.payload || {});
        } else if (body && body.repo && body.workflow) {
          result = cicdManager.triggerWorkflow(
            body.repo,
            body.workflow,
            body.inputs || {},
            { ref: body.ref || 'main' }
          );
        } else {
          result = { error: 'Provide { id } or { repo, workflow }' };
        }
        if (result && !result.error) {
          _safeAudit('cicd.trigger',
            { id: body.id || null, repo: body.repo || null, workflow: body.workflow || null },
            { actor: _auditActor(authCheck), target: body.id || body.repo || 'cicd' });
        }
      } catch (e) {
        result = { error: e.message };
      }

    } else if (req.method === 'POST' && route === '/cleanup') {
      const { dryRun } = await parseBody(req);
      result = manager.cleanup(dryRun);

    } else if (req.method === 'POST' && route === '/close') {
      const { name } = await parseBody(req);
      const gate = requireRole(authCheck, rbac.ACTIONS.WORKER_CLOSE);
      if (denyOr(res, gate)) return;
      result = manager.close(name);
      if (result && !result.error) {
        _safeAudit('worker.closed', {}, { target: name, actor: _auditActor(authCheck) });
      }

    } else if (req.method === 'GET' && route === '/config') {
      result = manager.getConfig();

    } else if (req.method === 'POST' && route === '/config/reload') {
      const gate = requireRole(authCheck, rbac.ACTIONS.CONFIG_RELOAD);
      if (denyOr(res, gate)) return;
      // Pick up RBAC store edits applied via direct file editing in the
      // same call so the next request sees the new ACLs.
      try { rbacManager.reload(); } catch {}
      result = manager.reloadConfig();
      if (result && !result.error) {
        _safeAudit('config.reloaded', {}, { actor: _auditActor(authCheck), target: 'config' });
        // (10.8) Drop the cached ProjectBoard so a new projects.path
        // picks up on the next request without a daemon restart.
        _projectBoard = null;
        // (10.6) Drop the cached OrgManager so a new org.path kicks in
        // on the next request.
        _orgManager = null;
        // (10.7) Drop the cached ScheduleManager so schedules.path
        // changes take effect on the next request.
        _scheduleManager = null;
        // (11.1) Drop the cached McpHub so mcp.path changes take effect
        // on the next request.
        _mcpHub = null;
        // (11.4) Drop the cached NlInterface so nl.sessionsPath changes
        // take effect on the next request.
        _nlInstance = null;
        // (11.2) Drop the cached ComputerUseAgent so config.computerUse.*
        // edits take effect on the next request.
        _computerUseAgent = null;
        // (10.3) Rebuild the dashboard on the next hit so it binds to
        // the fresh board + any updated cost config.
        _projectDashboard = null;
        // (10.4) Refresh the CicdManager with the new webhook secret +
        // repo token list so cicd responses honour edits immediately.
        try { cicdManager.applyConfig(manager.getConfig().cicd || {}); } catch {}
      }

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

    } else if (req.method === 'GET' && route === '/fleet/overview') {
      // Fleet management (9.6): aggregate this daemon's state plus
      // every registered peer in ~/.c4/fleet.json. Best-effort with a
      // per-machine timeout so one unreachable peer cannot stall the
      // endpoint — see src/fleet.js for the sampling contract.
      const listData = manager.list();
      const self = {
        ok: true,
        alias: '_self',
        host: HOST,
        port: PORT,
        workers: Array.isArray(listData.workers) ? listData.workers.length : 0,
        version: manager._daemonVersion || null,
      };
      const timeoutParam = parseInt(url.searchParams.get('timeout') || '0', 10);
      const machines = fleet.listMachines();
      // Each row carries an authToken for proxy auth; sampleMachine
      // reads it before the token fallback.
      const enriched = machines.map((m) => {
        const full = fleet.getMachine(m.alias) || m;
        return { alias: full.alias, host: full.host, port: full.port, authToken: full.authToken };
      });
      result = await fleet.fetchOverview({
        machines: enriched,
        self,
        timeoutMs: timeoutParam > 0 ? timeoutParam : undefined,
      });

    } else if (req.method === 'POST' && route === '/dispatch') {
      // Fleet task distribution (9.7). Build a placement plan across
      // reachable fleet machines (plus the local daemon) using the
      // requested strategy, then fan out /create + /task to each slot.
      // When no fleet machines are configured everything lands on
      // localhost. Every remote unreachable -> fall back to local too.
      const body = await parseBody(req);
      const count = Math.max(1, parseInt(body.count, 10) || 1);
      const strategy = body.strategy || 'least-loaded';
      const tags = Array.isArray(body.tags) ? body.tags : [];
      const task = typeof body.task === 'string' ? body.task : '';
      const namePrefix = body.namePrefix || 'dispatch';
      const branchPrefix = body.branch || '';
      const profile = body.profile || '';
      const autoMode = Boolean(body.autoMode);
      const location = body.location || null;
      const dryRun = Boolean(body.dryRun);

      if (!task) {
        result = { error: 'Missing task' };
      } else {
        const listData = manager.list();
        const localSample = {
          alias: '_local',
          host: '127.0.0.1',
          port: PORT,
          ok: true,
          workers: Array.isArray(listData.workers) ? listData.workers.length : 0,
          version: manager._daemonVersion || null,
          tags: [],
          authToken: '',
        };
        const machines = fleet.listMachines().map((m) => {
          const full = fleet.getMachine(m.alias) || m;
          return {
            alias: full.alias,
            host: full.host,
            port: full.port,
            authToken: full.authToken,
            tags: Array.isArray(full.tags) ? full.tags.slice() : [],
          };
        });
        let plan;
        try {
          plan = await dispatcher.dispatch({
            task,
            count,
            strategy,
            tags,
            location,
            namePrefix,
            branchPrefix,
            machines,
            local: localSample,
          });
        } catch (e) {
          result = { error: `dispatch failed: ${e.message}` };
          plan = null;
        }
        if (plan) {
          const created = [];
          if (!dryRun) {
            for (const slot of plan.plan) {
              const isLocal = slot.machine.alias === '_local';
              const payload = {
                name: slot.name,
                task: slot.task,
                useBranch: true,
              };
              if (slot.branch) payload.branch = slot.branch;
              if (autoMode) payload.autoMode = true;
              if (profile) payload.profile = profile;
              if (isLocal) {
                try {
                  const r = manager.sendTask(slot.name, slot.task, {
                    branch: slot.branch || undefined,
                    profile: profile || undefined,
                    autoMode: autoMode || undefined,
                  });
                  created.push({ slot: slot.slot, name: slot.name, alias: slot.machine.alias, ok: !r.error, result: r });
                } catch (e) {
                  created.push({ slot: slot.slot, name: slot.name, alias: slot.machine.alias, ok: false, error: e.message });
                }
              } else {
                // Remote /task via the target peer's HTTP daemon. We do
                // not await a busy-loop here; sendTask on the peer will
                // return immediately with the worker id.
                try {
                  const base = `http://${slot.machine.host}:${slot.machine.port}`;
                  const tokenRow = fleet.getMachine(slot.machine.alias);
                  const token = (tokenRow && tokenRow.authToken) || fleet.readSharedToken() || null;
                  const r = await fleet.proxyRequest(
                    { pinned: true, base, token },
                    'POST', '/task', payload, { timeoutMs: 10000 }
                  );
                  created.push({ slot: slot.slot, name: slot.name, alias: slot.machine.alias, ok: Boolean(r.ok), result: r.body || null, status: r.status, error: r.error || null });
                } catch (e) {
                  created.push({ slot: slot.slot, name: slot.name, alias: slot.machine.alias, ok: false, error: e.message });
                }
              }
            }
          }
          result = {
            strategy: plan.strategy,
            count: plan.count,
            tags: plan.tags,
            fallback: plan.fallback,
            plan: plan.plan,
            samples: plan.samples.map((s) => ({
              alias: s.alias,
              host: s.host,
              port: s.port,
              ok: s.ok,
              workers: s.workers,
              version: s.version,
              error: s.error,
              elapsedMs: s.elapsedMs,
              tags: s.tags || [],
            })),
            created: dryRun ? null : created,
            dryRun,
          };
        }
      }

    } else if (req.method === 'POST' && route === '/transfer') {
      // Machine-to-machine file transfer (9.8). Accepts either
      //   { alias, type: 'rsync', src, dest, opts? } -> rsync over ssh
      // or
      //   { alias, type: 'git',   src, remoteRepoPath, branch, opts? } -> git push
      // The HTTP response returns immediately with { started, pid } so
      // the caller can poll /events for the progress stream. Progress,
      // completion and error events arrive on the existing SSE bus.
      const body = await parseBody(req);
      const alias = body.alias;
      const type = body.type || 'rsync';
      const src = body.src;
      const dest = body.dest || '';
      const opts = body.opts && typeof body.opts === 'object' ? body.opts : {};
      const allowSystem = Boolean(opts.allowSystem);
      if (!alias || typeof alias !== 'string') {
        result = { error: 'Missing alias' };
      } else if (type !== 'rsync' && type !== 'git') {
        result = { error: `Unknown transfer type '${type}' (use 'rsync' or 'git')` };
      } else if (!src) {
        result = { error: 'Missing src' };
      } else {
        let machine;
        try {
          machine = fileTransfer.resolveMachine(alias);
        } catch (e) {
          result = { error: e.message };
        }
        if (machine) {
          const transferId = `tx-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
          const baseEvent = { alias, type, transferId };
          try {
            if (type === 'rsync') {
              const handle = fileTransfer.transferFiles(src, dest, {
                machine,
                excludes: Array.isArray(opts.excludes) ? opts.excludes : [],
                delete: Boolean(opts.delete),
                dryRun: Boolean(opts.dryRun),
                allowSystem,
                onProgress: (ev) => {
                  manager.emit('sse', Object.assign({ type: 'transfer-progress' }, baseEvent, ev));
                },
                onComplete: (info) => {
                  manager.emit('sse', Object.assign(
                    { type: 'transfer-complete' }, baseEvent, info
                  ));
                },
                onError: (err) => {
                  manager.emit('sse', Object.assign(
                    { type: 'transfer-error' }, baseEvent,
                    { error: err && err.message ? err.message : String(err) }
                  ));
                },
              });
              result = {
                started: handle.started,
                pid: handle.pid,
                alias,
                type,
                transferId,
                cmd: handle.cmd,
                args: handle.args,
              };
            } else {
              const branch = typeof body.branch === 'string' ? body.branch : '';
              const remoteRepoPath = body.remoteRepoPath || opts.remoteRepoPath;
              if (!remoteRepoPath) {
                result = { error: 'Missing remoteRepoPath for git transfer' };
              } else {
                const handle = fileTransfer.pushRepo(machine, src, branch, {
                  remoteRepoPath,
                  force: Boolean(opts.force),
                  allowSystem,
                  onProgress: (ev) => {
                    manager.emit('sse', Object.assign(
                      { type: 'transfer-progress' }, baseEvent, ev
                    ));
                  },
                  onComplete: (info) => {
                    manager.emit('sse', Object.assign(
                      { type: 'transfer-complete' }, baseEvent, info
                    ));
                  },
                  onError: (err) => {
                    manager.emit('sse', Object.assign(
                      { type: 'transfer-error' }, baseEvent,
                      { error: err && err.message ? err.message : String(err) }
                    ));
                  },
                });
                result = {
                  started: handle.started,
                  pid: handle.pid,
                  alias,
                  type,
                  transferId,
                  cmd: handle.cmd,
                  args: handle.args,
                };
              }
            }
          } catch (e) {
            result = { error: e.message };
          }
        }
      }

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

// (10.7) Scheduler tick: poll the ScheduleManager once a minute so any
// due schedule fires on or shortly after its nextRun. Kept as a thin
// setInterval rather than piggybacking on healthCheck so the tick
// cadence does not drift when healthCheckInterval changes.
let _scheduleTickTimer = null;
function _startScheduleTick() {
  if (_scheduleTickTimer) return;
  const cfgNow = manager.getConfig() || {};
  const scheduleCfg = cfgNow.schedules || {};
  if (scheduleCfg.enabled === false) return;
  const intervalMs = Number.isFinite(Number(scheduleCfg.tickIntervalMs)) && Number(scheduleCfg.tickIntervalMs) > 0
    ? Number(scheduleCfg.tickIntervalMs)
    : 60000;
  // Kick immediately so a schedule whose nextRun landed while the
  // daemon was down fires on startup instead of after a full interval.
  try { runScheduleTick(new Date()); } catch {}
  _scheduleTickTimer = setInterval(() => { runScheduleTick(new Date()); }, intervalMs);
}
function _stopScheduleTick() {
  if (_scheduleTickTimer) {
    clearInterval(_scheduleTickTimer);
    _scheduleTickTimer = null;
  }
}

server.listen(PORT, HOST, () => {
  console.log(`C4 daemon running on http://${HOST}:${PORT} (version ${manager._daemonVersion || 'unknown'})`);
  // Persist daemon version to state.json (7.15)
  try { manager._saveState(); } catch (e) { console.error('[DAEMON] _saveState on startup failed:', e.message); }
  manager.startHealthCheck();
  manager.startWorktreeGc();
  notifications.startPeriodicSlack();
  _startScheduleTick();
});

process.on('SIGINT', () => {
  notifications.stopPeriodicSlack();
  manager.stopHealthCheck();
  manager.stopWorktreeGc();
  _stopScheduleTick();
  manager.closeAll();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  notifications.stopPeriodicSlack();
  manager.stopHealthCheck();
  manager.stopWorktreeGc();
  _stopScheduleTick();
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
