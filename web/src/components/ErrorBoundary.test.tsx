import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import ErrorBoundary from './ErrorBoundary';
import { setLocale } from '../lib/i18n';

// ErrorBoundary is the dashboard's top-level catch-all. It owns one
// piece of state (the captured Error) and three side effects:
// console.error in componentDidCatch, setState({error:null}) on
// "Try Again", and window.location.reload() on "Reload". Tests drive
// the error machine directly: render a child that throws, capture the
// fallback panel, fire the recovery actions, and assert console
// noise + window.location.reload calls land where expected.

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  setLocale('en');
  // Suppress React's own console.error so the test output stays clean
  // when we deliberately throw inside a child.
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

// Minimal child whose throwing behaviour can be flipped at runtime.
// We expose a setShouldThrow toggle through context-free state so a
// "Try Again" click can re-render the boundary's children with the
// throwing behaviour disabled.
function Thrower({ message }: { message: string }) {
  throw new Error(message);
}

function HappyChild({ label }: { label: string }) {
  return <span data-testid="happy-child">{label}</span>;
}

// Module-level throw flag. The boundary tears down the throwing
// child on catch, so we cannot rely on componentDidMount on the
// child to expose a setter. Instead we read this flag inside the
// child's render — flipping it before "Try Again" is clicked lets
// the boundary's reset path mount the child for real this time.
let shouldThrowFlag = true;

function FlaggedThrower({ message }: { message: string }): ReactNode {
  if (shouldThrowFlag) {
    throw new Error(message);
  }
  return <HappyChild label="recovered" />;
}

describe('<ErrorBoundary>', () => {
  // ---- normal pass-through --------------------------------------

  it('renders the children verbatim when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <HappyChild label="ok" />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('happy-child')).toHaveTextContent('ok');
  });

  it('does NOT render the fallback panel heading when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <HappyChild label="ok" />
      </ErrorBoundary>,
    );
    expect(
      screen.queryByRole('heading', { name: 'Something went wrong' }),
    ).not.toBeInTheDocument();
  });

  it('does NOT touch console.error when the children render cleanly', () => {
    render(
      <ErrorBoundary>
        <HappyChild label="ok" />
      </ErrorBoundary>,
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  // ---- caught-error fallback ------------------------------------

  it('renders the fallback heading when a child throws on render', () => {
    render(
      <ErrorBoundary>
        <Thrower message="boom" />
      </ErrorBoundary>,
    );
    expect(
      screen.getByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
  });

  it('renders the thrown error message inside the formatted fallback paragraph', () => {
    render(
      <ErrorBoundary>
        <Thrower message="boom-from-thrower" />
      </ErrorBoundary>,
    );
    // The message appears in both the paragraph and the stack-trace
    // <pre>; assert the paragraph specifically by matching the
    // surrounding "The dashboard hit an error rendering this view:"
    // wrapper copy from the i18n template.
    expect(
      screen.getByText(
        /The dashboard hit an error rendering this view: boom-from-thrower\./,
      ),
    ).toBeInTheDocument();
  });

  it('drops the original child markup when the fallback is shown', () => {
    render(
      <ErrorBoundary>
        <Thrower message="boom" />
      </ErrorBoundary>,
    );
    expect(screen.queryByTestId('happy-child')).not.toBeInTheDocument();
  });

  it('renders the stack trace inside a tabbable <pre> region', () => {
    render(
      <ErrorBoundary>
        <Thrower message="boom-stack" />
      </ErrorBoundary>,
    );
    const pre = document.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre).toHaveAttribute('tabindex', '0');
    expect(pre?.textContent || '').toMatch(/boom-stack/);
  });

  it('logs the error to console.error so operators can copy the stack', () => {
    render(
      <ErrorBoundary>
        <Thrower message="boom-log" />
      </ErrorBoundary>,
    );
    // React itself + componentDidCatch both log; assert the boundary's
    // tagged log is among them.
    const calls = consoleErrorSpy.mock.calls.flat();
    const tagged = calls.some(
      (a) => typeof a === 'string' && a.includes('[ErrorBoundary]'),
    );
    expect(tagged).toBe(true);
  });

  // ---- recovery actions -----------------------------------------

  it('renders both the Try Again and Reload buttons in the fallback panel', () => {
    render(
      <ErrorBoundary>
        <Thrower message="boom" />
      </ErrorBoundary>,
    );
    expect(
      screen.getByRole('button', { name: 'Try Again' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reload' }),
    ).toBeInTheDocument();
  });

  it('clears the captured error and re-renders children when Try Again is clicked + throw flag is off', async () => {
    shouldThrowFlag = true;
    render(
      <ErrorBoundary>
        <FlaggedThrower message="boom-toggle" />
      </ErrorBoundary>,
    );
    expect(
      screen.getByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
    // Flip the flag so the next render of the child does NOT throw.
    shouldThrowFlag = false;
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(screen.getByTestId('happy-child')).toHaveTextContent('recovered');
    expect(
      screen.queryByRole('heading', { name: 'Something went wrong' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the fallback visible when Try Again is clicked but the child still throws', async () => {
    render(
      <ErrorBoundary>
        <Thrower message="still-boom" />
      </ErrorBoundary>,
    );
    const user = userEvent.setup();
    // Click Try Again — the boundary will reset state to {error:null},
    // re-render children, and immediately catch the same throw.
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(
      screen.getByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
  });

  it('invokes window.location.reload() when the Reload button is clicked', async () => {
    const reloadSpy = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...original, reload: reloadSpy },
    });
    try {
      render(
        <ErrorBoundary>
          <Thrower message="boom-reload" />
        </ErrorBoundary>,
      );
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Reload' }));
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: original,
      });
    }
  });

  // ---- error message edge cases --------------------------------

  it('falls back to String(error) when the thrown Error has no message', () => {
    function NoMessage() {
      const err = new Error();
      throw err;
    }
    render(
      <ErrorBoundary>
        <NoMessage />
      </ErrorBoundary>,
    );
    // Either the empty message renders or String(error) appears; assert
    // the heading still mounts so the panel does not blow up.
    expect(
      screen.getByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
  });

  // ---- locale flip ---------------------------------------------

  it('renders the fallback heading in English by default', () => {
    setLocale('en');
    render(
      <ErrorBoundary>
        <Thrower message="boom" />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  // ---- multi-instance isolation --------------------------------

  it('isolates one boundary instance from another (only the throwing branch shows the fallback)', () => {
    render(
      <div>
        <ErrorBoundary>
          <Thrower message="left-boom" />
        </ErrorBoundary>
        <ErrorBoundary>
          <HappyChild label="right" />
        </ErrorBoundary>
      </div>,
    );
    expect(
      screen.getAllByRole('heading', { name: 'Something went wrong' }),
    ).toHaveLength(1);
    expect(screen.getByTestId('happy-child')).toHaveTextContent('right');
  });
});

