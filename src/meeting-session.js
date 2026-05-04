'use strict';

const { EventEmitter } = require('events');

// MeetingSession (Phase 2.2 of multi-specialist system).
//
// Stateful record for a planned meeting (`planMeeting()` output) as
// it progresses through pipeline stages. Phase 2.2 ships the state
// machine + transcript + per-stage round counter + objection
// tracking + consensus check. Phase 2.3 will plug real specialist
// agents (claude-code adapter etc.) into `contribute()`; for now
// any caller (CLI, HTTP, future orchestrator) can drive the
// meeting by hand.
//
// See docs/multi-specialist-system.md §6/§7 for the design.

const { CONSENSUS_POLICY } = require('./meeting-plan');

const VALID_STATUSES = Object.freeze([
  'pending',       // created from a plan, not started yet
  'in-progress',   // started, walking stages
  'completed',     // every stage hit consensus
  'escalated',     // round cap or veto without resolution
  'aborted',       // operator gave up
]);

const VALID_VOTES = Object.freeze(['accept', 'object']);

function _now() { return new Date().toISOString(); }

class MeetingSession extends EventEmitter {
  constructor(plan, opts = {}) {
    super();
    if (!plan || typeof plan !== 'object') {
      throw new Error('MeetingSession: plan is required');
    }
    if (!plan.meetingId || !Array.isArray(plan.stages) || plan.stages.length === 0) {
      throw new Error('MeetingSession: plan is missing meetingId / stages');
    }
    this._plan = plan;
    this._status = 'pending';
    this._createdAt = opts.createdAt || _now();
    this._startedAt = null;
    this._completedAt = null;
    // EventEmitter has a 10-listener default that warns on the 11th
    // — for a high-traffic SSE endpoint with many subscribers we
    // raise it. Unbounded would risk leak detection silence;
    // 100 is plenty for typical operator + web UI + c4 watch CLI.
    this.setMaxListeners(100);

    // Walking the stage list. currentStageIndex always points at
    // the active stage; rounds[stageIndex] is the round count for
    // that stage (1-based after start()).
    this._currentStageIndex = 0;
    this._rounds = new Array(plan.stages.length).fill(0);

    // Per-stage transcript: array of {round, specialistId, text, ts}.
    this._transcripts = plan.stages.map(() => []);

    // Per-stage votes — append-only. Latest vote per (stage,
    // specialistId) wins; helpers below reduce to a current view.
    this._votes = plan.stages.map(() => []);

    // Escalation reasons accumulate even if the meeting later
    // recovers (good for retro signals).
    this._escalations = [];
  }

  // --- Read accessors ---

  get id()        { return this._plan.meetingId; }
  get plan()      { return this._plan; }
  get status()    { return this._status; }
  get createdAt() { return this._createdAt; }
  get startedAt() { return this._startedAt; }
  get completedAt() { return this._completedAt; }

  get currentStage() {
    if (this._currentStageIndex >= this._plan.stages.length) return null;
    return this._plan.stages[this._currentStageIndex].stage;
  }

  get currentRound() {
    return this._rounds[this._currentStageIndex] || 0;
  }

  get policy() {
    return CONSENSUS_POLICY[this._plan.track];
  }

  // --- Mutations ---

  start() {
    if (this._status !== 'pending') {
      throw new Error(`MeetingSession.start: cannot start from status "${this._status}"`);
    }
    this._status = 'in-progress';
    this._startedAt = _now();
    // Round 1 begins automatically on start so callers can immediately
    // record contributions without an explicit "advance to round 1".
    this._rounds[this._currentStageIndex] = 1;
    this._emitState('started', { stage: this.currentStage, round: 1 });
    return this.toJSON();
  }

  // SSE-friendly snapshot helper — never throws. Callers that don't
  // attach listeners (constructor-only path) still go through here
  // so the contract is uniform.
  _emitState(event, payload = {}) {
    try {
      this.emit('state', { event, payload, status: this._status, ts: _now() });
      this.emit(event, payload);
    } catch { /* swallow — events must not break state mutation */ }
  }

  // Append a contribution. options.vote ∈ {'accept'|'object'} records
  // the specialist's stance for the *current* round; omit to record
  // a contribution without a vote (early in a round). Latest vote per
  // (stage, specialistId) is what consensus checking looks at.
  contribute(specialistId, text, options = {}) {
    this._requireInProgress('contribute');
    if (!specialistId || typeof specialistId !== 'string') {
      throw new Error('contribute: specialistId is required');
    }
    if (typeof text !== 'string') {
      throw new Error('contribute: text must be a string');
    }
    const stageIdx = this._currentStageIndex;
    const round = this._rounds[stageIdx];
    const turn = {
      stage: this.currentStage,
      round,
      specialistId,
      text,
      ts: _now(),
    };
    this._transcripts[stageIdx].push(turn);

    if (options.vote != null) {
      if (!VALID_VOTES.includes(options.vote)) {
        throw new Error(`contribute: vote must be one of ${VALID_VOTES.join('|')}`);
      }
      this._recordVote(stageIdx, specialistId, options.vote, options.reason || null);
    }
    this._emitState('turn', { turn });
    return turn;
  }

  // Standalone vote recorder — useful when a specialist objects
  // without producing a new written contribution.
  recordVote(specialistId, vote, reason = null) {
    this._requireInProgress('recordVote');
    if (!VALID_VOTES.includes(vote)) {
      throw new Error(`recordVote: vote must be one of ${VALID_VOTES.join('|')}`);
    }
    this._recordVote(this._currentStageIndex, specialistId, vote, reason);
    const view = this.consensusView();
    this._emitState('vote', { specialistId, vote, reason, view });
    return view;
  }

  _recordVote(stageIdx, specialistId, vote, reason) {
    this._votes[stageIdx].push({
      round: this._rounds[stageIdx],
      specialistId,
      vote,
      reason,
      ts: _now(),
    });
  }

  // Latest-vote-per-specialist for the current stage. Used by both
  // the consensus check and the CLI / HTTP read paths.
  consensusView(stageIdx = this._currentStageIndex) {
    const map = new Map();
    for (const v of this._votes[stageIdx]) {
      map.set(v.specialistId, v);
    }
    const stage = this._plan.stages[stageIdx];
    const expected = stage.specialists.map((s) => s.id);
    const accepts = [];
    const objects = [];
    const missing = [];
    for (const id of expected) {
      const latest = map.get(id);
      if (!latest) { missing.push(id); continue; }
      if (latest.vote === 'accept') accepts.push(id);
      else if (latest.vote === 'object') objects.push({ id, reason: latest.reason });
    }
    return {
      stage: stage.stage,
      round: this._rounds[stageIdx],
      mode: this.policy.mode,
      roundCap: this.policy.roundCap,
      allowVeto: this.policy.allowVeto,
      expected,
      accepts,
      objects,
      missing,
      reached: this._consensusReached(stage, accepts, objects, missing),
    };
  }

  _consensusReached(stage, accepts, objects, missing) {
    const policy = this.policy;
    switch (policy.mode) {
      case 'consensus':
        // Every specialist must have voted accept; any object blocks.
        // Veto roles (their object alone) keep us from advancing
        // regardless of accept count.
        if (missing.length > 0) return false;
        return objects.length === 0;
      case 'quorum':
        // Simple majority of voters. Missing votes count as
        // abstentions but the policy still requires every
        // specialist to weigh in (we are not a remote-vote
        // democracy with quorum-by-headcount). Veto roles still
        // block when they object even in quorum mode.
        if (missing.length > 0) return false;
        if (policy.allowVeto && this._anyVetoObject(stage, objects)) return false;
        return accepts.length > objects.length;
      case 'dri': {
        // Lightweight track — first specialist on the roster is the
        // DRI; their accept is sufficient and other specialists are
        // advisory. A DRI 'object' or absence blocks; other
        // specialists' missing votes do not.
        if (stage.specialists.length === 0) return false;
        const driId = stage.specialists[0].id;
        if (missing.includes(driId)) return false;
        return accepts.includes(driId);
      }
      default:
        return false;
    }
  }

  _anyVetoObject(stage, objects) {
    if (!objects || objects.length === 0) return false;
    const vetoIds = new Set(stage.specialists.filter((s) => s.vetoPower).map((s) => s.id));
    for (const o of objects) {
      if (vetoIds.has(o.id)) return true;
    }
    return false;
  }

  // Try to advance to the next stage. Returns:
  //   { advanced: true, newStage, status: 'in-progress' | 'completed' }
  //   { advanced: false, reason: 'consensus-not-reached' | 'round-cap-reached' | ... }
  //
  // If consensus is not reached but the round cap is also not yet
  // hit, callers can call `nextRound()` to give specialists another
  // try without escalating.
  advanceStage() {
    this._requireInProgress('advanceStage');
    const view = this.consensusView();
    if (!view.reached) {
      return { advanced: false, reason: 'consensus-not-reached', view };
    }
    this._currentStageIndex += 1;
    if (this._currentStageIndex >= this._plan.stages.length) {
      this._status = 'completed';
      this._completedAt = _now();
      this._emitState('completed', {});
      return { advanced: true, status: 'completed', newStage: null };
    }
    this._rounds[this._currentStageIndex] = 1;
    this._emitState('advanced', { newStage: this.currentStage });
    return {
      advanced: true,
      status: 'in-progress',
      newStage: this.currentStage,
    };
  }

  // Bump the round counter on the current stage. Errors if the
  // policy round cap would be exceeded — caller should escalate
  // instead. Resets votes for the new round? — no: we keep the
  // append-only history and consensusView() picks the latest.
  nextRound() {
    this._requireInProgress('nextRound');
    const stageIdx = this._currentStageIndex;
    const cur = this._rounds[stageIdx];
    if (cur >= this.policy.roundCap) {
      return {
        bumped: false,
        reason: 'round-cap-reached',
        currentRound: cur,
        cap: this.policy.roundCap,
      };
    }
    this._rounds[stageIdx] = cur + 1;
    this._emitState('next-round', { stage: this.currentStage, round: this._rounds[stageIdx] });
    return { bumped: true, round: this._rounds[stageIdx] };
  }

  escalate(reason = 'unspecified') {
    if (this._status === 'completed' || this._status === 'aborted') {
      throw new Error(`escalate: cannot escalate from terminal status "${this._status}"`);
    }
    this._status = 'escalated';
    this._completedAt = _now();
    this._escalations.push({ reason, ts: this._completedAt });
    this._emitState('escalated', { reason });
    return this.toJSON();
  }

  abort(reason = 'unspecified') {
    if (this._status === 'completed' || this._status === 'aborted') {
      throw new Error(`abort: cannot abort from terminal status "${this._status}"`);
    }
    this._status = 'aborted';
    this._completedAt = _now();
    this._escalations.push({ reason, ts: this._completedAt, terminal: true });
    this._emitState('aborted', { reason });
    return this.toJSON();
  }

  // --- Helpers ---

  transcript(stageIdx = null) {
    if (stageIdx == null) {
      const flat = [];
      for (const arr of this._transcripts) for (const t of arr) flat.push(t);
      return flat;
    }
    return this._transcripts[stageIdx] ? this._transcripts[stageIdx].slice() : [];
  }

  toJSON() {
    return {
      id: this.id,
      status: this._status,
      track: this._plan.track,
      title: this._plan.title,
      task: this._plan.task,
      forkOf: this._plan.forkOf || null,
      createdAt: this._createdAt,
      startedAt: this._startedAt,
      completedAt: this._completedAt,
      currentStage: this.currentStage,
      currentRound: this.currentRound,
      stages: this._plan.stages.map((s, idx) => ({
        stage: s.stage,
        round: this._rounds[idx],
        specialists: s.specialists.map((sp) => ({
          id: sp.id,
          displayName: sp.displayName,
          vetoPower: !!sp.vetoPower,
        })),
        consensus: this.consensusView(idx),
      })),
      transcripts: this._transcripts,
      votes: this._votes,
      escalations: this._escalations,
    };
  }

  // Phase 7.2 — richer envelope for the persistence layer.
  // toJSON() is the public API contract (UI / SSE); it elides the
  // full plan to keep payloads compact. Persistence needs the FULL
  // plan (deliverables, cap, candidates, exploreSlots, consensusPolicy)
  // plus the internal stage index + round counters so rehydrate
  // can rebuild the session exactly. Kept private (underscore prefix)
  // so external callers don't accidentally rely on it.
  _persistSnapshot() {
    const j = this.toJSON();
    j.plan = this._plan;
    j._currentStageIndex = this._currentStageIndex;
    j._rounds = this._rounds.slice();
    return j;
  }

  // Phase 7.3 — rehydrate a MeetingSession from a snapshot
  // produced by `_persistSnapshot()`. The constructor's normal path
  // initializes a fresh session in the 'pending' state; this factory
  // restores the prior state (status, completion timestamps,
  // transcripts, votes, escalations, and the stage cursor) so a
  // daemon restart resumes mid-flight meetings exactly where they
  // were. We deliberately mutate state fields directly without
  // emitting `state` events — there are no observers yet at
  // rehydrate time, and we don't want to log spurious transitions.
  static fromJSON(snap) {
    if (!snap || typeof snap !== 'object') {
      throw new Error('MeetingSession.fromJSON: snapshot required');
    }
    if (!snap.plan || !snap.id) {
      throw new Error('MeetingSession.fromJSON: snapshot must include plan + id');
    }
    const sess = new MeetingSession(snap.plan, { createdAt: snap.createdAt });
    sess._status = snap.status || 'pending';
    sess._startedAt = snap.startedAt || null;
    sess._completedAt = snap.completedAt || null;
    if (Number.isFinite(snap._currentStageIndex)) {
      sess._currentStageIndex = snap._currentStageIndex;
    }
    if (Array.isArray(snap._rounds)) {
      sess._rounds = snap._rounds.slice();
    }
    if (Array.isArray(snap.transcripts)) {
      sess._transcripts = snap.transcripts.map((arr) => Array.isArray(arr) ? arr.slice() : []);
    }
    if (Array.isArray(snap.votes)) {
      sess._votes = snap.votes.map((arr) => Array.isArray(arr) ? arr.slice() : []);
    }
    if (Array.isArray(snap.escalations)) {
      sess._escalations = snap.escalations.slice();
    }
    return sess;
  }

  _requireInProgress(op) {
    if (this._status !== 'in-progress') {
      throw new Error(`${op}: meeting must be in-progress (got "${this._status}")`);
    }
  }
}

// --- In-memory store ---
//
// Phase 2.2 keeps every active meeting in process memory. Phase 3
// (the c4-wiki memory layer) will persist meetings to
// `c4-wiki/meetings/<date>-<slug>.md` so they survive daemon
// restart and feed the institutional memory described in §9.

class MeetingStore extends EventEmitter {
  constructor(opts = {}) {
    super();
    this._byId = new Map();
    // Phase 6.2: lots of clients can subscribe to put/remove events
    // (web UI, /meetings/stream). Bump the cap so the default
    // 10-listener warning does not fire under normal usage.
    this.setMaxListeners(64);

    // Phase 7.2 — optional durable backing. When `persist` is set,
    // every put/remove and every per-session state mutation is
    // mirrored to disk. The store still owns the in-memory map for
    // fast read; persistence is purely about surviving daemon
    // restarts.
    this._persist = opts.persist || null;
    // Map of session.id → state listener fn so we can remove the
    // listener cleanly on remove() (avoids leaks on long-running
    // daemons that churn many meetings).
    this._stateListeners = new Map();
  }

  put(session) {
    if (!(session instanceof MeetingSession)) {
      throw new Error('MeetingStore.put: session must be a MeetingSession');
    }
    const isNew = !this._byId.has(session.id);
    this._byId.set(session.id, session);
    if (this._persist) {
      // Initial save covers the pending row even before the first
      // state mutation; required so a daemon restart immediately
      // after createMeeting recovers it.
      try { this._persist.save(session); }
      catch (err) { process.stderr.write(`[meeting-store] initial persist failed for ${session.id}: ${err.message}\n`); }
      // Subscribe to state events for this session so subsequent
      // mutations re-save. Idempotent — re-put of the same session
      // doesn't double-attach because we check the listener map.
      if (!this._stateListeners.has(session.id)) {
        const fn = () => {
          try { this._persist.save(session); }
          catch (err) { process.stderr.write(`[meeting-store] state persist failed for ${session.id}: ${err.message}\n`); }
        };
        session.on('state', fn);
        this._stateListeners.set(session.id, fn);
      }
    }
    if (isNew) {
      try { this.emit('put', session); } catch { /* never crash put on listener err */ }
    }
    return session;
  }

  get(id) { return this._byId.get(id) || null; }

  list({ status = null } = {}) {
    const out = [];
    for (const s of this._byId.values()) {
      if (status && s.status !== status) continue;
      out.push(s);
    }
    return out;
  }

  remove(id) {
    const sess = this._byId.get(id);
    const had = this._byId.delete(id);
    if (had) {
      // Detach the state listener so the session can be GC'd; if
      // it lives on after store eviction, our listener won't drag it
      // back into a save cycle.
      const fn = this._stateListeners.get(id);
      if (fn && sess) {
        try { sess.removeListener('state', fn); } catch { /* tolerate */ }
        this._stateListeners.delete(id);
      }
      if (this._persist) {
        try { this._persist.remove(id); }
        catch (err) { process.stderr.write(`[meeting-store] persist remove failed for ${id}: ${err.message}\n`); }
      }
      try { this.emit('remove', id); } catch { /* never crash remove on listener err */ }
    }
    return had;
  }

  clear() {
    // Detach every state listener before wiping the map so dropped
    // sessions (still held elsewhere via reference) don't keep
    // re-saving through us.
    for (const [id, fn] of this._stateListeners) {
      const sess = this._byId.get(id);
      if (sess) { try { sess.removeListener('state', fn); } catch { /* tolerate */ } }
    }
    this._stateListeners.clear();
    this._byId.clear();
    // Note: clear() does NOT touch the persist layer — operators who
    // want to wipe disk too should call persist directly. Keeping
    // clear() in-memory-only matches the prior behavior (some tests
    // rely on it not deleting persisted state).
  }

  // Phase 7.3 — rehydrate every session from the persistence layer
  // into the in-memory map. Called once at daemon boot, after
  // `getShared({ persist })` wiring. Returns `{count, errors[]}`
  // so the caller can log a summary. Bad rows (corrupt JSON,
  // missing plan) are skipped + tallied but never throw — the
  // daemon must always come up.
  rehydrate() {
    if (!this._persist) return { count: 0, errors: [] };
    const errors = [];
    let restored = 0;
    let rows;
    try { rows = this._persist.loadAll(); }
    catch (err) {
      errors.push({ id: null, reason: `loadAll: ${err.message}` });
      return { count: 0, errors };
    }
    for (const data of rows) {
      let sess;
      try { sess = MeetingSession.fromJSON(data); }
      catch (err) {
        errors.push({ id: data && data.id, reason: err.message });
        continue;
      }
      // Bypass put()'s initial-save (we just loaded from disk; no
      // need to write back). Subscribe the state listener for
      // future mutations the same way put() does.
      const isNew = !this._byId.has(sess.id);
      this._byId.set(sess.id, sess);
      if (isNew && !this._stateListeners.has(sess.id)) {
        const fn = () => {
          try { this._persist.save(sess); }
          catch (err) {
            process.stderr.write(`[meeting-store] state persist failed for ${sess.id}: ${err.message}\n`);
          }
        };
        sess.on('state', fn);
        this._stateListeners.set(sess.id, fn);
        try { this.emit('put', sess); } catch { /* tolerate */ }
        restored += 1;
      }
    }
    return { count: restored, errors };
  }

  get size() { return this._byId.size; }
}

let _shared = null;
function getShared(opts) {
  if (!_shared) _shared = new MeetingStore(opts);
  return _shared;
}
function resetShared() { _shared = null; }

module.exports = {
  MeetingSession,
  MeetingStore,
  getShared,
  resetShared,
  VALID_STATUSES,
  VALID_VOTES,
};
