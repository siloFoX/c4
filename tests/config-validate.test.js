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

  // (v1.10.43) openapi.* validation. Catches typos before they
  // silently no-op — `validateRequsts: true` would never enforce
  // anything because the daemon checks `validateRequests` (correct
  // spelling). The validator now flags the typo as an unknown key.

  it('clean openapi block passes', () => {
    const r = validate({
      openapi: { validateRequests: true, validateResponses: false },
    });
    assert.strictEqual(r.errors.length, 0);
    assert.strictEqual(r.warnings.length, 0);
  });

  it('flags non-boolean openapi.validateRequests', () => {
    const r = validate({ openapi: { validateRequests: 'yes' } });
    assert.ok(r.errors.find((e) => e.path === 'openapi.validateRequests'));
  });

  it('warns on unknown openapi keys (likely typo)', () => {
    const r = validate({ openapi: { validateRequsts: true } });
    assert.ok(r.warnings.find((w) => w.path === 'openapi.validateRequsts'),
      'expected typo to be flagged');
  });

  it('allows _doc-suffix sibling annotations from config.example.json', () => {
    const r = validate({
      openapi: {
        _validateResponses_doc: 'When true, …',
        validateResponses: false,
      },
    });
    assert.strictEqual(r.errors.length, 0);
    assert.strictEqual(r.warnings.length, 0);
  });

  // (v1.10.49+50) riskClassifier validation. Catches level typos,
  // bad regex sources, and malformed customRules.

  it('clean riskClassifier block passes', () => {
    const r = validate({
      riskClassifier: {
        enabled: true,
        autoDenyLevel: 'high',
        notifySlack: false,
      },
    });
    assert.strictEqual(r.errors.length, 0);
    assert.strictEqual(r.warnings.length, 0);
  });

  it('flags invalid autoDenyLevel', () => {
    const r = validate({ riskClassifier: { autoDenyLevel: 'CRITICAL' } });
    assert.ok(r.errors.find((e) => e.path === 'riskClassifier.autoDenyLevel'));
  });

  it('flags non-array allowList', () => {
    const r = validate({ riskClassifier: { allowList: 'rm -rf /' } });
    assert.ok(r.errors.find((e) => e.path === 'riskClassifier.allowList'));
  });

  it('flags invalid regex in allowList entries', () => {
    const r = validate({ riskClassifier: { allowList: ['[unterminated'] } });
    assert.ok(r.errors.find((e) => e.path === 'riskClassifier.allowList[0]'));
  });

  it('accepts valid regex strings + {pattern, flags} in allowList', () => {
    const r = validate({
      riskClassifier: {
        allowList: ['^rm -rf /tmp', { pattern: '^sudo apt', flags: 'i' }],
      },
    });
    assert.strictEqual(r.errors.length, 0);
  });

  it('flags malformed customRules entries (missing code/label/pattern)', () => {
    const r = validate({
      riskClassifier: {
        customRules: {
          critical: [
            { label: 'no code', pattern: 'x' },
            { code: 'no-label', pattern: 'x' },
            { code: 'no-pattern', label: 'missing' },
          ],
        },
      },
    });
    const codes = r.errors.map((e) => e.path);
    assert.ok(codes.some((p) => /code/.test(p)));
    assert.ok(codes.some((p) => /label/.test(p)));
    assert.ok(codes.some((p) => /pattern/.test(p)));
  });

  it('warns on unknown customRules tier', () => {
    const r = validate({
      riskClassifier: {
        customRules: {
          extreme: [{ code: 'x', label: 'x', pattern: 'x' }],
        },
      },
    });
    assert.ok(r.warnings.find((w) => w.path === 'riskClassifier.customRules.extreme'));
  });

  it('flags unknown riskClassifier sibling keys (typo guard)', () => {
    const r = validate({ riskClassifier: { autoDenialLevel: 'critical' } });
    assert.ok(r.warnings.find((w) => w.path === 'riskClassifier.autoDenialLevel'));
  });

  // (v1.10.80) sandbox config wiring — the new sandbox key feeds the
  // SandboxRuntime factory.
  describe('riskClassifier.sandbox', () => {
    it('clean sandbox=null block passes', () => {
      const r = validate({ riskClassifier: { sandbox: { name: 'null' } } });
      assert.equal(r.errors.length, 0);
    });

    it('clean sandbox=docker block passes (with opts)', () => {
      const r = validate({
        riskClassifier: {
          sandbox: { name: 'docker', opts: { memory: '256m' } },
        },
      });
      // Docker may probe-fail if not on PATH; that's a warning not an
      // error. But there must be NO errors.
      assert.equal(r.errors.length, 0);
    });

    it('non-object sandbox value rejected', () => {
      const r = validate({ riskClassifier: { sandbox: 'docker' } });
      assert.ok(r.errors.find((e) => e.path === 'riskClassifier.sandbox'));
    });

    it('unknown sandbox name rejected', () => {
      const r = validate({ riskClassifier: { sandbox: { name: 'firejail' } } });
      assert.ok(r.errors.find((e) => e.path === 'riskClassifier.sandbox.name'));
    });

    it('non-object sandbox.opts rejected', () => {
      const r = validate({
        riskClassifier: { sandbox: { name: 'docker', opts: 'tight' } },
      });
      assert.ok(r.errors.find((e) => e.path === 'riskClassifier.sandbox.opts'));
    });

    it('docker probe failure surfaces as warning (not error)', () => {
      const r = validate({
        riskClassifier: {
          sandbox: { name: 'docker', opts: { dockerBinary: '/no/such/docker' } },
        },
      });
      assert.equal(r.errors.length, 0);
      const w = r.warnings.find((w) => w.path === 'riskClassifier.sandbox');
      assert.ok(w, 'expected docker-probe warning');
      assert.match(w.message, /probe failed/);
    });
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
