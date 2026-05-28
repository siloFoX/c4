import { expect, test } from 'playwright/test';

// Status banner contrast (TODO 11.1098, v1.11.1116).
//
// Regression guard: the AutonomousStatusBanner reviewer-attention text +
// pending count were near-illegible (text-*-foreground is ~white on the
// light destructive/10 tint -> ~1:1). They now use text-foreground.
// This spec renders the escalation banner (stubbed pending escalations),
// computes the WCAG contrast ratio of the count text vs the banner's
// composited background, asserts >= 4.5 (AA), checks the count is bold,
// and screenshots at 1440 / 768 / 375.

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
    // The banner renders when autonomous is enabled with pending escalations.
    if (url.includes('/api/autonomous/status')) {
      return json({ enabled: true, pendingEscalations: 3 });
    }
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

// Compute the WCAG contrast ratio of the banner's count text vs its
// composited background, plus the count's font-weight, in-page.
async function readContrast(page: import('playwright/test').Page) {
  return page.evaluate(() => {
    const parse = (s: string) => {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map((x) => parseFloat(x.trim()));
      return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
    };
    const lum = (c: { r: number; g: number; b: number }) => {
      const ch = [c.r, c.g, c.b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    };
    const over = (
      fg: { r: number; g: number; b: number; a: number },
      base: { r: number; g: number; b: number },
    ) => ({
      r: fg.a * fg.r + (1 - fg.a) * base.r,
      g: fg.a * fg.g + (1 - fg.a) * base.g,
      b: fg.a * fg.b + (1 - fg.a) * base.b,
    });

    const banner = document.querySelector('[data-section="autonomous-status-banner"]');
    if (!banner) return null;
    const countEl =
      banner.querySelector('[data-testid="banner-pending-count"]') ||
      banner.querySelector('p');
    if (!countEl) return null;

    const cs = getComputedStyle(countEl as Element);
    const textColor = parse(cs.color);
    const bannerBg = parse(getComputedStyle(banner).backgroundColor);
    if (!textColor || !bannerBg) return null;

    // Composite the banner's (semi-transparent) bg over the first opaque
    // ancestor background (default white).
    let base = { r: 255, g: 255, b: 255 };
    let el: Element | null = banner.parentElement;
    while (el) {
      const bg = parse(getComputedStyle(el).backgroundColor);
      if (bg && bg.a === 1) {
        base = { r: bg.r, g: bg.g, b: bg.b };
        break;
      }
      el = el.parentElement;
    }
    const effBg = over(bannerBg, base);

    const lT = lum(textColor);
    const lB = lum(effBg);
    const ratio = (Math.max(lT, lB) + 0.05) / (Math.min(lT, lB) + 0.05);
    return { ratio, fontWeight: cs.fontWeight };
  });
}

async function assertBannerAA(page: import('playwright/test').Page) {
  await expect(page.locator('[data-section="autonomous-status-banner"]')).toBeVisible();
  const r = await readContrast(page);
  expect(r).not.toBeNull();
  expect(r!.ratio, `contrast ratio ${r!.ratio} should meet WCAG AA (>= 4.5)`).toBeGreaterThanOrEqual(4.5);
  expect(
    Number(r!.fontWeight),
    `count font-weight ${r!.fontWeight} should be bold (>= 600)`,
  ).toBeGreaterThanOrEqual(600);
}

const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 768, h: 1024 },
  { w: 375, h: 720 },
];

test.describe('autonomous status banner contrast', () => {
  for (const vp of VIEWPORTS) {
    test(`banner text meets AA + bold count at ${vp.w}px`, async ({ page }) => {
      await stubApi(page);
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto('/');

      await assertBannerAA(page);

      await page.screenshot({
        path: `test-results/banner-contrast-${vp.w}.png`,
        animations: 'disabled',
        timeout: 10_000,
      });
    });
  }
});
