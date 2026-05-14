import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { Label } from './label';

describe('<Label>', () => {
  it('renders a <label> element carrying the children as text', () => {
    render(<Label>Email</Label>);
    const node = screen.getByText('Email');
    expect(node).toBeInTheDocument();
    expect(node.tagName).toBe('LABEL');
  });

  it('applies the base typography classes (text-sm + font-medium)', () => {
    render(<Label data-testid="lbl">x</Label>);
    const node = screen.getByTestId('lbl');
    expect(node).toHaveClass('text-sm');
    expect(node).toHaveClass('font-medium');
    expect(node).toHaveClass('leading-none');
  });

  it('honors the htmlFor prop (associates label with form control)', () => {
    render(<Label htmlFor="email-field">Email</Label>);
    expect(screen.getByText('Email')).toHaveAttribute('for', 'email-field');
  });

  it('merges caller-provided className with the base classes', () => {
    render(
      <Label data-testid="lbl" className="my-label">
        x
      </Label>,
    );
    const node = screen.getByTestId('lbl');
    expect(node).toHaveClass('my-label');
    expect(node).toHaveClass('text-sm');
  });

  it('forwards arbitrary HTML attributes (data-* / aria-*) to the label', () => {
    render(
      <Label data-testid="lbl-1" aria-label="username-label">
        u
      </Label>,
    );
    const node = screen.getByTestId('lbl-1');
    expect(node).toHaveAttribute('aria-label', 'username-label');
  });

  it('forwards a ref to the underlying <label> element', () => {
    const ref = createRef<HTMLLabelElement>();
    render(<Label ref={ref}>x</Label>);
    expect(ref.current).toBeInstanceOf(HTMLLabelElement);
  });

  it('exposes a stable displayName', () => {
    expect(Label.displayName).toBe('Label');
  });
});
