'use strict';

// Tests for src/wiki-writer.js (multi-specialist phase 3.1).

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { planMeeting } = require('../src/meeting-plan');
const { MeetingSession } = require('../src/meeting-session');
const { MeetingOrchestrator } = require('../src/meeting-orchestrator');
const { MockBrainProvider } = require('../src/meeting-brain');
const { computeRetroDeltas, applyRetroDeltas } = require('../src/meeting-retro');
const { SpecialistRegistry } = require('../src/specialist-registry');
const {
  publishMeeting,
  renderMeeting,
  renderAdr,
  renderRetro,
  slugify,
  frontmatter,
  nextAdrNumber,
} = require('../src/wiki-writer');

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'c4-wiki-'));
}

t('module exports surface', () => {
  assert.strictEqual(typeof publishMeeting, 'function');
  assert.strictEqual(typeof renderMeeting, 'function');
  assert.strictEqual(typeof renderAdr, 'function');
  assert.strictEqual(typeof renderRetro, 'function');
  assert.strictEqual(typeof slugify, 'function');
  assert.strictEqual(typeof frontmatter, 'function');
  assert.strictEqual(typeof nextAdrNumber, 'function');
});

t('slugify produces kebab-lower truncated to 40', () => {
  assert.strictEqual(slugify('Hello World'), 'hello-world');
  // Non-ascii chars collapse to dashes; we only assert the ascii
  // tail roundtrips cleanly (Korean prefix gets stripped to empty).
  assert.strictEqual(slugify('한글 task: rotate auth secret!'), 'task-rotate-auth-secret');
  assert.strictEqual(slugify(''), 'untitled');
  assert.strictEqual(slugify('a'.repeat(60)).length, 40);
});

t('frontmatter quotes strings with special characters', () => {
  const fm = frontmatter({ title: 'plain', tricky: 'has: colon', list: ['a', 'b'] });
  assert.ok(fm.startsWith('---'));
  assert.ok(fm.includes('title: plain'));
  assert.ok(fm.includes('tricky: "has: colon"'));
  assert.ok(fm.includes('list: ["a", "b"]'));
});

t('nextAdrNumber starts at 1 for empty/missing dir', () => {
  const dir = makeTmp();
  assert.strictEqual(nextAdrNumber(path.join(dir, 'does-not-exist')), 1);
  fs.mkdirSync(path.join(dir, 'adr'), { recursive: true });
  assert.strictEqual(nextAdrNumber(path.join(dir, 'adr')), 1);
});

t('nextAdrNumber increments past existing entries', () => {
  const dir = makeTmp();
  const adr = path.join(dir, 'adr');
  fs.mkdirSync(adr);
  fs.writeFileSync(path.join(adr, '0007-foo.md'), 'x');
  fs.writeFileSync(path.join(adr, '0042-bar.md'), 'x');
  fs.writeFileSync(path.join(adr, 'not-an-adr.md'), 'x');
  assert.strictEqual(nextAdrNumber(adr), 43);
});

t('publishMeeting on a completed lightweight meeting writes minutes', async () => {
  const reg = new SpecialistRegistry({ persistPath: null });
  const sess = new MeetingSession(planMeeting({ task: 'fix typo in handler', registry: reg }));
  const brain = new MockBrainProvider();
  await new MeetingOrchestrator({ session: sess, brain }).run();
  assert.strictEqual(sess.status, 'completed');

  const wikiRoot = makeTmp();
  const r = publishMeeting(sess, { wikiRoot });
  assert.ok(r.meetingPath);
  assert.ok(fs.existsSync(r.meetingPath));
  const body = fs.readFileSync(r.meetingPath, 'utf8');
  assert.ok(body.startsWith('---'));
  assert.ok(body.includes('type: meeting'));
  assert.ok(body.includes('status: completed'));
  assert.ok(body.includes('## implement'));
  assert.ok(body.includes('## Transcript'));
  assert.ok(body.includes('backend-engineer'));
});

t('publishMeeting on full-track meeting writes meeting + ADR', async () => {
  const reg = new SpecialistRegistry({ persistPath: null });
  const sess = new MeetingSession(planMeeting({ task: 'redesign auth flow', registry: reg }));
  const brain = new MockBrainProvider();
  await new MeetingOrchestrator({ session: sess, brain, maxAsks: 500 }).run();
  // The mock brain may or may not complete a full-track meeting due
  // to the round-1 audit objection; just check it terminated.
  assert.ok(['completed', 'escalated'].includes(sess.status));

  const wikiRoot = makeTmp();
  const r = publishMeeting(sess, { wikiRoot });
  assert.strictEqual(r.written.length, 2, `expected 2 files (meeting + ADR), got ${r.written.length}`);
  const adrPath = r.written.find((p) => p.includes('/adr/'));
  assert.ok(adrPath, 'ADR path missing');
  const body = fs.readFileSync(adrPath, 'utf8');
  assert.ok(body.includes('type: adr'));
  assert.ok(body.match(/^# ADR \d+:/m));
});

t('publishMeeting with retro writes retro page too', async () => {
  const reg = new SpecialistRegistry({ persistPath: null });
  const sess = new MeetingSession(planMeeting({ task: 'fix typo in handler', registry: reg }));
  const brain = new MockBrainProvider();
  await new MeetingOrchestrator({ session: sess, brain }).run();
  const retro = computeRetroDeltas(sess, { registry: reg });
  const applied = applyRetroDeltas(reg, retro);

  const wikiRoot = makeTmp();
  const r = publishMeeting(sess, { wikiRoot, retro, applied });
  const retroPath = r.written.find((p) => p.includes('/retros/'));
  assert.ok(retroPath, `retro path missing in ${r.written.join(',')}`);
  const body = fs.readFileSync(retroPath, 'utf8');
  assert.ok(body.includes('type: retro'));
  assert.ok(body.includes('Per-specialist deltas'));
  assert.ok(body.includes('Applied score adjustments'));
});

t('publishMeeting refuses session shape without id/stages', () => {
  assert.throws(() => publishMeeting({}, {}), /invalid session/);
  assert.throws(() => publishMeeting({ id: 'x' }, {}), /invalid session/);
});

t('publishMeeting derives the same wiki path that bulk publish-all probes', async () => {
  // Regression guard for the path-derivation duplication in
  // daemon /wiki/publish-all (it computes the meeting page path
  // locally to skip-or-publish without doing a publish first).
  // If wiki-writer changes its slug rule, daemon diverges silently.
  const reg = new SpecialistRegistry({ persistPath: null });
  const sess = new MeetingSession(planMeeting({
    task: 'bulk-publish path derivation guard',
    registry: reg,
    title: 'Regression Guard With Punctuation!?',
  }));
  sess.start();
  sess.abort('test');
  const wikiRoot = makeTmp();
  const r = publishMeeting(sess, { wikiRoot });
  assert.ok(r.meetingPath);
  // Replicate the daemon's local derivation and verify it matches.
  const path = require('path');
  const date = (sess.toJSON().createdAt || '').slice(0, 10) || 'unknown-date';
  const titleSrc = sess.plan.title || sess.plan.task || sess.id;
  const slug = String(titleSrc).toLowerCase()
    .replace(/[^a-z0-9-\s]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40) || 'meeting';
  const expected = path.join(wikiRoot, 'meetings', `${date}-${slug}.md`);
  assert.strictEqual(r.meetingPath, expected, 'daemon-derived path must match writer-derived path');
});

t('publishMeeting renders Action Items section when transcript carries markers', async () => {
  const reg = new SpecialistRegistry({ persistPath: null });
  const sess = new MeetingSession(planMeeting({ task: 'fix flaky deploy gate', registry: reg }));
  sess.start();
  // Inject a contribution with all four marker types so the
  // generated wiki page contains every section header.
  const firstStageSpec = sess.plan.stages[0].specialists[0].id;
  sess.contribute(firstStageSpec, '[DECISION] roll the gate back to v3 [ACTION owner=eng] file the rollback PR [TODO] document the regression [BLOCKER] need root creds for prod');
  sess.abort('manual abort for test');

  const wikiRoot = makeTmp();
  const r = publishMeeting(sess, { wikiRoot });
  const body = fs.readFileSync(r.meetingPath, 'utf8');
  assert.ok(body.includes('## Action Items'), 'Action Items header present');
  assert.ok(body.includes('### Decisions'), 'Decisions group rendered');
  assert.ok(body.includes('### Actions'), 'Actions group rendered');
  assert.ok(body.includes('### Todos'), 'Todos group rendered');
  assert.ok(body.includes('### Blockers'), 'Blockers group rendered');
  assert.ok(body.includes('roll the gate back to v3'));
  assert.ok(body.includes('_(@eng)_'), 'owner attribution rendered');
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\n  ${passed} passed, ${failed} failed (wiki-writer)`);
  if (failed > 0) process.exit(1);
})();
