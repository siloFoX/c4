import { AlertTriangle, RefreshCw, ServerCog, ShieldAlert } from 'lucide-react';
import PageFrame, { ErrorPanel } from './PageFrame';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataList,
  EmptyState,
  Tooltip,
  VisuallyHidden,
} from '../components/ui';
import { cn } from '../lib/cn';
import { formatDuration, formatRelativeTime } from '../lib/format';
import { useHealth } from '../lib/use-health';
import { useDaemonRestartTracker } from '../lib/use-daemon-restart-tracker';
import {
  useAutonomousIncidents,
  type Incident,
} from '../lib/use-autonomous-incidents';

// (v1.11.249, TODO 11.231) Uptime + recent-incidents surface for
// the Diagnostics ("Health") group. Three blocks:
//   1. Uptime card -- pid, version, startedAt, uptime duration
//   2. Restart card -- operator-local restart counter + the
//      "since first seen" anchor (localStorage-backed; the
//      daemon does not surface its own restart history yet).
//   3. Recent incidents card -- last 5 halt / dispatch-error
//      entries from /api/autonomous/status `recent[]` plus the
//      reviewer escalations from `escalations[]`, sorted
//      newest-first.

const INCIDENT_VARIANT: Record<Incident['kind'], 'warning' | 'destructive'> = {
  halt: 'destructive',
  'dispatch-error': 'destructive',
  escalation: 'warning',
};

const INCIDENT_LABEL: Record<Incident['kind'], string> = {
  halt: 'Halt',
  'dispatch-error': 'Dispatch error',
  escalation: 'Escalation',
};

function IncidentIcon({ kind }: { kind: Incident['kind'] }) {
  if (kind === 'escalation') {
    return <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />;
  }
  return <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />;
}

export default function Uptime() {
  const health = useHealth();
  const restart = useDaemonRestartTracker({
    pid: typeof health.data?.pid === 'number' ? health.data.pid : undefined,
    startedAt:
      typeof health.data?.startedAt === 'string'
        ? health.data.startedAt
        : undefined,
  });
  const incidents = useAutonomousIncidents();

  const uptimeMs =
    typeof health.data?.uptime === 'number' ? health.data.uptime * 1000 : null;

  return (
    <PageFrame
      title="Uptime"
      description="Daemon process uptime, operator-local restart count, and the five most recent halt / escalation incidents from the autonomous loop."
      actions={
        <Tooltip label="Refresh">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              void health.refresh();
              void incidents.refresh();
            }}
            disabled={health.loading || incidents.loading}
            aria-label="Refresh uptime + incidents"
          >
            <RefreshCw
              className={cn(
                'h-3.5 w-3.5',
                (health.loading || incidents.loading) && 'animate-spin',
              )}
            />
            <VisuallyHidden>Refresh</VisuallyHidden>
          </Button>
        </Tooltip>
      }
    >
      {health.error ? (
        <ErrorPanel message={health.error} />
      ) : (
        <Card data-testid="uptime-card">
          <CardHeader className="flex flex-col gap-2 p-4 md:p-5">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ServerCog className="h-4 w-4 text-muted-foreground" aria-hidden />
              Daemon process
            </CardTitle>
            <CardDescription className="text-[11px]">
              Live snapshot from the daemon's `/api/health` endpoint.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 md:p-5 md:pt-0">
            <DataList
              items={[
                {
                  id: 'pid',
                  label: 'pid',
                  value:
                    typeof health.data?.pid === 'number'
                      ? String(health.data.pid)
                      : '-',
                },
                {
                  id: 'version',
                  label: 'version',
                  value:
                    typeof health.data?.version === 'string'
                      ? health.data.version
                      : '-',
                },
                {
                  id: 'started',
                  label: 'started',
                  value:
                    typeof health.data?.startedAt === 'string'
                      ? `${formatRelativeTime(health.data.startedAt)} (${health.data.startedAt})`
                      : '-',
                },
                {
                  id: 'uptime',
                  label: 'uptime',
                  value: uptimeMs != null ? formatDuration(uptimeMs) : '-',
                },
              ]}
            />
          </CardContent>
        </Card>
      )}

      <Card data-testid="restart-card">
        <CardHeader className="flex flex-col gap-2 p-4 md:p-5">
          <CardTitle className="flex items-center gap-2 text-sm">
            Restart counter
            <Badge variant="neutral" className="text-[10px]" data-testid="restart-count">
              {restart.restartCount}
            </Badge>
          </CardTitle>
          <CardDescription className="text-[11px]">
            Local to this browser session. Bumps when the daemon's pid or
            startedAt changes between polls. Clear localStorage to reset.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 text-[11px] text-muted-foreground md:p-5 md:pt-0">
          {restart.sinceFirstSeen ? (
            <span>
              since {formatRelativeTime(restart.sinceFirstSeen)} (
              {restart.sinceFirstSeen})
            </span>
          ) : (
            <span>no daemon contact yet</span>
          )}
        </CardContent>
      </Card>

      <Card data-testid="incidents-card">
        <CardHeader className="flex flex-col gap-2 p-4 md:p-5">
          <CardTitle className="flex items-center gap-2 text-sm">
            Recent incidents
            <Badge variant="neutral" className="text-[10px]">
              {incidents.incidents.length}
            </Badge>
          </CardTitle>
          <CardDescription className="text-[11px]">
            Last 5 halt / dispatch-error entries from
            `/api/autonomous/status` plus any open reviewer escalations,
            newest first. Empty when the loop is healthy.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 md:p-5 md:pt-0">
          {incidents.error ? (
            <ErrorPanel message={incidents.error} />
          ) : incidents.incidents.length === 0 ? (
            <EmptyState
              title="All clear"
              description="No halt / dispatch-error / escalation rows in the last status payload."
            />
          ) : (
            <ul className="flex flex-col gap-2" data-testid="incidents-list">
              {incidents.incidents.map((inc) => (
                <li
                  key={inc.key}
                  data-testid={`incident-${inc.kind}-${inc.at}`}
                  className="flex items-start gap-2 rounded-md border border-border bg-muted/10 p-2 text-xs"
                >
                  <Badge variant={INCIDENT_VARIANT[inc.kind]}>
                    <IncidentIcon kind={inc.kind} />
                    {INCIDENT_LABEL[inc.kind]}
                  </Badge>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    {inc.id ? (
                      <span className="truncate font-mono text-[11px] text-foreground">
                        {inc.id}
                      </span>
                    ) : null}
                    <span className="truncate text-[11px] text-muted-foreground">
                      {inc.reason}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatRelativeTime(inc.at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageFrame>
  );
}
