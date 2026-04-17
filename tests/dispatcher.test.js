// tests for src/dispatcher.js (TODO 9.7: fleet task distribution).
//
// Covers:
//   - normalizeStrategy rejects unknown names
//   - least-loaded ranking: workers asc, tag count desc, alias asc
//   - tag-match ranking: matches desc, workers asc
//   - round-robin picks across the pool cyclically
//   - filterByTags drops machines missing any requested tag
//   - filterReachable drops unreachable samples
//   - buildPool honors locationPin
//   - sampleFleet folds sample rows with pool tags / authToken
//   - planPlacement increments simulated load per slot (no pile-up)
//   - dispatch() returns fallback=no-machines with empty fleet
//   - dispatch() returns fallback=local-only when no remote machines
//   - dispatch() returns fallback=all-unreachable when every peer fails
//   - dispatch() returns fallback=tags-no-match when filter empties pool
//   - dispatch() round-robin spreads evenly when count > machines
//   - dispatch() tag-match picks the tagged machine even under higher load
//   - daemon + cli source-grep wiring
//   - fleet tags persistence through addMachine + getMachine

'use strict';

const assert = require('assert');
const { describe, it, before, after } = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

const dispatcher = require('../src/dispatcher');
const fleet = require('../src/fleet');

function mkTmp(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `c4-dispatcher-${label}-`));
}
function rmRf(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ---- strategy validation --------------------------------------------------

describe('normalizeStrategy', () => {
  it('defaults to least-loaded when nothing is given', () => {
    assert.strictEqual(dispatcher.normalizeStrategy(''), 'least-loaded');
    assert.strictEqual(dispatcher.normalizeStrategy(null), 'least-loaded');
    assert.strictEqual(dispatcher.normalizeStrategy(undefined), 'least-loaded');
  });

  it('accepts known strategies (case-insensitive)', () => {
    assert.strictEqual(dispatcher.normalizeStrategy('Round-Robin'), 'round-robin');
    assert.strictEqual(dispatcher.normalizeStrategy('TAG-MATCH'), 'tag-match');
    assert.strictEqual(dispatcher.normalizeStrategy('least-loaded'), 'least-loaded');
  });

  it('throws on unknown strategies', () => {
    assert.throws(() => dispatcher.normalizeStrategy('random'), /unknown strategy/);
  });
});

// ---- ranking ---------------------------------------------------------------

describe('rankLeastLoaded', () => {
  it('orders by workers asc, then tag count desc, then alias asc', () => {
    const samples = [
      { alias: 'beta', workers: 3, tags: ['gpu'] },
      { alias: 'alpha', workers: 1, tags: [] },
      { alias: 'gamma', workers: 1, tags: ['web', 'high-mem'] },
      { alias: 'delta', workers: 5, tags: ['gpu', 'high-mem'] },
    ];
    const ranked = dispatcher.rankLeastLoaded(samples);
    const order = ranked.map((r) => r.machine.alias);
    assert.deepStrictEqual(order, ['gamma', 'alpha', 'beta', 'delta']);
    assert.strictEqual(ranked[0].score.strategy, 'least-loaded');
    assert.strictEqual(ranked[0].score.workers, 1);
    assert.strictEqual(ranked[0].score.tagCount, 2);
  });

  it('places unknown worker counts last (Infinity)', () => {
    const samples = [
      { alias: 'a', workers: 2, tags: [] },
      { alias: 'b', workers: null, tags: [] },
      { alias: 'c', workers: 1, tags: [] },
    ];
    const ranked = dispatcher.rankLeastLoaded(samples);
    assert.deepStrictEqual(ranked.map((r) => r.machine.alias), ['c', 'a', 'b']);
  });
});

describe('rankTagMatch', () => {
  it('orders by match count desc, then workers asc, then alias asc', () => {
    const samples = [
      { alias: 'a', workers: 0, tags: ['gpu'] },
      { alias: 'b', workers: 0, tags: ['gpu', 'high-mem'] },
      { alias: 'c', workers: 5, tags: ['gpu', 'high-mem'] },
      { alias: 'd', workers: 0, tags: [] },
    ];
    const ranked = dispatcher.rankTagMatch(samples, ['gpu', 'high-mem']);
    const order = ranked.map((r) => r.machine.alias);
    assert.deepStrictEqual(order, ['b', 'c', 'a', 'd']);
    assert.strictEqual(ranked[0].score.tagMatches, 2);
    assert.strictEqual(ranked[0].score.tagWanted, 2);
  });

  it('handles empty wanted tags (every row has 0 matches)', () => {
    const samples = [
      { alias: 'a', workers: 3, tags: ['gpu'] },
      { alias: 'b', workers: 1, tags: [] },
    ];
    const ranked = dispatcher.rankTagMatch(samples, []);
    // With 0 wanted tags, both have 0 matches -> sort by workers asc.
    assert.deepStrictEqual(ranked.map((r) => r.machine.alias), ['b', 'a']);
  });
});

describe('rankRoundRobin', () => {
  it('sorts alphabetically for deterministic cyclic walks', () => {
    const samples = [{ alias: 'c' }, { alias: 'a' }, { alias: 'b' }];
    const ranked = dispatcher.rankRoundRobin(samples);
    assert.deepStrictEqual(ranked.map((r) => r.machine.alias), ['a', 'b', 'c']);
  });
});

// ---- filters ---------------------------------------------------------------

describe('filterByTags', () => {
  it('drops machines missing any requested tag', () => {
    const samples = [
      { alias: 'a', tags: ['gpu', 'web'] },
      { alias: 'b', tags: ['web'] },
      { alias: 'c', tags: ['gpu'] },
    ];
    const filtered = dispatcher.filterByTags(samples, ['gpu']);
    assert.deepStrictEqual(filtered.map((s) => s.alias), ['a', 'c']);
  });

  it('case-insensitive match', () => {
    const samples = [
      { alias: 'a', tags: ['GPU'] },
      { alias: 'b', tags: ['gpu'] },
      { alias: 'c', tags: [] },
    ];
    const filtered = dispatcher.filterByTags(samples, ['Gpu']);
    assert.deepStrictEqual(filtered.map((s) => s.alias).sort(), ['a', 'b']);
  });

  it('returns input unchanged when tags are empty', () => {
    const samples = [{ alias: 'a', tags: [] }];
    assert.strictEqual(dispatcher.filterByTags(samples, []), samples);
  });
});

describe('filterReachable', () => {
  it('drops samples with ok=false', () => {
    const samples = [
      { alias: 'a', ok: true },
      { alias: 'b', ok: false },
      { alias: 'c', ok: true },
    ];
    const r = dispatcher.filterReachable(samples);
    assert.deepStrictEqual(r.map((s) => s.alias), ['a', 'c']);
  });
});

// ---- buildPool -------------------------------------------------------------

describe('buildPool', () => {
  it('filters out entries missing host or port', () => {
    const machines = [
      { alias: 'a', host: 'h1', port: 3456 },
      { alias: 'b', host: '', port: 3456 },
      { alias: 'c', host: 'h3' },
    ];
    const pool = dispatcher.buildPool(machines);
    assert.deepStrictEqual(pool.map((m) => m.alias), ['a']);
  });

  it('honors locationPin to a single alias', () => {
    const machines = [
      { alias: 'a', host: 'h1', port: 3456 },
      { alias: 'b', host: 'h2', port: 3456 },
    ];
    const pool = dispatcher.buildPool(machines, { locationPin: 'b' });
    assert.deepStrictEqual(pool.map((m) => m.alias), ['b']);
  });

  it('returns empty when locationPin misses', () => {
    const machines = [{ alias: 'a', host: 'h1', port: 3456 }];
    const pool = dispatcher.buildPool(machines, { locationPin: 'ghost' });
    assert.deepStrictEqual(pool, []);
  });
});

// ---- sampleFleet -----------------------------------------------------------

describe('sampleFleet', () => {
  it('folds pool tags + authToken back onto samples', async () => {
    const pool = [
      { alias: 'a', host: 'h1', port: 3456, tags: ['gpu'], authToken: 'T' },
    ];
    const sampleClient = async (machine) => ({
      alias: machine.alias, host: machine.host, port: machine.port,
      ok: true, workers: 2, version: '1.7', error: null, elapsedMs: 5,
    });
    const samples = await dispatcher.sampleFleet(pool, { sampleClient });
    assert.strictEqual(samples.length, 1);
    assert.deepStrictEqual(samples[0].tags, ['gpu']);
    assert.strictEqual(samples[0].authToken, 'T');
    assert.strictEqual(samples[0].workers, 2);
  });

  it('returns [] on empty pool', async () => {
    const samples = await dispatcher.sampleFleet([], { sampleClient: async () => ({}) });
    assert.deepStrictEqual(samples, []);
  });
});

// ---- incremental placement (no pile-up) -----------------------------------

describe('pickLeastLoadedIncremental', () => {
  it('increments simulated load so repeated calls do not stack', () => {
    const samples = [
      { alias: 'a', host: 'h1', port: 3456, tags: [], workers: 0, authToken: '' },
      { alias: 'b', host: 'h2', port: 3456, tags: [], workers: 0, authToken: '' },
    ];
    const plan = dispatcher.pickLeastLoadedIncremental(samples, 4);
    const aliases = plan.map((p) => p.machine.alias);
    // alphabetical tie-break first, then the other, alternating.
    assert.deepStrictEqual(aliases, ['a', 'b', 'a', 'b']);
    // score should reflect the *simulated* count when that slot was picked.
    assert.strictEqual(plan[0].score.workers, 0);
    assert.strictEqual(plan[1].score.workers, 0);
    assert.strictEqual(plan[2].score.workers, 1);
    assert.strictEqual(plan[3].score.workers, 1);
  });

  it('respects preexisting worker counts', () => {
    const samples = [
      { alias: 'a', host: 'h1', port: 3456, tags: [], workers: 5, authToken: '' },
      { alias: 'b', host: 'h2', port: 3456, tags: [], workers: 0, authToken: '' },
    ];
    const plan = dispatcher.pickLeastLoadedIncremental(samples, 3);
    assert.deepStrictEqual(plan.map((p) => p.machine.alias), ['b', 'b', 'b']);
  });
});

describe('pickRoundRobin', () => {
  it('walks cyclically when count > pool size', () => {
    const ranked = [
      { machine: { alias: 'a' }, score: {} },
      { machine: { alias: 'b' }, score: {} },
    ];
    const plan = dispatcher.pickRoundRobin(ranked, 5);
    assert.deepStrictEqual(plan.map((p) => p.machine.alias), ['a', 'b', 'a', 'b', 'a']);
  });

  it('returns [] on empty ranked list', () => {
    assert.deepStrictEqual(dispatcher.pickRoundRobin([], 5), []);
  });
});

// ---- dispatch() top-level --------------------------------------------------

describe('dispatch()', () => {
  it('returns fallback=no-machines when nothing is configured', async () => {
    const r = await dispatcher.dispatch({ task: 'x', count: 2, machines: [] });
    assert.strictEqual(r.fallback, 'no-machines');
    assert.deepStrictEqual(r.plan, []);
  });

  it('returns fallback=local-only when no remote machines + local sample', async () => {
    const r = await dispatcher.dispatch({
      task: 'x',
      count: 3,
      machines: [],
      local: { alias: '_local', host: '127.0.0.1', port: 3456, ok: true, workers: 0 },
    });
    assert.strictEqual(r.fallback, 'local-only');
    assert.strictEqual(r.plan.length, 3);
    assert.ok(r.plan.every((p) => p.machine.alias === '_local'));
    assert.strictEqual(r.plan[0].name, 'dispatch-1');
    assert.strictEqual(r.plan[2].name, 'dispatch-3');
  });

  it('returns fallback=all-unreachable when every remote fails and no local', async () => {
    const machines = [
      { alias: 'a', host: 'h1', port: 3456, tags: [] },
      { alias: 'b', host: 'h2', port: 3456, tags: [] },
    ];
    const sampleClient = async (m) => ({
      alias: m.alias, host: m.host, port: m.port,
      ok: false, workers: null, version: null, error: 'ECONNREFUSED', elapsedMs: 3,
    });
    const r = await dispatcher.dispatch({ task: 'x', count: 2, machines, sampleClient });
    assert.strictEqual(r.fallback, 'all-unreachable');
    assert.deepStrictEqual(r.plan, []);
    assert.strictEqual(r.samples.length, 2);
  });

  it('falls back to local when every remote fails but local is reachable', async () => {
    const machines = [{ alias: 'dead', host: 'h1', port: 3456, tags: [] }];
    const sampleClient = async (m) => ({
      alias: m.alias, host: m.host, port: m.port,
      ok: false, workers: null, version: null, error: 'timeout', elapsedMs: 1,
    });
    const r = await dispatcher.dispatch({
      task: 'x',
      count: 2,
      machines,
      sampleClient,
      local: { alias: '_local', host: '127.0.0.1', port: 3456, ok: true, workers: 1 },
    });
    // All remote unreachable. Dispatcher should include local sample
    // and pick it for every slot.
    assert.strictEqual(r.plan.length, 2);
    assert.ok(r.plan.every((p) => p.machine.alias === '_local'));
  });

  it('returns fallback=tags-no-match when no machine carries the tag', async () => {
    const machines = [
      { alias: 'a', host: 'h1', port: 3456, tags: ['web'] },
      { alias: 'b', host: 'h2', port: 3456, tags: [] },
    ];
    const sampleClient = async (m) => ({
      alias: m.alias, host: m.host, port: m.port,
      ok: true, workers: 0, version: '1.7', error: null, elapsedMs: 2,
    });
    // least-loaded with strict-looking tag filter (since strategy != tag-match)
    const r = await dispatcher.dispatch({
      task: 'x',
      count: 1,
      machines,
      sampleClient,
      strategy: 'least-loaded',
      tags: ['gpu'],
    });
    assert.strictEqual(r.fallback, 'tags-no-match');
  });

  it('round-robin spreads evenly across machines when count > pool', async () => {
    const machines = [
      { alias: 'alpha', host: 'h1', port: 3456, tags: [] },
      { alias: 'beta',  host: 'h2', port: 3456, tags: [] },
      { alias: 'gamma', host: 'h3', port: 3456, tags: [] },
    ];
    const sampleClient = async (m) => ({
      alias: m.alias, host: m.host, port: m.port,
      ok: true, workers: 99, version: '1.7', error: null, elapsedMs: 2,
    });
    const r = await dispatcher.dispatch({
      task: 'x',
      count: 5,
      machines,
      sampleClient,
      strategy: 'round-robin',
    });
    assert.strictEqual(r.plan.length, 5);
    const aliases = r.plan.map((p) => p.machine.alias);
    // deterministic cyclic walk over sorted ranked list
    assert.deepStrictEqual(aliases, ['alpha', 'beta', 'gamma', 'alpha', 'beta']);
  });

  it('tag-match prefers tagged machine even when it is under higher load', async () => {
    const machines = [
      { alias: 'cpu', host: 'h1', port: 3456, tags: ['web'] },
      { alias: 'gpu', host: 'h2', port: 3456, tags: ['gpu', 'high-mem'] },
    ];
    // cpu has fewer workers, but we want a gpu machine.
    const sampleClient = async (m) => {
      if (m.alias === 'cpu') {
        return { alias: 'cpu', host: 'h1', port: 3456, ok: true, workers: 0, version: '1.7', error: null, elapsedMs: 1 };
      }
      return { alias: 'gpu', host: 'h2', port: 3456, ok: true, workers: 10, version: '1.7', error: null, elapsedMs: 1 };
    };
    const r = await dispatcher.dispatch({
      task: 'train',
      count: 2,
      machines,
      sampleClient,
      strategy: 'tag-match',
      tags: ['gpu'],
    });
    assert.strictEqual(r.plan.length, 2);
    // Both slots should go to gpu because tag-match dominates workers.
    assert.ok(r.plan.every((p) => p.machine.alias === 'gpu'));
    assert.strictEqual(r.plan[0].score.tagMatches, 1);
  });

  it('least-loaded avoids the hot machine', async () => {
    const machines = [
      { alias: 'hot',  host: 'h1', port: 3456, tags: [] },
      { alias: 'cold', host: 'h2', port: 3456, tags: [] },
    ];
    const sampleClient = async (m) => {
      if (m.alias === 'hot') {
        return { alias: 'hot', host: 'h1', port: 3456, ok: true, workers: 10, version: null, error: null, elapsedMs: 1 };
      }
      return { alias: 'cold', host: 'h2', port: 3456, ok: true, workers: 0, version: null, error: null, elapsedMs: 1 };
    };
    const r = await dispatcher.dispatch({
      task: 'x',
      count: 3,
      machines,
      sampleClient,
      strategy: 'least-loaded',
    });
    // cold starts at 0, hot at 10. After three increments cold sits at 3,
    // still below hot (10), so all three go to cold.
    assert.ok(r.plan.every((p) => p.machine.alias === 'cold'));
  });

  it('locationPin forces routing to the named alias', async () => {
    const machines = [
      { alias: 'a', host: 'h1', port: 3456, tags: [] },
      { alias: 'b', host: 'h2', port: 3456, tags: [] },
    ];
    const sampleClient = async (m) => ({
      alias: m.alias, host: m.host, port: m.port,
      ok: true, workers: 0, version: null, error: null, elapsedMs: 1,
    });
    const r = await dispatcher.dispatch({
      task: 'x',
      count: 3,
      machines,
      sampleClient,
      location: 'b',
    });
    assert.strictEqual(r.plan.length, 3);
    assert.ok(r.plan.every((p) => p.machine.alias === 'b'));
  });

  it('enriches plan rows with name + branch prefix + task copy', async () => {
    const machines = [{ alias: 'a', host: 'h1', port: 3456, tags: [] }];
    const sampleClient = async (m) => ({
      alias: m.alias, host: m.host, port: m.port,
      ok: true, workers: 0, version: null, error: null, elapsedMs: 1,
    });
    const r = await dispatcher.dispatch({
      task: 'migrate db',
      count: 2,
      machines,
      sampleClient,
      namePrefix: 'mig',
      branchPrefix: 'feature',
    });
    assert.strictEqual(r.plan[0].name, 'mig-1');
    assert.strictEqual(r.plan[1].name, 'mig-2');
    assert.strictEqual(r.plan[0].branch, 'feature-1');
    assert.strictEqual(r.plan[1].branch, 'feature-2');
    assert.strictEqual(r.plan[0].task, 'migrate db');
  });
});

// ---- fleet tags persistence ------------------------------------------------

describe('fleet tags persistence', () => {
  let tmp;
  before(() => { tmp = mkTmp('tags'); });
  after(() => { rmRf(tmp); });

  it('addMachine with tags stores them in fleet.json', () => {
    fleet.addMachine('dgx', '192.168.10.222', { home: tmp, tags: ['gpu', 'high-mem'] });
    const m = fleet.getMachine('dgx', { home: tmp });
    assert.deepStrictEqual(m.tags, ['gpu', 'high-mem']);
  });

  it('addMachine preserves tags when none are supplied on re-add', () => {
    fleet.addMachine('dgx', '192.168.10.222', { home: tmp, port: 4500 });
    const m = fleet.getMachine('dgx', { home: tmp });
    assert.deepStrictEqual(m.tags, ['gpu', 'high-mem']);
    assert.strictEqual(m.port, 4500);
  });

  it('clearTags=true wipes the tag list', () => {
    fleet.addMachine('dgx', '192.168.10.222', { home: tmp, clearTags: true });
    const m = fleet.getMachine('dgx', { home: tmp });
    assert.deepStrictEqual(m.tags, []);
  });

  it('normalizes tag casing + dedupes', () => {
    fleet.addMachine('build', '10.0.0.1', { home: tmp, tags: ['Web', 'web', 'CI'] });
    const m = fleet.getMachine('build', { home: tmp });
    assert.deepStrictEqual(m.tags, ['web', 'ci']);
  });

  it('rejects invalid tag characters', () => {
    assert.throws(() =>
      fleet.addMachine('x', '10.0.0.2', { home: tmp, tags: ['has space'] }),
      /invalid tag/
    );
  });

  it('listMachines returns tags array for each row', () => {
    const list = fleet.listMachines({ home: tmp });
    const build = list.find((x) => x.alias === 'build');
    assert.deepStrictEqual(build.tags, ['web', 'ci']);
  });
});

// ---- wiring source-grep ----------------------------------------------------

describe('daemon + cli wiring', () => {
  const daemonSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'daemon.js'), 'utf8');
  const cliSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli.js'), 'utf8');

  it('daemon.js imports dispatcher module', () => {
    assert.ok(/require\('\.\/dispatcher'\)/.test(daemonSrc), 'require(./dispatcher) missing');
  });

  it('daemon.js exposes POST /dispatch', () => {
    assert.ok(/route === '\/dispatch'/.test(daemonSrc), '/dispatch route missing');
    assert.ok(/dispatcher\.dispatch\(/.test(daemonSrc), 'dispatcher.dispatch call missing');
  });

  it('cli.js exposes dispatch subcommand', () => {
    assert.ok(/case 'dispatch':/.test(cliSrc), 'dispatch case missing');
    assert.ok(/\/dispatch/.test(cliSrc), 'dispatch endpoint missing');
    assert.ok(/--strategy/.test(cliSrc), '--strategy flag missing');
    assert.ok(/--tags/.test(cliSrc), '--tags flag missing');
  });

  it('cli.js fleet add accepts --tags', () => {
    assert.ok(/--tags/.test(cliSrc), '--tags in fleet add missing');
  });

  it('cli.js help text documents dispatch subcommand', () => {
    assert.ok(/dispatch "<task>"/.test(cliSrc), 'dispatch help line missing');
  });
});
