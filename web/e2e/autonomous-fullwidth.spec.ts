import { expect, test } from 'playwright/test';

// Autonomous dashboard fill-width (TODO 11.1085, v1.11.1103).
//
// Regression guard for "the status stat-grid and escalation queue are
// capped near 630px and left-aligned at 1440, leaving ~810px empty on
// the right". AutonomousView's root sat in a flex-row wrapper without
// `flex-1`/`w-full`, so it only took its content's max-content width
// (~630px) and hugged the left. The root now fills its wrapper, so the
// cards span the available content width and the 4-col stat grid
// spreads across it.
//
// This spec boots straight into the Autonomous view (localStorage
// c4.topView) with the onboarding tour dismissed, stubs the three
// autonomous endpoints so the digest + escalations render, and asserts
// the view fills (close to) the viewport width at 1440 / 768 / 375.
//
// Auth handling mirrors layout-app-shell.spec.ts: /api/auth/status ->
// { enabled: false } so the dashboard chrome renders; the autonomous
// status/digest/escalations endpoints are stubbed with data.

const DIGEST = {
  windowMs: 86400000,
  from: '2026-05-27T00:00:00.000Z',
  to: '2026-05-28T00:00:00.000Z',
  paused: false,
  dispatched: 42,
  succeeded: 39,
  halted: 1,
  dispatchErrors: 2,
  successRate: 0.928,
  pendingEscalations: 2,
  resolvedEscalations: 7,
};

const ESCALATIONS = {
  count: 2,
  escalations: [
    {
      id: 101,
      kind: 'reviewer',
      status: 'pending',
      reason: 'Worker requested approval to remove a deprecated module across 14 files.',
      suggestedAction: 'Approve if the module is confirmed unused.',
      todoId: '11.900',
      createdAt: Date.now() - 600000,
    },
    {
      id: 102,
      kind: 'budget',
      status: 'pending',
      reason: 'Token budget for the nightly run exceeded the soft cap by 12%.',
      suggestedAction: 'Raise the cap or defer low-priority tasks.',
      todoId: '11.901',
      createdAt: Date.now() - 1800000,
    },
  ],
};

async function stubApi(page: import('playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('c4.topView', 'autonomous');
      window.localStorage.setItem('c4.onboardingTour.v1', 'seen');
    } catch {
      /* ignore */
    }
  });
  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/status')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false }),
      });
    }
    if (url.includes('/api/autonomous/status')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: true }),
      });
    }
    if (url.includes('/api/autonomous/digest')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(DIGEST),
      });
    }
    if (url.includes('/api/autonomous/escalations')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ESCALATIONS),
      });
    }
    if (url.includes('/api/list')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ workers: [], queuedTasks: [], lostWorkers: [] }),
      });
    }
    if (url.includes('/api/events')) {
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'event: connected\ndata: {"type":"connected"}\n\n',
      });
    }
    return route.abort();
  });
}

// Read the AutonomousView root width + left, plus the stat grid, via
// the stat grid's ancestry (the grid is the only element whose class
// list contains the md:grid-cols-4 token).
async function readWidths(page: import('playwright/test').Page) {
  return page.evaluate(() => {
    const grid = document.querySelector('[class*="md:grid-cols-4"]') as HTMLElement | null;
    if (!grid) return null;
    const root = document.querySelector('[data-section="autonomous-view"]') as HTMLElement | null;
    const rect = (el: Element | null) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right, width: b.width };
    };
    return {
      vw: window.innerWidth,
      grid: rect(grid),
      root: rect(root),
    };
  });
}

const VIEWPORTS = [
  // [width, height, min fraction of viewport the content must fill]
  { w: 1440, h: 900, frac: 0.85 },
  { w: 768, h: 1024, frac: 0.85 },
  { w: 375, h: 720, frac: 0.8 },
];

test.describe('autonomous dashboard fill-width', () => {
  for (const vp of VIEWPORTS) {
    test(`autonomous view fills the width at ${vp.w}px`, async ({ page }) => {
      await stubApi(page);
      await page.setViewportSize({ width: vp.w, height: vp.h });
      // stubApi seeds localStorage c4.topView='autonomous' before load, so
      // the app boots straight into the Autonomous view (persisted now
      // that TOP_VIEW_VALUES includes 'autonomous'). No tab click needed,
      // which keeps the test robust at narrow widths where the tab sits
      // in the header's horizontal-scroll track.
      await page.goto('/');

      // Wait for the digest stat grid to render.
      await expect(page.locator('[class*="md:grid-cols-4"]').first()).toBeVisible();

      const data = await readWidths(page);
      expect(data).not.toBeNull();
      const { vw, root, grid } = data!;

      // The view root must fill most of the viewport -- not the old
      // ~630px content-width cap that left ~810px empty at 1440.
      expect(root).not.toBeNull();
      expect(root!.width).toBeGreaterThan(vw * vp.frac);

      // The stat grid spreads across (close to) the content width too.
      expect(grid).not.toBeNull();
      expect(grid!.width).toBeGreaterThan(vw * vp.frac - 64);

      await page.screenshot({
        path: `test-results/autonomous-fullwidth-${vp.w}.png`,
        animations: 'disabled',
        timeout: 10_000,
      });
    });
  }
});
