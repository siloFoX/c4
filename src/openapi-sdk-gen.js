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
    default: base = 'unknown';
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

  // Per-operation argument + response types, then the class.
  const methods = [];
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
      methods.push({ opId, method, pth, op, sigArgs, respName });
    }
  }

  lines.push('// Error class — typed wrapper around non-2xx responses.');
  lines.push('// Carries the HTTP status, the parsed body (when JSON), and');
  lines.push('// the operationId so callers can switch on it.');
  lines.push('export class C4ApiError extends Error {');
  lines.push('  status: number;');
  lines.push('  statusText: string;');
  lines.push('  body: unknown;');
  lines.push('  operationId?: string;');
  lines.push('  constructor(status: number, statusText: string, body: unknown, operationId?: string) {');
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
  lines.push('  constructor(opts: C4ClientOptions = {}) {');
  lines.push('    this.baseUrl = opts.baseUrl || "http://localhost:3456";');
  lines.push('    this.token = opts.token;');
  lines.push('    this.fetch = opts.fetch || fetch;');
  lines.push('    this.retries = opts.retries ?? 0;');
  lines.push('    this.backoffMs = opts.backoffMs ?? 200;');
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
  lines.push('  async request<T>(spec: RequestSpec): Promise<T> {');
  lines.push('    const url = new URL(spec.path, this.baseUrl);');
  lines.push('    if (spec.params) {');
  lines.push('      for (const [k, v] of Object.entries(spec.params)) {');
  lines.push('        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));');
  lines.push('      }');
  lines.push('    }');
  lines.push('    const init: RequestInit = {');
  lines.push('      method: spec.method,');
  lines.push('      headers: this.headers(),');
  lines.push('    };');
  lines.push('    if (spec.body !== undefined) init.body = JSON.stringify(spec.body);');
  lines.push('    let lastErr: unknown;');
  lines.push('    for (let attempt = 0; attempt <= this.retries; attempt++) {');
  lines.push('      try {');
  lines.push('        const res = await this.fetch(url.toString(), init);');
  lines.push('        if (!res.ok) {');
  lines.push('          const ct = res.headers.get("content-type") || "";');
  lines.push('          const body = ct.includes("json") ? await res.json() : await res.text();');
  lines.push('          // 5xx is retryable; 4xx is not.');
  lines.push('          if (res.status >= 500 && attempt < this.retries) {');
  lines.push('            await this._sleep(this.backoffMs * Math.pow(2, attempt));');
  lines.push('            continue;');
  lines.push('          }');
  lines.push('          throw new C4ApiError(res.status, res.statusText, body, spec.operationId);');
  lines.push('        }');
  lines.push('        const ct = res.headers.get("content-type") || "";');
  lines.push('        if (ct.includes("json")) return await res.json() as T;');
  lines.push('        return await res.text() as unknown as T;');
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
  for (const { opId, method, pth, op, sigArgs, respName } of methods) {
    const summary = op.summary || `${method.toUpperCase()} ${pth}`;
    lines.push('');
    lines.push(`  /** ${summary.replace(/\*\//g, '* /')} */`);
    lines.push(`  async ${opId}(${sigArgs}): Promise<${respName}> {`);
    lines.push(_methodBody(method, pth, op));
    lines.push(`  }`);
  }
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

module.exports = { generateSdk, _tsTypeFor, _tsObjectShape };
