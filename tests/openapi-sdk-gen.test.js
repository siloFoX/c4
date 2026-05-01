'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { generateSdk, _tsTypeFor, _tsObjectShape } = require('../src/openapi-sdk-gen');
const { buildSpec } = require('../src/openapi-gen');

describe('openapi-sdk-gen._tsTypeFor', () => {
  it('maps primitives correctly', () => {
    assert.equal(_tsTypeFor({ type: 'string' }), 'string');
    assert.equal(_tsTypeFor({ type: 'integer' }), 'number');
    assert.equal(_tsTypeFor({ type: 'number' }), 'number');
    assert.equal(_tsTypeFor({ type: 'boolean' }), 'boolean');
    assert.equal(_tsTypeFor({}), 'unknown');
    assert.equal(_tsTypeFor(null), 'unknown');
  });

  it('builds enum union types', () => {
    const t = _tsTypeFor({ enum: ['admin', 'manager', 'viewer'] });
    assert.equal(t, '"admin" | "manager" | "viewer"');
  });

  it('handles nullable wrapping', () => {
    assert.equal(_tsTypeFor({ type: 'string', nullable: true }), 'string | null');
    assert.equal(_tsTypeFor({ type: 'integer', nullable: true }), 'number | null');
  });

  it('builds array types from items schema', () => {
    assert.equal(_tsTypeFor({ type: 'array', items: { type: 'string' } }), 'string[]');
    assert.equal(_tsTypeFor({ type: 'array', items: { type: 'integer' } }), 'number[]');
    assert.equal(_tsTypeFor({ type: 'array' }), 'unknown[]');
  });
});

describe('openapi-sdk-gen._tsObjectShape', () => {
  it('emits interface body with required vs optional markers', () => {
    const shape = _tsObjectShape({
      type: 'object',
      required: ['user'],
      properties: {
        user: { type: 'string' },
        token: { type: 'string', nullable: true },
      },
    });
    assert.match(shape, /^\{/);
    assert.match(shape, /user: string;/);
    assert.match(shape, /token\?: string \| null;/);
  });

  it('falls back to Record<string,unknown> for empty schemas', () => {
    assert.equal(_tsObjectShape({}), 'Record<string, unknown>');
    assert.equal(_tsObjectShape(null), 'Record<string, unknown>');
  });
});

describe('openapi-sdk-gen.generateSdk', () => {
  it('produces a TypeScript module with C4Client class + methods for every operation', () => {
    const spec = buildSpec();
    const ts = generateSdk(spec);
    // Header comment + class + ≥80 methods
    assert.match(ts, /^\/\/ Auto-generated TypeScript client/);
    assert.match(ts, /export class C4Client/);
    const methodCount = (ts.match(/^  async [a-zA-Z]+\(/gm) || []).length;
    // Spec has 110 operations; expect at least 100 methods.
    assert.ok(methodCount >= 100, `expected 100+ methods, got ${methodCount}`);
  });

  it('emits per-operation argument + response interfaces', () => {
    const spec = buildSpec();
    const ts = generateSdk(spec);
    assert.match(ts, /export interface postAuthLoginBody/);
    assert.match(ts, /export interface postAuthLoginResponse/);
    assert.match(ts, /export interface postCreateBody/);
    assert.match(ts, /export interface postTaskBody/);
  });

  it('method delegates to this.request() with method/path/body spec', () => {
    const spec = buildSpec();
    const ts = generateSdk(spec);
    const idx = ts.indexOf('async postAuthLogin');
    const body = ts.slice(idx, idx + 400);
    assert.match(body, /this\.request<postAuthLoginResponse>\(\{/);
    assert.match(body, /method: 'POST'/);
    assert.match(body, /path: '\/api\/auth\/login'/);
    assert.match(body, /body: body as unknown/);
  });

  it('shared request() helper builds URL + injects Authorization header', () => {
    const spec = buildSpec();
    const ts = generateSdk(spec);
    // Helper now lives once on the class; check its bones.
    assert.match(ts, /async request<T>\(spec: RequestSpec/);
    assert.match(ts, /new URL\(spec\.path, this\.baseUrl\)/);
    assert.match(ts, /JSON\.stringify\(spec\.body\)/);
    assert.match(ts, /Authorization = `Bearer \$\{this\.token\}`/);
  });

  it('emits 401 → onAuthExpired refresh + replay loop guard', () => {
    const spec = buildSpec();
    const ts = generateSdk(spec);
    assert.match(ts, /onAuthExpired\?: \(\) => Promise<string \| null>/);
    assert.match(ts, /respCtx\.status === 401 && !_refreshed/);
    assert.match(ts, /this\.onAuthExpired\(\)/);
    assert.match(ts, /return this\.request<T>\(spec, true\)/);
  });

  it('emits onRequest + onResponse interceptor wiring', () => {
    const spec = buildSpec();
    const ts = generateSdk(spec);
    assert.match(ts, /onRequest\?: \(ctx: C4RequestContext\)/);
    assert.match(ts, /onResponse\?: \(ctx: C4ResponseContext\)/);
    assert.match(ts, /export interface C4RequestContext/);
    assert.match(ts, /export interface C4ResponseContext/);
    assert.match(ts, /if \(this\.onRequest\) reqCtx = await this\.onRequest\(reqCtx\)/);
    assert.match(ts, /if \(this\.onResponse\) respCtx = await this\.onResponse\(respCtx\)/);
  });

  it('emits C4ApiError class with status / body / operationId fields', () => {
    const spec = buildSpec();
    const ts = generateSdk(spec);
    assert.match(ts, /export class C4ApiError extends Error/);
    assert.match(ts, /status: number;/);
    assert.match(ts, /body: unknown;/);
    assert.match(ts, /operationId\?: string;/);
  });

  it('exposes retries + backoffMs config + exponential backoff loop', () => {
    const spec = buildSpec();
    const ts = generateSdk(spec);
    assert.match(ts, /retries\?: number/);
    assert.match(ts, /backoffMs\?: number/);
    assert.match(ts, /Math\.pow\(2, attempt\)/);
    assert.match(ts, /respCtx\.status >= 500/);
  });

  it('GET routes with query params expose a Params interface', () => {
    const spec = buildSpec();
    const ts = generateSdk(spec);
    assert.match(ts, /export interface getReadParams/);
    assert.match(ts, /name: string;/);
  });

  it('uses type alias (not interface) for empty Record<> shapes', () => {
    const spec = buildSpec();
    const ts = generateSdk(spec);
    // Any export-line that ends with `Record<string, unknown>`
    // must use `export type` syntax, never `export interface`.
    const interfaceWithRecord = ts.match(/^export interface \w+ Record</gm);
    assert.equal(interfaceWithRecord, null, `interface declared with Record<>: ${interfaceWithRecord}`);
  });
});
