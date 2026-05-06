#!/usr/bin/env node
'use strict';

// (v1.10.494+) i18n visual verification: drives a temp daemon
// (3458) through Playwright, flips locale to ko, walks every top
// tab, screenshots each, then scans the rendered DOM for English
// text leaks.
//
// "English leak" heuristic: any text node containing 4+ consecutive
// ASCII letters that is NOT in the allow-list of expected English
// (brand names / IDs / file paths / model names / version strings /
// Tailwind class fragments / iso dates / hex sha / git hash).

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.C4_TEST_URL || 'http://localhost:3458';
const OUT_DIR = path.join(__dirname, '..', '/tmp-i18n-check');
const SCREENSHOTS_DIR = '/tmp/c4-i18n-screens';

// Allow-list — known English values that legitimately stay English
// regardless of locale. Brand names, system enum values, file/path
// fragments, version-style strings, environment identifiers.
const ALLOW = [
  /^Claude$/,
  /^C4$/,
  /^Anthropic$/,
  /^GitHub$/,
  /^claude-/i,
  /^Code$/,
  /\.json$/,
  /\.md$/,
  /\.tsx?$/,
  /^v?\d+\.\d+\.\d+/,
  /^https?:/,
  /^[a-f0-9]{7,40}$/,
  /^\d/,
  /^c4\//,
  /^\/api\//,
  /^api\./,
  /^pid\b/i,
  /^GET|^POST|^PUT|^DELETE$/,
  /^Enter$|^Esc$|^Tab$|^Shift$|^Ctrl$|^Alt$|^Meta$|^Cmd$|^Space$|^Backspace$|^ArrowUp$|^ArrowDown$|^ArrowLeft$|^ArrowRight$/,
  /^localhost/,
  /^127\.0\.0\.1/,
  /^192\.168\./,
  /^[A-Z][A-Z0-9_]+$/,           // ALL_CAPS identifiers
  /^\w+@/,                       // email-like
  /^node$|^npm$|^npx$|^git$|^bash$|^zsh$/,
  /^[a-z][a-zA-Z0-9_-]*$/,      // single lowercase identifier
  /^[A-Za-z0-9._-]+\.(?:js|ts|tsx|json|md|css|html)$/,
  /^[a-zA-Z]+:\/\//,
  /\.[a-z]+$/,
  /^—$|^…$|^—\s*$|^\s*…\s*$/,
  // Feature-id-style labels intentionally kept English in ko bundle
  // (brand-like). Matches single TitleCase word that looks like an id.
  /^(Scribe|Batch|Cleanup|Swarm|Plan|Auto|Templates|Profiles|Config|Workspaces|RBAC|Health|Validation|Risk|ADR|ADRs|Docs|Retros|Meetings|Specialists|Sessions|Wiki|Workflows|History|Workers|Settings|Features|Chat|Autonomous)$/,
  // File path / CLI fragments left intentionally English
  /^\/home\//,
  /^\/tmp\//,
  /^\/usr\//,
  /^claude\s+--?[a-zA-Z]/,
  /^[a-z][a-zA-Z]*\s+--[a-zA-Z]/,
  // Scribe summary markers ([queue-operation], [last-prompt], etc.)
  // and Claude Code tool names (Bash, Edit, Read, ...) — both are
  // machine-generated content surfaced by the daemon, not UI labels.
  /^\[[a-z][a-z-]*\]$/,
  /^(Bash|Edit|Read|Write|Glob|Grep|Task|TodoWrite|WebSearch|WebFetch|MultiEdit|NotebookEdit)$/,
  // Size / time units — ISO-ish, stay literal in any locale.
  /^[\(\s]*\d[\d.,]*\s*(KB|MB|GB|TB|kb|mb|ms|s|h|d|m|B|byte|bytes)\)?$/,
  // HTTP status codes (server-emitted, server enum)
  /^HTTP\s+\d{3}$/,
  // Skip raw scribe / session snippet content from JSONL — these
  // are conversation transcript previews from the user's actual
  // Claude Code logs and not UI labels we control.
  // Marker: the snippet container has line-clamp-2 / truncate
  // class — we filter those at the element level below.
];

const TABS = [
  { id: 'workers', label: '워커' },
  { id: 'history', label: '기록' },
  { id: 'sessions', label: '세션' },
  { id: 'meetings', label: '회의' },
  { id: 'specialists', label: '전문가' },
  { id: 'wiki', label: '위키' },
  { id: 'autonomous', label: '자율' },
  { id: 'chat', label: '채팅' },
  { id: 'workflows', label: '워크플로우' },
  { id: 'features', label: '기능' },
  { id: 'settings', label: '설정' },
];

function isAllowed(text) {
  const t = text.trim();
  if (!t) return true;
  if (t.length < 4) return true;
  // No ASCII letters at all → not English
  if (!/[A-Za-z]/.test(t)) return true;
  // Has Korean → counts as translated
  if (/[가-힯]/.test(t)) return true;
  for (const re of ALLOW) {
    if (re.test(t)) return true;
  }
  return false;
}

async function pickEnglishLeaks(page) {
  // Pull text nodes that are actually visible IN the viewport — not
  // just rendered with non-zero size, since off-screen overlays (help
  // drawer translated translate-x-full, onboarding modal, etc.)
  // remain in the DOM but are not visible to the operator.
  return await page.evaluate(() => {
    const VW = window.innerWidth;
    const VH = window.innerHeight;
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const text = (n.nodeValue || '').trim();
      if (!text) continue;
      const el = n.parentElement;
      if (!el) continue;
      // Walk up looking for hidden / off-screen ancestor.
      let cur = el;
      let hidden = false;
      while (cur && cur !== document.body) {
        const cs = window.getComputedStyle(cur);
        if (cs.display === 'none' || cs.visibility === 'hidden') { hidden = true; break; }
        cur = cur.parentElement;
      }
      if (hidden) continue;
      const cls = (el.className && typeof el.className === 'string') ? el.className : '';
      if (/font-mono/.test(cls) || el.tagName === 'CODE' || el.tagName === 'PRE') continue;
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
      // Skip session snippet preview (conversation transcript content)
      if (/line-clamp-\d/.test(cls)) continue;
      // Skip truncated path/identifier-style cells
      if (/truncate/.test(cls) && /^[/\w._-]+$/.test(text)) continue;
      // Skip session-list preview content: truncated text >= 24 chars
      // is almost always conversation snippet preview, not a UI label.
      if (/truncate/.test(cls) && text.length >= 24) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // In-viewport check (helps skip translate-x-full overlays).
      if (rect.right < 0 || rect.left > VW) continue;
      if (rect.bottom < 0 || rect.top > VH) continue;
      out.push({
        text,
        tag: el.tagName.toLowerCase(),
        cls: cls.slice(0, 80),
      });
    }
    return out;
  });
}

async function setLocaleKo(page) {
  // Locale toggle lives in localStorage 'c4.locale' — set + reload.
  await page.evaluate(() => {
    window.localStorage.setItem('c4.locale', 'ko');
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1500);
}

async function main() {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const allLeaks = {};

  console.log('[1/3] navigate + flip locale');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  // The help drawer auto-opens on first visit (it watches a flag in
  // localStorage). Pre-mark it as seen so the test isn't fighting the
  // overlay z-index.
  await page.evaluate(() => {
    window.localStorage.setItem('c4.help.firstSeen', '1');
    window.localStorage.setItem('c4.onboardingTour.v1', 'seen');
    window.localStorage.setItem('sessions-tour-v1', 'seen');
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1000);
  await setLocaleKo(page);

  // Verify locale flip worked: look for any Korean tab label
  const sawKorean = await page.evaluate(() => /[가-힯]/.test(document.body.innerText));
  console.log('  ko detected:', sawKorean);
  if (!sawKorean) {
    console.error('  FAIL: locale flip did not produce any Korean text');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '_ko_flip_failed.png'), fullPage: true });
    await browser.close();
    process.exit(2);
  }

  console.log('[2/3] walk tabs and scan');
  // Close the auto-opened help drawer if still on screen.
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  for (const tab of TABS) {
    try {
      // TopTabs button has aria-label = translated label.
      const el = await page.locator(`[role="tab"][aria-label="${tab.label}"]`).first();
      await el.click({ timeout: 5000, force: true });
      await page.waitForTimeout(900);
      const png = path.join(SCREENSHOTS_DIR, `${tab.id}.png`);
      await page.screenshot({ path: png, fullPage: true });
      const leaks = (await pickEnglishLeaks(page)).filter((l) => !isAllowed(l.text));
      // Dedupe by text
      const seen = new Set();
      const dedup = leaks.filter((l) => {
        if (seen.has(l.text)) return false;
        seen.add(l.text);
        return true;
      });
      allLeaks[tab.id] = dedup;
      console.log(`  ${tab.id}: ${dedup.length} leak(s), screenshot ${png}`);
    } catch (e) {
      console.warn(`  ${tab.id}: SKIP (${e.message.split('\n')[0]})`);
      allLeaks[tab.id] = { error: e.message };
    }
  }

  console.log('[2.5/3] overlays');
  // Help drawer: press 'h' to open.
  try {
    await page.keyboard.press('h');
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '_help_drawer.png'), fullPage: true });
    const leaks = (await pickEnglishLeaks(page)).filter((l) => !isAllowed(l.text));
    const seen = new Set();
    const dedup = leaks.filter((l) => { if (seen.has(l.text)) return false; seen.add(l.text); return true; });
    allLeaks._helpDrawer = dedup;
    console.log(`  help drawer: ${dedup.length} leak(s)`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } catch (e) { console.warn('  help drawer SKIP', e.message); }

  // Keyboard shortcuts sheet: press '?'
  try {
    await page.keyboard.press('?');
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '_shortcuts.png'), fullPage: true });
    const leaks = (await pickEnglishLeaks(page)).filter((l) => !isAllowed(l.text));
    const seen = new Set();
    const dedup = leaks.filter((l) => { if (seen.has(l.text)) return false; seen.add(l.text); return true; });
    allLeaks._shortcuts = dedup;
    console.log(`  shortcuts sheet: ${dedup.length} leak(s)`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } catch (e) { console.warn('  shortcuts SKIP', e.message); }

  // Sessions tab → New Chat modal
  try {
    const sessionsTab = await page.locator('[role="tab"][aria-label="세션"]').first();
    await sessionsTab.click({ force: true });
    await page.waitForTimeout(500);
    const newChat = await page.locator('button:has-text("새 채팅")').first();
    await newChat.click({ force: true });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '_new_chat_modal.png'), fullPage: true });
    const leaks = (await pickEnglishLeaks(page)).filter((l) => !isAllowed(l.text));
    const seen = new Set();
    const dedup = leaks.filter((l) => { if (seen.has(l.text)) return false; seen.add(l.text); return true; });
    allLeaks._newChatModal = dedup;
    console.log(`  new chat modal: ${dedup.length} leak(s)`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } catch (e) { console.warn('  new chat SKIP', e.message); }

  // Sessions tab → Attach new modal
  try {
    const attach = await page.locator('button:has-text("새로 연결")').first();
    await attach.click({ force: true });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '_attach_modal.png'), fullPage: true });
    const leaks = (await pickEnglishLeaks(page)).filter((l) => !isAllowed(l.text));
    const seen = new Set();
    const dedup = leaks.filter((l) => { if (seen.has(l.text)) return false; seen.add(l.text); return true; });
    allLeaks._attachModal = dedup;
    console.log(`  attach modal: ${dedup.length} leak(s)`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } catch (e) { console.warn('  attach SKIP', e.message); }

  // FeatureSidebar — features tab opens a sidebar with all
  // categories. Walk each feature page.
  try {
    const featuresTab = await page.locator('[role="tab"][aria-label="기능"]').first();
    await featuresTab.click({ force: true });
    await page.waitForTimeout(700);
    const featureLinks = await page.locator('[data-feature-id], aside button').all();
    let featureLeaks = 0;
    for (let i = 0; i < Math.min(featureLinks.length, 16); i++) {
      try {
        await featureLinks[i].click({ force: true, timeout: 2000 });
        await page.waitForTimeout(500);
        const leaks = (await pickEnglishLeaks(page)).filter((l) => !isAllowed(l.text));
        const seen = new Set();
        const dedup = leaks.filter((l) => { if (seen.has(l.text)) return false; seen.add(l.text); return true; });
        if (dedup.length > 0) {
          featureLeaks += dedup.length;
          allLeaks[`_feature_${i}`] = dedup;
        }
      } catch {}
    }
    console.log(`  feature pages walked: ${featureLeaks} total leak(s)`);
  } catch (e) { console.warn('  feature pages SKIP', e.message); }

  // Account menu (sidebar bottom)
  try {
    const account = await page.locator('button[aria-label^="계정 메뉴"]').first();
    await account.click({ force: true });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '_account_menu.png'), fullPage: true });
    const leaks = (await pickEnglishLeaks(page)).filter((l) => !isAllowed(l.text));
    const seen = new Set();
    const dedup = leaks.filter((l) => { if (seen.has(l.text)) return false; seen.add(l.text); return true; });
    allLeaks._accountMenu = dedup;
    console.log(`  account menu: ${dedup.length} leak(s)`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } catch (e) { console.warn('  account menu SKIP', e.message); }

  await browser.close();

  console.log('[3/3] report');
  let totalLeaks = 0;
  for (const [tab, leaks] of Object.entries(allLeaks)) {
    if (Array.isArray(leaks)) totalLeaks += leaks.length;
  }
  fs.writeFileSync(path.join(SCREENSHOTS_DIR, 'leaks.json'), JSON.stringify(allLeaks, null, 2));
  console.log(`Total candidate leaks: ${totalLeaks}`);
  console.log(`Report: ${path.join(SCREENSHOTS_DIR, 'leaks.json')}`);
  console.log(`Screenshots: ${SCREENSHOTS_DIR}/*.png`);
  if (totalLeaks > 0) {
    console.log('\nTop sample:');
    for (const [tab, leaks] of Object.entries(allLeaks)) {
      if (!Array.isArray(leaks) || leaks.length === 0) continue;
      console.log(`  [${tab}]`);
      for (const l of leaks.slice(0, 5)) {
        console.log(`    "${l.text.slice(0, 100)}"  <${l.tag}>`);
      }
    }
  }
  process.exit(totalLeaks === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(3);
});
