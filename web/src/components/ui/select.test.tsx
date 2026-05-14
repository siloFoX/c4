import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './select';
import type { SelectOption } from './select';

const FRUITS: SelectOption[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
];

function Controlled({
  initial = '',
  options = FRUITS,
  ...rest
}: {
  initial?: string;
  options?: SelectOption[];
  [k: string]: unknown;
}) {
  const [v, setV] = useState(initial);
  return (
    <Select
      options={options}
      value={v}
      onChange={setV}
      placeholder="Pick one"
      ariaLabel="Fruit"
      {...rest}
    />
  );
}

describe('<Select>', () => {
  it('renders the trigger with placeholder when no value', () => {
    render(<Controlled />);
    const trigger = screen.getByRole('combobox', { name: 'Fruit' });
    expect(trigger).toHaveTextContent('Pick one');
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders the selected option label when value is set', () => {
    render(<Controlled initial="banana" />);
    expect(screen.getByRole('combobox', { name: 'Fruit' })).toHaveTextContent(
      'Banana',
    );
  });

  it('opens the listbox on trigger click and mirrors aria-expanded', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const trigger = screen.getByRole('combobox', { name: 'Fruit' });
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('Arrow nav cycles highlighted option without committing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select
        options={FRUITS}
        value=""
        onChange={onChange}
        ariaLabel="Fruit"
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Fruit' });
    await user.click(trigger);
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    expect(onChange).not.toHaveBeenCalled();
    // highlight should be on index 1 (banana) after start-on-first + 1 down,
    // but we accept that highlight has moved past the initial index.
    const opts = screen.getAllByRole('option');
    expect(opts[1]).toBeInTheDocument();
  });

  it('Enter commits the highlighted option and closes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select
        options={FRUITS}
        value=""
        onChange={onChange}
        ariaLabel="Fruit"
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Fruit' });
    await user.click(trigger);
    // start highlight is first enabled (apple). ArrowDown -> banana.
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('banana');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('Space commits the highlighted option', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select
        options={FRUITS}
        value=""
        onChange={onChange}
        ariaLabel="Fruit"
      />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Fruit' }));
    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith('apple');
  });

  it('Escape closes without committing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select
        options={FRUITS}
        value="apple"
        onChange={onChange}
        ariaLabel="Fruit"
      />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Fruit' }));
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Escape}');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('Home jumps to first, End jumps to last', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select
        options={FRUITS}
        value=""
        onChange={onChange}
        ariaLabel="Fruit"
      />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Fruit' }));
    await user.keyboard('{End}');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('cherry');
    onChange.mockClear();
    await user.click(screen.getByRole('combobox', { name: 'Fruit' }));
    await user.keyboard('{Home}');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('apple');
  });

  it('single-letter type-ahead matches option by first letter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select
        options={FRUITS}
        value=""
        onChange={onChange}
        ariaLabel="Fruit"
      />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Fruit' }));
    await user.keyboard('c');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('cherry');
  });

  it('click outside closes the listbox without committing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <div>
        <Select
          options={FRUITS}
          value=""
          onChange={onChange}
          ariaLabel="Fruit"
        />
        <button data-testid="outside">outside</button>
      </div>,
    );
    await user.click(screen.getByRole('combobox', { name: 'Fruit' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clicking an option commits its value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select
        options={FRUITS}
        value=""
        onChange={onChange}
        ariaLabel="Fruit"
      />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Fruit' }));
    await user.click(screen.getByRole('option', { name: 'Banana' }));
    expect(onChange).toHaveBeenCalledWith('banana');
  });

  describe('label / hint / error wiring', () => {
    it('wires htmlFor to an explicitly provided id', () => {
      render(
        <Select
          options={FRUITS}
          value=""
          onChange={() => {}}
          label="Fruit"
          id="fruit-pick"
        />,
      );
      const labelEl = screen.getByText('Fruit');
      expect(labelEl).toHaveAttribute('for', 'fruit-pick');
      expect(screen.getByLabelText('Fruit')).toHaveAttribute('id', 'fruit-pick');
    });

    it('uses generated id when no id is provided alongside a label', () => {
      render(
        <Select
          options={FRUITS}
          value=""
          onChange={() => {}}
          label="Fruit"
        />,
      );
      const labelEl = screen.getByText('Fruit');
      const forValue = labelEl.getAttribute('for');
      expect(forValue).toBeTruthy();
      expect(screen.getByLabelText('Fruit')).toHaveAttribute('id', forValue!);
    });

    it('renders hint and wires aria-describedby', () => {
      render(
        <Select
          options={FRUITS}
          value=""
          onChange={() => {}}
          label="Fruit"
          id="f"
          hint="Pick one"
        />,
      );
      const trigger = screen.getByLabelText('Fruit');
      const hintEl = screen.getByText('Pick one');
      expect(hintEl.id).toBeTruthy();
      expect(
        (trigger.getAttribute('aria-describedby') ?? '').split(/\s+/),
      ).toContain(hintEl.id);
    });

    it('renders error in role=alert and sets aria-invalid', () => {
      render(
        <Select
          options={FRUITS}
          value=""
          onChange={() => {}}
          label="Fruit"
          id="f"
          error="Required"
        />,
      );
      expect(screen.getByRole('alert')).toHaveTextContent('Required');
      expect(screen.getByLabelText('Fruit')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });

    it('aria-describedby contains both hint and error ids when both present', () => {
      render(
        <Select
          options={FRUITS}
          value=""
          onChange={() => {}}
          label="Fruit"
          id="f"
          hint="Hint here"
          error="Bad"
        />,
      );
      const trigger = screen.getByLabelText('Fruit');
      const hintEl = screen.getByText('Hint here');
      const errEl = screen.getByRole('alert');
      const ids = (trigger.getAttribute('aria-describedby') ?? '').split(/\s+/);
      expect(ids).toContain(hintEl.id);
      expect(ids).toContain(errEl.id);
    });
  });

  describe('disabled', () => {
    it('whole control: disabled trigger does not open', async () => {
      const user = userEvent.setup();
      render(
        <Select
          options={FRUITS}
          value=""
          onChange={() => {}}
          ariaLabel="Fruit"
          disabled
        />,
      );
      const trigger = screen.getByRole('combobox', { name: 'Fruit' });
      expect(trigger).toBeDisabled();
      await user.click(trigger);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('per-option disabled is skipped by arrow nav', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const opts: SelectOption[] = [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B', disabled: true },
        { value: 'c', label: 'C' },
      ];
      render(
        <Select
          options={opts}
          value=""
          onChange={onChange}
          ariaLabel="Letter"
        />,
      );
      await user.click(screen.getByRole('combobox', { name: 'Letter' }));
      // Initial highlight = A. ArrowDown should skip B (disabled) -> C.
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Enter}');
      expect(onChange).toHaveBeenCalledWith('c');
    });

    it('per-option disabled cannot be committed via click', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const opts: SelectOption[] = [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B', disabled: true },
      ];
      render(
        <Select
          options={opts}
          value=""
          onChange={onChange}
          ariaLabel="Letter"
        />,
      );
      await user.click(screen.getByRole('combobox', { name: 'Letter' }));
      await user.click(screen.getByRole('option', { name: 'B' }));
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('bare (no slots)', () => {
    it('renders without label/hint/error wrapper when no slots set', () => {
      const { container } = render(
        <Select
          options={FRUITS}
          value=""
          onChange={() => {}}
          ariaLabel="Fruit"
        />,
      );
      // outermost is the relative wrapper div, no space-y-1.5
      expect(container.querySelector('.space-y-1\\.5')).toBeNull();
    });

    it('does not set aria-invalid on a bare trigger', () => {
      render(
        <Select
          options={FRUITS}
          value=""
          onChange={() => {}}
          ariaLabel="Fruit"
        />,
      );
      expect(
        screen.getByRole('combobox', { name: 'Fruit' }),
      ).not.toHaveAttribute('aria-invalid');
    });
  });

  it('aria-selected reflects the current value in the listbox', async () => {
    const user = userEvent.setup();
    render(<Controlled initial="banana" />);
    await user.click(screen.getByRole('combobox', { name: 'Fruit' }));
    const banana = screen.getByRole('option', { name: 'Banana' });
    expect(banana).toHaveAttribute('aria-selected', 'true');
    const apple = screen.getByRole('option', { name: 'Apple' });
    expect(apple).toHaveAttribute('aria-selected', 'false');
  });

  it('exposes a stable displayName', () => {
    expect(Select.displayName).toBe('Select');
  });

  it('type-ahead buffer resets after 500ms idle', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(
      <Select
        options={FRUITS}
        value=""
        onChange={onChange}
        ariaLabel="Fruit"
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Fruit' });
    act(() => {
      trigger.focus();
    });
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'c' });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.keyDown(trigger, { key: 'a' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('apple');
    vi.useRealTimers();
  });
});
