'use strict';

// Wiki reopen action (Phase 3.3 of multi-specialist system).
//
// Given a wiki page path (typically an ADR), construct a fresh
// meeting that has the page + its `related` neighbours preloaded
// as Layer-A context. Marks the original page's frontmatter as
// `status: reopened` so subsequent searches know not to treat it
// as authoritative.
//
// Usage flow:
//   const r = reopenPage('adr/0042-event-sourced-audit.md');
//   // r = { meeting, contextSeeds, originalPath, originalUpdated }
//   // Then operator/orchestrator drives r.meeting through its
//   // stages with the preloaded context.

const fs = require('fs');
const path = require('path');

const wikiReader = require('./wiki-reader');
const { DEFAULT_WIKI_ROOT } = require('./wiki-writer');
const { planMeeting } = require('./meeting-plan');
const { MeetingSession, getShared: getMeetingStore } = require('./meeting-session');

// Update only the `status:` line in a page's frontmatter — leave
// everything else (body, other fm fields) intact. We do this with
// a line-based edit rather than full re-render so manual edits the
// operator made post-publish are preserved.
function _markReopened(absPath) {
  const raw = fs.readFileSync(absPath, 'utf8');
  if (!raw.startsWith('---')) {
    // No frontmatter — prepend one with status: reopened.
    const fmBlock = `---\nstatus: reopened\nreopened_at: ${new Date().toISOString()}\n---\n\n`;
    fs.writeFileSync(absPath, fmBlock + raw);
    return;
  }
  const end = raw.indexOf('\n---', 3);
  if (end < 0) {
    // Malformed — leave alone.
    return;
  }
  const fmBlock = raw.slice(3, end);
  const body = raw.slice(end);
  const lines = fmBlock.split('\n');
  let foundStatus = false;
  let foundReopenedAt = false;
  const stamp = new Date().toISOString();
  for (let i = 0; i < lines.length; i += 1) {
    if (/^status\s*:/.test(lines[i])) {
      lines[i] = 'status: reopened';
      foundStatus = true;
    }
    if (/^reopened_at\s*:/.test(lines[i])) {
      lines[i] = `reopened_at: ${stamp}`;
      foundReopenedAt = true;
    }
  }
  if (!foundStatus) lines.push('status: reopened');
  if (!foundReopenedAt) lines.push(`reopened_at: ${stamp}`);
  const out = `---${lines.join('\n')}\n---${body.slice(4)}`;
  fs.writeFileSync(absPath, out);
}

// Public entrypoint.
//
// opts:
//   wikiRoot       override DEFAULT_WIKI_ROOT
//   followRelated  pull in pages listed in `related: [...]` (default true)
//   maxRelated     cap on related-page seeds (default 5)
//   track          force a track instead of inferring (default uses planMeeting auto)
//   markReopened   default true — set the original page's status
//   meetingTitle   override generated title
//   storeMeeting   default true — register the new MeetingSession in
//                  the global MeetingStore so subsequent /meetings
//                  routes can drive it
function reopenPage(pagePath, opts = {}) {
  if (!pagePath || typeof pagePath !== 'string') {
    throw new Error('reopenPage: page path is required');
  }
  const wikiRoot = opts.wikiRoot || DEFAULT_WIKI_ROOT;
  // Read the source page (also exercises the path-traversal guard).
  const original = wikiReader.readPage(pagePath, { wikiRoot });
  const followRelated = opts.followRelated !== false;
  const maxRelated = Number.isFinite(opts.maxRelated) ? Math.max(0, opts.maxRelated) : 5;

  // Pull related pages, lazily — silently skip ones that are
  // missing or escape the wikiRoot. The follow set never includes
  // the source page itself.
  const seeds = [{ path: original.path, frontmatter: original.frontmatter, body: original.body }];
  if (followRelated && Array.isArray(original.frontmatter.related)) {
    for (const rel of original.frontmatter.related.slice(0, maxRelated)) {
      try {
        const r = wikiReader.readPage(rel, { wikiRoot });
        if (r.path !== original.path) seeds.push({ path: r.path, frontmatter: r.frontmatter, body: r.body });
      } catch { /* missing/invalid related — skip */ }
    }
  }

  // Build the new meeting. The task description embeds the prior
  // page's title so the dispatcher's keyword matcher reaches the
  // right specialists.
  const taskBase = original.frontmatter.title
    ? `Reopen: ${original.frontmatter.title}`
    : `Reopen: ${original.path}`;
  const title = opts.meetingTitle || taskBase;
  const plan = planMeeting({
    task: taskBase,
    track: opts.track || null,
    title,
    registry: opts.registry,
  });
  // Stamp the plan with reopen metadata so downstream wiki-write knows
  // to back-link to the original.
  plan.reopenedFrom = original.path;
  plan.reopenSeeds = seeds.map((s) => s.path);

  const session = new MeetingSession(plan, opts.sessionOpts || {});

  if (opts.storeMeeting !== false) {
    try { getMeetingStore().put(session); }
    catch { /* the test harness may not have shared store; that's fine */ }
  }

  // Mark the original as reopened on disk (last so a thrown error
  // earlier doesn't leave dangling state).
  let originalUpdated = false;
  if (opts.markReopened !== false) {
    try {
      _markReopened(path.resolve(wikiRoot, original.path));
      originalUpdated = true;
    } catch (err) {
      // Non-fatal — return the meeting + the seed snapshot anyway,
      // operator can re-stamp manually.
      originalUpdated = false;
    }
  }

  return {
    meeting: session,
    plan,
    contextSeeds: seeds,
    originalPath: original.path,
    originalUpdated,
  };
}

// Render the seed pages as a Layer-A context blob the orchestrator
// can pass to brain.ask(). Format mirrors meeting-brain.buildPrompt's
// transcript section so brains see "prior decisions" as structured
// background. Caller can prepend this to the first round's prompts.
function renderSeedContext(seeds) {
  if (!Array.isArray(seeds) || seeds.length === 0) return '';
  const lines = ['# Prior decisions (reopened context)'];
  for (const s of seeds) {
    lines.push('');
    lines.push(`## ${s.frontmatter.title || s.path}`);
    lines.push(`Path: ${s.path}`);
    if (s.frontmatter.status) lines.push(`Status: ${s.frontmatter.status}`);
    if (s.frontmatter.last_reviewed) lines.push(`Last reviewed: ${s.frontmatter.last_reviewed}`);
    lines.push('');
    // Trim body to keep prompts bounded — first 1.5kB is enough
    // context for the brain to recall the gist.
    const body = (s.body || '').replace(/^\s+/, '');
    lines.push(body.slice(0, 1500) + (body.length > 1500 ? '\n…(truncated)' : ''));
  }
  return lines.join('\n');
}

module.exports = {
  reopenPage,
  renderSeedContext,
  _markReopened,
};
