import { useEffect, useState, useCallback } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.201 / patch 11.183) Dev-only visual debug overlay. Renders a
// 12-column grid aligned to the app container (max-w-7xl mx-auto) plus
// breakpoint + viewport pills. Self-gates on import.meta.env.PROD so
// production bundles always return null. Visibility toggled via
// Cmd/Ctrl+Shift+G and persisted in localStorage.

const STORAGE_KEY = 'c4:grid-debug:visible';
const COLUMNS = 12;

function isDev(): boolean {
  try {
    if (import.meta.env?.PROD) return false;
  } catch {
    // ignore
  }
  if (typeof process !== 'undefined' && process.env?.NODE_ENV) {
    return process.env.NODE_ENV === 'development';
  }
  return true;
}

function readPersisted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function breakpointLabel(width: number): string {
  if (width >= 1536) return '2xl';
  if (width >= 1280) return 'xl';
  if (width >= 1024) return 'lg';
  if (width >= 768) return 'md';
  if (width >= 640) return 'sm';
  return 'xs';
}

export default function GridDebugOverlay() {
  const enabled = isDev();
  const [visible, setVisible] = useState<boolean>(() => enabled && readPersisted());
  const [vw, setVw] = useState<number>(() =>
    typeof window === 'undefined' ? 0 : window.innerWidth,
  );
  const [vh, setVh] = useState<number>(() =>
    typeof window === 'undefined' ? 0 : window.innerHeight,
  );
  const [scrollY, setScrollY] = useState<number>(() =>
    typeof window === 'undefined' ? 0 : window.scrollY,
  );

  const toggle = useCallback(() => {
    setVisible((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && (e.key === 'G' || e.key === 'g')) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, toggle]);

  useEffect(() => {
    if (!enabled || !visible) return;
    const onResize = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    const onScroll = () => setScrollY(window.scrollY);
    onResize();
    onScroll();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
    };
  }, [enabled, visible]);

  if (!enabled || !visible) return null;

  const bp = breakpointLabel(vw);

  return (
    <div
      aria-hidden="true"
      data-testid="grid-debug-overlay"
      className={cn(
        'pointer-events-none fixed inset-0 z-[60]',
        'select-none',
      )}
    >
      <div className="mx-auto h-full w-full max-w-7xl px-3 md:px-6">
        <div className="grid h-full w-full grid-cols-12 gap-4">
          {Array.from({ length: COLUMNS }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-full border border-dashed',
                i % 2 === 0
                  ? 'bg-red-500/[0.04] border-red-500/40'
                  : 'bg-blue-500/[0.04] border-blue-500/40',
              )}
              data-testid={`grid-debug-col-${i}`}
            />
          ))}
        </div>
      </div>
      <div
        className="fixed right-3 top-3 rounded-full bg-black/70 px-2 py-0.5 font-mono text-xs text-white shadow"
        data-testid="grid-debug-breakpoint"
      >
        {bp}
      </div>
      <div
        className="fixed bottom-3 left-3 rounded-full bg-black/70 px-2 py-0.5 font-mono text-xs text-white shadow"
        data-testid="grid-debug-viewport"
      >
        {vw}x{vh} @ y={Math.round(scrollY)}
      </div>
    </div>
  );
}
