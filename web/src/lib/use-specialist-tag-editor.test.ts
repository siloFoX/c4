import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useSpecialistTagEditor } from './use-specialist-tag-editor';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeArgs(
  overrides: Partial<Parameters<typeof useSpecialistTagEditor>[0]> = {},
): Parameters<typeof useSpecialistTagEditor>[0] {
  return {
    specialistId: 's1',
    onSaved: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

describe('useSpecialistTagEditor', () => {
  it('starts idle: closed, empty value, not busy', () => {
    const { result } = renderHook(() => useSpecialistTagEditor(makeArgs()));
    expect(result.current.open).toBe(false);
    expect(result.current.value).toBe('');
    expect(result.current.busy).toBe(false);
  });

  it('setOpen exposes the open setter so the JSX can close via cancel', () => {
    const { result } = renderHook(() => useSpecialistTagEditor(makeArgs()));
    act(() => result.current.setOpen(true));
    expect(result.current.open).toBe(true);
    act(() => result.current.setOpen(false));
    expect(result.current.open).toBe(false);
  });

  it('setValue exposes the value setter so the input can write into it', () => {
    const { result } = renderHook(() => useSpecialistTagEditor(makeArgs()));
    act(() => result.current.setValue('foo,bar'));
    expect(result.current.value).toBe('foo,bar');
  });

  it('toggleWithTags(undefined) opens and clears the value', () => {
    const { result } = renderHook(() => useSpecialistTagEditor(makeArgs()));
    act(() => result.current.toggleWithTags(undefined));
    expect(result.current.open).toBe(true);
    expect(result.current.value).toBe('');
  });

  it('toggleWithTags(tags[]) opens and prefills value as comma-joined string', () => {
    const { result } = renderHook(() => useSpecialistTagEditor(makeArgs()));
    act(() => result.current.toggleWithTags(['alpha', 'beta']));
    expect(result.current.open).toBe(true);
    expect(result.current.value).toBe('alpha, beta');
  });

  it('toggleWithTags is a toggle: a second call flips open back to false', () => {
    const { result } = renderHook(() => useSpecialistTagEditor(makeArgs()));
    act(() => result.current.toggleWithTags(['a']));
    expect(result.current.open).toBe(true);
    act(() => result.current.toggleWithTags(['a']));
    expect(result.current.open).toBe(false);
  });

  it('handleSave: blank value is a noop (no PATCH, onSaved not called)', async () => {
    let calls = 0;
    server.use(
      http.patch('/api/specialists/:id/tags', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSpecialistTagEditor(args));
    act(() => result.current.setValue('   '));
    await act(async () => {
      await result.current.handleSave();
    });
    expect(calls).toBe(0);
    expect(args.onSaved).not.toHaveBeenCalled();
  });

  it('handleSave: empty replace (only commas + whitespace) is guarded -- no PATCH', async () => {
    let calls = 0;
    server.use(
      http.patch('/api/specialists/:id/tags', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSpecialistTagEditor(args));
    act(() => result.current.setValue(' , , '));
    await act(async () => {
      await result.current.handleSave();
    });
    expect(calls).toBe(0);
    expect(args.onSaved).not.toHaveBeenCalled();
  });

  it('handleSave (replace mode): PATCHes trimmed/filtered tags, clears value + closes', async () => {
    let body: { tags?: string[]; mode?: string } | null = null;
    let capturedPath = '';
    server.use(
      http.patch('/api/specialists/:id/tags', async ({ request }) => {
        body = (await request.json()) as typeof body;
        capturedPath = new URL(request.url).pathname;
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSpecialistTagEditor(args));
    act(() => {
      result.current.setOpen(true);
      result.current.setValue(' foo , , bar ');
    });
    await act(async () => {
      await result.current.handleSave();
    });
    expect(body).toEqual({ tags: ['foo', 'bar'], mode: 'replace' });
    expect(capturedPath).toBe('/api/specialists/s1/tags');
    expect(result.current.value).toBe('');
    expect(result.current.open).toBe(false);
    expect(args.onSaved).toHaveBeenCalledTimes(1);
  });

  it('handleSave (add mode): +-prefix strips the marker and sets mode=add', async () => {
    let body: { tags?: string[]; mode?: string } | null = null;
    server.use(
      http.patch('/api/specialists/:id/tags', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() => useSpecialistTagEditor(makeArgs()));
    act(() => result.current.setValue('+gamma,delta'));
    await act(async () => {
      await result.current.handleSave();
    });
    expect(body).toEqual({ tags: ['gamma', 'delta'], mode: 'add' });
  });

  it('handleSave (remove mode): --prefix strips the marker and sets mode=remove', async () => {
    let body: { tags?: string[]; mode?: string } | null = null;
    server.use(
      http.patch('/api/specialists/:id/tags', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() => useSpecialistTagEditor(makeArgs()));
    act(() => result.current.setValue('-stale'));
    await act(async () => {
      await result.current.handleSave();
    });
    expect(body).toEqual({ tags: ['stale'], mode: 'remove' });
  });

  it('handleSave: URL-encodes the specialistId so reserved chars survive', async () => {
    let capturedPath = '';
    server.use(
      http.patch('/api/specialists/:id/tags', ({ request }) => {
        // Use the raw URL pathname -- MSW decodes :id when populating
        // params, so we'd lose the %2F / %20 evidence otherwise.
        capturedPath = new URL(request.url).pathname;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() =>
      useSpecialistTagEditor(makeArgs({ specialistId: 'a/b c' })),
    );
    act(() => result.current.setValue('x'));
    await act(async () => {
      await result.current.handleSave();
    });
    expect(capturedPath).toContain('a%2Fb%20c');
  });

  it('handleSave: server error -> onError with formatted message; value/open preserved', async () => {
    server.use(
      http.patch('/api/specialists/:id/tags', () =>
        HttpResponse.json({ error: 'tag limit' }, { status: 400 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSpecialistTagEditor(args));
    act(() => {
      result.current.setOpen(true);
      result.current.setValue('x');
    });
    await act(async () => {
      await result.current.handleSave();
    });
    expect(args.onError).toHaveBeenCalledTimes(1);
    const msg = (args.onError as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(msg).toContain('tag edit:');
    expect(args.onSaved).not.toHaveBeenCalled();
    // Failure leaves the form open with its value so the user can fix + retry.
    expect(result.current.value).toBe('x');
    expect(result.current.open).toBe(true);
  });

  it('handleSave: blank Error.message falls back to common.failed copy', async () => {
    // Throw an Error with an empty message so the `|| t("common.failed")`
    // branch of tFormat fires. We patch the global fetch directly because
    // MSW will not produce a thrown Error with a blank message.
    const orig = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error(''));
    try {
      const args = makeArgs();
      const { result } = renderHook(() => useSpecialistTagEditor(args));
      act(() => result.current.setValue('x'));
      await act(async () => {
        await result.current.handleSave();
      });
      expect(args.onError).toHaveBeenCalledTimes(1);
      const msg = (args.onError as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(msg).toContain('failed');
    } finally {
      global.fetch = orig;
    }
  });

  it('handleSave: busy flips true during the in-flight PATCH, back to false on resolve', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.patch('/api/specialists/:id/tags', async () => {
        await gate;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() => useSpecialistTagEditor(makeArgs()));
    act(() => result.current.setValue('x'));
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleSave();
      await Promise.resolve();
    });
    expect(result.current.busy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.busy).toBe(false);
  });

  it('handleSave: busy returns to false on error path (finally block)', async () => {
    server.use(
      http.patch('/api/specialists/:id/tags', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useSpecialistTagEditor(makeArgs()));
    act(() => result.current.setValue('x'));
    await act(async () => {
      await result.current.handleSave();
    });
    expect(result.current.busy).toBe(false);
  });
});
