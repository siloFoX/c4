import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { ToastState } from '../lib/use-toast';
import type { ToastType } from './Toast';
import type { ActionConfig, ActionKind } from './WorkerActions';

// WorkerActions wires two hooks (useToast, useWorkerActionStrip)
// and a single Toast child slot. Each test stubs both hooks to a
// deterministic shape so we can drive busyKind / toast state by
// fiat, and stubs Toast to a marker that exposes the message +
// type + dismiss button via data-* + a test-id. The four action
// buttons (merge, approve, interrupt, close) are then driven via
// userEvent and asserted to call runAction with the right
// ActionConfig payload.

const showToastMock = vi.fn();
const dismissToastMock = vi.fn();
const runActionMock = vi.fn(async (_action: ActionConfig) => {});

let toastState: { toast: ToastState | null } = { toast: null };
let stripState: { busyKind: ActionKind | null } = { busyKind: null };
let lastStripArgs: {
  showToast: (msg: string, type: ToastType) => void;
} | null = null;

vi.mock('../lib/use-toast', () => ({
  useToast: () => ({
    toast: toastState.toast,
    showToast: showToastMock,
    dismissToast: dismissToastMock,
  }),
}));

vi.mock('../lib/use-worker-action-strip', () => ({
  useWorkerActionStrip: (args: {
    showToast: (msg: string, type: ToastType) => void;
  }) => {
    lastStripArgs = args;
    return { busyKind: stripState.busyKind, runAction: runActionMock };
  },
}));

interface CapturedToastProps {
  message: string;
  type: ToastType;
  onDismiss: () => void;
}

let lastToastProps: CapturedToastProps | null = null;

vi.mock('./Toast', () => ({
  default: (props: CapturedToastProps) => {
    lastToastProps = props;
    return (
      <div
        data-testid="toast"
        data-message={props.message}
        data-type={props.type}
      >
        <button
          type="button"
          data-testid="toast-dismiss"
          onClick={props.onDismiss}
        >
          dismiss
        </button>
      </div>
    );
  },
}));

import WorkerActions from './WorkerActions';

const ALL_KINDS: ActionKind[] = ['merge', 'approve', 'interrupt', 'close'];

const KIND_LABEL_EN: Record<ActionKind, string> = {
  merge: 'Merge',
  approve: 'Approve',
  interrupt: 'Ctrl+C',
  close: 'Close',
};

const KIND_ENDPOINT: Record<ActionKind, string> = {
  merge: '/api/merge',
  approve: '/api/key',
  interrupt: '/api/key',
  close: '/api/close',
};

function getButton(label: string): HTMLButtonElement {
  return screen.getByRole('button', { name: label }) as HTMLButtonElement;
}

beforeEach(() => {
  setLocale('en');
  showToastMock.mockReset();
  dismissToastMock.mockReset();
  runActionMock.mockReset();
  runActionMock.mockResolvedValue(undefined);
  toastState = { toast: null };
  stripState = { busyKind: null };
  lastStripArgs = null;
  lastToastProps = null;
});

describe('<WorkerActions>', () => {
  // ---- default render -------------------------------------------

  it('renders the four action buttons (merge / approve / interrupt / close)', () => {
    render(<WorkerActions workerName="w1" />);
    expect(getButton('Merge')).toBeInTheDocument();
    expect(getButton('Approve')).toBeInTheDocument();
    expect(getButton('Ctrl+C')).toBeInTheDocument();
    expect(getButton('Close')).toBeInTheDocument();
  });

  it('renders exactly four buttons inside the action strip', () => {
    const { container } = render(<WorkerActions workerName="w1" />);
    const strip = container.querySelector('.flex.flex-wrap.gap-2') as HTMLElement;
    expect(strip).toBeInTheDocument();
    expect(within(strip).getAllByRole('button')).toHaveLength(4);
  });

  it('renders the localized label text inside every button', () => {
    render(<WorkerActions workerName="w1" />);
    for (const kind of ALL_KINDS) {
      expect(screen.getByText(KIND_LABEL_EN[kind])).toBeInTheDocument();
    }
  });

  it('sets type="button" on every action button', () => {
    render(<WorkerActions workerName="w1" />);
    for (const kind of ALL_KINDS) {
      expect(getButton(KIND_LABEL_EN[kind])).toHaveAttribute('type', 'button');
    }
  });

  // ---- variant -> class mapping ----------------------------------

  it('applies the outline variant class on the merge button', () => {
    render(<WorkerActions workerName="w1" />);
    expect(getButton('Merge').className).toMatch(/border-input/);
  });

  it('applies the outline variant class on the approve button', () => {
    render(<WorkerActions workerName="w1" />);
    expect(getButton('Approve').className).toMatch(/border-input/);
  });

  it('applies the outline variant class on the interrupt button', () => {
    render(<WorkerActions workerName="w1" />);
    expect(getButton('Ctrl+C').className).toMatch(/border-input/);
  });

  it('applies the destructive variant class on the close button', () => {
    render(<WorkerActions workerName="w1" />);
    expect(getButton('Close').className).toMatch(/bg-destructive/);
  });

  // ---- workerName forwarding into the ActionConfig payload ------

  it('fires runAction with the merge ActionConfig when the merge button is clicked', async () => {
    const user = userEvent.setup();
    render(<WorkerActions workerName="alpha" />);
    await user.click(getButton('Merge'));
    expect(runActionMock).toHaveBeenCalledTimes(1);
    const action = runActionMock.mock.calls[0][0];
    expect(action.kind).toBe('merge');
    expect(action.endpoint).toBe('/api/merge');
    expect(action.body).toEqual({ name: 'alpha' });
    expect(action.confirm).toContain('alpha');
    expect(action.successMessage).toContain('alpha');
    expect(action.variant).toBe('outline');
  });

  it('fires runAction with the approve ActionConfig when the approve button is clicked', async () => {
    const user = userEvent.setup();
    render(<WorkerActions workerName="bravo" />);
    await user.click(getButton('Approve'));
    expect(runActionMock).toHaveBeenCalledTimes(1);
    const action = runActionMock.mock.calls[0][0];
    expect(action.kind).toBe('approve');
    expect(action.endpoint).toBe('/api/key');
    expect(action.body).toEqual({ name: 'bravo', key: 'Enter' });
    expect(action.confirm).toContain('bravo');
    expect(action.successMessage).toContain('bravo');
    expect(action.variant).toBe('outline');
  });

  it('fires runAction with the interrupt ActionConfig when the Ctrl+C button is clicked', async () => {
    const user = userEvent.setup();
    render(<WorkerActions workerName="charlie" />);
    await user.click(getButton('Ctrl+C'));
    expect(runActionMock).toHaveBeenCalledTimes(1);
    const action = runActionMock.mock.calls[0][0];
    expect(action.kind).toBe('interrupt');
    expect(action.endpoint).toBe('/api/key');
    expect(action.body).toEqual({ name: 'charlie', key: 'C-c' });
    expect(action.confirm).toContain('charlie');
    expect(action.variant).toBe('outline');
  });

  it('fires runAction with the close ActionConfig when the close button is clicked', async () => {
    const user = userEvent.setup();
    render(<WorkerActions workerName="delta" />);
    await user.click(getButton('Close'));
    expect(runActionMock).toHaveBeenCalledTimes(1);
    const action = runActionMock.mock.calls[0][0];
    expect(action.kind).toBe('close');
    expect(action.endpoint).toBe('/api/close');
    expect(action.body).toEqual({ name: 'delta' });
    expect(action.confirm).toContain('delta');
    expect(action.variant).toBe('destructive');
  });

  it('embeds the workerName into every action.body payload', () => {
    render(<WorkerActions workerName="echo" />);
    return Promise.all(
      ALL_KINDS.map(async (kind) => {
        runActionMock.mockClear();
        const user = userEvent.setup();
        await user.click(getButton(KIND_LABEL_EN[kind]));
        const action = runActionMock.mock.calls[0][0];
        expect(action.body).toMatchObject({ name: 'echo' });
      }),
    );
  });

  // ---- per-kind onRunSingle dispatch path -----------------------

  it('passes the merge action endpoint /api/merge through to runAction', async () => {
    const user = userEvent.setup();
    render(<WorkerActions workerName="w1" />);
    await user.click(getButton('Merge'));
    expect(runActionMock.mock.calls[0][0].endpoint).toBe(KIND_ENDPOINT.merge);
  });

  it('passes the approve action endpoint /api/key through to runAction', async () => {
    const user = userEvent.setup();
    render(<WorkerActions workerName="w1" />);
    await user.click(getButton('Approve'));
    expect(runActionMock.mock.calls[0][0].endpoint).toBe(KIND_ENDPOINT.approve);
  });

  it('passes the close action endpoint /api/close through to runAction', async () => {
    const user = userEvent.setup();
    render(<WorkerActions workerName="w1" />);
    await user.click(getButton('Close'));
    expect(runActionMock.mock.calls[0][0].endpoint).toBe(KIND_ENDPOINT.close);
  });

  // ---- busy / disabled state -----------------------------------

  it('leaves every button enabled when busyKind is null', () => {
    stripState = { busyKind: null };
    render(<WorkerActions workerName="w1" />);
    for (const kind of ALL_KINDS) {
      expect(getButton(KIND_LABEL_EN[kind])).not.toBeDisabled();
    }
  });

  it('disables ALL buttons when busyKind is set (parent locks the strip)', () => {
    stripState = { busyKind: 'merge' };
    render(<WorkerActions workerName="w1" />);
    for (const kind of ALL_KINDS) {
      expect(getButton(KIND_LABEL_EN[kind])).toBeDisabled();
    }
  });

  it('disables every button while approve is busy', () => {
    stripState = { busyKind: 'approve' };
    render(<WorkerActions workerName="w1" />);
    for (const kind of ALL_KINDS) {
      expect(getButton(KIND_LABEL_EN[kind])).toBeDisabled();
    }
  });

  it('disables every button while close is busy', () => {
    stripState = { busyKind: 'close' };
    render(<WorkerActions workerName="w1" />);
    for (const kind of ALL_KINDS) {
      expect(getButton(KIND_LABEL_EN[kind])).toBeDisabled();
    }
  });

  it('renders the Loader2 spinner inside the busy button (merge)', () => {
    stripState = { busyKind: 'merge' };
    render(<WorkerActions workerName="w1" />);
    const btn = getButton('Merge');
    const spinner = btn.querySelector('svg.animate-spin');
    expect(spinner).toBeTruthy();
    expect(spinner).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders the Loader2 spinner inside the busy button (approve)', () => {
    stripState = { busyKind: 'approve' };
    render(<WorkerActions workerName="w1" />);
    const btn = getButton('Approve');
    expect(btn.querySelector('svg.animate-spin')).toBeTruthy();
  });

  it('renders the Loader2 spinner inside the busy button (interrupt)', () => {
    stripState = { busyKind: 'interrupt' };
    render(<WorkerActions workerName="w1" />);
    const btn = getButton('Ctrl+C');
    expect(btn.querySelector('svg.animate-spin')).toBeTruthy();
  });

  it('renders the Loader2 spinner inside the busy button (close)', () => {
    stripState = { busyKind: 'close' };
    render(<WorkerActions workerName="w1" />);
    const btn = getButton('Close');
    expect(btn.querySelector('svg.animate-spin')).toBeTruthy();
  });

  it('shows the spinner ONLY on the busy button, not on idle sibling buttons', () => {
    stripState = { busyKind: 'merge' };
    render(<WorkerActions workerName="w1" />);
    expect(getButton('Merge').querySelector('svg.animate-spin')).toBeTruthy();
    expect(getButton('Approve').querySelector('svg.animate-spin')).toBeFalsy();
    expect(getButton('Close').querySelector('svg.animate-spin')).toBeFalsy();
  });

  it('does NOT fire runAction when a disabled button is clicked (busy state)', async () => {
    stripState = { busyKind: 'merge' };
    const user = userEvent.setup();
    render(<WorkerActions workerName="w1" />);
    await user.click(getButton('Approve'));
    expect(runActionMock).not.toHaveBeenCalled();
  });

  it('does NOT fire runAction for the same-kind button while it is busy', async () => {
    stripState = { busyKind: 'close' };
    const user = userEvent.setup();
    render(<WorkerActions workerName="w1" />);
    await user.click(getButton('Close'));
    expect(runActionMock).not.toHaveBeenCalled();
  });

  // ---- keyboard handling ---------------------------------------

  it('triggers runAction when the focused merge button receives Enter', async () => {
    const user = userEvent.setup();
    render(<WorkerActions workerName="w1" />);
    const btn = getButton('Merge');
    btn.focus();
    await user.keyboard('{Enter}');
    expect(runActionMock).toHaveBeenCalledTimes(1);
    expect(runActionMock.mock.calls[0][0].kind).toBe('merge');
  });

  it('triggers runAction when the focused close button receives Space', async () => {
    const user = userEvent.setup();
    render(<WorkerActions workerName="w1" />);
    const btn = getButton('Close');
    btn.focus();
    await user.keyboard(' ');
    expect(runActionMock).toHaveBeenCalledTimes(1);
    expect(runActionMock.mock.calls[0][0].kind).toBe('close');
  });

  it('walks focus through every action button in order via Tab', async () => {
    const user = userEvent.setup();
    render(<WorkerActions workerName="w1" />);
    await user.tab();
    expect(getButton('Merge')).toHaveFocus();
    await user.tab();
    expect(getButton('Approve')).toHaveFocus();
    await user.tab();
    expect(getButton('Ctrl+C')).toHaveFocus();
    await user.tab();
    expect(getButton('Close')).toHaveFocus();
  });

  // ---- showToast forwarding into the action-strip hook ----------

  it('forwards the useToast.showToast reference into useWorkerActionStrip', () => {
    render(<WorkerActions workerName="w1" />);
    expect(lastStripArgs).not.toBeNull();
    expect(lastStripArgs?.showToast).toBe(showToastMock);
  });

  // ---- Toast slot rendering ------------------------------------

  it('does NOT render the Toast slot when the hook returns no toast', () => {
    toastState = { toast: null };
    render(<WorkerActions workerName="w1" />);
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });

  it('renders the Toast slot with the hook-provided message + type', () => {
    toastState = {
      toast: { id: 1, message: 'ok', type: 'success' },
    };
    render(<WorkerActions workerName="w1" />);
    const slot = screen.getByTestId('toast');
    expect(slot).toHaveAttribute('data-message', 'ok');
    expect(slot).toHaveAttribute('data-type', 'success');
  });

  it('routes the Toast slot onDismiss through to useToast.dismissToast', async () => {
    toastState = {
      toast: { id: 1, message: 'err', type: 'error' },
    };
    const user = userEvent.setup();
    render(<WorkerActions workerName="w1" />);
    await user.click(screen.getByTestId('toast-dismiss'));
    expect(dismissToastMock).toHaveBeenCalledTimes(1);
  });

  it('renders an error-type toast when the hook publishes one', () => {
    toastState = {
      toast: { id: 2, message: 'merge failed', type: 'error' },
    };
    render(<WorkerActions workerName="w1" />);
    expect(screen.getByTestId('toast')).toHaveAttribute('data-type', 'error');
  });

  it('renders an info-type toast when the hook publishes one', () => {
    toastState = {
      toast: { id: 3, message: 'info', type: 'info' },
    };
    render(<WorkerActions workerName="w1" />);
    expect(screen.getByTestId('toast')).toHaveAttribute('data-type', 'info');
  });

  // ---- icon slot ------------------------------------------------

  it('renders an icon SVG inside the merge button when idle', () => {
    render(<WorkerActions workerName="w1" />);
    expect(getButton('Merge').querySelector('svg')).toBeTruthy();
    expect(getButton('Merge').querySelector('svg.animate-spin')).toBeFalsy();
  });

  it('renders an icon SVG inside the approve button when idle', () => {
    render(<WorkerActions workerName="w1" />);
    expect(getButton('Approve').querySelector('svg')).toBeTruthy();
  });

  it('renders an icon SVG inside the interrupt button when idle', () => {
    render(<WorkerActions workerName="w1" />);
    expect(getButton('Ctrl+C').querySelector('svg')).toBeTruthy();
  });

  it('renders an icon SVG inside the close button when idle', () => {
    render(<WorkerActions workerName="w1" />);
    expect(getButton('Close').querySelector('svg')).toBeTruthy();
  });

  // ---- locale flip ----------------------------------------------

  it('re-renders the merge label in Korean when the locale flips to ko', () => {
    render(<WorkerActions workerName="w1" />);
    expect(screen.getByText('Merge')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Merge')).not.toBeInTheDocument();
  });

  it('re-renders the approve label in Korean when the locale flips to ko', () => {
    render(<WorkerActions workerName="w1" />);
    expect(screen.getByText('Approve')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Approve')).not.toBeInTheDocument();
  });

  it('re-renders the close label in Korean when the locale flips to ko', () => {
    render(<WorkerActions workerName="w1" />);
    expect(screen.getByText('Close')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Close')).not.toBeInTheDocument();
  });

  // ---- workerName prop variations -------------------------------

  it('rebuilds the merge confirm string when workerName changes on rerender', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<WorkerActions workerName="foo" />);
    await user.click(getButton('Merge'));
    expect(runActionMock.mock.calls[0][0].body).toEqual({ name: 'foo' });

    runActionMock.mockClear();
    rerender(<WorkerActions workerName="bar" />);
    await user.click(getButton('Merge'));
    expect(runActionMock.mock.calls[0][0].body).toEqual({ name: 'bar' });
    expect(runActionMock.mock.calls[0][0].confirm).toContain('bar');
  });

  it('handles a workerName with dashes / underscores without re-encoding it', async () => {
    const user = userEvent.setup();
    render(<WorkerActions workerName="auto-w_49" />);
    await user.click(getButton('Close'));
    expect(runActionMock.mock.calls[0][0].body).toEqual({
      name: 'auto-w_49',
    });
    expect(runActionMock.mock.calls[0][0].confirm).toContain('auto-w_49');
  });

  // ---- rerender stability --------------------------------------

  it('keeps the same set of buttons after rerendering with identical props', () => {
    const { rerender } = render(<WorkerActions workerName="w1" />);
    expect(screen.getAllByRole('button')).toHaveLength(4);
    rerender(<WorkerActions workerName="w1" />);
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('flips buttons into disabled state when busyKind transitions from null to a kind', () => {
    stripState = { busyKind: null };
    const { rerender } = render(<WorkerActions workerName="w1" />);
    expect(getButton('Merge')).not.toBeDisabled();
    stripState = { busyKind: 'merge' };
    rerender(<WorkerActions workerName="w1" />);
    expect(getButton('Merge')).toBeDisabled();
    expect(getButton('Close')).toBeDisabled();
  });

  it('flips buttons back to enabled state when busyKind transitions back to null', () => {
    stripState = { busyKind: 'close' };
    const { rerender } = render(<WorkerActions workerName="w1" />);
    expect(getButton('Close')).toBeDisabled();
    stripState = { busyKind: null };
    rerender(<WorkerActions workerName="w1" />);
    expect(getButton('Close')).not.toBeDisabled();
    expect(getButton('Merge')).not.toBeDisabled();
  });
});
