import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { BatchResponse } from '../lib/use-batch-submit';
import type { ToastState } from '../lib/use-toast';
import type { ToastType } from '../components/Toast';

// Batch.tsx wires PageFrame, the local form state for task / count /
// branch / profile / autoMode / mode, the useBatchSubmit hook that
// fires POST /api/batch, and a useToast slot. Stub both hooks so each
// test drives a single branch without touching fetch, timers, or the
// real Toast auto-dismiss path. Stub PageDescriptionBanner to a thin
// marker so the long help copy is not asserted against.

const submitMock = vi.fn(async () => {});
const showToastMock = vi.fn((_m: string, _t: ToastType) => {});
const dismissToastMock = vi.fn(() => {});

interface BatchHookState {
  busy: boolean;
  result: BatchResponse | null;
  error: string | null;
  submit: () => Promise<void>;
}

let batchState: BatchHookState = {
  busy: false,
  result: null,
  error: null,
  submit: submitMock,
};

let toastState: ToastState | null = null;

vi.mock('../lib/use-batch-submit', () => ({
  useBatchSubmit: (): BatchHookState => batchState,
}));

vi.mock('../lib/use-toast', () => ({
  useToast: () => ({
    toast: toastState,
    showToast: showToastMock,
    dismissToast: dismissToastMock,
  }),
}));

vi.mock('../components/PageDescriptionBanner', () => ({
  PageDescriptionBanner: ({ action }: { action?: React.ReactNode }) => (
    <div data-testid="page-description-banner">{action}</div>
  ),
}));

vi.mock('../components/HelpUIRoot', () => ({
  openHelpDrawer: vi.fn(),
}));

import Batch from './Batch';

function makeResult(over: Partial<BatchResponse> = {}): BatchResponse {
  return {
    ok: 2,
    fail: 0,
    total: 2,
    results: [
      { name: 'batch-1', ok: true },
      { name: 'batch-2', ok: true },
    ],
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  submitMock.mockReset();
  submitMock.mockResolvedValue(undefined);
  showToastMock.mockReset();
  dismissToastMock.mockReset();
  batchState = {
    busy: false,
    result: null,
    error: null,
    submit: submitMock,
  };
  toastState = null;
});

describe('<Batch>', () => {
  it('renders the page title in the frame header', () => {
    render(<Batch />);
    expect(screen.getByText('Batch dispatch')).toBeInTheDocument();
  });

  it('renders the page description in the frame header', () => {
    render(<Batch />);
    expect(
      screen.getByText(/Send the same task to N workers or one task per line/),
    ).toBeInTheDocument();
  });

  it('renders the dispatch button with the idle label', () => {
    render(<Batch />);
    expect(
      screen.getByRole('button', { name: 'Dispatch' }),
    ).toBeInTheDocument();
  });

  it('renders the PageDescriptionBanner marker', () => {
    render(<Batch />);
    expect(screen.getByTestId('page-description-banner')).toBeInTheDocument();
  });

  it('renders the try-example button inside the description banner', () => {
    render(<Batch />);
    expect(
      screen.getByRole('button', { name: 'Prefill an example task' }),
    ).toBeInTheDocument();
  });

  it('renders the count-mode toggle as the default selection', () => {
    render(<Batch />);
    expect(
      screen.getByRole('button', { name: 'Same task N times' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'One task per line' }),
    ).toBeInTheDocument();
  });

  it('renders the task textarea in count mode', () => {
    render(<Batch />);
    expect(screen.getByLabelText('Task')).toBeInTheDocument();
  });

  it('renders the count input in count mode', () => {
    render(<Batch />);
    expect(screen.getByLabelText('Count')).toBeInTheDocument();
  });

  it('renders the name-prefix input in count mode', () => {
    render(<Batch />);
    expect(screen.getByLabelText('Name prefix')).toBeInTheDocument();
  });

  it('flips to file-mode and renders the tasks textarea', async () => {
    const user = userEvent.setup();
    render(<Batch />);
    await user.click(
      screen.getByRole('button', { name: 'One task per line' }),
    );
    expect(
      screen.getByLabelText(/Tasks \(one per line/),
    ).toBeInTheDocument();
  });

  it('hides the count input after flipping to file-mode', async () => {
    const user = userEvent.setup();
    render(<Batch />);
    await user.click(
      screen.getByRole('button', { name: 'One task per line' }),
    );
    expect(screen.queryByLabelText('Count')).not.toBeInTheDocument();
  });

  it('renders the branch-prefix input', () => {
    render(<Batch />);
    expect(screen.getByLabelText('Branch prefix')).toBeInTheDocument();
  });

  it('renders the profile input', () => {
    render(<Batch />);
    expect(screen.getByLabelText('Profile')).toBeInTheDocument();
  });

  it('renders the auto-mode checkbox', () => {
    render(<Batch />);
    expect(screen.getByLabelText('Auto mode')).toBeInTheDocument();
  });

  it('toggles the auto-mode checkbox on click', async () => {
    const user = userEvent.setup();
    render(<Batch />);
    const cb = screen.getByLabelText('Auto mode') as HTMLInputElement;
    expect(cb.checked).toBe(false);
    await user.click(cb);
    expect(cb.checked).toBe(true);
  });

  it('reflects typed text in the task textarea', async () => {
    const user = userEvent.setup();
    render(<Batch />);
    const ta = screen.getByLabelText('Task') as HTMLTextAreaElement;
    await user.type(ta, 'do the thing');
    expect(ta.value).toBe('do the thing');
  });

  it('reflects typed text in the count input', async () => {
    const user = userEvent.setup();
    render(<Batch />);
    const input = screen.getByLabelText('Count') as HTMLInputElement;
    expect(input.value).toBe('1');
    await user.type(input, '5');
    expect(input.value).toBe('15');
  });

  it('fires submit when the dispatch button is clicked', async () => {
    const user = userEvent.setup();
    render(<Batch />);
    await user.click(screen.getByRole('button', { name: 'Dispatch' }));
    expect(submitMock).toHaveBeenCalledTimes(1);
  });

  it('disables the dispatch button while busy', () => {
    batchState = { ...batchState, busy: true };
    render(<Batch />);
    expect(
      screen.getByRole('button', { name: /Dispatching/ }),
    ).toBeDisabled();
  });

  it('flips the dispatch button label to dispatching while busy', () => {
    batchState = { ...batchState, busy: true };
    render(<Batch />);
    expect(screen.getByText(/Dispatching/)).toBeInTheDocument();
  });

  it('renders the error panel via role=alert when the hook reports an error', () => {
    batchState = { ...batchState, error: 'task required' };
    render(<Batch />);
    expect(screen.getByRole('alert')).toHaveTextContent('task required');
  });

  it('does NOT render the results panel when result is null', () => {
    render(<Batch />);
    expect(screen.queryByText('Results')).not.toBeInTheDocument();
  });

  it('renders the results panel header when the hook returns a result', () => {
    batchState = { ...batchState, result: makeResult() };
    render(<Batch />);
    expect(screen.getByText('Results')).toBeInTheDocument();
  });

  it('renders the results summary line with ok/fail/total counts', () => {
    batchState = {
      ...batchState,
      result: makeResult({ ok: 1, fail: 1, total: 2 }),
    };
    render(<Batch />);
    expect(screen.getByText(/1 ok \/ 1 failed \/ 2 total/)).toBeInTheDocument();
  });

  it('renders one row per worker outcome in the results list', () => {
    batchState = {
      ...batchState,
      result: makeResult({
        results: [
          { name: 'batch-1', ok: true },
          { name: 'batch-2', ok: false, error: 'boom' },
        ],
      }),
    };
    render(<Batch />);
    expect(screen.getByText('batch-1')).toBeInTheDocument();
    expect(screen.getByText('batch-2')).toBeInTheDocument();
  });

  it('marks a successful outcome with the emerald tone class', () => {
    batchState = {
      ...batchState,
      result: makeResult({
        results: [{ name: 'batch-ok', ok: true }],
      }),
    };
    const { container } = render(<Batch />);
    const li = container.querySelector('ul > li');
    expect(li?.className || '').toContain('text-emerald-400');
  });

  it('marks a failed outcome with the destructive tone class', () => {
    batchState = {
      ...batchState,
      result: makeResult({
        results: [{ name: 'batch-bad', ok: false, error: 'boom' }],
      }),
    };
    const { container } = render(<Batch />);
    const li = container.querySelector('ul > li');
    expect(li?.className || '').toContain('text-destructive');
  });

  it('renders the failure reason inline next to the worker name', () => {
    batchState = {
      ...batchState,
      result: makeResult({
        results: [{ name: 'batch-bad', ok: false, error: 'boom' }],
      }),
    };
    render(<Batch />);
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });

  it('renders the created label for a successful outcome', () => {
    batchState = {
      ...batchState,
      result: makeResult({
        results: [{ name: 'batch-ok', ok: true }],
      }),
    };
    render(<Batch />);
    expect(screen.getByText(/created/)).toBeInTheDocument();
  });

  it('falls back to "failed" when a failed outcome has no error message', () => {
    batchState = {
      ...batchState,
      result: makeResult({
        ok: 0,
        fail: 1,
        total: 1,
        results: [{ name: 'batch-bad', ok: false }],
      }),
    };
    const { container } = render(<Batch />);
    const li = container.querySelector('ul > li');
    expect(li?.textContent).toContain('failed');
  });

  it('renders the toast slot when the toast state is populated', () => {
    toastState = { id: 1, message: 'dispatched', type: 'success' };
    render(<Batch />);
    expect(screen.getByText('dispatched')).toBeInTheDocument();
  });

  it('does NOT render any toast when the slot is null', () => {
    render(<Batch />);
    expect(screen.queryByText('dispatched')).not.toBeInTheDocument();
  });

  it('prefills the task in count mode when the try-example button is clicked', async () => {
    const user = userEvent.setup();
    render(<Batch />);
    await user.click(
      screen.getByRole('button', { name: 'Prefill an example task' }),
    );
    const ta = screen.getByLabelText('Task') as HTMLTextAreaElement;
    expect(ta.value.length).toBeGreaterThan(0);
  });

  it('prefills the tasks textarea in file mode when the try-example button is clicked', async () => {
    const user = userEvent.setup();
    render(<Batch />);
    await user.click(
      screen.getByRole('button', { name: 'One task per line' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Prefill an example task' }),
    );
    const ta = screen.getByLabelText(/Tasks \(one per line/) as HTMLTextAreaElement;
    expect(ta.value.length).toBeGreaterThan(0);
  });

  it('applies the animate-spin class on the dispatch icon while busy', () => {
    batchState = { ...batchState, busy: true };
    render(<Batch />);
    const btn = screen.getByRole('button', { name: /Dispatching/ });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').toContain('animate-spin');
  });

  it('does NOT apply the animate-spin class on the dispatch icon when idle', () => {
    render(<Batch />);
    const btn = screen.getByRole('button', { name: 'Dispatch' });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').not.toContain('animate-spin');
  });

  it('re-renders after the locale flips without crashing', () => {
    const { container } = render(<Batch />);
    expect(screen.getByText('Batch dispatch')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(container.firstChild).toBeInTheDocument();
  });
});
