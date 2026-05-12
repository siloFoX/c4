import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import {
  useSpecialistsImport,
  type ImportResult,
  type SpecialistsImportMode,
} from './use-specialists-import';

afterEach(() => {
  vi.restoreAllMocks();
});

type Args = Parameters<typeof useSpecialistsImport>[0];

function makeArgs(overrides: Partial<Args> = {}): Args {
  return {
    importMode: 'merge',
    onChange: vi.fn(),
    ...overrides,
  };
}

function makeBundleFile(payload: unknown, name = 'specialists.json'): File {
  return new File([JSON.stringify(payload)], name, { type: 'application/json' });
}

function importResult(over: Partial<ImportResult> = {}): ImportResult {
  return {
    mode: 'merge',
    dryRun: true,
    added: [],
    updated: [],
    removed: [],
    skipped: [],
    errors: [],
    ...over,
  };
}

describe('useSpecialistsImport', () => {
  it('starts idle: not busy, no preview, no bundle, no error', () => {
    const { result } = renderHook(() => useSpecialistsImport(makeArgs()));
    expect(result.current.importBusy).toBe(false);
    expect(result.current.importPreview).toBeNull();
    expect(result.current.importBundle).toBeNull();
    expect(result.current.importError).toBeNull();
  });

  it('exposes the documented surface (two callbacks + four state slots)', () => {
    const { result } = renderHook(() => useSpecialistsImport(makeArgs()));
    expect(typeof result.current.handleImportFile).toBe('function');
    expect(typeof result.current.handleImportApply).toBe('function');
    expect('importBusy' in result.current).toBe(true);
    expect('importPreview' in result.current).toBe(true);
    expect('importBundle' in result.current).toBe(true);
    expect('importError' in result.current).toBe(true);
  });

  it('handleImportFile: invalid JSON sets importError and never invokes fetch', async () => {
    let calls = 0;
    server.use(
      http.post('/api/specialists/import', () => {
        calls++;
        return HttpResponse.json(importResult());
      }),
    );
    const { result } = renderHook(() => useSpecialistsImport(makeArgs()));
    const bad = new File(['{ not actually json'], 'spec.json');
    await act(async () => {
      await result.current.handleImportFile(bad);
    });
    expect(calls).toBe(0);
    expect(result.current.importError).toBeTruthy();
    expect(result.current.importBundle).toBeNull();
    expect(result.current.importPreview).toBeNull();
    expect(result.current.importBusy).toBe(false);
  });

  it('handleImportFile: POSTs { bundle, mode, dryRun:true } to /api/specialists/import and stores preview + bundle', async () => {
    let body: { bundle?: unknown; mode?: string; dryRun?: boolean } | null = null;
    let path = '';
    server.use(
      http.post('/api/specialists/import', async ({ request }) => {
        body = (await request.json()) as typeof body;
        path = new URL(request.url).pathname;
        return HttpResponse.json(
          importResult({ added: ['a'], updated: ['b'], removed: ['c'] }),
        );
      }),
    );
    const args = makeArgs({ importMode: 'replace' });
    const { result } = renderHook(() => useSpecialistsImport(args));
    const payload = { specialists: [{ id: 'x' }] };
    await act(async () => {
      await result.current.handleImportFile(makeBundleFile(payload));
    });
    expect(path).toBe('/api/specialists/import');
    expect(body).toEqual({
      bundle: payload,
      mode: 'replace',
      dryRun: true,
    });
    expect(result.current.importBundle).toEqual(payload);
    expect(result.current.importPreview?.added).toEqual(['a']);
    expect(result.current.importPreview?.updated).toEqual(['b']);
    expect(result.current.importPreview?.removed).toEqual(['c']);
    expect(result.current.importError).toBeNull();
    expect(result.current.importBusy).toBe(false);
  });

  it('handleImportFile: server error sets importError and clears busy', async () => {
    server.use(
      http.post('/api/specialists/import', () =>
        HttpResponse.json({ error: 'broken' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useSpecialistsImport(makeArgs()));
    await act(async () => {
      await result.current.handleImportFile(makeBundleFile({ a: 1 }));
    });
    expect(result.current.importError).toBeTruthy();
    expect(result.current.importBusy).toBe(false);
    expect(result.current.importPreview).toBeNull();
  });

  it('handleImportFile: re-loading resets prior error + preview before posting', async () => {
    let first = true;
    server.use(
      http.post('/api/specialists/import', () => {
        if (first) {
          first = false;
          return HttpResponse.json({ error: 'no' }, { status: 500 });
        }
        return HttpResponse.json(importResult({ added: ['ok'] }));
      }),
    );
    const { result } = renderHook(() => useSpecialistsImport(makeArgs()));
    await act(async () => {
      await result.current.handleImportFile(makeBundleFile({ a: 1 }));
    });
    expect(result.current.importError).toBeTruthy();
    await act(async () => {
      await result.current.handleImportFile(makeBundleFile({ b: 2 }));
    });
    expect(result.current.importError).toBeNull();
    expect(result.current.importPreview?.added).toEqual(['ok']);
  });

  it('handleImportFile: importBusy=true while request is in-flight (release-gate)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    server.use(
      http.post('/api/specialists/import', async () => {
        await gate;
        return HttpResponse.json(importResult());
      }),
    );
    const { result } = renderHook(() => useSpecialistsImport(makeArgs()));
    let inflight: Promise<void> | undefined;
    act(() => {
      inflight = result.current.handleImportFile(makeBundleFile({ a: 1 }));
    });
    await waitFor(() => expect(result.current.importBusy).toBe(true));
    release();
    await act(async () => {
      await inflight!;
    });
    expect(result.current.importBusy).toBe(false);
  });

  it('handleImportFile: picks up the latest importMode after rerender', async () => {
    const bodies: Array<{ mode?: string }> = [];
    server.use(
      http.post('/api/specialists/import', async ({ request }) => {
        bodies.push((await request.json()) as { mode?: string });
        return HttpResponse.json(importResult());
      }),
    );
    const { result, rerender } = renderHook(
      ({ importMode }: { importMode: SpecialistsImportMode }) =>
        useSpecialistsImport(makeArgs({ importMode })),
      { initialProps: { importMode: 'merge' as SpecialistsImportMode } },
    );
    await act(async () => {
      await result.current.handleImportFile(makeBundleFile({}));
    });
    rerender({ importMode: 'replace' });
    await act(async () => {
      await result.current.handleImportFile(makeBundleFile({}));
    });
    expect(bodies.map((b) => b.mode)).toEqual(['merge', 'replace']);
  });

  it('handleImportApply: noop when no bundle has been parsed yet', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let calls = 0;
    server.use(
      http.post('/api/specialists/import', () => {
        calls++;
        return HttpResponse.json(importResult());
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSpecialistsImport(args));
    await act(async () => {
      await result.current.handleImportApply();
    });
    expect(calls).toBe(0);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(args.onChange).not.toHaveBeenCalled();
  });

  it('handleImportApply: confirm-rejected skips the apply fetch and onChange', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    let calls = 0;
    server.use(
      http.post('/api/specialists/import', () => {
        calls++;
        return HttpResponse.json(importResult({ added: ['a'] }));
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSpecialistsImport(args));
    await act(async () => {
      await result.current.handleImportFile(makeBundleFile({ a: 1 }));
    });
    expect(calls).toBe(1);
    await act(async () => {
      await result.current.handleImportApply();
    });
    expect(calls).toBe(1);
    expect(args.onChange).not.toHaveBeenCalled();
  });

  it('handleImportApply: confirm summary uses +added ~updated -removed counts from the preview', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.post('/api/specialists/import', async ({ request }) => {
        const b = (await request.json()) as { dryRun?: boolean };
        if (b.dryRun) {
          return HttpResponse.json(
            importResult({ added: ['a', 'b'], updated: ['c'], removed: ['d', 'e', 'f'] }),
          );
        }
        return HttpResponse.json(importResult({ dryRun: false }));
      }),
    );
    const { result } = renderHook(() => useSpecialistsImport(makeArgs()));
    await act(async () => {
      await result.current.handleImportFile(makeBundleFile({}));
    });
    await act(async () => {
      await result.current.handleImportApply();
    });
    const msg = confirmSpy.mock.calls[0]?.[0] ?? '';
    expect(msg).toContain('+2');
    expect(msg).toContain('~1');
    expect(msg).toContain('-3');
  });

  it('handleImportApply: confirm-accepted POSTs dryRun=false with the same bundle and calls onChange', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const bodies: Array<{ dryRun?: boolean; mode?: string; bundle?: unknown }> = [];
    server.use(
      http.post('/api/specialists/import', async ({ request }) => {
        const b = (await request.json()) as (typeof bodies)[number];
        bodies.push(b);
        if (b.dryRun) {
          return HttpResponse.json(importResult({ added: ['preview-only'] }));
        }
        return HttpResponse.json(
          importResult({ dryRun: false, added: ['applied-only'] }),
        );
      }),
    );
    const args = makeArgs({ importMode: 'merge' });
    const { result } = renderHook(() => useSpecialistsImport(args));
    const payload = { items: [] };
    await act(async () => {
      await result.current.handleImportFile(makeBundleFile(payload));
    });
    await act(async () => {
      await result.current.handleImportApply();
    });
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toEqual({ bundle: payload, mode: 'merge', dryRun: true });
    expect(bodies[1]).toEqual({ bundle: payload, mode: 'merge', dryRun: false });
    expect(args.onChange).toHaveBeenCalledTimes(1);
    expect(result.current.importPreview?.added).toEqual(['applied-only']);
    expect(result.current.importPreview?.dryRun).toBe(false);
  });

  it('handleImportApply: server error sets importError and skips onChange', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let n = 0;
    server.use(
      http.post('/api/specialists/import', () => {
        n++;
        if (n === 1) return HttpResponse.json(importResult({ added: ['a'] }));
        return HttpResponse.json({ error: 'boom' }, { status: 400 });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSpecialistsImport(args));
    await act(async () => {
      await result.current.handleImportFile(makeBundleFile({}));
    });
    await act(async () => {
      await result.current.handleImportApply();
    });
    expect(result.current.importError).toBeTruthy();
    expect(args.onChange).not.toHaveBeenCalled();
    expect(result.current.importBusy).toBe(false);
  });

  it('handleImportApply: importBusy=true while apply request is in-flight (release-gate)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let n = 0;
    server.use(
      http.post('/api/specialists/import', async () => {
        n++;
        if (n === 1) return HttpResponse.json(importResult());
        await gate;
        return HttpResponse.json(importResult({ dryRun: false }));
      }),
    );
    const { result } = renderHook(() => useSpecialistsImport(makeArgs()));
    await act(async () => {
      await result.current.handleImportFile(makeBundleFile({}));
    });
    let inflight: Promise<void> | undefined;
    act(() => {
      inflight = result.current.handleImportApply();
    });
    await waitFor(() => expect(result.current.importBusy).toBe(true));
    release();
    await act(async () => {
      await inflight!;
    });
    expect(result.current.importBusy).toBe(false);
  });
});
