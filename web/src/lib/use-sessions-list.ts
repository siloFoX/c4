import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';
import { t } from './i18n';
import type {
  AttachedListResponse,
  AttachedSession,
  Selection,
  SessionsResponse,
} from '../components/SessionsView';

// (v1.10.630) Extracted from SessionsView. Owns the
// /api/sessions list + /api/attach/list pair — both fetched
// on mount, both invalidated together by the refresh
// affordances. The sessions fetch also auto-selects the first
// row when the page mounts with no selection (parent supplies
// the current selection getter via `getSelection`).

interface SessionsList {
  data: SessionsResponse | null;
  attached: AttachedSession[];
  loading: boolean;
  error: string | null;
  attachError: string | null;
  setAttachError: (next: string | null) => void;
  refreshSessions: () => Promise<void>;
  refreshAttached: () => Promise<void>;
}

export function useSessionsList(args: {
  getSelection: () => Selection | null;
  onAutoSelect: (next: Selection | null) => void;
}): SessionsList {
  const { getSelection, onAutoSelect } = args;
  const [data, setData] = useState<SessionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attached, setAttached] = useState<AttachedSession[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);

  const refreshSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiGet<SessionsResponse>('/api/sessions');
      setData(resp);
      if (!getSelection()) {
        const first = resp.sessions[0];
        if (first) {
          onAutoSelect({ kind: 'session', id: first.sessionId });
        } else {
          onAutoSelect(null);
        }
      }
    } catch (err) {
      setError((err as Error).message || t('common.failedToLoadSessions'));
    } finally {
      setLoading(false);
    }
  }, [getSelection, onAutoSelect]);

  const refreshAttached = useCallback(async () => {
    setAttachError(null);
    try {
      const resp = await apiGet<AttachedListResponse>('/api/attach/list');
      setAttached(Array.isArray(resp.sessions) ? resp.sessions : []);
    } catch (err) {
      setAttachError((err as Error).message || t('common.failedToLoadAttachments'));
    }
  }, []);

  useEffect(() => {
    refreshSessions();
    refreshAttached();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    data,
    attached,
    loading,
    error,
    attachError,
    setAttachError,
    refreshSessions,
    refreshAttached,
  };
}
