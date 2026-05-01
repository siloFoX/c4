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

// Method body: builds a fetch() call from the operation envelope.
function _methodBody(method, pathTemplate, op) {
  const parts = [];
  parts.push(`    const url = new URL('${pathTemplate}', this.baseUrl);`);
  // Query parameters
  const queryParams = (op.parameters || []).filter((p) => p.in === 'query');
  if (queryParams.length) {
    parts.push(`    if (params) {`);
    for (const p of queryParams) {
      parts.push(`      if (params.${p.name} !== undefined) url.searchParams.set('${p.name}', String(params.${p.name}));`);
    }
    parts.push(`    }`);
  }
  parts.push(`    const init: RequestInit = { method: '${method.toUpperCase()}' };`);
  parts.push(`    init.headers = { 'Content-Type': 'application/json', ...this.headers() };`);
  if (op.requestBody) {
    parts.push(`    init.body = JSON.stringify(body);`);
  }
  parts.push(`    const res = await this.fetch(url.toString(), init);`);
  parts.push(`    if (!res.ok) throw new Error(\`HTTP \${res.status} \${res.statusText}\`);`);
  parts.push(`    const ct = res.headers.get('content-type') || '';`);
  parts.push(`    if (ct.includes('json')) return await res.json();`);
  parts.push(`    return await res.text() as any;`);
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

  lines.push('export interface C4ClientOptions {');
  lines.push('  baseUrl?: string;');
  lines.push('  token?: string;');
  lines.push('  fetch?: typeof fetch;');
  lines.push('}');
  lines.push('');
  lines.push('export class C4Client {');
  lines.push('  private baseUrl: string;');
  lines.push('  private token?: string;');
  lines.push('  private fetch: typeof fetch;');
  lines.push('  constructor(opts: C4ClientOptions = {}) {');
  lines.push('    this.baseUrl = opts.baseUrl || "http://localhost:3456";');
  lines.push('    this.token = opts.token;');
  lines.push('    this.fetch = opts.fetch || fetch;');
  lines.push('  }');
  lines.push('  private headers(): Record<string, string> {');
  lines.push('    return this.token ? { Authorization: `Bearer ${this.token}` } : {};');
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
