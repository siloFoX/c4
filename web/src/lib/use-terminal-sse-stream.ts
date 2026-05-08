import { useEffect, useState, type RefObject } from 'react';
import type { Terminal } from '@xterm/xterm';
import { eventSourceUrl } from './api';
import { b64decode } from './chat-helpers';

// (v1.10.646) Extracted from XtermView. Identical wire shape
// to ChatView's SSE — opens an EventSource on /api/watch,
// decodes b64 `output` frames, and writes the raw bytes
// straight into xterm so cursor controls / alt-screen
// toggles / OSC sequences all land verbatim. EventSource
// construction is wrapped in try/catch so a thrown
// `SecurityError` (e.g. mixed content) propagates back to
// the parent's error banner.

interface WatchEvent {
  type?: string;
  data?: string;
}

export function useTerminalSseStream(args: {
  termRef: RefObject<Terminal | null>;
  workerName: string;
  onError: (message: string) => void;
}): { sseConnected: boolean } {
  const { termRef, workerName, onError } = args;
  const [sseConnected, setSseConnected] = useState(false);
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const url = eventSourceUrl(`/api/watch?name=${encodeURIComponent(workerName)}`);
    let es: EventSource | null;
    try {
      es = new EventSource(url);
    } catch (e) {
      onError((e as Error).message);
      return;
    }
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.onmessage = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as WatchEvent;
        if (data.type === 'output' && typeof data.data === 'string') {
          term.write(b64decode(data.data));
        }
      } catch {
        // ignore non-JSON payloads
      }
    };
    return () => {
      es?.close();
    };
  }, [workerName]);
  return { sseConnected };
}
