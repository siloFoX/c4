import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Keyboard, RotateCcw } from 'lucide-react';
import PageFrame from './PageFrame';
import {
  Alert,
  Button,
  Dialog,
  Kbd,
  Panel,
} from '../components/ui';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import {
  BINDING_IDS,
  DEFAULT_BINDINGS,
  parseCombo,
  resetBindings,
  setBinding,
  useBindings,
  type BindingId,
} from '../lib/keyboard-bindings';

// (v1.11.218) KeyboardRemap -- per-user remapping of the canonical
// keyboard bindings. Each row shows the action label + the active
// combo (as <Kbd>) and offers an Edit button that opens a dialog
// which listens for the next keypress and persists the captured combo
// through `setBinding()` in `lib/keyboard-bindings.ts`. Reset all
// flushes every override and restores the defaults.

interface RowDef {
  id: BindingId;
  labelKey: string;
}

const ROWS: RowDef[] = [
  { id: 'commandPalette', labelKey: 'keyboardRemap.action.commandPalette' },
  { id: 'help', labelKey: 'keyboardRemap.action.help' },
  { id: 'newWorker', labelKey: 'keyboardRemap.action.newWorker' },
  { id: 'closeWorker', labelKey: 'keyboardRemap.action.closeWorker' },
  { id: 'mergeBranch', labelKey: 'keyboardRemap.action.mergeBranch' },
  { id: 'toggleTheme', labelKey: 'keyboardRemap.action.toggleTheme' },
  { id: 'focusSearch', labelKey: 'keyboardRemap.action.focusSearch' },
  { id: 'gotoHealth', labelKey: 'keyboardRemap.action.gotoHealth' },
  { id: 'gotoSessions', labelKey: 'keyboardRemap.action.gotoSessions' },
  { id: 'gotoHistory', labelKey: 'keyboardRemap.action.gotoHistory' },
];

function readEvent(e: ReactKeyboardEvent<HTMLDivElement>): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('mod');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  const key = e.key;
  if (!key) return parseCombo(parts.join('+'));
  const lower = key.toLowerCase();
  if (['control', 'shift', 'alt', 'meta', 'os'].includes(lower)) {
    return parseCombo(parts.join('+'));
  }
  parts.push(lower);
  return parseCombo(parts.join('+'));
}

interface EditState {
  id: BindingId;
  labelKey: string;
  captured: string;
}

export default function KeyboardRemap() {
  useLocale();
  const bindings = useBindings();
  const [edit, setEdit] = useState<EditState | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  const hasOverrides = useMemo(
    () => BINDING_IDS.some((id) => bindings[id] !== DEFAULT_BINDINGS[id]),
    [bindings],
  );

  useEffect(() => {
    if (!edit) return;
    const id = window.setTimeout(() => {
      captureRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [edit]);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!edit) return;
      if (e.key === 'Tab') return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setEdit(null);
        return;
      }
      const combo = readEvent(e);
      if (!combo) return;
      setEdit({ ...edit, captured: combo });
    },
    [edit],
  );

  const onSave = useCallback(() => {
    if (!edit || !edit.captured) return;
    setBinding(edit.id, edit.captured);
    setEdit(null);
  }, [edit]);

  const onCancel = useCallback(() => {
    setEdit(null);
  }, []);

  const onReset = useCallback(() => {
    resetBindings();
  }, []);

  return (
    <PageFrame
      title={t('keyboardRemap.title')}
      description={t('keyboardRemap.description')}
      actions={
        <Button
          variant="ghost"
          onClick={onReset}
          disabled={!hasOverrides}
          data-keyboard-remap-reset
        >
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
          {t('keyboardRemap.resetAll')}
        </Button>
      }
    >
      <div data-keyboard-remap className="flex flex-col gap-3">
        <Alert
          variant="info"
          icon={<Keyboard className="h-4 w-4" aria-hidden="true" />}
        >
          {t('keyboardRemap.hint')}
        </Alert>
        <Panel>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-semibold">
                  {t('keyboardRemap.col.action')}
                </th>
                <th className="px-3 py-2 font-semibold">
                  {t('keyboardRemap.col.binding')}
                </th>
                <th className="px-3 py-2 text-right font-semibold">
                  {t('keyboardRemap.col.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const combo = bindings[row.id];
                const isOverride = combo !== DEFAULT_BINDINGS[row.id];
                return (
                  <tr
                    key={row.id}
                    data-keyboard-remap-row={row.id}
                    className="border-b border-border/60 last:border-b-0"
                  >
                    <td className="px-3 py-2 align-middle text-foreground">
                      {t(row.labelKey)}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <Kbd
                        className={cn(
                          'border-border py-0.5 text-foreground',
                          isOverride && 'border-primary text-primary',
                        )}
                        data-keyboard-remap-combo
                      >
                        {combo}
                      </Kbd>
                    </td>
                    <td className="px-3 py-2 text-right align-middle">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setEdit({
                            id: row.id,
                            labelKey: row.labelKey,
                            captured: '',
                          })
                        }
                        data-keyboard-remap-edit={row.id}
                      >
                        {t('keyboardRemap.edit')}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>

      <Dialog
        open={edit !== null}
        onClose={onCancel}
        title={
          edit
            ? `${t('keyboardRemap.dialog.title')} - ${t(edit.labelKey)}`
            : t('keyboardRemap.dialog.title')
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="default"
              onClick={onSave}
              disabled={!edit || !edit.captured}
              data-keyboard-remap-save
            >
              {t('keyboardRemap.dialog.save')}
            </Button>
          </div>
        }
      >
        <div
          ref={captureRef}
          tabIndex={0}
          role="textbox"
          aria-label={t('keyboardRemap.dialog.captureAria')}
          onKeyDown={onKeyDown}
          data-keyboard-remap-capture
          className="flex flex-col gap-3 rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <p className="text-muted-foreground">
            {t('keyboardRemap.dialog.prompt')}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {t('keyboardRemap.dialog.captured')}:
            </span>
            {edit && edit.captured ? (
              <Kbd className="border-primary text-primary">{edit.captured}</Kbd>
            ) : (
              <span className="text-muted-foreground">
                {t('keyboardRemap.dialog.waiting')}
              </span>
            )}
          </div>
        </div>
      </Dialog>
    </PageFrame>
  );
}

KeyboardRemap.displayName = 'KeyboardRemap';
