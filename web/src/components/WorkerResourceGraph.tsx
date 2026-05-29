import { useEffect, useRef, useState } from 'react';
import { getToken } from '../lib/api';

// (11.203) Per-worker resource mini-graphs (CPU% + RSS bytes)
// rendered as two side-by-side SVG sparklines. The graph
// self-polls /api/metrics on its own cadence so each row can
// pick its own sampleIntervalMs / windowMs and so the bigger
// useMetrics() consumers (MetricsBar) keep their existing 5s
// shared poll without contention. The hook keeps the last N
// samples in a ring buffer and renders 'no data' before the
// first poll resolves.
//
// (v1.11.1119, TODO 11.1101) /api/metrics is auth-gated. This graph's
// poll was a bare `fetch('/api/metrics')` with no Authorization header
// -- the same defect 11.1086 fixed in use-metrics, but in this second
// consumer. Because every worker row mounts its own graph and the
// setInterval kept firing on failure, a signed-in admin saw a flood of
// 401s in the console (c4-qa: 14 of 18 /api/metrics responses were 401).
// Fix: attach the session token from the same source as use-metrics /
// apiFetch (getToken), and STOP polling on a 401 so an expired session
// never floods. (The earlier hypothesis blamed the service worker, but
// sw.ts is never registered -- registerServiceWorker is not called from
// main.tsx -- so it cannot reissue anything.)

export interface WorkerResourceGraphProps {
  workerName: string;
  sampleIntervalMs?: number;
  windowMs?: number;
  height?: number;
}

interface Sample {
  cpu: number;
  rss: number;
}

interface MetricsRow {
  name: string;
  cpuPct: number | null;
  rssKb: number | null;
}

interface MetricsPayload {
  workers?: MetricsRow[];
}

const SVG_WIDTH = 60;

function formatRss(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)}${units[i]}`;
}

function pointsFor(values: number[], peak: number, width: number, height: number): string {
  if (values.length === 0) return '';
  if (values.length === 1) {
    const y = peak > 0 ? height - (values[0] / peak) * height : height;
    return `0,${y.toFixed(2)} ${width},${y.toFixed(2)}`;
  }
  const step = width / (values.length - 1);
  return values
    .map((v, i) => {
      const y = peak > 0 ? height - (v / peak) * height : height;
      return `${(i * step).toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

export default function WorkerResourceGraph({
  workerName,
  sampleIntervalMs = 5000,
  windowMs = 60000,
  height = 28,
}: WorkerResourceGraphProps) {
  const capacity = Math.max(1, Math.floor(windowMs / sampleIntervalMs));
  const [samples, setSamples] = useState<Sample[]>([]);
  const capRef = useRef(capacity);
  capRef.current = capacity;

  useEffect(() => {
    let alive = true;
    let id: ReturnType<typeof setInterval> | undefined;
    const tick = async () => {
      try {
        const token = getToken();
        // Build init without an explicit `headers: undefined` so the
        // call type-checks under exactOptionalPropertyTypes.
        const init: RequestInit = token
          ? { headers: { Authorization: `Bearer ${token}` } }
          : {};
        const res = await fetch('/api/metrics', init);
        if (res.status === 401) {
          // Auth required / expired: stop polling so we do not flood
          // the console with 401s every interval (mirrors use-metrics).
          if (id !== undefined) clearInterval(id);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as MetricsPayload;
        const row = data.workers?.find((w) => w.name === workerName);
        if (!row || !alive) return;
        const cpu = row.cpuPct ?? 0;
        const rss = (row.rssKb ?? 0) * 1024;
        setSamples((prev) => {
          const next = prev.concat({ cpu, rss });
          const cap = capRef.current;
          return next.length > cap ? next.slice(next.length - cap) : next;
        });
      } catch {
        // swallow; mini-graph is decorative
      }
    };
    tick();
    id = setInterval(tick, sampleIntervalMs);
    return () => {
      alive = false;
      if (id !== undefined) clearInterval(id);
    };
  }, [workerName, sampleIntervalMs]);

  if (samples.length === 0) {
    return (
      <div
        data-testid="worker-resource-graph"
        className="flex items-center gap-2 text-[11px] text-muted-foreground"
        aria-label={`Resource graph for ${workerName}`}
      >
        <span data-testid="wrg-empty">no data</span>
      </div>
    );
  }

  const cpuValues = samples.map((s) => s.cpu);
  const rssValues = samples.map((s) => s.rss);
  const cpuPeak = 100;
  const rssPeak = Math.max(1, ...rssValues);
  const latest = samples[samples.length - 1];

  return (
    <div
      data-testid="worker-resource-graph"
      className="flex items-center gap-2 text-[11px] text-foreground"
      aria-label={`Resource graph for ${workerName}`}
    >
      <div className="flex items-center gap-1">
        <svg
          data-testid="wrg-cpu-svg"
          width={SVG_WIDTH}
          height={height}
          viewBox={`0 0 ${SVG_WIDTH} ${height}`}
          className="bg-muted/40 rounded"
          aria-hidden="true"
        >
          <polyline
            data-testid="wrg-cpu-line"
            fill="none"
            strokeWidth={1.5}
            className="stroke-primary"
            points={pointsFor(cpuValues, cpuPeak, SVG_WIDTH, height)}
          />
        </svg>
        <span data-testid="wrg-cpu-value" className="font-mono tabular-nums">
          {latest.cpu.toFixed(0)}%
        </span>
      </div>
      <div className="flex items-center gap-1">
        <svg
          data-testid="wrg-rss-svg"
          width={SVG_WIDTH}
          height={height}
          viewBox={`0 0 ${SVG_WIDTH} ${height}`}
          className="bg-muted/40 rounded"
          aria-hidden="true"
        >
          <polyline
            data-testid="wrg-rss-line"
            fill="none"
            strokeWidth={1.5}
            className="stroke-primary"
            points={pointsFor(rssValues, rssPeak, SVG_WIDTH, height)}
          />
        </svg>
        <span data-testid="wrg-rss-value" className="font-mono tabular-nums">
          {formatRss(latest.rss)}
        </span>
      </div>
    </div>
  );
}
