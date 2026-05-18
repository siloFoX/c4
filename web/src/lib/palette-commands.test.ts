import { describe, expect, it, vi } from 'vitest';
import {
  buildRouteCommands,
  buildSettingsCommands,
  buildShortcutCommands,
  mergePaletteCommands,
  type RouteCommandSpec,
  type SettingsCommandSpec,
} from './palette-commands';

describe('buildRouteCommands', () => {
  it('maps RouteCommandSpec[] to Command[] with the default group', () => {
    const routes: RouteCommandSpec[] = [
      { id: 'go.workers', label: 'Go to Workers', action: () => {} },
    ];
    const cmds = buildRouteCommands(routes);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]?.id).toBe('go.workers');
    expect(cmds[0]?.label).toBe('Go to Workers');
    expect(cmds[0]?.group).toBe('Navigate');
  });

  it('respects a custom group label', () => {
    const cmds = buildRouteCommands(
      [{ id: 'g.x', label: 'X', action: () => {} }],
      'My Routes',
    );
    expect(cmds[0]?.group).toBe('My Routes');
  });

  it('forwards shortcut + keywords when present', () => {
    const cmds = buildRouteCommands([
      {
        id: 'go.workers',
        label: 'Workers',
        shortcut: 'g w',
        keywords: ['home', 'list'],
        action: () => {},
      },
    ]);
    expect(cmds[0]?.shortcut).toBe('g w');
    expect(cmds[0]?.keywords).toEqual(['home', 'list']);
  });

  it('omits shortcut / keywords when absent', () => {
    const cmds = buildRouteCommands([
      { id: 'plain', label: 'Plain', action: () => {} },
    ]);
    expect('shortcut' in (cmds[0] ?? {})).toBe(false);
    expect('keywords' in (cmds[0] ?? {})).toBe(false);
  });

  it('preserves action identity for runCommand handlers', () => {
    const action = vi.fn();
    const cmds = buildRouteCommands([
      { id: 'go.x', label: 'X', action },
    ]);
    cmds[0]?.action();
    expect(action).toHaveBeenCalledTimes(1);
  });
});

describe('buildShortcutCommands', () => {
  it('emits one command per row from SHORTCUT_ROWS by default', () => {
    const onSelect = vi.fn();
    const cmds = buildShortcutCommands({ onSelect });
    expect(cmds.length).toBeGreaterThan(0);
    // Every command id is prefixed with shortcut.
    expect(cmds.every((c) => c.id.startsWith('shortcut.'))).toBe(true);
    // Every command has a shortcut chip + a non-empty
    // keywords array (so fuzzy search hits "Ctrl+F" /
    // category / description).
    for (const cmd of cmds) {
      expect(cmd.shortcut).toBeTruthy();
      expect(cmd.keywords?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('respects a category filter', () => {
    const onSelect = vi.fn();
    const cmds = buildShortcutCommands({
      onSelect,
      category: 'actions',
    });
    expect(cmds.length).toBeGreaterThan(0);
    expect(cmds.every((c) => c.id.startsWith('shortcut.actions.'))).toBe(true);
  });

  it('honours a custom rows override', () => {
    const onSelect = vi.fn();
    const cmds = buildShortcutCommands({
      onSelect,
      rows: [
        { keys: 'Cmd+Q', descriptionKey: 'shortcuts.openHelp', category: 'navigation' },
      ],
    });
    expect(cmds).toHaveLength(1);
    expect(cmds[0]?.id).toBe('shortcut.navigation.Cmd+Q');
  });

  it('invokes onSelect with the matching row on action', () => {
    const onSelect = vi.fn();
    const rows = [
      { keys: 'Ctrl+F', descriptionKey: 'shortcuts.terminalSearch', category: 'actions' as const },
    ];
    const cmds = buildShortcutCommands({ onSelect, rows });
    cmds[0]?.action();
    expect(onSelect).toHaveBeenCalledWith(rows[0]);
  });

  it('respects a custom group label', () => {
    const onSelect = vi.fn();
    const cmds = buildShortcutCommands({
      onSelect,
      group: 'Keyboard',
      rows: [{ keys: 'X', descriptionKey: 'shortcuts.openHelp', category: 'view' }],
    });
    expect(cmds[0]?.group).toBe('Keyboard');
  });
});

describe('buildSettingsCommands', () => {
  it('maps SettingsCommandSpec[] to Command[] with the default group', () => {
    const entries: SettingsCommandSpec[] = [
      { id: 'settings.theme', label: 'Toggle Theme', action: () => {} },
    ];
    const cmds = buildSettingsCommands(entries);
    expect(cmds[0]?.group).toBe('Settings');
  });

  it('forwards keywords', () => {
    const cmds = buildSettingsCommands([
      {
        id: 'settings.locale',
        label: 'Switch Locale',
        keywords: ['language', 'i18n'],
        action: () => {},
      },
    ]);
    expect(cmds[0]?.keywords).toEqual(['language', 'i18n']);
  });
});

describe('mergePaletteCommands', () => {
  it('concatenates lists and drops duplicate ids (first wins)', () => {
    const a = buildRouteCommands([
      { id: 'go.x', label: 'X (from A)', action: () => {} },
    ]);
    const b = buildRouteCommands([
      { id: 'go.x', label: 'X (from B)', action: () => {} },
      { id: 'go.y', label: 'Y', action: () => {} },
    ]);
    const merged = mergePaletteCommands(a, b);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.label).toBe('X (from A)');
    expect(merged[1]?.id).toBe('go.y');
  });

  it('returns an empty array when called with no lists', () => {
    expect(mergePaletteCommands()).toEqual([]);
  });

  it('preserves ordering across lists', () => {
    const a = buildRouteCommands([
      { id: 'a', label: 'A', action: () => {} },
    ]);
    const b = buildRouteCommands([
      { id: 'b', label: 'B', action: () => {} },
    ]);
    const c = buildRouteCommands([
      { id: 'c', label: 'C', action: () => {} },
    ]);
    const merged = mergePaletteCommands(a, b, c);
    expect(merged.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });
});
