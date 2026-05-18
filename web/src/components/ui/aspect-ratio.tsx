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
}

const RATIO_PRESET_TO_CSS: Record<AspectRatioPreset, string> = {
  '16:9': '16 / 9',
  '9:16': '9 / 16',
  '4:3': '4 / 3',
  '3:4': '3 / 4',
  '21:9': '21 / 9',
  '1:1': '1 / 1',
};

function resolveRatio(input: AspectRatioPreset | number | undefined): {
  css: string;
  data: string;
} {
  if (input === undefined) {
    return { css: '16 / 9', data: '16:9' };
  }
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0) {
      return { css: '16 / 9', data: '16:9' };
    }
    return { css: String(input), data: String(input) };
  }
  return { css: RATIO_PRESET_TO_CSS[input], data: input };
}

export const AspectRatio = forwardRef<HTMLDivElement, AspectRatioProps>(
  ({ ratio, className, style, children, ...rest }, ref) => {
    const resolved = resolveRatio(ratio);
    const mergedStyle: CSSProperties = {
      aspectRatio: resolved.css,
      ...style,
    };
    return (
      <div
        ref={ref}
        data-section="aspect-ratio"
        data-ratio={resolved.data}
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
