'use strict';

// Wiki reader (Phase 3.2 of multi-specialist system).
//
// Companion to src/wiki-writer.js. Implements search-then-fetch
// over the markdown-in-git wiki layout: a meeting orchestrator
// (or operator via CLI) calls `searchWiki({q, type, status})` to
// list relevant pages by keyword, then pulls full bodies for the
// top-K hits via `readPage(relpath)`. This is what lets a future
// meeting start with "here are the related ADRs" without dumping
// the entire wiki into the prompt.
//
// The implementation is intentionally simple — recursive readdir +
// grep over each page's frontmatter + body. Phase 3.4 may swap in
// BM25 or embedding-based ranking once the corpus grows.

const fs = require('fs');
const path = require('path');

const { DEFAULT_WIKI_ROOT } = require('./wiki-writer');

const VALID_TYPES = Object.freeze(['meeting', 'adr', 'retro', 'specialist', 'docs', 'any']);

// Parse the YAML-like frontmatter we wrote in wiki-writer. We only
// recognise the small grammar wiki-writer emits — full YAML
// conformance is out of scope.
function parseFrontmatter(text) {
  if (!text || !text.startsWith('---')) return { frontmatter: {}, body: text || '' };
  const end = text.indexOf('\n---', 3);
  if (end < 0) return { frontmatter: {}, body: text };
  const fmBlock = text.slice(3, end).trim();
  const body = text.slice(end + 4).replace(/^\s*\n/, '');
  const out = {};
  for (const line of fmBlock.split('\n')) {
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if (val.startsWith('[') && val.endsWith(']')) {
      try { out[key] = JSON.parse(val); continue; } catch { /* fall through */ }
    }
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      try { out[key] = JSON.parse(val); continue; } catch { /* fall through */ }
    }
    if (/^-?\d+$/.test(val)) { out[key] = parseInt(val, 10); continue; }
    out[key] = val;
  }
  return { frontmatter: out, body };
}

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile() && e.name.endsWith('.md')) yield full;
  }
}

function tokenize(s) {
  if (!s) return [];
  return s.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').split(/\s+/).filter(Boolean);
}

function relPath(wikiRoot, abs) {
  return path.relative(wikiRoot, abs).split(path.sep).join('/');
}

// Score a page against query tokens. Title matches count more,
// frontmatter type tag a little, body matches the rest.
function scorePage(fm, body, queryTokens) {
  if (queryTokens.length === 0) return 1; // every page is equally relevant if no query.
  const titleSet = new Set(tokenize(typeof fm.title === 'string' ? fm.title : ''));
  const bodySet = new Set(tokenize(body));
  let score = 0;
  for (const q of queryTokens) {
    if (titleSet.has(q)) score += 3;
    if (bodySet.has(q)) score += 1;
  }
  return score;
}

function snippetFor(body, queryTokens, maxChars = 240) {
  if (!body) return '';
  if (queryTokens.length === 0) return body.slice(0, maxChars);
  const lower = body.toLowerCase();
  for (const q of queryTokens) {
    const idx = lower.indexOf(q);
    if (idx >= 0) {
      const start = Math.max(0, idx - 80);
      return body.slice(start, start + maxChars).replace(/\s+/g, ' ').trim();
    }
  }
  return body.slice(0, maxChars).replace(/\s+/g, ' ').trim();
}

// Public search.
//
// opts:
//   wikiRoot   override DEFAULT_WIKI_ROOT
//   q          free-text query
//   type       'meeting'|'adr'|'retro'|'specialist'|'docs'|'any'
//   status     restrict by frontmatter status
//   limit      max hits (default 10)
//   includeStale   default false — skips status='superseded' / 'reopened'
function searchWiki(opts = {}) {
  const wikiRoot = opts.wikiRoot || DEFAULT_WIKI_ROOT;
  const queryTokens = tokenize(opts.q || '');
  const type = opts.type || 'any';
  if (!VALID_TYPES.includes(type)) {
    throw new Error(`searchWiki: unknown type "${type}"`);
  }
  const status = opts.status || null;
  const limit = Number.isFinite(opts.limit) ? Math.max(1, opts.limit) : 10;
  const includeStale = !!opts.includeStale;

  const hits = [];
  for (const file of walk(wikiRoot)) {
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); }
    catch { continue; }
    const { frontmatter: fm, body } = parseFrontmatter(raw);
    if (type !== 'any' && fm.type !== type) continue;
    if (status && fm.status !== status) continue;
    if (!includeStale && (fm.status === 'superseded' || fm.status === 'reopened')) continue;
    const score = scorePage(fm, body, queryTokens);
    if (score === 0) continue;
    hits.push({
      path: relPath(wikiRoot, file),
      absolutePath: file,
      title: fm.title || path.basename(file, '.md'),
      type: fm.type || 'unknown',
      status: fm.status || null,
      meetingId: fm.meetingId || null,
      adr: fm.adr || null,
      lastReviewed: fm.last_reviewed || null,
      related: Array.isArray(fm.related) ? fm.related : [],
      score,
      snippet: snippetFor(body, queryTokens),
    });
  }
  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.path.localeCompare(b.path);
  });
  return {
    wikiRoot,
    query: opts.q || '',
    type,
    status,
    total: hits.length,
    hits: hits.slice(0, limit),
  };
}

// Read a single page by relative path. Returns
// {frontmatter, body, raw, path} or throws if the page is missing.
function readPage(relPathInput, opts = {}) {
  const wikiRoot = opts.wikiRoot || DEFAULT_WIKI_ROOT;
  if (!relPathInput || typeof relPathInput !== 'string') {
    throw new Error('readPage: path is required');
  }
  // Reject path traversal: relPath must not contain '..' segments
  // and must resolve under wikiRoot.
  const resolved = path.resolve(wikiRoot, relPathInput);
  if (!resolved.startsWith(path.resolve(wikiRoot) + path.sep) && resolved !== path.resolve(wikiRoot)) {
    throw new Error(`readPage: path "${relPathInput}" escapes wikiRoot`);
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`readPage: not found: ${relPathInput}`);
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  const { frontmatter, body } = parseFrontmatter(raw);
  return {
    path: relPath(wikiRoot, resolved),
    absolutePath: resolved,
    frontmatter,
    body,
    raw,
  };
}

module.exports = {
  searchWiki,
  readPage,
  parseFrontmatter,
  tokenize,
  scorePage,
  snippetFor,
  VALID_TYPES,
};
