import { useCallback, useState } from 'react';
import { apiPost } from './api';
import { tFormat } from './i18n';
import type { ToastType } from '../components/Toast';

// (v1.10.733) Extracted from StatusMessageCard. The
// /api/status-update fire-and-forget POST + the
// message + sending state. Resets the textarea on
// successful send. Failure paths surface through the
// parent-supplied onToast callback so the toast
// stack stays a single place.
// (v1.10.751) apiFetch + manual error throw replaced
// with apiPost which throws on non-ok internally.

export interface UseStatusMessageState {
  message: string;
  setMessage: (next: string) => void;
  sending: boolean;
  send: () => Promise<void>;
}

export function useStatusMessage(args: {
  workerName: string;
  onToast: (message: string, type: ToastType) => void;
}): UseStatusMessageState {
  const { workerName, onToast } = args;
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const send = useCallback(async () => {
    const text = message.trim();
    if (!text) return;
    setSending(true);
    try {
      await apiPost('/api/status-update', { worker: workerName, message: text });
      onToast(tFormat('controlPanel.status.sent', { worker: workerName }), 'success');
      setMessage('');
    } catch (e) {
      onToast(tFormat('controlPanel.status.failed', { error: (e as Error).message }), 'error');
    }
    setSending(false);
  }, [message, workerName, onToast]);

  return { message, setMessage, sending, send };
}
