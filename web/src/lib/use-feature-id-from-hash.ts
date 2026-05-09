import { useEffect, useState } from 'react';

// (v1.10.711) Extracted from HelpUIRoot. The hash-routed
// feature id — the help drawer accepts deep links shaped
// as `#/feature/<id>`, so the active feature must track
// `window.location.hash` and re-render on hashchange.
// Hook owns the state slot, the hashchange listener,
// and the prefix-stripping parser.

const HASH_PREFIX = '#/feature/';

function readActiveFeatureId(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  if (hash.startsWith(HASH_PREFIX)) return hash.slice(HASH_PREFIX.length);
  return null;
}

export function useFeatureIdFromHash(): string | null {
  const [activeFeatureId, setActiveFeatureId] = useState<string | null>(() =>
    readActiveFeatureId(),
  );

  useEffect(() => {
    const onHash = () => setActiveFeatureId(readActiveFeatureId());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return activeFeatureId;
}
