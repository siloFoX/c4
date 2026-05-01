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

  it('flags ssh target without host', () => {
    const r = validate({ targets: { dgx: { type: 'ssh' } } });
    assert.ok(r.errors.find((e) => e.path === 'targets.dgx.host'));
  });

  it('flags unknown target type', () => {
    const r = validate({ targets: { x: { type: 'magic' } } });
    assert.ok(r.errors.find((e) => e.path === 'targets.x.type'));
  });

  it('warns on fleet peer without host/url', () => {
    const r = validate({ fleet: { peers: { dgx: { port: 3456 } } } });
    assert.ok(r.warnings.find((w) => w.path === 'fleet.peers.dgx'));
  });

  it('flags fleet peer with bad port', () => {
    const r = validate({ fleet: { peers: { dgx: { host: '1.2.3.4', port: 70000 } } } });
    assert.ok(r.errors.find((e) => e.path === 'fleet.peers.dgx.port'));
  });
});

// (review fix 2026-05-01) CLI integration — the `c4 config
// validate` subcommand reads a config file, runs the validator,
// prints the report, and exits with 1 on errors. Source-grep
// asserts the wireup contract because spawning the full CLI
// in-process is heavyweight.
describe('c4 config validate CLI wireup', () => {
  const fs = require('fs');
  const path = require('path');
  const cliSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'cli.js'),
    'utf8',
  );

  it('handles the validate subcommand alongside reload', () => {
    assert.match(cliSrc, /args\[0\] === 'validate'/);
  });

  it('defaults to <repo>/config.json when no path supplied', () => {
    assert.match(cliSrc, /args\[1\] \|\| path\.resolve\(__dirname, '\.\.', 'config\.json'\)/);
  });

  it('exits 1 on missing file or invalid JSON', () => {
    assert.match(cliSrc, /config not found:/);
    assert.match(cliSrc, /config is not valid JSON:/);
    assert.match(cliSrc, /process\.exit\(1\)/);
  });

  it('runs the validator + printReport and exits with the report status', () => {
    assert.match(cliSrc, /const \{ validate, printReport \} = require\('\.\/config-validate'\)/);
    assert.match(cliSrc, /const ok = printReport\(report\)/);
    assert.match(cliSrc, /process\.exit\(ok \? 0 : 1\)/);
  });

  it('uses the top-level fs / path imports (no inline require)', () => {
    // Locate the validate-block region. Block runs from
    // `args[0] === 'validate'` through `process.exit(ok ? 0 : 1)`.
    const validateIdx = cliSrc.indexOf("args[0] === 'validate'");
    assert.notStrictEqual(validateIdx, -1);
    const exitIdx = cliSrc.indexOf('process.exit(ok ? 0 : 1)', validateIdx);
    assert.notStrictEqual(exitIdx, -1);
    const block = cliSrc.slice(validateIdx, exitIdx + 30);
    assert.doesNotMatch(block, /require\('fs'\)/);
    assert.doesNotMatch(block, /require\('path'\)/);
  });

  it('help text lists `config validate`', () => {
    assert.match(cliSrc, /config validate \[path\]\s+Validate/);
  });
});
