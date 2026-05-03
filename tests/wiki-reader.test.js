'use strict';

// Tests for src/wiki-reader.js (multi-specialist phase 3.2).

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { publishMeeting } = require('../src/wiki-writer');
const { planMeeting } = require('../src/meeting-plan');
const { MeetingSession } = require('../src/meeting-session');
const { MeetingOrchestrator } = require('../src/meeting-orchestrator');
const { MockBrainProvider } = require('../src/meeting-brain');
const { computeRetroDeltas } = require('../src/meeting-retro');
const {
  searchWiki,
  readPage,
  parseFrontmatter,
  scorePage,
  snippetFor,
  VALID_TYPES,
} = require('../src/wiki-reader');

let passed = 0;
let failed = 0;
const pending = [];
function t(label, fn) {
  pending.push(async () => {
    try {
      await fn();
      passed += 1;
      console.log(`  PASS  ${label}`);
    } catch (err) {
      failed += 1;
      console.log(`  FAIL  ${label}\n        ${err.message}`);
      if (err.stack) console.log(err.stack.split('\n').slice(1, 4).join('\n'));
    }
  });
}

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'c4-wiki-r-'));
}

async function seedMeeting(wikiRoot, task) {
  const sess = new MeetingSession(planMeeting({ task }));
  const brain = new MockBrainProvider();
  await new MeetingOrchestrator({ session: sess, brain, maxAsks: 200 }).run();
  let retro = null;
  if (['completed', 'escalated', 'aborted'].includes(sess.status)) {
    try { retro = computeRetroDeltas(sess); } catch { /* skip */ }
  }
  publishMeeting(sess, { wikiRoot, retro });
  return sess;
}

t('module exports surface', () => {
  assert.strictEqual(typeof searchWiki, 'function');
  assert.strictEqual(typeof readPage, 'function');
  assert.strictEqual(typeof parseFrontmatter, 'function');
  assert.strictEqual(typeof scorePage, 'function');
  assert.ok(VALID_TYPES.includes('meeting'));
  assert.ok(VALID_TYPES.includes('any'));
});

t('parseFrontmatter handles known shapes', () => {
  const md = '---\ntitle: Hello\ntype: meeting\nrelated: ["a", "b"]\n---\n\n# Body';
  const r = parseFrontmatter(md);
  assert.strictEqual(r.frontmatter.title, 'Hello');
  assert.strictEqual(r.frontmatter.type, 'meeting');
  assert.deepStrictEqual(r.frontmatter.related, ['a', 'b']);
  assert.ok(r.body.includes('# Body'));
});

t('parseFrontmatter handles missing frontmatter', () => {
  const r = parseFrontmatter('# Just body');
  assert.deepStrictEqual(r.frontmatter, {});
  assert.strictEqual(r.body, '# Just body');
});

t('searchWiki returns hits sorted by score (title > body)', async () => {
  const wikiRoot = makeTmp();
  await seedMeeting(wikiRoot, 'rotate auth secret in production');
  await seedMeeting(wikiRoot, 'add new dashboard widget');

  const r = searchWiki({ wikiRoot, q: 'auth', type: 'meeting' });
  assert.ok(r.hits.length >= 1);
  assert.ok(r.hits[0].title.toLowerCase().includes('auth'),
    `top hit should be the auth meeting, got "${r.hits[0].title}"`);
});

t('searchWiki type filter excludes other page kinds', async () => {
  const wikiRoot = makeTmp();
  await seedMeeting(wikiRoot, 'design auth flow');

  const meetings = searchWiki({ wikiRoot, type: 'meeting' });
  for (const h of meetings.hits) assert.strictEqual(h.type, 'meeting');

  const adrs = searchWiki({ wikiRoot, type: 'adr' });
  for (const h of adrs.hits) assert.strictEqual(h.type, 'adr');
});

t('searchWiki rejects unknown type', () => {
  assert.throws(() => searchWiki({ type: 'magic' }), /unknown type/);
});

t('searchWiki excludes superseded by default', () => {
  const wikiRoot = makeTmp();
  fs.mkdirSync(path.join(wikiRoot, 'adr'), { recursive: true });
  fs.writeFileSync(path.join(wikiRoot, 'adr', '0001-old.md'),
    '---\ntitle: Old ADR\ntype: adr\nstatus: superseded\n---\n\n# Old');
  fs.writeFileSync(path.join(wikiRoot, 'adr', '0002-new.md'),
    '---\ntitle: New ADR\ntype: adr\nstatus: accepted\n---\n\n# New');
  const r = searchWiki({ wikiRoot, type: 'adr' });
  const titles = r.hits.map((h) => h.title);
  assert.ok(titles.includes('New ADR'));
  assert.ok(!titles.includes('Old ADR'));

  const stale = searchWiki({ wikiRoot, type: 'adr', includeStale: true });
  const staleTitles = stale.hits.map((h) => h.title);
  assert.ok(staleTitles.includes('Old ADR'));
});

t('readPage returns {frontmatter, body, raw}', async () => {
  const wikiRoot = makeTmp();
  await seedMeeting(wikiRoot, 'fix typo in handler');
  const search = searchWiki({ wikiRoot, type: 'meeting' });
  const first = search.hits[0];
  const page = readPage(first.path, { wikiRoot });
  assert.strictEqual(page.path, first.path);
  assert.strictEqual(page.frontmatter.type, 'meeting');
  assert.ok(page.body.includes('# '));
});

t('readPage rejects path traversal', () => {
  const wikiRoot = makeTmp();
  fs.writeFileSync(path.join(wikiRoot, 'safe.md'), 'hi');
  assert.throws(() => readPage('../etc/passwd', { wikiRoot }), /escapes wikiRoot/);
  assert.throws(() => readPage('/etc/passwd', { wikiRoot }), /escapes wikiRoot/);
});

t('readPage rejects missing file', () => {
  const wikiRoot = makeTmp();
  assert.throws(() => readPage('not-here.md', { wikiRoot }), /not found/);
});

t('snippetFor zooms into the keyword location', () => {
  const body = 'A'.repeat(200) + ' authentication is critical here ' + 'B'.repeat(200);
  const snip = snippetFor(body, ['authentication']);
  assert.ok(snip.includes('authentication'));
  assert.ok(snip.length <= 240);
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\n  ${passed} passed, ${failed} failed (wiki-reader)`);
  if (failed > 0) process.exit(1);
})();
