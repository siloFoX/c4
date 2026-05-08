import { useCallback, useState } from 'react';
import { apiDelete, apiPost } from './api';
import { t } from './i18n';
import type { AttachResponse, Selection } from '../components/SessionsView';

// (v1.10.631) Extracted from SessionsView. Owns the 3
// session-management async handlers — attach (POST /api/attach),
// new chat (POST /api/task), detach (DELETE
// /api/attach/:name) — plus their modal busy / error state.
// The parent supplies the selection setter (so detach can clear
// the selection when removing the attached worker that's
// currently selected) and the refresh callbacks.

interface SessionsActions {
  modalOpen: boolean;
  modalBusy: boolean;
  modalError: string | null;
  setModalOpen: (next: boolean) => void;
  setModalError: (next: string | null) => void;
  newChatOpen: boolean;
  newChatBusy: boolean;
  newChatError: string | null;
  setNewChatOpen: (next: boolean) => void;
  setNewChatError: (next: string | null) => void;
  handleAttachSubmit: (pathValue: string, nameValue: string) => Promise<void>;
  handleNewChatSubmit: (req: { prompt: string; model: string; agent: string }) => Promise<void>;
  handleDetach: (name: string) => Promise<void>;
}

export function useSessionsActions(args: {
  setSelection: (next: Selection | null | ((prev: Selection | null) => Selection | null)) => void;
  setAttachError: (next: string | null) => void;
  refreshSessions: () => Promise<void>;
  refreshAttached: () => Promise<void>;
}): SessionsActions {
  const { setSelection, setAttachError, refreshSessions, refreshAttached } = args;
  const [modalOpen, setModalOpen] = useState(false);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatBusy, setNewChatBusy] = useState(false);
  const [newChatError, setNewChatError] = useState<string | null>(null);

  const handleAttachSubmit = useCallback(
    async (pathValue: string, nameValue: string) => {
      setModalBusy(true);
      setModalError(null);
      const looksLikePath =
        pathValue.endsWith('.jsonl') ||
        pathValue.includes('/') ||
        pathValue.includes('\\');
      const body: Record<string, string> = looksLikePath
        ? { path: pathValue }
        : { sessionId: pathValue };
      if (nameValue) body['name'] = nameValue;
      try {
        const resp = await apiPost<AttachResponse>('/api/attach', body);
        setModalOpen(false);
        await refreshAttached();
        if (resp && resp.name) {
          setSelection({ kind: 'attached', name: resp.name });
        }
      } catch (err) {
        setModalError((err as Error).message || t('common.attachFailed'));
      } finally {
        setModalBusy(false);
      }
    },
    [refreshAttached, setSelection],
  );

  const handleNewChatSubmit = useCallback(
    async (req: { prompt: string; model: string; agent: string }) => {
      setNewChatBusy(true);
      setNewChatError(null);
      const body: Record<string, unknown> = {
        task: req.prompt,
        autoMode: false,
      };
      if (req.model && req.model !== 'default') body['model'] = req.model;
      if (req.agent && req.agent !== 'generic') body['profile'] = req.agent;
      try {
        const resp = await apiPost<{ name?: string; error?: string }>(
          '/api/task',
          body,
        );
        if (resp && resp.error) {
          setNewChatError(resp.error);
          return;
        }
        setNewChatOpen(false);
        await Promise.all([refreshSessions(), refreshAttached()]);
      } catch (err) {
        setNewChatError((err as Error).message || t('common.failedToStartNewChat'));
      } finally {
        setNewChatBusy(false);
      }
    },
    [refreshSessions, refreshAttached],
  );

  const handleDetach = useCallback(
    async (name: string) => {
      try {
        await apiDelete(`/api/attach/${encodeURIComponent(name)}`);
        setSelection((prev) =>
          prev && prev.kind === 'attached' && prev.name === name ? null : prev,
        );
        await refreshAttached();
      } catch (err) {
        setAttachError((err as Error).message || t('common.detachFailed'));
      }
    },
    [refreshAttached, setAttachError, setSelection],
  );

  return {
    modalOpen,
    modalBusy,
    modalError,
    setModalOpen,
    setModalError,
    newChatOpen,
    newChatBusy,
    newChatError,
    setNewChatOpen,
    setNewChatError,
    handleAttachSubmit,
    handleNewChatSubmit,
    handleDetach,
  };
}
