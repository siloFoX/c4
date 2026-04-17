'use strict';

// (10.1) Role-Based Access Control (RBAC).
//
// Manages users, roles, and per-resource grants on top of the existing
// session auth (8.14 + JWT). Storage is a single JSON file at
// ~/.c4/rbac.json; daemon and CLI use a shared instance via getShared()
// so live edits via `c4 rbac` show up on the next request without a
// restart. Tests construct their own RoleManager pointed at a tmpdir
// and never touch the operator's real file.
//
// Design notes
// ------------
// 1. Three built-in roles (admin / manager / viewer) are defined by a
//    fixed action matrix in DEFAULT_PERMISSIONS. The manager can also
//    extend a role's permission set on disk, but admin always has '*'
//    (wildcard) and viewer is always read-only at the daemon layer.
// 2. checkPermission(username, action, resource?) is the single decision
//    point. It returns true only when (a) the user exists, (b) the role
//    grants the action (or '*'), and (c) the resource (project /
//    machine) is reachable for that user. Resource scoping is opt-in:
//    a resource without a registered ACL is treated as public to all
//    role-permitted users — that mirrors how the daemon worked before
//    RBAC, so flipping RBAC on does not retroactively lock everyone out
//    of unscoped resources.
// 3. Project / machine grants live under resources.projects and
//    resources.machines. For each resource we track allowedRoles
//    (broad role-level access) and allowedUsers (per-user override).
//    That lets `manager` see all projects by default while still letting
//    an admin restrict a sensitive project to a named user list.
// 4. ACTIONS is the canonical action enum. Daemon middleware should
//    prefer the constants over string literals so a typo at the call
//    site fails fast instead of silently denying the request.

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROLES = Object.freeze(['admin', 'manager', 'viewer']);

// Canonical action names. `worker.*` covers worker lifecycle, `project.*`
// covers project storage (10.8), `fleet.*` covers fleet machines (9.6),
// `config.reload` is the runtime config swap, `auth.user.create` is the
// user provisioning surface, and `audit.read` gates the audit trail.
const ACTIONS = Object.freeze({
  WORKER_CREATE: 'worker.create',
  WORKER_CLOSE: 'worker.close',
  WORKER_TASK: 'worker.task',
  WORKER_MERGE: 'worker.merge',
  PROJECT_CREATE: 'project.create',
  PROJECT_READ: 'project.read',
  PROJECT_UPDATE: 'project.update',
  FLEET_ADD: 'fleet.add',
  FLEET_REMOVE: 'fleet.remove',
  CONFIG_RELOAD: 'config.reload',
  AUTH_USER_CREATE: 'auth.user.create',
  AUDIT_READ: 'audit.read',
  CICD_READ: 'cicd.read',
  CICD_MANAGE: 'cicd.manage',
  ORG_READ: 'org.read',
  ORG_MANAGE: 'org.manage',
});

const ALL_ACTIONS = Object.freeze(Object.values(ACTIONS));

// Default role -> action matrix. admin gets the wildcard so future
// actions are auto-granted; manager and viewer get explicit lists so
// new actions land in a denied-by-default state until reviewed.
const DEFAULT_PERMISSIONS = Object.freeze({
  admin: ['*'],
  manager: Object.freeze([
    'worker.create',
    'worker.close',
    'worker.task',
    'worker.merge',
    'project.create',
    'project.read',
    'project.update',
    'fleet.add',
    'config.reload',
    'audit.read',
    'cicd.read',
    'cicd.manage',
    'org.read',
    'org.manage',
  ]),
  viewer: Object.freeze([
    'project.read',
    'audit.read',
    'cicd.read',
    'org.read',
  ]),
});

function defaultRbacPath() {
  return path.join(os.homedir(), '.c4', 'rbac.json');
}

function isRole(r) {
  return typeof r === 'string' && ROLES.includes(r);
}

function isAction(a) {
  return typeof a === 'string' && a.length > 0;
}

function isUsername(name) {
  return typeof name === 'string' && /^[A-Za-z0-9._-]+$/.test(name) && name.length > 0;
}

function freshState() {
  return {
    roles: {
      admin: DEFAULT_PERMISSIONS.admin.slice(),
      manager: DEFAULT_PERMISSIONS.manager.slice(),
      viewer: DEFAULT_PERMISSIONS.viewer.slice(),
    },
    users: {},
    resources: {
      projects: {},
      machines: {},
    },
  };
}

function ensureShape(state) {
  const s = (state && typeof state === 'object') ? state : {};
  const out = freshState();
  if (s.roles && typeof s.roles === 'object') {
    for (const r of ROLES) {
      if (Array.isArray(s.roles[r])) out.roles[r] = s.roles[r].slice();
    }
  }
  if (s.users && typeof s.users === 'object') {
    for (const [name, entry] of Object.entries(s.users)) {
      if (!isUsername(name) || !entry || typeof entry !== 'object') continue;
      out.users[name] = {
        role: isRole(entry.role) ? entry.role : 'viewer',
        projectIds: Array.isArray(entry.projectIds) ? entry.projectIds.slice() : [],
        machineAliases: Array.isArray(entry.machineAliases) ? entry.machineAliases.slice() : [],
      };
    }
  }
  if (s.resources && typeof s.resources === 'object') {
    if (s.resources.projects && typeof s.resources.projects === 'object') {
      for (const [pid, acl] of Object.entries(s.resources.projects)) {
        if (!pid || typeof pid !== 'string') continue;
        out.resources.projects[pid] = normalizeAcl(acl);
      }
    }
    if (s.resources.machines && typeof s.resources.machines === 'object') {
      for (const [alias, acl] of Object.entries(s.resources.machines)) {
        if (!alias || typeof alias !== 'string') continue;
        out.resources.machines[alias] = normalizeAcl(acl);
      }
    }
  }
  return out;
}

function normalizeAcl(acl) {
  const a = (acl && typeof acl === 'object') ? acl : {};
  return {
    allowedRoles: Array.isArray(a.allowedRoles) ? a.allowedRoles.filter(isRole) : [],
    allowedUsers: Array.isArray(a.allowedUsers) ? a.allowedUsers.filter(isUsername) : [],
  };
}

class RoleManager {
  constructor(opts = {}) {
    this.storePath = (opts && opts.storePath) || defaultRbacPath();
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
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.storePath, JSON.stringify(this._state, null, 2) + '\n');
  }

  reload() {
    this._state = null;
    return this._load();
  }

  // ---- Users + roles --------------------------------------------------

  assignRole(username, role) {
    if (!isUsername(username)) throw new Error('Invalid username');
    if (!isRole(role)) throw new Error('Invalid role: ' + role);
    const state = this._load();
    const existing = state.users[username] || { projectIds: [], machineAliases: [] };
    state.users[username] = {
      role,
      projectIds: Array.isArray(existing.projectIds) ? existing.projectIds.slice() : [],
      machineAliases: Array.isArray(existing.machineAliases) ? existing.machineAliases.slice() : [],
    };
    this._persist();
    return state.users[username];
  }

  removeUser(username) {
    if (!isUsername(username)) return false;
    const state = this._load();
    if (!state.users[username]) return false;
    delete state.users[username];
    this._persist();
    return true;
  }

  getUser(username) {
    const state = this._load();
    return state.users[username] || null;
  }

  listUsers() {
    const state = this._load();
    return Object.keys(state.users).map((name) => ({ username: name, ...state.users[name] }));
  }

  listUsersByRole(role) {
    if (!isRole(role)) return [];
    return this.listUsers().filter((u) => u.role === role);
  }

  listRoles() {
    const state = this._load();
    return ROLES.map((r) => ({ role: r, actions: (state.roles[r] || []).slice() }));
  }

  // ---- Resource grants ------------------------------------------------

  _ensureResource(kind, key) {
    const state = this._load();
    const bucket = kind === 'project' ? state.resources.projects : state.resources.machines;
    if (!bucket[key]) bucket[key] = { allowedRoles: [], allowedUsers: [] };
    return bucket[key];
  }

  grantProjectAccess(username, projectId) {
    if (!isUsername(username)) throw new Error('Invalid username');
    if (!projectId || typeof projectId !== 'string') throw new Error('Invalid projectId');
    const state = this._load();
    const user = state.users[username];
    if (!user) throw new Error('Unknown user: ' + username);
    if (!user.projectIds.includes(projectId)) user.projectIds.push(projectId);
    const acl = this._ensureResource('project', projectId);
    if (!acl.allowedUsers.includes(username)) acl.allowedUsers.push(username);
    this._persist();
    return { username, projectId, projectIds: user.projectIds.slice() };
  }

  revokeProjectAccess(username, projectId) {
    if (!isUsername(username)) return false;
    const state = this._load();
    const user = state.users[username];
    if (!user) return false;
    const before = user.projectIds.length;
    user.projectIds = user.projectIds.filter((p) => p !== projectId);
    const acl = state.resources.projects[projectId];
    if (acl) {
      acl.allowedUsers = acl.allowedUsers.filter((u) => u !== username);
    }
    if (user.projectIds.length === before && (!acl || !acl.allowedUsers)) return false;
    this._persist();
    return true;
  }

  grantMachineAccess(username, alias) {
    if (!isUsername(username)) throw new Error('Invalid username');
    if (!alias || typeof alias !== 'string') throw new Error('Invalid alias');
    const state = this._load();
    const user = state.users[username];
    if (!user) throw new Error('Unknown user: ' + username);
    if (!user.machineAliases.includes(alias)) user.machineAliases.push(alias);
    const acl = this._ensureResource('machine', alias);
    if (!acl.allowedUsers.includes(username)) acl.allowedUsers.push(username);
    this._persist();
    return { username, alias, machineAliases: user.machineAliases.slice() };
  }

  revokeMachineAccess(username, alias) {
    if (!isUsername(username)) return false;
    const state = this._load();
    const user = state.users[username];
    if (!user) return false;
    const before = user.machineAliases.length;
    user.machineAliases = user.machineAliases.filter((a) => a !== alias);
    const acl = state.resources.machines[alias];
    if (acl) {
      acl.allowedUsers = acl.allowedUsers.filter((u) => u !== username);
    }
    if (user.machineAliases.length === before && (!acl || !acl.allowedUsers)) return false;
    this._persist();
    return true;
  }

  setResourceAcl(kind, key, acl) {
    if (kind !== 'project' && kind !== 'machine') throw new Error('Invalid kind: ' + kind);
    if (!key || typeof key !== 'string') throw new Error('Invalid key');
    const target = this._ensureResource(kind, key);
    const next = normalizeAcl(acl);
    target.allowedRoles = next.allowedRoles;
    target.allowedUsers = next.allowedUsers;
    this._persist();
    return target;
  }

  // ---- Permission decision -------------------------------------------

  // checkPermission(username, action, resource?)
  // resource shape: { type: 'project'|'machine', id: '<projectId|alias>' }
  // Returns true when the user exists, the role allows the action, and
  // (when resource is provided) the user can reach that resource.
  checkPermission(username, action, resource) {
    if (!isAction(action)) return false;
    if (!isUsername(username)) return false;
    const state = this._load();
    const user = state.users[username];
    if (!user) return false;
    const roleActions = state.roles[user.role] || [];
    const hasAction = roleActions.includes('*') || roleActions.includes(action);
    if (!hasAction) return false;

    if (!resource || typeof resource !== 'object') return true;
    const type = resource.type;
    const id = resource.id;
    if (type !== 'project' && type !== 'machine') return true;
    if (!id || typeof id !== 'string') return true;

    // admin role bypasses resource scoping. Convenient for tooling that
    // operates across projects (audit log queries, fleet overview, etc.)
    // and matches the "admin = full access" guarantee in the spec.
    if (user.role === 'admin') return true;

    const bucket = type === 'project' ? state.resources.projects : state.resources.machines;
    const acl = bucket[id];
    // No ACL = unscoped resource. Role check above is the only gate, so
    // existing daemons that have not registered any ACLs keep working.
    if (!acl) return true;
    if (Array.isArray(acl.allowedRoles) && acl.allowedRoles.includes(user.role)) return true;
    if (Array.isArray(acl.allowedUsers) && acl.allowedUsers.includes(username)) return true;
    return false;
  }
}

// Daemon-wide shared instance. Tests construct their own RoleManager
// with a tmpdir path and never touch the shared one.
let _shared = null;
function getShared(opts) {
  if (!_shared) _shared = new RoleManager(opts);
  return _shared;
}
function resetShared() {
  _shared = null;
}

module.exports = {
  RoleManager,
  ROLES,
  ACTIONS,
  ALL_ACTIONS,
  DEFAULT_PERMISSIONS,
  defaultRbacPath,
  freshState,
  ensureShape,
  normalizeAcl,
  isRole,
  isAction,
  isUsername,
  getShared,
  resetShared,
};
