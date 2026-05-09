import { useCallback, useState } from 'react';
import { apiGet } from './api';
import { t, tFormat } from './i18n';

// (v1.10.662) Extracted from MeetingsMaintenancePanel.
// The persist-integrity check — GET
// /api/meetings/persist-integrity. Three branches:
// (1) persist disabled → friendly note,
// (2) ok=true → green check,
// (3) errors[] → red banner with the first three errors.
// Network errors fall through to the same red banner.

interface MeetingIntegrityState {
  integrityBusy: boolean;
  integrityMsg: string | null;
  integrityFailed: boolean;
  handleIntegrity: () => Promise<void>;
}

export function useMeetingIntegrity(): MeetingIntegrityState {
  const [integrityBusy, setIntegrityBusy] = useState(false);
  const [integrityMsg, setIntegrityMsg] = useState<string | null>(null);
  const [integrityFailed, setIntegrityFailed] = useState(false);

  const handleIntegrity = useCallback(async () => {
    setIntegrityBusy(true);
    setIntegrityMsg(null);
    setIntegrityFailed(false);
    try {
      const res = await apiGet<{ enabled: boolean; ok: boolean | null; errors: string[] }>(
        '/api/meetings/persist-integrity',
      );
      if (!res.enabled) {
        setIntegrityMsg(t('meetings.integrity.persistDisabled'));
      } else if (res.ok) {
        setIntegrityMsg(t('meetings.integrity.ok'));
      } else {
        setIntegrityMsg(tFormat('meetings.integrity.failed', {
          count: res.errors.length,
          errors: res.errors.slice(0, 3).join('; '),
        }));
        setIntegrityFailed(true);
      }
    } catch (e) {
      setIntegrityMsg(tFormat('meetings.integrity.exception', {
        error: (e as Error).message || t('common.unknown'),
      }));
      setIntegrityFailed(true);
    } finally {
      setIntegrityBusy(false);
    }
  }, []);

  return { integrityBusy, integrityMsg, integrityFailed, handleIntegrity };
}
