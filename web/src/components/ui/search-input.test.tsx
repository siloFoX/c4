import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  SearchInput,
  filterRecentSearches,
} from './search-input';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('filterRecentSearches', () => {
  it('returns [] for empty input', () => {
    expect(filterRecentSearches([], '', 5)).toEqual([]);
  });

  it('returns full list when query is empty', () => {
    expect(filterRecentSearches(['a', 'b', 'c'], '', 5)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('matches substring case-insensitively', () => {
    expect(
      filterRecentSearches(['Foo', 'bar', 'Baz'], 'b', 5),
    ).toEqual(['bar', 'Baz']);
  });

  it('caps the result at max', () => {
    expect(
      filterRecentSearches(['a1', 'a2', 'a3', 'a4'], 'a', 2),
    ).toEqual(['a1', 'a2']);
  });

  it('drops duplicate entries (first occurrence kept)', () => {
    expect(
      filterRecentSearches(['a', 'a', 'b'], '', 5),
    ).toEqual(['a', 'b']);
  });

  it('drops empty strings', () => {
    expect(
      filterRecentSearches(['', 'a', '   '], '', 5),
    ).toEqual(['a']);
  });

  it('trims query before matching', () => {
    expect(
      filterRecentSearches(['hello'], '  hel  ', 5),
    ).toEqual(['hello']);
  });
});

describe('SearchInput component', () => {
  it('renders a searchbox with default aria-label', () => {
    render(<SearchInput />);
    expect(screen.getByRole('searchbox')).toHaveAttribute(
      'aria-label',
      'Search',
    );
  });

  it('honors a custom ariaLabel', () => {
    render(<SearchInput ariaLabel="Find users" />);
    expect(screen.getByRole('searchbox')).toHaveAttribute(
      'aria-label',
      'Find users',
    );
  });

  it('renders the search icon', () => {
    const { container } = render(<SearchInput />);
    expect(
      container.querySelector('[data-section="search-input-icon"]'),
    ).toBeInTheDocument();
  });

  it('uses placeholder', () => {
    render(<SearchInput placeholder="Type here" />);
    expect(
      screen.getByPlaceholderText('Type here'),
    ).toBeInTheDocument();
  });

  it('uses defaultValue (uncontrolled)', () => {
    render(<SearchInput defaultValue="hello" />);
    expect(
      (screen.getByRole('searchbox') as HTMLInputElement).value,
    ).toBe('hello');
  });

  it('respects controlled value', () => {
    const { rerender } = render(<SearchInput value="alpha" />);
    expect(
      (screen.getByRole('searchbox') as HTMLInputElement).value,
    ).toBe('alpha');
    rerender(<SearchInput value="beta" />);
    expect(
      (screen.getByRole('searchbox') as HTMLInputElement).value,
    ).toBe('beta');
  });

  it('typing updates uncontrolled value immediately', () => {
    render(<SearchInput defaultValue="" debounceMs={0} />);
    const input = screen.getByRole('searchbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hi' } });
    expect(input.value).toBe('hi');
  });

  it('onChange fires immediately when debounceMs=0', () => {
    const onChange = vi.fn();
    render(<SearchInput onChange={onChange} debounceMs={0} />);
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'x' },
    });
    expect(onChange).toHaveBeenCalledWith('x');
  });

  it('onChange is debounced with debounceMs>0', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<SearchInput onChange={onChange} debounceMs={200} />);
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'a' },
    });
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'ab' },
    });
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'abc' },
    });
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(199);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('abc');
  });

  it('clear button only renders when value is non-empty', () => {
    const { rerender } = render(<SearchInput value="" />);
    expect(
      screen.queryByRole('button', { name: 'Clear search' }),
    ).toBeNull();
    rerender(<SearchInput value="hi" />);
    expect(
      screen.getByRole('button', { name: 'Clear search' }),
    ).toBeInTheDocument();
  });

  it('clear button click emits "" immediately + skips debounce', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(
      <SearchInput
        defaultValue="hello"
        onChange={onChange}
        debounceMs={500}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear search' }),
    );
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('clearLabel override', () => {
    render(
      <SearchInput
        defaultValue="x"
        clearLabel="Reset query"
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Reset query' }),
    ).toBeInTheDocument();
  });

  it('showClearButton=false hides the clear button', () => {
    render(
      <SearchInput defaultValue="x" showClearButton={false} />,
    );
    expect(
      screen.queryByRole('button', { name: 'Clear search' }),
    ).toBeNull();
  });

  it('shortcut renders when supplied + value is empty + not focused', () => {
    const { container } = render(
      <SearchInput shortcut="Cmd+K" />,
    );
    const kbd = container.querySelector(
      '[data-section="search-input-shortcut"]',
    );
    expect(kbd).toBeInTheDocument();
    expect(kbd?.textContent).toBe('Cmd+K');
  });

  it('shortcut hides when value is present', () => {
    const { container } = render(
      <SearchInput defaultValue="hi" shortcut="Cmd+K" />,
    );
    expect(
      container.querySelector(
        '[data-section="search-input-shortcut"]',
      ),
    ).toBeNull();
  });

  it('shortcut hides while focused', () => {
    const { container } = render(
      <SearchInput shortcut="Cmd+K" />,
    );
    fireEvent.focus(screen.getByRole('searchbox'));
    expect(
      container.querySelector(
        '[data-section="search-input-shortcut"]',
      ),
    ).toBeNull();
  });

  it('recent searches dropdown opens on focus', () => {
    render(
      <SearchInput recentSearches={['a', 'b', 'c']} />,
    );
    fireEvent.focus(screen.getByRole('searchbox'));
    expect(
      screen.getByRole('listbox', { name: 'Recent searches' }),
    ).toBeInTheDocument();
  });

  it('recent searches dropdown closed when no entries', () => {
    render(<SearchInput recentSearches={[]} />);
    fireEvent.focus(screen.getByRole('searchbox'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('clicking a recent entry fires onSelectRecent + onChange', () => {
    const onChange = vi.fn();
    const onSelectRecent = vi.fn();
    render(
      <SearchInput
        recentSearches={['alpha', 'beta']}
        onChange={onChange}
        onSelectRecent={onSelectRecent}
        debounceMs={0}
      />,
    );
    fireEvent.focus(screen.getByRole('searchbox'));
    fireEvent.click(
      screen.getByRole('option', { name: 'alpha' }),
    );
    expect(onSelectRecent).toHaveBeenCalledWith('alpha');
    expect(onChange).toHaveBeenCalledWith('alpha');
  });

  it('ArrowDown highlights first recent entry', () => {
    render(
      <SearchInput recentSearches={['alpha', 'beta']} />,
    );
    fireEvent.focus(screen.getByRole('searchbox'));
    fireEvent.keyDown(screen.getByRole('searchbox'), {
      key: 'ArrowDown',
    });
    const alpha = screen.getByRole('option', { name: 'alpha' });
    expect(alpha).toHaveAttribute('aria-selected', 'true');
  });

  it('ArrowDown wraps from last to first', () => {
    render(
      <SearchInput recentSearches={['alpha', 'beta']} />,
    );
    fireEvent.focus(screen.getByRole('searchbox'));
    fireEvent.keyDown(screen.getByRole('searchbox'), {
      key: 'ArrowDown',
    });
    fireEvent.keyDown(screen.getByRole('searchbox'), {
      key: 'ArrowDown',
    });
    fireEvent.keyDown(screen.getByRole('searchbox'), {
      key: 'ArrowDown',
    });
    const alpha = screen.getByRole('option', { name: 'alpha' });
    expect(alpha).toHaveAttribute('aria-selected', 'true');
  });

  it('ArrowUp wraps from first to last', () => {
    render(
      <SearchInput recentSearches={['alpha', 'beta']} />,
    );
    fireEvent.focus(screen.getByRole('searchbox'));
    fireEvent.keyDown(screen.getByRole('searchbox'), {
      key: 'ArrowUp',
    });
    const beta = screen.getByRole('option', { name: 'beta' });
    expect(beta).toHaveAttribute('aria-selected', 'true');
  });

  it('Enter on highlighted recent selects it', () => {
    const onSelectRecent = vi.fn();
    render(
      <SearchInput
        recentSearches={['alpha', 'beta']}
        onSelectRecent={onSelectRecent}
      />,
    );
    fireEvent.focus(screen.getByRole('searchbox'));
    fireEvent.keyDown(screen.getByRole('searchbox'), {
      key: 'ArrowDown',
    });
    fireEvent.keyDown(screen.getByRole('searchbox'), {
      key: 'Enter',
    });
    expect(onSelectRecent).toHaveBeenCalledWith('alpha');
  });

  it('Enter without highlight fires onSubmit', () => {
    const onSubmit = vi.fn();
    render(
      <SearchInput
        defaultValue="abc"
        onSubmit={onSubmit}
        debounceMs={0}
      />,
    );
    fireEvent.keyDown(screen.getByRole('searchbox'), {
      key: 'Enter',
    });
    expect(onSubmit).toHaveBeenCalledWith('abc');
  });

  it('Escape closes the recents dropdown', () => {
    render(
      <SearchInput recentSearches={['alpha']} />,
    );
    fireEvent.focus(screen.getByRole('searchbox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('searchbox'), {
      key: 'Escape',
    });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('recents filter against typed query', () => {
    render(
      <SearchInput
        defaultValue="al"
        recentSearches={['alpha', 'beta']}
        debounceMs={0}
      />,
    );
    fireEvent.focus(screen.getByRole('searchbox'));
    expect(screen.queryAllByRole('option')).toHaveLength(1);
    expect(
      screen.getByRole('option', { name: 'alpha' }),
    ).toBeInTheDocument();
  });

  it('maxRecent caps the dropdown size', () => {
    render(
      <SearchInput
        recentSearches={['a', 'b', 'c', 'd', 'e']}
        maxRecent={3}
      />,
    );
    fireEvent.focus(screen.getByRole('searchbox'));
    expect(screen.queryAllByRole('option')).toHaveLength(3);
  });

  it('disabled blocks input + hides clear button', () => {
    render(
      <SearchInput defaultValue="x" disabled />,
    );
    expect(screen.getByRole('searchbox')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Clear search' }),
    ).toBeNull();
  });

  it('readOnly marks input read-only + hides clear button', () => {
    render(<SearchInput defaultValue="x" readOnly />);
    expect(screen.getByRole('searchbox')).toHaveAttribute(
      'readonly',
    );
    expect(
      screen.queryByRole('button', { name: 'Clear search' }),
    ).toBeNull();
  });

  it('exposes data-has-value + data-focused on root', () => {
    const { container, rerender } = render(<SearchInput value="" />);
    const root = container.querySelector(
      '[data-section="search-input"]',
    );
    expect(root).toHaveAttribute('data-has-value', 'false');
    expect(root).toHaveAttribute('data-focused', 'false');
    rerender(<SearchInput value="x" />);
    const root2 = container.querySelector(
      '[data-section="search-input"]',
    );
    expect(root2).toHaveAttribute('data-has-value', 'true');
  });

  it('exposes data-disabled + data-read-only on root', () => {
    const { container } = render(
      <SearchInput disabled readOnly />,
    );
    const root = container.querySelector(
      '[data-section="search-input"]',
    );
    expect(root).toHaveAttribute('data-disabled', 'true');
    expect(root).toHaveAttribute('data-read-only', 'true');
  });

  it('exposes a stable displayName', () => {
    expect(SearchInput.displayName).toBe('SearchInput');
  });

  it('forwards refs to the input', () => {
    const ref = createRef<HTMLInputElement>();
    render(<SearchInput ref={ref} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('INPUT');
  });

  it('focus moves back to input after clear', () => {
    render(
      <SearchInput defaultValue="x" />,
    );
    const input = screen.getByRole('searchbox');
    const clearBtn = screen.getByRole('button', {
      name: 'Clear search',
    });
    fireEvent.click(clearBtn);
    expect(document.activeElement).toBe(input);
  });
});
