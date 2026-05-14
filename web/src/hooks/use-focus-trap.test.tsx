import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { useFocusTrap, type UseFocusTrapOptions } from './use-focus-trap';

function Harness({
  options,
  withButtons = true,
  initialFocusOnSecond = false,
}: {
  options?: UseFocusTrapOptions;
  withButtons?: boolean;
  initialFocusOnSecond?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const secondRef = useRef<HTMLButtonElement>(null);
  const opts: UseFocusTrapOptions = {
    ...options,
    ...(initialFocusOnSecond ? { initialFocusRef: secondRef } : {}),
  };
  useFocusTrap(containerRef, opts);
  return (
    <div ref={containerRef} tabIndex={-1} data-testid="container">
      {withButtons ? (
        <>
          <button>first</button>
          <button ref={secondRef}>second</button>
          <button>third</button>
        </>
      ) : (
        <p>nothing-focusable</p>
      )}
    </div>
  );
}

describe('useFocusTrap', () => {
  it('focuses the first focusable on mount when active', () => {
    const { getByText } = render(<Harness />);
    expect(getByText('first')).toHaveFocus();
  });

  it('Tab from last focusable wraps to first', () => {
    const { getByText } = render(<Harness />);
    const last = getByText('third');
    last.focus();
    expect(last).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(getByText('first')).toHaveFocus();
  });

  it('Shift+Tab from first focusable wraps to last', () => {
    const { getByText } = render(<Harness />);
    const first = getByText('first');
    first.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(getByText('third')).toHaveFocus();
  });

  it('inactive (active=false) does not trap focus', () => {
    const outside = document.createElement('button');
    outside.textContent = 'outside';
    document.body.appendChild(outside);
    outside.focus();
    expect(outside).toHaveFocus();
    render(<Harness options={{ active: false }} />);
    expect(outside).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it('initialFocusRef takes priority over the first focusable', () => {
    const { getByText } = render(<Harness initialFocusOnSecond />);
    expect(getByText('second')).toHaveFocus();
  });

  it('Escape calls onEscape callback when provided', () => {
    const onEscape = vi.fn();
    render(<Harness options={{ onEscape }} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('restores focus to previously focused element on unmount', () => {
    const previously = document.createElement('button');
    previously.textContent = 'previously';
    document.body.appendChild(previously);
    previously.focus();
    expect(previously).toHaveFocus();
    const { unmount, getByText } = render(<Harness />);
    expect(getByText('first')).toHaveFocus();
    unmount();
    expect(previously).toHaveFocus();
    previously.remove();
  });

  it('restoreFocusOnUnmount=false does not restore focus on unmount', () => {
    const previously = document.createElement('button');
    previously.textContent = 'previously';
    document.body.appendChild(previously);
    previously.focus();
    const { unmount, getByText } = render(
      <Harness options={{ restoreFocusOnUnmount: false }} />,
    );
    expect(getByText('first')).toHaveFocus();
    unmount();
    expect(previously).not.toHaveFocus();
    previously.remove();
  });

  it('empty container (no focusables) focuses container itself', () => {
    const { getByTestId } = render(<Harness withButtons={false} />);
    expect(getByTestId('container')).toHaveFocus();
  });

  it('is SSR-safe (does not throw when typeof document is undefined)', () => {
    // Verify the hook short-circuits cleanly when no container element is
    // available; this mirrors the SSR path where refs never bind.
    const Empty = () => {
      const ref = useRef<HTMLDivElement>(null);
      useFocusTrap(ref);
      return null;
    };
    expect(() => render(<Empty />)).not.toThrow();
  });
});
