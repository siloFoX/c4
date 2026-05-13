import { useCallback, useEffect, useMemo, useState } from 'react';
import CommandPalette from './CommandPalette';
import { HelpDrawer } from './HelpDrawer';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
import { OnboardingTour } from './OnboardingTour';
import { dispatchEvent } from '../lib/dispatch-event';
import { useFeatureIdFromHash } from '../lib/use-feature-id-from-hash';
import { useHelpOverlayTriggers } from '../lib/use-help-overlay-triggers';
import type { TopView } from './layout/TopTabs';

export const HELP_EVENT_OPEN_DRAWER = 'c4:help-drawer-open';
export const HELP_EVENT_OPEN_SHORTCUTS = 'c4:shortcuts-open';
export const HELP_EVENT_TOGGLE_LOCALE = 'c4:locale-toggle';

// (v1.11.86) Command palette hotkey + open event. Cmd+K on macOS
// (metaKey) or Ctrl+K elsewhere. The custom event lets pages
// programmatically trigger the palette without prop-drilling.
export const COMMAND_PALETTE_EVENT_OPEN = 'c4:command-palette-open';

// (v1.10.744) Convenience helpers so pages don't hand-roll the
// custom-event dispatch. Both delegate to the shared
// lib/dispatch-event helper for the SSR + try/catch guards.
export function openHelpDrawer(): void {
  dispatchEvent(HELP_EVENT_OPEN_DRAWER);
}

export function openShortcutsModal(): void {
  dispatchEvent(HELP_EVENT_OPEN_SHORTCUTS);
}

export function openCommandPalette(): void {
  dispatchEvent(COMMAND_PALETTE_EVENT_OPEN);
}

interface HelpUIRootProps {
  // (v1.11.86) Optional setter forwarded into the command palette so
  // navigation entries can flip the current topView. Stays optional so
  // the existing `<HelpUIRoot />` callsites and tests keep working.
  onNavigateTopView?: (v: TopView) => void;
}

// 8.33: mounts the three global help overlays (help drawer, keyboard
// shortcut cheat sheet, onboarding tour) and wires the keyboard +
// custom-event contract used by AppHeader and other dispatchers. Kept
// out of App.tsx so App.tsx does not grow another state triple.
// (v1.11.86) Command palette joins the overlay set, sharing the same
// open/close + hotkey pattern.

export default function HelpUIRoot({ onNavigateTopView }: HelpUIRootProps = {}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // (v1.10.711) Hash-routed feature id moved to hook.
  const activeFeatureId = useFeatureIdFromHash();

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  // (v1.10.712) Custom-event triggers + global hotkeys moved to hook.
  useHelpOverlayTriggers({ onOpenDrawer: openDrawer, onOpenShortcuts: openShortcuts });

  // (v1.11.86) Cmd+K / Ctrl+K + custom-event surface for the palette.
  // Mounted directly here because the trigger is universal (active in
  // inputs too — operators expect Cmd+K to work mid-typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    const onEvent = () => setPaletteOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(COMMAND_PALETTE_EVENT_OPEN, onEvent);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(COMMAND_PALETTE_EVENT_OPEN, onEvent);
    };
  }, []);

  const ctx = useMemo(
    () => ({ navigateTopView: onNavigateTopView }),
    [onNavigateTopView],
  );

  return (
    <>
      <HelpDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        activeFeatureId={activeFeatureId}
      />
      <KeyboardShortcutsModal open={shortcutsOpen} onClose={closeShortcuts} />
      <OnboardingTour />
      <CommandPalette open={paletteOpen} onClose={closePalette} ctx={ctx} />
    </>
  );
}
