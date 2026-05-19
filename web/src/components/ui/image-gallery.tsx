import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  ForwardedRef,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { getPortalRoot } from '../../lib/portal-root';

// (v1.11.436, TODO 11.418) ImageGallery primitive.
//
// Grid / masonry thumbnail grid with a lightbox modal for
// full-resolution viewing. The grid is a plain CSS grid (equal
// rows) or a CSS multi-column masonry (variable heights). The
// lightbox renders through a portal, traps focus, and listens
// for ArrowLeft / ArrowRight / Home / End / Escape on the
// modal root. Pointer-down to pointer-up deltas drive the
// swipe-to-navigate gesture on touch screens.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ImageGalleryItem {
  src: string;
  alt: string;
  thumb?: string;
  caption?: ReactNode;
  width?: number;
  height?: number;
}

export type ImageGalleryLayout = 'grid' | 'masonry';

export interface ImageGalleryProps {
  items: ImageGalleryItem[];
  layout?: ImageGalleryLayout;
  columns?: number;
  gap?: number;
  defaultIndex?: number | null;
  openIndex?: number | null;
  onOpenChange?: (index: number | null) => void;
  className?: string;
  ariaLabel?: string;
  lazy?: boolean;
  onSelect?: (index: number) => void;
  swipeThreshold?: number;
  closeOnBackdropClick?: boolean;
  containerId?: string;
  wrap?: boolean;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_GALLERY_COLUMNS = 3;
export const DEFAULT_GALLERY_GAP = 8;
export const DEFAULT_SWIPE_THRESHOLD = 50;

export function clampGalleryIndex(
  index: number,
  total: number,
): number {
  if (total <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  if (index < 0) return 0;
  if (index > total - 1) return total - 1;
  return Math.floor(index);
}

export function nextGalleryIndex(
  current: number,
  total: number,
  wrap = true,
): number {
  if (total <= 0) return 0;
  const c = clampGalleryIndex(current, total);
  if (c >= total - 1) return wrap ? 0 : total - 1;
  return c + 1;
}

export function prevGalleryIndex(
  current: number,
  total: number,
  wrap = true,
): number {
  if (total <= 0) return 0;
  const c = clampGalleryIndex(current, total);
  if (c <= 0) return wrap ? total - 1 : 0;
  return c - 1;
}

export function isSwipeLeft(
  dx: number,
  threshold: number = DEFAULT_SWIPE_THRESHOLD,
): boolean {
  return dx <= -threshold;
}

export function isSwipeRight(
  dx: number,
  threshold: number = DEFAULT_SWIPE_THRESHOLD,
): boolean {
  return dx >= threshold;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ImageGallery = forwardRef(function ImageGallery(
  {
    items,
    layout = 'grid',
    columns = DEFAULT_GALLERY_COLUMNS,
    gap = DEFAULT_GALLERY_GAP,
    defaultIndex = null,
    openIndex,
    onOpenChange,
    className,
    ariaLabel = 'Image gallery',
    lazy = true,
    onSelect,
    swipeThreshold = DEFAULT_SWIPE_THRESHOLD,
    closeOnBackdropClick = true,
    containerId = 'app-portal-root',
    wrap = true,
  }: ImageGalleryProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const isControlled = openIndex !== undefined;
  const [internalIndex, setInternalIndex] = useState<number | null>(
    () => (defaultIndex == null ? null : clampGalleryIndex(defaultIndex, items.length)),
  );
  const effective = isControlled ? (openIndex ?? null) : internalIndex;
  const isOpen = effective != null;

  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  const emitOpenChange = useCallback(
    (next: number | null) => {
      const sanitized =
        next == null ? null : clampGalleryIndex(next, items.length);
      if (!isControlled) setInternalIndex(sanitized);
      onOpenChangeRef.current?.(sanitized);
    },
    [isControlled, items.length],
  );

  const openAt = useCallback(
    (idx: number) => {
      const sanitized = clampGalleryIndex(idx, items.length);
      onSelect?.(sanitized);
      emitOpenChange(sanitized);
    },
    [emitOpenChange, items.length, onSelect],
  );

  const close = useCallback(() => {
    emitOpenChange(null);
  }, [emitOpenChange]);

  const goNext = useCallback(() => {
    if (effective == null) return;
    emitOpenChange(nextGalleryIndex(effective, items.length, wrap));
  }, [effective, emitOpenChange, items.length, wrap]);

  const goPrev = useCallback(() => {
    if (effective == null) return;
    emitOpenChange(prevGalleryIndex(effective, items.length, wrap));
  }, [effective, emitOpenChange, items.length, wrap]);

  // --- Lightbox keyboard ----------------------------------
  const onLightboxKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault();
          goNext();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          goPrev();
          break;
        case 'Home':
          event.preventDefault();
          emitOpenChange(0);
          break;
        case 'End':
          event.preventDefault();
          emitOpenChange(items.length - 1);
          break;
        case 'Escape':
          event.preventDefault();
          close();
          break;
        default:
          break;
      }
    },
    [close, emitOpenChange, goNext, goPrev, items.length],
  );

  // --- Lightbox swipe -------------------------------------
  const swipeStartRef = useRef<number | null>(null);
  const onLightboxPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      swipeStartRef.current = event.clientX;
    },
    [],
  );
  const onLightboxPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = swipeStartRef.current;
      swipeStartRef.current = null;
      if (start == null) return;
      const dx = event.clientX - start;
      if (isSwipeLeft(dx, swipeThreshold)) {
        goNext();
      } else if (isSwipeRight(dx, swipeThreshold)) {
        goPrev();
      }
    },
    [goNext, goPrev, swipeThreshold],
  );

  // --- Body-scroll lock + focus the lightbox on open ------
  const lightboxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    queueMicrotask(() => {
      lightboxRef.current?.focus();
    });
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // --- Portal target --------------------------------------
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(
    null,
  );
  useEffect(() => {
    if (!isOpen) {
      setPortalTarget(null);
      return undefined;
    }
    setPortalTarget(getPortalRoot(containerId));
    return undefined;
  }, [containerId, isOpen]);

  const loadingAttr: 'lazy' | 'eager' = lazy ? 'lazy' : 'eager';
  const layoutKind: ImageGalleryLayout = layout;

  const gridStyle =
    layoutKind === 'grid'
      ? ({
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: `${gap}px`,
        } as const)
      : ({
          columnCount: columns,
          columnGap: `${gap}px`,
        } as const);

  const activeItem = effective != null ? items[effective] : null;

  return (
    <>
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        data-section="image-gallery"
        data-layout={layoutKind}
        data-columns={columns}
        data-lazy={lazy ? 'true' : 'false'}
        data-item-count={items.length}
        className={cn('w-full', className)}
        style={gridStyle}
      >
        {items.map((item, index) => {
          const thumbSrc = item.thumb ?? item.src;
          return (
            <button
              key={`${item.src}-${index}`}
              type="button"
              data-section="image-gallery-item"
              data-index={index}
              onClick={() => openAt(index)}
              aria-label={`Open image ${index + 1}: ${item.alt}`}
              className={cn(
                'group block w-full overflow-hidden rounded-md border border-border bg-muted/30 p-0',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                layoutKind === 'masonry' && 'mb-2 inline-block',
              )}
              style={
                layoutKind === 'masonry'
                  ? { breakInside: 'avoid' }
                  : undefined
              }
            >
              <img
                src={thumbSrc}
                alt={item.alt}
                loading={loadingAttr}
                decoding="async"
                draggable={false}
                data-section="image-gallery-thumb"
                className={cn(
                  'block w-full',
                  layoutKind === 'grid'
                    ? 'h-full object-cover'
                    : 'h-auto',
                )}
              />
            </button>
          );
        })}
      </div>
      {isOpen && portalTarget && activeItem
        ? createPortal(
            <div
              ref={lightboxRef}
              role="dialog"
              aria-modal="true"
              aria-label={`${ariaLabel} lightbox`}
              tabIndex={-1}
              data-section="image-gallery-lightbox"
              data-active-index={effective}
              onKeyDown={onLightboxKeyDown}
              onPointerDown={onLightboxPointerDown}
              onPointerUp={onLightboxPointerUp}
              onClick={(event) => {
                if (
                  closeOnBackdropClick &&
                  event.target === event.currentTarget
                ) {
                  close();
                }
              }}
              className={cn(
                'fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 outline-none',
              )}
            >
              <button
                type="button"
                onClick={close}
                aria-label="Close lightbox"
                data-section="image-gallery-close"
                className="absolute right-4 top-4 rounded-full bg-background/20 p-2 text-white hover:bg-background/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={goPrev}
                aria-label="Previous image"
                data-section="image-gallery-prev"
                disabled={!wrap && effective === 0}
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-background/20 p-2 text-white hover:bg-background/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft aria-hidden="true" className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label="Next image"
                data-section="image-gallery-next"
                disabled={!wrap && effective === items.length - 1}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-background/20 p-2 text-white hover:bg-background/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight aria-hidden="true" className="h-6 w-6" />
              </button>
              <figure
                data-section="image-gallery-figure"
                className="flex max-h-full max-w-full flex-col items-center gap-2"
              >
                <img
                  src={activeItem.src}
                  alt={activeItem.alt}
                  loading="eager"
                  decoding="async"
                  draggable={false}
                  data-section="image-gallery-full"
                  className="max-h-[calc(100vh-6rem)] max-w-full rounded-md object-contain"
                />
                {activeItem.caption !== undefined ? (
                  <figcaption
                    data-section="image-gallery-caption"
                    className="text-sm text-white"
                  >
                    {activeItem.caption}
                  </figcaption>
                ) : null}
              </figure>
              <div
                data-section="image-gallery-counter"
                className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-background/20 px-3 py-1 text-xs text-white"
              >
                {`${(effective ?? 0) + 1} / ${items.length}`}
              </div>
            </div>,
            portalTarget,
          )
        : null}
    </>
  );
});

ImageGallery.displayName = 'ImageGallery';
