import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import WikiSearchControls from './WikiSearchControls';

// WikiSearchControls is a pure controlled-input strip — query
// Input, type select, includeStale checkbox, Search button. Parent
// owns all the state and the runSearch handler. Enter on the query
// input is the only "smart" behaviour we cover here. No hooks to
// stub: the type catalogue (TYPE_OPTIONS) is imported as a value
// from WikiView, but the component itself does not call any wiki
// hook.

function renderControls(
  overrides: Partial<Parameters<typeof WikiSearchControls>[0]> = {},
) {
  const props = {
    query: '',
    onQuery: vi.fn(),
    type: 'any',
    onType: vi.fn(),
    includeStale: false,
    onIncludeStale: vi.fn(),
    searching: false,
    onSearch: vi.fn(),
    ...overrides,
  };
  const utils = render(<WikiSearchControls {...props} />);
  return { ...utils, props };
}

beforeEach(() => {
  setLocale('en');
});

describe('<WikiSearchControls>', () => {
  it('renders the query input with the i18n accessible name', () => {
    renderControls();
    expect(
      screen.getByRole('textbox', { name: 'Wiki search query' }),
    ).toBeInTheDocument();
  });

  it('renders the query input with the i18n placeholder', () => {
    renderControls();
    expect(
      screen.getByPlaceholderText('Search keywords (e.g. auth, schema)'),
    ).toBeInTheDocument();
  });

  it('reflects the current query prop as the input value', () => {
    renderControls({ query: 'auth' });
    const input = screen.getByRole('textbox', {
      name: 'Wiki search query',
    }) as HTMLInputElement;
    expect(input.value).toBe('auth');
  });

  it('fires onQuery on every character typed into the query input', async () => {
    const user = userEvent.setup();
    const onQuery = vi.fn();
    renderControls({ onQuery });
    await user.type(
      screen.getByRole('textbox', { name: 'Wiki search query' }),
      'ab',
    );
    expect(onQuery).toHaveBeenCalledTimes(2);
    expect(onQuery).toHaveBeenNthCalledWith(1, 'a');
    expect(onQuery).toHaveBeenNthCalledWith(2, 'b');
  });

  it('fires onSearch when Enter is pressed inside the query input', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    renderControls({ onSearch });
    await user.click(
      screen.getByRole('textbox', { name: 'Wiki search query' }),
    );
    await user.keyboard('{Enter}');
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('does not fire onSearch when a non-Enter key is pressed', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    renderControls({ onSearch });
    await user.click(
      screen.getByRole('textbox', { name: 'Wiki search query' }),
    );
    await user.keyboard('{Escape}');
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('does not submit a form when Enter is pressed in the query input', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();
    render(
      <form onSubmit={handleSubmit}>
        <WikiSearchControls
          query=""
          onQuery={vi.fn()}
          type="any"
          onType={vi.fn()}
          includeStale={false}
          onIncludeStale={vi.fn()}
          searching={false}
          onSearch={vi.fn()}
        />
      </form>,
    );
    await user.click(
      screen.getByRole('textbox', { name: 'Wiki search query' }),
    );
    await user.keyboard('{Enter}');
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('disables the query input while searching=true', () => {
    renderControls({ searching: true });
    expect(
      screen.getByRole('textbox', { name: 'Wiki search query' }),
    ).toBeDisabled();
  });

  it('renders the type select with the i18n accessible name', () => {
    renderControls();
    expect(
      screen.getByRole('combobox', { name: 'Wiki type filter' }),
    ).toBeInTheDocument();
  });

  it('renders the "type:" label text from the i18n bundle', () => {
    renderControls();
    expect(screen.getByText('type:')).toBeInTheDocument();
  });

  it('renders all type options on the type select', () => {
    renderControls();
    const select = screen.getByRole('combobox', {
      name: 'Wiki type filter',
    }) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual([
      'any',
      'meeting',
      'adr',
      'retro',
      'specialist',
      'docs',
    ]);
  });

  it('reflects the current type prop as the selected option', () => {
    renderControls({ type: 'meeting' });
    const select = screen.getByRole('combobox', {
      name: 'Wiki type filter',
    }) as HTMLSelectElement;
    expect(select.value).toBe('meeting');
  });

  it('fires onType with the chosen value when a different type is picked', async () => {
    const user = userEvent.setup();
    const onType = vi.fn();
    renderControls({ onType });
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Wiki type filter' }),
      'adr',
    );
    expect(onType).toHaveBeenCalledTimes(1);
    expect(onType).toHaveBeenCalledWith('adr');
  });

  it('disables the type select while searching=true', () => {
    renderControls({ searching: true });
    expect(
      screen.getByRole('combobox', { name: 'Wiki type filter' }),
    ).toBeDisabled();
  });

  it('renders the includeStale checkbox with its accessible label', () => {
    renderControls();
    expect(
      screen.getByRole('checkbox', { name: 'Include superseded / reopened' }),
    ).toBeInTheDocument();
  });

  it('renders the "include stale" caption text', () => {
    renderControls();
    expect(screen.getByText('include stale')).toBeInTheDocument();
  });

  it('reflects the current includeStale prop on the checkbox', () => {
    renderControls({ includeStale: true });
    expect(
      screen.getByRole('checkbox', { name: 'Include superseded / reopened' }),
    ).toBeChecked();
  });

  it('fires onIncludeStale(true) when the checkbox is clicked off→on', async () => {
    const user = userEvent.setup();
    const onIncludeStale = vi.fn();
    renderControls({ includeStale: false, onIncludeStale });
    await user.click(
      screen.getByRole('checkbox', { name: 'Include superseded / reopened' }),
    );
    expect(onIncludeStale).toHaveBeenCalledWith(true);
  });

  it('fires onIncludeStale(false) when the checkbox is clicked on→off', async () => {
    const user = userEvent.setup();
    const onIncludeStale = vi.fn();
    renderControls({ includeStale: true, onIncludeStale });
    await user.click(
      screen.getByRole('checkbox', { name: 'Include superseded / reopened' }),
    );
    expect(onIncludeStale).toHaveBeenCalledWith(false);
  });

  it('disables the includeStale checkbox while searching=true', () => {
    renderControls({ searching: true });
    expect(
      screen.getByRole('checkbox', { name: 'Include superseded / reopened' }),
    ).toBeDisabled();
  });

  it('renders the search button with its accessible label', () => {
    renderControls();
    expect(
      screen.getByRole('button', { name: 'Run wiki search' }),
    ).toBeInTheDocument();
  });

  it('renders the search button caption "Search"', () => {
    renderControls();
    expect(screen.getByText('Search')).toBeInTheDocument();
  });

  it('fires onSearch when the search button is clicked', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    renderControls({ onSearch });
    await user.click(screen.getByRole('button', { name: 'Run wiki search' }));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('disables the search button while searching=true', () => {
    renderControls({ searching: true });
    expect(
      screen.getByRole('button', { name: 'Run wiki search' }),
    ).toBeDisabled();
  });

  it('animates the search icon while searching=true', () => {
    const { container } = renderControls({ searching: true });
    expect(container.querySelector('svg.animate-spin')).not.toBeNull();
  });

  it('does not animate the search icon while searching=false', () => {
    const { container } = renderControls({ searching: false });
    expect(container.querySelector('svg.animate-spin')).toBeNull();
  });

  it('does not fire onSearch when only the query changes', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    renderControls({ onSearch });
    await user.type(
      screen.getByRole('textbox', { name: 'Wiki search query' }),
      'foo',
    );
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('does not fire any callback on initial render', () => {
    const onQuery = vi.fn();
    const onType = vi.fn();
    const onIncludeStale = vi.fn();
    const onSearch = vi.fn();
    renderControls({ onQuery, onType, onIncludeStale, onSearch });
    expect(onQuery).not.toHaveBeenCalled();
    expect(onType).not.toHaveBeenCalled();
    expect(onIncludeStale).not.toHaveBeenCalled();
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('rerendering with identical props does not duplicate onSearch on button click', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    const props = {
      query: '',
      onQuery: vi.fn(),
      type: 'any',
      onType: vi.fn(),
      includeStale: false,
      onIncludeStale: vi.fn(),
      searching: false,
      onSearch,
    };
    const { rerender } = render(<WikiSearchControls {...props} />);
    rerender(<WikiSearchControls {...props} />);
    await user.click(screen.getByRole('button', { name: 'Run wiki search' }));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('re-renders translated copy when the locale flips to ko', () => {
    renderControls();
    expect(screen.getByText('Search')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Search')).not.toBeInTheDocument();
  });
});
