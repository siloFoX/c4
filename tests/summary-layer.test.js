const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert');
const SummaryLayer = require('../src/summary-layer');

describe('SummaryLayer', () => {
  let sl;

  beforeEach(() => {
    sl = new SummaryLayer({ threshold: 500, tailLines: 10, maxSummary: 500 });
  });

  test('needsSummary returns false for short text', () => {
    assert.strictEqual(sl.needsSummary('short text'), false);
    assert.strictEqual(sl.needsSummary(''), false);
    assert.strictEqual(sl.needsSummary(null), false);
  });

  test('needsSummary returns true for long text', () => {
    const longText = 'a'.repeat(501);
    assert.strictEqual(sl.needsSummary(longText), true);
  });

  test('summarize returns text unchanged if under threshold', () => {
    const result = sl.summarize('short text');
    assert.strictEqual(result.summarized, false);
    assert.strictEqual(result.text, 'short text');
  });

  test('summarize returns empty for null', () => {
    const result = sl.summarize(null);
    assert.strictEqual(result.summarized, false);
    assert.strictEqual(result.text, '');
  });

  test('summarize extracts errors', () => {
    const text = [
      'Starting build...',
      'Error: Cannot find module "foo"',
      'at Object.<anonymous> (index.js:1:1)',
      ...Array(50).fill('more output lines here padding'),
      'Build failed.',
    ].join('\n');
    const result = sl.summarize(text);
    assert.strictEqual(result.summarized, true);
    assert.ok(result.summary.includes('[Errors]'));
    assert.ok(result.summary.includes('Cannot find module'));
  });

  test('summarize extracts test results', () => {
    const text = [
      'Running tests...',
      'Tests: 5 passed, 2 failed, 7 total',
      ...Array(50).fill('padding line for length'),
      'Done.',
    ].join('\n');
    const result = sl.summarize(text);
    assert.strictEqual(result.summarized, true);
    assert.ok(result.summary.includes('[Tests]'));
    assert.ok(result.summary.includes('5 passed'));
  });

  test('summarize extracts file operations', () => {
    const text = [
      'Processing...',
      'Write file src/app.js',
      'Edit file src/config.json',
      ...Array(50).fill('padding line for length'),
      'Done.',
    ].join('\n');
    const result = sl.summarize(text);
    assert.strictEqual(result.summarized, true);
    assert.ok(result.summary.includes('[Files]'));
    assert.ok(result.summary.includes('app.js'));
  });

  test('summarize preserves C4 markers', () => {
    const text = [
      '[C4 SETUP] effort level -> max',
      '[STATE] edit -> test',
      '[ESCALATION] repeated error',
      ...Array(50).fill('padding line for length'),
      'Done.',
    ].join('\n');
    const result = sl.summarize(text);
    assert.strictEqual(result.summarized, true);
    assert.ok(result.summary.includes('[C4 SETUP]'));
    assert.ok(result.summary.includes('[STATE]'));
    assert.ok(result.summary.includes('[ESCALATION]'));
  });

  test('summarize includes tail lines', () => {
    const text = [
      ...Array(50).fill('padding line'),
      'last line of output',
    ].join('\n');
    const result = sl.summarize(text);
    assert.strictEqual(result.summarized, true);
    assert.ok(result.summary.includes('[Tail]'));
    assert.ok(result.summary.includes('last line of output'));
  });

  test('summarize truncates if still too long', () => {
    const sl2 = new SummaryLayer({ threshold: 100, maxSummary: 200 });
    const text = [
      ...Array(50).fill('Error: something went wrong here in this very long error message line'),
    ].join('\n');
    const result = sl2.summarize(text);
    assert.strictEqual(result.summarized, true);
    assert.ok(result.summary.length <= 200);
    assert.strictEqual(result.summary.endsWith('...'), true);
  });

  test('summarize includes originalLength', () => {
    const text = 'x'.repeat(600);
    const result = sl.summarize(text);
    assert.strictEqual(result.originalLength, 600);
  });

  // --- process() ---

  test('process returns snapshot unchanged if short', () => {
    const snap = { time: Date.now(), screen: 'short' };
    const result = sl.process(snap);
    assert.strictEqual(result, snap); // Same reference
  });

  test('process returns snapshot unchanged if autoAction', () => {
    const snap = { time: Date.now(), screen: 'x'.repeat(600), autoAction: true };
    const result = sl.process(snap);
    assert.strictEqual(result, snap);
  });

  test('process summarizes long non-autoAction snapshot', () => {
    const screen = [
      'Error: import failed',
      ...Array(50).fill('padding line for length'),
      'Build complete.',
    ].join('\n');
    const snap = { time: Date.now(), screen };
    const result = sl.process(snap);
    assert.strictEqual(result._summarized, true);
    assert.strictEqual(result._originalLength, screen.length);
    assert.ok(result.screen.includes('[Errors]'));
    assert.strictEqual(result.time, snap.time);
  });

  test('process handles null snapshot', () => {
    assert.strictEqual(sl.process(null), null);
  });

  test('process handles snapshot without screen', () => {
    const snap = { time: Date.now() };
    assert.strictEqual(sl.process(snap), snap);
  });

  // --- Custom threshold ---

  test('custom threshold respected', () => {
    const sl2 = new SummaryLayer({ threshold: 10 });
    assert.strictEqual(sl2.needsSummary('12345678901'), true);
    assert.strictEqual(sl2.needsSummary('12345'), false);
  });

  test('defaults are used when no options', () => {
    const sl2 = new SummaryLayer();
    assert.strictEqual(sl2.threshold, 500);
    assert.strictEqual(sl2.tailLines, 10);
    assert.strictEqual(sl2.maxSummary, 500);
  });

  // --- Decision extraction ---

  test('summarize extracts decisions', () => {
    const text = [
      'Thinking...',
      'should I use approach A or B?',
      ...Array(50).fill('padding line for length'),
      'Done.',
    ].join('\n');
    const result = sl.summarize(text);
    assert.ok(result.summary.includes('[Decisions]'));
    assert.ok(result.summary.includes('approach A or B'));
  });
});
