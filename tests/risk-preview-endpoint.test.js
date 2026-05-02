'use strict';

// (v1.10.81) POST /api/risk/preview tests.
//
// Pure builder over HTTP — equivalent of `c4 risk <cmd>
// --sandbox-preview <runtime>` for daemon-side automation.
//
// Spawning the full daemon for a single endpoint is heavy and
// flaky on hermetic CI. Instead this file:
//   1. Source-greps src/daemon.js for the route handler so a
//      future "cleanup" PR that drops the route fails this test
//      first (mirrors the pattern other patches use).
//   2. Verifies the OpenAPI ROUTE_SCHEMAS entry is present (so
//      schema-drift catches handler/spec divergence).
//   3. Drives the underlying SandboxRuntime directly with the
//      same shape the daemon would produce so the response shape
//      contract is locked in.

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

describe('POST /risk/preview — daemon route wireup', () => {
  it('route handler exists in src/daemon.js', () => {
    assert.match(daemonSrc, /req\.method === 'POST' && route === '\/risk\/preview'/);
  });

  it('handler reads riskClassifier.sandbox config for default runtime', () => {
    assert.match(daemonSrc, /riskClassifier\s+&&\s+cfgNow\.riskClassifier\.sandbox/);
  });

  it('handler accepts request runtime override', () => {
    assert.match(daemonSrc, /typeof _body\.runtime === 'string'/);
  });

  it('handler accepts request opts override', () => {
    assert.match(daemonSrc, /_body\.opts && typeof _body\.opts === 'object'/);
  });

  it('handler returns {available, runtime} alongside prepared argv', () => {
    assert.match(daemonSrc, /Object\.assign\(\{\}, prep, \{ available, runtime: runtimeName \}\)/);
  });

  it('handler surfaces unknown-runtime errors inline (no throw leak)', () => {
    // The runtime constructor throws on unknown name. The handler
    // catches and returns {error}. Locate the handler region by
    // anchoring on the unique getRuntime require + the
    // /risk/ai-feedback boundary.
    const start = daemonSrc.indexOf('require(\'./risk-sandbox-runtime\')');
    assert.ok(start > 0, 'handler require not found');
    const end = daemonSrc.indexOf('/risk/ai-feedback', start);
    const block = daemonSrc.slice(start, end);
    assert.match(block, /catch \(e\)/);
    assert.match(block, /error:\s*\(e && e\.message\)/);
  });

  it('OpenAPI ROUTE_SCHEMAS carries POST /risk/preview', () => {
    assert.match(openApiSrc, /'POST \/risk\/preview':\s*\{/);
  });

  it('OpenAPI summary mentions the new route', () => {
    assert.match(openApiSrc, /POST \/risk\/preview.*Pure builder/);
  });
});

describe('Response shape matches what the runtime produces', () => {
  // The handler is essentially a thin shim:
  //   const rt = getRuntime(name, opts);
  //   const available = rt.available();
  //   const prep = rt.prepareArgs(command);
  //   return { ...prep, available, runtime: name };
  //
  // So driving `getRuntime()` directly against the same body
  // shape the daemon would receive proves the response contract.

  const { getRuntime } = require('../src/risk-sandbox-runtime');

  it('docker runtime → docker run argv with hardened flags', () => {
    const rt = getRuntime('docker');
    const prep = rt.prepareArgs('echo hi');
    assert.equal(prep.binary, 'docker');
    assert.ok(prep.args.includes('--network=none'));
    assert.ok(prep.args.includes('--read-only'));
    assert.ok(prep.args.includes('--cap-drop=ALL'));
    assert.deepEqual(prep.args.slice(-3), ['sh', '-c', 'echo hi']);
    assert.equal(prep.command, 'echo hi');
    assert.equal(prep.isolation.name, 'docker');
  });

  it('null runtime → empty argv + isolation:none', () => {
    const rt = getRuntime('null');
    const prep = rt.prepareArgs('echo hi');
    assert.equal(prep.binary, null);
    assert.deepEqual(prep.args, []);
    assert.equal(prep.isolation.name, 'none');
  });

  it('opts override propagates (image / memory)', () => {
    const rt = getRuntime('docker', { image: 'ubuntu:22.04', memory: '256m' });
    const prep = rt.prepareArgs('hi');
    assert.ok(prep.args.includes('ubuntu:22.04'));
    assert.ok(prep.args.includes('--memory=256m'));
  });

  it('command verbatim — chains preserved through sh -c', () => {
    const rt = getRuntime('docker');
    const prep = rt.prepareArgs('cmd1 && cmd2 || cmd3');
    assert.deepEqual(prep.args.slice(-3), ['sh', '-c', 'cmd1 && cmd2 || cmd3']);
  });

  it('available() probe returns ok for null', () => {
    const rt = getRuntime('null');
    const a = rt.available();
    assert.equal(a.ok, true);
  });
});

describe('Live daemon integration (when reachable)', () => {
  // If the dev daemon is on :3456 we hit it for a real round-trip;
  // otherwise this whole describe block reports a single skip.

  const dockerOk = (() => {
    try {
      require('child_process').execSync('which docker', { stdio: 'pipe', timeout: 1000 });
      return true;
    } catch { return false; }
  })();

  function _post(body) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = require('http').request({
        hostname: '127.0.0.1', port: 3456, path: '/api/risk/preview',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(data),
        },
        timeout: 2000,
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
          catch { resolve({ status: res.statusCode, json: null }); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.write(data); req.end();
    });
  }

  let daemonReachable = false;
  it('probe daemon on :3456 (sets gate for the rest of the suite)', async () => {
    try {
      await _post({ command: 'echo probe', runtime: 'null' });
      daemonReachable = true;
      assert.ok(true);
    } catch {
      assert.ok(true, 'daemon not reachable — remaining live cases will skip');
    }
  });

  it('docker runtime via HTTP returns the canonical hardened argv', async (t) => {
    if (!daemonReachable) return t.skip('daemon unreachable');
    if (!dockerOk)        return t.skip('docker not on PATH');
    const r = await _post({ command: 'echo hi', runtime: 'docker' });
    assert.equal(r.status, 200);
    assert.equal(r.json.runtime, 'docker');
    assert.equal(r.json.binary, 'docker');
    assert.ok(r.json.args.includes('--network=none'));
    assert.deepEqual(r.json.args.slice(-3), ['sh', '-c', 'echo hi']);
  });

  it('null runtime via HTTP returns empty argv', async (t) => {
    if (!daemonReachable) return t.skip('daemon unreachable');
    const r = await _post({ command: 'echo hi', runtime: 'null' });
    assert.equal(r.status, 200);
    assert.equal(r.json.runtime, 'null');
    assert.equal(r.json.binary, null);
    assert.deepEqual(r.json.args, []);
  });

  it('opts override propagates over HTTP', async (t) => {
    if (!daemonReachable) return t.skip('daemon unreachable');
    if (!dockerOk)        return t.skip('docker not on PATH');
    const r = await _post({
      command: 'hi',
      runtime: 'docker',
      opts: { image: 'ubuntu:22.04' },
    });
    assert.equal(r.status, 200);
    assert.ok(r.json.args.includes('ubuntu:22.04'));
  });
});
