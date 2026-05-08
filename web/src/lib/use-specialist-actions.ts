import { useCallback, useState } from 'react';
import { apiDelete, apiPost } from './api';
import { t, tFormat } from './i18n';

// (v1.10.633) Extracted from SpecialistsView. Owns the
// remove + score-reset async handlers + their busy/confirmId
// state. Both are 2-step confirmed actions (the parent's
// detail header / score panel render the confirm prompt). The
// hook surfaces busy + confirmId state for the UI gating; on
// failure it pushes the message through the parent-supplied
// `setActionError` so the existing transient-error banner
// keeps working.

interface SpecialistActions {
  removeBusy: boolean;
  confirmRemoveId: string | null;
  setConfirmRemoveId: (next: string | null) => void;
  resetBusy: boolean;
  confirmResetId: string | null;
  setConfirmResetId: (next: string | null) => void;
  handleRemove: (id: string) => Promise<void>;
  handleScoreReset: (id: string) => Promise<void>;
}

export function useSpecialistActions(args: {
  selectedId: string | null;
  setSelectedId: (next: string | null) => void;
  setActionError: (next: string | null) => void;
  refresh: () => Promise<void>;
}): SpecialistActions {
  const { selectedId, setSelectedId, setActionError, refresh } = args;
  const [removeBusy, setRemoveBusy] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);

  const handleScoreReset = useCallback(async (id: string) => {
    setResetBusy(true);
    try {
      await apiPost(
        `/api/specialists/${encodeURIComponent(id)}/score-reset`,
        { reason: 'web reset' },
      );
      setConfirmResetId(null);
      await refresh();
    } catch (e) {
      setActionError(tFormat('specialists.scoreReset.failed', {
        error: (e as Error).message || t('common.failed'),
      }));
    } finally {
      setResetBusy(false);
    }
  }, [refresh, setActionError]);

  const handleRemove = useCallback(async (id: string) => {
    setRemoveBusy(true);
    try {
      await apiDelete(`/api/specialists/${encodeURIComponent(id)}`);
      if (selectedId === id) setSelectedId(null);
      await refresh();
    } catch (e) {
      setActionError((e as Error).message || t('common.failedToRemoveSpecialist'));
    } finally {
      setRemoveBusy(false);
      setConfirmRemoveId(null);
    }
  }, [selectedId, setSelectedId, refresh, setActionError]);

  return {
    removeBusy,
    confirmRemoveId,
    setConfirmRemoveId,
    resetBusy,
    confirmResetId,
    setConfirmResetId,
    handleRemove,
    handleScoreReset,
  };
}
