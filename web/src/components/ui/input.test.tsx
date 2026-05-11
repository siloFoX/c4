import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './input';

describe('<Input>', () => {
  it('renders an <input> element', () => {
    render(<Input placeholder="email" />);
    expect(screen.getByPlaceholderText('email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('email').tagName).toBe('INPUT');
  });

  it('applies the surface classes (rounded + border + h-10 + bg-background)', () => {
    render(<Input data-testid="i" />);
    const node = screen.getByTestId('i');
    expect(node).toHaveClass('rounded-md');
    expect(node).toHaveClass('border');
    expect(node).toHaveClass('h-10');
    expect(node).toHaveClass('bg-background');
  });

  it('honors the type prop', () => {
    render(<Input data-testid="i" type="password" />);
    expect(screen.getByTestId('i')).toHaveAttribute('type', 'password');
  });

  it('accepts user typing and forwards onChange events', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input placeholder="search" onChange={onChange} />);
    await user.type(screen.getByPlaceholderText('search'), 'hello');
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByPlaceholderText('search')).toHaveValue('hello');
  });

  it('renders the disabled state and ignores typing when disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input placeholder="x" disabled onChange={onChange} />);
    const input = screen.getByPlaceholderText('x') as HTMLInputElement;
    expect(input).toBeDisabled();
    await user.type(input, 'nope');
    expect(input.value).toBe('');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('merges caller-provided className with the surface classes', () => {
    render(<Input data-testid="i" className="extra-tag" />);
    expect(screen.getByTestId('i')).toHaveClass('extra-tag');
  });

  it('forwards a ref to the underlying <input> element', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('exposes a stable displayName', () => {
    expect(Input.displayName).toBe('Input');
  });
});
