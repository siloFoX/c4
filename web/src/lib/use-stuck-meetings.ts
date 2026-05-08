import { useEffect, useState } from 'react';
import { apiGet } from './api';
import type { StuckResponse } from '../components/MeetingsStuckBanner';

// (v1.10.627) Extracted from MeetingsView. Phase 6.15 stuck-
// meetings poll — fetch /api/meetings/stuck?hours=1 every 60s,
// silently fall back to null on older daemons. Returns the
// last successful response (or null).

export function useStuckMeetings(): StuckResponse | null {
  const [stuck, setStuck] = useState<StuckResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    const fetchStuck = () => {
      apiGet<StuckResponse>('/api/meetings/stuck?hours=1')
        .then((res) => { if (!cancelled) setStuck(res); })
        .catch(() => { /* tolerate older daemons */ });
    };
    fetchStuck();
    const id = window.setInterval(fetchStuck, 60000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);
  return stuck;
}
