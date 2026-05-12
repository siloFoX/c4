import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
});
