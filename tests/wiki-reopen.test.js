'use strict';

// Tests for src/wiki-reopen.js (multi-specialist phase 3.3).

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { reopenPage, renderSeedContext, _markReopened } = require('../src/wiki-reopen');
const { resetShared: resetMeetingStore } = require('../src/meeting-session');

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'c4-reopen-'));
}

function writeFm(absPath, fm, body) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) lines.push(`${k}: [${v.map((s) => JSON.stringify(s)).join(', ')}]`);
    else lines.push(`${k}: ${v}`);
  }
  lines.push('---');
  lines.push('');
  lines.push(body);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, lines.join('\n'));
}

t('reopenPage requires a path', () => {
  resetMeetingStore();
  assert.throws(() => reopenPage(''), /page path is required/);
  assert.throws(() => reopenPage(null), /page path is required/);
});

t('reopenPage on a missing page surfaces a clear error', () => {
  resetMeetingStore();
  const wikiRoot = makeTmp();
  assert.throws(() => reopenPage('adr/0001-nope.md', { wikiRoot }), /not found/);
});

t('reopenPage seeds the meeting with the original page + related', () => {
  resetMeetingStore();
  const wikiRoot = makeTmp();
  writeFm(
    path.join(wikiRoot, 'adr', '0001-event-stream.md'),
    { title: 'Event-sourced audit', type: 'adr', status: 'accepted', related: ['adr/0002-companion.md'] },
    '# Event Stream\nDecision body…',
  );
  writeFm(
    path.join(wikiRoot, 'adr', '0002-companion.md'),
    { title: 'Companion ADR', type: 'adr', status: 'accepted' },
    '# Companion\nMore details…',
  );

  const r = reopenPage('adr/0001-event-stream.md', { wikiRoot });
  assert.strictEqual(r.contextSeeds.length, 2, 'should pull original + 1 related');
  assert.strictEqual(r.contextSeeds[0].path, 'adr/0001-event-stream.md');
  assert.strictEqual(r.contextSeeds[1].path, 'adr/0002-companion.md');
  assert.ok(r.meeting, 'meeting session should be returned');
  assert.strictEqual(r.meeting.status, 'pending');
  assert.strictEqual(r.plan.reopenedFrom, 'adr/0001-event-stream.md');
});

t('reopenPage flips original page status to reopened', () => {
  resetMeetingStore();
  const wikiRoot = makeTmp();
  const adrPath = path.join(wikiRoot, 'adr', '0042-test.md');
  writeFm(adrPath, { title: 'Test', type: 'adr', status: 'accepted' }, '# Body');
  reopenPage('adr/0042-test.md', { wikiRoot });
  const after = fs.readFileSync(adrPath, 'utf8');
  assert.ok(after.includes('status: reopened'), 'status should be reopened');
  assert.ok(after.match(/reopened_at:\s*\S+/), 'reopened_at should be stamped');
  assert.ok(!after.includes('status: accepted'), 'old status should be gone');
});

t('reopenPage leaves stale-related pages unattached without throwing', () => {
  resetMeetingStore();
  const wikiRoot = makeTmp();
  writeFm(
    path.join(wikiRoot, 'adr', '0001-only.md'),
    { title: 'Lonely', type: 'adr', status: 'accepted', related: ['adr/does-not-exist.md', 'adr/also-missing.md'] },
    '# Body',
  );
  // Should not throw despite missing related pages.
  const r = reopenPage('adr/0001-only.md', { wikiRoot });
  assert.strictEqual(r.contextSeeds.length, 1, 'only the original page should seed when related are missing');
});

t('reopenPage caps related seeds via maxRelated', () => {
  resetMeetingStore();
  const wikiRoot = makeTmp();
  const related = [];
  for (let i = 0; i < 8; i += 1) {
    const p = `adr/000${i + 2}-rel-${i}.md`;
    writeFm(path.join(wikiRoot, p), { title: `Rel ${i}`, type: 'adr', status: 'accepted' }, 'body');
    related.push(p);
  }
  writeFm(
    path.join(wikiRoot, 'adr', '0001-source.md'),
    { title: 'Source', type: 'adr', status: 'accepted', related },
    '# Source',
  );
  const r = reopenPage('adr/0001-source.md', { wikiRoot, maxRelated: 3 });
  assert.strictEqual(r.contextSeeds.length, 4, 'original + 3 related = 4');
});

t('reopenPage with markReopened:false preserves original status', () => {
  resetMeetingStore();
  const wikiRoot = makeTmp();
  const adrPath = path.join(wikiRoot, 'adr', '0001-keep.md');
  writeFm(adrPath, { title: 'Keep', type: 'adr', status: 'accepted' }, '# B');
  reopenPage('adr/0001-keep.md', { wikiRoot, markReopened: false });
  const after = fs.readFileSync(adrPath, 'utf8');
  assert.ok(after.includes('status: accepted'), 'status should still be accepted');
  assert.ok(!after.includes('status: reopened'));
});

t('renderSeedContext produces a structured prompt blob', () => {
  const seeds = [
    {
      path: 'adr/0042-x.md',
      frontmatter: { title: 'X Decision', status: 'reopened', last_reviewed: '2026-04-01' },
      body: '# X\nBody text here.',
    },
  ];
  const text = renderSeedContext(seeds);
  assert.ok(text.includes('# Prior decisions'));
  assert.ok(text.includes('## X Decision'));
  assert.ok(text.includes('Path: adr/0042-x.md'));
  assert.ok(text.includes('Status: reopened'));
  assert.ok(text.includes('Body text here.'));
});

t('renderSeedContext truncates very long bodies', () => {
  const seeds = [{
    path: 'p.md',
    frontmatter: { title: 'T' },
    body: 'A'.repeat(5000),
  }];
  const text = renderSeedContext(seeds);
  assert.ok(text.includes('truncated'));
  assert.ok(text.length < 5500, `expected truncation, got ${text.length}`);
});

t('renderSeedContext on empty input returns empty string', () => {
  assert.strictEqual(renderSeedContext([]), '');
  assert.strictEqual(renderSeedContext(null), '');
});

t('_markReopened on page with no frontmatter prepends one', () => {
  const dir = makeTmp();
  const p = path.join(dir, 'plain.md');
  fs.writeFileSync(p, '# Plain\nBody');
  _markReopened(p);
  const after = fs.readFileSync(p, 'utf8');
  assert.ok(after.startsWith('---'));
  assert.ok(after.includes('status: reopened'));
  assert.ok(after.includes('# Plain'));
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\n  ${passed} passed, ${failed} failed (wiki-reopen)`);
  if (failed > 0) process.exit(1);
})();
