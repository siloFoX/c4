const SummaryLayer = require('../src/summary-layer');

describe('SummaryLayer', () => {
  let sl;

  beforeEach(() => {
    sl = new SummaryLayer({ threshold: 500, tailLines: 10, maxSummary: 500 });
  });

  test('needsSummary returns false for short text', () => {
    expect(sl.needsSummary('short text')).toBe(false);
    expect(sl.needsSummary('')).toBe(false);
    expect(sl.needsSummary(null)).toBe(false);
  });

  test('needsSummary returns true for long text', () => {
    const longText = 'a'.repeat(501);
    expect(sl.needsSummary(longText)).toBe(true);
  });

  test('summarize returns text unchanged if under threshold', () => {
    const result = sl.summarize('short text');
    expect(result.summarized).toBe(false);
    expect(result.text).toBe('short text');
  });

  test('summarize returns empty for null', () => {
    const result = sl.summarize(null);
    expect(result.summarized).toBe(false);
    expect(result.text).toBe('');
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
    expect(result.summarized).toBe(true);
    expect(result.summary).toContain('[Errors]');
    expect(result.summary).toContain('Cannot find module');
  });

  test('summarize extracts test results', () => {
    const text = [
      'Running tests...',
      'Tests: 5 passed, 2 failed, 7 total',
      ...Array(50).fill('padding line for length'),
      'Done.',
    ].join('\n');
    const result = sl.summarize(text);
    expect(result.summarized).toBe(true);
    expect(result.summary).toContain('[Tests]');
    expect(result.summary).toContain('5 passed');
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
    expect(result.summarized).toBe(true);
    expect(result.summary).toContain('[Files]');
    expect(result.summary).toContain('app.js');
  });

  test('summarize preserves C4 markers', () => {
    const text = [
      '[C4 SETUP] effort level → max',
      '[STATE] edit → test',
      '[ESCALATION] repeated error',
      ...Array(50).fill('padding line for length'),
      'Done.',
    ].join('\n');
    const result = sl.summarize(text);
    expect(result.summarized).toBe(true);
    expect(result.summary).toContain('[C4 SETUP]');
    expect(result.summary).toContain('[STATE]');
    expect(result.summary).toContain('[ESCALATION]');
  });

  test('summarize includes tail lines', () => {
    const text = [
      ...Array(50).fill('padding line'),
      'last line of output',
    ].join('\n');
    const result = sl.summarize(text);
    expect(result.summarized).toBe(true);
    expect(result.summary).toContain('[Tail]');
    expect(result.summary).toContain('last line of output');
  });

  test('summarize truncates if still too long', () => {
    const sl2 = new SummaryLayer({ threshold: 100, maxSummary: 200 });
    const text = [
      ...Array(50).fill('Error: something went wrong here in this very long error message line'),
    ].join('\n');
    const result = sl2.summarize(text);
    expect(result.summarized).toBe(true);
    expect(result.summary.length).toBeLessThanOrEqual(200);
    expect(result.summary.endsWith('...')).toBe(true);
  });

  test('summarize includes originalLength', () => {
    const text = 'x'.repeat(600);
    const result = sl.summarize(text);
    expect(result.originalLength).toBe(600);
  });

  // --- process() ---

  test('process returns snapshot unchanged if short', () => {
    const snap = { time: Date.now(), screen: 'short' };
    const result = sl.process(snap);
    expect(result).toBe(snap); // Same reference
  });

  test('process returns snapshot unchanged if autoAction', () => {
    const snap = { time: Date.now(), screen: 'x'.repeat(600), autoAction: true };
    const result = sl.process(snap);
    expect(result).toBe(snap);
  });

  test('process summarizes long non-autoAction snapshot', () => {
    const screen = [
      'Error: import failed',
      ...Array(50).fill('padding line for length'),
      'Build complete.',
    ].join('\n');
    const snap = { time: Date.now(), screen };
    const result = sl.process(snap);
    expect(result._summarized).toBe(true);
    expect(result._originalLength).toBe(screen.length);
    expect(result.screen).toContain('[Errors]');
    expect(result.time).toBe(snap.time);
  });

  test('process handles null snapshot', () => {
    expect(sl.process(null)).toBeNull();
  });

  test('process handles snapshot without screen', () => {
    const snap = { time: Date.now() };
    expect(sl.process(snap)).toBe(snap);
  });

  // --- Custom threshold ---

  test('custom threshold respected', () => {
    const sl2 = new SummaryLayer({ threshold: 10 });
    expect(sl2.needsSummary('12345678901')).toBe(true);
    expect(sl2.needsSummary('12345')).toBe(false);
  });

  test('defaults are used when no options', () => {
    const sl2 = new SummaryLayer();
    expect(sl2.threshold).toBe(500);
    expect(sl2.tailLines).toBe(10);
    expect(sl2.maxSummary).toBe(500);
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
    expect(result.summary).toContain('[Decisions]');
    expect(result.summary).toContain('approach A or B');
  });
});
