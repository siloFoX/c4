// (8.21) Intervention state split + sticky-flag clear.
//
// These tests cover the narrowed intervention semantics:
//   - detectApprovalPrompt: tail-regex over real Claude Code TUI samples
//   - clearInterventionIfResolved: auto-clear when prompt disappears
//   - mapInterventionToPublic: internal state -> public enum
//   - background-exit downgrade: non-zero child exit w/o prompt -> bg_exit
//   - stall promotion: bg_exit + 10min idle -> escalation
//   - monitor cron source-grep: refactor guard on pty-manager.js so a
//     future rewrite cannot silently re-broaden the predicate.
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
  detectApprovalPrompt,
  mapInterventionToPublic,
  clearInterventionIfResolved,
} = require('../src/intervention-state');

describe('detectApprovalPrompt — real Claude Code TUI samples', () => {
  it('flags "Do you want to proceed?" (bash permission)', () => {
    const snap = [
      'Bash command',
      '  npm test',
      '',
      'Do you want to proceed? (y/n)',
      '\u276f 1. Yes',
      '  2. No',
    ].join('\n');
    assert.strictEqual(detectApprovalPrompt(snap), true);
  });

  it('flags "Do you want to create <file>?" (Write tool)', () => {
    const snap = [
      'Write file: test-pattern.txt',
      '',
      'Do you want to create test-pattern.txt? (y/n)',
    ].join('\n');
    assert.strictEqual(detectApprovalPrompt(snap), true);
  });

  it('flags "Do you want to make this edit to <file>?" (Edit tool)', () => {
    const snap = [
      'Edit file: src/foo.js',
      '--- old',
      '+++ new',
      'Do you want to make this edit to src/foo.js?',
    ].join('\n');
    assert.strictEqual(detectApprovalPrompt(snap), true);
  });

  it('flags bash-style "Continue? [y/N]"', () => {
    const snap = 'Installing... 42 new packages\nContinue? [y/N]';
    assert.strictEqual(detectApprovalPrompt(snap), true);
  });

  it('flags trust-folder prompt', () => {
    const snap = 'Do you trust this folder?\n\u276f 1. Yes, trust\n  2. No, cancel';
    assert.strictEqual(detectApprovalPrompt(snap), true);
  });

  it('returns false for a quiet idle terminal', () => {
    const snap = [
      '$ npm test',
      'Tests passed: 107/107',
      'Done in 8.4s',
      '',
    ].join('\n');
    assert.strictEqual(detectApprovalPrompt(snap), false);
  });

  it('ignores prompts that scrolled off the tail', () => {
    const oldPrompt = 'Do you want to proceed? (y/n)\n\u276f 1. Yes\n';
    const longIdle = Array.from({ length: 100 }, (_, i) => `log line ${i}`).join('\n');
    assert.strictEqual(detectApprovalPrompt(oldPrompt + longIdle), false);
  });

  it('handles empty / non-string input without throwing', () => {
    assert.strictEqual(detectApprovalPrompt(''), false);
    assert.strictEqual(detectApprovalPrompt(null), false);
    assert.strictEqual(detectApprovalPrompt(undefined), false);
    assert.strictEqual(detectApprovalPrompt(42), false);
  });
});

describe('clearInterventionIfResolved', () => {
  it('clears escalation when no prompt is visible', () => {
    const w = { _interventionState: 'escalation', alive: true };
    const cleared = clearInterventionIfResolved(w, 'idle\nwaiting for next task');
    assert.strictEqual(cleared, true);
    assert.strictEqual(w._interventionState, null);
    assert.strictEqual(w._hadIntervention, true);
    assert.ok(w._lastInterventionAt);
  });

  it('clears question when no prompt is visible', () => {
    const w = { _interventionState: 'question', alive: true };
    clearInterventionIfResolved(w, 'npm test passed\n');
    assert.strictEqual(w._interventionState, null);
    assert.strictEqual(w._hadIntervention, true);
  });

  it('keeps escalation when an approval prompt is visible', () => {
    const w = { _interventionState: 'escalation', alive: true };
    const cleared = clearInterventionIfResolved(w, 'Do you want to proceed? (y/n)');
    assert.strictEqual(cleared, false);
    assert.strictEqual(w._interventionState, 'escalation');
    assert.ok(!w._hadIntervention);
  });

  it('never auto-clears critical_deny', () => {
    const w = { _interventionState: 'critical_deny', alive: true };
    const cleared = clearInterventionIfResolved(w, 'idle');
    assert.strictEqual(cleared, false);
    assert.strictEqual(w._interventionState, 'critical_deny');
  });

  it('returns false for already-null state', () => {
    const w = { _interventionState: null };
    assert.strictEqual(clearInterventionIfResolved(w, 'idle'), false);
  });
});

describe('mapInterventionToPublic', () => {
  it('maps question -> approval_pending', () => {
    assert.strictEqual(
      mapInterventionToPublic({ _interventionState: 'question', alive: true }),
      'approval_pending'
    );
  });
  it('maps critical_deny -> approval_pending', () => {
    assert.strictEqual(
      mapInterventionToPublic({ _interventionState: 'critical_deny', alive: true }),
      'approval_pending'
    );
  });
  it('maps escalation -> approval_pending', () => {
    assert.strictEqual(
      mapInterventionToPublic({ _interventionState: 'escalation', alive: true }),
      'approval_pending'
    );
  });
  it('maps bg_exit -> background_exit', () => {
    assert.strictEqual(
      mapInterventionToPublic({ _interventionState: 'bg_exit', alive: true }),
      'background_exit'
    );
  });
  it('maps null + _hadIntervention -> past_resolved', () => {
    assert.strictEqual(
      mapInterventionToPublic({ _interventionState: null, _hadIntervention: true }),
      'past_resolved'
    );
  });
  it('maps null without _hadIntervention -> null', () => {
    assert.strictEqual(
      mapInterventionToPublic({ _interventionState: null, _hadIntervention: false }),
      null
    );
  });
});

describe('background-exit downgrade (non-zero child exit)', () => {
  // Mirrors the set-site logic in pty-manager._handlePostToolUse so the test
  // covers the classification contract, not just the module internals.
  function classifyOnError({ worker, snapshot, count, maxRetries = 3 }) {
    if (count < maxRetries) return;
    const hasPrompt = detectApprovalPrompt(snapshot);
    worker._hadIntervention = true;
    worker._lastInterventionAt = new Date().toISOString();
    worker._interventionState = (hasPrompt || !worker.alive) ? 'escalation' : 'bg_exit';
  }

  it('child exit 1 + parent alive + no prompt -> bg_exit', () => {
    const w = { alive: true, _interventionState: null };
    classifyOnError({
      worker: w,
      snapshot: 'vite dev --port 5174\nProcess exited with code 1\n$ ',
      count: 3,
    });
    assert.strictEqual(w._interventionState, 'bg_exit');
    assert.strictEqual(mapInterventionToPublic(w), 'background_exit');
  });

  it('child exit 144 (vite shutdown) + parent alive -> bg_exit (no page)', () => {
    // Reproduces the ux-explorer false positive from 2026-04-19.
    const w = { alive: true, _interventionState: null };
    classifyOnError({
      worker: w,
      snapshot: 'vite v5.2.0\n  audit complete\nProcess exited with code 144\n',
      count: 3,
    });
    assert.strictEqual(w._interventionState, 'bg_exit');
  });

  it('error + prompt still visible -> escalation (needs human)', () => {
    const w = { alive: true, _interventionState: null };
    classifyOnError({
      worker: w,
      snapshot: 'ERR: port in use\nDo you want to proceed?',
      count: 3,
    });
    assert.strictEqual(w._interventionState, 'escalation');
    assert.strictEqual(mapInterventionToPublic(w), 'approval_pending');
  });

  it('error + parent dead -> escalation (operator has to intervene)', () => {
    const w = { alive: false, _interventionState: null };
    classifyOnError({ worker: w, snapshot: 'fatal: segfault', count: 3 });
    assert.strictEqual(w._interventionState, 'escalation');
  });
});

describe('stall promotion (bg_exit + 10min idle -> escalation)', () => {
  // Mirror of the healthCheck promoter loop. Kept tiny so the test locks
  // in the threshold + predicate, not the surrounding cron mechanics.
  function promoteIfStalled(worker, idleMs, snapshot, thresholdMs = 600000) {
    if (worker._interventionState !== 'bg_exit') return false;
    if (idleMs < thresholdMs) return false;
    if (detectApprovalPrompt(snapshot)) return false;
    worker._interventionState = 'escalation';
    worker._lastInterventionAt = new Date().toISOString();
    return true;
  }

  it('promotes bg_exit to escalation after 11min idle', () => {
    const w = { alive: true, _interventionState: 'bg_exit' };
    const promoted = promoteIfStalled(w, 11 * 60 * 1000, 'idle terminal');
    assert.strictEqual(promoted, true);
    assert.strictEqual(w._interventionState, 'escalation');
    assert.strictEqual(mapInterventionToPublic(w), 'approval_pending');
  });

  it('does not promote under the 10min threshold', () => {
    const w = { alive: true, _interventionState: 'bg_exit' };
    assert.strictEqual(promoteIfStalled(w, 5 * 60 * 1000, 'idle'), false);
    assert.strictEqual(w._interventionState, 'bg_exit');
  });

  it('does not promote when an approval prompt is already visible', () => {
    // A prompt means escalation is redundant — the existing set-site
    // will handle it on the next tick.
    const w = { alive: true, _interventionState: 'bg_exit' };
    assert.strictEqual(
      promoteIfStalled(w, 15 * 60 * 1000, 'Do you want to proceed?'),
      false
    );
    assert.strictEqual(w._interventionState, 'bg_exit');
  });

  it('is a no-op for non-bg_exit states (does not touch escalation/question)', () => {
    const w1 = { _interventionState: 'escalation' };
    const w2 = { _interventionState: 'question' };
    assert.strictEqual(promoteIfStalled(w1, 30 * 60 * 1000, 'idle'), false);
    assert.strictEqual(promoteIfStalled(w2, 30 * 60 * 1000, 'idle'), false);
    assert.strictEqual(w1._interventionState, 'escalation');
    assert.strictEqual(w2._interventionState, 'question');
  });
});

describe('monitor cron predicate — source-grep refactor guard', () => {
  const ptyManagerSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'pty-manager.js'),
    'utf8'
  );

  it('imports the intervention-state module', () => {
    assert.ok(
      /require\(['"]\.\/intervention-state['"]\)/.test(ptyManagerSrc),
      'pty-manager.js must require ./intervention-state'
    );
  });

  it('references approval_pending explicitly in the stall-detection block', () => {
    // Extract the stall-detection region so a match elsewhere in the file
    // doesn't accidentally satisfy this assertion.
    const stallRegion = ptyManagerSrc
      .split('Stall detection:')[1]
      ?.split('Notifications: flush Slack buffer')[0] || '';
    assert.ok(
      /approval_pending/.test(stallRegion),
      'stall-detection block must check approval_pending, not truthy _interventionState'
    );
  });

  it('does not fall back to the old truthy-only notifyStall predicate', () => {
    // The pre-8.21 predicate was:
    //   if (w._interventionState) {
    //     this._notifications.notifyStall(r.name, `intervention: ${w._interventionState}`);
    // Any refactor that restores it must fail this test.
    const oldPattern = /if \(w\._interventionState\)\s*\{\s*\n\s*this\._notifications\.notifyStall\(r\.name, `intervention: \$\{w\._interventionState\}`\);/;
    assert.ok(
      !oldPattern.test(ptyManagerSrc),
      'old truthy-only notifyStall predicate is forbidden (8.21)'
    );
  });

  it('the bg_exit stall promoter is wired into healthCheck', () => {
    assert.ok(
      /bg_exit.*escalation|STALL PROMOTE/i.test(ptyManagerSrc),
      'bg_exit -> escalation promotion must live in pty-manager.js'
    );
  });
});
