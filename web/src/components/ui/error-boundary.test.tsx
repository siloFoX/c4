// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { UIErrorBoundary } from './error-boundary';

// (v1.11.352, TODO 11.334) Helper that throws on demand
// so the boundary catches a real React error. The first
// render throws, then a `shouldThrow=false` rerender
// renders children normally.
function Crasher({
  shouldThrow,
  message = 'boom',
}: {
  shouldThrow: boolean;
  message?: string;
}) {
  if (shouldThrow) {
    throw new Error(message);
  }
  return <div data-testid="crasher-ok">ok</div>;
}

// Silence React's noisy error logging during boundary
// tests. React always logs errors that hit a boundary
// to console.error, and our component also logs;
// neither is useful in the test report.
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  cleanup();
});

describe('<UIErrorBoundary>', () => {
  it('renders children when they do NOT throw', () => {
    render(
      <UIErrorBoundary>
        <Crasher shouldThrow={false} />
      </UIErrorBoundary>,
    );
    expect(screen.getByTestId('crasher-ok')).toBeInTheDocument();
  });

  it('renders the default ErrorState fallback when a child throws', () => {
    render(
      <UIErrorBoundary>
        <Crasher shouldThrow={true} message="render failed" />
      </UIErrorBoundary>,
    );
    expect(
      screen.getByTestId('ui-error-boundary-fallback'),
    ).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(
      screen.getByText('This view failed to render. Retry to re-mount.'),
    ).toBeInTheDocument();
  });

  it('honours the title + description overrides', () => {
    render(
      <UIErrorBoundary
        title="Chat view crashed"
        description="Retry to remount the chat surface."
      >
        <Crasher shouldThrow={true} />
      </UIErrorBoundary>,
    );
    expect(screen.getByText('Chat view crashed')).toBeInTheDocument();
    expect(
      screen.getByText('Retry to remount the chat surface.'),
    ).toBeInTheDocument();
  });

  it('renders a ReactNode fallback verbatim when provided', () => {
    render(
      <UIErrorBoundary fallback={<div data-testid="custom-fallback">x</div>}>
        <Crasher shouldThrow={true} />
      </UIErrorBoundary>,
    );
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    expect(
      screen.queryByTestId('ui-error-boundary-fallback'),
    ).not.toBeInTheDocument();
  });

  it('invokes a fallback factory with the error + retry callback', () => {
    const factory = vi.fn((error: Error, retry: () => void) => (
      <button type="button" data-testid="factory-retry" onClick={retry}>
        {error.message}
      </button>
    ));
    render(
      <UIErrorBoundary fallback={factory}>
        <Crasher shouldThrow={true} message="explicit message" />
      </UIErrorBoundary>,
    );
    // React's recovery flow re-renders after a caught
    // error, so the factory may be invoked multiple
    // times. Only the "called at all + correct args"
    // contract matters here.
    expect(factory).toHaveBeenCalled();
    expect(screen.getByTestId('factory-retry').textContent).toBe(
      'explicit message',
    );
    const lastCall = factory.mock.calls[factory.mock.calls.length - 1];
    expect((lastCall?.[0] as Error)?.message).toBe('explicit message');
    expect(typeof lastCall?.[1]).toBe('function');
  });

  it('calls onError with the error + componentStack info', () => {
    const onError = vi.fn();
    render(
      <UIErrorBoundary onError={onError}>
        <Crasher shouldThrow={true} message="hooked" />
      </UIErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    const [err, info] = onError.mock.calls[0] ?? [];
    expect((err as Error)?.message).toBe('hooked');
    expect((info as { componentStack?: string })?.componentStack).toBeTruthy();
  });

  it('swallows errors thrown FROM the onError reporter', () => {
    const onError = vi.fn(() => {
      throw new Error('reporter blew up');
    });
    expect(() => {
      render(
        <UIErrorBoundary onError={onError}>
          <Crasher shouldThrow={true} />
        </UIErrorBoundary>,
      );
    }).not.toThrow();
    expect(
      screen.getByTestId('ui-error-boundary-fallback'),
    ).toBeInTheDocument();
  });

  it('logs to console.error on every caught error (telemetry default)', () => {
    render(
      <UIErrorBoundary>
        <Crasher shouldThrow={true} message="logme" />
      </UIErrorBoundary>,
    );
    // The component's own log line.
    expect(
      consoleErrorSpy.mock.calls.some(
        (call: unknown[]) => call[0] === '[UIErrorBoundary]',
      ),
    ).toBe(true);
  });

  it('the default Retry button clears the error and re-renders children', () => {
    // Stateful child: the next render after Retry must
    // see `shouldThrow=false`. The boundary's reset()
    // re-renders the previously-captured children prop,
    // so we rerender FIRST to update the closure, then
    // click Retry.
    let shouldThrow = true;
    function Wrapper() {
      return (
        <UIErrorBoundary>
          <Crasher shouldThrow={shouldThrow} />
        </UIErrorBoundary>
      );
    }
    const { rerender } = render(<Wrapper />);
    expect(
      screen.getByTestId('ui-error-boundary-fallback'),
    ).toBeInTheDocument();
    shouldThrow = false;
    rerender(<Wrapper />);
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
    expect(screen.getByTestId('crasher-ok')).toBeInTheDocument();
  });

  it('resets the error state when resetKeys changes', () => {
    let shouldThrow = true;
    let routeKey = 'a';
    function Wrapper() {
      return (
        <UIErrorBoundary resetKeys={[routeKey]}>
          <Crasher shouldThrow={shouldThrow} />
        </UIErrorBoundary>
      );
    }
    const { rerender } = render(<Wrapper />);
    expect(
      screen.getByTestId('ui-error-boundary-fallback'),
    ).toBeInTheDocument();
    // Flip route key + fix the child so the boundary
    // resets and re-renders children.
    routeKey = 'b';
    shouldThrow = false;
    rerender(<Wrapper />);
    expect(screen.getByTestId('crasher-ok')).toBeInTheDocument();
  });

  it('does NOT reset when resetKeys identity is unchanged', () => {
    const keys = ['stable'];
    function Wrapper() {
      return (
        <UIErrorBoundary resetKeys={keys}>
          <Crasher shouldThrow={true} />
        </UIErrorBoundary>
      );
    }
    const { rerender } = render(<Wrapper />);
    expect(
      screen.getByTestId('ui-error-boundary-fallback'),
    ).toBeInTheDocument();
    rerender(<Wrapper />);
    expect(
      screen.getByTestId('ui-error-boundary-fallback'),
    ).toBeInTheDocument();
  });

  // (v1.11.352, TODO 11.334) Nested boundary contract:
  // an inner boundary catches the error locally; the
  // outer boundary continues rendering its children
  // untouched. Mirrors React's documented behaviour.
  it('nested boundary catches errors locally without bubbling', () => {
    render(
      <UIErrorBoundary>
        <div data-testid="outer-tree">
          <UIErrorBoundary>
            <Crasher shouldThrow={true} />
          </UIErrorBoundary>
        </div>
      </UIErrorBoundary>,
    );
    expect(screen.getByTestId('outer-tree')).toBeInTheDocument();
    expect(
      screen.getByTestId('ui-error-boundary-fallback'),
    ).toBeInTheDocument();
  });

  it('renders a className override on the default ErrorState wrapper', () => {
    render(
      <UIErrorBoundary className="custom-error-class">
        <Crasher shouldThrow={true} />
      </UIErrorBoundary>,
    );
    const fallback = screen.getByTestId('ui-error-boundary-fallback');
    expect(fallback.className).toContain('custom-error-class');
  });
});
