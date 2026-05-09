import { useCallback, useState, type FormEvent, type RefObject } from 'react';
import { apiFetch } from './api';
import type { Role } from './chat-helpers';

// (v1.10.673) Extracted from ChatView. The submit flow
// for sending a chat message: flushes the worker buffer
// (so the existing PTY output is bubbled before the
// user message), appends an optimistic 'user' bubble,
// then POSTs /api/send + /api/key (Enter) sequentially.
// Errors and the sending flag are owned by the hook;
// the parent's setError is threaded in so the page-level
// banner stays the single sink. Focus returns to the
// textarea on every completion (success or failure).

interface ChatSubmitState {
  sending: boolean;
  handleSubmit: (e?: FormEvent) => Promise<void>;
}

export function useChatSubmit(args: {
  workerName: string;
  input: string;
  setInput: (next: string) => void;
  setError: (message: string | null) => void;
  setAutoScroll: (next: boolean) => void;
  flushWorkerBuffer: () => void;
  appendLive: (role: Role, text: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}): ChatSubmitState {
  const {
    workerName, input, setInput, setError, setAutoScroll,
    flushWorkerBuffer, appendLive, textareaRef,
  } = args;
  const [sending, setSending] = useState(false);

  const handleSubmit = useCallback(async (e?: FormEvent) => {
    if (e) e.preventDefault();
    const text = input;
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);
    flushWorkerBuffer();
    appendLive('user', text);
    setInput('');
    setAutoScroll(true);
    try {
      const sendRes = await apiFetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workerName, input: text }),
      });
      if (!sendRes.ok) throw new Error(`HTTP ${sendRes.status}`);
      const sendData = (await sendRes.json()) as { error?: string };
      if (sendData.error) {
        setError(sendData.error);
        setSending(false);
        return;
      }
      const keyRes = await apiFetch('/api/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workerName, key: 'Enter' }),
      });
      if (!keyRes.ok) throw new Error(`HTTP ${keyRes.status}`);
      const keyData = (await keyRes.json()) as { error?: string };
      if (keyData.error) setError(keyData.error);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [
    workerName, input, sending, setInput, setError, setAutoScroll,
    flushWorkerBuffer, appendLive, textareaRef,
  ]);

  return { sending, handleSubmit };
}
