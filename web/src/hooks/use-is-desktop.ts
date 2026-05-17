import { useEffect, useState } from 'react';

// (v1.11.292, TODO 11.274) Viewport-width media-query hook.
// Returns true when the viewport is at the tailwind `md:`
// breakpoint or wider (>= 768px). Used by surfaces that want
// to render a desktop-only affordance (e.g. a SplitPane
// resizable divider) without forcing the same layout on
// mobile. SSR-safe: the initial render evaluates the query
// synchronously when `window.matchMedia` is available; the
// effect installs the change listener once the component is
// in the browser.

const DESKTOP_QUERY = '(min-width: 768px)';

function readInitial(): boolean {
  if (typeof window === 'undefined') return true;
  if (typeof window.matchMedia !== 'function') return true;
  return window.matchMedia(DESKTOP_QUERY).matches;
}

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => readInitial());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    // Safari < 14 fallback.
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  return isDesktop;
}
