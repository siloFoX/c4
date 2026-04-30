// validateGraph config-field validation tests. Verifies that typed
// node config errors (retry.maxRetries < 0, audit.details non-object,
// wait.delayMs string, condition.expression non-string) are caught
// at create/update time instead of leaking into the executor.

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');

const { validateGraph } = require('../src/workflow');

function withEnd(node) {
  return validateGraph(
    [node, { id: 'end', type: 'end' }],
    [{ from: node.id, to: 'end' }],
  );
}

describe('validateGraph: config-field validation', () => {
  it('clean retry block passes', () => {
    const v = withEnd({
      id: 'a', type: 'task',
      config: { retry: { maxRetries: 2, backoffMs: 100 } },
    });
    assert.strictEqual(v.valid, true);
  });

  it('rejects negative retry.maxRetries', () => {
    const v = withEnd({
      id: 'a', type: 'task',
      config: { retry: { maxRetries: -1 } },
    });
    assert.strictEqual(v.valid, false);
    assert.ok(v.errors.some((e) => /retry\.maxRetries/.test(e)));
  });

  it('rejects negative retry.backoffMs', () => {
    const v = withEnd({
      id: 'a', type: 'task',
      config: { retry: { backoffMs: -50 } },
    });
    assert.strictEqual(v.valid, false);
    assert.ok(v.errors.some((e) => /retry\.backoffMs/.test(e)));
  });

  it('rejects non-object retry block', () => {
    const v = withEnd({
      id: 'a', type: 'task',
      config: { retry: 'yes please' },
    });
    assert.strictEqual(v.valid, false);
    assert.ok(v.errors.some((e) => /retry must be an object/.test(e)));
  });

  it('rejects wait.delayMs that is not a number', () => {
    const v = withEnd({
      id: 'w', type: 'wait',
      config: { delayMs: 'oops' },
    });
    assert.strictEqual(v.valid, false);
    assert.ok(v.errors.some((e) => /delayMs/.test(e)));
  });

  it('accepts wait.delayMs = 0', () => {
    const v = withEnd({
      id: 'w', type: 'wait',
      config: { delayMs: 0 },
    });
    assert.strictEqual(v.valid, true);
  });

  it('rejects non-string condition.expression', () => {
    const v = withEnd({
      id: 'c', type: 'condition',
      config: { expression: 123 },
    });
    assert.strictEqual(v.valid, false);
    assert.ok(v.errors.some((e) => /expression/.test(e)));
  });

  it('rejects non-string audit.eventType', () => {
    const v = withEnd({
      id: 'a', type: 'audit',
      config: { eventType: 42 },
    });
    assert.strictEqual(v.valid, false);
    assert.ok(v.errors.some((e) => /eventType/.test(e)));
  });

  it('rejects non-object audit.details', () => {
    const v = withEnd({
      id: 'a', type: 'audit',
      config: { details: 'not an object' },
    });
    assert.strictEqual(v.valid, false);
    assert.ok(v.errors.some((e) => /details/.test(e)));
  });

  it('clean audit config passes', () => {
    const v = withEnd({
      id: 'a', type: 'audit',
      config: { eventType: 'task.completed', target: 'w1', details: { note: 'ok' } },
    });
    assert.strictEqual(v.valid, true);
  });
});
