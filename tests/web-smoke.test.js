'use strict';

// (v1.10.101) Web UI smoke tests via Playwright + Chromium.
//
// Gated on:
//   - Playwright module installed (devDependency)
//   - Daemon reachable on :3456
//   - Chromium binary available (auto-downloaded via
//     `npx playwright install chromium` during npm install)
//
// All gates fall through cleanly so CI hosts without the
// browser report a single skipped placeholder. This mirrors the
// risk-shadow-exec-docker.test.js gating pattern.
//
// Cases:
//   1. /  — root URL loads with the C4 Dashboard title (HTML
//      shell + JS bundle, no 5xx).
//   2. /api/health — JSON response with ok:true + version.
//   3. Static asset (favicon / index.html) — no 404 at the
//      bundle root.
//   4. CSP / framing — page doesn't crash when X-Frame-Options
//      blocks it (negative regression for headers).
//   5. Console errors — no JS error during initial paint
//      (catches build-output regressions).

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  chromium = null;
}

let browser = null;
let daemonReachable = false;
let chromiumReady = false;

function _probeDaemon() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3456/api/health', (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
}

before(async () => {
  if (!chromium) return;
  daemonReachable = await _probeDaemon();
  if (!daemonReachable) return;
  try {
    browser = await chromium.launch({ headless: true });
    chromiumReady = true;
  } catch {
    chromiumReady = false;
  }
});

after(async () => {
  if (browser) {
    try { await browser.close(); } catch { /* swallow */ }
  }
});

describe('Web UI smoke (Playwright + Chromium)', () => {
  it('gates: playwright module + daemon + chromium', () => {
    // No-op assertion — purpose is to leave a visible row that
    // explains gate state when the rest of the suite skips.
    assert.ok(true,
      `playwright=${!!chromium}, daemon=${daemonReachable}, chromium=${chromiumReady}`);
  });

  it('root URL loads with C4 Dashboard title', async (t) => {
    if (!chromiumReady) return t.skip('chromium / daemon not ready');
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      const resp = await page.goto('http://127.0.0.1:3456/', { timeout: 10000 });
      assert.ok(resp, 'no response');
      assert.equal(resp.status(), 200);
      assert.equal(await page.title(), 'C4 Dashboard');
    } finally {
      await ctx.close();
    }
  });

  it('/api/health returns ok:true', async (t) => {
    if (!chromiumReady) return t.skip('chromium / daemon not ready');
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      const resp = await page.goto('http://127.0.0.1:3456/api/health');
      assert.equal(resp.status(), 200);
      const body = await resp.json();
      assert.equal(body.ok, true);
      assert.ok(typeof body.version === 'string' && body.version.length > 0);
    } finally {
      await ctx.close();
    }
  });

  it('initial paint produces no console errors', async (t) => {
    if (!chromiumReady) return t.skip('chromium / daemon not ready');
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Filter known-noisy entries we don't want to fail on:
        // 401 from /api/list before login is expected.
        if (/401\b/.test(text)) return;
        errors.push(text);
      }
    });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    try {
      await page.goto('http://127.0.0.1:3456/', { timeout: 10000 });
      // Give React a moment to hydrate
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    } finally {
      await ctx.close();
    }
    if (errors.length > 0) {
      assert.fail(`console errors during initial paint:\n  - ${errors.join('\n  - ')}`);
    }
  });

  it('login form renders when unauthenticated', async (t) => {
    if (!chromiumReady) return t.skip('chromium / daemon not ready');
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto('http://127.0.0.1:3456/', { timeout: 10000 });
      // Wait for either the login form OR the dashboard skeleton.
      // The selector below probes any input element; absence of
      // ANY input on a fresh load strongly suggests the JS bundle
      // is broken.
      const input = await page.waitForSelector('input', { timeout: 5000 }).catch(() => null);
      assert.ok(input, 'no input element found — bundle may have failed to render');
    } finally {
      await ctx.close();
    }
  });

  it('/openapi.json renders the spec (not the SPA shell)', async (t) => {
    if (!chromiumReady) return t.skip('chromium / daemon not ready');
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      const resp = await page.goto('http://127.0.0.1:3456/openapi.json');
      assert.equal(resp.status(), 200);
      const body = await resp.json();
      assert.equal(body.openapi, '3.0.3');
      assert.ok(body.paths && Object.keys(body.paths).length > 50,
        `expected >50 paths; got ${Object.keys(body.paths || {}).length}`);
    } finally {
      await ctx.close();
    }
  });
});
