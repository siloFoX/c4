'use strict';

/**
 * PtyAdapterBase (9.1 phase 2 / v1.10.78)
 *
 * Shared scaffolding for adapters that wrap a PTY-spawned binary.
 * ClaudeCodeAdapter and CodexAdapter both fit this shape — the
 * daemon (PtyManager) owns the spawn via node-pty and hands the
 * `proc` to the adapter through `init(workerCtx)`. The adapter
 * forwards input + named keys to the proc and lets subclasses
 * implement adapter-specific detection patterns + helpers.
 *
 * What lives here:
 *   - DEFAULT_KEY_MAP (Enter / Escape / Tab / Backspace / arrows /
 *     C-c / C-d) — every PTY adapter needs the same minimum.
 *   - init(workerCtx) — store ctx on _workerCtx, accept null to
 *     clear (mirrors MockAdapter / claude-code prior behaviour).
 *   - sendInput(text) — strict-string check, write to ctx.proc
 *     when present, no-op when not.
 *   - sendKey(key) — map via this._keyMap, fall through to raw
 *     bytes for unknown names. Subclasses can extend the map by
 *     spreading DEFAULT_KEY_MAP.
 *   - onOutput(cb) — inherited from Adapter base (TypeError on
 *     non-function, returns unsubscribe fn).
 *
 * What subclasses must implement:
 *   - get metadata() — { name, version, ... }
 *   - get supportsPause() — boolean
 *   - detectIdle(chunk) — adapter-specific idle test
 *
 * What subclasses may override:
 *   - this._keyMap — defaults to DEFAULT_KEY_MAP, subclasses can
 *     spread it with their own additions before calling super().
 *
 * Why a shared base instead of a utility module:
 *   1. The PTY adapters all share the same `_workerCtx` lifecycle
 *      — keeping init / sendInput / sendKey on a base class means
 *      they share the same private state shape too.
 *   2. The cross-adapter contract test (1.10.74) iterates the
 *      REGISTRY; a shared base means every PTY adapter passes the
 *      same shape checks for free.
 *   3. New PTY adapters (e.g. an Aider integration, an Aiderless
 *      ports of other CLIs) get the boilerplate for free.
 */

const { Adapter } = require('./adapter');

const DEFAULT_KEY_MAP = Object.freeze({
  Enter: '\r',
  Return: '\r',
  Escape: '\x1b',
  Esc: '\x1b',
  Tab: '\t',
  Backspace: '\x7f',
  Up: '\x1b[A',
  Down: '\x1b[B',
  Right: '\x1b[C',
  Left: '\x1b[D',
  'C-c': '\x03',
  'C-d': '\x04',
});

class PtyAdapterBase extends Adapter {
  constructor() {
    super();
    // Subclasses may reassign this._keyMap to spread DEFAULT_KEY_MAP
    // with additional bindings before/after calling super().
    this._keyMap = DEFAULT_KEY_MAP;
  }

  init(workerCtx) {
    this._workerCtx = workerCtx || null;
  }

  sendInput(text) {
    if (typeof text !== 'string') {
      throw new TypeError('sendInput requires a string');
    }
    const proc = this._workerCtx && this._workerCtx.proc;
    if (proc && typeof proc.write === 'function') {
      proc.write(text);
    }
  }

  sendKey(key) {
    const mapped = Object.prototype.hasOwnProperty.call(this._keyMap, key)
      ? this._keyMap[key]
      : key;
    this.sendInput(mapped);
  }
}

module.exports = PtyAdapterBase;
module.exports.PtyAdapterBase = PtyAdapterBase;
module.exports.DEFAULT_KEY_MAP = DEFAULT_KEY_MAP;
