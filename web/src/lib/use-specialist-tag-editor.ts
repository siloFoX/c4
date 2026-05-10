import { useCallback, useState } from 'react';
import type * as React from 'react';
import { apiPatch } from './api';
import { t, tFormat } from './i18n';

// (v1.10.706) Extracted from SpecialistsTagEditor. The
// inline-toggle tag editor with mode prefix support
// (`+foo,bar` adds, `-foo,bar` removes, otherwise
// replaces). Empty replace is guarded so a stray
// "clear" doesn't wipe the tag list by accident — the
// JSX has to surface an explicit clear path if needed.

interface SpecialistTagEditorState {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  toggleWithTags: (tags: string[] | undefined) => void;
  value: string;
  setValue: React.Dispatch<React.SetStateAction<string>>;
  busy: boolean;
  handleSave: () => Promise<void>;
}

export function useSpecialistTagEditor(args: {
  specialistId: string;
  onSaved: () => void;
  onError: (msg: string) => void;
}): SpecialistTagEditorState {
  const { specialistId, onSaved, onError } = args;
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

  // (v1.10.760) Combined open-toggle + tag-prefill — the JSX
  // edit/cancel button needs both, so pushing the pair into a
  // memoized callback drops the inline arrow allocation per
  // render and keeps the hook owning both pieces of state.
  const toggleWithTags = useCallback((tags: string[] | undefined) => {
    setOpen((prev) => !prev);
    setValue(Array.isArray(tags) ? tags.join(', ') : '');
  }, []);

  return { open, setOpen, toggleWithTags, value, setValue, busy, handleSave };
}
