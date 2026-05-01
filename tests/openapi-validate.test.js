'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validate, validateRequestBody, validateResponse, formatDriftWarning } = require('../src/openapi-validate');
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
      path: '/some/path.jsonl',
      role: 'pirate-king',
    }, ROUTE_SCHEMAS);
    assert.equal(r.valid, false);
    assert.match(r.errors[0], /role: not in enum/);
  });
});

describe('openapi-validate.validateResponse (against ROUTE_SCHEMAS)', () => {
  // (v1.10.31) Phase 4 of the drift detection family —
  // scripts/check-runtime-drift.js hits the live daemon and feeds
  // each response through validateResponse. The unit tests below
  // lock in the validator behavior so the runtime checker keeps
  // working even after future spec edits.

  it('accepts a valid GET /health response', () => {
    const r = validateResponse('GET', '/health',
      { ok: true, workers: 0, version: '1.10.30' }, ROUTE_SCHEMAS);
    assert.equal(r.valid, true, r.errors.join(', '));
  });

  it('rejects /health response with wrong type on workers', () => {
    const r = validateResponse('GET', '/health',
      { ok: true, workers: 'zero', version: '1.10.30' }, ROUTE_SCHEMAS);
    assert.equal(r.valid, false);
    assert.match(r.errors[0], /workers: expected integer/);
  });

  it('passes through routes without a response schema', () => {
    const r = validateResponse('POST', '/no-schema-here', {}, ROUTE_SCHEMAS);
    assert.equal(r.valid, true);
  });

  it('skips string-typed responses (HTML / SSE / YAML)', () => {
    // /api-docs is a text/html string response — runtime body would
    // be HTML, not JSON. Validator must short-circuit, not try to
    // walk the schema as object.
    const r = validateResponse('GET', '/api-docs', '<html>...</html>', ROUTE_SCHEMAS);
    assert.equal(r.valid, true);
  });

  it('skipDelegated suppresses validation when handler delegates', () => {
    // Caller can set skipDelegated when they know the handler
    // wholesale-passes through (result = mgr.X(body)) — the spec
    // describes the callee's shape, runtime may include extras.
    const r = validateResponse('GET', '/health',
      { ok: 'not-a-bool' }, ROUTE_SCHEMAS, { skipDelegated: true });
    assert.equal(r.valid, true);
  });
});

describe('openapi-validate.formatDriftWarning', () => {
  // (v1.10.38) Pulled out of daemon.js so the daemon-side
  // validateResponses path can be tested without spawning a process.

  it('returns null when there are no errors', () => {
    assert.equal(formatDriftWarning('GET', '/x', []), null);
    assert.equal(formatDriftWarning('GET', '/x', null), null);
    assert.equal(formatDriftWarning('GET', '/x', undefined), null);
  });

  it('formats a single-line warning prefixed with [openapi-drift]', () => {
    const line = formatDriftWarning('GET', '/health', ['response.workers: expected integer, got string']);
    assert.match(line, /^\[openapi-drift\] GET \/health: 1 field\(s\) — response\.workers/);
  });

  it('caps the first N errors and adds an ellipsis when there are more', () => {
    const errs = Array.from({ length: 5 }, (_, i) => `err${i}`);
    const line = formatDriftWarning('GET', '/x', errs); // default max=3
    assert.match(line, /err0; err1; err2 …$/);
    assert.ok(!/err3/.test(line));
  });

  it('honours an explicit max', () => {
    const errs = ['a', 'b', 'c', 'd'];
    const line = formatDriftWarning('GET', '/x', errs, { max: 2 });
    assert.match(line, /a; b …$/);
  });

  it('omits the ellipsis when errors fit under the cap', () => {
    const line = formatDriftWarning('POST', '/y', ['only one']);
    assert.ok(!/…/.test(line), `unexpected ellipsis: ${line}`);
  });
});
