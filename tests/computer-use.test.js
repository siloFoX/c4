// (11.2) Computer Use agent tests.
//
// Exercises src/computer-use.js against tmpdir-backed stores so the
// suite never writes to the operator's real ~/.c4/computer-use-sessions.json
// or ~/.c4/screenshots. All tests use StubBackend - no real input
// events are ever injected.
//
// Coverage targets:
//  - Backend selection ('auto' prefers xdotool when available, falls
//    back to stub; explicit 'stub' + 'mock' always succeed; explicit
//    'xdotool' throws NotAvailable when the binary is missing)
//  - startSession records backend name + config gate when
//    computerUse.enabled is false rejects
//  - click/type/keyPress/screenshot/move/scroll/dragTo record actions
//  - StubBackend logs every action to its in-memory log
//  - Session CRUD (start/get/list/end/delete + persistence roundtrip)
//  - Screenshot path generation under screenshotsDir/<sessionId>/
//  - Coordinate validation rejects negative / non-number / NaN
//  - Key name normalisation (enter, ESC, ctrl+c, unknown keys pass through)
//  - Config.computerUse.enabled=false refuses startSession
//  - RBAC gate: COMPUTER_USE action is the single decision point
//  - Persistence trim to SESSION_LIMIT
//  - Malformed store falls back to freshState

'use strict';
require('./jest-shim');

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ComputerUseAgent,
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
  VALID_BACKENDS,
  MOUSE_BUTTONS,
  DEFAULT_BACKEND,
  DEFAULT_BUTTON,
  KEY_ALIASES,
  STUB_PNG,
  getShared,
  resetShared,
} = require('../src/computer-use');

const { RoleManager, ACTIONS, ALL_ACTIONS } = require('../src/rbac');

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'c4-computer-use-'));
}

function newAgent({ enabled = true, backend } = {}) {
  const dir = mkTmpDir();
  const opts = {
    storePath: path.join(dir, 'sessions.json'),
    screenshotsDir: path.join(dir, 'screenshots'),
    config: { computerUse: { enabled } },
  };
  if (backend) opts.selectBackend = (pref) => selectBackend(pref === 'auto' ? backend : pref);
  return new ComputerUseAgent(opts);
}

describe('(11.2) computer-use helpers', () => {
  test('(a) defaultSessionsPath/defaultScreenshotsDir resolve under homedir/.c4/', () => {
    const p = defaultSessionsPath();
    expect(p.endsWith(path.join('.c4', 'computer-use-sessions.json'))).toBe(true);
    expect(p.startsWith(os.homedir())).toBe(true);
    const s = defaultScreenshotsDir();
    expect(s.endsWith(path.join('.c4', 'screenshots'))).toBe(true);
  });

  test('(b) VALID_BACKENDS lists the four supported backends', () => {
    expect(VALID_BACKENDS.includes('auto')).toBe(true);
    expect(VALID_BACKENDS.includes('stub')).toBe(true);
    expect(VALID_BACKENDS.includes('xdotool')).toBe(true);
    expect(VALID_BACKENDS.includes('mock')).toBe(true);
    expect(VALID_BACKENDS.length).toBe(4);
    expect(DEFAULT_BACKEND).toBe('auto');
  });

  test('(c) MOUSE_BUTTONS + DEFAULT_BUTTON', () => {
    expect(MOUSE_BUTTONS).toEqual(['left', 'right', 'middle']);
    expect(DEFAULT_BUTTON).toBe('left');
  });

  test('(d) KEY_ALIASES cover common casual spellings', () => {
    expect(KEY_ALIASES['enter']).toBe('Return');
    expect(KEY_ALIASES['return']).toBe('Return');
    expect(KEY_ALIASES['esc']).toBe('Escape');
    expect(KEY_ALIASES['escape']).toBe('Escape');
    expect(KEY_ALIASES['tab']).toBe('Tab');
    expect(KEY_ALIASES['space']).toBe('space');
    expect(KEY_ALIASES['backspace']).toBe('BackSpace');
    expect(KEY_ALIASES['ctrl']).toBe('ctrl');
  });

  test('(e) isSessionId validator', () => {
    expect(isSessionId('cus_abcdef')).toBe(true);
    expect(isSessionId('cus_' + 'a'.repeat(12))).toBe(true);
    expect(isSessionId('cus_')).toBe(false);
    expect(isSessionId('session_abcdef')).toBe(false);
    expect(isSessionId('')).toBe(false);
    expect(isSessionId(null)).toBe(false);
    expect(isSessionId(42)).toBe(false);
  });

  test('(f) STUB_PNG is a valid PNG signature', () => {
    expect(Buffer.isBuffer(STUB_PNG)).toBe(true);
    expect(STUB_PNG.length).toBeGreaterThan(40);
    // PNG magic bytes 89 50 4E 47 0D 0A 1A 0A
    expect(STUB_PNG[0]).toBe(0x89);
    expect(STUB_PNG[1]).toBe(0x50);
    expect(STUB_PNG[2]).toBe(0x4E);
    expect(STUB_PNG[3]).toBe(0x47);
  });

  test('(g) freshState and ensureShape repair malformed input', () => {
    const s = freshState();
    expect(Array.isArray(s.sessions)).toBe(true);
    expect(s.sessions.length).toBe(0);
    // garbage input falls back to fresh state
    const e1 = ensureShape(null);
    expect(e1.sessions).toEqual([]);
    const e2 = ensureShape({ sessions: 'not-an-array' });
    expect(e2.sessions).toEqual([]);
    // invalid entries are dropped; valid ones survive
    const e3 = ensureShape({ sessions: [
      { id: 'cus_abcdef01', backend: 'stub', actions: [], screenshots: [], startedAt: '2026-04-18T00:00:00Z', endedAt: null },
      { id: 'not-a-cus-id', backend: 'stub' },
      'garbage',
      null,
    ]});
    expect(e3.sessions.length).toBe(1);
    expect(e3.sessions[0].id).toBe('cus_abcdef01');
  });
});

describe('(11.2) coordinate + button validation', () => {
  test('(a) validateCoords accepts non-negative finite numbers', () => {
    expect(() => validateCoords(0, 0)).not.toThrow();
    expect(() => validateCoords(100, 200)).not.toThrow();
    expect(() => validateCoords(1.5, 2.5)).not.toThrow();
  });

  test('(b) validateCoords rejects negative values', () => {
    expect(() => validateCoords(-1, 10)).toThrow('non-negative');
    expect(() => validateCoords(10, -5)).toThrow('non-negative');
  });

  test('(c) validateCoords rejects NaN + Infinity + non-numbers', () => {
    expect(() => validateCoords(NaN, 10)).toThrow('finite');
    expect(() => validateCoords(10, Infinity)).toThrow('finite');
    expect(() => validateCoords('100', 10)).toThrow('finite');
    expect(() => validateCoords(null, 10)).toThrow('finite');
    expect(() => validateCoords(undefined, 10)).toThrow('finite');
  });

  test('(d) validateButton accepts the three mouse buttons + defaults to left', () => {
    expect(validateButton('left')).toBe('left');
    expect(validateButton('right')).toBe('right');
    expect(validateButton('middle')).toBe('middle');
    expect(validateButton(undefined)).toBe('left');
    expect(validateButton(null)).toBe('left');
  });

  test('(e) validateButton rejects unknown buttons', () => {
    expect(() => validateButton('primary')).toThrow('left/right/middle');
    expect(() => validateButton('LEFT')).toThrow();
    expect(() => validateButton(1)).toThrow();
  });
});

describe('(11.2) key normalization', () => {
  test('(a) common aliases collapse case', () => {
    expect(normalizeKeyName('Enter')).toBe('Return');
    expect(normalizeKeyName('enter')).toBe('Return');
    expect(normalizeKeyName('ENTER')).toBe('Return');
    expect(normalizeKeyName('Return')).toBe('Return');
  });

  test('(b) escape aliases resolve', () => {
    expect(normalizeKeyName('Esc')).toBe('Escape');
    expect(normalizeKeyName('esc')).toBe('Escape');
    expect(normalizeKeyName('ESCAPE')).toBe('Escape');
  });

  test('(c) combos preserve structure', () => {
    expect(normalizeKeyName('Ctrl+C')).toBe('ctrl+C');
    expect(normalizeKeyName('ctrl+c')).toBe('ctrl+c');
    expect(normalizeKeyName('Ctrl+Shift+a')).toBe('ctrl+shift+a');
    expect(normalizeKeyName('Alt+Tab')).toBe('alt+Tab');
  });

  test('(d) single characters pass through unchanged, multi-char title-cased', () => {
    expect(normalizeKeyName('a')).toBe('a');
    expect(normalizeKeyName('Z')).toBe('Z');
    expect(normalizeKeyName('F1')).toBe('F1');
    // Unknown key starting lowercase gets title-cased
    expect(normalizeKeyName('pgup')).toBe('Pgup');
  });

  test('(e) rejects empty / non-string input', () => {
    expect(() => normalizeKeyName('')).toThrow('non-empty');
    expect(() => normalizeKeyName(null)).toThrow('non-empty');
    expect(() => normalizeKeyName(undefined)).toThrow('non-empty');
    expect(() => normalizeKeyName(42)).toThrow('non-empty');
    expect(() => normalizeKeyName('++')).toThrow('non-empty');
  });
});

describe('(11.2) selectBackend + detectAvailableBackends', () => {
  test('(a) explicit stub returns a StubBackend', () => {
    const { backend, name } = selectBackend('stub');
    expect(name).toBe('stub');
    expect(backend).toBeInstanceOf(StubBackend);
  });

  test('(b) explicit mock returns a MockBackend', () => {
    const { backend, name } = selectBackend('mock');
    expect(name).toBe('mock');
    expect(backend).toBeInstanceOf(MockBackend);
    // MockBackend extends StubBackend so it has a log array too
    expect(Array.isArray(backend.log)).toBe(true);
  });

  test('(c) auto falls back to stub when xdotool unavailable', () => {
    // On CI / stub hosts xdotool is absent, so auto -> stub. On hosts
    // where xdotool is installed, auto -> xdotool. Either way, the
    // returned name must be one of the valid backends.
    const { name } = selectBackend('auto');
    expect(['stub', 'xdotool'].includes(name)).toBe(true);
  });

  test('(d) unknown preference throws', () => {
    expect(() => selectBackend('nonsense')).toThrow('Unknown backend');
  });

  test('(e) detectAvailableBackends always reports stub + mock', () => {
    const out = detectAvailableBackends();
    expect(out.stub).toBe(true);
    expect(out.mock).toBe(true);
    // xdotool is a runtime probe; just assert it's a boolean
    expect(typeof out.xdotool).toBe('boolean');
  });

  test('(f) explicit xdotool throws NotAvailable when binary missing', () => {
    // Only assert when xdotool is actually absent. When it IS present
    // this call would succeed; we skip the negative assertion in that
    // case because the test environment can't force a missing binary.
    const probe = detectAvailableBackends();
    if (probe.xdotool) return;
    let err;
    try { selectBackend('xdotool'); } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err instanceof NotAvailable || /xdotool|Linux/.test(err.message)).toBeTruthy();
  });
});

describe('(11.2) StubBackend action recording', () => {
  test('(a) click records x/y/button', async () => {
    const b = new StubBackend();
    await b.click(10, 20, 'left');
    await b.click(30, 40, 'right');
    expect(b.log.length).toBe(2);
    expect(b.log[0].action).toBe('click');
    expect(b.log[0].details).toEqual({ x: 10, y: 20, button: 'left' });
    expect(b.log[1].details.button).toBe('right');
  });

  test('(b) click rejects bad coords + bad button', async () => {
    const b = new StubBackend();
    let err;
    try { await b.click(-1, 10); } catch (e) { err = e; }
    expect(err).toBeDefined();
    err = undefined;
    try { await b.click(10, 10, 'primary'); } catch (e) { err = e; }
    expect(err).toBeDefined();
  });

  test('(c) type records text and delay', async () => {
    const b = new StubBackend();
    await b.type('hello', 5);
    await b.type('world');
    expect(b.log[0].details.text).toBe('hello');
    expect(b.log[0].details.delayMs).toBe(5);
    expect(b.log[1].details.text).toBe('world');
    expect(b.log[1].details.delayMs).toBe(null);
  });

  test('(d) type rejects non-string input', async () => {
    const b = new StubBackend();
    let err;
    try { await b.type(123); } catch (e) { err = e; }
    expect(err).toBeDefined();
  });

  test('(e) keyPress normalises the key name before recording', async () => {
    const b = new StubBackend();
    await b.keyPress('enter');
    await b.keyPress('Ctrl+C');
    expect(b.log[0].details.key).toBe('Return');
    expect(b.log[1].details.key).toBe('ctrl+C');
  });

  test('(f) screenshot writes a PNG to outPath and returns metadata', async () => {
    const dir = mkTmpDir();
    const out = path.join(dir, 'nested', 'shot.png');
    const b = new StubBackend();
    const meta = await b.screenshot(out);
    expect(meta.imagePath).toBe(out);
    expect(meta.backend).toBe('stub');
    expect(typeof meta.timestamp).toBe('string');
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.height).toBeGreaterThan(0);
    expect(fs.existsSync(out)).toBe(true);
    const written = fs.readFileSync(out);
    expect(written[0]).toBe(0x89);
    expect(written.length).toBe(STUB_PNG.length);
  });

  test('(g) move + scroll + dragTo all record', async () => {
    const b = new StubBackend();
    await b.move(1, 2);
    await b.scroll(0, -3);
    await b.dragTo(10, 20, 30, 40);
    expect(b.log.length).toBe(3);
    expect(b.log[0].action).toBe('move');
    expect(b.log[1].action).toBe('scroll');
    expect(b.log[1].details.deltaY).toBe(-3);
    expect(b.log[2].action).toBe('dragTo');
    expect(b.log[2].details.toX).toBe(30);
  });

  test('(h) doubleClick records both coords', async () => {
    const b = new StubBackend();
    await b.doubleClick(5, 5);
    expect(b.log[0].action).toBe('doubleClick');
    expect(b.log[0].details).toEqual({ x: 5, y: 5 });
  });
});

describe('(11.2) MockBackend driver hook', () => {
  test('(a) driver callback receives every click/type/key', async () => {
    const seen = [];
    const m = new MockBackend({ driver: (action, details) => { seen.push([action, details]); } });
    await m.click(1, 2);
    await m.type('hi');
    await m.keyPress('Tab');
    expect(seen.length).toBe(3);
    expect(seen[0][0]).toBe('click');
    expect(seen[1][0]).toBe('type');
    expect(seen[2][0]).toBe('keyPress');
  });

  test('(b) driver returning false aborts the action', async () => {
    const m = new MockBackend({ driver: (action) => action === 'click' ? false : undefined });
    let err;
    try { await m.click(1, 2); } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.message).toContain('rejected');
  });
});

describe('(11.2) ComputerUseAgent session CRUD', () => {
  test('(a) startSession throws when config.computerUse.enabled is false', () => {
    const agent = newAgent({ enabled: false });
    let err;
    try { agent.startSession(); } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.message).toContain('computerUse.enabled=false');
    expect(agent.listSessions().length).toBe(0);
  });

  test('(b) startSession records backend + persists to disk', () => {
    const agent = newAgent({ enabled: true, backend: 'stub' });
    const s = agent.startSession();
    expect(isSessionId(s.id)).toBe(true);
    expect(s.backend).toBe('stub');
    expect(s.actions).toEqual([]);
    expect(s.screenshots).toEqual([]);
    expect(typeof s.startedAt).toBe('string');
    expect(s.endedAt).toBe(null);
    // persisted
    const raw = fs.readFileSync(agent.storePath, 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.sessions.length).toBe(1);
    expect(parsed.sessions[0].id).toBe(s.id);
  });

  test('(c) explicit backend preference propagates', () => {
    const agent = newAgent({ enabled: true });
    const s = agent.startSession('stub');
    expect(s.backend).toBe('stub');
    const s2 = agent.startSession('mock');
    expect(s2.backend).toBe('mock');
  });

  test('(d) listSessions + getSession roundtrip', () => {
    const agent = newAgent({ enabled: true, backend: 'stub' });
    const s1 = agent.startSession();
    const s2 = agent.startSession();
    const list = agent.listSessions();
    expect(list.length).toBe(2);
    expect(list.map((x) => x.id)).toContain(s1.id);
    expect(list.map((x) => x.id)).toContain(s2.id);
    expect(agent.getSession(s1.id)?.id).toBe(s1.id);
    expect(agent.getSession('cus_missing')).toBe(null);
    expect(agent.getSession('not-a-cus-id')).toBe(null);
  });

  test('(e) endSession stamps endedAt + deleteSession strips the row', () => {
    const agent = newAgent({ enabled: true, backend: 'stub' });
    const s = agent.startSession();
    const ended = agent.endSession(s.id);
    expect(ended.endedAt).not.toBeNull();
    expect(typeof ended.endedAt).toBe('string');
    expect(agent.deleteSession(s.id)).toBe(true);
    expect(agent.listSessions().length).toBe(0);
    expect(agent.deleteSession(s.id)).toBe(false);
  });

  test('(f) endSession returns null for unknown id', () => {
    const agent = newAgent({ enabled: true });
    expect(agent.endSession('cus_missing')).toBe(null);
  });

  test('(g) storage roundtrip: second agent on same file reads the entries', () => {
    const dir = mkTmpDir();
    const storePath = path.join(dir, 'sessions.json');
    const shotsDir = path.join(dir, 'shots');
    const cfg = { computerUse: { enabled: true } };
    const a1 = new ComputerUseAgent({ storePath, screenshotsDir: shotsDir, config: cfg });
    const s = a1.startSession('stub');
    const a2 = new ComputerUseAgent({ storePath, screenshotsDir: shotsDir, config: cfg });
    expect(a2.listSessions().length).toBe(1);
    expect(a2.getSession(s.id)?.backend).toBe('stub');
  });

  test('(h) missing store file returns fresh state; malformed JSON falls back', () => {
    const dir = mkTmpDir();
    const storePath = path.join(dir, 'sessions.json');
    const a1 = new ComputerUseAgent({ storePath, config: { computerUse: { enabled: true } } });
    expect(a1.listSessions()).toEqual([]);
    fs.writeFileSync(storePath, '{this is not json');
    const a2 = new ComputerUseAgent({ storePath, config: { computerUse: { enabled: true } } });
    expect(a2.listSessions()).toEqual([]);
  });

  test('(i) persistence trims to SESSION_LIMIT', () => {
    const agent = newAgent({ enabled: true, backend: 'stub' });
    // Seed SESSION_LIMIT+5 rows directly via startSession; verify the
    // store caps.
    for (let i = 0; i < SESSION_LIMIT + 5; i++) {
      agent.startSession('stub');
    }
    const raw = JSON.parse(fs.readFileSync(agent.storePath, 'utf8'));
    expect(raw.sessions.length).toBe(SESSION_LIMIT);
  });
});

describe('(11.2) ComputerUseAgent input pipeline', () => {
  async function freshWithSession() {
    const agent = newAgent({ enabled: true, backend: 'stub' });
    const s = agent.startSession('stub');
    return { agent, sessionId: s.id };
  }

  test('(a) click records an action on the session', async () => {
    const { agent, sessionId } = await freshWithSession();
    await agent.click(sessionId, 10, 20);
    await agent.click(sessionId, 30, 40, 'right');
    const s = agent.getSession(sessionId);
    expect(s.actions.length).toBe(2);
    expect(s.actions[0].type).toBe('click');
    expect(s.actions[0].x).toBe(10);
    expect(s.actions[0].button).toBe('left');
    expect(s.actions[1].button).toBe('right');
  });

  test('(b) click through the agent also hits the StubBackend log', async () => {
    const { agent, sessionId } = await freshWithSession();
    await agent.click(sessionId, 50, 60);
    const backend = agent.getBackend(sessionId);
    expect(backend.log.length).toBe(1);
    expect(backend.log[0].action).toBe('click');
    expect(backend.log[0].details.x).toBe(50);
  });

  test('(c) click rejects invalid coords before recording', async () => {
    const { agent, sessionId } = await freshWithSession();
    let err;
    try { await agent.click(sessionId, -1, 10); } catch (e) { err = e; }
    expect(err).toBeDefined();
    err = undefined;
    try { await agent.click(sessionId, NaN, 10); } catch (e) { err = e; }
    expect(err).toBeDefined();
    err = undefined;
    try { await agent.click(sessionId, 'a', 10); } catch (e) { err = e; }
    expect(err).toBeDefined();
    const s = agent.getSession(sessionId);
    expect(s.actions.length).toBe(0);
  });

  test('(d) type + keyPress record with normalised key name', async () => {
    const { agent, sessionId } = await freshWithSession();
    await agent.type(sessionId, 'hello', 2);
    await agent.keyPress(sessionId, 'enter');
    await agent.keyPress(sessionId, 'Ctrl+Shift+A');
    const s = agent.getSession(sessionId);
    expect(s.actions.length).toBe(3);
    expect(s.actions[0]).toEqual({ ...s.actions[0], type: 'type', text: 'hello', delayMs: 2 });
    expect(s.actions[1].key).toBe('Return');
    expect(s.actions[2].key).toBe('ctrl+shift+A');
  });

  test('(e) screenshot writes a PNG under screenshotsDir/<sessionId>/', async () => {
    const { agent, sessionId } = await freshWithSession();
    const shot = await agent.screenshot(sessionId);
    expect(shot.id.startsWith('shot_')).toBe(true);
    expect(shot.imagePath.includes(sessionId)).toBe(true);
    expect(fs.existsSync(shot.imagePath)).toBe(true);
    // The screenshots array gets the metadata; the actions array gets
    // a 'screenshot' action referencing the shotId.
    const s = agent.getSession(sessionId);
    expect(s.screenshots.length).toBe(1);
    expect(s.screenshots[0].id).toBe(shot.id);
    expect(s.actions.length).toBe(1);
    expect(s.actions[0].type).toBe('screenshot');
    expect(s.actions[0].screenshotId).toBe(shot.id);
  });

  test('(f) getScreenshot retrieves recorded metadata', async () => {
    const { agent, sessionId } = await freshWithSession();
    const shot = await agent.screenshot(sessionId);
    const meta = agent.getScreenshot(sessionId, shot.id);
    expect(meta).not.toBeNull();
    expect(meta.imagePath).toBe(shot.imagePath);
    expect(agent.getScreenshot(sessionId, 'shot_missing')).toBe(null);
    expect(agent.getScreenshot('cus_missing', shot.id)).toBe(null);
  });

  test('(g) move + scroll + dragTo all record', async () => {
    const { agent, sessionId } = await freshWithSession();
    await agent.move(sessionId, 5, 5);
    await agent.scroll(sessionId, 0, 3);
    await agent.dragTo(sessionId, 1, 2, 3, 4);
    const s = agent.getSession(sessionId);
    expect(s.actions.length).toBe(3);
    expect(s.actions[0].type).toBe('move');
    expect(s.actions[1].type).toBe('scroll');
    expect(s.actions[2].type).toBe('dragTo');
    expect(s.actions[2].toY).toBe(4);
  });

  test('(h) actions on an ended session are rejected', async () => {
    const { agent, sessionId } = await freshWithSession();
    agent.endSession(sessionId);
    let err;
    try { await agent.click(sessionId, 1, 2); } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.message).toContain('ended');
  });

  test('(i) actions on an unknown session are rejected', async () => {
    const { agent } = await freshWithSession();
    let err;
    try { await agent.click('cus_missing', 1, 2); } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.message).toContain('Unknown session');
  });

  test('(j) recordAction rejects missing action + enforces session state', () => {
    const agent = newAgent({ enabled: true, backend: 'stub' });
    const s = agent.startSession();
    let err;
    try { agent.recordAction(s.id, null); } catch (e) { err = e; }
    expect(err).toBeDefined();
    err = undefined;
    try { agent.recordAction('cus_missing', { type: 'noop' }); } catch (e) { err = e; }
    expect(err).toBeDefined();
    agent.endSession(s.id);
    err = undefined;
    try { agent.recordAction(s.id, { type: 'noop' }); } catch (e) { err = e; }
    expect(err).toBeDefined();
  });
});

describe('(11.2) RBAC gate', () => {
  test('(a) COMPUTER_USE is a canonical action in the ACTIONS enum', () => {
    expect(ACTIONS.COMPUTER_USE).toBe('computer.use');
    expect(ALL_ACTIONS.includes('computer.use')).toBe(true);
  });

  test('(b) admin has wildcard so COMPUTER_USE is allowed', () => {
    const dir = mkTmpDir();
    const rm = new RoleManager({ storePath: path.join(dir, 'rbac.json') });
    rm.assignRole('alice', 'admin');
    expect(rm.checkPermission('alice', ACTIONS.COMPUTER_USE)).toBe(true);
  });

  test('(c) default manager role does NOT get COMPUTER_USE (opt-in only)', () => {
    const dir = mkTmpDir();
    const rm = new RoleManager({ storePath: path.join(dir, 'rbac.json') });
    rm.assignRole('bob', 'manager');
    expect(rm.checkPermission('bob', ACTIONS.COMPUTER_USE)).toBe(false);
  });

  test('(d) default viewer role does NOT get COMPUTER_USE', () => {
    const dir = mkTmpDir();
    const rm = new RoleManager({ storePath: path.join(dir, 'rbac.json') });
    rm.assignRole('eve', 'viewer');
    expect(rm.checkPermission('eve', ACTIONS.COMPUTER_USE)).toBe(false);
  });

  test('(e) unknown user is denied', () => {
    const dir = mkTmpDir();
    const rm = new RoleManager({ storePath: path.join(dir, 'rbac.json') });
    expect(rm.checkPermission('ghost', ACTIONS.COMPUTER_USE)).toBe(false);
  });
});

describe('(11.2) shared singleton', () => {
  test('(a) getShared returns the same instance until reset', () => {
    resetShared();
    const dir = mkTmpDir();
    const a1 = getShared({ storePath: path.join(dir, 's.json'), config: { computerUse: { enabled: true } } });
    const a2 = getShared();
    expect(a1).toBe(a2);
    resetShared();
    const a3 = getShared({ storePath: path.join(dir, 's2.json'), config: { computerUse: { enabled: true } } });
    expect(a1).not.toBe(a3);
    resetShared();
  });
});
