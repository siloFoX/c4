import { useState } from 'react';
import { RefreshCw, Cog } from 'lucide-react';
import PageFrame, { ErrorPanel } from './PageFrame';
import { Button, Input, Panel } from '../components/ui';
import { t, tFormat, useLocale } from '../lib/i18n';
import { cn } from '../lib/cn';
import { useConfig } from '../lib/use-config';

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
// (v1.10.723) Fetch + reload state machine moved to lib/use-config.

function summariseValue(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === 'string') return `"${v.slice(0, 40)}${v.length > 40 ? '…' : ''}"`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === 'object') return `{${Object.keys(v as object).length} keys}`;
  return typeof v;
}

export default function Config() {
  useLocale();
  // (v1.10.477) Tone separated from message text so localized
  // copy doesn't accidentally drop into the success branch when
  // .startsWith('reload failed') stops matching the translated
  // error string. (v1.10.723) State machine moved to use-config hook.
  const { config, error, loading, refresh, reloadBusy, reloadMsg, reloadFailed, handleReload } =
    useConfig();
  const [filter, setFilter] = useState('');

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
      title={t('config.title')}
      description={t('config.description')}
      actions={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={refresh}
          disabled={loading}
          aria-label={t('config.refresh.label')}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          <span>{t('common.refresh')}</span>
        </Button>
      }
    >
      <div className="rounded-md border border-border bg-muted/10 p-3 text-[12px] text-muted-foreground">
        {t('config.intro')}
      </div>

      <Panel className="text-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Cog className="h-4 w-4 text-muted-foreground" aria-hidden />
            {t('config.heading')}
          </h3>
          <Input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('config.filter.placeholder')}
            aria-label={t('config.filter.label')}
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
            title={t('config.reload.title')}
          >
            {reloadBusy ? t('config.reloading') : t('config.reload')}
          </Button>
          {reloadMsg ? (
            <span className={cn(
              'text-[11px]',
              reloadFailed ? 'text-destructive' : 'text-muted-foreground',
            )}>
              {reloadMsg}
            </span>
          ) : null}
        </div>
        {error ? <ErrorPanel message={error} /> : null}
        {!filtered ? (
          <div className="text-[12px] text-muted-foreground">{t('common.loading')}</div>
        ) : Object.keys(filtered).length === 0 ? (
          <div className="text-[12px] text-muted-foreground">
            {filter ? tFormat('config.noMatch', { filter }) : t('config.empty')}
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
