'use strict';

// Wiki writer (Phase 3.1 of multi-specialist system).
//
// Publishes a terminal MeetingSession into a markdown-in-git wiki
// layout. See docs/multi-specialist-system.md §9 for the full
// design (separate `c4-wiki` repo, frontmatter convention,
// search-then-fetch, Reopen action).
//
// Phase 3.1 ships the *write* path only:
//   - meetings/<date>-<slug>.md  always
//   - adr/<NNNN>-<slug>.md       when the 'design' stage produced
//                                a turn (i.e. the architect spoke)
//   - retros/<date>-<slug>.md    when retro deltas are supplied
//
// The reader (search-then-fetch, Reopen) lands in 3.2/3.3.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_WIKI_ROOT = path.join(process.env.HOME || '/tmp', '.c4', 'wiki');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function slugify(text, maxLen = 40) {
  if (!text) return 'untitled';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen) || 'untitled';
}

function dateOnly(iso) {
  if (!iso) return new Date().toISOString().slice(0, 10);
  return new Date(iso).toISOString().slice(0, 10);
}

function frontmatter(obj) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      const items = v.map((s) => JSON.stringify(s)).join(', ');
      lines.push(`${k}: [${items}]`);
    } else if (typeof v === 'string') {
      // Quote if it contains characters YAML would mis-parse.
      const needsQuote = /[:#\n"']/.test(v) || /^\s|\s$/.test(v);
      lines.push(`${k}: ${needsQuote ? JSON.stringify(v) : v}`);
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

// Pick the next ADR number by scanning the adr/ directory for
// existing `NNNN-<slug>.md` files. Atomic-ish (TOCTOU is fine for a
// single-writer wiki — collisions only matter if two finalize calls
// run in the exact same millisecond, which they won't because
// MeetingStore is in-process).
function nextAdrNumber(adrDir) {
  let max = 0;
  try {
    const entries = fs.readdirSync(adrDir);
    for (const e of entries) {
      const m = e.match(/^(\d{4,})-/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
  } catch {
    // dir may not exist yet — that's fine, return 1.
  }
  return max + 1;
}

// Phase 6.12 — extract wiki-page references from a transcript so
// the published page's frontmatter `related:` array is populated
// without operator hand-tagging.
//
// Patterns recognised (in order, deduped + sorted alphabetically):
//   - markdown links to known wiki paths:
//       [foo](meetings/2026-01-01-foo.md), [foo](adr/0042-bar.md),
//       [foo](retros/2026-01-01-foo.md)
//   - bare wiki paths inline:
//       see meetings/2026-01-01-foo.md for context
//   - meeting ids like `m-deadbeef1234` (12-hex, the meetingId
//     format from meeting-plan)
//   - ADR refs like `ADR-0042` / `ADR 0042`
//
// Bare path matches are gated on the prefix being `meetings/`,
// `adr/`, or `retros/` so we don't accidentally pull arbitrary
// paths from code blocks. Non-greedy on the suffix so trailing
// punctuation (period, comma, paren) isn't captured.
const WIKI_PATH_RE = /\b((?:meetings|adr|retros)\/[A-Za-z0-9_.\-]+\.md)\b/g;
const MEETING_ID_RE = /\b(m-[a-f0-9]{12})\b/g;
const ADR_REF_RE = /\bADR[- ](\d{1,4})\b/gi;

function _extractRelatedRefs(sess) {
  const refs = new Set();
  const transcripts = sess.transcripts || sess._transcripts || [];
  for (const stageTurns of transcripts) {
    for (const turn of stageTurns || []) {
      const text = turn.text || '';
      if (!text) continue;
      let m;
      WIKI_PATH_RE.lastIndex = 0;
      while ((m = WIKI_PATH_RE.exec(text)) !== null) refs.add(m[1]);
      MEETING_ID_RE.lastIndex = 0;
      while ((m = MEETING_ID_RE.exec(text)) !== null) {
        // Don't echo the current meeting back at itself.
        if (m[1] !== sess.id) refs.add(`meeting:${m[1]}`);
      }
      ADR_REF_RE.lastIndex = 0;
      while ((m = ADR_REF_RE.exec(text)) !== null) {
        refs.add(`adr:${m[1].padStart(4, '0')}`);
      }
    }
  }
  return [...refs].sort();
}

// Build the meeting-minutes markdown from a session JSON.
function renderMeeting(sess, opts = {}) {
  const explicit = Array.isArray(opts.related) ? opts.related.slice() : [];
  const auto = opts.autoRelated === false ? [] : _extractRelatedRefs(sess);
  // Merge explicit + auto, dedupe, preserve operator-supplied order
  // first then append newly-discovered refs.
  const seen = new Set(explicit);
  const merged = [...explicit];
  for (const r of auto) {
    if (!seen.has(r)) { seen.add(r); merged.push(r); }
  }
  const fm = {
    title: sess.title,
    type: 'meeting',
    status: sess.status,
    track: sess.track,
    meetingId: sess.id,
    createdAt: sess.createdAt,
    completedAt: sess.completedAt,
    related: merged,
  };
  const out = [];
  out.push(frontmatter(fm));
  out.push('');
  out.push(`# ${sess.title}`);
  out.push('');
  out.push(`**Task**: ${sess.task}`);
  out.push(`**Track**: ${sess.track}  **Status**: ${sess.status}`);
  out.push('');
  for (const stage of sess.stages) {
    const conv = stage.consensus || {};
    out.push(`## ${stage.stage}`);
    out.push('');
    out.push(`Roster: ${stage.specialists.map((s) => s.id).join(', ')}`);
    if (conv.mode) {
      out.push(`Consensus: ${conv.mode}  reached=${conv.reached}  accepts=${(conv.accepts || []).length}  objects=${(conv.objects || []).length}  missing=${(conv.missing || []).length}  round=${conv.round || 0}`);
    }
    out.push('');
  }
  out.push('## Transcript');
  out.push('');
  for (let i = 0; i < (sess.transcripts || []).length; i += 1) {
    const turns = sess.transcripts[i] || [];
    if (turns.length === 0) continue;
    out.push(`### ${(sess.stages[i] && sess.stages[i].stage) || `stage ${i}`}`);
    for (const t of turns) {
      out.push('');
      out.push(`**[${t.stage} r${t.round}] ${t.specialistId}**`);
      out.push('');
      out.push(t.text);
    }
    out.push('');
  }
  if (sess.escalations && sess.escalations.length) {
    out.push('## Escalations');
    for (const e of sess.escalations) {
      out.push(`- ${e.ts} — ${e.reason}${e.terminal ? ' (terminal)' : ''}`);
    }
  }
  // Phase 6.5 — structured action-items section. Pulled from the
  // transcript via meeting-actions extractor. Rendered as four
  // grouped checklists so the operator can paste straight into
  // their own task tracker. Empty groups are omitted.
  try {
    const actions = require('./meeting-actions').extractActionItems({
      _transcripts: sess.transcripts,
      plan: { stages: sess.stages || [] },
      toJSON() { return sess; },
    });
    if (actions && actions.count > 0) {
      out.push('');
      out.push('## Action Items');
      out.push('');
      const sectionTitle = { decision: 'Decisions', action: 'Actions', todo: 'Todos', blocker: 'Blockers' };
      for (const kind of ['decision', 'action', 'todo', 'blocker']) {
        const group = actions.items.filter((it) => it.type === kind);
        if (group.length === 0) continue;
        out.push(`### ${sectionTitle[kind]}`);
        for (const it of group) {
          const owner = it.owner ? ` _(@${it.owner})_` : '';
          const where = ` <!-- ${it.stage} r${it.round} ${it.specialistId || '?'} -->`;
          out.push(`- [ ] ${it.text}${owner}${where}`);
        }
        out.push('');
      }
    }
  } catch { /* extractor failure must not break wiki publish */ }
  return out.join('\n');
}

function renderAdr(sess, adrNumber, designStage, opts = {}) {
  const fm = {
    title: `ADR ${adrNumber}: ${sess.title}`,
    type: 'adr',
    status: 'draft',
    adr: adrNumber,
    meetingId: sess.id,
    related: opts.related || [],
    last_reviewed: dateOnly(sess.completedAt || sess.createdAt),
  };
  const out = [];
  out.push(frontmatter(fm));
  out.push('');
  out.push(`# ADR ${adrNumber}: ${sess.title}`);
  out.push('');
  out.push(`## Context`);
  out.push('');
  out.push(`Captured during meeting [${sess.id}](../meetings/${dateOnly(sess.createdAt)}-${slugify(sess.title)}.md).`);
  out.push('');
  out.push(`Task: ${sess.task}`);
  out.push('');
  out.push('## Decision');
  out.push('');
  out.push('_Architect summary (extract from transcript below — TODO automate):_');
  out.push('');
  // Pull architect's last contribution from the design stage as a starter.
  const designIdx = sess.stages.findIndex((s) => s.stage === 'design');
  if (designIdx >= 0) {
    const turns = (sess.transcripts && sess.transcripts[designIdx]) || [];
    const archTurn = [...turns].reverse().find((t) => t.specialistId === 'architect');
    if (archTurn) {
      out.push(`> ${archTurn.text.split('\n').join('\n> ')}`);
      out.push('');
    }
  }
  out.push('## Consequences');
  out.push('');
  out.push('_Pros / cons / impacts — fill in._');
  out.push('');
  out.push('## Transcript references');
  out.push('');
  out.push(`See full transcript in [meeting record](../meetings/${dateOnly(sess.createdAt)}-${slugify(sess.title)}.md).`);
  return out.join('\n');
}

function renderRetro(sess, retro, applied, opts = {}) {
  const fm = {
    title: `Retro: ${sess.title}`,
    type: 'retro',
    meetingId: sess.id,
    outcome: retro.outcome,
    last_reviewed: dateOnly(sess.completedAt || sess.createdAt),
    related: opts.related || [],
  };
  const out = [];
  out.push(frontmatter(fm));
  out.push('');
  out.push(`# Retro: ${sess.title}`);
  out.push('');
  out.push(`Outcome: **${retro.outcome}**`);
  out.push('');
  out.push('## Per-specialist deltas');
  out.push('');
  out.push('| specialist | contribution | byStage | byDomain |');
  out.push('|---|---|---|---|');
  for (const [id, d] of Object.entries(retro.deltas || {})) {
    const stages = Object.entries(d.byStage || {})
      .map(([s, v]) => `${s}=${v.toFixed(2)}`).join(', ');
    const domains = Object.entries(d.byDomain || {})
      .map(([k, v]) => `${k}=${v.toFixed(2)}`).join(', ');
    out.push(`| ${id} | ${d.contribution} | ${stages} | ${domains} |`);
  }
  if (applied) {
    out.push('');
    out.push('## Applied score adjustments');
    out.push('');
    out.push('| specialist | before (byDomain) | after (byDomain) |');
    out.push('|---|---|---|');
    for (const [id, snap] of Object.entries(applied)) {
      const before = Object.entries(snap.before.byDomain || {})
        .map(([k, v]) => `${k}=${(v ?? 0).toFixed(2)}`).join(', ') || '-';
      const after = Object.entries(snap.after.byDomain || {})
        .map(([k, v]) => `${k}=${(v ?? 0).toFixed(2)}`).join(', ') || '-';
      out.push(`| ${id} | ${before} | ${after} |`);
    }
  }
  return out.join('\n');
}

// (Phase 3.4) Optional git automation. When opts.gitCommit is
// truthy publishMeeting initializes the wiki dir as a git repo (if
// not already), `git add -A`, and creates a commit referencing the
// meeting id. opts.gitPush additionally pushes to origin if
// configured. All best-effort: failure surfaces as `git: <stderr>`
// in the return shape but never throws.
function _isGitRepo(dir) {
  try {
    const out = spawnSync('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'], {
      encoding: 'utf8',
    });
    return out.status === 0 && out.stdout.trim() === 'true';
  } catch { return false; }
}

function _git(dir, args, opts = {}) {
  const r = spawnSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    env: opts.env || process.env,
  });
  return {
    ok: r.status === 0,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
    code: r.status,
  };
}

function _commitWiki(wikiRoot, sess, opts = {}) {
  const log = [];
  if (!_isGitRepo(wikiRoot)) {
    const init = _git(wikiRoot, ['init']);
    log.push({ step: 'init', ok: init.ok, stderr: init.stderr });
    if (!init.ok) return { committed: false, log };
    // Set up identity from the operator's global git if present;
    // otherwise fall back to a sensible default so commits don't
    // fail with "please tell me who you are". The fallback only
    // kicks in for newly-init'd repos — operators with existing
    // wikis get their normal config.
    const cfgEmail = _git(wikiRoot, ['config', '--get', 'user.email']);
    if (!cfgEmail.ok || !cfgEmail.stdout) {
      _git(wikiRoot, ['config', 'user.email', 'c4-wiki@localhost']);
    }
    const cfgName = _git(wikiRoot, ['config', '--get', 'user.name']);
    if (!cfgName.ok || !cfgName.stdout) {
      _git(wikiRoot, ['config', 'user.name', 'c4-wiki']);
    }
  }
  const add = _git(wikiRoot, ['add', '-A']);
  log.push({ step: 'add', ok: add.ok, stderr: add.stderr });
  if (!add.ok) return { committed: false, log };
  // Skip commit if working tree is clean — re-publishing the same
  // meeting twice with no transcript change shouldn't generate a
  // noise commit.
  const status = _git(wikiRoot, ['status', '--porcelain']);
  if (!status.stdout) {
    log.push({ step: 'commit', ok: true, skipped: 'clean tree' });
    return { committed: false, log };
  }
  const title = (sess.title || sess.task || sess.id).replace(/\n.*$/s, '').slice(0, 72);
  const msg = `meeting:${sess.id} :: ${title}`;
  const commit = _git(wikiRoot, ['commit', '-m', msg]);
  log.push({ step: 'commit', ok: commit.ok, stderr: commit.stderr, message: msg });
  if (!commit.ok) return { committed: false, log };
  let pushed = null;
  if (opts.gitPush) {
    const push = _git(wikiRoot, ['push']);
    log.push({ step: 'push', ok: push.ok, stderr: push.stderr });
    pushed = push.ok;
  }
  const head = _git(wikiRoot, ['rev-parse', 'HEAD']);
  return {
    committed: true,
    pushed,
    sha: head.ok ? head.stdout : null,
    message: msg,
    log,
  };
}

// Public entrypoint. Returns the list of files written.
//
// opts:
//   wikiRoot     override for default DEFAULT_WIKI_ROOT
//   retro        result of computeRetroDeltas (optional)
//   applied      result of applyRetroDeltas (optional)
//   forceAdr     write ADR even if 'design' stage had no turns
//   gitCommit    (Phase 3.4) auto git init+commit after writing
//   gitPush      (Phase 3.4) also push to origin (requires gitCommit)
function publishMeeting(sess, opts = {}) {
  const sessJson = (typeof sess.toJSON === 'function') ? sess.toJSON() : sess;
  if (!sessJson || !sessJson.id || !Array.isArray(sessJson.stages)) {
    throw new Error('publishMeeting: invalid session');
  }
  const wikiRoot = opts.wikiRoot || DEFAULT_WIKI_ROOT;
  ensureDir(wikiRoot);

  const meetingsDir = path.join(wikiRoot, 'meetings');
  const adrDir = path.join(wikiRoot, 'adr');
  const retrosDir = path.join(wikiRoot, 'retros');
  ensureDir(meetingsDir);
  ensureDir(adrDir);
  ensureDir(retrosDir);

  const date = dateOnly(sessJson.createdAt);
  const slug = slugify(sessJson.title || sessJson.task);
  const written = [];

  // Meeting minutes. Forward opts so render-time options like
  // `related` (explicit) and `autoRelated` (toggle) reach the
  // frontmatter builder.
  const meetingPath = path.join(meetingsDir, `${date}-${slug}.md`);
  fs.writeFileSync(meetingPath, renderMeeting(sessJson, {
    related: opts.related,
    autoRelated: opts.autoRelated,
  }));
  written.push(meetingPath);

  // ADR (if design stage spoke).
  const designIdx = sessJson.stages.findIndex((s) => s.stage === 'design');
  const designSpoken = designIdx >= 0
    && Array.isArray(sessJson.transcripts[designIdx])
    && sessJson.transcripts[designIdx].length > 0;
  if (designSpoken || opts.forceAdr) {
    const n = nextAdrNumber(adrDir);
    const adrFile = `${String(n).padStart(4, '0')}-${slug}.md`;
    const adrPath = path.join(adrDir, adrFile);
    fs.writeFileSync(adrPath, renderAdr(sessJson, n, sessJson.stages[designIdx]));
    written.push(adrPath);
  }

  // Retro page.
  if (opts.retro) {
    const retroPath = path.join(retrosDir, `${date}-${slug}.md`);
    fs.writeFileSync(retroPath, renderRetro(sessJson, opts.retro, opts.applied || null));
    written.push(retroPath);
  }

  let gitInfo = null;
  if (opts.gitCommit) {
    try { gitInfo = _commitWiki(wikiRoot, sessJson, { gitPush: !!opts.gitPush }); }
    catch (err) { gitInfo = { committed: false, error: err.message }; }
  }

  return {
    wikiRoot,
    written,
    meetingPath,
    git: gitInfo,
  };
}

module.exports = {
  publishMeeting,
  renderMeeting,
  renderAdr,
  renderRetro,
  slugify,
  frontmatter,
  nextAdrNumber,
  _isGitRepo,
  _commitWiki,
  _extractRelatedRefs,
  DEFAULT_WIKI_ROOT,
};
