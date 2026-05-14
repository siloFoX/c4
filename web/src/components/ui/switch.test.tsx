import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Switch } from './switch';

describe('<Switch>', () => {
  it('renders role=switch and reflects the checked prop via aria-checked', () => {
    const { rerender } = render(
      <Switch checked={false} onChange={() => {}} aria-label="s" />,
    );
    const node = screen.getByRole('switch');
    expect(node).toHaveAttribute('aria-checked', 'false');
    rerender(<Switch checked onChange={() => {}} aria-label="s" />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('renders as type=button so it never submits a parent form', () => {
    render(<Switch checked={false} onChange={() => {}} aria-label="s" />);
    expect(screen.getByRole('switch')).toHaveAttribute('type', 'button');
  });

  it('click toggles via onChange with the next boolean value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Switch checked={false} onChange={onChange} aria-label="s" />,
    );
    await user.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('Space and Enter both toggle the switch', async () => {
    const user = userEvent.setup();
    const Wrapper = () => {
      const [v, setV] = useState(false);
      return <Switch checked={v} onChange={setV} aria-label="s" />;
    };
    render(<Wrapper />);
    const node = screen.getByRole('switch');
    node.focus();
    await user.keyboard(' ');
    expect(node).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{Enter}');
    expect(node).toHaveAttribute('aria-checked', 'false');
  });

  it('clicking the label toggles the switch', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Switch checked={false} onChange={onChange} label="Notify me" />,
    );
    await user.click(screen.getByText('Notify me'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('label htmlFor wires to the button id via useId', () => {
    render(
      <Switch checked={false} onChange={() => {}} label="Notify" />,
    );
    const node = screen.getByRole('switch');
    const id = node.getAttribute('id');
    expect(id).toBeTruthy();
    const label = screen.getByText('Notify').closest('label');
    expect(label).toHaveAttribute('for', id!);
  });

  it('respects an explicit id prop over the generated one', () => {
    render(
      <Switch
        id="my-switch"
        checked={false}
        onChange={() => {}}
        label="L"
      />,
    );
    expect(screen.getByRole('switch')).toHaveAttribute('id', 'my-switch');
  });

  it('disabled gates click and key events and renders opacity-50 + cursor-not-allowed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Switch
        checked={false}
        onChange={onChange}
        disabled
        aria-label="s"
      />,
    );
    const node = screen.getByRole('switch');
    expect(node).toBeDisabled();
    expect(node.className).toContain('disabled:opacity-50');
    expect(node.className).toContain('disabled:cursor-not-allowed');
    await user.click(node);
    node.focus();
    await user.keyboard(' ');
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disabled label click does not fire onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Switch
        checked={false}
        onChange={onChange}
        disabled
        label="L"
      />,
    );
    await user.click(screen.getByText('L'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies the focus-visible ring class chain matching other primitives', () => {
    render(<Switch checked={false} onChange={() => {}} aria-label="s" />);
    const node = screen.getByRole('switch');
    expect(node.className).toContain('focus-visible:ring-2');
    expect(node.className).toContain('focus-visible:ring-primary');
    expect(node.className).toContain('focus-visible:ring-offset-2');
  });

  it('background is bg-primary when checked and bg-muted when unchecked', () => {
    const { rerender } = render(
      <Switch checked onChange={() => {}} aria-label="s" />,
    );
    expect(screen.getByRole('switch').className).toContain('bg-primary');
    rerender(<Switch checked={false} onChange={() => {}} aria-label="s" />);
    expect(screen.getByRole('switch').className).toContain('bg-muted');
  });

  it('thumb translates X via transition-transform when checked', () => {
    const { rerender } = render(
      <Switch checked={false} onChange={() => {}} aria-label="s" />,
    );
    const thumbOff = screen.getByRole('switch').querySelector('span');
    expect(thumbOff?.className).toContain('transition-transform');
    expect(thumbOff?.className).toContain('translate-x-0.5');
    rerender(<Switch checked onChange={() => {}} aria-label="s" />);
    const thumbOn = screen.getByRole('switch').querySelector('span');
    expect(thumbOn?.className).toContain('translate-x-4');
  });

  it('renders aria-label when no label slot is supplied', () => {
    render(
      <Switch checked={false} onChange={() => {}} aria-label="autopilot" />,
    );
    expect(screen.getByRole('switch', { name: 'autopilot' })).toBeInTheDocument();
  });

  it('label association lets getByLabelText find the switch', () => {
    render(
      <Switch checked={false} onChange={() => {}} label="Autopilot" />,
    );
    expect(screen.getByLabelText('Autopilot')).toBe(
      screen.getByRole('switch'),
    );
  });

  it('exposes a stable displayName', () => {
    expect(Switch.displayName).toBe('Switch');
  });
});
