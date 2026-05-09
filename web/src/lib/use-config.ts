import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from './api';
import { t, tFormat } from './i18n';

// (v1.10.723) Extracted from pages/Config. Owns the
// GET /api/config fetch + the POST /api/config/reload
// action. Reload re-runs the fetch on success so the
// viewer reflects the live state. The split between
// `error` (load failure) and `reloadFailed` (reload
// failure) mirrors the page's split: loadError sits
// in an ErrorPanel; reloadMsg sits in an inline pill
// next to the Reload button.

interface ConfigResponse {
  config: Record<string, unknown>;
}

interface ReloadResponse {
  ok: boolean;
}

export interface UseConfigState {
  config: Record<string, unknown> | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  reloadBusy: boolean;
  reloadMsg: string | null;
  reloadFailed: boolean;
  handleReload: () => Promise<void>;
}

export function useConfig(): UseConfigState {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadBusy, setReloadBusy] = useState(false);
  const [reloadMsg, setReloadMsg] = useState<string | null>(null);
  const [reloadFailed, setReloadFailed] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<ConfigResponse>('/api/config');
      setConfig(res.config || {});
    } catch (e) {
      setError((e as Error).message || t('common.failedToLoadConfig'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleReload = useCallback(async () => {
    if (!window.confirm(t('config.reloadConfirm'))) return;
    setReloadBusy(true);
    setReloadMsg(null);
    setReloadFailed(false);
    try {
      const res = await apiPost<ReloadResponse>('/api/config/reload', {});
      setReloadMsg(res.ok ? t('config.reloadOk') : t('config.reloadNotOk'));
      setReloadFailed(!res.ok);
      window.setTimeout(() => setReloadMsg(null), 5000);
      refresh();
    } catch (e) {
      setReloadMsg(tFormat('config.reloadFailed', {
        error: (e as Error).message || t('common.unknown'),
      }));
      setReloadFailed(true);
    } finally {
      setReloadBusy(false);
    }
  }, [refresh]);

  return {
    config, error, loading, refresh,
    reloadBusy, reloadMsg, reloadFailed, handleReload,
  };
}
