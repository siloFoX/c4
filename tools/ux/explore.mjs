#!/usr/bin/env node
// UX exploration runner: click-through every view, screenshot, collect issues.
// Usage: node explore.mjs --iteration N
// Credentials: reads /tmp/c4-silofox-cred as password, username 'silofox'.

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CHROME = '/root/.cache/puppeteer/chrome/linux-147.0.7727.56/chrome-linux64/chrome';
const BASE = process.env.UX_BASE || 'http://localhost:5174';
const CRED_FILE = '/tmp/c4-silofox-cred';
const USER = 'silofox';

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
    await delay(600);
    const stillAuthed = await page.$('#c4-user') === null;
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

  const grouped = { critical: [], warn: [], info: [] };
  for (const i of issues) grouped[i.severity].push(i);

  const report = {
    iteration,
    timestamp: new Date().toISOString(),
    counts: { critical: grouped.critical.length, warn: grouped.warn.length, info: grouped.info.length },
    issues: grouped,
  };
  fs.writeFileSync(path.join(REPORT_ROOT, 'report.json'), JSON.stringify(report, null, 2));

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
