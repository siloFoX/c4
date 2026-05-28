import { expect, test } from 'playwright/test';

// Settings column should be centered (TODO 11.1096, v1.11.1114).
//
// Regression guard: at 1440 the narrow settings card was left-aligned
// with a large right dead zone. The narrow reading column (max-w-3xl)
// should center on wide viewports while staying full-width on mobile.
// 'settings' is intentionally excluded from the persisted topView
// whitelist, so this spec navigates by clicking the Settings tab at a
// wide viewport (where the tablist is reliably clickable) and then
// resizes to the target width before measuring.

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
}

// Navigate to Settings at a wide viewport (Settings is the last tab and
// the tablist scrolls; clicking is reliable when labels show at >= lg),
// then resize to the target width for measurement.
async function gotoSettings(
  page: import('playwright/test').Page,
  width: number,
  height: number,
): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const tab = page.locator('[data-tab-value="settings"]');
  await tab.scrollIntoViewIfNeeded();
  await tab.click();
  await expect(page.locator('[data-section="settings-view"]')).toBeVisible();
  if (width !== 1440 || height !== 900) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(200);
  }
}

async function box(page: import('playwright/test').Page) {
  const b = await page.locator('[data-section="settings-view"]').boundingBox();
  expect(b).not.toBeNull();
  return b!;
}

test.describe('settings column centering', () => {
  test('centered at 1440', async ({ page }) => {
    await stubApi(page);
    await gotoSettings(page, 1440, 900);

    const b = await box(page);
    expect(b.x, `settings left ${b.x} should be centered`).toBeGreaterThan(100);
    const leftMargin = b.x;
    const rightMargin = 1440 - (b.x + b.width);
    expect(
      Math.abs(leftMargin - rightMargin),
      `margins ${leftMargin} / ${rightMargin} should be ~symmetric`,
    ).toBeLessThan(64);
    expect(b.width, `width ${b.width} should be capped`).toBeLessThan(900);

    await page.screenshot({
      path: 'test-results/settings-center-1440.png',
      animations: 'disabled',
      timeout: 10_000,
    });
  });

  test('fits within viewport at 768', async ({ page }) => {
    await stubApi(page);
    await gotoSettings(page, 768, 1024);
    const b = await box(page);
    expect(b.x).toBeGreaterThanOrEqual(-1);
    expect(b.x + b.width).toBeLessThanOrEqual(768 + 1);
  });

  test('full-width on mobile (375)', async ({ page }) => {
    await stubApi(page);
    await gotoSettings(page, 375, 720);
    const b = await box(page);
    expect(b.x, `left ${b.x} should hug the edge`).toBeLessThan(40);
    expect(b.width, `width ${b.width} should be near full`).toBeGreaterThan(375 * 0.8);
  });
});
