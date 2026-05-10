import { useCallback, useState } from 'react';
import { apiPost } from './api';
import { t, tFormat } from './i18n';
import type { ToastType } from '../components/Toast';

// (v1.10.748) Extracted from pages/Morning. The
// morning-report state machine — POST /api/morning
// triggers generation, the response carries the
// rendered markdown + section breakdown. The copy
// action sends the raw `content` to the OS
// clipboard with a success / failure toast routed
// through the parent's showToast.

export interface MorningResponse {
  content?: string;
  generatedAt?: string;
  sections?: { title: string; body: string }[];
  error?: string;
  [key: string]: unknown;
}

export interface UseMorningState {
  report: MorningResponse | null;
  loading: boolean;
  error: string | null;
  generate: () => Promise<void>;
  copy: () => Promise<void>;
}

export function useMorning(args: {
  showToast: (message: string, type: ToastType) => void;
}): UseMorningState {
  const { showToast } = args;
  const [report, setReport] = useState<MorningResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = (await apiPost<MorningResponse>('/api/morning', {})) as MorningResponse;
      if (r.error) {
        setError(r.error);
        setReport(null);
      } else {
        setReport(r);
      }
    } catch (e) {
      setError((e as Error).message);
      setReport(null);
    }
    setLoading(false);
  }, []);

  const copy = useCallback(async () => {
    if (!report?.content) return;
    try {
      await navigator.clipboard.writeText(report.content);
      showToast(t('morning.toast.copied'), 'success');
    } catch (e) {
      showToast(tFormat('morning.toast.copyFailed', { error: (e as Error).message }), 'error');
    }
  }, [report, showToast]);

  return { report, loading, error, generate, copy };
}
