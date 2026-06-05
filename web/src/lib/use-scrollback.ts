import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from './api';

// (v1.10.636) Extracted from WorkerDetail. Polled
// /api/scrollback?name=…&lines=200 every 3s — only when the
// caller's tab is 'scrollback'. Resets the error/action banners
// on tab change so stale messages don't linger when the user
// flips between Screen and Scrollback. Returns the raw content
// + error + a status setter for the parent.
// (v1.10.750) apiFetch + manual error throw replaced with apiGet
// which throws on non-ok internally.

interface ReadResponse {
  content?: string;
  error?: string;
  status?: string;
  lines?: number;
  totalScrollback?: number;
}

interface Scrollback {
  scrollbackContent: string;
  error: string | null;
  setError: (next: string | null) => void;
  fetchScrollback: () => Promise<void>;
}

export function useScrollback(args: {
  workerName: string;
  tab: 'screen' | 'scrollback';
  setActionMsg: (next: string | null) => void;
}): Scrollback {
  const { workerName, tab, setActionMsg } = args;
  const [scrollbackContent, setScrollbackContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // (v1.11.1163, TODO 11.1145) The tab-change reset effect needs to
  // call setActionMsg(null) but must NOT take a fresh function
  // reference as a dependency. Consumers like WorkerDetail.tsx pass
  // `(next) => setActionMsg(next)` inline, which is a brand new
  // arrow on every render. Without the ref, the dep array changes
  // every render, the effect re-fires, and the `setError(null)` it
  // contains clobbers any error the in-flight fetch was about to
  // surface. That manifested as silent error-swallowing in the
  // worker scrollback panel (and as 3 failing tests in
  // use-scrollback.test.ts asserting the error string never stuck).
  const setActionMsgRef = useRef(setActionMsg);
  setActionMsgRef.current = setActionMsg;

  const fetchScrollback = useCallback(async () => {
    if (tab !== 'scrollback') return;
    try {
      const url = `/api/scrollback?name=${encodeURIComponent(workerName)}&lines=200`;
      const data = await apiGet<ReadResponse>(url);
      if (data.error) {
        setError(data.error);
        setScrollbackContent('');
      } else {
        setScrollbackContent(typeof data.content === 'string' ? data.content : '');
        setError(null);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [tab, workerName]);

  useEffect(() => {
    setError(null);
    setActionMsgRef.current(null);
    if (tab !== 'scrollback') return;
    fetchScrollback();
    const interval = setInterval(fetchScrollback, 3000);
    return () => clearInterval(interval);
  }, [fetchScrollback, tab]);

  return { scrollbackContent, error, setError, fetchScrollback };
}
