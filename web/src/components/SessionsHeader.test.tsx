import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';

// SessionsHeader is a pure controlled component. Parent owns the
// query string, the totalFiltered / total counts, the loading flag
// (which doubles as the refresh-button disabled flag + loading
// label), and the three action callbacks (onNewChat, onAttachNew,
// onRefresh). The only piece of internal state is useLocale (i18n
// subscription) which we exercise via setLocale('ko') + act().
// Everything else is driven by direct prop permutations.

import SessionsHeader from './SessionsHeader';

beforeEach(() => {
  setLocale('en');
});

function renderHeader(
  overrides: Partial<Parameters<typeof SessionsHeader>[0]> = {},
) {
  const onQuery = vi.fn();
  const onNewChat = vi.fn();
  const onAttachNew = vi.fn();
  const onRefresh = vi.fn();
  const props = {
    query: '',
    onQuery,
    totalFiltered: 0,
    total: 0,
    loading: false,
    onNewChat,
    onAttachNew,
    onRefresh,
    ...overrides,
  };
  const utils = render(<SessionsHeader {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onQuery, onNewChat, onAttachNew, onRefresh, props };
}

describe('<SessionsHeader>', () => {
  // ---- title ------------------------------------------------------

  it('renders the panel title from the i18n bundle', () => {
    renderHeader();
    expect(screen.getByText('Sessions')).toBeInTheDocument();
  });

  it('renders the FolderTree title icon as aria-hidden so it does not steal the heading name', () => {
    const { container } = renderHeader();
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
    // The title icon is the first svg in document order.
    expect(svgs[0]).toHaveAttribute('aria-hidden', 'true');
  });

  // ---- search input ----------------------------------------------

  it('renders the search input with its i18n aria-label', () => {
    renderHeader();
    expect(
      screen.getByRole('textbox', { name: 'Search sessions' }),
    ).toBeInTheDocument();
  });

  it('renders the search input with the i18n placeholder', () => {
    renderHeader();
    expect(
      screen.getByPlaceholderText('Search project / snippet'),
    ).toBeInTheDocument();
  });

  it('reflects the controlled query value on the input element', () => {
    renderHeader({ query: 'abc' });
    const input = screen.getByRole('textbox', {
      name: 'Search sessions',
    }) as HTMLInputElement;
    expect(input.value).toBe('abc');
  });

  it('renders an empty controlled query value as empty string on the input', () => {
    renderHeader({ query: '' });
    const input = screen.getByRole('textbox', {
      name: 'Search sessions',
    }) as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('renders the search-icon overlay as aria-hidden inside the input wrapper', () => {
    const { container } = renderHeader();
    const svgs = container.querySelectorAll('svg');
    // FolderTree (title) + Search overlay + 2 Plus icons on action
    // buttons. The second svg in document order is the search icon.
    expect(svgs[1]).toHaveAttribute('aria-hidden', 'true');
  });

  it('fires onQuery with the new value when the search input receives a keystroke', async () => {
    const { user, onQuery } = renderHeader({ query: '' });
    const input = screen.getByRole('textbox', { name: 'Search sessions' });
    await user.type(input, 'x');
    expect(onQuery).toHaveBeenCalledTimes(1);
    expect(onQuery).toHaveBeenCalledWith('x');
  });

  it('fires onQuery once per character typed (no internal buffering)', async () => {
    const { user, onQuery } = renderHeader({ query: '' });
    const input = screen.getByRole('textbox', { name: 'Search sessions' });
    await user.type(input, 'abc');
    expect(onQuery).toHaveBeenCalledTimes(3);
  });

  it('does NOT mutate the controlled value internally (parent owns the state)', async () => {
    const { user } = renderHeader({ query: 'pinned' });
    const input = screen.getByRole('textbox', {
      name: 'Search sessions',
    }) as HTMLInputElement;
    await user.type(input, 'X');
    // No state update from parent -> value stays 'pinned' since the
    // input is fully controlled.
    expect(input.value).toBe('pinned');
  });

  // ---- count display ---------------------------------------------

  it('renders the totalFiltered/total count pair', () => {
    renderHeader({ totalFiltered: 3, total: 17 });
    expect(screen.getByText('3/17')).toBeInTheDocument();
  });

  it('renders zero/zero when there are no sessions at all', () => {
    renderHeader({ totalFiltered: 0, total: 0 });
    expect(screen.getByText('0/0')).toBeInTheDocument();
  });

  it('renders matching-filter counts (n/n) when every session passes the filter', () => {
    renderHeader({ totalFiltered: 5, total: 5 });
    expect(screen.getByText('5/5')).toBeInTheDocument();
  });

  // ---- action buttons (rendering) --------------------------------

  it('renders exactly three action buttons in the footer row', () => {
    renderHeader();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('renders the New Chat button with the i18n label', () => {
    renderHeader();
    expect(
      screen.getByRole('button', { name: /New Chat/ }),
    ).toBeInTheDocument();
  });

  it('renders the Attach new button with the i18n label (ellipsis suffix)', () => {
    renderHeader();
    expect(
      screen.getByRole('button', { name: /Attach new\.\.\./ }),
    ).toBeInTheDocument();
  });

  it('renders the Refresh button with the idle label when loading=false', () => {
    renderHeader({ loading: false });
    expect(
      screen.getByRole('button', { name: 'Refresh' }),
    ).toBeInTheDocument();
  });

  it('renders the Refresh button with the loading label when loading=true', () => {
    renderHeader({ loading: true });
    expect(
      screen.getByRole('button', { name: `Loading\u2026` }),
    ).toBeInTheDocument();
  });

  // ---- action buttons (state + class) ----------------------------

  it('does NOT disable the Refresh button when loading=false', () => {
    renderHeader({ loading: false });
    expect(screen.getByRole('button', { name: 'Refresh' })).not.toBeDisabled();
  });

  it('disables the Refresh button when loading=true', () => {
    renderHeader({ loading: true });
    expect(
      screen.getByRole('button', { name: `Loading\u2026` }),
    ).toBeDisabled();
  });

  it('does NOT disable the New Chat button when loading=true', () => {
    renderHeader({ loading: true });
    expect(
      screen.getByRole('button', { name: /New Chat/ }),
    ).not.toBeDisabled();
  });

  it('does NOT disable the Attach new button when loading=true', () => {
    renderHeader({ loading: true });
    expect(
      screen.getByRole('button', { name: /Attach new/ }),
    ).not.toBeDisabled();
  });

  // ---- callback wiring -------------------------------------------

  it('fires onNewChat once when the New Chat button is clicked', async () => {
    const { user, onNewChat } = renderHeader();
    await user.click(screen.getByRole('button', { name: /New Chat/ }));
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it('fires onAttachNew once when the Attach new button is clicked', async () => {
    const { user, onAttachNew } = renderHeader();
    await user.click(screen.getByRole('button', { name: /Attach new/ }));
    expect(onAttachNew).toHaveBeenCalledTimes(1);
  });

  it('fires onRefresh once when the Refresh button is clicked', async () => {
    const { user, onRefresh } = renderHeader();
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onRefresh when the Refresh button is clicked while loading', async () => {
    const { user, onRefresh } = renderHeader({ loading: true });
    await user.click(screen.getByRole('button', { name: `Loading\u2026` }));
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('does NOT cross-fire onNewChat when the Attach new button is clicked', async () => {
    const { user, onNewChat, onAttachNew } = renderHeader();
    await user.click(screen.getByRole('button', { name: /Attach new/ }));
    expect(onAttachNew).toHaveBeenCalledTimes(1);
    expect(onNewChat).not.toHaveBeenCalled();
  });

  it('does NOT cross-fire onAttachNew when the New Chat button is clicked', async () => {
    const { user, onNewChat, onAttachNew } = renderHeader();
    await user.click(screen.getByRole('button', { name: /New Chat/ }));
    expect(onNewChat).toHaveBeenCalledTimes(1);
    expect(onAttachNew).not.toHaveBeenCalled();
  });

  it('does NOT fire onRefresh when the New Chat button is clicked', async () => {
    const { user, onNewChat, onRefresh } = renderHeader();
    await user.click(screen.getByRole('button', { name: /New Chat/ }));
    expect(onNewChat).toHaveBeenCalledTimes(1);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  // ---- keyboard activation ---------------------------------------

  it('fires onNewChat on Enter activation when the New Chat button is focused', async () => {
    const { user, onNewChat } = renderHeader();
    const btn = screen.getByRole('button', { name: /New Chat/ });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it('fires onAttachNew on Space activation when the Attach new button is focused', async () => {
    const { user, onAttachNew } = renderHeader();
    const btn = screen.getByRole('button', { name: /Attach new/ });
    btn.focus();
    await user.keyboard(' ');
    expect(onAttachNew).toHaveBeenCalledTimes(1);
  });

  it('fires onRefresh on Enter activation when the Refresh button is focused', async () => {
    const { user, onRefresh } = renderHeader();
    const btn = screen.getByRole('button', { name: 'Refresh' });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  // ---- rerender stability ----------------------------------------

  it('rerendering with the same props does not duplicate the title', () => {
    const { rerender, props } = renderHeader();
    rerender(<SessionsHeader {...props} />);
    expect(screen.getAllByText('Sessions')).toHaveLength(1);
  });

  it('rerendering with a new query value updates the input element', () => {
    const { rerender, props } = renderHeader({ query: 'one' });
    const input = screen.getByRole('textbox', {
      name: 'Search sessions',
    }) as HTMLInputElement;
    expect(input.value).toBe('one');
    rerender(<SessionsHeader {...props} query="two" />);
    expect(input.value).toBe('two');
  });

  it('flips the Refresh button label and disabled state on a loading rerender', () => {
    const { rerender, props } = renderHeader({ loading: false });
    expect(
      screen.getByRole('button', { name: 'Refresh' }),
    ).not.toBeDisabled();
    rerender(<SessionsHeader {...props} loading={true} />);
    const loadingBtn = screen.getByRole('button', {
      name: `Loading\u2026`,
    });
    expect(loadingBtn).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
  });

  // ---- locale flip ------------------------------------------------

  it('re-renders the panel title in Korean when the locale flips', () => {
    renderHeader();
    expect(screen.getByText('Sessions')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Sessions')).not.toBeInTheDocument();
  });

  it('re-renders the search-input placeholder in Korean when the locale flips', () => {
    renderHeader();
    expect(
      screen.getByPlaceholderText('Search project / snippet'),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByPlaceholderText('Search project / snippet'),
    ).not.toBeInTheDocument();
  });

  it('re-renders the search-input aria-label in Korean when the locale flips', () => {
    renderHeader();
    expect(
      screen.getByRole('textbox', { name: 'Search sessions' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('textbox', { name: 'Search sessions' }),
    ).not.toBeInTheDocument();
  });

  it('re-renders the New Chat button label in Korean when the locale flips', () => {
    renderHeader();
    expect(
      screen.getByRole('button', { name: /New Chat/ }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: /New Chat/ }),
    ).not.toBeInTheDocument();
  });

  it('re-renders the Refresh button label in Korean when the locale flips', () => {
    renderHeader({ loading: false });
    expect(
      screen.getByRole('button', { name: 'Refresh' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: 'Refresh' }),
    ).not.toBeInTheDocument();
  });
});
