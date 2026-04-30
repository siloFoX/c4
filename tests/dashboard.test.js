// Dashboard route unit tests (4.3)
'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('assert');
const http = require('http');

// We test renderDashboard logic by spinning up the daemon's handleRequest
// against a mock manager. To keep it isolated, we extract and test the
// rendering function directly by requiring daemon internals.
// Since daemon.js creates the server on require, we mock the dependencies.

// --- Lightweight integration: hit the real daemon handler ---

// Mock PtyManager that provides list()
function MockPtyManager() {
  this._workers = [];
  this._queued = [];
  this._lost = [];
  this._lastHealthCheck = null;
}
MockPtyManager.prototype.list = function () {
  return {
    workers: this._workers,
    queuedTasks: this._queued,
    lostWorkers: this._lost,
    lastHealthCheck: this._lastHealthCheck
  };
};
MockPtyManager.prototype.getConfig = function () { return { daemon: { port: 0 } }; };
MockPtyManager.prototype.setNotifications = function () {};
MockPtyManager.prototype.startHealthCheck = function () {};
MockPtyManager.prototype.stopHealthCheck = function () {};
MockPtyManager.prototype.closeAll = function () {};
MockPtyManager.prototype.on = function () {};
MockPtyManager.prototype.addSSEClient = function () {};
MockPtyManager.prototype.removeListener = function () {};

// Since daemon.js has side effects on require, we test the dashboard
// by making HTTP requests to a minimal server that replicates the route.

// Extract the two functions we need by reading daemon.js source
const fs = require('fs');
const path = require('path');
const daemonSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'daemon.js'), 'utf8');

// Extract escapeHtml and renderDashboard functions. Stop at the next
// non-render top-level declaration so we don't pick up later helpers that
// reference `require`/etc., which `new Function` evaluation can't resolve.
const fnMatch = daemonSrc.match(/(function escapeHtml[\s\S]*?\n\}\n)\s*\n(?:\/\/|const path)/);
const fnCode = fnMatch[1];
const mod = {};
const fn = new Function('module', 'exports', fnCode + '\nmodule.exports = { escapeHtml, renderDashboard };');
fn(mod, {});
const { escapeHtml, renderDashboard } = mod.exports;

describe('escapeHtml', () => {
  it('escapes & < > "', () => {
    assert.strictEqual(escapeHtml('a&b<c>d"e'), 'a&amp;b&lt;c&gt;d&quot;e');
  });

  it('returns empty string for non-string input', () => {
    assert.strictEqual(escapeHtml(null), '');
    assert.strictEqual(escapeHtml(undefined), '');
    assert.strictEqual(escapeHtml(123), '');
  });

  it('passes through safe strings unchanged', () => {
    assert.strictEqual(escapeHtml('hello world'), 'hello world');
  });
});

describe('renderDashboard', () => {
  it('returns valid HTML with DOCTYPE', () => {
    const html = renderDashboard({ workers: [], queuedTasks: [], lostWorkers: [] });
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.ok(html.includes('<title>C4 Dashboard</title>'));
    assert.ok(html.includes('</html>'));
  });

  it('shows "No active workers" when workers list is empty', () => {
    const html = renderDashboard({ workers: [], queuedTasks: [], lostWorkers: [] });
    assert.ok(html.includes('No active workers'));
  });

  it('renders worker rows', () => {
    const html = renderDashboard({
      workers: [
        {
          name: 'worker-1',
          status: 'busy',
          target: 'local',
          branch: 'c4/test',
          phase: 'edit',
          intervention: null,
          unreadSnapshots: 2,
          totalSnapshots: 5,
          pid: 1234
        }
      ],
      queuedTasks: [],
      lostWorkers: []
    });
    assert.ok(html.includes('worker-1'));
    assert.ok(html.includes('busy'));
    assert.ok(html.includes('c4/test'));
    assert.ok(html.includes('edit'));
    assert.ok(html.includes('2/5'));
    assert.ok(html.includes('1234'));
  });

  it('renders queued tasks section when queued tasks exist', () => {
    const html = renderDashboard({
      workers: [],
      queuedTasks: [
        { name: 'q-worker', branch: 'c4/q', after: 'dep-worker', task: 'do something' }
      ],
      lostWorkers: []
    });
    assert.ok(html.includes('Queued Tasks'));
    assert.ok(html.includes('q-worker'));
    assert.ok(html.includes('dep-worker'));
    assert.ok(html.includes('do something'));
  });

  it('does not render queued section when empty', () => {
    const html = renderDashboard({ workers: [], queuedTasks: [], lostWorkers: [] });
    assert.ok(!html.includes('Queued Tasks'));
  });

  it('renders lost workers section', () => {
    const html = renderDashboard({
      workers: [],
      queuedTasks: [],
      lostWorkers: [
        { name: 'lost-1', pid: 9999, branch: 'c4/lost', lostAt: '2026-04-04T10:00:00Z' }
      ]
    });
    assert.ok(html.includes('Lost Workers'));
    assert.ok(html.includes('lost-1'));
    assert.ok(html.includes('9999'));
  });

  it('does not render lost section when empty', () => {
    const html = renderDashboard({ workers: [], queuedTasks: [], lostWorkers: [] });
    assert.ok(!html.includes('Lost Workers'));
  });

  it('shows stats counts correctly', () => {
    const html = renderDashboard({
      workers: [
        { name: 'a', status: 'busy', target: 'local', branch: null, phase: null, intervention: null, unreadSnapshots: 0, totalSnapshots: 0, pid: 1 },
        { name: 'b', status: 'idle', target: 'local', branch: null, phase: null, intervention: null, unreadSnapshots: 0, totalSnapshots: 0, pid: 2 },
        { name: 'c', status: 'exited', target: 'local', branch: null, phase: null, intervention: null, unreadSnapshots: 0, totalSnapshots: 0, pid: null }
      ],
      queuedTasks: [{ name: 'q1', branch: null, after: null, task: 'x' }],
      lostWorkers: []
    });
    // 3 workers total, 1 busy, 1 idle, 1 exited, 1 queued
    assert.ok(html.includes('>3<'));
    assert.ok(html.includes('>1<'));
  });

  it('shows health check info when provided', () => {
    const ts = Date.now();
    const html = renderDashboard({
      workers: [],
      queuedTasks: [],
      lostWorkers: [],
      lastHealthCheck: ts
    });
    assert.ok(html.includes('Last health check'));
  });

  it('shows no health check message when not available', () => {
    const html = renderDashboard({
      workers: [],
      queuedTasks: [],
      lostWorkers: [],
      lastHealthCheck: null
    });
    assert.ok(html.includes('No health check yet'));
  });

  it('escapes XSS in worker names', () => {
    const html = renderDashboard({
      workers: [
        {
          name: '<script>alert(1)</script>',
          status: 'idle',
          target: 'local',
          branch: null,
          phase: null,
          intervention: null,
          unreadSnapshots: 0,
          totalSnapshots: 0,
          pid: null
        }
      ],
      queuedTasks: [],
      lostWorkers: []
    });
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('includes auto-refresh script', () => {
    const html = renderDashboard({ workers: [], queuedTasks: [], lostWorkers: [] });
    assert.ok(html.includes('setTimeout'));
    assert.ok(html.includes('30000'));
  });

  it('renders intervention state when present', () => {
    const html = renderDashboard({
      workers: [
        {
          name: 'w1',
          status: 'idle',
          target: 'local',
          branch: null,
          phase: null,
          intervention: 'question',
          unreadSnapshots: 0,
          totalSnapshots: 0,
          pid: 1
        }
      ],
      queuedTasks: [],
      lostWorkers: []
    });
    assert.ok(html.includes('question'));
  });

  it('is responsive with viewport meta tag', () => {
    const html = renderDashboard({ workers: [], queuedTasks: [], lostWorkers: [] });
    assert.ok(html.includes('viewport'));
    assert.ok(html.includes('width=device-width'));
  });
});
