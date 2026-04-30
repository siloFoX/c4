// Slack Block Kit payload builder tests. Pure function — no webhook fired.

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');

const { buildSlackPayload } = require('../src/notifications');

describe('buildSlackPayload', () => {
  it('plain text → { text } with no attachments', () => {
    const p = buildSlackPayload('hello world');
    assert.strictEqual(p.text, 'hello world');
    assert.strictEqual(p.attachments, undefined);
  });

  it('CRITICAL DENY → red color + header + code section', () => {
    const p = buildSlackPayload('[CRITICAL DENY] worker w1\nrm -rf /tmp');
    assert.ok(p.attachments && p.attachments.length === 1);
    assert.strictEqual(p.attachments[0].color, '#dc2626');
    const blocks = p.attachments[0].blocks;
    const hdr = blocks.find((b) => b.type === 'header');
    assert.match(hdr.text.text, /CRITICAL DENY/);
    const sec = blocks.find((b) => b.type === 'section');
    assert.match(sec.text.text, /rm -rf \/tmp/);
    // context block always present with timestamp
    const ctx = blocks.find((b) => b.type === 'context');
    assert.ok(ctx);
  });

  it('WORKFLOW FAIL → amber color', () => {
    const p = buildSlackPayload('[WORKFLOW FAIL] morning-routine\nstep b: shell exit=1');
    assert.strictEqual(p.attachments[0].color, '#f59e0b');
  });

  it('SCHEDULE FAIL → amber color', () => {
    const p = buildSlackPayload('[SCHEDULE FAIL] daily-clean (0 2 * * *): rsync exit=23');
    assert.strictEqual(p.attachments[0].color, '#f59e0b');
  });

  it('COST BUDGET → purple color', () => {
    const p = buildSlackPayload('[COST BUDGET] 2026-04 cost 130 USD over 100 USD');
    assert.strictEqual(p.attachments[0].color, '#a855f7');
  });

  it('CI PASS / CI FAIL → emerald color', () => {
    const pass = buildSlackPayload('[CI PASS] worker-x: npm test');
    const fail = buildSlackPayload('[CI FAIL] worker-y: pytest');
    assert.strictEqual(pass.attachments[0].color, '#10b981');
    assert.strictEqual(fail.attachments[0].color, '#10b981');
  });

  it('header truncates very long titles', () => {
    const long = '[CRITICAL DENY] ' + 'a'.repeat(500);
    const p = buildSlackPayload(long);
    const hdr = p.attachments[0].blocks.find((b) => b.type === 'header');
    assert.ok(hdr.text.text.length <= 150);
  });

  it('text fallback always populated for previews', () => {
    const p = buildSlackPayload('[CRITICAL DENY] x');
    assert.match(p.text, /CRITICAL DENY/);
  });
});
