'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildSpec } = require('../src/openapi-gen');
const { lint } = require('../scripts/validate-openapi');

describe('openapi spec lint (auto-generated)', () => {
  it('the live-built spec has zero errors', () => {
    const spec = buildSpec();
    const { errors } = lint(spec);
    assert.equal(errors.length, 0, `errors:\n  ${errors.join('\n  ')}`);
  });

  it('the lint reports operation counts ≥ path counts', () => {
    const spec = buildSpec();
    const { opCount } = lint(spec);
    const pathCount = Object.keys(spec.paths).length;
    assert.ok(opCount >= pathCount, `opCount ${opCount} < pathCount ${pathCount}`);
  });
});

describe('openapi spec lint (synthetic failures)', () => {
  it('flags missing top-level fields', () => {
    const { errors } = lint({});
    assert.ok(errors.some((e) => /openapi/.test(e)));
    assert.ok(errors.some((e) => /info/.test(e)));
    assert.ok(errors.some((e) => /paths/.test(e)));
  });

  it('flags bad response code keys', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {
        '/foo': {
          get: {
            summary: 'foo',
            responses: { 'not-a-code': { description: 'bad' } },
          },
        },
      },
    };
    const { errors } = lint(spec);
    assert.ok(errors.some((e) => /bad response code/.test(e)));
  });

  it('flags bad parameter "in" enum', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {
        '/foo': {
          get: {
            summary: 'foo',
            responses: { 200: { description: 'ok' } },
            parameters: [{ name: 'x', in: 'body' }], // body is invalid in 3.0
          },
        },
      },
    };
    const { errors } = lint(spec);
    assert.ok(errors.some((e) => /bad "in"/.test(e) || /parameter x bad "in"/.test(e)));
  });

  it('flags missing summary', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {
        '/foo': {
          get: {
            responses: { 200: { description: 'ok' } },
          },
        },
      },
    };
    const { errors } = lint(spec);
    assert.ok(errors.some((e) => /missing summary/.test(e)));
  });

  it('warns on duplicate operationIds', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {
        '/foo': {
          get: { summary: 'foo', operationId: 'dup', responses: { 200: { description: 'ok' } } },
        },
        '/bar': {
          get: { summary: 'bar', operationId: 'dup', responses: { 200: { description: 'ok' } } },
        },
      },
    };
    const { errors, warnings } = lint(spec);
    assert.equal(errors.length, 0);
    assert.ok(warnings.some((w) => /duplicate operationId/.test(w)));
  });
});
