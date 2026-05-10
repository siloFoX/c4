import { useCallback, useState } from 'react';
import { apiPost } from './api';
import { t, tFormat } from './i18n';

// (v1.10.686) Extracted from SpecialistsBulkOpsToolbar.
// The two-step import flow — first the dryRun preview
// (parses the local JSON, POSTs with dryRun:true to get
// the diff), then the apply (POSTs again with
// dryRun:false after a window.confirm with the diff
// summary). The hook owns five state slots; the parent
// passes the merge/replace mode toggle so the JSX radio
// stays bound to the parent.
//
// (v1.10.773) SpecialistsImportMode literal canonical
// here — the parent toolbar imports the alias instead
// of re-declaring `'merge' | 'replace'` for the
// useState slot + onChange cast.

export type SpecialistsImportMode = 'merge' | 'replace';

export interface ImportResult {
  mode: string;
  dryRun: boolean;
  added: string[];
  updated: string[];
  removed: string[];
  skipped: string[];
  errors: Array<Record<string, unknown>>;
}

interface SpecialistsImportState {
  importBusy: boolean;
  importPreview: ImportResult | null;
  importBundle: unknown | null;
  importError: string | null;
  handleImportFile: (file: File) => Promise<void>;
  handleImportApply: () => Promise<void>;
}

export function useSpecialistsImport(args: {
  importMode: SpecialistsImportMode;
  onChange: () => void;
}): SpecialistsImportState {
  const { importMode, onChange } = args;
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

  return {
    importBusy, importPreview, importBundle, importError,
    handleImportFile, handleImportApply,
  };
}
