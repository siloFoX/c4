import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IconButton } from './icon-button';

describe('<IconButton>', () => {
  it('renders the icon child inside a <button>', () => {
    render(
      <IconButton aria-label="close" icon={<svg data-testid="x-icon" />} />,
    );
    expect(screen.getByRole('button', { name: 'close' })).toBeInTheDocument();
    expect(screen.getByTestId('x-icon')).toBeInTheDocument();
  });

  it('uses the aria-label as the button accessible name', () => {
    render(<IconButton aria-label="settings" icon={<span />} />);
    expect(
      screen.getByRole('button', { name: 'settings' }),
    ).toBeInTheDocument();
  });

  it('defaults to type="button" so it never accidentally submits a form', () => {
    render(<IconButton aria-label="x" icon={<span />} />);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('honors an explicit type override', () => {
    render(<IconButton aria-label="submit" icon={<span />} type="submit" />);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('forwards click events to the onClick handler', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <IconButton aria-label="x" icon={<span />} onClick={onClick} />,
    );
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <IconButton
        aria-label="x"
        icon={<span />}
        onClick={onClick}
        disabled
      />,
    );
    await user.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('merges caller-provided className with the base classes', () => {
    render(
      <IconButton
        aria-label="x"
        icon={<span />}
        className="extra-tag"
      />,
    );
    const btn = screen.getByRole('button');
    expect(btn).toHaveClass('extra-tag');
    expect(btn).toHaveClass('rounded-md');
  });

  it('forwards a ref to the underlying <button> element', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<IconButton ref={ref} aria-label="x" icon={<span />} />);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('exposes a stable displayName for devtools', () => {
    expect(IconButton.displayName).toBe('IconButton');
  });
});
