import { expect, test } from 'playwright/test';

// Chat surface should fill height and center (TODO 11.1095, v1.11.1113).
//
// Regression guard: at 1440 the chat composer card sat content-sized at
// the top-left of a vast empty area. The chat surface now fills the view
// height and sits in a centered max-w-3xl column. This spec boots into
// the Chat view and asserts at 1440 / 768 that the chat surface fills
// most of the height and is horizontally centered, and at 375 that it
// stays full-width. Screenshots 1440.

const METRICS_BODY = {
  daemon: {
    platform: 'linux',
    pid: 4242,
    uptimeSec: 3600,
    rssKb: 102400,
    heapUsedKb: 51200,
    heapTotalKb: 81920,
    cpus: 8,
    loadavg: [0.5, 0.6, 0.7],
  },
  workers: [],
  totals: { liveWorkers: 0, totalWorkers: 0, totalRssKb: 0, totalCpuPct: 0 },
};

async function stubApi(page: import('playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('c4.topView', 'chat');
      localStorage.setItem('c4.onboardingTour.v1', 'seen');
    } catch {
      /* ignore */
    }
  });
  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    if (url.includes('/api/auth/status')) return json({ enabled: false });
    if (url.includes('/api/metrics')) return json(METRICS_BODY);
    if (url.includes('/api/list')) {
      return json({ workers: [], queuedTasks: [], lostWorkers: [] });
    }
    if (url.includes('/api/events')) {
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'event: connected\ndata: {"type":"connected"}\n\n',
      });
    }
    return json({});
  });
  // The NL chat composer posts here on submit; on mount nothing fires,
  // but stub it so an accidental request never errors the view.
  await page.route('**/nl/chat**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reply: '', actions: [] }),
    }),
  );
}

async function surfaceBox(page: import('playwright/test').Page) {
  const el = page.locator('[data-section="chat-surface"]').first();
  await expect(el).toBeVisible();
  const box = await el.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

test.describe('chat fill + center', () => {
  test('fills height and centers at 1440', async ({ page }) => {
    await stubApi(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const box = await surfaceBox(page);

    // Fills most of the available height (was a short content-sized card).
    expect(box.height, `surface height ${box.height} should fill`).toBeGreaterThan(900 * 0.6);

    // Centered: a real left margin (not flush at the top-left) and
    // roughly symmetric side margins around a capped column.
    expect(box.x, `surface left ${box.x} should be centered`).toBeGreaterThan(100);
    const leftMargin = box.x;
    const rightMargin = 1440 - (box.x + box.width);
    expect(
      Math.abs(leftMargin - rightMargin),
      `margins ${leftMargin} / ${rightMargin} should be ~symmetric`,
    ).toBeLessThan(64);
    // Column is capped (max-w-3xl ~ 768px), not full width.
    expect(box.width, `surface width ${box.width} should be capped`).toBeLessThan(900);

    await page.screenshot({
      path: 'test-results/chat-fill-center-1440.png',
      animations: 'disabled',
      timeout: 10_000,
    });
  });

  test('fills height at 768', async ({ page }) => {
    await stubApi(page);
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    const box = await surfaceBox(page);
    expect(box.height, `surface height ${box.height} should fill`).toBeGreaterThan(1024 * 0.6);
    expect(box.x + box.width, 'surface should fit within viewport').toBeLessThanOrEqual(768 + 1);
  });

  test('stays full-width on mobile (375)', async ({ page }) => {
    await stubApi(page);
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto('/');

    const box = await surfaceBox(page);
    // Full-width: hugs the left and spans (almost) the whole width.
    expect(box.x, `surface left ${box.x} should hug the edge on mobile`).toBeLessThan(40);
    expect(box.width, `surface width ${box.width} should be near full`).toBeGreaterThan(375 * 0.8);
  });
});
