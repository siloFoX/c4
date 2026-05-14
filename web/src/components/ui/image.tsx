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
      { rootMargin: '50px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [lazy, inView]);

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
    body = (
      <img
        src={src}
        alt={alt}
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
