'use strict';

// 8.24 + 8.27 -- xterm.js terminal emulator source-grep locks.
//
// Same pattern as 8.21 / 8.22 / 8.23: no browser runs in the test suite.
// We only need to guarantee that the xterm wiring (deps, addons, SSE
// subscription, shadcn theme, fit + resize, alt-screen detection) cannot
// silently drift from the spec. Actual render/pixel verification runs
// out-of-band via `npm --prefix web run dev` + manual inspection.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');

const REPO_ROOT = path.join(__dirname, '..');
const WEB_PKG = path.join(REPO_ROOT, 'web', 'package.json');
const XTERM_VIEW = path.join(REPO_ROOT, 'web', 'src', 'components', 'XtermView.tsx');
const WORKER_DETAIL = path.join(REPO_ROOT, 'web', 'src', 'components', 'WorkerDetail.tsx');

// -----------------------------------------------------------------
// (a) web/package.json -- xterm dependencies are present.
// -----------------------------------------------------------------

describe('web/package.json xterm dependencies (8.24)', () => {
  const pkg = JSON.parse(fs.readFileSync(WEB_PKG, 'utf8'));

  it('declares @xterm/xterm as a runtime dependency', () => {
    assert.ok(pkg.dependencies, 'package.json missing dependencies');
    assert.ok(pkg.dependencies['@xterm/xterm'], 'missing @xterm/xterm dep');
  });

  it('declares the fit + search + web-links addons as runtime deps', () => {
    assert.ok(pkg.dependencies['@xterm/addon-fit'], 'missing @xterm/addon-fit');
    assert.ok(pkg.dependencies['@xterm/addon-search'], 'missing @xterm/addon-search');
    assert.ok(pkg.dependencies['@xterm/addon-web-links'], 'missing @xterm/addon-web-links');
  });
});

// -----------------------------------------------------------------
// (b) web/src/components/XtermView.tsx -- core wiring.
// -----------------------------------------------------------------

describe('XtermView wiring (8.24 + 8.27)', () => {
  const src = fs.readFileSync(XTERM_VIEW, 'utf8');

  it('imports Terminal from @xterm/xterm and the three addons', () => {
    assert.match(src, /import\s+\{[^}]*Terminal[^}]*\}\s+from\s+['"]@xterm\/xterm['"]/);
    assert.match(src, /import\s+\{\s*FitAddon\s*\}\s+from\s+['"]@xterm\/addon-fit['"]/);
    assert.match(src, /import\s+\{\s*SearchAddon\s*\}\s+from\s+['"]@xterm\/addon-search['"]/);
    assert.match(src, /import\s+\{\s*WebLinksAddon\s*\}\s+from\s+['"]@xterm\/addon-web-links['"]/);
  });

  it('imports the xterm stylesheet so default colours + cell metrics load', () => {
    assert.match(src, /import\s+['"]@xterm\/xterm\/css\/xterm\.css['"]/);
  });

  it('instantiates Terminal + loads the three addons before open()', () => {
    assert.match(src, /new Terminal\(/);
    assert.match(src, /new FitAddon\(\)/);
    assert.match(src, /new SearchAddon\(\)/);
    assert.match(src, /new WebLinksAddon\(\)/);
    assert.match(src, /term\.loadAddon\(fit\)/);
    assert.match(src, /term\.loadAddon\(search\)/);
    assert.match(src, /term\.loadAddon\(webLinks\)/);
    assert.match(src, /term\.open\(container\)/);
  });

  it('subscribes to /api/watch via eventSourceUrl (auth-aware)', () => {
    assert.match(src, /from '\.\.\/lib\/api'/);
    assert.match(src, /eventSourceUrl\(`\/api\/watch\?name=\$\{encodeURIComponent\(workerName\)\}`\)/);
    assert.match(src, /new EventSource\(url\)/);
  });

  it('writes raw PTY chunks to xterm without stripping ANSI', () => {
    // 8.24 repro: stripAnsi dropped cursor-up / alt-screen / CSI erase and
    // caused spinner/thinking boxes to pile up. The new view must hand
    // bytes straight to xterm.
    assert.match(src, /term\.write\(/);
    assert.ok(
      !/stripAnsi\s*\(/.test(src),
      'XtermView must not call stripAnsi -- xterm parses ANSI itself'
    );
  });

  it('decodes base64 frames off the SSE output envelope', () => {
    assert.match(src, /type\s*===\s*['"]output['"]/);
    assert.match(src, /b64decode\(/);
    // JSON.parse of the SSE data, matching the ChatView contract.
    assert.match(src, /JSON\.parse\(ev\.data\)/);
  });

  it('maps the xterm theme onto the shadcn CSS tokens (light + dark parity)', () => {
    assert.match(src, /--background/);
    assert.match(src, /--foreground/);
    assert.match(src, /--muted-foreground/);
    assert.match(src, /--primary/);
    assert.match(src, /--destructive/);
    // Function name contract so the test survives minor refactors.
    assert.match(src, /readShadcnColor\(/);
    assert.match(src, /buildXtermTheme\(/);
  });

  it('re-applies the theme when the <html> class flips (dark mode toggle)', () => {
    assert.match(src, /MutationObserver/);
    assert.match(src, /attributeFilter:\s*\[\s*['"]class['"]\s*\]/);
  });

  it('exposes the alt-screen state via term.buffer.active.type', () => {
    assert.match(src, /term\.buffer\.active\.type/);
    assert.match(src, /['"]alternate['"]/);
    assert.match(src, /term\.buffer\.onBufferChange/);
  });

  it('wires ResizeObserver + window resize and calls fitAddon.fit()', () => {
    assert.match(src, /new ResizeObserver\(/);
    assert.match(src, /obs\.observe\(container\)/);
    assert.match(src, /window\.addEventListener\(['"]resize['"]/);
    assert.match(src, /fit\.fit\(\)/);
  });

  it('debounces fit at 120ms and dedupes POST /api/resize against last dims', () => {
    assert.match(src, /FIT_DEBOUNCE_MS\s*=\s*120/);
    assert.match(src, /lastResizeRef/);
    assert.match(src, /apiFetch\(['"]\/api\/resize['"]/);
  });

  it('clamps cols + rows to the daemon PTY-manager range', () => {
    // Mirrors src/pty-manager.js _clampResizeDims so we never ask for
    // something the daemon will round-trip or reject.
    assert.match(src, /MIN_COLS\s*=\s*20/);
    assert.match(src, /MAX_COLS\s*=\s*400/);
    assert.match(src, /MIN_ROWS\s*=\s*5/);
    assert.match(src, /MAX_ROWS\s*=\s*200/);
    assert.match(src, /clampInt\(/);
  });

  it('re-fits when the visible prop flips back to true (8.27)', () => {
    // 8.27 bug: toggling away + back left the terminal with the old dims.
    // The fix is a layout-effect that schedules a fit whenever visibility
    // goes true.
    assert.match(src, /useLayoutEffect/);
    assert.match(src, /if\s*\(\s*visible\s*\)\s*scheduleFit\(\)/);
  });

  it('opens a search overlay on Ctrl+F and runs findNext via the SearchAddon', () => {
    assert.match(src, /e\.key\.toLowerCase\(\)\s*===\s*['"]f['"]/);
    assert.match(src, /setSearchOpen\(true\)/);
    assert.match(src, /search\.findNext\(/);
    assert.match(src, /search\.findPrevious\(/);
  });

  it('seeds a sensible xterm default (monospace font + scrollback)', () => {
    assert.match(src, /fontFamily:\s*['"]ui-monospace/);
    assert.match(src, /scrollback:\s*\d+/);
  });
});

// -----------------------------------------------------------------
// (c) web/src/components/WorkerDetail.tsx -- integration.
// -----------------------------------------------------------------

describe('WorkerDetail integrates XtermView (8.24)', () => {
  const src = fs.readFileSync(WORKER_DETAIL, 'utf8');

  it('imports + renders XtermView on the Screen tab', () => {
    assert.match(src, /import XtermView from '\.\/XtermView'/);
    assert.match(src, /<XtermView\s+workerName=\{workerName\}/);
    // visible prop wires the 8.27 keep-alive behaviour.
    assert.match(src, /visible=\{tab\s*===\s*['"]screen['"]\}/);
  });

  it('keeps XtermView mounted while Scrollback tab is active (hidden != unmounted)', () => {
    // Screen-tab container toggles display with a CSS hidden class rather
    // than conditional rendering -- matches the 8.27 spec lifecycle.
    assert.match(src, /tab\s*===\s*['"]screen['"]\s*\?\s*['"]block['"]\s*:\s*['"]hidden['"]/);
  });

  it('still renders a stripAnsi-backed pre on the Scrollback tab', () => {
    // Scrollback keeps the simple text dump for grep-style browsing; it
    // does not run xterm because we do not re-emit historical output.
    assert.match(src, /stripAnsi\(scrollbackContent\)/);
    assert.match(src, /\/api\/scrollback\?name=/);
  });

  it('drops the old ruler-based char-width measurement', () => {
    // xterm owns the measurement now; the old rulerRef + measured char
    // width path must not ship alongside the new view or the two would
    // race over POST /api/resize.
    assert.ok(!/rulerRef/.test(src), 'rulerRef should be gone -- xterm measures instead');
    assert.ok(!/charW\s*=/.test(src), 'char-width measurement should be gone');
  });
});
