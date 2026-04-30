// 11.2 Computer Use adapter scaffolding.
//
// "Computer Use" workers are not Claude Code TUI sessions — they're
// processes that take a screenshot, ask the Anthropic API for a
// click/type/scroll action, and execute it on the host. c4 still owns
// lifecycle (create/close/list/audit), but the adapter exposes a
// non-PTY surface so callers don't try to drive it via the terminal.
//
// We keep this minimal here: the adapter declares its mode, plus a
// `runStep({ goal, screenshot })` method that delegates to a configured
// runner (Anthropic API by default, mockable for tests). PtyManager
// integration is left as a follow-up — this file gives the API we want
// to settle on.

'use strict';

const AgentAdapter = require('./agent-adapter');

// Pure-JS scaffolding — no PTY interactions, all detection methods
// short-circuit so a manager that mistakenly routes a Computer Use
// worker through TUI matching just gets no-ops instead of panicking.
const SAFE_PATTERNS = {
  trustPrompt:        '__never__match__',
  permissionPrompt:   '__never__match__',
  fileCreatePrompt:   '__never__match__',
  fileEditPrompt:     '__never__match__',
  bashHeader:         '__never__match__',
  editHeader:         '__never__match__',
  createHeader:       '__never__match__',
  yesOption:          '',
  yesAlwaysEditOption:'',
  yesAlwaysBashOption:'',
  noOption:           '',
  promptFooter:       '',
  readyPrompt:        '__never__match__',
  readyIndicator:     '__never__match__',
  modelMenuIndicator: '__never__match__',
  effortIndicator:    '__never__match__',
};

class ComputerUseAdapter extends AgentAdapter {
  constructor(opts = {}) {
    super({ name: 'computer-use', patterns: SAFE_PATTERNS });
    this.mode = 'computer-use';
    this.model = opts.model || 'claude-sonnet-4-6';
    this.maxSteps = opts.maxSteps || 20;
    this.viewport = opts.viewport || { width: 1280, height: 800 };
    // Resolution priority for the per-step runner:
    // 1. opts.runner explicit injection (used by tests / custom hosts).
    // 2. config.adapters.computerUse.apiKey or env ANTHROPIC_API_KEY →
    //    real Anthropic API call via @anthropic-ai/sdk.
    // 3. null — caller must inject one via setRunner() or runStep returns
    //    "no runner configured" error.
    if (opts.runner) {
      this.runner = opts.runner;
    } else if (opts.apiKey || process.env.ANTHROPIC_API_KEY) {
      this.runner = ComputerUseAdapter._buildAnthropicRunner({
        apiKey: opts.apiKey || process.env.ANTHROPIC_API_KEY,
        model: this.model,
        viewport: this.viewport,
      });
    } else {
      this.runner = null;
    }
  }

  setRunner(fn) { this.runner = fn; }

  // Build a runner that posts to Claude's beta computer-use API. We keep
  // this lazy + isolated so the SDK is only required at runtime if the
  // adapter is actually used with a real API key.
  static _buildAnthropicRunner({ apiKey, model, viewport }) {
    return async function anthropicRunner({ goal, screenshot, history }) {
      let Anthropic;
      try { Anthropic = require('@anthropic-ai/sdk'); }
      catch {
        return { error: '@anthropic-ai/sdk not installed (npm i @anthropic-ai/sdk)' };
      }
      const client = new (Anthropic.default || Anthropic.Anthropic)({ apiKey });
      const screenshotBlock = typeof screenshot === 'string'
        ? { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshot } }
        : screenshot;
      try {
        const resp = await client.beta.messages.create({
          model,
          max_tokens: 1024,
          tools: [{
            type: 'computer_20241022',
            name: 'computer',
            display_width_px: viewport.width,
            display_height_px: viewport.height,
            display_number: 1,
          }],
          betas: ['computer-use-2024-10-22'],
          messages: [
            ...history.flatMap((h) => h.message ? [h.message] : []),
            { role: 'user', content: [
              { type: 'text', text: `Goal: ${goal}` },
              screenshotBlock,
            ] },
          ],
        });
        const block = (resp.content || []).find((b) => b && b.type === 'tool_use' && b.name === 'computer');
        if (!block) {
          // No tool call → adapter treats as "done".
          const text = (resp.content || []).map((b) => b.text || '').join('').trim();
          return { type: 'done', summary: text || 'no tool call returned' };
        }
        const input = block.input || {};
        switch (input.action) {
          case 'left_click':
          case 'mouse_move':
            return { type: 'click', x: (input.coordinate || [])[0], y: (input.coordinate || [])[1] };
          case 'type':
            return { type: 'type', text: input.text || '' };
          case 'key':
            return { type: 'key', key: input.text || '' };
          case 'scroll':
            return { type: 'scroll', dx: input.dx || 0, dy: input.dy || 0 };
          case 'wait':
            return { type: 'wait', ms: (input.duration || 1) * 1000 };
          case 'screenshot':
            return { type: 'screenshot' };
          default:
            return { type: 'done', summary: `unsupported action: ${input.action}` };
        }
      } catch (e) {
        return { error: `anthropic computer-use call failed: ${e.message}` };
      }
    };
  }

  isPermissionPrompt() { return false; }
  isTrustPrompt()      { return false; }
  isModelMenu()        { return false; }
  isReady()            { return true; }
  matchVersion()       { return false; }

  // No PTY → these helpers exist only to satisfy the interface.
  getApproveKeys()  { return ''; }
  getDenyKeys()     { return ''; }
  getTrustKeys()    { return ''; }
  getModelMenuKeys(){ return ''; }
  getEffortKeys()   { return ''; }

  // ---- Computer Use surface ----

  // runStep — given a goal + a screenshot (PNG buffer or base64 string),
  // ask the runner for the next action. Returns one of:
  //   { type: 'click', x, y, button? }
  //   { type: 'type', text }
  //   { type: 'scroll', dx, dy }
  //   { type: 'wait', ms }
  //   { type: 'done', summary }
  // The runner (Anthropic API client or stub) is responsible for the
  // Claude beta computer-use endpoint shape.
  async runStep({ goal, screenshot, history = [] } = {}) {
    if (!goal) return { error: 'goal is required' };
    if (!screenshot) return { error: 'screenshot is required' };
    if (!this.runner) {
      return { error: 'no computer-use runner configured (inject one via adapter opts.runner)' };
    }
    return this.runner({ goal, screenshot, history, model: this.model });
  }

  // runGoal — drive a small loop of steps until `done` or maxSteps.
  // Caller supplies an executor that performs the action on the host
  // (clicks/typing happen there) and returns the new screenshot.
  async runGoal({ goal, executor, screenshot } = {}) {
    if (typeof executor !== 'function') return { error: 'executor must be a function' };
    if (!goal) return { error: 'goal is required' };
    let shot = screenshot;
    const history = [];
    for (let step = 0; step < this.maxSteps; step++) {
      const action = await this.runStep({ goal, screenshot: shot, history });
      if (action.error) return { ok: false, history, lastError: action.error };
      history.push(action);
      if (action.type === 'done') return { ok: true, history, summary: action.summary };
      const next = await executor(action);
      if (next && next.error) return { ok: false, history, lastError: next.error };
      shot = next && next.screenshot ? next.screenshot : shot;
    }
    return { ok: false, history, lastError: 'maxSteps reached without done action' };
  }
}

module.exports = ComputerUseAdapter;
