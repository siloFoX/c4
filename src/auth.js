// 10.1 RBAC. HMAC-signed compact JSON tokens (no external deps), per-user
// roles, route-level role gates. Designed to be off by default
// (`config.auth.enabled` defaults false) so existing local-only deployments
// keep working unchanged.
//
// Token format:
//   base64url(JSON.stringify({ sub, role, iat, exp })).hmac-sha256(secret)
//   --> "<header.body>.<sig>"
//
// Roles, in increasing privilege:
//   viewer  : can read state (GET *)
//   manager : viewer + mutate workers (create/task/send/key/approve/...)
//   admin   : manager + destructive (close/rollback/cleanup/restart/batch)
//             + audit / scheduler / fleet write-through
//
// Routes whose role > the bearer's are 403. Missing/invalid tokens on a
// guarded route are 401.

'use strict';

const crypto = require('crypto');

const ROLE_ORDER = ['viewer', 'manager', 'admin'];

const ROUTE_ROLES = {
  // GETs default to viewer; POSTs default to manager; admin-only routes
  // listed explicitly here override that default.
  GET_DEFAULT: 'viewer',
  POST_DEFAULT: 'manager',

  // Admin-only routes
  '/close':           'admin',
  '/rollback':        'admin',
  '/restart':         'admin',
  '/cleanup':         'admin',
  '/batch-action':    'admin',
  '/merge':           'admin',
  '/fleet/create':    'admin',
  '/fleet/task':      'admin',
  '/fleet/close':     'admin',
  '/fleet/send':      'admin',
  '/fleet/transfer':  'admin',
  '/scheduler/start': 'admin',
  '/scheduler/stop':  'admin',
  '/schedule':        'admin',
  '/schedule/remove': 'admin',
  '/schedule/enable': 'admin',
  '/schedule/run':    'admin',
  '/audit':           'admin',
  '/audit/export':    'admin',
  '/config/reload':   'admin',
  '/backup':          'admin',
  '/restore':         'admin',
  '/workflow/template':         'admin',
  '/workflow/template/delete':  'admin',
};

function _b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function _b64urlDecode(str) {
  let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

class Auth {
  constructor(config = {}) {
    this.applyConfig(config);
  }

  // (TODO Auth bootstrap check) Re-apply config — called from Auth() init
  // and from PtyManager.reloadConfig() when config.json is hot-reloaded.
  // - Generates an ephemeral secret only when auth is disabled OR explicitly
  //   missing. When enabled+missing, we surface a stderr warning so an
  //   operator notices that bouncing the daemon will invalidate every
  //   already-issued token.
  // - Empty users + enabled is also flagged (everyone gets 401).
  applyConfig(config = {}) {
    const cfg = (config && config.auth) || {};
    this.enabled = !!cfg.enabled;
    this.users = cfg.users || {};
    const provided = typeof cfg.secret === 'string' && cfg.secret.length >= 16;
    if (provided) {
      this.secret = cfg.secret;
      this._secretEphemeral = false;
    } else {
      // Reuse existing ephemeral secret across reloads so live tokens
      // survive a `c4 config reload` even if config.json doesn't gain a
      // proper secret. Re-randomize on first construction only.
      if (!this.secret) this.secret = crypto.randomBytes(32).toString('hex');
      this._secretEphemeral = true;
      if (this.enabled) {
        // eslint-disable-next-line no-console
        console.error(
          '[C4 AUTH WARN] config.auth.enabled=true but config.auth.secret is missing or too short (<16 chars). ' +
          'Using an ephemeral secret — restarting the daemon will invalidate every active token. ' +
          'Set a stable hex/random string in config.auth.secret for production.'
        );
      }
    }
    this.tokenTtlMs = (typeof cfg.tokenTtlMs === 'number' && cfg.tokenTtlMs > 0)
      ? cfg.tokenTtlMs
      : 24 * 60 * 60 * 1000;

    if (this.enabled && Object.keys(this.users).length === 0) {
      // eslint-disable-next-line no-console
      console.error('[C4 AUTH WARN] config.auth.enabled=true with empty users{}. All authenticated routes will return 401.');
    }
  }

  // Public probe used by /auth/whoami callers + tests.
  status() {
    return {
      enabled: this.enabled,
      users: Object.keys(this.users),
      secretEphemeral: !!this._secretEphemeral,
      tokenTtlMs: this.tokenTtlMs,
    };
  }

  // ---- token issuance ----
  issueToken(username, password) {
    const user = this.users[username];
    if (!user) return { error: 'invalid credentials' };
    // Plain password match for now; real deployments should swap to a
    // hashed scheme — this scaffolding is enough to gate Web UI access.
    if (user.password !== password) return { error: 'invalid credentials' };
    const role = user.role || 'viewer';
    const now = Date.now();
    const payload = { sub: username, role, iat: now, exp: now + this.tokenTtlMs };
    const body = _b64urlEncode(JSON.stringify(payload));
    const sig = _b64urlEncode(crypto.createHmac('sha256', this.secret).update(body).digest());
    return { token: `${body}.${sig}`, role, exp: payload.exp };
  }

  verifyToken(token) {
    if (!token || typeof token !== 'string') return null;
    const dot = token.lastIndexOf('.');
    if (dot < 0) return null;
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = _b64urlEncode(crypto.createHmac('sha256', this.secret).update(body).digest());
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    let payload;
    try { payload = JSON.parse(_b64urlDecode(body).toString('utf8')); }
    catch { return null; }
    if (!payload || typeof payload !== 'object') return null;
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  }

  // ---- route gating ----
  requiredRole(method, route) {
    if (ROUTE_ROLES[route]) return ROUTE_ROLES[route];
    if (method === 'GET') return ROUTE_ROLES.GET_DEFAULT;
    return ROUTE_ROLES.POST_DEFAULT;
  }

  hasRole(actualRole, requiredRole) {
    return ROLE_ORDER.indexOf(actualRole) >= ROLE_ORDER.indexOf(requiredRole);
  }

  // Returns:
  //   { ok: true, payload }       — authorised
  //   { ok: false, status, error } — reject this request
  authorize(req, route) {
    if (!this.enabled) return { ok: true, payload: { sub: 'anonymous', role: 'admin' } };

    // Allow login + health + openapi without auth (public discovery surface).
    if (route === '/auth/login' || route === '/health' || route === '/openapi.json') return { ok: true, payload: null };

    const header = req.headers && (req.headers.authorization || req.headers.Authorization);
    if (!header || !/^Bearer\s+/i.test(header)) {
      return { ok: false, status: 401, error: 'auth: missing bearer token' };
    }
    const token = header.replace(/^Bearer\s+/i, '').trim();
    const payload = this.verifyToken(token);
    if (!payload) return { ok: false, status: 401, error: 'auth: invalid or expired token' };

    const need = this.requiredRole(req.method, route);
    if (!this.hasRole(payload.role, need)) {
      return { ok: false, status: 403, error: `auth: role '${payload.role}' insufficient (needs '${need}')` };
    }
    return { ok: true, payload };
  }

  // Project-scoped RBAC. When a user has `projects: [...]` in their config
  // record, mutating routes that target a worker outside that allow-list
  // are rejected. Admins are exempt. The mapping is best-effort: we look
  // up the worker's resolved project via PtyManager.
  //
  //   user: { password, role: 'manager', projects: ['arps', 'datalake'] }
  //
  // The daemon calls this AFTER authorize() has accepted the bearer.
  // Returns { ok: true } / { ok: false, status, error }.
  enforceProjectScope(payload, manager, body) {
    if (!this.enabled || !payload) return { ok: true };
    if (payload.role === 'admin') return { ok: true };
    const user = this.users[payload.sub];
    if (!user || !Array.isArray(user.projects) || user.projects.length === 0) return { ok: true };
    if (!manager || typeof manager._resolveWorkerProject !== 'function') return { ok: true };
    const workerName = body && (body.name || body.worker);
    if (!workerName) return { ok: true };
    const w = manager.workers && manager.workers.get && manager.workers.get(workerName);
    if (!w) return { ok: true }; // worker does not exist yet (POST /create); skip
    const project = manager._resolveWorkerProject(w);
    if (user.projects.includes(project)) return { ok: true };
    return {
      ok: false,
      status: 403,
      error: `auth: user '${payload.sub}' is scoped to projects [${user.projects.join(', ')}] but worker '${workerName}' belongs to '${project}'`,
    };
  }
}

module.exports = { Auth, ROLE_ORDER, ROUTE_ROLES };
