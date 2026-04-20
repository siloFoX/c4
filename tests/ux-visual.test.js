'use strict';

// 8.22 -- UX visual regression + terminal auto-fit fix.
//
// These are source-grep locks, same pattern as 8.20B. No live browser
// spins up in the test suite: we only want to guarantee that the
// visual-regression plumbing and the auto-fit debug hooks stay wired
// correctly against future refactors. Actual pixel diffs + viewport
// screenshots run out-of-band via `node tools/ux/explore.mjs`.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');

const REPO_ROOT = path.join(__dirname, '..');
const EXPLORE = path.join(REPO_ROOT, 'tools', 'ux', 'explore.mjs');
const UX_PKG = path.join(REPO_ROOT, 'tools', 'ux', 'package.json');
const SCREEN_BUFFER = path.join(REPO_ROOT, 'src', 'screen-buffer.js');

// -----------------------------------------------------------------
// (a) tools/ux/explore.mjs -- visual regression wiring.
// -----------------------------------------------------------------

describe('tools/ux/explore.mjs visual regression wiring (8.22)', () => {
  const src = fs.readFileSync(EXPLORE, 'utf8');

  it('declares the P2 viewport constant with desktop-xl / desktop-md / tablet', () => {
    assert.match(src, /VIEWPORTS_VISUAL\s*=/);
    assert.match(src, /name:\s*'desktop-xl',\s*width:\s*1920,\s*height:\s*1080/);
    assert.match(src, /name:\s*'desktop-md',\s*width:\s*1366,\s*height:\s*768/);
    assert.match(src, /name:\s*'tablet',\s*width:\s*1024,\s*height:\s*768/);
  });

  it('declares the VISUAL_PAGES sweep including the spec-named routes', () => {
    assert.match(src, /VISUAL_PAGES\s*=/);
    for (const route of ["'/'", "'/features'", "'/sessions'"]) {
      assert.ok(src.includes(route), `VISUAL_PAGES missing ${route}`);
    }
  });

  it('imports pixelmatch and pngjs via dynamic import (runtime-isolated)', () => {
    assert.match(src, /import\(\s*['"]pixelmatch['"]\s*\)/);
    assert.match(src, /import\(\s*['"]pngjs['"]\s*\)/);
  });

  it('writes the audit report under patches/ui-audit-<date>/', () => {
    assert.match(src, /patches.*ui-audit-\$\{AUDIT_DATE\}/);
    assert.match(src, /ui-audit-report\.json/);
  });

  it('reads baselines from patches/ui-audit-baseline/', () => {
    assert.match(src, /patches.*ui-audit-baseline/);
    assert.match(src, /BASELINE_DIR/);
  });

  it('runs the overflow detector against r.right > window.innerWidth', () => {
    assert.match(src, /r\.right\s*>\s*window\.innerWidth/);
    assert.match(src, /detectOverflow/);
    // Per spec: cap samples at 20.
    assert.match(src, /\.slice\(0,\s*20\)/);
  });

  it('runs the clipping detector against text-overflow: ellipsis + scrollWidth', () => {
    assert.match(src, /textOverflow\s*===\s*['"]ellipsis['"]/);
    assert.match(src, /scrollWidth\s*>\s*el\.clientWidth/);
    assert.match(src, /detectClipping/);
  });

  it('captures the terminal auto-fit anchor at 2000px then 600px', () => {
    assert.match(src, /captureAutofitAnchor/);
    assert.match(src, /before2000/);
    assert.match(src, /after600/);
    assert.match(src, /setViewport\(\{\s*width:\s*2000/);
    assert.match(src, /setViewport\(\{\s*width:\s*600/);
  });

  it('flags any page whose baseline diff exceeds 0.5%', () => {
    assert.match(src, /flagged:\s*percent\s*>\s*0\.5/);
  });

  it('seeds baselines on first run and records baseline:"captured"', () => {
    assert.match(src, /baseline:\s*['"]captured['"]/);
    assert.match(src, /copyFileSync\(\s*shotPath,\s*baselinePath\s*\)/);
  });

  it('appends a visual key with the spec-shaped fields onto the report', () => {
    assert.match(src, /visual,/);
    assert.match(src, /overflow:\s*\[\]/);
    assert.match(src, /clipping:\s*\[\]/);
    assert.match(src, /diff:\s*\[\]/);
    assert.match(src, /autofit:/);
  });
});

// -----------------------------------------------------------------
// (b) tools/ux/package.json -- dev deps.
// -----------------------------------------------------------------

describe('tools/ux/package.json dependencies', () => {
  const pkg = JSON.parse(fs.readFileSync(UX_PKG, 'utf8'));

  it('lists pixelmatch and pngjs as dependencies', () => {
    assert.ok(pkg.dependencies && typeof pkg.dependencies === 'object');
    assert.ok(pkg.dependencies.pixelmatch, 'missing pixelmatch');
    assert.ok(pkg.dependencies.pngjs, 'missing pngjs');
  });

  it('keeps the ux tool as a private package so it never gets published', () => {
    assert.strictEqual(pkg.private, true);
  });

  it('keeps puppeteer-core alongside the new deps', () => {
    assert.ok(pkg.dependencies['puppeteer-core'], 'puppeteer-core should still be listed');
  });
});

// -----------------------------------------------------------------
// (c) web/src/components/XtermView.tsx -- auto-fit regression fix.
//
// 8.22 originally landed this wiring inside WorkerDetail.tsx against a
// stripAnsi pre-block. 8.24 + 8.27 replaced that pre-block with an
// xterm.js Terminal so Claude Code's in-place redraws (spinner/thinking
// box, alt-screen TUI) render correctly. The auto-fit + debounce +
// POST /api/resize contract from 8.22 moved with the implementation; the
// checks below follow so the regression guard is still live, just against
// the current code path.
// -----------------------------------------------------------------

describe('XtermView auto-fit wiring (8.22 P1 carried into 8.24)', () => {
  const xtermView = path.join(REPO_ROOT, 'web', 'src', 'components', 'XtermView.tsx');
  const src = fs.readFileSync(xtermView, 'utf8');

  it('reads the VITE_AUTOFIT_DEBUG env and leaves the toggle in place', () => {
    assert.match(src, /VITE_AUTOFIT_DEBUG/);
    assert.match(src, /AUTOFIT_DEBUG/);
  });

  it('logs cols/rows and the POST target when the debug toggle is on', () => {
    assert.match(src, /\[autofit\][^'"]*POST \/api\/resize/);
    assert.match(src, /console\.debug\(/);
  });

  it('POSTs to /api/resize (the 8.19 withApiPrefix path, not bare /resize)', () => {
    assert.match(src, /apiFetch\(['"]\/api\/resize['"]/);
    // Should never carry the pre-8.19 bare path.
    assert.ok(!/apiFetch\(['"]\/resize['"]/.test(src), 'bare /resize POST must be gone');
  });

  it('clamps cols + rows to the daemon 20..400 / 5..200 range', () => {
    assert.match(src, /MIN_COLS\s*=\s*20/);
    assert.match(src, /MAX_COLS\s*=\s*400/);
    assert.match(src, /MIN_ROWS\s*=\s*5/);
    assert.match(src, /MAX_ROWS\s*=\s*200/);
    assert.match(src, /clampInt\(/);
  });

  it('wires a ResizeObserver on the xterm container alongside window.addEventListener(resize)', () => {
    assert.match(src, /new ResizeObserver\(/);
    assert.match(src, /obs\.observe\(container\)/);
    assert.match(src, /window\.addEventListener\(['"]resize['"]/);
  });

  it('debounces recompute at 120ms and dedupes the POST against the last dims', () => {
    assert.match(src, /FIT_DEBOUNCE_MS\s*=\s*120/);
    assert.match(src, /lastResizeRef/);
  });

  it('guards against zero-sized container + non-finite measurements (never POST 0)', () => {
    // xterm's fit-addon throws on a 0x0 container; Number.isFinite guards
    // the raw cols/rows before we clamp + POST.
    assert.match(src, /rawCols\s*<=\s*0/);
    assert.match(src, /Number\.isFinite\(rawCols\)/);
  });
});

// -----------------------------------------------------------------
// (d) src/screen-buffer.js -- scrollback re-flow on cols shrink.
// -----------------------------------------------------------------

describe('ScreenBuffer.resize scrollback re-flow (8.22 P1)', () => {
  const src = fs.readFileSync(SCREEN_BUFFER, 'utf8');

  it('re-flows scrollback lines when cols shrink', () => {
    // We key on the comment + the slice-by-cols loop so a rewrite that
    // drops the behaviour but keeps a shim trips this assertion.
    assert.match(src, /re-flow/i);
    assert.match(src, /line\.slice\(k,\s*k\s*\+\s*c\)/);
  });

  it('caps re-flowed scrollback at maxScrollback', () => {
    assert.match(src, /reflowed\.length\s*>\s*this\.maxScrollback/);
  });
});
