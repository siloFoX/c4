'use strict';

// Specialist prompt-iterate analyzer (Phase 5.1 of multi-specialist
// system).
//
// Walks the registry and identifies specialists whose persisted
// retro signal has stayed negative across enough samples that the
// dispatcher is now actively deprioritizing them. The output is a
// human-readable report — phase 5.2 will optionally feed each
// flagged specialist + recent transcripts into a brain to produce a
// suggested system-prompt revision (manual review required, never
// auto-applied per design doc §10).
//
// Heuristics (tunable via opts):
//   - DEFAULT_NEGATIVE_THRESHOLD = -0.3
//     A specialist's per-domain or per-stage score below this is
//     considered "underperforming" for that bucket.
//   - DEFAULT_MIN_SAMPLES = 5
//     Sample-count gate so we don't flag specialists with one bad
//     retro. Conservative because false positives erode operator
//     trust quickly; better to miss a marginal case than to mark
//     a stable specialist as broken.
//
// The analyzer is read-only — pure analysis on the registry's
// public list() output. No daemon state mutation.

const DEFAULT_NEGATIVE_THRESHOLD = -0.3;
const DEFAULT_MIN_SAMPLES = 5;

function _isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// Analyze a single specialist. Returns null if the specialist has
// no flagged buckets, otherwise an object describing the
// underperformance with enough context for a follow-up
// retro-meeting or prompt-rewrite session.
function analyzeSpecialist(spec, opts = {}) {
  if (!spec || !spec.score) return null;
  const threshold = _isFiniteNumber(opts.negativeThreshold)
    ? opts.negativeThreshold : DEFAULT_NEGATIVE_THRESHOLD;
  const minSamples = _isFiniteNumber(opts.minSamples)
    ? opts.minSamples : DEFAULT_MIN_SAMPLES;
  const samples = spec.score.samples || {};
  const flaggedDomains = [];
  const flaggedStages = [];

  for (const [d, v] of Object.entries(spec.score.byDomain || {})) {
    const n = samples[`domain:${d}`] || 0;
    if (n < minSamples) continue;
    if (v <= threshold) flaggedDomains.push({ domain: d, score: v, samples: n });
  }
  for (const [s, v] of Object.entries(spec.score.byStage || {})) {
    const n = samples[`stage:${s}`] || 0;
    if (n < minSamples) continue;
    if (v <= threshold) flaggedStages.push({ stage: s, score: v, samples: n });
  }
  if (flaggedDomains.length === 0 && flaggedStages.length === 0) return null;

  // Deepest-bucket = the one with the most-negative score. The
  // operator/orchestrator can use this to decide which dimension
  // to focus a re-prompt on.
  const allBuckets = [
    ...flaggedDomains.map((b) => ({ kind: 'domain', name: b.domain, score: b.score, samples: b.samples })),
    ...flaggedStages.map((b) => ({ kind: 'stage', name: b.stage, score: b.score, samples: b.samples })),
  ];
  allBuckets.sort((a, b) => a.score - b.score);
  const deepest = allBuckets[0];

  return {
    id: spec.id,
    displayName: spec.displayName,
    tier: spec.tier,
    flaggedDomains,
    flaggedStages,
    deepestBucket: deepest,
    recommendation: _recommendationFor(spec, deepest),
  };
}

function _recommendationFor(spec, bucket) {
  if (!bucket) return 'no action';
  if (bucket.kind === 'domain') {
    return `consider tightening systemPrompt for the "${bucket.name}" domain — `
      + `${bucket.samples} samples, mean signal ${bucket.score.toFixed(2)}; `
      + `or remove "${bucket.name}" from spec.domain if the specialist is `
      + `consistently a poor fit there`;
  }
  return `consider revisiting systemPrompt for the "${bucket.name}" stage — `
    + `${bucket.samples} samples, mean signal ${bucket.score.toFixed(2)}; `
    + `phase 5.2 will spawn a re-prompt meeting once the operator opts in`;
}

// Walk every specialist in a registry and aggregate the
// underperformer reports. Returns
//   { total, flagged, items: [{id, ...analyzeSpecialist output}] }
// `total` = number of specialists scanned, `flagged` = count where
// at least one bucket tripped the thresholds.
function detectUnderperformers(registry, opts = {}) {
  if (!registry || typeof registry.list !== 'function') {
    throw new Error('detectUnderperformers: registry is required');
  }
  const list = registry.list();
  const items = [];
  for (const spec of list) {
    const r = analyzeSpecialist(spec, opts);
    if (r) items.push(r);
  }
  // Sort by deepest score so the operator's eye catches the worst
  // case first.
  items.sort((a, b) => {
    const aScore = a.deepestBucket ? a.deepestBucket.score : 0;
    const bScore = b.deepestBucket ? b.deepestBucket.score : 0;
    return aScore - bScore;
  });
  return {
    total: list.length,
    flagged: items.length,
    threshold: _isFiniteNumber(opts.negativeThreshold)
      ? opts.negativeThreshold : DEFAULT_NEGATIVE_THRESHOLD,
    minSamples: _isFiniteNumber(opts.minSamples)
      ? opts.minSamples : DEFAULT_MIN_SAMPLES,
    items,
  };
}

// (Phase 5.2) Prompt revision suggestion.
//
// Build a prompt that asks a brain to draft a revised systemPrompt
// for an underperforming specialist. Review-only — the daemon
// returns the brain's suggestion; the operator decides whether to
// edit `src/specialists.seed.json` or hand-craft the revised prompt
// before applying it. We never auto-mutate the registry.

const SUGGEST_PROMPT_HEADER = [
  '# Specialist prompt revision request',
  '',
  'You are reviewing the systemPrompt of an underperforming specialist',
  'in our multi-specialist meeting system. The specialist has',
  'accumulated negative retro signal in one or more domains/stages.',
  'Your job is to draft a revised systemPrompt that addresses the',
  'weakness without breaking the specialist\'s general purpose.',
  '',
  'Constraints:',
  '- Keep the same `[Role: ...]` prefix (the meeting orchestrator',
  '  greps for it).',
  '- Keep the role identity coherent — do not rename the specialist',
  '  or change its tier; the dispatcher already routed work to it for',
  '  good reasons.',
  '- Make the change *concrete*: name a specific behavior to add or',
  '  drop, not just "be better".',
  '- Keep length within 30% of the original.',
  '',
  'Output format (strict — the parser is regex-based):',
  '  REVISION:',
  '  <revised systemPrompt, one paragraph, [Role: ...] prefix preserved>',
  '',
  '  RATIONALE:',
  '  <one paragraph explaining what changed and why, with reference',
  '   to the weak buckets above>',
].join('\n');

function buildSuggestPrompt(spec, analysis) {
  const lines = [];
  lines.push(SUGGEST_PROMPT_HEADER);
  lines.push('');
  lines.push('## Current systemPrompt');
  lines.push('');
  lines.push(spec.systemPrompt);
  lines.push('');
  lines.push('## Weak buckets (from retro signal)');
  lines.push('');
  if (analysis.flaggedDomains && analysis.flaggedDomains.length > 0) {
    lines.push('Domains:');
    for (const d of analysis.flaggedDomains) {
      lines.push(`  - ${d.domain}: signal ${d.score.toFixed(2)} over ${d.samples} samples`);
    }
  }
  if (analysis.flaggedStages && analysis.flaggedStages.length > 0) {
    lines.push('Stages:');
    for (const s of analysis.flaggedStages) {
      lines.push(`  - ${s.stage}: signal ${s.score.toFixed(2)} over ${s.samples} samples`);
    }
  }
  lines.push('');
  lines.push(`Deepest bucket: ${analysis.deepestBucket.kind}:${analysis.deepestBucket.name} = ${analysis.deepestBucket.score.toFixed(2)}`);
  lines.push('');
  lines.push('Now draft the revised systemPrompt below.');
  return lines.join('\n');
}

const REVISION_RE = /REVISION:\s*([\s\S]*?)(?:RATIONALE:|$)/i;
const RATIONALE_RE = /RATIONALE:\s*([\s\S]*?)$/i;

function parseSuggestion(text) {
  if (!text || typeof text !== 'string') {
    return { revision: null, rationale: null, raw: text || '' };
  }
  const revM = text.match(REVISION_RE);
  const ratM = text.match(RATIONALE_RE);
  return {
    revision: revM ? revM[1].trim() : null,
    rationale: ratM ? ratM[1].trim() : null,
    raw: text,
  };
}

// Drive the brain to suggest a revision. Returns
//   { specialistId, currentPrompt, analysis, revision, rationale, raw }
// or throws if the specialist is missing OR the analyzer returns
// no flagged buckets (no point asking for a revision when there's
// nothing to revise).
//
// opts:
//   brain     required, BrainProvider instance (mock or claude)
//   registry  optional SpecialistRegistry override
async function suggestPromptRevision(specialistId, opts = {}) {
  if (!specialistId || typeof specialistId !== 'string') {
    throw new Error('suggestPromptRevision: specialistId is required');
  }
  const reg = opts.registry || (() => {
    try { return require('./specialist-registry').getShared(); }
    catch { return null; }
  })();
  if (!reg) throw new Error('suggestPromptRevision: registry unavailable');
  const spec = reg.get(specialistId);
  if (!spec) throw new Error(`suggestPromptRevision: specialist "${specialistId}" not found`);

  const analysis = analyzeSpecialist(spec, opts);
  if (!analysis) {
    throw new Error(`suggestPromptRevision: "${specialistId}" has no flagged buckets — nothing to revise`);
  }

  if (!opts.brain || typeof opts.brain.ask !== 'function') {
    throw new Error('suggestPromptRevision: brain (BrainProvider instance) is required');
  }

  const prompt = buildSuggestPrompt(spec, analysis);
  const reply = await opts.brain.ask(spec, prompt, {
    plan: { task: 'prompt revision', track: 'meta' },
    currentStage: 'docs',
    currentRound: 1,
    transcriptSoFar: [],
    lastView: { objects: [] },
  });
  const parsed = parseSuggestion(reply.text || '');
  return {
    specialistId,
    currentPrompt: spec.systemPrompt,
    analysis: {
      flaggedDomains: analysis.flaggedDomains,
      flaggedStages: analysis.flaggedStages,
      deepestBucket: analysis.deepestBucket,
    },
    revision: parsed.revision,
    rationale: parsed.rationale,
    raw: parsed.raw,
  };
}

module.exports = {
  analyzeSpecialist,
  detectUnderperformers,
  suggestPromptRevision,
  buildSuggestPrompt,
  parseSuggestion,
  SUGGEST_PROMPT_HEADER,
  DEFAULT_NEGATIVE_THRESHOLD,
  DEFAULT_MIN_SAMPLES,
};
