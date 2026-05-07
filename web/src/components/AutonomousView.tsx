import { useCallback, useEffect, useState } from 'react';
import { Bot, Pause, Play, RefreshCw } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';

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

interface DigestResponse {
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

interface Escalation {
  id: number;
  todoId: string | null;
  reason: string;
  kind: string;
  suggestedAction: string;
  status: 'pending' | 'resolved';
  createdAt: number;
  resolvedAt: number | null;
  resolvedAction: string | null;
  resolvedNote: string | null;
}

function fmtDuration(ms: number): string {
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(0)}m`;
  if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
  return `${(ms / 86400000).toFixed(1)}d`;
}

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
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [digestError, setDigestError] = useState<string | null>(null);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [escalError, setEscalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // (v1.10.355) When true the list shows resolved escalations
  // alongside pending ones. The daemon returns both; we filter
  // on the client. False by default so operators see actionable
  // items first.
  const [showResolved, setShowResolved] = useState(false);
  const [pauseBusy, setPauseBusy] = useState(false);
  const [pauseMsg, setPauseMsg] = useState<string | null>(null);
  // (v1.10.484) Tone separated from message text — see prior tone refactors.
  const [pauseFailed, setPauseFailed] = useState(false);

  // (v1.10.535) Track whether autonomous mode is enabled. When
  // false, /digest and /escalations both 400; we gate on
  // /status (which always returns 200) so the UI shows a friendly
  // disabled state instead of spamming console errors.
  const [autonomousEnabled, setAutonomousEnabled] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setDigestError(null);
    setEscalError(null);
    try {
      const status = await apiGet<{ enabled: boolean; reason?: string }>(
        '/api/autonomous/status',
      );
      setAutonomousEnabled(status.enabled);
      if (!status.enabled) {
        setDigest(null);
        setEscalations([]);
        return;
      }
      const [d, e] = await Promise.all([
        apiGet<DigestResponse>('/api/autonomous/digest'),
        apiGet<{ count: number; escalations: Escalation[] }>(
          showResolved
            ? '/api/autonomous/escalations?status=all'
            : '/api/autonomous/escalations',
        ),
      ]);
      setDigest(d);
      setEscalations(e.escalations || []);
    } catch (err) {
      setDigestError((err as Error).message || t('common.failedToLoadDigest'));
    } finally {
      setLoading(false);
    }
  }, [showResolved]);

  useEffect(() => {
    refresh();
    // Light refresh cadence — operator dwells on this tab so 30s
    // is enough to keep the picture warm without spamming.
    const id = window.setInterval(refresh, 30000);
    return () => window.clearInterval(id);
  }, [refresh, showResolved]);

  const handlePauseToggle = useCallback(async () => {
    if (!digest) return;
    const path = digest.paused ? 'resume' : 'pause';
    setPauseBusy(true);
    setPauseMsg(null);
    setPauseFailed(false);
    try {
      await apiPost(`/api/autonomous/${path}`, {});
      setPauseMsg(t(path === 'resume' ? 'autonomous.pauseToggle.resumed' : 'autonomous.pauseToggle.paused'));
      window.setTimeout(() => setPauseMsg(null), 4000);
      void refresh();
    } catch (err) {
      setPauseMsg(tFormat(
        path === 'resume' ? 'autonomous.pauseToggle.resumeFailed' : 'autonomous.pauseToggle.pauseFailed',
        { error: (err as Error).message || t('common.unknown') },
      ));
      setPauseFailed(true);
    } finally {
      setPauseBusy(false);
    }
  }, [digest, refresh]);

  const [resolveBusy, setResolveBusy] = useState<number | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolveNotes, setResolveNotes] = useState<Record<number, string>>({});
  const handleResolve = useCallback(async (id: number, action: 'approve' | 'reject' | 'modify') => {
    if (action === 'modify') {
      const note = resolveNotes[id];
      if (!note || !note.trim()) {
        setResolveError(tFormat('autonomous.resolve.noteRequired', { id }));
        return;
      }
    }
    if (!window.confirm(tFormat('autonomous.confirmResolve', { id, action }))) return;
    setResolveBusy(id);
    setResolveError(null);
    try {
      const body: { action: string; note?: string } = { action };
      if (resolveNotes[id]?.trim()) body.note = resolveNotes[id].trim();
      await apiPost(`/api/autonomous/escalations/${id}`, body);
      // Optimistically remove from the visible list — the next
      // refresh tick will drop it server-side too.
      setEscalations((prev) => prev.filter((e) => e.id !== id));
      setResolveNotes((prev) => { const next = { ...prev }; delete next[id]; return next; });
    } catch (err) {
      setResolveError(tFormat('autonomous.resolve.failed', {
        error: (err as Error).message || t('common.unknown'),
      }));
    } finally {
      setResolveBusy(null);
    }
  }, [resolveNotes]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3 md:p-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground" aria-hidden />
            <CardTitle className="text-base">{t('autonomous.title')}</CardTitle>
            {digest ? (
              <Badge variant={digest.paused ? 'destructive' : 'secondary'}>
                {digest.paused ? t('autonomous.status.paused') : t('autonomous.status.running')}
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={refresh}
              disabled={loading}
              className="h-7 px-2 text-[11px]"
              aria-label={t('autonomous.refresh.label')}
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
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4">
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">{t('autonomous.metric.window')}</div>
                <div className="font-mono">{fmtDuration(digest.windowMs)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">{t('autonomous.metric.dispatched')}</div>
                <div className="font-mono">{digest.dispatched}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">{t('autonomous.metric.succeeded')}</div>
                <div className="font-mono text-emerald-700 dark:text-emerald-400">
                  {digest.succeeded}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">{t('autonomous.metric.halted')}</div>
                <div className={cn(
                  'font-mono',
                  digest.halted > 0 ? 'text-amber-700 dark:text-amber-400' : '',
                )}>
                  {digest.halted}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">{t('autonomous.metric.dispatchErrors')}</div>
                <div className={cn(
                  'font-mono',
                  digest.dispatchErrors > 0 ? 'text-destructive' : '',
                )}>
                  {digest.dispatchErrors}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">{t('autonomous.metric.successRate')}</div>
                <div className="font-mono">
                  {digest.successRate != null
                    ? `${(digest.successRate * 100).toFixed(1)}%`
                    : '—'}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">{t('autonomous.metric.pendingEscalations')}</div>
                <div className={cn(
                  'font-mono',
                  digest.pendingEscalations > 0 ? 'text-amber-700 dark:text-amber-400' : '',
                )}>
                  {digest.pendingEscalations}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">{t('autonomous.metric.resolvedEscalations')}</div>
                <div className="font-mono text-muted-foreground">
                  {digest.resolvedEscalations}
                </div>
              </div>
              <div className="col-span-2 md:col-span-4">
                <div className="text-[10px] uppercase text-muted-foreground">{t('autonomous.metric.windowRange')}</div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {digest.from} → {digest.to}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="border-b border-border p-4">
          <div className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">
              {showResolved ? t('autonomous.escalations.history') : t('autonomous.escalations.pending')}
            </CardTitle>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
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
                          className="h-6 px-2 text-[10px] border-amber-500/60 text-amber-700 dark:text-amber-300"
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
