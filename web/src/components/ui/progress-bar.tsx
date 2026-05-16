// (v1.11.274, TODO 11.256) ProgressBar primitive entry point.
//
// The original `Progress` component lives in `./progress.tsx`. The
// dispatch for TODO 11.256 names the primitive "ProgressBar" and
// expects the file at `progress-bar.tsx`, so this thin re-export
// makes both spellings work:
//
//   import { ProgressBar } from './components/ui/progress-bar';
//   import { Progress } from './components/ui/progress';
//
// Both resolve to the same React component. The barrel
// (`components/ui/index.ts`) already exports `Progress` /
// `ProgressBar` / props / variants / sizes from `./progress` so a
// caller using the `'../components/ui'` import path can pick
// either name without changing where they import from.

export {
  Progress,
  ProgressBar,
  type ProgressProps,
  type ProgressBarProps,
  type ProgressVariant,
  type ProgressBarVariant,
  type ProgressSize,
  type ProgressBarSize,
} from './progress';
