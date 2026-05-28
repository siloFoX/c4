import { useEffect, useState } from 'react';

// (v1.10.726) Extracted from MetricsBar. The self-polling
// /api/metrics fetch -- keeps the last value on a network blip (no
// error toast since the bar is decorative; missing data just shows
// "-" in the formatters).
//
// (v1.11.1100, TODO 11.1082) Polling discipline overhaul to stop a
// 401 flood:
//   * Healthy poll interval raised from 5s to 20s (HEALTHY_INTERVAL_MS).
//   * A 401 STOPS polling entirely and surfaces a quiet
//     `needs-login` status -- the bar no longer hammers the daemon
//     (and the console) every interval while auth is expired.
//   * Other transient failures (network blips, 5xx) keep the last
//     value and retry with EXPONENTIAL BACKOFF (20s -> 40s -> 80s
//     ... capped at MAX_BACKOFF_MS), resetting to the healthy
//     interval after the next success.
// Scheduling moved from setInterval to a self-rescheduling
// setTimeout so the delay can vary per tick.
//
// The fetch goes through `fetch()` directly rather than `apiFetch()`
// because MetricsBar predates the shared API helper and the metrics
// endpoint does not need the auth-injection middleware.

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

// 'loading'     -- before the first response resolves, no data yet.
// 'ok'          -- last poll succeeded; `data` is populated.
// 'needs-login' -- a 401 was seen; polling has STOPPED.
// 'error'       -- a transient (non-401) failure before any data.
export type MetricsStatus = 'loading' | 'ok' | 'needs-login' | 'error';

export interface UseMetricsResult {
  data: MetricsResponse | null;
  status: MetricsStatus;
}

export const HEALTHY_INTERVAL_MS = 20000;
export const MAX_BACKOFF_MS = 160000;

export function useMetrics(): UseMetricsResult {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [status, setStatus] = useState<MetricsStatus>('loading');

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Tracks the current poll delay; doubled on each consecutive
    // transient failure and reset to HEALTHY_INTERVAL_MS on success.
    let delay = HEALTHY_INTERVAL_MS;
    let hasData = false;

    const schedule = (ms: number): void => {
      if (!alive) return;
      timer = setTimeout(() => {
        void tick();
      }, ms);
    };

    const backoff = (): void => {
      delay = Math.min(delay * 2, MAX_BACKOFF_MS);
      schedule(delay);
    };

    const tick = async (): Promise<void> => {
      try {
        const res = await fetch('/api/metrics');
        if (!alive) return;
        if (res.status === 401) {
          // Auth expired / required: stop polling and surface a
          // quiet needs-login state. Do NOT reschedule -- this is
          // the whole point of the fix (no 401 flood).
          setStatus('needs-login');
          return;
        }
        if (!res.ok) {
          // Transient server error: keep the last value, back off.
          if (!hasData) setStatus('error');
          backoff();
          return;
        }
        const json = (await res.json()) as MetricsResponse;
        if (!alive) return;
        setData(json);
        setStatus('ok');
        hasData = true;
        delay = HEALTHY_INTERVAL_MS; // reset backoff after success
        schedule(HEALTHY_INTERVAL_MS);
      } catch {
        // Network blip: keep the last value, back off.
        if (!alive) return;
        if (!hasData) setStatus('error');
        backoff();
      }
    };

    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { data, status };
}
