import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useMeetingPreviewPlan } from './use-meeting-preview-plan';

const PLAN_PAYLOAD = {
  track: 'standard',
  rosterSize: 5,
  estimatedTokens: 1234,
  consensusPolicy: { mode: 'majority', roundCap: 3, allowVeto: false },
  stages: [{ stage: 'discovery', specialists: [{ id: 's1' }, { id: 's2' }] }],
};

describe('useMeetingPreviewPlan', () => {
  it('returns null + not-busy when open=false', () => {
    const { result } = renderHook(() =>
      useMeetingPreviewPlan({ open: false, newTask: 'do x', newTrack: 'auto' }),
    );
    expect(result.current.previewPlan).toBeNull();
    expect(result.current.previewBusy).toBe(false);
  });

  it('returns null when newTask is empty / whitespace', () => {
    const { result: r1 } = renderHook(() =>
      useMeetingPreviewPlan({ open: true, newTask: '', newTrack: 'auto' }),
    );
    expect(r1.current.previewPlan).toBeNull();
    const { result: r2 } = renderHook(() =>
      useMeetingPreviewPlan({ open: true, newTask: '   ', newTrack: 'auto' }),
    );
    expect(r2.current.previewPlan).toBeNull();
  });

  it('POSTs /api/meetings/plan after the 400ms debounce with trimmed task', async () => {
    let body: { task?: string; track?: string } | null = null;
    server.use(
      http.post('/api/meetings/plan', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json(PLAN_PAYLOAD);
      }),
    );
    const { result } = renderHook(() =>
      useMeetingPreviewPlan({ open: true, newTask: '  do x  ', newTrack: 'auto' }),
    );
    await waitFor(
      () => {
        expect(result.current.previewPlan).not.toBeNull();
      },
      { timeout: 1500 },
    );
    expect(body).toEqual({ task: 'do x' });
    expect(result.current.previewPlan?.rosterSize).toBe(5);
  });

  it('forwards track when newTrack !== "auto"', async () => {
    let body: { task?: string; track?: string } | null = null;
    server.use(
      http.post('/api/meetings/plan', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json(PLAN_PAYLOAD);
      }),
    );
    const { result } = renderHook(() =>
      useMeetingPreviewPlan({
        open: true,
        newTask: 'do x',
        newTrack: 'full',
      }),
    );
    await waitFor(
      () => {
        expect(result.current.previewPlan).not.toBeNull();
      },
      { timeout: 1500 },
    );
    expect(body).toEqual({ task: 'do x', track: 'full' });
  });

  it('falls back to previewPlan=null on server error', async () => {
    server.use(
      http.post('/api/meetings/plan', () =>
        HttpResponse.json({ error: 'no roster' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() =>
      useMeetingPreviewPlan({ open: true, newTask: 'x', newTrack: 'auto' }),
    );
    // Wait past the 400ms debounce + a beat for the rejected fetch to settle.
    await new Promise((r) => setTimeout(r, 700));
    expect(result.current.previewPlan).toBeNull();
    expect(result.current.previewBusy).toBe(false);
  });

  it('clears the preview the moment open flips back to false', async () => {
    server.use(
      http.post('/api/meetings/plan', () => HttpResponse.json(PLAN_PAYLOAD)),
    );
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useMeetingPreviewPlan({ open, newTask: 'do x', newTrack: 'auto' }),
      { initialProps: { open: true } },
    );
    await waitFor(
      () => {
        expect(result.current.previewPlan).not.toBeNull();
      },
      { timeout: 1500 },
    );
    rerender({ open: false });
    expect(result.current.previewPlan).toBeNull();
  });
});
