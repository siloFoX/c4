import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from './tooltip';

describe('<Tooltip>', () => {
  it('renders its child trigger', () => {
    render(
      <Tooltip label="Hello">
        <button>trigger</button>
      </Tooltip>,
    );
    expect(
      screen.getByRole('button', { name: 'trigger' }),
    ).toBeInTheDocument();
  });

  it('renders a sibling element with role="tooltip" carrying the label', () => {
    render(
      <Tooltip label="Save changes">
        <button>trigger</button>
      </Tooltip>,
    );
    const tip = screen.getByRole('tooltip');
    expect(tip).toBeInTheDocument();
    expect(tip).toHaveTextContent('Save changes');
  });

  it('starts hidden (data-visible="false" + opacity-0) when uncontrolled', () => {
    render(
      <Tooltip label="x">
        <button>t</button>
      </Tooltip>,
    );
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveAttribute('data-visible', 'false');
    expect(tip).toHaveClass('opacity-0');
  });

  it('starts visible when the controlled open prop is true', () => {
    render(
      <Tooltip label="x" open>
        <button>t</button>
      </Tooltip>,
    );
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveAttribute('data-visible', 'true');
    expect(tip).toHaveClass('opacity-100');
  });

  it('flips back to hidden when the controlled open prop becomes false', () => {
    const { rerender } = render(
      <Tooltip label="x" open>
        <button>t</button>
      </Tooltip>,
    );
    expect(screen.getByRole('tooltip')).toHaveAttribute(
      'data-visible',
      'true',
    );
    rerender(
      <Tooltip label="x" open={false}>
        <button>t</button>
      </Tooltip>,
    );
    expect(screen.getByRole('tooltip')).toHaveAttribute(
      'data-visible',
      'false',
    );
  });

  it('plumbs aria-describedby onto the trigger only while visible', () => {
    const { rerender } = render(
      <Tooltip label="x">
        <button>t</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: 't' });
    expect(trigger).not.toHaveAttribute('aria-describedby');
    rerender(
      <Tooltip label="x" open>
        <button>t</button>
      </Tooltip>,
    );
    const tip = screen.getByRole('tooltip');
    expect(trigger).toHaveAttribute('aria-describedby', tip.id);
  });

  it('shows after the delay on mouseenter (uncontrolled)', async () => {
    render(
      <Tooltip label="hi" delayMs={0}>
        <button>t</button>
      </Tooltip>,
    );
    const tip = screen.getByRole('tooltip');
    fireEvent.mouseEnter(screen.getByRole('button', { name: 't' }));
    await waitFor(() => {
      expect(tip).toHaveAttribute('data-visible', 'true');
    });
  });

  it('hides on mouseleave (uncontrolled)', async () => {
    render(
      <Tooltip label="hi" delayMs={0}>
        <button>t</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: 't' });
    const tip = screen.getByRole('tooltip');
    fireEvent.mouseEnter(trigger);
    await waitFor(() =>
      expect(tip).toHaveAttribute('data-visible', 'true'),
    );
    fireEvent.mouseLeave(trigger);
    expect(tip).toHaveAttribute('data-visible', 'false');
  });

  it('shows on focus and hides on blur (uncontrolled)', async () => {
    render(
      <Tooltip label="hi" delayMs={0}>
        <button>t</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: 't' });
    const tip = screen.getByRole('tooltip');
    fireEvent.focus(trigger);
    await waitFor(() =>
      expect(tip).toHaveAttribute('data-visible', 'true'),
    );
    fireEvent.blur(trigger);
    expect(tip).toHaveAttribute('data-visible', 'false');
  });

  it('closes on Escape while visible', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip label="hi" open>
        <button>t</button>
      </Tooltip>,
    );
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveAttribute('data-visible', 'true');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(tip).toHaveAttribute('data-visible', 'false');
    });
  });

  it('uses placement="top" classes by default', () => {
    render(
      <Tooltip label="x">
        <button>t</button>
      </Tooltip>,
    );
    expect(screen.getByRole('tooltip')).toHaveClass('bottom-full');
  });

  it('switches to placement="bottom" classes when requested', () => {
    render(
      <Tooltip label="x" placement="bottom">
        <button>t</button>
      </Tooltip>,
    );
    expect(screen.getByRole('tooltip')).toHaveClass('top-full');
  });

  it('switches to placement="left" classes when requested', () => {
    render(
      <Tooltip label="x" placement="left">
        <button>t</button>
      </Tooltip>,
    );
    expect(screen.getByRole('tooltip')).toHaveClass('right-full');
  });

  it('switches to placement="right" classes when requested', () => {
    render(
      <Tooltip label="x" placement="right">
        <button>t</button>
      </Tooltip>,
    );
    expect(screen.getByRole('tooltip')).toHaveClass('left-full');
  });

  it('merges caller-provided className onto the tooltip surface', () => {
    render(
      <Tooltip label="x" className="extra-tag">
        <button>t</button>
      </Tooltip>,
    );
    expect(screen.getByRole('tooltip')).toHaveClass('extra-tag');
  });

  it('preserves a ref attached to the child trigger through cloneElement', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Tooltip label="x">
        <button ref={ref}>t</button>
      </Tooltip>,
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("keeps the child trigger's own onMouseEnter handler when wiring its own", () => {
    const childMouseEnter = vi.fn();
    render(
      <Tooltip label="x" delayMs={0}>
        <button onMouseEnter={childMouseEnter}>t</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 't' }));
    expect(childMouseEnter).toHaveBeenCalledTimes(1);
  });

  it('exposes a stable displayName for devtools', () => {
    expect(Tooltip.displayName).toBe('Tooltip');
  });

  // (v1.11.294, TODO 11.276) Enhancements.

  it('exposes data-section="tooltip" + data-placement on the root wrapper', () => {
    const { container } = render(
      <Tooltip label="x" placement="right" delayMs={0}>
        <button>t</button>
      </Tooltip>,
    );
    const wrapper = container.querySelector('[data-section="tooltip"]');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.getAttribute('data-placement')).toBe('right');
  });

  it('data-visible flips on the wrapper when the tooltip opens (open prop)', () => {
    const { container } = render(
      <Tooltip label="x" open>
        <button>t</button>
      </Tooltip>,
    );
    const wrapper = container.querySelector('[data-section="tooltip"]');
    expect(wrapper!.getAttribute('data-visible')).toBe('true');
  });

  it('does NOT render the arrow by default', () => {
    const { container } = render(
      <Tooltip label="x" open>
        <button>t</button>
      </Tooltip>,
    );
    expect(
      container.querySelector('[data-tooltip-arrow="true"]'),
    ).toBeNull();
  });

  it('renders the arrow chevron when arrow=true', () => {
    const { container } = render(
      <Tooltip label="x" arrow open>
        <button>t</button>
      </Tooltip>,
    );
    expect(
      container.querySelector('[data-tooltip-arrow="true"]'),
    ).not.toBeNull();
    expect(
      container
        .querySelector('[data-section="tooltip"]')!
        .getAttribute('data-arrow'),
    ).toBe('true');
  });

  it('showDelay overrides delayMs for the hover-in direction', () => {
    vi.useFakeTimers();
    render(
      <Tooltip label="x" delayMs={500} showDelay={50}>
        <button>t</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 't' }));
    act(() => {
      vi.advanceTimersByTime(80);
    });
    expect(screen.getByRole('tooltip')).toHaveAttribute(
      'data-visible',
      'true',
    );
    vi.useRealTimers();
  });

  it('hideDelay defers the hover-out close by the configured ms', () => {
    vi.useFakeTimers();
    render(
      <Tooltip label="x" showDelay={0} hideDelay={200}>
        <button>t</button>
      </Tooltip>,
    );
    const btn = screen.getByRole('button', { name: 't' });
    fireEvent.mouseEnter(btn);
    expect(screen.getByRole('tooltip')).toHaveAttribute(
      'data-visible',
      'true',
    );
    fireEvent.mouseLeave(btn);
    // Still visible -- hideDelay hasn't elapsed.
    expect(screen.getByRole('tooltip')).toHaveAttribute(
      'data-visible',
      'true',
    );
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByRole('tooltip')).toHaveAttribute(
      'data-visible',
      'false',
    );
    vi.useRealTimers();
  });

  it('hideDelay=0 (default) closes synchronously on mouseLeave', () => {
    render(
      <Tooltip label="x" delayMs={0}>
        <button>t</button>
      </Tooltip>,
    );
    const btn = screen.getByRole('button', { name: 't' });
    fireEvent.mouseEnter(btn);
    expect(screen.getByRole('tooltip')).toHaveAttribute(
      'data-visible',
      'true',
    );
    fireEvent.mouseLeave(btn);
    expect(screen.getByRole('tooltip')).toHaveAttribute(
      'data-visible',
      'false',
    );
  });

  it('unmounting while a delayed show is pending does not throw', () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <Tooltip label="x" showDelay={500}>
        <button>t</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 't' }));
    unmount();
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }).not.toThrow();
    vi.useRealTimers();
  });
});
