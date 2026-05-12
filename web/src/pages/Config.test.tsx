import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { UseConfigState } from '../lib/use-config';

// Config.tsx wires PageFrame + a single hook (useConfig) and adds a
// local filter input. Stub the hook so each test drives a single
// branch of the GET-config / POST-reload state machine without
// hitting fetch or window.confirm.

const refreshMock = vi.fn(async () => {});
const handleReloadMock = vi.fn(async () => {});

let hookState: UseConfigState = {
  config: {},
  error: null,
  loading: false,
  refresh: refreshMock,
  reloadBusy: false,
  reloadMsg: null,
  reloadFailed: false,
  handleReload: handleReloadMock,
};

vi.mock('../lib/use-config', () => ({
  useConfig: (): UseConfigState => hookState,
}));

import Config from './Config';

beforeEach(() => {
  setLocale('en');
  refreshMock.mockReset();
  refreshMock.mockResolvedValue(undefined);
  handleReloadMock.mockReset();
  handleReloadMock.mockResolvedValue(undefined);
  hookState = {
    config: {},
    error: null,
    loading: false,
    refresh: refreshMock,
    reloadBusy: false,
    reloadMsg: null,
    reloadFailed: false,
    handleReload: handleReloadMock,
  };
});

describe('<Config>', () => {
  it('renders the page title in the frame header', () => {
    render(<Config />);
    expect(screen.getByText('Config')).toBeInTheDocument();
  });

  it('renders the page description in the frame header', () => {
    render(<Config />);
    expect(screen.getByText('Live daemon config (sans secrets) + reload.')).toBeInTheDocument();
  });

  it('renders the refresh button with the accessible name from i18n', () => {
    render(<Config />);
    expect(
      screen.getByRole('button', { name: /Refresh config/ }),
    ).toBeInTheDocument();
  });

  it('renders the live-config heading', () => {
    render(<Config />);
    expect(screen.getByText('Live config')).toBeInTheDocument();
  });

  it('renders the intro banner copy', () => {
    render(<Config />);
    expect(screen.getByText(/Mirrors c4 config/)).toBeInTheDocument();
  });

  it('renders the reload button', () => {
    render(<Config />);
    expect(
      screen.getByRole('button', { name: 'Reload from disk' }),
    ).toBeInTheDocument();
  });

  it('renders the filter input with the right accessible label', () => {
    render(<Config />);
    expect(
      screen.getByLabelText('Filter config keys'),
    ).toBeInTheDocument();
  });

  it('fires the hook refresh handler when refresh is clicked', async () => {
    const user = userEvent.setup();
    render(<Config />);
    await user.click(screen.getByRole('button', { name: /Refresh config/ }));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('disables refresh while loading', () => {
    hookState = { ...hookState, loading: true };
    render(<Config />);
    expect(
      screen.getByRole('button', { name: /Refresh config/ }),
    ).toBeDisabled();
  });

  it('disables filter input while loading', () => {
    hookState = { ...hookState, loading: true };
    render(<Config />);
    expect(screen.getByLabelText('Filter config keys')).toBeDisabled();
  });

  it('fires handleReload when the reload button is clicked', async () => {
    const user = userEvent.setup();
    render(<Config />);
    await user.click(screen.getByRole('button', { name: 'Reload from disk' }));
    expect(handleReloadMock).toHaveBeenCalledTimes(1);
  });

  it('disables the reload button while reload is busy', () => {
    hookState = { ...hookState, reloadBusy: true };
    render(<Config />);
    expect(
      screen.getByRole('button', { name: 'Reloading…' }),
    ).toBeDisabled();
  });

  it('flips the reload button label to Reloading… while busy', () => {
    hookState = { ...hookState, reloadBusy: true };
    render(<Config />);
    expect(
      screen.getByRole('button', { name: 'Reloading…' }),
    ).toBeInTheDocument();
  });

  it('renders the reload success message with the muted tone', () => {
    hookState = {
      ...hookState,
      reloadMsg: 'reload ok',
      reloadFailed: false,
    };
    render(<Config />);
    const msg = screen.getByText('reload ok');
    expect(msg.className).toContain('text-muted-foreground');
    expect(msg.className).not.toContain('text-destructive');
  });

  it('renders the reload failure message with the destructive tone', () => {
    hookState = {
      ...hookState,
      reloadMsg: 'reload broke',
      reloadFailed: true,
    };
    render(<Config />);
    const msg = screen.getByText('reload broke');
    expect(msg.className).toContain('text-destructive');
  });

  it('renders the error panel via role=alert when the hook reports an error', () => {
    hookState = { ...hookState, error: 'load fail' };
    render(<Config />);
    expect(screen.getByRole('alert')).toHaveTextContent('load fail');
  });

  it('renders the loading hint when config is null', () => {
    hookState = { ...hookState, config: null };
    render(<Config />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders the empty-config hint when the map is empty', () => {
    hookState = { ...hookState, config: {} };
    render(<Config />);
    expect(screen.getByText('Empty config.')).toBeInTheDocument();
  });

  it('renders each top-level key as its own details row', () => {
    hookState = {
      ...hookState,
      config: { foo: 1, bar: 'x' },
    };
    render(<Config />);
    expect(screen.getByText('foo')).toBeInTheDocument();
    expect(screen.getByText('bar')).toBeInTheDocument();
  });

  it('renders the summarised value preview for a number entry', () => {
    hookState = { ...hookState, config: { foo: 42 } };
    render(<Config />);
    // Number renders both in summary span and in JSON pre block.
    expect(screen.getAllByText('42').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the summarised value preview for a quoted short string', () => {
    hookState = { ...hookState, config: { foo: 'bar' } };
    render(<Config />);
    // The summary span wraps the value in `"..."` while the pre block
    // also serialises strings with surrounding quotes. Both surface.
    expect(screen.getAllByText('"bar"').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the summarised value preview for a long string with ellipsis', () => {
    hookState = {
      ...hookState,
      config: { foo: 'a'.repeat(50) },
    };
    render(<Config />);
    expect(screen.getByText(`"${'a'.repeat(40)}…"`)).toBeInTheDocument();
  });

  it('renders the summarised value preview for an array as `[n]`', () => {
    hookState = { ...hookState, config: { foo: [1, 2, 3] } };
    render(<Config />);
    expect(screen.getByText('[3]')).toBeInTheDocument();
  });

  it('renders the summarised value preview for an object as `{n keys}`', () => {
    hookState = {
      ...hookState,
      config: { foo: { a: 1, b: 2 } },
    };
    render(<Config />);
    expect(screen.getByText('{2 keys}')).toBeInTheDocument();
  });

  it('renders the summarised value preview for null as the literal string', () => {
    hookState = { ...hookState, config: { foo: null } };
    render(<Config />);
    expect(screen.getAllByText('null').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the summarised value preview for a boolean', () => {
    hookState = { ...hookState, config: { foo: true } };
    render(<Config />);
    expect(screen.getAllByText('true').length).toBeGreaterThanOrEqual(1);
  });

  it('filters keys when the filter input matches by key name', async () => {
    hookState = {
      ...hookState,
      config: { alpha: 1, beta: 2 },
    };
    const user = userEvent.setup();
    render(<Config />);
    await user.type(screen.getByLabelText('Filter config keys'), 'alp');
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.queryByText('beta')).not.toBeInTheDocument();
  });

  it('filters keys when the filter input matches the serialised value', async () => {
    hookState = {
      ...hookState,
      config: { a: 'cat', b: 'dog' },
    };
    const user = userEvent.setup();
    render(<Config />);
    await user.type(screen.getByLabelText('Filter config keys'), 'cat');
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.queryByText('b')).not.toBeInTheDocument();
  });

  it('renders the no-match hint when the filter excludes all keys', async () => {
    hookState = {
      ...hookState,
      config: { alpha: 1 },
    };
    const user = userEvent.setup();
    render(<Config />);
    await user.type(
      screen.getByLabelText('Filter config keys'),
      'zzz-not-there',
    );
    expect(
      screen.getByText(/No keys match "zzz-not-there"/),
    ).toBeInTheDocument();
  });

  it('controlled filter input reflects the typed value', async () => {
    const user = userEvent.setup();
    render(<Config />);
    const input = screen.getByLabelText('Filter config keys') as HTMLInputElement;
    await user.type(input, 'foo');
    expect(input.value).toBe('foo');
  });

  it('applies the animate-spin class on the refresh icon while loading', () => {
    hookState = { ...hookState, loading: true };
    render(<Config />);
    const btn = screen.getByRole('button', { name: /Refresh config/ });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').toContain('animate-spin');
  });

  it('does NOT apply the animate-spin class on the refresh icon when idle', () => {
    render(<Config />);
    const btn = screen.getByRole('button', { name: /Refresh config/ });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').not.toContain('animate-spin');
  });

  it('hides the reload-message slot when reloadMsg is null', () => {
    hookState = { ...hookState, reloadMsg: null };
    render(<Config />);
    expect(screen.queryByText(/reload ok|reload broke/)).not.toBeInTheDocument();
  });

  it('renders the full JSON payload inside the expanded entry pre block', () => {
    hookState = { ...hookState, config: { foo: { nested: 1 } } };
    render(<Config />);
    const pre = document.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toContain('"nested": 1');
  });

  it('still renders the heading + intro when the error panel is visible', () => {
    hookState = { ...hookState, error: 'load fail' };
    render(<Config />);
    expect(screen.getByText('Live config')).toBeInTheDocument();
    expect(screen.getByText(/Mirrors c4 config/)).toBeInTheDocument();
  });

  it('re-renders after the locale flips without crashing', () => {
    const { container } = render(<Config />);
    expect(screen.getByText('Config')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(container.firstChild).toBeInTheDocument();
  });
});
