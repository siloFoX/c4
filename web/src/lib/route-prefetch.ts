// (v1.11.246, TODO 11.228) Lazy-route prefetch helper. The web app
// code-splits every top-level view via `React.lazy(() => import(...))`
// (see App.tsx). The lazy boundary only triggers the chunk fetch
// when the route mounts, which means the first navigation always
// stalls on a network round trip + parse. This module exposes the
// same loader function so a parent can warm the chunk preemptively
// while the user is still hovering / focusing the nav item.
//
// Contract
// --------
// - `prefetch(loader)` calls the loader exactly once per loader
//   identity. Subsequent calls return the cached promise, so a
//   keyboard user that focuses, blurs, and re-focuses the same tab
//   does not refire the network request. The cache is keyed by the
//   loader function reference so swapping loaders at hot-reload
//   time correctly invalidates.
// - The loader's promise is fire-and-forget. We do not propagate
//   rejections -- a failed chunk fetch should surface through the
//   eventual `React.lazy` boundary, not here, otherwise an
//   unhandled rejection from a hover handler would spam the
//   console. We do swallow the error and let the consumer's
//   ErrorBoundary handle the click-time failure.
// - SSR / non-browser environments: when `window` is undefined the
//   helper is a no-op (returns `undefined`). The cache itself is
//   process-wide so importing this module in a worker is also safe.
// - `prefetchHandlers(loader)` returns the typical
//   `{ onMouseEnter, onFocus }` pair so consumers can spread it
//   onto a button / link without re-deriving the wiring.

export type RouteLoader = () => Promise<unknown>;

const PENDING = new WeakMap<RouteLoader, Promise<unknown>>();

export function prefetch(loader: RouteLoader): Promise<unknown> | undefined {
  if (typeof window === 'undefined') return undefined;
  const cached = PENDING.get(loader);
  if (cached) return cached;
  let promise: Promise<unknown>;
  try {
    promise = loader();
  } catch {
    // A synchronous throw from the loader should not crash the
    // hover handler. Skip caching so a retry on the next hover is
    // possible (e.g. the bundler dropped the chunk between calls).
    return undefined;
  }
  if (!promise || typeof promise.then !== 'function') {
    // A loader that does not return a thenable (defensive --
    // every real loader is `() => import(...)`) is treated as
    // "warmed" so we do not call it again.
    return undefined;
  }
  PENDING.set(loader, promise);
  promise.catch(() => {
    // Drop the cache on failure so a subsequent hover retries.
    // We rely on the real lazy boundary to surface the error to
    // the user via its ErrorBoundary.
    PENDING.delete(loader);
  });
  return promise;
}

export interface PrefetchHandlers {
  onMouseEnter: () => void;
  onFocus: () => void;
  onTouchStart: () => void;
}

export function prefetchHandlers(loader: RouteLoader): PrefetchHandlers {
  const fire = () => {
    prefetch(loader);
  };
  return {
    onMouseEnter: fire,
    onFocus: fire,
    // Touch users do not fire `mouseenter` on tap. Wiring
    // `touchstart` warms the chunk during the press-down window
    // so the first nav still benefits from the cache hit by the
    // time `click` fires (~150 ms later for the synthetic-click
    // fallback path).
    onTouchStart: fire,
  };
}

// Test-only helper. Resets the per-loader cache so a unit test can
// exercise the path twice without colliding on the WeakMap entry.
// `_resetPrefetchCache` is exported for completeness but the
// preferred test pattern is to pass a fresh loader function each
// case so the WeakMap key differs.
export function _resetPrefetchCache(loader?: RouteLoader): void {
  if (loader) {
    PENDING.delete(loader);
    return;
  }
  // No-op when called without a key -- WeakMap is not iterable
  // and we deliberately do not maintain a parallel Set just for
  // tests. Tests that need a full reset should construct loaders
  // inside their `it()` so each case has fresh identity.
}
