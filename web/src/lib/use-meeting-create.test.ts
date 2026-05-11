import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useMeetingCreate } from './use-meeting-create';

function makeArgs(
  overrides: Partial<Parameters<typeof useMeetingCreate>[0]> = {},
): Parameters<typeof useMeetingCreate>[0] {
  return {
    newTask: 'do x',
    newTrack: 'auto',
    templateName: null,
    templateVars: {},
    setNewTask: vi.fn(),
    setTemplateName: vi.fn(),
    setTemplateVars: vi.fn(),
    onCreated: vi.fn(),
    ...overrides,
  };
}

describe('useMeetingCreate', () => {
  it('starts idle: not busy, no error', () => {
    const { result } = renderHook(() => useMeetingCreate(makeArgs()));
    expect(result.current.createBusy).toBe(false);
    expect(result.current.createError).toBeNull();
  });

  it('skips POST when both newTask and templateName are empty', async () => {
    let calls = 0;
    server.use(
      http.post('/api/meetings', () => {
        calls++;
        return HttpResponse.json({ id: 'm1' });
      }),
    );
    const args = makeArgs({ newTask: '', templateName: null });
    const { result } = renderHook(() => useMeetingCreate(args));
    await act(async () => {
      await result.current.handleCreate();
    });
    expect(calls).toBe(0);
    expect(args.onCreated).not.toHaveBeenCalled();
  });

  it('POSTs { task } trimmed, with no track key when newTrack=auto', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/meetings', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 'm1' });
      }),
    );
    const args = makeArgs({ newTask: '  do x  ', newTrack: 'auto' });
    const { result } = renderHook(() => useMeetingCreate(args));
    await act(async () => {
      await result.current.handleCreate();
    });
    expect(body).toEqual({ task: 'do x' });
    expect(args.onCreated).toHaveBeenCalledWith('m1');
  });

  it('forwards track when newTrack !== "auto"', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/meetings', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 'm2' });
      }),
    );
    const args = makeArgs({ newTask: 'x', newTrack: 'standard' });
    const { result } = renderHook(() => useMeetingCreate(args));
    await act(async () => {
      await result.current.handleCreate();
    });
    expect(body).toEqual({ task: 'x', track: 'standard' });
  });

  it('uses template branch when templateName is set (filters empty vars)', async () => {
    let body: { template?: string; vars?: Record<string, string>; task?: string } | null = null;
    server.use(
      http.post('/api/meetings', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ id: 'm3' });
      }),
    );
    const args = makeArgs({
      newTask: '',
      templateName: 'Daily',
      templateVars: { name: 'alice', empty: '' },
    });
    const { result } = renderHook(() => useMeetingCreate(args));
    await act(async () => {
      await result.current.handleCreate();
    });
    expect(body?.template).toBe('Daily');
    expect(body?.vars).toEqual({ name: 'alice' });
    expect(body?.task).toBeUndefined();
  });

  it('omits the vars key entirely when no template var has a value', async () => {
    let body: { template?: string; vars?: Record<string, string> } | null = null;
    server.use(
      http.post('/api/meetings', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ id: 'm4' });
      }),
    );
    const args = makeArgs({
      templateName: 'T1',
      templateVars: { x: '', y: '' },
    });
    const { result } = renderHook(() => useMeetingCreate(args));
    await act(async () => {
      await result.current.handleCreate();
    });
    expect(body?.template).toBe('T1');
    expect(body?.vars).toBeUndefined();
  });

  it('resets the form + calls onCreated(id) on success', async () => {
    server.use(
      http.post('/api/meetings', () => HttpResponse.json({ id: 'm5' })),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useMeetingCreate(args));
    await act(async () => {
      await result.current.handleCreate();
    });
    expect(args.setNewTask).toHaveBeenCalledWith('');
    expect(args.setTemplateName).toHaveBeenCalledWith(null);
    expect(args.setTemplateVars).toHaveBeenCalledWith({});
    expect(args.onCreated).toHaveBeenCalledWith('m5');
  });

  it('surfaces createError and does NOT reset the form on server failure', async () => {
    server.use(
      http.post('/api/meetings', () =>
        HttpResponse.json({ error: 'invalid' }, { status: 400 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useMeetingCreate(args));
    await act(async () => {
      await result.current.handleCreate();
    });
    expect(result.current.createError).toBeTruthy();
    expect(args.setNewTask).not.toHaveBeenCalled();
    expect(args.onCreated).not.toHaveBeenCalled();
  });

  it('exposes setCreateError so the parent can clear errors', () => {
    const { result } = renderHook(() => useMeetingCreate(makeArgs()));
    act(() => result.current.setCreateError('foo'));
    expect(result.current.createError).toBe('foo');
    act(() => result.current.setCreateError(null));
    expect(result.current.createError).toBeNull();
  });
});
