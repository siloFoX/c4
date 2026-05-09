import { useCallback, useState } from 'react';
import type * as React from 'react';
import { apiPost } from './api';
import { t } from './i18n';

// (v1.10.679) Extracted from MeetingsComposer. POST
// /api/meetings — bare task / template + vars / track
// override — and resets the form on success. Used by
// the composer's "Create" button. The hook exposes
// busy/error and handleCreate; the parent passes its
// task / track / templateName / templateVars +
// the matching reset setters so the form clears on
// success but the parent retains ownership of those
// fields.

type Track = 'auto' | 'lightweight' | 'standard' | 'full';

interface MeetingCreateState {
  createBusy: boolean;
  createError: string | null;
  setCreateError: React.Dispatch<React.SetStateAction<string | null>>;
  handleCreate: () => Promise<void>;
}

export function useMeetingCreate(args: {
  newTask: string;
  newTrack: Track;
  templateName: string | null;
  templateVars: Record<string, string>;
  setNewTask: React.Dispatch<React.SetStateAction<string>>;
  setTemplateName: React.Dispatch<React.SetStateAction<string | null>>;
  setTemplateVars: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onCreated: (newMeetingId: string) => void;
}): MeetingCreateState {
  const {
    newTask, newTrack, templateName, templateVars,
    setNewTask, setTemplateName, setTemplateVars, onCreated,
  } = args;
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    const task = newTask.trim();
    if (!task && !templateName) return;
    setCreateBusy(true);
    setCreateError(null);
    try {
      const body: {
        task?: string;
        track?: string;
        template?: string;
        vars?: Record<string, string>;
        requireAllVars?: boolean;
      } = {};
      if (templateName) {
        body.template = templateName;
        const filled = Object.fromEntries(
          Object.entries(templateVars).filter(([, v]) => v && v.length > 0),
        );
        if (Object.keys(filled).length) body.vars = filled;
      } else {
        body.task = task;
      }
      if (newTrack !== 'auto') body.track = newTrack;
      const created = await apiPost<{ id: string }>('/api/meetings', body);
      setNewTask('');
      setTemplateName(null);
      setTemplateVars({});
      if (created && created.id) onCreated(created.id);
    } catch (e) {
      setCreateError((e as Error).message || t('common.failedToCreateMeeting'));
    } finally {
      setCreateBusy(false);
    }
  }, [newTask, newTrack, templateName, templateVars, setNewTask, setTemplateName, setTemplateVars, onCreated]);

  return { createBusy, createError, setCreateError, handleCreate };
}
