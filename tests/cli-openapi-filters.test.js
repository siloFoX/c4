'use strict';

// Verifies the v1.10.40+ filter flags on `c4 openapi`:
//   --rbac <regex>, --untyped, --role <name>
// Spawns the CLI as a subprocess and parses the listing output.
// Doesn't depend on a running daemon — `c4 openapi --json` would,
// but we go through the in-process buildSpec instead via a shim.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildSpec } = require('../src/openapi-gen');
const rbac = require('../src/rbac');

// Simulate the CLI's role-filter resolution. Mirrors the logic in
// src/cli.js so the test stays close to what users see.
function _resolveRoleAllowedKeys(roleName) {
  const roleVals = rbac.DEFAULT_PERMISSIONS[roleName];
  if (!roleVals) return null;
  const isWildcard = Array.isArray(roleVals) && roleVals.includes('*');
  if (isWildcard) return new Set(Object.keys(rbac.ACTIONS));
  const keys = new Set();
  for (const [key, val] of Object.entries(rbac.ACTIONS)) {
    if (roleVals.includes(val)) keys.add(key);
  }
  return keys;
}

function _filterByRole(spec, roleName) {
  const allowed = _resolveRoleAllowedKeys(roleName);
  if (!allowed) return null;
  const out = [];
  for (const ops of Object.values(spec.paths)) {
    for (const op of Object.values(ops)) {
      if (typeof op !== 'object') continue;
      const rbacAction = op['x-rbac-action'] || null;
      if (rbacAction && !allowed.has(rbacAction)) continue;
      out.push(op);
    }
  }
  return out;
}

function _filterByRbac(spec, regex) {
  const re = new RegExp(regex);
  const out = [];
  for (const ops of Object.values(spec.paths)) {
    for (const op of Object.values(ops)) {
      if (typeof op !== 'object') continue;
      const rbacAction = op['x-rbac-action'];
      if (!rbacAction || !re.test(rbacAction)) continue;
      out.push(op);
    }
  }
  return out;
}

function _filterUntyped(spec) {
  const out = [];
  for (const ops of Object.values(spec.paths)) {
    for (const op of Object.values(ops)) {
      if (typeof op !== 'object') continue;
      if (op['x-rbac-action']) continue;
      out.push(op);
    }
  }
  return out;
}

describe('c4 openapi --role filter', () => {
  const spec = buildSpec();

  it('--role admin sees every operation (wildcard ACL)', () => {
    const filtered = _filterByRole(spec, 'admin');
    assert.ok(filtered, 'admin should resolve');
    let total = 0;
    for (const ops of Object.values(spec.paths)) {
      for (const op of Object.values(ops)) {
        if (typeof op === 'object' && op.responses) total++;
      }
    }
    assert.equal(filtered.length, total, 'admin = full surface');
  });

  it('--role viewer is strictly fewer than admin (read-only + open)', () => {
    const admin = _filterByRole(spec, 'admin');
    const viewer = _filterByRole(spec, 'viewer');
    assert.ok(viewer.length < admin.length, `viewer should < admin (got ${viewer.length} vs ${admin.length})`);
    assert.ok(viewer.length >= 50, `viewer should still see plenty of read-only routes (got ${viewer.length})`);
  });

  it('--role manager is between viewer and admin', () => {
    const admin = _filterByRole(spec, 'admin');
    const manager = _filterByRole(spec, 'manager');
    const viewer = _filterByRole(spec, 'viewer');
    assert.ok(manager.length > viewer.length, 'manager > viewer');
    assert.ok(manager.length <= admin.length, 'manager <= admin');
  });

  it('--role bogus returns null (rejected by CLI)', () => {
    assert.equal(_filterByRole(spec, 'bogus'), null);
  });

  it('--role viewer always includes /health and /openapi.json', () => {
    const viewer = _filterByRole(spec, 'viewer');
    const ids = viewer.map((op) => op.operationId);
    assert.ok(ids.includes('getHealth'), 'viewer should see /health');
    assert.ok(ids.includes('getOpenapiJson'), 'viewer should see /openapi.json (open route)');
  });
});

describe('c4 openapi --rbac filter', () => {
  const spec = buildSpec();

  it('--rbac WORKER catches all worker.* gated routes', () => {
    const filtered = _filterByRbac(spec, 'WORKER');
    assert.ok(filtered.length >= 4, `expected ≥4 worker.* routes, got ${filtered.length}`);
    for (const op of filtered) {
      assert.match(op['x-rbac-action'], /WORKER/);
    }
  });

  it('--rbac AUDIT catches AUDIT_READ-gated routes', () => {
    const filtered = _filterByRbac(spec, 'AUDIT');
    assert.ok(filtered.length >= 2, `expected ≥2 audit routes, got ${filtered.length}`);
  });

  it('--rbac NOMATCH returns empty', () => {
    const filtered = _filterByRbac(spec, 'NOMATCH_XYZ');
    assert.equal(filtered.length, 0);
  });
});

describe('c4 openapi --untyped filter', () => {
  const spec = buildSpec();

  it('lists only routes without x-rbac-action', () => {
    const filtered = _filterUntyped(spec);
    for (const op of filtered) {
      assert.equal(op['x-rbac-action'], undefined);
    }
  });

  it('untyped + rbac-typed = total operations', () => {
    let total = 0, typed = 0;
    for (const ops of Object.values(spec.paths)) {
      for (const op of Object.values(ops)) {
        if (typeof op !== 'object' || !op.responses) continue;
        total++;
        if (op['x-rbac-action']) typed++;
      }
    }
    const untyped = _filterUntyped(spec);
    assert.equal(untyped.length + typed, total);
  });
});
