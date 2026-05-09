import { useCallback, useState } from 'react';
import { Button, Input } from './ui';
import { cn } from '../lib/cn';
import { apiPost } from '../lib/api';
import { t, tFormat, useLocale } from '../lib/i18n';
import { useMeetingIntegrity } from '../lib/use-meeting-integrity';
import { useMeetingFtsRebuild } from '../lib/use-meeting-fts-rebuild';

// (v1.10.529) Extracted from MeetingsView. The maintenance footer
// holds 4 ops endpoints (integrity / FTS rebuild / hot backup /
// prune-old) with isolated busy + msg + tone state per action.
// Pulling it out drops MeetingsView from 2683 → ~2510 lines and
// keeps its own ~200 lines focused.

interface MeetingsMaintenancePanelProps {
  // Triggered after a successful prune that mutated state, so the
  // parent re-fetches the meeting list.
  onPruned?: () => void;
}

export default function MeetingsMaintenancePanel({ onPruned }: MeetingsMaintenancePanelProps) {
  // useLocale registers a re-render when the operator flips
  // between en/ko in Settings. The inline t() / tFormat() calls
  // below pick up the new locale immediately.
  useLocale();

  const [open, setOpen] = useState(false);

  // (v1.10.662) Integrity check moved to lib/use-meeting-integrity.
  const { integrityBusy, integrityMsg, integrityFailed, handleIntegrity } =
    useMeetingIntegrity();

  // Backup ──────────────────────────────────────────────────────
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

  // (v1.10.663) FTS rebuild moved to lib/use-meeting-fts-rebuild.
  const { ftsBusy, ftsMsg, ftsFailed, handleFtsRebuild } = useMeetingFtsRebuild();

  // Prune ───────────────────────────────────────────────────────
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

  return (
    <div className="border-t border-border/60 bg-muted/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/30"
        aria-expanded={open}
      >
        <span className="font-medium">{t('meetings.maintenance.heading')}</span>
        <span className="font-mono text-[10px]">{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        <div className="flex flex-col gap-3 px-3 py-2 text-[11px]">
          {/* Integrity */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleIntegrity}
                disabled={integrityBusy}
                className="h-6 px-2 text-[10px]"
                title={t('meetings.tooltip.integrity')}
              >
                {integrityBusy ? '…' : t('meetings.maintenance.integrity')}
              </Button>
              {integrityMsg ? (
                <span className={cn(
                  'truncate',
                  integrityFailed
                    ? 'text-destructive' : 'text-muted-foreground',
                )}>
                  {integrityMsg}
                </span>
              ) : null}
            </div>
          </div>
          {/* FTS rebuild */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleFtsRebuild}
              disabled={ftsBusy}
              className="h-6 px-2 text-[10px]"
              title={t('meetings.tooltip.fts')}
            >
              {ftsBusy ? '…' : t('meetings.maintenance.fts')}
            </Button>
            {ftsMsg ? (
              <span className={cn(
                'truncate',
                ftsFailed ? 'text-destructive' : 'text-muted-foreground',
              )}>
                {ftsMsg}
              </span>
            ) : null}
          </div>
          {/* Backup */}
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="text"
                value={backupPath}
                onChange={(e) => setBackupPath(e.target.value)}
                placeholder={t('meetings.maintenance.backupPath.placeholder')}
                aria-label={t('meetings.maintenance.backupPath.label')}
                className="h-6 max-w-xs px-2 text-[11px]"
                disabled={backupBusy}
              />
              <label className="flex items-center gap-1 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={backupForce}
                  onChange={(e) => setBackupForce(e.target.checked)}
                  disabled={backupBusy}
                  className="h-3 w-3"
                />
                {t('meetings.label.forceOverwrite')}
              </label>
              <Button
                size="sm"
                variant="outline"
                onClick={handleBackup}
                disabled={backupBusy || !backupPath.trim()}
                className="h-6 px-2 text-[10px]"
                title={t('meetings.tooltip.backup')}
              >
                {backupBusy ? '…' : t('meetings.maintenance.backup')}
              </Button>
            </div>
            {backupMsg ? (
              <span className={cn(
                'truncate',
                backupFailed
                  ? 'text-destructive' : 'text-muted-foreground',
              )}>
                {backupMsg}
              </span>
            ) : null}
          </div>
          {/* Prune */}
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 text-muted-foreground">
                {t('meetings.label.days')}
                <Input
                  type="number"
                  min={1}
                  value={pruneDays}
                  onChange={(e) => setPruneDays(e.target.value)}
                  className="h-6 w-16 px-2 text-[11px]"
                  disabled={pruneBusy}
                />
              </label>
              <label className="flex items-center gap-1 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={pruneTerminal}
                  onChange={(e) => setPruneTerminal(e.target.checked)}
                  disabled={pruneBusy}
                  className="h-3 w-3"
                />
                terminal-only
              </label>
              <label className="flex items-center gap-1 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={pruneVacuum}
                  onChange={(e) => setPruneVacuum(e.target.checked)}
                  disabled={pruneBusy}
                  className="h-3 w-3"
                />
                {t('meetings.label.vacuum')}
              </label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handlePrune(true)}
                disabled={pruneBusy}
                className="h-6 px-2 text-[10px]"
                title={t('meetings.tooltip.dryRun')}
              >
                {pruneBusy ? '…' : t('meetings.maintenance.dryRun')}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handlePrune(false)}
                disabled={pruneBusy}
                className="h-6 px-2 text-[10px]"
                title={t('meetings.tooltip.prune')}
              >
                {pruneBusy ? '…' : t('meetings.maintenance.prune')}
              </Button>
            </div>
            {pruneMsg ? (
              <span className={cn(
                'truncate',
                pruneFailed
                  ? 'text-destructive' : 'text-muted-foreground',
              )}>
                {pruneMsg}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
