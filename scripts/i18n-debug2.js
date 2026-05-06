'use strict';
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:3456', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const txt = await page.evaluate(() => document.body.innerText);
  console.log('Body length:', txt.length);
  console.log('Top 800:');
  console.log(txt.slice(0, 800));
  await browser.close();
})();
