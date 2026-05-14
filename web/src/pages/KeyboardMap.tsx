import { useMemo, useState } from 'react';
import { Keyboard, KeyboardOff } from 'lucide-react';
import PageFrame from './PageFrame';
import { EmptyState, Kbd, SearchBar, Separator } from '../components/ui';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import { SHORTCUT_ROWS, type ShortcutCategory } from '../components/KeyboardShortcutsModal';

// (v1.11.205) KeyboardMap -- full-page reference of every keyboard
// binding wired into the web UI. Pulls the canonical rows from
// KeyboardShortcutsModal.SHORTCUT_ROWS and extends them with the
// bindings that overlays / menus / forms expose but were never
// surfaced in the compact modal (Escape close, command palette
// activate, cycle next, etc).

type ExtendedCategory =
  | ShortcutCategory
  | 'editing'
  | 'global'
  | 'custom';

interface MapRow {
  keys: string;
  descriptionKey: string;
  category: ExtendedCategory;
}

// Section headings + ordering. Modal categories first so the page
// reads "easy stuff at the top, niche stuff at the bottom".
const SECTION_ORDER: ExtendedCategory[] = [
  'navigation',
  'actions',
  'view',
  'editing',
  'global',
  'custom',
];

const SECTION_LABEL_KEY: Record<ExtendedCategory, string> = {
  navigation: 'keyboardMap.section.navigation',
  actions: 'keyboardMap.section.actions',
  view: 'keyboardMap.section.view',
  editing: 'keyboardMap.section.editing',
  global: 'keyboardMap.section.global',
  custom: 'keyboardMap.section.custom',
};

// Rows that extend the modal set. Anything Drawer / Dialog /
// CommandPalette / form-level emits but the compact modal does not
// document. Description keys live in en.json + ko.json.
const EXTRA_ROWS: MapRow[] = [
  { keys: 'Escape', descriptionKey: 'keyboardMap.row.dialogClose', category: 'view' },
  { keys: 'Escape', descriptionKey: 'keyboardMap.row.drawerClose', category: 'view' },
  { keys: 'Ctrl+K', descriptionKey: 'keyboardMap.row.commandPaletteOpen', category: 'actions' },
  { keys: 'Enter', descriptionKey: 'keyboardMap.row.commandPaletteAccept', category: 'actions' },
  { keys: 'Down', descriptionKey: 'keyboardMap.row.menuMoveDown', category: 'navigation' },
  { keys: 'Up', descriptionKey: 'keyboardMap.row.menuMoveUp', category: 'navigation' },
  { keys: 'Tab', descriptionKey: 'keyboardMap.row.cycleNext', category: 'navigation' },
  { keys: 'Shift+Tab', descriptionKey: 'keyboardMap.row.cyclePrev', category: 'navigation' },
  { keys: 'Ctrl+Enter', descriptionKey: 'keyboardMap.row.formSubmit', category: 'actions' },
  { keys: 'Ctrl+]', descriptionKey: 'keyboardMap.row.detachWorker', category: 'global' },
  { keys: 'Ctrl+C', descriptionKey: 'keyboardMap.row.copySelection', category: 'editing' },
  { keys: 'Ctrl+V', descriptionKey: 'keyboardMap.row.pasteSelection', category: 'editing' },
  { keys: 'Ctrl+Z', descriptionKey: 'keyboardMap.row.undo', category: 'editing' },
  { keys: 'Ctrl+Shift+Z', descriptionKey: 'keyboardMap.row.redo', category: 'editing' },
];

// Map the canonical SHORTCUT_ROWS into the extended row shape so the
// section grouping is uniform. Modal categories already line up.
const MODAL_ROWS: MapRow[] = SHORTCUT_ROWS.map((row) => ({
  keys: row.keys,
  descriptionKey: row.descriptionKey,
  category: row.category,
}));

export const ALL_ROWS: MapRow[] = [...MODAL_ROWS, ...EXTRA_ROWS];

export default function KeyboardMap() {
  useLocale();
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return ALL_ROWS;
    return ALL_ROWS.filter((row) => {
      const label = t(row.descriptionKey).toLowerCase();
      return (
        row.keys.toLowerCase().includes(needle) || label.includes(needle)
      );
    });
  }, [filter]);

  const grouped = useMemo(() => {
    const out: Record<ExtendedCategory, MapRow[]> = {
      navigation: [],
      actions: [],
      view: [],
      editing: [],
      global: [],
      custom: [],
    };
    for (const row of filtered) out[row.category].push(row);
    return out;
  }, [filtered]);

  const noMatches = filtered.length === 0;

  return (
    <PageFrame
      title={t('keyboardMap.title')}
      description={t('keyboardMap.description')}
    >
      <div data-keyboard-map>
        <div className="mb-4">
          <SearchBar
            size="md"
            value={filter}
            onChange={setFilter}
            onDebouncedChange={setFilter}
            placeholder={t('keyboardMap.search.placeholder')}
            ariaLabel={t('keyboardMap.search.ariaLabel')}
            data-keyboard-map-filter
          />
        </div>
        {noMatches ? (
          <EmptyState
            icon={<KeyboardOff className="h-10 w-10" />}
            title={t('keyboardMap.empty.title')}
            description={t('keyboardMap.empty.description')}
            data-testid="keyboard-map-empty"
          />
        ) : (
          <div className="flex flex-col gap-4">
            {SECTION_ORDER.map((cat, idx) => {
              const rows = grouped[cat];
              if (rows.length === 0) return null;
              return (
                <section
                  key={cat}
                  data-keyboard-map-section={cat}
                  className="flex flex-col gap-2"
                >
                  {idx > 0 ? <Separator /> : null}
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t(SECTION_LABEL_KEY[cat])}</span>
                  </h3>
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {rows.map((row, rIdx) => (
                        <tr
                          key={`${cat}-${row.keys}-${row.descriptionKey}-${rIdx}`}
                          className="align-middle"
                        >
                          <td className="w-40 py-1 pr-3">
                            <Kbd
                              className={cn(
                                'border-border py-0.5 text-foreground',
                              )}
                            >
                              {row.keys}
                            </Kbd>
                          </td>
                          <td className="py-1 text-muted-foreground">
                            {t(row.descriptionKey)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </PageFrame>
  );
}

KeyboardMap.displayName = 'KeyboardMap';
