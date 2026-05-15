// (v1.11.242, TODO 11.224) Canonical 8-color tag palette.
//
// Single source of truth for tag / chip / badge / status colors so
// the same hue intent renders identically wherever it appears.
// Hues map onto the shadcn tokens already wired in
// web/tailwind.config.js + index.css; the ARPS reference column
// records the source-of-truth HSL in arps-design-system-v1/
// tokens.css so a future migration can flip the underlying
// variables without touching call sites.
//
// Why 8 entries:
//   - The set covers every status / category use that previously
//     reached for ad-hoc Tailwind hues (`bg-green-500`,
//     `bg-emerald-500/10`, `bg-blue-500/10`, ...).
//   - 8 is the largest palette where adjacent chips still stay
//     visually distinguishable in a vertical stack (categorical
//     colour science: ~7+/-2 hues before the eye stops binning).
//   - Five status tones (brand/success/warning/info/danger) cover
//     the canonical signal vocabulary; three accent tones
//     (accent/magenta/neutral) cover the remaining categorical
//     buckets without re-using a signal hue for a non-signal idea.
//
// API:
//   - `TAG_PALETTE`   -- ordered tuple of 8 entries.
//   - `TagPaletteId`  -- string literal union of the 8 ids.
//   - `getTagTone(id)` -- safe lookup, returns the neutral entry
//     when an unknown id slips in (defensive for backend-driven
//     tag strings).
//   - `pickTagTone(seed)` -- deterministic hash-based picker used
//     by call sites that have a stable string key (e.g. tag name
//     or specialist tier) but no explicit colour preference.
//
// Class shape:
//   Each entry exposes class strings for the four canonical
//   surfaces (`subtle` / `solid` / `outline` / `dot`) so a single
//   import can wire any of Chip, Badge, StatusDot, TagInput, or a
//   bespoke `<span>` without re-deriving Tailwind classes. The
//   strings are pinned to shadcn tokens (`bg-primary`, `bg-success`
//   etc.) and the chart-2 / chart-5 colour-only tokens so dark /
//   light theme parity is automatic.

export interface TagPaletteEntry {
  readonly id: TagPaletteId;
  readonly label: string;
  /** Token bucket (status vs accent) -- documentation, not used at runtime. */
  readonly kind: 'status' | 'accent';
  /** ARPS palette hue reference for migration notes. */
  readonly arpsToken: string;
  /** Faint tinted background + on-tint text. */
  readonly subtle: string;
  /** Filled background + foreground text. */
  readonly solid: string;
  /** Transparent background, tinted border, tinted text. */
  readonly outline: string;
  /** Small filled dot (for StatusDot / inline markers). */
  readonly dot: string;
}

export type TagPaletteId =
  | 'brand'
  | 'success'
  | 'warning'
  | 'info'
  | 'danger'
  | 'accent'
  | 'magenta'
  | 'neutral';

export const TAG_PALETTE: readonly TagPaletteEntry[] = [
  {
    id: 'brand',
    label: 'Brand',
    kind: 'status',
    arpsToken: '--brand (264 80% 65%)',
    subtle: 'bg-primary/15 text-primary',
    solid: 'bg-primary text-primary-foreground',
    outline: 'border-primary/40 text-primary',
    dot: 'bg-primary',
  },
  {
    id: 'success',
    label: 'Success',
    kind: 'status',
    arpsToken: '--signal-success (142 70% 50%)',
    subtle: 'bg-success/15 text-success',
    solid: 'bg-success text-success-foreground',
    outline: 'border-success/40 text-success',
    dot: 'bg-success',
  },
  {
    id: 'warning',
    label: 'Warning',
    kind: 'status',
    arpsToken: '--signal-warning (38 95% 60%)',
    subtle: 'bg-warning/15 text-warning',
    solid: 'bg-warning text-warning-foreground',
    outline: 'border-warning/40 text-warning',
    dot: 'bg-warning',
  },
  {
    id: 'info',
    label: 'Info',
    kind: 'status',
    arpsToken: '--signal-info (200 90% 60%)',
    subtle: 'bg-info/15 text-info',
    solid: 'bg-info text-info-foreground',
    outline: 'border-info/40 text-info',
    dot: 'bg-info',
  },
  {
    id: 'danger',
    label: 'Danger',
    kind: 'status',
    arpsToken: '--signal-danger (0 75% 55%)',
    subtle: 'bg-destructive/15 text-destructive',
    solid: 'bg-destructive text-destructive-foreground',
    outline: 'border-destructive/40 text-destructive',
    dot: 'bg-destructive',
  },
  {
    id: 'accent',
    label: 'Accent',
    kind: 'accent',
    arpsToken: '--ai-cyan / --chart-2',
    subtle: 'bg-chart-2/15 text-chart-2',
    solid: 'bg-chart-2 text-background',
    outline: 'border-chart-2/40 text-chart-2',
    dot: 'bg-chart-2',
  },
  {
    id: 'magenta',
    label: 'Magenta',
    kind: 'accent',
    arpsToken: '--ai-magenta / --chart-5',
    subtle: 'bg-chart-5/15 text-chart-5',
    solid: 'bg-chart-5 text-background',
    outline: 'border-chart-5/40 text-chart-5',
    dot: 'bg-chart-5',
  },
  {
    id: 'neutral',
    label: 'Neutral',
    kind: 'accent',
    arpsToken: '--text-tertiary / --surface-subtle',
    subtle: 'bg-muted text-muted-foreground',
    solid: 'bg-secondary text-secondary-foreground',
    outline: 'border-border text-foreground',
    dot: 'bg-muted-foreground',
  },
];

const PALETTE_INDEX: Record<TagPaletteId, TagPaletteEntry> = TAG_PALETTE.reduce(
  (acc, entry) => {
    acc[entry.id] = entry;
    return acc;
  },
  {} as Record<TagPaletteId, TagPaletteEntry>,
);

const NEUTRAL_ENTRY: TagPaletteEntry = PALETTE_INDEX.neutral;

export function getTagTone(id: string | null | undefined): TagPaletteEntry {
  if (id == null) return NEUTRAL_ENTRY;
  const found = (PALETTE_INDEX as Record<string, TagPaletteEntry | undefined>)[id];
  return found ?? NEUTRAL_ENTRY;
}

// FNV-1a 32-bit hash over the seed string -- stable across
// platforms, no dependency, deterministic for the same input.
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function pickTagTone(seed: string | number): TagPaletteEntry {
  const key = typeof seed === 'number' ? String(seed) : seed;
  if (key.length === 0) return NEUTRAL_ENTRY;
  const idx = hashSeed(key) % TAG_PALETTE.length;
  return TAG_PALETTE[idx] ?? NEUTRAL_ENTRY;
}
