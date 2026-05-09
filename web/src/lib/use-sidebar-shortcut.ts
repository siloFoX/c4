import { useEffect } from 'react';

// (v1.10.670) Extracted from App. Ctrl+B / Cmd+B
// sidebar toggle (VS Code convention). The shortcut
// no-ops while focus is on a text-entry surface so
// we don't hijack typing. Mobile breakpoint flips
// the transient `sidebarOpen` flag; desktop flips
// the persisted `sidebarCollapsed` flag — same
// keystroke, different slot.

export function useSidebarShortcut(args: {
  onToggleCollapsed: () => void;
  onToggleOpen: () => void;
}): void {
  const { onToggleCollapsed, onToggleOpen } = args;
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
      const isDesktop = window.matchMedia('(min-width: 768px)').matches;
      if (isDesktop) {
        onToggleCollapsed();
      } else {
        onToggleOpen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onToggleCollapsed, onToggleOpen]);
}
