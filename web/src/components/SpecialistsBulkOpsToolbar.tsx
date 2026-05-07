import { useCallback, useState } from 'react';
import { apiGet, apiPost } from '../lib/api';
import { Button } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';

// (v1.10.532) Extracted from SpecialistsView. The bulk
// export / import / audit-rotate toolbar — operators round-trip
// the specialist registry without dropping to CLI. Drops
// ~270 lines from SpecialistsView's mega-component.
//
// Single `onChange` callback signals the parent that the
// registry mutated (import-applied) so it can refresh().

interface ImportResult {
  mode: string;
  dryRun: boolean;
  added: string[];
  updated: string[];
  removed: string[];
  skipped: string[];
  errors: Array<Record<string, unknown>>;
}

interface Props {
  onChange: () => void | Promise<void>;
}

export default function SpecialistsBulkOpsToolbar({ onChange }: Props) {
  // Re-render on locale flip.
  useLocale();

  const [exportBusy, setExportBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exportFailed, setExportFailed] = useState(false);
  const handleExport = useCallback(async () => {
    setExportBusy(true);
    setExportMsg(null);
    setExportFailed(false);
    try {
      const bundle = await apiGet<{
        version: number;
        exportedAt: string;
        sourceVersion: number;
        specialists: unknown[];
      }>('/api/specialists/export');
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `c4-specialists-export-${bundle.exportedAt.replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportMsg(tFormat('specialists.export.success', { count: bundle.specialists.length }));
      window.setTimeout(() => setExportMsg(null), 4000);
    } catch (e) {
      setExportMsg(tFormat('specialists.export.failed', { error: (e as Error).message || t('common.unknown') }));
      setExportFailed(true);
    } finally {
      setExportBusy(false);
    }
  }, []);

  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importBusy, setImportBusy] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportResult | null>(null);
  const [importBundle, setImportBundle] = useState<unknown | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const handleImportFile = useCallback(async (file: File) => {
    setImportBusy(true);
    setImportError(null);
    setImportPreview(null);
    setImportBundle(null);
    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      setImportBundle(bundle);
      const res = await apiPost<ImportResult>('/api/specialists/import', {
        bundle,
        mode: importMode,
        dryRun: true,
      });
      setImportPreview(res);
    } catch (e) {
      setImportError((e as Error).message || t('common.importPreviewFailed'));
    } finally {
      setImportBusy(false);
    }
  }, [importMode]);
  const handleImportApply = useCallback(async () => {
    if (!importBundle) return;
    const summary = importPreview
      ? `+${importPreview.added.length} ~${importPreview.updated.length} -${importPreview.removed.length}`
      : '?';
    if (!window.confirm(tFormat('specialists.import.applyConfirm', { mode: importMode, summary }))) return;
    setImportBusy(true);
    setImportError(null);
    try {
      const res = await apiPost<ImportResult>('/api/specialists/import', {
        bundle: importBundle,
        mode: importMode,
        dryRun: false,
      });
      setImportPreview(res);
      // Signal the parent to refresh the specialist list.
      void onChange();
    } catch (e) {
      setImportError((e as Error).message || t('common.importFailed'));
    } finally {
      setImportBusy(false);
    }
  }, [importBundle, importMode, importPreview, onChange]);

  const [rotateBusy, setRotateBusy] = useState(false);
  const [rotateMsg, setRotateMsg] = useState<string | null>(null);
  const [rotateFailed, setRotateFailed] = useState(false);
  const handleAuditRotate = useCallback(async () => {
    if (!window.confirm(t('specialists.confirmAuditRotate'))) return;
    setRotateBusy(true);
    setRotateMsg(null);
    setRotateFailed(false);
    try {
      const res = await apiPost<{
        ok: boolean;
        rotated: boolean;
        archive?: string | null;
        bytes?: number;
      }>('/api/specialists/audit-rotate', { maxBytes: 0 });
      if (res.rotated) {
        setRotateMsg(tFormat('specialists.rotate.success', {
          archive: res.archive || t('specialists.rotate.fallback'),
        }));
      } else {
        setRotateMsg(t('specialists.rotate.skipped'));
      }
      window.setTimeout(() => setRotateMsg(null), 4000);
    } catch (e) {
      setRotateMsg(tFormat('specialists.rotate.failed', {
        error: (e as Error).message || t('common.unknown'),
      }));
      setRotateFailed(true);
    } finally {
      setRotateBusy(false);
    }
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/40 bg-muted/5 px-3 py-1.5 text-[11px]">
      <Button
        size="sm"
        variant="outline"
        onClick={handleExport}
        disabled={exportBusy}
        className="h-6 px-2 text-[10px]"
        title={t('specialists.tooltip.export')}
      >
        {exportBusy ? '…' : t('specialists.exportButton')}
      </Button>
      {exportMsg ? (
        <span className={cn(
          'truncate',
          exportFailed ? 'text-destructive' : 'text-muted-foreground',
        )}>
          {exportMsg}
        </span>
      ) : null}
      <span className="text-border">|</span>
      <label className="flex items-center gap-1 text-muted-foreground">
        {t('specialists.label.mode')}
        <select
          className="rounded border border-border bg-background px-1 py-0.5 text-[10px]"
          value={importMode}
          onChange={(e) => setImportMode(e.target.value as 'merge' | 'replace')}
          disabled={importBusy}
          aria-label={t('specialists.action.importMode')}
        >
          <option value="merge">{t('specialists.option.merge')}</option>
          <option value="replace">{t('specialists.option.replace')}</option>
        </select>
      </label>
      <label className="flex items-center gap-1 text-muted-foreground">
        {t('specialists.import.label')}
        <input
          type="file"
          accept="application/json,.json"
          disabled={importBusy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              void handleImportFile(file);
              // Reset input so re-selecting the same file fires
              e.target.value = '';
            }
          }}
          className="text-[10px] file:mr-2 file:rounded file:border file:border-border file:bg-background file:px-2 file:py-0.5 file:text-[10px]"
          aria-label={t('specialists.action.importBundle')}
        />
      </label>
      {importBusy ? <span className="text-muted-foreground">{t('specialists.import.previewing')}</span> : null}
      {importError ? (
        <span className="truncate text-destructive">{importError}</span>
      ) : null}
      {importPreview ? (
        <>
          <span className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">
            {importPreview.dryRun ? 'preview' : 'applied'}
            {' · +'}{importPreview.added.length}
            {' ~'}{importPreview.updated.length}
            {' -'}{importPreview.removed.length}
            {importPreview.errors.length > 0 ? ` ! ${importPreview.errors.length}` : ''}
          </span>
          {importPreview.dryRun ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleImportApply}
              disabled={importBusy}
              className="h-6 px-2 text-[10px] border-amber-500/60 text-amber-700 dark:text-amber-300"
              title={t('specialists.tooltip.applyImport')}
            >
              {t('common.apply')}
            </Button>
          ) : null}
        </>
      ) : null}
      <span className="text-border">|</span>
      <Button
        size="sm"
        variant="outline"
        onClick={handleAuditRotate}
        disabled={rotateBusy}
        className="h-6 px-2 text-[10px]"
        title={t('specialists.tooltip.rotateAudit')}
      >
        {rotateBusy ? '…' : t('specialists.rotateAudit')}
      </Button>
      {rotateMsg ? (
        <span className={cn(
          'truncate',
          rotateFailed ? 'text-destructive' : 'text-muted-foreground',
        )}>
          {rotateMsg}
        </span>
      ) : null}
    </div>
  );
}
