import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { PlanResponse } from '../lib/use-plan-content';
import type { Worker } from '../types';
import type { ToastType } from '../components/Toast';

// Plan.tsx composes three feature hooks (usePlanContent for the
// plan markdown, usePlanWorkers for the worker dropdown, and
// usePlanDispatch for both the send + redispatch flows) plus
// useToast for the shared single-slot toast queue. Each hook is
// vi.mock'd to a deterministic shape so the assertions stay
// focused on what the page actually does -- compose buttons,
// inputs, and the plan output panel.

interface PlanContentState {
  plan: PlanResponse | null;
  loading: boolean;
  error: string | null;
  setError: (m: string | null) => void;
  loadPlan: () => Promise<void>;
}

interface PlanWorkersState {
  workers: Worker[];
  loadWorkers: () => Promise<void>;
}

interface PlanDispatchState {
  dispatching: boolean;
  dispatchPlan: () => Promise<void>;
  redispatch: () => Promise<void>;
}

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

const loadPlanMock = vi.fn(async () => {});
const setErrorMock = vi.fn();
const loadWorkersMock = vi.fn(async () => {});
const dispatchPlanMock = vi.fn(async () => {});
const redispatchMock = vi.fn(async () => {});
const showToastMock = vi.fn();
const dismissToastMock = vi.fn();

let planContentState: PlanContentState = {
  plan: null,
  loading: false,
  error: null,
  setError: setErrorMock,
  loadPlan: loadPlanMock,
};

let planWorkersState: PlanWorkersState = {
  workers: [],
  loadWorkers: loadWorkersMock,
};

let planDispatchState: PlanDispatchState = {
  dispatching: false,
  dispatchPlan: dispatchPlanMock,
  redispatch: redispatchMock,
};

let toastState: ToastApi = {
  toast: null,
  showToast: showToastMock,
  dismissToast: dismissToastMock,
};

vi.mock('../lib/use-plan-content', () => ({
  usePlanContent: (): PlanContentState => planContentState,
}));

vi.mock('../lib/use-plan-workers', () => ({
  usePlanWorkers: (): PlanWorkersState => planWorkersState,
}));

vi.mock('../lib/use-plan-dispatch', () => ({
  usePlanDispatch: (): PlanDispatchState => planDispatchState,
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

vi.mock('../lib/markdown', () => ({
  renderMarkdown: (src: string) => (
    <div data-testid="markdown" data-src={src} />
  ),
}));

import Plan from './Plan';

function makeWorker(over: Partial<Worker> = {}): Worker {
  return {
    name: 'wkr-1',
    command: 'claude',
    target: 'local',
    branch: null,
    worktree: null,
    parent: null,
    scope: false,
    pid: null,
    status: 'idle',
    unreadSnapshots: 0,
    totalSnapshots: 0,
    intervention: null,
    lastQuestion: null,
    errorCount: 0,
    phase: null,
    testFailCount: 0,
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  loadPlanMock.mockReset();
  loadPlanMock.mockResolvedValue(undefined);
  setErrorMock.mockReset();
  loadWorkersMock.mockReset();
  loadWorkersMock.mockResolvedValue(undefined);
  dispatchPlanMock.mockReset();
  dispatchPlanMock.mockResolvedValue(undefined);
  redispatchMock.mockReset();
  redispatchMock.mockResolvedValue(undefined);
  showToastMock.mockReset();
  dismissToastMock.mockReset();
  planContentState = {
    plan: null,
    loading: false,
    error: null,
    setError: setErrorMock,
    loadPlan: loadPlanMock,
  };
  planWorkersState = {
    workers: [],
    loadWorkers: loadWorkersMock,
  };
  planDispatchState = {
    dispatching: false,
    dispatchPlan: dispatchPlanMock,
    redispatch: redispatchMock,
  };
  toastState = {
    toast: null,
    showToast: showToastMock,
    dismissToast: dismissToastMock,
  };
  lastToastProps = null;
});

describe('<Plan>', () => {
  it('renders the page title in the frame header', () => {
    render(<Plan />);
    expect(screen.getByText('Plan')).toBeInTheDocument();
  });

  it('renders the page description in the frame header', () => {
    render(<Plan />);
    expect(
      screen.getByText(/Dispatch a planning task/),
    ).toBeInTheDocument();
  });

  it('renders the PageDescriptionBanner marker', () => {
    render(<Plan />);
    expect(screen.getByTestId('page-description-banner')).toBeInTheDocument();
  });

  it('renders the refresh button with the sr-only accessible name', () => {
    render(<Plan />);
    expect(
      screen.getByRole('button', { name: 'Refresh plan' }),
    ).toBeInTheDocument();
  });

  it('disables the refresh button when no worker is selected', () => {
    render(<Plan />);
    expect(
      screen.getByRole('button', { name: 'Refresh plan' }),
    ).toBeDisabled();
  });

  it('disables the refresh button when loading even with a selected worker', () => {
    planWorkersState = {
      ...planWorkersState,
      workers: [makeWorker({ name: 'wkr-1' })],
    };
    planContentState = { ...planContentState, loading: true };
    render(<Plan />);
    expect(
      screen.getByRole('button', { name: 'Refresh plan' }),
    ).toBeDisabled();
  });

  it('enables the refresh button after a worker is selected via the dropdown', async () => {
    planWorkersState = {
      ...planWorkersState,
      workers: [makeWorker({ name: 'wkr-1' })],
    };
    const user = userEvent.setup();
    render(<Plan />);
    await user.selectOptions(
      screen.getByLabelText('Worker'),
      'wkr-1',
    );
    expect(
      screen.getByRole('button', { name: 'Refresh plan' }),
    ).toBeEnabled();
  });

  it('fires loadPlan when the refresh button is clicked', async () => {
    planWorkersState = {
      ...planWorkersState,
      workers: [makeWorker({ name: 'wkr-1' })],
    };
    const user = userEvent.setup();
    render(<Plan />);
    await user.selectOptions(
      screen.getByLabelText('Worker'),
      'wkr-1',
    );
    await user.click(screen.getByRole('button', { name: 'Refresh plan' }));
    expect(loadPlanMock).toHaveBeenCalledTimes(1);
  });

  it('applies the animate-spin class on the refresh icon while loading', () => {
    planContentState = { ...planContentState, loading: true };
    render(<Plan />);
    const btn = screen.getByRole('button', { name: 'Refresh plan' });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').toContain('animate-spin');
  });

  it('does NOT apply the animate-spin class on the refresh icon when idle', () => {
    render(<Plan />);
    const btn = screen.getByRole('button', { name: 'Refresh plan' });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').not.toContain('animate-spin');
  });

  it('renders the Worker label and the dropdown', () => {
    render(<Plan />);
    expect(screen.getByLabelText('Worker')).toBeInTheDocument();
  });

  it('renders the default placeholder option in the worker dropdown', () => {
    render(<Plan />);
    expect(
      screen.getByRole('option', { name: '— select —' }),
    ).toBeInTheDocument();
  });

  it('renders one option per worker in the dropdown', () => {
    planWorkersState = {
      ...planWorkersState,
      workers: [
        makeWorker({ name: 'alpha' }),
        makeWorker({ name: 'beta' }),
      ],
    };
    render(<Plan />);
    expect(screen.getByRole('option', { name: 'alpha' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'beta' })).toBeInTheDocument();
  });

  it('updates the controlled select value when a worker is chosen', async () => {
    planWorkersState = {
      ...planWorkersState,
      workers: [makeWorker({ name: 'alpha' })],
    };
    const user = userEvent.setup();
    render(<Plan />);
    const select = screen.getByLabelText('Worker') as HTMLSelectElement;
    await user.selectOptions(select, 'alpha');
    expect(select.value).toBe('alpha');
  });

  it('renders the Branch input with the placeholder text', () => {
    render(<Plan />);
    expect(
      screen.getByPlaceholderText('c4/my-plan'),
    ).toBeInTheDocument();
  });

  it('controlled Branch input reflects the typed value', async () => {
    const user = userEvent.setup();
    render(<Plan />);
    const input = screen.getByLabelText('Branch (optional)') as HTMLInputElement;
    await user.type(input, 'c4/foo');
    expect(input.value).toBe('c4/foo');
  });

  it('renders the Plan task textarea with the placeholder text', () => {
    render(<Plan />);
    expect(
      screen.getByPlaceholderText('What should the planner design?'),
    ).toBeInTheDocument();
  });

  it('controlled Plan task textarea reflects the typed value', async () => {
    const user = userEvent.setup();
    render(<Plan />);
    const ta = screen.getByLabelText('Plan task') as HTMLTextAreaElement;
    await user.type(ta, 'design X');
    expect(ta.value).toBe('design X');
  });

  it('renders the Output path input with the placeholder text', () => {
    render(<Plan />);
    expect(
      screen.getByPlaceholderText('docs/plans/my-plan.md'),
    ).toBeInTheDocument();
  });

  it('controlled Output input reflects the typed value', async () => {
    const user = userEvent.setup();
    render(<Plan />);
    const input = screen.getByLabelText('Output path (optional)') as HTMLInputElement;
    await user.type(input, 'docs/p.md');
    expect(input.value).toBe('docs/p.md');
  });

  it('renders the Send plan button', () => {
    render(<Plan />);
    expect(
      screen.getByRole('button', { name: /Send plan/ }),
    ).toBeInTheDocument();
  });

  it('fires dispatchPlan when the Send plan button is clicked', async () => {
    const user = userEvent.setup();
    render(<Plan />);
    await user.click(screen.getByRole('button', { name: /Send plan/ }));
    expect(dispatchPlanMock).toHaveBeenCalledTimes(1);
  });

  it('disables the Send plan button while dispatching', () => {
    planDispatchState = { ...planDispatchState, dispatching: true };
    render(<Plan />);
    expect(
      screen.getByRole('button', { name: /Send plan/ }),
    ).toBeDisabled();
  });

  it('flips the Send plan icon to animate-spin while dispatching', () => {
    planDispatchState = { ...planDispatchState, dispatching: true };
    render(<Plan />);
    const btn = screen.getByRole('button', { name: /Send plan/ });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').toContain('animate-spin');
  });

  it('renders the Re-dispatch button', () => {
    render(<Plan />);
    expect(
      screen.getByRole('button', { name: /Re-dispatch as task/ }),
    ).toBeInTheDocument();
  });

  it('disables Re-dispatch when there is no plan content yet', () => {
    planContentState = { ...planContentState, plan: null };
    render(<Plan />);
    expect(
      screen.getByRole('button', { name: /Re-dispatch as task/ }),
    ).toBeDisabled();
  });

  it('disables Re-dispatch while dispatching even with plan content', () => {
    planContentState = {
      ...planContentState,
      plan: { content: '# hi' },
    };
    planDispatchState = { ...planDispatchState, dispatching: true };
    render(<Plan />);
    expect(
      screen.getByRole('button', { name: /Re-dispatch as task/ }),
    ).toBeDisabled();
  });

  it('enables Re-dispatch when plan content is present and not dispatching', () => {
    planContentState = {
      ...planContentState,
      plan: { content: '# hi' },
    };
    render(<Plan />);
    expect(
      screen.getByRole('button', { name: /Re-dispatch as task/ }),
    ).toBeEnabled();
  });

  it('fires redispatch when the Re-dispatch button is clicked', async () => {
    planContentState = {
      ...planContentState,
      plan: { content: '# hi' },
    };
    const user = userEvent.setup();
    render(<Plan />);
    await user.click(
      screen.getByRole('button', { name: /Re-dispatch as task/ }),
    );
    expect(redispatchMock).toHaveBeenCalledTimes(1);
  });

  it('renders the error panel via role=alert when the content hook reports an error', () => {
    planContentState = { ...planContentState, error: 'boom' };
    render(<Plan />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('hides the error panel when error is null', () => {
    render(<Plan />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the LoadingSkeleton inside the plan output panel while loading', () => {
    planContentState = { ...planContentState, loading: true, plan: null };
    render(<Plan />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders the EmptyPanel hint when there is no plan content and not loading', () => {
    render(<Plan />);
    expect(
      screen.getByText(/No plan generated yet/),
    ).toBeInTheDocument();
  });

  it('renders the markdown body when plan content is present', () => {
    planContentState = {
      ...planContentState,
      plan: { content: '# my plan' },
    };
    render(<Plan />);
    const md = screen.getByTestId('markdown');
    expect(md).toBeInTheDocument();
    expect(md.getAttribute('data-src')).toBe('# my plan');
  });

  it('does NOT render the markdown body while loading', () => {
    planContentState = {
      ...planContentState,
      loading: true,
      plan: { content: 'x' },
    };
    render(<Plan />);
    expect(screen.queryByTestId('markdown')).not.toBeInTheDocument();
  });

  it('hides the toast slot when the toast hook is empty', () => {
    render(<Plan />);
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });

  it('renders the Toast marker when the toast slot is non-null', () => {
    toastState = {
      ...toastState,
      toast: { id: 1, message: 'hi', type: 'success' },
    };
    render(<Plan />);
    const t = screen.getByTestId('toast');
    expect(t).toBeInTheDocument();
    expect(lastToastProps?.message).toBe('hi');
    expect(lastToastProps?.type).toBe('success');
  });

  it('renders the Plan output panel heading', () => {
    render(<Plan />);
    expect(screen.getByText('Plan output')).toBeInTheDocument();
  });

  it('re-renders the worker option list after rerender when workers change', () => {
    planWorkersState = {
      ...planWorkersState,
      workers: [makeWorker({ name: 'alpha' })],
    };
    const { rerender } = render(<Plan />);
    expect(screen.getByRole('option', { name: 'alpha' })).toBeInTheDocument();
    planWorkersState = {
      ...planWorkersState,
      workers: [
        makeWorker({ name: 'alpha' }),
        makeWorker({ name: 'beta' }),
      ],
    };
    rerender(<Plan />);
    expect(screen.getByRole('option', { name: 'beta' })).toBeInTheDocument();
  });

  it('re-renders after the locale flips without crashing', () => {
    const { container } = render(<Plan />);
    expect(screen.getByText('Plan')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(container.firstChild).toBeInTheDocument();
  });
});
