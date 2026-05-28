import { useState } from 'react';
import { Bot, Pause, Play, RefreshCw } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import AutonomousDigestMetrics from './AutonomousDigestMetrics';
import { useAutonomousDigest } from '../lib/use-autonomous-digest';
import { useAutonomousPauseToggle } from '../lib/use-autonomous-pause-toggle';
import { useEscalationResolve } from '../lib/use-escalation-resolve';

// (v1.10.349) Autonomous tab — operator-side surface for the
// Phase 8.29 reviewer escalation flow.
//
// Two halves:
//   1. Digest — once-per-load + on-demand refresh; shows the
//      autonomous loop's recent activity (window, dispatched,
//      succeeded, halted, errors, success rate, escalation
//      counts, paused state).
//   2. Escalations — list of pending reviewer-escalations with
//      Approve / Reject / Modify actions.
//
// The pause / resume buttons sit at the top of the digest panel
// since they're the strongest operator action — useful when an
// autonomous run is misbehaving.

export interface DigestResponse {
  windowMs: number;
  from: string;
  to: string;
  paused: boolean;
  dispatched: number;
  succeeded: number;
  halted: number;
  dispatchErrors: number;
  successRate: number | null;
  pendingEscalations: number;
  resolvedEscalations: number;
}

// (v1.10.570) fmtDuration moved to ./AutonomousDigestMetrics.tsx
// (the only place it's used).
// (v1.10.653) Escalation type + status/digest/escalations
// triple-fetch with 30s refresh moved to lib/use-autonomous-digest.

function fmtRelative(ms: number): string {
  const delta = Date.now() - ms;
  if (delta < 0) return t('autonomous.relative.future');
  if (delta < 60000) return t('autonomous.relative.justNow');
  if (delta < 3600000) return `${Math.floor(delta / 60000)}m ago`;
  if (delta < 86400000) return `${Math.floor(delta / 3600000)}h ago`;
  return `${Math.floor(delta / 86400000)}d ago`;
}

export default function AutonomousView() {
  useLocale();
  // (v1.10.355) When true the list shows resolved escalations
  // alongside pending ones. The daemon returns both; we filter
  // on the client. False by default so operators see actionable
  // items first.
  const [showResolved, setShowResolved] = useState(false);
  // (v1.10.535/v1.10.653) Triple-fetch (status + digest + escalations)
  // with 30s auto-refresh moved to lib/use-autonomous-digest.
  const {
    autonomousEnabled,
    digest,
    escalations,
    setEscalations,
    loading,
    digestError,
    escalError,
    refresh,
  } = useAutonomousDigest({ showResolved });

  // (v1.10.654) Pause/resume toggle moved to lib/use-autonomous-pause-toggle.
  const { pauseBusy, pauseMsg, pauseFailed, handlePauseToggle } =
    useAutonomousPauseToggle({ digest, refresh });

  // (v1.10.655) Per-escalation resolve flow moved to hook.
  const { resolveBusy, resolveError, resolveNotes, setResolveNotes, handleResolve } =
    useEscalationResolve({ setEscalations });

  return (
    // (v1.11.1103, TODO 11.1085) `flex-1 min-w-0` makes the view fill
    // its flex-row wrapper. Without it the root only took its content's
    // max-content width (~630px) and hugged the left edge, leaving ~810px
    // empty on the right at 1440. Now the cards span the content width,
    // the 4-col digest grid spreads across it, and the escalation list
    // uses the full width.
    <div
      data-section="autonomous-view"
      className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3 md:p-6"
    >
      <Card>
        {/* (v1.11.1111, TODO 11.1093) Stack the title and the
            Refresh/Pause actions on narrow widths so the red Pause
            button and the trailing status message no longer overflow
            and clip at the right edge at 375. At >= sm the header
            returns to the single-row title-left / actions-right
            layout. */}
        <CardHeader className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground" aria-hidden />
            <CardTitle className="text-base">{t('autonomous.title')}</CardTitle>
            {digest ? (
              <Badge variant={digest.paused ? 'destructive' : 'secondary'}>
                {digest.paused ? t('autonomous.status.paused') : t('autonomous.status.running')}
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={refresh}
              disabled={loading}
              className="h-7 px-2 text-[11px]"
              aria-label={t('autonomous.refresh.label')}
              data-testid="autonomous-refresh-btn"
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} aria-hidden />
              {t('common.refresh')}
            </Button>
            <Button
              size="sm"
              onClick={handlePauseToggle}
              disabled={pauseBusy || !digest}
              variant={digest?.paused ? 'default' : 'destructive'}
              className="h-7 px-2 text-[11px]"
              aria-label={digest?.paused ? t('autonomous.resume.label') : t('autonomous.pause.label')}
              data-testid="autonomous-pause-btn"
            >
              {digest?.paused ? (
                <Play className="h-3 w-3" aria-hidden />
              ) : (
                <Pause className="h-3 w-3" aria-hidden />
              )}
              {pauseBusy ? '…' : digest?.paused ? t('autonomous.resume') : t('autonomous.pause')}
            </Button>
            {pauseMsg ? (
              <span className={cn(
                'text-[11px]',
                pauseFailed ? 'text-destructive' : 'text-muted-foreground',
              )}>
                {pauseMsg}
              </span>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-4 text-[12px]">
          {autonomousEnabled === false ? (
            <div className="text-muted-foreground">{t('autonomous.notEnabled')}</div>
          ) : digestError ? (
            <div className="text-destructive">{digestError}</div>
          ) : !digest ? (
            <div className="text-muted-foreground">{t('common.loading')}</div>
          ) : (
            // (v1.10.570) Digest metrics extracted to ./AutonomousDigestMetrics.tsx
            <AutonomousDigestMetrics digest={digest} />
          )}
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="border-b border-border p-4">
          {/* (v1.11.1111, TODO 11.1093) Stack the title above the
              show-resolved control on narrow widths so the control no
              longer clips at the right edge at 375; row layout returns
              at >= sm. The control group wraps as a final safety. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">
              {showResolved ? t('autonomous.escalations.history') : t('autonomous.escalations.pending')}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <label
                className="flex items-center gap-1 text-[11px] text-muted-foreground"
                data-testid="autonomous-show-resolved"
              >
                <input
                  type="checkbox"
                  checked={showResolved}
                  onChange={(e) => setShowResolved(e.target.checked)}
                  className="h-3 w-3"
                />
                {t('autonomous.escalations.showResolved')}
              </label>
              {resolveError ? (
                <span className="text-[11px] text-destructive">{resolveError}</span>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-0">
          {escalError ? (
            <div className="p-4 text-[12px] text-destructive">{escalError}</div>
          ) : escalations.length === 0 ? (
            <div className="p-4 text-[12px] text-muted-foreground">
              {t('autonomous.escalations.empty')}
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {escalations.map((e) => {
                const isResolved = e.status === 'resolved';
                return (
                  <li key={e.id} className={cn(
                    'flex flex-col gap-1 p-3 text-[12px]',
                    isResolved && 'bg-muted/10',
                  )}>
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-border bg-background px-1.5 py-0 font-mono text-[10px]">
                        #{e.id}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">{e.kind}</Badge>
                      {isResolved ? (
                        <Badge variant="outline" className="text-[10px]">
                          {t('autonomous.escalations.resolvedPrefix')} · {e.resolvedAction || '?'}
                        </Badge>
                      ) : null}
                      {e.todoId ? (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          todo: {e.todoId}
                        </span>
                      ) : null}
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {isResolved && e.resolvedAt
                          ? `resolved ${fmtRelative(e.resolvedAt)}`
                          : fmtRelative(e.createdAt)}
                      </span>
                    </div>
                    <div className="text-foreground">{e.reason}</div>
                    {e.suggestedAction ? (
                      <div className="text-muted-foreground">
                        <span className="font-medium">{t('autonomous.escalations.suggested')}:</span> {e.suggestedAction}
                      </div>
                    ) : null}
                    {isResolved && e.resolvedNote ? (
                      <div className="text-muted-foreground italic">
                        <span className="font-medium not-italic">{t('autonomous.escalations.note')}:</span> {e.resolvedNote}
                      </div>
                    ) : null}
                    {!isResolved ? (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Input
                          type="text"
                          value={resolveNotes[e.id] || ''}
                          onChange={(ev) => setResolveNotes((prev) => ({
                            ...prev,
                            [e.id]: ev.target.value,
                          }))}
                          placeholder={t('autonomous.escalations.notePlaceholder')}
                          aria-label={tFormat('autonomous.resolveNoteAria', { id: e.id })}
                          disabled={resolveBusy === e.id}
                          className="h-7 max-w-md text-[11px]"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResolve(e.id, 'approve')}
                          disabled={resolveBusy === e.id}
                          className="h-6 px-2 text-[10px]"
                        >
                          {t('autonomous.escalations.approve')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResolve(e.id, 'reject')}
                          disabled={resolveBusy === e.id}
                          className="h-6 px-2 text-[10px]"
                        >
                          {t('autonomous.escalations.reject')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResolve(e.id, 'modify')}
                          disabled={resolveBusy === e.id || !resolveNotes[e.id]?.trim()}
                          className="h-6 px-2 text-[10px] border-warning/60 text-warning"
                          title={t('autonomous.escalations.modifyTitle')}
                        >
                          {t('autonomous.escalations.modify')}
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
