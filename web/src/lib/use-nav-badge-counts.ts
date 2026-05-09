import { useEffect, useState } from 'react';
import { apiGet } from './api';

// (v1.10.709) Extracted from layout/AppHeader. Polls
// three endpoint signals every 60s for the top-tab
// badge counts: stuck-meetings, specialist
// underperformers, and pending autonomous
// escalations. The escalations endpoint 400s when
// autonomous mode is disabled, so we gate on
// /autonomous/status (always 200) and only fetch the
// escalations once enabled is known. `authed=false`
// short-circuits the entire poll (login screen
// shouldn't ping daemon endpoints).

interface NavBadgeCounts {
  stuckCount: number;
  underperformerCount: number;
  escalationCount: number;
}

export function useNavBadgeCounts(args: {
  authed: boolean;
}): NavBadgeCounts {
  const { authed } = args;
  const [stuckCount, setStuckCount] = useState(0);
  const [underperformerCount, setUnderperformerCount] = useState(0);
  const [escalationCount, setEscalationCount] = useState(0);

  useEffect(() => {
    if (!authed) return undefined;
    let cancelled = false;
    let autonomousEnabled: boolean | null = null;
    const fetchSignals = () => {
      apiGet<{ count: number }>('/api/meetings/stuck?hours=1')
        .then((res) => { if (!cancelled) setStuckCount(res.count || 0); })
        .catch(() => { /* tolerate */ });
      apiGet<{ flagged: number }>('/api/specialists/underperformers')
        .then((res) => { if (!cancelled) setUnderperformerCount(res.flagged || 0); })
        .catch(() => { /* tolerate */ });
      const fetchEscalations = () => {
        apiGet<{ count: number; escalations: unknown[] }>('/api/autonomous/escalations')
          .then((res) => { if (!cancelled) setEscalationCount(res.count || 0); })
          .catch(() => { /* tolerate */ });
      };
      if (autonomousEnabled === true) {
        fetchEscalations();
      } else if (autonomousEnabled === null) {
        apiGet<{ enabled: boolean }>('/api/autonomous/status')
          .then((s) => {
            if (cancelled) return;
            autonomousEnabled = !!s.enabled;
            if (s.enabled) fetchEscalations();
          })
          .catch(() => { /* tolerate */ });
      }
      // autonomousEnabled === false → skip escalations entirely
    };
    fetchSignals();
    const id = window.setInterval(fetchSignals, 60000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [authed]);

  return { stuckCount, underperformerCount, escalationCount };
}
