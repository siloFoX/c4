import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import { useHelpOverlayTriggers } from '../lib/use-help-overlay-triggers';
import {
  KeyboardShortcutsModal,
  SHORTCUT_ROWS,
} from './KeyboardShortcutsModal';

// KeyboardShortcutsModal is the ? cheat sheet rendered as a global
// overlay. It now wraps the Dialog primitive (web/src/components/ui/
// dialog.tsx) which handles portal mounting, focus trap, Escape, and
// backdrop click. Tests drive the prop union: visibility branches,
// the dialog scaffolding (role, aria-modal, aria-labelledby), the row
// count + per-row kbd + description rendering, the close paths
// (X button, backdrop click, Escape key), the inner-card click
// suppression, and the locale flip.

beforeEach(() => {
  setLocale('en');
});

function renderModal(
  overrides: Partial<Parameters<typeof KeyboardShortcutsModal>[0]> = {},
) {
  const onClose = vi.fn();
  const props = {
    open: true,
    onClose,
    ...overrides,
  };
  const utils = render(<KeyboardShortcutsModal {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onClose, props };
}

describe('<KeyboardShortcutsModal>', () => {
  // ---- open=false null return ------------------------------------

  it('renders nothing when open=false', () => {
    render(<KeyboardShortcutsModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // ---- dialog scaffolding ----------------------------------------

  it('renders a single dialog with role=dialog and aria-modal=true', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('uses the localized "Keyboard shortcuts" string as the dialog accessible name', () => {
    renderModal();
    expect(
      screen.getByRole('dialog', { name: 'Keyboard shortcuts' }),
    ).toBeInTheDocument();
  });

  it('marks the inner content with the data-shortcuts-modal hook so other code can locate it', () => {
    renderModal();
    expect(
      document.querySelector('[data-shortcuts-modal]'),
    ).not.toBeNull();
  });

  it('renders the localized heading text inside the dialog body', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Keyboard shortcuts')).toBeInTheDocument();
  });

  // ---- shortcuts table ------------------------------------------

  it('renders one table row per SHORTCUT_ROWS entry', () => {
    renderModal();
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBe(SHORTCUT_ROWS.length);
  });

  it('renders the kbd label for each shortcut row', () => {
    renderModal();
    for (const row of SHORTCUT_ROWS) {
      expect(screen.getAllByText(row.keys).length).toBeGreaterThan(0);
    }
  });

  it('renders the canonical "?" + "Shift+/" + "H" + "Esc" + "Ctrl+F" + "Enter" + "Shift+Enter" + "T" + "Ctrl+B" key labels', () => {
    renderModal();
    for (const expected of [
      '?',
      'Shift+/',
      'H',
      'Esc',
      'Ctrl+F',
      'Enter',
      'Shift+Enter',
      'T',
      'Ctrl+B',
    ]) {
      expect(screen.getAllByText(expected).length).toBeGreaterThan(0);
    }
  });

  it('renders the localized description text for each shortcut row', () => {
    renderModal();
    expect(
      screen.getAllByText('Open keyboard shortcut sheet').length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Open help drawer')).toBeInTheDocument();
    expect(screen.getByText('Close any modal or drawer')).toBeInTheDocument();
    expect(screen.getByText('Search in terminal')).toBeInTheDocument();
    expect(screen.getByText('Send chat message')).toBeInTheDocument();
    expect(
      screen.getByText('Insert newline in composer'),
    ).toBeInTheDocument();
    expect(screen.getByText('Replay onboarding tour')).toBeInTheDocument();
    expect(
      screen.getByText('Collapse / expand the workers sidebar'),
    ).toBeInTheDocument();
  });

  it('wraps each key label in a real <kbd> element', () => {
    renderModal();
    const kbds = document.querySelectorAll('kbd');
    expect(kbds.length).toBe(SHORTCUT_ROWS.length);
  });

  // ---- close button --------------------------------------------

  it('renders the localized Close (X) button', () => {
    renderModal();
    expect(
      screen.getByRole('button', { name: 'Close' }),
    ).toBeInTheDocument();
  });

  it('renders exactly one button (the Close X) inside the modal', () => {
    renderModal();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  // ---- close paths ---------------------------------------------

  it('fires onClose when the X button is clicked', async () => {
    const { user, onClose } = renderModal();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires onClose when the backdrop is clicked', async () => {
    const { user, onClose } = renderModal();
    const backdrop = document.querySelector(
      '[data-dialog-backdrop]',
    ) as HTMLElement;
    expect(backdrop).not.toBeNull();
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onClose when the inner card is clicked (stopPropagation)', async () => {
    const { user, onClose } = renderModal();
    await user.click(
      within(screen.getByRole('dialog')).getByText('Keyboard shortcuts'),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('fires onClose when Escape is pressed while open', async () => {
    const { user, onClose } = renderModal();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onClose on initial render', () => {
    const { onClose } = renderModal();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does NOT register the Escape listener when open=false', async () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsModal open={false} onClose={onClose} />);
    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  // ---- rerender stability --------------------------------------

  it('rerendering with the same props does not duplicate the dialog', () => {
    const { rerender, props } = renderModal();
    rerender(<KeyboardShortcutsModal {...props} />);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('rerendering from open=true to open=false drops the dialog entirely', () => {
    const { rerender, props } = renderModal();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    rerender(<KeyboardShortcutsModal {...props} open={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('rerendering from open=false to open=true reveals the dialog', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <KeyboardShortcutsModal open={false} onClose={onClose} />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    rerender(<KeyboardShortcutsModal open onClose={onClose} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('rerendering with a new onClose rebinds the close target', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <KeyboardShortcutsModal open onClose={first} />,
    );
    rerender(<KeyboardShortcutsModal open onClose={second} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  // ---- locale flip ---------------------------------------------

  it('re-renders the dialog accessible name in Korean when the locale flips to ko', () => {
    renderModal();
    expect(
      screen.getByRole('dialog', { name: 'Keyboard shortcuts' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('dialog', { name: 'Keyboard shortcuts' }),
    ).not.toBeInTheDocument();
  });

  it('re-renders the description copy in Korean when the locale flips to ko', () => {
    renderModal();
    expect(screen.getByText('Open help drawer')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Open help drawer')).not.toBeInTheDocument();
  });

  it('keeps the kbd glyph keys unchanged through a locale flip (keys are not localized)', () => {
    renderModal();
    expect(screen.getAllByText('Esc').length).toBeGreaterThan(0);
    act(() => {
      setLocale('ko');
    });
    expect(screen.getAllByText('Esc').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ctrl+B').length).toBeGreaterThan(0);
  });

  // ---- categorized sections (v1.11.191) ------------------------

  it('renders Navigation / Actions / View section headings', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Navigation')).toBeInTheDocument();
    expect(within(dialog).getByText('Actions')).toBeInTheDocument();
    expect(within(dialog).getByText('View')).toBeInTheDocument();
  });

  it('groups every shortcut row under a section data attribute', () => {
    renderModal();
    const sections = document.querySelectorAll('[data-shortcuts-section]');
    expect(sections.length).toBeGreaterThan(0);
    let total = 0;
    sections.forEach((s) => {
      total += s.querySelectorAll('tbody tr').length;
    });
    expect(total).toBe(SHORTCUT_ROWS.length);
  });

  // ---- search filter ------------------------------------------

  it('renders a SearchBar filter input above the sections', () => {
    renderModal();
    expect(
      screen.getByRole('searchbox', { name: 'Filter shortcuts' }),
    ).toBeInTheDocument();
  });

  it('filters rows by description label substring (e.g. "tour")', async () => {
    const { user } = renderModal();
    const filter = screen.getByRole('searchbox', { name: 'Filter shortcuts' });
    await user.type(filter, 'tour');
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBe(1);
    expect(
      within(rows[0]!).getByText('Replay onboarding tour'),
    ).toBeInTheDocument();
  });

  it('filters rows by key combo (e.g. "Ctrl+F")', async () => {
    const { user } = renderModal();
    const filter = screen.getByRole('searchbox', { name: 'Filter shortcuts' });
    await user.type(filter, 'Ctrl+F');
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBe(1);
    expect(within(rows[0]!).getByText('Ctrl+F')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Search in terminal')).toBeInTheDocument();
  });

  it('empty filter shows all rows', async () => {
    const { user } = renderModal();
    const filter = screen.getByRole('searchbox', { name: 'Filter shortcuts' });
    await user.type(filter, 'tour');
    expect(screen.getAllByRole('row').length).toBe(1);
    await user.clear(filter);
    expect(screen.getAllByRole('row').length).toBe(SHORTCUT_ROWS.length);
  });

  it('shows the empty-state message when no row matches the filter', async () => {
    const { user } = renderModal();
    const filter = screen.getByRole('searchbox', { name: 'Filter shortcuts' });
    await user.type(filter, 'zzzz-no-match');
    expect(screen.getByText('No matching shortcuts')).toBeInTheDocument();
    expect(screen.queryAllByRole('row')).toHaveLength(0);
  });

  // ---- global ? hotkey wiring (via useHelpOverlayTriggers) ----

  function HotkeyHarness() {
    const [open, setOpen] = useState(false);
    useHelpOverlayTriggers({
      onOpenDrawer: () => {},
      onOpenShortcuts: () => setOpen(true),
    });
    return (
      <>
        <input data-testid="harness-input" placeholder="focus me" />
        <KeyboardShortcutsModal open={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  it('opens the modal when ? is pressed and no input is focused', () => {
    render(<HotkeyHarness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: '?' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does NOT open the modal when ? is pressed while an input is focused', () => {
    render(<HotkeyHarness />);
    const input = screen.getByTestId('harness-input') as HTMLInputElement;
    input.focus();
    fireEvent.keyDown(input, { key: '?' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
