'use strict';

// Tests for src/meeting-peer-retro.js (multi-specialist phase 4.2).

const assert = require('assert');

const { planMeeting } = require('../src/meeting-plan');
const { MeetingSession } = require('../src/meeting-session');
const { MeetingOrchestrator } = require('../src/meeting-orchestrator');
const { MockBrainProvider } = require('../src/meeting-brain');
const { SpecialistRegistry } = require('../src/specialist-registry');
const {
  runPeerRetro,
  buildPeerPrompt,
  parseRatings,
  RATING_LINE,
  DEFAULT_PEER_PROMPT_HEADER,
} = require('../src/meeting-peer-retro');

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

t('module exports surface', () => {
  assert.strictEqual(typeof runPeerRetro, 'function');
  assert.strictEqual(typeof buildPeerPrompt, 'function');
  assert.strictEqual(typeof parseRatings, 'function');
  assert.ok(RATING_LINE instanceof RegExp);
  assert.strictEqual(typeof DEFAULT_PEER_PROMPT_HEADER, 'string');
});

t('parseRatings extracts well-formed lines', () => {
  const text = `
Working through my peers:
  [RATING: code-reviewer 4 — caught the off-by-one]
  [RATING: dba 3]
  [RATING: backend-engineer 5 — solid implementation]
`;
  const out = parseRatings(text, 'security-auditor', new Set(['code-reviewer', 'dba', 'backend-engineer']));
  assert.strictEqual(out.length, 3);
  assert.strictEqual(out[0].ratee, 'code-reviewer');
  assert.strictEqual(out[0].rating, 4);
  assert.strictEqual(out[0].reason, 'caught the off-by-one');
  assert.strictEqual(out[1].reason, null);
  assert.strictEqual(out[2].rating, 5);
});

t('parseRatings ignores self-ratings + duplicates + invalid', () => {
  const text = `
[RATING: me 5 — self-praise]
[RATING: code-reviewer 5]
[RATING: code-reviewer 3]   <- duplicate, second wins? NO — first wins per spec
[RATING: ghost 4]            <- not in valid set
[RATING: bad-rating x — bogus]
[RATING: out-of-range 9]
`;
  const out = parseRatings(text, 'me', new Set(['code-reviewer', 'me']));
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].ratee, 'code-reviewer');
  assert.strictEqual(out[0].rating, 5);
});

t('parseRatings handles decimals and missing reason', () => {
  const text = '[RATING: pm 4.5]';
  const out = parseRatings(text, 'qa-engineer', new Set(['pm']));
  assert.strictEqual(out[0].rating, 4.5);
});

t('buildPeerPrompt embeds task + transcript + peers list', () => {
  const sess = {
    task: 'rotate auth secret',
    track: 'full',
    status: 'completed',
    transcripts: [
      [{ stage: 'audit', round: 1, specialistId: 'security-auditor', text: 'looks safe' }],
    ],
    stages: [{ stage: 'audit', specialists: [{ id: 'security-auditor' }, { id: 'dba' }] }],
  };
  const prompt = buildPeerPrompt(
    { id: 'dba', systemPrompt: '[Role: DBA]' },
    sess,
    { peerIds: ['security-auditor', 'dba'] },
  );
  assert.ok(prompt.includes('[Role: DBA]'));
  assert.ok(prompt.includes('rotate auth secret'));
  assert.ok(prompt.includes('Outcome: completed'));
  assert.ok(prompt.includes('looks safe'));
  assert.ok(prompt.includes('  - security-auditor'));
  assert.ok(prompt.includes('You are speaking as **dba**'));
});

t('runPeerRetro requires terminal session + brain instance', async () => {
  const sess = new MeetingSession(planMeeting({ task: 'fix typo' }));
  await assert.rejects(runPeerRetro(sess, { brain: new MockBrainProvider() }), /must be terminal/);
  // Make terminal then check brain validation
  sess.start();
  sess.abort('test');
  await assert.rejects(runPeerRetro(sess, {}), /brain/);
});

t('runPeerRetro on completed lightweight meeting collects ratings', async () => {
  const reg = new SpecialistRegistry();
  const sess = new MeetingSession(planMeeting({ task: 'fix typo in handler', registry: reg }));
  await new MeetingOrchestrator({ session: sess, brain: new MockBrainProvider() }).run();
  assert.strictEqual(sess.status, 'completed');

  // Custom mock brain whose retro reply hands out fixed ratings.
  const peerBrain = new MockBrainProvider({
    script: {
      'backend-engineer': async () => ({
        text: '[RATING: dba 4 — solid]\n[RATING: code-reviewer 5 — sharp]',
        vote: null,
        reason: null,
      }),
      'dba': async () => ({
        text: '[RATING: backend-engineer 5]\n[RATING: code-reviewer 3 — terse]',
        vote: null, reason: null,
      }),
      'code-reviewer': async () => ({
        text: '[RATING: backend-engineer 4]\n[RATING: dba 4]',
        vote: null, reason: null,
      }),
    },
  });

  const r = await runPeerRetro(sess, { brain: peerBrain, registry: reg });
  assert.strictEqual(r.sessionId, sess.id);
  assert.ok(r.raw.length >= 4, `expected ≥4 ratings, got ${r.raw.length}`);
  // Verify aggregate.
  const perRatee = r.perRatee;
  assert.ok(perRatee['backend-engineer'].votes >= 2);
  assert.ok(perRatee['code-reviewer'].votes >= 1);
  assert.ok(typeof perRatee['backend-engineer'].mean === 'number');
});

t('runPeerRetro deltas mirror meeting-retro shape (byStage/byDomain/samples)', async () => {
  const reg = new SpecialistRegistry();
  const sess = new MeetingSession(planMeeting({ task: 'fix typo in handler', registry: reg }));
  await new MeetingOrchestrator({ session: sess, brain: new MockBrainProvider() }).run();
  // Mock brain that gives every peer a 5/5 rating (very positive).
  const peerBrain = new MockBrainProvider({
    script: {
      'backend-engineer': async () => ({ text: '[RATING: dba 5]\n[RATING: code-reviewer 5]', vote: null, reason: null }),
      'dba': async () => ({ text: '[RATING: backend-engineer 5]\n[RATING: code-reviewer 5]', vote: null, reason: null }),
      'code-reviewer': async () => ({ text: '[RATING: backend-engineer 5]\n[RATING: dba 5]', vote: null, reason: null }),
    },
  });
  const r = await runPeerRetro(sess, { brain: peerBrain, registry: reg });
  // Mean rating 5 → signal = (5 - 2.5)/2.5 = 1.0
  for (const [id, d] of Object.entries(r.deltas)) {
    if (d.byStage) {
      for (const [stage, sig] of Object.entries(d.byStage)) {
        assert.strictEqual(sig, 1.0, `${id}.${stage} should be +1.0, got ${sig}`);
      }
    }
    assert.ok(d.contribution >= 1);
    assert.ok(d._peerSource);
  }
});

t('runPeerRetro skips raters who throw (no crash)', async () => {
  const reg = new SpecialistRegistry();
  const sess = new MeetingSession(planMeeting({ task: 'fix typo in handler', registry: reg }));
  await new MeetingOrchestrator({ session: sess, brain: new MockBrainProvider() }).run();
  const peerBrain = new MockBrainProvider({
    script: {
      'backend-engineer': async () => { throw new Error('rater-down'); },
      'dba': async () => ({ text: '[RATING: backend-engineer 4]', vote: null, reason: null }),
    },
  });
  const r = await runPeerRetro(sess, { brain: peerBrain, registry: reg });
  // backend-engineer's throw is swallowed; dba's rating is still recorded.
  const beVotes = (r.perRatee['backend-engineer'] && r.perRatee['backend-engineer'].votes) || 0;
  assert.ok(beVotes >= 1, `expected backend-engineer vote count ≥1 from dba, got ${beVotes}`);
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\n  ${passed} passed, ${failed} failed (meeting-peer-retro)`);
  if (failed > 0) process.exit(1);
})();
