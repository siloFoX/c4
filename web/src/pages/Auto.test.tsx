import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../test/server';
import { setLocale } from '../lib/i18n';

// Auto.tsx is rebuilt (v1.11.76) as a real-time autonomous dispatcher
// dashboard. The page fans out three async slots -- queue, status,
// workers -- each with its own loading / empty / error / data state.
// These tests cover every render path of the state matrix plus the
// controls dock action wiring, hero stat derivations, queue rendering
// + load-more, timeline ordering, and the dispatcher-disabled notice.

const QUEUE_PATH = '/api/autonomous/queue';
const STATUS_PATH = '/api/autonomous/status';
const LIST_PATH = '/api/list';

interface QueueRow {
  id: string;
  title: string;
  status: 'todo' | 'doing' | 'done';
  detail: string;
}

function makeQueue(rows: QueueRow[] = []): { rows: QueueRow[] } {
  return { rows };
}

function makeStatus(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    enabled: true,
    paused: false,
    pauseReason: null,
    consecutiveHalts: 0,
    lastDispatchAt: null,
    lastDispatchId: null,
    lastError: null,
    recent: [],
    pendingEscalations: 0,
    managerName: 'c4-mgr-auto',
    ...over,
  };
}

function makeList(workers: Array<Record<string, unknown>> = []): Record<string, unknown> {
  return { workers, queuedTasks: [], lostWorkers: [], lastHealthCheck: null };
}

function installDefaults(overrides?: {
  queue?: () => Response | Promise<Response>;
  status?: () => Response | Promise<Response>;
  list?: () => Response | Promise<Response>;
}) {
  server.use(
    http.get(QUEUE_PATH, () =>
      overrides?.queue
        ? overrides.queue()
        : HttpResponse.json(makeQueue()),
    ),
    http.get(STATUS_PATH, () =>
      overrides?.status
        ? overrides.status()
        : HttpResponse.json(makeStatus()),
    ),
    http.get(LIST_PATH, () =>
      overrides?.list ? overrides.list() : HttpResponse.json(makeList()),
    ),
  );
}

import Auto from './Auto';

function row(id: string, status: QueueRow['status'], title = 'Task ' + id, detail = 'detail of ' + id): QueueRow {
  return { id, title, status, detail };
}

beforeEach(() => {
  setLocale('en');
  installDefaults();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('<Auto> dashboard scaffolding', () => {
  it('renders the page title in the frame header', async () => {
    render(<Auto noAnimation />);
    expect(
      await screen.findByText('Autonomous dashboard'),
    ).toBeInTheDocument();
  });

  it('renders the page description in the frame header', () => {
    render(<Auto noAnimation />);
    expect(
      screen.getByText(/Live view of the autonomous dispatcher/),
    ).toBeInTheDocument();
  });

  it('renders the global refresh action button', () => {
    render(<Auto noAnimation />);
    expect(
      screen.getByRole('button', { name: 'Refresh all panels' }),
    ).toBeInTheDocument();
  });

  it('renders the PageDescriptionBanner via testid', () => {
    render(<Auto noAnimation />);
    expect(
      screen.getByTestId('page-description-banner'),
    ).toBeInTheDocument();
  });
});

describe('<Auto> hero stats row', () => {
  it('renders all four hero stat labels', async () => {
    render(<Auto noAnimation />);
    expect(await screen.findByText('Queue todo')).toBeInTheDocument();
    expect(screen.getByText('In flight')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Last dispatch')).toBeInTheDocument();
  });

  it('shows queue counts derived from queue rows', async () => {
    installDefaults({
      queue: () =>
        HttpResponse.json(
          makeQueue([
            row('1.1', 'todo'),
            row('1.2', 'todo'),
            row('1.3', 'doing'),
            row('1.4', 'done'),
            row('1.5', 'done'),
            row('1.6', 'done'),
          ]),
        ),
    });
    render(<Auto noAnimation />);
    const todo = await screen.findByText('Queue todo');
    const todoCard = todo.closest('[data-stat-card]') as HTMLElement;
    expect(
      await within(todoCard).findByText('2', { selector: '[data-stat-value]' }),
    ).toBeInTheDocument();

    const inFlight = screen
      .getByText('In flight')
      .closest('[data-stat-card]') as HTMLElement;
    expect(
      await within(inFlight).findByText('1', { selector: '[data-stat-value]' }),
    ).toBeInTheDocument();

    const done = screen
      .getByText('Done')
      .closest('[data-stat-card]') as HTMLElement;
    expect(
      await within(done).findByText('3', { selector: '[data-stat-value]' }),
    ).toBeInTheDocument();
  });

  it('shows -- as the last dispatch when status has no timestamp', async () => {
    installDefaults();
    render(<Auto noAnimation />);
    const card = (await screen.findByText('Last dispatch')).closest(
      '[data-stat-card]',
    ) as HTMLElement;
    await waitFor(() =>
      expect(
        within(card).getByText('--', { selector: '[data-stat-value]' }),
      ).toBeInTheDocument(),
    );
  });

  it('shows a relative time when status carries lastDispatchAt', async () => {
    const past = new Date(Date.now() - 120_000).toISOString();
    installDefaults({
      status: () =>
        HttpResponse.json(makeStatus({ lastDispatchAt: past, lastDispatchId: '7.7' })),
    });
    render(<Auto noAnimation />);
    const card = (await screen.findByText('Last dispatch')).closest(
      '[data-stat-card]',
    ) as HTMLElement;
    await waitFor(() => {
      const node = within(card).getByText(/m ago|just now/, {
        selector: '[data-stat-value]',
      });
      expect(node).toBeInTheDocument();
    });
    expect(within(card).getByText('id 7.7')).toBeInTheDocument();
  });

  it('renders loading skeletons in the hero cards before any fetch resolves', async () => {
    let release: (() => void) | null = null;
    const block = new Promise<void>((r) => {
      release = () => r();
    });
    installDefaults({
      queue: async () => {
        await block;
        return HttpResponse.json(makeQueue());
      },
      status: async () => {
        await block;
        return HttpResponse.json(makeStatus());
      },
    });
    render(<Auto noAnimation />);
    expect(screen.getByLabelText('Queue todo loading')).toBeInTheDocument();
    expect(screen.getByLabelText('In flight loading')).toBeInTheDocument();
    expect(screen.getByLabelText('Done loading')).toBeInTheDocument();
    expect(screen.getByLabelText('Last dispatch loading')).toBeInTheDocument();
    release!();
  });
});

describe('<Auto> live queue section', () => {
  it('renders the section heading', async () => {
    render(<Auto noAnimation />);
    expect(await screen.findByText('Live queue')).toBeInTheDocument();
  });

  it('renders the empty state when the queue resolves with no rows', async () => {
    render(<Auto noAnimation />);
    expect(await screen.findByText('No queue entries')).toBeInTheDocument();
  });

  it('renders the not-found description when notFound is set', async () => {
    installDefaults({
      queue: () => HttpResponse.json({ rows: [], notFound: true }),
    });
    render(<Auto noAnimation />);
    expect(
      await screen.findByText(/was not found on disk/),
    ).toBeInTheDocument();
  });

  it('renders queue rows with id, title, and status badge', async () => {
    installDefaults({
      queue: () =>
        HttpResponse.json(
          makeQueue([row('1.1', 'todo', 'Wire JSON log', 'logs.js cleanup')]),
        ),
    });
    render(<Auto noAnimation />);
    expect(await screen.findByText('1.1')).toBeInTheDocument();
    expect(screen.getByText('Wire JSON log')).toBeInTheDocument();
    expect(screen.getAllByText('logs.js cleanup').length).toBeGreaterThan(0);
    expect(screen.getByText('todo')).toBeInTheDocument();
  });

  it('uses warning badge variant for doing rows', async () => {
    installDefaults({
      queue: () => HttpResponse.json(makeQueue([row('2.1', 'doing', 'X', 'Y')])),
    });
    render(<Auto noAnimation />);
    const badge = await screen.findByText('doing');
    expect(badge.className).toContain('amber');
  });

  it('uses success badge variant for done rows', async () => {
    installDefaults({
      queue: () => HttpResponse.json(makeQueue([row('3.1', 'done', 'X', 'Y')])),
    });
    render(<Auto noAnimation />);
    const badge = await screen.findByText('done');
    expect(badge.className).toContain('emerald');
  });

  it('shows a load-more button when more than 20 rows are present', async () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      row(`9.${i + 1}`, 'todo', `Title ${i + 1}`, `Detail ${i + 1}`),
    );
    installDefaults({ queue: () => HttpResponse.json(makeQueue(many)) });
    render(<Auto noAnimation />);
    expect(
      await screen.findByRole('button', { name: 'Load 5 more' }),
    ).toBeInTheDocument();
  });

  it('hides the load-more button when at most 20 rows are present', async () => {
    const few = Array.from({ length: 20 }, (_, i) =>
      row(`9.${i + 1}`, 'todo'),
    );
    installDefaults({ queue: () => HttpResponse.json(makeQueue(few)) });
    render(<Auto noAnimation />);
    await screen.findByText('9.1');
    expect(
      screen.queryByRole('button', { name: /Load \d+ more/ }),
    ).not.toBeInTheDocument();
  });

  it('expands the queue when load-more is clicked', async () => {
    const many = Array.from({ length: 22 }, (_, i) =>
      row(`9.${i + 1}`, 'todo'),
    );
    installDefaults({ queue: () => HttpResponse.json(makeQueue(many)) });
    const user = userEvent.setup();
    render(<Auto noAnimation />);
    expect(screen.queryByText('9.22')).not.toBeInTheDocument();
    const btn = await screen.findByRole('button', { name: 'Load 2 more' });
    await user.click(btn);
    expect(screen.getByText('9.22')).toBeInTheDocument();
  });

  it('shows the error state with a retry button when the queue fetch fails', async () => {
    installDefaults({
      queue: () =>
        new HttpResponse(JSON.stringify({ error: 'boom' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    render(<Auto noAnimation />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/boom/);
    expect(
      within(alert).getByRole('button', { name: /Retry/ }),
    ).toBeInTheDocument();
  });

  it('refreshes the queue when the section refresh button is clicked', async () => {
    let calls = 0;
    server.use(
      http.get(QUEUE_PATH, () => {
        calls += 1;
        return HttpResponse.json(makeQueue([row('1.1', 'todo')]));
      }),
    );
    const user = userEvent.setup();
    render(<Auto noAnimation />);
    await screen.findByText('1.1');
    const before = calls;
    const refreshBtns = screen.getAllByRole('button', { name: 'Refresh queue' });
    await user.click(refreshBtns[0]!);
    await waitFor(() => expect(calls).toBeGreaterThan(before));
  });
});

describe('<Auto> active workers strip', () => {
  it('renders the section heading', async () => {
    render(<Auto noAnimation />);
    expect(await screen.findByText('Active workers')).toBeInTheDocument();
  });

  it('renders the empty state when no workers are present', async () => {
    render(<Auto noAnimation />);
    expect(await screen.findByText('No workers running')).toBeInTheDocument();
  });

  it('renders one card per worker with name + status badge', async () => {
    installDefaults({
      list: () =>
        HttpResponse.json(
          makeList([
            {
              name: 'auto-w1',
              command: 'claude',
              target: 'local',
              branch: 'c4/x',
              worktree: null,
              parent: null,
              scope: false,
              pid: 1,
              status: 'busy',
              unreadSnapshots: 0,
              totalSnapshots: 0,
              intervention: null,
              lastQuestion: null,
              errorCount: 0,
              phase: null,
              testFailCount: 0,
              tier: 'worker',
            },
            {
              name: 'auto-w2',
              command: 'claude',
              target: 'local',
              branch: 'c4/y',
              worktree: null,
              parent: null,
              scope: false,
              pid: 2,
              status: 'idle',
              unreadSnapshots: 0,
              totalSnapshots: 0,
              intervention: null,
              lastQuestion: null,
              errorCount: 0,
              phase: null,
              testFailCount: 0,
              tier: 'worker',
            },
          ]),
        ),
    });
    render(<Auto noAnimation />);
    expect(await screen.findByText('auto-w1')).toBeInTheDocument();
    expect(screen.getByText('auto-w2')).toBeInTheDocument();
    expect(screen.getByText('busy')).toBeInTheDocument();
    expect(screen.getByText('idle')).toBeInTheDocument();
  });

  it('shows the review pill when a worker has an active intervention', async () => {
    installDefaults({
      list: () =>
        HttpResponse.json(
          makeList([
            {
              name: 'auto-w3',
              command: 'claude',
              target: 'local',
              branch: null,
              worktree: null,
              parent: null,
              scope: false,
              pid: null,
              status: 'busy',
              unreadSnapshots: 0,
              totalSnapshots: 0,
              intervention: 'approval_pending',
              lastQuestion: null,
              errorCount: 0,
              phase: null,
              testFailCount: 0,
            },
          ]),
        ),
    });
    render(<Auto noAnimation />);
    expect(await screen.findByText('auto-w3')).toBeInTheDocument();
    expect(screen.getByText('review')).toBeInTheDocument();
  });

  it('renders an error state when the workers fetch fails', async () => {
    installDefaults({
      list: () =>
        new HttpResponse(JSON.stringify({ error: 'workers down' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    render(<Auto noAnimation />);
    expect(await screen.findByText(/workers down/)).toBeInTheDocument();
  });
});

describe('<Auto> dispatch timeline', () => {
  it('renders the section heading', async () => {
    render(<Auto noAnimation />);
    expect(await screen.findByText('Dispatch timeline')).toBeInTheDocument();
  });

  it('renders an empty state when autonomous mode is disabled', async () => {
    installDefaults({
      status: () =>
        HttpResponse.json(
          makeStatus({
            enabled: false,
            reason: 'autonomous.mode=false (set config.autonomous.mode=true to enable)',
          }),
        ),
    });
    render(<Auto noAnimation />);
    expect(
      await screen.findByText('Autonomous loop disabled'),
    ).toBeInTheDocument();
  });

  it('renders an empty state when the loop is enabled but has no recent events', async () => {
    render(<Auto noAnimation />);
    expect(
      await screen.findByText('No dispatch activity yet'),
    ).toBeInTheDocument();
  });

  it('renders timeline entries for each recent event', async () => {
    installDefaults({
      status: () =>
        HttpResponse.json(
          makeStatus({
            recent: [
              { type: 'dispatch', id: '5.1', at: Date.now() - 60_000 },
              { type: 'success', id: '5.1', at: Date.now() - 30_000 },
            ],
          }),
        ),
      queue: () =>
        HttpResponse.json(makeQueue([row('5.1', 'done', 'A quick task')])),
    });
    render(<Auto noAnimation />);
    expect(await screen.findByText('Dispatch')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getAllByText('A quick task').length).toBeGreaterThan(0);
  });

  it('renders an error state when status fetch fails', async () => {
    installDefaults({
      status: () =>
        new HttpResponse(JSON.stringify({ error: 'status down' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    render(<Auto noAnimation />);
    expect(await screen.findByText(/status down/)).toBeInTheDocument();
  });
});

describe('<Auto> controls dock', () => {
  it('does not render the controls dock when autonomous mode is disabled', async () => {
    installDefaults({
      status: () => HttpResponse.json(makeStatus({ enabled: false })),
    });
    render(<Auto noAnimation />);
    await waitFor(() =>
      expect(
        screen.queryByTestId('controls-dock'),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: /Pause autonomous loop/ }),
    ).not.toBeInTheDocument();
  });

  it('renders Pause and Tick when the loop is running', async () => {
    render(<Auto noAnimation />);
    expect(
      await screen.findByRole('button', { name: 'Pause autonomous loop' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Force autonomous tick' }),
    ).toBeInTheDocument();
  });

  it('renders Resume when the loop is paused', async () => {
    installDefaults({
      status: () => HttpResponse.json(makeStatus({ paused: true, pauseReason: 'manual' })),
    });
    render(<Auto noAnimation />);
    expect(
      await screen.findByRole('button', { name: 'Resume autonomous loop' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Pause autonomous loop' }),
    ).not.toBeInTheDocument();
  });

  it('disables Tick when the loop is paused', async () => {
    installDefaults({
      status: () => HttpResponse.json(makeStatus({ paused: true })),
    });
    render(<Auto noAnimation />);
    const tick = await screen.findByRole('button', {
      name: 'Force autonomous tick',
    });
    expect(tick).toBeDisabled();
  });

  it('posts to /api/autonomous/pause when Pause is clicked', async () => {
    let called = '';
    server.use(
      http.post('/api/autonomous/pause', async () => {
        called = 'pause';
        return HttpResponse.json({ paused: true });
      }),
    );
    const user = userEvent.setup();
    render(<Auto noAnimation />);
    const btn = await screen.findByRole('button', {
      name: 'Pause autonomous loop',
    });
    await user.click(btn);
    await waitFor(() => expect(called).toBe('pause'));
  });

  it('posts to /api/autonomous/resume when Resume is clicked', async () => {
    installDefaults({
      status: () => HttpResponse.json(makeStatus({ paused: true })),
    });
    let called = '';
    server.use(
      http.post('/api/autonomous/resume', async () => {
        called = 'resume';
        return HttpResponse.json({ paused: false });
      }),
    );
    const user = userEvent.setup();
    render(<Auto noAnimation />);
    const btn = await screen.findByRole('button', {
      name: 'Resume autonomous loop',
    });
    await user.click(btn);
    await waitFor(() => expect(called).toBe('resume'));
  });

  it('posts to /api/autonomous/tick when Tick is clicked', async () => {
    let called = '';
    server.use(
      http.post('/api/autonomous/tick', async () => {
        called = 'tick';
        return HttpResponse.json({ dispatched: '7.1' });
      }),
    );
    const user = userEvent.setup();
    render(<Auto noAnimation />);
    const btn = await screen.findByRole('button', {
      name: 'Force autonomous tick',
    });
    await user.click(btn);
    await waitFor(() => expect(called).toBe('tick'));
  });

  it('renders the running indicator when the loop is not paused', async () => {
    render(<Auto noAnimation />);
    expect(
      await screen.findByLabelText('Autonomous loop running'),
    ).toBeInTheDocument();
  });

  it('renders the paused indicator when the loop is paused', async () => {
    installDefaults({
      status: () => HttpResponse.json(makeStatus({ paused: true })),
    });
    render(<Auto noAnimation />);
    expect(
      await screen.findByLabelText('Autonomous loop paused'),
    ).toBeInTheDocument();
  });
});

describe('<Auto> dispatcher disabled notice', () => {
  it('renders a soft notice when autonomous mode is disabled', async () => {
    installDefaults({
      status: () =>
        HttpResponse.json(
          makeStatus({
            enabled: false,
            reason: 'autonomous.mode=false (set config.autonomous.mode=true to enable)',
          }),
        ),
    });
    render(<Auto noAnimation />);
    expect(
      await screen.findByText(/Autonomous dispatcher is currently disabled/),
    ).toBeInTheDocument();
  });

  it('does not render the notice when autonomous mode is enabled', async () => {
    render(<Auto noAnimation />);
    await screen.findByText('Live queue');
    expect(
      screen.queryByText(/Autonomous dispatcher is currently disabled/),
    ).not.toBeInTheDocument();
  });
});

describe('<Auto> global refresh', () => {
  it('hits all three endpoints on mount', async () => {
    const calls: string[] = [];
    server.use(
      http.get(QUEUE_PATH, () => {
        calls.push('queue');
        return HttpResponse.json(makeQueue());
      }),
      http.get(STATUS_PATH, () => {
        calls.push('status');
        return HttpResponse.json(makeStatus());
      }),
      http.get(LIST_PATH, () => {
        calls.push('list');
        return HttpResponse.json(makeList());
      }),
    );
    render(<Auto noAnimation />);
    await waitFor(() => {
      expect(calls).toContain('queue');
      expect(calls).toContain('status');
      expect(calls).toContain('list');
    });
  });

  it('refetches all three endpoints when the header refresh button is clicked', async () => {
    const calls: string[] = [];
    server.use(
      http.get(QUEUE_PATH, () => {
        calls.push('queue');
        return HttpResponse.json(makeQueue());
      }),
      http.get(STATUS_PATH, () => {
        calls.push('status');
        return HttpResponse.json(makeStatus());
      }),
      http.get(LIST_PATH, () => {
        calls.push('list');
        return HttpResponse.json(makeList());
      }),
    );
    const user = userEvent.setup();
    render(<Auto noAnimation />);
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(3));
    const initial = calls.length;
    const btn = screen.getByRole('button', { name: 'Refresh all panels' });
    await user.click(btn);
    await waitFor(() => expect(calls.length).toBeGreaterThan(initial + 2));
  });
});

describe('<Auto> locale flip', () => {
  it('re-renders without crashing when the locale flips', async () => {
    const { container } = render(<Auto noAnimation />);
    await screen.findByText('Autonomous dashboard');
    act(() => {
      setLocale('ko');
    });
    expect(container.firstChild).toBeInTheDocument();
  });
});
