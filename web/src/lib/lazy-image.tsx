import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ImgHTMLAttributes,
} from 'react';
import { cn } from './cn';

// (v1.11.368, TODO 11.350) IntersectionObserver-based
// lazy image with LQIP (low-quality image
// placeholder) blur-up.
//
// Pairs with the existing `components/ui/image.tsx`
// (v1.11.244) which already covers the aspect-ratio
// / fallback / pulse-placeholder story. This module
// focuses on the LQIP blur-up flow:
//
//   - Render the LQIP as a CSS background-image with
//     `filter: blur(...)` on the wrapper so the
//     visual lands instantly (no network, the LQIP
//     is a tiny base64 data URI typically <2KB).
//   - Defer the full-resolution fetch until the
//     wrapper is within `rootMargin` of the
//     viewport. When `IntersectionObserver` is
//     unavailable, fall through to the native
//     `loading="lazy"` attribute on the `<img>` and
//     ship the full URL immediately so the browser
//     still defers below the fold.
//   - When the full image finishes loading, fade
//     the wrapper's blur to 0 over `transitionMs`
//     and dim the LQIP background to keep edges
//     crisp.
//   - `decoding="async"` keeps the main thread
//     responsive while the browser decodes the
//     bitmap.
//
// Adoption pattern:
//
//   <LazyImage
//     src="/avatars/w-32.jpg"
//     lqip="data:image/jpeg;base64,..."
//     alt="Worker avatar"
//     width={64}
//     height={64}
//   />
//
// SSR-safe: the IntersectionObserver guard and the
// `loading="lazy"` fallback both run inside
// `useEffect` so the first server render emits a
// stable markup tree.

export type LazyImageDecoding = 'async' | 'sync' | 'auto';

export interface LazyImageProps
  extends Omit<
    ImgHTMLAttributes<HTMLImageElement>,
    'src' | 'srcSet' | 'sizes' | 'loading' | 'decoding'
  > {
  // Full-resolution image URL. Required.
  src: string;
  // Accessible name. Required (empty string
  // signals decorative).
  alt: string;
  // Low-quality image placeholder. Recommended:
  // tiny base64-encoded JPEG (~10-100x downsample).
  // A bare URL works too; the wrapper paints it as
  // a background image either way.
  lqip?: string;
  // Responsive sources (forwarded verbatim).
  srcSet?: string;
  sizes?: string;
  // Wrapper width / height. Pass numeric pixels or
  // any CSS length string. Defaults to `auto`
  // (intrinsic image dimensions).
  width?: number | string;
  height?: number | string;
  // IntersectionObserver lookahead. Default 200px
  // so a fast scroll starts the fetch before the
  // wrapper actually intersects the viewport. Set
  // to `'0px'` to disable the lookahead.
  rootMargin?: string;
  // Override `<img decoding>`. Default `'async'`.
  // Pass `'sync'` for above-the-fold critical
  // images that must paint before script runs.
  decoding?: LazyImageDecoding;
  // Blur radius applied to the LQIP layer while
  // loading. Default 12 (px). Pass 0 to disable
  // the blur effect (still uses the LQIP as a
  // colour placeholder).
  blurPx?: number;
  // Fade duration when the full image takes over.
  // Default 300ms.
  transitionMs?: number;
  // Wrapper className override.
  className?: string;
  // <img> className override.
  imgClassName?: string;
  // Fires when the full image finishes loading.
  // Useful for telemetry / chained animations.
  onLoad?: ImgHTMLAttributes<HTMLImageElement>['onLoad'];
  // Fires when the full image fetch fails. The
  // LQIP stays visible.
  onError?: ImgHTMLAttributes<HTMLImageElement>['onError'];
  // Test hook on the outer wrapper.
  'data-testid'?: string;
}

const DEFAULT_ROOT_MARGIN = '200px';
const DEFAULT_BLUR_PX = 12;
const DEFAULT_TRANSITION_MS = 300;

function dimToCss(v: LazyImageProps['width']): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'number') return `${v}px`;
  return v;
}

export const LazyImage = forwardRef<HTMLDivElement, LazyImageProps>(
  function LazyImage(
    {
      src,
      alt,
      lqip,
      srcSet,
      sizes,
      width,
      height,
      rootMargin = DEFAULT_ROOT_MARGIN,
      decoding = 'async',
      blurPx = DEFAULT_BLUR_PX,
      transitionMs = DEFAULT_TRANSITION_MS,
      className,
      imgClassName,
      onLoad,
      onError,
      ...rest
    },
    ref,
  ) {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    // `inView` is the gating signal for the network
    // fetch. Defaults to true when the browser does
    // not expose IntersectionObserver -- in that
    // case the native `loading="lazy"` attribute on
    // the <img> still defers off-screen images.
    const [inView, setInView] = useState<boolean>(false);
    const [loaded, setLoaded] = useState<boolean>(false);
    const [errored, setErrored] = useState<boolean>(false);

    useEffect(() => {
      if (typeof window === 'undefined') return;
      if (typeof IntersectionObserver === 'undefined') {
        // Native lazy-loading mode: emit the full
        // <img> immediately and let the browser
        // defer it.
        setInView(true);
        return;
      }
      const node = wrapperRef.current;
      if (!node) return;
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setInView(true);
              observer.disconnect();
              break;
            }
          }
        },
        { rootMargin },
      );
      observer.observe(node);
      return () => observer.disconnect();
    }, [rootMargin]);

    // Reset transient state when `src` changes so
    // the LQIP re-blurs and the load handlers fire
    // again.
    useEffect(() => {
      setLoaded(false);
      setErrored(false);
    }, [src]);

    const setRefs = (node: HTMLDivElement | null): void => {
      wrapperRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    };

    const wrapperStyle: CSSProperties = {};
    const w = dimToCss(width);
    const h = dimToCss(height);
    if (w !== undefined) wrapperStyle.width = w;
    if (h !== undefined) wrapperStyle.height = h;
    if (lqip) {
      wrapperStyle.backgroundImage = `url("${lqip}")`;
      wrapperStyle.backgroundSize = 'cover';
      wrapperStyle.backgroundPosition = 'center';
    }
    // The LQIP layer blurs while `loaded` is false.
    // Once the full image takes over the wrapper
    // background fades out so subpixel edges in the
    // LQIP do not bleed through the foreground.
    const blurFilter = blurPx > 0 ? `blur(${blurPx}px)` : 'none';
    wrapperStyle.filter = loaded ? 'none' : blurFilter;
    wrapperStyle.transition = `filter ${transitionMs}ms ease-out, background-color ${transitionMs}ms ease-out`;
    if (loaded) {
      // Drop the placeholder colour once the full
      // image is on screen so the alpha edges of
      // the foreground do not pick up the
      // background tint.
      wrapperStyle.backgroundColor = 'transparent';
    }

    const imgStyle: CSSProperties = {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      transition: `opacity ${transitionMs}ms ease-out`,
      opacity: loaded ? 1 : 0,
    };

    const { 'data-testid': testId, ...imgRest } = rest;
    const wrapperDataAttrs: Record<string, string> = {
      'data-section': 'lazy-image',
      'data-state': errored
        ? 'error'
        : loaded
          ? 'loaded'
          : inView
            ? 'fetching'
            : 'idle',
    };
    if (testId) wrapperDataAttrs['data-testid'] = testId;

    const shouldRenderImg = inView && !errored;

    return (
      <div
        ref={setRefs}
        className={cn('relative overflow-hidden', className)}
        style={wrapperStyle}
        {...wrapperDataAttrs}
      >
        {shouldRenderImg ? (
          <img
            src={src}
            {...(srcSet !== undefined ? { srcSet } : {})}
            {...(sizes !== undefined ? { sizes } : {})}
            alt={alt}
            decoding={decoding}
            // (v1.11.368) Native loading attribute as
            // a defence-in-depth alongside the IO
            // gate. When the IO callback fires we
            // already know the wrapper is on
            // screen, but `loading="lazy"` also
            // protects when JS is slow to attach
            // listeners.
            loading="lazy"
            onLoad={(event) => {
              setLoaded(true);
              if (onLoad) onLoad(event);
            }}
            onError={(event) => {
              setErrored(true);
              if (onError) onError(event);
            }}
            style={imgStyle}
            className={cn('block', imgClassName)}
            {...imgRest}
          />
        ) : null}
      </div>
    );
  },
);

LazyImage.displayName = 'LazyImage';
