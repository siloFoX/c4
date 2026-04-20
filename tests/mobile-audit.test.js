'use strict';

// 8.23 -- mobile UI audit source-grep locks.
//
// Same pattern as ux-visual (8.22): no live browser runs in the test
// suite. We only want to guarantee that the mobile-device plumbing +
// mobile-specific checks stay wired against future refactors. Actual
// device emulation + screenshots + diffs run out-of-band via
// `node tools/ux/explore.mjs`.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');

const REPO_ROOT = path.join(__dirname, '..');
const EXPLORE = path.join(REPO_ROOT, 'tools', 'ux', 'explore.mjs');
const UX_PKG = path.join(REPO_ROOT, 'tools', 'ux', 'package.json');

// -----------------------------------------------------------------
// (a) tools/ux/explore.mjs -- mobile audit wiring.
// -----------------------------------------------------------------

describe('tools/ux/explore.mjs mobile audit wiring (8.23)', () => {
  const src = fs.readFileSync(EXPLORE, 'utf8');

  it('imports KnownDevices alongside the default puppeteer export', () => {
    assert.match(src, /KnownDevices/);
    assert.match(src, /import\s+puppeteer\s*,\s*\{\s*KnownDevices\s*\}\s*from\s+['"]puppeteer(-core)?['"]/);
  });

  it('declares MOBILE_DEVICES with iPhone 13 / iPhone SE / Galaxy S20 / iPad Mini', () => {
    assert.match(src, /MOBILE_DEVICES\s*=/);
    assert.match(src, /KnownDevices\[\s*['"]iPhone 13['"]\s*\]/);
    assert.match(src, /KnownDevices\[\s*['"]iPhone SE['"]\s*\]/);
    assert.match(src, /KnownDevices\[\s*['"]Galaxy S20['"]\s*\]/);
    assert.match(src, /KnownDevices\[\s*['"]iPad Mini['"]\s*\]/);
    // Spec-named device ids for stable filenames + report keys.
    assert.match(src, /id:\s*['"]iphone-13['"]/);
    assert.match(src, /id:\s*['"]iphone-se['"]/);
    assert.match(src, /id:\s*['"]galaxy-s20['"]/);
    assert.match(src, /id:\s*['"]ipad-mini['"]/);
  });

  it('declares ORIENTATIONS with portrait + landscape', () => {
    assert.match(src, /ORIENTATIONS\s*=\s*\[\s*['"]portrait['"]\s*,\s*['"]landscape['"]\s*\]/);
  });

  it('checks touch-target size against the 44x44 guideline (iOS/Android)', () => {
    assert.match(src, /r\.width\s*<\s*44/);
    assert.match(src, /r\.height\s*<\s*44/);
    assert.match(src, /detectTouchTargets/);
    // Spec selector list for interactive elements.
    assert.match(src, /button,\s*a\[href\],\s*\[role="button"\],\s*input,\s*\[role="link"\]/);
  });

  it('flags text whose computed font-size is under 14px', () => {
    assert.match(src, /MIN\s*=\s*14/);
    assert.match(src, /size\s*<\s*MIN/);
    assert.match(src, /detectSmallFonts/);
    // TreeWalker-based walk per spec.
    assert.match(src, /TreeWalker|createTreeWalker/);
    assert.match(src, /SHOW_TEXT/);
  });

  it('flips isMobile + hasTouch + isLandscape on the landscape viewport swap', () => {
    assert.match(src, /isMobile:\s*true/);
    assert.match(src, /hasTouch:\s*true/);
    assert.match(src, /isLandscape:\s*true/);
    // Width/height swap comes from the device viewport record.
    assert.match(src, /width:\s*device\.viewport\.height/);
    assert.match(src, /height:\s*device\.viewport\.width/);
  });

  it('parses the --skip-mobile flag to short-circuit the mobile pass', () => {
    assert.match(src, /process\.argv\.includes\(\s*['"]--skip-mobile['"]\s*\)/);
    assert.match(src, /skipMobile/);
    // The guard around runMobileAudit so the 8.22 desktop pass stays
    // stand-alone when the flag is set.
    assert.match(src, /if\s*\(\s*!\s*skipMobile\s*\)/);
  });

  it('writes screenshots under patches/ui-audit-<date>/mobile/', () => {
    assert.match(src, /AUDIT_MOBILE_DIR/);
    assert.match(src, /path\.join\(\s*AUDIT_DIR,\s*['"]mobile['"]\s*\)/);
  });

  it('reads baselines from patches/ui-audit-baseline/mobile/', () => {
    assert.match(src, /BASELINE_MOBILE_DIR/);
    assert.match(src, /path\.join\(\s*BASELINE_DIR,\s*['"]mobile['"]\s*\)/);
  });

  it('flags mobile baseline diffs at the same 0.5% threshold as 8.22', () => {
    // One occurrence from runVisualAudit, one from runMobileAudit.
    const matches = src.match(/flagged:\s*percent\s*>\s*0\.5/g) || [];
    assert.ok(matches.length >= 2, `expected >=2 flagged checks, found ${matches.length}`);
  });

  it('probes the soft keyboard only for iPhone 13 + Galaxy S20 portrait', () => {
    assert.match(src, /SOFT_KEYBOARD_DEVICES/);
    assert.match(src, /SOFT_KEYBOARD_PAGES/);
    assert.match(src, /probeSoftKeyboard/);
    // Spec page list: /, /workflows, /settings.
    assert.match(src, /['"]\/workflows['"]/);
    assert.match(src, /['"]\/settings['"]/);
    // visualViewport is the spec measurement surface.
    assert.match(src, /visualViewport/);
  });

  it('detects hover-only affordances via a stylesheet walk', () => {
    assert.match(src, /detectHoverOnly/);
    assert.match(src, /document\.styleSheets/);
    assert.match(src, /:hover/);
  });

  it('re-uses detectOverflow + detectClipping from the 8.22 pass', () => {
    // We walk the same helpers from inside the mobile runner rather
    // than re-implementing them.
    const mobileBody = src.slice(src.indexOf('async function runMobileAudit'));
    assert.match(mobileBody, /detectOverflow\(page\)/);
    assert.match(mobileBody, /detectClipping\(page\)/);
  });

  it('appends a mobile key with the spec-shaped fields to the report', () => {
    assert.match(src, /\bmobile,\s*$/m);
    // All seven list fields per the P3 report shape.
    assert.match(src, /touchTargets:\s*\[\]/);
    assert.match(src, /smallFonts:\s*\[\]/);
    assert.match(src, /hoverOnly:\s*\[\]/);
    assert.match(src, /softKeyboard:\s*\[\]/);
    // overflow + clipping + diff arrays also re-initialized for mobile.
    const mobileBody = src.slice(src.indexOf('const mobile = {'));
    assert.match(mobileBody, /overflow:\s*\[\]/);
    assert.match(mobileBody, /clipping:\s*\[\]/);
    assert.match(mobileBody, /diff:\s*\[\]/);
    // devices/orientations/pages carry into the report for auditors.
    assert.match(mobileBody, /devices:\s*MOBILE_DEVICES\.map/);
    assert.match(mobileBody, /orientations:\s*ORIENTATIONS/);
    assert.match(mobileBody, /pages:\s*VISUAL_PAGES\.map/);
  });

  it('runs the mobile pass after the 8.22 visual pass', () => {
    const visualIdx = src.indexOf('runVisualAudit(launchBrowser)');
    const mobileIdx = src.indexOf('runMobileAudit(launchBrowser)');
    assert.ok(visualIdx >= 0, 'runVisualAudit call not found');
    assert.ok(mobileIdx >= 0, 'runMobileAudit call not found');
    assert.ok(visualIdx < mobileIdx, 'mobile pass must come after visual pass in main()');
  });

  it('shares a single browser instance across the mobile sweep (perf guard)', () => {
    const inside = src.slice(src.indexOf('async function runMobileAudit'));
    const body = inside.slice(0, inside.indexOf('\nasync function '));
    const launches = body.match(/launchBrowser\(\)/g) || [];
    assert.strictEqual(
      launches.length,
      1,
      `expected exactly 1 launchBrowser() inside runMobileAudit, found ${launches.length}`,
    );
  });
});

// -----------------------------------------------------------------
// (b) tools/ux/package.json -- no new deps expected.
// -----------------------------------------------------------------

describe('tools/ux/package.json dependencies (8.23)', () => {
  const pkg = JSON.parse(fs.readFileSync(UX_PKG, 'utf8'));

  it('still lists puppeteer-core as a dependency', () => {
    assert.ok(pkg.dependencies['puppeteer-core'], 'puppeteer-core should still be listed');
  });

  it('still lists pixelmatch + pngjs (inherited from 8.22 baseline diff)', () => {
    assert.ok(pkg.dependencies.pixelmatch, 'pixelmatch should still be listed');
    assert.ok(pkg.dependencies.pngjs, 'pngjs should still be listed');
  });

  it('keeps the ux tool as a private package', () => {
    assert.strictEqual(pkg.private, true);
  });
});
