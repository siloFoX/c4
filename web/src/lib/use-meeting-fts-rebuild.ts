import { useCallback, useState } from 'react';
import { apiPost } from './api';
import { t, tFormat } from './i18n';

// (v1.10.663) Extracted from MeetingsMaintenancePanel.
// FTS index rebuild — POST /api/meetings/fts-rebuild.
// Returns the indexed/before/after count triple so the
// banner can show "before X → after Y (rebuilt Z)".

interface MeetingFtsRebuildState {
  ftsBusy: boolean;
  ftsMsg: string | null;
  ftsFailed: boolean;
  handleFtsRebuild: () => Promise<void>;
}

export function useMeetingFtsRebuild(): MeetingFtsRebuildState {
  const [ftsBusy, setFtsBusy] = useState(false);
  const [ftsMsg, setFtsMsg] = useState<string | null>(null);
  const [ftsFailed, setFtsFailed] = useState(false);

  const handleFtsRebuild = useCallback(async () => {
    setFtsBusy(true);
    setFtsMsg(null);
    setFtsFailed(false);
    try {
      const res = await apiPost<{ indexed: number; before: number; after: number }>(
        '/api/meetings/fts-rebuild',
        {},
      );
      setFtsMsg(tFormat('meetings.fts.success', {
        indexed: res.indexed,
        before: res.before,
        after: res.after,
      }));
    } catch (e) {
      setFtsMsg(tFormat('meetings.fts.failed', {
        error: (e as Error).message || t('common.unknown'),
      }));
      setFtsFailed(true);
    } finally {
      setFtsBusy(false);
    }
  }, []);

  return { ftsBusy, ftsMsg, ftsFailed, handleFtsRebuild };
}
