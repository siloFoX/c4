import { useCallback, useEffect, useState } from 'react';
import { apiDelete, apiPost } from './api';
import { t, tFormat } from './i18n';

// (v1.10.700) Extracted from MeetingsTemplateEditor.
// Owns the four form fields (name / task / track /
// description) plus busy/msg/failed banner state, and
// the save + delete handlers. Form re-seeds whenever
// `open` flips true so the operator opening on a
// different chip sees the right values; rename is
// implemented via upsert + delete-old since the daemon
// doesn't have a rename op.

interface TemplateLike {
  name: string;
  task: string;
  track?: string | null;
  description?: string | null;
}

interface MeetingTemplateEditorState {
  name: string;
  setName: (next: string) => void;
  task: string;
  setTask: (next: string) => void;
  track: string;
  setTrack: (next: string) => void;
  description: string;
  setDescription: (next: string) => void;
  busy: boolean;
  msg: string | null;
  failed: boolean;
  handleSave: () => Promise<void>;
  handleDelete: () => Promise<void>;
}

export function useMeetingTemplateEditor(args: {
  open: boolean;
  tpl: TemplateLike | null;
  onSaved: () => void;
  onDeleted: (deletedName: string) => void;
}): MeetingTemplateEditorState {
  const { open, tpl, onSaved, onDeleted } = args;
  const mode: 'create' | 'edit' = tpl ? 'edit' : 'create';
  const originalName = tpl?.name ?? '';

  const [name, setName] = useState('');
  const [task, setTask] = useState('');
  const [track, setTrack] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (tpl) {
      setName(tpl.name);
      setTask(tpl.task);
      setTrack(tpl.track || '');
      setDescription(tpl.description || '');
    } else {
      setName('');
      setTask('');
      setTrack('');
      setDescription('');
    }
    setMsg(null);
    setFailed(false);
  }, [open, tpl]);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    const trimmedTask = task.trim();
    if (!trimmedName || !trimmedTask) {
      setMsg(t('meetings.template.nameTaskRequired'));
      setFailed(true);
      return;
    }
    setBusy(true);
    setMsg(null);
    setFailed(false);
    try {
      const body: {
        name: string;
        task: string;
        track?: string;
        description?: string;
      } = { name: trimmedName, task: trimmedTask };
      if (track.trim()) body.track = track.trim();
      if (description.trim()) body.description = description.trim();
      await apiPost('/api/meetings/templates', body);
      // Editing under a different name is a rename — drop the
      // old record. The daemon doesn't have a rename op so we
      // upsert + delete-old.
      if (mode === 'edit' && originalName && originalName !== trimmedName) {
        await apiDelete(`/api/meetings/templates/${encodeURIComponent(originalName)}`);
      }
      setMsg(null);
      onSaved();
    } catch (e) {
      setMsg(tFormat('meetings.template.saveFailed', {
        error: (e as Error).message || t('common.unknown'),
      }));
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [name, task, track, description, mode, originalName, onSaved]);

  const handleDelete = useCallback(async () => {
    if (!originalName) return;
    if (!window.confirm(tFormat('meetings.confirmTplDelete', { name: originalName }))) return;
    setBusy(true);
    setMsg(null);
    setFailed(false);
    try {
      await apiDelete(`/api/meetings/templates/${encodeURIComponent(originalName)}`);
      onDeleted(originalName);
    } catch (e) {
      setMsg(tFormat('meetings.template.deleteFailed', {
        error: (e as Error).message || t('common.unknown'),
      }));
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [originalName, onDeleted]);

  return {
    name, setName,
    task, setTask,
    track, setTrack,
    description, setDescription,
    busy, msg, failed,
    handleSave, handleDelete,
  };
}
