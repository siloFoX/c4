// (v1.11.362, TODO 11.344) Offline-capable PWA
// service worker.
//
// Strategy by route class:
//
//   - api         : network-first, cache fallback for
//                   GET only. POST/PUT/DELETE pass
//                   through (write paths must not be
//                   served from cache).
//   - navigation  : network-first, fall back to the
//                   cached app shell so the dashboard
//                   still loads while the network is
//                   offline.
//   - static      : cache-first with background revalidate
//                   for the app's own JS/CSS/SVG/font
//                   assets. The hashed Vite filenames
//                   make this safe -- a new deploy ships
//                   new filenames, the old ones expire
//                   the next time the activate handler
//                   prunes the cache.
//   - opaque      : passthrough -- cross-origin requests
//                   (CDN fonts, telemetry POSTs) are
//                   never cached.
//
// The bottom of the file wires window-side event
// listeners (`install`, `activate`, `fetch`,
// `message`). The handler functions are exported
// independently so vitest can drive them in jsdom
// without spinning up a real ServiceWorker.

export const SW_CACHE_VERSION = 'v1';
export const SHELL_CACHE = `c4-shell-${SW_CACHE_VERSION}`;
export const RUNTIME_CACHE = `c4-runtime-${SW_CACHE_VERSION}`;
export const API_CACHE = `c4-api-${SW_CACHE_VERSION}`;

// Files cached eagerly at install time so the app
// shell is available offline on the first repeat
// visit. Hashed JS/CSS are not in here -- they get
// picked up by the runtime cache once the page
// requests them.
export const APP_SHELL: readonly string[] = Object.freeze([
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/logo.svg',
]);

export type RouteClass = 'api' | 'navigation' | 'static' | 'opaque';

export interface ClassifyOptions {
  origin: string;
  apiPrefix?: string;
}

const STATIC_EXT_RE = /\.(?:js|mjs|css|svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|ttf|otf)(?:\?.*)?$/i;

export function classifyRequest(
  request: Request,
  options: ClassifyOptions,
): RouteClass {
  const url = new URL(request.url);
  if (url.origin !== options.origin) return 'opaque';
  const apiPrefix = options.apiPrefix ?? '/api/';
  if (url.pathname.startsWith(apiPrefix)) return 'api';
  if (request.mode === 'navigate' || request.destination === 'document') {
    return 'navigation';
  }
  if (STATIC_EXT_RE.test(url.pathname)) return 'static';
  return 'opaque';
}

export interface CacheLike {
  match: (req: Request) => Promise<Response | undefined>;
  put: (req: Request, res: Response) => Promise<void>;
  addAll: (reqs: readonly string[]) => Promise<void>;
  delete: (req: Request) => Promise<boolean>;
  keys: () => Promise<readonly Request[]>;
}

export interface CacheStorageLike {
  open: (name: string) => Promise<CacheLike>;
  keys: () => Promise<readonly string[]>;
  delete: (name: string) => Promise<boolean>;
  match: (req: Request) => Promise<Response | undefined>;
}

export interface FetchContext {
  caches: CacheStorageLike;
  fetch: typeof fetch;
}

// Network-first: try the network, fall back to the
// matching cache entry. Used for /api/ GET requests and
// HTML navigations. POST/PUT/DELETE never read from
// cache.
export async function networkFirst(
  request: Request,
  cacheName: string,
  ctx: FetchContext,
): Promise<Response> {
  if (request.method !== 'GET') {
    return ctx.fetch(request);
  }
  try {
    const fresh = await ctx.fetch(request);
    if (fresh && fresh.ok) {
      try {
        const cache = await ctx.caches.open(cacheName);
        await cache.put(request, fresh.clone());
      } catch {
        // Quota / opaque-response failures are
        // non-fatal -- still return the fresh response.
      }
    }
    return fresh;
  } catch (err) {
    const cache = await ctx.caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

// Cache-first with background revalidate. Returns
// the cached copy immediately when available; if the
// cache is cold, falls back to the network and caches
// the result. The background fetch refreshes the cache
// so the next visit sees the latest hash.
export async function cacheFirst(
  request: Request,
  cacheName: string,
  ctx: FetchContext,
): Promise<Response> {
  const cache = await ctx.caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    // Fire-and-forget revalidate.
    revalidate(request, cache, ctx).catch(() => {
      // Swallow background failures.
    });
    return cached;
  }
  const fresh = await ctx.fetch(request);
  if (fresh && fresh.ok) {
    try {
      await cache.put(request, fresh.clone());
    } catch {
      // ignore
    }
  }
  return fresh;
}

async function revalidate(
  request: Request,
  cache: CacheLike,
  ctx: FetchContext,
): Promise<void> {
  const fresh = await ctx.fetch(request);
  if (fresh && fresh.ok) {
    await cache.put(request, fresh.clone());
  }
}

// Navigation fallback: when the network is offline
// AND we have no cached copy of the requested page,
// serve the cached app shell so the React app boots
// and can render its offline state.
export async function navigationHandler(
  request: Request,
  ctx: FetchContext,
): Promise<Response> {
  try {
    return await networkFirst(request, RUNTIME_CACHE, ctx);
  } catch (err) {
    const shell = await ctx.caches.open(SHELL_CACHE);
    // Build absolute URLs from the incoming request
    // so the cache lookup works under both the real
    // SW runtime AND jsdom tests (jsdom rejects
    // `new Request('/path')` without a base).
    const origin = new URL(request.url).origin;
    const shellMatch =
      (await shell.match(new Request(`${origin}/index.html`))) ??
      (await shell.match(new Request(`${origin}/`)));
    if (shellMatch) return shellMatch;
    throw err;
  }
}

export async function handleFetch(
  request: Request,
  options: ClassifyOptions,
  ctx: FetchContext,
): Promise<Response> {
  const klass = classifyRequest(request, options);
  switch (klass) {
    case 'api':
      return networkFirst(request, API_CACHE, ctx);
    case 'navigation':
      return navigationHandler(request, ctx);
    case 'static':
      return cacheFirst(request, RUNTIME_CACHE, ctx);
    case 'opaque':
    default:
      return ctx.fetch(request);
  }
}

export async function handleInstall(ctx: FetchContext): Promise<void> {
  const cache = await ctx.caches.open(SHELL_CACHE);
  await cache.addAll(APP_SHELL);
}

// Returns the list of cache names that were pruned.
export async function handleActivate(
  ctx: FetchContext,
  keep: readonly string[] = [SHELL_CACHE, RUNTIME_CACHE, API_CACHE],
): Promise<readonly string[]> {
  const names = await ctx.caches.keys();
  const stale = names.filter(
    (n) => n.startsWith('c4-') && !keep.includes(n),
  );
  await Promise.all(stale.map((n) => ctx.caches.delete(n)));
  return stale;
}

// -- Runtime wiring -- only executed inside a real
// service worker scope. The pure handlers above are
// what unit tests exercise.

interface SwGlobalScopeLike {
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  skipWaiting?: () => Promise<void> | void;
  clients?: { claim: () => Promise<void> };
  registration?: unknown;
  location: { origin: string };
  caches: CacheStorageLike;
}

function isServiceWorkerScope(g: unknown): g is SwGlobalScopeLike {
  return (
    !!g &&
    typeof g === 'object' &&
    'skipWaiting' in (g as Record<string, unknown>) &&
    'registration' in (g as Record<string, unknown>)
  );
}

function wireServiceWorker(scope: SwGlobalScopeLike): void {
  const ctx: FetchContext = {
    caches: scope.caches,
    fetch: (input, init) => fetch(input as RequestInfo, init),
  };
  scope.addEventListener('install', (event) => {
    const e = event as ExtendableEventLike;
    e.waitUntil?.(
      handleInstall(ctx).then(() => scope.skipWaiting?.()),
    );
  });
  scope.addEventListener('activate', (event) => {
    const e = event as ExtendableEventLike;
    e.waitUntil?.(
      handleActivate(ctx).then(() => scope.clients?.claim()),
    );
  });
  scope.addEventListener('fetch', (event) => {
    const e = event as unknown as FetchEventLike;
    if (!e.request) return;
    e.respondWith?.(
      handleFetch(e.request, { origin: scope.location.origin }, ctx),
    );
  });
  scope.addEventListener('message', (event) => {
    const e = event as unknown as MessageEventLike;
    if (e.data && e.data.type === 'SKIP_WAITING') {
      scope.skipWaiting?.();
    }
  });
}

interface ExtendableEventLike {
  waitUntil?: (p: Promise<unknown>) => void;
}

interface FetchEventLike extends ExtendableEventLike {
  request: Request;
  respondWith?: (r: Response | Promise<Response>) => void;
}

interface MessageEventLike {
  data?: { type?: string };
}

if (typeof self !== 'undefined' && isServiceWorkerScope(self as unknown)) {
  wireServiceWorker(self as unknown as SwGlobalScopeLike);
}
