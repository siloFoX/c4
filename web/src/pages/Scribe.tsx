import { useCallback, useEffect, useState } from 'react';
import { FileText, Play, RefreshCw, Square } from 'lucide-react';
import PageFrame, { EmptyPanel, ErrorPanel, LoadingSkeleton } from './PageFrame';
import Toast, { type ToastType } from '../components/Toast';
import { Button, Panel } from '../components/ui';
import { apiFetch, apiPost } from '../lib/api';
import { formatRelativeTime } from '../lib/format';

// 8.20B Scribe feature page. Wraps POST /scribe/start|stop|scan, GET
// /scribe/status, and GET /scribe-context. No business logic -- just a
// UI surface for the c4 scribe CLI.

interface ScribeStatus {
  running?: boolean;
  lastScan?: string | number | null;
  scans?: number;
  sessions?: number;
  bytesWritten?: number;
  contextPath?: string;
  error?: string;
  [key: string]: unknown;
}

interface ContextResponse {
  content?: string;
  path?: string;
  updatedAt?: string | number;
  error?: string;
}

interface ToastState { id: number; message: string; type: ToastType }

export default function Scribe() {
  const [status, setStatus] = useState<ScribeStatus | null>(null);
  const [context, setContext] = useState<ContextResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ id: Date.now(), message, type });
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/scribe/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ScribeStatus;
      setStatus(data);
    } catch (e) {
      setError((e as Error).message);
      setStatus(null);
    }
    try {
      const res = await apiFetch('/api/scribe-context');
      if (res.ok) {
        const data = (await res.json()) as ContextResponse;
        setContext(data);
      } else {
        setContext(null);
      }
    } catch {
      setContext(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const act = useCallback(
    async (endpoint: string, label: string) => {
      setBusy(endpoint);
      try {
        await apiPost(endpoint, {});
        showToast(`${label} ok`, 'success');
      } catch (e) {
        showToast(`${label} failed: ${(e as Error).message}`, 'error');
      }
      setBusy(null);
      refresh();
    },
    [refresh, showToast],
  );

  const running = Boolean(status?.running);

  return (
    <PageFrame
      title="Scribe"
      description="Session context recorder. Tail activity into docs/session-context.md so the next manager session picks up where the last one left off."
      actions={
        <>
          <Button
            type="button"
            variant={running ? 'secondary' : 'default'}
            size="sm"
            onClick={() => act('/api/scribe/start', 'Scribe start')}
            disabled={busy !== null || running}
          >
            <Play className="h-3.5 w-3.5" />
            <span>Start</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => act('/api/scribe/stop', 'Scribe stop')}
            disabled={busy !== null || !running}
          >
            <Square className="h-3.5 w-3.5" />
            <span>Stop</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => act('/api/scribe/scan', 'Scribe scan')}
            disabled={busy !== null}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Scan</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={loading}
            aria-label="Refresh scribe status"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="sr-only">Refresh</span>
          </Button>
        </>
      }
    >
      {loading && !status ? <LoadingSkeleton rows={3} /> : null}
      {error && <ErrorPanel message={error} />}
      {status && (
        <Panel className="flex flex-col gap-1 p-3 text-sm">
          <StatusRow label="Running" value={running ? 'yes' : 'no'} tone={running ? 'ok' : 'muted'} />
          <StatusRow label="Last scan" value={formatRelativeTime(status.lastScan)} />
          <StatusRow label="Scans" value={String(status.scans ?? '-')} />
          <StatusRow label="Sessions" value={String(status.sessions ?? '-')} />
          <StatusRow label="Context path" value={status.contextPath || '-'} mono />
        </Panel>
      )}
      <div>
        <div className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Recent context</span>
        </div>
        {context && context.content ? (
          <pre className="max-h-96 overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs text-foreground">
            {context.content}
          </pre>
        ) : (
          <EmptyPanel message="No context snapshot available yet. Start scribe and run scan to generate one." />
        )}
      </div>
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
        {toast && (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onDismiss={() => setToast(null)}
          />
        )}
      </div>
    </PageFrame>
  );
}

interface StatusRowProps { label: string; value: string; mono?: boolean; tone?: 'ok' | 'muted' }

function StatusRow({ label, value, mono, tone }: StatusRowProps) {
  const toneCls = tone === 'ok' ? 'text-emerald-400' : tone === 'muted' ? 'text-muted-foreground' : 'text-foreground';
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`${mono ? 'font-mono text-xs' : 'text-sm'} ${toneCls}`}>{value}</span>
    </div>
  );
}
