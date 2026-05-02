'use strict';

// (v1.10.76) Rules-based router tests.
//
// `pickRoutedType(task, agentConfig)` — multi-tier alternative to
// the binary hybrid heuristic. Each rule is `{ if?: <Condition>,
// default?: true, use: <key> }`; first match wins.
//
// Condition keys (AND semantics — all specified must hold):
//   lengthLte, lengthGte, matches (regex source, /i),
//   notMatches (regex source, /i).
//
// Bad rule entries are skipped silently (operator config errors
// must not crash the daemon).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  pickRoutedType,
  createAdapter,
  DEFAULT_HYBRID_COMPLEX,
} = require('../src/agents');
const ClaudeCodeAdapter = require('../src/agents/claude-code');
const { LocalOllamaAdapter } = require('../src/agents');
const MockAdapter = require('../src/agents/mock');

describe('pickRoutedType — basic dispatch', () => {
  it('returns fallback when no rules array', () => {
    const t = pickRoutedType('hi', {});
    assert.equal(t, DEFAULT_HYBRID_COMPLEX);
  });

  it('returns fallback when rules empty', () => {
    const t = pickRoutedType('hi', { rules: [] });
    assert.equal(t, DEFAULT_HYBRID_COMPLEX);
  });

  it('honors agentConfig.fallback', () => {
    const t = pickRoutedType('hi', { rules: [], fallback: 'mock' });
    assert.equal(t, 'mock');
  });

  it('first matching rule wins', () => {
    const t = pickRoutedType('hello', {
      rules: [
        { if: { lengthLte: 100 }, use: 'local-ollama' },
        { if: { lengthLte: 200 }, use: 'mock' },
      ],
    });
    assert.equal(t, 'local-ollama');
  });

  it('default rule catches anything', () => {
    const t = pickRoutedType('something nobody matches', {
      rules: [
        { if: { matches: 'never' }, use: 'mock' },
        { default: true, use: 'claude-code' },
      ],
    });
    assert.equal(t, 'claude-code');
  });

  it('default rule short-circuits even if upstream matches would have caught', () => {
    // Default rule before length check — order matters.
    const t = pickRoutedType('hi', {
      rules: [
        { default: true, use: 'mock' },
        { if: { lengthLte: 100 }, use: 'claude-code' },
      ],
    });
    assert.equal(t, 'mock');
  });
});

describe('pickRoutedType — Condition keys', () => {
  it('lengthLte matches when task.length <= n', () => {
    const cfg = { rules: [{ if: { lengthLte: 5 }, use: 'mock' }] };
    assert.equal(pickRoutedType('hi', cfg), 'mock');
    assert.equal(pickRoutedType('helloworld', cfg), DEFAULT_HYBRID_COMPLEX);
  });

  it('lengthGte matches when task.length >= n', () => {
    const cfg = { rules: [{ if: { lengthGte: 10 }, use: 'mock' }] };
    assert.equal(pickRoutedType('helloworld', cfg), 'mock');
    assert.equal(pickRoutedType('hi', cfg), DEFAULT_HYBRID_COMPLEX);
  });

  it('lengthLte AND lengthGte combine (range gate)', () => {
    const cfg = { rules: [{ if: { lengthGte: 5, lengthLte: 10 }, use: 'mock' }] };
    assert.equal(pickRoutedType('hello', cfg), 'mock');
    assert.equal(pickRoutedType('helloworld', cfg), 'mock');
    assert.equal(pickRoutedType('hi', cfg), DEFAULT_HYBRID_COMPLEX);
    assert.equal(pickRoutedType('helloworldextra', cfg), DEFAULT_HYBRID_COMPLEX);
  });

  it('matches uses regex source, case-insensitive', () => {
    const cfg = { rules: [{ if: { matches: '\\bdesign\\b' }, use: 'mock' }] };
    assert.equal(pickRoutedType('please DESIGN this', cfg), 'mock');
    assert.equal(pickRoutedType('redesigning soon', cfg), DEFAULT_HYBRID_COMPLEX);
    assert.equal(pickRoutedType('a designed object', cfg), DEFAULT_HYBRID_COMPLEX);
  });

  it('notMatches inverts the regex check', () => {
    const cfg = { rules: [{ if: { notMatches: 'simple' }, use: 'mock' }] };
    assert.equal(pickRoutedType('something complex', cfg), 'mock');
    assert.equal(pickRoutedType('simple test', cfg), DEFAULT_HYBRID_COMPLEX);
  });

  it('matches AND notMatches combine', () => {
    const cfg = {
      rules: [{
        if: { matches: 'fix', notMatches: 'bug' },
        use: 'mock',
      }],
    };
    assert.equal(pickRoutedType('fix the formatter', cfg), 'mock');
    assert.equal(pickRoutedType('fix the bug', cfg), DEFAULT_HYBRID_COMPLEX);
    assert.equal(pickRoutedType('refactor', cfg), DEFAULT_HYBRID_COMPLEX);
  });

  it('empty if:{} does not match (operator misconfig)', () => {
    const cfg = { rules: [{ if: {}, use: 'mock' }] };
    assert.equal(pickRoutedType('anything', cfg), DEFAULT_HYBRID_COMPLEX);
  });
});

describe('pickRoutedType — silent skipping of bad rules', () => {
  it('skips rule with non-string use', () => {
    const cfg = {
      rules: [
        { if: { lengthLte: 100 }, use: 42 },
        { default: true, use: 'mock' },
      ],
    };
    assert.equal(pickRoutedType('hi', cfg), 'mock');
  });

  it('skips rule with empty use string', () => {
    const cfg = {
      rules: [
        { if: { lengthLte: 100 }, use: '' },
        { default: true, use: 'mock' },
      ],
    };
    assert.equal(pickRoutedType('hi', cfg), 'mock');
  });

  it('skips rule with invalid regex source', () => {
    const cfg = {
      rules: [
        { if: { matches: '[unterminated' }, use: 'mock' },
        { default: true, use: 'claude-code' },
      ],
    };
    assert.equal(pickRoutedType('anything', cfg), 'claude-code');
  });

  it('skips null / non-object rule entries', () => {
    const cfg = {
      rules: [
        null,
        'string-not-object',
        { if: { lengthLte: 100 }, use: 'mock' },
      ],
    };
    assert.equal(pickRoutedType('hi', cfg), 'mock');
  });
});

describe('createAdapter — type:"router" wiring', () => {
  it('router type + matching rule instantiates the right adapter', () => {
    const a = createAdapter(
      {
        type: 'router',
        rules: [
          { if: { lengthLte: 100 }, use: 'mock' },
          { default: true, use: 'claude-code' },
        ],
      },
      { task: 'short prompt' }
    );
    assert.ok(a instanceof MockAdapter);
  });

  it('router type + long task falls through default to claude-code', () => {
    const a = createAdapter(
      {
        type: 'router',
        rules: [
          { if: { lengthLte: 5 }, use: 'mock' },
          { default: true, use: 'claude-code' },
        ],
      },
      { task: 'this prompt is definitely longer than five chars' }
    );
    assert.ok(a instanceof ClaudeCodeAdapter);
  });

  it('router with no matching rule + no default falls back to fallback', () => {
    const a = createAdapter(
      {
        type: 'router',
        rules: [
          { if: { matches: 'nope' }, use: 'mock' },
        ],
        fallback: 'local-ollama',
      },
      { task: 'unrelated prompt' }
    );
    assert.ok(a instanceof LocalOllamaAdapter);
  });

  it('router type passes options to the resolved adapter', () => {
    const a = createAdapter(
      {
        type: 'router',
        rules: [{ default: true, use: 'mock' }],
        options: { mock: { name: 'routed-mock', version: '0.0.1' } },
      },
      { task: 'x' }
    );
    assert.equal(a.metadata.name, 'routed-mock');
    assert.equal(a.metadata.version, '0.0.1');
  });

  it('hybrid still works (backwards compat)', () => {
    // Pre-1.10.76 callers using `type: 'hybrid'` keep the same
    // length+keyword behavior — router is additive.
    const a = createAdapter(
      { type: 'hybrid' },
      { task: 'refactor this codebase' }
    );
    assert.ok(a instanceof ClaudeCodeAdapter);  // 'refactor' triggers complex
  });

  it('unknown `use` in matching rule throws via createAdapter', () => {
    assert.throws(() =>
      createAdapter(
        {
          type: 'router',
          rules: [{ default: true, use: 'this-key-does-not-exist' }],
        },
        { task: 'x' }
      ),
      /Unknown agent type/
    );
  });
});
