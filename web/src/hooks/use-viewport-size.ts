import { useEffect, useState } from 'react';

// (v1.11.240, TODO 11.222) Centralised viewport-size hook with
// rAF-throttled resize handling and SSR-safe defaults. Replaces
// ad-hoc window.matchMedia('(min-width: 768px)') / window.innerWidth
// checks scattered across App.tsx + lib/use-sidebar-shortcut.ts.
//
// Breakpoints follow the task contract:
//   isMobile  : width < 768
//   isTablet  : 768 <= width <= 1024
//   isDesktop : width > 1024
//
// The 768/1024 cut mirrors the existing matchMedia('(min-width:
// 768px)') usage already baked into the codebase so this hook can
// be swapped in without behaviour regression. Call sites that need
// the legacy ">= 768px" semantics (i.e. "tablet or wider") should
// use `!isMobile`, not `isDesktop`.
//
// Note: ARPS design tokens (/root/c4/arps-design-system-v1/
// tokens.css) advertise --bp-desktop: 1024px and a "wide" tier at
// 1440px. A future pass may add `isWide` (>= 1440) and align
// `isTablet` with --bp-tablet (640) once the legacy 768 callers
// are gone.

export interface ViewportSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

const MOBILE_MAX_EXCLUSIVE = 768;
const TABLET_MAX_INCLUSIVE = 1024;

// SSR fallback: assume desktop so server-rendered markup matches
// the most common client (PC) and hydration does not flash a
// mobile layout for desktop users.
const SSR_FALLBACK: ViewportSize = {
  width: 1280,
  height: 800,
  isMobile: false,
  isTablet: false,
  isDesktop: true,
};

function classify(width: number, height: number): ViewportSize {
  return {
    width,
    height,
    isMobile: width < MOBILE_MAX_EXCLUSIVE,
    isTablet: width >= MOBILE_MAX_EXCLUSIVE && width <= TABLET_MAX_INCLUSIVE,
    isDesktop: width > TABLET_MAX_INCLUSIVE,
  };
}

function readSize(): ViewportSize {
  if (typeof window === 'undefined') return SSR_FALLBACK;
  return classify(window.innerWidth, window.innerHeight);
}

function sameSize(a: ViewportSize, b: ViewportSize): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.isMobile === b.isMobile &&
    a.isTablet === b.isTablet &&
    a.isDesktop === b.isDesktop
  );
}

export function useViewportSize(): ViewportSize {
  const [size, setSize] = useState<ViewportSize>(readSize);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let frame = 0;
    const flush = () => {
      frame = 0;
      const next = classify(window.innerWidth, window.innerHeight);
      setSize((prev) => (sameSize(prev, next) ? prev : next));
    };
    const onResize = () => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(flush);
    };

    // Sync once on mount in case the initial state was the SSR
    // fallback (hydrated on a viewport != 1280x800) or innerWidth
    // changed between the render and the effect tick.
    flush();

    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
    };
  }, []);

  return size;
}
