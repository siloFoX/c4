import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MeetingsListTitleBar from './MeetingsListTitleBar';
import { setLocale } from '../lib/i18n';

beforeEach(() => {
  setLocale('en');
});

function renderBar(
  overrides: Partial<Parameters<typeof MeetingsListTitleBar>[0]> = {},
) {
  const props = {
    creating: false,
    loading: false,
    onToggleCreating: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
  const utils = render(<MeetingsListTitleBar {...props} />);
  return { ...utils, props };
}

describe('<MeetingsListTitleBar>', () => {
  it('renders the "Meetings" title text from the i18n bundle', () => {
    renderBar();
    expect(screen.getByText('Meetings')).toBeInTheDocument();
  });

  it('renders the "New meeting" button with the i18n accessible name', () => {
    renderBar();
    expect(
      screen.getByRole('button', { name: 'New meeting' }),
    ).toBeInTheDocument();
  });

  it('renders the "Refresh meetings list" button with the i18n accessible name', () => {
    renderBar();
    expect(
      screen.getByRole('button', { name: 'Refresh meetings list' }),
    ).toBeInTheDocument();
  });

  it('shows aria-expanded="false" on the New button when creating=false', () => {
    renderBar({ creating: false });
    expect(
      screen.getByRole('button', { name: 'New meeting' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows aria-expanded="true" on the New button when creating=true', () => {
    renderBar({ creating: true });
    expect(
      screen.getByRole('button', { name: 'New meeting' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('disables the Refresh button when loading=true', () => {
    renderBar({ loading: true });
    expect(
      screen.getByRole('button', { name: 'Refresh meetings list' }),
    ).toBeDisabled();
  });

  it('enables the Refresh button when loading=false', () => {
    renderBar({ loading: false });
    expect(
      screen.getByRole('button', { name: 'Refresh meetings list' }),
    ).toBeEnabled();
  });

  it('renders the Refresh icon with the animate-spin class while loading', () => {
    const { container } = renderBar({ loading: true });
    const refreshBtn = screen.getByRole('button', {
      name: 'Refresh meetings list',
    });
    const svg = refreshBtn.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveClass('animate-spin');
    void container;
  });

  it('omits animate-spin on the Refresh icon when not loading', () => {
    renderBar({ loading: false });
    const refreshBtn = screen.getByRole('button', {
      name: 'Refresh meetings list',
    });
    const svg = refreshBtn.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).not.toHaveClass('animate-spin');
  });

  it('fires onToggleCreating when the New button is clicked', async () => {
    const user = userEvent.setup();
    const onToggleCreating = vi.fn();
    renderBar({ onToggleCreating });
    await user.click(screen.getByRole('button', { name: 'New meeting' }));
    expect(onToggleCreating).toHaveBeenCalledTimes(1);
  });

  it('fires onRefresh when the Refresh button is clicked', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    renderBar({ onRefresh });
    await user.click(
      screen.getByRole('button', { name: 'Refresh meetings list' }),
    );
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not fire onRefresh when the Refresh button is disabled', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    renderBar({ loading: true, onRefresh });
    await user.click(
      screen.getByRole('button', { name: 'Refresh meetings list' }),
    );
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('fires onToggleCreating on Enter key activation', async () => {
    const user = userEvent.setup();
    const onToggleCreating = vi.fn();
    renderBar({ onToggleCreating });
    const btn = screen.getByRole('button', { name: 'New meeting' });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onToggleCreating).toHaveBeenCalledTimes(1);
  });

  it('fires onToggleCreating on Space key activation', async () => {
    const user = userEvent.setup();
    const onToggleCreating = vi.fn();
    renderBar({ onToggleCreating });
    const btn = screen.getByRole('button', { name: 'New meeting' });
    btn.focus();
    await user.keyboard(' ');
    expect(onToggleCreating).toHaveBeenCalledTimes(1);
  });

  it('renders the "New" visible label text on the New button', () => {
    renderBar();
    const btn = screen.getByRole('button', { name: 'New meeting' });
    expect(btn.textContent).toContain('New');
  });

  it('renders the "Refresh" visible label text on the Refresh button', () => {
    renderBar();
    const btn = screen.getByRole('button', {
      name: 'Refresh meetings list',
    });
    expect(btn.textContent).toContain('Refresh');
  });

  it('marks the Plus icon aria-hidden so the label stays the accessible name', () => {
    renderBar();
    const btn = screen.getByRole('button', { name: 'New meeting' });
    const icon = btn.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('marks the RefreshCw icon aria-hidden so the label stays the accessible name', () => {
    renderBar();
    const btn = screen.getByRole('button', {
      name: 'Refresh meetings list',
    });
    const icon = btn.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('does not fire callbacks on initial render', () => {
    const onToggleCreating = vi.fn();
    const onRefresh = vi.fn();
    renderBar({ onToggleCreating, onRefresh });
    expect(onToggleCreating).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('rerendering with the same props does not duplicate callbacks', async () => {
    const user = userEvent.setup();
    const onToggleCreating = vi.fn();
    const { rerender, props } = renderBar({ onToggleCreating });
    rerender(<MeetingsListTitleBar {...props} />);
    await user.click(screen.getByRole('button', { name: 'New meeting' }));
    expect(onToggleCreating).toHaveBeenCalledTimes(1);
  });

  it('re-renders the title copy when the locale flips to ko', () => {
    renderBar();
    expect(screen.getByText('Meetings')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Meetings')).not.toBeInTheDocument();
  });
});
