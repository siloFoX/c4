import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type {
  TokenUsagePayload,
  QuotaPayload,
} from '../lib/use-token-usage';
import type {
  PerWorkerEntry,
  PerDayEntry,
} from '../lib/use-token-usage-breakdowns';

// TokenUsage.tsx wires PageFrame + two hooks (useTokenUsage and
// useTokenUsageBreakdowns) plus local state for the day window and
// the perTask toggle. Stub both hooks so each test drives a single
// branch of the loaded / loading / error / per-task matrix without
// firing the real fetches.

interface UseTokenUsageState {
  data: TokenUsagePayload | null;
  quota: QuotaPayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface UseBreakdownsState {
  perWorker: PerWorkerEntry[];
  perDay: PerDayEntry[];
  workerMax: number;
  dayMax: number;
}

const refreshMock = vi.fn(async () => {});

let hookState: UseTokenUsageState = {
  data: null,
  quota: null,
  loading: false,
  error: null,
  refresh: refreshMock,
};

let breakdowns: UseBreakdownsState = {
  perWorker: [],
  perDay: [],
  workerMax: 0,
  dayMax: 0,
};

vi.mock('../lib/use-token-usage', () => ({
  useTokenUsage: (): UseTokenUsageState => hookState,
}));

vi.mock('../lib/use-token-usage-breakdowns', () => ({
  useTokenUsageBreakdowns: (): UseBreakdownsState => breakdowns,
  coerceTotal: (v: unknown): number => {
    if (typeof v === 'number') return v;
    if (v && typeof v === 'object') {
      const obj = v as { input?: number; output?: number; total?: number };
      if (typeof obj.total === 'number') return obj.total;
      return (obj.input || 0) + (obj.output || 0);
    }
    return 0;
  },
}));

vi.mock('../components/PageDescriptionBanner', () => ({
  PageDescriptionBanner: () => (
    <div data-testid="page-description-banner" />
  ),
}));

vi.mock('../components/HelpUIRoot', () => ({
  openHelpDrawer: vi.fn(),
}));

import TokenUsage from './TokenUsage';

function makeData(over: Partial<TokenUsagePayload> = {}): TokenUsagePayload {
  return {
    total: 12345,
    totalInput: 6000,
    totalOutput: 6345,
    perWorker: {},
    perDay: {},
    perTask: [],
    ...over,
  };
}

function makeQuota(over: Partial<QuotaPayload> = {}): QuotaPayload {
  return {
    date: '2026-05-12',
    tiers: {
      free: { used: 100, limit: 1000, pct: 10 },
      pro: { used: 9000, limit: 10000, pct: 90 },
    },
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  refreshMock.mockReset();
  refreshMock.mockResolvedValue(undefined);
  hookState = {
    data: null,
    quota: null,
    loading: false,
    error: null,
    refresh: refreshMock,
  };
  breakdowns = {
    perWorker: [],
    perDay: [],
    workerMax: 0,
    dayMax: 0,
  };
});

describe('<TokenUsage>', () => {
  it('renders the page title in the frame header', () => {
    render(<TokenUsage />);
    expect(screen.getByText('Token usage')).toBeInTheDocument();
  });

  it('renders the page description in the frame header', () => {
    render(<TokenUsage />);
    expect(
      screen.getByText(/Per-worker and per-day token consumption/),
    ).toBeInTheDocument();
  });

  it('renders all four day-range tabs (SegmentedControl)', () => {
    render(<TokenUsage />);
    // (v1.11.276, TODO 11.258) Buttons migrated to SegmentedControl
    // -- each option now has role="tab" inside role="tablist".
    expect(
      screen.getByRole('tab', { name: 'Today' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Last 7 days' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Last 30 days' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Last 90 days' }),
    ).toBeInTheDocument();
  });

  it('renders the per-task checkbox', () => {
    render(<TokenUsage />);
    expect(screen.getByLabelText('Per-task')).toBeInTheDocument();
  });

  it('renders the refresh button via its sr-only label', () => {
    render(<TokenUsage />);
    expect(
      screen.getByRole('button', { name: 'Refresh' }),
    ).toBeInTheDocument();
  });

  it('renders the PageDescriptionBanner marker', () => {
    render(<TokenUsage />);
    expect(screen.getByTestId('page-description-banner')).toBeInTheDocument();
  });

  it('flips the active range tab when a different range is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<TokenUsage />);
    // (v1.11.276, TODO 11.258) Default is 7 days. Clicking the
    // Today tab should flip aria-selected onto it.
    const day1 = screen.getByRole('tab', { name: 'Today' });
    expect(day1.getAttribute('aria-selected')).toBe('false');
    await user.click(day1);
    expect(
      screen.getByRole('tab', { name: 'Today' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(container.firstChild).toBeInTheDocument();
  });

  it('toggles the per-task switch state on click', async () => {
    const user = userEvent.setup();
    render(<TokenUsage />);
    const cb = screen.getByLabelText('Per-task');
    expect(cb).toHaveAttribute('aria-checked', 'false');
    await user.click(cb);
    expect(cb).toHaveAttribute('aria-checked', 'true');
  });

  it('fires the hook refresh handler when the refresh button is clicked', async () => {
    const user = userEvent.setup();
    render(<TokenUsage />);
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('disables the refresh button while loading', () => {
    hookState = { ...hookState, loading: true };
    render(<TokenUsage />);
    expect(
      screen.getByRole('button', { name: 'Refresh' }),
    ).toBeDisabled();
  });

  it('applies the animate-spin class on the refresh icon while loading', () => {
    hookState = { ...hookState, loading: true };
    render(<TokenUsage />);
    const btn = screen.getByRole('button', { name: 'Refresh' });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').toContain('animate-spin');
  });

  it('does NOT apply the animate-spin class on the refresh icon when idle', () => {
    render(<TokenUsage />);
    const btn = screen.getByRole('button', { name: 'Refresh' });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').not.toContain('animate-spin');
  });

  it('renders the loading skeleton when loading with no data yet', () => {
    hookState = { ...hookState, loading: true, data: null };
    render(<TokenUsage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does NOT render the skeleton when data is already present', () => {
    // The byWorker panel renders an EmptyPanel (role=status) when
    // perWorker is empty — populate one worker entry so the only
    // role=status candidates are the LoadingSkeleton path (gated on
    // !data) and the empty panels (gated on empty arrays).
    hookState = { ...hookState, loading: true, data: makeData() };
    breakdowns = {
      ...breakdowns,
      perWorker: [{ name: 'w1', total: 5 }],
      workerMax: 5,
      perDay: [{ date: '2026-05-12', total: 5 }],
      dayMax: 5,
    };
    render(<TokenUsage />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders the error panel via role=alert when the hook reports an error', () => {
    hookState = { ...hookState, error: 'boom' };
    render(<TokenUsage />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('renders the total stat when data is present', () => {
    hookState = { ...hookState, data: makeData({ total: 12345 }) };
    render(<TokenUsage />);
    // (v1.11.341, TODO 11.323) Total is now also surfaced in
    // the breakdown DataList; the headline panel still shows
    // it as a font-mono span. Use getAllByText to assert that
    // at least one occurrence is present.
    expect(screen.getAllByText('Total').length).toBeGreaterThan(0);
    expect(screen.getAllByText('12,345').length).toBeGreaterThan(0);
  });

  it('renders the input total when totalInput is present', () => {
    hookState = {
      ...hookState,
      data: makeData({ totalInput: 1234 }),
    };
    render(<TokenUsage />);
    // (v1.11.341, TODO 11.323) Same dual-render as above.
    expect(screen.getAllByText(/input/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1,234/).length).toBeGreaterThan(0);
  });

  it('renders the output total when totalOutput is present', () => {
    hookState = {
      ...hookState,
      data: makeData({ totalInput: undefined, totalOutput: 567 }),
    };
    render(<TokenUsage />);
    expect(screen.getAllByText(/output/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/567/).length).toBeGreaterThan(0);
  });

  it('renders the by-worker panel header with the count', () => {
    hookState = { ...hookState, data: makeData() };
    breakdowns = {
      ...breakdowns,
      perWorker: [
        { name: 'alpha', total: 100 },
        { name: 'beta', total: 50 },
      ],
      workerMax: 100,
    };
    render(<TokenUsage />);
    expect(screen.getByText('By worker (2)')).toBeInTheDocument();
  });

  it('renders the by-worker empty hint when perWorker is empty', () => {
    hookState = { ...hookState, data: makeData() };
    render(<TokenUsage />);
    expect(
      screen.getByText(/No usage recorded yet/),
    ).toBeInTheDocument();
  });

  it('renders one row per worker in the by-worker panel', () => {
    hookState = { ...hookState, data: makeData() };
    breakdowns = {
      ...breakdowns,
      perWorker: [
        { name: 'alpha', total: 100 },
        { name: 'beta', total: 50 },
      ],
      workerMax: 100,
    };
    render(<TokenUsage />);
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('renders the by-day panel header with the count', () => {
    hookState = { ...hookState, data: makeData() };
    breakdowns = {
      ...breakdowns,
      perDay: [
        { date: '2026-05-12', total: 10 },
        { date: '2026-05-11', total: 5 },
      ],
      dayMax: 10,
    };
    render(<TokenUsage />);
    expect(screen.getByText('By day (2)')).toBeInTheDocument();
  });

  it('renders the by-day empty hint when perDay is empty', () => {
    hookState = { ...hookState, data: makeData() };
    render(<TokenUsage />);
    expect(
      screen.getByText(/No per-day usage recorded in this window/),
    ).toBeInTheDocument();
  });

  it('renders one row per day in the by-day panel', () => {
    hookState = { ...hookState, data: makeData() };
    breakdowns = {
      ...breakdowns,
      perDay: [
        { date: '2026-05-12', total: 10 },
        { date: '2026-05-11', total: 5 },
      ],
      dayMax: 10,
    };
    render(<TokenUsage />);
    expect(screen.getByText('2026-05-12')).toBeInTheDocument();
    expect(screen.getByText('2026-05-11')).toBeInTheDocument();
  });

  it('does NOT render the per-task table when perTask is off', () => {
    hookState = {
      ...hookState,
      data: makeData({ perTask: [{ worker: 'w1', task: 't1', total: 5 }] }),
    };
    render(<TokenUsage />);
    expect(screen.queryByText(/Per-task \(\d+\)/)).not.toBeInTheDocument();
  });

  it('renders the per-task table header when perTask is on and the payload has entries', async () => {
    hookState = {
      ...hookState,
      data: makeData({
        perTask: [
          { worker: 'w1', task: 't1', total: 5, input: 2, output: 3 },
        ],
      }),
    };
    const user = userEvent.setup();
    render(<TokenUsage />);
    await user.click(screen.getByLabelText('Per-task'));
    expect(screen.getByText('Per-task (1)')).toBeInTheDocument();
    expect(screen.getByText('w1')).toBeInTheDocument();
    expect(screen.getByText('t1')).toBeInTheDocument();
  });

  it('falls back to the dash placeholder when a per-task row has neither worker nor name', async () => {
    hookState = {
      ...hookState,
      data: makeData({
        perTask: [{ task: 'orphan', total: 1, input: 1, output: 0 }],
      }),
    };
    const user = userEvent.setup();
    render(<TokenUsage />);
    await user.click(screen.getByLabelText('Per-task'));
    // (v1.11.341, TODO 11.323) Dash now also appears in the
    // breakdown DataList for empty avg-per-day / avg-per-worker.
    // Scope to the per-task scroll wrapper so the assertion
    // targets the cell-level dash placeholder.
    const scrollArea = screen.getByTestId('token-usage-per-task-scrollarea');
    expect(within(scrollArea).getByText('-')).toBeInTheDocument();
  });

  it('does NOT render the tier quota panel when quota is null', () => {
    render(<TokenUsage />);
    expect(screen.queryByText('Tier quota (today)')).not.toBeInTheDocument();
  });

  it('renders the tier quota panel when the hook returns a quota payload', () => {
    hookState = { ...hookState, quota: makeQuota() };
    render(<TokenUsage />);
    expect(screen.getByText('Tier quota (today)')).toBeInTheDocument();
  });

  it('renders one row per tier in the quota panel', () => {
    hookState = { ...hookState, quota: makeQuota() };
    render(<TokenUsage />);
    expect(screen.getByText('free')).toBeInTheDocument();
    expect(screen.getByText('pro')).toBeInTheDocument();
  });

  it('renders used/limit numbers for each tier', () => {
    hookState = {
      ...hookState,
      quota: makeQuota({
        tiers: {
          tier1: { used: 100, limit: 1000, pct: 10 },
        },
      }),
    };
    render(<TokenUsage />);
    expect(screen.getByText('100 / 1,000')).toBeInTheDocument();
  });

  it('does NOT render the quota panel when tiers is undefined even if quota is set', () => {
    hookState = {
      ...hookState,
      quota: { date: '2026-05-12' } as QuotaPayload,
    };
    render(<TokenUsage />);
    expect(screen.queryByText('Tier quota (today)')).not.toBeInTheDocument();
  });

  it('re-renders after the locale flips without crashing', () => {
    const { container } = render(<TokenUsage />);
    expect(screen.getByText('Token usage')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(container.firstChild).toBeInTheDocument();
  });

  // (v1.11.341, TODO 11.323) Period tab strip exposes a new
  // 'All time' option that maps to a 100-year window so
  // every recorded day shows up regardless of age.
  it('exposes an "All time" period tab', () => {
    render(<TokenUsage />);
    expect(
      screen.getByRole('tab', { name: 'All time' }),
    ).toBeInTheDocument();
  });

  it('flips the active period to "All time" when its tab is clicked', async () => {
    const user = userEvent.setup();
    render(<TokenUsage />);
    const tab = screen.getByRole('tab', { name: 'All time' });
    expect(tab.getAttribute('aria-selected')).toBe('false');
    await user.click(tab);
    expect(
      screen.getByRole('tab', { name: 'All time' }).getAttribute('aria-selected'),
    ).toBe('true');
  });

  // (v1.11.341, TODO 11.323) Error path renders the
  // ErrorState primitive with a Retry button that fires the
  // hook's refresh callback. role=alert is preserved.
  it('renders the ErrorState with a Retry button on the error path', async () => {
    hookState = { ...hookState, error: 'boom' };
    const user = userEvent.setup();
    render(<TokenUsage />);
    expect(screen.getByTestId('token-usage-error-state')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Retry' });
    expect(retry).toBeInTheDocument();
    await user.click(retry);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  // (v1.11.341, TODO 11.323) Breakdown DataList shows total
  // + input + output + per-day / per-worker averages + the
  // active period label.
  it('renders the breakdown DataList with avg-per-day, avg-per-worker, and period rows', () => {
    hookState = { ...hookState, data: makeData({ total: 100 }) };
    breakdowns = {
      ...breakdowns,
      perWorker: [
        { name: 'a', total: 60 },
        { name: 'b', total: 40 },
      ],
      perDay: [
        { date: '2026-05-12', total: 70 },
        { date: '2026-05-11', total: 30 },
      ],
      workerMax: 60,
      dayMax: 70,
    };
    render(<TokenUsage />);
    const panel = screen.getByTestId('token-usage-breakdown-panel');
    expect(within(panel).getByText('Avg / day')).toBeInTheDocument();
    expect(within(panel).getByText('Avg / worker')).toBeInTheDocument();
    expect(within(panel).getByText('Period')).toBeInTheDocument();
    expect(within(panel).getByText(/Last 7 days/)).toBeInTheDocument();
  });

  // (v1.11.341, TODO 11.323) Per-task table wraps in
  // ScrollArea (data-testid="token-usage-per-task-scrollarea").
  it('wraps the per-task table in a ScrollArea', async () => {
    hookState = {
      ...hookState,
      data: makeData({
        perTask: [
          { worker: 'w1', task: 't1', total: 5, input: 2, output: 3 },
        ],
      }),
    };
    const user = userEvent.setup();
    render(<TokenUsage />);
    await user.click(screen.getByLabelText('Per-task'));
    expect(
      screen.getByTestId('token-usage-per-task-scrollarea'),
    ).toBeInTheDocument();
  });

  // (v1.11.341, TODO 11.323) Per-task table includes an I/O
  // Sparkline column. The Sparkline renders its own
  // data-testid per row so the assertion stays cell-scoped.
  it('renders a Sparkline per per-task row showing the input/output split', async () => {
    hookState = {
      ...hookState,
      data: makeData({
        perTask: [
          { worker: 'w1', task: 't1', total: 5, input: 2, output: 3 },
        ],
      }),
    };
    const user = userEvent.setup();
    render(<TokenUsage />);
    await user.click(screen.getByLabelText('Per-task'));
    expect(
      screen.getByTestId('token-usage-task-spark-w1'),
    ).toBeInTheDocument();
  });
});
