import type { Command } from '../components/ui/command-palette';
import {
  SHORTCUT_ROWS,
  type ShortcutCategory,
} from '../components/KeyboardShortcutsModal';
import { formatKeymapForCurrentPlatform } from './shortcut-keymap';
import { t } from './i18n';

// (v1.11.369, TODO 11.351) Builder helpers that
// aggregate `Command[]` entries for the command
// palette from external sources (route table,
// shortcut registry, settings sub-routes).
//
// Each builder returns a plain `Command[]` so a
// host can spread the result into its own
// `paletteCommands` memo without coupling its
// scope to any particular source. The helpers are
// pure (no React, no side effects beyond the
// callbacks the host passes in) so unit tests
// drive them directly.

// ---- Routes ----------------------------------------------------

export interface RouteCommandSpec {
  // Canonical id ('go.workers'), used by recents.
  id: string;
  // Human-readable label ('Go to Workers').
  label: string;
  // Optional shortcut hint surfaced as a `<kbd>`
  // chip in the palette row.
  shortcut?: string;
  // Optional fuzzy keywords ('home', 'list').
  keywords?: string[];
  // Required action handler.
  action: () => void;
}

export function buildRouteCommands(
  routes: readonly RouteCommandSpec[],
  group = 'Navigate',
): Command[] {
  return routes.map((r) => ({
    id: r.id,
    label: r.label,
    group,
    action: r.action,
    ...(r.shortcut !== undefined ? { shortcut: r.shortcut } : {}),
    ...(r.keywords !== undefined ? { keywords: r.keywords } : {}),
  }));
}

// ---- Shortcut registry ----------------------------------------

// Convert the `SHORTCUT_ROWS` registry (canonical
// list of keyboard shortcuts documented in the
// help modal) into `Command[]` entries so the
// operator can fuzzy-search for "Ctrl+F" or
// "search" inside the palette and land on the
// matching shortcut.
//
// Each shortcut command is a passive lookup -- it
// does NOT trigger the underlying action because
// the palette is closed by an Enter / click and
// the modifier+letter keystroke is not always
// safe to fire programmatically. Instead, the
// default action opens the keyboard shortcuts
// modal so the operator can read the binding +
// see the related shortcuts in context.
//
// Hosts that want a different default can pass
// `actionFor` to produce a custom action per row
// (e.g., scroll the modal to the row, or fire the
// shortcut directly).

export interface BuildShortcutCommandsOptions {
  // Required: invoked when a shortcut command is
  // chosen. Hosts typically wire `openShortcutsModal`
  // from `components/HelpUIRoot`.
  onSelect: (row: { keys: string; descriptionKey: string; category: ShortcutCategory }) => void;
  // Optional category filter. When set, only rows
  // matching the category are emitted.
  category?: ShortcutCategory;
  // Group label rendered above the shortcut rows
  // in the palette. Defaults to "Shortcuts".
  group?: string;
  // Optional override list -- by default the
  // builder reads `SHORTCUT_ROWS` from the modal.
  rows?: ReadonlyArray<{
    keys: string;
    descriptionKey: string;
    category: ShortcutCategory;
  }>;
}

export function buildShortcutCommands(
  options: BuildShortcutCommandsOptions,
): Command[] {
  const {
    onSelect,
    category,
    group = 'Shortcuts',
    rows = SHORTCUT_ROWS,
  } = options;
  return rows
    .filter((row) => (category ? row.category === category : true))
    .map((row) => {
      const description = t(row.descriptionKey);
      const display = formatKeymapForCurrentPlatform(row.keys);
      return {
        id: `shortcut.${row.category}.${row.keys}`,
        label: description,
        group,
        shortcut: display,
        keywords: [row.keys, row.category, description, display],
        action: () => onSelect(row),
      } satisfies Command;
    });
}

// ---- Settings sub-routes --------------------------------------

export interface SettingsCommandSpec {
  // Canonical id ('settings.theme').
  id: string;
  // Human-readable label ('Toggle Theme').
  label: string;
  // Optional keywords.
  keywords?: string[];
  // Required action handler.
  action: () => void;
}

export function buildSettingsCommands(
  entries: readonly SettingsCommandSpec[],
  group = 'Settings',
): Command[] {
  return entries.map((s) => ({
    id: s.id,
    label: s.label,
    group,
    action: s.action,
    ...(s.keywords !== undefined ? { keywords: s.keywords } : {}),
  }));
}

// ---- Merge helper ---------------------------------------------

// Concatenates multiple `Command[]` lists and
// drops duplicate ids (first occurrence wins).
// Useful when a host composes routes + shortcuts
// + settings into one palette source.
export function mergePaletteCommands(
  ...lists: ReadonlyArray<readonly Command[]>
): Command[] {
  const seen = new Set<string>();
  const out: Command[] = [];
  for (const list of lists) {
    for (const cmd of list) {
      if (seen.has(cmd.id)) continue;
      seen.add(cmd.id);
      out.push(cmd);
    }
  }
  return out;
}
