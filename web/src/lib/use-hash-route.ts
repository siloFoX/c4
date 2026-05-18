import { useCallback, useEffect, useState } from 'react';

// (v1.11.377, TODO 11.359) Minimal hash-routing
// helper.
//
// The c4 dashboard does not use React Router. The
// existing navigation pattern is `location.hash =
// '#feature=workers'` plus a few setTopView calls
// from App.tsx. This hook surfaces the hash state
// + a `navigate()` helper so the Breadcrumbs
// primitive can wire `onClick` handlers that
// navigate via hash without each adopter
// re-implementing the side-effect.
//
// SSR-safe: every `window` access lives inside
// `useEffect` or behind a `typeof window` guard.
//
// Adoption pattern (composed with Breadcrumbs):
//
//   const { hash, navigate } = useHashRoute();
//   const items = [
//     {
//       id: 'home',
//       label: 'Home',
//       href: '#feature=workers',
//       onClick: (event) => {
//         event.preventDefault();
//         navigate('#feature=workers');
//       },
//     },
//   ];

export interface HashRouteApi {
  hash: string;
  navigate: (target: string) => void;
}

function readHash(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hash;
}

export function useHashRoute(): HashRouteApi {
  const [hash, setHash] = useState<string>(readHash);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChange = (): void => {
      setHash(window.location.hash);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((target: string): void => {
    if (typeof window === 'undefined') return;
    const normalized = target.startsWith('#') ? target : `#${target}`;
    if (window.location.hash === normalized) {
      // Same hash -- still emit hashchange so
      // listeners re-render. Setting to a
      // different value first then back is the
      // canonical workaround; we do it via a
      // microtask to avoid a flash.
      window.location.hash = `${normalized}#__refresh__`;
      queueMicrotask(() => {
        window.location.hash = normalized;
      });
      return;
    }
    window.location.hash = normalized;
  }, []);

  return { hash, navigate };
}

// Pure helper -- parses `#feature=workers` /
// `#feature=workers&worker=auto-w42` into an
// object map. Adopters use it to extract route
// state from the hash.
export function parseHashParams(hash: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!hash) return out;
  const stripped = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!stripped) return out;
  for (const segment of stripped.split('&')) {
    const eq = segment.indexOf('=');
    if (eq < 0) continue;
    const key = segment.slice(0, eq);
    const value = segment.slice(eq + 1);
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

// Convenience: build a breadcrumb onClick that
// prevents the default <a> navigation and calls
// navigate(target). Pair with the Breadcrumbs
// item's `href` so screen readers + middle-click
// still work.
export function makeBreadcrumbNavigator(
  navigate: (target: string) => void,
): (target: string) => (event: { preventDefault?: () => void }) => void {
  return (target) => (event) => {
    event.preventDefault?.();
    navigate(target);
  };
}
