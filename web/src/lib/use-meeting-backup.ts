import { useCallback, useState } from 'react';
import { apiPost } from './api';
import { t, tFormat } from './i18n';

// (v1.10.664) Extracted from MeetingsMaintenancePanel.
// Persist-backup operation — POST
// /api/meetings/persist-backup with the path + force
// flag. Owns the path/force input state alongside busy/
// msg/failed so the panel can stay dumb. Path-empty
// short-circuits with a friendly red banner; size in
// the success banner respects the daemon's null-bytes
// fallback (some filesystems don't expose size to the
// stat() call).

interface MeetingBackupState {
  backupPath: string;
  setBackupPath: (next: string) => void;
  backupForce: boolean;
  setBackupForce: (next: boolean) => void;
  backupBusy: boolean;
  backupMsg: string | null;
  backupFailed: boolean;
  handleBackup: () => Promise<void>;
}

export function useMeetingBackup(): MeetingBackupState {
  const [backupPath, setBackupPath] = useState('');
  const [backupForce, setBackupForce] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [backupFailed, setBackupFailed] = useState(false);

  const handleBackup = useCallback(async () => {
    const path = backupPath.trim();
    if (!path) {
      setBackupMsg(t('meetings.backup.pathRequired'));
      setBackupFailed(true);
      return;
    }
    setBackupBusy(true);
    setBackupMsg(null);
    setBackupFailed(false);
    try {
      const res = await apiPost<{ ok: boolean; path: string; bytes: number | null }>(
        '/api/meetings/persist-backup',
        { path, force: backupForce },
      );
      const size = res.bytes != null
        ? tFormat('meetings.backup.bytes', { bytes: res.bytes })
        : t('meetings.backup.sizeUnknown');
      setBackupMsg(tFormat('meetings.backup.success', { path: res.path, size }));
    } catch (e) {
      setBackupMsg(tFormat('meetings.backup.failed', {
        error: (e as Error).message || t('common.unknown'),
      }));
      setBackupFailed(true);
    } finally {
      setBackupBusy(false);
    }
  }, [backupPath, backupForce]);

  return {
    backupPath, setBackupPath,
    backupForce, setBackupForce,
    backupBusy, backupMsg, backupFailed,
    handleBackup,
  };
}
