import { useCallback, useRef, type MutableRefObject } from 'react';
import { stripAnsi } from './chat-helpers';

// (v1.10.665) Extracted from ChatView. The PTY-output
// debounce — incoming bytes accumulate in
// `pendingBufRef` and a setTimeout schedules a flush
// `WORKER_FLUSH_MS` after the last write. flush calls
// `appendLive('worker', cleanText)` once with the
// chunk-stripped text, so the chat log gets one bubble
// per pause rather than one per packet. The hook owns
// the two refs + both callbacks; the parent calls
// `reset()` on worker change + reads the refs directly
// to clear them in the SSE-stream onCleanup path.

const WORKER_FLUSH_MS = 1200;

interface WorkerBufferFlusherState {
  pendingBufRef: MutableRefObject<string>;
  flushTimerRef: MutableRefObject<number | null>;
  flushWorkerBuffer: () => void;
  scheduleFlush: () => void;
  reset: () => void;
}

export function useWorkerBufferFlusher(args: {
  appendLive: (role: 'worker', text: string) => void;
}): WorkerBufferFlusherState {
  const { appendLive } = args;
  const pendingBufRef = useRef<string>('');
  const flushTimerRef = useRef<number | null>(null);

  const flushWorkerBuffer = useCallback(() => {
    const raw = pendingBufRef.current;
    pendingBufRef.current = '';
    if (flushTimerRef.current != null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (!raw) return;
    const clean = stripAnsi(raw).trim();
    if (!clean) return;
    appendLive('worker', clean);
  }, [appendLive]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current != null) {
      window.clearTimeout(flushTimerRef.current);
    }
    flushTimerRef.current = window.setTimeout(flushWorkerBuffer, WORKER_FLUSH_MS);
  }, [flushWorkerBuffer]);

  const reset = useCallback(() => {
    pendingBufRef.current = '';
    if (flushTimerRef.current != null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  return { pendingBufRef, flushTimerRef, flushWorkerBuffer, scheduleFlush, reset };
}

export { WORKER_FLUSH_MS };
