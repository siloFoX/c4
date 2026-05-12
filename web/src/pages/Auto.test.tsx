import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type {
  AutoResponse,
  UseAutoDispatchState,
} from '../lib/use-auto-dispatch';
import type { ToastType } from '../components/Toast';

// Auto.tsx wires PageFrame + two hooks (useAutoDispatch for the
// POST /api/auto spawn flow + useToast for the shared single-slot
// toast queue) and two local useState slots for the name + task
// inputs. Stub both hooks so each test drives a single branch of
// the idle / busy / result / error matrix without booting fetch.
// PageDescriptionBanner + Toast are stubbed to thin markers so we
// are not asserting against their long copy.

const dispatchMock = vi.fn(async () => {});
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

let hookState: UseAutoDispatchState = {
  busy: false,
  error: null,
  result: null,
  dispatch: dispatchMock,
};

let toastState: ToastApi = {
  toast: null,
  showToast: showToastMock,
  dismissToast: dismissToastMock,
};

vi.mock('../lib/use-auto-dispatch', () => ({
  useAutoDispatch: (): UseAutoDispatchState => hookState,
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

import Auto from './Auto';

function makeResult(over: Partial<AutoResponse> = {}): AutoResponse {
  return {
    name: 'auto-mgr-1',
    branch: 'c4/auto-mgr-1',
    status: 'spawned',
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  dispatchMock.mockReset();
  dispatchMock.mockResolvedValue(undefined);
  showToastMock.mockReset();
  dismissToastMock.mockReset();
  hookState = {
    busy: false,
    error: null,
    result: null,
    dispatch: dispatchMock,
  };
  toastState = {
    toast: null,
    showToast: showToastMock,
    dismissToast: dismissToastMock,
  };
  lastToastProps = null;
});

describe('<Auto>', () => {
  it('renders the page title in the frame header', () => {
    render(<Auto />);
    expect(screen.getByText('Auto mode')).toBeInTheDocument();
  });

  it('renders the page description in the frame header', () => {
    render(<Auto />);
    expect(
      screen.getByText(/Spawn an autonomous manager \+ scribe pair/),
    ).toBeInTheDocument();
  });

  it('renders the PageDescriptionBanner marker', () => {
    render(<Auto />);
    expect(
      screen.getByTestId('page-description-banner'),
    ).toBeInTheDocument();
  });

  it('renders the Dispatch button with the visible label', () => {
    render(<Auto />);
    expect(
      screen.getByRole('button', { name: 'Dispatch' }),
    ).toBeInTheDocument();
  });

  it('renders the Typical scenarios panel heading', () => {
    render(<Auto />);
    expect(screen.getByText('Typical scenarios')).toBeInTheDocument();
  });

  it('renders all three scenario list items', () => {
    render(<Auto />);
    expect(screen.getByText(/Overnight refactor/)).toBeInTheDocument();
    expect(screen.getByText(/Triage backlog/)).toBeInTheDocument();
    expect(screen.getByText(/Spike a design/)).toBeInTheDocument();
  });

  it('renders the Manager name label', () => {
    render(<Auto />);
    expect(
      screen.getByText('Manager name (optional)'),
    ).toBeInTheDocument();
  });

  it('renders the Task field label', () => {
    render(<Auto />);
    expect(screen.getByText('Task')).toBeInTheDocument();
  });

  it('associates the Manager name label with its input via htmlFor', () => {
    render(<Auto />);
    expect(
      screen.getByLabelText('Manager name (optional)'),
    ).toBeInTheDocument();
  });

  it('associates the Task label with its textarea via htmlFor', () => {
    render(<Auto />);
    expect(screen.getByLabelText('Task')).toBeInTheDocument();
  });

  it('renders the name input placeholder', () => {
    render(<Auto />);
    expect(
      screen.getByPlaceholderText('auto-mgr'),
    ).toBeInTheDocument();
  });

  it('renders the task textarea placeholder', () => {
    render(<Auto />);
    expect(
      screen.getByPlaceholderText(
        'Describe the outcome for the autonomous manager to deliver.',
      ),
    ).toBeInTheDocument();
  });

  it('fires the hook dispatch handler when the Dispatch button is clicked', async () => {
    const user = userEvent.setup();
    render(<Auto />);
    await user.click(screen.getByRole('button', { name: 'Dispatch' }));
    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });

  it('disables the Dispatch button while busy', () => {
    hookState = { ...hookState, busy: true };
    render(<Auto />);
    expect(
      screen.getByRole('button', { name: 'Dispatch' }),
    ).toBeDisabled();
  });

  it('enables the Dispatch button when not busy', () => {
    render(<Auto />);
    expect(
      screen.getByRole('button', { name: 'Dispatch' }),
    ).toBeEnabled();
  });

  it('shows the spinning RefreshCw icon when busy', () => {
    hookState = { ...hookState, busy: true };
    render(<Auto />);
    const btn = screen.getByRole('button', { name: 'Dispatch' });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').toContain('animate-spin');
  });

  it('does NOT apply animate-spin on the Dispatch icon when idle', () => {
    render(<Auto />);
    const btn = screen.getByRole('button', { name: 'Dispatch' });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').not.toContain('animate-spin');
  });

  it('updates the name input as the user types', async () => {
    const user = userEvent.setup();
    render(<Auto />);
    const input = screen.getByLabelText(
      'Manager name (optional)',
    ) as HTMLInputElement;
    await user.type(input, 'demo-mgr');
    expect(input.value).toBe('demo-mgr');
  });

  it('updates the task textarea as the user types', async () => {
    const user = userEvent.setup();
    render(<Auto />);
    const ta = screen.getByLabelText('Task') as HTMLTextAreaElement;
    await user.type(ta, 'do the thing');
    expect(ta.value).toBe('do the thing');
  });

  it('renders the error panel via role=alert when the hook reports an error', () => {
    hookState = { ...hookState, error: 'task missing' };
    render(<Auto />);
    expect(screen.getByRole('alert')).toHaveTextContent('task missing');
  });

  it('hides the error panel when error is null', () => {
    render(<Auto />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hides the result panel when result is null', () => {
    render(<Auto />);
    expect(screen.queryByText('Dispatched')).not.toBeInTheDocument();
  });

  it('renders the result panel heading when a result is present', () => {
    hookState = { ...hookState, result: makeResult() };
    render(<Auto />);
    expect(screen.getByText('Dispatched')).toBeInTheDocument();
  });

  it('renders the manager name in the result panel', () => {
    hookState = { ...hookState, result: makeResult({ name: 'mgr-42' }) };
    render(<Auto />);
    expect(screen.getByText('Manager:')).toBeInTheDocument();
    expect(screen.getByText('mgr-42')).toBeInTheDocument();
  });

  it('renders the branch in the result panel', () => {
    hookState = {
      ...hookState,
      result: makeResult({ branch: 'c4/mgr-42' }),
    };
    render(<Auto />);
    expect(screen.getByText('Branch:')).toBeInTheDocument();
    expect(screen.getByText('c4/mgr-42')).toBeInTheDocument();
  });

  it('renders the status field in the result panel', () => {
    hookState = {
      ...hookState,
      result: makeResult({ status: 'queued' }),
    };
    render(<Auto />);
    expect(screen.getByText('Status:')).toBeInTheDocument();
    expect(screen.getByText('queued')).toBeInTheDocument();
  });

  it('hides the manager row when the result has no name field', () => {
    hookState = {
      ...hookState,
      result: makeResult({ name: undefined }),
    };
    render(<Auto />);
    expect(screen.queryByText('Manager:')).not.toBeInTheDocument();
  });

  it('hides the branch row when the result has no branch field', () => {
    hookState = {
      ...hookState,
      result: makeResult({ branch: undefined }),
    };
    render(<Auto />);
    expect(screen.queryByText('Branch:')).not.toBeInTheDocument();
  });

  it('hides the status row when the result has no status field', () => {
    hookState = {
      ...hookState,
      result: makeResult({ status: undefined }),
    };
    render(<Auto />);
    expect(screen.queryByText('Status:')).not.toBeInTheDocument();
  });

  it('keeps the toast slot empty when the toast hook has no entry', () => {
    render(<Auto />);
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });

  it('renders the Toast marker when the toast slot is non-null', () => {
    toastState = {
      ...toastState,
      toast: { id: 1, message: 'spawned', type: 'success' },
    };
    render(<Auto />);
    expect(screen.getByTestId('toast')).toBeInTheDocument();
    expect(lastToastProps?.message).toBe('spawned');
    expect(lastToastProps?.type).toBe('success');
  });

  it('forwards an error tone correctly to the toast marker', () => {
    toastState = {
      ...toastState,
      toast: { id: 1, message: 'bad', type: 'error' },
    };
    render(<Auto />);
    expect(lastToastProps?.type).toBe('error');
  });

  it('renders both the error panel and result panel together when both are set', () => {
    hookState = {
      ...hookState,
      error: 'partial',
      result: makeResult(),
    };
    render(<Auto />);
    expect(screen.getByRole('alert')).toHaveTextContent('partial');
    expect(screen.getByText('Dispatched')).toBeInTheDocument();
  });

  it('forwards rerender state changes through hookState mutation', () => {
    const { rerender } = render(<Auto />);
    expect(screen.queryByText('Dispatched')).not.toBeInTheDocument();
    hookState = { ...hookState, result: makeResult({ name: 'fresh' }) };
    rerender(<Auto />);
    expect(screen.getByText('Dispatched')).toBeInTheDocument();
    expect(screen.getByText('fresh')).toBeInTheDocument();
  });

  it('keeps the name input enabled while busy (only the button is gated)', () => {
    hookState = { ...hookState, busy: true };
    render(<Auto />);
    expect(
      screen.getByLabelText('Manager name (optional)'),
    ).toBeEnabled();
  });

  it('re-renders after the locale flips without crashing', () => {
    const { container } = render(<Auto />);
    expect(screen.getByText('Auto mode')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(container.firstChild).toBeInTheDocument();
  });
});
