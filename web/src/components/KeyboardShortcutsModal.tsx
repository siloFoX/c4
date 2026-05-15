import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Dialog, IconButton, Kbd, SearchBar, Separator } from './ui';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';

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

export function KeyboardShortcutsModal({
  open,
  onClose,
}: KeyboardShortcutsModalProps) {
  useLocale();
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return SHORTCUT_ROWS;
    return SHORTCUT_ROWS.filter((row) => {
      const label = t(row.descriptionKey).toLowerCase();
      return (
        row.keys.toLowerCase().includes(needle) || label.includes(needle)
      );
    });
  }, [filter]);

  const grouped = useMemo(() => {
    const out: Record<ShortcutCategory, Row[]> = {
      navigation: [],
      actions: [],
      view: [],
    };
    for (const row of filtered) out[row.category].push(row);
    return out;
  }, [filtered]);

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
        <div className="mb-3">
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
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t('shortcuts.search.empty')}
          </p>
        ) : (
          <div className="space-y-3">
            {SECTION_ORDER.map((cat, idx) => {
              const rows = grouped[cat];
              if (rows.length === 0) return null;
              return (
                <section key={cat} data-shortcuts-section={cat}>
                  {idx > 0 ? <Separator className="mb-3" /> : null}
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(SECTION_KEYS[cat])}
                  </h3>
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {rows.map((row) => (
                        <tr
                          key={`${row.keys}-${row.descriptionKey}`}
                          className="align-middle"
                        >
                          <td className="w-32 py-1 pr-2">
                            <Kbd className={cn('border-border py-0.5 text-foreground')}>
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
    </Dialog>
  );
}

KeyboardShortcutsModal.displayName = 'KeyboardShortcutsModal';
