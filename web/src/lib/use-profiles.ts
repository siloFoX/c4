import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';

// (v1.10.746) Extracted from pages/Profiles. Owns the
// /api/profiles fetch + items / loading / error
// state. Read-only today (mutation endpoints are
// tracked as a follow-up TODO); shape leaves room
// for the eventual add/edit/remove handlers via
// the canonical refresh re-fetch handle.

export interface ProfileItem {
  name: string;
  description?: string;
  allow?: string[];
  deny?: string[];
  source?: string;
  [key: string]: unknown;
}

interface ProfilesResponse {
  profiles?: ProfileItem[];
  error?: string;
}

export interface UseProfilesState {
  items: ProfileItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useProfiles(): UseProfilesState {
  const [items, setItems] = useState<ProfileItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiGet<ProfilesResponse>('/api/profiles');
      setItems(Array.isArray(r.profiles) ? r.profiles : []);
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
