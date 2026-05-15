// (v1.11.247, TODO 11.229) Color-vision simulation SVG filters.
//
// The DesignSystem page mounts this component once so the three
// CSS classes `.cb-protanopia`, `.cb-deuteranopia`, `.cb-tritanopia`
// can reference `url(#cb-*)` and apply the matching color matrix
// to any wrapped subtree. The filter definitions live in an
// inline `<svg>` with `aria-hidden="true"` and `display: none` so
// the rest of the layout treats it as zero-sized.
//
// Matrices
// --------
// The values below are the canonical Machado et al. 2009
// "Real-time Visualization of Color-Vision Deficiencies"
// approximations at severity = 1.0 (full deficiency). The triplet
// covers the three common dichromacies:
//   - protanopia    -> no L-cone     (red-blindness)
//   - deuteranopia  -> no M-cone     (green-blindness; most common)
//   - tritanopia    -> no S-cone     (blue-blindness; rare)
//
// References:
//   docs/design-system: ARPS a11y guidance (USAGE.md)
//   en.wikipedia.org/wiki/Color_blindness#Simulation
//
// These matrices intentionally simulate the *full* deficiency
// rather than a milder anomaly so the audit surfaces failures
// loudly -- if a tone pair survives full dichromacy it survives
// every milder case.

const PROTANOPIA = '0.567 0.433 0 0 0 0.558 0.442 0 0 0 0 0.242 0.758 0 0 0 0 0 1 0';
const DEUTERANOPIA = '0.625 0.375 0 0 0 0.7 0.3 0 0 0 0 0.3 0.7 0 0 0 0 0 1 0';
const TRITANOPIA = '0.95 0.05 0 0 0 0 0.433 0.567 0 0 0 0.475 0.525 0 0 0 0 0 1 0';

export interface ColorBlindFiltersProps {
  /**
   * When provided, scopes the filter ids to a prefix so multiple
   * mounts on the same page do not collide. Defaults to `'cb'` so
   * the matching CSS rules in index.css continue to find the
   * filter via `url(#cb-deuteranopia)` etc.
   */
  idPrefix?: string;
}

export default function ColorBlindFilters({ idPrefix = 'cb' }: ColorBlindFiltersProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-color-blind-filters=""
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <defs>
        <filter id={`${idPrefix}-protanopia`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={PROTANOPIA} />
        </filter>
        <filter id={`${idPrefix}-deuteranopia`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={DEUTERANOPIA} />
        </filter>
        <filter id={`${idPrefix}-tritanopia`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={TRITANOPIA} />
        </filter>
      </defs>
    </svg>
  );
}

// Exported so tests can pin the canonical matrix strings and a
// future refactor (e.g. softer-anomaly severity slider) has a
// numerical baseline to compare against.
export const COLOR_BLIND_MATRICES = {
  protanopia: PROTANOPIA,
  deuteranopia: DEUTERANOPIA,
  tritanopia: TRITANOPIA,
} as const;

export type ColorBlindType = keyof typeof COLOR_BLIND_MATRICES;
