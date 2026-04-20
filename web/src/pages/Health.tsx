import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import PageFrame, { ErrorPanel, LoadingSkeleton } from './PageFrame';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Badge, Button, Panel, Tooltip } from '../components/ui';
import { apiGet } from '../lib/api';
import { formatDuration, formatNumber, formatRelativeTime } from '../lib/format';
import { t, useLocale } from '../lib/i18n';

// 8.20B Health dashboard. Reads GET /api/health and renders the fields
// the daemon surfaces today (pid, uptime, worker counts). Fields the
// health endpoint does not yet expose (event loop lag, loaded modules,
// queue depth) render as `-` and leave a sub-TODO in docs.

interface HealthPayload {
  ok?: boolean;
  pid?: number;
  uptime?: number;
  startedAt?: string;
  version?: string;
  workers?: number;
  activeWorkers?: number;
  idleWorkers?: number;
  busyWorkers?: number;
  queueDepth?: number;
  lostWorkers?: number;
  eventLoopLagMs?: number;
  modules?: string[];
  configPath?: string;
  error?: string;
  [key: string]: unknown;
}

export default function Health() {
  useLocale();
  const [data, setData] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiGet<HealthPayload>('/api/health');
      setData(r);
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [refresh]);

  const ok = data?.ok !== false && !error;

  return (
    <PageFrame
      title="Health"
      description="Daemon heartbeat. Uptime, worker counts, queue depth, and a snapshot of loaded modules."
      actions={
        <Tooltip label={t('health.tooltip.refresh')}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={loading}
            aria-label="Refresh health"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="sr-only">Refresh</span>
          </Button>
        </Tooltip>
      }
    >
      <PageDescriptionBanner
        summaryKey="health.summary"
        cliKey="health.cli"
        exampleKey="health.example"
        useCasesKey="health.useCases"
        onOpenHelp={openHelpDrawer}
      />
      {loading && !data ? <LoadingSkeleton rows={3} /> : null}
      {error && <ErrorPanel message={error} />}
      {data && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Badge variant={ok ? 'default' : 'outline'} className="uppercase">
              {ok ? 'healthy' : 'degraded'}
            </Badge>
            {data.version && (
              <span className="text-xs text-muted-foreground">v{String(data.version)}</span>
            )}
            {data.configPath && (
              <span className="truncate font-mono text-xs text-muted-foreground">
                {String(data.configPath)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="PID" value={data.pid != null ? String(data.pid) : '-'} />
            <Stat label="Uptime" value={formatDuration((data.uptime ?? 0) * 1000)} />
            <Stat label="Started" value={formatRelativeTime(data.startedAt)} />
            <Stat label="Workers total" value={formatNumber(data.workers)} />
            <Stat label="Active" value={formatNumber(data.activeWorkers ?? data.busyWorkers)} />
            <Stat label="Idle" value={formatNumber(data.idleWorkers)} />
            <Stat label="Queue depth" value={formatNumber(data.queueDepth)} />
            <Stat label="Lost workers" value={formatNumber(data.lostWorkers)} />
            <Stat label="Event-loop lag" value={data.eventLoopLagMs != null ? `${data.eventLoopLagMs} ms` : '-'} />
          </div>

          {Array.isArray(data.modules) && data.modules.length > 0 ? (
            <Panel title={`Loaded modules (${data.modules.length})`} className="p-3 text-xs">
              <ul className="grid grid-cols-1 gap-0.5 font-mono sm:grid-cols-2 lg:grid-cols-3">
                {data.modules.map((m) => (
                  <li key={m} className="truncate text-muted-foreground">{m}</li>
                ))}
              </ul>
            </Panel>
          ) : (
            <div className="text-xs text-muted-foreground">
              Loaded-modules / event-loop-lag fields are not yet exposed by the daemon. See TODO 8.20b-health-extensions.
            </div>
          )}
        </div>
      )}
    </PageFrame>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Panel className="flex flex-col gap-1 p-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-mono text-lg text-foreground">{value}</span>
    </Panel>
  );
}
