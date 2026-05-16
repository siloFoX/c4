import { AlertTriangle, ServerCog, ShieldAlert } from 'lucide-react';
import PageFrame, { ErrorPanel } from './PageFrame';
import {
  Badge,
  DataList,
  EmptyState,
  Sparkline,
  Widget,
} from '../components/ui';
import { formatDuration, formatRelativeTime } from '../lib/format';
import { useHealth } from '../lib/use-health';
import { useDaemonRestartTracker } from '../lib/use-daemon-restart-tracker';
import {
  useAutonomousIncidents,
  type Incident,
} from '../lib/use-autonomous-incidents';

// (v1.11.249, TODO 11.231) Uptime + recent-incidents surface for
// the Diagnostics ("Health") group. Three Widget tiles:
//   1. Daemon process -- pid, version, startedAt, uptime duration
//   2. Restart counter -- operator-local restart counter + the
//      "since first seen" anchor (localStorage-backed; the
//      daemon does not surface its own restart history yet).
//   3. Recent incidents -- last 5 halt / dispatch-error rows
//      from /api/autonomous/status `recent[]` plus reviewer
//      escalations, sorted newest-first.
//
// (v1.11.256, TODO 11.238) Adopted the new Widget primitive so
// each tile carries a uniform "title + refresh + updated <iso>"
// header chrome. The header refresh button drives both
// useHealth().refresh and useAutonomousIncidents().refresh
// where the data is independent of the local restart tracker.

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

  const startedAt =
    typeof health.data?.startedAt === 'string' ? health.data.startedAt : null;

  return (
    <PageFrame
      title="Uptime"
      description="Daemon process uptime, operator-local restart count, and the five most recent halt / escalation incidents from the autonomous loop."
    >
      {health.error ? (
        <ErrorPanel message={health.error} />
      ) : (
        <Widget
          data-testid="uptime-card"
          title="Daemon process"
          icon={<ServerCog className="h-4 w-4" aria-hidden />}
          updatedAt={startedAt}
          updatedLabel="started"
          onRefresh={() => {
            void health.refresh();
          }}
          loading={health.loading}
        >
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
                value: startedAt
                  ? `${formatRelativeTime(startedAt)} (${startedAt})`
                  : '-',
              },
              {
                id: 'uptime',
                label: 'uptime',
                value: uptimeMs != null ? formatDuration(uptimeMs) : '-',
              },
            ]}
          />
        </Widget>
      )}

      <Widget
        data-testid="restart-card"
        title={
          <span className="inline-flex items-center gap-2">
            Restart counter
            <Badge
              variant="neutral"
              className="text-[10px]"
              data-testid="restart-count"
            >
              {restart.restartCount}
            </Badge>
          </span>
        }
        updatedAt={restart.sinceFirstSeen}
        updatedLabel="since"
        footer={
          restart.sinceFirstSeen ? (
            <span>
              Bumps when the daemon's pid or startedAt changes between polls.
              Clear localStorage to reset.
            </span>
          ) : (
            <span>No daemon contact yet -- counter starts on the next poll.</span>
          )
        }
      >
        {/* (v1.11.279, TODO 11.261) Sparkline trend of the
            rolling restartHistory[] series the hook now maintains.
            The pill stays flat when the daemon is healthy (no
            new entries appended) and rises step-wise on each
            restart bump -- the visual is intentionally a step
            chart rather than a smooth curve because that mirrors
            the counter's discrete semantics. */}
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>Local to this browser session.</span>
          <Sparkline
            data={restart.restartHistory}
            variant={restart.restartHistory.length > 0 ? 'warning' : 'muted'}
            size="md"
            showLastValue={restart.restartHistory.length > 0}
            lastValueFormatter={(v) => `#${v}`}
            ariaLabel={`Restart-count trend, ${restart.restartHistory.length} samples`}
            data-testid="restart-history-sparkline"
          />
        </div>
      </Widget>

      <Widget
        data-testid="incidents-card"
        title={
          <span className="inline-flex items-center gap-2">
            Recent incidents
            <Badge variant="neutral" className="text-[10px]">
              {incidents.incidents.length}
            </Badge>
          </span>
        }
        onRefresh={() => {
          void incidents.refresh();
        }}
        loading={incidents.loading}
        footer={
          <span>
            Last 5 halt / dispatch-error entries from /api/autonomous/status
            plus open reviewer escalations, newest first.
          </span>
        }
      >
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
      </Widget>
    </PageFrame>
  );
}
