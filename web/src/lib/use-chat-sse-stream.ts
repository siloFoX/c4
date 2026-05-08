import { useEffect, useState } from 'react';
import { eventSourceUrl } from './api';
import { b64decode } from './chat-helpers';

// (v1.10.643) Extracted from ChatView. The /api/watch SSE
// stream — opens an EventSource for the worker, decodes b64
// `output` frames, hands raw bytes back to the caller via
// `onOutput`, and tracks the connected/disconnected badge state.
// `onCleanup` is invoked on unmount or worker change so the
// caller can flush its pending-buffer ref.

interface ChatSseStream {
  sseConnected: boolean;
}

export function useChatSseStream(args: {
  workerName: string;
  onOutput: (raw: string) => void;
  onCleanup: () => void;
}): ChatSseStream {
  const { workerName, onOutput, onCleanup } = args;
  const [sseConnected, setSseConnected] = useState(false);

  useEffect(() => {
    const url = eventSourceUrl(`/api/watch?name=${encodeURIComponent(workerName)}`);
    const es = new EventSource(url);
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as { type?: string; data?: string };
        if (data.type === 'output' && typeof data.data === 'string') {
          onOutput(b64decode(data.data));
        }
      } catch {
        // ignore non-JSON payloads
      }
    };
    return () => {
      es.close();
      onCleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerName]);

  return { sseConnected };
}
