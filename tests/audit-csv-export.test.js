// Excel-friendly CSV export tests for AuditLogger.exportCsv.

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { AuditLogger } = require('../src/audit-log');

let tmpDir, logPath;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-audit-csv-'));
  logPath = path.join(tmpDir, 'audit.jsonl');
});
afterEach(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} });

describe('AuditLogger.exportCsv', () => {
  it('emits header + rows with UTF-8 BOM + CRLF by default', () => {
    const a = new AuditLogger({ logPath });
    a.record('worker.created', { name: 'w1' }, { target: 'w1' });
    a.record('task.sent', { description: 'first task' }, { target: 'w1' });
    const out = a.exportCsv();
    assert.strictEqual(out.contentType, 'text/csv; charset=utf-8');
    assert.strictEqual(out.body.charCodeAt(0), 0xFEFF, 'starts with UTF-8 BOM');
    const trimmed = out.body.slice(1).trimEnd();
    const lines = trimmed.split('\r\n');
    assert.strictEqual(lines[0], 'timestamp,type,actor,target,detailsKeys,hash');
    assert.strictEqual(lines.length, 3);
    assert.match(lines[1], /worker\.created/);
    assert.match(lines[2], /task\.sent/);
  });

  it('opts out of BOM + CRLF when requested', () => {
    const a = new AuditLogger({ logPath });
    a.record('worker.created', { name: 'w1' }, { target: 'w1' });
    const out = a.exportCsv({}, { bom: false, lineEnd: '\n' });
    assert.notStrictEqual(out.body.charCodeAt(0), 0xFEFF, 'BOM omitted');
    assert.ok(!out.body.includes('\r\n'), 'no CRLF');
    const lines = out.body.trim().split('\n');
    assert.strictEqual(lines[0], 'timestamp,type,actor,target,detailsKeys,hash');
  });

  it('encodes Korean text correctly with UTF-8 BOM', () => {
    const a = new AuditLogger({ logPath, actor: '관리자' });
    a.record('worker.created', { description: '한글 설명' }, { target: '워커-1' });
    const out = a.exportCsv();
    assert.ok(out.body.includes('관리자'));
    assert.ok(out.body.includes('워커-1'));
    assert.strictEqual(out.body.charCodeAt(0), 0xFEFF);
  });

  it('quotes commas / newlines / quotes safely', () => {
    const a = new AuditLogger({ logPath });
    a.record('approval.granted', { reason: 'line1\nline2' }, { target: 'has,comma' });
    const out = a.exportCsv();
    assert.match(out.body, /"has,comma"/);
  });

  it('honors filters (type / target / limit)', () => {
    const a = new AuditLogger({ logPath });
    a.record('worker.created', {}, { target: 'a' });
    a.record('worker.created', {}, { target: 'b' });
    a.record('task.sent', {}, { target: 'a' });
    const out = a.exportCsv({ type: 'worker.created' });
    const rows = out.body.slice(1).trimEnd().split('\r\n').slice(1);
    assert.strictEqual(rows.length, 2);
    rows.forEach((r) => assert.match(r, /worker\.created/));
  });

  // (review fix 2026-05-01) Source must use the explicit
  // escape, not a literal BOM byte sequence. Editors / lint tools
  // can silently strip / mangle the bare BOM, and a future drop
  // of the BOM bytes would only show up at runtime when Excel
  // displays Korean text as garbled characters.
  it('source uses the \\uFEFF escape, not a literal BOM byte', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'audit-log.js'));
    // Find the prefix line bytes around `const prefix = bom`.
    const idx = src.indexOf(Buffer.from('const prefix = bom'));
    assert.notStrictEqual(idx, -1, 'prefix declaration not found in audit-log.js');
    const slice = src.slice(idx, idx + 80).toString('utf8');
    assert.match(slice, /\\uFEFF/);
    // And the bare BOM byte sequence (EF BB BF) MUST NOT appear in
    // the line itself — the literal would defeat the escape.
    const lineBytes = src.slice(idx, idx + 80);
    assert.strictEqual(
      lineBytes.includes(Buffer.from([0xEF, 0xBB, 0xBF])),
      false,
      'literal BOM bytes should not appear in source',
    );
  });
});
