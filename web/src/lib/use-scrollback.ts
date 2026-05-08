import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './api';

// (v1.10.636) Extracted from WorkerDetail. Polled
// /api/scrollback?name=…&lines=200 every 3s — only when the
// caller's tab is 'scrollback'. Resets the error/action banners
// on tab change so stale messages don't linger when the user
// flips between Screen and Scrollback. Returns the raw content
// + error + a status setter for the parent.

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

  const fetchScrollback = useCallback(async () => {
    if (tab !== 'scrollback') return;
    try {
      const url = `/api/scrollback?name=${encodeURIComponent(workerName)}&lines=200`;
      const res = await apiFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ReadResponse;
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
    setActionMsg(null);
    if (tab !== 'scrollback') return;
    fetchScrollback();
    const interval = setInterval(fetchScrollback, 3000);
    return () => clearInterval(interval);
  }, [fetchScrollback, tab, setActionMsg]);

  return { scrollbackContent, error, setError, fetchScrollback };
}
