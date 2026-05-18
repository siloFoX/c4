import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { Drawer, type DrawerSide } from './drawer';

// (v1.11.382, TODO 11.364) Sheet primitive.
//
// `Sheet` is the canonical shadcn-style name for a
// side-anchored modal panel. The existing
// `<Drawer>` (11.279 / v1.11.297) already covers
// the dispatch contract -- side anchor, slide
// animation, focus trap, backdrop, scroll lock,
// Escape close, portal mount, reduced-motion
// gating. This file ships:
//
//   - A `<Sheet>` alias so callers can use the
//     canonical name without renaming the
//     underlying primitive.
//   - A `size` prop with sm/md/lg/full presets
//     that resolves to the underlying drawer's
//     `width` (for left/right sides) or `height`
//     (for top/bottom sides). The presets match
//     the Dialog size scale (sm = sm modal,
//     md = standard, lg = wide, full = nearly
//     full viewport) so the visual rhythm stays
//     continuous across the modal primitives.
//
// Adopters that need fine-grained control can
// still pass `width` / `height` directly --
// explicit values win over the `size` preset.

export type SheetSide = DrawerSide;

export type SheetSize = 'sm' | 'md' | 'lg' | 'full';

// Width presets for left/right sheets. Numbers
// are pixels.
const SIZE_WIDTH: Record<SheetSize, string> = {
  sm: '256px',
  md: '320px',
  lg: '480px',
  // (v1.11.382) `full` aims at 720px, which the
  // underlying Drawer clamps to `maxWidth: 100%`
  // so narrow viewports still fit. The Drawer's
  // backdrop has p-4 around the panel; the
  // resulting width therefore shows the backdrop
  // gutter on the opposite edge regardless of
  // viewport size.
  full: '720px',
};

// Height presets for top/bottom sheets.
const SIZE_HEIGHT: Record<SheetSize, string> = {
  sm: '25%',
  md: '50%',
  lg: '75%',
  full: '95vh',
};

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: SheetSide;
  // (v1.11.382, TODO 11.364) Size preset. Resolves
  // to width (left/right) or height (top/bottom).
  // Explicit width / height props win over this.
  // Default `'md'` matches the legacy Drawer
  // default for left/right (`'320px'`) and
  // top/bottom (`50%`) so existing call sites
  // adopting the alias stay byte-identical.
  size?: SheetSize;
  width?: number | string;
  height?: number | string;
  title?: ReactNode;
  description?: ReactNode;
  showCloseButton?: boolean;
  closeOnBackdropClick?: boolean;
  closeOnEsc?: boolean;
  className?: string;
  children: ReactNode;
}

function resolveWidth(
  side: SheetSide,
  size: SheetSize,
  explicit: number | string | undefined,
): number | string | undefined {
  if (side === 'top' || side === 'bottom') return undefined;
  if (explicit !== undefined) return explicit;
  return SIZE_WIDTH[size];
}

function resolveHeight(
  side: SheetSide,
  size: SheetSize,
  explicit: number | string | undefined,
): number | string | undefined {
  if (side === 'left' || side === 'right') return undefined;
  if (explicit !== undefined) return explicit;
  return SIZE_HEIGHT[size];
}

export const Sheet = forwardRef<HTMLDivElement, SheetProps>(function Sheet(
  {
    open,
    onOpenChange,
    side = 'right',
    size = 'md',
    width,
    height,
    title,
    description,
    showCloseButton = true,
    closeOnBackdropClick = true,
    closeOnEsc = true,
    className,
    children,
  },
  ref,
) {
  const resolvedWidth = resolveWidth(side, size, width);
  const resolvedHeight = resolveHeight(side, size, height);
  return (
    <Drawer
      ref={ref}
      open={open}
      onOpenChange={onOpenChange}
      side={side}
      {...(resolvedWidth !== undefined ? { width: resolvedWidth } : {})}
      {...(resolvedHeight !== undefined ? { height: resolvedHeight } : {})}
      {...(title !== undefined ? { title } : {})}
      {...(description !== undefined ? { description } : {})}
      showCloseButton={showCloseButton}
      closeOnBackdropClick={closeOnBackdropClick}
      closeOnEsc={closeOnEsc}
      {...(className !== undefined ? { className } : {})}
    >
      {children}
    </Drawer>
  );
});

Sheet.displayName = 'Sheet';
