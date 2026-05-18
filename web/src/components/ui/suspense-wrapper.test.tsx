import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { SuspenseWrapper } from './suspense-wrapper';

// (v1.11.367, TODO 11.349) Tests for the Suspense +
// ErrorBoundary composite primitive.

// Tiny suspendable: throws a promise on first
// render, resolves after the timer fires. Used to
// exercise the Suspense fallback path under vitest
// fake timers without spinning up a real data
// loader.

function Suspendable({ resolveAfterMs = 0 }: { resolveAfterMs?: number }): JSX.Element {
  const [resolved, setResolved] = useState(() => resolveAfterMs === 0);
  useEffect(() => {
    if (resolved) return;
    const t = setTimeout(() => setResolved(true), resolveAfterMs);
    return () => clearTimeout(t);
  }, [resolved, resolveAfterMs]);
  if (!resolved) {
    // The Suspense primitive surfaces a thrown
    // promise as "suspended", which fires the
    // fallback. We throw a never-resolving promise
    // here since the visibility transition is
    // controlled by the parent component via
    // `setResolved`.
    throw new Promise<void>(() => {});
  }
  return <div data-testid="resolved-child">resolved</div>;
}

function CrashChild(): JSX.Element {
  throw new Error('synthetic-suspense-test');
}

beforeEach(() => {
  // Quiet the expected console.error noise from the
  // boundary's componentDidCatch.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('SuspenseWrapper', () => {
  it('renders the children when nothing suspends or throws', () => {
    render(
      <SuspenseWrapper>
        <div data-testid="static-child">static</div>
      </SuspenseWrapper>,
    );
    expect(screen.getByTestId('static-child')).toBeInTheDocument();
  });

  it('renders the default skeleton fallback after the showAfterMs gate', async () => {
    vi.useFakeTimers();
    render(
      <SuspenseWrapper name="history detail" showAfterMs={120}>
        <Suspendable resolveAfterMs={10_000} />
      </SuspenseWrapper>,
    );
    // Before the gate, no skeleton is on screen.
    expect(
      screen.queryByTestId('suspense-wrapper-skeleton'),
    ).not.toBeInTheDocument();
    // Advance past the gate.
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    const skeleton = screen.getByTestId(
      'suspense-wrapper-skeleton',
    );
    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveAttribute(
      'aria-label',
      'Loading history detail',
    );
  });

  it('uses a generic "Loading" label when no name is set', async () => {
    vi.useFakeTimers();
    render(
      <SuspenseWrapper showAfterMs={0}>
        <Suspendable resolveAfterMs={10_000} />
      </SuspenseWrapper>,
    );
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    const skeleton = screen.getByTestId(
      'suspense-wrapper-skeleton',
    );
    expect(skeleton).toHaveAttribute('aria-label', 'Loading');
  });

  it('respects a custom fallback override (skips the default skeleton)', async () => {
    vi.useFakeTimers();
    render(
      <SuspenseWrapper
        showAfterMs={0}
        fallback={<div data-testid="custom-fallback">custom</div>}
      >
        <Suspendable resolveAfterMs={10_000} />
      </SuspenseWrapper>,
    );
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    expect(
      screen.queryByTestId('suspense-wrapper-skeleton'),
    ).not.toBeInTheDocument();
  });

  it('skeleton row count follows skeletonRows prop', async () => {
    vi.useFakeTimers();
    const { container } = render(
      <SuspenseWrapper showAfterMs={0} skeletonRows={5}>
        <Suspendable resolveAfterMs={10_000} />
      </SuspenseWrapper>,
    );
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    const status = container.querySelector(
      '[data-testid="suspense-wrapper-skeleton"]',
    );
    expect(status).not.toBeNull();
    expect(status?.children.length).toBe(5);
  });

  it('renders the default error fallback when the child throws', () => {
    render(
      <SuspenseWrapper name="snapshots list">
        <CrashChild />
      </SuspenseWrapper>,
    );
    expect(
      screen.getByTestId('ui-error-boundary-fallback'),
    ).toBeInTheDocument();
    // Default title routes through "Could not load <name>".
    expect(screen.getByText(/Could not load snapshots list/i)).toBeInTheDocument();
  });

  it('routes errors to onError', () => {
    const onError = vi.fn();
    render(
      <SuspenseWrapper onError={onError}>
        <CrashChild />
      </SuspenseWrapper>,
    );
    expect(onError).toHaveBeenCalled();
    const args = onError.mock.calls[0] as unknown as [Error, unknown];
    expect(args[0]).toBeInstanceOf(Error);
    expect(args[0].message).toBe('synthetic-suspense-test');
  });

  it('honours a custom errorFallback', () => {
    render(
      <SuspenseWrapper
        errorFallback={(err) => (
          <div data-testid="my-error">err: {err.message}</div>
        )}
      >
        <CrashChild />
      </SuspenseWrapper>,
    );
    expect(screen.getByTestId('my-error')).toHaveTextContent(
      'err: synthetic-suspense-test',
    );
  });

  it('resets when resetKeys changes', () => {
    function Wrapper({ k }: { k: number }): JSX.Element {
      return (
        <SuspenseWrapper resetKeys={[k]}>
          {k === 0 ? <CrashChild /> : <div data-testid="recovered">ok</div>}
        </SuspenseWrapper>
      );
    }
    const { rerender } = render(<Wrapper k={0} />);
    expect(screen.getByTestId('ui-error-boundary-fallback')).toBeInTheDocument();
    rerender(<Wrapper k={1} />);
    expect(screen.getByTestId('recovered')).toBeInTheDocument();
  });

  it('passes className through to the default skeleton wrapper', async () => {
    vi.useFakeTimers();
    render(
      <SuspenseWrapper showAfterMs={0} className="my-custom-class">
        <Suspendable resolveAfterMs={10_000} />
      </SuspenseWrapper>,
    );
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    const status = screen.getByTestId(
      'suspense-wrapper-skeleton',
    );
    expect(status).toHaveClass('my-custom-class');
  });

  it('respects a custom data-testid on the default skeleton', async () => {
    vi.useFakeTimers();
    render(
      <SuspenseWrapper showAfterMs={0} data-testid="history-skeleton">
        <Suspendable resolveAfterMs={10_000} />
      </SuspenseWrapper>,
    );
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    expect(
      screen.getByTestId('history-skeleton'),
    ).toBeInTheDocument();
  });

  it('exposes displayName for debugging', () => {
    expect(SuspenseWrapper.displayName).toBe('SuspenseWrapper');
  });
});
