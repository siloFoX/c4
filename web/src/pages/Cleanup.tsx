import { Eye, RefreshCw, Trash2 } from 'lucide-react';
import PageFrame, { ErrorPanel, LoadingSkeleton } from './PageFrame';
import Toast from '../components/Toast';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Button, EmptyState, Panel, Tooltip } from '../components/ui';
import { AllDoneIllustration } from '../components/illustrations';
import { t, useLocale } from '../lib/i18n';
import { useToast } from '../lib/use-toast';
import { useCleanup } from '../lib/use-cleanup';

// 8.20B Cleanup. Calls POST /cleanup with dryRun=true to list orphan
// worktrees / branches / directories, and POST /cleanup with
// dryRun=false behind a confirm dialog to actually remove them.
// (v1.10.722) Toast slot adopted from lib/use-toast (shared infra).
// (v1.10.746) Preview + execute flows moved to lib/use-cleanup.

export default function Cleanup() {
  useLocale();
  const { toast, showToast, dismissToast } = useToast();
  const { data, loading, error, busy, confirmOpen, setConfirmOpen, preview, executeCleanup, commit } =
    useCleanup({ showToast });

  const branches = data?.branches || [];
  const worktrees = data?.worktrees || [];
  const directories = data?.directories || [];
  const total = branches.length + worktrees.length + directories.length;

  return (
    <PageFrame
      title={t('cleanupPage.title')}
      description={t('cleanupPage.description')}
      actions={
        <>
          <Tooltip label={t('cleanup.tooltip.dryRun')}>
            <Button type="button" variant="outline" size="sm" onClick={preview} disabled={loading || busy}>
              {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              <span>{t('cleanupPage.dryRun')}</span>
            </Button>
          </Tooltip>
          <Tooltip label={t('cleanup.tooltip.commit')}>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={commit}
              disabled={busy || loading || total === 0}
            >
              {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              <span>{t('cleanupPage.commit')}</span>
            </Button>
          </Tooltip>
        </>
      }
    >
      <PageDescriptionBanner
        summaryKey="cleanup.summary"
        cliKey="cleanup.cli"
        exampleKey="cleanup.example"
        useCasesKey="cleanup.useCases"
        onOpenHelp={openHelpDrawer}
      />
      {error && <ErrorPanel message={error} />}
      {loading && !data ? <LoadingSkeleton rows={4} /> : null}
      {data && total === 0 ? (
        <EmptyState
          icon={
            <span data-testid="cleanup-empty-illustration">
              <AllDoneIllustration size={160} />
            </span>
          }
          title={t('cleanup.empty')}
        />
      ) : null}
      {data && total > 0 && (
        <div className="flex flex-col gap-3">
          <ListPanel title={t('cleanup.preview.branches')} items={branches} />
          <ListPanel title={t('cleanup.preview.worktrees')} items={worktrees} />
          <ListPanel title={t('cleanup.preview.directories')} items={directories} />
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={t('cleanup.preview.heading')}
        description={t('cleanup.preview.irreversible')}
        busy={busy}
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={executeCleanup}
        onCancel={() => setConfirmOpen(false)}
        preview={
          <div className="flex flex-col gap-2">
            <PreviewGroup label={t('cleanup.preview.branches')} items={branches} />
            <PreviewGroup label={t('cleanup.preview.worktrees')} items={worktrees} />
            <PreviewGroup label={t('cleanup.preview.directories')} items={directories} />
          </div>
        }
      />

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

function PreviewGroup({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {label} ({items.length})
      </div>
      <ul className="max-h-32 space-y-0.5 overflow-y-auto pl-3 font-mono text-[11px] text-foreground">
        {items.map((name) => (
          <li key={name} className="truncate">{name}</li>
        ))}
      </ul>
    </div>
  );
}

function ListPanel({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <Panel title={`${title} (${items.length})`} className="p-3 text-xs">
      <ul className="space-y-0.5 font-mono">
        {items.map((name) => (
          <li key={name} className="truncate text-foreground">{name}</li>
        ))}
      </ul>
    </Panel>
  );
}
