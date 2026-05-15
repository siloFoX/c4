import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Toast, {
  TOAST_ICON,
  TOAST_SWIPE_THRESHOLD,
  TOAST_PRIORITY,
  TOAST_VISIBLE_LIMIT,
  ToastStack,
  partitionToasts,
} from './Toast';
import type { ToastEntry, ToastType } from './Toast';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

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

  // ---- warning tone (11.211) ------------------------------------

  it('applies the warning tone classes when type=warning', () => {
    renderToast({ type: 'warning' });
    const status = screen.getByRole('status');
    expect(status.className).toMatch(/warning/);
  });

  // ---- severity icon glyphs (11.239) ----------------------------
  // Aligns the per-type leading icon with the Badge signal-icon
  // family so a colourblind operator can read severity from the
  // glyph as well as the tone.

  it('renders the CheckCircle2 glyph for type=success (lucide-circle-check)', () => {
    renderToast({ type: 'success' });
    const svg = document.getElementById('toast-root')!.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('class') ?? '').toContain('lucide-circle-check');
  });

  it('renders the XCircle glyph for type=error (lucide-circle-x)', () => {
    renderToast({ type: 'error' });
    const svg = document.getElementById('toast-root')!.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('class') ?? '').toContain('lucide-circle-x');
  });

  it('renders the AlertTriangle glyph for type=warning (lucide-triangle-alert)', () => {
    renderToast({ type: 'warning' });
    const svg = document.getElementById('toast-root')!.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('class') ?? '').toContain('lucide-triangle-alert');
  });

  it('renders the Info glyph for type=info (lucide-info)', () => {
    renderToast({ type: 'info' });
    const svg = document.getElementById('toast-root')!.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('class') ?? '').toContain('lucide-info');
  });

  it('tags the icon with data-toast-icon=<type> so e2e selectors can pick severity', () => {
    renderToast({ type: 'error' });
    const svg = document.getElementById('toast-root')!.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('data-toast-icon')).toBe('error');
  });

  it('renders a distinct glyph for error vs warning (no doubled triangles)', () => {
    // error -> XCircle (lucide-circle-x); warning -> AlertTriangle
    // (lucide-triangle-alert). Prior to v1.11.257 both used
    // AlertTriangle so the two severities were not visually distinct.
    const { unmount } = renderToast({ type: 'error' });
    const errSvgClass =
      document.getElementById('toast-root')!.querySelector('svg')!.getAttribute('class') ?? '';
    unmount();
    document.getElementById('toast-root')?.remove();
    renderToast({ type: 'warning' });
    const warnSvgClass =
      document.getElementById('toast-root')!.querySelector('svg')!.getAttribute('class') ?? '';
    expect(errSvgClass).not.toEqual(warnSvgClass);
    expect(errSvgClass).toContain('lucide-circle-x');
    expect(warnSvgClass).toContain('lucide-triangle-alert');
  });

  it('TOAST_ICON map covers every ToastType with a renderable component', () => {
    const types: ToastType[] = ['success', 'error', 'info', 'warning'];
    for (const t of types) {
      expect(TOAST_ICON[t]).toBeDefined();
      // lucide-react icons are forwardRef components -- `typeof` is
      // 'object' (the forwardRef wrapper), not 'function'. The
      // important contract is renderability, asserted in the
      // per-glyph tests above.
      expect(TOAST_ICON[t]).not.toBeNull();
    }
  });

  it('TOAST_ICON entries match the Badge signal-icon family exactly', () => {
    expect(TOAST_ICON.success).toBe(CheckCircle2);
    expect(TOAST_ICON.error).toBe(XCircle);
    expect(TOAST_ICON.warning).toBe(AlertTriangle);
    expect(TOAST_ICON.info).toBe(Info);
  });
});

// ===== ToastStack: priority + visible cap (11.211) =================

function entry(id: number, message: string, type: ToastType): ToastEntry {
  return { id, message, type };
}

function renderStack(
  toasts: ToastEntry[],
  overrides: Partial<Parameters<typeof ToastStack>[0]> = {},
) {
  const onDismiss = vi.fn();
  const utils = render(
    <ToastStack
      toasts={toasts}
      onDismiss={onDismiss}
      duration={99999}
      {...overrides}
    />,
  );
  return { ...utils, onDismiss };
}

function statusMessages(): string[] {
  return screen.queryAllByRole('status').map((el) => el.textContent ?? '');
}

describe('TOAST_PRIORITY map', () => {
  it('orders error > warning > success > info', () => {
    expect(TOAST_PRIORITY.error).toBeGreaterThan(TOAST_PRIORITY.warning);
    expect(TOAST_PRIORITY.warning).toBeGreaterThan(TOAST_PRIORITY.success);
    expect(TOAST_PRIORITY.success).toBeGreaterThan(TOAST_PRIORITY.info);
  });

  it('uses the exact rubric values (error=3, warning=2, success=1, info=0)', () => {
    expect(TOAST_PRIORITY).toEqual({ error: 3, warning: 2, success: 1, info: 0 });
  });

  it('TOAST_VISIBLE_LIMIT is 3', () => {
    expect(TOAST_VISIBLE_LIMIT).toBe(3);
  });
});

describe('partitionToasts', () => {
  it('returns insertion order for a same-priority queue (FIFO within tier)', () => {
    const out = partitionToasts([
      entry(1, 'a', 'info'),
      entry(2, 'b', 'info'),
      entry(3, 'c', 'info'),
    ]);
    expect(out.visible.map((t) => t.message)).toEqual(['a', 'b', 'c']);
    expect(out.pending).toEqual([]);
  });

  it('sorts higher-priority tiers ahead of lower ones', () => {
    const out = partitionToasts([
      entry(1, 'i', 'info'),
      entry(2, 'e', 'error'),
      entry(3, 's', 'success'),
      entry(4, 'w', 'warning'),
    ]);
    expect(out.visible.map((t) => t.message)).toEqual(['e', 'w', 's']);
    expect(out.pending.map((t) => t.message)).toEqual(['i']);
  });

  it('respects a custom visible limit', () => {
    const out = partitionToasts(
      [
        entry(1, 'a', 'info'),
        entry(2, 'b', 'info'),
        entry(3, 'c', 'info'),
      ],
      1,
    );
    expect(out.visible.map((t) => t.message)).toEqual(['a']);
    expect(out.pending.map((t) => t.message)).toEqual(['b', 'c']);
  });
});

describe('<ToastStack>', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.getElementById('toast-root')?.remove();
  });

  it('puts error ahead of info even though info was added first', () => {
    renderStack([entry(1, 'a', 'info'), entry(2, 'b', 'error')]);
    const msgs = statusMessages();
    expect(msgs[0]).toContain('b');
    expect(msgs[1]).toContain('a');
  });

  it('caps the visible row at TOAST_VISIBLE_LIMIT (3) when 5 toasts are queued', () => {
    renderStack([
      entry(1, 't1', 'info'),
      entry(2, 't2', 'info'),
      entry(3, 't3', 'info'),
      entry(4, 't4', 'info'),
      entry(5, 't5', 'info'),
    ]);
    expect(screen.getAllByRole('status')).toHaveLength(3);
  });

  it('renders a "+2 more" overflow chip when 5 same-priority toasts are queued', () => {
    renderStack([
      entry(1, 't1', 'info'),
      entry(2, 't2', 'info'),
      entry(3, 't3', 'info'),
      entry(4, 't4', 'info'),
      entry(5, 't5', 'info'),
    ]);
    const chip = screen.getByTestId('toast-overflow-chip');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('+2 more');
  });

  it('promotes the highest-priority pending toast when a visible one is removed', () => {
    const toasts: ToastEntry[] = [
      entry(1, 'err', 'error'),
      entry(2, 'warn', 'warning'),
      entry(3, 'succ', 'success'),
      entry(4, 'info1', 'info'),
      entry(5, 'info2', 'info'),
    ];
    const { rerender, onDismiss } = renderStack(toasts);
    // Visible: err, warn, succ; pending: info1, info2.
    expect(statusMessages().map((m) => m.replace(/\W+/g, ''))).toEqual([
      'err',
      'warn',
      'succ',
    ]);
    // Drop the success (lowest of the visible tier); the next-highest
    // pending entry (info1, FIFO over info2) must take its slot.
    const remaining = toasts.filter((t) => t.id !== 3);
    rerender(
      <ToastStack toasts={remaining} onDismiss={onDismiss} duration={99999} />,
    );
    const msgs = statusMessages().map((m) => m.replace(/\W+/g, ''));
    expect(msgs).toContain('info1');
    expect(msgs).not.toContain('info2');
    expect(msgs).not.toContain('succ');
  });

  it('preserves FIFO order within a tier when all four queued toasts share priority', () => {
    renderStack([
      entry(10, 'first', 'success'),
      entry(11, 'second', 'success'),
      entry(12, 'third', 'success'),
      entry(13, 'fourth', 'success'),
    ]);
    const msgs = statusMessages();
    expect(msgs[0]).toContain('first');
    expect(msgs[1]).toContain('second');
    expect(msgs[2]).toContain('third');
    expect(screen.getByTestId('toast-overflow-chip')).toHaveTextContent('+1 more');
  });

  it('an error inserted last surfaces ahead of any earlier warning/success/info', () => {
    renderStack([
      entry(1, 'info-old', 'info'),
      entry(2, 'success-old', 'success'),
      entry(3, 'warning-old', 'warning'),
      entry(4, 'error-new', 'error'),
    ]);
    const first = screen.getAllByRole('status')[0]!;
    expect(first.textContent).toContain('error-new');
  });

  it('hides the overflow chip entirely when nothing is pending', () => {
    renderStack([entry(1, 'a', 'info'), entry(2, 'b', 'error')]);
    expect(screen.queryByTestId('toast-overflow-chip')).toBeNull();
  });

  it('invokes onDismiss with the dismissed toast id after the duration elapses', () => {
    const { onDismiss } = renderStack(
      [entry(1, 'solo', 'info')],
      { duration: 500 },
    );
    vi.advanceTimersByTime(500);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(1);
  });

  it('renders nothing when the toasts array is empty (no portal noise, no chip)', () => {
    renderStack([]);
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    expect(screen.queryByTestId('toast-overflow-chip')).toBeNull();
  });
});
