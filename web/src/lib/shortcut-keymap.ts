// shortcut-keymap.ts -- platform-aware keymap formatter.
//
// (v1.11.330, TODO 11.312) The c4 web app documents
// shortcuts as "Ctrl+B", "Ctrl+F", "Cmd+K", etc. The
// shortcut binding itself is platform-agnostic in the
// keyboard event listener (we accept both Ctrl AND
// Cmd on Mac), but the rendered Kbd label should match
// the operator's expectation: a Mac user expects
// "Cmd+B" not "Ctrl+B".
//
// This module exposes:
//
//   - `detectPlatform()` -- returns `'mac'` or `'other'`
//     based on `navigator.platform` / userAgent. Safe
//     to call in SSR (returns `'other'` when
//     `navigator` is undefined).
//   - `formatKeymap(label, platform?)` -- rewrites a
//     shortcut label according to the platform map.
//     `platform` is optional; when omitted, the
//     module reads the live platform via
//     `detectPlatform()`.
//   - `formatKeymapForCurrentPlatform(label)` -- thin
//     convenience wrapper.
//
// The formatter is intentionally a pure string ->
// string transform so callers can drive it from a
// memoised hook or a static lookup map without
// component-level state.

export type ShortcutPlatform = 'mac' | 'other';

// Lookup table keyed by the canonical token in the
// shortcut label. The transform is one-way (Ctrl ->
// Cmd, Alt -> Option, etc) and platform-specific.
const TOKEN_MAP: Record<ShortcutPlatform, Record<string, string>> = {
  mac: {
    Ctrl: 'Cmd',
    Alt: 'Option',
    Meta: 'Cmd',
    Win: 'Cmd',
  },
  other: {
    Cmd: 'Ctrl',
    Option: 'Alt',
    Meta: 'Ctrl',
  },
};

export function detectPlatform(): ShortcutPlatform {
  if (typeof navigator === 'undefined') return 'other';
  const platform = navigator.platform ?? '';
  const ua = navigator.userAgent ?? '';
  if (/Mac|iPhone|iPad|iPod/i.test(platform)) return 'mac';
  if (/Mac|iPhone|iPad|iPod/i.test(ua)) return 'mac';
  return 'other';
}

export function formatKeymap(
  label: string,
  platform?: ShortcutPlatform,
): string {
  const p = platform ?? detectPlatform();
  const map = TOKEN_MAP[p];
  // Tokenise on '+' so 'Ctrl+Shift+K' -> ['Ctrl',
  // 'Shift', 'K']. Whitespace-tokenised chord shortcuts
  // (e.g. 'g h') are left alone (no '+' inside).
  if (!label.includes('+')) return label;
  return label
    .split('+')
    .map((tok) => map[tok] ?? tok)
    .join('+');
}

export function formatKeymapForCurrentPlatform(label: string): string {
  return formatKeymap(label, detectPlatform());
}
