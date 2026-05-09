import { useCallback, useState } from 'react';
import { apiFetch } from './api';
import type { AuditWindow } from './use-specialists-audit';

// (v1.10.684) Extracted from SpecialistsAuditPanel. CSV
// export of the audit log — uses the same window
// selector as the audit poll. Defaults to UTF-8 BOM +
// CRLF for Excel-friendliness (the daemon honors
// `lineEnd=crlf`). Failures are silent because the
// download was a best-effort one-off — there's no UI
// surface to report into without a sibling banner.

interface AuditExportState {
  exportAuditBusy: boolean;
  handleAuditExport: () => Promise<void>;
}

export function useAuditExport(args: {
  auditWindow: AuditWindow;
}): AuditExportState {
  const { auditWindow } = args;
  const [exportAuditBusy, setExportAuditBusy] = useState(false);

  const handleAuditExport = useCallback(async () => {
    setExportAuditBusy(true);
    try {
      const params = new URLSearchParams();
      if (auditWindow !== 'all') {
        const hours = auditWindow === '1h' ? 1 : auditWindow === '24h' ? 24 : 24 * 7;
        params.set('from', new Date(Date.now() - hours * 3600 * 1000).toISOString());
      }
      params.set('lineEnd', 'crlf');
      const url = `/api/audit/export?${params.toString()}`;
      const res = await apiFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement('a');
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl;
      a.download = `c4-audit-${auditWindow}-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch {
      // best-effort — silent failure
    } finally {
      setExportAuditBusy(false);
    }
  }, [auditWindow]);

  return { exportAuditBusy, handleAuditExport };
}
