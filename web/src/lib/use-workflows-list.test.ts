import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useWorkflowsList } from './use-workflows-list';
import type { Workflow } from '../components/WorkflowEditor';

// useWorkflowsList wires `refresh` through a useCallback that depends on
// `getSelectedId` + `onAutoSelect`, and a useEffect that re-fires on every
// new `refresh` identity. Inline `() => null` / `vi.fn()` recreated each
// render would loop forever, so every test builds args ONCE outside the
// renderHook callback.

function makeWorkflow(id: string, overrides: Partial<Workflow> = {}): Workflow {
  return {
    id,
    name: `WF ${id}`,
    description: '',
    nodes: [],
    edges: [],
    enabled: true,
    createdAt: '2026-05-11T00:00:00.000Z',
    updatedAt: '2026-05-11T00:00:00.000Z',
    ...overrides,
  };
}

function makeArgs(
  overrides: Partial<Parameters<typeof useWorkflowsList>[0]> = {},
): Parameters<typeof useWorkflowsList>[0] {
  return {
    getSelectedId: () => null,
    onAutoSelect: vi.fn(),
    ...overrides,
  };
}

describe('useWorkflowsList', () => {
  it('starts with empty workflows + no error before the mount fetch resolves', async () => {
    server.use(
      http.get('/api/workflows', () =>
        HttpResponse.json({ workflows: [], count: 0 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkflowsList(args));
    expect(result.current.workflows).toEqual([]);
    expect(result.current.error).toBeNull();
    await waitFor(() => {
      expect(result.current.busy).toBe(false);
    });
  });

  it('hits exactly /api/workflows on mount and populates workflows', async () => {
    let url = '';
    server.use(
      http.get('/api/workflows', ({ request }) => {
        url = new URL(request.url).pathname;
        return HttpResponse.json({
          workflows: [makeWorkflow('w1'), makeWorkflow('w2')],
          count: 2,
        });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkflowsList(args));
    await waitFor(() => {
      expect(result.current.workflows).toHaveLength(2);
    });
    expect(url).toBe('/api/workflows');
    expect(result.current.workflows[0]?.id).toBe('w1');
    expect(result.current.error).toBeNull();
  });

  it('auto-selects the first workflow when getSelectedId() returns null', async () => {
    server.use(
      http.get('/api/workflows', () =>
        HttpResponse.json({
          workflows: [makeWorkflow('first'), makeWorkflow('second')],
          count: 2,
        }),
      ),
    );
    const onAutoSelect = vi.fn();
    const args = makeArgs({ getSelectedId: () => null, onAutoSelect });
    renderHook(() => useWorkflowsList(args));
    await waitFor(() => {
      expect(onAutoSelect).toHaveBeenCalledWith('first');
    });
    expect(onAutoSelect).toHaveBeenCalledTimes(1);
  });

  it('skips auto-select when getSelectedId() already returns an id', async () => {
    server.use(
      http.get('/api/workflows', () =>
        HttpResponse.json({
          workflows: [makeWorkflow('first')],
          count: 1,
        }),
      ),
    );
    const onAutoSelect = vi.fn();
    const args = makeArgs({ getSelectedId: () => 'preselected', onAutoSelect });
    const { result } = renderHook(() => useWorkflowsList(args));
    await waitFor(() => {
      expect(result.current.workflows).toHaveLength(1);
    });
    expect(onAutoSelect).not.toHaveBeenCalled();
  });

  it('skips auto-select when the workflows list comes back empty', async () => {
    server.use(
      http.get('/api/workflows', () =>
        HttpResponse.json({ workflows: [], count: 0 }),
      ),
    );
    const onAutoSelect = vi.fn();
    const args = makeArgs({ onAutoSelect });
    const { result } = renderHook(() => useWorkflowsList(args));
    await waitFor(() => {
      expect(result.current.busy).toBe(false);
    });
    expect(onAutoSelect).not.toHaveBeenCalled();
    expect(result.current.workflows).toEqual([]);
  });

  it('tolerates a payload missing the workflows array (defaults to [])', async () => {
    server.use(
      http.get('/api/workflows', () => HttpResponse.json({ count: 0 })),
    );
    const onAutoSelect = vi.fn();
    const args = makeArgs({ onAutoSelect });
    const { result } = renderHook(() => useWorkflowsList(args));
    await waitFor(() => {
      expect(result.current.busy).toBe(false);
    });
    expect(result.current.workflows).toEqual([]);
    expect(onAutoSelect).not.toHaveBeenCalled();
  });

  it('surfaces the error message on server failure and leaves workflows empty', async () => {
    server.use(
      http.get('/api/workflows', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkflowsList(args));
    await waitFor(() => {
      expect(result.current.busy).toBe(false);
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.workflows).toEqual([]);
  });

  it('exposes setError so the parent can clear the error slot', async () => {
    server.use(
      http.get('/api/workflows', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkflowsList(args));
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    act(() => result.current.setError(null));
    expect(result.current.error).toBeNull();
    act(() => result.current.setError('manual'));
    expect(result.current.error).toBe('manual');
  });

  it('exposes setBusy so the parent can toggle the busy slot directly', async () => {
    server.use(
      http.get('/api/workflows', () =>
        HttpResponse.json({ workflows: [], count: 0 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkflowsList(args));
    await waitFor(() => {
      expect(result.current.busy).toBe(false);
    });
    act(() => result.current.setBusy(true));
    expect(result.current.busy).toBe(true);
    act(() => result.current.setBusy(false));
    expect(result.current.busy).toBe(false);
  });

  it('refresh() re-fetches /api/workflows and updates the list', async () => {
    let count = 0;
    server.use(
      http.get('/api/workflows', () => {
        count++;
        return HttpResponse.json({
          workflows: [makeWorkflow(`r${count}`)],
          count: 1,
        });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkflowsList(args));
    await waitFor(() => {
      expect(result.current.workflows[0]?.id).toBe('r1');
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.workflows[0]?.id).toBe('r2');
  });

  it('flips busy=true during the in-flight fetch and back to false after release', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    server.use(
      http.get('/api/workflows', async () => {
        await gate;
        return HttpResponse.json({ workflows: [], count: 0 });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkflowsList(args));
    await waitFor(() => {
      expect(result.current.busy).toBe(true);
    });
    release();
    await waitFor(() => {
      expect(result.current.busy).toBe(false);
    });
  });

  it('clears a stale error on a subsequent successful refresh()', async () => {
    let fail = true;
    server.use(
      http.get('/api/workflows', () => {
        if (fail) return HttpResponse.json({ error: 'x' }, { status: 500 });
        return HttpResponse.json({ workflows: [makeWorkflow('ok')], count: 1 });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkflowsList(args));
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    fail = false;
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.workflows[0]?.id).toBe('ok');
  });
});
