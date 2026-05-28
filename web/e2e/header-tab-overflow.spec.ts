import { expect, test } from 'playwright/test';

// Top tab bar overflow / title overlap (TODO 11.1084, v1.11.1102).
//
// Regression guard for the "12 tabs overlap the C4 Dashboard title on
// the left and collide with the action icons on the right" bug. The
// shared Tabs primitive marks the tablist `shrink-0 overflow-x-auto`,
// but it had no width cap, so in the Navbar's centered `1fr` grid cell
// it rendered at full intrinsic width and spilled symmetrically over
// the brand and the actions. TopTabs now passes `min-w-0 max-w-full`
// so the tablist is clamped to its cell and scrolls inside its own
// isolated track; labels also collapse to icons below lg.
//
// This spec loads the dashboard at 1440 / 768 / 375 and asserts the
// tablist's rendered box stays between the brand cell (left) and the
// actions cell (right) -- i.e. no overlap -- and screenshots each
// width into test-results for the mandated visual record.
//
// Auth handling mirrors layout-app-shell.spec.ts: a single /api/**
// handler fulfills /api/auth/status with { enabled: false } so
// useAuthState resolves to 'disabled' and App.tsx renders the
// dashboard chrome (header + tablist) directly. /api/list + /api/events
// get empty payloads; every other /api call is ABORTED (network error,
// not HTTP 401, so it never trips the AUTH_EVENT login flip).

const LIST_BODY = JSON.stringify({
  workers: [],
  queuedTasks: [],
  lostWorkers: [],
});

async function stubApi(page: import('playwright/test').Page): Promise<void> {
  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/status')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false }),
      });
    }
    if (url.includes('/api/list')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: LIST_BODY,
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

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

interface HeaderLayout {
  tablist: Rect;
  brand: Rect | null;
  actions: Rect | null;
  scrollW: number;
  clientW: number;
}

// Read the three Navbar grid cells (brand / center / actions) via the
// tablist's ancestry so the test needs no extra markup on the shared
// Navbar primitive. The tablist's parent is the center cell; the cell's
// siblings are the brand (before) and actions (after).
async function readHeaderLayout(
  page: import('playwright/test').Page,
): Promise<HeaderLayout | null> {
  return page.evaluate(() => {
    const toRect = (el: Element | null) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return {
        left: b.left,
        right: b.right,
        top: b.top,
        bottom: b.bottom,
        width: b.width,
        height: b.height,
      };
    };
    const tl = document.querySelector('header [role="tablist"]') as HTMLElement | null;
    if (!tl) return null;
    const center = tl.parentElement;
    const nav = center && center.parentElement;
    if (!center || !nav) return null;
    const cells = Array.from(nav.children);
    const idx = cells.indexOf(center);
    return {
      tablist: toRect(tl)!,
      brand: idx > 0 ? toRect(cells[idx - 1]) : null,
      actions: idx >= 0 && idx < cells.length - 1 ? toRect(cells[idx + 1]) : null,
      scrollW: tl.scrollWidth,
      clientW: tl.clientWidth,
    };
  });
}

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 768, h: 1024 },
  { w: 375, h: 720 },
];

test.describe('top tab bar overflow', () => {
  for (const vp of VIEWPORTS) {
    test(`tablist does not overlap brand or actions at ${vp.w}px`, async ({
      page,
    }) => {
      await stubApi(page);
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto('/');

      const tablist = page.locator('header [role="tablist"]').first();
      await expect(tablist).toBeVisible();

      const layout = await readHeaderLayout(page);
      expect(layout).not.toBeNull();
      const { tablist: tl, brand, actions, clientW } = layout!;

      // The tablist must actually render with a real box.
      expect(tl.width).toBeGreaterThan(0);
      expect(tl.height).toBeGreaterThan(0);

      // No overlap on the LEFT: the tablist must start at or after the
      // brand cell's right edge (1px slack for sub-pixel rounding).
      if (brand) {
        expect(tl.left).toBeGreaterThanOrEqual(brand.right - 1);
      }

      // No overlap on the RIGHT: the tablist must end at or before the
      // actions cell's left edge.
      if (actions) {
        expect(tl.right).toBeLessThanOrEqual(actions.left + 1);
      }

      // The tablist's rendered (client) width must fit within the
      // viewport -- overflow is scrolled internally, never painted on
      // top of the neighbours. clientWidth excludes the scrolled
      // overflow.
      expect(clientW).toBeLessThanOrEqual(vp.w);

      await page.screenshot({
        path: `test-results/header-tab-overflow-${vp.w}.png`,
        animations: 'disabled',
        timeout: 10_000,
      });
    });
  }
});
