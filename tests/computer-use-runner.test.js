// 11.2 Computer Use Anthropic runner — action mapping tests.
// We don't pull the real @anthropic-ai/sdk; the require() inside the
// runner is shadowed by node_modules-style cache injection so the runner
// runs against a fake messages.create that returns canned tool_use blocks.

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const Module = require('module');

const ComputerUseAdapter = require('../src/adapters/computer-use-adapter');

const FAKE_MODULE_ID = '@anthropic-ai/sdk';

function installFakeSdk(handler) {
  const original = Module._load;
  Module._load = function patched(request, parent, ...rest) {
    if (request === FAKE_MODULE_ID) {
      class FakeAnthropic {
        constructor() {}
        get beta() {
          return {
            messages: {
              create: async (req) => handler(req),
            },
          };
        }
      }
      return { default: FakeAnthropic, Anthropic: FakeAnthropic };
    }
    return original.call(this, request, parent, ...rest);
  };
  // Drop any cached real SDK so our shim wins on the next require().
  for (const key of Object.keys(require.cache)) {
    if (key.includes('@anthropic-ai')) delete require.cache[key];
  }
  return () => { Module._load = original; };
}

function buildAdapter(handler) {
  const adapter = new ComputerUseAdapter({ apiKey: 'fake-key', model: 'fake-model' });
  // Replace the runner with the rebuilt one inside our SDK shim.
  const restore = installFakeSdk(handler);
  adapter.runner = ComputerUseAdapter._buildAnthropicRunner({
    apiKey: 'fake-key', model: 'fake-model', viewport: { width: 800, height: 600 },
  });
  return { adapter, restore };
}

describe('ComputerUseAdapter Anthropic runner', () => {
  let restoreFns = [];
  before(() => {});
  after(() => { for (const r of restoreFns) r(); });

  it('maps left_click → click action with coordinates', async () => {
    const { adapter, restore } = buildAdapter(async () => ({
      content: [{ type: 'tool_use', name: 'computer', input: { action: 'left_click', coordinate: [100, 200] } }],
    }));
    restoreFns.push(restore);
    const r = await adapter.runStep({ goal: 'click button', screenshot: 'b64data', history: [] });
    assert.deepStrictEqual(r, { type: 'click', x: 100, y: 200 });
  });

  it('maps type → type action with text', async () => {
    const { adapter, restore } = buildAdapter(async () => ({
      content: [{ type: 'tool_use', name: 'computer', input: { action: 'type', text: 'hello' } }],
    }));
    restoreFns.push(restore);
    const r = await adapter.runStep({ goal: 'type', screenshot: 'b64', history: [] });
    assert.deepStrictEqual(r, { type: 'type', text: 'hello' });
  });

  it('maps key → key action', async () => {
    const { adapter, restore } = buildAdapter(async () => ({
      content: [{ type: 'tool_use', name: 'computer', input: { action: 'key', text: 'Return' } }],
    }));
    restoreFns.push(restore);
    const r = await adapter.runStep({ goal: 'press', screenshot: 'b64', history: [] });
    assert.deepStrictEqual(r, { type: 'key', key: 'Return' });
  });

  it('maps scroll → scroll action with deltas', async () => {
    const { adapter, restore } = buildAdapter(async () => ({
      content: [{ type: 'tool_use', name: 'computer', input: { action: 'scroll', dx: 0, dy: -120 } }],
    }));
    restoreFns.push(restore);
    const r = await adapter.runStep({ goal: 'scroll', screenshot: 'b64', history: [] });
    assert.deepStrictEqual(r, { type: 'scroll', dx: 0, dy: -120 });
  });

  it('maps wait → wait action with duration*1000', async () => {
    const { adapter, restore } = buildAdapter(async () => ({
      content: [{ type: 'tool_use', name: 'computer', input: { action: 'wait', duration: 2 } }],
    }));
    restoreFns.push(restore);
    const r = await adapter.runStep({ goal: 'wait', screenshot: 'b64', history: [] });
    assert.deepStrictEqual(r, { type: 'wait', ms: 2000 });
  });

  it('falls back to done when no tool_use block present', async () => {
    const { adapter, restore } = buildAdapter(async () => ({
      content: [{ type: 'text', text: 'all good' }],
    }));
    restoreFns.push(restore);
    const r = await adapter.runStep({ goal: 'finish', screenshot: 'b64', history: [] });
    assert.strictEqual(r.type, 'done');
    assert.match(r.summary, /all good/);
  });

  it('returns error when SDK call throws', async () => {
    const { adapter, restore } = buildAdapter(async () => { throw new Error('rate limit'); });
    restoreFns.push(restore);
    const r = await adapter.runStep({ goal: 'fail', screenshot: 'b64', history: [] });
    assert.ok(r.error && /rate limit/.test(r.error));
  });

  it('returns clear error when SDK package not installed', async () => {
    // No installFakeSdk this time → require fails → adapter returns helpful error.
    const adapter = new ComputerUseAdapter({ apiKey: 'fake-key' });
    adapter.runner = ComputerUseAdapter._buildAnthropicRunner({
      apiKey: 'fake-key', model: 'fake', viewport: { width: 1, height: 1 },
    });
    // Force require to fail by patching the module cache.
    const origLoad = Module._load;
    Module._load = function (request, ...rest) {
      if (request === '@anthropic-ai/sdk') throw new Error('Cannot find module');
      return origLoad.call(this, request, ...rest);
    };
    try {
      const r = await adapter.runStep({ goal: 'x', screenshot: 'b64', history: [] });
      assert.ok(r.error && /not installed/.test(r.error));
    } finally {
      Module._load = origLoad;
    }
  });
});
