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
  // (v1.11.1117, TODO 11.1099) Manual reopen for the visible "replay
  // tour" control -- shows the tour again without clearing the
  // first-run marker, so it still never auto-opens on later visits.
  reopenTour: () => void;
}

export function useSessionsTour(): TourState {
  const [showTour, setShowTour] = useState(false);
  const tourChecked = useRef(false);

  useEffect(() => {
    if (tourChecked.current) return;
    tourChecked.current = true;
    let done: string | null = null;
    try {
      done = window.localStorage.getItem(TOUR_STORAGE_KEY);
    } catch {
      // localStorage can throw in private modes; skip tour silently.
      return;
    }
    if (done) return;
    // (v1.11.1117, TODO 11.1099) Persist the first-run marker the moment
    // the tour auto-opens -- not only on dismiss. Previously the marker
    // was written only by dismissTour, so a user who saw the tour but
    // navigated away without dismissing got it auto-opened again (over
    // page content) on every later visit. Writing it on open means the
    // tour auto-opens AT MOST ONCE; the visible reopenTour control is
    // the only way to see it again.
    setShowTour(true);
    try {
      window.localStorage.setItem(TOUR_STORAGE_KEY, 'seen');
    } catch {
      // persist failed (private mode write): tour still shows this session.
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

  const reopenTour = useCallback(() => setShowTour(true), []);

  return { showTour, dismissTour, reopenTour };
}
