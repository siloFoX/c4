'use strict';

// Tests for src/meeting-actions.js (multi-specialist phase 6.5).

const assert = require('assert');

const { planMeeting } = require('../src/meeting-plan');
const { MeetingSession } = require('../src/meeting-session');
const { SpecialistRegistry } = require('../src/specialist-registry');
const {
  extractActionItems,
  _extractFromTurn,
  _extractOwner,
  TAG_KINDS,
} = require('../src/meeting-actions');

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

function freshSession() {
  const reg = new SpecialistRegistry({ persistPath: null });
  const plan = planMeeting({
    task: 'extractor smoke',
    track: 'lightweight',
    registry: reg,
  });
  const sess = new MeetingSession(plan);
  sess.start();
  return sess;
}

t('module surface', () => {
  assert.strictEqual(typeof extractActionItems, 'function');
  assert.deepStrictEqual(Object.keys(TAG_KINDS).sort(), ['action', 'blocker', 'decision', 'todo']);
});

t('rejects missing session', () => {
  assert.throws(() => extractActionItems(null), /session is required/);
});

t('_extractFromTurn parses [DECISION] / [ACTION] / [TODO] / [BLOCKER] markers', () => {
  const turn = {
    text: 'We agreed [DECISION] ship Friday after QA pass. [ACTION] @alice draft release notes [TODO: archive old branches]',
    round: 1,
    specialistId: 'pm',
    ts: '2026-05-04T00:00:00.000Z',
  };
  const items = _extractFromTurn(turn, { stage: 'meeting' });
  assert.strictEqual(items.length, 3);
  const types = items.map((i) => i.type).sort();
  assert.deepStrictEqual(types, ['action', 'decision', 'todo']);
  // owner via @ shorthand
  const action = items.find((i) => i.type === 'action');
  assert.strictEqual(action.owner, 'alice');
  // bracket-enclosed form
  const todo = items.find((i) => i.type === 'todo');
  assert.match(todo.text, /archive old branches/);
});

t('_extractOwner picks up owner=foo inside tag and @foo after', () => {
  // owner= form
  const a = _extractOwner(' owner=bob', 'do the thing');
  assert.strictEqual(a, 'bob');
  // by= alias
  const b = _extractOwner(' by=carol', 'review');
  assert.strictEqual(b, 'carol');
  // @ shorthand
  const c = _extractOwner('', '@dave file the issue');
  assert.strictEqual(c, 'dave');
  // none
  const d = _extractOwner('', 'no owner here');
  assert.strictEqual(d, null);
});

t('extractActionItems aggregates across stages with byType counts', () => {
  const sess = freshSession();
  // Inject contributions across the same stage (lightweight has at
  // most 2 stages: implement+review).
  sess.contribute('pm', '[DECISION] ship next sprint [ACTION owner=eng] add tests');
  sess.contribute('pm', '[BLOCKER] CI flake on linux runner');
  const r = extractActionItems(sess);
  assert.strictEqual(r.count, 3);
  assert.strictEqual(r.byType.decision, 1);
  assert.strictEqual(r.byType.action, 1);
  assert.strictEqual(r.byType.blocker, 1);
  // owner extracted from owner= form
  const action = r.items.find((i) => i.type === 'action');
  assert.strictEqual(action.owner, 'eng');
  // stage tagged correctly (first contribution lands in 'implement'
  // for the lightweight track).
  assert.ok(r.items.every((i) => typeof i.stage === 'string'));
});

t('case-insensitive marker matching', () => {
  const items = _extractFromTurn(
    { text: '[decision] lower-case works [Action] mixed case too', round: 1, specialistId: 'pm', ts: null },
    { stage: 'meeting' },
  );
  assert.strictEqual(items.length, 2);
  assert.deepStrictEqual(items.map((i) => i.type).sort(), ['action', 'decision']);
});

t('non-matching brackets are ignored', () => {
  const items = _extractFromTurn(
    { text: '[NOTE] just a note. [QUESTION] who owns this? [DECISION] picked option A', round: 1, specialistId: 'pm', ts: null },
    { stage: 'meeting' },
  );
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].type, 'decision');
});

t('empty session returns count:0 with zeros across types', () => {
  const sess = freshSession();
  const r = extractActionItems(sess);
  assert.strictEqual(r.count, 0);
  assert.deepStrictEqual(r.byType, { decision: 0, action: 0, todo: 0, blocker: 0 });
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\n  ${passed} passed, ${failed} failed (meeting-actions)`);
  if (failed > 0) process.exit(1);
})();
