import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Cog } from 'lucide-react';
import PageFrame, { ErrorPanel } from './PageFrame';
import { Button, Input, Panel } from '../components/ui';
import { apiGet, apiPost } from '../lib/api';
import { cn } from '../lib/cn';

// (v1.10.358) Config viewer + reload trigger.
//
// Surfaces:
//   GET  /api/config        → returns the live, sanitised daemon
//                             config (secrets stripped)
//   POST /api/config/reload → re-reads config.json, restarts
//                             sub-systems as needed
//
// The viewer renders the JSON tree with a search filter that
// keeps top-level keys whose serialised value matches the query.
// Reload returns success/failure inline; a confirm dialog
// guards the click since reload restarts subsystems.

interface ConfigResponse {
  config: Record<string, unknown>;
}

interface ReloadResponse {
  ok: boolean;
}

function summariseValue(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === 'string') return `"${v.slice(0, 40)}${v.length > 40 ? '…' : ''}"`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === 'object') return `{${Object.keys(v as object).length} keys}`;
  return typeof v;
}

export default function Config() {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [reloadBusy, setReloadBusy] = useState(false);
  const [reloadMsg, setReloadMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<ConfigResponse>('/api/config');
      setConfig(res.config || {});
    } catch (e) {
      setError((e as Error).message || 'Failed to load config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleReload = useCallback(async () => {
    if (!window.confirm(
      'Reload config.json from disk?\n\n' +
      'Sub-systems may restart. Use this when you\'ve edited the\n' +
      'daemon config file and want it to take effect without a\n' +
      'full daemon restart.',
    )) return;
    setReloadBusy(true);
    setReloadMsg(null);
    try {
      const res = await apiPost<ReloadResponse>('/api/config/reload', {});
      setReloadMsg(res.ok ? 'reload ok — sub-systems re-applied' : 'reload returned not-ok');
      window.setTimeout(() => setReloadMsg(null), 5000);
      refresh();
    } catch (e) {
      setReloadMsg(`reload failed: ${(e as Error).message || 'unknown'}`);
    } finally {
      setReloadBusy(false);
    }
  }, [refresh]);

  const filtered = (() => {
    if (!config) return null;
    if (!filter.trim()) return config;
    const q = filter.toLowerCase();
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(config)) {
      // Match either the key, or anything in the JSON-serialised value.
      const serialised = JSON.stringify(v).toLowerCase();
      if (k.toLowerCase().includes(q) || serialised.includes(q)) {
        out[k] = v;
      }
    }
    return out;
  })();

  return (
    <PageFrame
      title="Config"
      description="Live daemon config (sans secrets) + reload."
      actions={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={refresh}
          disabled={loading}
          aria-label="Refresh config"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          <span>Refresh</span>
        </Button>
      }
    >
      <div className="rounded-md border border-border bg-muted/10 p-3 text-[12px] text-muted-foreground">
        Mirrors <code className="font-mono">c4 config</code>. The daemon
        sanitises secrets (slack tokens, JWT secret, etc.) before serving;
        what you see here is safe to copy / share. Use Reload after editing
        config.json on disk to apply without a daemon restart.
      </div>

      <Panel className="text-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Cog className="h-4 w-4 text-muted-foreground" aria-hidden />
            Live config
          </h3>
          <Input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter top-level keys / values"
            aria-label="Filter config keys"
            className="ml-auto h-7 max-w-xs text-[11px]"
            disabled={loading}
          />
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={handleReload}
            disabled={reloadBusy}
            className="h-7 px-2 text-[11px]"
            title="POST /api/config/reload — re-reads config.json, restarts subsystems as needed"
          >
            {reloadBusy ? 'Reloading…' : 'Reload from disk'}
          </Button>
          {reloadMsg ? (
            <span className={cn(
              'text-[11px]',
              reloadMsg.startsWith('reload failed') ? 'text-destructive' : 'text-muted-foreground',
            )}>
              {reloadMsg}
            </span>
          ) : null}
        </div>
        {error ? <ErrorPanel message={error} /> : null}
        {!filtered ? (
          <div className="text-[12px] text-muted-foreground">Loading…</div>
        ) : Object.keys(filtered).length === 0 ? (
          <div className="text-[12px] text-muted-foreground">
            {filter ? `No keys match "${filter}".` : 'Empty config.'}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {Object.entries(filtered).map(([k, v]) => (
              <details
                key={k}
                className="rounded-md border border-border bg-muted/10 text-[12px]"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 hover:bg-muted/30">
                  <code className="font-mono text-[11px]">{k}</code>
                  <span className="text-[10px] text-muted-foreground">
                    {summariseValue(v)}
                  </span>
                </summary>
                <pre className="border-t border-border bg-background p-2 font-mono text-[11px] leading-snug">
                  {JSON.stringify(v, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        )}
      </Panel>
    </PageFrame>
  );
}
