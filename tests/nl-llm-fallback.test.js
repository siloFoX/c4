// NL LLM fallback tests. Verifies:
//   - opts.enabled gate (off → null)
//   - missing API key → null
//   - missing @anthropic-ai/sdk → 'llm-unavailable' diagnostic
//   - happy path JSON parsing through a mocked SDK
//   - SDK throw → 'llm-error' diagnostic

'use strict';

const { describe, it, after } = require('node:test');
const assert = require('assert');

const { parseLLM } = require('../src/nl-llm-fallback');

describe('parseLLM', () => {
  it('returns null when opts.enabled is false', async () => {
    const r = await parseLLM('hi', { enabled: false });
    assert.strictEqual(r, null);
  });

  it('returns null when no API key is available', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const r = await parseLLM('hi', { enabled: true });
      assert.strictEqual(r, null);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  it('returns "llm-unavailable" diagnostic when SDK is missing', async (t) => {
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

    const r = await parseLLM('do something', { enabled: true, apiKey: 'sk-fake' });
    assert.strictEqual(r.intent, 'llm-unavailable');
    assert.match(r._reason, /not installed/);
  });

  it('parses a JSON envelope from a mocked SDK', async (t) => {
    const Module = require('module');
    const realLoad = Module._load;
    Module._load = function (req, ...rest) {
      if (req === '@anthropic-ai/sdk') {
        return {
          default: function MockClient() {
            this.messages = {
              create: async () => ({
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      intent: 'list_workers',
                      params: {},
                      confidence: 0.9,
                    }),
                  },
                ],
              }),
            };
          },
        };
      }
      return realLoad.call(this, req, ...rest);
    };
    t.after(() => { Module._load = realLoad; });

    const r = await parseLLM('show all the workers', { enabled: true, apiKey: 'sk-fake' });
    assert.strictEqual(r.intent, 'list_workers');
    assert.strictEqual(r.confidence, 0.9);
    assert.strictEqual(r._source, 'llm');
  });

  it('returns "llm-error" diagnostic on API failure', async (t) => {
    const Module = require('module');
    const realLoad = Module._load;
    Module._load = function (req, ...rest) {
      if (req === '@anthropic-ai/sdk') {
        return {
          default: function () {
            this.messages = { create: async () => { throw new Error('rate limited'); } };
          },
        };
      }
      return realLoad.call(this, req, ...rest);
    };
    t.after(() => { Module._load = realLoad; });

    const r = await parseLLM('anything', { enabled: true, apiKey: 'sk-fake' });
    assert.strictEqual(r.intent, 'llm-error');
    assert.match(r._error, /rate limited/);
  });

  it('returns "llm-unparsed" diagnostic when response is not JSON', async (t) => {
    const Module = require('module');
    const realLoad = Module._load;
    Module._load = function (req, ...rest) {
      if (req === '@anthropic-ai/sdk') {
        return {
          default: function () {
            this.messages = {
              create: async () => ({
                content: [{ type: 'text', text: 'sorry, I cannot help with that' }],
              }),
            };
          },
        };
      }
      return realLoad.call(this, req, ...rest);
    };
    t.after(() => { Module._load = realLoad; });

    const r = await parseLLM('garbled', { enabled: true, apiKey: 'sk-fake' });
    assert.strictEqual(r.intent, 'llm-unparsed');
  });
});
