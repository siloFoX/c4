'use strict';

// C4 SDK (TODO 9.3)
//
// Thin JavaScript client over the c4 daemon's HTTP API. Every method
// maps to a single daemon route and returns the parsed JSON body, with
// error responses surfaced as thrown errors (e.status, e.body).
//
// Design goals:
//   - No dependencies. Uses global fetch (Node 18+) so the package
//     installs with zero transitives.
//   - Symmetric with the `c4` CLI so callers who already know the CLI
//     can swap over without relearning names.
//   - SSE streaming via fetch + a chunk parser instead of a separate
//     EventSource polyfill, so the same entry point works in Node and
//     in browser bundlers.

const DEFAULT_BASE = 'http://localhost:3456';

class C4Error extends Error {
  constructor(message, { status, body, cause } = {}) {
    super(message);
    this.name = 'C4Error';
    this.status = typeof status === 'number' ? status : null;
    this.body = body === undefined ? null : body;
    if (cause) this.cause = cause;
  }
}

function stripUndefined(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v !== undefined) out[key] = v;
  }
  return out;
}

class C4Client {
  constructor(opts = {}) {
    const base = opts.base || opts.baseUrl || DEFAULT_BASE;
    // Normalize: trim trailing slash so new URL(path, base) behaves.
    this.base = typeof base === 'string' ? base.replace(/\/+$/, '') : DEFAULT_BASE;
    this.token = opts.token || null;
    this.fetch = opts.fetch || (typeof fetch === 'function' ? fetch : null);
    this.timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 30000;
    if (!this.fetch) {
      throw new Error('C4Client: no fetch implementation available. Use Node 18+ or pass opts.fetch.');
    }
  }

  // ----- internal -----

  _buildUrl(path, query) {
    const url = new URL(path, this.base + '/');
    if (query) {
      const clean = stripUndefined(query);
      for (const [k, v] of Object.entries(clean)) {
        if (v === null) continue;
        if (Array.isArray(v)) url.searchParams.set(k, v.join(','));
        else url.searchParams.set(k, String(v));
      }
    }
    return url;
  }

  _headers(extra) {
    const h = Object.assign({ Accept: 'application/json' }, extra || {});
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  async _request(method, path, opts = {}) {
    const url = this._buildUrl(path, opts.query);
    const headers = this._headers(opts.headers);
    const init = { method, headers };
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(stripUndefined(opts.body));
    }

    // AbortController wiring so callers can cancel or let us timeout.
    const controller = new AbortController();
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : this.timeoutMs;
    const timer = timeoutMs > 0 && !opts.stream
      ? setTimeout(() => controller.abort(new C4Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs)
      : null;
    init.signal = controller.signal;

    let res;
    try {
      res = await this.fetch(url.toString(), init);
    } catch (err) {
      if (timer) clearTimeout(timer);
      if (err && err.name === 'AbortError') {
        throw new C4Error(`Request aborted: ${method} ${path}`, { cause: err });
      }
      throw new C4Error(`Network error: ${err && err.message ? err.message : String(err)}`, { cause: err });
    }
    if (timer) clearTimeout(timer);

    if (opts.stream) {
      if (!res.ok) {
        const parsed = await this._readError(res);
        throw new C4Error(`C4 ${method} ${path} failed (${res.status}): ${parsed.message}`, { status: res.status, body: parsed.body });
      }
      return res;
    }

    const text = await res.text();
    let parsed = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch { parsed = text; }
    }
    if (!res.ok) {
      const msg = parsed && typeof parsed === 'object' && parsed.error ? parsed.error : (typeof parsed === 'string' && parsed ? parsed : res.statusText || 'request failed');
      throw new C4Error(`C4 ${method} ${path} failed (${res.status}): ${msg}`, { status: res.status, body: parsed });
    }
    return parsed == null ? {} : parsed;
  }

  async _readError(res) {
    let text = '';
    try { text = await res.text(); } catch {}
    let body = text;
    try { body = JSON.parse(text); } catch {}
    const message = body && typeof body === 'object' && body.error ? body.error : (text || res.statusText || 'error');
    return { body, message };
  }

  // ----- API surface -----

  health() {
    return this._request('GET', '/health');
  }

  listWorkers() {
    return this._request('GET', '/list');
  }

  async getWorker(name) {
    if (!name) throw new C4Error('getWorker: name is required');
    const data = await this.listWorkers();
    const list = Array.isArray(data && data.workers) ? data.workers : [];
    return list.find((w) => w && w.name === name) || null;
  }

  createWorker(name, opts = {}) {
    if (!name) throw new C4Error('createWorker: name is required');
    const body = {
      name,
      command: opts.command,
      args: opts.args,
      target: opts.target,
      cwd: opts.cwd,
      parent: opts.parent,
    };
    return this._request('POST', '/create', { body });
  }

  sendTask(name, task, opts = {}) {
    if (!name) throw new C4Error('sendTask: name is required');
    if (!task || typeof task !== 'string') throw new C4Error('sendTask: task must be a non-empty string');
    const body = Object.assign({ name, task }, opts);
    return this._request('POST', '/task', { body });
  }

  sendInput(name, text) {
    if (!name) throw new C4Error('sendInput: name is required');
    return this._request('POST', '/send', { body: { name, input: text } });
  }

  sendKey(name, key) {
    if (!name) throw new C4Error('sendKey: name is required');
    if (!key) throw new C4Error('sendKey: key is required');
    return this._request('POST', '/key', { body: { name, key } });
  }

  readOutput(name, opts = {}) {
    if (!name) throw new C4Error('readOutput: name is required');
    const mode = opts.mode || (opts.now ? 'now' : opts.wait ? 'wait' : 'default');
    let path = '/read';
    const query = { name };
    if (mode === 'now') path = '/read-now';
    else if (mode === 'wait') {
      path = '/wait-read';
      if (opts.timeoutMs != null) query.timeout = opts.timeoutMs;
      if (opts.interruptOnIntervention) query.interruptOnIntervention = 1;
    }
    const timeoutMs = mode === 'wait' && opts.timeoutMs ? opts.timeoutMs + 5000 : undefined;
    return this._request('GET', path, { query, timeoutMs });
  }

  watch(name, opts = {}) {
    if (!name) throw new C4Error('watch: name is required');
    const self = this;
    const url = this._buildUrl('/watch', { name });
    const headers = this._headers();
    // The watch endpoint is SSE, so the daemon only accepts Bearer headers.
    // When a token is set we also append ?token= (auth.extractBearerToken
    // falls back to the query string when the header is missing, which is
    // what a browser EventSource would need).
    if (this.token) url.searchParams.set('token', this.token);

    const externalSignal = opts.signal || null;

    return {
      [Symbol.asyncIterator]() {
        const controller = new AbortController();
        if (externalSignal) {
          if (externalSignal.aborted) controller.abort();
          else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
        }

        let resolvedPromise = null;
        let reader = null;
        let decoder = null;
        let buf = '';
        let done = false;

        async function ensureStream() {
          if (resolvedPromise) return resolvedPromise;
          resolvedPromise = (async () => {
            const res = await self.fetch(url.toString(), { method: 'GET', headers, signal: controller.signal });
            if (!res.ok) {
              let errBody = null;
              try { errBody = await res.text(); } catch {}
              throw new C4Error(`watch ${name} failed (${res.status})`, { status: res.status, body: errBody });
            }
            if (!res.body) throw new C4Error('watch: response has no body');
            reader = res.body.getReader ? res.body.getReader() : null;
            decoder = new TextDecoder('utf-8');
            if (!reader) {
              // Node 18 streams Response.body as a Web ReadableStream with
              // getReader(), but fall back to async iteration if present so
              // custom fetch mocks that expose only [Symbol.asyncIterator]
              // still work.
              if (res.body[Symbol.asyncIterator]) {
                reader = res.body[Symbol.asyncIterator]();
              } else {
                throw new C4Error('watch: response body is not readable');
              }
            }
          })();
          return resolvedPromise;
        }

        function parsePending() {
          const events = [];
          let idx;
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            if (!chunk) continue;
            let data = '';
            let type = 'message';
            for (const line of chunk.split('\n')) {
              if (line.startsWith('data: ')) {
                data += (data ? '\n' : '') + line.slice(6);
              } else if (line.startsWith('data:')) {
                data += (data ? '\n' : '') + line.slice(5);
              } else if (line.startsWith('event: ')) {
                type = line.slice(7).trim();
              }
            }
            if (!data) continue;
            let payload = null;
            try { payload = JSON.parse(data); } catch { payload = { raw: data }; }
            if (payload && typeof payload === 'object') {
              if (payload.type === 'output' && typeof payload.data === 'string') {
                payload.dataText = Buffer.from(payload.data, 'base64').toString('utf8');
              }
              if (!payload.type) payload.type = type;
            }
            events.push(payload);
          }
          return events;
        }

        return {
          async next() {
            if (done) return { value: undefined, done: true };
            await ensureStream();
            while (true) {
              const events = parsePending();
              if (events.length > 0) {
                const first = events.shift();
                // Any extra events get pushed back onto the buffer so the
                // next call can drain them. We preserve order by prefixing
                // synthetic framing (`data: JSON\n\n`).
                if (events.length > 0) {
                  const extra = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
                  buf = extra + buf;
                }
                return { value: first, done: false };
              }
              if (done) return { value: undefined, done: true };

              let chunk;
              try {
                chunk = reader.read ? await reader.read() : await reader.next();
              } catch (err) {
                done = true;
                if (controller.signal.aborted) return { value: undefined, done: true };
                throw err;
              }
              if (chunk.done) {
                done = true;
                return { value: undefined, done: true };
              }
              const value = chunk.value;
              if (value) {
                const text = typeof value === 'string' ? value : decoder.decode(value, { stream: true });
                buf += text;
              }
            }
          },
          async return(value) {
            done = true;
            try { controller.abort(); } catch {}
            try { if (reader && reader.cancel) await reader.cancel(); } catch {}
            return { value, done: true };
          },
          async throw(err) {
            done = true;
            try { controller.abort(); } catch {}
            throw err;
          },
        };
      },
    };
  }

  merge(name, opts = {}) {
    if (!name) throw new C4Error('merge: name is required');
    return this._request('POST', '/merge', { body: { name, skipChecks: opts.skipChecks } });
  }

  close(name) {
    if (!name) throw new C4Error('close: name is required');
    return this._request('POST', '/close', { body: { name } });
  }

  fleetOverview(opts = {}) {
    const query = {};
    if (opts.timeoutMs != null) query.timeout = opts.timeoutMs;
    return this._request('GET', '/fleet/overview', { query });
  }
}

module.exports = { C4Client, C4Error, DEFAULT_BASE };
