'use strict';

// Peer-vote retro (Phase 4.2 of multi-specialist system).
//
// After a meeting is terminal, ask each specialist who participated
// to rate their peers on a 0-5 scale with a brief reason. Aggregate
// per-(rater, ratee), then per ratee. Feed the result into the
// retro deltas as an additional score signal — independent from the
// outcome-grounded signal computed in src/meeting-retro.js.
//
// Why this instead of a full sub-meeting:
//   - peer voting is a well-bounded ask (one prompt per rater)
//     so spawning a whole new MeetingSession would be overkill
//   - we already have BrainProvider; this module just orchestrates
//     N parallel asks with a structured prompt + parser
//   - the original meeting's transcript is rich enough context
//     for the rater to weigh the peer's contribution
//
// Output shape:
//   { sessionId, raters, ratees, raw: [{rater, ratee, rating, reason}],
//     perRatee: {<id>: { mean, votes, raters }},
//     deltas:   {<id>: { byDomain, byStage, samples, contribution }} }
//
// `deltas` mirrors src/meeting-retro.js so applyRetroDeltas() can
// fold the peer signal into the registry the same way.

const { BrainProvider } = require('./meeting-brain');

// Match `[RATING: <ratee-id> <0-5> [— reason]]` — same liberal
// separator policy as parseVote so brain output drift doesn't
// silently lose ratings.
const RATING_LINE = /\[\s*RATING\s*:\s*([a-z][a-z0-9-]*)\s+(\d(?:\.\d)?)\s*(?:[—:\-]\s*(.*?))?\s*\]/gi;

const DEFAULT_PEER_PROMPT_HEADER = `# Peer retro

You participated in the meeting above. Rate each peer on a 0–5
scale where 0 = no contribution, 5 = exceptional contribution.
Be honest — peer ratings feed the dispatcher's selection
weights for future meetings.

For each peer (one line each):
  [RATING: <peer-id> <0..5> — short reason]

Skip self. Skip peers you did not interact with.`;

function parseRatings(text, raterId, validRatees) {
  const out = [];
  if (!text || typeof text !== 'string') return out;
  const seen = new Set();
  let m;
  RATING_LINE.lastIndex = 0;
  while ((m = RATING_LINE.exec(text)) !== null) {
    const ratee = m[1].toLowerCase();
    const rating = parseFloat(m[2]);
    const reason = m[3] ? m[3].trim() : null;
    if (!Number.isFinite(rating) || rating < 0 || rating > 5) continue;
    if (ratee === raterId) continue;
    if (validRatees && !validRatees.has(ratee)) continue;
    if (seen.has(ratee)) continue;
    seen.add(ratee);
    out.push({ rater: raterId, ratee, rating, reason });
  }
  return out;
}

function buildPeerPrompt(rater, sessionJson, opts = {}) {
  const lines = [];
  lines.push(rater.systemPrompt || `[Role: ${rater.id}]`);
  lines.push('');
  lines.push('# Meeting that just concluded');
  lines.push(`Task: ${sessionJson.task}`);
  lines.push(`Track: ${sessionJson.track}  Outcome: ${sessionJson.status}`);
  lines.push('');
  lines.push('## Transcript');
  lines.push('');
  // Flat transcript view — bounded by char limit so prompts stay sane.
  const charBudget = Number.isFinite(opts.transcriptCharBudget) ? opts.transcriptCharBudget : 6000;
  const flat = [];
  for (let i = 0; i < (sessionJson.transcripts || []).length; i += 1) {
    for (const turn of sessionJson.transcripts[i] || []) {
      flat.push(`[${turn.stage} r${turn.round}] ${turn.specialistId}: ${turn.text}`);
    }
  }
  let used = 0;
  for (const f of flat) {
    if (used + f.length > charBudget) {
      lines.push('…(transcript truncated for prompt budget)');
      break;
    }
    lines.push(f);
    used += f.length;
  }
  lines.push('');
  lines.push(opts.promptHeader || DEFAULT_PEER_PROMPT_HEADER);
  lines.push('');
  lines.push(`You are speaking as **${rater.id}**.`);
  lines.push('Eligible peers (rate up to all that contributed):');
  for (const peerId of opts.peerIds) {
    if (peerId === rater.id) continue;
    lines.push(`  - ${peerId}`);
  }
  return lines.join('\n');
}

// Run a peer retro against a brain.
//
// opts:
//   brain          required, BrainProvider instance
//   registry       optional SpecialistRegistry to look up systemPrompts
//                  + domain lists for delta aggregation
//   includeSilent  default false — only ask raters who actually
//                  contributed at least one turn
//   transcriptCharBudget  passed to buildPeerPrompt
async function runPeerRetro(session, opts = {}) {
  const sessionJson = (typeof session.toJSON === 'function') ? session.toJSON() : session;
  if (!sessionJson || !sessionJson.id) {
    throw new Error('runPeerRetro: invalid session');
  }
  if (!['completed', 'escalated', 'aborted'].includes(sessionJson.status)) {
    throw new Error(`runPeerRetro: meeting must be terminal (got "${sessionJson.status}")`);
  }
  if (!opts.brain || !(opts.brain instanceof BrainProvider)) {
    throw new Error('runPeerRetro: brain (BrainProvider instance) is required');
  }
  const registry = opts.registry || null;

  // Collect every speaker across all stages, deduped.
  const speakerSet = new Set();
  for (const turns of sessionJson.transcripts || []) {
    for (const t of turns) speakerSet.add(t.specialistId);
  }
  const raters = opts.includeSilent
    ? new Set(sessionJson.stages.flatMap((s) => s.specialists.map((sp) => sp.id)))
    : speakerSet;
  const ratees = new Set(speakerSet);

  // Build the eligible-peers list (same as ratees for now).
  const peerIds = [...ratees];

  const raw = [];
  for (const raterId of raters) {
    let raterSpec = null;
    // Pull systemPrompt + domains from the registry when present.
    if (registry && registry.get) {
      const full = registry.get(raterId);
      if (full) raterSpec = full;
    }
    if (!raterSpec) {
      // Fallback to the plan snapshot if registry doesn't carry it.
      for (const stage of sessionJson.stages) {
        const sp = stage.specialists.find((s) => s.id === raterId);
        if (sp) { raterSpec = sp; break; }
      }
    }
    if (!raterSpec) continue;

    const prompt = buildPeerPrompt(raterSpec, sessionJson, {
      peerIds,
      transcriptCharBudget: opts.transcriptCharBudget,
      promptHeader: opts.promptHeader,
    });
    let reply;
    try {
      reply = await opts.brain.ask(raterSpec, prompt, {
        plan: { task: sessionJson.task, track: sessionJson.track },
        currentStage: 'retro',
        currentRound: 1,
        transcriptSoFar: [],
        lastView: { objects: [] },
      });
    } catch (err) {
      // Skip this rater — peer retro continues with whoever responds.
      continue;
    }
    const ratings = parseRatings(reply.text || '', raterId, ratees);
    for (const r of ratings) raw.push(r);
  }

  // Aggregate per ratee.
  const perRatee = {};
  for (const id of ratees) {
    perRatee[id] = { mean: null, votes: 0, raters: [] };
  }
  for (const r of raw) {
    const bucket = perRatee[r.ratee];
    if (!bucket) continue;
    bucket.votes += 1;
    bucket.raters.push(r.rater);
    bucket.mean = ((bucket.mean || 0) * (bucket.votes - 1) + r.rating) / bucket.votes;
  }

  // Convert to deltas in the same shape as meeting-retro.js so
  // applyRetroDeltas can fold them in. Per design §8.3, peer
  // signal is the *weakest* of the three — we map mean rating
  // [0..5] linearly to [-1..+1] (with 2.5 as neutral mid-point).
  const deltas = {};
  for (const [id, agg] of Object.entries(perRatee)) {
    if (agg.votes === 0) continue;
    const sig = (agg.mean - 2.5) / 2.5; // -1 .. +1
    const fullSpec = registry && registry.get ? registry.get(id) : null;
    const domainList = (fullSpec && fullSpec.domain) || [];
    // Stage signal = the stage(s) where this specialist actually
    // spoke. Use the first stage they appeared on for now.
    const stages = new Set();
    for (let i = 0; i < (sessionJson.transcripts || []).length; i += 1) {
      for (const t of sessionJson.transcripts[i] || []) {
        if (t.specialistId === id) stages.add(t.stage);
      }
    }
    const byStage = {};
    const samples = {};
    for (const s of stages) {
      byStage[s] = sig;
      samples[`stage:${s}`] = 1;
    }
    const byDomain = {};
    for (const d of domainList) {
      byDomain[d] = sig;
      samples[`domain:${d}`] = 1;
    }
    deltas[id] = {
      contribution: agg.votes,
      byStage,
      byDomain,
      samples,
      _peerSource: { mean: agg.mean, votes: agg.votes, raters: agg.raters },
    };
  }

  return {
    sessionId: sessionJson.id,
    raters: [...raters],
    ratees: [...ratees],
    raw,
    perRatee,
    deltas,
  };
}

module.exports = {
  runPeerRetro,
  buildPeerPrompt,
  parseRatings,
  RATING_LINE,
  DEFAULT_PEER_PROMPT_HEADER,
};
