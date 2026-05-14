import { describe, it, expect, vi } from 'vitest';
import { useState, createRef } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatePicker, DateRangePicker } from './date-picker';
import type { DateRange } from './date-picker';

interface ControlledSingleProps {
  initial?: Date | null;
  min?: Date;
  max?: Date;
  disabled?: boolean;
  className?: string;
  onChange?: (d: Date | null) => void;
  refObj?: React.Ref<HTMLButtonElement>;
}

function ControlledSingle(props: ControlledSingleProps) {
  const [v, setV] = useState<Date | null>(props.initial ?? null);
  return (
    <DatePicker
      ref={props.refObj}
      value={v}
      onChange={(d) => { setV(d); props.onChange?.(d); }}
      min={props.min}
      max={props.max}
      disabled={props.disabled}
      className={props.className}
    />
  );
}

interface ControlledRangeProps { initial?: DateRange }

function ControlledRange(props: ControlledRangeProps) {
  const [v, setV] = useState<DateRange>(props.initial ?? { from: null, to: null });
  return <DateRangePicker value={v} onChange={setV} />;
}

describe('<DatePicker> single mode', () => {
  it('renders the placeholder when empty', () => {
    render(<ControlledSingle />);
    expect(screen.getByRole('button', { name: 'Date picker' })).toHaveTextContent('YYYY-MM-DD');
  });

  it('displays the formatted date when value set', () => {
    render(<ControlledSingle initial={new Date(2026, 4, 14)} />);
    expect(screen.getByRole('button', { name: 'Date picker' })).toHaveTextContent('2026-05-14');
  });

  it('opens calendar grid on click', async () => {
    const user = userEvent.setup();
    render(<ControlledSingle initial={new Date(2026, 4, 14)} />);
    await user.click(screen.getByRole('button', { name: 'Date picker' }));
    expect(screen.getByTestId('date-picker-panel')).toBeInTheDocument();
    expect(within(screen.getByTestId('date-picker-panel')).getByRole('grid')).toBeInTheDocument();
  });

  it('clicking a day fires onChange and updates label', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledSingle initial={new Date(2026, 4, 14)} onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: 'Date picker' });
    await user.click(trigger);
    const panel = screen.getByTestId('date-picker-panel');
    await user.click(within(panel).getByRole('gridcell', { name: '20' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0]![0] as Date;
    expect(arg.getFullYear()).toBe(2026);
    expect(arg.getMonth()).toBe(4);
    expect(arg.getDate()).toBe(20);
  });

  it('ArrowRight moves data-focused to next day', async () => {
    const user = userEvent.setup();
    render(<ControlledSingle initial={new Date(2026, 4, 14)} />);
    await user.click(screen.getByRole('button', { name: 'Date picker' }));
    const panel = screen.getByTestId('date-picker-panel');
    const before = within(panel).getByRole('gridcell', { name: '14' });
    expect(before).toHaveAttribute('data-focused', 'true');
    await user.keyboard('{ArrowRight}');
    const after = within(panel).getByRole('gridcell', { name: '15' });
    expect(after).toHaveAttribute('data-focused', 'true');
  });

  it('min disables cells outside range', async () => {
    const user = userEvent.setup();
    render(<ControlledSingle initial={new Date(2026, 4, 14)} min={new Date(2026, 4, 10)} />);
    await user.click(screen.getByRole('button', { name: 'Date picker' }));
    const panel = screen.getByTestId('date-picker-panel');
    const cells = within(panel).getAllByRole('gridcell', { name: '5' });
    const may5 = cells.find((c) => !c.hasAttribute('data-outside'));
    expect(may5).toBeDefined();
    expect(may5).toBeDisabled();
    expect(may5).toHaveAttribute('aria-disabled', 'true');
  });

  it('today cell has data-today marker', async () => {
    const user = userEvent.setup();
    render(<ControlledSingle />);
    await user.click(screen.getByRole('button', { name: 'Date picker' }));
    const panel = screen.getByTestId('date-picker-panel');
    const todays = within(panel).getAllByRole('gridcell').filter(
      (c) => c.getAttribute('data-today') === 'true',
    );
    expect(todays.length).toBeGreaterThanOrEqual(1);
  });

  it('disabled trigger cannot be activated', async () => {
    const user = userEvent.setup();
    render(<ControlledSingle disabled />);
    const btn = screen.getByRole('button', { name: 'Date picker' });
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(screen.queryByTestId('date-picker-panel')).not.toBeInTheDocument();
  });

  it('forwards ref to the trigger button', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<ControlledSingle refObj={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('merges className onto the trigger', () => {
    render(<ControlledSingle className="custom-cls" />);
    expect(screen.getByRole('button', { name: 'Date picker' })).toHaveClass('custom-cls');
  });

  it('Escape closes the popover', async () => {
    const user = userEvent.setup();
    render(<ControlledSingle initial={new Date(2026, 4, 14)} />);
    await user.click(screen.getByRole('button', { name: 'Date picker' }));
    expect(screen.getByTestId('date-picker-panel')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('date-picker-panel')).not.toBeInTheDocument();
  });
});

describe('<DateRangePicker>', () => {
  it('displays "from ~ to" label when both set', () => {
    render(<ControlledRange initial={{ from: new Date(2026, 4, 1), to: new Date(2026, 4, 10) }} />);
    expect(screen.getByRole('button', { name: 'Date range picker' })).toHaveTextContent('2026-05-01 ~ 2026-05-10');
  });

  it('first click sets from, second click sets to', async () => {
    const user = userEvent.setup();
    render(<ControlledRange initial={{ from: new Date(2026, 4, 1), to: new Date(2026, 4, 1) }} />);
    const trigger = screen.getByRole('button', { name: 'Date range picker' });
    await user.click(trigger);
    let panel = screen.getByTestId('date-range-picker-panel');
    await user.click(within(panel).getAllByRole('gridcell', { name: '5' })[0]!);
    expect(trigger).toHaveTextContent('2026-05-05 ~ YYYY-MM-DD');
    await user.click(within(panel).getAllByRole('gridcell', { name: '12' })[0]!);
    expect(trigger).toHaveTextContent('2026-05-05 ~ 2026-05-12');
  });
});
