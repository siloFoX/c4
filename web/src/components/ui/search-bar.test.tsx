import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchBar } from './search-bar';

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
});
