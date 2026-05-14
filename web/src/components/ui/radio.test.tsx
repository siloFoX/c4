import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Radio } from './radio';

describe('<Radio>', () => {
  it('renders a bare <input type=radio> when no label is provided', () => {
    render(<Radio name="grp" value="a" data-testid="r" />);
    const node = screen.getByTestId('r') as HTMLInputElement;
    expect(node.tagName).toBe('INPUT');
    expect(node).toHaveAttribute('type', 'radio');
    expect(node).toHaveAttribute('name', 'grp');
    expect(node).toHaveAttribute('value', 'a');
  });

  it('renders the label text wrapping the input via the Label primitive', () => {
    render(<Radio name="grp" value="a" label="Option A" />);
    const labelText = screen.getByText('Option A');
    expect(labelText).toBeInTheDocument();
    const input = screen.getByRole('radio') as HTMLInputElement;
    expect(input).toHaveAttribute('type', 'radio');
    const labelEl = labelText.closest('label');
    expect(labelEl).not.toBeNull();
    expect(labelEl).toContainElement(input);
  });

  it('uses a generated id when none is provided so the label associates with the input', () => {
    render(<Radio name="grp" value="a" label="Pick A" />);
    const input = screen.getByRole('radio');
    const id = input.getAttribute('id');
    expect(id).toBeTruthy();
    const labelEl = screen.getByText('Pick A').closest('label');
    expect(labelEl).toHaveAttribute('for', id!);
  });

  it('honors an explicit id', () => {
    render(<Radio id="my-id" name="grp" value="a" label="X" />);
    expect(screen.getByRole('radio')).toHaveAttribute('id', 'my-id');
    expect(screen.getByText('X').closest('label')).toHaveAttribute(
      'for',
      'my-id',
    );
  });

  it('supports controlled checked + fires onChange on user click', async () => {
    const user = userEvent.setup();
    const Wrapper = () => {
      const [v, setV] = useState('a');
      return (
        <>
          <Radio
            name="grp"
            value="a"
            checked={v === 'a'}
            onChange={() => setV('a')}
            label="A"
          />
          <Radio
            name="grp"
            value="b"
            checked={v === 'b'}
            onChange={() => setV('b')}
            label="B"
          />
        </>
      );
    };
    render(<Wrapper />);
    const a = screen.getByLabelText('A') as HTMLInputElement;
    const b = screen.getByLabelText('B') as HTMLInputElement;
    expect(a.checked).toBe(true);
    expect(b.checked).toBe(false);
    await user.click(b);
    expect(b.checked).toBe(true);
    expect(a.checked).toBe(false);
  });

  it('passes the change event when onChange is provided directly', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Radio
        name="grp"
        value="a"
        checked={false}
        onChange={onChange}
        label="A"
      />,
    );
    await user.click(screen.getByLabelText('A'));
    expect(onChange).toHaveBeenCalled();
  });

  it('renders disabled state and ignores user clicks', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Radio
        name="grp"
        value="a"
        checked={false}
        onChange={onChange}
        disabled
        label="A"
      />,
    );
    const input = screen.getByLabelText('A') as HTMLInputElement;
    expect(input).toBeDisabled();
    await user.click(input);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies the focus-visible ring classes', () => {
    render(<Radio name="grp" value="a" data-testid="r" />);
    const node = screen.getByTestId('r');
    expect(node.className).toContain('focus-visible:ring-2');
    expect(node.className).toContain('focus-visible:ring-primary');
    expect(node.className).toContain('focus-visible:ring-offset-2');
  });

  it('exposes a stable displayName', () => {
    expect(Radio.displayName).toBe('Radio');
  });
});
