// 11.4 Natural-language interface. Pure-JS intent parser — turns short
// English/Korean prompts into a c4 plan (a workflow with 1+ steps) the
// caller can preview or execute. Heuristic, not LLM-based — that keeps
// the daemon dependency-free. The Web UI can plug an LLM in front later.
//
// Supported intents (rough patterns):
//   - "list workers"                                       → list
//   - "show / open dashboard / status"                     → list
//   - "create worker <name>" / "새 워커 <name>"            → create
//   - "run / dispatch / send <task...>"                    → dispatch
//   - "<peer>에서 / on <peer> <task...>"                    → fleet.task
//   - "schedule <cron> <task...>"                          → schedule
//   - "every day at HH:MM <task...>"                       → schedule daily
//   - "stop / close / kill <name>"                         → close
//   - "review pull request #<n>"                           → dispatch tags=[review]
//
// Returns { intent, plan: { name, steps } | null, args, confidence }.
// confidence is a 0..1 heuristic — Web UIs may want to require >0.6 before
// auto-executing.

'use strict';

const RULES = [
  // List / status
  {
    intent: 'list',
    match: /^\s*(list|show|status|dashboard)\b|^\s*워커\s*(목록|리스트)/i,
    plan(text) {
      return { name: 'list', steps: [{ id: 'list', action: 'list' }] };
    },
    confidence: 0.9,
  },

  // Create
  {
    intent: 'create',
    match: /^\s*(create|new|spawn|만들|새)\s+(worker\s+)?([a-zA-Z0-9_-]+)/i,
    plan(text) {
      const m = text.match(/^\s*(?:create|new|spawn|만들|새)\s+(?:worker\s+)?([a-zA-Z0-9_-]+)/i);
      if (!m) return null;
      const name = m[1];
      return { name: 'create', steps: [{ id: 'create', action: 'create', args: { name } }] };
    },
    confidence: 0.7,
  },

  // Stop / close / kill
  {
    intent: 'close',
    match: /^\s*(stop|close|kill|종료|닫)\s+([a-zA-Z0-9_-]+)/i,
    plan(text) {
      const m = text.match(/^\s*(?:stop|close|kill|종료|닫)\s+([a-zA-Z0-9_-]+)/i);
      if (!m) return null;
      return { name: 'close', steps: [{ id: 'close', action: 'close', args: { name: m[1] } }] };
    },
    confidence: 0.6,
  },

  // Schedule daily HH:MM
  {
    intent: 'schedule-daily',
    match: /(every day|daily|매일)\s+(at\s+)?(\d{1,2}):(\d{2})/i,
    plan(text) {
      const m = text.match(/(?:every day|daily|매일)\s+(?:at\s+)?(\d{1,2}):(\d{2})\s+(.+)$/i);
      if (!m) return null;
      const [, hh, mm, task] = m;
      return {
        name: 'schedule-daily',
        steps: [{
          id: 'add-schedule',
          action: 'schedule',
          args: { cron: `${parseInt(mm, 10)} ${parseInt(hh, 10)} * * *`, task },
        }],
      };
    },
    confidence: 0.85,
  },

  // Review PR (#N)
  {
    intent: 'review-pr',
    match: /(review|리뷰).*(pr|pull request|merge request|mr)\s*#?(\d+)/i,
    plan(text) {
      const m = text.match(/(?:review|리뷰).*(?:pr|pull request|merge request|mr)\s*#?(\d+)/i);
      if (!m) return null;
      return {
        name: 'review-pr',
        steps: [{
          id: 'dispatch',
          action: 'dispatch',
          args: { task: text, tags: ['review'], strategy: 'least-load' },
        }],
      };
    },
    confidence: 0.85,
  },

  // Dispatch a generic task
  {
    intent: 'dispatch',
    match: /^\s*(run|dispatch|send|task|작업|실행)\b/i,
    plan(text) {
      const m = text.match(/^\s*(?:run|dispatch|send|task|작업|실행)\s+(.+)$/i);
      if (!m) return null;
      return {
        name: 'dispatch',
        steps: [{
          id: 'dispatch',
          action: 'dispatch',
          args: { task: m[1], strategy: 'least-load' },
        }],
      };
    },
    confidence: 0.6,
  },

  // Fleet-targeted task: "on <peer> <task>" or "<peer>에서 <task>"
  // Korean particle 에서 attaches directly to the noun (no space), so
  // both `dgx에서 모델 학습` and `dgx 에서 모델 학습` should match.
  {
    intent: 'fleet-task',
    match: /^\s*(?:on\s+)?([a-zA-Z0-9_-]+)\s*에서\s+(.+)$/u,
    plan(text) {
      const m = text.match(/^\s*(?:on\s+)?([a-zA-Z0-9_-]+)\s*에서\s+(.+)$/u);
      if (!m) return null;
      return {
        name: 'fleet-task',
        steps: [{
          id: 'fleet',
          action: 'dispatch',
          args: { task: m[2], tags: [m[1]], strategy: 'tag-match' },
        }],
      };
    },
    confidence: 0.7,
  },
];

class NLInterface {
  constructor(manager) {
    this.manager = manager;
  }

  parse(text) {
    if (typeof text !== 'string' || !text.trim()) {
      return { intent: 'unknown', plan: null, args: {}, confidence: 0 };
    }
    for (const rule of RULES) {
      if (rule.match.test(text)) {
        const plan = rule.plan(text);
        if (plan) return { intent: rule.intent, plan, args: {}, confidence: rule.confidence };
      }
    }
    return { intent: 'unknown', plan: null, args: { text }, confidence: 0 };
  }

  // (TODO 11.4 follow-up) Optional LLM-backed plan via Claude API. Off
  // unless config.nl.llm.enabled is true and ANTHROPIC_API_KEY is set.
  // Lazy-loaded so c4 stays dep-free for the heuristic path.
  async parseLLM(text) {
    const cfg = (this.manager.config && this.manager.config.nl && this.manager.config.nl.llm) || {};
    if (!cfg.enabled) return null;
    const apiKey = process.env.ANTHROPIC_API_KEY || cfg.apiKey;
    if (!apiKey) return null;
    let Anthropic;
    try { Anthropic = require('@anthropic-ai/sdk'); }
    catch { return { intent: 'llm-unavailable', plan: null, confidence: 0, args: { text }, reason: '@anthropic-ai/sdk not installed' }; }

    const client = new Anthropic.default({ apiKey });
    const model = cfg.model || 'claude-sonnet-4-6';
    const systemPrompt = cfg.systemPrompt || `You convert short user instructions into a c4 workflow plan. Available actions: list, create, close, task, dispatch, schedule, shell, notify, sleep. Respond ONLY with a JSON object: { "intent": "<short tag>", "plan": { "name": "<plan>", "steps": [{ "id": "<id>", "action": "<action>", "args": {...}, "dependsOn": ["..."] }] }, "confidence": 0.0-1.0 }. Use 'create' to spawn a worker (requires args.name); 'task' to send a task to a worker (args.name + args.task); 'dispatch' to pick a peer automatically (args.task; optional args.tags, args.strategy); 'schedule' to register cron entries (args.cron, args.task, args.id); 'shell' for safe whitelisted commands. Do not invent extra actions. If the request is unclear, return confidence < 0.5.`;
    try {
      const resp = await client.messages.create({
        model,
        max_tokens: 800,
        system: [
          { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
        ],
        messages: [
          { role: 'user', content: text },
        ],
      });
      const out = resp.content && resp.content[0] && resp.content[0].text || '';
      const m = out.match(/\{[\s\S]*\}/);
      if (!m) return { intent: 'unparsed', plan: null, confidence: 0.1, args: { raw: out } };
      const parsed = JSON.parse(m[0]);
      return {
        intent: parsed.intent || 'llm',
        plan: parsed.plan || null,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.6,
        args: { llm: true, model },
      };
    } catch (e) {
      return { intent: 'llm-error', plan: null, confidence: 0, args: { error: e.message } };
    }
  }

  async run(text, { execute = true, minConfidence = 0.6, useLLM } = {}) {
    let parsed = this.parse(text);
    // If heuristic missed and LLM is enabled, fall back to LLM plan.
    const llmAllowed = useLLM !== false
      && this.manager.config && this.manager.config.nl
      && this.manager.config.nl.llm && this.manager.config.nl.llm.enabled;
    if ((!parsed.plan || parsed.confidence < minConfidence) && llmAllowed) {
      const llm = await this.parseLLM(text);
      if (llm && llm.plan) parsed = { ...llm, args: { ...parsed.args, llm: true } };
    }
    if (!parsed.plan) return { ...parsed, executed: false, reason: 'no plan' };
    if (!execute || parsed.confidence < minConfidence) {
      return { ...parsed, executed: false, reason: execute ? 'low confidence' : 'preview only' };
    }
    if (typeof this.manager.runWorkflow !== 'function') {
      return { ...parsed, executed: false, reason: 'workflow engine unavailable' };
    }
    const run = await this.manager.runWorkflow(parsed.plan);
    return { ...parsed, executed: true, run };
  }
}

module.exports = NLInterface;
