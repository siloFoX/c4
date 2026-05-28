import { expect, test } from 'playwright/test';

// History list overflows on mobile (TODO 11.1094, v1.11.1112).
//
// Regression guard: at 375 the History sidebar toolbar (column-picker /
// export / scribe) and the per-row CLOSED status badges clipped at the
// right edge. This spec boots into the History view with a long-named
// CLOSED worker and asserts, at 375 / 768 / 1440, that the page has no
// horizontal overflow and that the sidebar toolbar and the closed row's
// status pill both render fully inside the viewport, screenshotting 375.

const LONG_CLOSED = 'auto-worker-with-a-very-long-name-1234567890';

const SUMMARY = {
  records: [],
  total: 3,
  workers: [
    {
      name: LONG_CLOSED,
      taskCount: 12,
      firstTaskAt: '2026-05-20T00:00:00.000Z',
      lastTaskAt: '2026-05-27T10:00:00.000Z',
      lastTask: 'Refactor the very long module that this worker handled',
      lastStatus: 'closed',
      branches: ['c4/auto-worker-with-a-very-long-branch-name'],
      alive: false,
      liveStatus: null,
    },
    {
      name: 'auto-w2',
      taskCount: 3,
      firstTaskAt: '2026-05-25T00:00:00.000Z',
      lastTaskAt: '2026-05-28T08:00:00.000Z',
      lastTask: 'Build something',
      lastStatus: 'busy',
      branches: ['c4/auto-w2'],
      alive: true,
      liveStatus: 'busy',
    },
  ],
};

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
      localStorage.setItem('c4.topView', 'history');
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
    if (url.includes('/api/history')) return json(SUMMARY);
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

async function rightEdge(
  page: import('playwright/test').Page,
  testId: string,
): Promise<number | null> {
  const el = page.getByTestId(testId).first();
  const box = await el.boundingBox();
  return box ? box.x + box.width : null;
}

async function assertNoOverflow(
  page: import('playwright/test').Page,
  width: number,
): Promise<void> {
  // No horizontal page overflow.
  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(
    scrollWidth,
    `page scrollWidth ${scrollWidth} should be <= viewport ${width}`,
  ).toBeLessThanOrEqual(width + 1);

  // Sidebar toolbar fully inside the viewport.
  const toolbarRight = await rightEdge(page, 'history-sidebar-toolbar');
  expect(toolbarRight, 'toolbar should have a box').not.toBeNull();
  expect(
    toolbarRight!,
    `toolbar right edge ${toolbarRight} should be <= ${width}`,
  ).toBeLessThanOrEqual(width + 1);

  // The CLOSED row's status pill fully inside the viewport.
  const pillRight = await rightEdge(page, `history-row-status-${LONG_CLOSED}`);
  expect(pillRight, 'closed-row status pill should have a box').not.toBeNull();
  expect(
    pillRight!,
    `closed-row status pill right edge ${pillRight} should be <= ${width}`,
  ).toBeLessThanOrEqual(width + 1);
}

test.describe('history list mobile overflow', () => {
  test('no horizontal clipping at 375', async ({ page }) => {
    await stubApi(page);
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto('/');

    await expect(
      page.getByTestId(`history-row-status-${LONG_CLOSED}`),
    ).toBeVisible();
    await assertNoOverflow(page, 375);

    await page.screenshot({
      path: 'test-results/history-mobile-overflow-375.png',
      animations: 'disabled',
      timeout: 10_000,
    });
  });

  test('no regression at 768', async ({ page }) => {
    await stubApi(page);
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await expect(
      page.getByTestId(`history-row-status-${LONG_CLOSED}`),
    ).toBeVisible();
    await assertNoOverflow(page, 768);
  });

  test('no regression at 1440', async ({ page }) => {
    await stubApi(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(
      page.getByTestId(`history-row-status-${LONG_CLOSED}`),
    ).toBeVisible();
    await assertNoOverflow(page, 1440);
  });
});
