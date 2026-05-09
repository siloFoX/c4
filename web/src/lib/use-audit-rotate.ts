import { useCallback, useState } from 'react';
import { apiPost } from './api';
import { t, tFormat } from './i18n';

// (v1.10.687) Extracted from SpecialistsBulkOpsToolbar.
// POST /api/specialists/audit-rotate behind a
// window.confirm — forces an audit-log rotation
// regardless of size (`maxBytes: 0`). Banner reports
// the new archive path on success, "skipped" if the
// daemon decided not to rotate, or an error message on
// failure. Banner auto-clears after 4s.

interface AuditRotateState {
  rotateBusy: boolean;
  rotateMsg: string | null;
  rotateFailed: boolean;
  handleAuditRotate: () => Promise<void>;
}

export function useAuditRotate(): AuditRotateState {
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

  return { rotateBusy, rotateMsg, rotateFailed, handleAuditRotate };
}
