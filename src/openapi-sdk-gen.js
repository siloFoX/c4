'use strict';

// TypeScript client generator for the auto-generated OpenAPI spec.
// Input: an OpenAPI 3.0 spec object (from buildSpec()).
// Output: a single .ts file that exports a `C4Client` class with one
// method per operationId, plus the request/response interfaces
// derived from each operation's parameter / requestBody / response
// schemas.
//
// Pure-node, zero deps. Spec → string transform; no file I/O here
// (the CLI command writes the result).
//
// Type mapping:
//   string     → string
//   integer    → number
//   number     → number
//   boolean    → boolean
//   array      → T[]
//   object     → { ...interface body }
//   nullable   → T | null
//   enum       → 'a' | 'b' | 'c'
//   missing    → unknown

function _tsTypeFor(schema) {
  if (!schema) return 'unknown';
  if (schema.enum && Array.isArray(schema.enum)) {
    return schema.enum.map((v) => JSON.stringify(v)).join(' | ');
  }
  let base;
  switch (schema.type) {
    case 'string': base = 'string'; break;
    case 'integer':
    case 'number': base = 'number'; break;
    case 'boolean': base = 'boolean'; break;
    case 'array': base = `${_tsTypeFor(schema.items || {})}[]`; break;
    case 'object': base = _tsObjectShape(schema); break;
    default:
      // Treat as object when `properties` is set, even without an
      // explicit `type: 'object'` — many OpenAPI authors leave it
      // implicit. Fixes the case where array items have a properties
      // map but no type field, which used to emit `unknown[]`.
      if (schema.properties) base = _tsObjectShape(schema);
      else base = 'unknown';
  }
  if (schema.nullable) base = `${base} | null`;
  return base;
}

function _tsObjectShape(schema) {
  if (!schema || !schema.properties) return 'Record<string, unknown>';
  const required = new Set(schema.required || []);
  const lines = Object.entries(schema.properties).map(([k, v]) => {
    const opt = required.has(k) ? '' : '?';
    const desc = v.description ? ` /** ${v.description.replace(/\*\//g, '* /')} */` : '';
    return `  ${k}${opt}: ${_tsTypeFor(v)};${desc}`;
  });
  return `{\n${lines.join('\n')}\n}`;
}

// Method body: builds a fetch() call through this.request() —
// the central retry + error-handling helper. Each method just
// describes its METHOD / path / params / body shape.
function _methodBody(method, pathTemplate, op) {
  const parts = [];
  parts.push(`    return this.request<${op.operationId || 'unknown'}Response>({`);
  parts.push(`      method: '${method.toUpperCase()}',`);
  parts.push(`      path: '${pathTemplate}',`);
  const queryParams = (op.parameters || []).filter((p) => p.in === 'query');
  if (queryParams.length) {
    parts.push(`      params: params as unknown as Record<string, unknown> | undefined,`);
  }
  if (op.requestBody) {
    parts.push(`      body: body as unknown,`);
  }
  parts.push(`    });`);
  return parts.join('\n');
}

function generateSdk(spec) {
  const lines = [];
  lines.push('// Auto-generated TypeScript client for the C4 daemon API.');
  lines.push('// Generated from /openapi.json via src/openapi-sdk-gen.js.');
  lines.push('// Do not edit by hand — re-run `c4 openapi --sdk` to refresh.');
  lines.push('');
  lines.push(`// Spec version: ${spec.info?.version || 'unknown'}`);
  lines.push(`// Generated at: ${new Date().toISOString()}`);
  lines.push('');

  // SSE route detection — these return text/event-stream and need a
  // streaming method instead of fetch().json(). We can't reliably
  // tell from the spec alone (responses[200] schema is unknown for
  // streams), so we name-match the routes that the daemon actually
  // serves as SSE.
  // /slack/events used to be in this list, but the daemon actually
  // returns plain JSON (a tail of the in-memory event buffer) — the
  // route name is a historical accident. The real SSE feeds are
  // /events, /watch, and /approvals/stream.
  const SSE_ROUTES = new Set([
    'GET /events',
    'GET /watch',
    'GET /approvals/stream',
  ]);

  // Per-operation argument + response types, then the class.
  const methods = [];
  const sseMethods = [];
  for (const [pth, ops] of Object.entries(spec.paths || {})) {
    for (const [method, op] of Object.entries(ops)) {
      const opId = op.operationId;
      if (!opId) continue;
      // Argument type
      const argParts = [];
      const queryParams = (op.parameters || []).filter((p) => p.in === 'query');
      if (queryParams.length) {
        const qFields = queryParams.map((p) => {
          const opt = p.required ? '' : '?';
          return `  ${p.name}${opt}: ${_tsTypeFor(p.schema || {})};`;
        });
        const argName = `${opId}Params`;
        lines.push(`export interface ${argName} {\n${qFields.join('\n')}\n}`);
        argParts.push(['params', argName, !queryParams.some((p) => p.required)]);
      }
      if (op.requestBody) {
        const schema = op.requestBody.content?.['application/json']?.schema;
        const argName = `${opId}Body`;
        const shape = _tsObjectShape(schema || {});
        // `interface X { ... }` requires a brace body; the
        // no-properties case returns `Record<string, unknown>`
        // which only works as a type alias.
        if (shape.startsWith('{')) lines.push(`export interface ${argName} ${shape}`);
        else lines.push(`export type ${argName} = ${shape};`);
        argParts.push(['body', argName, false]);
      }
      // Response type
      const respSchema = op.responses?.['200']?.content?.['application/json']?.schema;
      const respName = `${opId}Response`;
      if (respSchema) {
        const shape = _tsObjectShape(respSchema || {});
        if (shape.startsWith('{')) lines.push(`export interface ${respName} ${shape}`);
        else lines.push(`export type ${respName} = ${shape};`);
      } else {
        lines.push(`export type ${respName} = unknown;`);
      }
      lines.push('');
      // Method signature
      const sigArgs = argParts.map(([n, t, optional]) => `${n}${optional ? '?' : ''}: ${t}`).join(', ');
      const routeKey = `${method.toUpperCase()} ${pth.replace(/^\/api/, '')}`;
      const isSSE = SSE_ROUTES.has(routeKey);
      if (isSSE) sseMethods.push({ opId, method, pth, op, sigArgs });
      else methods.push({ opId, method, pth, op, sigArgs, respName });
    }
  }

  lines.push('// SSE event payload yielded by streaming methods. `data` is the');
  lines.push('// parsed JSON when the line was JSON, otherwise the raw string.');
  lines.push('// `type` defaults to "message" per the SSE spec; daemon-emitted');
  lines.push('// events carry their own `type` field inside `data`.');
  lines.push('export interface C4SSEEvent {');
  lines.push('  type: string;');
  lines.push('  data: unknown;');
  lines.push('  raw: string;');
  lines.push('  id?: string;');
  lines.push('}');
  lines.push('');
  lines.push('// Standard error envelope every daemon non-2xx response uses.');
  lines.push('// `details` populates on the validation 400 path (one entry per');
  lines.push('// failed field, e.g. `body.user: required`).');
  lines.push('export interface C4ErrorBody {');
  lines.push('  error?: string;');
  lines.push('  details?: string[];');
  lines.push('}');
  lines.push('');
  lines.push('// Error class — typed wrapper around non-2xx responses.');
  lines.push('// Carries the HTTP status, the parsed body (when JSON), and');
  lines.push('// the operationId so callers can switch on it.');
  lines.push('//');
  lines.push('// `body` is typed as the standard `{error?, details?}` envelope');
  lines.push('// the daemon emits for every 4xx/5xx. Cast to `unknown` if you');
  lines.push('// need to inspect a non-standard body (legacy callers / proxies).');
  lines.push('export class C4ApiError extends Error {');
  lines.push('  status: number;');
  lines.push('  statusText: string;');
  lines.push('  body: C4ErrorBody;');
  lines.push('  operationId?: string;');
  lines.push('  constructor(status: number, statusText: string, body: C4ErrorBody, operationId?: string) {');
  lines.push('    super(`HTTP ${status} ${statusText}${operationId ? ` (${operationId})` : ""}`);');
  lines.push('    this.name = "C4ApiError";');
  lines.push('    this.status = status;');
  lines.push('    this.statusText = statusText;');
  lines.push('    this.body = body;');
  lines.push('    this.operationId = operationId;');
  lines.push('  }');
  lines.push('}');
  lines.push('');
  lines.push('export interface C4ClientOptions {');
  lines.push('  baseUrl?: string;');
  lines.push('  token?: string;');
  lines.push('  fetch?: typeof fetch;');
  lines.push('  /** Number of retry attempts on transient failures (5xx, network). 0 = no retry. */');
  lines.push('  retries?: number;');
  lines.push('  /** Base backoff in ms — exponential 2^n * backoffMs between attempts. */');
  lines.push('  backoffMs?: number;');
  lines.push('  /**');
  lines.push('   * Called when the daemon returns 401 — the callback should');
  lines.push('   * acquire a fresh token (e.g., re-login) and resolve to it');
  lines.push('   * (or null to give up). The original request is replayed once');
  lines.push('   * with the new token; further 401s throw without re-calling.');
  lines.push('   */');
  lines.push('  onAuthExpired?: () => Promise<string | null>;');
  lines.push('  /**');
  lines.push('   * Pre-flight hook — fires before each fetch with the request');
  lines.push('   * spec + headers. Mutate or return a replacement to inject');
  lines.push('   * tracing / logging / X-Request-Id / etc. Return value is the');
  lines.push('   * source of truth for the actual request.');
  lines.push('   */');
  lines.push('  onRequest?: (ctx: C4RequestContext) => C4RequestContext | Promise<C4RequestContext>;');
  lines.push('  /**');
  lines.push('   * Post-flight hook — fires after each response (success OR');
  lines.push('   * failure) with the parsed body. Useful for response logging,');
  lines.push('   * metrics, or stripping wrapper envelopes. Return value is what');
  lines.push('   * the caller sees.');
  lines.push('   */');
  lines.push('  onResponse?: (ctx: C4ResponseContext) => C4ResponseContext | Promise<C4ResponseContext>;');
  lines.push('}');
  lines.push('');
  lines.push('export interface C4RequestContext {');
  lines.push('  method: string;');
  lines.push('  url: string;');
  lines.push('  headers: Record<string, string>;');
  lines.push('  body?: string;');
  lines.push('  operationId?: string;');
  lines.push('  attempt: number;');
  lines.push('}');
  lines.push('');
  lines.push('export interface C4ResponseContext {');
  lines.push('  status: number;');
  lines.push('  ok: boolean;');
  lines.push('  body: unknown;');
  lines.push('  operationId?: string;');
  lines.push('  durationMs: number;');
  lines.push('  attempt: number;');
  lines.push('}');
  lines.push('');
  lines.push('interface RequestSpec {');
  lines.push('  method: string;');
  lines.push('  path: string;');
  lines.push('  params?: Record<string, unknown>;');
  lines.push('  body?: unknown;');
  lines.push('  operationId?: string;');
  lines.push('}');
  lines.push('');
  lines.push('export class C4Client {');
  lines.push('  private baseUrl: string;');
  lines.push('  private token?: string;');
  lines.push('  private fetch: typeof fetch;');
  lines.push('  private retries: number;');
  lines.push('  private backoffMs: number;');
  lines.push('  private onAuthExpired?: () => Promise<string | null>;');
  lines.push('  private onRequest?: (ctx: C4RequestContext) => C4RequestContext | Promise<C4RequestContext>;');
  lines.push('  private onResponse?: (ctx: C4ResponseContext) => C4ResponseContext | Promise<C4ResponseContext>;');
  lines.push('  constructor(opts: C4ClientOptions = {}) {');
  lines.push('    this.baseUrl = opts.baseUrl || "http://localhost:3456";');
  lines.push('    this.token = opts.token;');
  lines.push('    this.fetch = opts.fetch || fetch;');
  lines.push('    this.retries = opts.retries ?? 0;');
  lines.push('    this.backoffMs = opts.backoffMs ?? 200;');
  lines.push('    this.onAuthExpired = opts.onAuthExpired;');
  lines.push('    this.onRequest = opts.onRequest;');
  lines.push('    this.onResponse = opts.onResponse;');
  lines.push('  }');
  lines.push('  setToken(token: string | undefined): void {');
  lines.push('    this.token = token;');
  lines.push('  }');
  lines.push('  private headers(): Record<string, string> {');
  lines.push('    const h: Record<string, string> = { "Content-Type": "application/json" };');
  lines.push('    if (this.token) h.Authorization = `Bearer ${this.token}`;');
  lines.push('    return h;');
  lines.push('  }');
  lines.push('  /**');
  lines.push('   * Central request helper — applies retries on transient failures');
  lines.push('   * (5xx + network errors). Throws C4ApiError on non-2xx that');
  lines.push('   * survive the retry budget. Returns parsed JSON when the response');
  lines.push('   * Content-Type is JSON, raw text otherwise.');
  lines.push('   */');
  lines.push('  async request<T>(spec: RequestSpec, _refreshed = false): Promise<T> {');
  lines.push('    const url = new URL(spec.path, this.baseUrl);');
  lines.push('    if (spec.params) {');
  lines.push('      for (const [k, v] of Object.entries(spec.params)) {');
  lines.push('        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));');
  lines.push('      }');
  lines.push('    }');
  lines.push('    let lastErr: unknown;');
  lines.push('    for (let attempt = 0; attempt <= this.retries; attempt++) {');
  lines.push('      // Build request context — interceptor sees + can mutate.');
  lines.push('      let reqCtx: C4RequestContext = {');
  lines.push('        method: spec.method,');
  lines.push('        url: url.toString(),');
  lines.push('        headers: this.headers(),');
  lines.push('        body: spec.body !== undefined ? JSON.stringify(spec.body) : undefined,');
  lines.push('        operationId: spec.operationId,');
  lines.push('        attempt,');
  lines.push('      };');
  lines.push('      if (this.onRequest) reqCtx = await this.onRequest(reqCtx);');
  lines.push('      const init: RequestInit = {');
  lines.push('        method: reqCtx.method,');
  lines.push('        headers: reqCtx.headers,');
  lines.push('      };');
  lines.push('      if (reqCtx.body !== undefined) init.body = reqCtx.body;');
  lines.push('      const t0 = Date.now();');
  lines.push('      try {');
  lines.push('        const res = await this.fetch(reqCtx.url, init);');
  lines.push('        const ct = res.headers.get("content-type") || "";');
  lines.push('        const body = ct.includes("json") ? await res.json() : await res.text();');
  lines.push('        let respCtx: C4ResponseContext = {');
  lines.push('          status: res.status,');
  lines.push('          ok: res.ok,');
  lines.push('          body,');
  lines.push('          operationId: spec.operationId,');
  lines.push('          durationMs: Date.now() - t0,');
  lines.push('          attempt,');
  lines.push('        };');
  lines.push('        if (this.onResponse) respCtx = await this.onResponse(respCtx);');
  lines.push('        if (!respCtx.ok) {');
  lines.push('          // 401 → call onAuthExpired and replay once with the new token.');
  lines.push('          // _refreshed flag prevents an infinite refresh loop on persistent 401s.');
  lines.push('          if (respCtx.status === 401 && !_refreshed && this.onAuthExpired) {');
  lines.push('            const newToken = await this.onAuthExpired();');
  lines.push('            if (newToken) {');
  lines.push('              this.token = newToken;');
  lines.push('              return this.request<T>(spec, true);');
  lines.push('            }');
  lines.push('          }');
  lines.push('          // 5xx is retryable; other 4xx is not.');
  lines.push('          if (respCtx.status >= 500 && attempt < this.retries) {');
  lines.push('            await this._sleep(this.backoffMs * Math.pow(2, attempt));');
  lines.push('            continue;');
  lines.push('          }');
  lines.push('          throw new C4ApiError(respCtx.status, res.statusText, respCtx.body as C4ErrorBody, spec.operationId);');
  lines.push('        }');
  lines.push('        return respCtx.body as T;');
  lines.push('      } catch (e) {');
  lines.push('        if (e instanceof C4ApiError) throw e;');
  lines.push('        lastErr = e;');
  lines.push('        if (attempt < this.retries) {');
  lines.push('          await this._sleep(this.backoffMs * Math.pow(2, attempt));');
  lines.push('          continue;');
  lines.push('        }');
  lines.push('      }');
  lines.push('    }');
  lines.push('    throw lastErr;');
  lines.push('  }');
  lines.push('  private _sleep(ms: number): Promise<void> {');
  lines.push('    return new Promise((resolve) => setTimeout(resolve, ms));');
  lines.push('  }');
  lines.push('  /**');
  lines.push('   * Open an SSE stream at the given URL and yield parsed events.');
  lines.push('   * Honours the same Authorization header as the request() helper.');
  lines.push('   * The async generator returns when the underlying stream ends');
  lines.push('   * (server-side close); callers can also break out of the for-await');
  lines.push('   * loop to abort the connection.');
  lines.push('   */');
  lines.push('  private async *_sse(url: URL): AsyncGenerator<C4SSEEvent> {');
  lines.push('    const headers: Record<string, string> = { Accept: "text/event-stream" };');
  lines.push('    if (this.token) headers.Authorization = `Bearer ${this.token}`;');
  lines.push('    const res = await this.fetch(url.toString(), { method: "GET", headers });');
  lines.push('    if (!res.ok) {');
  lines.push('      const ct = res.headers.get("content-type") || "";');
  lines.push('      const body = ct.includes("json") ? await res.json() : await res.text();');
  lines.push('      throw new C4ApiError(res.status, res.statusText, body as C4ErrorBody);');
  lines.push('    }');
  lines.push('    if (!res.body) return;');
  lines.push('    const reader = res.body.getReader();');
  lines.push('    const decoder = new TextDecoder();');
  lines.push('    let buffer = "";');
  lines.push('    try {');
  lines.push('      while (true) {');
  lines.push('        const { value, done } = await reader.read();');
  lines.push('        if (done) break;');
  lines.push('        buffer += decoder.decode(value, { stream: true });');
  lines.push('        // SSE messages are separated by a blank line. Split on');
  lines.push('        // \\n\\n and keep the trailing partial in the buffer.');
  lines.push('        let sep;');
  lines.push('        while ((sep = buffer.indexOf("\\n\\n")) !== -1) {');
  lines.push('          const message = buffer.slice(0, sep);');
  lines.push('          buffer = buffer.slice(sep + 2);');
  lines.push('          const parsed = this._parseSSEMessage(message);');
  lines.push('          if (parsed) yield parsed;');
  lines.push('        }');
  lines.push('      }');
  lines.push('    } finally {');
  lines.push('      try { reader.releaseLock(); } catch { /* already released */ }');
  lines.push('    }');
  lines.push('  }');
  lines.push('  private _parseSSEMessage(message: string): C4SSEEvent | null {');
  lines.push('    const lines = message.split("\\n");');
  lines.push('    let event = "message";');
  lines.push('    let dataLines: string[] = [];');
  lines.push('    let id: string | undefined;');
  lines.push('    for (const line of lines) {');
  lines.push('      if (!line || line.startsWith(":")) continue;');
  lines.push('      const colon = line.indexOf(":");');
  lines.push('      const field = colon === -1 ? line : line.slice(0, colon);');
  lines.push('      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");');
  lines.push('      if (field === "event") event = value;');
  lines.push('      else if (field === "data") dataLines.push(value);');
  lines.push('      else if (field === "id") id = value;');
  lines.push('    }');
  lines.push('    if (dataLines.length === 0) return null;');
  lines.push('    const raw = dataLines.join("\\n");');
  lines.push('    let data: unknown = raw;');
  lines.push('    try { data = JSON.parse(raw); } catch { /* keep raw string */ }');
  lines.push('    return { type: event, data, raw, ...(id !== undefined ? { id } : {}) };');
  lines.push('  }');
  for (const { opId, method, pth, op, sigArgs, respName } of methods) {
    const summary = op.summary || `${method.toUpperCase()} ${pth}`;
    lines.push('');
    lines.push(`  /** ${summary.replace(/\*\//g, '* /')} */`);
    lines.push(`  async ${opId}(${sigArgs}): Promise<${respName}> {`);
    lines.push(_methodBody(method, pth, op));
    lines.push(`  }`);
  }
  // SSE methods — return an AsyncIterable of parsed event objects.
  // Each method threads query params + token through the same URL +
  // header build as fetch routes, then opens a streaming connection
  // and yields {type, data, raw} events as they arrive.
  for (const { opId, method, pth, op, sigArgs } of sseMethods) {
    const summary = op.summary || `${method.toUpperCase()} ${pth}`;
    lines.push('');
    lines.push(`  /** ${summary.replace(/\*\//g, '* /')} (SSE stream) */`);
    lines.push(`  async *${opId}(${sigArgs}): AsyncGenerator<C4SSEEvent> {`);
    lines.push(`    const url = new URL('${pth}', this.baseUrl);`);
    const queryParams = (op.parameters || []).filter((p) => p.in === 'query');
    if (queryParams.length) {
      lines.push(`    if (params) {`);
      for (const p of queryParams) {
        lines.push(`      if (params.${p.name} !== undefined) url.searchParams.set('${p.name}', String(params.${p.name}));`);
      }
      lines.push(`    }`);
    }
    lines.push(`    yield* this._sse(url);`);
    lines.push(`  }`);
  }
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

module.exports = { generateSdk, _tsTypeFor, _tsObjectShape };
