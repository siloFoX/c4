import { createRef, useRef } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FocusTrap } from './focus-trap';

describe('<FocusTrap>', () => {
  afterEach(() => cleanup());

  it('renders a div with focus-trap data attributes by default', () => {
    const { container } = render(
      <FocusTrap>
        <button>inside</button>
      </FocusTrap>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.tagName).toBe('DIV');
    expect(root.getAttribute('data-section')).toBe('focus-trap');
    expect(root.getAttribute('data-active')).toBe('true');
  });

  it('focuses the first focusable child on activation', () => {
    render(
      <FocusTrap>
        <button data-testid="first">a</button>
        <button data-testid="second">b</button>
      </FocusTrap>,
    );
    expect(document.activeElement).toBe(screen.getByTestId('first'));
  });

  it('focuses the explicit initialFocusRef target when provided', () => {
    function Harness() {
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <FocusTrap initialFocusRef={ref}>
          <button data-testid="first">a</button>
          <button ref={ref} data-testid="second">
            b
          </button>
        </FocusTrap>
      );
    }
    render(<Harness />);
    expect(document.activeElement).toBe(screen.getByTestId('second'));
  });

  it('falls back to focusing the container when there are no focusable children', () => {
    const { container } = render(
      <FocusTrap>
        <span>no buttons</span>
      </FocusTrap>,
    );
    const root = container.firstChild as HTMLElement;
    expect(document.activeElement).toBe(root);
  });

  it('wraps Tab from the last focusable back to the first', async () => {
    const user = userEvent.setup();
    render(
      <FocusTrap>
        <button data-testid="first">a</button>
        <button data-testid="second">b</button>
      </FocusTrap>,
    );
    const second = screen.getByTestId('second');
    second.focus();
    expect(document.activeElement).toBe(second);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByTestId('first'));
  });

  it('wraps Shift+Tab from the first focusable back to the last', async () => {
    const user = userEvent.setup();
    render(
      <FocusTrap>
        <button data-testid="first">a</button>
        <button data-testid="second">b</button>
      </FocusTrap>,
    );
    const first = screen.getByTestId('first');
    first.focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByTestId('second'));
  });

  it('calls onEscape with stopPropagation when Escape is pressed', async () => {
    const onEscape = vi.fn();
    const user = userEvent.setup();
    render(
      <FocusTrap onEscape={onEscape}>
        <button>inside</button>
      </FocusTrap>,
    );
    await user.keyboard('{Escape}');
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('does not fire onEscape when no handler is provided (no crash)', async () => {
    const user = userEvent.setup();
    render(
      <FocusTrap>
        <button>inside</button>
      </FocusTrap>,
    );
    // Should not throw.
    await user.keyboard('{Escape}');
  });

  it('restores focus to the previously focused element on unmount (default)', () => {
    const outside = document.createElement('button');
    outside.id = 'outside-anchor';
    document.body.appendChild(outside);
    try {
      outside.focus();
      expect(document.activeElement).toBe(outside);
      const { unmount } = render(
        <FocusTrap>
          <button data-testid="inner">x</button>
        </FocusTrap>,
      );
      expect(document.activeElement).toBe(screen.getByTestId('inner'));
      unmount();
      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });

  it('does NOT restore focus on unmount when restoreFocusOnUnmount=false', () => {
    const outside = document.createElement('button');
    outside.id = 'no-restore-anchor';
    document.body.appendChild(outside);
    try {
      outside.focus();
      expect(document.activeElement).toBe(outside);
      const { unmount } = render(
        <FocusTrap restoreFocusOnUnmount={false}>
          <button data-testid="inner">x</button>
        </FocusTrap>,
      );
      const inner = screen.getByTestId('inner');
      expect(document.activeElement).toBe(inner);
      unmount();
      // Outside should NOT have been refocused.
      expect(document.activeElement).not.toBe(outside);
    } finally {
      outside.remove();
    }
  });

  it('active=false sets data-active="false" and skips first-focus', () => {
    const outside = document.createElement('button');
    outside.id = 'inert-anchor';
    document.body.appendChild(outside);
    try {
      outside.focus();
      const { container } = render(
        <FocusTrap active={false}>
          <button data-testid="inert-inner">x</button>
        </FocusTrap>,
      );
      const root = container.firstChild as HTMLElement;
      expect(root.getAttribute('data-active')).toBe('false');
      // The trap did NOT take focus from outside.
      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });

  it('forwards ref to the underlying DOM node', () => {
    const ref = createRef<HTMLElement>();
    render(
      <FocusTrap ref={ref}>
        <button>x</button>
      </FocusTrap>,
    );
    expect(ref.current).toBeInstanceOf(HTMLElement);
    expect(ref.current?.getAttribute('data-section')).toBe('focus-trap');
  });

  it('supports polymorphic as="section"', () => {
    const { container } = render(
      <FocusTrap as="section">
        <button>x</button>
      </FocusTrap>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.tagName).toBe('SECTION');
    expect(root.getAttribute('data-section')).toBe('focus-trap');
  });

  it('supports polymorphic as="aside"', () => {
    const { container } = render(
      <FocusTrap as="aside">
        <button>x</button>
      </FocusTrap>,
    );
    expect((container.firstChild as HTMLElement).tagName).toBe('ASIDE');
  });

  it('supports polymorphic as="main"', () => {
    const { container } = render(
      <FocusTrap as="main">
        <button>x</button>
      </FocusTrap>,
    );
    expect((container.firstChild as HTMLElement).tagName).toBe('MAIN');
  });

  it('forwards className + arbitrary HTML attributes onto the container', () => {
    const { container } = render(
      <FocusTrap
        className="custom-class"
        id="my-trap"
        role="dialog"
        aria-labelledby="my-trap-label"
      >
        <button>x</button>
      </FocusTrap>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('custom-class');
    expect(root.id).toBe('my-trap');
    expect(root.getAttribute('role')).toBe('dialog');
    expect(root.getAttribute('aria-labelledby')).toBe('my-trap-label');
  });

  it('container has tabIndex=-1 by default (focus fallback)', () => {
    const { container } = render(
      <FocusTrap>
        <span>nothing focusable</span>
      </FocusTrap>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.tabIndex).toBe(-1);
  });

  it('caller-supplied tabIndex overrides the default', () => {
    const { container } = render(
      <FocusTrap tabIndex={0}>
        <button>x</button>
      </FocusTrap>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.tabIndex).toBe(0);
  });

  it('has a stable displayName for devtools', () => {
    expect(FocusTrap.displayName).toBe('FocusTrap');
  });
});
