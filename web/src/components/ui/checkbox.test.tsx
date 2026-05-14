import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from './checkbox';

describe('<Checkbox>', () => {
  it('renders a bare <input type=checkbox> when no label is provided', () => {
    render(<Checkbox name="agree" data-testid="c" />);
    const node = screen.getByTestId('c') as HTMLInputElement;
    expect(node.tagName).toBe('INPUT');
    expect(node).toHaveAttribute('type', 'checkbox');
  });

  it('renders the label text wrapping the input via the Label primitive', () => {
    render(<Checkbox name="agree" label="Accept ToS" />);
    const labelText = screen.getByText('Accept ToS');
    expect(labelText).toBeInTheDocument();
    const input = screen.getByRole('checkbox');
    const labelEl = labelText.closest('label');
    expect(labelEl).not.toBeNull();
    expect(labelEl).toContainElement(input);
  });

  it('uses a generated id when none is provided so the label associates with the input', () => {
    render(<Checkbox label="Accept" />);
    const input = screen.getByRole('checkbox');
    const id = input.getAttribute('id');
    expect(id).toBeTruthy();
    const labelEl = screen.getByText('Accept').closest('label');
    expect(labelEl).toHaveAttribute('for', id!);
  });

  it('supports controlled checked + fires onChange on user click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const Wrapper = () => {
      const [v, setV] = useState(false);
      return (
        <Checkbox
          checked={v}
          onChange={(e) => {
            onChange(e);
            setV(e.target.checked);
          }}
          label="A"
        />
      );
    };
    render(<Wrapper />);
    const cb = screen.getByLabelText('A') as HTMLInputElement;
    expect(cb.checked).toBe(false);
    await user.click(cb);
    expect(cb.checked).toBe(true);
    expect(onChange).toHaveBeenCalled();
  });

  it('renders disabled state and ignores user clicks', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Checkbox checked={false} onChange={onChange} disabled label="A" />,
    );
    const cb = screen.getByLabelText('A') as HTMLInputElement;
    expect(cb).toBeDisabled();
    await user.click(cb);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies the focus-visible ring classes', () => {
    render(<Checkbox data-testid="c" />);
    const node = screen.getByTestId('c');
    expect(node.className).toContain('focus-visible:ring-2');
    expect(node.className).toContain('focus-visible:ring-primary');
    expect(node.className).toContain('focus-visible:ring-offset-2');
  });

  it('indeterminate=true sets the underlying input.indeterminate property and aria-checked=mixed', () => {
    render(<Checkbox indeterminate data-testid="c" />);
    const node = screen.getByTestId('c') as HTMLInputElement;
    expect(node.indeterminate).toBe(true);
    expect(node).toHaveAttribute('aria-checked', 'mixed');
  });

  it('clearing indeterminate resets the property and drops aria-checked', () => {
    const { rerender } = render(<Checkbox indeterminate data-testid="c" />);
    const node = screen.getByTestId('c') as HTMLInputElement;
    expect(node.indeterminate).toBe(true);
    rerender(<Checkbox indeterminate={false} data-testid="c" />);
    expect(node.indeterminate).toBe(false);
    expect(node).not.toHaveAttribute('aria-checked');
  });

  it('exposes a stable displayName', () => {
    expect(Checkbox.displayName).toBe('Checkbox');
  });
});
