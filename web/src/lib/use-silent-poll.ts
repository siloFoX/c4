import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from './api';

// (v1.10.743) Generic self-polling fetch that
// silently degrades on failure. Used by panels
// where the data is decorative (the panel hides
// itself if the endpoint isn't there) so a noisy
// error toast would distract more than it helps.
//
// The hook polls `url` every `intervalMs` and
// stores the latest response. Failures are swallowed
// (older daemons missing the endpoint, transient
// network blips). Cancel-flag + clearInterval
// cleanup prevents stale-write races on unmount.

export function useSilentPoll<T>(url: string, intervalMs: number): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      apiGet<T>(url)
        .then((res) => { if (!cancelled) setData(res); })
        .catch(() => { /* silently degrade */ });
    };
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [url, intervalMs]);
  return data;
}

// (v1.10.767) Variant that exposes a manual refresh
// callback alongside the polled data. The refresh
// resolves with the next response so callers awaiting
// it (e.g. after a mutation) see the post-mutation
// state without waiting for the next interval tick.
// Map the response through `mapper` so the public
// type stays domain-shaped (e.g. `Worker[]`) without
// the polled `T` leaking out.

export interface SilentPollRefresh<U> {
  data: U;
  refresh: () => Promise<void>;
}

export function useSilentPollWithRefresh<T, U>(
  url: string,
  intervalMs: number,
  fallback: U,
  mapper: (res: T) => U,
): SilentPollRefresh<U> {
  const [data, setData] = useState<U>(fallback);
  // Refs so the polling effect doesn't re-fire when the mapper
  // identity changes per render — only url + intervalMs matter.
  const mapperRef = useRef(mapper);
  mapperRef.current = mapper;

  const refresh = useCallback(async () => {
    try {
      const res = await apiGet<T>(url);
      setData(mapperRef.current(res));
    } catch {
      // silently degrade — caller-side surfaces errors elsewhere
    }
  }, [url]);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      apiGet<T>(url)
        .then((res) => { if (!cancelled) setData(mapperRef.current(res)); })
        .catch(() => { /* silently degrade */ });
    };
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [url, intervalMs]);

  return { data, refresh };
}
