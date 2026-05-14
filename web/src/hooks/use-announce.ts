// (v1.11.211) aria-live announcer hook. Pairs with the
// <AnnounceRegion> provider in components/AnnounceRegion.tsx,
// which mounts two visually-hidden live regions (polite +
// assertive) and exposes the announce function through
// AnnounceContext.

import { createContext, useContext } from 'react';

export type AnnouncePriority = 'polite' | 'assertive';

export interface AnnounceFn {
  (message: string, priority?: AnnouncePriority): void;
}

export const AnnounceContext = createContext<AnnounceFn | null>(null);

export function useAnnounce(): AnnounceFn {
  const fn = useContext(AnnounceContext);
  if (!fn) {
    throw new Error(
      'useAnnounce must be used inside an <AnnounceRegion> provider',
    );
  }
  return fn;
}
