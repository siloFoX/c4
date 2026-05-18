import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { createRef } from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Combobox,
  selectOptionsToComboboxOptions,
  type ComboboxOption,
} from './combobox';

type Choice = 'apple' | 'banana' | 'cherry' | 'date';
const CHOICES: ComboboxOption<Choice>[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana', hint: 'fruit' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'date', label: 'Date', disabled: true },
];

function Controlled({
  initial,
  ...rest
}: {
  initial?: Choice | null;
  allowFreeText?: boolean;
  loading?: boolean;
  onQueryChange?: (q: string) => void;
  disabled?: boolean;
  options?: ComboboxOption<Choice>[];
  clearable?: boolean;
}) {
  const [value, setValue] = useState<Choice | null>(initial ?? null);
  return (
    <Combobox<Choice>
      options={rest.options ?? CHOICES}
      value={value}
      onChange={(next) => setValue(next)}
      ariaLabel="Pick a fruit"
      placeholder="Pick a fruit"
      {...(rest.allowFreeText ? { allowFreeText: true } : {})}
      {...(rest.loading != null ? { loading: rest.loading } : {})}
      {...(rest.onQueryChange ? { onQueryChange: rest.onQueryChange } : {})}
      {...(rest.disabled ? { disabled: true } : {})}
      {...(rest.clearable === false ? { clearable: false } : {})}
    />
  );
}

describe('<Combobox>', () => {
  it('renders a role=combobox input with aria-autocomplete=list', () => {
    render(<Controlled />);
    const input = screen.getByRole('combobox', { name: 'Pick a fruit' });
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('exposes data-section + data-size + data-open on the wrapper', () => {
    const { container } = render(<Controlled />);
    const root = container.querySelector('[data-section="combobox"]');
    expect(root).not.toBeNull();
    expect(root!.getAttribute('data-size')).toBe('md');
    expect(root!.getAttribute('data-open')).toBe('false');
  });

  it('opens the listbox when the toggle button is clicked', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(screen.getByRole('button', { name: 'Open options' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('opens the listbox when the input gains focus', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByRole('combobox', { name: 'Pick a fruit' });
    await user.click(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('renders one role=option per filtered choice', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(screen.getByRole('button', { name: 'Open options' }));
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('typing filters the list by label / value substring (case-insensitive)', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByRole('combobox', { name: 'Pick a fruit' });
    await user.click(input);
    await user.type(input, 'an');
    // "Banana" matches; others do not.
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]!.textContent).toContain('Banana');
  });

  it('clicking an option fires onChange + closes the listbox', async () => {
    const user = userEvent.setup();
    const { container } = render(<Controlled />);
    await user.click(screen.getByRole('button', { name: 'Open options' }));
    await user.click(screen.getByRole('option', { name: /Cherry/i }));
    expect(
      container
        .querySelector('[data-section="combobox"]')!
        .getAttribute('data-open'),
    ).toBe('false');
    // After commit, the input reflects the selection label.
    expect(
      (screen.getByRole('combobox') as HTMLInputElement).value,
    ).toBe('Cherry');
  });

  it('the selected option carries aria-selected=true + data-combobox-option-selected=true', async () => {
    const user = userEvent.setup();
    render(<Controlled initial="banana" />);
    await user.click(screen.getByRole('button', { name: 'Open options' }));
    const banana = screen.getByRole('option', { name: /Banana/i });
    expect(banana.getAttribute('aria-selected')).toBe('true');
    expect(banana.getAttribute('data-combobox-option-selected')).toBe('true');
  });

  it('ArrowDown moves the active row through the listbox', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByRole('combobox', { name: 'Pick a fruit' });
    await user.click(input);
    await user.keyboard('{ArrowDown}');
    // After the first ArrowDown the active option flips; the
    // auto-init had it on apple (index 0), so ArrowDown moves
    // to banana.
    const banana = screen.getByRole('option', { name: /Banana/i });
    expect(banana.getAttribute('data-combobox-option-active')).toBe('true');
  });

  it('ArrowDown skips disabled options', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByRole('combobox', { name: 'Pick a fruit' });
    await user.click(input);
    // Navigate apple -> banana -> cherry -> (skip date / disabled) -> apple
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    const apple = screen.getByRole('option', { name: /Apple/i });
    expect(apple.getAttribute('data-combobox-option-active')).toBe('true');
  });

  it('Enter on the active row commits the selection', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByRole('combobox', { name: 'Pick a fruit' });
    await user.click(input);
    await user.keyboard('{ArrowDown}{Enter}');
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe(
      'Banana',
    );
  });

  it('Escape closes the listbox without committing', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByRole('combobox', { name: 'Pick a fruit' });
    await user.click(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });

  it('renders the no-options content when the filter excludes every option', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByRole('combobox', { name: 'Pick a fruit' });
    await user.click(input);
    await user.type(input, 'zzz');
    expect(screen.getByText('No matches.')).toBeInTheDocument();
  });

  it('allowFreeText: Enter commits whatever the operator typed when no option matches', async () => {
    const user = userEvent.setup();
    render(<Controlled allowFreeText />);
    const input = screen.getByRole('combobox', { name: 'Pick a fruit' });
    await user.click(input);
    await user.type(input, 'kiwi');
    // No matching option exists, so no active option to commit; Enter
    // falls back to the free-text path.
    await user.keyboard('{Enter}');
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe(
      'kiwi',
    );
  });

  it('non-free-text Enter does NOT commit when no option matches (listbox stays open)', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByRole('combobox', { name: 'Pick a fruit' });
    await user.click(input);
    await user.type(input, 'zzz{Enter}');
    // Listbox stays open (Enter without a match is a no-op);
    // the no-options message remains visible. Crucially the
    // controlled value never commits, so the parent's `value`
    // stays null and the chevron button stays in its "open"
    // form.
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('No matches.')).toBeInTheDocument();
  });

  it('onQueryChange fires on every input keystroke (async loader hook)', async () => {
    const onQ = vi.fn();
    const user = userEvent.setup();
    render(<Controlled onQueryChange={onQ} />);
    const input = screen.getByRole('combobox', { name: 'Pick a fruit' });
    await user.click(input);
    await user.type(input, 'ab');
    expect(onQ).toHaveBeenCalledTimes(2);
    expect(onQ).toHaveBeenLastCalledWith('ab');
  });

  it('loading=true renders the Loading state + spinning chevron icon', async () => {
    const user = userEvent.setup();
    const { container } = render(<Controlled loading />);
    // Loading icon flips the chevron to a Loader2 spinner -- it
    // is the only svg with animate-spin in the trigger.
    expect(container.querySelector('svg.animate-spin')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open options' }));
    expect(
      container.querySelector('[data-combobox-loading="true"]'),
    ).not.toBeNull();
  });

  it('clearable: clear button removes the selection + focuses the input', async () => {
    const user = userEvent.setup();
    render(<Controlled initial="apple" />);
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('');
  });

  it('clearable=false suppresses the clear button entirely', () => {
    render(<Controlled initial="apple" clearable={false} />);
    expect(
      screen.queryByRole('button', { name: 'Clear selection' }),
    ).toBeNull();
  });

  it('disabled hides the listbox even on click + disables the toggle', async () => {
    const user = userEvent.setup();
    render(<Controlled disabled />);
    const input = screen.getByRole('combobox', { name: 'Pick a fruit' });
    await user.click(input);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open options' })).toBeDisabled();
  });

  it('disabled option does not respond to mouseDown commit', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(screen.getByRole('button', { name: 'Open options' }));
    const dateOpt = screen.getByRole('option', { name: /Date/i });
    expect(dateOpt.getAttribute('aria-disabled')).toBe('true');
    await user.click(dateOpt);
    // Listbox stays open; nothing selected.
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('per-option data-combobox-option=<value> + active flag attrs land on every row', async () => {
    const user = userEvent.setup();
    const { container } = render(<Controlled />);
    await user.click(screen.getByRole('button', { name: 'Open options' }));
    for (const v of ['apple', 'banana', 'cherry', 'date']) {
      const node = container.querySelector(`[data-combobox-option="${v}"]`);
      expect(node).not.toBeNull();
      expect(node!.getAttribute('data-combobox-option-active')).toBeTruthy();
    }
  });

  it('aria-activedescendant points to the currently active option', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByRole('combobox', { name: 'Pick a fruit' });
    await user.click(input);
    await user.keyboard('{ArrowDown}');
    expect(input.getAttribute('aria-activedescendant')).toContain('banana');
  });

  it('click-outside closes the listbox', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Controlled />
        <button data-testid="outside" type="button">
          outside
        </button>
      </div>,
    );
    const input = screen.getByRole('combobox', { name: 'Pick a fruit' });
    await user.click(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.click(screen.getByTestId('outside'));
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });

  it('merges caller className with the wrapper', () => {
    const { container } = render(<Combobox<Choice> options={CHOICES} value={null} onChange={() => {}} className="custom-cb" />);
    const root = container.querySelector('[data-section="combobox"]');
    expect(root!.className).toContain('custom-cb');
  });

  it('forwards a ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <Combobox<Choice>
        options={CHOICES}
        value={null}
        onChange={() => {}}
        ref={ref}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('hint text renders inside the option row when provided', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(screen.getByRole('button', { name: 'Open options' }));
    // banana has hint="fruit"; should render alongside the label.
    expect(screen.getByText('fruit')).toBeInTheDocument();
  });

  // -- v1.11.389 debounceMs + Home/End + adapter (TODO 11.371) ----

  it('default debounceMs=0 fires onQueryChange synchronously per keystroke', async () => {
    const user = userEvent.setup();
    const onQueryChange = vi.fn();
    render(
      <Controlled onQueryChange={onQueryChange} />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'app');
    // Three keystrokes -> three callback invocations (one per
    // keypress).
    expect(onQueryChange).toHaveBeenCalledTimes(3);
    expect(onQueryChange).toHaveBeenLastCalledWith('app');
  });

  it('debounceMs>0 collapses bursts of keystrokes into a single trailing call', () => {
    vi.useFakeTimers();
    const onQueryChange = vi.fn();
    function Host() {
      const [value, setValue] = useState<Choice | null>(null);
      return (
        <Combobox<Choice>
          options={CHOICES}
          value={value}
          onChange={setValue}
          onQueryChange={onQueryChange}
          debounceMs={300}
          ariaLabel="Pick a fruit"
        />
      );
    }
    render(<Host />);
    const input = screen.getByRole('combobox');
    act(() => {
      input.focus();
    });
    // Three keystrokes inside the debounce window.
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'ap' } });
    fireEvent.change(input, { target: { value: 'app' } });
    expect(onQueryChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onQueryChange).toHaveBeenCalledTimes(1);
    expect(onQueryChange).toHaveBeenCalledWith('app');
    vi.useRealTimers();
  });

  it('debounceMs window resets on each new keystroke (trailing-only)', () => {
    vi.useFakeTimers();
    const onQueryChange = vi.fn();
    function Host() {
      const [value, setValue] = useState<Choice | null>(null);
      return (
        <Combobox<Choice>
          options={CHOICES}
          value={value}
          onChange={setValue}
          onQueryChange={onQueryChange}
          debounceMs={200}
          ariaLabel="Pick a fruit"
        />
      );
    }
    render(<Host />);
    const input = screen.getByRole('combobox');
    act(() => {
      input.focus();
    });
    fireEvent.change(input, { target: { value: 'a' } });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    fireEvent.change(input, { target: { value: 'ab' } });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    // Still inside debounce -> no fire yet.
    expect(onQueryChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(onQueryChange).toHaveBeenCalledTimes(1);
    expect(onQueryChange).toHaveBeenCalledWith('ab');
    vi.useRealTimers();
  });

  it('debounceMs does NOT delay the internal client-side filter (dropdown stays responsive)', async () => {
    const user = userEvent.setup();
    function Host() {
      const [value, setValue] = useState<Choice | null>(null);
      return (
        <Combobox<Choice>
          options={CHOICES}
          value={value}
          onChange={setValue}
          // No onQueryChange wired -> the internal filter
          // controls the visible options.
          debounceMs={500}
          ariaLabel="Pick a fruit"
        />
      );
    }
    render(<Host />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, 'ap');
    // "ap" filters to just "Apple". No need to wait 500ms; the
    // dropdown is responsive on the internal filter path.
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Apple');
  });

  it('Home jumps the highlight to the first enabled option', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    // After open, highlight defaults to first enabled = "apple".
    // Move down twice -> "cherry".
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Home}');
    await user.keyboard('{Enter}');
    // Enter commits the highlighted option; first enabled =
    // "apple".
    expect(input).toHaveValue('Apple');
  });

  it('End jumps the highlight to the last enabled option (skipping disabled)', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.keyboard('{End}');
    await user.keyboard('{Enter}');
    // CHOICES has [apple, banana, cherry, date(disabled)]. End
    // should pick "cherry", skipping the disabled "date".
    expect(input).toHaveValue('Cherry');
  });

  it('Home is a no-op when the dropdown is closed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Combobox<Choice>
        options={CHOICES}
        value={null}
        onChange={onChange}
        ariaLabel="Pick a fruit"
      />,
    );
    const input = screen.getByRole('combobox');
    input.focus();
    await user.keyboard('{Home}');
    expect(onChange).not.toHaveBeenCalled();
  });
});

// -- v1.11.389 selectOptionsToComboboxOptions (TODO 11.371) ------

describe('selectOptionsToComboboxOptions()', () => {
  it('maps value + label fields verbatim', () => {
    const out = selectOptionsToComboboxOptions([
      { value: 'a', label: 'Apple' },
      { value: 'b', label: 'Banana' },
    ]);
    expect(out).toEqual([
      { value: 'a', label: 'Apple' },
      { value: 'b', label: 'Banana' },
    ]);
  });

  it('forwards the disabled flag when set', () => {
    const out = selectOptionsToComboboxOptions([
      { value: 'a', label: 'Apple', disabled: true },
    ]);
    expect(out[0]!.disabled).toBe(true);
  });

  it('does NOT add a disabled key when the input lacks one', () => {
    const out = selectOptionsToComboboxOptions([
      { value: 'a', label: 'Apple' },
    ]);
    expect('disabled' in out[0]!).toBe(false);
  });

  it('returns a fresh array (caller can mutate without affecting the input)', () => {
    const input = [{ value: 'a' as const, label: 'A' }];
    const out = selectOptionsToComboboxOptions(input);
    expect(out).not.toBe(input);
  });

  it('preserves the type-parameter widening for V', () => {
    const out = selectOptionsToComboboxOptions<'red' | 'blue'>([
      { value: 'red', label: 'Red' },
      { value: 'blue', label: 'Blue' },
    ]);
    // TS check: out[0].value is 'red' | 'blue'.
    expect(out[0]!.value).toBe('red');
  });

  it('integrates with Combobox: the adapter output is a usable options array', async () => {
    const user = userEvent.setup();
    const options = selectOptionsToComboboxOptions<Choice>([
      { value: 'apple', label: 'Apple' },
      { value: 'banana', label: 'Banana' },
      { value: 'cherry', label: 'Cherry' },
    ]);
    function Host() {
      const [v, setV] = useState<Choice | null>(null);
      return (
        <Combobox<Choice>
          options={options}
          value={v}
          onChange={setV}
          ariaLabel="Adapted"
        />
      );
    }
    render(<Host />);
    await user.click(screen.getByRole('combobox', { name: 'Adapted' }));
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });
});
