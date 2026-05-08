import { useCallback, useEffect, useRef, useState } from 'react';
import { TOUR_STORAGE_KEY } from '../components/SessionsView';

// (v1.10.629) Extracted from SessionsView. The first-time tour
// gate — read localStorage on mount, show the tour banner if
// no "done" entry yet. `dismiss` writes the marker so the tour
// stays hidden across reloads. localStorage failures (private
// mode) are swallowed silently.

interface TourState {
  showTour: boolean;
  dismissTour: () => void;
}

export function useSessionsTour(): TourState {
  const [showTour, setShowTour] = useState(false);
  const tourChecked = useRef(false);

  useEffect(() => {
    if (tourChecked.current) return;
    tourChecked.current = true;
    try {
      const done = window.localStorage.getItem(TOUR_STORAGE_KEY);
      if (!done) setShowTour(true);
    } catch {
      // localStorage can throw in private modes; skip tour silently.
    }
  }, []);

  const dismissTour = useCallback(() => {
    setShowTour(false);
    try {
      window.localStorage.setItem(TOUR_STORAGE_KEY, 'done');
    } catch {
      // non-fatal
    }
  }, []);

  return { showTour, dismissTour };
}
