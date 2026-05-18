import { forwardRef } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.317, TODO 11.299) AspectRatio -- enforces a
// width:height ratio for embedded content (images, charts,
// videos, iframes) so the surface reserves its own space
// during load and the operator does not see a layout shift
// (CLS) when the content lands.
//
// Implementation: the modern CSS `aspect-ratio` property is
// the primary mechanism. The wrapper sets `aspect-ratio:
// <ratio>` and the first/only child is positioned absolutely
// inside, filling the container. The wrapper itself stays
// in the document flow with its computed height derived from
// the available width.
//
// Use this primitive for:
//   - Chart containers (Health metrics, TokenUsage) where
//     the chart library reads `width: 100%; height: 100%`
//     against the wrapper.
//   - Image previews (Snapshots) where the operator needs
//     to see the placeholder space before the bitmap
//     decodes.
//   - Video / iframe embeds where the canonical aspect is
//     a content contract (16:9 player, 9:16 vertical clip,
//     etc).

export type AspectRatioPreset =
  | '16:9'
  | '9:16'
  | '4:3'
  | '3:4'
  | '21:9'
  | '1:1';

export interface AspectRatioProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /**
   * Aspect ratio. Accepts a preset string (`'16:9'`, etc) or
   * a numeric value (width / height). Examples:
   *   - `ratio="16:9"` -> 1.7777...
   *   - `ratio={16 / 9}` -> 1.7777...
   *   - `ratio={3}` -> 3.0 (3:1 banner)
   *   - `ratio={1}` (or `'1:1'`) -> square
   */
  ratio?: AspectRatioPreset | number;
  /** Single child to position inside the ratio box. */
  children: ReactNode;
  /**
   * (v1.11.401, TODO 11.383) Force the intrinsic-sizing
   * fallback path (`padding-bottom: <h/w>%`) instead of the
   * modern `aspect-ratio` CSS. Default `false` -> use
   * `aspect-ratio` (every browser since 2021+). Force `true`
   * for legacy embeds where the host page targets older
   * browsers, or for tests / storyshots that want a
   * deterministic intrinsic-height surface in jsdom.
   */
  forceFallback?: boolean;
}

const RATIO_PRESET_TO_CSS: Record<AspectRatioPreset, string> = {
  '16:9': '16 / 9',
  '9:16': '9 / 16',
  '4:3': '4 / 3',
  '3:4': '3 / 4',
  '21:9': '21 / 9',
  '1:1': '1 / 1',
};

// (v1.11.401, TODO 11.383) Numeric ratios used by the
// padding-bottom fallback. Each entry is `width / height`
// (the multiplier passed to `resolveRatio`).
const RATIO_PRESET_TO_NUMBER: Record<AspectRatioPreset, number> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '21:9': 21 / 9,
  '1:1': 1,
};

// (v1.11.401, TODO 11.383) Pure helper exported for tests +
// adopters that need to inline the padding-bottom trick
// themselves. Returns the percent string (e.g. "56.25%"
// for 16/9). Clamps to a 3-decimal precision so the value
// is stable across browsers.
export function ratioToPaddingBottom(
  input: AspectRatioPreset | number | undefined,
): string {
  let n = 16 / 9;
  if (typeof input === 'number' && Number.isFinite(input) && input > 0) {
    n = input;
  } else if (typeof input === 'string') {
    n = RATIO_PRESET_TO_NUMBER[input];
  }
  // padding-bottom for ratio w/h is (h / w * 100)%.
  const pct = (1 / n) * 100;
  // Drop trailing zeros but cap at 3 decimals for stability.
  return `${Number(pct.toFixed(3))}%`;
}

function resolveRatio(input: AspectRatioPreset | number | undefined): {
  css: string;
  data: string;
  num: number;
} {
  if (input === undefined) {
    return { css: '16 / 9', data: '16:9', num: 16 / 9 };
  }
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0) {
      return { css: '16 / 9', data: '16:9', num: 16 / 9 };
    }
    return { css: String(input), data: String(input), num: input };
  }
  return {
    css: RATIO_PRESET_TO_CSS[input],
    data: input,
    num: RATIO_PRESET_TO_NUMBER[input],
  };
}

// (v1.11.401, TODO 11.383) Module-level feature detection.
// Reads the CSS `aspect-ratio` property availability ONCE
// on first call (memoized) so per-render cost stays zero.
// SSR-safe -- when `document` is absent, returns true so
// the modern path renders on the server and lets the
// browser take over on hydration. Tests that need to force
// the fallback path should pass `forceFallback={true}`.
let cachedAspectRatioSupport: boolean | null = null;
export function supportsAspectRatio(): boolean {
  if (cachedAspectRatioSupport !== null) return cachedAspectRatioSupport;
  if (typeof document === 'undefined' || !document.documentElement) {
    cachedAspectRatioSupport = true;
    return true;
  }
  const result = 'aspectRatio' in document.documentElement.style;
  cachedAspectRatioSupport = result;
  return result;
}

// (v1.11.401, TODO 11.383) Test hook -- callers can clear
// the cache so subsequent `supportsAspectRatio()` calls
// re-probe. Useful for unit tests that mock the style
// support detection. Not exposed in production -- the
// production path memoizes once on first call.
export function __resetAspectRatioSupportCache(): void {
  cachedAspectRatioSupport = null;
}

export const AspectRatio = forwardRef<HTMLDivElement, AspectRatioProps>(
  ({ ratio, forceFallback = false, className, style, children, ...rest }, ref) => {
    const resolved = resolveRatio(ratio);
    // (v1.11.401, TODO 11.383) Pick the modern or fallback
    // render path. Modern path sets `aspect-ratio` CSS;
    // fallback path sets `padding-bottom: <h/w>%` and the
    // content sits inside an absolutely-positioned slot.
    const useFallback = forceFallback || !supportsAspectRatio();
    const mergedStyle: CSSProperties = useFallback
      ? {
          paddingBottom: `${Number(((1 / resolved.num) * 100).toFixed(3))}%`,
          ...style,
        }
      : {
          aspectRatio: resolved.css,
          ...style,
        };
    return (
      <div
        ref={ref}
        data-section="aspect-ratio"
        data-ratio={resolved.data}
        data-fallback={useFallback ? 'true' : 'false'}
        className={cn('relative w-full', className)}
        style={mergedStyle}
        {...rest}
      >
        <div
          data-section="aspect-ratio-content"
          className="absolute inset-0"
        >
          {children}
        </div>
      </div>
    );
  },
);
AspectRatio.displayName = 'AspectRatio';
