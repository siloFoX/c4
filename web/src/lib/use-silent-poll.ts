import { useEffect, useState } from 'react';
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
