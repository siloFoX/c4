import { useEffect, useState } from 'react';
import { FEATURES, findFeature } from '../pages/registry';

// (v1.10.728) Extracted from layout/FeatureView. The
// selected feature id is sourced from three places in
// priority order: window.location.hash
// (`#/feature/<id>`), then `localStorage[FEATURE_KEY]`,
// then the first registered feature as a final
// fallback. Every state change persists back to both
// surfaces so a refresh / share-link / back-forward
// nav restores the same view.

const FEATURE_KEY = 'c4.features.selected';
const HASH_PREFIX = '#/feature/';

function readInitialFeature(): string {
  // (v1.10.522) FEATURES is a non-empty const array — first id always
  // defined. The `?? ''` fallback keeps TS strict happy.
  const fallback = FEATURES[0]?.id ?? '';
  if (typeof window === 'undefined') return fallback;
  const hash = window.location.hash || '';
  if (hash.startsWith(HASH_PREFIX)) {
    const id = hash.slice(HASH_PREFIX.length);
    if (findFeature(id)) return id;
  }
  try {
    const v = window.localStorage.getItem(FEATURE_KEY);
    if (v && findFeature(v)) return v;
  } catch {
    // private mode
  }
  return fallback;
}

function writeHash(id: string): void {
  if (typeof window === 'undefined') return;
  const next = `${HASH_PREFIX}${id}`;
  if (window.location.hash === next) return;
  // Use replaceState so the top-level browser back stack is not polluted
  // when operators click around between features in rapid succession.
  try {
    const url = `${window.location.pathname}${window.location.search}${next}`;
    window.history.replaceState(null, '', url);
  } catch {
    window.location.hash = next;
  }
}

export function useSelectedFeatureId(): [string, (id: string) => void] {
  const [selectedId, setSelectedId] = useState<string>(readInitialFeature);

  useEffect(() => {
    try {
      window.localStorage.setItem(FEATURE_KEY, selectedId);
    } catch {
      // private mode
    }
    writeHash(selectedId);
  }, [selectedId]);

  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash || '';
      if (hash.startsWith(HASH_PREFIX)) {
        const id = hash.slice(HASH_PREFIX.length);
        if (findFeature(id) && id !== selectedId) {
          setSelectedId(id);
        }
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [selectedId]);

  return [selectedId, setSelectedId];
}
