'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

describe('schema-drift detector', () => {
  it('reports no drift on the current daemon.js + ROUTE_SCHEMAS', () => {
    const script = path.join(__dirname, '..', 'scripts', 'check-schema-drift.js');
    const result = spawnSync('node', [script], { encoding: 'utf8', timeout: 10000 });
    if (result.error) throw result.error;
    assert.equal(result.status, 0,
      `drift detected — fix schema OR handler:\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /No drift detected/);
  });
});
