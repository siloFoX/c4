import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useRiskSandboxPreview } from './use-risk-sandbox-preview';

// useRiskSandboxPreview owns the sandbox-preview busy/result/error
// triplet behind the Risk page's "what would the sandbox do?"
// button. POSTs /api/risk/preview with the trimmed command; refuses
// the call when the command is blank. Resets sandbox + error at the
// start of each call so a fresh run is not contaminated by a
// previous failure.

describe('useRiskSandboxPreview', () => {
  it('starts idle: busy=false, sandbox=null, error=null', () => {
    const { result } = renderHook(() =>
      useRiskSandboxPreview({ command: 'ls' }),
    );
    expect(result.current.sandboxBusy).toBe(false);
    expect(result.current.sandbox).toBeNull();
    expect(result.current.sandboxError).toBeNull();
    expect(typeof result.current.runPreview).toBe('function');
  });

  it('short-circuits when command is empty: no POST, no state change', async () => {
    let hits = 0;
    server.use(
      http.post('/api/risk/preview', () => {
        hits++;
        return HttpResponse.json({});
      }),
    );
    const { result } = renderHook(() =>
      useRiskSandboxPreview({ command: '' }),
    );
    await act(async () => {
      await result.current.runPreview();
    });
    expect(hits).toBe(0);
    expect(result.current.sandboxBusy).toBe(false);
    expect(result.current.sandbox).toBeNull();
    expect(result.current.sandboxError).toBeNull();
  });

  it('short-circuits when command is whitespace-only', async () => {
    let hits = 0;
    server.use(
      http.post('/api/risk/preview', () => {
        hits++;
        return HttpResponse.json({});
      }),
    );
    const { result } = renderHook(() =>
      useRiskSandboxPreview({ command: '   ' }),
    );
    await act(async () => {
      await result.current.runPreview();
    });
    expect(hits).toBe(0);
  });

  it('happy path: POSTs the trimmed command and stores the response', async () => {
    let receivedBody: { command?: string } | null = null;
    const payload = {
      binary: 'docker',
      args: ['run', '--rm'],
      env: {},
      command: 'ls',
      isolation: {
        name: 'docker',
        network: 'none',
        filesystem: 'ro',
        resources: 'limited',
      },
      available: { ok: true, reason: null },
      runtime: 'docker',
    };
    server.use(
      http.post('/api/risk/preview', async ({ request }) => {
        receivedBody = (await request.json()) as { command?: string };
        return HttpResponse.json(payload);
      }),
    );
    const { result } = renderHook(() =>
      useRiskSandboxPreview({ command: '  ls  ' }),
    );
    await act(async () => {
      await result.current.runPreview();
    });
    expect(receivedBody).toEqual({ command: 'ls' });
    expect(result.current.sandbox).toEqual(payload);
    expect(result.current.sandboxError).toBeNull();
    expect(result.current.sandboxBusy).toBe(false);
  });

  it('error path: surfaces the HTTP message on a 500 response', async () => {
    server.use(
      http.post('/api/risk/preview', () =>
        HttpResponse.json({ error: 'kaboom' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() =>
      useRiskSandboxPreview({ command: 'ls' }),
    );
    await act(async () => {
      await result.current.runPreview();
    });
    expect(result.current.sandboxError).toBeTruthy();
    expect(result.current.sandboxError).toContain('HTTP 500');
    expect(result.current.sandbox).toBeNull();
    expect(result.current.sandboxBusy).toBe(false);
  });

  it('clears stale error before re-running runPreview', async () => {
    // First call fails.
    server.use(
      http.post('/api/risk/preview', () =>
        HttpResponse.json({ error: 'first' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() =>
      useRiskSandboxPreview({ command: 'ls' }),
    );
    await act(async () => {
      await result.current.runPreview();
    });
    expect(result.current.sandboxError).toBeTruthy();

    // Second call: server is now slow + happy. Mid-flight, error must
    // already be cleared by the runPreview() prelude.
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/risk/preview', async () => {
        await gate;
        return HttpResponse.json({
          binary: null,
          args: [],
          env: {},
          command: 'ls',
          isolation: {
            name: 'null',
            network: '-',
            filesystem: '-',
            resources: '-',
          },
          available: { ok: true, reason: null },
          runtime: 'null',
        });
      }),
    );
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.runPreview();
      await Promise.resolve();
    });
    expect(result.current.sandboxError).toBeNull();
    expect(result.current.sandbox).toBeNull();
    release();
    await act(async () => {
      await inflight;
    });
  });

  it('flips busy=true while in-flight and back to false after resolve', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/risk/preview', async () => {
        await gate;
        return HttpResponse.json({
          binary: null,
          args: [],
          env: {},
          command: 'ls',
          isolation: {
            name: 'null',
            network: '-',
            filesystem: '-',
            resources: '-',
          },
          available: { ok: true, reason: null },
          runtime: 'null',
        });
      }),
    );
    const { result } = renderHook(() =>
      useRiskSandboxPreview({ command: 'ls' }),
    );
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.runPreview();
      await Promise.resolve();
    });
    expect(result.current.sandboxBusy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.sandboxBusy).toBe(false);
  });

  it('flips busy=true then back even when the call errors', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/risk/preview', async () => {
        await gate;
        return HttpResponse.json({ error: 'no' }, { status: 503 });
      }),
    );
    const { result } = renderHook(() =>
      useRiskSandboxPreview({ command: 'ls' }),
    );
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.runPreview();
      await Promise.resolve();
    });
    expect(result.current.sandboxBusy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.sandboxBusy).toBe(false);
    expect(result.current.sandboxError).toBeTruthy();
  });

  it('clears stale sandbox result before a re-run', async () => {
    const first = {
      binary: 'docker',
      args: ['a'],
      env: {},
      command: 'ls',
      isolation: {
        name: 'docker',
        network: 'none',
        filesystem: 'ro',
        resources: 'lim',
      },
      available: { ok: true, reason: null },
      runtime: 'docker',
    };
    server.use(
      http.post('/api/risk/preview', () => HttpResponse.json(first)),
    );
    const { result, rerender } = renderHook(
      ({ cmd }: { cmd: string }) => useRiskSandboxPreview({ command: cmd }),
      { initialProps: { cmd: 'ls' } },
    );
    await act(async () => {
      await result.current.runPreview();
    });
    expect(result.current.sandbox).toEqual(first);

    // Second call is gated; mid-flight, sandbox must already be null.
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/risk/preview', async () => {
        await gate;
        return HttpResponse.json(first);
      }),
    );
    rerender({ cmd: 'whoami' });
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.runPreview();
      await Promise.resolve();
    });
    expect(result.current.sandbox).toBeNull();
    release();
    await act(async () => {
      await inflight;
    });
  });

  it('rerender with a new command uses the new value on the next call', async () => {
    let received: string | undefined;
    server.use(
      http.post('/api/risk/preview', async ({ request }) => {
        const body = (await request.json()) as { command?: string };
        received = body.command;
        return HttpResponse.json({
          binary: null,
          args: [],
          env: {},
          command: body.command ?? '',
          isolation: {
            name: 'null',
            network: '-',
            filesystem: '-',
            resources: '-',
          },
          available: { ok: true, reason: null },
          runtime: 'null',
        });
      }),
    );
    const { result, rerender } = renderHook(
      ({ cmd }: { cmd: string }) => useRiskSandboxPreview({ command: cmd }),
      { initialProps: { cmd: 'first' } },
    );
    await act(async () => {
      await result.current.runPreview();
    });
    expect(received).toBe('first');
    rerender({ cmd: 'second' });
    await act(async () => {
      await result.current.runPreview();
    });
    expect(received).toBe('second');
  });

  it('runPreview reference changes when command changes (useCallback dep)', () => {
    const { result, rerender } = renderHook(
      ({ cmd }: { cmd: string }) => useRiskSandboxPreview({ command: cmd }),
      { initialProps: { cmd: 'a' } },
    );
    const first = result.current.runPreview;
    rerender({ cmd: 'b' });
    expect(result.current.runPreview).not.toBe(first);
  });
});
