import { useEffect } from 'react';
import {
  HELP_EVENT_OPEN_DRAWER,
  HELP_EVENT_OPEN_SHORTCUTS,
} from '../components/HelpUIRoot';

// (v1.10.712) Extracted from HelpUIRoot. The two
// "open me" trigger surfaces for the help drawer and
// the shortcuts modal — pages dispatch custom events,
// or the user hits `?` / `h` while not typing. Both
// effects do the same thing (call the supplied open
// callbacks), so the hook bundles them. Typing-guard
// kept verbatim — input, textarea, contenteditable,
// and role="textbox" all skip the hotkey path.

interface HelpOverlayTriggersArgs {
  onOpenDrawer: () => void;
  onOpenShortcuts: () => void;
}

export function useHelpOverlayTriggers(args: HelpOverlayTriggersArgs): void {
  const { onOpenDrawer, onOpenShortcuts } = args;

  useEffect(() => {
    const onDrawer = () => onOpenDrawer();
    const onShortcuts = () => onOpenShortcuts();
    window.addEventListener(HELP_EVENT_OPEN_DRAWER, onDrawer);
    window.addEventListener(HELP_EVENT_OPEN_SHORTCUTS, onShortcuts);
    return () => {
      window.removeEventListener(HELP_EVENT_OPEN_DRAWER, onDrawer);
      window.removeEventListener(HELP_EVENT_OPEN_SHORTCUTS, onShortcuts);
    };
  }, [onOpenDrawer, onOpenShortcuts]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          target.isContentEditable ||
          target.getAttribute('role') === 'textbox'
        ) {
          return;
        }
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        onOpenShortcuts();
      } else if (e.key === 'h' || e.key === 'H') {
        onOpenDrawer();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpenDrawer, onOpenShortcuts]);
}
