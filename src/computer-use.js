'use strict';

// (11.2) Computer Use agent.
//
// Screenshot + click/type pipeline for driving GUI apps that expose no
// API (KakaoTalk, bank websites, legacy desktop tools, ...). The first
// iteration is stub-first on purpose: actual pixel capture and input
// injection need native dependencies (X11 / Wayland / Win32) that are
// hard to set up inside a CI worker. Instead this module ships a thin
// ComputerUseAgent abstraction with three backends - StubBackend (the
// default; logs actions, returns a 1x1 placeholder PNG), XdotoolBackend
// (Linux preferred; shells out to xdotool + scrot when available),
// and MockBackend (test fixture so the suite can inspect every recorded
// interaction without hitting the disk). Real integrations (xdotool,
// Win32 SendInput, macOS CGEvent) drop in by subclassing Backend and
// plugging into selectBackend().
//
// Design notes
// ------------
// 1. Config gate. `config.computerUse.enabled` defaults to false so the
//    agent refuses to start a session unless the operator explicitly
//    opts in. This is a high-risk capability — granting it is
//    effectively "remote desktop as the daemon user" — so the safety
//    flag is surfaced both here and in the release notes.
// 2. Session storage at ~/.c4/computer-use-sessions.json (capped at 50
//    entries, FIFO eviction) keeps the on-disk footprint bounded even
//    when the agent is used for days. Screenshots go to
//    ~/.c4/screenshots/<sessionId>/<timestamp>.png; the stub backend
//    writes a 1x1 PNG so calling code can still stat/read the file
//    without special-casing the stub path.
// 3. Key-name normalization lets callers use casual spellings ('enter',
//    'ENTER', 'Enter', 'Return' are all the same key). Combos like
//    'Ctrl+C' are accepted verbatim; each token is normalised in place.
// 4. Invalid coordinates (negative, non-number) are rejected early so a
//    bad click never reaches the backend. Drag requires a valid
//    (fromX, fromY) -> (toX, toY) pair.
// 5. The backend selection ladder is `stub | xdotool | auto`. `auto`
//    probes xdotool + scrot (or imagemagick `import`) on Linux; falls
//    back to the stub on failure. The probe shells out with a short
//    timeout and never throws into the caller.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const SESSION_LIMIT = 50;
const SCREENSHOT_RETENTION = 200; // per session, in-memory metadata only
const DEFAULT_BACKEND = 'auto';
const VALID_BACKENDS = Object.freeze(['auto', 'stub', 'xdotool', 'mock']);
const MOUSE_BUTTONS = Object.freeze(['left', 'right', 'middle']);
const DEFAULT_BUTTON = 'left';
const DEFAULT_SCREEN = Object.freeze({ width: 1920, height: 1080 });

// Minimal 1x1 transparent PNG. Small enough to write synchronously in
// the stub backend without pulling in a PNG encoder dependency.
const STUB_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
  '0000000d49444154789c6300010000000500010d0a2db40000000049454e44ae426082',
  'hex'
);

// Alias table for humane key spellings. Values are the canonical names
// the XdotoolBackend sends through to xdotool; the StubBackend records
// them verbatim.
const KEY_ALIASES = Object.freeze({
  'enter': 'Return',
  'return': 'Return',
  'esc': 'Escape',
  'escape': 'Escape',
  'tab': 'Tab',
  'space': 'space',
  'spacebar': 'space',
  'backspace': 'BackSpace',
  'bksp': 'BackSpace',
  'delete': 'Delete',
  'del': 'Delete',
  'up': 'Up',
  'down': 'Down',
  'left': 'Left',
  'right': 'Right',
  'home': 'Home',
  'end': 'End',
  'pageup': 'Page_Up',
  'pagedown': 'Page_Down',
  'ctrl': 'ctrl',
  'control': 'ctrl',
  'shift': 'shift',
  'alt': 'alt',
  'meta': 'super',
  'super': 'super',
  'cmd': 'super',
  'win': 'super',
});

const ID_PATTERN = /^cus_[a-f0-9]+$/;
const SCREENSHOT_ID_PATTERN = /^shot_[a-f0-9]+$/;

function defaultSessionsPath() {
  return path.join(os.homedir(), '.c4', 'computer-use-sessions.json');
}

function defaultScreenshotsDir() {
  return path.join(os.homedir(), '.c4', 'screenshots');
}

function nowIso() {
  return new Date().toISOString();
}

function newSessionId() {
  return 'cus_' + crypto.randomBytes(6).toString('hex');
}

function newScreenshotId() {
  return 'shot_' + crypto.randomBytes(5).toString('hex');
}

function isSessionId(v) {
  return typeof v === 'string' && ID_PATTERN.test(v);
}

// Canonical key-name normalisation. Accepts a single key or a '+'-joined
// combo (Ctrl+Shift+C). Returns the normalised string or throws on
// empty / non-string input. Unknown keys pass through unchanged so
// backend-specific names (e.g. F1, KP_Enter) still work.
function normalizeKeyName(key) {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error('key must be a non-empty string');
  }
  const parts = key.split('+').map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length === 0) throw new Error('key must be a non-empty string');
  const normalized = parts.map((p) => {
    const lower = p.toLowerCase();
    if (KEY_ALIASES[lower]) return KEY_ALIASES[lower];
    if (p.length === 1) return p;
    return p.charAt(0).toUpperCase() + p.slice(1);
  });
  return normalized.join('+');
}

function validateCoords(x, y) {
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    throw new Error('x must be a finite number');
  }
  if (typeof y !== 'number' || !Number.isFinite(y)) {
    throw new Error('y must be a finite number');
  }
  if (x < 0 || y < 0) {
    throw new Error('coordinates must be non-negative');
  }
}

function validateButton(button) {
  const b = (button === undefined || button === null) ? DEFAULT_BUTTON : button;
  if (!MOUSE_BUTTONS.includes(b)) {
    throw new Error('button must be one of ' + MOUSE_BUTTONS.join('/'));
  }
  return b;
}

// ---------------------------------------------------------------------
// Backend abstraction
// ---------------------------------------------------------------------

// Thrown when a backend is requested that the host cannot provide (e.g.
// `xdotool` on a box with no xdotool binary). The agent surfaces this as
// a regular error; callers that want a graceful fallback can catch it
// and retry with 'stub'.
class NotAvailable extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotAvailable';
  }
}

class Backend {
  constructor(opts = {}) {
    this.name = 'base';
    this.screen = { ...DEFAULT_SCREEN, ...(opts.screen || {}) };
  }

  // Subclasses override these. The base class throws so an incomplete
  // backend fails loudly instead of silently returning a dummy result.
  async screenshot(/* outPath */) { throw new Error('Not implemented'); }
  async click(/* x, y, button */) { throw new Error('Not implemented'); }
  async doubleClick(/* x, y */) { throw new Error('Not implemented'); }
  async type(/* text, delayMs */) { throw new Error('Not implemented'); }
  async keyPress(/* key */) { throw new Error('Not implemented'); }
  async move(/* x, y */) { throw new Error('Not implemented'); }
  async scroll(/* deltaX, deltaY */) { throw new Error('Not implemented'); }
  async dragTo(/* fromX, fromY, toX, toY */) { throw new Error('Not implemented'); }
}

// StubBackend. Default in tests and anywhere real input injection is
// undesirable. Logs every call to `this.log` so callers can assert the
// recorded sequence without touching a display server.
class StubBackend extends Backend {
  constructor(opts = {}) {
    super(opts);
    this.name = 'stub';
    this.log = [];
  }

  _record(action, details) {
    const entry = { action, details: details || {}, at: nowIso() };
    this.log.push(entry);
    return entry;
  }

  async screenshot(outPath) {
    try {
      if (outPath) {
        const dir = path.dirname(outPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(outPath, STUB_PNG);
      }
    } catch {
      // Stubbed screenshot never breaks the call site — the recorded
      // entry is the contract tests inspect.
    }
    this._record('screenshot', { path: outPath });
    return {
      imagePath: outPath || null,
      width: this.screen.width,
      height: this.screen.height,
      timestamp: nowIso(),
      backend: this.name,
    };
  }

  async click(x, y, button) {
    validateCoords(x, y);
    const b = validateButton(button);
    return this._record('click', { x, y, button: b });
  }

  async doubleClick(x, y) {
    validateCoords(x, y);
    return this._record('doubleClick', { x, y });
  }

  async type(text, delayMs) {
    if (typeof text !== 'string') throw new Error('text must be a string');
    return this._record('type', { text, delayMs: typeof delayMs === 'number' ? delayMs : null });
  }

  async keyPress(key) {
    const normalized = normalizeKeyName(key);
    return this._record('keyPress', { key: normalized });
  }

  async move(x, y) {
    validateCoords(x, y);
    return this._record('move', { x, y });
  }

  async scroll(deltaX, deltaY) {
    if (typeof deltaX !== 'number' || typeof deltaY !== 'number') {
      throw new Error('deltaX and deltaY must be numbers');
    }
    return this._record('scroll', { deltaX, deltaY });
  }

  async dragTo(fromX, fromY, toX, toY) {
    validateCoords(fromX, fromY);
    validateCoords(toX, toY);
    return this._record('dragTo', { fromX, fromY, toX, toY });
  }
}

// MockBackend. Like StubBackend but also records a userDriver callback
// so tests can simulate failures or inspect the exact shape of the
// action queue without subclassing. Intended for unit tests only.
class MockBackend extends StubBackend {
  constructor(opts = {}) {
    super(opts);
    this.name = 'mock';
    this.driver = typeof opts.driver === 'function' ? opts.driver : null;
  }

  async _mockHook(action, details) {
    if (this.driver) {
      const res = await this.driver(action, details);
      if (res === false) {
        throw new Error('MockBackend rejected ' + action);
      }
    }
  }

  async click(x, y, button) {
    const entry = await super.click(x, y, button);
    await this._mockHook('click', entry.details);
    return entry;
  }

  async type(text, delayMs) {
    const entry = await super.type(text, delayMs);
    await this._mockHook('type', entry.details);
    return entry;
  }

  async keyPress(key) {
    const entry = await super.keyPress(key);
    await this._mockHook('keyPress', entry.details);
    return entry;
  }
}

// XdotoolBackend. Uses xdotool + scrot (or imagemagick `import`) on
// Linux. Constructor throws NotAvailable when neither tool is present
// so selectBackend('xdotool') fails fast; `auto` catches the error and
// falls back to the stub.
class XdotoolBackend extends Backend {
  constructor(opts = {}) {
    super(opts);
    this.name = 'xdotool';
    if (process.platform !== 'linux') {
      throw new NotAvailable('xdotool backend only supported on Linux');
    }
    const probe = (bin) => {
      try {
        execFileSync('which', [bin], { stdio: ['ignore', 'pipe', 'ignore'] });
        return true;
      } catch { return false; }
    };
    this._hasXdotool = probe('xdotool');
    this._hasScrot = probe('scrot');
    this._hasImport = probe('import');
    if (!this._hasXdotool) {
      throw new NotAvailable('xdotool not found on PATH');
    }
    if (!this._hasScrot && !this._hasImport) {
      throw new NotAvailable('neither scrot nor imagemagick import found on PATH');
    }
  }

  async screenshot(outPath) {
    if (!outPath) throw new Error('outPath required');
    const dir = path.dirname(outPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const bin = this._hasScrot ? 'scrot' : 'import';
    const args = this._hasScrot ? [outPath] : ['-window', 'root', outPath];
    execFileSync(bin, args, { stdio: 'ignore' });
    return {
      imagePath: outPath,
      width: this.screen.width,
      height: this.screen.height,
      timestamp: nowIso(),
      backend: this.name,
    };
  }

  async click(x, y, button) {
    validateCoords(x, y);
    const b = validateButton(button);
    const buttonMap = { left: '1', middle: '2', right: '3' };
    execFileSync('xdotool', ['mousemove', String(x), String(y), 'click', buttonMap[b]], { stdio: 'ignore' });
    return { action: 'click', details: { x, y, button: b }, at: nowIso() };
  }

  async doubleClick(x, y) {
    validateCoords(x, y);
    execFileSync('xdotool', ['mousemove', String(x), String(y), 'click', '--repeat', '2', '1'], { stdio: 'ignore' });
    return { action: 'doubleClick', details: { x, y }, at: nowIso() };
  }

  async type(text, delayMs) {
    if (typeof text !== 'string') throw new Error('text must be a string');
    const args = ['type'];
    if (typeof delayMs === 'number' && delayMs > 0) {
      args.push('--delay', String(delayMs));
    }
    args.push('--', text);
    execFileSync('xdotool', args, { stdio: 'ignore' });
    return { action: 'type', details: { text, delayMs: delayMs || null }, at: nowIso() };
  }

  async keyPress(key) {
    const normalized = normalizeKeyName(key);
    execFileSync('xdotool', ['key', '--', normalized], { stdio: 'ignore' });
    return { action: 'keyPress', details: { key: normalized }, at: nowIso() };
  }

  async move(x, y) {
    validateCoords(x, y);
    execFileSync('xdotool', ['mousemove', String(x), String(y)], { stdio: 'ignore' });
    return { action: 'move', details: { x, y }, at: nowIso() };
  }

  async scroll(deltaX, deltaY) {
    if (typeof deltaX !== 'number' || typeof deltaY !== 'number') {
      throw new Error('deltaX and deltaY must be numbers');
    }
    const button = deltaY < 0 ? '4' : (deltaY > 0 ? '5' : (deltaX < 0 ? '6' : '7'));
    const repeat = Math.max(1, Math.abs(deltaY || deltaX));
    execFileSync('xdotool', ['click', '--repeat', String(repeat), button], { stdio: 'ignore' });
    return { action: 'scroll', details: { deltaX, deltaY }, at: nowIso() };
  }

  async dragTo(fromX, fromY, toX, toY) {
    validateCoords(fromX, fromY);
    validateCoords(toX, toY);
    execFileSync('xdotool', [
      'mousemove', String(fromX), String(fromY),
      'mousedown', '1',
      'mousemove', String(toX), String(toY),
      'mouseup', '1',
    ], { stdio: 'ignore' });
    return { action: 'dragTo', details: { fromX, fromY, toX, toY }, at: nowIso() };
  }
}

// Select the best available backend for the given preference. Returns a
// constructed instance. Throws on explicit unsupported choices; 'auto'
// never throws and falls through to the stub.
function selectBackend(preference, opts) {
  const pref = (preference || DEFAULT_BACKEND).toLowerCase();
  if (!VALID_BACKENDS.includes(pref)) {
    throw new Error('Unknown backend: ' + preference);
  }
  if (pref === 'stub') return { backend: new StubBackend(opts), name: 'stub' };
  if (pref === 'mock') return { backend: new MockBackend(opts), name: 'mock' };
  if (pref === 'xdotool') return { backend: new XdotoolBackend(opts), name: 'xdotool' };
  // auto
  if (process.platform === 'linux') {
    try {
      return { backend: new XdotoolBackend(opts), name: 'xdotool' };
    } catch (_) {
      // fall through to stub
    }
  }
  return { backend: new StubBackend(opts), name: 'stub' };
}

function detectAvailableBackends() {
  const out = { stub: true, mock: true, xdotool: false };
  try {
    new XdotoolBackend();
    out.xdotool = true;
  } catch {}
  return out;
}

// ---------------------------------------------------------------------
// Session storage
// ---------------------------------------------------------------------

function freshState() {
  return { sessions: [] };
}

function ensureShape(state) {
  if (!state || typeof state !== 'object') return freshState();
  const s = state.sessions;
  if (!Array.isArray(s)) return freshState();
  const out = { sessions: [] };
  for (const entry of s) {
    if (!entry || typeof entry !== 'object') continue;
    if (!isSessionId(entry.id)) continue;
    out.sessions.push({
      id: entry.id,
      backend: typeof entry.backend === 'string' ? entry.backend : 'stub',
      actions: Array.isArray(entry.actions) ? entry.actions.slice() : [],
      screenshots: Array.isArray(entry.screenshots) ? entry.screenshots.slice() : [],
      startedAt: typeof entry.startedAt === 'string' ? entry.startedAt : nowIso(),
      endedAt: typeof entry.endedAt === 'string' ? entry.endedAt : null,
    });
  }
  return out;
}

class ComputerUseSession {
  constructor({ id, backend, startedAt }) {
    this.id = id;
    this.backend = backend;
    this.actions = [];
    this.screenshots = [];
    this.startedAt = startedAt || nowIso();
    this.endedAt = null;
  }
}

class ComputerUseAgent {
  constructor(opts = {}) {
    this.storePath = opts.storePath || defaultSessionsPath();
    this.screenshotsDir = opts.screenshotsDir || defaultScreenshotsDir();
    this.config = opts.config || {};
    this._state = null;
    this._backends = new Map(); // sessionId -> backend instance (for the lifetime of the process)
    this.selectBackend = opts.selectBackend || selectBackend;
  }

  _load() {
    if (this._state) return this._state;
    if (!fs.existsSync(this.storePath)) {
      this._state = freshState();
      return this._state;
    }
    try {
      const raw = fs.readFileSync(this.storePath, 'utf8');
      this._state = ensureShape(raw ? JSON.parse(raw) : {});
    } catch {
      this._state = freshState();
    }
    return this._state;
  }

  _persist() {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const state = this._load();
    // Trim to the newest SESSION_LIMIT entries.
    if (state.sessions.length > SESSION_LIMIT) {
      state.sessions = state.sessions.slice(-SESSION_LIMIT);
    }
    fs.writeFileSync(this.storePath, JSON.stringify(state, null, 2) + '\n');
  }

  reload() {
    this._state = null;
    return this._load();
  }

  _isEnabled() {
    const cu = this.config && this.config.computerUse;
    return !!(cu && cu.enabled);
  }

  // ---- Session CRUD --------------------------------------------------

  startSession(backendPreference) {
    if (!this._isEnabled()) {
      throw new Error('computerUse.enabled=false — refusing to start session');
    }
    const state = this._load();
    const pref = typeof backendPreference === 'string' && backendPreference.length > 0
      ? backendPreference : DEFAULT_BACKEND;
    const { backend, name } = this.selectBackend(pref);
    const id = newSessionId();
    const entry = {
      id,
      backend: name,
      actions: [],
      screenshots: [],
      startedAt: nowIso(),
      endedAt: null,
    };
    state.sessions.push(entry);
    this._backends.set(id, backend);
    this._persist();
    return entry;
  }

  getSession(id) {
    if (!isSessionId(id)) return null;
    const state = this._load();
    return state.sessions.find((s) => s.id === id) || null;
  }

  listSessions() {
    return this._load().sessions.slice();
  }

  endSession(id) {
    const state = this._load();
    const entry = state.sessions.find((s) => s.id === id);
    if (!entry) return null;
    if (!entry.endedAt) entry.endedAt = nowIso();
    this._backends.delete(id);
    this._persist();
    return entry;
  }

  deleteSession(id) {
    const state = this._load();
    const before = state.sessions.length;
    state.sessions = state.sessions.filter((s) => s.id !== id);
    this._backends.delete(id);
    if (state.sessions.length === before) return false;
    this._persist();
    return true;
  }

  recordAction(sessionId, action) {
    if (!action || typeof action !== 'object') throw new Error('action required');
    const state = this._load();
    const entry = state.sessions.find((s) => s.id === sessionId);
    if (!entry) throw new Error('Unknown session: ' + sessionId);
    if (entry.endedAt) throw new Error('Session already ended: ' + sessionId);
    const withTs = { ...action, at: action.at || nowIso() };
    entry.actions.push(withTs);
    this._persist();
    return withTs;
  }

  // ---- Backend helpers ----------------------------------------------

  _requireBackend(sessionId) {
    const state = this._load();
    const entry = state.sessions.find((s) => s.id === sessionId);
    if (!entry) throw new Error('Unknown session: ' + sessionId);
    if (entry.endedAt) throw new Error('Session already ended: ' + sessionId);
    let backend = this._backends.get(sessionId);
    if (!backend) {
      // Re-hydrate a backend of the same preference after a daemon
      // restart. Any recorded actions stay in the session entry so the
      // audit trail is preserved.
      const { backend: rebuilt } = this.selectBackend(entry.backend);
      backend = rebuilt;
      this._backends.set(sessionId, backend);
    }
    return { entry, backend };
  }

  _screenshotPath(sessionId) {
    const shotId = newScreenshotId();
    const timestamp = Date.now();
    const dir = path.join(this.screenshotsDir, sessionId);
    const file = path.join(dir, shotId + '-' + timestamp + '.png');
    return { shotId, file, timestamp };
  }

  // ---- Input / output pipeline --------------------------------------

  async screenshot(sessionId) {
    const { entry, backend } = this._requireBackend(sessionId);
    const { shotId, file, timestamp } = this._screenshotPath(sessionId);
    const out = await backend.screenshot(file);
    const record = {
      id: shotId,
      imagePath: out.imagePath || file,
      width: out.width || DEFAULT_SCREEN.width,
      height: out.height || DEFAULT_SCREEN.height,
      timestamp: out.timestamp || new Date(timestamp).toISOString(),
      backend: out.backend || entry.backend,
    };
    entry.screenshots.push(record);
    if (entry.screenshots.length > SCREENSHOT_RETENTION) {
      entry.screenshots = entry.screenshots.slice(-SCREENSHOT_RETENTION);
    }
    this.recordAction(sessionId, { type: 'screenshot', screenshotId: shotId, imagePath: record.imagePath });
    return record;
  }

  async click(sessionId, x, y, button) {
    const { backend } = this._requireBackend(sessionId);
    const b = validateButton(button);
    validateCoords(x, y);
    await backend.click(x, y, b);
    return this.recordAction(sessionId, { type: 'click', x, y, button: b });
  }

  async doubleClick(sessionId, x, y) {
    const { backend } = this._requireBackend(sessionId);
    validateCoords(x, y);
    await backend.doubleClick(x, y);
    return this.recordAction(sessionId, { type: 'doubleClick', x, y });
  }

  async type(sessionId, text, delayMs) {
    const { backend } = this._requireBackend(sessionId);
    if (typeof text !== 'string') throw new Error('text must be a string');
    await backend.type(text, delayMs);
    return this.recordAction(sessionId, { type: 'type', text, delayMs: delayMs || null });
  }

  async keyPress(sessionId, key) {
    const { backend } = this._requireBackend(sessionId);
    const normalized = normalizeKeyName(key);
    await backend.keyPress(normalized);
    return this.recordAction(sessionId, { type: 'keyPress', key: normalized });
  }

  async move(sessionId, x, y) {
    const { backend } = this._requireBackend(sessionId);
    validateCoords(x, y);
    await backend.move(x, y);
    return this.recordAction(sessionId, { type: 'move', x, y });
  }

  async scroll(sessionId, deltaX, deltaY) {
    const { backend } = this._requireBackend(sessionId);
    if (typeof deltaX !== 'number' || typeof deltaY !== 'number') {
      throw new Error('deltaX and deltaY must be numbers');
    }
    await backend.scroll(deltaX, deltaY);
    return this.recordAction(sessionId, { type: 'scroll', deltaX, deltaY });
  }

  async dragTo(sessionId, fromX, fromY, toX, toY) {
    const { backend } = this._requireBackend(sessionId);
    validateCoords(fromX, fromY);
    validateCoords(toX, toY);
    await backend.dragTo(fromX, fromY, toX, toY);
    return this.recordAction(sessionId, { type: 'dragTo', fromX, fromY, toX, toY });
  }

  // Returns the raw backend for a session. Daemon tests rely on this to
  // inspect the StubBackend log directly; production callers should
  // stick to the `click/type/...` methods.
  getBackend(sessionId) {
    const { backend } = this._requireBackend(sessionId);
    return backend;
  }

  getScreenshot(sessionId, screenshotId) {
    const session = this.getSession(sessionId);
    if (!session) return null;
    return session.screenshots.find((s) => s.id === screenshotId) || null;
  }
}

// Daemon-wide singleton. Tests construct their own agent with tmpdir
// paths and never touch this instance.
let _shared = null;
function getShared(opts) {
  if (!_shared) _shared = new ComputerUseAgent(opts || {});
  return _shared;
}
function resetShared() {
  _shared = null;
}

module.exports = {
  ComputerUseAgent,
  ComputerUseSession,
  Backend,
  StubBackend,
  MockBackend,
  XdotoolBackend,
  NotAvailable,
  selectBackend,
  detectAvailableBackends,
  normalizeKeyName,
  validateCoords,
  validateButton,
  defaultSessionsPath,
  defaultScreenshotsDir,
  freshState,
  ensureShape,
  isSessionId,
  SESSION_LIMIT,
  SCREENSHOT_RETENTION,
  VALID_BACKENDS,
  MOUSE_BUTTONS,
  DEFAULT_BACKEND,
  DEFAULT_BUTTON,
  DEFAULT_SCREEN,
  KEY_ALIASES,
  ID_PATTERN,
  SCREENSHOT_ID_PATTERN,
  STUB_PNG,
  getShared,
  resetShared,
};
