import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from './api';
import type { PinnedMemory } from '../types';

// (v1.10.707) Extracted from PinnedRulesEditor. The
// per-worker pinned-memory editor — GETs the
// userRules + defaultTemplate, joins rules with the
// `---` separator into a single textarea blob, and
// POSTs back the split-by-`---` form. The
// `refresh` flag in save() asks the daemon to
// re-pull the worker's CLAUDE.md cache.
// (v1.10.753) apiFetch + manual error throw replaced
// with apiGet/apiPost which throw on non-ok internally.

interface PinnedRulesState {
  rulesText: string;
  setRulesText: (next: string) => void;
  defaultTemplate: string;
  setDefaultTemplate: (next: string) => void;
  loading: boolean;
  saving: boolean;
  error: string | null;
  lastRefreshAt: number | null;
  load: () => Promise<void>;
  save: (options: { refresh: boolean }) => Promise<void>;
}

export function usePinnedRules(args: {
  workerName: string;
}): PinnedRulesState {
  const { workerName } = args;
  const [rulesText, setRulesText] = useState('');
  const [defaultTemplate, setDefaultTemplate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!workerName) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{
        pinnedMemory: PinnedMemory;
        lastRefreshAt: number | null;
      }>(`/api/workers/${encodeURIComponent(workerName)}/pinned-memory`);
      const rules = Array.isArray(data.pinnedMemory?.userRules)
        ? data.pinnedMemory.userRules
        : [];
      setRulesText(rules.join('\n\n---\n\n'));
      setDefaultTemplate(data.pinnedMemory?.defaultTemplate || '');
      setLastRefreshAt(data.lastRefreshAt ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [workerName]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async (options: { refresh: boolean }) => {
    setSaving(true);
    setError(null);
    try {
      const userRules = rulesText
        .split(/\n\s*---\s*\n/)
        .map((chunk) => chunk.trim())
        .filter(Boolean);
      const data = await apiPost<{ lastRefreshAt: number | null }>(
        `/api/workers/${encodeURIComponent(workerName)}/pinned-memory`,
        {
          userRules,
          defaultTemplate: defaultTemplate || null,
          refresh: options.refresh,
        },
      );
      setLastRefreshAt(data.lastRefreshAt ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [rulesText, defaultTemplate, workerName]);

  return {
    rulesText, setRulesText,
    defaultTemplate, setDefaultTemplate,
    loading, saving, error, lastRefreshAt,
    load, save,
  };
}
