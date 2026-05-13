import { FileText, Play, RefreshCw, Square } from 'lucide-react';
import PageFrame, { EmptyPanel, ErrorPanel, LoadingSkeleton } from './PageFrame';
import Toast from '../components/Toast';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Button, Panel, Tooltip } from '../components/ui';
import { formatRelativeTime } from '../lib/format';
import { t, useLocale } from '../lib/i18n';
import { useToast } from '../lib/use-toast';
import { useScribe } from '../lib/use-scribe';

// 8.20B Scribe feature page. Wraps POST /scribe/start|stop|scan, GET
// /scribe/status, and GET /scribe-context. No business logic -- just a
// UI surface for the c4 scribe CLI.
// (v1.10.722) Toast slot adopted from lib/use-toast (shared infra).
// (v1.10.745) Status + context fetch + act handler moved to lib/use-scribe.

export default function Scribe() {
  useLocale();
  const { toast, showToast, dismissToast } = useToast();
  const { status, context, loading, busy, error, refresh, act } = useScribe({ showToast });

  const running = Boolean(status?.running);

  return (
    <PageFrame
      title={t('scribePage.title')}
      description={t('scribePage.description')}
      actions={
        <>
          <Tooltip label={t('scribe.tooltip.start')}>
            <Button
              type="button"
              variant={running ? 'secondary' : 'default'}
              size="sm"
              onClick={() => act('/api/scribe/start', 'Scribe start')}
              disabled={busy !== null || running}
            >
              <Play className="h-3.5 w-3.5" />
              <span>{t('scribePage.start')}</span>
            </Button>
          </Tooltip>
          <Tooltip label={t('scribe.tooltip.stop')}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => act('/api/scribe/stop', 'Scribe stop')}
              disabled={busy !== null || !running}
            >
              <Square className="h-3.5 w-3.5" />
              <span>{t('scribePage.stop')}</span>
            </Button>
          </Tooltip>
          <Tooltip label={t('scribe.tooltip.scan')}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => act('/api/scribe/scan', 'Scribe scan')}
              disabled={busy !== null}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>{t('scribePage.scan')}</span>
            </Button>
          </Tooltip>
          <Tooltip label={t('scribe.tooltip.refresh')}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={refresh}
              disabled={loading}
              aria-label={t('scribePage.refreshStatus.label')}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="sr-only">{t('common.srOnlyRefresh')}</span>
            </Button>
          </Tooltip>
        </>
      }
    >
      <PageDescriptionBanner
        summaryKey="scribe.summary"
        cliKey="scribe.cli"
        exampleKey="scribe.example"
        useCasesKey="scribe.useCases"
        onOpenHelp={openHelpDrawer}
      />
      {loading && !status ? <LoadingSkeleton rows={3} /> : null}
      {error && <ErrorPanel message={error} />}
      {status && (
        <Panel className="flex flex-col gap-1 p-3 text-sm">
          <StatusRow label={t('scribe.row.running')} value={running ? t('scribe.value.yes') : t('scribe.value.no')} tone={running ? 'ok' : 'muted'} />
          <StatusRow label={t('scribe.row.lastScan')} value={formatRelativeTime(status.lastScan)} />
          <StatusRow label={t('scribe.row.scans')} value={String(status.scans ?? '-')} />
          <StatusRow label={t('scribe.row.sessions')} value={String(status.sessions ?? '-')} />
          <StatusRow label={t('scribe.row.contextPath')} value={status.contextPath || '-'} mono />
        </Panel>
      )}
      <div>
        <div className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t('scribePage.recentContext')}</span>
        </div>
        {context && context.content ? (
          <pre tabIndex={0} className="max-h-96 overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs text-foreground">
            {context.content}
          </pre>
        ) : (
          <EmptyPanel message={t('scribe.empty')} />
        )}
      </div>
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
        {toast && (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onDismiss={dismissToast}
          />
        )}
      </div>
    </PageFrame>
  );
}

interface StatusRowProps { label: string; value: string; mono?: boolean; tone?: 'ok' | 'muted' }

function StatusRow({ label, value, mono, tone }: StatusRowProps) {
  const toneCls = tone === 'ok' ? 'text-success' : tone === 'muted' ? 'text-muted-foreground' : 'text-foreground';
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`${mono ? 'font-mono text-xs' : 'text-sm'} ${toneCls}`}>{value}</span>
    </div>
  );
}
