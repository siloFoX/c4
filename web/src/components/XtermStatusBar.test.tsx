import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import XtermStatusBar from './XtermStatusBar';

// XtermStatusBar is a pure controlled fragment that renders two
// pieces in sequence: the status row (status label text + a
// "Search" toggle button) and, when searchOpen=true, a search
// panel beneath it (text input + close button). All state lives
// in the parent (XtermView); the bar only forwards callbacks.
// Tests drive every prop branch + locale flip directly, with
// vi.fn() callbacks and DOM assertions -- no real terminal
// involved.

type Props = Parameters<typeof XtermStatusBar>[0];

beforeEach(() => {
  setLocale('en');
});

function renderBar(over: Partial<Props> = {}) {
  const onToggleSearch = vi.fn();
  const onSearchQuery = vi.fn();
  const onRunSearch = vi.fn();
  const onCloseSearch = vi.fn();
  const props: Props = {
    statusLabel: 'normal',
    searchOpen: false,
    onToggleSearch,
    searchQuery: '',
    onSearchQuery,
    onRunSearch,
    onCloseSearch,
    ...over,
  };
  const utils = render(<XtermStatusBar {...props} />);
  const user = userEvent.setup();
  return {
    ...utils,
    user,
    onToggleSearch,
    onSearchQuery,
    onRunSearch,
    onCloseSearch,
    props,
  };
}

describe('<XtermStatusBar>', () => {
  // ---- status label rendering -----------------------------------

  it('renders the statusLabel text in the status row', () => {
    renderBar({ statusLabel: 'normal' });
    expect(screen.getByText('normal')).toBeInTheDocument();
  });

  it('renders the alt-screen statusLabel verbatim', () => {
    renderBar({ statusLabel: 'alt-screen' });
    expect(screen.getByText('alt-screen')).toBeInTheDocument();
  });

  it('renders the disconnected statusLabel verbatim', () => {
    renderBar({ statusLabel: 'disconnected' });
    expect(screen.getByText('disconnected')).toBeInTheDocument();
  });

  // ---- Search toggle button -------------------------------------

  it('renders the Search toggle button with the localized aria-label', () => {
    renderBar();
    expect(
      screen.getByRole('button', { name: 'Search in terminal' }),
    ).toBeInTheDocument();
  });

  it('renders the localized "Search" button text inside the toggle', () => {
    renderBar();
    expect(screen.getByText('Search')).toBeInTheDocument();
  });

  it('fires onToggleSearch when the Search button is clicked', async () => {
    const { user, onToggleSearch } = renderBar();
    await user.click(
      screen.getByRole('button', { name: 'Search in terminal' }),
    );
    expect(onToggleSearch).toHaveBeenCalledTimes(1);
  });

  // ---- closed-state search panel --------------------------------

  it('does NOT render the search input when searchOpen=false', () => {
    renderBar({ searchOpen: false });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('does NOT render the close-search button when searchOpen=false', () => {
    renderBar({ searchOpen: false });
    expect(
      screen.queryByRole('button', { name: 'Close search' }),
    ).not.toBeInTheDocument();
  });

  // ---- open-state search panel ----------------------------------

  it('renders the search input when searchOpen=true', () => {
    renderBar({ searchOpen: true });
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('reflects the searchQuery prop as the input value', () => {
    renderBar({ searchOpen: true, searchQuery: 'needle' });
    expect(screen.getByRole('textbox')).toHaveValue('needle');
  });

  it('renders the localized find placeholder on the input', () => {
    renderBar({ searchOpen: true });
    expect(screen.getByRole('textbox')).toHaveAttribute(
      'placeholder',
      'Find in terminal (Enter = next, Shift+Enter = prev)',
    );
  });

  it('renders the close-search button with the localized aria-label', () => {
    renderBar({ searchOpen: true });
    expect(
      screen.getByRole('button', { name: 'Close search' }),
    ).toBeInTheDocument();
  });

  // ---- input callbacks ------------------------------------------

  it('fires onSearchQuery for each character typed into the input', async () => {
    const { user, onSearchQuery } = renderBar({
      searchOpen: true,
      searchQuery: '',
    });
    await user.type(screen.getByRole('textbox'), 'abc');
    // Uncontrolled in this test (searchQuery is fixed ''), so every
    // character calls back with the next key's value.
    expect(onSearchQuery).toHaveBeenCalledTimes(3);
    expect(onSearchQuery).toHaveBeenNthCalledWith(1, 'a');
    expect(onSearchQuery).toHaveBeenNthCalledWith(2, 'b');
    expect(onSearchQuery).toHaveBeenNthCalledWith(3, 'c');
  });

  it('fires onRunSearch("next") when Enter is pressed in the input', async () => {
    const { user, onRunSearch } = renderBar({
      searchOpen: true,
      searchQuery: 'q',
    });
    const input = screen.getByRole('textbox');
    input.focus();
    await user.keyboard('{Enter}');
    expect(onRunSearch).toHaveBeenCalledTimes(1);
    expect(onRunSearch).toHaveBeenCalledWith('next');
  });

  it('fires onRunSearch("prev") when Shift+Enter is pressed in the input', async () => {
    const { user, onRunSearch } = renderBar({
      searchOpen: true,
      searchQuery: 'q',
    });
    const input = screen.getByRole('textbox');
    input.focus();
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(onRunSearch).toHaveBeenCalledTimes(1);
    expect(onRunSearch).toHaveBeenCalledWith('prev');
  });

  it('fires onCloseSearch when Escape is pressed in the input', async () => {
    const { user, onCloseSearch } = renderBar({
      searchOpen: true,
      searchQuery: 'q',
    });
    const input = screen.getByRole('textbox');
    input.focus();
    await user.keyboard('{Escape}');
    expect(onCloseSearch).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onRunSearch when a non-Enter / non-Escape key is pressed', async () => {
    const { user, onRunSearch, onCloseSearch } = renderBar({
      searchOpen: true,
      searchQuery: 'q',
    });
    const input = screen.getByRole('textbox');
    input.focus();
    await user.keyboard('a');
    expect(onRunSearch).not.toHaveBeenCalled();
    expect(onCloseSearch).not.toHaveBeenCalled();
  });

  it('fires onCloseSearch when the close (X) button is clicked', async () => {
    const { user, onCloseSearch } = renderBar({ searchOpen: true });
    await user.click(screen.getByRole('button', { name: 'Close search' }));
    expect(onCloseSearch).toHaveBeenCalledTimes(1);
  });

  // ---- autofocus on open ----------------------------------------

  it('autofocuses the search input when searchOpen=true', () => {
    renderBar({ searchOpen: true });
    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  // ---- locale flip ----------------------------------------------

  it('renders the Korean Search button text when locale=ko', () => {
    setLocale('ko');
    renderBar();
    expect(screen.getByText(/검색/)).toBeInTheDocument();
  });

  it('renders the Korean find placeholder when locale=ko and searchOpen=true', () => {
    setLocale('ko');
    renderBar({ searchOpen: true });
    expect(screen.getByRole('textbox')).toHaveAttribute(
      'placeholder',
      '터미널에서 검색 (Enter = 다음, Shift+Enter = 이전)',
    );
  });

  it('renders the Korean close-search aria-label when locale=ko and searchOpen=true', () => {
    setLocale('ko');
    renderBar({ searchOpen: true });
    expect(
      screen.getByRole('button', { name: '검색 닫기' }),
    ).toBeInTheDocument();
  });
});
