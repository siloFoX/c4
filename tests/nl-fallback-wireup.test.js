// parseIntentWithLLM wireup tests. Verifies that the regex parser
// fast-paths in normal cases, that 'unknown' results route through
// the Anthropic fallback (when enabled), and that diagnostic
// fall-throughs (llm-unavailable / llm-error / llm-unparsed) surface
// to the caller intact.

'use strict';

const { describe, it, after } = require('node:test');
const assert = require('assert');

const { parseIntentWithLLM, INTENTS } = require('../src/nl-interface');

describe('parseIntentWithLLM', () => {
  it('regex hit short-circuits without touching the SDK', async () => {
    const r = await parseIntentWithLLM('list workers', {
      llm: { enabled: true, apiKey: 'sk-fake' },
    });
    assert.strictEqual(r.intent, INTENTS.LIST_WORKERS);
    assert.strictEqual(r._source, 'regex');
  });

  it('returns plain regex result when LLM disabled', async () => {
    const r = await parseIntentWithLLM('arbitrary blah blah blah', {
      llm: { enabled: false },
    });
    assert.strictEqual(r.intent, INTENTS.UNKNOWN);
    // _source omitted when fallback was not used.
    assert.strictEqual(r._source, undefined);
  });

  it('routes unknown text through parseLLM when enabled', async (t) => {
    // Force require('@anthropic-ai/sdk') to return a mocked client.
    const Module = require('module');
    const realLoad = Module._load;
    Module._load = function (req, ...rest) {
      if (req === '@anthropic-ai/sdk') {
        return {
          default: function () {
            this.messages = {
              create: async () => ({
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    intent: 'list_workers',
                    params: {},
                    confidence: 0.85,
                  }),
                }],
              }),
            };
          },
        };
      }
      return realLoad.call(this, req, ...rest);
    };
    t.after(() => { Module._load = realLoad; });

    const r = await parseIntentWithLLM('garbled query that no rule catches', {
      llm: { enabled: true, apiKey: 'sk-fake', model: 'claude-sonnet-4-6' },
    });
    assert.strictEqual(r.intent, 'list_workers');
    assert.strictEqual(r.confidence, 0.85);
    assert.strictEqual(r._source, 'llm');
  });

  it('surfaces llm-unavailable diagnostic when SDK is missing', async (t) => {
    const Module = require('module');
    const realResolve = Module._resolveFilename;
    Module._resolveFilename = function (req, ...rest) {
      if (req === '@anthropic-ai/sdk') {
        const err = new Error('Cannot find module @anthropic-ai/sdk');
        err.code = 'MODULE_NOT_FOUND';
        throw err;
      }
      return realResolve.call(this, req, ...rest);
    };
    t.after(() => { Module._resolveFilename = realResolve; });

    const r = await parseIntentWithLLM('mystery', {
      llm: { enabled: true, apiKey: 'sk-fake' },
    });
    assert.strictEqual(r.intent, 'llm-unavailable');
  });

  it('returns regex result when no API key is available', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const r = await parseIntentWithLLM('mystery query', {
        llm: { enabled: true },
      });
      // parseLLM returns null → we keep the original regex result.
      assert.strictEqual(r.intent, INTENTS.UNKNOWN);
      assert.strictEqual(r._source, undefined);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  it('accepts opts.config.nl.llm as alternate config source', async () => {
    const r = await parseIntentWithLLM('list workers', {
      config: { nl: { llm: { enabled: false } } },
    });
    assert.strictEqual(r.intent, INTENTS.LIST_WORKERS);
  });

  it('invokes fallback when regex confidence is below minConfidence', async (t) => {
    // Mock SDK to return a high-confidence list_workers intent. Then
    // call with minConfidence higher than the regex result so fallback
    // fires even though regex matched something.
    const Module = require('module');
    const realLoad = Module._load;
    Module._load = function (req, ...rest) {
      if (req === '@anthropic-ai/sdk') {
        return {
          default: function () {
            this.messages = {
              create: async () => ({
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    intent: 'get_status',
                    params: { name: 'w1' },
                    confidence: 0.9,
                  }),
                }],
              }),
            };
          },
        };
      }
      return realLoad.call(this, req, ...rest);
    };
    t.after(() => { Module._load = realLoad; });

    const r = await parseIntentWithLLM('how is w1', {
      llm: { enabled: true, apiKey: 'sk-fake' },
      minConfidence: 0.99, // forces fallback even if regex hit something
    });
    // Either regex or LLM may win; if regex matched with low confidence
    // then LLM took over. Our specific text is broad — accept either
    // outcome but verify _source is set when LLM ran.
    if (r._source === 'llm') {
      assert.strictEqual(r.intent, 'get_status');
    } else {
      // regex path
      assert.ok(r.confidence >= 0.99);
    }
  });
});
