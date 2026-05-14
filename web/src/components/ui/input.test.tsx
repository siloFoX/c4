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

  // ----- v1.11.142 optional label / hint / error slots -----

  describe('label slot', () => {
    it('renders a <Label> above the input with the given text', () => {
      render(<Input label="Email" id="email" />);
      const labelEl = screen.getByText('Email');
      expect(labelEl.tagName).toBe('LABEL');
    });

    it('wires htmlFor to an explicitly provided input id', () => {
      render(<Input label="Email" id="email" />);
      const labelEl = screen.getByText('Email');
      expect(labelEl).toHaveAttribute('for', 'email');
      const inputEl = screen.getByLabelText('Email');
      expect(inputEl).toHaveAttribute('id', 'email');
    });

    it('uses a generated id when label is set but no id is provided', () => {
      render(<Input label="Email" />);
      const labelEl = screen.getByText('Email');
      const forValue = labelEl.getAttribute('for');
      expect(forValue).toBeTruthy();
      const inputEl = screen.getByLabelText('Email');
      expect(inputEl).toHaveAttribute('id', forValue!);
    });
  });

  describe('hint slot', () => {
    it('renders the hint text below the input', () => {
      render(<Input label="Email" id="email" hint="We never share this" />);
      expect(screen.getByText('We never share this')).toBeInTheDocument();
    });

    it('wires aria-describedby to the hint element id', () => {
      render(<Input label="Email" id="email" hint="We never share this" />);
      const inputEl = screen.getByLabelText('Email');
      const describedBy = inputEl.getAttribute('aria-describedby') ?? '';
      const hintEl = screen.getByText('We never share this');
      expect(hintEl.id).toBeTruthy();
      expect(describedBy.split(/\s+/)).toContain(hintEl.id);
    });

    it('does not set aria-invalid when only a hint is present', () => {
      render(<Input label="Email" id="email" hint="hint only" />);
      const inputEl = screen.getByLabelText('Email');
      expect(inputEl).not.toHaveAttribute('aria-invalid');
    });
  });

  describe('error slot', () => {
    it('renders the error in a role=alert region and sets aria-invalid=true', () => {
      render(<Input label="Email" id="email" error="Required" />);
      const alertEl = screen.getByRole('alert');
      expect(alertEl).toHaveTextContent('Required');
      const inputEl = screen.getByLabelText('Email');
      expect(inputEl).toHaveAttribute('aria-invalid', 'true');
    });

    it('wires aria-describedby to the error element id', () => {
      render(<Input label="Email" id="email" error="Required" />);
      const inputEl = screen.getByLabelText('Email');
      const describedBy = inputEl.getAttribute('aria-describedby') ?? '';
      const errorEl = screen.getByRole('alert');
      expect(errorEl.id).toBeTruthy();
      expect(describedBy.split(/\s+/)).toContain(errorEl.id);
    });

    it('adds the destructive border tone when error is set', () => {
      render(<Input label="Email" id="email" error="Required" />);
      const inputEl = screen.getByLabelText('Email');
      expect(inputEl).toHaveClass('border-destructive');
    });
  });

  describe('hint and error coexist', () => {
    it('aria-describedby contains both the hint id and the error id', () => {
      render(
        <Input
          label="Email"
          id="email"
          hint="Format hint"
          error="Required"
        />,
      );
      const inputEl = screen.getByLabelText('Email');
      const describedBy = inputEl.getAttribute('aria-describedby') ?? '';
      const hintEl = screen.getByText('Format hint');
      const errorEl = screen.getByRole('alert');
      const ids = describedBy.split(/\s+/);
      expect(ids).toContain(hintEl.id);
      expect(ids).toContain(errorEl.id);
      expect(inputEl).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('bare input (no slots)', () => {
    it('renders just the <input> with no wrapper when label / hint / error are all unset', () => {
      const { container } = render(<Input placeholder="bare" />);
      expect(container.firstElementChild?.tagName).toBe('INPUT');
      expect(container.firstElementChild).toBe(
        screen.getByPlaceholderText('bare'),
      );
    });

    it('does not set aria-invalid on a bare input', () => {
      const { container } = render(<Input placeholder="bare" />);
      expect(container.firstElementChild).not.toHaveAttribute('aria-invalid');
    });
  });
});
