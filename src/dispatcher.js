'use strict';

// Fleet task dispatcher (TODO 9.7).
//
// Responsibilities:
//   - Sample each reachable fleet machine for its current worker count
//     and tags so the placement decision can rank by load + tag match.
//   - Pick a target machine per task using one of three strategies:
//       * least-loaded  (fewest active workers wins; tags only filter)
//       * tag-match     (machines that match every requested tag win;
//                        among the winners, pick by lowest load)
//       * round-robin   (walk the candidate list cyclically)
//   - Fall back to the local daemon when no fleet machines are
//     configured or every remote is unreachable.
//   - Never throw on a transport failure: each machine sample returns a
//     row regardless so the caller always sees a stable shape.
//
// Pure Node (no node-pty / no manager dep) so tests can drive it with
// injected clients. All remote HTTP goes through the same client that
// fleet.js uses, which supports a mock implementation for tests.

const fleetModule = require('./fleet');

// Location pin: if the task has location='<alias>' the dispatcher must
// route to that exact machine (or fall back to local when the alias is
// unreachable and the config allows it). This wraps the three strategy
// implementations so they share the same filter pipeline.

function buildPool(machines, options = {}) {
  // Copy + annotate so callers cannot mutate our working set.
  const pool = machines
    .filter((m) => m && m.host && m.port)
    .map((m) => ({
      alias: m.alias,
      host: m.host,
      port: m.port,
      authToken: m.authToken || '',
      tags: Array.isArray(m.tags) ? m.tags.slice() : [],
    }));
  if (options.locationPin) {
    // Explicit location match: only the named alias survives.
    return pool.filter((m) => m.alias === options.locationPin);
  }
  return pool;
}

// Sample every machine in parallel. `sampleClient` is swappable so tests
// can return fixed rows without real HTTP.
async function sampleFleet(pool, options = {}) {
  if (!pool || pool.length === 0) return [];
  const sampleClient = options.sampleClient || fleetModule.sampleMachine;
  const timeoutMs = options.timeoutMs || fleetModule.DEFAULT_OVERVIEW_TIMEOUT_MS;
  const httpClient = options.httpClient || undefined;
  const token = options.token || null;
  const samples = await Promise.all(
    pool.map((m) => sampleClient(m, { timeoutMs, httpClient, token }))
  );
  // sampleMachine returns a stable row per machine. We fold back the
  // pool fields (authToken, tags) because sample rows from older daemons
  // may not carry them.
  return samples.map((row, idx) => {
    const p = pool[idx];
    return {
      alias: row.alias || p.alias,
      host: row.host || p.host,
      port: row.port || p.port,
      ok: Boolean(row.ok),
      workers: typeof row.workers === 'number' ? row.workers : null,
      version: row.version || null,
      error: row.error || null,
      elapsedMs: row.elapsedMs || 0,
      tags: Array.isArray(row.tags) && row.tags.length > 0
        ? row.tags.slice()
        : p.tags.slice(),
      authToken: p.authToken,
    };
  });
}

function filterByTags(samples, tags) {
  if (!Array.isArray(tags) || tags.length === 0) return samples;
  const want = tags
    .map((t) => String(t).trim().toLowerCase())
    .filter((t) => t.length > 0);
  if (want.length === 0) return samples;
  return samples.filter((s) => {
    const have = new Set((s.tags || []).map((t) => String(t).toLowerCase()));
    return want.every((t) => have.has(t));
  });
}

function filterReachable(samples) {
  return samples.filter((s) => s.ok);
}

// ---- ranking + score breakdown --------------------------------------------

// Each strategy returns a {machine, score} row so operators can see why a
// placement was picked. The score is purely informational - the rank is
// the ordering of the returned array.

function rankLeastLoaded(samples) {
  // Lower workers = higher rank. Ties break by tag count (more specific
  // machines first), then alias for determinism.
  const sorted = samples.slice().sort((a, b) => {
    const wa = typeof a.workers === 'number' ? a.workers : Infinity;
    const wb = typeof b.workers === 'number' ? b.workers : Infinity;
    if (wa !== wb) return wa - wb;
    const ta = (a.tags || []).length;
    const tb = (b.tags || []).length;
    if (ta !== tb) return tb - ta;
    return String(a.alias).localeCompare(String(b.alias));
  });
  return sorted.map((s) => ({
    machine: s,
    score: {
      strategy: 'least-loaded',
      workers: typeof s.workers === 'number' ? s.workers : null,
      tagCount: (s.tags || []).length,
    },
  }));
}

function rankTagMatch(samples, requestedTags) {
  // Rank by (tag matches desc, load asc, alias asc). Machines that match
  // zero of the requested tags are still returned (last) so the caller
  // can fall back if nothing matches.
  const want = (requestedTags || [])
    .map((t) => String(t).trim().toLowerCase())
    .filter(Boolean);
  const scored = samples.map((s) => {
    const have = new Set((s.tags || []).map((t) => String(t).toLowerCase()));
    const matches = want.filter((t) => have.has(t)).length;
    return { s, matches };
  });
  scored.sort((a, b) => {
    if (a.matches !== b.matches) return b.matches - a.matches;
    const wa = typeof a.s.workers === 'number' ? a.s.workers : Infinity;
    const wb = typeof b.s.workers === 'number' ? b.s.workers : Infinity;
    if (wa !== wb) return wa - wb;
    return String(a.s.alias).localeCompare(String(b.s.alias));
  });
  return scored.map(({ s, matches }) => ({
    machine: s,
    score: {
      strategy: 'tag-match',
      tagMatches: matches,
      tagWanted: want.length,
      workers: typeof s.workers === 'number' ? s.workers : null,
    },
  }));
}

function rankRoundRobin(samples) {
  // Round-robin is stateless at rank time. The caller walks the list
  // cyclically via pickRoundRobin() once counts are known.
  const sorted = samples.slice().sort((a, b) =>
    String(a.alias).localeCompare(String(b.alias))
  );
  return sorted.map((s) => ({
    machine: s,
    score: {
      strategy: 'round-robin',
      workers: typeof s.workers === 'number' ? s.workers : null,
    },
  }));
}

const STRATEGIES = new Set(['least-loaded', 'tag-match', 'round-robin']);

function normalizeStrategy(s) {
  if (!s) return 'least-loaded';
  const k = String(s).trim().toLowerCase();
  if (STRATEGIES.has(k)) return k;
  throw new Error(`unknown strategy '${s}' (valid: least-loaded, tag-match, round-robin)`);
}

function rankMachines(samples, strategy, tags) {
  const strat = normalizeStrategy(strategy);
  if (strat === 'round-robin') return rankRoundRobin(samples);
  if (strat === 'tag-match') return rankTagMatch(samples, tags);
  return rankLeastLoaded(samples);
}

// ---- placement planner ----------------------------------------------------

// Produce a count-many placement plan. Each slot carries the chosen
// machine + strategy score + synthesized worker name so the daemon can
// issue `/create + /task` without inventing state.

function slotName(prefix, n) {
  return `${prefix || 'dispatch'}-${n}`;
}

function pickRoundRobin(ranked, count) {
  // Even-ish distribution: slot i -> ranked[i % ranked.length]. When the
  // slot count exceeds the machine count this wraps around so two slots
  // may land on the same machine.
  if (!ranked.length) return [];
  const plan = [];
  for (let i = 0; i < count; i++) {
    plan.push({
      slot: i,
      machine: ranked[i % ranked.length].machine,
      score: ranked[i % ranked.length].score,
    });
  }
  return plan;
}

function pickLeastLoadedIncremental(samples, count) {
  // Increment the chosen machine's simulated worker count so the second
  // slot does not collide on the same hottest machine. Re-rank each
  // iteration. Works for least-loaded *and* tag-match since both use
  // workers as the secondary sort key.
  const state = samples.map((s) => ({ ...s, _sim: typeof s.workers === 'number' ? s.workers : 0 }));
  const plan = [];
  for (let i = 0; i < count; i++) {
    state.sort((a, b) => {
      if (a._sim !== b._sim) return a._sim - b._sim;
      const ta = (a.tags || []).length;
      const tb = (b.tags || []).length;
      if (ta !== tb) return tb - ta;
      return String(a.alias).localeCompare(String(b.alias));
    });
    const chosen = state[0];
    plan.push({
      slot: i,
      machine: {
        alias: chosen.alias,
        host: chosen.host,
        port: chosen.port,
        authToken: chosen.authToken,
        tags: chosen.tags,
      },
      score: {
        strategy: 'least-loaded',
        workers: chosen._sim,
        tagCount: (chosen.tags || []).length,
      },
    });
    chosen._sim += 1;
  }
  return plan;
}

function pickTagMatchIncremental(samples, requestedTags, count) {
  const want = (requestedTags || [])
    .map((t) => String(t).trim().toLowerCase())
    .filter(Boolean);
  const state = samples.map((s) => {
    const have = new Set((s.tags || []).map((t) => String(t).toLowerCase()));
    const matches = want.filter((t) => have.has(t)).length;
    return { ...s, _sim: typeof s.workers === 'number' ? s.workers : 0, _matches: matches };
  });
  const plan = [];
  for (let i = 0; i < count; i++) {
    state.sort((a, b) => {
      if (a._matches !== b._matches) return b._matches - a._matches;
      if (a._sim !== b._sim) return a._sim - b._sim;
      return String(a.alias).localeCompare(String(b.alias));
    });
    const chosen = state[0];
    plan.push({
      slot: i,
      machine: {
        alias: chosen.alias,
        host: chosen.host,
        port: chosen.port,
        authToken: chosen.authToken,
        tags: chosen.tags,
      },
      score: {
        strategy: 'tag-match',
        tagMatches: chosen._matches,
        tagWanted: want.length,
        workers: chosen._sim,
      },
    });
    chosen._sim += 1;
  }
  return plan;
}

function planPlacement(samples, options = {}) {
  const count = options.count > 0 ? options.count : 1;
  const strategy = normalizeStrategy(options.strategy);
  const tags = Array.isArray(options.tags) ? options.tags : [];
  // tag-match also optionally filters to only tag-matching machines
  // when options.strictTags is true. Default behavior is "soft" - we
  // rank by match count but still allow zero-match machines as a fallback.
  let pool = samples;
  if (strategy === 'tag-match' && options.strictTags) {
    pool = filterByTags(samples, tags);
  } else if (tags && tags.length > 0 && options.strictTags) {
    pool = filterByTags(samples, tags);
  }
  if (pool.length === 0) return [];
  if (strategy === 'round-robin') {
    const ranked = rankRoundRobin(pool);
    return pickRoundRobin(ranked, count);
  }
  if (strategy === 'tag-match') {
    return pickTagMatchIncremental(pool, tags, count);
  }
  return pickLeastLoadedIncremental(pool, count);
}

// ---- top-level dispatcher -------------------------------------------------

// localMachine: synthesized row for the caller's own daemon. Passing it
// lets the dispatcher consider "local" alongside remote peers.
function buildLocalSample(localMachine) {
  if (!localMachine) return null;
  return {
    alias: localMachine.alias || '_local',
    host: localMachine.host || '127.0.0.1',
    port: localMachine.port || fleetModule.DEFAULT_PORT,
    ok: localMachine.ok !== false,
    workers: typeof localMachine.workers === 'number' ? localMachine.workers : 0,
    version: localMachine.version || null,
    error: null,
    elapsedMs: 0,
    tags: Array.isArray(localMachine.tags) ? localMachine.tags.slice() : [],
    authToken: localMachine.authToken || '',
  };
}

async function dispatch(options = {}) {
  const count = Math.max(1, parseInt(options.count, 10) || 1);
  const strategy = normalizeStrategy(options.strategy);
  const tags = Array.isArray(options.tags) ? options.tags : [];
  const task = typeof options.task === 'string' ? options.task : '';
  const namePrefix = options.namePrefix || 'dispatch';
  const branchPrefix = options.branchPrefix || '';
  const locationPin = options.location || null;

  const rawMachines = Array.isArray(options.machines)
    ? options.machines
    : fleetModule.listMachines(options.fleetOptions || {});
  const localSample = buildLocalSample(options.local);

  const pool = buildPool(rawMachines, { locationPin });

  // Fallback: no remote machines AND no local sample means nothing to
  // dispatch to. Emit an explicit fallback plan so the caller can react.
  if (pool.length === 0 && !localSample) {
    return {
      strategy,
      count,
      tags,
      fallback: 'no-machines',
      plan: [],
      samples: [],
    };
  }

  // Fallback: no remote machines but we have a local sample.
  if (pool.length === 0 && localSample) {
    const ranked = rankMachines([localSample], strategy, tags);
    const plan = (strategy === 'round-robin')
      ? pickRoundRobin(ranked, count)
      : (strategy === 'tag-match')
        ? pickTagMatchIncremental([localSample], tags, count)
        : pickLeastLoadedIncremental([localSample], count);
    return {
      strategy,
      count,
      tags,
      fallback: 'local-only',
      plan: plan.map((p, i) => enrichSlot(p, i, task, namePrefix, branchPrefix)),
      samples: [localSample],
    };
  }

  const samples = await sampleFleet(pool, options);
  const reachable = filterReachable(samples);
  const candidates = localSample ? reachable.concat([localSample]) : reachable;

  if (candidates.length === 0) {
    // Every remote unreachable and no local daemon in the mix. Return
    // an explicit fallback so the caller can hand the work to localhost.
    return {
      strategy,
      count,
      tags,
      fallback: 'all-unreachable',
      plan: [],
      samples,
    };
  }

  // Strict tag filter: if the caller supplied tags + a strategy that
  // demands a match, drop non-matching machines. For 'tag-match' the
  // filter is soft (ranked by match count). For 'least-loaded' and
  // 'round-robin' we only apply the filter when tags were supplied.
  const needFilter = tags && tags.length > 0;
  const filtered = needFilter && strategy !== 'tag-match'
    ? filterByTags(candidates, tags)
    : candidates;

  if (filtered.length === 0) {
    // Tags eliminated every candidate. Fall back to local if available.
    if (localSample) {
      const plan = pickLeastLoadedIncremental([localSample], count);
      return {
        strategy,
        count,
        tags,
        fallback: 'tags-no-match',
        plan: plan.map((p, i) => enrichSlot(p, i, task, namePrefix, branchPrefix)),
        samples,
      };
    }
    return {
      strategy,
      count,
      tags,
      fallback: 'tags-no-match',
      plan: [],
      samples,
    };
  }

  const plan = planPlacement(filtered, { count, strategy, tags });
  return {
    strategy,
    count,
    tags,
    fallback: null,
    plan: plan.map((p, i) => enrichSlot(p, i, task, namePrefix, branchPrefix)),
    samples,
  };
}

function enrichSlot(slot, index, task, namePrefix, branchPrefix) {
  const name = slotName(namePrefix, index + 1);
  const branch = branchPrefix ? `${branchPrefix}-${index + 1}` : '';
  return {
    slot: slot.slot != null ? slot.slot : index,
    name,
    branch,
    task,
    machine: {
      alias: slot.machine.alias,
      host: slot.machine.host,
      port: slot.machine.port,
      tags: Array.isArray(slot.machine.tags) ? slot.machine.tags.slice() : [],
    },
    score: slot.score || {},
  };
}

module.exports = {
  STRATEGIES: Array.from(STRATEGIES),
  normalizeStrategy,
  buildPool,
  sampleFleet,
  filterByTags,
  filterReachable,
  rankLeastLoaded,
  rankTagMatch,
  rankRoundRobin,
  rankMachines,
  pickRoundRobin,
  pickLeastLoadedIncremental,
  pickTagMatchIncremental,
  planPlacement,
  buildLocalSample,
  dispatch,
};
