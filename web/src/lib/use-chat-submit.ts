import { useCallback, useState, type FormEvent, type RefObject } from 'react';
import { apiPost } from './api';
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
// (v1.10.752) apiFetch + manual error throw replaced
// with apiPost which throws on non-ok internally.

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
      const sendData = await apiPost<{ error?: string }>('/api/send', { name: workerName, input: text });
      if (sendData.error) {
        setError(sendData.error);
        setSending(false);
        return;
      }
      const keyData = await apiPost<{ error?: string }>('/api/key', { name: workerName, key: 'Enter' });
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
