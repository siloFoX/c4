import { useCallback, useEffect, useState } from 'react';
import type * as React from 'react';
import { apiGet } from './api';
import { t } from './i18n';
import type { DigestResponse } from '../components/AutonomousView';

// (v1.10.653) Extracted from AutonomousView. Pulls the
// three autonomous-tab payloads in lockstep — status (the
// global on/off + reason), digest (window metrics), and
// escalations (per-row queue) — and refreshes every 30s
// so an operator dwelling on the tab keeps the picture
// warm. When `enabled === false` the digest + escalations
// are blanked out so the UI's "disabled" empty-state
// renders cleanly.

interface Escalation {
  id: number;
  todoId: string | null;
  reason: string;
  kind: string;
  suggestedAction: string;
  status: 'pending' | 'resolved';
  createdAt: number;
  resolvedAt: number | null;
  resolvedAction: string | null;
  resolvedNote: string | null;
}

interface AutonomousDigestState {
  autonomousEnabled: boolean | null;
  digest: DigestResponse | null;
  escalations: Escalation[];
  setEscalations: React.Dispatch<React.SetStateAction<Escalation[]>>;
  loading: boolean;
  digestError: string | null;
  escalError: string | null;
  refresh: () => Promise<void>;
}

export function useAutonomousDigest(args: {
  showResolved: boolean;
}): AutonomousDigestState {
  const { showResolved } = args;
  const [autonomousEnabled, setAutonomousEnabled] = useState<boolean | null>(null);
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(false);
  const [digestError, setDigestError] = useState<string | null>(null);
  const [escalError, setEscalError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setDigestError(null);
    setEscalError(null);
    try {
      const status = await apiGet<{ enabled: boolean; reason?: string }>(
        '/api/autonomous/status',
      );
      setAutonomousEnabled(status.enabled);
      if (!status.enabled) {
        setDigest(null);
        setEscalations([]);
        return;
      }
      const [d, e] = await Promise.all([
        apiGet<DigestResponse>('/api/autonomous/digest'),
        apiGet<{ count: number; escalations: Escalation[] }>(
          showResolved
            ? '/api/autonomous/escalations?status=all'
            : '/api/autonomous/escalations',
        ),
      ]);
      setDigest(d);
      setEscalations(e.escalations || []);
    } catch (err) {
      setDigestError((err as Error).message || t('common.failedToLoadDigest'));
    } finally {
      setLoading(false);
    }
  }, [showResolved]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 30000);
    return () => window.clearInterval(id);
  }, [refresh]);

  return {
    autonomousEnabled,
    digest,
    escalations,
    setEscalations,
    loading,
    digestError,
    escalError,
    refresh,
  };
}

export type { Escalation };
