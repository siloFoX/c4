import { useCallback, useState } from 'react';
import { apiPatch } from '../lib/api';
import { Button, Input } from './ui';
import { t, tFormat, useLocale } from '../lib/i18n';

// (v1.10.559) Extracted from SpecialistsView. Tag editor —
// PATCH /specialists/:id/tags with replace / add / remove modes.
// Operator types a comma-separated list; a leading '+' means
// add, leading '-' means remove, otherwise replace wholesale.
//
// Owns its own open/value/busy state; bubbles save success
// via `onSaved` and surface-level errors via `onError`.

interface Props {
  specialistId: string;
  tags: string[] | undefined;
  onSaved: () => void;
  onError: (msg: string) => void;
}

export default function SpecialistsTagEditor({ specialistId, tags, onSaved, onError }: Props) {
  useLocale();

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSave = useCallback(async () => {
    const raw = value.trim();
    if (!raw) return;
    let mode: 'replace' | 'add' | 'remove' = 'replace';
    let tagsRaw = raw;
    if (raw.startsWith('+')) { mode = 'add'; tagsRaw = raw.slice(1); }
    else if (raw.startsWith('-')) { mode = 'remove'; tagsRaw = raw.slice(1); }
    const next = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);
    // Empty replace = clear; we want intentional clears, so guard.
    if (next.length === 0 && mode === 'replace') return;
    setBusy(true);
    try {
      await apiPatch(`/api/specialists/${encodeURIComponent(specialistId)}/tags`, { tags: next, mode });
      setValue('');
      setOpen(false);
      onSaved();
    } catch (e) {
      onError(tFormat('specialists.tagEdit.failed', {
        error: (e as Error).message || t('common.failed'),
      }));
    } finally {
      setBusy(false);
    }
  }, [value, specialistId, onSaved, onError]);

  return (
    <div className="text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="text-muted-foreground">{t('specialists.label.tags')}</div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setOpen((v) => !v);
            setValue(Array.isArray(tags) ? tags.join(', ') : '');
          }}
          className="h-6 px-2 text-[10px]"
        >
          {open ? t('specialists.tags.cancel') : t('specialists.tags.edit')}
        </Button>
      </div>
      {!open ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {Array.isArray(tags) && tags.length > 0
            ? tags.map((tag) => (
                <span key={tag} className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0 text-[10px] text-cyan-700 dark:text-cyan-400">
                  #{tag}
                </span>
              ))
            : <span className="text-[11px] text-muted-foreground italic">{t('specialists.tags.empty')}</span>}
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t('specialists.tags.placeholder')}
            aria-label={t('specialists.action.editTags')}
            className="h-7 flex-1 text-[11px]"
            disabled={busy}
          />
          <Button
            size="sm"
            onClick={handleSave}
            disabled={busy}
            className="h-7 px-2 text-[11px]"
          >
            {t('common.apply')}
          </Button>
        </div>
      )}
    </div>
  );
}
