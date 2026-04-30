// Workflow templates store tests.

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PtyManager = require('../src/pty-manager');

let tmpDir;

function makeMgr() {
  const mgr = Object.create(PtyManager.prototype);
  mgr.config = {};
  mgr.logsDir = tmpDir;
  return mgr;
}

describe('workflow templates store', () => {
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-wftpl-')); });
  afterEach(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} });

  it('save → list → load round-trip', () => {
    const mgr = makeMgr();
    const wf = { name: 'demo', steps: [{ id: 'a', action: 'list' }] };
    const saved = mgr.saveWorkflowTemplate('demo', wf);
    assert.strictEqual(saved.success, true);
    const list = mgr.listWorkflowTemplates();
    assert.strictEqual(list.templates.length, 1);
    assert.strictEqual(list.templates[0].steps, 1);
    const loaded = mgr.loadWorkflowTemplate('demo');
    assert.deepStrictEqual(loaded.workflow, wf);
  });

  it('rejects invalid template name', () => {
    const mgr = makeMgr();
    const r = mgr.saveWorkflowTemplate('../etc/passwd', { steps: [] });
    assert.ok(r.error && /invalid template name/.test(r.error));
  });

  it('rejects non-array steps', () => {
    const mgr = makeMgr();
    const r = mgr.saveWorkflowTemplate('bad', { steps: 'oops' });
    assert.ok(r.error);
  });

  it('load returns error for missing template', () => {
    const mgr = makeMgr();
    assert.ok(mgr.loadWorkflowTemplate('nope').error);
  });

  it('delete removes the file', () => {
    const mgr = makeMgr();
    mgr.saveWorkflowTemplate('go', { steps: [{ id: 'x', action: 'list' }] });
    assert.strictEqual(mgr.deleteWorkflowTemplate('go').success, true);
    assert.strictEqual(mgr.listWorkflowTemplates().templates.length, 0);
  });
});
