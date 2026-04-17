'use strict';

/**
 * Local LLM Adapter (9.2)
 *
 * Concrete Adapter that talks to a self-hosted inference server instead of
 * the Claude Code CLI. Three backends share one class:
 *
 *   ollama      -> POST http://<url>/api/generate     JSONL stream
 *   llama-cpp   -> POST http://<url>/v1/chat/completions  SSE stream
 *   vllm        -> POST http://<url>/v1/chat/completions  SSE stream
 *
 * The adapter acts as a pseudo-PTY: it owns a ScreenBuffer, accepts keystrokes
 * through write(), and emits streamed LLM tokens back through the standard
 * Adapter onOutput(cb) surface. The daemon can wire it in place of a real
 * node-pty proc without changing its state machine.
 *
 * Required lifecycle methods (beyond the Adapter base):
 *   spawn(opts)        : set up the virtual terminal and emit the first prompt
 *   write(data)        : feed keystrokes; newline triggers inference
 *   resize(cols, rows) : resize the ScreenBuffer
 *   kill()             : abort any in-flight request
 *   dispose()          : tear down (cleanup listeners, abort controller)
 *
 * Network I/O goes through `opts.fetch` (falls back to globalThis.fetch) so
 * tests can inject a mock and never reach a real server.
 */

const { Adapter } = require('./adapter');
const ScreenBuffer = require('../screen-buffer');

const BACKENDS = ['ollama', 'llama-cpp', 'vllm'];

const DEFAULT_ENDPOINTS = {
  ollama: 'http://localhost:11434',
  'llama-cpp': 'http://localhost:8080',
  vllm: 'http://localhost:8000',
};

const DEFAULT_MODELS = {
  ollama: 'llama3.1',
  'llama-cpp': 'local-model',
  vllm: 'meta-llama/Llama-3.1-8B',
};

const KEY_MAP = {
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
};

const DEFAULT_PROMPT = '> ';

class LocalLLMAdapter extends Adapter {
  constructor(patterns = {}, options = {}) {
    super();
    const backend = (options && options.backend) || 'ollama';
    if (!BACKENDS.includes(backend)) {
      throw new Error(
        `Unknown local LLM backend: ${backend}. Supported: ${BACKENDS.join(', ')}`
      );
    }
    this.backend = backend;
    this.url = String(options.url || options.endpoint || DEFAULT_ENDPOINTS[backend]).replace(/\/+$/, '');
    this.model = options.model || DEFAULT_MODELS[backend];
    this.systemPrompt = typeof options.systemPrompt === 'string' ? options.systemPrompt : '';
    if (options && Object.prototype.hasOwnProperty.call(options, 'fetch')) {
      this.fetchImpl = options.fetch || null;
    } else if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') {
      this.fetchImpl = globalThis.fetch;
    } else {
      this.fetchImpl = null;
    }
    this.cols = Number.isFinite(options.cols) ? options.cols : 160;
    this.rows = Number.isFinite(options.rows) ? options.rows : 48;
    this.requestInit = (options && options.requestInit && typeof options.requestInit === 'object') ? options.requestInit : null;
    this.promptText = typeof options.promptText === 'string' ? options.promptText : DEFAULT_PROMPT;
    this.patterns = patterns || {};
    this.screen = new ScreenBuffer(this.cols, this.rows);
    this._inputBuf = '';
    this._history = [];
    this._spawned = false;
    this._disposed = false;
    this._busy = false;
    this._abortController = null;
    this._inflight = null;
    this._pid = 0;
  }

  // --- Adapter interface ---

  get metadata() {
    return { name: 'local-llm', version: '1.0.0', backend: this.backend };
  }

  get supportsPause() {
    return true;
  }

  init(workerCtx) {
    super.init(workerCtx);
    if (!this._spawned) this.spawn({});
  }

  sendInput(text) {
    if (typeof text !== 'string') {
      throw new TypeError('sendInput requires a string');
    }
    return this.write(text);
  }

  sendKey(key) {
    const mapped = Object.prototype.hasOwnProperty.call(KEY_MAP, key) ? KEY_MAP[key] : key;
    return this.write(mapped);
  }

  detectIdle(chunk) {
    if (this._busy) return false;
    const s = chunk == null ? '' : String(chunk);
    return s.includes(this.promptText);
  }

  // --- PTY-like surface ---

  spawn(opts = {}) {
    if (this._spawned) return this;
    this._spawned = true;
    this._pid = Math.floor(Math.random() * 1e6) + 1;
    const cols = Number.isFinite(opts.cols) ? opts.cols : this.cols;
    const rows = Number.isFinite(opts.rows) ? opts.rows : this.rows;
    this.resize(cols, rows);
    this._emitPrompt();
    return this;
  }

  get pid() {
    return this._pid;
  }

  write(data) {
    if (this._disposed || data == null) return null;
    const text = String(data);
    this._inputBuf += text;
    this.screen.write(text);
    this._emitOutput(text);
    const nlIdx = this._findNewline(this._inputBuf);
    if (nlIdx < 0 || this._busy) return null;
    const line = this._inputBuf.slice(0, nlIdx);
    this._inputBuf = this._inputBuf.slice(nlIdx + 1);
    const prompt = line.trim();
    if (!prompt) {
      this._emitPrompt();
      return null;
    }
    return this.runInference(prompt);
  }

  resize(cols, rows) {
    const c = Number.isFinite(cols) && cols > 0 ? Math.floor(cols) : this.cols;
    const r = Number.isFinite(rows) && rows > 0 ? Math.floor(rows) : this.rows;
    this.cols = c;
    this.rows = r;
    if (this.screen && typeof this.screen.resize === 'function') {
      try { this.screen.resize(c, r); } catch { /* ignore resize errors */ }
    }
  }

  kill(_signal) {
    if (this._abortController) {
      try { this._abortController.abort(); } catch { /* ignore */ }
    }
    this._busy = false;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.kill('SIGTERM');
    this._outputHandlers = [];
    this._inflight = null;
    this._workerCtx = null;
    this._history = [];
    this._inputBuf = '';
  }

  // --- Inference ---

  buildRequest(prompt) {
    if (this.backend === 'ollama') {
      return {
        url: `${this.url}/api/generate`,
        body: { model: this.model, prompt, stream: true },
      };
    }
    const messages = [];
    if (this.systemPrompt) messages.push({ role: 'system', content: this.systemPrompt });
    for (const m of this._history) messages.push(m);
    messages.push({ role: 'user', content: prompt });
    return {
      url: `${this.url}/v1/chat/completions`,
      body: { model: this.model, messages, stream: true },
    };
  }

  async runInference(prompt) {
    if (this._busy || this._disposed) return null;
    this._busy = true;
    const task = this._doInference(prompt);
    this._inflight = task;
    try {
      return await task;
    } finally {
      this._busy = false;
      this._abortController = null;
      this._inflight = null;
      this._emitPrompt();
    }
  }

  async _doInference(prompt) {
    const req = this.buildRequest(prompt);
    if (!this.fetchImpl) {
      await Promise.resolve();
      return this._emitError(new Error('fetch implementation unavailable'));
    }
    this._abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    };
    if (this._abortController) init.signal = this._abortController.signal;
    if (this.requestInit) Object.assign(init, this.requestInit);
    let res;
    try {
      res = await this.fetchImpl(req.url, init);
    } catch (err) {
      return this._emitError(err);
    }
    if (!res || !res.ok) {
      const code = res && res.status ? res.status : 'network-error';
      return this._emitError(new Error(`HTTP ${code}`));
    }
    let assistantText = '';
    try {
      assistantText = await this._consumeStream(res);
    } catch (err) {
      return this._emitError(err);
    }
    if (this.backend !== 'ollama') {
      this._history.push({ role: 'user', content: prompt });
      this._history.push({ role: 'assistant', content: assistantText });
    }
    return assistantText;
  }

  _emitError(err) {
    const msg = `\r\n[local-llm:${this.backend}] error: ${err && err.message ? err.message : String(err)}\r\n`;
    this.screen.write(msg);
    this._emitOutput(msg);
    return '';
  }

  async _consumeStream(res) {
    const body = res && res.body;
    if (!body || typeof body.getReader !== 'function') {
      const text = typeof res.text === 'function' ? await res.text() : '';
      if (text) {
        this._streamOut(text);
        return text;
      }
      return '';
    }
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let assembled = '';
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (value) buf += decoder.decode(value, { stream: true });
      const parts = this._splitFrames(buf, done);
      buf = parts.remainder;
      for (const frame of parts.frames) {
        const token = this.parseFrame(frame);
        if (token === null) continue;
        if (token === '__DONE__') {
          if (reader.cancel) { try { await reader.cancel(); } catch { /* ignore */ } }
          return assembled;
        }
        if (token) {
          assembled += token;
          this._streamOut(token);
        }
      }
      if (done) break;
    }
    return assembled;
  }

  _streamOut(text) {
    this.screen.write(text);
    this._emitOutput(text);
  }

  _splitFrames(buf, finalChunk) {
    if (this.backend === 'ollama') {
      const parts = buf.split('\n');
      const remainder = finalChunk ? '' : parts.pop();
      return {
        frames: parts.filter((f) => f.trim().length > 0),
        remainder: remainder == null ? '' : remainder,
      };
    }
    const idx = buf.lastIndexOf('\n\n');
    if (idx < 0) {
      if (finalChunk && buf.trim().length > 0) return { frames: [buf], remainder: '' };
      return { frames: [], remainder: buf };
    }
    const head = buf.slice(0, idx);
    const remainder = finalChunk ? '' : buf.slice(idx + 2);
    return {
      frames: head.split('\n\n').filter((f) => f.trim().length > 0),
      remainder,
    };
  }

  parseFrame(frame) {
    try {
      if (this.backend === 'ollama') {
        const obj = JSON.parse(frame);
        if (obj && obj.done === true) return '__DONE__';
        if (obj && typeof obj.response === 'string') return obj.response;
        if (obj && obj.message && typeof obj.message.content === 'string') {
          return obj.message.content;
        }
        return '';
      }
      const lines = String(frame).split('\n').map((l) => l.trim()).filter(Boolean);
      let emitted = '';
      let sawDone = false;
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') { sawDone = true; continue; }
        const obj = JSON.parse(payload);
        const choices = (obj && obj.choices) || [];
        const first = choices[0] || {};
        const delta = first.delta || first.message || {};
        if (typeof delta.content === 'string') emitted += delta.content;
      }
      if (sawDone && emitted.length === 0) return '__DONE__';
      return emitted;
    } catch {
      return null;
    }
  }

  _findNewline(s) {
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\r' || c === '\n') return i;
    }
    return -1;
  }

  _emitPrompt() {
    const p = `\r\n${this.promptText}`;
    this.screen.write(p);
    this._emitOutput(p);
  }
}

class LocalOllamaAdapter extends LocalLLMAdapter {
  constructor(patterns, options = {}) {
    super(patterns, { ...(options || {}), backend: 'ollama' });
  }
}

class LocalLlamaCppAdapter extends LocalLLMAdapter {
  constructor(patterns, options = {}) {
    super(patterns, { ...(options || {}), backend: 'llama-cpp' });
  }
}

class LocalVllmAdapter extends LocalLLMAdapter {
  constructor(patterns, options = {}) {
    super(patterns, { ...(options || {}), backend: 'vllm' });
  }
}

module.exports = LocalLLMAdapter;
module.exports.LocalLLMAdapter = LocalLLMAdapter;
module.exports.LocalOllamaAdapter = LocalOllamaAdapter;
module.exports.LocalLlamaCppAdapter = LocalLlamaCppAdapter;
module.exports.LocalVllmAdapter = LocalVllmAdapter;
module.exports.BACKENDS = BACKENDS;
module.exports.DEFAULT_ENDPOINTS = DEFAULT_ENDPOINTS;
module.exports.DEFAULT_MODELS = DEFAULT_MODELS;
module.exports.KEY_MAP = KEY_MAP;
module.exports.DEFAULT_PROMPT = DEFAULT_PROMPT;
