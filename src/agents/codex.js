'use strict';

/**
 * Codex Adapter (9.1 phase 2 / v1.10.75)
 *
 * PTY-driven adapter for OpenAI's `codex` CLI. C4 ships the wiring;
 * the operator supplies the binary path + idle-detection patterns
 * via config (since codex's UI text drifts release-to-release and we
 * don't want to hard-code something that breaks on every codex
 * upgrade).
 *
 * Architecturally identical to ClaudeCodeAdapter — both wrap a
 * node-pty proc handed in by PtyManager via init(workerCtx) — but
 * with no claude-code-specific helpers (no trust prompt, no edit /
 * create / bash header parsing). If codex grows those concepts in a
 * stable form, they should land here as opt-in pattern keys, not
 * hard-coded strings.
 *
 * Required config (no sensible defaults — codex hasn't stabilized
 * its UI):
 *   patterns.readyPrompt    string  — substring that means "idle at prompt"
 *   patterns.readyIndicator string  — second substring (AND'd with readyPrompt)
 *
 * Optional:
 *   options.binary  string  — codex CLI path (purely informational; PtyManager
 *                              owns the spawn)
 *   options.args    string[] — extra CLI args (informational)
 *
 * detectIdle returns false until BOTH patterns are set + present in the
 * chunk. This is deliberate: the daemon's state machine treats `true`
 * as "task done", and a too-permissive default would silently mark
 * tasks complete mid-flight.
 *
 * Usage in config.json:
 *   {
 *     "agent": {
 *       "type": "codex",
 *       "options": {
 *         "binary": "/usr/local/bin/codex",
 *         "patterns": {
 *           "readyPrompt": "...",
 *           "readyIndicator": "..."
 *         }
 *       }
 *     }
 *   }
 */

const PtyAdapterBase = require('./pty-adapter-base');

// (v1.10.78) KEY_MAP re-exported from PtyAdapterBase.DEFAULT_KEY_MAP
// for backwards compatibility with callers that imported it from
// this module.
const KEY_MAP = PtyAdapterBase.DEFAULT_KEY_MAP;

class CodexAdapter extends PtyAdapterBase {
  constructor(patterns = {}, options = {}) {
    super();
    const o = options && typeof options === 'object' ? options : {};
    const p = patterns && typeof patterns === 'object' ? patterns : {};
    // Operator may also supply patterns under options.patterns when they
    // configure via per-type sub-bag (`agent.options.codex.patterns`).
    const optPatterns = o.patterns && typeof o.patterns === 'object' ? o.patterns : {};
    this.patterns = { ...optPatterns, ...p };

    this.binary = typeof o.binary === 'string' && o.binary ? o.binary : 'codex';
    this.args = Array.isArray(o.args) ? o.args.slice() : [];
    this._supportsPause = o.supportsPause === true;
  }

  // --- Adapter interface -------------------------------------------------

  get metadata() {
    return { name: 'codex', version: '1.0.0' };
  }

  get supportsPause() {
    return this._supportsPause;
  }

  // init / sendInput / sendKey inherited from PtyAdapterBase.

  /**
   * Conservative idle check: both `readyPrompt` and `readyIndicator`
   * must be configured AND present in the chunk. If either is unset
   * we return false — better to leave a task hanging than to declare
   * it done mid-flight.
   */
  detectIdle(chunk) {
    const text = String(chunk == null ? '' : chunk);
    const prompt = this.patterns.readyPrompt;
    const indicator = this.patterns.readyIndicator;
    if (typeof prompt !== 'string' || prompt.length === 0) return false;
    if (typeof indicator !== 'string' || indicator.length === 0) return false;
    return text.includes(prompt) && text.includes(indicator);
  }
}

module.exports = CodexAdapter;
module.exports.KEY_MAP = KEY_MAP;
