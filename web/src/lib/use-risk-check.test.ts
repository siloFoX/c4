import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useRiskCheck } from './use-risk-check';
import type { CheckResponse } from '../pages/Risk';

// useRiskCheck owns the Risk page classifier check call. The hook
// POSTs /api/risk/check with { command, includeInspected } using
// the trimmed command, short-circuits when the command is empty,
// flips the busy gate around the in-flight request, clears stale
// result + error before each new attempt, and surfaces HTTP error
// messages on failure.

const happyPayload: CheckResponse = {
  level: 'low',
  suggestedAction: 'allow',
  reasons: [],
  decoded: null,
  denyForced: false,
  wouldDeny: false,
  autoDenyLevel: 'critical',
  enforcementEnabled: true,
};

describe('useRiskCheck', () => {
  it('starts idle: busy=false, result=null, error=null, runCheck is a function', () => {
    const { result } = renderHook(() =>
      useRiskCheck({ command: 'ls', includeInspected: false }),
    );
    expect(result.current.checkBusy).toBe(false);
    expect(result.current.checkResult).toBeNull();
    expect(result.current.checkError).toBeNull();
    expect(typeof result.current.runCheck).toBe('function');
  });

  it('short-circuits when command is empty: no POST, no state change', async () => {
    let hits = 0;
    server.use(
      http.post('/api/risk/check', () => {
        hits++;
        return HttpResponse.json(happyPayload);
      }),
    );
    const { result } = renderHook(() =>
      useRiskCheck({ command: '', includeInspected: false }),
    );
    await act(async () => {
      await result.current.runCheck();
    });
    expect(hits).toBe(0);
    expect(result.current.checkBusy).toBe(false);
    expect(result.current.checkResult).toBeNull();
    expect(result.current.checkError).toBeNull();
  });

  it('short-circuits when command is whitespace-only', async () => {
    let hits = 0;
    server.use(
      http.post('/api/risk/check', () => {
        hits++;
        return HttpResponse.json(happyPayload);
      }),
    );
    const { result } = renderHook(() =>
      useRiskCheck({ command: '   ', includeInspected: false }),
    );
    await act(async () => {
      await result.current.runCheck();
    });
    expect(hits).toBe(0);
  });

  it('happy path: POSTs { command: trimmed, includeInspected } and stores the result', async () => {
    let receivedBody: { command?: string; includeInspected?: boolean } | null =
      null;
    server.use(
      http.post('/api/risk/check', async ({ request }) => {
        receivedBody = (await request.json()) as typeof receivedBody;
        return HttpResponse.json(happyPayload);
      }),
    );
    const { result } = renderHook(() =>
      useRiskCheck({ command: '  rm -rf /tmp/x  ', includeInspected: true }),
    );
    await act(async () => {
      await result.current.runCheck();
    });
    expect(receivedBody).toEqual({
      command: 'rm -rf /tmp/x',
      includeInspected: true,
    });
    expect(result.current.checkResult).toEqual(happyPayload);
    expect(result.current.checkError).toBeNull();
    expect(result.current.checkBusy).toBe(false);
  });

  it('forwards includeInspected=false verbatim', async () => {
    let receivedBody: { includeInspected?: boolean } | null = null;
    server.use(
      http.post('/api/risk/check', async ({ request }) => {
        receivedBody = (await request.json()) as typeof receivedBody;
        return HttpResponse.json(happyPayload);
      }),
    );
    const { result } = renderHook(() =>
      useRiskCheck({ command: 'ls', includeInspected: false }),
    );
    await act(async () => {
      await result.current.runCheck();
    });
    expect(receivedBody?.includeInspected).toBe(false);
  });

  it('error path: surfaces the HTTP message on a 500 response', async () => {
    server.use(
      http.post('/api/risk/check', () =>
        HttpResponse.json({ error: 'kaboom' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() =>
      useRiskCheck({ command: 'ls', includeInspected: false }),
    );
    await act(async () => {
      await result.current.runCheck();
    });
    expect(result.current.checkError).toBeTruthy();
    expect(result.current.checkError).toContain('HTTP 500');
    expect(result.current.checkResult).toBeNull();
    expect(result.current.checkBusy).toBe(false);
  });

  it('clears stale error before a re-run', async () => {
    // First call fails.
    server.use(
      http.post('/api/risk/check', () =>
        HttpResponse.json({ error: 'first' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() =>
      useRiskCheck({ command: 'ls', includeInspected: false }),
    );
    await act(async () => {
      await result.current.runCheck();
    });
    expect(result.current.checkError).toBeTruthy();

    // Second call: gated + happy. Mid-flight, error must already be cleared.
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/risk/check', async () => {
        await gate;
        return HttpResponse.json(happyPayload);
      }),
    );
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.runCheck();
      await Promise.resolve();
    });
    expect(result.current.checkError).toBeNull();
    expect(result.current.checkResult).toBeNull();
    release();
    await act(async () => {
      await inflight;
    });
  });

  it('clears stale result before a re-run', async () => {
    server.use(
      http.post('/api/risk/check', () => HttpResponse.json(happyPayload)),
    );
    const { result } = renderHook(() =>
      useRiskCheck({ command: 'ls', includeInspected: false }),
    );
    await act(async () => {
      await result.current.runCheck();
    });
    expect(result.current.checkResult).toEqual(happyPayload);

    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/risk/check', async () => {
        await gate;
        return HttpResponse.json(happyPayload);
      }),
    );
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.runCheck();
      await Promise.resolve();
    });
    expect(result.current.checkResult).toBeNull();
    release();
    await act(async () => {
      await inflight;
    });
  });

  it('flips busy=true during in-flight POST then back to false on success', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/risk/check', async () => {
        await gate;
        return HttpResponse.json(happyPayload);
      }),
    );
    const { result } = renderHook(() =>
      useRiskCheck({ command: 'ls', includeInspected: false }),
    );
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.runCheck();
      await Promise.resolve();
    });
    expect(result.current.checkBusy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.checkBusy).toBe(false);
  });

  it('busy returns to false even when the call errors', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/risk/check', async () => {
        await gate;
        return HttpResponse.json({ error: 'no' }, { status: 503 });
      }),
    );
    const { result } = renderHook(() =>
      useRiskCheck({ command: 'ls', includeInspected: false }),
    );
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.runCheck();
      await Promise.resolve();
    });
    expect(result.current.checkBusy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.checkBusy).toBe(false);
    expect(result.current.checkError).toBeTruthy();
  });

  it('uses the current command at runCheck time (post-rerender)', async () => {
    let received: string | undefined;
    server.use(
      http.post('/api/risk/check', async ({ request }) => {
        const body = (await request.json()) as { command?: string };
        received = body.command;
        return HttpResponse.json(happyPayload);
      }),
    );
    const { result, rerender } = renderHook(
      ({ cmd }: { cmd: string }) =>
        useRiskCheck({ command: cmd, includeInspected: false }),
      { initialProps: { cmd: 'first' } },
    );
    await act(async () => {
      await result.current.runCheck();
    });
    expect(received).toBe('first');
    rerender({ cmd: 'second' });
    await act(async () => {
      await result.current.runCheck();
    });
    expect(received).toBe('second');
  });

  it('runCheck reference changes when command changes (useCallback dep)', () => {
    const { result, rerender } = renderHook(
      ({ cmd }: { cmd: string }) =>
        useRiskCheck({ command: cmd, includeInspected: false }),
      { initialProps: { cmd: 'a' } },
    );
    const first = result.current.runCheck;
    rerender({ cmd: 'b' });
    expect(result.current.runCheck).not.toBe(first);
  });

  it('runCheck reference changes when includeInspected toggles (useCallback dep)', () => {
    const { result, rerender } = renderHook(
      ({ flag }: { flag: boolean }) =>
        useRiskCheck({ command: 'ls', includeInspected: flag }),
      { initialProps: { flag: false } },
    );
    const first = result.current.runCheck;
    rerender({ flag: true });
    expect(result.current.runCheck).not.toBe(first);
  });
});
