// Config validator tests (TODO #113).

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');

const { validate } = require('../src/config-validate');

describe('config validate', () => {
  it('clean config produces no errors/warnings/info', () => {
    const r = validate({
      daemon: { port: 3456 },
      projects: { arps: { root: '/tmp' } },
      departments: { eng: { projects: ['arps'], workerQuota: 5, monthlyBudgetUSD: 100 } },
    });
    assert.strictEqual(r.errors.length, 0);
    assert.strictEqual(r.warnings.length, 0);
    // info may include path-doesn't-exist if /tmp is missing on the host
  });

  it('flags invalid daemon.port', () => {
    const r = validate({ daemon: { port: 70000 } });
    assert.ok(r.errors.find((e) => e.path === 'daemon.port'));
  });

  it('flags negative workerQuota', () => {
    const r = validate({ departments: { eng: { workerQuota: -1 } } });
    assert.ok(r.errors.find((e) => e.path === 'departments.eng.workerQuota'));
  });

  it('flags non-numeric monthlyBudgetUSD', () => {
    const r = validate({ departments: { eng: { monthlyBudgetUSD: 'oops' } } });
    assert.ok(r.errors.find((e) => e.path === 'departments.eng.monthlyBudgetUSD'));
  });

  it('warns on auth.enabled without secret', () => {
    const r = validate({ auth: { enabled: true } });
    assert.ok(r.warnings.find((w) => w.path === 'auth.secret'));
    assert.ok(r.warnings.find((w) => w.path === 'auth.users'));
  });

  it('warns on auth user with unknown role', () => {
    const r = validate({
      auth: {
        enabled: true,
        secret: 'x'.repeat(20),
        users: { alice: { password: 'p', role: 'overlord' } },
      },
    });
    assert.ok(r.errors.find((e) => e.path === 'auth.users.alice.role'));
  });

  it('warns when department references missing project', () => {
    const r = validate({
      projects: { arps: { root: '/tmp' } },
      departments: { eng: { projects: ['ghost'] } },
    });
    assert.ok(r.warnings.find((w) => w.path === 'departments.eng.projects' && /ghost/.test(w.message)));
  });

  it('warns on empty workspace path', () => {
    const r = validate({ workspaces: { a: '' } });
    assert.ok(r.warnings.find((w) => w.path === 'workspaces.a'));
  });

  it('warns when nl.llm.enabled but no API key', () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const r = validate({ nl: { llm: { enabled: true } } });
      assert.ok(r.warnings.find((w) => w.path === 'nl.llm.apiKey'));
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  it('warns when pm.todoSync without todoFile', () => {
    const r = validate({ pm: { todoSync: true } });
    assert.ok(r.warnings.find((w) => w.path === 'pm.todoSync'));
  });

  it('flags non-numeric audit.maxSizeBytes', () => {
    const r = validate({ audit: { maxSizeBytes: 'big' } });
    assert.ok(r.errors.find((e) => e.path === 'audit.maxSizeBytes'));
  });

  it('flags negative maxWorkers', () => {
    const r = validate({ maxWorkers: -1 });
    assert.ok(r.errors.find((e) => e.path === 'maxWorkers'));
  });
});
