import { useEffect, useState } from 'react';
import {
  readDetailMode,
  readSidebarCollapsed,
  readSidebarMode,
  readTopView,
  writeDetailMode,
  writeSidebarCollapsed,
  writeSidebarMode,
  writeTopView,
} from './preferences';
import type { DetailMode } from '../components/layout/DetailTabs';
import type { SidebarMode } from '../components/layout/Sidebar';
import type { TopView } from '../components/layout/TopTabs';

// (v1.10.732) Extracted from App. Owns the four
// localStorage-backed UI preference slots
// (sidebarMode / sidebarCollapsed / detailMode /
// topView) + their per-slot write effects + the
// cross-tab storage sync that re-reads all four
// when another tab updates the same preferences.
//
// `onCrossTabSync` is invoked alongside the four
// re-reads so the parent can refresh sibling
// preferences (e.g. theme) that aren't owned by
// this hook but participate in the same storage
// event handler.

export interface UseUiPreferencesState {
  sidebarMode: SidebarMode;
  setSidebarMode: (next: SidebarMode) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  detailMode: DetailMode;
  setDetailMode: (next: DetailMode) => void;
  topView: TopView;
  setTopView: (next: TopView) => void;
}

export function useUiPreferences(args?: {
  onCrossTabSync?: () => void;
}): UseUiPreferencesState {
  const onCrossTabSync = args?.onCrossTabSync;
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(readSidebarMode);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(readSidebarCollapsed);
  const [detailMode, setDetailMode] = useState<DetailMode>(readDetailMode);
  const [topView, setTopView] = useState<TopView>(readTopView);

  useEffect(() => { writeSidebarMode(sidebarMode); }, [sidebarMode]);
  useEffect(() => { writeSidebarCollapsed(sidebarCollapsed); }, [sidebarCollapsed]);
  useEffect(() => { writeDetailMode(detailMode); }, [detailMode]);
  useEffect(() => { writeTopView(topView); }, [topView]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = () => {
      setSidebarMode(readSidebarMode());
      setSidebarCollapsed(readSidebarCollapsed());
      setDetailMode(readDetailMode());
      setTopView(readTopView());
      onCrossTabSync?.();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [onCrossTabSync]);

  return {
    sidebarMode, setSidebarMode,
    sidebarCollapsed, setSidebarCollapsed,
    detailMode, setDetailMode,
    topView, setTopView,
  };
}
