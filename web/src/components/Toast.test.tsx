import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Toast, { TOAST_SWIPE_THRESHOLD } from './Toast';
import type { ToastType } from './Toast';

// Toast is now a portal-rendered, swipe-aware, stack-aware
// banner. The pure-display contract is preserved (role=status,
// auto-dismiss timer, tone-class branches) but each instance
// portals into a lazy #toast-root in document.body and tracks
// pointer / touch drag for swipe-to-dismiss. The parent still
// owns the visibility queue; the Toast component itself never
// imports useToast.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  // Strip the leftover portal node so each test starts with a
  // clean document.body. The Toast component re-creates it on
  // demand on the next mount.
  document.getElementById('toast-root')?.remove();
});

function renderToast(
  overrides: Partial<Parameters<typeof Toast>[0]> = {},
) {
  const onDismiss = vi.fn();
  const props = {
    message: 'Saved.',
    type: 'success' as ToastType,
    onDismiss,
    ...overrides,
  };
  const utils = render(<Toast {...props} />);
  return { ...utils, onDismiss, props };
}

describe('<Toast>', () => {
  // ---- liveness + structure -------------------------------------

  it('renders a status region (role="status") so screen-readers announce the toast', () => {
    renderToast();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders the message text verbatim inside the status region', () => {
    renderToast({ message: 'Branch deleted.' });
    expect(screen.getByRole('status')).toHaveTextContent('Branch deleted.');
  });

  it('renders a long message without truncating it (break-words wrapping)', () => {
    const long = 'A'.repeat(200);
    renderToast({ message: long });
    expect(screen.getByRole('status')).toHaveTextContent(long);
  });

  it('renders an empty status region when message is an empty string', () => {
    renderToast({ message: '' });
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    // The icon span is still present, but no message text.
    expect(status).toHaveTextContent('');
  });

  // ---- tone variants --------------------------------------------

  it('applies the emerald success tone classes when type=success', () => {
    renderToast({ type: 'success' });
    const status = screen.getByRole('status');
    expect(status.className).toMatch(/success/);
  });

  it('applies the destructive error tone classes when type=error', () => {
    renderToast({ type: 'error' });
    const status = screen.getByRole('status');
    expect(status.className).toMatch(/destructive/);
  });

  it('applies the sky info tone classes when type=info', () => {
    renderToast({ type: 'info' });
    const status = screen.getByRole('status');
    expect(status.className).toMatch(/info/);
  });

  it('does NOT apply the success tone classes when type=error', () => {
    renderToast({ type: 'error' });
    expect(screen.getByRole('status').className).not.toMatch(/success/);
  });

  it('does NOT apply the info tone classes when type=success', () => {
    renderToast({ type: 'success' });
    expect(screen.getByRole('status').className).not.toMatch(/info/);
  });

  // ---- icon -----------------------------------------------------

  it('renders exactly one icon SVG inside the toast', () => {
    renderToast();
    // The portal pulls the Toast out of the host container, so
    // the icon lives under document.body via #toast-root rather
    // than the per-render container. Query the portal subtree.
    const root = document.getElementById('toast-root');
    expect(root).not.toBeNull();
    expect(root!.querySelectorAll('svg').length).toBe(1);
  });

  it('marks the icon as aria-hidden so it does not steal an accessible name', () => {
    renderToast();
    const svg = document.getElementById('toast-root')!.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  // ---- auto-dismiss timer ---------------------------------------

  it('does NOT fire onDismiss synchronously on mount', () => {
    const { onDismiss } = renderToast();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('fires onDismiss exactly once after the default 3000ms duration elapses', () => {
    const { onDismiss } = renderToast();
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onDismiss before the configured duration has elapsed', () => {
    const { onDismiss } = renderToast({ duration: 5000 });
    vi.advanceTimersByTime(2999);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('honours a custom duration prop', () => {
    const { onDismiss } = renderToast({ duration: 1000 });
    vi.advanceTimersByTime(999);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('clears the timer on unmount so onDismiss is not called after unmount', () => {
    const { onDismiss, unmount } = renderToast({ duration: 1000 });
    unmount();
    vi.advanceTimersByTime(2000);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('does not fire onDismiss again after the first timer fires (no recurring timer)', () => {
    const { onDismiss } = renderToast({ duration: 500 });
    vi.advanceTimersByTime(500);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // ---- rerender behaviour ---------------------------------------

  it('rerendering with a new message replaces the visible text', () => {
    const { rerender, props } = renderToast({ message: 'first' });
    expect(screen.getByRole('status')).toHaveTextContent('first');
    rerender(<Toast {...props} message="second" />);
    expect(screen.getByRole('status')).toHaveTextContent('second');
    expect(screen.queryByText('first')).not.toBeInTheDocument();
  });

  it('rerendering with a new tone updates the className family', () => {
    const { rerender, props } = renderToast({ type: 'success' });
    expect(screen.getByRole('status').className).toMatch(/success/);
    rerender(<Toast {...props} type="error" />);
    expect(screen.getByRole('status').className).not.toMatch(/success/);
    expect(screen.getByRole('status').className).toMatch(/destructive/);
  });

  it('rerendering with a new onDismiss reference rebinds the timer to the new callback', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, props } = renderToast({
      onDismiss: first,
      duration: 500,
    });
    rerender(<Toast {...props} onDismiss={second} />);
    vi.advanceTimersByTime(500);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('rerendering with a longer duration restarts the timer', () => {
    const { rerender, onDismiss, props } = renderToast({ duration: 500 });
    rerender(<Toast {...props} duration={2000} />);
    vi.advanceTimersByTime(500);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // ---- no built-in dismiss button ------------------------------

  it('does not render any clickable button (parent owns the dismiss control)', async () => {
    vi.useRealTimers();
    const onDismiss = vi.fn();
    render(
      <Toast
        message="x"
        type="info"
        onDismiss={onDismiss}
        duration={999999}
      />,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    const user = userEvent.setup();
    await user.click(screen.getByRole('status'));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  // ---- portal target (v1.11.137) --------------------------------

  it('portals into a lazily-created #toast-root inside document.body, not the host container', () => {
    const { container } = renderToast({ message: 'portal-me' });
    // The host container is the per-render wrapper from RTL. The
    // toast must NOT live inside it; createPortal moves the DOM
    // node into document.body via #toast-root.
    expect(container.querySelector('[role="status"]')).toBeNull();
    const root = document.getElementById('toast-root');
    expect(root).not.toBeNull();
    expect(root!.parentElement).toBe(document.body);
    expect(root!.contains(screen.getByRole('status'))).toBe(true);
  });

  it('reuses an existing #toast-root if one already exists in document.body', () => {
    const existing = document.createElement('div');
    existing.id = 'toast-root';
    existing.setAttribute('data-prewired', 'true');
    document.body.appendChild(existing);
    renderToast();
    const root = document.getElementById('toast-root');
    // Same node, not a fresh one -- the lazy create skipped.
    expect(root).toBe(existing);
    expect(root!.getAttribute('data-prewired')).toBe('true');
  });

  // ---- stacking (v1.11.137) -------------------------------------

  it('renders multiple toasts as separate sibling elements inside #toast-root', () => {
    const onA = vi.fn();
    const onB = vi.fn();
    const onC = vi.fn();
    render(
      <>
        <Toast message="A" type="success" onDismiss={onA} duration={99999} />
        <Toast message="B" type="info" onDismiss={onB} duration={99999} />
        <Toast message="C" type="error" onDismiss={onC} duration={99999} />
      </>,
    );
    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(3);
    expect(statuses[0]).toHaveTextContent('A');
    expect(statuses[1]).toHaveTextContent('B');
    expect(statuses[2]).toHaveTextContent('C');
    const root = document.getElementById('toast-root')!;
    // Each toast wraps its Card in a `[data-testid="toast"]` div;
    // those are the direct siblings the portal stacks.
    expect(root.querySelectorAll('[data-testid="toast"]').length).toBe(3);
  });

  it('unmounting one toast leaves the remaining toasts intact in the portal', () => {
    const { rerender } = render(
      <>
        <Toast message="A" type="success" onDismiss={vi.fn()} duration={99999} />
        <Toast message="B" type="info" onDismiss={vi.fn()} duration={99999} />
      </>,
    );
    expect(screen.getAllByRole('status')).toHaveLength(2);
    rerender(
      <>
        <Toast message="A" type="success" onDismiss={vi.fn()} duration={99999} />
      </>,
    );
    const remaining = screen.getAllByRole('status');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toHaveTextContent('A');
  });

  // ---- swipe-to-dismiss (v1.11.137) -----------------------------

  it('swiping past the horizontal threshold via pointer events triggers onDismiss', () => {
    const { onDismiss } = renderToast({ duration: 999999 });
    const wrap = screen.getByTestId('toast');
    fireEvent.pointerDown(wrap, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(wrap, { clientX: TOAST_SWIPE_THRESHOLD + 10, pointerId: 1 });
    fireEvent.pointerUp(wrap, { clientX: TOAST_SWIPE_THRESHOLD + 10, pointerId: 1 });
    // The exit slide schedules onDismiss after the CSS transition.
    vi.advanceTimersByTime(500);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('swiping back below threshold snaps back without dismissing', () => {
    const { onDismiss } = renderToast({ duration: 999999 });
    const wrap = screen.getByTestId('toast');
    fireEvent.pointerDown(wrap, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(wrap, { clientX: 30, pointerId: 1 });
    fireEvent.pointerUp(wrap, { clientX: 30, pointerId: 1 });
    vi.advanceTimersByTime(500);
    expect(onDismiss).not.toHaveBeenCalled();
    // The toast is still in the document; only the duration timer
    // will eventually fire it (not exercised here).
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('swiping past the threshold via touch events also triggers onDismiss', () => {
    const { onDismiss } = renderToast({ duration: 999999 });
    const wrap = screen.getByTestId('toast');
    fireEvent.touchStart(wrap, {
      touches: [{ clientX: 0, clientY: 0 } as Touch],
    });
    fireEvent.touchMove(wrap, {
      touches: [{ clientX: TOAST_SWIPE_THRESHOLD + 20, clientY: 0 } as Touch],
    });
    fireEvent.touchEnd(wrap, { touches: [] });
    vi.advanceTimersByTime(500);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('negative-direction swipe past threshold also dismisses (left swipe)', () => {
    const { onDismiss } = renderToast({ duration: 999999 });
    const wrap = screen.getByTestId('toast');
    fireEvent.pointerDown(wrap, { clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(wrap, { clientX: 200 - (TOAST_SWIPE_THRESHOLD + 5), pointerId: 1 });
    fireEvent.pointerUp(wrap, { clientX: 200 - (TOAST_SWIPE_THRESHOLD + 5), pointerId: 1 });
    vi.advanceTimersByTime(500);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('pointer move without pointer down is a no-op (no false dismiss)', () => {
    const { onDismiss } = renderToast({ duration: 999999 });
    const wrap = screen.getByTestId('toast');
    fireEvent.pointerMove(wrap, { clientX: TOAST_SWIPE_THRESHOLD + 100, pointerId: 1 });
    fireEvent.pointerUp(wrap, { clientX: TOAST_SWIPE_THRESHOLD + 100, pointerId: 1 });
    vi.advanceTimersByTime(500);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
