import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { HealthPayload, UseHealthState } from '../lib/use-health';

// Health.tsx renders PageFrame + a single hook (useHealth). Stub the
// hook to a deterministic shape so each test drives a single branch
// without booting fetch / setInterval. Stub PageDescriptionBanner to
// a thin marker so we are not asserting against its long copy.

const refreshMock = vi.fn(async () => {});

let hookState: UseHealthState = {
  data: null,
  loading: false,
  error: null,
  refresh: refreshMock,
};

vi.mock('../lib/use-health', () => ({
  useHealth: (): UseHealthState => hookState,
}));

vi.mock('../components/PageDescriptionBanner', () => ({
  PageDescriptionBanner: () => (
    <div data-testid="page-description-banner" />
  ),
}));

vi.mock('../components/HelpUIRoot', () => ({
  openHelpDrawer: vi.fn(),
}));

import Health from './Health';

function makeHealth(over: Partial<HealthPayload> = {}): HealthPayload {
  return {
    ok: true,
    pid: 1234,
    uptime: 60,
    startedAt: '2026-05-12T00:00:00.000Z',
    version: '1.11.46',
    workers: 3,
    activeWorkers: 1,
    idleWorkers: 2,
    queueDepth: 0,
    lostWorkers: 0,
    eventLoopLagMs: 4,
    modules: [],
    configPath: '/etc/c4/config.json',
    ...over,
  };
}

function statValue(label: string): HTMLElement {
  const lbl = screen.getByText(label);
  if (lbl.tagName === 'DT') {
    const dd = lbl.nextElementSibling as HTMLElement | null;
    if (!dd) throw new Error(`no <dd> for stat "${label}"`);
    return dd;
  }
  const cell = lbl.parentElement as HTMLElement;
  const value = cell.querySelector('.font-mono');
  if (!value) throw new Error(`no font-mono value for stat "${label}"`);
  return value as HTMLElement;
}

beforeEach(() => {
  setLocale('en');
  refreshMock.mockReset();
  refreshMock.mockResolvedValue(undefined);
  hookState = {
    data: null,
    loading: false,
    error: null,
    refresh: refreshMock,
  };
});

describe('<Health>', () => {
  it('renders the page title in the frame header', () => {
    render(<Health />);
    expect(screen.getByText('Health')).toBeInTheDocument();
  });

  it('renders the page description in the frame header', () => {
    render(<Health />);
    expect(
      screen.getByText(/Daemon heartbeat/),
    ).toBeInTheDocument();
  });

  it('renders the refresh button with the accessible name from i18n', () => {
    render(<Health />);
    expect(
      screen.getByRole('button', { name: 'Refresh health' }),
    ).toBeInTheDocument();
  });

  it('renders the PageDescriptionBanner marker', () => {
    render(<Health />);
    expect(screen.getByTestId('page-description-banner')).toBeInTheDocument();
  });

  it('fires the hook refresh handler when the refresh button is clicked', async () => {
    hookState = { ...hookState, data: makeHealth() };
    const user = userEvent.setup();
    render(<Health />);
    await user.click(screen.getByRole('button', { name: 'Refresh health' }));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('disables the refresh button when the hook is loading', () => {
    hookState = { ...hookState, loading: true };
    render(<Health />);
    expect(
      screen.getByRole('button', { name: 'Refresh health' }),
    ).toBeDisabled();
  });

  it('enables the refresh button when the hook is not loading', () => {
    hookState = { ...hookState, data: makeHealth(), loading: false };
    render(<Health />);
    expect(
      screen.getByRole('button', { name: 'Refresh health' }),
    ).toBeEnabled();
  });

  it('renders the loading skeleton when loading with no data yet', () => {
    hookState = { ...hookState, loading: true, data: null };
    render(<Health />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does NOT render the loading skeleton when data is already present', () => {
    hookState = { ...hookState, loading: true, data: makeHealth() };
    render(<Health />);
    // The skeleton's status role is gated on `!data`. Stat panels do not
    // expose role=status, so any role=status here would be the skeleton.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders the error panel via role=alert when the hook reports an error', () => {
    hookState = { ...hookState, error: 'boom', data: null };
    render(<Health />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('does NOT render the data grid while the hook is in an error state', () => {
    hookState = { ...hookState, error: 'boom', data: null };
    render(<Health />);
    expect(screen.queryByText('PID')).not.toBeInTheDocument();
  });

  it('renders the healthy badge when data.ok is true', () => {
    hookState = { ...hookState, data: makeHealth({ ok: true }) };
    render(<Health />);
    expect(screen.getByText('healthy')).toBeInTheDocument();
  });

  it('renders the degraded badge when data.ok is false', () => {
    hookState = { ...hookState, data: makeHealth({ ok: false }) };
    render(<Health />);
    expect(screen.getByText('degraded')).toBeInTheDocument();
  });

  it('treats absent ok flag as healthy', () => {
    hookState = { ...hookState, data: makeHealth({ ok: undefined }) };
    render(<Health />);
    expect(screen.getByText('healthy')).toBeInTheDocument();
  });

  it('renders the version string when present', () => {
    hookState = { ...hookState, data: makeHealth({ version: '9.9.9' }) };
    render(<Health />);
    expect(screen.getByText('v9.9.9')).toBeInTheDocument();
  });

  it('renders the config path when present', () => {
    hookState = {
      ...hookState,
      data: makeHealth({ configPath: '/tmp/cfg.json' }),
    };
    render(<Health />);
    expect(screen.getByText('/tmp/cfg.json')).toBeInTheDocument();
  });

  it('renders the PID stat with the formatted number', () => {
    hookState = { ...hookState, data: makeHealth({ pid: 4242 }) };
    render(<Health />);
    expect(statValue('PID')).toHaveTextContent('4242');
  });

  it('renders the dash placeholder when PID is missing', () => {
    hookState = { ...hookState, data: makeHealth({ pid: undefined }) };
    render(<Health />);
    expect(statValue('PID')).toHaveTextContent('-');
  });

  it('renders the uptime stat from seconds via formatDuration', () => {
    // formatDuration takes ms; the page multiplies uptime (seconds) by 1000.
    hookState = { ...hookState, data: makeHealth({ uptime: 65 }) };
    render(<Health />);
    expect(statValue('Uptime')).toHaveTextContent('1m 5s');
  });

  it('renders the workers-total stat as a formatted number', () => {
    hookState = { ...hookState, data: makeHealth({ workers: 7 }) };
    render(<Health />);
    expect(statValue('Workers total')).toHaveTextContent('7');
  });

  it('renders the active workers stat from activeWorkers when present', () => {
    hookState = {
      ...hookState,
      data: makeHealth({ activeWorkers: 5, busyWorkers: 9 }),
    };
    render(<Health />);
    expect(statValue('Active')).toHaveTextContent('5');
  });

  it('falls back to busyWorkers for the active stat when activeWorkers is missing', () => {
    hookState = {
      ...hookState,
      data: makeHealth({ activeWorkers: undefined, busyWorkers: 9 }),
    };
    render(<Health />);
    expect(statValue('Active')).toHaveTextContent('9');
  });

  it('renders the idle workers stat', () => {
    hookState = { ...hookState, data: makeHealth({ idleWorkers: 4 }) };
    render(<Health />);
    expect(statValue('Idle')).toHaveTextContent('4');
  });

  it('renders the queue depth stat', () => {
    hookState = { ...hookState, data: makeHealth({ queueDepth: 11 }) };
    render(<Health />);
    expect(statValue('Queue depth')).toHaveTextContent('11');
  });

  it('renders the lost workers stat', () => {
    hookState = { ...hookState, data: makeHealth({ lostWorkers: 2 }) };
    render(<Health />);
    expect(statValue('Lost workers')).toHaveTextContent('2');
  });

  it('renders the event-loop lag stat as `<n> ms` when present', () => {
    hookState = { ...hookState, data: makeHealth({ eventLoopLagMs: 7 }) };
    render(<Health />);
    expect(statValue('Event-loop lag')).toHaveTextContent('7 ms');
  });

  it('renders the dash placeholder for event-loop lag when null', () => {
    hookState = {
      ...hookState,
      data: makeHealth({ eventLoopLagMs: undefined }),
    };
    render(<Health />);
    expect(statValue('Event-loop lag')).toHaveTextContent('-');
  });

  it('renders the modules panel header with the count when modules is non-empty', () => {
    hookState = {
      ...hookState,
      data: makeHealth({ modules: ['a.js', 'b.js'] }),
    };
    render(<Health />);
    expect(screen.getByText('Loaded modules (2)')).toBeInTheDocument();
  });

  it('renders each module entry in a list', () => {
    hookState = {
      ...hookState,
      data: makeHealth({ modules: ['alpha.js', 'beta.js'] }),
    };
    render(<Health />);
    expect(screen.getByText('alpha.js')).toBeInTheDocument();
    expect(screen.getByText('beta.js')).toBeInTheDocument();
  });

  it('renders the empty-modules hint when the modules array is empty', () => {
    hookState = { ...hookState, data: makeHealth({ modules: [] }) };
    render(<Health />);
    expect(
      screen.getByText(/Loaded-modules.*not yet exposed/),
    ).toBeInTheDocument();
  });

  it('renders the empty-modules hint when modules is missing entirely', () => {
    hookState = { ...hookState, data: makeHealth({ modules: undefined }) };
    render(<Health />);
    expect(
      screen.getByText(/Loaded-modules.*not yet exposed/),
    ).toBeInTheDocument();
  });

  it('applies the animate-spin class on the refresh icon when loading', () => {
    hookState = { ...hookState, data: makeHealth(), loading: true };
    render(<Health />);
    const btn = screen.getByRole('button', { name: 'Refresh health' });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').toContain('animate-spin');
  });

  it('does NOT apply the animate-spin class on the refresh icon when idle', () => {
    hookState = { ...hookState, data: makeHealth(), loading: false };
    render(<Health />);
    const btn = screen.getByRole('button', { name: 'Refresh health' });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').not.toContain('animate-spin');
  });

  it('forwards consecutive prop-state changes via rerender', () => {
    hookState = { ...hookState, data: makeHealth({ workers: 1 }) };
    const { rerender } = render(<Health />);
    expect(statValue('Workers total')).toHaveTextContent('1');
    hookState = { ...hookState, data: makeHealth({ workers: 50 }) };
    rerender(<Health />);
    expect(statValue('Workers total')).toHaveTextContent('50');
  });

  it('renders all nine stat tiles when data is loaded', () => {
    hookState = { ...hookState, data: makeHealth() };
    render(<Health />);
    for (const label of [
      'PID',
      'Uptime',
      'Started',
      'Workers total',
      'Active',
      'Idle',
      'Queue depth',
      'Lost workers',
      'Event-loop lag',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('keeps the modules ul accessible by listing every module name', () => {
    hookState = {
      ...hookState,
      data: makeHealth({ modules: ['m1', 'm2', 'm3'] }),
    };
    const { container } = render(<Health />);
    const lis = container.querySelectorAll('ul > li');
    expect(lis).toHaveLength(3);
  });

  it('re-renders after the locale flips without crashing', () => {
    hookState = { ...hookState, data: makeHealth() };
    const { container } = render(<Health />);
    expect(screen.getByText('Health')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(container.firstChild).toBeInTheDocument();
  });
});
