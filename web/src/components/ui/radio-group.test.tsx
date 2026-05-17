import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RadioGroup } from './radio-group';
import type { RadioGroupItem } from './radio-group';

const BASE_ITEMS: RadioGroupItem[] = [
  { value: 'low', label: 'Low', description: 'Conservative budget.' },
  { value: 'mid', label: 'Mid', description: 'Balanced trade-off.' },
  { value: 'high', label: 'High' },
];

function Harness({
  initial = 'mid',
  items = BASE_ITEMS,
  orientation,
}: {
  initial?: string;
  items?: RadioGroupItem[];
  orientation?: 'horizontal' | 'vertical';
}) {
  const [value, setValue] = useState<string>(initial);
  return (
    <RadioGroup
      value={value}
      onChange={setValue}
      items={items}
      ariaLabel="Effort tier"
      {...(orientation ? { orientation } : {})}
    />
  );
}

describe('<RadioGroup>', () => {
  it('renders the radiogroup container with the ariaLabel', () => {
    render(<Harness />);
    const group = screen.getByRole('radiogroup', { name: 'Effort tier' });
    expect(group).toBeInTheDocument();
  });

  it('renders one role="radio" button per item', () => {
    render(<Harness />);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('sets aria-checked=true on the active item and false on the others', () => {
    render(<Harness initial="mid" />);
    expect(screen.getByRole('radio', { name: /Mid/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: /Low/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('roving tabindex: only the active radio is tabbable', () => {
    render(<Harness initial="mid" />);
    expect(screen.getByRole('radio', { name: /Mid/ }).tabIndex).toBe(0);
    expect(screen.getByRole('radio', { name: /Low/ }).tabIndex).toBe(-1);
    expect(screen.getByRole('radio', { name: /High/ }).tabIndex).toBe(-1);
  });

  it('clicking a row calls onChange with the new value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RadioGroup
        value="low"
        onChange={onChange}
        items={BASE_ITEMS}
        ariaLabel="Effort tier"
      />,
    );
    await user.click(screen.getByRole('radio', { name: /High/ }));
    expect(onChange).toHaveBeenCalledWith('high');
  });

  it('clicking the already-active row does NOT fire onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RadioGroup
        value="mid"
        onChange={onChange}
        items={BASE_ITEMS}
        ariaLabel="Effort tier"
      />,
    );
    await user.click(screen.getByRole('radio', { name: /Mid/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disabled item is not clickable + skipped from keyboard nav', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const items: RadioGroupItem[] = [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B', disabled: true },
      { value: 'c', label: 'C' },
    ];
    render(
      <RadioGroup
        value="a"
        onChange={onChange}
        items={items}
        ariaLabel="t"
      />,
    );
    await user.click(screen.getByRole('radio', { name: 'B' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('default orientation="vertical" + ArrowDown cycles forward', async () => {
    const user = userEvent.setup();
    render(<Harness initial="low" />);
    const group = screen.getByRole('radiogroup');
    expect(group.getAttribute('data-orientation')).toBe('vertical');
    screen.getByRole('radio', { name: /Low/ }).focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /Mid/ })).toHaveFocus();
    });
  });

  it('orientation="horizontal" + ArrowRight cycles forward', async () => {
    const user = userEvent.setup();
    render(<Harness initial="low" orientation="horizontal" />);
    const group = screen.getByRole('radiogroup');
    expect(group.getAttribute('data-orientation')).toBe('horizontal');
    screen.getByRole('radio', { name: /Low/ }).focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /Mid/ })).toHaveFocus();
    });
  });

  it('Home key jumps to the first radio, End jumps to the last', async () => {
    const user = userEvent.setup();
    render(<Harness initial="mid" />);
    screen.getByRole('radio', { name: /Mid/ }).focus();
    await user.keyboard('{End}');
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /High/ })).toHaveFocus(),
    );
    await user.keyboard('{Home}');
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /Low/ })).toHaveFocus(),
    );
  });

  it('Space on the focused row commits the value', async () => {
    const user = userEvent.setup();
    render(<Harness initial="low" />);
    const high = screen.getByRole('radio', { name: /High/ });
    high.focus();
    await user.keyboard(' ');
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /High/ })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    );
  });

  it('Enter on the focused row commits the value', async () => {
    const user = userEvent.setup();
    render(<Harness initial="low" />);
    const high = screen.getByRole('radio', { name: /High/ });
    high.focus();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /High/ })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    );
  });

  it('renders the description when set + plumbs aria-describedby', () => {
    render(<Harness initial="low" />);
    const low = screen.getByRole('radio', { name: /Low/ });
    const descId = low.getAttribute('aria-describedby');
    expect(descId).toBeTruthy();
    const descEl = document.getElementById(descId as string);
    expect(descEl).toHaveTextContent('Conservative budget.');
  });

  it('items without a description have no aria-describedby', () => {
    render(<Harness initial="high" />);
    const high = screen.getByRole('radio', { name: /High/ });
    expect(high).not.toHaveAttribute('aria-describedby');
  });

  it('showDescription=false hides the description text but keeps it absent', () => {
    render(
      <RadioGroup
        value="low"
        onChange={() => {}}
        items={BASE_ITEMS}
        ariaLabel="t"
        showDescription={false}
      />,
    );
    expect(screen.queryByText('Conservative budget.')).toBeNull();
  });

  it('exposes data-section + data-orientation + data-active selectors', () => {
    render(<Harness initial="mid" orientation="horizontal" />);
    const group = screen.getByRole('radiogroup');
    expect(group.getAttribute('data-section')).toBe('radio-group');
    expect(group.getAttribute('data-orientation')).toBe('horizontal');
    const active = screen.getByRole('radio', { name: /Mid/ });
    expect(active.getAttribute('data-active')).toBe('true');
    const inactive = screen.getByRole('radio', { name: /Low/ });
    expect(inactive.getAttribute('data-active')).toBe('false');
  });

  it('renders the leading icon slot when provided', () => {
    const items: RadioGroupItem[] = [
      {
        value: 'a',
        label: 'A',
        icon: <span data-testid="icon-a">*</span>,
      },
      { value: 'b', label: 'B' },
    ];
    render(
      <RadioGroup
        value="a"
        onChange={() => {}}
        items={items}
        ariaLabel="t"
      />,
    );
    expect(screen.getByTestId('icon-a')).toBeInTheDocument();
  });

  it('exposes a stable displayName', () => {
    expect(RadioGroup.displayName).toBe('RadioGroup');
  });

  it('uncontrolled-style empty value: first enabled item takes the tab stop', () => {
    const items: RadioGroupItem[] = [
      { value: 'a', label: 'A', disabled: true },
      { value: 'b', label: 'B' },
      { value: 'c', label: 'C' },
    ];
    render(
      <RadioGroup
        value=""
        onChange={() => {}}
        items={items}
        ariaLabel="t"
      />,
    );
    expect(screen.getByRole('radio', { name: 'A' }).tabIndex).toBe(-1);
    expect(screen.getByRole('radio', { name: 'B' }).tabIndex).toBe(0);
    expect(screen.getByRole('radio', { name: 'C' }).tabIndex).toBe(-1);
  });
});
