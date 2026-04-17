'use strict';

// Session auth for the daemon + Web UI (TODO 8.14).
//
// Responsibilities:
//   - hash + verify user passwords with bcryptjs
//   - sign + verify short-lived JWTs (default 24h) with HS256
//   - produce an HTTP middleware that protects /api/* routes when
//     config.auth.enabled is true, while always allowing the login
//     endpoint, health checks, and non-API static assets
//
// Keeping the logic in a standalone module lets tests exercise each
// piece without booting the daemon, and lets c4 init reuse hashPassword
// and generateSecret for first-run provisioning.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const DEFAULT_EXPIRES_IN = '24h';
const DEFAULT_BCRYPT_ROUNDS = 10;

// Routes the middleware must let through even when auth is enabled.
// The login endpoint is needed to obtain a token in the first place,
// and the health check stays public for daemon probes.
const OPEN_API_ROUTES = new Set([
  '/auth/login',
  '/health',
]);

function generateSecret() {
  return crypto.randomBytes(48).toString('hex');
}

function hashPassword(plain, rounds = DEFAULT_BCRYPT_ROUNDS) {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('password must be a non-empty string');
  }
  return bcrypt.hashSync(plain, rounds);
}

function verifyPassword(plain, hash) {
  if (typeof plain !== 'string' || typeof hash !== 'string' || !hash) return false;
  try {
    return bcrypt.compareSync(plain, hash);
  } catch {
    return false;
  }
}

function signToken(payload, secret, opts = {}) {
  if (!secret || typeof secret !== 'string') {
    throw new Error('auth secret is required to sign tokens');
  }
  const expiresIn = opts.expiresIn || DEFAULT_EXPIRES_IN;
  return jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn });
}

function verifyToken(token, secret) {
  if (!token || !secret) return { valid: false, error: 'missing-token-or-secret' };
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    return { valid: true, decoded };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

function extractBearerToken(req) {
  const header = req && req.headers && (req.headers.authorization || req.headers.Authorization);
  if (header && typeof header === 'string') {
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1].trim();
  }
  // EventSource cannot set custom headers, so SSE endpoints accept the
  // token via a ?token= query param as a fallback. Only honored when the
  // header is absent so header-based requests are not overridden.
  if (req && typeof req.url === 'string' && req.url.includes('token=')) {
    try {
      const parsed = new URL(req.url, 'http://_placeholder_');
      const q = parsed.searchParams.get('token');
      if (q) return q;
    } catch {}
  }
  return null;
}

function isAuthEnabled(cfg) {
  return Boolean(cfg && cfg.auth && cfg.auth.enabled === true);
}

function getAuthSecret(cfg) {
  return cfg && cfg.auth && typeof cfg.auth.secret === 'string' ? cfg.auth.secret : '';
}

function findUser(cfg, name) {
  if (!cfg || !cfg.auth || !cfg.auth.users || !name) return null;
  const user = cfg.auth.users[name];
  return user && typeof user === 'object' ? user : null;
}

// login(cfg, {user, password}, opts?) -> {ok, token?, role?, error?}
// opts.roleResolver(name) -> string|null lets the daemon inject a role
// from the RBAC store without auth.js needing a hard dependency on
// src/rbac.js. When the resolver returns null we fall back to whatever
// role is recorded directly on the user entry in config.auth.users[name],
// then to 'viewer' as the safest default.
function login(cfg, body, opts) {
  const name = body && typeof body.user === 'string' ? body.user : '';
  const password = body && typeof body.password === 'string' ? body.password : '';
  if (!name || !password) return { ok: false, error: 'missing user or password' };

  const user = findUser(cfg, name);
  if (!user || typeof user.passwordHash !== 'string') {
    return { ok: false, error: 'invalid credentials' };
  }
  if (!verifyPassword(password, user.passwordHash)) {
    return { ok: false, error: 'invalid credentials' };
  }

  const secret = getAuthSecret(cfg);
  if (!secret) return { ok: false, error: 'auth secret not configured' };

  const resolver = opts && typeof opts.roleResolver === 'function' ? opts.roleResolver : null;
  let role = null;
  if (resolver) {
    try { role = resolver(name); } catch { role = null; }
  }
  if (!role && typeof user.role === 'string') role = user.role;
  if (!role) role = 'viewer';

  const token = signToken({ sub: name, role }, secret);
  return { ok: true, token, user: name, role };
}

// checkRequest(cfg, req, route) -> {allow, status?, body?, decoded?}
// Used by the HTTP middleware to decide whether a request can proceed.
function checkRequest(cfg, req, route) {
  if (!isAuthEnabled(cfg)) return { allow: true };
  if (!route || typeof route !== 'string') return { allow: true };
  if (OPEN_API_ROUTES.has(route)) return { allow: true };

  const token = extractBearerToken(req);
  if (!token) {
    return {
      allow: false,
      status: 401,
      body: { error: 'Authentication required' },
    };
  }
  const secret = getAuthSecret(cfg);
  if (!secret) {
    return {
      allow: false,
      status: 500,
      body: { error: 'Auth secret not configured' },
    };
  }
  const verified = verifyToken(token, secret);
  if (!verified.valid) {
    return {
      allow: false,
      status: 401,
      body: { error: 'Invalid or expired token' },
    };
  }
  return { allow: true, decoded: verified.decoded };
}

module.exports = {
  DEFAULT_EXPIRES_IN,
  DEFAULT_BCRYPT_ROUNDS,
  OPEN_API_ROUTES,
  generateSecret,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  extractBearerToken,
  isAuthEnabled,
  getAuthSecret,
  findUser,
  login,
  checkRequest,
};
