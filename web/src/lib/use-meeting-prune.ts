import { useCallback, useState } from 'react';
import { apiPost } from './api';
import { t, tFormat } from './i18n';

// (v1.10.664) Extracted from MeetingsMaintenancePanel.
// Prune-old operation — POST /api/meetings/prune-old
// with days + terminalOnly + dryRun + vacuum. The
// dry-run path skips the window.confirm gate so
// operators can preview safely. The hook calls the
// parent's optional `onPruned` callback after a
// non-dry-run success so the meetings list can refresh.

interface MeetingPruneState {
  pruneDays: string;
  setPruneDays: (next: string) => void;
  pruneTerminal: boolean;
  setPruneTerminal: (next: boolean) => void;
  pruneVacuum: boolean;
  setPruneVacuum: (next: boolean) => void;
  pruneBusy: boolean;
  pruneMsg: string | null;
  pruneFailed: boolean;
  handlePrune: (dryRun: boolean) => Promise<void>;
}

export function useMeetingPrune(args: {
  onPruned?: (() => void) | undefined;
}): MeetingPruneState {
  const { onPruned } = args;
  const [pruneDays, setPruneDays] = useState('90');
  const [pruneTerminal, setPruneTerminal] = useState(true);
  const [pruneVacuum, setPruneVacuum] = useState(false);
  const [pruneBusy, setPruneBusy] = useState(false);
  const [pruneMsg, setPruneMsg] = useState<string | null>(null);
  const [pruneFailed, setPruneFailed] = useState(false);

  const handlePrune = useCallback(async (dryRun: boolean) => {
    const daysNum = Number(pruneDays);
    if (!Number.isFinite(daysNum) || daysNum < 1) {
      setPruneMsg(t('meetings.prune.daysInvalid'));
      setPruneFailed(true);
      return;
    }
    if (!dryRun) {
      const scope = pruneTerminal
        ? t('meetings.prune.confirm.terminal')
        : t('meetings.prune.confirm.includes');
      const vacuumSuffix = pruneVacuum ? t('meetings.prune.confirm.vacuum') : '';
      if (!window.confirm(
        `${tFormat('meetings.prune.confirm.header', { days: daysNum })}\n` +
        `${scope}${vacuumSuffix}\n` +
        t('meetings.prune.confirm.footer'),
      )) return;
    }
    setPruneBusy(true);
    setPruneMsg(null);
    setPruneFailed(false);
    try {
      const res = await apiPost<{
        count: number;
        ids: string[];
        dryRun: boolean;
        cutoffISO: string;
      }>('/api/meetings/prune-old', {
        days: daysNum,
        terminalOnly: pruneTerminal,
        dryRun,
        vacuum: pruneVacuum,
      });
      setPruneMsg(tFormat(
        res.dryRun ? 'meetings.prune.wouldPrune' : 'meetings.prune.pruned',
        { count: res.count, cutoff: res.cutoffISO },
      ));
      if (!res.dryRun && onPruned) onPruned();
    } catch (e) {
      setPruneMsg(tFormat('meetings.prune.failed', {
        error: (e as Error).message || t('common.unknown'),
      }));
      setPruneFailed(true);
    } finally {
      setPruneBusy(false);
    }
  }, [pruneDays, pruneTerminal, pruneVacuum, onPruned]);

  return {
    pruneDays, setPruneDays,
    pruneTerminal, setPruneTerminal,
    pruneVacuum, setPruneVacuum,
    pruneBusy, pruneMsg, pruneFailed,
    handlePrune,
  };
}
