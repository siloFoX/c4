import { useCallback, useState } from 'react';
import { useSpecialistsExport } from '../lib/use-specialists-export';
import { useSpecialistsImport, type SpecialistsImportMode } from '../lib/use-specialists-import';
import { useAuditRotate } from '../lib/use-audit-rotate';
import { Button, Select } from './ui';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';

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

  const [importMode, setImportMode] = useState<SpecialistsImportMode>('merge');

  // (v1.10.686) Two-step import flow moved to lib/use-specialists-import.
  const {
    importBusy, importPreview, importError,
    handleImportFile, handleImportApply,
  } = useSpecialistsImport({ importMode, onChange });

  // (v1.10.687) Audit rotate moved to lib/use-audit-rotate.
  const { rotateBusy, rotateMsg, rotateFailed, handleAuditRotate } = useAuditRotate();

  // (v1.10.763) Stable file-input change handler — pulls the
  // first file off the FileList, fires the import preview, then
  // resets `target.value` so re-selecting the same file fires
  // the change event again.
  const handleImportFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        void handleImportFile(file);
        e.target.value = '';
      }
    },
    [handleImportFile],
  );

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
      <div className="flex items-center gap-1 text-muted-foreground">
        <span>{t('specialists.label.mode')}</span>
        <div className="min-w-[6rem]">
          <Select
            value={importMode}
            onChange={(v) => setImportMode(v as SpecialistsImportMode)}
            disabled={importBusy}
            ariaLabel={t('specialists.action.importMode')}
            options={[
              { value: 'merge', label: t('specialists.option.merge') },
              { value: 'replace', label: t('specialists.option.replace') },
            ]}
          />
        </div>
      </div>
      <label className="flex items-center gap-1 text-muted-foreground">
        {t('specialists.import.label')}
        <input
          type="file"
          accept="application/json,.json"
          disabled={importBusy}
          onChange={handleImportFileChange}
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
              className="h-6 px-2 text-[10px] border-warning/60 text-warning"
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
