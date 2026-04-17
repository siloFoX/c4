/**
 * Agent Framework - Base Adapter Interface (9.1 phase 1)
 *
 * Defines the contract that every concrete agent adapter must implement.
 * The adapter is the single surface between the daemon (PtyManager) and the
 * agent runtime (Claude Code today, Local LLM / Codex / claude-agent-sdk
 * planned). Keeping this interface stable means the daemon's state machine,
 * screen buffer, intervention logic, and task queue do not need to know
 * which agent is actually running under the PTY.
 *
 * Interface surface:
 *   - metadata        : { name: string, version: string }
 *   - supportsPause   : boolean (true when the adapter can cleanly pause/resume)
 *   - init(ctx)       : attach to a worker context (proc, screen, etc.)
 *   - sendInput(text) : send raw text to the agent
 *   - sendKey(key)    : send a named key (Enter, Escape, Down, ...)
 *   - onOutput(cb)    : register an output listener; cb(chunk)
 *   - detectIdle(chunk|screen) : returns true when the agent is idle at prompt
 *
 * Subclasses SHOULD override metadata + implement the five methods and may
 * add adapter-specific helpers (e.g. Claude Code's trust-prompt detection).
 * Use validateAdapter() to confirm a shape at runtime before wiring it into
 * the daemon.
 */

class Adapter {
  constructor() {
    if (new.target === Adapter) {
      throw new Error('Adapter is abstract; use a concrete subclass (e.g. ClaudeCodeAdapter)');
    }
    this._outputHandlers = [];
    this._workerCtx = null;
  }

  /**
   * Adapter identity. Override in subclass.
   * @returns {{ name: string, version: string }}
   */
  get metadata() {
    return { name: 'base', version: '0.0.0' };
  }

  /**
   * Whether the adapter can cleanly pause/resume an in-flight task.
   * Claude Code today: false (Ctrl-C interrupts, no true pause).
   * @returns {boolean}
   */
  get supportsPause() {
    return false;
  }

  /**
   * Attach the adapter to a worker context.
   * Context typically carries { proc, screen, name } but the exact shape is
   * owned by the daemon - the adapter just stores what it needs.
   * @param {object} workerCtx
   */
  init(workerCtx) {
    this._workerCtx = workerCtx || null;
  }

  /**
   * Send raw text to the agent (no automatic trailing newline).
   * @param {string} text
   */
  sendInput(_text) {
    throw new Error(`${this.metadata.name}: sendInput not implemented`);
  }

  /**
   * Send a named key. Implementations should map Enter / Escape / Down / Up /
   * Left / Right / C-c at minimum. Unknown names pass through unchanged.
   * @param {string} key
   */
  sendKey(_key) {
    throw new Error(`${this.metadata.name}: sendKey not implemented`);
  }

  /**
   * Register an output listener. Returns an unsubscribe fn.
   * @param {(chunk: string) => void} cb
   * @returns {() => void}
   */
  onOutput(cb) {
    if (typeof cb !== 'function') {
      throw new TypeError('onOutput callback must be a function');
    }
    this._outputHandlers.push(cb);
    return () => {
      const i = this._outputHandlers.indexOf(cb);
      if (i >= 0) this._outputHandlers.splice(i, 1);
    };
  }

  /**
   * Feed a chunk of terminal output to registered listeners.
   * Adapters should call this from their PTY data handler.
   * @param {string} chunk
   */
  _emitOutput(chunk) {
    for (const h of this._outputHandlers) {
      try { h(chunk); } catch { /* listener errors never break the PTY loop */ }
    }
  }

  /**
   * Inspect a chunk or full screen and return true if the agent is idle at
   * its prompt. Claude Code: the '>' prompt plus the shortcuts footer line.
   * @param {string} chunk
   * @returns {boolean}
   */
  detectIdle(_chunk) {
    throw new Error(`${this.metadata.name}: detectIdle not implemented`);
  }
}

/**
 * Runtime shape check. Throws on the first violation so a bad adapter fails
 * at wire-up, not mid-task.
 * @param {object} adapter
 * @returns {true}
 */
function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw new TypeError('Adapter must be an object');
  }
  const required = ['init', 'sendInput', 'sendKey', 'onOutput', 'detectIdle'];
  for (const m of required) {
    if (typeof adapter[m] !== 'function') {
      throw new Error(`Adapter missing required method: ${m}`);
    }
  }
  const meta = adapter.metadata;
  if (!meta || typeof meta !== 'object') {
    throw new Error('Adapter must expose metadata object');
  }
  if (typeof meta.name !== 'string' || meta.name.length === 0) {
    throw new Error('Adapter metadata.name must be a non-empty string');
  }
  if (typeof meta.version !== 'string' || meta.version.length === 0) {
    throw new Error('Adapter metadata.version must be a non-empty string');
  }
  if (typeof adapter.supportsPause !== 'boolean') {
    throw new Error('Adapter supportsPause must be boolean');
  }
  return true;
}

module.exports = { Adapter, validateAdapter };
