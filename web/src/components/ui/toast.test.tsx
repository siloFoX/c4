import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from './toast';
import type { ToastApi } from './toast';

function Capture({ onApi }: { onApi: (api: ToastApi) => void }) {
  const api = useToast();
  onApi(api);
  return null;
}

function Harness({
  onApi,
  defaultDurationMs,
}: {
  onApi: (api: ToastApi) => void;
  defaultDurationMs?: number;
}) {
  return (
    <ToastProvider
      {...(defaultDurationMs !== undefined ? { defaultDurationMs } : {})}
    >
      <Capture onApi={onApi} />
    </ToastProvider>
  );
}

describe('<ToastProvider> + useToast()', () => {
  beforeEach(() => {
    // Reset any toast portal leftovers between tests.
    document.querySelectorAll('[data-toast-root]').forEach((n) => n.remove());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws when useToast is called outside a ToastProvider', () => {
    // Silence the expected console.error chain from React's
    // error boundary fallback.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Capture onApi={() => undefined} />)).toThrow(
      /must be called inside a <ToastProvider>/,
    );
    spy.mockRestore();
  });

  it('renders nothing in the portal when no toasts have been pushed', () => {
    render(<Harness onApi={() => undefined} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('pushToast renders a toast row with the message + role="status"', () => {
    let api: ToastApi | null = null;
    render(<Harness onApi={(a) => (api = a)} />);
    act(() => {
      api!.pushToast({ message: 'Saved', kind: 'success' });
    });
    const row = screen.getByRole('status');
    expect(row).toHaveTextContent('Saved');
    expect(row.getAttribute('data-toast-kind')).toBe('success');
  });

  it('default kind is "info" when no kind is provided', () => {
    let api: ToastApi | null = null;
    render(<Harness onApi={(a) => (api = a)} />);
    act(() => {
      api!.pushToast({ message: 'Hello' });
    });
    expect(screen.getByRole('status').getAttribute('data-toast-kind')).toBe(
      'info',
    );
  });

  it('error kind uses assertive aria-live', () => {
    let api: ToastApi | null = null;
    render(<Harness onApi={(a) => (api = a)} />);
    act(() => {
      api!.pushToast({ message: 'Boom', kind: 'error' });
    });
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe(
      'assertive',
    );
  });

  it('info / success kinds use polite aria-live', () => {
    let api: ToastApi | null = null;
    render(<Harness onApi={(a) => (api = a)} />);
    act(() => {
      api!.pushToast({ message: 'Hello', kind: 'success' });
    });
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
  });

  it('dismissToast removes the row by id', () => {
    let api: ToastApi | null = null;
    render(<Harness onApi={(a) => (api = a)} />);
    let id = 0;
    act(() => {
      id = api!.pushToast({ message: 'X' });
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => {
      api!.dismissToast(id);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('the X button dismisses the toast', async () => {
    const user = userEvent.setup();
    let api: ToastApi | null = null;
    render(<Harness onApi={(a) => (api = a)} />);
    act(() => {
      api!.pushToast({ message: 'X' });
    });
    await user.click(
      screen.getByRole('button', { name: 'Dismiss notification' }),
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders an action button when entry.action is set', () => {
    let api: ToastApi | null = null;
    render(<Harness onApi={(a) => (api = a)} />);
    const onAction = vi.fn();
    act(() => {
      api!.pushToast({
        message: 'Saved',
        action: { label: 'Undo', onClick: onAction },
      });
    });
    expect(
      screen.getByRole('button', { name: 'Undo' }),
    ).toBeInTheDocument();
  });

  it('clicking the action button fires onClick AND dismisses the toast', async () => {
    const user = userEvent.setup();
    let api: ToastApi | null = null;
    render(<Harness onApi={(a) => (api = a)} />);
    const onAction = vi.fn();
    act(() => {
      api!.pushToast({
        message: 'Saved',
        action: { label: 'Undo', onClick: onAction },
      });
    });
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders a progress bar with role="progressbar" by default', () => {
    let api: ToastApi | null = null;
    render(<Harness onApi={(a) => (api = a)} />);
    act(() => {
      api!.pushToast({ message: 'X' });
    });
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('durationMs=Infinity opts out of auto-dismiss + drops the progress bar', () => {
    let api: ToastApi | null = null;
    render(<Harness onApi={(a) => (api = a)} />);
    act(() => {
      api!.pushToast({ message: 'Sticky', durationMs: Infinity });
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('auto-dismisses after durationMs elapses', () => {
    vi.useFakeTimers();
    let api: ToastApi | null = null;
    render(<Harness onApi={(a) => (api = a)} defaultDurationMs={500} />);
    act(() => {
      api!.pushToast({ message: 'Bye' });
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('per-entry durationMs overrides the provider default', () => {
    vi.useFakeTimers();
    let api: ToastApi | null = null;
    render(<Harness onApi={(a) => (api = a)} defaultDurationMs={5000} />);
    act(() => {
      api!.pushToast({ message: 'Short', durationMs: 200 });
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('Escape dismisses the most recently pushed toast', () => {
    let api: ToastApi | null = null;
    render(<Harness onApi={(a) => (api = a)} />);
    act(() => {
      api!.pushToast({ message: 'first' });
      api!.pushToast({ message: 'second' });
    });
    expect(screen.getAllByRole('status')).toHaveLength(2);
    fireEvent.keyDown(window, { key: 'Escape' });
    const remaining = screen.queryAllByRole('status');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toHaveTextContent('first');
  });

  it('clearToasts removes every visible row', () => {
    let api: ToastApi | null = null;
    render(<Harness onApi={(a) => (api = a)} />);
    act(() => {
      api!.pushToast({ message: 'a' });
      api!.pushToast({ message: 'b' });
      api!.pushToast({ message: 'c' });
    });
    expect(screen.getAllByRole('status')).toHaveLength(3);
    act(() => {
      api!.clearToasts();
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('caps the visible queue at visibleLimit (FIFO eviction)', () => {
    let api: ToastApi | null = null;
    render(
      <ToastProvider visibleLimit={2}>
        <Capture onApi={(a) => (api = a)} />
      </ToastProvider>,
    );
    act(() => {
      api!.pushToast({ message: 'one' });
      api!.pushToast({ message: 'two' });
      api!.pushToast({ message: 'three' });
    });
    const rows = screen.getAllByRole('status');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('two');
    expect(rows[1]).toHaveTextContent('three');
  });

  it('exposes data-section="toast" + data-section="toast-stack"', () => {
    let api: ToastApi | null = null;
    render(<Harness onApi={(a) => (api = a)} />);
    act(() => {
      api!.pushToast({ message: 'X' });
    });
    expect(
      document.querySelector('[data-section="toast-stack"]'),
    ).not.toBeNull();
    expect(document.querySelector('[data-section="toast"]')).not.toBeNull();
  });

  it('the dismiss + action buttons carry the matching data-section selectors', () => {
    let api: ToastApi | null = null;
    render(<Harness onApi={(a) => (api = a)} />);
    act(() => {
      api!.pushToast({
        message: 'X',
        action: { label: 'Undo', onClick: vi.fn() },
      });
    });
    expect(
      document.querySelector('[data-section="toast-dismiss"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section="toast-action"]'),
    ).not.toBeNull();
  });

  it('Escape with no active toasts does nothing (no throw)', () => {
    render(<Harness onApi={() => undefined} />);
    expect(() => fireEvent.keyDown(window, { key: 'Escape' })).not.toThrow();
  });

  it('exposes a stable displayName on ToastProvider', () => {
    expect(ToastProvider.displayName).toBe('ToastProvider');
  });

  it('each pushToast returns a unique numeric id', () => {
    let api: ToastApi | null = null;
    render(<Harness onApi={(a) => (api = a)} />);
    let id1 = 0;
    let id2 = 0;
    act(() => {
      id1 = api!.pushToast({ message: 'a' });
      id2 = api!.pushToast({ message: 'b' });
    });
    expect(id1).not.toBe(id2);
    expect(typeof id1).toBe('number');
  });
});
