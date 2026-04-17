const assert = require('assert');
const { describe, it } = require('node:test');
const fs = require('fs');
const path = require('path');

// Extract the real _getRulesSummary source text from pty-manager.js so the test
// stays coupled to the actual implementation instead of a reimplementation.
// (Other tests in this directory avoid `require('../src/pty-manager')` because
// the module pulls in node-pty, which isn't resolvable inside this worktree.)
function loadRulesSummaryImpl() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'pty-manager.js'),
    'utf8'
  );
  const match = src.match(/_getRulesSummary\(\)\s*\{[\s\S]*?\n  \}/);
  if (!match) throw new Error('Could not locate _getRulesSummary in pty-manager.js');
  const body = match[0]
    .replace(/^_getRulesSummary\(\)\s*\{/, '')
    .replace(/\}$/, '');
  return new Function('return function() {' + body + '};')();
}

const getRulesSummary = loadRulesSummaryImpl();

function makeManager(config) {
  return { config, _getRulesSummary: getRulesSummary };
}

const ENGLISH_RULE =
  'Respond in English only. Do not use non-ASCII characters in any output.';

describe('Worker Language — workerLanguage (7.18)', () => {
  it('appends English-only rule to default summary when workerLanguage === "en"', () => {
    const mgr = makeManager({
      rules: { appendToTask: true },
      workerDefaults: { workerLanguage: 'en' }
    });
    const summary = mgr._getRulesSummary();
    assert.ok(
      summary.includes(ENGLISH_RULE),
      'default summary must include English-only rule'
    );
  });

  it('does NOT append English-only rule when workerLanguage is absent', () => {
    const mgr = makeManager({
      rules: { appendToTask: true },
      workerDefaults: {}
    });
    const summary = mgr._getRulesSummary();
    assert.ok(!summary.includes(ENGLISH_RULE));
  });

  it('does NOT append English-only rule for other languages (e.g. ko)', () => {
    const mgr = makeManager({
      rules: { appendToTask: true },
      workerDefaults: { workerLanguage: 'ko' }
    });
    assert.ok(!mgr._getRulesSummary().includes(ENGLISH_RULE));
  });

  it('appends English-only rule to custom summary when workerLanguage === "en"', () => {
    const mgr = makeManager({
      rules: { appendToTask: true, summary: 'CUSTOM SUMMARY LINE' },
      workerDefaults: { workerLanguage: 'en' }
    });
    const summary = mgr._getRulesSummary();
    assert.ok(summary.includes('CUSTOM SUMMARY LINE'));
    assert.ok(summary.includes(ENGLISH_RULE));
  });

  it('keeps custom summary unchanged when workerLanguage is absent', () => {
    const mgr = makeManager({
      rules: { appendToTask: true, summary: 'CUSTOM SUMMARY LINE' },
      workerDefaults: {}
    });
    assert.strictEqual(mgr._getRulesSummary(), 'CUSTOM SUMMARY LINE');
  });

  it('returns null when rules.appendToTask is false regardless of workerLanguage', () => {
    const mgr = makeManager({
      rules: { appendToTask: false },
      workerDefaults: { workerLanguage: 'en' }
    });
    assert.strictEqual(mgr._getRulesSummary(), null);
  });

  it('tolerates missing workerDefaults section', () => {
    const mgr = makeManager({ rules: { appendToTask: true } });
    const summary = mgr._getRulesSummary();
    assert.ok(summary && !summary.includes(ENGLISH_RULE));
  });
});
