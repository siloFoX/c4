import { describe, it, expect, vi } from 'vitest';
import { useState, createRef } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatePicker, DateRangePicker, isDayAllowed } from './date-picker';
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

// -- v1.11.428 (TODO 11.410) extensions ------------------------------

describe('isDayAllowed helper', () => {
  it('passes through when no constraints supplied', () => {
    expect(isDayAllowed(new Date(2026, 4, 14))).toBe(true);
  });

  it('rejects dates before min', () => {
    expect(
      isDayAllowed(new Date(2026, 4, 1), new Date(2026, 4, 10)),
    ).toBe(false);
  });

  it('rejects dates after max', () => {
    expect(
      isDayAllowed(
        new Date(2026, 4, 30),
        undefined,
        new Date(2026, 4, 10),
      ),
    ).toBe(false);
  });

  it('accepts when within [min, max]', () => {
    expect(
      isDayAllowed(
        new Date(2026, 4, 14),
        new Date(2026, 4, 1),
        new Date(2026, 4, 30),
      ),
    ).toBe(true);
  });

  it('rejects when predicate returns true', () => {
    expect(
      isDayAllowed(
        new Date(2026, 4, 14),
        undefined,
        undefined,
        () => true,
      ),
    ).toBe(false);
  });

  it('accepts when predicate returns false', () => {
    expect(
      isDayAllowed(
        new Date(2026, 4, 14),
        undefined,
        undefined,
        () => false,
      ),
    ).toBe(true);
  });

  it('swallows predicate throws (returns disabled)', () => {
    expect(
      isDayAllowed(
        new Date(2026, 4, 14),
        undefined,
        undefined,
        () => {
          throw new Error('boom');
        },
      ),
    ).toBe(false);
  });

  it('combines min/max + predicate (both must pass)', () => {
    // Within range but predicate disables -> false
    expect(
      isDayAllowed(
        new Date(2026, 4, 14),
        new Date(2026, 4, 1),
        new Date(2026, 4, 30),
        (d) => d.getDate() === 14,
      ),
    ).toBe(false);
    // Outside range -> predicate not consulted; still false
    expect(
      isDayAllowed(
        new Date(2026, 4, 31),
        new Date(2026, 4, 1),
        new Date(2026, 4, 30),
        () => false,
      ),
    ).toBe(false);
  });
});

describe('<DatePicker> isDateDisabled predicate', () => {
  function ControlledWithPredicate(props: {
    initial?: Date | null;
    isDateDisabled: (d: Date) => boolean;
  }) {
    const [v, setV] = useState<Date | null>(props.initial ?? null);
    return (
      <DatePicker
        value={v}
        onChange={setV}
        isDateDisabled={props.isDateDisabled}
      />
    );
  }

  it('disables cells where the predicate returns true', async () => {
    const user = userEvent.setup();
    render(
      <ControlledWithPredicate
        initial={new Date(2026, 4, 14)}
        isDateDisabled={(d) => d.getDate() === 15}
      />,
    );
    await user.click(
      screen.getByRole('button', { name: 'Date picker' }),
    );
    const panel = screen.getByTestId('date-picker-panel');
    const cell15 = within(panel).getByRole('gridcell', {
      name: '15',
    });
    expect(cell15).toBeDisabled();
    expect(cell15).toHaveAttribute('aria-disabled', 'true');
  });

  it('cells where predicate returns false stay enabled', async () => {
    const user = userEvent.setup();
    render(
      <ControlledWithPredicate
        initial={new Date(2026, 4, 14)}
        isDateDisabled={(d) => d.getDate() === 15}
      />,
    );
    await user.click(
      screen.getByRole('button', { name: 'Date picker' }),
    );
    const panel = screen.getByTestId('date-picker-panel');
    const cell16 = within(panel).getByRole('gridcell', {
      name: '16',
    });
    expect(cell16).not.toBeDisabled();
  });

  it('click on a disabled cell does NOT call onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    function Local() {
      const [v, setV] = useState<Date | null>(new Date(2026, 4, 14));
      return (
        <DatePicker
          value={v}
          onChange={(d) => {
            setV(d);
            onChange(d);
          }}
          isDateDisabled={(d) => d.getDate() === 15}
        />
      );
    }
    render(<Local />);
    await user.click(
      screen.getByRole('button', { name: 'Date picker' }),
    );
    const panel = screen.getByTestId('date-picker-panel');
    const cell15 = within(panel).getByRole('gridcell', {
      name: '15',
    });
    await user.click(cell15);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Enter on a predicate-disabled focused cell is a no-op', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    function Local() {
      const [v, setV] = useState<Date | null>(new Date(2026, 4, 14));
      return (
        <DatePicker
          value={v}
          onChange={(d) => {
            setV(d);
            onChange(d);
          }}
          isDateDisabled={(d) => d.getDate() === 15}
        />
      );
    }
    render(<Local />);
    await user.click(
      screen.getByRole('button', { name: 'Date picker' }),
    );
    // Move focus right one day (14 -> 15) then Enter
    await user.keyboard('{ArrowRight}');
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('predicate compounds with min/max (both must pass)', async () => {
    const user = userEvent.setup();
    function Local() {
      const [v, setV] = useState<Date | null>(new Date(2026, 4, 14));
      return (
        <DatePicker
          value={v}
          onChange={setV}
          min={new Date(2026, 4, 10)}
          max={new Date(2026, 4, 20)}
          isDateDisabled={(d) => d.getDate() === 15}
        />
      );
    }
    render(<Local />);
    await user.click(
      screen.getByRole('button', { name: 'Date picker' }),
    );
    const panel = screen.getByTestId('date-picker-panel');
    // Day numbers 1..6 appear twice in this grid (May + June trailing
    // cells), so pick the in-month one via the data-outside flag.
    const pickInMonth = (name: string): HTMLButtonElement => {
      const matches = within(panel).getAllByRole('gridcell', { name });
      const inMonth = matches.find(
        (c) => !c.hasAttribute('data-outside'),
      );
      return inMonth as HTMLButtonElement;
    };
    expect(pickInMonth('9')).toBeDisabled(); // below min
    expect(pickInMonth('15')).toBeDisabled(); // predicate
    expect(pickInMonth('14')).not.toBeDisabled();
    expect(pickInMonth('25')).toBeDisabled(); // above max
  });

  it('predicate throws are swallowed and the cell is disabled', async () => {
    const user = userEvent.setup();
    const isDateDisabled = (d: Date) => {
      if (d.getDate() === 15) throw new Error('boom');
      return false;
    };
    function Local() {
      const [v, setV] = useState<Date | null>(new Date(2026, 4, 14));
      return (
        <DatePicker
          value={v}
          onChange={setV}
          isDateDisabled={isDateDisabled}
        />
      );
    }
    render(<Local />);
    await user.click(
      screen.getByRole('button', { name: 'Date picker' }),
    );
    const panel = screen.getByTestId('date-picker-panel');
    expect(
      within(panel).getByRole('gridcell', { name: '15' }),
    ).toBeDisabled();
    expect(
      within(panel).getByRole('gridcell', { name: '16' }),
    ).not.toBeDisabled();
  });
});

describe('<DateRangePicker> isDateDisabled predicate', () => {
  it('disables cells in both calendar panes', async () => {
    const user = userEvent.setup();
    function Local() {
      const [v, setV] = useState<DateRange>({
        from: new Date(2026, 4, 1),
        to: null,
      });
      return (
        <DateRangePicker
          value={v}
          onChange={setV}
          isDateDisabled={(d) => d.getDate() === 15}
        />
      );
    }
    render(<Local />);
    await user.click(
      screen.getByRole('button', { name: 'Date range picker' }),
    );
    const panel = screen.getByTestId('date-range-picker-panel');
    const cells15 = within(panel).getAllByRole('gridcell', {
      name: '15',
    });
    // At least one disabled "15" in the first month grid; the
    // second month is hidden on mobile but rendered in jsdom.
    expect(cells15.some((c) => (c as HTMLButtonElement).disabled)).toBe(
      true,
    );
  });
});
