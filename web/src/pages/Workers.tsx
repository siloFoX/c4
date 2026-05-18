import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import PageFrame from './PageFrame';
import {
  BadgeCounter,
  Button,
  Card,
  CardContent,
  Sparkline,
  ToastProvider,
  useToast,
} from '../components/ui';
import { cn } from '../lib/cn';

// (v1.11.332, TODO 11.314) Workers page hero. Surfaces
// a compact, glance-able header for the operator
// dashboard: live busy / idle / lost counts pulled from
// the daemon `/api/list` endpoint, a last-hour activity
// sparkline, and a primary "spawn worker" CTA wired to
// Toast feedback.
//
// The detailed worker list itself lives in the sidebar
// (`web/src/components/WorkerList.tsx`) -- this feature
// page is the operator's "at a glance" hero, not a
// duplicate of the list. The hero refreshes from the
// same `/api/list` endpoint as the sidebar so the
// counts always agree.

interface WorkerListEntry {
  name?: string;
  state?: string;
  status?: string;
  tier?: string;
}

interface WorkerListResponse {
  workers?: WorkerListEntry[];
  lost?: WorkerListEntry[];
}

interface WorkerCounts {
  busy: number;
  idle: number;
  lost: number;
  total: number;
}

const POLL_INTERVAL_MS = 5000;
const SPARKLINE_BUCKETS = 12;

function deriveCounts(json: WorkerListResponse | null): WorkerCounts {
  if (!json || !Array.isArray(json.workers)) {
    return { busy: 0, idle: 0, lost: 0, total: 0 };
  }
  let busy = 0;
  let idle = 0;
  for (const w of json.workers) {
    const s = (w?.state ?? w?.status ?? '').toLowerCase();
    if (s === 'busy' || s === 'running' || s === 'dispatching') {
      busy += 1;
    } else {
      idle += 1;
    }
  }
  const lost = Array.isArray(json.lost) ? json.lost.length : 0;
  return { busy, idle, lost, total: busy + idle };
}

function useWorkerCounts(): WorkerCounts {
  const [counts, setCounts] = useState<WorkerCounts>({
    busy: 0,
    idle: 0,
    lost: 0,
    total: 0,
  });
  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const res = await fetch('/api/list');
        if (!res.ok) return;
        const json = (await res.json()) as WorkerListResponse;
        if (!cancelled) setCounts(deriveCounts(json));
      } catch {
        // network error -- keep last known counts
      }
    };
    fetchOnce();
    const id = window.setInterval(fetchOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);
  return counts;
}

// Sparkline drives off the live total worker count. We
// keep a rolling buffer in localStorage so the trend
// survives page reloads inside the same browser
// session. Each push adds a sample bucket; the buffer
// caps at SPARKLINE_BUCKETS so the sparkline always has
// a fixed-width history.
const SPARKLINE_STORAGE_KEY = 'c4:workers:hero-sparkline';

function readSparklineBuffer(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SPARKLINE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v) => typeof v === 'number');
  } catch {
    return [];
  }
}

function writeSparklineBuffer(values: number[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      SPARKLINE_STORAGE_KEY,
      JSON.stringify(values),
    );
  } catch {
    // private mode -- ignore
  }
}

function useSparklineBuffer(latest: number): number[] {
  const [buffer, setBuffer] = useState<number[]>(() => readSparklineBuffer());
  useEffect(() => {
    setBuffer((prev) => {
      const next = [...prev, latest].slice(-SPARKLINE_BUCKETS);
      writeSparklineBuffer(next);
      return next;
    });
  }, [latest]);
  return buffer;
}

interface SpawnCtaProps {
  onSpawnRequest: () => Promise<void>;
}

function SpawnCta({ onSpawnRequest }: SpawnCtaProps) {
  const { pushToast } = useToast();
  const [pending, setPending] = useState(false);
  const handleClick = useCallback(async () => {
    if (pending) return;
    setPending(true);
    try {
      await onSpawnRequest();
      pushToast({
        kind: 'success',
        message: 'Spawn request sent. Track progress in the worker list.',
      });
    } catch (err) {
      pushToast({
        kind: 'error',
        message:
          err instanceof Error
            ? `Spawn failed: ${err.message}`
            : 'Spawn failed. See diagnostics for details.',
      });
    } finally {
      setPending(false);
    }
  }, [onSpawnRequest, pending, pushToast]);
  return (
    <Button
      variant="default"
      loading={pending}
      loadingLabel="Spawning"
      onClick={handleClick}
      data-testid="workers-hero-spawn-cta"
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      Spawn worker
    </Button>
  );
}

interface HeroBodyProps {
  onSpawnRequest: () => Promise<void>;
}

function HeroBody({ onSpawnRequest }: HeroBodyProps) {
  const counts = useWorkerCounts();
  const sparkBuffer = useSparklineBuffer(counts.total);
  const sparkData = useMemo(() => {
    // Sparkline needs at least 2 points to render a
    // line. Pad with the current value so the chart
    // shape stays stable during the first few seconds.
    if (sparkBuffer.length >= 2) return sparkBuffer;
    if (sparkBuffer.length === 1) return [sparkBuffer[0]!, sparkBuffer[0]!];
    return [counts.total, counts.total];
  }, [sparkBuffer, counts.total]);

  return (
    <div
      data-section="workers-hero"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <CountBlock
            label="Busy"
            value={counts.busy}
            tone="accent"
            testId="workers-hero-count-busy"
          />
          <CountBlock
            label="Idle"
            value={counts.idle}
            tone="muted"
            testId="workers-hero-count-idle"
          />
          <CountBlock
            label="Lost"
            value={counts.lost}
            tone="danger"
            testId="workers-hero-count-lost"
          />
        </div>
        <SpawnCta onSpawnRequest={onSpawnRequest} />
      </div>
      <div
        className="flex flex-col gap-1"
        data-section="workers-hero-trend"
      >
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Last-hour activity
        </span>
        <Sparkline
          data={sparkData}
          size="md"
          width="100%"
          variant="line"
          showDots={false}
          showLastValue
          ariaLabel={`Worker total trend: ${sparkData.length} samples, latest ${counts.total}`}
          data-testid="workers-hero-sparkline"
        />
      </div>
    </div>
  );
}

interface CountBlockProps {
  label: string;
  value: number;
  tone: 'accent' | 'muted' | 'danger';
  testId: string;
}

function CountBlock({ label, value, tone, testId }: CountBlockProps) {
  const badgeTone =
    tone === 'accent' ? 'accent' : tone === 'danger' ? 'danger' : 'neutral';
  return (
    <div
      className={cn(
        'flex flex-col gap-0.5 rounded-md border border-border bg-muted/20 px-3 py-2 min-w-[88px]',
      )}
      data-section="workers-hero-count-block"
      data-tone={tone}
      data-testid={testId}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <BadgeCounter
        count={value}
        max={99}
        showZero
        tone={badgeTone}
        size="md"
        variant="solid"
        srLabel={`${label}: ${value}`}
      />
    </div>
  );
}

// Dispatches the spawn request and rejects on non-OK.
// The Toast in <SpawnCta> reads the rejection's
// `Error.message` so we surface a useful detail.
async function defaultSpawnRequest(): Promise<void> {
  const name = `auto-${Math.floor(Date.now() / 1000).toString(36)}`;
  const res = await fetch('/api/workers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `HTTP ${res.status}`);
  }
}

export interface WorkersProps {
  // Optional override so tests / specialised mount
  // points can intercept the spawn fetch. Production
  // mounts pass nothing and get the daemon
  // `POST /api/workers` request shape.
  onSpawnRequest?: () => Promise<void>;
}

export default function Workers({
  onSpawnRequest = defaultSpawnRequest,
}: WorkersProps = {}) {
  return (
    <PageFrame
      title="Workers"
      description="At-a-glance worker dashboard. The detailed list lives in the sidebar."
    >
      <ToastProvider>
        <Card data-testid="workers-hero-card">
          <CardContent className="p-4 md:p-6">
            <HeroBody onSpawnRequest={onSpawnRequest} />
          </CardContent>
        </Card>
      </ToastProvider>
    </PageFrame>
  );
}
