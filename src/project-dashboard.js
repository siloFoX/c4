'use strict';

// (10.3) Project-specific dashboard.
//
// Pure aggregation layer that joins three upstream modules into a
// single per-project snapshot:
//   - ProjectBoard (10.8) for tasks, milestones, and sprint state
//   - AuditLogger  (10.2) for merge.performed events scoped to the
//                         project's branches
//   - CostReporter (10.5) for per-project token / per-user rollups
//
// The class is intentionally decoupled from the daemon: callers wire
// up the board, logger, cost reporter, and worker list via the
// constructor so tests can drop in stubs backed by tmpdirs and the
// daemon can wire the shared singletons without touching test code.
//
// Caching: getSnapshot() memoizes per project for cacheTtlMs (default
// 30s). The cache key also carries a signature derived from the
// project's task count + max updatedAt so a POST /projects/<id>/tasks
// or task status flip invalidates the snapshot automatically on the
// next read — operators never see a stale dashboard after editing a
// task. Callers can also force invalidation via invalidate(projectId).

const VELOCITY_WEEKS_DEFAULT = 4;
const CACHE_TTL_DEFAULT_MS = 30000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function round2(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function projectBranchMatches(branch, projectId) {
  if (typeof branch !== 'string' || branch.length === 0) return false;
  if (branch === projectId) return true;
  const prefix = 'c4/' + projectId;
  if (branch === prefix) return true;
  if (branch.startsWith(prefix + '-')) return true;
  if (branch.startsWith(prefix + '/')) return true;
  return false;
}

class ProjectDashboard {
  constructor(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    this.board = o.board || null;
    this.auditLogger = o.auditLogger || null;
    this.costReporter = o.costReporter || null;
    this.workers = o.workers !== undefined ? o.workers : [];
    this.cacheTtlMs = Number.isFinite(o.cacheTtlMs) && o.cacheTtlMs >= 0
      ? o.cacheTtlMs
      : CACHE_TTL_DEFAULT_MS;
    this.velocityWeeks = Number.isFinite(o.velocityWeeks) && o.velocityWeeks > 0
      ? Math.floor(o.velocityWeeks)
      : VELOCITY_WEEKS_DEFAULT;
    this.recentMergesLimit = Number.isFinite(o.recentMergesLimit) && o.recentMergesLimit > 0
      ? Math.floor(o.recentMergesLimit)
      : 20;
    this.now = typeof o.now === 'function' ? o.now : () => Date.now();
    this._cache = new Map();
  }

  invalidate(projectId) {
    if (projectId === undefined || projectId === null) {
      this._cache.clear();
      return;
    }
    this._cache.delete(String(projectId));
  }

  invalidateAll() {
    this._cache.clear();
  }

  getSnapshot(projectId) {
    if (!this.board) return null;
    const project = this.board.getProject(projectId);
    if (!project) return null;

    const nowMs = this.now();
    const signature = this._signature(project);
    const key = String(projectId);
    const cached = this._cache.get(key);
    if (cached
        && cached.signature === signature
        && (nowMs - cached.at) < this.cacheTtlMs) {
      return cached.snapshot;
    }

    const snapshot = {
      project,
      activeWorkers: this._activeWorkers(projectId),
      recentMerges: this._recentMerges(projectId),
      todoStats: this._todoStats(project),
      tokenUsage: this._tokenUsage(projectId),
      contributors: this._contributors(projectId, project),
      velocity: this._velocity(projectId, project, nowMs, this.velocityWeeks),
      generatedAt: new Date(nowMs).toISOString(),
    };

    this._cache.set(key, { snapshot, signature, at: nowMs });
    return snapshot;
  }

  // Thin accessor for the CLI's `c4 project contributors <id>`; reuses
  // the snapshot so a burst of dashboard + contributors + velocity
  // requests from the UI shares one aggregation pass.
  getContributors(projectId) {
    const snap = this.getSnapshot(projectId);
    return snap ? snap.contributors : null;
  }

  // Velocity accepts an override window so `c4 project velocity --weeks 8`
  // can ask a different window without reshaping the snapshot. We compute
  // directly from the board here (bypassing the snapshot cache) because
  // the window is part of the request, not the project state.
  getVelocity(projectId, weeks) {
    if (!this.board) return null;
    const project = this.board.getProject(projectId);
    if (!project) return null;
    const useWeeks = Number.isFinite(weeks) && weeks > 0
      ? Math.floor(weeks)
      : this.velocityWeeks;
    return this._velocity(projectId, project, this.now(), useWeeks);
  }

  getTokenUsage(projectId) {
    const snap = this.getSnapshot(projectId);
    return snap ? snap.tokenUsage : null;
  }

  // --- internals ----------------------------------------------------

  _signature(project) {
    const tasks = Array.isArray(project.tasks) ? project.tasks : [];
    let maxUpdated = typeof project.createdAt === 'string' ? project.createdAt : '';
    for (const t of tasks) {
      const u = typeof t.updatedAt === 'string' ? t.updatedAt : '';
      if (u > maxUpdated) maxUpdated = u;
    }
    const milestones = Array.isArray(project.milestones) ? project.milestones.length : 0;
    const sprints = Array.isArray(project.sprints) ? project.sprints.length : 0;
    return tasks.length + ':' + milestones + ':' + sprints + ':' + maxUpdated;
  }

  _getWorkers() {
    if (typeof this.workers === 'function') {
      try {
        const v = this.workers();
        return Array.isArray(v) ? v : [];
      } catch {
        return [];
      }
    }
    return Array.isArray(this.workers) ? this.workers : [];
  }

  _activeWorkers(projectId) {
    const workers = this._getWorkers();
    const out = [];
    for (const w of workers) {
      if (!w || typeof w !== 'object') continue;
      const branch = typeof w.branch === 'string' ? w.branch : '';
      const proj = typeof w.project === 'string' ? w.project : '';
      const matches = proj === projectId || projectBranchMatches(branch, projectId);
      if (!matches) continue;
      out.push({
        name: typeof w.name === 'string' ? w.name : '',
        branch: branch.length > 0 ? branch : null,
        status: typeof w.status === 'string' ? w.status : 'unknown',
        startedAt: typeof w.startedAt === 'string' ? w.startedAt
          : (typeof w.createdAt === 'string' ? w.createdAt : null),
      });
    }
    return out;
  }

  _recentMerges(projectId) {
    if (!this.auditLogger || typeof this.auditLogger.query !== 'function') return [];
    let events = [];
    try { events = this.auditLogger.query({ type: 'merge.performed' }) || []; }
    catch { return []; }
    const out = [];
    for (const e of events) {
      if (!e || typeof e !== 'object') continue;
      const details = e.details && typeof e.details === 'object' ? e.details : {};
      const branch = (typeof e.target === 'string' && e.target.length > 0)
        ? e.target
        : (typeof details.branch === 'string' ? details.branch : '');
      if (!projectBranchMatches(branch, projectId)) continue;
      out.push({
        branch,
        commit: typeof details.commit === 'string' && details.commit.length > 0
          ? details.commit
          : null,
        mergedAt: typeof e.timestamp === 'string' ? e.timestamp : null,
      });
    }
    out.sort((a, b) => {
      const ta = Date.parse(a.mergedAt || '') || 0;
      const tb = Date.parse(b.mergedAt || '') || 0;
      return tb - ta;
    });
    return out.slice(0, this.recentMergesLimit);
  }

  _todoStats(project) {
    const tasks = Array.isArray(project.tasks) ? project.tasks : [];
    const total = tasks.length;
    let done = 0;
    for (const t of tasks) {
      if (t && t.status === 'done') done += 1;
    }
    const open = total - done;
    const done_pct = total === 0 ? 0 : Math.round((done / total) * 10000) / 100;
    return { open, done, total, done_pct };
  }

  _collectCostRecords() {
    if (!this.costReporter) return [];
    if (typeof this.costReporter._collect === 'function') {
      try {
        const r = this.costReporter._collect(null, null);
        return Array.isArray(r) ? r : [];
      } catch { return []; }
    }
    if (Array.isArray(this.costReporter.records)) {
      return this.costReporter.records.slice();
    }
    return [];
  }

  _tokenUsage(projectId) {
    const records = this._collectCostRecords();
    let total = 0;
    const byUser = {};
    const byModel = {};
    for (const r of records) {
      if (!r || typeof r !== 'object') continue;
      if (r.project !== projectId) continue;
      const inTok = Number(r.inputTokens) || 0;
      const outTok = Number(r.outputTokens) || 0;
      const tokens = inTok + outTok;
      total += tokens;
      const user = typeof r.user === 'string' && r.user.length > 0 ? r.user : 'unknown';
      const model = typeof r.model === 'string' && r.model.length > 0 ? r.model : 'unknown';
      byUser[user] = (byUser[user] || 0) + tokens;
      byModel[model] = (byModel[model] || 0) + tokens;
    }
    return { total, byUser, byModel };
  }

  _contributors(projectId, project) {
    const perUser = new Map();
    const ensure = (u) => {
      let slot = perUser.get(u);
      if (!slot) {
        slot = { user: u, tasks: 0, tokens: 0 };
        perUser.set(u, slot);
      }
      return slot;
    };
    const tasks = Array.isArray(project.tasks) ? project.tasks : [];
    for (const t of tasks) {
      if (!t || typeof t !== 'object') continue;
      const u = typeof t.assignee === 'string' && t.assignee.length > 0
        ? t.assignee
        : 'unassigned';
      ensure(u).tasks += 1;
    }
    const records = this._collectCostRecords();
    for (const r of records) {
      if (!r || typeof r !== 'object') continue;
      if (r.project !== projectId) continue;
      const u = typeof r.user === 'string' && r.user.length > 0 ? r.user : 'unknown';
      const tokens = (Number(r.inputTokens) || 0) + (Number(r.outputTokens) || 0);
      ensure(u).tokens += tokens;
    }
    // Stable order: tokens desc, then tasks desc, then user asc. Keeps
    // `c4 project contributors` output deterministic across machines.
    return Array.from(perUser.values()).sort((a, b) => {
      if (b.tokens !== a.tokens) return b.tokens - a.tokens;
      if (b.tasks !== a.tasks) return b.tasks - a.tasks;
      return a.user.localeCompare(b.user);
    });
  }

  _velocity(projectId, project, nowMs, weeks) {
    const useWeeks = Number.isFinite(weeks) && weeks > 0 ? Math.floor(weeks) : this.velocityWeeks;
    const windowMs = useWeeks * WEEK_MS;
    const since = nowMs - windowMs;

    let tasksDone = 0;
    const projTasks = Array.isArray(project.tasks) ? project.tasks : [];
    for (const t of projTasks) {
      if (!t || t.status !== 'done') continue;
      const ts = Date.parse(t.updatedAt || t.createdAt || '');
      if (Number.isFinite(ts) && ts >= since) tasksDone += 1;
    }

    let merges = 0;
    if (this.auditLogger && typeof this.auditLogger.query === 'function') {
      let events = [];
      try {
        events = this.auditLogger.query({
          type: 'merge.performed',
          from: new Date(since).toISOString(),
        }) || [];
      } catch { events = []; }
      for (const e of events) {
        if (!e || typeof e !== 'object') continue;
        const details = e.details && typeof e.details === 'object' ? e.details : {};
        const branch = (typeof e.target === 'string' && e.target.length > 0)
          ? e.target
          : (typeof details.branch === 'string' ? details.branch : '');
        if (projectBranchMatches(branch, projectId)) merges += 1;
      }
    }

    return {
      tasksPerWeek: round2(tasksDone / useWeeks),
      mergesPerWeek: round2(merges / useWeeks),
      windowWeeks: useWeeks,
      tasks: tasksDone,
      merges,
      windowStart: new Date(since).toISOString(),
      windowEnd: new Date(nowMs).toISOString(),
    };
  }
}

module.exports = {
  ProjectDashboard,
  VELOCITY_WEEKS_DEFAULT,
  CACHE_TTL_DEFAULT_MS,
  WEEK_MS,
  projectBranchMatches,
};
