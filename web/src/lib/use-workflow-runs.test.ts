import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useWorkflowRuns } from './use-workflow-runs';
import type { WorkflowRun } from '../components/WorkflowEditor';

function makeRun(id: string, overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id,
    workflowId: 'wf1',
    status: 'completed',
    startedAt: '2026-05-11T00:00:00.000Z',
    completedAt: '2026-05-11T00:01:00.000Z',
    inputs: {},
    nodeResults: {},
    ...overrides,
  };
}

describe('useWorkflowRuns', () => {
  it('starts idle: runs=[], expandedRunId=null, no fetch when selectedId=null', async () => {
    let calls = 0;
    server.use(
      http.get('/api/workflows/:id/runs', () => {
        calls++;
        return HttpResponse.json({ workflowId: 'x', runs: [], count: 0 });
      }),
    );
    const { result } = renderHook(() => useWorkflowRuns(null));
    expect(result.current.runs).toEqual([]);
    expect(result.current.expandedRunId).toBeNull();
    // Wait a tick to confirm nothing fires.
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toBe(0);
  });

  it('fetches /api/workflows/:id/runs on mount when selectedId is set', async () => {
    let url = '';
    server.use(
      http.get('/api/workflows/:id/runs', ({ request }) => {
        url = new URL(request.url).pathname;
        return HttpResponse.json({
          workflowId: 'wf1',
          runs: [makeRun('r1'), makeRun('r2')],
          count: 2,
        });
      }),
    );
    const { result } = renderHook(() => useWorkflowRuns('wf1'));
    await waitFor(() => {
      expect(result.current.runs).toHaveLength(2);
    });
    expect(url).toBe('/api/workflows/wf1/runs');
    expect(result.current.runs[0]?.id).toBe('r1');
  });

  it('encodes the selectedId with encodeURIComponent when it contains slashes', async () => {
    let url = '';
    server.use(
      http.get('/api/workflows/:id/runs', ({ request }) => {
        url = new URL(request.url).pathname;
        return HttpResponse.json({ workflowId: 'a/b c', runs: [], count: 0 });
      }),
    );
    renderHook(() => useWorkflowRuns('a/b c'));
    await waitFor(() => {
      expect(url).toBe('/api/workflows/a%2Fb%20c/runs');
    });
  });

  it('tolerates a payload missing the runs array (defaults to [])', async () => {
    server.use(
      http.get('/api/workflows/:id/runs', () =>
        HttpResponse.json({ workflowId: 'wf1', count: 0 }),
      ),
    );
    const { result } = renderHook(() => useWorkflowRuns('wf1'));
    // Initial render is [] already — wait a tick for the .then to land.
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.runs).toEqual([]);
  });

  it('falls back to runs=[] on server failure (no thrown error surfaces)', async () => {
    server.use(
      http.get('/api/workflows/:id/runs', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useWorkflowRuns('wf1'));
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.runs).toEqual([]);
  });

  it('exposes setRuns so the parent can splice in fresh data without a refetch', async () => {
    server.use(
      http.get('/api/workflows/:id/runs', () =>
        HttpResponse.json({ workflowId: 'wf1', runs: [makeRun('r1')], count: 1 }),
      ),
    );
    const { result } = renderHook(() => useWorkflowRuns('wf1'));
    await waitFor(() => {
      expect(result.current.runs).toHaveLength(1);
    });
    act(() => result.current.setRuns([makeRun('new'), makeRun('also')]));
    expect(result.current.runs.map((r) => r.id)).toEqual(['new', 'also']);
  });

  it('exposes setExpandedRunId so the parent can toggle the inline run detail', () => {
    server.use(
      http.get('/api/workflows/:id/runs', () =>
        HttpResponse.json({ workflowId: 'wf1', runs: [], count: 0 }),
      ),
    );
    const { result } = renderHook(() => useWorkflowRuns('wf1'));
    expect(result.current.expandedRunId).toBeNull();
    act(() => result.current.setExpandedRunId('run-x'));
    expect(result.current.expandedRunId).toBe('run-x');
    act(() => result.current.setExpandedRunId(null));
    expect(result.current.expandedRunId).toBeNull();
  });

  it('resets expandedRunId AND clears runs when selectedId flips to null', async () => {
    server.use(
      http.get('/api/workflows/:id/runs', () =>
        HttpResponse.json({ workflowId: 'wf1', runs: [makeRun('r1')], count: 1 }),
      ),
    );
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useWorkflowRuns(id),
      { initialProps: { id: 'wf1' } },
    );
    await waitFor(() => {
      expect(result.current.runs).toHaveLength(1);
    });
    act(() => result.current.setExpandedRunId('keep'));
    rerender({ id: null });
    expect(result.current.runs).toEqual([]);
    expect(result.current.expandedRunId).toBeNull();
  });

  it('refetches and resets expandedRunId on a cross-selection (selectedId change)', async () => {
    server.use(
      http.get('/api/workflows/:id/runs', ({ params }) => {
        const id = params.id as string;
        return HttpResponse.json({
          workflowId: id,
          runs: [makeRun(`${id}-r1`)],
          count: 1,
        });
      }),
    );
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useWorkflowRuns(id),
      { initialProps: { id: 'wf1' } },
    );
    await waitFor(() => {
      expect(result.current.runs[0]?.id).toBe('wf1-r1');
    });
    act(() => result.current.setExpandedRunId('stale'));
    rerender({ id: 'wf2' });
    expect(result.current.expandedRunId).toBeNull();
    await waitFor(() => {
      expect(result.current.runs[0]?.id).toBe('wf2-r1');
    });
  });

  it('release-gate: a slow in-flight fetch settles correctly after release', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    server.use(
      http.get('/api/workflows/:id/runs', async () => {
        await gate;
        return HttpResponse.json({
          workflowId: 'wf1',
          runs: [makeRun('late')],
          count: 1,
        });
      }),
    );
    const { result } = renderHook(() => useWorkflowRuns('wf1'));
    // Still empty while the request is gated.
    expect(result.current.runs).toEqual([]);
    release();
    await waitFor(() => {
      expect(result.current.runs[0]?.id).toBe('late');
    });
  });
});
