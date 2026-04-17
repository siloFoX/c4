'use strict';

// (10.6) Department / team management.
//
// Organizational structure that owns projects, machines, and worker
// quotas. Builds on RBAC (10.1) for the user <-> role mapping and on
// the cost report (10.5) for per-department spend aggregation.
//
// Storage is a single JSON file at ~/.c4/org.json:
//   {
//     departments: {
//       <deptId>: {
//         id, name, parentId | null,
//         managerUserIds: [username...],
//         memberUserIds:  [username...],
//         projectIds:     [projectId...],
//         machineAliases: [alias...],
//         quotas: { maxWorkers, monthlyBudgetUSD, tokenLimit }
//       }
//     },
//     teams: {
//       <teamId>: { id, deptId, name, memberUserIds: [username...] }
//     }
//   }
//
// Design notes
// ------------
// 1. Departments form a tree via parentId. A department without a
//    parent is a root. resolveUserDept(userId) walks the membership
//    tables (teams first, then departments) and returns the nearest
//    department so callers can answer "which budget does this user
//    charge against?" without scanning every dept on each request.
// 2. Quotas live on the department, not the team. Teams inherit the
//    parent's quota implicitly. setQuota merges into the existing
//    shape so callers can update one field at a time.
// 3. getQuotaUsage(deptId, ctx) accepts a dependency bag so tests can
//    inject a stub cost report / worker list without standing up the
//    daemon. The default usage shape is still deterministic when
//    nothing is injected, so the CLI can call it during a dry run.
// 4. The module is a pure storage layer. It does not shell out, does
//    not touch the daemon, and accepts an explicit storePath option
//    so tests can run against an isolated tmpdir without polluting
//    the operator's real ~/.c4/org.json.

const fs = require('fs');
const os = require('os');
const path = require('path');

const ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const MEMBER_ROLES = Object.freeze(['manager', 'member']);

function defaultOrgPath() {
  return path.join(os.homedir(), '.c4', 'org.json');
}

function isId(v) {
  return typeof v === 'string' && v.length > 0 && ID_PATTERN.test(v);
}

function isUsername(v) {
  return typeof v === 'string' && v.length > 0 && /^[A-Za-z0-9._-]+$/.test(v);
}

function freshState() {
  return { departments: {}, teams: {} };
}

function normalizeQuotas(q) {
  const src = q && typeof q === 'object' ? q : {};
  const pickNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    maxWorkers: pickNum(src.maxWorkers),
    monthlyBudgetUSD: pickNum(src.monthlyBudgetUSD),
    tokenLimit: pickNum(src.tokenLimit),
  };
}

function normalizeDept(d) {
  const src = d && typeof d === 'object' ? d : {};
  const id = typeof src.id === 'string' ? src.id : '';
  return {
    id,
    name: typeof src.name === 'string' && src.name.length > 0 ? src.name : id,
    parentId: isId(src.parentId) ? src.parentId : null,
    managerUserIds: Array.isArray(src.managerUserIds) ? src.managerUserIds.filter(isUsername) : [],
    memberUserIds: Array.isArray(src.memberUserIds) ? src.memberUserIds.filter(isUsername) : [],
    projectIds: Array.isArray(src.projectIds) ? src.projectIds.filter((p) => typeof p === 'string' && p.length > 0) : [],
    machineAliases: Array.isArray(src.machineAliases) ? src.machineAliases.filter((p) => typeof p === 'string' && p.length > 0) : [],
    quotas: normalizeQuotas(src.quotas),
  };
}

function normalizeTeam(t) {
  const src = t && typeof t === 'object' ? t : {};
  return {
    id: typeof src.id === 'string' ? src.id : '',
    deptId: typeof src.deptId === 'string' ? src.deptId : '',
    name: typeof src.name === 'string' && src.name.length > 0 ? src.name : (typeof src.id === 'string' ? src.id : ''),
    memberUserIds: Array.isArray(src.memberUserIds) ? src.memberUserIds.filter(isUsername) : [],
  };
}

function ensureShape(state) {
  const s = state && typeof state === 'object' ? state : {};
  const out = freshState();
  if (s.departments && typeof s.departments === 'object') {
    for (const [id, dept] of Object.entries(s.departments)) {
      if (!isId(id)) continue;
      const norm = normalizeDept({ ...dept, id });
      out.departments[id] = norm;
    }
  }
  if (s.teams && typeof s.teams === 'object') {
    for (const [id, team] of Object.entries(s.teams)) {
      if (!isId(id)) continue;
      const norm = normalizeTeam({ ...team, id });
      if (!norm.deptId) continue;
      out.teams[id] = norm;
    }
  }
  return out;
}

class OrgManager {
  constructor(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    this.storePath = typeof o.storePath === 'string' && o.storePath.length > 0
      ? o.storePath
      : defaultOrgPath();
    this._state = null;
  }

  _load() {
    if (this._state) return this._state;
    if (!fs.existsSync(this.storePath)) {
      this._state = freshState();
      return this._state;
    }
    try {
      const raw = fs.readFileSync(this.storePath, 'utf8');
      const parsed = raw && raw.length > 0 ? JSON.parse(raw) : {};
      this._state = ensureShape(parsed);
    } catch {
      this._state = freshState();
    }
    return this._state;
  }

  _persist() {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify(this._state, null, 2) + '\n');
  }

  reload() {
    this._state = null;
    return this._load();
  }

  // ---- Departments ---------------------------------------------------

  createDepartment(input) {
    const o = input && typeof input === 'object' ? input : {};
    const id = o.id;
    if (!isId(id)) throw new Error('Department id must match ' + ID_PATTERN);
    const state = this._load();
    if (state.departments[id]) throw new Error('Department already exists: ' + id);
    if (o.parentId !== undefined && o.parentId !== null) {
      if (!isId(o.parentId)) throw new Error('Invalid parentId: ' + o.parentId);
      if (!state.departments[o.parentId]) throw new Error('Parent department not found: ' + o.parentId);
    }
    const dept = normalizeDept({
      id,
      name: o.name,
      parentId: (o.parentId === undefined || o.parentId === null) ? null : o.parentId,
      quotas: o.quotas,
    });
    state.departments[id] = dept;
    this._persist();
    return dept;
  }

  getDepartment(deptId) {
    const state = this._load();
    return state.departments[deptId] || null;
  }

  listDepartments() {
    const state = this._load();
    return Object.values(state.departments).slice().sort((a, b) => a.id.localeCompare(b.id));
  }

  addMember(deptId, userId, role) {
    if (!isUsername(userId)) throw new Error('Invalid userId: ' + userId);
    const state = this._load();
    const dept = state.departments[deptId];
    if (!dept) throw new Error('Department not found: ' + deptId);
    const r = (role === 'manager') ? 'manager' : 'member';
    if (r === 'manager') {
      if (!dept.managerUserIds.includes(userId)) dept.managerUserIds.push(userId);
      // Managers are members too, so resolveUserDept finds them.
      if (!dept.memberUserIds.includes(userId)) dept.memberUserIds.push(userId);
    } else {
      if (!dept.memberUserIds.includes(userId)) dept.memberUserIds.push(userId);
    }
    this._persist();
    return dept;
  }

  removeMember(deptId, userId) {
    const state = this._load();
    const dept = state.departments[deptId];
    if (!dept) throw new Error('Department not found: ' + deptId);
    dept.managerUserIds = dept.managerUserIds.filter((u) => u !== userId);
    dept.memberUserIds = dept.memberUserIds.filter((u) => u !== userId);
    this._persist();
    return dept;
  }

  assignProject(deptId, projectId) {
    if (typeof projectId !== 'string' || projectId.length === 0) {
      throw new Error('Invalid projectId');
    }
    const state = this._load();
    const dept = state.departments[deptId];
    if (!dept) throw new Error('Department not found: ' + deptId);
    if (!dept.projectIds.includes(projectId)) dept.projectIds.push(projectId);
    this._persist();
    return dept;
  }

  assignMachine(deptId, alias) {
    if (typeof alias !== 'string' || alias.length === 0) {
      throw new Error('Invalid machine alias');
    }
    const state = this._load();
    const dept = state.departments[deptId];
    if (!dept) throw new Error('Department not found: ' + deptId);
    if (!dept.machineAliases.includes(alias)) dept.machineAliases.push(alias);
    this._persist();
    return dept;
  }

  setQuota(deptId, quotas) {
    const state = this._load();
    const dept = state.departments[deptId];
    if (!dept) throw new Error('Department not found: ' + deptId);
    const src = quotas && typeof quotas === 'object' ? quotas : {};
    // Merge: only overwrite fields the caller actually passed in so a
    // second setQuota({maxWorkers: 10}) does not clobber the budget.
    const cur = dept.quotas || normalizeQuotas({});
    const next = {
      maxWorkers: Number.isFinite(Number(src.maxWorkers)) ? Number(src.maxWorkers) : cur.maxWorkers,
      monthlyBudgetUSD: Number.isFinite(Number(src.monthlyBudgetUSD)) ? Number(src.monthlyBudgetUSD) : cur.monthlyBudgetUSD,
      tokenLimit: Number.isFinite(Number(src.tokenLimit)) ? Number(src.tokenLimit) : cur.tokenLimit,
    };
    dept.quotas = next;
    this._persist();
    return { deptId: dept.id, quotas: next };
  }

  // ---- Teams ---------------------------------------------------------

  createTeam(input) {
    const o = input && typeof input === 'object' ? input : {};
    const id = o.id;
    const deptId = o.deptId;
    if (!isId(id)) throw new Error('Team id must match ' + ID_PATTERN);
    if (!isId(deptId)) throw new Error('Invalid deptId: ' + deptId);
    const state = this._load();
    if (state.teams[id]) throw new Error('Team already exists: ' + id);
    if (!state.departments[deptId]) throw new Error('Department not found: ' + deptId);
    const team = normalizeTeam({
      id,
      deptId,
      name: typeof o.name === 'string' && o.name.length > 0 ? o.name : id,
      memberUserIds: [],
    });
    state.teams[id] = team;
    this._persist();
    return team;
  }

  getTeam(teamId) {
    const state = this._load();
    return state.teams[teamId] || null;
  }

  listTeams(deptId) {
    const state = this._load();
    const all = Object.values(state.teams);
    const filtered = deptId ? all.filter((t) => t.deptId === deptId) : all.slice();
    return filtered.sort((a, b) => a.id.localeCompare(b.id));
  }

  assignMember(teamId, userId) {
    if (!isUsername(userId)) throw new Error('Invalid userId: ' + userId);
    const state = this._load();
    const team = state.teams[teamId];
    if (!team) throw new Error('Team not found: ' + teamId);
    const dept = state.departments[team.deptId];
    if (!dept) throw new Error('Orphan team: parent department missing: ' + team.deptId);
    if (!team.memberUserIds.includes(userId)) team.memberUserIds.push(userId);
    // Team membership also implies department membership so quotas and
    // resolveUserDept walk produce stable answers.
    if (!dept.memberUserIds.includes(userId)) dept.memberUserIds.push(userId);
    this._persist();
    return team;
  }

  removeFromTeam(teamId, userId) {
    const state = this._load();
    const team = state.teams[teamId];
    if (!team) throw new Error('Team not found: ' + teamId);
    team.memberUserIds = team.memberUserIds.filter((u) => u !== userId);
    this._persist();
    return team;
  }

  // ---- Tree view + lookups -------------------------------------------

  // Build a nested tree rooted at every department with parentId=null.
  // Node shape: { dept, subdepts: [...], teams: [...], members: [...] }.
  // members is a de-duplicated union of dept.memberUserIds plus every
  // team.memberUserIds under it so the UI can render a single list.
  treeView() {
    const state = this._load();
    const childrenOf = new Map();
    for (const dept of Object.values(state.departments)) {
      const pid = dept.parentId || '__ROOT__';
      if (!childrenOf.has(pid)) childrenOf.set(pid, []);
      childrenOf.get(pid).push(dept);
    }
    const teamsByDept = new Map();
    for (const team of Object.values(state.teams)) {
      if (!teamsByDept.has(team.deptId)) teamsByDept.set(team.deptId, []);
      teamsByDept.get(team.deptId).push(team);
    }
    const buildNode = (dept) => {
      const teams = (teamsByDept.get(dept.id) || []).slice()
        .sort((a, b) => a.id.localeCompare(b.id));
      const memberSet = new Set(dept.memberUserIds);
      for (const t of teams) for (const u of t.memberUserIds) memberSet.add(u);
      const subdeptDepts = (childrenOf.get(dept.id) || []).slice()
        .sort((a, b) => a.id.localeCompare(b.id));
      const subdepts = subdeptDepts.map(buildNode);
      return {
        dept,
        subdepts,
        teams,
        members: Array.from(memberSet).sort(),
      };
    };
    const roots = (childrenOf.get('__ROOT__') || []).slice()
      .sort((a, b) => a.id.localeCompare(b.id));
    return roots.map(buildNode);
  }

  // resolveUserDept(userId) -> nearest department the user belongs to.
  // We prefer the most specific hit: a team membership resolves to the
  // team's department; otherwise we walk every department and return
  // the first that lists the user. When a user appears under multiple
  // departments (rare but legal), the deepest one in the parent chain
  // wins so "nearest" matches the spec.
  resolveUserDept(userId) {
    if (!isUsername(userId)) return null;
    const state = this._load();
    const depth = (deptId) => {
      let d = 0;
      let cur = state.departments[deptId];
      while (cur && cur.parentId) {
        d += 1;
        cur = state.departments[cur.parentId];
        if (d > 1024) break; // cycle guard
      }
      return d;
    };
    let best = null;
    let bestDepth = -1;
    for (const team of Object.values(state.teams)) {
      if (team.memberUserIds.includes(userId)) {
        const d = depth(team.deptId) + 1;
        if (d > bestDepth) {
          best = state.departments[team.deptId] || null;
          bestDepth = d;
        }
      }
    }
    for (const dept of Object.values(state.departments)) {
      if (dept.memberUserIds.includes(userId) || dept.managerUserIds.includes(userId)) {
        const d = depth(dept.id);
        if (d > bestDepth) {
          best = dept;
          bestDepth = d;
        }
      }
    }
    return best;
  }

  // parentChain(deptId) -> [root, ..., deptId]. Useful for tests and
  // UI breadcrumbs. Returns an empty array when deptId is unknown.
  parentChain(deptId) {
    const state = this._load();
    const out = [];
    let cur = state.departments[deptId];
    const seen = new Set();
    while (cur) {
      if (seen.has(cur.id)) break;
      seen.add(cur.id);
      out.unshift(cur.id);
      cur = cur.parentId ? state.departments[cur.parentId] : null;
    }
    return out;
  }

  // ---- Usage aggregation ---------------------------------------------

  // getQuotaUsage(deptId, ctx?) -> usage + limit snapshot.
  // ctx.costReporter: optional CostReporter (10.5). When present, we ask
  //   it for a report grouped by user and sum over the dept's member
  //   list. Keeping the aggregation here (not in the reporter) means the
  //   reporter stays domain-agnostic.
  // ctx.workers: optional array of worker records ({project, machine,
  //   user, status}). Active worker count = workers with status not
  //   equal to 'closed'/'done' owned by a dept member or tagged to a
  //   dept project / machine.
  // ctx.now: optional Date for the monthly budget window (for tests).
  getQuotaUsage(deptId, ctx) {
    const state = this._load();
    const dept = state.departments[deptId];
    if (!dept) throw new Error('Department not found: ' + deptId);
    const c = ctx && typeof ctx === 'object' ? ctx : {};
    const now = c.now instanceof Date ? c.now : new Date();

    const memberSet = new Set(dept.memberUserIds);
    for (const team of Object.values(state.teams)) {
      if (team.deptId === deptId) for (const u of team.memberUserIds) memberSet.add(u);
    }
    const projectSet = new Set(dept.projectIds);
    const machineSet = new Set(dept.machineAliases);

    // Cost usage over the current calendar month, grouped by user so we
    // can filter down to this department's members.
    let costUSD = 0;
    let tokens = 0;
    if (c.costReporter && typeof c.costReporter.monthlyReport === 'function') {
      try {
        const report = c.costReporter.monthlyReport(now.getUTCFullYear(), now.getUTCMonth() + 1, { groupBy: 'user' });
        for (const g of (report.byGroup || [])) {
          if (memberSet.has(g.name)) {
            costUSD += Number(g.costUSD) || 0;
            tokens += Number(g.tokens) || 0;
          }
        }
      } catch {}
    }

    // Worker count. Only active ones count toward maxWorkers. A worker
    // belongs to the department when any of (a) the user is a member,
    // (b) the project is owned by the department, (c) the machine is
    // assigned to the department.
    let workerCount = 0;
    const workers = Array.isArray(c.workers) ? c.workers : [];
    for (const w of workers) {
      if (!w || typeof w !== 'object') continue;
      const active = !(w.status === 'closed' || w.status === 'done' || w.status === 'exited');
      if (!active) continue;
      const byUser = memberSet.has(w.user);
      const byProject = projectSet.has(w.project);
      const byMachine = machineSet.has(w.machine);
      if (byUser || byProject || byMachine) workerCount += 1;
    }

    const q = dept.quotas || normalizeQuotas({});
    const pct = (used, limit) => (limit > 0 ? Math.round((used / limit) * 10000) / 10000 : 0);
    return {
      deptId,
      quotas: q,
      usage: {
        workers: workerCount,
        costUSD: Math.round(costUSD * 10000) / 10000,
        tokens,
      },
      percent: {
        workers: pct(workerCount, q.maxWorkers),
        costUSD: pct(costUSD, q.monthlyBudgetUSD),
        tokens: pct(tokens, q.tokenLimit),
      },
      exceeded: {
        workers: q.maxWorkers > 0 && workerCount > q.maxWorkers,
        costUSD: q.monthlyBudgetUSD > 0 && costUSD > q.monthlyBudgetUSD,
        tokens: q.tokenLimit > 0 && tokens > q.tokenLimit,
      },
      period: { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 },
    };
  }
}

// Daemon-wide shared instance so `c4 org ...` mutations are visible on
// the next request without a restart. Tests construct their own
// OrgManager with a tmpdir path and never touch the shared one.
let _shared = null;
function getShared(opts) {
  if (!_shared) _shared = new OrgManager(opts);
  return _shared;
}
function resetShared() {
  _shared = null;
}

module.exports = {
  OrgManager,
  ID_PATTERN,
  MEMBER_ROLES,
  defaultOrgPath,
  freshState,
  ensureShape,
  normalizeDept,
  normalizeTeam,
  normalizeQuotas,
  isId,
  isUsername,
  getShared,
  resetShared,
};
