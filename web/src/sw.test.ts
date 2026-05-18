import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_SHELL,
  API_CACHE,
  RUNTIME_CACHE,
  SHELL_CACHE,
  cacheFirst,
  classifyRequest,
  handleActivate,
  handleFetch,
  handleInstall,
  navigationHandler,
  networkFirst,
  type CacheLike,
  type CacheStorageLike,
  type FetchContext,
} from './sw';

class FakeCache implements CacheLike {
  private readonly store = new Map<string, Response>();

  async match(req: Request): Promise<Response | undefined> {
    return this.store.get(keyOf(req))?.clone();
  }
  async put(req: Request, res: Response): Promise<void> {
    this.store.set(keyOf(req), res.clone());
  }
  async addAll(reqs: readonly string[]): Promise<void> {
    for (const url of reqs) {
      this.store.set(url, new Response(`shell ${url}`));
    }
  }
  async delete(req: Request): Promise<boolean> {
    return this.store.delete(keyOf(req));
  }
  async keys(): Promise<readonly Request[]> {
    return Array.from(this.store.keys()).map((u) => new Request(u));
  }

  get size(): number {
    return this.store.size;
  }
  hasKey(url: string): boolean {
    return this.store.has(url);
  }
}

class FakeCaches implements CacheStorageLike {
  readonly buckets = new Map<string, FakeCache>();

  async open(name: string): Promise<CacheLike> {
    let cache = this.buckets.get(name);
    if (!cache) {
      cache = new FakeCache();
      this.buckets.set(name, cache);
    }
    return cache;
  }
  async keys(): Promise<readonly string[]> {
    return Array.from(this.buckets.keys());
  }
  async delete(name: string): Promise<boolean> {
    return this.buckets.delete(name);
  }
  async match(req: Request): Promise<Response | undefined> {
    for (const cache of this.buckets.values()) {
      const hit = await cache.match(req);
      if (hit) return hit;
    }
    return undefined;
  }
}

function keyOf(req: Request | string): string {
  return typeof req === 'string' ? req : req.url;
}

const ORIGIN = 'http://localhost:5173';
const OPTS = { origin: ORIGIN };

function makeRequest(
  path: string,
  init: { method?: string; mode?: RequestMode; destination?: string } = {},
): Request {
  // jsdom Request rejects `mode: 'navigate'` in its
  // constructor (it's reserved for the browser
  // engine), so we attach both `mode` and
  // `destination` via Object.defineProperty after the
  // fact. The classifier reads them via property
  // access, not via the structured init bag.
  const req = new Request(`${ORIGIN}${path}`, {
    method: init.method ?? 'GET',
  });
  if (init.mode !== undefined) {
    Object.defineProperty(req, 'mode', {
      value: init.mode,
      configurable: true,
    });
  }
  if (init.destination !== undefined) {
    Object.defineProperty(req, 'destination', {
      value: init.destination,
      configurable: true,
    });
  }
  return req;
}

function makeCtx(fetchImpl: typeof fetch): FetchContext {
  return { caches: new FakeCaches(), fetch: fetchImpl };
}

describe('classifyRequest', () => {
  it('flags same-origin /api/ as api', () => {
    expect(classifyRequest(makeRequest('/api/workers'), OPTS)).toBe('api');
  });

  it('respects a custom apiPrefix', () => {
    expect(
      classifyRequest(makeRequest('/v2/workers'), { ...OPTS, apiPrefix: '/v2/' }),
    ).toBe('api');
  });

  it('flags navigation requests', () => {
    expect(
      classifyRequest(makeRequest('/', { mode: 'navigate' }), OPTS),
    ).toBe('navigation');
    expect(
      classifyRequest(makeRequest('/dashboard', { destination: 'document' }), OPTS),
    ).toBe('navigation');
  });

  it('flags JS/CSS/SVG as static', () => {
    expect(classifyRequest(makeRequest('/assets/index-abc.js'), OPTS)).toBe('static');
    expect(classifyRequest(makeRequest('/assets/main.css'), OPTS)).toBe('static');
    expect(classifyRequest(makeRequest('/favicon.svg'), OPTS)).toBe('static');
    expect(classifyRequest(makeRequest('/font.woff2?v=1'), OPTS)).toBe('static');
  });

  it('flags cross-origin as opaque', () => {
    const req = new Request('https://cdn.example.com/x.js');
    expect(classifyRequest(req, OPTS)).toBe('opaque');
  });

  it('flags unknown same-origin paths as opaque', () => {
    expect(classifyRequest(makeRequest('/health-check'), OPTS)).toBe('opaque');
  });
});

describe('networkFirst', () => {
  it('caches successful GETs', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('fresh', { status: 200 }));
    const ctx = makeCtx(fetchSpy as unknown as typeof fetch);
    const req = makeRequest('/api/workers');
    const res = await networkFirst(req, API_CACHE, ctx);
    expect(await res.text()).toBe('fresh');
    const cache = (ctx.caches as FakeCaches).buckets.get(API_CACHE);
    expect(cache?.hasKey(req.url)).toBe(true);
  });

  it('falls back to cache on network failure', async () => {
    const ctx = makeCtx(
      vi.fn().mockRejectedValue(new TypeError('offline')) as unknown as typeof fetch,
    );
    const cache = await ctx.caches.open(API_CACHE);
    const req = makeRequest('/api/workers');
    await cache.put(req, new Response('stale', { status: 200 }));
    const res = await networkFirst(req, API_CACHE, ctx);
    expect(await res.text()).toBe('stale');
  });

  it('rethrows when network fails AND cache is cold', async () => {
    const ctx = makeCtx(
      vi.fn().mockRejectedValue(new TypeError('offline')) as unknown as typeof fetch,
    );
    await expect(
      networkFirst(makeRequest('/api/x'), API_CACHE, ctx),
    ).rejects.toThrow(/offline/);
  });

  it('passes POST through without caching', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('ok'));
    const ctx = makeCtx(fetchSpy as unknown as typeof fetch);
    const req = makeRequest('/api/workers', { method: 'POST' });
    await networkFirst(req, API_CACHE, ctx);
    const cache = (ctx.caches as FakeCaches).buckets.get(API_CACHE);
    expect(cache).toBeUndefined();
  });

  it('does not cache a 500 response', async () => {
    const ctx = makeCtx(
      vi.fn().mockResolvedValue(new Response('boom', { status: 500 })) as unknown as typeof fetch,
    );
    const req = makeRequest('/api/workers');
    await networkFirst(req, API_CACHE, ctx);
    const cache = (ctx.caches as FakeCaches).buckets.get(API_CACHE);
    expect(cache?.hasKey(req.url) ?? false).toBe(false);
  });
});

describe('cacheFirst', () => {
  it('serves the cached copy when present', async () => {
    const ctx = makeCtx(
      vi.fn().mockResolvedValue(new Response('fresh-server-payload')) as unknown as typeof fetch,
    );
    const cache = await ctx.caches.open(RUNTIME_CACHE);
    const req = makeRequest('/assets/x-abc.js');
    await cache.put(req, new Response('cached-payload'));
    const res = await cacheFirst(req, RUNTIME_CACHE, ctx);
    expect(await res.text()).toBe('cached-payload');
  });

  it('fetches when the cache is cold and stores the response', async () => {
    const ctx = makeCtx(
      vi.fn().mockResolvedValue(new Response('cold-fetch')) as unknown as typeof fetch,
    );
    const req = makeRequest('/assets/x-abc.js');
    const res = await cacheFirst(req, RUNTIME_CACHE, ctx);
    expect(await res.text()).toBe('cold-fetch');
    const cache = (ctx.caches as FakeCaches).buckets.get(RUNTIME_CACHE);
    expect(cache?.hasKey(req.url)).toBe(true);
  });
});

describe('navigationHandler', () => {
  it('falls back to the cached shell when network fails', async () => {
    const ctx = makeCtx(
      vi.fn().mockRejectedValue(new TypeError('offline')) as unknown as typeof fetch,
    );
    const shell = await ctx.caches.open(SHELL_CACHE);
    await shell.put(
      new Request(`${ORIGIN}/index.html`),
      new Response('<html>shell</html>'),
    );
    const res = await navigationHandler(
      makeRequest('/some/route', { mode: 'navigate' }),
      ctx,
    );
    expect(await res.text()).toBe('<html>shell</html>');
  });

  it('rethrows when offline AND shell cache is empty', async () => {
    const ctx = makeCtx(
      vi.fn().mockRejectedValue(new TypeError('offline')) as unknown as typeof fetch,
    );
    await expect(
      navigationHandler(makeRequest('/x', { mode: 'navigate' }), ctx),
    ).rejects.toThrow(/offline/);
  });
});

describe('handleFetch', () => {
  it('routes /api/ to networkFirst', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('api-fresh'));
    const ctx = makeCtx(fetchSpy as unknown as typeof fetch);
    const res = await handleFetch(makeRequest('/api/list'), OPTS, ctx);
    expect(await res.text()).toBe('api-fresh');
    expect((ctx.caches as FakeCaches).buckets.get(API_CACHE)).toBeDefined();
  });

  it('routes static to cacheFirst', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('asset'));
    const ctx = makeCtx(fetchSpy as unknown as typeof fetch);
    await handleFetch(makeRequest('/assets/main-abc.js'), OPTS, ctx);
    expect((ctx.caches as FakeCaches).buckets.get(RUNTIME_CACHE)).toBeDefined();
  });

  it('passes opaque cross-origin through', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('xo'));
    const ctx = makeCtx(fetchSpy as unknown as typeof fetch);
    const req = new Request('https://cdn.example.com/font.woff2');
    await handleFetch(req, OPTS, ctx);
    expect(fetchSpy).toHaveBeenCalledWith(req);
    expect((ctx.caches as FakeCaches).buckets.size).toBe(0);
  });
});

describe('handleInstall', () => {
  it('adds the app shell to the shell cache', async () => {
    const fetchSpy = vi.fn();
    const ctx = makeCtx(fetchSpy as unknown as typeof fetch);
    await handleInstall(ctx);
    const cache = (ctx.caches as FakeCaches).buckets.get(SHELL_CACHE);
    expect(cache).toBeDefined();
    expect(cache?.size).toBe(APP_SHELL.length);
  });
});

describe('handleActivate', () => {
  let ctx: FetchContext;
  beforeEach(async () => {
    ctx = makeCtx(vi.fn() as unknown as typeof fetch);
    await ctx.caches.open(SHELL_CACHE);
    await ctx.caches.open(RUNTIME_CACHE);
    await ctx.caches.open(API_CACHE);
    await ctx.caches.open('c4-shell-v0'); // stale
    await ctx.caches.open('c4-runtime-v0'); // stale
    await ctx.caches.open('unrelated-cache'); // foreign, untouched
  });

  it('prunes stale c4-* caches', async () => {
    const removed = await handleActivate(ctx);
    expect(new Set(removed)).toEqual(
      new Set(['c4-shell-v0', 'c4-runtime-v0']),
    );
    const remaining = await ctx.caches.keys();
    expect(remaining).toContain(SHELL_CACHE);
    expect(remaining).toContain(RUNTIME_CACHE);
    expect(remaining).toContain(API_CACHE);
    expect(remaining).toContain('unrelated-cache');
  });

  it('respects a custom keep list', async () => {
    const removed = await handleActivate(ctx, [SHELL_CACHE]);
    expect(removed).toContain(RUNTIME_CACHE);
    expect(removed).toContain(API_CACHE);
    expect(removed).toContain('c4-shell-v0');
  });
});

describe('APP_SHELL', () => {
  it('includes the manifest + boot HTML', () => {
    expect(APP_SHELL).toContain('/');
    expect(APP_SHELL).toContain('/index.html');
    expect(APP_SHELL).toContain('/manifest.webmanifest');
    expect(APP_SHELL).toContain('/favicon.svg');
  });

  it('is frozen so callers cannot mutate the shell list at runtime', () => {
    expect(Object.isFrozen(APP_SHELL)).toBe(true);
  });
});
