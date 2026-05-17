import { describe, it, expect, vi } from 'vitest';
import { createRef, useState } from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchBar, type SearchBarSuggestion } from './search-bar';

describe('<SearchBar>', () => {
  it('renders a magnifying-glass icon inside role=search', () => {
    const { container } = render(<SearchBar />);
    const region = screen.getByRole('search');
    expect(region).toBeInTheDocument();
    // lucide-react Search renders <svg class="lucide-search ...">
    expect(container.querySelector('svg.lucide-search')).not.toBeNull();
  });

  it('renders the input with the supplied placeholder', () => {
    render(<SearchBar placeholder="Find things" />);
    expect(screen.getByPlaceholderText('Find things')).toBeInTheDocument();
  });

  it('uses input type="search"', () => {
    render(<SearchBar placeholder="x" />);
    expect(screen.getByPlaceholderText('x')).toHaveAttribute('type', 'search');
  });

  it('fires onChange on every keystroke', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SearchBar onChange={onChange} placeholder="q" />);
    await user.type(screen.getByPlaceholderText('q'), 'hi');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith('hi');
  });

  it('debounces onDebouncedChange and fires once after the delay', () => {
    vi.useFakeTimers();
    const onDebouncedChange = vi.fn();
    render(
      <SearchBar
        debounceMs={250}
        onDebouncedChange={onDebouncedChange}
        placeholder="q"
      />,
    );
    const input = screen.getByPlaceholderText('q') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'ab' } });
    fireEvent.change(input, { target: { value: 'abc' } });
    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(onDebouncedChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(onDebouncedChange).toHaveBeenCalledTimes(1);
    expect(onDebouncedChange).toHaveBeenLastCalledWith('abc');
    vi.useRealTimers();
  });

  it('shows a clear button when value is non-empty', () => {
    render(<SearchBar value="hello" onChange={() => {}} />);
    expect(
      screen.getByRole('button', { name: /clear search/i }),
    ).toBeInTheDocument();
  });

  it('hides the clear button when value is empty', () => {
    render(<SearchBar value="" onChange={() => {}} />);
    expect(
      screen.queryByRole('button', { name: /clear search/i }),
    ).toBeNull();
  });

  it('never shows a clear button when clearable=false', () => {
    render(<SearchBar value="hello" clearable={false} onChange={() => {}} />);
    expect(
      screen.queryByRole('button', { name: /clear search/i }),
    ).toBeNull();
  });

  it('clears the value and fires onClear when the clear button is clicked (uncontrolled)', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const onChange = vi.fn();
    render(
      <SearchBar
        defaultValue="seed"
        onChange={onChange}
        onClear={onClear}
        placeholder="q"
      />,
    );
    const input = screen.getByPlaceholderText('q') as HTMLInputElement;
    expect(input.value).toBe('seed');
    await user.click(screen.getByRole('button', { name: /clear search/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(input.value).toBe('');
  });

  it('does not internally clear when controlled - just calls onChange("") + onClear', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onClear = vi.fn();
    render(
      <SearchBar
        value="kept"
        onChange={onChange}
        onClear={onClear}
        placeholder="q"
      />,
    );
    await user.click(screen.getByRole('button', { name: /clear search/i }));
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(onClear).toHaveBeenCalledTimes(1);
    const input = screen.getByPlaceholderText('q') as HTMLInputElement;
    expect(input.value).toBe('kept');
  });

  it('disables the input and hides the clear button when disabled', () => {
    render(<SearchBar value="hello" disabled onChange={() => {}} placeholder="q" />);
    expect(screen.getByPlaceholderText('q')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: /clear search/i }),
    ).toBeNull();
  });

  it('forwards a ref to the underlying <input>', () => {
    const ref = createRef<HTMLInputElement>();
    render(<SearchBar ref={ref} placeholder="q" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('applies ariaLabel to the input', () => {
    render(<SearchBar ariaLabel="Site search" placeholder="q" />);
    expect(screen.getByPlaceholderText('q')).toHaveAttribute(
      'aria-label',
      'Site search',
    );
  });

  it('applies size=sm classes (h-8) and size=md (h-10) to the input', () => {
    const { rerender } = render(<SearchBar size="sm" placeholder="q" />);
    expect(screen.getByPlaceholderText('q')).toHaveClass('h-8');
    rerender(<SearchBar size="md" placeholder="q" />);
    expect(screen.getByPlaceholderText('q')).toHaveClass('h-10');
  });

  it('merges caller className onto the outer wrapper and inputClassName onto the input', () => {
    render(
      <SearchBar
        placeholder="q"
        className="outer-tag"
        inputClassName="input-tag"
      />,
    );
    const input = screen.getByPlaceholderText('q');
    expect(input).toHaveClass('input-tag');
    expect(input.parentElement).toHaveClass('outer-tag');
  });

  it('skips the initial debounced emit when defaultValue matches and no user input has occurred', () => {
    vi.useFakeTimers();
    const onDebouncedChange = vi.fn();
    render(
      <SearchBar
        defaultValue="seed"
        debounceMs={50}
        onDebouncedChange={onDebouncedChange}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onDebouncedChange).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('has a stable displayName', () => {
    expect(SearchBar.displayName).toBe('SearchBar');
  });

  // (v1.11.286, TODO 11.268) Autocomplete dropdown.

  function ControlledSuggestionsHarness({
    suggestions,
  }: {
    suggestions: SearchBarSuggestion[];
  }) {
    const [v, setV] = useState('');
    return (
      <SearchBar
        value={v}
        onChange={setV}
        suggestions={suggestions}
        placeholder="q"
        ariaLabel="search"
      />
    );
  }

  it('does NOT render the suggestions dropdown when the suggestions prop is omitted', () => {
    render(<SearchBar value="hello" onChange={() => {}} placeholder="q" />);
    expect(
      screen.queryByRole('listbox', { name: /search suggestions/i }),
    ).toBeNull();
  });

  it('does NOT render the suggestions dropdown when the input is empty', async () => {
    const user = userEvent.setup();
    render(
      <SearchBar
        value=""
        onChange={() => {}}
        suggestions={[{ id: '1', label: 'one', onSelect: vi.fn() }]}
        placeholder="q"
      />,
    );
    await user.click(screen.getByPlaceholderText('q'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('renders the suggestions dropdown when focused + non-empty value + suggestions non-empty', async () => {
    const user = userEvent.setup();
    render(
      <ControlledSuggestionsHarness
        suggestions={[
          { id: 'a', label: 'apple', onSelect: vi.fn() },
          { id: 'b', label: 'banana', onSelect: vi.fn() },
        ]}
      />,
    );
    const input = screen.getByPlaceholderText('q');
    await user.click(input);
    await user.type(input, 'a');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('input combobox role + aria-controls + aria-expanded wire up only when suggestions is set', async () => {
    const user = userEvent.setup();
    render(
      <ControlledSuggestionsHarness
        suggestions={[{ id: 'a', label: 'A', onSelect: vi.fn() }]}
      />,
    );
    const input = screen.getByPlaceholderText('q');
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    await user.type(input, 'a');
    await waitFor(() =>
      expect(input.getAttribute('aria-expanded')).toBe('true'),
    );
  });

  it('clicking a suggestion fires its onSelect handler', async () => {
    const onSelectB = vi.fn();
    const user = userEvent.setup();
    render(
      <ControlledSuggestionsHarness
        suggestions={[
          { id: 'a', label: 'apple', onSelect: vi.fn() },
          { id: 'b', label: 'banana', onSelect: onSelectB },
        ]}
      />,
    );
    const input = screen.getByPlaceholderText('q');
    await user.type(input, 'b');
    await user.click(screen.getByRole('option', { name: /banana/i }));
    expect(onSelectB).toHaveBeenCalledTimes(1);
  });

  it('ArrowDown moves the active row; aria-selected flips onto the new row', async () => {
    const user = userEvent.setup();
    render(
      <ControlledSuggestionsHarness
        suggestions={[
          { id: 'a', label: 'apple', onSelect: vi.fn() },
          { id: 'b', label: 'banana', onSelect: vi.fn() },
        ]}
      />,
    );
    const input = screen.getByPlaceholderText('q');
    await user.type(input, 'a');
    // First option auto-active.
    const first = screen.getByRole('option', { name: /apple/i });
    expect(first.getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{ArrowDown}');
    const second = screen.getByRole('option', { name: /banana/i });
    expect(second.getAttribute('aria-selected')).toBe('true');
    expect(first.getAttribute('aria-selected')).toBe('false');
  });

  it('ArrowDown wraps from the last suggestion back to the first', async () => {
    const user = userEvent.setup();
    render(
      <ControlledSuggestionsHarness
        suggestions={[
          { id: 'a', label: 'apple', onSelect: vi.fn() },
          { id: 'b', label: 'banana', onSelect: vi.fn() },
        ]}
      />,
    );
    const input = screen.getByPlaceholderText('q');
    await user.type(input, 'a');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    expect(
      screen.getByRole('option', { name: /apple/i }).getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('ArrowUp moves to the previous suggestion (wraps from first to last)', async () => {
    const user = userEvent.setup();
    render(
      <ControlledSuggestionsHarness
        suggestions={[
          { id: 'a', label: 'apple', onSelect: vi.fn() },
          { id: 'b', label: 'banana', onSelect: vi.fn() },
        ]}
      />,
    );
    const input = screen.getByPlaceholderText('q');
    await user.type(input, 'a');
    await user.keyboard('{ArrowUp}');
    expect(
      screen.getByRole('option', { name: /banana/i }).getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('Enter commits the active suggestion', async () => {
    const onSelectA = vi.fn();
    const user = userEvent.setup();
    render(
      <ControlledSuggestionsHarness
        suggestions={[
          { id: 'a', label: 'apple', onSelect: onSelectA },
        ]}
      />,
    );
    const input = screen.getByPlaceholderText('q');
    await user.type(input, 'a');
    await user.keyboard('{Enter}');
    expect(onSelectA).toHaveBeenCalledTimes(1);
  });

  it('Escape closes the dropdown without selecting', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <ControlledSuggestionsHarness
        suggestions={[{ id: 'a', label: 'apple', onSelect }]}
      />,
    );
    const input = screen.getByPlaceholderText('q');
    await user.type(input, 'a');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('disabled suggestions are skipped during ArrowDown navigation', async () => {
    const user = userEvent.setup();
    render(
      <ControlledSuggestionsHarness
        suggestions={[
          { id: 'a', label: 'apple', onSelect: vi.fn() },
          { id: 'b', label: 'banana', disabled: true, onSelect: vi.fn() },
          { id: 'c', label: 'cherry', onSelect: vi.fn() },
        ]}
      />,
    );
    const input = screen.getByPlaceholderText('q');
    await user.type(input, 'a');
    await user.keyboard('{ArrowDown}');
    // Should skip 'banana' (disabled) and land on 'cherry'.
    expect(
      screen.getByRole('option', { name: /cherry/i }).getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('disabled suggestion does not fire onSelect when its mouseDown is dispatched', async () => {
    const onSelectDisabled = vi.fn();
    const user = userEvent.setup();
    render(
      <ControlledSuggestionsHarness
        suggestions={[
          { id: 'a', label: 'apple', onSelect: vi.fn() },
          {
            id: 'b',
            label: 'blocked',
            disabled: true,
            onSelect: onSelectDisabled,
          },
        ]}
      />,
    );
    const input = screen.getByPlaceholderText('q');
    await user.type(input, 'a');
    // Native disabled buttons should ignore the click. Confirm
    // that.
    const disabledRow = screen.getByRole('option', { name: /blocked/i });
    fireEvent.mouseDown(disabledRow);
    expect(onSelectDisabled).not.toHaveBeenCalled();
  });

  it('exposes data-search-suggestion=<id> on every row + data-search-suggestion-active on the active row', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ControlledSuggestionsHarness
        suggestions={[
          { id: 'first', label: '1st', onSelect: vi.fn() },
          { id: 'second', label: '2nd', onSelect: vi.fn() },
        ]}
      />,
    );
    const input = screen.getByPlaceholderText('q');
    await user.type(input, 'a');
    expect(
      container.querySelector('[data-search-suggestion="first"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-search-suggestion="second"]'),
    ).not.toBeNull();
    expect(
      container
        .querySelector('[data-search-suggestion="first"]')
        ?.getAttribute('data-search-suggestion-active'),
    ).toBe('true');
  });

  it('renders the noSuggestionsContent slot when suggestions is empty', async () => {
    const user = userEvent.setup();
    render(
      <SearchBar
        defaultValue=""
        suggestions={[]}
        noSuggestionsContent={
          <span data-testid="empty-hint">No matches</span>
        }
        placeholder="q"
      />,
    );
    const input = screen.getByPlaceholderText('q');
    await user.type(input, 'x');
    expect(screen.getByTestId('empty-hint')).toBeInTheDocument();
  });

  it('does NOT render the dropdown when suggestions is empty AND noSuggestionsContent is omitted', async () => {
    const user = userEvent.setup();
    render(
      <SearchBar
        defaultValue=""
        suggestions={[]}
        placeholder="q"
      />,
    );
    const input = screen.getByPlaceholderText('q');
    await user.type(input, 'x');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('controlled suggestionsOpen=true forces the dropdown open even when input is empty', () => {
    render(
      <SearchBar
        value=""
        onChange={() => {}}
        suggestions={[{ id: 'a', label: 'apple', onSelect: vi.fn() }]}
        suggestionsOpen
        placeholder="q"
      />,
    );
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('controlled suggestionsOpen=false hides the dropdown even with focus + value + suggestions', async () => {
    const user = userEvent.setup();
    render(
      <SearchBar
        defaultValue=""
        suggestions={[{ id: 'a', label: 'apple', onSelect: vi.fn() }]}
        suggestionsOpen={false}
        placeholder="q"
      />,
    );
    const input = screen.getByPlaceholderText('q');
    await user.type(input, 'a');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('exposes data-section="search-bar" on the root and "search-bar-suggestions" on the dropdown', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ControlledSuggestionsHarness
        suggestions={[{ id: 'a', label: 'apple', onSelect: vi.fn() }]}
      />,
    );
    expect(
      container.querySelector('[data-section="search-bar"]'),
    ).not.toBeNull();
    const input = screen.getByPlaceholderText('q');
    await user.type(input, 'a');
    expect(
      container.querySelector('[data-section="search-bar-suggestions"]'),
    ).not.toBeNull();
  });
});
