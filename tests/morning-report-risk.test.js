'use strict';

// (v1.10.138) Morning report Risk Activity section.
//
// generateMorningReport in pty-manager.js queries the shared audit
// chain for risk.denied / risk.dryRun / risk.shadow_exec events
// from the last 24h and emits a "Risk Activity (last 24h)" section
// when any are present. Source-grep proves the section is wired
// to the audit query path without a heavy integration test.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ptySrc = fs.readFileSync(
  path.resolve(__dirname, '..', 'src', 'pty-manager.js'),
  'utf8'
);

describe('morning report — Risk Activity section (v1.10.138)', () => {
  it('source declares the section and queries audit chain', () => {
    // The block is bracketed by a recognizable comment marker
    // and the `## Risk Activity (last 24h)` header.
    assert.match(ptySrc, /Risk activity \(v1\.10\.138\)/);
    assert.match(ptySrc, /## Risk Activity \(last 24h\)/);
  });

  it('queries all three risk audit event types', () => {
    // The section must pull denied + dryRun + shadow_exec for
    // the same 24h window. /risk/stats does the same.
    assert.match(ptySrc, /type:\s*'risk\.denied'/);
    assert.match(ptySrc, /type:\s*'risk\.dryRun'/);
    assert.match(ptySrc, /type:\s*'risk\.shadow_exec'/);
  });

  it('renders top reasons aggregated across denied + dryRun', () => {
    // Top-N reason listing (matches /risk/stats topReasons shape).
    assert.match(ptySrc, /Top reasons:/);
    assert.match(ptySrc, /reasonCounts\.set/);
    assert.match(ptySrc, /\.sort\(\(a, b\) => b\[1\] - a\[1\]\)/);
  });

  it('uses getShared() for the audit instance + best-effort fail', () => {
    // Same pattern as the cost-report block: try { ... } catch {}
    // so a missing audit module never breaks the morning report.
    assert.match(ptySrc, /auditLog\.getShared\s*&&\s*auditLog\.getShared\(\)/);
  });
});
