import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useMeetingTemplateEditor } from './use-meeting-template-editor';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeArgs(
  overrides: Partial<Parameters<typeof useMeetingTemplateEditor>[0]> = {},
): Parameters<typeof useMeetingTemplateEditor>[0] {
  return {
    open: true,
    tpl: null,
    onSaved: vi.fn(),
    onDeleted: vi.fn(),
    ...overrides,
  };
}

describe('useMeetingTemplateEditor', () => {
  it('starts with blank form when create mode (tpl=null) and open=true', () => {
    const { result } = renderHook(() => useMeetingTemplateEditor(makeArgs()));
    expect(result.current.name).toBe('');
    expect(result.current.task).toBe('');
    expect(result.current.track).toBe('');
    expect(result.current.description).toBe('');
    expect(result.current.busy).toBe(false);
    expect(result.current.failed).toBe(false);
  });

  it('seeds the form from tpl when edit mode', () => {
    const tpl = {
      name: 'Daily',
      task: 'standup',
      track: 'lightweight',
      description: '5min',
    };
    const { result } = renderHook(() =>
      useMeetingTemplateEditor(makeArgs({ tpl })),
    );
    expect(result.current.name).toBe('Daily');
    expect(result.current.task).toBe('standup');
    expect(result.current.track).toBe('lightweight');
    expect(result.current.description).toBe('5min');
  });

  it('does not re-seed the form when open=false', () => {
    const tpl = { name: 'X', task: 'y', track: 't', description: 'd' };
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useMeetingTemplateEditor(makeArgs({ tpl, open })),
      { initialProps: { open: false } },
    );
    expect(result.current.name).toBe('');
    rerender({ open: true });
    expect(result.current.name).toBe('X');
  });

  it('handleSave: rejects with failed=true when name or task is blank', async () => {
    let calls = 0;
    server.use(
      http.post('/api/meetings/templates', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() => useMeetingTemplateEditor(makeArgs()));
    await act(async () => {
      await result.current.handleSave();
    });
    expect(calls).toBe(0);
    expect(result.current.failed).toBe(true);
  });

  it('handleSave: POSTs the trimmed payload with optional track + description', async () => {
    let body: { name?: string; task?: string; track?: string; description?: string } | null = null;
    server.use(
      http.post('/api/meetings/templates', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useMeetingTemplateEditor(args));
    act(() => {
      result.current.setName('  Daily  ');
      result.current.setTask('  standup  ');
      result.current.setTrack('  lightweight  ');
      result.current.setDescription('  5min  ');
    });
    await act(async () => {
      await result.current.handleSave();
    });
    expect(body).toEqual({
      name: 'Daily',
      task: 'standup',
      track: 'lightweight',
      description: '5min',
    });
    expect(args.onSaved).toHaveBeenCalledTimes(1);
  });

  it('handleSave: omits track / description when blank', async () => {
    let body: { name?: string; task?: string; track?: string; description?: string } | null = null;
    server.use(
      http.post('/api/meetings/templates', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() => useMeetingTemplateEditor(makeArgs()));
    act(() => {
      result.current.setName('Daily');
      result.current.setTask('standup');
    });
    await act(async () => {
      await result.current.handleSave();
    });
    expect(body).toEqual({ name: 'Daily', task: 'standup' });
  });

  it('handleSave (edit + rename): upserts new + deletes the old name', async () => {
    let postCount = 0;
    let deletedName: string | null = null;
    server.use(
      http.post('/api/meetings/templates', () => {
        postCount++;
        return HttpResponse.json({ ok: true });
      }),
      http.delete('/api/meetings/templates/:name', ({ params }) => {
        deletedName = decodeURIComponent(params.name as string);
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs({
      tpl: { name: 'Old', task: 't', track: '', description: '' },
    });
    const { result } = renderHook(() => useMeetingTemplateEditor(args));
    act(() => {
      result.current.setName('New');  // rename
    });
    await act(async () => {
      await result.current.handleSave();
    });
    expect(postCount).toBe(1);
    expect(deletedName).toBe('Old');
    expect(args.onSaved).toHaveBeenCalledTimes(1);
  });

  it('handleSave (edit, same name): does NOT delete the old name', async () => {
    let deleteCount = 0;
    server.use(
      http.post('/api/meetings/templates', () => HttpResponse.json({ ok: true })),
      http.delete('/api/meetings/templates/:name', () => {
        deleteCount++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs({
      tpl: { name: 'Same', task: 'old', track: '', description: '' },
    });
    const { result } = renderHook(() => useMeetingTemplateEditor(args));
    act(() => {
      result.current.setTask('updated');  // same name, different task
    });
    await act(async () => {
      await result.current.handleSave();
    });
    expect(deleteCount).toBe(0);
  });

  it('handleSave: failed=true on POST error, onSaved not called', async () => {
    server.use(
      http.post('/api/meetings/templates', () =>
        HttpResponse.json({ error: 'invalid' }, { status: 400 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useMeetingTemplateEditor(args));
    act(() => {
      result.current.setName('Daily');
      result.current.setTask('standup');
    });
    await act(async () => {
      await result.current.handleSave();
    });
    expect(result.current.failed).toBe(true);
    expect(args.onSaved).not.toHaveBeenCalled();
  });

  it('handleDelete: noop when create mode (no originalName)', async () => {
    let calls = 0;
    server.use(
      http.delete('/api/meetings/templates/:name', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs({ tpl: null });
    const { result } = renderHook(() => useMeetingTemplateEditor(args));
    await act(async () => {
      await result.current.handleDelete();
    });
    expect(calls).toBe(0);
    expect(args.onDeleted).not.toHaveBeenCalled();
  });

  it('handleDelete: confirm-rejected skips DELETE', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    let calls = 0;
    server.use(
      http.delete('/api/meetings/templates/:name', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs({
      tpl: { name: 'X', task: 'y', track: '', description: '' },
    });
    const { result } = renderHook(() => useMeetingTemplateEditor(args));
    await act(async () => {
      await result.current.handleDelete();
    });
    expect(calls).toBe(0);
    expect(args.onDeleted).not.toHaveBeenCalled();
  });

  it('handleDelete: confirm-accepted DELETEs and calls onDeleted(name)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let path = '';
    server.use(
      http.delete('/api/meetings/templates/:name', ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs({
      tpl: { name: 'My Tmpl', task: 'y', track: '', description: '' },
    });
    const { result } = renderHook(() => useMeetingTemplateEditor(args));
    await act(async () => {
      await result.current.handleDelete();
    });
    expect(path).toContain('My%20Tmpl');
    expect(args.onDeleted).toHaveBeenCalledWith('My Tmpl');
  });
});
