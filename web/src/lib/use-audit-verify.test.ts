import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useAuditVerify } from './use-audit-verify';

// useAuditVerify hits GET /api/audit/verify (no query) when
// includeRotated=false and /api/audit/verify?includeRotated=1
// when true, then stores the {valid, corruptedAt, total,
// rotatedTotal} envelope. On non-OK or network error the hook
// stamps the {valid:false, corruptedAt:null, total:0,
// rotatedTotal:0} fallback so the banner always has data to
// render. We cover idle, both arg branches, the four-field
// happy path, the 5xx fallback, the network-error fallback,
// the busy slot, the no-internal-guard parallel call, and the
// mid-flight reset of stale verifyResult.

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAuditVerify', () => {
  it('starts idle: not busy, no result', () => {
    const { result } = renderHook(() => useAuditVerify());
    expect(result.current.verifyBusy).toBe(false);
    expect(result.current.verifyResult).toBeNull();
  });

  it('exposes handleVerify as a function', () => {
    const { result } = renderHook(() => useAuditVerify());
    expect(typeof result.current.handleVerify).toBe('function');
  });

  it('GETs /api/audit/verify (no query) when includeRotated=false', async () => {
    let path = '';
    let search = '';
    server.use(
      http.get('/api/audit/verify', ({ request }) => {
        const u = new URL(request.url);
        path = u.pathname;
        search = u.search;
        return HttpResponse.json({
          valid: true,
          corruptedAt: null,
          total: 10,
          rotatedTotal: 0,
        });
      }),
    );
    const { result } = renderHook(() => useAuditVerify());
    await act(async () => {
      await result.current.handleVerify(false);
    });
    expect(path).toBe('/api/audit/verify');
    expect(search).toBe('');
  });

  it('GETs /api/audit/verify?includeRotated=1 when includeRotated=true', async () => {
    let path = '';
    let params: URLSearchParams | null = null;
    server.use(
      http.get('/api/audit/verify', ({ request }) => {
        const u = new URL(request.url);
        path = u.pathname;
        params = u.searchParams;
        return HttpResponse.json({
          valid: true,
          corruptedAt: null,
          total: 10,
          rotatedTotal: 5,
        });
      }),
    );
    const { result } = renderHook(() => useAuditVerify());
    await act(async () => {
      await result.current.handleVerify(true);
    });
    expect(path).toBe('/api/audit/verify');
    expect(params?.get('includeRotated')).toBe('1');
  });

  it('happy path: stores the four-field result envelope verbatim', async () => {
    server.use(
      http.get('/api/audit/verify', () =>
        HttpResponse.json({
          valid: false,
          corruptedAt: 42,
          total: 100,
          rotatedTotal: 3,
        }),
      ),
    );
    const { result } = renderHook(() => useAuditVerify());
    await act(async () => {
      await result.current.handleVerify(true);
    });
    expect(result.current.verifyResult).toEqual({
      valid: false,
      corruptedAt: 42,
      total: 100,
      rotatedTotal: 3,
    });
    expect(result.current.verifyBusy).toBe(false);
  });

  it('5xx response stamps fallback { valid:false, corruptedAt:null, total:0, rotatedTotal:0 }', async () => {
    server.use(
      http.get('/api/audit/verify', () =>
        HttpResponse.json({ error: 'lock' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useAuditVerify());
    await act(async () => {
      await result.current.handleVerify(false);
    });
    expect(result.current.verifyResult).toEqual({
      valid: false,
      corruptedAt: null,
      total: 0,
      rotatedTotal: 0,
    });
    expect(result.current.verifyBusy).toBe(false);
  });

  it('network error stamps the same fallback envelope (no exception leaks)', async () => {
    server.use(http.get('/api/audit/verify', () => HttpResponse.error()));
    const { result } = renderHook(() => useAuditVerify());
    await act(async () => {
      await result.current.handleVerify(false);
    });
    expect(result.current.verifyResult).toEqual({
      valid: false,
      corruptedAt: null,
      total: 0,
      rotatedTotal: 0,
    });
    expect(result.current.verifyBusy).toBe(false);
  });

  it('flips verifyBusy=true while the request is in flight and back to false on resolve (busy slot)', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/audit/verify', async () => {
        await gate;
        return HttpResponse.json({
          valid: true,
          corruptedAt: null,
          total: 1,
          rotatedTotal: 0,
        });
      }),
    );
    const { result } = renderHook(() => useAuditVerify());
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleVerify(false);
      await Promise.resolve();
    });
    expect(result.current.verifyBusy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.verifyBusy).toBe(false);
  });

  it('a parallel call issued while the first is gated still fires a second GET (no internal guard)', async () => {
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/audit/verify', async () => {
        calls++;
        await gate;
        return HttpResponse.json({
          valid: true,
          corruptedAt: null,
          total: 0,
          rotatedTotal: 0,
        });
      }),
    );
    const { result } = renderHook(() => useAuditVerify());
    let first: Promise<void> | null = null;
    let second: Promise<void> | null = null;
    await act(async () => {
      first = result.current.handleVerify(false);
      await Promise.resolve();
    });
    expect(result.current.verifyBusy).toBe(true);
    expect(calls).toBe(1);
    await act(async () => {
      second = result.current.handleVerify(true);
      await Promise.resolve();
    });
    expect(calls).toBe(2);
    release();
    await act(async () => {
      await first;
      await second;
    });
    expect(result.current.verifyBusy).toBe(false);
  });

  it('clears stale verifyResult at the start of a fresh run (mid-flight reset)', async () => {
    server.use(
      http.get('/api/audit/verify', () =>
        HttpResponse.json({
          valid: false,
          corruptedAt: 7,
          total: 50,
          rotatedTotal: 1,
        }),
      ),
    );
    const { result } = renderHook(() => useAuditVerify());
    await act(async () => {
      await result.current.handleVerify(false);
    });
    expect(result.current.verifyResult).not.toBeNull();

    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/audit/verify', async () => {
        await gate;
        return HttpResponse.json({
          valid: true,
          corruptedAt: null,
          total: 0,
          rotatedTotal: 0,
        });
      }),
    );
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleVerify(false);
      await Promise.resolve();
    });
    // Mid-flight: stale result cleared, new result not yet landed.
    expect(result.current.verifyResult).toBeNull();
    expect(result.current.verifyBusy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.verifyResult).toEqual({
      valid: true,
      corruptedAt: null,
      total: 0,
      rotatedTotal: 0,
    });
  });
});
