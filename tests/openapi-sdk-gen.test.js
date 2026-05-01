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

  it('method body builds URL + sets headers + JSON-encodes the body', () => {
    const spec = buildSpec();
    const ts = generateSdk(spec);
    const idx = ts.indexOf('async postAuthLogin');
    const body = ts.slice(idx, idx + 600);
    assert.match(body, /new URL\('\/api\/auth\/login', this\.baseUrl\)/);
    assert.match(body, /method: 'POST'/);
    assert.match(body, /JSON\.stringify\(body\)/);
    assert.match(body, /this\.fetch\(url\.toString\(\), init\)/);
  });

  it('includes Authorization: Bearer header when token is set', () => {
    const spec = buildSpec();
    const ts = generateSdk(spec);
    assert.match(ts, /Authorization: `Bearer \$\{this\.token\}`/);
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
