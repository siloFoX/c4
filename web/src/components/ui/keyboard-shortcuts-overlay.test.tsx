import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import {
  DEFAULT_KEYBOARD_DEFAULT_CATEGORY,
  DEFAULT_KEYBOARD_TRIGGER_SHORTCUT,
  KeyboardShortcutsOverlay,
  filterShortcuts,
  formatKeyLabel,
  formatShortcut,
  getAltKeyLabel,
  getModKeyLabel,
  groupShortcuts,
  matchesShortcut,
  parseShortcutString,
  resolvePlatform,
} from './keyboard-shortcuts-overlay';
import type { KeyboardShortcut } from './keyboard-shortcuts-overlay';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const SHORTCUTS: KeyboardShortcut[] = [
  {
    id: 'open-cmd',
    keys: 'mod+k',
    label: 'Open command palette',
    category: 'Navigation',
  },
  {
    id: 'find',
    keys: 'mod+/',
    label: 'Find anything',
    category: 'Navigation',
  },
  {
    id: 'new-doc',
    keys: 'mod+shift+n',
    label: 'New document',
    description: 'Create a new untitled doc',
    category: 'Editing',
  },
  {
    id: 'save',
    keys: 'mod+s',
    label: 'Save',
    category: 'Editing',
  },
  {
    id: 'help',
    keys: '?',
    label: 'Show help',
  }, // no category -> default
];

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

describe('parseShortcutString', () => {
  it('splits on +', () => {
    expect(parseShortcutString('mod+shift+k')).toEqual([
      'mod',
      'shift',
      'k',
    ]);
  });
  it('trims whitespace', () => {
    expect(parseShortcutString('mod + k')).toEqual(['mod', 'k']);
  });
  it('drops empty tokens', () => {
    expect(parseShortcutString('++mod++k++')).toEqual(['mod', 'k']);
  });
  it('empty string -> []', () => {
    expect(parseShortcutString('')).toEqual([]);
  });
});

describe('resolvePlatform', () => {
  it('passes through explicit platforms', () => {
    expect(resolvePlatform('mac')).toBe('mac');
    expect(resolvePlatform('windows')).toBe('windows');
    expect(resolvePlatform('linux')).toBe('linux');
  });
  it('"auto" detects from navigator', () => {
    const r = resolvePlatform('auto');
    expect(['mac', 'windows', 'linux']).toContain(r);
  });
  it('undefined behaves like auto', () => {
    const r = resolvePlatform(undefined);
    expect(['mac', 'windows', 'linux']).toContain(r);
  });
});

describe('getModKeyLabel / getAltKeyLabel', () => {
  it('mac mod -> Cmd', () => {
    expect(getModKeyLabel('mac')).toBe('Cmd');
  });
  it('windows mod -> Ctrl', () => {
    expect(getModKeyLabel('windows')).toBe('Ctrl');
  });
  it('linux mod -> Ctrl', () => {
    expect(getModKeyLabel('linux')).toBe('Ctrl');
  });
  it('mac alt -> Option', () => {
    expect(getAltKeyLabel('mac')).toBe('Option');
  });
  it('windows alt -> Alt', () => {
    expect(getAltKeyLabel('windows')).toBe('Alt');
  });
});

describe('formatKeyLabel', () => {
  it('mod swaps with platform', () => {
    expect(formatKeyLabel('mod', 'mac')).toBe('Cmd');
    expect(formatKeyLabel('mod', 'windows')).toBe('Ctrl');
  });
  it('alt swaps with platform', () => {
    expect(formatKeyLabel('alt', 'mac')).toBe('Option');
    expect(formatKeyLabel('alt', 'windows')).toBe('Alt');
  });
  it('common named keys map to display labels', () => {
    expect(formatKeyLabel('shift')).toBe('Shift');
    expect(formatKeyLabel('escape')).toBe('Esc');
    expect(formatKeyLabel('enter')).toBe('Enter');
    expect(formatKeyLabel('space')).toBe('Space');
    expect(formatKeyLabel('tab')).toBe('Tab');
    expect(formatKeyLabel('backspace')).toBe('Backspace');
    expect(formatKeyLabel('delete')).toBe('Delete');
  });
  it('arrow keys render directional', () => {
    expect(formatKeyLabel('ArrowUp')).toBe('Up');
    expect(formatKeyLabel('arrowdown')).toBe('Down');
    expect(formatKeyLabel('arrowleft')).toBe('Left');
    expect(formatKeyLabel('arrowright')).toBe('Right');
  });
  it('single char -> uppercase', () => {
    expect(formatKeyLabel('k')).toBe('K');
  });
  it('unknown multi-char -> title-case', () => {
    expect(formatKeyLabel('home')).toBe('Home');
  });
  it('empty -> empty', () => {
    expect(formatKeyLabel('')).toBe('');
  });
});

describe('formatShortcut', () => {
  it('formats a multi-key combo', () => {
    expect(formatShortcut('mod+shift+k', 'mac')).toEqual([
      'Cmd',
      'Shift',
      'K',
    ]);
    expect(formatShortcut('mod+shift+k', 'windows')).toEqual([
      'Ctrl',
      'Shift',
      'K',
    ]);
  });
  it('empty string -> []', () => {
    expect(formatShortcut('', 'mac')).toEqual([]);
  });
});

describe('matchesShortcut', () => {
  function makeEvent(props: Partial<KeyboardEvent>): KeyboardEvent {
    return {
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      key: '',
      ...props,
    } as KeyboardEvent;
  }

  it('mac mod+/ matches metaKey + key=/', () => {
    expect(
      matchesShortcut(
        makeEvent({ metaKey: true, key: '/' }),
        'mod+/',
        'mac',
      ),
    ).toBe(true);
  });
  it('windows mod+/ matches ctrlKey + key=/', () => {
    expect(
      matchesShortcut(
        makeEvent({ ctrlKey: true, key: '/' }),
        'mod+/',
        'windows',
      ),
    ).toBe(true);
  });
  it('mac mod+/ does NOT match ctrlKey-only on mac', () => {
    expect(
      matchesShortcut(
        makeEvent({ ctrlKey: true, key: '/' }),
        'mod+/',
        'mac',
      ),
    ).toBe(false);
  });
  it('case-insensitive key compare', () => {
    expect(
      matchesShortcut(
        makeEvent({ metaKey: true, key: 'K' }),
        'mod+k',
        'mac',
      ),
    ).toBe(true);
  });
  it('extra shift modifier without it in pattern -> false', () => {
    expect(
      matchesShortcut(
        makeEvent({
          metaKey: true,
          shiftKey: true,
          key: '/',
        }),
        'mod+/',
        'mac',
      ),
    ).toBe(false);
  });
  it('mod+shift+n requires both', () => {
    expect(
      matchesShortcut(
        makeEvent({
          metaKey: true,
          shiftKey: true,
          key: 'n',
        }),
        'mod+shift+n',
        'mac',
      ),
    ).toBe(true);
    expect(
      matchesShortcut(
        makeEvent({ metaKey: true, key: 'n' }),
        'mod+shift+n',
        'mac',
      ),
    ).toBe(false);
  });
  it('shortcut with no main key -> false', () => {
    expect(
      matchesShortcut(
        makeEvent({ metaKey: true }),
        'mod',
        'mac',
      ),
    ).toBe(false);
  });
});

describe('filterShortcuts', () => {
  it('empty query returns a copy of the list', () => {
    expect(filterShortcuts(SHORTCUTS, '')).toEqual(SHORTCUTS);
    expect(filterShortcuts(SHORTCUTS, '   ')).toEqual(SHORTCUTS);
  });
  it('matches against the label (case-insensitive)', () => {
    expect(filterShortcuts(SHORTCUTS, 'save').map((s) => s.id)).toEqual(
      ['save'],
    );
  });
  it('matches against the description', () => {
    expect(
      filterShortcuts(SHORTCUTS, 'untitled').map((s) => s.id),
    ).toEqual(['new-doc']);
  });
  it('matches against the category', () => {
    const got = filterShortcuts(SHORTCUTS, 'editing').map((s) => s.id);
    expect(got).toContain('new-doc');
    expect(got).toContain('save');
  });
  it('matches against the keys string', () => {
    expect(filterShortcuts(SHORTCUTS, 'shift').map((s) => s.id)).toEqual(
      ['new-doc'],
    );
  });
});

describe('groupShortcuts', () => {
  it('groups by category', () => {
    const groups = groupShortcuts(SHORTCUTS);
    const map = Object.fromEntries(
      groups.map((g) => [g.category, g.shortcuts.length]),
    );
    expect(map['Navigation']).toBe(2);
    expect(map['Editing']).toBe(2);
    expect(map[DEFAULT_KEYBOARD_DEFAULT_CATEGORY]).toBe(1);
  });
  it('uses defaultCategory for entries with no category', () => {
    const groups = groupShortcuts(SHORTCUTS, [], 'Other');
    const map = Object.fromEntries(
      groups.map((g) => [g.category, g.shortcuts.length]),
    );
    expect(map['Other']).toBe(1);
  });
  it('honours categoryOrder', () => {
    const groups = groupShortcuts(SHORTCUTS, [
      'Editing',
      'Navigation',
    ]);
    expect(groups[0]?.category).toBe('Editing');
    expect(groups[1]?.category).toBe('Navigation');
  });
});

describe('Constants', () => {
  it('default trigger is mod+/', () => {
    expect(DEFAULT_KEYBOARD_TRIGGER_SHORTCUT).toBe('mod+/');
  });
  it('default category is "General"', () => {
    expect(DEFAULT_KEYBOARD_DEFAULT_CATEGORY).toBe('General');
  });
});

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

describe('KeyboardShortcutsOverlay component', () => {
  it('closed by default', () => {
    render(
      <KeyboardShortcutsOverlay shortcuts={SHORTCUTS} />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('defaultOpen=true opens on mount', () => {
    render(
      <KeyboardShortcutsOverlay
        shortcuts={SHORTCUTS}
        defaultOpen
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('controlled open=true forces open', () => {
    render(
      <KeyboardShortcutsOverlay shortcuts={SHORTCUTS} open />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('honors custom ariaLabel', () => {
    render(
      <KeyboardShortcutsOverlay
        shortcuts={SHORTCUTS}
        open
        ariaLabel="Hotkeys"
      />,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute(
      'aria-label',
      'Hotkeys',
    );
  });

  it('Cmd+/ trigger opens the overlay (mac)', () => {
    const onOpenChange = vi.fn();
    render(
      <KeyboardShortcutsOverlay
        shortcuts={SHORTCUTS}
        platform="mac"
        onOpenChange={onOpenChange}
      />,
    );
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '/',
          metaKey: true,
        }),
      );
    });
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('Ctrl+/ trigger opens the overlay (windows)', () => {
    const onOpenChange = vi.fn();
    render(
      <KeyboardShortcutsOverlay
        shortcuts={SHORTCUTS}
        platform="windows"
        onOpenChange={onOpenChange}
      />,
    );
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '/',
          ctrlKey: true,
        }),
      );
    });
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('trigger toggles the overlay closed when already open', () => {
    const onOpenChange = vi.fn();
    render(
      <KeyboardShortcutsOverlay
        shortcuts={SHORTCUTS}
        defaultOpen
        platform="mac"
        onOpenChange={onOpenChange}
      />,
    );
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '/',
          metaKey: true,
        }),
      );
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('Escape closes the overlay (closeOnEscape default)', () => {
    render(
      <KeyboardShortcutsOverlay
        shortcuts={SHORTCUTS}
        defaultOpen
      />,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closeOnEscape=false ignores Escape', () => {
    render(
      <KeyboardShortcutsOverlay
        shortcuts={SHORTCUTS}
        defaultOpen
        closeOnEscape={false}
      />,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Close button closes', () => {
    render(
      <KeyboardShortcutsOverlay
        shortcuts={SHORTCUTS}
        defaultOpen
      />,
    );
    fireEvent.click(
      screen.getByLabelText('Close shortcuts overlay'),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('backdrop click closes', () => {
    render(
      <KeyboardShortcutsOverlay
        shortcuts={SHORTCUTS}
        defaultOpen
      />,
    );
    const backdrop = screen.getByRole('dialog');
    fireEvent.click(backdrop, {
      target: backdrop,
      currentTarget: backdrop,
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closeOnBackdropClick=false leaves the overlay open', () => {
    render(
      <KeyboardShortcutsOverlay
        shortcuts={SHORTCUTS}
        defaultOpen
        closeOnBackdropClick={false}
      />,
    );
    const backdrop = screen.getByRole('dialog');
    fireEvent.click(backdrop, {
      target: backdrop,
      currentTarget: backdrop,
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders one section per category', () => {
    render(
      <KeyboardShortcutsOverlay
        shortcuts={SHORTCUTS}
        defaultOpen
      />,
    );
    const sections = document.querySelectorAll(
      '[data-section="keyboard-shortcuts-overlay-category"]',
    );
    expect(sections.length).toBeGreaterThanOrEqual(2);
  });

  it('renders one shortcut row per item', () => {
    render(
      <KeyboardShortcutsOverlay
        shortcuts={SHORTCUTS}
        defaultOpen
      />,
    );
    const rows = document.querySelectorAll(
      '[data-section="keyboard-shortcuts-overlay-shortcut"]',
    );
    expect(rows.length).toBe(SHORTCUTS.length);
  });

  it('renders <kbd> chips for each key in a combo', () => {
    render(
      <KeyboardShortcutsOverlay
        shortcuts={[
          {
            id: 'x',
            keys: 'mod+shift+k',
            label: 'Run X',
          },
        ]}
        defaultOpen
        platform="mac"
      />,
    );
    const kbds = document.querySelectorAll(
      '[data-section="keyboard-shortcuts-overlay-key"]',
    );
    expect(kbds.length).toBe(3);
    expect(kbds[0]?.textContent).toBe('Cmd');
    expect(kbds[1]?.textContent).toBe('Shift');
    expect(kbds[2]?.textContent).toBe('K');
  });

  it('platform=windows swaps mod -> Ctrl', () => {
    render(
      <KeyboardShortcutsOverlay
        shortcuts={[{ id: 'x', keys: 'mod+/', label: 'find' }]}
        defaultOpen
        platform="windows"
      />,
    );
    const kbds = document.querySelectorAll(
      '[data-section="keyboard-shortcuts-overlay-key"]',
    );
    expect(kbds[0]?.textContent).toBe('Ctrl');
  });

  it('per-shortcut description renders when supplied', () => {
    render(
      <KeyboardShortcutsOverlay
        shortcuts={SHORTCUTS}
        defaultOpen
      />,
    );
    expect(
      screen.getByText('Create a new untitled doc'),
    ).toBeInTheDocument();
  });

  it('search input filters the visible rows', () => {
    render(
      <KeyboardShortcutsOverlay
        shortcuts={SHORTCUTS}
        defaultOpen
      />,
    );
    fireEvent.change(screen.getByLabelText('Filter shortcuts'), {
      target: { value: 'save' },
    });
    const rows = document.querySelectorAll(
      '[data-section="keyboard-shortcuts-overlay-shortcut"]',
    );
    expect(rows.length).toBe(1);
    expect(rows[0]?.getAttribute('data-shortcut-id')).toBe('save');
  });

  it('search miss renders the empty state', () => {
    render(
      <KeyboardShortcutsOverlay
        shortcuts={SHORTCUTS}
        defaultOpen
      />,
    );
    fireEvent.change(screen.getByLabelText('Filter shortcuts'), {
      target: { value: '___no-match' },
    });
    expect(
      screen.getByText('No matching shortcuts'),
    ).toBeInTheDocument();
  });

  it('showSearch=false hides the search input', () => {
    render(
      <KeyboardShortcutsOverlay
        shortcuts={SHORTCUTS}
        defaultOpen
        showSearch={false}
      />,
    );
    expect(
      document.querySelector(
        '[data-section="keyboard-shortcuts-overlay-search"]',
      ),
    ).toBeNull();
  });

  it('search is reset whenever the overlay reopens', () => {
    const { rerender } = render(
      <KeyboardShortcutsOverlay
        shortcuts={SHORTCUTS}
        open
      />,
    );
    fireEvent.change(screen.getByLabelText('Filter shortcuts'), {
      target: { value: 'save' },
    });
    rerender(
      <KeyboardShortcutsOverlay
        shortcuts={SHORTCUTS}
        open={false}
      />,
    );
    rerender(
      <KeyboardShortcutsOverlay
        shortcuts={SHORTCUTS}
        open
      />,
    );
    expect(
      (screen.getByLabelText('Filter shortcuts') as HTMLInputElement)
        .value,
    ).toBe('');
  });

  it('categoryOrder pins the section order', () => {
    render(
      <KeyboardShortcutsOverlay
        shortcuts={SHORTCUTS}
        defaultOpen
        categoryOrder={['Editing', 'Navigation']}
      />,
    );
    const sections = document.querySelectorAll(
      '[data-section="keyboard-shortcuts-overlay-category"]',
    );
    expect(sections[0]?.getAttribute('data-category')).toBe('Editing');
    expect(sections[1]?.getAttribute('data-category')).toBe(
      'Navigation',
    );
  });

  it('panel renders inside the portal target', () => {
    render(
      <KeyboardShortcutsOverlay
        shortcuts={SHORTCUTS}
        defaultOpen
      />,
    );
    const portalRoot = document.getElementById('app-portal-root');
    expect(portalRoot).not.toBeNull();
    expect(portalRoot?.contains(screen.getByRole('dialog'))).toBe(
      true,
    );
  });

  it('root data attrs mirror state', () => {
    render(
      <KeyboardShortcutsOverlay
        shortcuts={SHORTCUTS}
        defaultOpen
        platform="mac"
      />,
    );
    const root = screen.getByRole('dialog');
    expect(root).toHaveAttribute('data-platform', 'mac');
    expect(root).toHaveAttribute(
      'data-shortcut-count',
      String(SHORTCUTS.length),
    );
    expect(root).toHaveAttribute('data-trigger', 'mod+/');
  });

  it('trigger hint renders the formatted trigger as <kbd> chips', () => {
    render(
      <KeyboardShortcutsOverlay
        shortcuts={SHORTCUTS}
        defaultOpen
        platform="mac"
      />,
    );
    const triggerKeys = document.querySelectorAll(
      '[data-section="keyboard-shortcuts-overlay-trigger-key"]',
    );
    // Cmd + /
    expect(triggerKeys.length).toBe(2);
    expect(triggerKeys[0]?.textContent).toBe('Cmd');
  });

  it('exposes a stable displayName', () => {
    expect(KeyboardShortcutsOverlay.displayName).toBe(
      'KeyboardShortcutsOverlay',
    );
  });
});
