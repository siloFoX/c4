import { useEffect, useRef } from 'react';
import { useViewportSize } from '../hooks/use-viewport-size';

// (v1.10.670) Extracted from App. Ctrl+B / Cmd+B
// sidebar toggle (VS Code convention). The shortcut
// no-ops while focus is on a text-entry surface so
// we don't hijack typing. Mobile breakpoint flips
// the transient `sidebarOpen` flag; desktop flips
// the persisted `sidebarCollapsed` flag — same
// keystroke, different slot.
//
// (v1.11.240, TODO 11.222) The breakpoint check now reads from the
// centralised useViewportSize hook so a single resize listener
// drives every responsive surface. The latest viewport snapshot is
// stashed in a ref so the keydown handler always sees current
// state without forcing the effect to reattach on every resize
// frame.

export function useSidebarShortcut(args: {
  onToggleCollapsed: () => void;
  onToggleOpen: () => void;
}): void {
  const { onToggleCollapsed, onToggleOpen } = args;
  const viewport = useViewportSize();
  const isMobileRef = useRef<boolean>(viewport.isMobile);
  isMobileRef.current = viewport.isMobile;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'b') return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          target.isContentEditable
        ) return;
      }
      e.preventDefault();
      if (isMobileRef.current) {
        onToggleOpen();
      } else {
        onToggleCollapsed();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onToggleCollapsed, onToggleOpen]);
}
