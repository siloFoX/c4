import { useCallback, useEffect, useState } from 'react';
import { HelpDrawer } from './HelpDrawer';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
import { OnboardingTour } from './OnboardingTour';

export const HELP_EVENT_OPEN_DRAWER = 'c4:help-drawer-open';
export const HELP_EVENT_OPEN_SHORTCUTS = 'c4:shortcuts-open';
export const HELP_EVENT_TOGGLE_LOCALE = 'c4:locale-toggle';

// Convenience helpers so pages do not each hand-roll the custom-event
// dispatch. Each returns void so callers can drop them straight into an
// onClick handler.
export function openHelpDrawer(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(HELP_EVENT_OPEN_DRAWER));
  } catch {
    // ignore
  }
}

export function openShortcutsModal(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(HELP_EVENT_OPEN_SHORTCUTS));
  } catch {
    // ignore
  }
}

const HASH_PREFIX = '#/feature/';

function readActiveFeatureId(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  if (hash.startsWith(HASH_PREFIX)) return hash.slice(HASH_PREFIX.length);
  return null;
}

// 8.33: mounts the three global help overlays (help drawer, keyboard
// shortcut cheat sheet, onboarding tour) and wires the keyboard +
// custom-event contract used by AppHeader and other dispatchers. Kept
// out of App.tsx so App.tsx does not grow another state triple.

export default function HelpUIRoot() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [activeFeatureId, setActiveFeatureId] = useState<string | null>(() =>
    readActiveFeatureId(),
  );

  useEffect(() => {
    const onHash = () => setActiveFeatureId(readActiveFeatureId());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const onDrawer = () => setDrawerOpen(true);
    const onShortcuts = () => setShortcutsOpen(true);
    window.addEventListener(HELP_EVENT_OPEN_DRAWER, onDrawer);
    window.addEventListener(HELP_EVENT_OPEN_SHORTCUTS, onShortcuts);
    return () => {
      window.removeEventListener(HELP_EVENT_OPEN_DRAWER, onDrawer);
      window.removeEventListener(HELP_EVENT_OPEN_SHORTCUTS, onShortcuts);
    };
  }, []);

  // Global keyboard shortcuts. Skip when the user is typing in an
  // input / textarea / contenteditable so "?" / "h" / "t" in prose do
  // not trigger overlays.
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
        setShortcutsOpen(true);
      } else if (e.key === 'h' || e.key === 'H') {
        setDrawerOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);

  return (
    <>
      <HelpDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        activeFeatureId={activeFeatureId}
      />
      <KeyboardShortcutsModal open={shortcutsOpen} onClose={closeShortcuts} />
      <OnboardingTour />
    </>
  );
}
