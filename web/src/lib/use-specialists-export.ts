import { useCallback, useState } from 'react';
import { apiGet } from './api';
import { t, tFormat } from './i18n';

// (v1.10.685) Extracted from SpecialistsBulkOpsToolbar.
// GET /api/specialists/export then download the result
// as a pretty-printed JSON blob. Banner auto-clears
// after 4s so the next click starts fresh; failures
// flip the failed-tone flag for the destructive-style
// banner.

interface SpecialistsExportState {
  exportBusy: boolean;
  exportMsg: string | null;
  exportFailed: boolean;
  handleExport: () => Promise<void>;
}

export function useSpecialistsExport(): SpecialistsExportState {
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

  return { exportBusy, exportMsg, exportFailed, handleExport };
}
