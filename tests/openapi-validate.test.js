'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validate, validateRequestBody } = require('../src/openapi-validate');
const { ROUTE_SCHEMAS } = require('../src/openapi-gen');

describe('openapi-validate.validate (primitives)', () => {
  it('accepts matching string', () => {
    const r = validate({ type: 'string' }, 'hello');
    assert.equal(r.valid, true);
  });

  it('rejects number when string expected', () => {
    const r = validate({ type: 'string' }, 42);
    assert.equal(r.valid, false);
    assert.match(r.errors[0], /expected string/);
  });

  it('rejects float when integer expected', () => {
    const r = validate({ type: 'integer' }, 3.14);
    assert.equal(r.valid, false);
    assert.match(r.errors[0], /expected integer/);
  });

  it('accepts integer', () => {
    assert.equal(validate({ type: 'integer' }, 42).valid, true);
  });

  it('accepts both int and float for type=number', () => {
    assert.equal(validate({ type: 'number' }, 1).valid, true);
    assert.equal(validate({ type: 'number' }, 1.5).valid, true);
  });

  it('rejects NaN / Infinity for number', () => {
    assert.equal(validate({ type: 'number' }, NaN).valid, false);
    assert.equal(validate({ type: 'number' }, Infinity).valid, false);
  });

  it('boolean type', () => {
    assert.equal(validate({ type: 'boolean' }, true).valid, true);
    assert.equal(validate({ type: 'boolean' }, 'true').valid, false);
  });
});

describe('openapi-validate.validate (enum + nullable)', () => {
  it('rejects value outside enum', () => {
    const r = validate({ type: 'string', enum: ['a', 'b', 'c'] }, 'd');
    assert.equal(r.valid, false);
    assert.match(r.errors[0], /not in enum/);
  });

  it('accepts value in enum', () => {
    assert.equal(validate({ type: 'string', enum: ['a', 'b'] }, 'a').valid, true);
  });

  it('nullable allows null', () => {
    assert.equal(validate({ type: 'string', nullable: true }, null).valid, true);
  });

  it('non-nullable rejects null', () => {
    assert.equal(validate({ type: 'string' }, null).valid, false);
  });
});

describe('openapi-validate.validate (object + required)', () => {
  it('reports missing required keys', () => {
    const schema = {
      type: 'object',
      required: ['user', 'password'],
      properties: {
        user: { type: 'string' },
        password: { type: 'string' },
      },
    };
    const r = validate(schema, { user: 'admin' });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => /password: required/.test(e)));
  });

  it('accepts object with all required fields + extras', () => {
    const schema = {
      type: 'object',
      required: ['user'],
      properties: { user: { type: 'string' } },
    };
    const r = validate(schema, { user: 'admin', extra: 42 });
    assert.equal(r.valid, true);
  });

  it('validates nested object property types', () => {
    const schema = {
      type: 'object',
      properties: {
        port: { type: 'integer' },
      },
    };
    const r = validate(schema, { port: 'not-a-number' });
    assert.equal(r.valid, false);
    assert.match(r.errors[0], /\.port: expected integer/);
  });
});

describe('openapi-validate.validate (array)', () => {
  it('rejects non-array', () => {
    assert.equal(validate({ type: 'array' }, 'string').valid, false);
  });

  it('validates each item against items schema', () => {
    const r = validate(
      { type: 'array', items: { type: 'integer' } },
      [1, 2, 'three'],
    );
    assert.equal(r.valid, false);
    assert.match(r.errors[0], /\[2\]/);
  });

  it('accepts homogeneous array', () => {
    assert.equal(validate({ type: 'array', items: { type: 'string' } }, ['a', 'b']).valid, true);
  });
});

describe('openapi-validate.validateRequestBody (against ROUTE_SCHEMAS)', () => {
  it('passes through routes without a schema', () => {
    const r = validateRequestBody('POST', '/no-schema-here', { foo: 'bar' }, ROUTE_SCHEMAS);
    assert.equal(r.valid, true);
  });

  it('rejects missing required fields against POST /auth/login', () => {
    const r = validateRequestBody('POST', '/auth/login', {}, ROUTE_SCHEMAS);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => /user: required/.test(e)));
    assert.ok(r.errors.some((e) => /password: required/.test(e)));
  });

  it('accepts a valid POST /auth/login body', () => {
    const r = validateRequestBody('POST', '/auth/login', { user: 'admin', password: 'pw' }, ROUTE_SCHEMAS);
    assert.equal(r.valid, true);
  });

  it('rejects bad enum value on POST /create.tier', () => {
    const r = validateRequestBody('POST', '/create', { name: 'w1', tier: 99 }, ROUTE_SCHEMAS);
    // tier is type=string, so 99 fails the type check
    assert.equal(r.valid, false);
    assert.match(r.errors[0], /tier: expected string/);
  });

  it('accepts valid POST /create with optional fields', () => {
    const r = validateRequestBody('POST', '/create', { name: 'w1', target: 'local', tier: 'worker' }, ROUTE_SCHEMAS);
    assert.equal(r.valid, true);
  });

  it('rejects bad enum on POST /attach.role', () => {
    const r = validateRequestBody('POST', '/attach', {
      jsonlPath: '/some/path.jsonl',
      role: 'pirate-king',
    }, ROUTE_SCHEMAS);
    assert.equal(r.valid, false);
    assert.match(r.errors[0], /role: not in enum/);
  });
});
