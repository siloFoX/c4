import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Toast from './Toast';
import type { ToastType } from './Toast';

// Toast is a pure-display banner with a single side effect: a
// setTimeout(onDismiss, duration) that fires after the configured
// delay. There is no internal state and no controlled-input surface;
// the parent owns the visibility queue. Tests drive the prop union
// directly: the tone-class branches (success / error / info), the
// role=status liveness contract, the message-verbatim render, the
// auto-dismiss timer (with vi.useFakeTimers), the cleanup on unmount,
// and the rerender contract for new messages.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
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
    expect(status.className).toMatch(/emerald/);
  });

  it('applies the destructive error tone classes when type=error', () => {
    renderToast({ type: 'error' });
    const status = screen.getByRole('status');
    expect(status.className).toMatch(/destructive/);
  });

  it('applies the sky info tone classes when type=info', () => {
    renderToast({ type: 'info' });
    const status = screen.getByRole('status');
    expect(status.className).toMatch(/sky/);
  });

  it('does NOT apply the success tone classes when type=error', () => {
    renderToast({ type: 'error' });
    expect(screen.getByRole('status').className).not.toMatch(/emerald/);
  });

  it('does NOT apply the info tone classes when type=success', () => {
    renderToast({ type: 'success' });
    expect(screen.getByRole('status').className).not.toMatch(/sky/);
  });

  // ---- icon -----------------------------------------------------

  it('renders exactly one icon SVG inside the toast', () => {
    const { container } = renderToast();
    expect(container.querySelectorAll('svg').length).toBe(1);
  });

  it('marks the icon as aria-hidden so it does not steal an accessible name', () => {
    const { container } = renderToast();
    const svg = container.querySelector('svg');
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
    expect(screen.getByRole('status').className).toMatch(/emerald/);
    rerender(<Toast {...props} type="error" />);
    expect(screen.getByRole('status').className).not.toMatch(/emerald/);
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
});
