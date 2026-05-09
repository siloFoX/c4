import { useEffect, useState } from 'react';
import { apiGet } from './api';

// (v1.10.674) Extracted from SessionsAttachedRowActions.
// Polls /api/attach/:name/process every 30s to detect
// whether the attached JSONL is currently owned by a
// running claude (status='alive') or just an exported
// transcript (status='idle'). The lookup is a one-shot
// procfs scan with no SSE counterpart yet, so we poll.
// `cancelled` race guard so a fast row swap doesn't
// stamp a stale state back onto a different row.

export type AttachProcessState =
  | { status: 'loading' }
  | { status: 'alive'; pid: number; cwd: string | null; match: 'fd' | 'cwd'; multipleCandidates?: boolean }
  | { status: 'idle' }
  | { status: 'error'; message: string };

export function useAttachProcessState(args: {
  name: string;
}): AttachProcessState {
  const { name } = args;
  const [procState, setProcState] = useState<AttachProcessState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await apiGet<{
          alive: boolean; pid?: number; cwd?: string | null;
          match?: 'fd' | 'cwd'; multipleCandidates?: boolean;
        }>(`/api/attach/${encodeURIComponent(name)}/process`);
        if (cancelled) return;
        if (data.alive && typeof data.pid === 'number') {
          setProcState({
            status: 'alive',
            pid: data.pid,
            cwd: data.cwd ?? null,
            match: data.match || 'fd',
            multipleCandidates: !!data.multipleCandidates,
          });
        } else {
          setProcState({ status: 'idle' });
        }
      } catch (err) {
        if (cancelled) return;
        setProcState({ status: 'error', message: (err as Error).message });
      }
    };
    poll();
    const id = window.setInterval(poll, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [name]);

  return procState;
}
