import { useCallback, useState } from 'react';
import type * as React from 'react';
import { apiPost } from './api';
import { t, tFormat } from './i18n';
import type { Escalation } from './use-autonomous-digest';

// (v1.10.655) Extracted from AutonomousView. The
// per-escalation resolve flow — busy id slot, last error,
// pending notes map, and the POST handler that confirms
// via window.confirm and optimistically removes the row
// from the visible list. The hook takes a setter from
// useAutonomousDigest so the optimistic remove still
// updates the same state.

type ResolveAction = 'approve' | 'reject' | 'modify';

interface EscalationResolveState {
  resolveBusy: number | null;
  resolveError: string | null;
  resolveNotes: Record<number, string>;
  setResolveNotes: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  handleResolve: (id: number, action: ResolveAction) => Promise<void>;
}

export function useEscalationResolve(args: {
  setEscalations: React.Dispatch<React.SetStateAction<Escalation[]>>;
}): EscalationResolveState {
  const { setEscalations } = args;
  const [resolveBusy, setResolveBusy] = useState<number | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolveNotes, setResolveNotes] = useState<Record<number, string>>({});

  const handleResolve = useCallback(async (id: number, action: ResolveAction) => {
    if (action === 'modify') {
      const note = resolveNotes[id];
      if (!note || !note.trim()) {
        setResolveError(tFormat('autonomous.resolve.noteRequired', { id }));
        return;
      }
    }
    if (!window.confirm(tFormat('autonomous.confirmResolve', { id, action }))) return;
    setResolveBusy(id);
    setResolveError(null);
    try {
      const body: { action: string; note?: string } = { action };
      if (resolveNotes[id]?.trim()) body.note = resolveNotes[id].trim();
      await apiPost(`/api/autonomous/escalations/${id}`, body);
      // Optimistically remove from the visible list — the next
      // refresh tick will drop it server-side too.
      setEscalations((prev) => prev.filter((e) => e.id !== id));
      setResolveNotes((prev) => { const next = { ...prev }; delete next[id]; return next; });
    } catch (err) {
      setResolveError(tFormat('autonomous.resolve.failed', {
        error: (err as Error).message || t('common.unknown'),
      }));
    } finally {
      setResolveBusy(null);
    }
  }, [resolveNotes, setEscalations]);

  return { resolveBusy, resolveError, resolveNotes, setResolveNotes, handleResolve };
}
