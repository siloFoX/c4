import { describe, it, expect, vi } from 'vitest';
import { useState, createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NumberInput } from './number-input';

interface ControlledProps {
  initial?: number | undefined;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  prefix?: string;
  precision?: number;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  inputClassName?: string;
  size?: 'sm' | 'md';
  onChange?: (next: number | undefined) => void;
}

function Controlled(props: ControlledProps) {
  const [value, setValue] = useState<number | undefined>(props.initial);
  return (
    <NumberInput
      value={value}
      onChange={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
      min={props.min}
      max={props.max}
      step={props.step}
      unit={props.unit}
      prefix={props.prefix}
      precision={props.precision}
      placeholder={props.placeholder}
      disabled={props.disabled}
      ariaLabel={props.ariaLabel}
      className={props.className}
      inputClassName={props.inputClassName}
      size={props.size}
    />
  );
}

describe('<NumberInput>', () => {
  it('renders input with current value', () => {
    render(<Controlled initial={5} ariaLabel="qty" />);
    const input = screen.getByLabelText('qty') as HTMLInputElement;
    expect(input.value).toBe('5');
  });

  it('up stepper increments by step', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={5} ariaLabel="qty" onChange={onChange} />);
    await user.click(screen.getByLabelText('Increment'));
    expect(onChange).toHaveBeenLastCalledWith(6);
  });

  it('down stepper decrements by step', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={5} ariaLabel="qty" onChange={onChange} />);
    await user.click(screen.getByLabelText('Decrement'));
    expect(onChange).toHaveBeenLastCalledWith(4);
  });

  it('ArrowUp / ArrowDown step via keyboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={5} ariaLabel="qty" onChange={onChange} />);
    const input = screen.getByLabelText('qty');
    input.focus();
    await user.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenLastCalledWith(6);
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    expect(onChange).toHaveBeenLastCalledWith(5);
  });

  it('step=2 increments by 2', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={5} step={2} ariaLabel="qty" onChange={onChange} />);
    await user.click(screen.getByLabelText('Increment'));
    expect(onChange).toHaveBeenLastCalledWith(7);
  });

  it('min disables down stepper when at min', () => {
    render(<Controlled initial={0} min={0} ariaLabel="qty" />);
    expect(screen.getByLabelText('Decrement')).toBeDisabled();
    expect(screen.getByLabelText('Increment')).not.toBeDisabled();
  });

  it('max disables up stepper when at max', () => {
    render(<Controlled initial={10} max={10} ariaLabel="qty" />);
    expect(screen.getByLabelText('Increment')).toBeDisabled();
    expect(screen.getByLabelText('Decrement')).not.toBeDisabled();
  });

  it('typing parses to number on change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={undefined} ariaLabel="qty" onChange={onChange} />);
    const input = screen.getByLabelText('qty');
    await user.type(input, '42');
    expect(onChange).toHaveBeenLastCalledWith(42);
  });

  it('empty input fires onChange(undefined)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={7} ariaLabel="qty" onChange={onChange} />);
    const input = screen.getByLabelText('qty') as HTMLInputElement;
    await user.clear(input);
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('blur clamps below min to min', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={-5} min={0} max={100} ariaLabel="qty" onChange={onChange} />);
    const input = screen.getByLabelText('qty');
    input.focus();
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('blur clamps above max to max', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={500} min={0} max={100} ariaLabel="qty" onChange={onChange} />);
    const input = screen.getByLabelText('qty');
    input.focus();
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith(100);
  });

  it('blur applies precision toFixed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={1.23456} precision={2} ariaLabel="qty" onChange={onChange} />);
    const input = screen.getByLabelText('qty');
    input.focus();
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith(1.23);
  });

  it('renders unit suffix when provided', () => {
    render(<Controlled initial={50} unit="%" ariaLabel="qty" />);
    expect(screen.getByText('%')).toBeInTheDocument();
  });

  it('omits unit when not provided', () => {
    render(<Controlled initial={50} ariaLabel="qty" />);
    expect(screen.queryByText('%')).not.toBeInTheDocument();
  });

  it('disabled disables input and steppers', () => {
    render(<Controlled initial={5} disabled ariaLabel="qty" />);
    expect(screen.getByLabelText('qty')).toBeDisabled();
    expect(screen.getByLabelText('Increment')).toBeDisabled();
    expect(screen.getByLabelText('Decrement')).toBeDisabled();
  });

  it('ariaLabel applied to input', () => {
    render(<Controlled initial={5} ariaLabel="row-count" />);
    expect(screen.getByLabelText('row-count')).toBeInTheDocument();
  });

  it('className and inputClassName merge', () => {
    const { container } = render(
      <Controlled
        initial={5}
        ariaLabel="qty"
        className="custom-wrapper"
        inputClassName="custom-input"
      />,
    );
    expect(container.querySelector('.custom-wrapper')).toBeTruthy();
    expect(screen.getByLabelText('qty').className).toContain('custom-input');
  });

  it('forwardRef points to input element', () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <NumberInput
        ref={ref}
        value={3}
        onChange={() => {}}
        ariaLabel="qty"
      />,
    );
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current?.value).toBe('3');
  });

  it('stepper from undefined starts at min when defined', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={undefined} min={10} max={20} ariaLabel="qty" onChange={onChange} />);
    await user.click(screen.getByLabelText('Increment'));
    expect(onChange).toHaveBeenLastCalledWith(11);
  });

  // (v1.11.287, TODO 11.269) prefix slot + data-* attribute + decimal inputMode.

  it('renders the prefix when provided', () => {
    const { container } = render(
      <Controlled initial={50} prefix="$" ariaLabel="amount" />,
    );
    const prefix = container.querySelector('[data-number-input-prefix="true"]');
    expect(prefix).not.toBeNull();
    expect(prefix!.textContent).toBe('$');
  });

  it('omits the prefix when not provided', () => {
    const { container } = render(
      <Controlled initial={50} ariaLabel="amount" />,
    );
    expect(
      container.querySelector('[data-number-input-prefix="true"]'),
    ).toBeNull();
  });

  it('prefix and unit can coexist (currency + thousands)', () => {
    const { container } = render(
      <Controlled
        initial={1500}
        prefix="$"
        unit="k"
        ariaLabel="amount"
      />,
    );
    expect(
      container.querySelector('[data-number-input-prefix="true"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-number-input-unit="true"]'),
    ).not.toBeNull();
  });

  it('inputMode flips to "decimal" when precision > 0', () => {
    render(<Controlled initial={1.5} precision={2} ariaLabel="x" />);
    expect(screen.getByLabelText('x')).toHaveAttribute('inputmode', 'decimal');
  });

  it('inputMode stays "numeric" when precision is undefined', () => {
    render(<Controlled initial={5} ariaLabel="x" />);
    expect(screen.getByLabelText('x')).toHaveAttribute('inputmode', 'numeric');
  });

  it('inputMode stays "numeric" when precision is 0 (integer-only)', () => {
    render(<Controlled initial={5} precision={0} ariaLabel="x" />);
    expect(screen.getByLabelText('x')).toHaveAttribute('inputmode', 'numeric');
  });

  it('exposes data-section + data-size on the root', () => {
    const { container } = render(
      <Controlled initial={5} ariaLabel="x" size="sm" />,
    );
    const root = container.querySelector('[data-section="number-input"]');
    expect(root).not.toBeNull();
    expect(root!.getAttribute('data-size')).toBe('sm');
  });

  it('exposes data-number-input-action on the increment + decrement buttons', () => {
    const { container } = render(<Controlled initial={5} ariaLabel="x" />);
    expect(
      container.querySelector('[data-number-input-action="increment"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-number-input-action="decrement"]'),
    ).not.toBeNull();
  });
});
