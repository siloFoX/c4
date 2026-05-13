import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CommandPalette from './CommandPalette';
import HelpUIRoot from './HelpUIRoot';
import { setLocale } from '../lib/i18n';

// CommandPalette is a centered modal that opens on Cmd+K / Ctrl+K and
// renders a fuzzy-searched, section-grouped list of commands. The
// trigger lives in HelpUIRoot (which mounts the palette globally) and
// the catalog + matcher live in command-palette/commands.ts (their
// own unit tests cover scoring + filter contracts). This file covers
// the UI/keyboard surface: hotkey open, Esc + backdrop close, typing
// filters, arrow-nav + Enter, empty state, sections + animation.

beforeEach(() => {
  setLocale('en');
  // Reset hash so feature-id navigation tests don't bleed.
  window.history.replaceState(null, '', window.location.pathname);
});

describe('<CommandPalette> trigger via HelpUIRoot', () => {
  it('opens on meta+k', async () => {
    render(<HelpUIRoot />);
    const user = userEvent.setup();
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
    await user.keyboard('{Meta>}k{/Meta}');
    expect(
      screen.getByRole('dialog', { name: 'Command palette' }),
    ).toBeInTheDocument();
  });

  it('opens on ctrl+k', async () => {
    render(<HelpUIRoot />);
    const user = userEvent.setup();
    await user.keyboard('{Control>}k{/Control}');
    expect(
      screen.getByRole('dialog', { name: 'Command palette' }),
    ).toBeInTheDocument();
  });
});

describe('<CommandPalette> close paths', () => {
  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} />);
    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click', async () => {
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('dialog', { name: 'Command palette' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT close when the inner panel is clicked', async () => {
    const onClose = vi.fn();
    const { container } = render(
      <CommandPalette open onClose={onClose} />,
    );
    const panel = container.querySelector('[data-command-panel]') as HTMLElement;
    expect(panel).not.toBeNull();
    const user = userEvent.setup();
    await user.click(panel);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders nothing when open=false', () => {
    const { container } = render(
      <CommandPalette open={false} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('<CommandPalette> filtering', () => {
  it('typing filters by substring match', async () => {
    render(<CommandPalette open onClose={() => {}} />);
    const user = userEvent.setup();
    const input = screen.getByLabelText('Search commands');
    await user.type(input, 'risk');
    const dialog = screen.getByRole('dialog', { name: 'Command palette' });
    const options = within(dialog).getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    expect(options[0]?.textContent).toMatch(/risk/i);
  });

  it('typing filters by acronym match', async () => {
    render(<CommandPalette open onClose={() => {}} />);
    const user = userEvent.setup();
    const input = screen.getByLabelText('Search commands');
    // "Token usage" -> tu acronym
    await user.type(input, 'tu');
    const dialog = screen.getByRole('dialog', { name: 'Command palette' });
    const labels = within(dialog).getAllByRole('option').map((o) => o.textContent || '');
    expect(labels.some((l) => /token usage/i.test(l))).toBe(true);
  });

  it('renders the EmptyState when no command matches', async () => {
    render(<CommandPalette open onClose={() => {}} />);
    const user = userEvent.setup();
    const input = screen.getByLabelText('Search commands');
    await user.type(input, 'zzzzzz-no-match-zzzzzz');
    expect(screen.getByText('No matching commands')).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog', { name: 'Command palette' })).queryAllByRole(
        'option',
      ),
    ).toHaveLength(0);
  });
});

describe('<CommandPalette> keyboard navigation', () => {
  it('Arrow Down moves the active selection down', async () => {
    render(<CommandPalette open onClose={() => {}} />);
    const user = userEvent.setup();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    const options = screen.getAllByRole('option');
    const selected = options.findIndex(
      (o) => o.getAttribute('aria-selected') === 'true',
    );
    expect(selected).toBe(2);
  });

  it('Arrow Up moves the active selection up (clamped at 0)', async () => {
    render(<CommandPalette open onClose={() => {}} />);
    const user = userEvent.setup();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowUp}');
    const options = screen.getAllByRole('option');
    const selected = options.findIndex(
      (o) => o.getAttribute('aria-selected') === 'true',
    );
    expect(selected).toBe(1);
  });

  it('Enter activates the highlighted command and closes the palette', async () => {
    const onClose = vi.fn();
    const navigateTopView = vi.fn();
    render(
      <CommandPalette
        open
        onClose={onClose}
        ctx={{ navigateTopView }}
      />,
    );
    const user = userEvent.setup();
    await user.keyboard('{Enter}');
    expect(navigateTopView).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('<CommandPalette> click activation', () => {
  it('clicking a result fires its run() and closes', async () => {
    const onClose = vi.fn();
    const run = vi.fn();
    const X = () => null;
    render(
      <CommandPalette
        open
        onClose={onClose}
        commands={[
          {
            id: 'custom:1',
            label: 'Custom command',
            section: 'Navigate',
            Icon: X,
            run,
          },
        ]}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('option', { name: /Custom command/ }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('<CommandPalette> sections + structure', () => {
  it('renders Navigate, Workers, Queue section headers in that order', () => {
    const { container } = render(
      <CommandPalette open onClose={() => {}} />,
    );
    const headers = Array.from(
      container.querySelectorAll('[data-section-header]'),
    ).map((el) => el.textContent || '');
    expect(headers).toEqual(['Navigate', 'Workers', 'Queue']);
  });

  it('renders motion-safe animation classes on the dialog and panel', () => {
    const { container } = render(
      <CommandPalette open onClose={() => {}} />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Command palette' });
    expect(dialog.className).toMatch(/motion-safe:animate-in/);
    expect(dialog.className).toMatch(/motion-safe:fade-in/);
    const panel = container.querySelector('[data-command-panel]') as HTMLElement;
    expect(panel.className).toMatch(/motion-safe:slide-in-from-top-2/);
  });

  it('uses semantic palette tokens on the dialog backdrop (no raw colors)', () => {
    render(<CommandPalette open onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Command palette' });
    expect(dialog.className).toMatch(/bg-background\/80/);
    expect(dialog.className).toMatch(/backdrop-blur/);
    expect(dialog.className).toMatch(/z-50/);
  });
});

describe('<CommandPalette> open lifecycle', () => {
  it('clears the query when the palette is reopened', async () => {
    const { rerender } = render(
      <CommandPalette open onClose={() => {}} />,
    );
    const user = userEvent.setup();
    const input = screen.getByLabelText('Search commands') as HTMLInputElement;
    await user.type(input, 'auto');
    expect(input.value).toBe('auto');
    rerender(<CommandPalette open={false} onClose={() => {}} />);
    rerender(<CommandPalette open onClose={() => {}} />);
    const reopened = screen.getByLabelText(
      'Search commands',
    ) as HTMLInputElement;
    // The reset effect fires after open flips true.
    await act(async () => {
      await Promise.resolve();
    });
    expect(reopened.value).toBe('');
  });
});
