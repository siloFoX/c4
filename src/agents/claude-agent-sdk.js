'use strict';

/**
 * Claude Agent SDK Adapter (9.1 phase 2 / v1.10.77)
 *
 * Scaffold for Anthropic's Claude Agent SDK
 * (`@anthropic-ai/claude-agent-sdk`). Unlike Claude Code or Codex,
 * the Agent SDK is a Node library — there is no PTY binary to
 * wrap. The adapter accepts a `queryFn` callable from the operator
 * via config; C4 calls it with the prompt and fans the streamed
 * response chunks through the standard onOutput surface.
 *
 * Why a scaffold instead of a baked-in `require('@anthropic-ai/...')`:
 *   1. The SDK iterates rapidly. Hard-pinning a version in C4's
 *      package.json would force C4 releases on every SDK release.
 *   2. The SDK has its own auth + setup (API key env vars, MCP
 *      servers, tool registries). Operators already know how to
 *      wire it; C4 just needs the protocol.
 *   3. Some operators may want to plug a different SDK with the
 *      same shape (an OpenAI Assistants port, an Aider library,
 *      etc.). Dependency injection keeps the door open.
 *
 * queryFn signature:
 *   async (prompt: string, opts: { model?, signal? }) => AsyncIterable<{
 *     type: 'text' | 'tool_use' | 'error',
 *     text?: string,
 *   }>
 *
 * If `queryFn` is not configured, `runQuery` errors gracefully and
 * `detectIdle` keeps returning the configured idle flag. The
 * adapter still satisfies the Adapter contract — useful for tests
 * that exercise the framework without a real SDK.
 *
 * Usage in config.json:
 *   {
 *     "agent": {
 *       "type": "claude-agent-sdk",
 *       "options": {
 *         "model": "claude-opus-4-7",
 *         "systemPrompt": "..."
 *       }
 *     }
 *   }
 *
 * The operator wires `queryFn` programmatically when constructing
 * the daemon (since config.json can't carry functions). Pattern:
 *
 *   const { query } = require('@anthropic-ai/claude-agent-sdk');
 *   const a = createAdapter({
 *     type: 'claude-agent-sdk',
 *     options: { model: 'claude-opus-4-7' },
 *   });
 *   a.queryFn = (prompt, opts) => query({ prompt, model: opts.model });
 */

const { Adapter } = require('./adapter');

class ClaudeAgentSdkAdapter extends Adapter {
  constructor(_patterns, options) {
    super();
    const o = options && typeof options === 'object' ? options : {};
    this.model = typeof o.model === 'string' && o.model ? o.model : 'claude-opus-4-7';
    this.systemPrompt = typeof o.systemPrompt === 'string' ? o.systemPrompt : '';
    this.queryFn = typeof o.queryFn === 'function' ? o.queryFn : null;
    this._supportsPause = o.supportsPause === true;

    this._inputs = [];
    this._keys = [];
    this._outputHandlers = [];
    this._idle = false;
    this._busy = false;
    this._abortController = null;
  }

  // --- Adapter interface -------------------------------------------------

  get metadata() {
    return { name: 'claude-agent-sdk', version: '1.0.0', model: this.model };
  }

  get supportsPause() {
    return this._supportsPause;
  }

  init(workerCtx) {
    this._workerCtx = workerCtx || null;
  }

  sendInput(text) {
    this._inputs.push(String(text == null ? '' : text));
  }

  sendKey(key) {
    this._keys.push(String(key == null ? '' : key));
  }

  onOutput(cb) {
    if (typeof cb !== 'function') {
      throw new TypeError('onOutput callback must be a function');
    }
    this._outputHandlers.push(cb);
    return () => {
      this._outputHandlers = this._outputHandlers.filter((h) => h !== cb);
    };
  }

  detectIdle(_chunk) {
    return this._idle === true && !this._busy;
  }

  // --- SDK-driven runtime (not part of the Adapter contract) -------------

  /**
   * Drive a single prompt through the wired queryFn, streaming
   * each `text`-type event chunk through onOutput. Returns the
   * concatenated assistant text. Errors are surfaced through
   * onOutput (no throws leak out — same pattern as
   * LocalLLMAdapter).
   *
   * @param {string} prompt
   * @returns {Promise<string>}
   */
  async runQuery(prompt) {
    if (!this.queryFn) {
      this._emitChunk(`[claude-agent-sdk] error: queryFn not configured\n`);
      return '';
    }
    if (this._busy) {
      this._emitChunk(`[claude-agent-sdk] error: another query is in flight\n`);
      return '';
    }
    this._busy = true;
    this._idle = false;
    this._abortController = new AbortController();

    let assembled = '';
    try {
      const stream = await this.queryFn(String(prompt == null ? '' : prompt), {
        model: this.model,
        systemPrompt: this.systemPrompt,
        signal: this._abortController.signal,
      });
      if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
        this._emitChunk(`[claude-agent-sdk] error: queryFn did not return an AsyncIterable\n`);
        return '';
      }
      for await (const event of stream) {
        if (!event || typeof event !== 'object') continue;
        if (event.type === 'text' && typeof event.text === 'string') {
          this._emitChunk(event.text);
          assembled += event.text;
        } else if (event.type === 'error') {
          this._emitChunk(`[claude-agent-sdk] error: ${event.text || 'unknown'}\n`);
        }
        // tool_use events are ignored by the scaffold — operators
        // who need tool dispatch can subclass and intercept here.
      }
      this._idle = true;
    } catch (err) {
      const msg = (err && err.message) || String(err);
      this._emitChunk(`[claude-agent-sdk] error: ${msg}\n`);
    } finally {
      this._busy = false;
      this._abortController = null;
    }
    return assembled;
  }

  /**
   * Abort any in-flight query and clear listeners. Subsequent
   * sendInput / sendKey / runQuery calls remain safe (sendInput /
   * sendKey continue to record on the buffers; runQuery emits the
   * "queryFn not configured" error via onOutput if the queryFn
   * was the disposed-state).
   */
  dispose() {
    if (this._abortController) {
      try { this._abortController.abort(); } catch { /* swallow */ }
      this._abortController = null;
    }
    this._outputHandlers = [];
    this._busy = false;
  }

  // --- Test surface (mock-friendly, not part of Adapter contract) --------

  /**
   * Snapshot of received inputs / keys for assertions. Mirrors the
   * MockAdapter shape so tests reading the trace look the same
   * across both fixtures.
   */
  trace() {
    return {
      inputs: this._inputs.slice(),
      keys: this._keys.slice(),
      idle: this._idle,
      busy: this._busy,
    };
  }

  // --- Internals ---------------------------------------------------------

  _emitChunk(chunk) {
    const text = String(chunk == null ? '' : chunk);
    for (const h of this._outputHandlers) {
      try { h(text); } catch { /* swallow per-handler */ }
    }
  }
}

module.exports = ClaudeAgentSdkAdapter;
