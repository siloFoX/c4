import { expect, test } from 'playwright/test';

// Dispatch-task flow (TODO 11.80, v1.11.98).
//
// Drives the Auto page (TopTabs -> Autonomous). The dispatch CTA on
// pages/Auto.tsx is the "Tick" button in the ControlsDock -- the
// LiveQueueSection renders queue rows but the per-row dispatch is
// triggered by the autonomous loop's tick, not a per-row button. The
// task brief allows "or whatever the dispatch endpoint actually is",
// so we use the real wiring: click Tick -> POST /api/autonomous/tick
// -> assert the timeline / status pill flips.
//
// Pre-auth uses storageState that the test sets up inline (an injected
// localStorage entry) so this spec stays self-contained.

const QUEUE_FIXTURE = {
  rows: [
    {
      id: '99.99',
      title: 'E2E sample row',
      status: 'todo',
      detail: 'A single todo row so the LiveQueueSection renders content.',
    },
  ],
};

const STATUS_PRE = {
  enabled: true,
  paused: false,
  consecutiveHalts: 0,
  lastDispatchAt: null,
  lastDispatchId: null,
  recent: [],
  pendingEscalations: 0,
};

const STATUS_POST = {
  ...STATUS_PRE,
  lastDispatchAt: new Date().toISOString(),
  lastDispatchId: '99.99',
  recent: [
    {
      type: 'dispatch',
      id: '99.99',
      at: Date.now(),
    },
  ],
};

test.describe('dispatch task flow', () => {
  test('clicking Tick posts to /api/autonomous/tick and the timeline reflects it', async ({
    page,
  }) => {
    // Mock auth so the React app skips the Login modal.
    await page.route('**/api/auth/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: true }),
      }),
    );

    // Pre-seed the JWT so useAuthState() lands on 'authed'.
    await page.addInitScript(() => {
      try {
        localStorage.setItem('c4.authToken', 'e2e-mock-token');
        localStorage.setItem('c4.authUser', 'e2e-tester');
        localStorage.setItem('c4.authRole', 'admin');
      } catch {
        /* ignore */
      }
    });

    // Mock the queue. One-shot fetch on mount, so a single route handler
    // is enough.
    await page.route('**/api/autonomous/queue', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(QUEUE_FIXTURE),
      }),
    );

    // The status endpoint is polled every 5s and re-fetched after the
    // tick POST settles. Flip between the pre/post payloads so the
    // post-click refresh surfaces the new dispatch entry.
    let tickedYet = false;
    await page.route('**/api/autonomous/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(tickedYet ? STATUS_POST : STATUS_PRE),
      }),
    );

    // The worker roster is also polled every 5s; an empty list is fine.
    await page.route('**/api/list', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ workers: [], queuedTasks: [], lostWorkers: [] }),
      }),
    );

    // The dispatch POST. Flip the gate so the next /api/autonomous/status
    // request returns STATUS_POST, then return a tiny success body.
    let tickCalls = 0;
    await page.route('**/api/autonomous/tick', (route) => {
      tickCalls += 1;
      tickedYet = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto('/');

    // Navigate to the Auto / Autonomous tab.
    await page.getByRole('tab', { name: /autonomous/i }).click();

    // The ControlsDock renders a status pill ("running" / "paused")
    // anchored to the autonomous loop state. Pre-dispatch it should
    // read "running" because STATUS_PRE has paused=false.
    await expect(page.getByLabel(/autonomous loop running/i)).toBeVisible();

    // Click the Tick button (aria-label="Force autonomous tick").
    await page.getByRole('button', { name: /force autonomous tick/i }).click();

    // The POST should land exactly once and the timeline should render
    // the new "Dispatch" entry once statusSlot.refresh() pulls the
    // STATUS_POST payload back.
    await expect.poll(() => tickCalls).toBe(1);
    await expect(page.getByLabel(/dispatch timeline/i)).toContainText(/dispatch/i);
    await expect(page.getByLabel(/dispatch timeline/i)).toContainText('99.99');
  });
});
