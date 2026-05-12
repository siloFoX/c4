import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useAuditExport } from './use-audit-export';
import type { AuditWindow } from './use-specialists-audit';

// useAuditExport hits GET /api/audit/export with `from` derived
// from the current auditWindow and forces `lineEnd=crlf`. The
// CSV body is piped through a blob -> anchor.click() -> revoke
// dance. Failures are silent (no banner surface), so the only
// externally observable failure signal is exportAuditBusy
// returning to false with no anchor having been clicked.

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
  vi.useRealTimers();
});

describe('useAuditExport', () => {
  it('starts idle: not busy', () => {
    const { result } = renderHook(() => useAuditExport({ auditWindow: 'all' }));
    expect(result.current.exportAuditBusy).toBe(false);
  });

  it('exposes handleAuditExport as a function', () => {
    const { result } = renderHook(() => useAuditExport({ auditWindow: 'all' }));
    expect(typeof result.current.handleAuditExport).toBe('function');
  });

  it('GETs /api/audit/export with lineEnd=crlf and no `from` when auditWindow=all', async () => {
    let path = '';
    let params: URLSearchParams | null = null;
    server.use(
      http.get('/api/audit/export', ({ request }) => {
        const u = new URL(request.url);
        path = u.pathname;
        params = u.searchParams;
        return new HttpResponse('csv-payload', {
          headers: { 'content-type': 'text/csv' },
        });
      }),
    );
    const { result } = renderHook(() => useAuditExport({ auditWindow: 'all' }));
    await act(async () => {
      await result.current.handleAuditExport();
    });
    expect(path).toBe('/api/audit/export');
    expect(params?.get('lineEnd')).toBe('crlf');
    expect(params?.get('from')).toBeNull();
  });

  it.each<{ auditWindow: AuditWindow; hours: number }>([
    { auditWindow: '1h', hours: 1 },
    { auditWindow: '24h', hours: 24 },
    { auditWindow: '7d', hours: 24 * 7 },
  ])(
    'attaches from = now - $hours hours when auditWindow=$auditWindow',
    async ({ auditWindow, hours }) => {
      const fixed = new Date('2026-05-12T00:00:00.000Z').getTime();
      vi.useFakeTimers();
      vi.setSystemTime(fixed);
      let captured: URLSearchParams | null = null;
      server.use(
        http.get('/api/audit/export', ({ request }) => {
          captured = new URL(request.url).searchParams;
          return new HttpResponse('csv', {
            headers: { 'content-type': 'text/csv' },
          });
        }),
      );
      const { result } = renderHook(() => useAuditExport({ auditWindow }));
      await act(async () => {
        await result.current.handleAuditExport();
      });
      expect(captured?.get('from')).toBe(
        new Date(fixed - hours * 3600 * 1000).toISOString(),
      );
      expect(captured?.get('lineEnd')).toBe('crlf');
      vi.useRealTimers();
    },
  );

  it('downloads via an anchor click with a window-tagged sanitized filename and revokes the object URL', async () => {
    server.use(
      http.get(
        '/api/audit/export',
        () =>
          new HttpResponse('a,b,c\r\n', {
            headers: { 'content-type': 'text/csv' },
          }),
      ),
    );
    const { result } = renderHook(() => useAuditExport({ auditWindow: '24h' }));
    await act(async () => {
      await result.current.handleAuditExport();
    });
    expect(objectUrls).toHaveLength(1);
    expect(created).toHaveLength(1);
    expect(created[0]?.href).toBe(objectUrls[0]?.url);
    expect(created[0]?.clickCount).toBe(1);
    expect(created[0]?.download).toMatch(/^c4-audit-24h-/);
    expect(created[0]?.download).toMatch(/\.csv$/);
    // colons and dots in the ISO timestamp must be sanitized to dashes
    // (the trailing `.csv` extension is the only legitimate dot).
    const stem = created[0]!.download.replace(/\.csv$/, '');
    expect(stem).not.toMatch(/[:.]/);
    expect(objectUrls[0]?.revoked).toBe(true);
  });

  it('silently swallows a server error: no anchor click, no object URL, busy flips back', async () => {
    server.use(
      http.get('/api/audit/export', () =>
        HttpResponse.json({ error: 'denied' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useAuditExport({ auditWindow: 'all' }));
    await act(async () => {
      await result.current.handleAuditExport();
    });
    expect(result.current.exportAuditBusy).toBe(false);
    expect(created).toHaveLength(0);
    expect(objectUrls).toHaveLength(0);
  });

  it('flips exportAuditBusy=true while the request is in flight and back to false on resolve (busy slot)', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/audit/export', async () => {
        await gate;
        return new HttpResponse('csv', {
          headers: { 'content-type': 'text/csv' },
        });
      }),
    );
    const { result } = renderHook(() => useAuditExport({ auditWindow: 'all' }));
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleAuditExport();
      await Promise.resolve();
    });
    expect(result.current.exportAuditBusy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.exportAuditBusy).toBe(false);
  });

  it('a parallel call issued while the first is gated still fires a second GET (no internal guard)', async () => {
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/audit/export', async () => {
        calls++;
        await gate;
        return new HttpResponse('csv', {
          headers: { 'content-type': 'text/csv' },
        });
      }),
    );
    const { result } = renderHook(() => useAuditExport({ auditWindow: 'all' }));
    let first: Promise<void> | null = null;
    let second: Promise<void> | null = null;
    await act(async () => {
      first = result.current.handleAuditExport();
      await Promise.resolve();
    });
    expect(result.current.exportAuditBusy).toBe(true);
    expect(calls).toBe(1);
    await act(async () => {
      second = result.current.handleAuditExport();
      await Promise.resolve();
    });
    expect(calls).toBe(2);
    release();
    await act(async () => {
      await first;
      await second;
    });
    expect(result.current.exportAuditBusy).toBe(false);
  });

  it('rerender with a new auditWindow makes the next call use the new window (cross-selection effect)', async () => {
    let lastParams: URLSearchParams | null = null;
    server.use(
      http.get('/api/audit/export', ({ request }) => {
        lastParams = new URL(request.url).searchParams;
        return new HttpResponse('csv', {
          headers: { 'content-type': 'text/csv' },
        });
      }),
    );
    const { result, rerender } = renderHook(
      ({ w }: { w: AuditWindow }) => useAuditExport({ auditWindow: w }),
      { initialProps: { w: 'all' as AuditWindow } },
    );
    await act(async () => {
      await result.current.handleAuditExport();
    });
    expect(lastParams?.get('from')).toBeNull();
    expect(created[0]?.download).toMatch(/^c4-audit-all-/);
    rerender({ w: '1h' });
    await act(async () => {
      await result.current.handleAuditExport();
    });
    expect(lastParams?.get('from')).not.toBeNull();
    expect(created[1]?.download).toMatch(/^c4-audit-1h-/);
  });
});
