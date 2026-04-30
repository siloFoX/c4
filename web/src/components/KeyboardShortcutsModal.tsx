import { useEffect } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './ui';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

interface Row {
  keys: string;
  descriptionKey: string;
}

// Canonical list of shortcuts the web UI exposes. Tests lock this list
// so new shortcuts must ship their documentation at the same time.
export const SHORTCUT_ROWS: Row[] = [
  { keys: '?', descriptionKey: 'shortcuts.openHelp' },
  { keys: 'Shift+/', descriptionKey: 'shortcuts.openHelp' },
  { keys: 'H', descriptionKey: 'shortcuts.openHelpDrawer' },
  { keys: 'Esc', descriptionKey: 'shortcuts.closeOverlay' },
  { keys: 'Ctrl+F', descriptionKey: 'shortcuts.terminalSearch' },
  { keys: 'Enter', descriptionKey: 'shortcuts.sendChat' },
  { keys: 'Shift+Enter', descriptionKey: 'shortcuts.newLine' },
  { keys: 'T', descriptionKey: 'shortcuts.toggleTour' },
  // (TODO 8.40) Sidebar collapse — VS Code convention, mirrors
  // App.tsx's keydown handler. Both Ctrl and Cmd trigger; we list
  // Ctrl+B since the rest of the table uses Ctrl naming.
  { keys: 'Ctrl+B', descriptionKey: 'shortcuts.toggleSidebar' },
];

// 8.33: ? key cheat sheet. Rendered as an overlay modal so the user can
// glance at it from any tab. Locale-aware via useLocale().

export function KeyboardShortcutsModal({
  open,
  onClose,
}: KeyboardShortcutsModalProps) {
  useLocale();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('shortcuts.heading')}
      data-shortcuts-modal
      className={cn(
        'fixed inset-0 z-[95] flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm',
      )}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            {t('shortcuts.heading')}
          </h2>
          <IconButton
            aria-label={t('common.close')}
            onClick={onClose}
            icon={<X className="h-4 w-4" />}
          />
        </div>
        <table className="w-full text-left text-sm">
          <tbody>
            {SHORTCUT_ROWS.map((row) => (
              <tr key={`${row.keys}-${row.descriptionKey}`} className="align-middle">
                <td className="w-32 py-1 pr-2">
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                    {row.keys}
                  </kbd>
                </td>
                <td className="py-1 text-muted-foreground">
                  {t(row.descriptionKey)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

KeyboardShortcutsModal.displayName = 'KeyboardShortcutsModal';
