import { useCallback, useEffect, useState } from 'react';
import { apiPost } from './api';
import { tFormat } from './i18n';
import type { ToastType } from '../components/Toast';

// (v1.10.746) Extracted from pages/Cleanup. Owns the
// preview (POST /cleanup with dryRun=true) and the
// execute (POST /cleanup with dryRun=false) flows
// plus the confirmOpen modal slot. The execute path
// fires success/failure toasts through the parent's
// showToast callback so the toast layer stays a
// single place.

export interface CleanupResponse {
  dryRun?: boolean;
  branches?: string[];
  worktrees?: string[];
  directories?: string[];
  error?: string;
}

export interface UseCleanupState {
  data: CleanupResponse | null;
  loading: boolean;
  error: string | null;
  busy: boolean;
  confirmOpen: boolean;
  setConfirmOpen: (next: boolean) => void;
  preview: () => Promise<void>;
  executeCleanup: () => Promise<void>;
  commit: () => void;
}

export function useCleanup(args: {
  showToast: (message: string, type: ToastType) => void;
}): UseCleanupState {
  const { showToast } = args;
  const [data, setData] = useState<CleanupResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);

  const preview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = (await apiPost<CleanupResponse>('/api/cleanup', { dryRun: true })) as CleanupResponse;
      if (r.error) {
        setError(r.error);
        setData(null);
      } else {
        setData(r);
      }
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    }
    setLoading(false);
  }, []);

  const executeCleanup = useCallback(async () => {
    setConfirmOpen(false);
    setBusy(true);
    setError(null);
    try {
      const r = (await apiPost<CleanupResponse>('/api/cleanup', { dryRun: false })) as CleanupResponse;
      if (r.error) {
        setError(r.error);
        showToast(tFormat('cleanup.toast.failed', { error: r.error }), 'error');
      } else {
        setData(r);
        const removed = (r.branches?.length || 0) + (r.worktrees?.length || 0) + (r.directories?.length || 0);
        showToast(tFormat('cleanup.toast.complete', { count: removed }), 'success');
      }
    } catch (e) {
      setError((e as Error).message);
      showToast(tFormat('cleanup.toast.failed', { error: (e as Error).message }), 'error');
    }
    setBusy(false);
  }, [showToast]);

  const commit = useCallback(() => {
    setConfirmOpen(true);
  }, []);

  useEffect(() => {
    preview();
  }, [preview]);

  return { data, loading, error, busy, confirmOpen, setConfirmOpen, preview, executeCleanup, commit };
}
