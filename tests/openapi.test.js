// /openapi.json sanity tests.

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');

const { build } = require('../src/openapi');

describe('OpenAPI generator', () => {
  it('builds a 3.1.0 document with paths', () => {
    const doc = build('1.6.16');
    assert.strictEqual(doc.openapi, '3.1.0');
    assert.strictEqual(doc.info.version, '1.6.16');
    assert.ok(doc.paths['/health']);
    assert.ok(doc.paths['/dispatch']);
    assert.ok(doc.paths['/workflow/run']);
  });

  it('marks every path with at least one operation', () => {
    const doc = build();
    for (const [route, ops] of Object.entries(doc.paths)) {
      assert.ok(Object.keys(ops).length > 0, `route ${route} has no operations`);
      for (const op of Object.values(ops)) {
        assert.ok(op.summary, 'operation missing summary');
        assert.ok(op.responses && op.responses['200'], 'operation missing 200 response');
      }
    }
  });

  it('includes Phase 9-11 surfaces', () => {
    const doc = build();
    for (const r of [
      '/dispatch', '/fleet/peers', '/fleet/list',
      '/scheduler/start', '/schedule', '/audit',
      '/board', '/projects', '/cost-report', '/departments',
      '/workflow/run', '/workflow/templates',
      '/nl/parse', '/nl/run', '/auth/login', '/openapi.json',
    ]) {
      assert.ok(doc.paths[r], `missing ${r}`);
    }
  });
});
