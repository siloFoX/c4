import { useCallback, useState } from 'react';
import { apiPost } from './api';
import { t, tFormat } from './i18n';

// (v1.10.705) Extracted from WorkerDetail. Wraps the
// /api/{send,key,merge,close} endpoints with a uniform
// busy + actionMsg banner + post-success scrollback
// refresh. runAction returns true on success so the
// caller can decide whether to clear inputs only when
// the action actually went through (8.42 review fix:
// previously every action that errored silently still
// ran its .then() side-effect).
// (v1.10.751) postJson helper replaced with shared apiPost
// (same shape: HTTP-error throw + JSON parse).

interface ActionResponse {
  error?: string;
  [key: string]: unknown;
}

interface WorkerActionsState {
  actionMsg: string | null;
  setActionMsg: (next: string | null) => void;
  busy: boolean;
  runAction: (label: string, fn: () => Promise<ActionResponse>) => Promise<boolean>;
  handleSend: (text: string) => Promise<boolean>;
  handleEnter: () => Promise<boolean>;
  sendKey: (key: string) => Promise<boolean>;
  handleMerge: () => Promise<boolean>;
  handleClose: () => Promise<boolean>;
}

export function useWorkerActions(args: {
  workerName: string;
  fetchScrollback: () => void;
}): WorkerActionsState {
  const { workerName, fetchScrollback } = args;
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const runAction = useCallback(async (label: string, fn: () => Promise<ActionResponse>): Promise<boolean> => {
    setBusy(true);
    setActionMsg(null);
    try {
      const res = await fn();
      if (res.error) {
        setActionMsg(tFormat('workerDetail.actionFailed', { label, error: res.error }));
        return false;
      }
      setActionMsg(tFormat('workerDetail.actionOk', { label }));
      fetchScrollback();
      return true;
    } catch (e) {
      setActionMsg(tFormat('workerDetail.actionFailed', { label, error: (e as Error).message }));
      return false;
    } finally {
      setBusy(false);
    }
  }, [fetchScrollback]);

  const handleSend = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    return runAction('send', () => apiPost<ActionResponse>('/api/send', { name: workerName, input: trimmed }));
  }, [runAction, workerName]);

  const handleEnter = useCallback(() => {
    return runAction('key Enter', () => apiPost<ActionResponse>('/api/key', { name: workerName, key: 'Enter' }));
  }, [runAction, workerName]);

  const sendKey = useCallback((key: string) => {
    return runAction(`key ${key}`, () => apiPost<ActionResponse>('/api/key', { name: workerName, key }));
  }, [runAction, workerName]);

  const handleMerge = useCallback(() => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(t('workerDetail.mergeConfirm') || `Merge worker "${workerName}" into main?\n\nThis runs the pre-merge checks and performs git merge --no-ff.`);
      if (!ok) return Promise.resolve(false);
    }
    return runAction('merge', () => apiPost<ActionResponse>('/api/merge', { name: workerName }));
  }, [runAction, workerName]);

  const handleClose = useCallback(() => {
    return runAction('close', () => apiPost<ActionResponse>('/api/close', { name: workerName }));
  }, [runAction, workerName]);

  return {
    actionMsg, setActionMsg, busy, runAction,
    handleSend, handleEnter, sendKey, handleMerge, handleClose,
  };
}
