// tests for src/fleet.js (TODO 9.6: multi-machine fleet management).
//
// Covers:
//   - config roundtrip via loadFleet/saveFleet with explicit path override
//   - add / remove / list / get / current with env + file fallback
//   - setCurrent auto-clears on removeMachine of the pinned alias
//   - getPinnedBase picks up env override + per-machine token
//   - sampleMachine aggregates /health + /list with injected http client
//   - fetchOverview runs machines in parallel, preserves error rows
//   - proxyRequest refuses when no machine is pinned
//   - daemon.js + cli.js source-grep wiring

'use strict';

const assert = require('assert');
const { describe, it, before, after } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

const fleet = require('../src/fleet');

function mkTmp(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `c4-fleet-${label}-`));
}
function rmRf(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ---- config roundtrip -------------------------------------------------------

describe('loadFleet / saveFleet', () => {
  let tmp;
  before(() => { tmp = mkTmp('roundtrip'); });
  after(() => { rmRf(tmp); });

  it('returns empty skeleton when file is missing', () => {
    const cfg = fleet.loadFleet({ home: tmp });
    assert.deepStrictEqual(cfg, { machines: {} });
  });

  it('saveFleet + loadFleet roundtrip preserves machines', () => {
    const cfg = { machines: { a: { host: 'h1', port: 3456 }, b: { host: 'h2', port: 9999 } } };
    fleet.saveFleet(cfg, { home: tmp });
    const back = fleet.loadFleet({ home: tmp });
    assert.strictEqual(back.machines.a.host, 'h1');
    assert.strictEqual(back.machines.b.port, 9999);
  });

  it('ignores non-object machines key on load', () => {
    const p = fleet.fleetConfigPath(tmp);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ machines: null }));
    const cfg = fleet.loadFleet({ home: tmp });
    assert.deepStrictEqual(cfg.machines, {});
  });

  it('throws on invalid JSON', () => {
    const p = fleet.fleetConfigPath(tmp);
    fs.writeFileSync(p, 'not json');
    assert.throws(() => fleet.loadFleet({ home: tmp }), /invalid JSON/);
  });
});

// ---- add / remove / list / get ---------------------------------------------

describe('addMachine / removeMachine / listMachines / getMachine', () => {
  let tmp;
  before(() => { tmp = mkTmp('crud'); });
  after(() => { rmRf(tmp); });

  it('rejects an empty alias', () => {
    assert.throws(() => fleet.addMachine('', 'h', { home: tmp }), /alias/);
  });

  it('rejects an invalid alias', () => {
    assert.throws(() => fleet.addMachine('has spaces', 'h', { home: tmp }), /invalid alias/);
  });

  it('rejects empty host', () => {
    assert.throws(() => fleet.addMachine('a', '', { home: tmp }), /host/);
  });

  it('rejects invalid port', () => {
    assert.throws(() => fleet.addMachine('a', 'h', { home: tmp, port: 70000 }), /invalid port/);
  });

  it('defaults port to 3456 when not specified', () => {
    fleet.addMachine('dgx', '192.168.10.222', { home: tmp });
    const m = fleet.getMachine('dgx', { home: tmp });
    assert.strictEqual(m.port, 3456);
    assert.strictEqual(m.host, '192.168.10.222');
    assert.strictEqual(m.authToken, '');
  });

  it('stores auth token when provided', () => {
    fleet.addMachine('build', '192.168.10.50', { home: tmp, port: 3456, authToken: 'abc123' });
    const m = fleet.getMachine('build', { home: tmp });
    assert.strictEqual(m.authToken, 'abc123');
  });

  it('adding same alias updates host/port without wiping token', () => {
    fleet.addMachine('build', '10.0.0.1', { home: tmp, port: 4500 });
    const m = fleet.getMachine('build', { home: tmp });
    assert.strictEqual(m.host, '10.0.0.1');
    assert.strictEqual(m.port, 4500);
    assert.strictEqual(m.authToken, 'abc123', 'existing token preserved');
  });

  it('listMachines returns sorted entries with hasToken flag', () => {
    const list = fleet.listMachines({ home: tmp });
    assert.strictEqual(list.length, 2);
    assert.deepStrictEqual(list.map((x) => x.alias), ['build', 'dgx']);
    const build = list.find((x) => x.alias === 'build');
    assert.strictEqual(build.hasToken, true);
    const dgx = list.find((x) => x.alias === 'dgx');
    assert.strictEqual(dgx.hasToken, false);
  });

  it('getMachine returns null for unknown', () => {
    assert.strictEqual(fleet.getMachine('nope', { home: tmp }), null);
  });

  it('removeMachine removes and returns ok=true', () => {
    const res = fleet.removeMachine('build', { home: tmp });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(fleet.getMachine('build', { home: tmp }), null);
  });

  it('removeMachine returns error when alias missing', () => {
    const res = fleet.removeMachine('ghost', { home: tmp });
    assert.strictEqual(res.ok, false);
    assert.match(res.error, /not found/);
  });
});

// ---- current pin (env + file fallback) -------------------------------------

describe('getCurrent / setCurrent', () => {
  let tmp;
  before(() => {
    tmp = mkTmp('current');
    fleet.addMachine('dgx', 'h1', { home: tmp });
    fleet.addMachine('build', 'h2', { home: tmp });
  });
  after(() => { rmRf(tmp); });

  it('returns null when nothing is pinned', () => {
    const env = {};
    assert.strictEqual(fleet.getCurrent({ home: tmp, env }), null);
  });

  it('setCurrent writes the pin file', () => {
    const res = fleet.setCurrent('dgx', { home: tmp });
    assert.strictEqual(res.ok, true);
    const raw = fs.readFileSync(fleet.fleetCurrentPath(tmp), 'utf8').trim();
    assert.strictEqual(raw, 'dgx');
  });

  it('getCurrent reads the pin file when env is absent', () => {
    const alias = fleet.getCurrent({ home: tmp, env: {} });
    assert.strictEqual(alias, 'dgx');
  });

  it('env C4_FLEET overrides the pin file', () => {
    const alias = fleet.getCurrent({ home: tmp, env: { C4_FLEET: 'build' } });
    assert.strictEqual(alias, 'build');
  });

  it('setCurrent(null) clears the pin', () => {
    fleet.setCurrent(null, { home: tmp });
    assert.strictEqual(fleet.getCurrent({ home: tmp, env: {} }), null);
  });

  it('setCurrent on unknown alias returns ok=false', () => {
    const res = fleet.setCurrent('ghost', { home: tmp });
    assert.strictEqual(res.ok, false);
  });

  it('removeMachine clears the pin if it was pinned', () => {
    fleet.setCurrent('dgx', { home: tmp });
    fleet.removeMachine('dgx', { home: tmp });
    assert.strictEqual(fleet.getCurrent({ home: tmp, env: {} }), null);
  });
});

// ---- getPinnedBase ---------------------------------------------------------

describe('getPinnedBase', () => {
  let tmp;
  before(() => {
    tmp = mkTmp('pinned');
    fleet.addMachine('dgx', '192.168.10.222', { home: tmp, port: 3456, authToken: 'per-machine' });
  });
  after(() => { rmRf(tmp); });

  it('returns pinned=false when nothing is pinned', () => {
    const p = fleet.getPinnedBase({ home: tmp, env: {} });
    assert.strictEqual(p.pinned, false);
    assert.strictEqual(p.base, null);
  });

  it('returns base URL + per-machine token when pinned', () => {
    fleet.setCurrent('dgx', { home: tmp });
    const p = fleet.getPinnedBase({ home: tmp, env: {} });
    assert.strictEqual(p.pinned, true);
    assert.strictEqual(p.base, 'http://192.168.10.222:3456');
    assert.strictEqual(p.token, 'per-machine');
  });

  it('falls back to shared C4_TOKEN env when machine has no token', () => {
    fleet.addMachine('build', '10.0.0.9', { home: tmp });
    fleet.setCurrent('build', { home: tmp });
    const p = fleet.getPinnedBase({ home: tmp, env: { C4_TOKEN: 'shared' } });
    assert.strictEqual(p.token, 'shared');
  });

  it('returns an error when the pinned alias is missing from fleet.json', () => {
    // Manually corrupt the pin to reference a deleted alias.
    fs.writeFileSync(fleet.fleetCurrentPath(tmp), 'ghost\n');
    const p = fleet.getPinnedBase({ home: tmp, env: {} });
    assert.strictEqual(p.pinned, true);
    assert.strictEqual(p.base, null);
    assert.match(p.error, /not found/);
  });
});

// ---- sampleMachine (mocked http client) ------------------------------------

describe('sampleMachine', () => {
  it('returns ok=true with worker count when both endpoints succeed', async () => {
    const calls = [];
    const httpClient = async (method, url, body, opts) => {
      calls.push({ method, url, token: opts.token });
      if (url.endsWith('/health')) {
        return { ok: true, status: 200, body: { ok: true, workers: 3, version: '1.7.0' }, elapsedMs: 10 };
      }
      if (url.endsWith('/list')) {
        return { ok: true, status: 200, body: { workers: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }, elapsedMs: 12 };
      }
      return { ok: false, status: 0, error: 'unexpected', elapsedMs: 0 };
    };
    const row = await fleet.sampleMachine(
      { alias: 'dgx', host: 'h', port: 3456, authToken: 'T' },
      { httpClient, timeoutMs: 1000 }
    );
    assert.strictEqual(row.ok, true);
    assert.strictEqual(row.workers, 3);
    assert.strictEqual(row.version, '1.7.0');
    assert.strictEqual(row.error, null);
    assert.ok(calls.length === 2);
    assert.ok(calls.every((c) => c.token === 'T'));
    assert.ok(calls.some((c) => c.url.endsWith('/health')));
    assert.ok(calls.some((c) => c.url.endsWith('/list')));
  });

  it('returns ok=false and propagates transport error when /health fails', async () => {
    const httpClient = async (method, url) => {
      if (url.endsWith('/health')) return { ok: false, status: 0, error: 'ECONNREFUSED', elapsedMs: 5 };
      return { ok: false, status: 0, error: 'skipped', elapsedMs: 5 };
    };
    const row = await fleet.sampleMachine({ alias: 'x', host: 'h', port: 3456 }, { httpClient });
    assert.strictEqual(row.ok, false);
    assert.strictEqual(row.workers, null);
    assert.match(row.error, /ECONNREFUSED/);
  });
});

// ---- fetchOverview ---------------------------------------------------------

describe('fetchOverview', () => {
  it('aggregates self + remotes with totals across parallel samples', async () => {
    const machines = [
      { alias: 'dgx', host: 'h1', port: 3456, authToken: 'T1' },
      { alias: 'build', host: 'h2', port: 3456 },
      { alias: 'dead', host: 'h3', port: 3456 },
    ];
    const httpClient = async (method, url, body, opts) => {
      if (url.startsWith('http://h1:')) {
        if (url.endsWith('/health')) return { ok: true, status: 200, body: { ok: true, version: '1.7.0' }, elapsedMs: 10 };
        if (url.endsWith('/list'))   return { ok: true, status: 200, body: { workers: [{}, {}] }, elapsedMs: 11 };
      }
      if (url.startsWith('http://h2:')) {
        if (url.endsWith('/health')) return { ok: true, status: 200, body: { ok: true, version: '1.7.0' }, elapsedMs: 12 };
        if (url.endsWith('/list'))   return { ok: true, status: 200, body: { workers: [{}] }, elapsedMs: 13 };
      }
      if (url.startsWith('http://h3:')) {
        return { ok: false, status: 0, error: 'ECONNREFUSED', elapsedMs: 14 };
      }
      return { ok: false, status: 0, error: 'unexpected', elapsedMs: 0 };
    };
    const self = { ok: true, alias: '_self', host: '127.0.0.1', port: 3456, workers: 4, version: '1.7.0' };
    const result = await fleet.fetchOverview({ machines, self, httpClient, timeoutMs: 500 });
    assert.strictEqual(result.machines.length, 3);
    const byAlias = Object.fromEntries(result.machines.map((m) => [m.alias, m]));
    assert.strictEqual(byAlias.dgx.ok, true);
    assert.strictEqual(byAlias.dgx.workers, 2);
    assert.strictEqual(byAlias.build.workers, 1);
    assert.strictEqual(byAlias.dead.ok, false);
    assert.match(byAlias.dead.error, /ECONNREFUSED/);
    assert.strictEqual(result.total.machines, 4);
    assert.strictEqual(result.total.reachable, 3);
    assert.strictEqual(result.total.workers, 4 + 2 + 1);
    assert.ok(result.self);
    assert.strictEqual(typeof result.generatedAt, 'string');
  });

  it('returns zero machines when none are registered + no self', async () => {
    const result = await fleet.fetchOverview({ machines: [], httpClient: async () => ({ ok: false }) });
    assert.strictEqual(result.machines.length, 0);
    assert.strictEqual(result.total.machines, 0);
    assert.strictEqual(result.total.workers, 0);
    assert.strictEqual(result.self, null);
  });

  it('respects per-machine timeout contract', async () => {
    let seenTimeout = null;
    const httpClient = async (method, url, body, opts) => {
      seenTimeout = opts.timeoutMs;
      return { ok: false, status: 0, error: 'timeout', elapsedMs: opts.timeoutMs };
    };
    await fleet.fetchOverview({
      machines: [{ alias: 'x', host: 'h', port: 3456 }],
      httpClient,
      timeoutMs: 250,
    });
    assert.strictEqual(seenTimeout, 250);
  });
});

// ---- proxyRequest ----------------------------------------------------------

describe('proxyRequest', () => {
  it('returns an error envelope when nothing is pinned', async () => {
    const res = await fleet.proxyRequest(
      { pinned: false, base: null, token: null },
      'GET',
      '/list'
    );
    assert.strictEqual(res.ok, false);
    assert.match(res.error, /no pinned/);
  });

  it('forwards the JWT as Bearer and preserves body on POST', async () => {
    const seen = {};
    const httpClient = async (method, url, body, opts) => {
      seen.method = method;
      seen.url = url;
      seen.body = body;
      seen.token = opts.token;
      seen.timeoutMs = opts.timeoutMs;
      return { ok: true, status: 200, body: { got: true }, elapsedMs: 1 };
    };
    const pinned = { pinned: true, base: 'http://192.168.10.222:3456', token: 'J' };
    const res = await fleet.proxyRequest(pinned, 'POST', '/task', { name: 'w1' }, { httpClient, timeoutMs: 5000 });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(seen.method, 'POST');
    assert.strictEqual(seen.url, 'http://192.168.10.222:3456/task');
    assert.deepStrictEqual(seen.body, { name: 'w1' });
    assert.strictEqual(seen.token, 'J');
    assert.strictEqual(seen.timeoutMs, 5000);
  });
});

// ---- wiring source-grep ----------------------------------------------------

describe('daemon + cli wiring', () => {
  const daemonSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'daemon.js'), 'utf8');
  const cliSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli.js'), 'utf8');

  it('daemon.js imports fleet module', () => {
    assert.ok(/require\('\.\/fleet'\)/.test(daemonSrc), 'require(./fleet) missing');
  });

  it('daemon.js exposes GET /fleet/overview', () => {
    assert.ok(/route === '\/fleet\/overview'/.test(daemonSrc), '/fleet/overview route missing');
    assert.ok(/fleet\.fetchOverview\(/.test(daemonSrc), 'fetchOverview call missing');
  });

  it('cli.js exposes fleet subcommand with add/list/remove/status/use', () => {
    assert.ok(/case 'fleet':/.test(cliSrc), 'fleet case missing');
    assert.ok(/fleet\.addMachine\(/.test(cliSrc), 'addMachine call missing');
    assert.ok(/fleet\.removeMachine\(/.test(cliSrc), 'removeMachine call missing');
    assert.ok(/fleet\.setCurrent\(/.test(cliSrc), 'setCurrent call missing');
    assert.ok(/\/fleet\/overview/.test(cliSrc), 'fleet status endpoint missing');
  });

  it('cli.js routes request() through the pinned base when an alias is set', () => {
    assert.ok(/getPinnedBase\(\)/.test(cliSrc), 'getPinnedBase lookup missing');
    assert.ok(/resolveBase/.test(cliSrc), 'resolveBase helper missing');
  });

  it('cli.js help text mentions the fleet subcommand', () => {
    assert.ok(/fleet add <alias>/.test(cliSrc), 'fleet help line missing');
  });
});
