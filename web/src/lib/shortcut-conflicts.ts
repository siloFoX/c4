// shortcut-conflicts.ts -- keyboard shortcut conflict
// detector.
//
// (v1.11.357, TODO 11.339) The c4 web UI registers a
// growing list of keyboard shortcuts (see
// `KeyboardShortcutsModal.SHORTCUT_ROWS`). When two
// shortcuts share the same normalized key combination
// + scope + description, the second one silently wins
// and the first one becomes dead UI. This module
// detects those collisions at module load time + on
// demand so the dev console surfaces the regression
// before it ships.
//
// Two shortcuts pointing at the SAME action via
// different key combos (e.g., `?` + `Shift+/` both
// opening the help drawer on a US keyboard) are
// intentional SYNONYMS, NOT conflicts. The detector
// distinguishes the two:
//
//   - same normalized combo + same action -> synonym
//     (logged for visibility, NOT a conflict).
//   - same normalized combo + different action ->
//     CONFLICT (logged + reported).
//   - duplicate row (identical combo + action) ->
//     CONFLICT (likely a copy-paste bug).
//
// The shape is intentionally generic so other shortcut
// surfaces (CommandPalette commands, per-page hotkeys)
// can feed in their own arrays without leaking the
// SHORTCUT_ROWS type.

export type ShortcutScope = string;

export interface ShortcutSpec {
  // Human-readable key combo string. Examples:
  //   '?' / 'Ctrl+B' / 'Shift+Enter' / 'g g'
  // Comparison is case-insensitive and modifier order
  // is normalized so `Ctrl+Shift+B` and
  // `Shift+Ctrl+B` collapse to the same key.
  keys: string;
  // Stable identifier for the action this shortcut
  // invokes. Same `action` across multiple specs is a
  // SYNONYM, not a conflict. Typically the
  // `descriptionKey` (i18n key) on the shortcut row.
  action: string;
  // Optional scope. Two specs in different scopes can
  // share a key without conflicting. Default scope is
  // `'global'`.
  scope?: ShortcutScope;
}

export type ConflictKind = 'conflict' | 'duplicate';

export interface ShortcutConflict {
  // Normalized combo string the conflicting specs
  // share (e.g., `ctrl+b`, `g g`).
  combo: string;
  scope: ShortcutScope;
  kind: ConflictKind;
  specs: ShortcutSpec[];
}

// (v1.11.357, TODO 11.339) Normalize a key-combo string
// for comparison. Steps:
//
//   1. Trim + collapse whitespace.
//   2. Split on `+`.
//   3. Recognise the standard modifier names (case-
//      insensitive); collect them in canonical order.
//   4. The remaining single segment is the key,
//      lower-cased.
//   5. Multi-step "chord" combos (a single space inside
//      the input, e.g., `g g`) are joined with a single
//      space and lower-cased; chord steps are NOT
//      split on `+` for modifier handling.
//
// Returns the canonical string used as the conflict
// map key.
const MODIFIER_NAMES = new Set([
  'ctrl',
  'control',
  'shift',
  'alt',
  'option',
  'meta',
  'cmd',
  'command',
  'win',
]);

const MODIFIER_ORDER: readonly string[] = [
  'ctrl',
  'alt',
  'shift',
  'meta',
];

function canonicalModifier(name: string): string {
  const lower = name.toLowerCase();
  if (lower === 'control') return 'ctrl';
  if (lower === 'option') return 'alt';
  if (lower === 'cmd' || lower === 'command' || lower === 'win') return 'meta';
  return lower;
}

export function normalizeCombo(keys: string): string {
  // Strip whitespace around `+` so `Ctrl + B` and
  // `Ctrl+B` collapse to the same combo before the
  // chord-detection step sees the input. Chord
  // separators (a real space between two combo steps,
  // like `g g`) survive.
  const cleaned = keys.replace(/\s*\+\s*/g, '+');
  const trimmed = cleaned.trim().toLowerCase();
  if (trimmed.length === 0) return '';
  // Chord combos: one or more spaces split the combo
  // into ordered steps. Recurse per step so each step
  // gets its own modifier normalisation.
  if (/\s/.test(trimmed)) {
    const steps = trimmed.split(/\s+/).filter(Boolean);
    return steps.map((s) => normalizeCombo(s)).join(' ');
  }
  // Single-step: split on '+'.
  const parts = trimmed.split('+').map((p) => p.trim()).filter(Boolean);
  const modifiers = new Set<string>();
  let key = '';
  for (const part of parts) {
    if (MODIFIER_NAMES.has(part)) {
      modifiers.add(canonicalModifier(part));
    } else {
      key = part;
    }
  }
  const ordered: string[] = [];
  for (const m of MODIFIER_ORDER) {
    if (modifiers.has(m)) ordered.push(m);
  }
  if (key) ordered.push(key);
  return ordered.join('+');
}

// (v1.11.357, TODO 11.339) Detect conflicts in a
// supplied spec list. Returns one ShortcutConflict per
// distinct conflicting (scope, combo) pair. SYNONYMS
// (same combo + same action) are NOT reported.
export function detectShortcutConflicts(
  specs: readonly ShortcutSpec[],
): ShortcutConflict[] {
  const groups = new Map<string, ShortcutSpec[]>();
  for (const spec of specs) {
    const combo = normalizeCombo(spec.keys);
    if (!combo) continue;
    const scope = spec.scope ?? 'global';
    const key = `${scope}::${combo}`;
    const arr = groups.get(key) ?? [];
    arr.push(spec);
    groups.set(key, arr);
  }
  const out: ShortcutConflict[] = [];
  for (const [key, group] of groups.entries()) {
    if (group.length < 2) continue;
    const [scope, combo] = key.split('::');
    const safeScope = scope ?? 'global';
    const safeCombo = combo ?? '';
    // Group by action to distinguish synonyms vs
    // conflicts. Multiple specs sharing combo + scope
    // + action = duplicate (likely a copy-paste).
    // Multiple specs sharing combo + scope but
    // differing on action = conflict.
    const actions = new Set(group.map((g) => g.action));
    if (actions.size === 1) {
      if (group.length > 1) {
        out.push({
          combo: safeCombo,
          scope: safeScope,
          kind: 'duplicate',
          specs: group,
        });
      }
      continue;
    }
    out.push({
      combo: safeCombo,
      scope: safeScope,
      kind: 'conflict',
      specs: group,
    });
  }
  return out;
}

export function formatShortcutConflicts(
  conflicts: readonly ShortcutConflict[],
): string {
  if (conflicts.length === 0) return '';
  return conflicts
    .map((c) => {
      const head = `[${c.kind}] ${c.scope}::${c.combo}`;
      const tail = c.specs
        .map((s) => `\n    keys=${s.keys} action=${s.action}`)
        .join('');
      return `  ${head}${tail}`;
    })
    .join('\n');
}

// (v1.11.357, TODO 11.339) Dev-console reporter. Logs
// each conflict via console.warn once per call. Returns
// the conflict count so callers can chain into a CI
// gate. No-op when `conflicts.length === 0` to keep
// the dev console quiet on the happy path.
export function reportShortcutConflicts(
  conflicts: readonly ShortcutConflict[],
): number {
  if (conflicts.length === 0) return 0;
  const summary = formatShortcutConflicts(conflicts);
  // eslint-disable-next-line no-console
  console.warn(
    `[shortcut-conflicts] ${conflicts.length} issue${conflicts.length === 1 ? '' : 's'} detected:\n${summary}`,
  );
  return conflicts.length;
}
