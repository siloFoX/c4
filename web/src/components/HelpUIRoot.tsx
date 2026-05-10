import { useCallback, useState } from 'react';
import { HelpDrawer } from './HelpDrawer';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
import { OnboardingTour } from './OnboardingTour';
import { dispatchEvent } from '../lib/dispatch-event';
import { useFeatureIdFromHash } from '../lib/use-feature-id-from-hash';
import { useHelpOverlayTriggers } from '../lib/use-help-overlay-triggers';

export const HELP_EVENT_OPEN_DRAWER = 'c4:help-drawer-open';
export const HELP_EVENT_OPEN_SHORTCUTS = 'c4:shortcuts-open';
export const HELP_EVENT_TOGGLE_LOCALE = 'c4:locale-toggle';

// (v1.10.744) Convenience helpers so pages don't hand-roll the
// custom-event dispatch. Both delegate to the shared
// lib/dispatch-event helper for the SSR + try/catch guards.
export function openHelpDrawer(): void {
  dispatchEvent(HELP_EVENT_OPEN_DRAWER);
}

export function openShortcutsModal(): void {
  dispatchEvent(HELP_EVENT_OPEN_SHORTCUTS);
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
