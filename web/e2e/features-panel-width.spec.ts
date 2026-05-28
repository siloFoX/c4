import { expect, test } from 'playwright/test';

// Features content panel width (TODO 11.1097, v1.11.1115).
//
// Regression guard: at 1440 the feature panel card should fill (or be
// balanced within) the area right of the feature rail, not cling to the
// left at ~560px with a wide right dead zone. At 375 the view should be
// a single column (rail collapsed, panel full-width).

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
      localStorage.setItem('c4.topView', 'features');
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

// Returns { panel, card } bounding rects: the feature panel (main) and
// the PageFrame card inside it (panel > div > card).
async function measure(page: import('playwright/test').Page) {
  await expect(page.locator('[data-section="feature-panel"]')).toBeVisible();
  return page.evaluate(() => {
    const panel = document.querySelector('[data-section="feature-panel"]');
    if (!panel) return null;
    const inner = panel.firstElementChild; // PageFrame outer div
    const card = inner ? inner.firstElementChild : null; // the Card
    const r = (el) => {
      const b = el.getBoundingClientRect();
      return { x: b.left, width: b.width };
    };
    return { panel: r(panel), card: card ? r(card) : null };
  });
}

test('feature panel is balanced (not clinging left) at 1440', async ({ page }) => {
  await stubApi(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const m = await measure(page);
  expect(m).not.toBeNull();
  expect(m!.card).not.toBeNull();
  const { panel, card } = m!;

  // The card should use most of the panel width (wide), OR be centered
  // within it -- either way it must not cling to the left with a large
  // right dead zone.
  const fillsWide = card!.width >= panel.width * 0.8;
  const leftGap = card!.x - panel.x;
  const rightGap = panel.x + panel.width - (card!.x + card!.width);
  const centered = Math.abs(leftGap - rightGap) < panel.width * 0.12;
  expect(
    fillsWide || centered,
    `card width ${card!.width} / panel ${panel.width}; leftGap ${leftGap} rightGap ${rightGap} -- should fill (>=80%) or be centered`,
  ).toBe(true);

  await page.screenshot({
    path: 'test-results/features-panel-width-1440.png',
    animations: 'disabled',
    timeout: 10_000,
  });
});

test('feature panel is a single full-width column at 375', async ({ page }) => {
  await stubApi(page);
  await page.setViewportSize({ width: 375, height: 720 });
  await page.goto('/');

  const m = await measure(page);
  expect(m).not.toBeNull();
  // Single column: the panel spans (almost) the whole viewport width.
  expect(m!.panel.width, `panel width ${m!.panel.width} should be ~full at 375`).toBeGreaterThan(
    375 * 0.8,
  );
});
