import { useCallback, useState } from 'react';
import { apiPost } from '../lib/api';
import { useSpecialistsExport } from '../lib/use-specialists-export';
import { useSpecialistsImport } from '../lib/use-specialists-import';
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

// (v1.10.686) ImportResult type + import flow moved to
// lib/use-specialists-import.

interface Props {
  onChange: () => void | Promise<void>;
}

export default function SpecialistsBulkOpsToolbar({ onChange }: Props) {
  // Re-render on locale flip.
  useLocale();

  // (v1.10.685) Specialists export moved to lib/use-specialists-export.
  const { exportBusy, exportMsg, exportFailed, handleExport } = useSpecialistsExport();

  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');

  // (v1.10.686) Two-step import flow moved to lib/use-specialists-import.
  const {
    importBusy, importPreview, importError,
    handleImportFile, handleImportApply,
  } = useSpecialistsImport({ importMode, onChange });

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
