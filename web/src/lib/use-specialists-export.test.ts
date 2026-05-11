import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useSpecialistsExport } from './use-specialists-export';

// useSpecialistsExport hits GET /api/specialists/export, wraps the
// returned bundle in a JSON Blob, programmatically clicks an <a>
// pointing at URL.createObjectURL(blob), then revokes the URL. The
// banner pipes through useAutoClearMessage so success auto-clears
// after 4s while failure persists. We cover the idle slot, the full
// blob/download dance, the success/failure messages, busy-slot flip
// via a release-gate, and the fresh-run reset that clears stale
// failure state.

interface CreatedAnchor {
  href: string;
  download: string;
  clickCount: number;
}

const created: CreatedAnchor[] = [];
const objectUrls: { url: string; revoked: boolean; blob: Blob }[] = [];
let nextObjectUrlId = 0;
let realCreateElement: typeof document.createElement;

beforeEach(() => {
  created.length = 0;
  objectUrls.length = 0;
  nextObjectUrlId = 0;
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob): string => {
        const url = `blob:test/${++nextObjectUrlId}`;
        objectUrls.push({ url, revoked: false, blob });
        return url;
      }),
      revokeObjectURL: vi.fn((url: string): void => {
        const found = objectUrls.find((o) => o.url === url);
        if (found) found.revoked = true;
      }),
    }),
  );
  realCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(
    (tagName: string, options?: ElementCreationOptions): HTMLElement => {
      const el = realCreateElement(tagName, options);
      if (tagName.toLowerCase() === 'a') {
        const anchor = el as HTMLAnchorElement;
        const entry: CreatedAnchor = { href: '', download: '', clickCount: 0 };
        created.push(entry);
        Object.defineProperty(anchor, 'href', {
          configurable: true,
          get: () => entry.href,
          set: (v: string) => {
            entry.href = v;
          },
        });
        Object.defineProperty(anchor, 'download', {
          configurable: true,
          get: () => entry.download,
          set: (v: string) => {
            entry.download = v;
          },
        });
        anchor.click = () => {
          entry.clickCount += 1;
        };
      }
      return el;
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useSpecialistsExport', () => {
  it('starts idle: not busy, no msg, not failed', () => {
    const { result } = renderHook(() => useSpecialistsExport());
    expect(result.current.exportBusy).toBe(false);
    expect(result.current.exportMsg).toBeNull();
    expect(result.current.exportFailed).toBe(false);
  });

  it('GETs /api/specialists/export and surfaces a success message including the count', async () => {
    let path = '';
    server.use(
      http.get('/api/specialists/export', ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({
          version: 1,
          exportedAt: '2026-05-11T08:00:00.000Z',
          sourceVersion: 17,
          specialists: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        });
      }),
    );
    const { result } = renderHook(() => useSpecialistsExport());
    await act(async () => {
      await result.current.handleExport();
    });
    expect(path).toBe('/api/specialists/export');
    expect(result.current.exportBusy).toBe(false);
    expect(result.current.exportFailed).toBe(false);
    expect(result.current.exportMsg).toBeTruthy();
    expect(result.current.exportMsg).toContain('3');
  });

  it('writes a pretty-printed JSON blob and triggers an anchor click for download', async () => {
    server.use(
      http.get('/api/specialists/export', () =>
        HttpResponse.json({
          version: 1,
          exportedAt: '2026-05-11T08:00:00.000Z',
          sourceVersion: 7,
          specialists: [{ id: 'spec-1' }],
        }),
      ),
    );
    const { result } = renderHook(() => useSpecialistsExport());
    await act(async () => {
      await result.current.handleExport();
    });
    expect(objectUrls).toHaveLength(1);
    expect(objectUrls[0]?.blob.type).toBe('application/json');
    const body = await objectUrls[0]!.blob.text();
    expect(body).toContain('"specialists"');
    expect(body).toContain('"spec-1"');
    // pretty-printed (indent of 2)
    expect(body).toContain('\n  "version"');
    expect(created).toHaveLength(1);
    expect(created[0]?.href).toBe(objectUrls[0]?.url);
    expect(created[0]?.clickCount).toBe(1);
    // colons + dots in exportedAt sanitized for the download filename.
    expect(created[0]?.download).toBe(
      'c4-specialists-export-2026-05-11T08-00-00-000Z.json',
    );
  });

  it('revokes the object URL after triggering the click', async () => {
    server.use(
      http.get('/api/specialists/export', () =>
        HttpResponse.json({
          version: 1,
          exportedAt: '2026-05-11T08:00:00.000Z',
          sourceVersion: 1,
          specialists: [],
        }),
      ),
    );
    const { result } = renderHook(() => useSpecialistsExport());
    await act(async () => {
      await result.current.handleExport();
    });
    expect(objectUrls[0]?.revoked).toBe(true);
  });

  it('marks failed=true with the server error in the message on 5xx', async () => {
    server.use(
      http.get('/api/specialists/export', () =>
        HttpResponse.json({ error: 'registry locked' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useSpecialistsExport());
    await act(async () => {
      await result.current.handleExport();
    });
    expect(result.current.exportFailed).toBe(true);
    expect(result.current.exportMsg).toBeTruthy();
    expect(result.current.exportMsg).toContain('registry locked');
    expect(result.current.exportBusy).toBe(false);
    // No download on the failure path.
    expect(objectUrls).toHaveLength(0);
    expect(created).toHaveLength(0);
  });

  it('flips exportBusy=true during the in-flight request and back to false on resolve', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/specialists/export', async () => {
        await gate;
        return HttpResponse.json({
          version: 1,
          exportedAt: '2026-05-11T08:00:00.000Z',
          sourceVersion: 1,
          specialists: [],
        });
      }),
    );
    const { result } = renderHook(() => useSpecialistsExport());
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleExport();
      await Promise.resolve();
    });
    expect(result.current.exportBusy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.exportBusy).toBe(false);
  });

  it('clears stale failure state on a fresh successful run', async () => {
    server.use(
      http.get('/api/specialists/export', () =>
        HttpResponse.json({ error: 'first' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useSpecialistsExport());
    await act(async () => {
      await result.current.handleExport();
    });
    expect(result.current.exportFailed).toBe(true);
    server.use(
      http.get('/api/specialists/export', () =>
        HttpResponse.json({
          version: 1,
          exportedAt: '2026-05-11T09:00:00.000Z',
          sourceVersion: 2,
          specialists: [{ id: 'x' }],
        }),
      ),
    );
    await act(async () => {
      await result.current.handleExport();
    });
    expect(result.current.exportFailed).toBe(false);
    expect(result.current.exportMsg).toBeTruthy();
  });
});
