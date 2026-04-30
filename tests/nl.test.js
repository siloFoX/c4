// 11.4 NL parser tests.

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');

const NLInterface = require('../src/nl-interface');

const noopMgr = { runWorkflow: async () => ({ ok: true }) };

describe('NL parser (11.4)', () => {
  it('list intent', () => {
    const nl = new NLInterface(noopMgr);
    const r = nl.parse('list workers');
    assert.strictEqual(r.intent, 'list');
    assert.strictEqual(r.plan.steps[0].action, 'list');
  });

  it('Korean 워커 목록 also triggers list', () => {
    const r = new NLInterface(noopMgr).parse('워커 목록');
    assert.strictEqual(r.intent, 'list');
  });

  it('create intent extracts worker name', () => {
    const r = new NLInterface(noopMgr).parse('create worker reviewer');
    assert.strictEqual(r.intent, 'create');
    assert.strictEqual(r.plan.steps[0].args.name, 'reviewer');
  });

  it('close intent extracts worker name', () => {
    const r = new NLInterface(noopMgr).parse('close worker1');
    assert.strictEqual(r.intent, 'close');
    assert.strictEqual(r.plan.steps[0].args.name, 'worker1');
  });

  it('schedule-daily extracts cron from "every day at HH:MM"', () => {
    const r = new NLInterface(noopMgr).parse('every day at 9:30 run morning report');
    assert.strictEqual(r.intent, 'schedule-daily');
    assert.strictEqual(r.plan.steps[0].args.cron, '30 9 * * *');
    assert.match(r.plan.steps[0].args.task, /morning report/);
  });

  it('review-pr produces dispatch step with review tag', () => {
    const r = new NLInterface(noopMgr).parse('review pull request #42');
    assert.strictEqual(r.intent, 'review-pr');
    assert.deepStrictEqual(r.plan.steps[0].args.tags, ['review']);
  });

  it('dispatch generic task', () => {
    const r = new NLInterface(noopMgr).parse('run npm test');
    assert.strictEqual(r.intent, 'dispatch');
    assert.match(r.plan.steps[0].args.task, /npm test/);
  });

  it('Korean fleet-task "<peer>에서 <task>"', () => {
    const r = new NLInterface(noopMgr).parse('dgx에서 모델 학습');
    assert.strictEqual(r.intent, 'fleet-task');
    assert.deepStrictEqual(r.plan.steps[0].args.tags, ['dgx']);
    assert.match(r.plan.steps[0].args.task, /모델 학습/);
  });

  it('unknown intent returns null plan', () => {
    const r = new NLInterface(noopMgr).parse('hmm not sure what to do');
    assert.strictEqual(r.intent, 'unknown');
    assert.strictEqual(r.plan, null);
  });

  it('run() executes workflow when confidence is high enough', async () => {
    const calls = [];
    const mgr = { runWorkflow: async (wf) => { calls.push(wf); return { ok: true }; } };
    const nl = new NLInterface(mgr);
    const r = await nl.run('list workers');
    assert.strictEqual(r.executed, true);
    assert.strictEqual(calls.length, 1);
  });

  it('run() defers when confidence is below threshold', async () => {
    const mgr = { runWorkflow: async () => ({ ok: true }) };
    const nl = new NLInterface(mgr);
    const r = await nl.run('create worker xy', { minConfidence: 0.99 });
    assert.strictEqual(r.executed, false);
    assert.strictEqual(r.reason, 'low confidence');
  });

  // 11.4 LLM fallback — exercised via a stubbed parseLLM so we don't make
  // real API calls. We just verify the plumbing.
  it('LLM fallback runs when heuristic confidence is too low and config.nl.llm.enabled', async () => {
    const mgr = {
      config: { nl: { llm: { enabled: true } } },
      runWorkflow: async () => ({ ok: true }),
    };
    const nl = new NLInterface(mgr);
    nl.parseLLM = async () => ({
      intent: 'llm',
      plan: { name: 'p', steps: [{ id: 's', action: 'list' }] },
      confidence: 0.9,
      args: { llm: true },
    });
    const r = await nl.run('a vague request that no rule matches', { minConfidence: 0.6 });
    assert.strictEqual(r.executed, true);
    assert.strictEqual(r.intent, 'llm');
  });

  it('LLM fallback skipped when config disabled', async () => {
    const mgr = { config: {}, runWorkflow: async () => ({ ok: true }) };
    const nl = new NLInterface(mgr);
    let called = 0;
    nl.parseLLM = async () => { called++; return null; };
    const r = await nl.run('totally unparseable nonsense', { minConfidence: 0.6 });
    assert.strictEqual(called, 0);
    assert.strictEqual(r.executed, false);
  });

  // (TODO #104) Direct parseLLM contract — short-circuit, SDK missing,
  // and end-to-end with a mocked Anthropic client.
  it('parseLLM returns null when nl.llm.enabled is false', async () => {
    const nl = new NLInterface({ config: { nl: { llm: { enabled: false } } } });
    const r = await nl.parseLLM('hi');
    assert.strictEqual(r, null);
  });

  it('parseLLM returns null when no API key is available', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const nl = new NLInterface({ config: { nl: { llm: { enabled: true } } } });
      const r = await nl.parseLLM('hi');
      assert.strictEqual(r, null);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  it('parseLLM returns "llm-unavailable" when @anthropic-ai/sdk is not installed', async (t) => {
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

    const nl = new NLInterface({
      config: { nl: { llm: { enabled: true, apiKey: 'sk-fake' } } },
    });
    const r = await nl.parseLLM('do something');
    assert.strictEqual(r.intent, 'llm-unavailable');
    assert.match(r.reason, /not installed/);
    assert.strictEqual(r.plan, null);
  });

  it('parseLLM parses a JSON plan from a mocked Anthropic client', async (t) => {
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
                      intent: 'list',
                      plan: { name: 'list', steps: [{ id: 'l', action: 'list' }] },
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

    const nl = new NLInterface({
      config: { nl: { llm: { enabled: true, apiKey: 'sk-fake', model: 'claude-sonnet-4-6' } } },
    });
    const r = await nl.parseLLM('show me the workers');
    assert.strictEqual(r.intent, 'list');
    assert.strictEqual(r.plan.name, 'list');
    assert.strictEqual(r.confidence, 0.9);
    assert.strictEqual(r.args.llm, true);
    assert.strictEqual(r.args.model, 'claude-sonnet-4-6');
  });

  it('parseLLM returns "llm-error" on API failure', async (t) => {
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

    const nl = new NLInterface({
      config: { nl: { llm: { enabled: true, apiKey: 'sk-fake' } } },
    });
    const r = await nl.parseLLM('anything');
    assert.strictEqual(r.intent, 'llm-error');
    assert.match(r.args.error, /rate limited/);
  });
});
