// (v1.11.251, TODO 11.233) Canonical clipboard hook.
//
// `useCopy()` is the React surface: it returns
// `{ copy, copied, error }` where `copied` is a transient
// boolean that flips back to false after `resetMs` (default
// 1500). `copy(text)` is a thunk that writes via the Clipboard
// API with a textarea fallback for environments without
// Clipboard API permission; it never throws.
//
// `copyTextToClipboard(text)` is the imperative helper for
// callers that cannot use hooks (class components, one-shot
// utility code). Both paths route through the same internal
// browser-Clipboard-then-execCommand fallback in
// `lib/clipboard.ts`.
//
// Why two names (useCopy + useCopyToClipboard)?
// `useCopyToClipboard` predates this module and ships in
// existing lib hooks (use-action-items-export, use-copy-pulse,
// use-morning). The new shorter name is the preferred import
// for fresh call sites; the old name stays exported so existing
// consumers do not have to migrate in lockstep.

export {
  useCopyToClipboard as useCopy,
  useCopyToClipboard,
} from './use-copy-to-clipboard';
export type {
  CopyResult,
  UseCopyToClipboardResult as UseCopyResult,
  UseCopyToClipboardResult,
} from './use-copy-to-clipboard';
export { copyTextToClipboard } from '../lib/clipboard';
