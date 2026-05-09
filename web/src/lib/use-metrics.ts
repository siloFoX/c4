import { useEffect, useState } from 'react';

// (v1.10.726) Extracted from MetricsBar. The 5s
// self-polling /api/metrics fetch — keeps the last
// value on a network blip (no error toast since the
// bar is decorative; missing data just shows "—"
// in the formatters). Returns `null` until the first
// successful poll.
//
// The fetch goes through `fetch()` directly rather
// than `apiFetch()` because MetricsBar predates the
// shared API helper and the metrics endpoint does
// not need the auth-injection middleware (it's
// public on the daemon's metrics route).

export interface MetricsResponse {
  daemon: {
    platform: string;
    pid: number;
    uptimeSec: number;
    rssKb: number;
    heapUsedKb: number;
    heapTotalKb: number;
    cpus: number;
    loadavg: number[];
  };
  workers: Array<{
    name: string;
    pid: number | null;
    status: string;
    cpuPct: number | null;
    rssKb: number | null;
    threads: number | null;
  }>;
  totals: {
    liveWorkers: number;
    totalWorkers: number;
    totalRssKb: number;
    totalCpuPct: number;
  };
}

const POLL_INTERVAL_MS = 5000;

export function useMetrics(): MetricsResponse | null {
  const [m, setM] = useState<MetricsResponse | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/metrics');
        if (!res.ok) return;
        const data = (await res.json()) as MetricsResponse;
        if (alive) setM(data);
      } catch {
        // network blip — keep last value
      }
    };
    tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  return m;
}
