'use strict';

// Meeting action-items extractor (Phase 6.5).
//
// Walks the transcript of a MeetingSession and pulls out structured
// items tagged with [DECISION], [ACTION], [TODO], [BLOCKER]. The
// extracted list is the bridge between "consensus reached" and
// "operator copies the work into their tracking system" — without
// it, the only deliverable from a meeting is the wiki markdown,
// which buries the work plan inside prose.
//
// Tag forms supported (case-insensitive on the keyword):
//   [DECISION] free text up to next [tag] or end of sentence
//   [DECISION: text]            ← bracket-enclosed inline form
//   [ACTION owner=alice] text   ← optional space-separated key=value
//   [ACTION] @alice please do X ← @owner shorthand
//
// Output items carry stage / specialistId / round / ts so the
// operator can trace each item back to the source turn.

const TAG_KINDS = Object.freeze({
  decision: 'decision',
  action: 'action',
  todo: 'todo',
  blocker: 'blocker',
});

const TAG_RE = /\[\s*(DECISION|ACTION|TODO|BLOCKER)\b([^\]]*)\]\s*([^[\n]*)/gi;
const KV_RE = /\b(owner|by)\s*=\s*(\S+)/i;
const AT_OWNER_RE = /@([a-z0-9][\w.-]*)/i;

function _classify(rawTag) {
  return TAG_KINDS[rawTag.toLowerCase()] || null;
}

// Pull `owner=` or leading `@user` out of the captured text. Also
// strip these tokens from the visible body so the operator-facing
// summary doesn't echo metadata.
function _extractOwner(insideTag, afterTag) {
  let owner = null;
  // owner=foo / by=foo lives inside the tag bracket.
  const m1 = (insideTag || '').match(KV_RE);
  if (m1) owner = m1[2];
  // @user shorthand lives immediately after the tag.
  if (!owner) {
    const m2 = (afterTag || '').match(AT_OWNER_RE);
    if (m2) owner = m2[1];
  }
  return owner;
}

function _cleanBody(text) {
  if (typeof text !== 'string') return '';
  // Drop a leading colon that operators sometimes type after the
  // closing bracket: `[DECISION] : we ship Friday`.
  return text.replace(/^[:\s-]+/, '').replace(/^@[a-z0-9][\w.-]*\s*/i, '').trim();
}

// Walk a single turn's text, returning the action-item objects it
// contains (potentially zero or many).
function _extractFromTurn(turn, stageInfo) {
  const text = (turn && turn.text) || '';
  if (!text) return [];
  const out = [];
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(text)) !== null) {
    const kind = _classify(m[1]);
    if (!kind) continue;
    const insideTag = m[2] || '';
    const afterTag = m[3] || '';
    const owner = _extractOwner(insideTag, afterTag);
    let body = _cleanBody(afterTag);
    // Bracket-enclosed inline form: [DECISION: text]
    if (!body && /:/.test(insideTag)) {
      body = _cleanBody(insideTag.split(':').slice(1).join(':'));
    }
    out.push({
      type: kind,
      text: body,
      owner,
      stage: stageInfo.stage,
      round: turn.round || 0,
      specialistId: turn.specialistId || null,
      ts: turn.ts || null,
    });
  }
  return out;
}

// Public entry point.
//
//   session  required, MeetingSession instance (or anything with
//            .transcripts: array per stage of {round, specialistId,
//            text, ts}, plus .plan.stages[idx].stage)
function extractActionItems(session) {
  if (!session) throw new Error('extractActionItems: session is required');
  const stages = (session.plan && session.plan.stages) || [];
  const transcripts = session._transcripts;
  if (!Array.isArray(transcripts)) {
    // Fall back to toJSON envelope if internal field is gone.
    const j = typeof session.toJSON === 'function' ? session.toJSON() : null;
    if (j && Array.isArray(j.transcripts)) {
      return _extractFromArray(j.transcripts, j.stages || []);
    }
    return { count: 0, byType: {}, items: [] };
  }
  return _extractFromArray(transcripts, stages);
}

function _extractFromArray(transcripts, stages) {
  const items = [];
  for (let i = 0; i < transcripts.length; i += 1) {
    const stageInfo = stages[i] || {};
    for (const turn of transcripts[i] || []) {
      for (const it of _extractFromTurn(turn, stageInfo)) items.push(it);
    }
  }
  const byType = { decision: 0, action: 0, todo: 0, blocker: 0 };
  for (const it of items) byType[it.type] = (byType[it.type] || 0) + 1;
  return { count: items.length, byType, items };
}

module.exports = {
  extractActionItems,
  // exported for tests
  _extractFromTurn,
  _extractOwner,
  TAG_KINDS,
};
