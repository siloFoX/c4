import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ImageAspect = 'square' | '4/3' | '16/9' | 'auto';
export type ImageRounded = 'sm' | 'md' | 'lg' | 'full' | 'none';

export interface ImageProps {
  src: string;
  alt: string;
  aspect?: ImageAspect;
  width?: string | number;
  height?: string | number;
  placeholderColor?: string;
  fallback?: ReactNode;
  fallbackInitials?: string;
  lazy?: boolean;
  rounded?: ImageRounded;
  className?: string;
  /**
   * (v1.11.244, TODO 11.226) Responsive sources. The `srcSet` is
   * forwarded verbatim to the underlying <img>; pair it with
   * `sizes` to let the browser pick the best candidate. When
   * neither is set the component falls back to the single `src`
   * URL just like before.
   */
  srcSet?: string;
  sizes?: string;
  /**
   * (v1.11.244, TODO 11.226) IntersectionObserver lookahead.
   * Default `'200px'` -- start fetching the image once it is
   * within 200px of the viewport so a fast scroll does not strand
   * the user on a blank placeholder. Set to `'0px'` to disable
   * the lookahead, or any other CSS length string to tune.
   * Only used while `lazy` is true.
   */
  rootMargin?: string;
  /**
   * (v1.11.244, TODO 11.226) Optional override for the
   * `<img decoding>` attribute. Default `'async'` keeps the main
   * thread responsive while the browser decodes the bitmap; set
   * to `'sync'` for above-the-fold critical images that must paint
   * before script runs.
   */
  decoding?: 'async' | 'sync' | 'auto';
}

const ASPECT_CLASS: Record<ImageAspect, string> = {
  square: 'aspect-square',
  '4/3': 'aspect-[4/3]',
  '16/9': 'aspect-video',
  auto: '',
};

const ROUNDED_CLASS: Record<ImageRounded, string> = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
  none: 'rounded-none',
};

function toDim(v?: string | number): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'number' ? `${v}px` : v;
}

export const Image = forwardRef<HTMLDivElement, ImageProps>(function Image(
  {
    src,
    alt,
    aspect = 'auto',
    width,
    height,
    placeholderColor,
    fallback,
    fallbackInitials,
    lazy = true,
    rounded = 'md',
    className,
    srcSet,
    sizes,
    rootMargin = '200px',
    decoding = 'async',
  },
  ref,
) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState<boolean>(!lazy);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!lazy) {
      setInView(true);
      return;
    }
    if (inView) return;
    const node = wrapperRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
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
      // (v1.11.244, TODO 11.226) Lookahead bumped 50px -> 200px so
      // a fast scroll starts the fetch before the placeholder
      // actually intersects the viewport. Configurable via the
      // `rootMargin` prop for tuning per surface.
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [lazy, inView, rootMargin]);

  // Reset load/error state when src changes.
  useEffect(() => {
    setLoaded(false);
    setError(false);
  }, [src]);

  const setRefs = (node: HTMLDivElement | null) => {
    wrapperRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  const wrapperStyle: CSSProperties = {};
  const w = toDim(width);
  const h = toDim(height);
  if (w !== undefined) wrapperStyle.width = w;
  if (h !== undefined) wrapperStyle.height = h;
  if (placeholderColor && !placeholderColor.startsWith('bg-')) {
    wrapperStyle.backgroundColor = placeholderColor;
  }

  const placeholderClass =
    placeholderColor && placeholderColor.startsWith('bg-')
      ? placeholderColor
      : placeholderColor
        ? ''
        : 'bg-muted';

  const showPulse = !loaded && !error && inView;

  let body: ReactNode;
  if (error) {
    if (fallback !== undefined) {
      body = (
        <div
          data-image-fallback="custom"
          className="flex h-full w-full items-center justify-center"
        >
          {fallback}
        </div>
      );
    } else if (fallbackInitials) {
      body = (
        <div
          data-image-fallback="initials"
          className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground font-semibold select-none"
        >
          {fallbackInitials}
        </div>
      );
    } else {
      body = (
        <div
          data-image-fallback="icon"
          className="flex h-full w-full items-center justify-center text-muted-foreground"
        >
          <ImageOff aria-hidden="true" className="h-1/3 w-1/3" />
        </div>
      );
    }
  } else if (inView) {
    // (v1.11.244, TODO 11.226) `decoding="async"` lets the browser
    // decode off the main thread (default has always been
    // implementation-defined; pinning it keeps behaviour stable
    // across engines). `loading` mirrors the lazy/eager intent so
    // an environment without `IntersectionObserver` still benefits
    // from the native lazy-loader. `srcSet` + `sizes` are
    // forwarded verbatim so responsive surfaces can offer multiple
    // resolutions.
    body = (
      <img
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        decoding={decoding}
        loading={lazy ? 'lazy' : 'eager'}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={cn(
          'h-full w-full object-cover transition-opacity duration-300',
          loaded ? 'opacity-100' : 'opacity-0',
          ROUNDED_CLASS[rounded],
        )}
      />
    );
  } else {
    body = null;
  }

  return (
    <div
      ref={setRefs}
      data-ui="image"
      data-image-state={error ? 'error' : loaded ? 'loaded' : 'loading'}
      className={cn(
        'relative overflow-hidden',
        ASPECT_CLASS[aspect],
        ROUNDED_CLASS[rounded],
        placeholderClass,
        showPulse && 'animate-pulse',
        className,
      )}
      style={Object.keys(wrapperStyle).length ? wrapperStyle : undefined}
    >
      {body}
    </div>
  );
});

Image.displayName = 'Image';
