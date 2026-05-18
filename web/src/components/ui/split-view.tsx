// (v1.11.409, TODO 11.391) SplitView -- canonical alias for
// the existing `<SplitPane>` primitive. The dispatch named
// this surface "split-view" while the legacy file is
// `split-pane.tsx`. Re-export under the dispatch-style name
// so callers can write either import path:
//
//   import { SplitView } from './components/ui/split-view';
//   import { SplitPane } from './components/ui/split-pane';
//
// Both resolve to the same React component. The underlying
// SplitPane ships:
//   - horizontal / vertical orientation
//   - draggable divider with WAI-ARIA `role="separator"`
//   - keyboard nudge (ArrowKeys + Home / End + Enter)
//   - persistence via `storageKey` (localStorage)
//   - cross-tab `storage`-event sync
//   - optional snap zones (`collapseThreshold` / `expandThreshold`)
//   - (v1.11.409) `collapseOnDoubleClick` -- toggles
//     ratio between 0 and the last open size
//   - (v1.11.409) `defaultSizePx` -- pixel-based initial
//     sizing converted to ratio at mount
//   - (v1.11.409) `onSizeChange(pixels)` callback fired
//     alongside `onRatioChange(ratio)`

export {
  SplitPane as SplitView,
  type SplitPaneProps as SplitViewProps,
  type SplitOrientation as SplitViewOrientation,
} from './split-pane';
