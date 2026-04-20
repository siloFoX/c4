import { useCallback, useEffect, useState } from 'react';
import { Eye, RefreshCw, Trash2 } from 'lucide-react';
import PageFrame, { EmptyPanel, ErrorPanel, LoadingSkeleton } from './PageFrame';
import Toast, { type ToastType } from '../components/Toast';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Button, Panel, Tooltip } from '../components/ui';
import { apiPost } from '../lib/api';
import { t, useLocale } from '../lib/i18n';

// 8.20B Cleanup. Calls POST /cleanup with dryRun=true to list orphan
// worktrees / branches / directories, and POST /cleanup with
// dryRun=false behind a confirm dialog to actually remove them.

interface CleanupResponse {
  dryRun?: boolean;
  branches?: string[];
  worktrees?: string[];
  directories?: string[];
  error?: string;
}

interface ToastState { id: number; message: string; type: ToastType }

export default function Cleanup() {
  useLocale();
  const [data, setData] = useState<CleanupResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);

  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ id: Date.now(), message, type });
  }, []);

  const preview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = (await apiPost<CleanupResponse>('/api/cleanup', { dryRun: true })) as CleanupResponse;
      if (r.error) {
        setError(r.error);
        setData(null);
      } else {
        setData(r);
      }
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    }
    setLoading(false);
  }, []);

  const executeCleanup = useCallback(async () => {
    setConfirmOpen(false);
    setBusy(true);
    setError(null);
    try {
      const r = (await apiPost<CleanupResponse>('/api/cleanup', { dryRun: false })) as CleanupResponse;
      if (r.error) {
        setError(r.error);
        showToast(`Cleanup failed: ${r.error}`, 'error');
      } else {
        setData(r);
        const removed = (r.branches?.length || 0) + (r.worktrees?.length || 0) + (r.directories?.length || 0);
        showToast(`Cleanup complete: ${removed} items removed`, 'success');
      }
    } catch (e) {
      setError((e as Error).message);
      showToast(`Cleanup failed: ${(e as Error).message}`, 'error');
    }
    setBusy(false);
  }, [showToast]);

  const commit = useCallback(() => {
    setConfirmOpen(true);
  }, []);

  useEffect(() => {
    preview();
  }, [preview]);

  const branches = data?.branches || [];
  const worktrees = data?.worktrees || [];
  const directories = data?.directories || [];
  const total = branches.length + worktrees.length + directories.length;

  return (
    <PageFrame
      title="Cleanup"
      description="Remove orphan c4/ branches, worktrees, and directories left behind by crashed workers or prior runs. Always runs a dry-run first."
      actions={
        <>
          <Tooltip label={t('cleanup.tooltip.dryRun')}>
            <Button type="button" variant="outline" size="sm" onClick={preview} disabled={loading || busy}>
              {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              <span>Dry-run</span>
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
              <span>Clean up</span>
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
        <EmptyPanel message={t('cleanup.empty')} />
      ) : null}
      {data && total > 0 && (
        <div className="flex flex-col gap-3">
          <ListPanel title="Branches" items={branches} />
          <ListPanel title="Worktrees" items={worktrees} />
          <ListPanel title="Orphan directories" items={directories} />
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
            onDismiss={() => setToast(null)}
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
