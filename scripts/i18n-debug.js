'use strict';
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3458', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.localStorage.setItem('c4.locale', 'ko'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/c4-debug-1.png', fullPage: true });
  const html = await page.content();
  console.log('HTML length:', html.length);
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('--- body innerText (first 1000) ---');
  console.log(bodyText.slice(0, 1000));
  console.log('--- tabs found ---');
  const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('[role="tab"]')).map((b) => ({
    aria: b.getAttribute('aria-label'),
    text: (b.innerText || '').trim(),
    visible: b.offsetWidth > 0 && b.offsetHeight > 0,
  })));
  console.log(JSON.stringify(tabs, null, 2));
  await browser.close();
})();
