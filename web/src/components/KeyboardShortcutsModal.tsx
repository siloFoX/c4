import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Accordion, Chip, Dialog, IconButton, Kbd, SearchBar } from './ui';
import type { AccordionItem } from './ui';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import { formatKeymapForCurrentPlatform } from '../lib/shortcut-keymap';
import { useRecentlyUsedShortcuts } from '../lib/shortcut-recently-used';

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export type ShortcutCategory = 'navigation' | 'actions' | 'view';

interface Row {
  keys: string;
  descriptionKey: string;
  category: ShortcutCategory;
}

// Canonical list of shortcuts the web UI exposes. Tests lock this list
// so new shortcuts must ship their documentation at the same time.
export const SHORTCUT_ROWS: Row[] = [
  { keys: '?', descriptionKey: 'shortcuts.openHelp', category: 'navigation' },
  { keys: 'Shift+/', descriptionKey: 'shortcuts.openHelp', category: 'navigation' },
  { keys: 'H', descriptionKey: 'shortcuts.openHelpDrawer', category: 'navigation' },
  { keys: 'Ctrl+B', descriptionKey: 'shortcuts.toggleSidebar', category: 'navigation' },
  { keys: 'T', descriptionKey: 'shortcuts.toggleTour', category: 'navigation' },
  // (v1.11.250, TODO 11.232) Multi-key chord shortcuts. The first
  // letter starts a 1500 ms buffer; the second key completes the
  // chord. Chord keys are case-insensitive and skipped while focus
  // sits on a text input.
  { keys: 'g g', descriptionKey: 'shortcuts.gotoTop', category: 'navigation' },
  { keys: 'g h', descriptionKey: 'shortcuts.gotoHome', category: 'navigation' },
  { keys: 'g w', descriptionKey: 'shortcuts.gotoWorkers', category: 'navigation' },
  { keys: 'Enter', descriptionKey: 'shortcuts.sendChat', category: 'actions' },
  { keys: 'Shift+Enter', descriptionKey: 'shortcuts.newLine', category: 'actions' },
  { keys: 'Ctrl+F', descriptionKey: 'shortcuts.terminalSearch', category: 'actions' },
  { keys: 'Esc', descriptionKey: 'shortcuts.closeOverlay', category: 'view' },
];

const SECTION_ORDER: ShortcutCategory[] = ['navigation', 'actions', 'view'];

const SECTION_KEYS: Record<ShortcutCategory, string> = {
  navigation: 'shortcuts.section.navigation',
  actions: 'shortcuts.section.actions',
  view: 'shortcuts.section.view',
};

// (v1.11.259, TODO 11.241) Pure matcher exported for unit coverage.
// Matches against three surfaces: the binding (row.keys), the
// translated description (the human-readable label), and the
// translated section/category name (so "nav" / "navigation"
// filters to every navigation shortcut). All comparisons are
// case-insensitive substring matches. An empty / whitespace-only
// needle matches everything.
export function matchesShortcut(row: Row, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  if (row.keys.toLowerCase().includes(n)) return true;
  const description = t(row.descriptionKey).toLowerCase();
  if (description.includes(n)) return true;
  const sectionLabel = t(SECTION_KEYS[row.category]).toLowerCase();
  if (sectionLabel.includes(n)) return true;
  // Raw category id ("navigation" / "actions" / "view") -- matches
  // even when the locale flips, so an English operator on a Korean
  // session can still type "navigation" and get a hit.
  if (row.category.toLowerCase().includes(n)) return true;
  return false;
}

export function KeyboardShortcutsModal({
  open,
  onClose,
}: KeyboardShortcutsModalProps) {
  useLocale();
  const [filter, setFilter] = useState('');
  const recentlyUsed = useRecentlyUsedShortcuts();

  const filtered = useMemo(
    () => SHORTCUT_ROWS.filter((row) => matchesShortcut(row, filter)),
    [filter],
  );

  const trimmedFilter = filter.trim();
  const isFiltering = trimmedFilter.length > 0;

  const grouped = useMemo(() => {
    const out: Record<ShortcutCategory, Row[]> = {
      navigation: [],
      actions: [],
      view: [],
    };
    for (const row of filtered) out[row.category].push(row);
    return out;
  }, [filtered]);

  // (v1.11.330, TODO 11.312) Recently-used rows. Look up
  // the canonical Row for each key in `recentlyUsed`,
  // skip keys that are no longer in SHORTCUT_ROWS (e.g.
  // a shortcut that was removed), and apply the current
  // filter so the section participates in the search
  // contract.
  const recentRows = useMemo(() => {
    const byKey = new Map<string, Row>();
    for (const row of SHORTCUT_ROWS) {
      byKey.set(row.keys, row);
    }
    const out: Row[] = [];
    for (const key of recentlyUsed) {
      const row = byKey.get(key);
      if (row && matchesShortcut(row, filter)) {
        out.push(row);
      }
    }
    return out;
  }, [recentlyUsed, filter]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('shortcuts.heading')}
      className="max-w-md"
    >
      <div data-shortcuts-modal>
        <div className="mb-3 flex items-center justify-end">
          <IconButton
            aria-label={t('common.close')}
            onClick={onClose}
            icon={<X className="h-4 w-4" />}
          />
        </div>
        <div className="mb-3 flex items-center gap-2">
          <div className="flex-1">
            <SearchBar
              size="sm"
              value={filter}
              onChange={setFilter}
              onDebouncedChange={setFilter}
              placeholder={t('shortcuts.search.placeholder')}
              ariaLabel={t('shortcuts.search.ariaLabel')}
              data-shortcuts-filter
            />
          </div>
          {isFiltering ? (
            <Chip
              tone="neutral"
              variant="subtle"
              size="sm"
              aria-live="polite"
              data-testid="shortcuts-result-count"
            >
              {filtered.length} / {SHORTCUT_ROWS.length}
            </Chip>
          ) : null}
        </div>
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t('shortcuts.search.empty')}
          </p>
        ) : (
          <>
            {/* (v1.11.330, TODO 11.312) Recently-used
                shortcuts section. Rendered above the
                category accordion when there is history
                AND the filter still matches at least
                one recent row. Same Kbd / description
                shape as the category rows. */}
            {recentRows.length > 0 ? (
              <section
                data-shortcuts-section="recent"
                className="mb-3 rounded-md border border-border bg-muted/30 p-3"
              >
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('shortcuts.section.recent')}
                </h3>
                <table className="w-full text-left text-sm">
                  <tbody>
                    {recentRows.map((row) => (
                      <tr
                        key={`recent-${row.keys}-${row.descriptionKey}`}
                        className="align-middle"
                      >
                        <td className="w-32 py-1 pr-2">
                          <Kbd
                            className={cn(
                              'border-border py-0.5 text-foreground',
                            )}
                          >
                            {formatKeymapForCurrentPlatform(row.keys)}
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
            ) : null}
            {/* (v1.11.290, TODO 11.272) Shortcut categories migrated
                from inline <section> + SectionDivider to the Accordion
                primitive (multi mode + all categories default-open so
                the byte-identical first-load surface is preserved).
                Operator can now collapse a category to focus on the
                others, and the role=region / aria-labelledby /
                ArrowDown / Home keyboard contract comes for free. */}
            <Accordion
              mode="multi"
              ariaLabel="Keyboard shortcut categories"
              data-shortcuts-accordion="true"
              defaultOpenIds={SECTION_ORDER.filter(
                (cat) => grouped[cat].length > 0,
              )}
              items={SECTION_ORDER.filter(
                (cat) => grouped[cat].length > 0,
              ).map<AccordionItem>((cat) => ({
                id: cat,
                title: t(SECTION_KEYS[cat]),
                content: (
                  <table
                    className="w-full text-left text-sm"
                    data-shortcuts-section={cat}
                  >
                    <tbody>
                      {grouped[cat].map((row) => (
                        <tr
                          key={`${row.keys}-${row.descriptionKey}`}
                          className="align-middle"
                        >
                          <td className="w-32 py-1 pr-2">
                            <Kbd
                              className={cn(
                                'border-border py-0.5 text-foreground',
                              )}
                            >
                              {formatKeymapForCurrentPlatform(row.keys)}
                            </Kbd>
                          </td>
                          <td className="py-1 text-muted-foreground">
                            {t(row.descriptionKey)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ),
              }))}
            />
          </>
        )}
      </div>
    </Dialog>
  );
}

KeyboardShortcutsModal.displayName = 'KeyboardShortcutsModal';
