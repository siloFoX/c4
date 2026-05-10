import { useCallback, useState } from 'react';
import { apiGet } from './api';
import { t, tFormat } from './i18n';
import { useAutoClearMessage } from './use-auto-clear-message';

// (v1.10.685) Extracted from SpecialistsBulkOpsToolbar.
// GET /api/specialists/export then download the result
// as a pretty-printed JSON blob. Banner auto-clears
// after 4s so the next click starts fresh; failures
// flip the failed-tone flag for the destructive-style
// banner.
//
// (v1.10.764) Banner state moved to shared infra
// hook lib/use-auto-clear-message.

interface SpecialistsExportState {
  exportBusy: boolean;
  exportMsg: string | null;
  exportFailed: boolean;
  handleExport: () => Promise<void>;
}

export function useSpecialistsExport(): SpecialistsExportState {
  const [exportBusy, setExportBusy] = useState(false);
  const { msg: exportMsg, failed: exportFailed, setSuccess, setFailure, reset } =
    useAutoClearMessage();

  const handleExport = useCallback(async () => {
    setExportBusy(true);
    reset();
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
      setSuccess(tFormat('specialists.export.success', { count: bundle.specialists.length }));
    } catch (e) {
      setFailure(tFormat('specialists.export.failed', { error: (e as Error).message || t('common.unknown') }));
    } finally {
      setExportBusy(false);
    }
  }, [reset, setSuccess, setFailure]);

  return { exportBusy, exportMsg, exportFailed, handleExport };
}
