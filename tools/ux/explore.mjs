#!/usr/bin/env node
// UX exploration runner: click-through every view, screenshot, collect issues.
// Usage: node explore.mjs --iteration N
// Credentials: reads /tmp/c4-silofox-cred as password, username 'silofox'.
//
// 8.22 adds a visual regression pass (per-viewport screenshot sweeps,
// overflow + ellipsis-clipping detectors, pixelmatch baseline diff,
// terminal auto-fit anchor capture). Artifacts land under
// patches/ui-audit-<date>/ with baselines at patches/ui-audit-baseline/.

import puppeteer, { KnownDevices } from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const CHROME = '/root/.cache/puppeteer/chrome/linux-147.0.7727.56/chrome-linux64/chrome';
const BASE = process.env.UX_BASE || 'http://localhost:5174';
const CRED_FILE = '/tmp/c4-silofox-cred';
const USER = 'silofox';

// Repo root inferred from this file's path (tools/ux/explore.mjs -> ../..).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
let iteration = 1;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--iteration' && args[i + 1]) iteration = Number(args[i + 1]);
}

const REPORT_ROOT = path.resolve('/root/c4-worktree-ux-explorer/ux-reports', String(iteration));
const SHOTS_DIR = path.join(REPORT_ROOT, 'screenshots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const password = fs.readFileSync(CRED_FILE, 'utf8').trim();
const issues = [];
const seenIssue = new Set();
let expectAuth = false; // set true once we are logged in; false during deliberate token-clear / pre-login
const pushIssue = (severity, view, message, extra = {}) => {
  const key = `${severity}|${view}|${message}`;
  if (seenIssue.has(key)) return;
  seenIssue.add(key);
  issues.push({ severity, view, message, ...extra });
  console.log(`[${severity}] ${view}: ${message}`);
};

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, label: 'desktop' },
  mobile: { width: 375, height: 667, label: 'mobile' },
};

// 8.22 P2 visual regression viewports. P3 in 8.23 will add mobile
// device emulations (iPhone 13 / iPhone SE / Galaxy S20 / iPad mini) on
// top of this list without touching the existing entries.
const VIEWPORTS_VISUAL = [
  { name: 'desktop-xl', width: 1920, height: 1080 },
  { name: 'desktop-md', width: 1366, height: 768 },
  { name: 'tablet',     width: 1024, height: 768 },
];

const VISUAL_PAGES = [
  { route: '/',          tabId: null },
  { route: '/workers',   tabId: 'workers' },
  { route: '/chat',      tabId: 'chat' },
  { route: '/history',   tabId: 'history' },
  { route: '/workflows', tabId: 'workflows' },
  { route: '/features',  tabId: 'features' },
  { route: '/sessions',  tabId: 'sessions' },
  { route: '/settings',  tabId: 'settings' },
];

// Audit output layout (8.22). Baselines are persistent across runs;
// per-run artifacts go under patches/ui-audit-<date>/.
const AUDIT_DATE = new Date().toISOString().slice(0, 10);
const AUDIT_DIR = path.join(REPO_ROOT, 'patches', `ui-audit-${AUDIT_DATE}`);
const AUDIT_SCREENS_DIR = path.join(AUDIT_DIR, 'screens');
const AUDIT_DIFF_DIR = path.join(AUDIT_DIR, 'diffs');
const BASELINE_DIR = path.join(REPO_ROOT, 'patches', 'ui-audit-baseline');
const AUDIT_REPORT_PATH = path.join(AUDIT_DIR, 'ui-audit-report.json');

// 8.23 -- mobile device emulations. puppeteer's KnownDevices carries
// device pixel ratio + user agent + touch/isMobile flags so the layout
// sees the same inputs as a real handset instead of a naked resize.
const MOBILE_DEVICES = [
  { id: 'iphone-13',  device: KnownDevices['iPhone 13']  },
  { id: 'iphone-se',  device: KnownDevices['iPhone SE']  },
  { id: 'galaxy-s20', device: KnownDevices['Galaxy S20'] },
  { id: 'ipad-mini',  device: KnownDevices['iPad Mini']  },
];

const ORIENTATIONS = ['portrait', 'landscape'];

// Soft-keyboard probe scope: only the largest portrait device per family
// runs this check so we don't burn runtime on the 64-screenshot sweep.
const SOFT_KEYBOARD_PAGES = ['/', '/workflows', '/settings'];
const SOFT_KEYBOARD_DEVICES = new Set(['iphone-13', 'galaxy-s20']);

const AUDIT_MOBILE_DIR    = path.join(AUDIT_DIR, 'mobile');
const BASELINE_MOBILE_DIR = path.join(BASELINE_DIR, 'mobile');

const TOP_VIEWS = ['workers', 'chat', 'history', 'workflows'];
const DETAIL_MODES = ['terminal', 'chat', 'control'];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function attachListeners(page, tag) {
  page.on('pageerror', (err) => {
    pushIssue('critical', tag, `pageerror: ${err.message}`);
  });
  page.on('response', async (res) => {
    if (res.url().includes('/auth/status')) {
      let body = '';
      try { body = (await res.text()).slice(0, 120); } catch {}
      console.log(`[auth-status ${tag}] HTTP ${res.status()} body=${body}`);
    }
  });
  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error') {
      const text = msg.text();
      if (text.includes('Failed to load resource') && text.includes('404') && text.includes('favicon')) return;
      // Suppress generic "Failed to load resource" 401 lines — the response handler below
      // captures real 401s with the URL; this dup just adds noise.
      if (text.includes('Failed to load resource') && text.includes('401')) return;
      pushIssue('warn', tag, `console.error: ${text.slice(0, 400)}`);
    }
  });
  page.on('requestfailed', (req) => {
    const f = req.failure();
    const url = req.url();
    if (url.includes('hot-update') || url.endsWith('favicon.ico')) return;
    // EventSource (SSE) reconnect aborts on logout / token clear are normal.
    if (url.includes('/api/events') && (f?.errorText === 'net::ERR_ABORTED')) return;
    pushIssue('warn', tag, `request failed ${url}: ${f?.errorText || 'unknown'}`);
  });
  page.on('response', async (res) => {
    const status = res.status();
    const url = res.url();
    if (status >= 500) pushIssue('critical', tag, `HTTP ${status} ${url}`);
    else if (status === 401 && !url.endsWith('/auth/login') && !url.endsWith('/auth/status')) {
      // 401s while we deliberately clear the token / are on the login page are expected.
      if (!expectAuth) return;
      pushIssue('warn', tag, `HTTP 401 ${url}`);
    }
  });
}

async function shot(page, name, vp) {
  const safe = name.replace(/[^a-z0-9_-]/gi, '_');
  const file = path.join(SHOTS_DIR, `${vp}_${safe}.png`);
  try {
    await page.screenshot({ path: file, fullPage: true });
  } catch (e) {
    pushIssue('warn', name, `screenshot failed: ${e.message}`);
  }
}

async function loginFlow(page, vp) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 30000 });
  // Wait until React leaves the initial 'Loading...' splash so that we can
  // tell apart "still booting" from "fail-open dashboard".
  try {
    await page.waitForFunction(() => {
      const t = (document.body && document.body.innerText) || '';
      return !t.startsWith('Loading');
    }, { timeout: 10000 });
  } catch { /* fall through to probe */ }
  const probe = await page.evaluate(() => ({
    hasUser: !!document.getElementById('c4-user'),
    bodyText: (document.body && document.body.innerText || '').slice(0, 240),
  }));
  if (!probe.hasUser && !probe.bodyText.startsWith('Loading')) {
    pushIssue('critical', 'auth-fail-open',
      `dashboard rendered with no token. bodyText="${probe.bodyText.replace(/\s+/g, ' ').slice(0, 160)}"`);
    throw new Error('login form not rendered without token');
  }
  await page.waitForSelector('#c4-user', { timeout: 15000 });
  await shot(page, 'login', vp);

  // Invalid creds attempt
  await page.type('#c4-user', 'wronguser');
  await page.type('#c4-password', 'wrongpass');
  const [resp] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/auth/login')).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  if (resp) {
    const st = resp.status();
    if (st !== 401 && st !== 403) pushIssue('warn', 'login-invalid', `expected 401 got ${st}`);
  }
  await delay(400);
  await shot(page, 'login_invalid', vp);

  // Check for error role="alert"
  const hasAlert = await page.$('[role="alert"]');
  if (!hasAlert) pushIssue('warn', 'login-invalid', 'no role="alert" on invalid login');

  // Clear fields via keyboard (React-safe) and submit valid creds
  await page.click('#c4-user', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('#c4-user', USER);
  await page.click('#c4-password', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('#c4-password', password);
  await Promise.all([
    page.waitForResponse(r => r.url().includes('/auth/login') && r.status() === 200, { timeout: 15000 }),
    page.keyboard.press('Enter'),
  ]);
  await page.waitForSelector('header', { timeout: 15000 });
  expectAuth = true;
  await shot(page, 'post_login', vp);
}

async function visitTopView(page, view, vp) {
  const sel = `button[data-testid="top-tab-${view}"]`;
  const selGeneric = `button:has-text("${view}")`;
  let clicked = false;
  const exists = await page.$(sel);
  if (exists) {
    await page.click(sel);
    clicked = true;
  } else {
    // try by role/name
    const candidates = await page.$$eval('header button', btns =>
      btns.map((b, i) => ({ i, text: (b.textContent || '').trim().toLowerCase() }))
    );
    const cap = view.toLowerCase();
    const hit = candidates.find(c => c.text === cap || c.text.includes(cap));
    if (hit) {
      const elHandle = (await page.$$('header button'))[hit.i];
      await elHandle.click();
      clicked = true;
    }
  }
  if (!clicked) {
    pushIssue('warn', `top-${view}`, 'top tab button not found');
    return;
  }
  await delay(800);
  await shot(page, `top_${view}`, vp);
}

async function exploreWorkersView(page, vp) {
  // Ensure sidebar open (desktop defaults open)
  await shot(page, 'workers_initial', vp);

  // Toggle sidebar mode (list/tree)
  const modeButtons = await page.$$('button[aria-label*="list"], button[aria-label*="tree"], button[aria-label*="List"], button[aria-label*="Tree"]');
  if (modeButtons.length) {
    for (const btn of modeButtons) {
      try { await btn.click(); await delay(300); } catch {}
    }
    await shot(page, 'workers_mode_toggle', vp);
  }

  // Click refresh if present
  const refreshBtn = await page.$('button[aria-label*="efresh"], button[title*="efresh"]');
  if (refreshBtn) {
    await refreshBtn.click();
    await delay(400);
  }

  // Select first worker if any
  const firstWorker = await page.$('aside li button, aside [role="button"]');
  if (firstWorker) {
    await firstWorker.click();
    await delay(600);
    await shot(page, 'worker_selected', vp);

    // Cycle detail tabs
    for (const mode of DETAIL_MODES) {
      const btn = await page.$(`button[data-tab="${mode}"], button[aria-label*="${mode}"]`);
      if (btn) {
        await btn.click();
        await delay(500);
      } else {
        // try by visible text
        const all = await page.$$('button');
        for (const b of all) {
          const t = await b.evaluate(el => (el.textContent || '').trim().toLowerCase());
          if (t === mode || t.includes(mode)) {
            try { await b.click(); await delay(500); break; } catch {}
          }
        }
      }
      await shot(page, `detail_${mode}`, vp);
    }
  } else {
    pushIssue('info', 'workers', 'no workers in sidebar list');
  }
}

async function exploreChatGlobal(page, vp) {
  await shot(page, 'global_chat', vp);
  const input = await page.$('textarea, input[type="text"]');
  if (input) {
    await input.focus();
    await page.keyboard.type('ping from ux-explorer');
    await shot(page, 'global_chat_typed', vp);
    // Do NOT actually submit global chat — may spawn work. Clear it.
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
  } else {
    pushIssue('info', 'global-chat', 'no input field visible');
  }
}

async function exploreHistory(page, vp) {
  await shot(page, 'history_initial', vp);
  // Try search input
  const search = await page.$('input[type="search"], input[placeholder*="earch" i]');
  if (search) {
    await search.type('test');
    await delay(400);
    await shot(page, 'history_search', vp);
    await search.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
  }
  // Row click if any
  const firstRow = await page.$('table tbody tr, [role="row"]');
  if (firstRow) {
    try { await firstRow.click(); await delay(400); await shot(page, 'history_row_open', vp); } catch {}
  }
}

async function exploreWorkflows(page, vp) {
  await shot(page, 'workflows_initial', vp);
  const refresh = await page.$('button[aria-label*="efresh" i], button[title*="efresh" i]');
  if (refresh) { await refresh.click(); await delay(300); }
}

async function escapeCheck(page, vp) {
  // Open any menu/dropdown and press Escape
  const btns = await page.$$('button[aria-haspopup], button[aria-expanded]');
  for (const b of btns.slice(0, 2)) {
    try {
      await b.click();
      await delay(200);
      await page.keyboard.press('Escape');
      await delay(200);
    } catch {}
  }
}

async function keyboardFocusCheck(page, vp) {
  await page.keyboard.press('Tab');
  await delay(100);
  await page.keyboard.press('Tab');
  await delay(100);
  const active = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    const style = getComputedStyle(el);
    return { tag: el.tagName, outline: style.outlineStyle, outlineWidth: style.outlineWidth, boxShadow: style.boxShadow };
  });
  if (active && active.outline === 'none' && (!active.boxShadow || active.boxShadow === 'none')) {
    pushIssue('warn', 'a11y-focus', `tabbed focus has no visible focus ring on ${active.tag}`);
  }
  await shot(page, 'focus_ring', vp);
}

async function checkTextTruncation(page, vp) {
  const overflow = await page.evaluate(() => {
    const out = [];
    const els = document.querySelectorAll('button, a, span, div, li, td');
    for (const el of els) {
      if (el.scrollWidth > el.clientWidth + 4) {
        const cs = getComputedStyle(el);
        if (cs.overflow === 'visible' && cs.textOverflow !== 'ellipsis' && cs.whiteSpace === 'nowrap') {
          out.push({
            tag: el.tagName,
            id: el.id,
            cls: (el.className || '').toString().slice(0, 80),
            text: (el.textContent || '').slice(0, 80),
          });
          if (out.length > 6) break;
        }
      }
    }
    return out;
  });
  for (const o of overflow) {
    pushIssue('info', 'text-overflow', `possible overflow on <${o.tag}> class="${o.cls}" text="${o.text}"`);
  }
}

async function ariaLabelCheck(page, vp) {
  const missing = await page.evaluate(() => {
    const icons = document.querySelectorAll('button');
    const out = [];
    icons.forEach(b => {
      const text = (b.textContent || '').trim();
      const aria = b.getAttribute('aria-label');
      const title = b.getAttribute('title');
      if (!text && !aria && !title) {
        out.push({ html: b.outerHTML.slice(0, 180) });
      }
    });
    return out.slice(0, 10);
  });
  for (const m of missing) pushIssue('warn', 'a11y-aria', `icon-only button missing label: ${m.html}`);
}

async function logoutFlow(page, vp) {
  expectAuth = false; // any 401 after this point is expected
  // Look for logout/sign-out button
  const logoutBtn = await page.$('button[aria-label*="ogout" i], button[aria-label*="ign out" i], button[title*="ogout" i]');
  if (logoutBtn) {
    await logoutBtn.click();
    await delay(600);
    await shot(page, 'post_logout', vp);
  } else {
    // search by text
    const candidates = await page.$$('button');
    for (const b of candidates) {
      const t = await b.evaluate(el => (el.textContent || '').trim().toLowerCase());
      if (t === 'sign out' || t === 'logout' || t === 'log out') {
        try { await b.click(); await delay(600); await shot(page, 'post_logout', vp); break; } catch {}
      }
    }
  }
}

async function runForViewport(launchBrowser, vpKey) {
  const vp = VIEWPORTS[vpKey];
  // Fresh browser per viewport so localStorage is guaranteed isolated.
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: vp.width, height: vp.height });
  attachListeners(page, vpKey);

  expectAuth = false;
  try {
    await loginFlow(page, vp.label);
    // workers
    await visitTopView(page, 'workers', vp.label);
    await exploreWorkersView(page, vp.label);
    await ariaLabelCheck(page, vp.label);
    await checkTextTruncation(page, vp.label);
    await keyboardFocusCheck(page, vp.label);
    await escapeCheck(page, vp.label);
    // chat
    await visitTopView(page, 'chat', vp.label);
    await exploreChatGlobal(page, vp.label);
    // history
    await visitTopView(page, 'history', vp.label);
    await exploreHistory(page, vp.label);
    // workflows
    await visitTopView(page, 'workflows', vp.label);
    await exploreWorkflows(page, vp.label);
    // 401 simulation: clear token, reload. Mark as deliberately unauth so the
    // 401 noise during the logout race is not counted as a regression.
    expectAuth = false;
    await page.evaluate(() => { try { localStorage.removeItem('c4.authToken'); } catch {} });
    await page.reload({ waitUntil: 'networkidle2' });
    let stillAuthed = false;
    try {
      await page.waitForFunction(() => {
        const t = (document.body && document.body.innerText) || '';
        return !t.startsWith('Loading') && !t.includes('Loading...');
      }, { timeout: 8000 });
      stillAuthed = (await page.$('#c4-user')) === null;
    } catch {
      stillAuthed = (await page.$('#c4-user')) === null;
    }
    if (stillAuthed) {
      pushIssue('warn', 'auth-clear', 'after removing c4.authToken + reload, login form did not render (auth state stuck)');
    }
    await shot(page, 'after_token_clear', vp.label);
    // Re-login + sign out cycle (only if we actually got back to login)
    if (!stillAuthed) {
      await loginFlow(page, vp.label);
      await logoutFlow(page, vp.label);
    }
  } catch (e) {
    pushIssue('critical', `flow-${vpKey}`, `unhandled: ${e.message}`);
    try { await shot(page, `crash_${vpKey}`, vp.label); } catch {}
  } finally {
    await page.close();
    await browser.close();
  }
}

// -------------------------------------------------------------------
// 8.22 P2 -- visual regression helpers.
// -------------------------------------------------------------------

function routeSlug(route) {
  if (route === '/') return 'root';
  return route.replace(/^\//, '').replace(/[^a-z0-9_-]/gi, '_') || 'root';
}

async function pixelDiffAgainstBaseline(baselinePath, candidatePath, diffOutPath) {
  // Dynamic import keeps pixelmatch + pngjs out of the main runtime
  // module graph. pixelmatch v6 publishes as ESM; pngjs ships CJS so it
  // lands on the default export.
  const [{ default: pixelmatch }, pngMod] = await Promise.all([
    import('pixelmatch'),
    import('pngjs'),
  ]);
  const PNG = pngMod.PNG || pngMod.default?.PNG || pngMod.default;
  const a = PNG.sync.read(fs.readFileSync(baselinePath));
  const b = PNG.sync.read(fs.readFileSync(candidatePath));
  if (a.width !== b.width || a.height !== b.height) {
    // Size mismatch is a 100% diff -- the flag threshold treats it as flagged.
    return { percent: 100, sizeMismatch: true };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const changed = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold: 0.1,
  });
  try {
    fs.writeFileSync(diffOutPath, PNG.sync.write(diff));
  } catch {
    /* best-effort */
  }
  return { percent: (changed / (a.width * a.height)) * 100, sizeMismatch: false };
}

// Overflow detector -- flags any element whose right edge escapes the
// viewport. Matches spec 8.22 P2 step 2.
async function detectOverflow(page) {
  return await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth + 1) bad.push({
        tag: el.tagName,
        class: (el.className || '').toString().slice(0, 80),
        right: Math.round(r.right),
        vw: window.innerWidth,
      });
    });
    return bad.slice(0, 20);
  });
}

// Clipping detector -- looks for scrollWidth > clientWidth on elements
// that use overflow:hidden OR text-overflow: ellipsis.
async function detectClipping(page) {
  return await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('*').forEach((el) => {
      const cs = getComputedStyle(el);
      const hasEllipsis = cs.textOverflow === 'ellipsis';
      const hasHidden = cs.overflow === 'hidden' || cs.overflowX === 'hidden';
      if (!hasEllipsis && !hasHidden) return;
      if (el.scrollWidth > el.clientWidth + 1) {
        bad.push({
          tag: el.tagName,
          class: (el.className || '').toString().slice(0, 80),
          // Truncate captured text to 80 chars so the report stays readable.
          text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        });
      }
    });
    return bad.slice(0, 20);
  });
}

async function navigateTo(page, entry) {
  if (entry.tabId) {
    const sel = `button[data-testid="top-tab-${entry.tabId}"]`;
    const btn = await page.$(sel);
    if (btn) {
      await btn.click().catch(() => {});
      await delay(600);
      return;
    }
  }
  // Fallback: ensure we're on the root shell.
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
  await delay(400);
}

// Terminal auto-fit regression anchor for 8.22 P1. Selects the first
// worker in the sidebar, flips auto-fit on, resizes the viewport to
// 2000px then 600px, and captures the server dims label reported by the
// UI each time.
async function captureAutofitAnchor(launchBrowser) {
  const out = { before2000: null, after600: null, note: null };
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    attachListeners(page, 'autofit-anchor');
    await loginFlow(page, 'desktop');
    // Make sure we're on the workers tab so a worker row is in the sidebar.
    await visitTopView(page, 'workers', 'desktop');
    const first = await page.$('aside li button, aside [role="button"]');
    if (!first) {
      out.note = 'no workers in sidebar; autofit anchor skipped';
      return out;
    }
    await first.click();
    await delay(700);

    // Ensure the auto-fit checkbox is on. The label text is 'Auto-fit'.
    const autofitOn = await page.evaluate(() => {
      const labels = [...document.querySelectorAll('label')];
      const target = labels.find((l) => /auto-fit/i.test(l.textContent || ''));
      if (!target) return false;
      const cb = target.querySelector('input[type="checkbox"]');
      if (!cb) return false;
      if (!cb.checked) cb.click();
      return true;
    });
    if (!autofitOn) {
      out.note = 'auto-fit toggle not found';
      return out;
    }

    await page.setViewport({ width: 2000, height: 1200 });
    await delay(600);
    out.before2000 = await readAutofitDims(page);

    await page.setViewport({ width: 600, height: 900 });
    await delay(600);
    out.after600 = await readAutofitDims(page);
  } catch (e) {
    out.note = `autofit anchor error: ${e.message}`;
  } finally {
    await browser.close();
  }
  return out;
}

async function readAutofitDims(page) {
  return await page.evaluate(() => {
    const text = (document.body && document.body.innerText) || '';
    const m = text.match(/dims\s+(\d+)\s*x\s*(\d+)/i);
    if (m) return { cols: Number(m[1]), rows: Number(m[2]) };
    const input = document.querySelector('input[type="number"]');
    if (input && input.value) return { cols: Number(input.value), rows: null };
    return null;
  });
}

async function runVisualAudit(launchBrowser) {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  fs.mkdirSync(AUDIT_SCREENS_DIR, { recursive: true });
  fs.mkdirSync(AUDIT_DIFF_DIR, { recursive: true });
  const baselineExisted = fs.existsSync(BASELINE_DIR);
  fs.mkdirSync(BASELINE_DIR, { recursive: true });

  const visual = {
    viewports: VIEWPORTS_VISUAL.map((v) => v.name),
    pages: VISUAL_PAGES.map((p) => p.route),
    overflow: [],
    clipping: [],
    diff: [],
    autofit: { before2000: null, after600: null, note: null },
    auditDir: path.relative(REPO_ROOT, AUDIT_DIR),
    baselineDir: path.relative(REPO_ROOT, BASELINE_DIR),
    baselineSeededThisRun: !baselineExisted,
  };

  for (const vp of VIEWPORTS_VISUAL) {
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: vp.width, height: vp.height });
      attachListeners(page, `visual-${vp.name}`);
      await loginFlow(page, vp.name);

      for (const entry of VISUAL_PAGES) {
        const slug = routeSlug(entry.route);
        try {
          await navigateTo(page, entry);
          // Small settle wait so layout + lazy content catches up.
          await delay(500);
        } catch (e) {
          pushIssue('warn', `visual-${vp.name}`, `nav ${entry.route} failed: ${e.message}`);
          continue;
        }

        const shotPath = path.join(AUDIT_SCREENS_DIR, `${vp.name}-${slug}.png`);
        try {
          await page.screenshot({ path: shotPath, fullPage: false });
        } catch (e) {
          pushIssue('warn', `visual-${vp.name}`, `screenshot ${entry.route} failed: ${e.message}`);
          continue;
        }

        const overflow = await detectOverflow(page).catch(() => []);
        visual.overflow.push({
          viewport: vp.name,
          page: entry.route,
          count: overflow.length,
          sample: overflow,
        });

        const clipping = await detectClipping(page).catch(() => []);
        visual.clipping.push({
          viewport: vp.name,
          page: entry.route,
          count: clipping.length,
          sample: clipping,
        });

        const baselinePath = path.join(BASELINE_DIR, `${vp.name}-${slug}.png`);
        if (fs.existsSync(baselinePath)) {
          const diffPath = path.join(AUDIT_DIFF_DIR, `${vp.name}-${slug}.png`);
          try {
            const { percent, sizeMismatch } = await pixelDiffAgainstBaseline(
              baselinePath,
              shotPath,
              diffPath,
            );
            visual.diff.push({
              viewport: vp.name,
              page: entry.route,
              percent: Number(percent.toFixed(4)),
              flagged: percent > 0.5,
              sizeMismatch: sizeMismatch || undefined,
            });
          } catch (e) {
            visual.diff.push({
              viewport: vp.name,
              page: entry.route,
              percent: null,
              baseline: 'error',
              error: e.message,
            });
          }
        } else {
          try {
            fs.copyFileSync(shotPath, baselinePath);
          } catch {
            /* ignore */
          }
          visual.diff.push({
            viewport: vp.name,
            page: entry.route,
            baseline: 'captured',
          });
        }
      }
    } catch (e) {
      pushIssue('warn', `visual-${vp.name}`, `unhandled: ${e.message}`);
    } finally {
      await browser.close().catch(() => {});
    }
  }

  // Terminal auto-fit anchor (once, independent of the sweep above so a
  // viewport launch crash does not swallow the P1 regression anchor).
  try {
    const anchor = await captureAutofitAnchor(launchBrowser);
    visual.autofit = anchor;
  } catch (e) {
    visual.autofit.note = `autofit anchor crashed: ${e.message}`;
  }

  return visual;
}

// -------------------------------------------------------------------
// 8.23 -- mobile audit helpers.
// -------------------------------------------------------------------

// Touch-target detector: flags interactive elements smaller than the
// iOS/Android guideline (44x44 CSS px). Skip hidden elements so
// collapsed menus do not pollute the sample.
async function detectTouchTargets(page) {
  return await page.evaluate(() => {
    const SELECTOR = 'button, a[href], [role="button"], input, [role="link"], [tabindex]:not([tabindex="-1"])';
    const bad = [];
    document.querySelectorAll(SELECTOR).forEach((el) => {
      if (el.offsetParent === null) return;
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) {
        bad.push({
          tag: el.tagName,
          class: (el.className || '').toString().slice(0, 80),
          w: Math.round(r.width),
          h: Math.round(r.height),
          text: (el.textContent || '').trim().slice(0, 40),
        });
      }
    });
    return bad.slice(0, 30);
  });
}

// Small-font detector: TreeWalker over text nodes, flag resolved
// font-size < 14px. Skip whitespace-only nodes.
async function detectSmallFonts(page) {
  return await page.evaluate(() => {
    const MIN = 14;
    const out = [];
    if (!document.body) return out;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const raw = node.nodeValue || '';
      if (!raw.trim()) continue;
      const parent = node.parentElement;
      if (!parent) continue;
      const cs = getComputedStyle(parent);
      const size = parseFloat(cs.fontSize);
      if (Number.isFinite(size) && size < MIN) {
        out.push({
          tag: parent.tagName,
          class: (parent.className || '').toString().slice(0, 80),
          text: raw.trim().slice(0, 80),
          size: Math.round(size * 10) / 10,
        });
        if (out.length >= 20) break;
      }
    }
    return out;
  });
}

// Hover-only affordance detector: walk document.styleSheets, look for
// :hover selectors whose declaration touches visibility / display /
// opacity. Best-effort -- CORS-blocked sheets throw on cssRules access
// and are skipped silently. This is advisory (spec 8.23 P2 step 4).
async function detectHoverOnly(page) {
  return await page.evaluate(() => {
    const hits = [];
    const changes = /visibility|display|opacity/i;
    const sheets = Array.from(document.styleSheets || []);
    for (const sheet of sheets) {
      let rules = null;
      try { rules = sheet.cssRules; } catch { continue; }
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        const sel = rule.selectorText || '';
        if (!sel.includes(':hover')) continue;
        const cssText = rule.cssText || '';
        if (!changes.test(cssText)) continue;
        hits.push({
          selector: sel.slice(0, 120),
          cssText: cssText.slice(0, 200),
        });
        if (hits.length >= 20) return hits;
      }
    }
    return hits;
  });
}

// Soft-keyboard probe: focus the first input, compare visualViewport
// height before + after. If the focused element's bottom sits past the
// shrunken viewport, report obscured:true. Returns null when the page
// has no input (spec says skip in that case).
async function probeSoftKeyboard(page) {
  try {
    const before = await page.evaluate(() => {
      const vv = window.visualViewport;
      return vv ? vv.height : window.innerHeight;
    });
    const inputSelector = await page.evaluate(() => {
      const el = document.querySelector('input, textarea');
      if (!el) return null;
      if (el.id) return `#${CSS.escape(el.id)}`;
      return el.tagName.toLowerCase();
    });
    if (!inputSelector) return null;
    try { await page.focus(inputSelector); } catch { /* best-effort */ }
    await delay(400);
    const after = await page.evaluate(() => {
      const vv = window.visualViewport;
      return vv ? vv.height : window.innerHeight;
    });
    const rect = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || typeof el.getBoundingClientRect !== 'function') return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
    const obscured = !!(rect && rect.bottom > after);
    return { viewportBefore: before, viewportAfter: after, obscured };
  } catch {
    return null;
  }
}

async function runMobileAudit(launchBrowser) {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  fs.mkdirSync(AUDIT_DIFF_DIR, { recursive: true });
  fs.mkdirSync(AUDIT_MOBILE_DIR, { recursive: true });
  fs.mkdirSync(BASELINE_DIR, { recursive: true });
  fs.mkdirSync(BASELINE_MOBILE_DIR, { recursive: true });

  const mobile = {
    devices: MOBILE_DEVICES.map((d) => d.id),
    orientations: ORIENTATIONS,
    pages: VISUAL_PAGES.map((p) => p.route),
    overflow: [],
    touchTargets: [],
    smallFonts: [],
    hoverOnly: [],
    softKeyboard: [],
    clipping: [],
    diff: [],
    auditDir:    path.relative(REPO_ROOT, AUDIT_MOBILE_DIR),
    baselineDir: path.relative(REPO_ROOT, BASELINE_MOBILE_DIR),
  };

  // Single browser + single page across the whole sweep so we don't
  // re-launch Chrome 8 times (spec 8.23 P4: share the instance).
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    // Log in under a neutral desktop viewport so the form renders in
    // its familiar layout; we flip to the mobile emulation once
    // authenticated and then cycle emulate() + setViewport().
    await page.setViewport({ width: 1440, height: 900 });
    attachListeners(page, 'mobile');
    await loginFlow(page, 'mobile');

    for (const { id, device } of MOBILE_DEVICES) {
      for (const orientation of ORIENTATIONS) {
        try {
          await page.emulate(device);
          if (orientation === 'landscape') {
            await page.setViewport({
              width: device.viewport.height,
              height: device.viewport.width,
              deviceScaleFactor: device.viewport.deviceScaleFactor,
              isMobile: true,
              hasTouch: true,
              isLandscape: true,
            });
          }
          // Reload so React re-measures against the new viewport + UA.
          try {
            await page.reload({ waitUntil: 'networkidle2', timeout: 15000 });
          } catch { /* best-effort */ }
        } catch (e) {
          pushIssue('warn', `mobile-${id}`, `emulate failed (${orientation}): ${e.message}`);
          continue;
        }

        for (const entry of VISUAL_PAGES) {
          const slug = routeSlug(entry.route);
          const tag = `${id}-${orientation}-${slug}`;
          try {
            await navigateTo(page, entry);
            await delay(500);
          } catch (e) {
            pushIssue('warn', `mobile-${id}`, `nav ${entry.route} failed: ${e.message}`);
            continue;
          }

          const shotPath = path.join(AUDIT_MOBILE_DIR, `${tag}.png`);
          try {
            await page.screenshot({ path: shotPath, fullPage: false });
          } catch (e) {
            pushIssue('warn', `mobile-${id}`, `screenshot ${entry.route} failed: ${e.message}`);
            continue;
          }

          const overflow = await detectOverflow(page).catch(() => []);
          mobile.overflow.push({
            device: id,
            orientation,
            page: entry.route,
            count: overflow.length,
            sample: overflow,
          });

          const touch = await detectTouchTargets(page).catch(() => []);
          mobile.touchTargets.push({
            device: id,
            orientation,
            page: entry.route,
            count: touch.length,
            sample: touch,
          });

          const fonts = await detectSmallFonts(page).catch(() => []);
          mobile.smallFonts.push({
            device: id,
            orientation,
            page: entry.route,
            count: fonts.length,
            sample: fonts,
          });

          const hover = await detectHoverOnly(page).catch(() => []);
          mobile.hoverOnly.push({
            device: id,
            orientation,
            page: entry.route,
            count: hover.length,
            sample: hover,
          });

          const clipping = await detectClipping(page).catch(() => []);
          mobile.clipping.push({
            device: id,
            orientation,
            page: entry.route,
            count: clipping.length,
            sample: clipping,
          });

          if (
            orientation === 'portrait' &&
            SOFT_KEYBOARD_DEVICES.has(id) &&
            SOFT_KEYBOARD_PAGES.includes(entry.route)
          ) {
            const probe = await probeSoftKeyboard(page).catch(() => null);
            if (probe) {
              mobile.softKeyboard.push({
                device: id,
                page: entry.route,
                viewportBefore: probe.viewportBefore,
                viewportAfter: probe.viewportAfter,
                obscured: probe.obscured,
              });
            }
          }

          const baselinePath = path.join(BASELINE_MOBILE_DIR, `${tag}.png`);
          if (fs.existsSync(baselinePath)) {
            const diffPath = path.join(AUDIT_DIFF_DIR, `mobile-${tag}.png`);
            try {
              const { percent, sizeMismatch } = await pixelDiffAgainstBaseline(
                baselinePath,
                shotPath,
                diffPath,
              );
              mobile.diff.push({
                device: id,
                orientation,
                page: entry.route,
                percent: Number(percent.toFixed(4)),
                flagged: percent > 0.5,
                sizeMismatch: sizeMismatch || undefined,
              });
            } catch (e) {
              mobile.diff.push({
                device: id,
                orientation,
                page: entry.route,
                percent: null,
                baseline: 'error',
                error: e.message,
              });
            }
          } else {
            try {
              fs.copyFileSync(shotPath, baselinePath);
            } catch { /* best-effort */ }
            mobile.diff.push({
              device: id,
              orientation,
              page: entry.route,
              baseline: 'captured',
            });
          }
        }
      }
    }
  } catch (e) {
    pushIssue('warn', 'mobile', `unhandled: ${e.message}`);
  } finally {
    await browser.close().catch(() => {});
  }

  return mobile;
}

async function main() {
  const launchBrowser = () => puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  for (const vp of Object.keys(VIEWPORTS)) {
    await runForViewport(launchBrowser, vp);
  }

  // 8.22 P2 visual regression pass. Runs after the main click-through so
  // a crash here cannot block the existing report from landing on disk.
  let visual = null;
  try {
    visual = await runVisualAudit(launchBrowser);
  } catch (e) {
    pushIssue('warn', 'visual', `runVisualAudit crashed: ${e.message}`);
  }

  // 8.23 mobile device emulation pass. Runs AFTER the 8.22 visual pass
  // so a mobile failure cannot swallow the desktop/tablet report. The
  // --skip-mobile flag short-circuits this block so 8.22's desktop pass
  // can still run stand-alone during dev iteration.
  const skipMobile = process.argv.includes('--skip-mobile');
  let mobile = null;
  if (!skipMobile) {
    try {
      mobile = await runMobileAudit(launchBrowser);
    } catch (e) {
      pushIssue('warn', 'mobile', `runMobileAudit crashed: ${e.message}`);
    }
  }

  const grouped = { critical: [], warn: [], info: [] };
  for (const i of issues) grouped[i.severity].push(i);

  const report = {
    iteration,
    timestamp: new Date().toISOString(),
    counts: { critical: grouped.critical.length, warn: grouped.warn.length, info: grouped.info.length },
    issues: grouped,
    visual,
    mobile,
  };
  fs.writeFileSync(path.join(REPORT_ROOT, 'report.json'), JSON.stringify(report, null, 2));
  if (visual || mobile) {
    try {
      fs.writeFileSync(AUDIT_REPORT_PATH, JSON.stringify(report, null, 2));
    } catch (e) {
      pushIssue('warn', 'visual', `failed to write ${AUDIT_REPORT_PATH}: ${e.message}`);
    }
  }

  const md = [];
  md.push(`# UX Exploration Report (iteration ${iteration})`);
  md.push('');
  md.push(`Generated: ${report.timestamp}`);
  md.push('');
  md.push(`- Critical: ${report.counts.critical}`);
  md.push(`- Warn: ${report.counts.warn}`);
  md.push(`- Info: ${report.counts.info}`);
  md.push('');
  for (const sev of ['critical', 'warn', 'info']) {
    if (!grouped[sev].length) continue;
    md.push(`## ${sev.toUpperCase()}`);
    md.push('');
    const seen = new Set();
    for (const it of grouped[sev]) {
      const key = `${it.view}:${it.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      md.push(`- **${it.view}**: ${it.message}`);
    }
    md.push('');
  }
  md.push('## Screenshots');
  const shots = fs.readdirSync(SHOTS_DIR).filter(f => f.endsWith('.png'));
  for (const s of shots) md.push(`- screenshots/${s}`);
  fs.writeFileSync(path.join(REPORT_ROOT, 'summary.md'), md.join('\n'));

  console.log('--- SUMMARY ---');
  console.log(JSON.stringify(report.counts, null, 2));
  console.log('Report:', path.join(REPORT_ROOT, 'report.json'));
  // Exit with non-zero if anything critical
  if (report.counts.critical > 0) process.exitCode = 2;
}

main().catch(e => {
  console.error('FATAL', e);
  process.exitCode = 1;
});
