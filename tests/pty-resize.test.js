'use strict';
require('./jest-shim');

// (8.13) PTY resize helper + manager.resize(name, cols, rows)
// Extracts the static _clampResizeDims helper and the resize instance method
// from src/pty-manager.js via regex + new Function so the tests stay coupled
// to the real implementation without pulling node-pty. Same pattern as
// tests/worktree-gc.test.js and tests/cost-guard.test.js.

const fs = require('fs');
const path = require('path');

const PTY_MANAGER_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'pty-manager.js'),
  'utf8'
);

function extractStaticFn(name, regexParams, signatureParams) {
  const re = new RegExp(
    `  static ${name}\\(${regexParams}\\)\\s*\\{[\\s\\S]*?\\n  \\}`,
    'm'
  );
  const match = PTY_MANAGER_SRC.match(re);
  if (!match) throw new Error(`Could not locate static ${name} in pty-manager.js`);
  const header = new RegExp(`^  static ${name}\\(${regexParams}\\)\\s*\\{`);
  const body = match[0].replace(header, '').replace(/\n  \}$/, '');
  return new Function(`return function(${signatureParams}) {${body}\n};`)();
}

function extractInstanceMethod(name, regexParams, signatureParams) {
  const re = new RegExp(
    `  ${name}\\(${regexParams}\\)\\s*\\{[\\s\\S]*?\\n  \\}`,
    'm'
  );
  const match = PTY_MANAGER_SRC.match(re);
  if (!match) throw new Error(`Could not locate ${name} in pty-manager.js`);
  const header = new RegExp(`^  ${name}\\(${regexParams}\\)\\s*\\{`);
  const body = match[0].replace(header, '').replace(/\n  \}$/, '');
  return new Function(
    'PtyManager',
    `return function(${signatureParams}) {${body}\n};`
  );
}

const clampResizeDims = extractStaticFn('_clampResizeDims', 'cols, rows, limits', 'cols, rows, limits');
const resizeSrc = extractInstanceMethod('resize', 'name, cols, rows', 'name, cols, rows');

// Provide a fake PtyManager reference whose static helper is the extracted
// clamp function so the resize method can call PtyManager._clampResizeDims.
const fakeStatic = { _clampResizeDims: clampResizeDims };
const resizeFn = resizeSrc(fakeStatic);

describe('(8.13) _clampResizeDims', () => {
  test('clamps below the minimum', () => {
    const r = clampResizeDims(1, 1);
    expect(r.cols).toBe(20);
    expect(r.rows).toBe(5);
  });

  test('clamps above the maximum', () => {
    const r = clampResizeDims(10000, 10000);
    expect(r.cols).toBe(400);
    expect(r.rows).toBe(200);
  });

  test('accepts values inside the band', () => {
    const r = clampResizeDims(120, 40);
    expect(r.cols).toBe(120);
    expect(r.rows).toBe(40);
  });

  test('honors custom limits from config', () => {
    const r = clampResizeDims(50, 5, { minCols: 60, maxCols: 200, minRows: 10, maxRows: 100 });
    expect(r.cols).toBe(60);
    expect(r.rows).toBe(10);
  });

  test('coerces non-numeric input to the minimum', () => {
    const r = clampResizeDims('abc', null);
    expect(r.cols).toBe(20);
    expect(r.rows).toBe(5);
  });

  test('floors fractional input', () => {
    const r = clampResizeDims(100.9, 30.9);
    expect(r.cols).toBe(100);
    expect(r.rows).toBe(30);
  });
});

describe('(8.13) PtyManager.resize(name, cols, rows)', () => {
  function makeMgr(worker) {
    const workers = new Map();
    if (worker) workers.set(worker.name, worker);
    return { workers, config: {} };
  }

  test('returns error when worker is unknown', () => {
    const mgr = makeMgr();
    const r = resizeFn.call(mgr, 'missing', 120, 30);
    expect(r.error).toMatch(/not found/);
  });

  test('returns error when worker is dead', () => {
    const worker = { name: 'w', alive: false, proc: { resize: jest.fn() }, screen: { resize: jest.fn() } };
    const mgr = makeMgr(worker);
    const r = resizeFn.call(mgr, 'w', 120, 30);
    expect(r.error).toMatch(/not alive/);
  });

  test('calls proc.resize and screen.resize with clamped dims on success', () => {
    const procResize = jest.fn();
    const screenResize = jest.fn().mockReturnValue({ cols: 120, rows: 30 });
    const worker = { name: 'w', alive: true, proc: { resize: procResize }, screen: { resize: screenResize } };
    const mgr = makeMgr(worker);
    const r = resizeFn.call(mgr, 'w', 120, 30);
    expect(r.success).toBe(true);
    expect(r.cols).toBe(120);
    expect(r.rows).toBe(30);
    expect(procResize).toHaveBeenCalledWith(120, 30);
    expect(screenResize).toHaveBeenCalledWith(120, 30);
  });

  test('clamps out-of-range dims before forwarding to proc/screen', () => {
    const procResize = jest.fn();
    const screenResize = jest.fn();
    const worker = { name: 'w', alive: true, proc: { resize: procResize }, screen: { resize: screenResize } };
    const mgr = makeMgr(worker);
    const r = resizeFn.call(mgr, 'w', 1, 1);
    expect(r.cols).toBe(20);
    expect(r.rows).toBe(5);
    expect(procResize).toHaveBeenCalledWith(20, 5);
    expect(screenResize).toHaveBeenCalledWith(20, 5);
  });

  test('propagates node-pty resize failure as an error', () => {
    const procResize = jest.fn(() => { throw new Error('boom'); });
    const screenResize = jest.fn();
    const worker = { name: 'w', alive: true, proc: { resize: procResize }, screen: { resize: screenResize } };
    const mgr = makeMgr(worker);
    const r = resizeFn.call(mgr, 'w', 120, 30);
    expect(r.error).toMatch(/PTY resize failed/);
    expect(screenResize).not.toHaveBeenCalled();
  });

  test('skips proc.resize when the node-pty object lacks the method', () => {
    const screenResize = jest.fn();
    const worker = { name: 'w', alive: true, proc: {}, screen: { resize: screenResize } };
    const mgr = makeMgr(worker);
    const r = resizeFn.call(mgr, 'w', 120, 30);
    expect(r.success).toBe(true);
    expect(screenResize).toHaveBeenCalledWith(120, 30);
  });

  test('honors config.pty.min/max limits when clamping', () => {
    const procResize = jest.fn();
    const screenResize = jest.fn();
    const worker = { name: 'w', alive: true, proc: { resize: procResize }, screen: { resize: screenResize } };
    const mgr = { workers: new Map([['w', worker]]), config: { pty: { minCols: 80, maxCols: 100, minRows: 10, maxRows: 20 } } };
    const r = resizeFn.call(mgr, 'w', 50, 5);
    expect(r.cols).toBe(80);
    expect(r.rows).toBe(10);
  });
});

describe('(8.13) daemon /resize route wiring (source grep)', () => {
  const DAEMON_SRC = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'daemon.js'),
    'utf8'
  );

  test("declares POST /resize branch", () => {
    expect(DAEMON_SRC).toMatch(/route === '\/resize'/);
  });

  test('calls manager.resize with name/cols/rows', () => {
    expect(DAEMON_SRC).toMatch(/manager\.resize\(name, cols, rows\)/);
  });

  test('rejects missing params with a Missing error', () => {
    expect(DAEMON_SRC).toMatch(/Missing name, cols or rows/);
  });
});
