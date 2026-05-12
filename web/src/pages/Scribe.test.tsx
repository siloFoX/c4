import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type {
  UseScribeState,
  ScribeStatus,
  ContextResponse,
} from '../lib/use-scribe';
import type { ToastType } from '../components/Toast';

// Scribe.tsx wires PageFrame + useScribe (status + context state
// machine + start/stop/scan/refresh action wrapper) + the shared
// single-slot useToast. Stub both hooks so each test drives a
// single branch of the running / busy / loading / context flow
// without touching fetch. PageDescriptionBanner + Toast +
// formatRelativeTime are stubbed to thin markers so the
// assertions stay focused on the page composition.

const refreshMock = vi.fn(async () => {});
const actMock = vi.fn(async () => {});
const showToastMock = vi.fn();
const dismissToastMock = vi.fn();

interface ToastSlot {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastApi {
  toast: ToastSlot | null;
  showToast: (m: string, t: ToastType) => void;
  dismissToast: () => void;
}

let hookState: UseScribeState = {
  status: null,
  context: null,
  loading: false,
  busy: null,
  error: null,
  refresh: refreshMock,
  act: actMock,
};

let toastState: ToastApi = {
  toast: null,
  showToast: showToastMock,
  dismissToast: dismissToastMock,
};

vi.mock('../lib/use-scribe', () => ({
  useScribe: (): UseScribeState => hookState,
}));

vi.mock('../lib/use-toast', () => ({
  useToast: (): ToastApi => toastState,
}));

vi.mock('../components/PageDescriptionBanner', () => ({
  PageDescriptionBanner: () => (
    <div data-testid="page-description-banner" />
  ),
}));

vi.mock('../components/HelpUIRoot', () => ({
  openHelpDrawer: vi.fn(),
}));

interface CapturedToastProps {
  message: string;
  type: string;
}

let lastToastProps: CapturedToastProps | null = null;

vi.mock('../components/Toast', () => ({
  default: (props: CapturedToastProps & { onDismiss: () => void }) => {
    lastToastProps = { message: props.message, type: props.type };
    return (
      <div
        data-testid="toast"
        data-message={props.message}
        data-type={props.type}
      />
    );
  },
}));

vi.mock('../lib/format', () => ({
  formatRelativeTime: (input: unknown) =>
    input == null ? '-' : `rel(${String(input)})`,
}));

import Scribe from './Scribe';

function makeStatus(over: Partial<ScribeStatus> = {}): ScribeStatus {
  return {
    running: false,
    lastScan: null,
    scans: 0,
    sessions: 0,
    contextPath: '/tmp/scribe.md',
    ...over,
  };
}

function makeContext(over: Partial<ContextResponse> = {}): ContextResponse {
  return {
    content: 'snapshot body',
    path: '/tmp/scribe.md',
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  refreshMock.mockReset();
  refreshMock.mockResolvedValue(undefined);
  actMock.mockReset();
  actMock.mockResolvedValue(undefined);
  showToastMock.mockReset();
  dismissToastMock.mockReset();
  hookState = {
    status: null,
    context: null,
    loading: false,
    busy: null,
    error: null,
    refresh: refreshMock,
    act: actMock,
  };
  toastState = {
    toast: null,
    showToast: showToastMock,
    dismissToast: dismissToastMock,
  };
  lastToastProps = null;
});

describe('<Scribe>', () => {
  it('renders the page title in the frame header', () => {
    render(<Scribe />);
    expect(screen.getByText('Scribe')).toBeInTheDocument();
  });

  it('renders the page description in the frame header', () => {
    render(<Scribe />);
    expect(
      screen.getByText(/Session context recorder/),
    ).toBeInTheDocument();
  });

  it('renders the PageDescriptionBanner marker', () => {
    render(<Scribe />);
    expect(screen.getByTestId('page-description-banner')).toBeInTheDocument();
  });

  it('renders the Start, Stop, Scan and Refresh buttons', () => {
    render(<Scribe />);
    expect(
      screen.getByRole('button', { name: /Start/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Stop/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Scan/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Refresh scribe status' }),
    ).toBeInTheDocument();
  });

  it('enables Start when scribe is NOT running', () => {
    hookState = { ...hookState, status: makeStatus({ running: false }) };
    render(<Scribe />);
    expect(
      screen.getByRole('button', { name: /Start/ }),
    ).toBeEnabled();
  });

  it('disables Start when scribe is already running', () => {
    hookState = { ...hookState, status: makeStatus({ running: true }) };
    render(<Scribe />);
    expect(
      screen.getByRole('button', { name: /Start/ }),
    ).toBeDisabled();
  });

  it('enables Stop when scribe is running', () => {
    hookState = { ...hookState, status: makeStatus({ running: true }) };
    render(<Scribe />);
    expect(
      screen.getByRole('button', { name: /Stop/ }),
    ).toBeEnabled();
  });

  it('disables Stop when scribe is NOT running', () => {
    hookState = { ...hookState, status: makeStatus({ running: false }) };
    render(<Scribe />);
    expect(
      screen.getByRole('button', { name: /Stop/ }),
    ).toBeDisabled();
  });

  it('disables every action button while any action is busy', () => {
    hookState = {
      ...hookState,
      status: makeStatus({ running: true }),
      busy: '/api/scribe/scan',
    };
    render(<Scribe />);
    expect(screen.getByRole('button', { name: /Start/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Stop/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Scan/ })).toBeDisabled();
  });

  it('fires act with the start endpoint when Start is clicked', async () => {
    hookState = { ...hookState, status: makeStatus({ running: false }) };
    const user = userEvent.setup();
    render(<Scribe />);
    await user.click(screen.getByRole('button', { name: /Start/ }));
    expect(actMock).toHaveBeenCalledWith('/api/scribe/start', 'Scribe start');
  });

  it('fires act with the stop endpoint when Stop is clicked', async () => {
    hookState = { ...hookState, status: makeStatus({ running: true }) };
    const user = userEvent.setup();
    render(<Scribe />);
    await user.click(screen.getByRole('button', { name: /Stop/ }));
    expect(actMock).toHaveBeenCalledWith('/api/scribe/stop', 'Scribe stop');
  });

  it('fires act with the scan endpoint when Scan is clicked', async () => {
    const user = userEvent.setup();
    render(<Scribe />);
    await user.click(screen.getByRole('button', { name: /Scan/ }));
    expect(actMock).toHaveBeenCalledWith('/api/scribe/scan', 'Scribe scan');
  });

  it('fires refresh when the Refresh button is clicked', async () => {
    const user = userEvent.setup();
    render(<Scribe />);
    await user.click(
      screen.getByRole('button', { name: 'Refresh scribe status' }),
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('disables Refresh while loading', () => {
    hookState = { ...hookState, loading: true };
    render(<Scribe />);
    expect(
      screen.getByRole('button', { name: 'Refresh scribe status' }),
    ).toBeDisabled();
  });

  it('flips the Refresh icon to animate-spin while loading', () => {
    hookState = { ...hookState, loading: true };
    render(<Scribe />);
    const btn = screen.getByRole('button', { name: 'Refresh scribe status' });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').toContain('animate-spin');
  });

  it('renders the loading skeleton when loading with no status yet', () => {
    hookState = { ...hookState, loading: true, status: null };
    render(<Scribe />);
    // The LoadingSkeleton has aria-live="polite"; the EmptyPanel for the
    // missing context block also uses role=status but without aria-live.
    const skeletons = screen
      .getAllByRole('status')
      .filter((el) => el.getAttribute('aria-live') === 'polite');
    expect(skeletons).toHaveLength(1);
  });

  it('does NOT render the loading skeleton when status is already present', () => {
    hookState = { ...hookState, loading: true, status: makeStatus() };
    render(<Scribe />);
    const skeletons = screen
      .queryAllByRole('status')
      .filter((el) => el.getAttribute('aria-live') === 'polite');
    expect(skeletons).toHaveLength(0);
  });

  it('renders the error panel via role=alert when the hook reports an error', () => {
    hookState = { ...hookState, error: 'boom' };
    render(<Scribe />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('renders the Running row with `yes` when status.running is true', () => {
    hookState = { ...hookState, status: makeStatus({ running: true }) };
    render(<Scribe />);
    expect(screen.getByText('yes')).toBeInTheDocument();
  });

  it('renders the Running row with `no` when status.running is false', () => {
    hookState = { ...hookState, status: makeStatus({ running: false }) };
    render(<Scribe />);
    expect(screen.getByText('no')).toBeInTheDocument();
  });

  it('renders the formatted lastScan value via formatRelativeTime', () => {
    hookState = {
      ...hookState,
      status: makeStatus({ lastScan: '2026-05-12T07:00:00.000Z' }),
    };
    render(<Scribe />);
    expect(
      screen.getByText('rel(2026-05-12T07:00:00.000Z)'),
    ).toBeInTheDocument();
  });

  it('renders the dash placeholder for lastScan when null', () => {
    hookState = {
      ...hookState,
      status: makeStatus({ lastScan: null }),
    };
    render(<Scribe />);
    // Look up the lastScan row by label, then assert its value cell is "-"
    const label = screen.getByText('Last scan');
    const row = label.parentElement as HTMLElement;
    expect(row.textContent).toContain('-');
  });

  it('renders the scans count', () => {
    hookState = { ...hookState, status: makeStatus({ scans: 7 }) };
    render(<Scribe />);
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('renders the sessions count', () => {
    hookState = { ...hookState, status: makeStatus({ sessions: 3 }) };
    render(<Scribe />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders the dash placeholder for scans when missing', () => {
    hookState = { ...hookState, status: makeStatus({ scans: undefined }) };
    render(<Scribe />);
    const label = screen.getByText('Scans');
    const row = label.parentElement as HTMLElement;
    expect(row.textContent).toContain('-');
  });

  it('renders the context path', () => {
    hookState = {
      ...hookState,
      status: makeStatus({ contextPath: '/tmp/foo.md' }),
    };
    render(<Scribe />);
    expect(screen.getByText('/tmp/foo.md')).toBeInTheDocument();
  });

  it('renders the dash placeholder for contextPath when empty', () => {
    hookState = {
      ...hookState,
      status: makeStatus({ contextPath: '' }),
    };
    render(<Scribe />);
    const label = screen.getByText('Context path');
    const row = label.parentElement as HTMLElement;
    expect(row.textContent).toContain('-');
  });

  it('renders the recent-context heading', () => {
    render(<Scribe />);
    expect(screen.getByText('Recent context')).toBeInTheDocument();
  });

  it('renders the recent-context body when context.content is present', () => {
    hookState = {
      ...hookState,
      context: makeContext({ content: 'snapshot body' }),
    };
    render(<Scribe />);
    expect(screen.getByText('snapshot body')).toBeInTheDocument();
  });

  it('renders the empty-context hint when context.content is missing', () => {
    hookState = {
      ...hookState,
      context: makeContext({ content: undefined }),
    };
    render(<Scribe />);
    expect(
      screen.getByText(/No context snapshot yet/),
    ).toBeInTheDocument();
  });

  it('renders the empty-context hint when context is null', () => {
    hookState = { ...hookState, context: null };
    render(<Scribe />);
    expect(
      screen.getByText(/No context snapshot yet/),
    ).toBeInTheDocument();
  });

  it('hides the toast slot when the toast hook is empty', () => {
    render(<Scribe />);
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });

  it('renders the Toast marker when the toast slot is non-null', () => {
    toastState = {
      ...toastState,
      toast: { id: 1, message: 'scan ok', type: 'success' },
    };
    render(<Scribe />);
    expect(screen.getByTestId('toast')).toBeInTheDocument();
    expect(lastToastProps?.message).toBe('scan ok');
    expect(lastToastProps?.type).toBe('success');
  });

  it('renders the running indicator with the ok tone class when running', () => {
    hookState = { ...hookState, status: makeStatus({ running: true }) };
    render(<Scribe />);
    const yes = screen.getByText('yes');
    expect(yes.className).toContain('text-emerald-400');
  });

  it('renders the running indicator with the muted tone class when not running', () => {
    hookState = { ...hookState, status: makeStatus({ running: false }) };
    render(<Scribe />);
    const no = screen.getByText('no');
    expect(no.className).toContain('text-muted-foreground');
  });

  it('focuses the recent-context pre via tabIndex=0 for keyboard scroll', () => {
    hookState = {
      ...hookState,
      context: makeContext({ content: 'snapshot body' }),
    };
    const { container } = render(<Scribe />);
    const pre = container.querySelector('pre') as HTMLPreElement;
    expect(pre).not.toBeNull();
    expect(pre.getAttribute('tabindex')).toBe('0');
  });

  it('renders the page even when status is absent (empty status pane suppressed)', () => {
    hookState = { ...hookState, status: null };
    render(<Scribe />);
    expect(screen.getByText('Scribe')).toBeInTheDocument();
    expect(screen.queryByText('Running')).not.toBeInTheDocument();
  });

  it('rerenders to reflect status mutation across renders', () => {
    hookState = { ...hookState, status: makeStatus({ running: false }) };
    const { rerender } = render(<Scribe />);
    expect(screen.getByText('no')).toBeInTheDocument();
    hookState = { ...hookState, status: makeStatus({ running: true }) };
    rerender(<Scribe />);
    expect(screen.getByText('yes')).toBeInTheDocument();
  });

  it('re-renders after the locale flips without crashing', () => {
    const { container } = render(<Scribe />);
    expect(screen.getByText('Scribe')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(container.firstChild).toBeInTheDocument();
  });
});
