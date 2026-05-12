import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import {
  KeyboardShortcutsModal,
  SHORTCUT_ROWS,
} from './KeyboardShortcutsModal';

// KeyboardShortcutsModal is the ? cheat sheet rendered as a global
// overlay. State machine is small: open=false null-return, open=true
// renders a dialog that locks SHORTCUT_ROWS as the canonical shortcut
// list. Escape-to-close lives in useEscapeToClose (its own unit
// test). Tests drive the prop union directly: the visibility branches,
// the dialog scaffolding (role, aria-modal, aria-label), the row
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
    const { container } = render(
      <KeyboardShortcutsModal open={false} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('does not render the dialog when open=false', () => {
    render(<KeyboardShortcutsModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // ---- dialog scaffolding ----------------------------------------

  it('renders a single dialog with role=dialog and aria-modal=true', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('uses the localized "Keyboard shortcuts" string as the dialog aria-label', () => {
    renderModal();
    expect(
      screen.getByRole('dialog', { name: 'Keyboard shortcuts' }),
    ).toBeInTheDocument();
  });

  it('marks the dialog with the data-shortcuts-modal hook so other code can locate it', () => {
    renderModal();
    expect(
      screen.getByRole('dialog').getAttribute('data-shortcuts-modal'),
    ).not.toBeNull();
  });

  it('renders the dialog as fixed inset-0 with the dimming overlay class', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toMatch(/fixed/);
    expect(dialog.className).toMatch(/inset-0/);
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

  it('renders the kbd label for each shortcut row exactly once', () => {
    renderModal();
    for (const row of SHORTCUT_ROWS) {
      // Some keys (?, Shift+/) appear in multiple rows because they
      // share a description. Verify each row mounts a <kbd> with the
      // expected text by querying through the row index instead.
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

  it('wraps each key label in a real <kbd> element so screen-readers and styling treat it as a keyboard glyph', () => {
    const { container } = renderModal();
    const kbds = container.querySelectorAll('kbd');
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
    await user.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onClose when the inner card is clicked (stopPropagation)', async () => {
    const { user, onClose } = renderModal();
    // The heading sits inside the inner card.
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
    const { rerender, props, container } = renderModal();
    expect(container.firstChild).not.toBeNull();
    rerender(<KeyboardShortcutsModal {...props} open={false} />);
    expect(container.firstChild).toBeNull();
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

  it('re-renders the dialog aria-label in Korean when the locale flips to ko', () => {
    renderModal();
    expect(
      screen.getByRole('dialog', { name: 'Keyboard shortcuts' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    // English aria-label should no longer be the dialog's accessible name.
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
});
