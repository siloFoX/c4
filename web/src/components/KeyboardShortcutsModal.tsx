import { X } from 'lucide-react';
import { Dialog, IconButton } from './ui';
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
  { keys: 'Ctrl+B', descriptionKey: 'shortcuts.toggleSidebar' },
];

export function KeyboardShortcutsModal({
  open,
  onClose,
}: KeyboardShortcutsModalProps) {
  useLocale();

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
    </Dialog>
  );
}

KeyboardShortcutsModal.displayName = 'KeyboardShortcutsModal';
