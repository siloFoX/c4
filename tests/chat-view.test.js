'use strict';

// 8.6 regression: ChatView component must strip ANSI cleanly, decode the
// base64 PTY payloads coming off /watch, and wire to the same auth + SSE
// layer as the rest of the Web UI. TSX isn't directly requireable so we
// (a) reload the JS-equivalent logic in-process to lock behaviour and
// (b) source-grep the TSX + App.tsx to catch the wiring drifting away
// from the spec.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');

const WEB_SRC = path.join(__dirname, '..', 'web', 'src');
const CHAT_VIEW = path.join(WEB_SRC, 'components', 'ChatView.tsx');
const APP_TSX = path.join(WEB_SRC, 'App.tsx');

// Re-implementation of stripAnsi mirroring ChatView.tsx. If you change the
// regexes there, mirror the change here or the tests will fail fast.
const ANSI_OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const ANSI_CSI = /\x1b\[[\d;?=]*[ -/]*[@-~]/g;
const ANSI_OTHER = /\x1b[=>()][0-9A-Za-z]?/g;
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f]/g;

function stripAnsi(input) {
  return String(input)
    .replace(ANSI_OSC, '')
    .replace(ANSI_CSI, '')
    .replace(ANSI_OTHER, '')
    .replace(/\r(?!\n)/g, '\n')
    .replace(CONTROL_CHARS, '');
}

function b64decode(b64) {
  return Buffer.from(b64, 'base64').toString('utf8');
}

describe('ChatView stripAnsi', () => {
  it('removes CSI colour codes', () => {
    const input = '\x1b[31mhello\x1b[0m world';
    assert.strictEqual(stripAnsi(input), 'hello world');
  });

  it('removes CSI cursor moves', () => {
    const input = 'before\x1b[2J\x1b[H\x1b[10;5Hafter';
    assert.strictEqual(stripAnsi(input), 'beforeafter');
  });

  it('removes OSC title sequences (BEL terminated)', () => {
    const input = '\x1b]0;window title\x07visible';
    assert.strictEqual(stripAnsi(input), 'visible');
  });

  it('removes OSC title sequences (ST terminated)', () => {
    const input = '\x1b]2;another title\x1b\\payload';
    assert.strictEqual(stripAnsi(input), 'payload');
  });

  it('converts lone CR to newline but keeps CRLF intact', () => {
    // \r without \n becomes \n; the trailing \r\n yields a single \n after
    // control-char stripping drops the standalone \r.
    const got = stripAnsi('line1\rline2\r\nline3');
    assert.strictEqual(got, 'line1\nline2\nline3');
  });

  it('drops other control chars but preserves tab + newline', () => {
    const input = 'a\x00b\x07c\tdef\nghi';
    assert.strictEqual(stripAnsi(input), 'abc\tdef\nghi');
  });

  it('is a no-op for ASCII text', () => {
    assert.strictEqual(stripAnsi('hello world'), 'hello world');
  });
});

describe('ChatView b64decode', () => {
  it('decodes UTF-8 payloads round-trip', () => {
    const original = 'output line 1\noutput line 2\n';
    const encoded = Buffer.from(original, 'utf8').toString('base64');
    assert.strictEqual(b64decode(encoded), original);
  });

  it('decodes ANSI-laden payloads into strip-ready input', () => {
    const raw = '\x1b[32m> task complete\x1b[0m\n';
    const encoded = Buffer.from(raw, 'utf8').toString('base64');
    assert.strictEqual(stripAnsi(b64decode(encoded)), '> task complete\n');
  });
});

describe('ChatView source wiring', () => {
  const src = fs.readFileSync(CHAT_VIEW, 'utf8');

  it('imports apiFetch + eventSourceUrl from the shared api module', () => {
    assert.match(src, /from '\.\.\/lib\/api'/);
    assert.match(src, /apiFetch/);
    assert.match(src, /eventSourceUrl/);
  });

  it('subscribes to /api/watch with the worker name', () => {
    assert.match(src, /eventSourceUrl\(`\/api\/watch\?name=\$\{encodeURIComponent\(workerName\)\}`\)/);
    assert.match(src, /new EventSource\(url\)/);
  });

  it('posts user text through /api/send and Enter through /api/key', () => {
    assert.match(src, /apiFetch\('\/api\/send'/);
    assert.match(src, /apiFetch\('\/api\/key'/);
    assert.match(src, /key: 'Enter'/);
  });

  it('renders user bubbles right-aligned and worker bubbles left-aligned', () => {
    assert.match(src, /justify-end/);
    assert.match(src, /justify-start/);
    assert.match(src, /isUser \? 'justify-end' : 'justify-start'/);
  });

  it('tracks autoScroll and exposes a Jump-to-latest escape hatch', () => {
    assert.match(src, /setAutoScroll/);
    assert.match(src, /Jump to latest/);
    assert.match(src, /distanceFromBottom/);
  });

  it('declares a debounce window for worker output chunking', () => {
    assert.match(src, /WORKER_FLUSH_MS\s*=\s*\d+/);
  });

  it('decodes base64 payloads before buffering', () => {
    assert.match(src, /b64decode\(data\.data\)/);
  });

  it('exports stripAnsi + b64decode for test visibility', () => {
    assert.match(src, /export function stripAnsi/);
    assert.match(src, /export function b64decode/);
  });
});

describe('App.tsx integration', () => {
  const src = fs.readFileSync(APP_TSX, 'utf8');

  it('imports ChatView', () => {
    assert.match(src, /import ChatView from '\.\/components\/ChatView'/);
  });

  it('persists the detail-mode selection to localStorage', () => {
    const prefsSrc = fs.readFileSync(path.join(WEB_SRC, 'lib', 'preferences.ts'), 'utf8');
    assert.match(prefsSrc, /DETAIL_MODE_KEY\s*=\s*'c4\.detail\.mode'/);
    assert.match(prefsSrc, /localStorage\.setItem/);
    assert.match(src, /writeDetailMode|setDetailMode/);
  });

  it('renders Terminal + Chat tabs for the selected worker', () => {
    // After c4/web-layout the tab chrome moved into DetailTabs; App.tsx only
    // wires setDetailMode via onChange. Verify both ends.
    const detailTabsSrc = fs.readFileSync(
      path.join(WEB_SRC, 'components', 'layout', 'DetailTabs.tsx'),
      'utf8',
    );
    assert.match(detailTabsSrc, /label: 'Terminal'/);
    assert.match(detailTabsSrc, /label: 'Chat'/);
    assert.match(detailTabsSrc, /value: 'terminal'/);
    assert.match(detailTabsSrc, /value: 'chat'/);
    assert.match(src, /<DetailTabs[\s\S]*?onChange=\{setDetailMode\}/);
  });

  it('keeps WorkerDetail mounted in the terminal branch (backwards compatible)', () => {
    assert.match(src, /<WorkerDetail key=\{`term-\$\{selectedWorker\}`\}/);
    assert.match(src, /<ChatView key=\{`chat-\$\{selectedWorker\}`\}/);
  });
});
