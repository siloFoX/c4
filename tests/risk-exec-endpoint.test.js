'use strict';

// (v1.10.84) POST /api/risk/exec wireup tests.
//
// Same source-grep + unit pattern as risk-preview-endpoint:
// spawning the full daemon for a single endpoint is heavy and
// flaky on CI. The pieces this file locks in:
//   1. Daemon route handler exists with the gating shape we want
//      (refused unless allowExec=true; refused on NullRuntime;
//      scribe-v2 + audit mirrors).
//   2. OpenAPI ROUTE_SCHEMAS entry covers requestBody + response.
//   3. Config-validate accepts allowExec=boolean and warns on the
//      `allowExec=true + name='null'` combo.
//   4. scribe-v2 EVENT_TYPES carries 'risk_shadow_exec'.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const daemonSrc = fs.readFileSync(
  path.resolve(__dirname, '..', 'src', 'daemon.js'), 'utf8'
);
const openApiSrc = fs.readFileSync(
  path.resolve(__dirname, '..', 'src', 'openapi-gen.js'), 'utf8'
);
const { EVENT_TYPES } = require('../src/scribe-v2');
const { validate } = require('../src/config-validate');

describe('POST /risk/exec — daemon route wireup', () => {
  it('route handler exists in src/daemon.js', () => {
    assert.match(daemonSrc, /req\.method === 'POST' && route === '\/risk\/exec'/);
  });

  it('handler refuses when allowExec is not true', () => {
    const start = daemonSrc.indexOf("route === '/risk/exec'");
    const end = daemonSrc.indexOf("route === '/risk/preview'", start);
    const block = daemonSrc.slice(start, end);
    assert.match(block, /allowExec === true/);
    assert.match(block, /refused: true/);
    assert.match(block, /allowExec is not true/);
  });

  it('handler emits scribe-v2 risk_shadow_exec event', () => {
    const start = daemonSrc.indexOf("route === '/risk/exec'");
    const end = daemonSrc.indexOf("route === '/risk/preview'", start);
    const block = daemonSrc.slice(start, end);
    assert.match(block, /type: 'risk_shadow_exec'/);
    assert.match(block, /manager\._scribeV2/);
  });

  it('handler emits audit-chain risk.shadow_exec event', () => {
    const start = daemonSrc.indexOf("route === '/risk/exec'");
    const end = daemonSrc.indexOf("route === '/risk/preview'", start);
    const block = daemonSrc.slice(start, end);
    assert.match(block, /'risk\.shadow_exec'/);
    assert.match(block, /manager\._audit/);
  });

  it('audit emission includes stdoutHash + stderrHash (v1.10.86)', () => {
    const start = daemonSrc.indexOf("route === '/risk/exec'");
    const end = daemonSrc.indexOf("route === '/risk/preview'", start);
    const block = daemonSrc.slice(start, end);
    assert.match(block, /stdoutHash:\s*execResult\.stdoutHash/);
    assert.match(block, /stderrHash:\s*execResult\.stderrHash/);
  });

  it('handler catches BlockedByRuntimeError and surfaces refused:true', () => {
    const start = daemonSrc.indexOf("route === '/risk/exec'");
    const end = daemonSrc.indexOf("route === '/risk/preview'", start);
    const block = daemonSrc.slice(start, end);
    assert.match(block, /BlockedByRuntimeError/);
    assert.match(block, /innerErr instanceof BlockedByRuntimeError/);
    // refused envelope shape
    assert.match(block, /refused: true,\s+refusedReason: innerErr\.message/);
  });

  it('handler swallows scribe + audit failures (best-effort observability)', () => {
    const start = daemonSrc.indexOf("route === '/risk/exec'");
    const end = daemonSrc.indexOf("route === '/risk/preview'", start);
    const block = daemonSrc.slice(start, end);
    // Two empty catches — one around scribe.record, one around
    // audit.record — both with the "swallow" comment.
    const scribeSwallow = (block.match(/swallow scribe failures/g) || []).length;
    const auditSwallow = (block.match(/swallow audit failures/g) || []).length;
    assert.equal(scribeSwallow, 1);
    assert.equal(auditSwallow, 1);
  });

  it('OpenAPI ROUTE_SCHEMAS carries POST /risk/exec', () => {
    assert.match(openApiSrc, /'POST \/risk\/exec':\s*\{/);
  });

  it('OpenAPI summary mentions the new route + gating', () => {
    assert.match(openApiSrc, /POST \/risk\/exec.*allowExec/);
  });
});

describe('scribe-v2 EVENT_TYPES — risk_shadow_exec', () => {
  it('includes risk_shadow_exec', () => {
    assert.ok(EVENT_TYPES.includes('risk_shadow_exec'));
  });

  it('lives next to risk_deny in the canonical order', () => {
    const denyIdx = EVENT_TYPES.indexOf('risk_deny');
    const execIdx = EVENT_TYPES.indexOf('risk_shadow_exec');
    assert.ok(denyIdx >= 0 && execIdx >= 0);
    assert.equal(execIdx, denyIdx + 1);
  });
});

describe('config-validate — allowExec', () => {
  it('allowExec=true is accepted', () => {
    const r = validate({
      riskClassifier: { sandbox: { name: 'docker', allowExec: true } },
    });
    assert.equal(r.errors.length, 0);
  });

  it('allowExec=false is accepted (default-off semantics)', () => {
    const r = validate({
      riskClassifier: { sandbox: { name: 'docker', allowExec: false } },
    });
    assert.equal(r.errors.length, 0);
  });

  it('allowExec must be boolean', () => {
    const r = validate({
      riskClassifier: { sandbox: { name: 'docker', allowExec: 'yes' } },
    });
    assert.ok(r.errors.find((e) => e.path === 'riskClassifier.sandbox.allowExec'));
  });

  it('allowExec=true + name="null" surfaces as warning (meaningless combo)', () => {
    const r = validate({
      riskClassifier: { sandbox: { name: 'null', allowExec: true } },
    });
    assert.equal(r.errors.length, 0);
    const w = r.warnings.find((w) => /allowExec=true is meaningless/.test(w.message));
    assert.ok(w, 'expected meaningless-combo warning');
  });

  it('absent allowExec is fine (defaults off)', () => {
    const r = validate({
      riskClassifier: { sandbox: { name: 'docker' } },
    });
    assert.equal(r.errors.length, 0);
  });
});

describe('Slack alert on shadow exec anomalies (v1.10.94)', () => {
  it('handler fires Slack notification on killed=true', () => {
    const start = daemonSrc.indexOf("route === '/risk/exec'");
    const end = daemonSrc.indexOf("route === '/risk/preview'", start);
    const block = daemonSrc.slice(start, end);
    assert.match(block, /execResult\.killed === true/);
    assert.match(block, /\[SHADOW-EXEC \$\{tag\}\]/);
  });

  it('handler fires Slack notification on non-zero exitCode', () => {
    const start = daemonSrc.indexOf("route === '/risk/exec'");
    const end = daemonSrc.indexOf("route === '/risk/preview'", start);
    const block = daemonSrc.slice(start, end);
    assert.match(block, /execResult\.exitCode !== 0/);
  });

  it('handler fires Slack notification on spawnError', () => {
    const start = daemonSrc.indexOf("route === '/risk/exec'");
    const end = daemonSrc.indexOf("route === '/risk/preview'", start);
    const block = daemonSrc.slice(start, end);
    assert.match(block, /typeof execResult\.spawnError === 'string'/);
  });

  it('respects riskClassifier.notifySlack=false override', () => {
    const start = daemonSrc.indexOf("route === '/risk/exec'");
    const end = daemonSrc.indexOf("route === '/risk/preview'", start);
    const block = daemonSrc.slice(start, end);
    assert.match(block, /riskCfg2\.notifySlack !== false/);
  });

  it('tag distinguishes KILLED / SPAWN-ERROR / EXIT-N', () => {
    const start = daemonSrc.indexOf("route === '/risk/exec'");
    const end = daemonSrc.indexOf("route === '/risk/preview'", start);
    const block = daemonSrc.slice(start, end);
    assert.match(block, /KILLED/);
    assert.match(block, /SPAWN-ERROR/);
    assert.match(block, /EXIT-\$\{execResult\.exitCode\}/);
  });

  it('notification path is wrapped in try/swallow (no notification failure breaks response)', () => {
    const start = daemonSrc.indexOf("route === '/risk/exec'");
    const end = daemonSrc.indexOf("route === '/risk/preview'", start);
    const block = daemonSrc.slice(start, end);
    assert.match(block, /swallow notification failures/);
  });
});

describe('c4 doctor sandbox check — shadow exec gate visibility (v1.10.88)', () => {
  const fs = require('fs');
  const cliSrc = fs.readFileSync(
    require('path').resolve(__dirname, '..', 'src', 'cli.js'),
    'utf8'
  );

  it('doctor block shows shadow exec ENABLED when allowExec=true', () => {
    assert.match(cliSrc, /shadow exec ENABLED/);
  });

  it('doctor block shows shadow exec disabled when allowExec is not true', () => {
    assert.match(cliSrc, /shadow exec disabled.*allowExec:true/);
  });

  it('reachable + allowExec=true is promoted to warn level', () => {
    // The intent is "operator is alerted that the daemon will
    // actually run commands"; locate the conditional that flips
    // level: 'warn' when allowExec === true.
    assert.match(cliSrc, /level:\s*sb\.allowExec === true \? 'warn' : null/);
  });
});

describe('OpenAPI shape — POST /risk/exec response', () => {
  it('declares exitCode (nullable) + spawnError (nullable) + refused (nullable)', () => {
    // First occurrence is the route-summary table; the
    // ROUTE_SCHEMAS entry is the second.
    const first = openApiSrc.indexOf("'POST /risk/exec'");
    const start = openApiSrc.indexOf("'POST /risk/exec'", first + 10);
    assert.ok(start > first);
    const end = openApiSrc.indexOf("'POST /risk/preview'", start);
    const region = openApiSrc.slice(start, end);
    assert.match(region, /exitCode:\s*\{[^}]*nullable: true/);
    assert.match(region, /spawnError:\s*\{[^}]*nullable: true/);
    assert.match(region, /refused:\s*\{[^}]*nullable: true/);
  });
});
