'use strict';

/**
 * Agent Framework — Mock adapter (9.1 phase 2 / v1.10.71)
 *
 * Deterministic in-memory adapter used by tests + as the canonical
 * reference for new backend authors. Implements the full Adapter
 * contract without an external runtime: input/keys land on internal
 * buffers, output is whatever the test caller scripts via
 * `setScript(chunks)` or `pushOutput(chunk)`, and `detectIdle`
 * returns whatever was set with `setIdle(bool)`.
 *
 * Why this exists:
 *   1. Test infra: lets agent-aware code (PtyManager state machine,
 *      hooks, scope guard) be exercised without a live PTY or LLM.
 *   2. Reference: a minimal but correct adapter so new authors
 *      writing CodexAdapter / ClaudeAgentSdkAdapter / etc have a
 *      template that doesn't drag in claude-code-specific helpers.
 *   3. Validation harness: `validateAdapter()` returns true for the
 *      mock, locking in the contract surface even if Claude Code's
 *      adapter drifts.
 *
 * Usage:
 *   const adapter = new MockAdapter({});
 *   adapter.init({ name: 'mock-1' });
 *   adapter.onOutput((chunk) => console.log('out:', chunk));
 *   adapter.sendInput('hello');
 *   adapter.pushOutput('world');         // fires the listener
 *   adapter.setIdle(true);
 *   adapter.detectIdle('any chunk');     // returns true
 *
 * The factory wires this in under `agentConfig.type = 'mock'` so
 * tests can construct via the same path production code uses.
 */

const { Adapter } = require('./adapter');

class MockAdapter extends Adapter {
  constructor(_patterns, opts) {
    super();
    this._inputs = [];
    this._keys = [];
    this._idle = false;
    this._scriptedChunks = [];
    this._outputHandlers = [];
    const o = opts && typeof opts === 'object' ? opts : {};
    this._name = typeof o.name === 'string' && o.name ? o.name : 'mock';
    this._version = typeof o.version === 'string' && o.version ? o.version : '1.0.0';
    this._supportsPause = o.supportsPause === true;
  }

  get metadata() {
    return { name: this._name, version: this._version };
  }

  get supportsPause() {
    return this._supportsPause;
  }

  init(workerCtx) {
    this._workerCtx = workerCtx || null;
    // Replay any queued chunks once a listener attaches — simulates
    // a backend that buffers stdout until someone listens.
    this._maybeFlush();
  }

  sendInput(text) {
    this._inputs.push(String(text == null ? '' : text));
  }

  sendKey(key) {
    this._keys.push(String(key == null ? '' : key));
  }

  onOutput(cb) {
    if (typeof cb !== 'function') return () => {};
    this._outputHandlers.push(cb);
    this._maybeFlush();
    return () => {
      this._outputHandlers = this._outputHandlers.filter((h) => h !== cb);
    };
  }

  detectIdle(_chunk) {
    return this._idle === true;
  }

  // ---------- Test surface (mock-only, not part of Adapter contract) ----

  /**
   * Set the idle flag detectIdle() will return on subsequent calls.
   */
  setIdle(value) {
    this._idle = value === true;
  }

  /**
   * Push a single output chunk to all registered listeners. If no
   * listener is attached yet (init pending), the chunk is queued
   * and flushed when the first listener arrives.
   */
  pushOutput(chunk) {
    const text = String(chunk == null ? '' : chunk);
    if (this._outputHandlers.length === 0) {
      this._scriptedChunks.push(text);
      return;
    }
    for (const h of this._outputHandlers) {
      try { h(text); } catch { /* swallow handler errors */ }
    }
  }

  /**
   * Queue a series of chunks. Flushed on first listener attach via
   * onOutput(); useful when the test wants to script output before
   * wiring up the consumer.
   */
  setScript(chunks) {
    if (!Array.isArray(chunks)) return;
    this._scriptedChunks.push(...chunks.map((c) => String(c == null ? '' : c)));
    this._maybeFlush();
  }

  /**
   * Returns a snapshot of received inputs / keys for assertions.
   */
  trace() {
    return {
      inputs: this._inputs.slice(),
      keys: this._keys.slice(),
      idle: this._idle,
      pending: this._scriptedChunks.length,
    };
  }

  /**
   * Clear inputs / keys / pending output. Idle flag stays.
   */
  reset() {
    this._inputs = [];
    this._keys = [];
    this._scriptedChunks = [];
  }

  _maybeFlush() {
    if (this._outputHandlers.length === 0) return;
    if (this._scriptedChunks.length === 0) return;
    const drain = this._scriptedChunks.splice(0);
    for (const chunk of drain) {
      for (const h of this._outputHandlers) {
        try { h(chunk); } catch { /* swallow */ }
      }
    }
  }
}

module.exports = MockAdapter;
