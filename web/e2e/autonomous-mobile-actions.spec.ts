import { expect, test } from 'playwright/test';

// Autonomous status-card actions clipped on mobile (TODO 11.1093,
// v1.11.1111).
//
// Regression guard: at 375 the digest-card header's Refresh + Pause
// buttons (the red Pause especially) and the escalation-card header's
// show-resolved control overflowed and clipped at the right edge,
// because both headers were single-row `justify-between`. The headers
// now stack the actions below the title below sm. This spec boots into
// the Autonomous view and asserts the three controls render fully
// inside the viewport at 375 (no clip) and at 768 / 1440 (no
// regression), screenshotting the 375 layout.

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

const DIGEST_BODY = {
  windowMs: 86400000,
  from: '2026-05-27T00:00:00.000Z',
  to: '2026-05-28T00:00:00.000Z',
  paused: false,
  dispatched: 12,
  succeeded: 11,
  halted: 0,
  dispatchErrors: 1,
  successRate: 0.92,
  pendingEscalations: 1,
  resolvedEscalations: 4,
};

const ESCALATIONS = {
  count: 1,
  escalations: [
    {
      id: 201,
      kind: 'reviewer',
      status: 'pending',
      reason: 'Pending review for a multi-file refactor.',
      suggestedAction: 'Approve if scoped correctly.',
      todoId: '11.900',
      createdAt: Date.now() - 600000,
    },
  ],
};

async function stubApi(page: import('playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('c4.topView', 'autonomous');
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
    if (url.includes('/api/autonomous/status')) return json({ enabled: true });
    if (url.includes('/api/autonomous/digest')) return json(DIGEST_BODY);
    if (url.includes('/api/autonomous/escalations')) return json(ESCALATIONS);
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

const CONTROLS = [
  'autonomous-refresh-btn',
  'autonomous-pause-btn',
  'autonomous-show-resolved',
];

async function assertWithinViewport(
  page: import('playwright/test').Page,
  width: number,
): Promise<void> {
  for (const testId of CONTROLS) {
    const el = page.getByTestId(testId);
    await expect(el, `${testId} should be present`).toHaveCount(1);
    const box = await el.boundingBox();
    expect(box, `${testId} should have a layout box`).not.toBeNull();
    // Fully inside the viewport horizontally -- not clipped at either
    // edge (1px slack for sub-pixel rounding).
    expect(
      box!.x,
      `${testId} left edge ${box!.x} should be >= 0`,
    ).toBeGreaterThanOrEqual(-1);
    expect(
      box!.x + box!.width,
      `${testId} right edge ${box!.x + box!.width} should be <= ${width}`,
    ).toBeLessThanOrEqual(width + 1);
  }
}

test.describe('autonomous status-card actions', () => {
  test('all header controls are fully visible at 375 (no clip)', async ({
    page,
  }) => {
    await stubApi(page);
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto('/');

    await expect(page.getByTestId('autonomous-refresh-btn')).toBeVisible();
    await assertWithinViewport(page, 375);

    await page.screenshot({
      path: 'test-results/autonomous-mobile-actions-375.png',
      animations: 'disabled',
      timeout: 10_000,
    });
  });

  test('no regression at 768', async ({ page }) => {
    await stubApi(page);
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    await expect(page.getByTestId('autonomous-refresh-btn')).toBeVisible();
    await assertWithinViewport(page, 768);
  });

  test('no regression at 1440', async ({ page }) => {
    await stubApi(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await expect(page.getByTestId('autonomous-refresh-btn')).toBeVisible();
    await assertWithinViewport(page, 1440);
  });
});
