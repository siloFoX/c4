import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';

// (v1.10.746) Extracted from pages/Templates. Owns the
// /api/templates fetch + items / loading / error
// state. Read-only today (mutation endpoints tracked
// as TODO.md sub-task 8.20b-templates-write); shape
// leaves room for the eventual add/remove handlers
// via the canonical refresh re-fetch handle.

export interface TemplateItem {
  name: string;
  description?: string;
  model?: string;
  effort?: string;
  profile?: string;
  source?: string;
  [key: string]: unknown;
}

interface TemplatesResponse {
  templates?: TemplateItem[];
  error?: string;
}

export interface UseTemplatesState {
  items: TemplateItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useTemplates(): UseTemplatesState {
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiGet<TemplatesResponse>('/api/templates');
      setItems(Array.isArray(r.templates) ? r.templates : []);
    } catch (e) {
      setError((e as Error).message);
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { items, loading, error, refresh };
}
