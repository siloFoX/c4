import { useCallback, useState } from 'react';
import { HelpDrawer } from './HelpDrawer';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
import { OnboardingTour } from './OnboardingTour';
import { useFeatureIdFromHash } from '../lib/use-feature-id-from-hash';
import { useHelpOverlayTriggers } from '../lib/use-help-overlay-triggers';

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

// 8.33: mounts the three global help overlays (help drawer, keyboard
// shortcut cheat sheet, onboarding tour) and wires the keyboard +
// custom-event contract used by AppHeader and other dispatchers. Kept
// out of App.tsx so App.tsx does not grow another state triple.

export default function HelpUIRoot() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // (v1.10.711) Hash-routed feature id moved to hook.
  const activeFeatureId = useFeatureIdFromHash();

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);

  // (v1.10.712) Custom-event triggers + global hotkeys moved to hook.
  useHelpOverlayTriggers({ onOpenDrawer: openDrawer, onOpenShortcuts: openShortcuts });

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
