import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useMeetingClassifyPreview } from './use-meeting-classify-preview';

describe('useMeetingClassifyPreview', () => {
  it('returns null when open=false', () => {
    const { result } = renderHook(() =>
      useMeetingClassifyPreview({ open: false, newTask: 'do x' }),
    );
    expect(result.current).toBeNull();
  });

  it('returns null when newTask is empty', () => {
    const { result } = renderHook(() =>
      useMeetingClassifyPreview({ open: true, newTask: '' }),
    );
    expect(result.current).toBeNull();
  });

  it('returns null when newTask is whitespace-only', () => {
    const { result } = renderHook(() =>
      useMeetingClassifyPreview({ open: true, newTask: '   ' }),
    );
    expect(result.current).toBeNull();
  });

  it('fetches the classification preview after the 250ms debounce', async () => {
    server.use(
      http.get('/api/meetings/classify-track', () =>
        HttpResponse.json({
          track: 'standard',
          matched: [{ list: 'foo', term: 'do' }],
          reason: 'matched: do',
        }),
      ),
    );
    const { result } = renderHook(() =>
      useMeetingClassifyPreview({ open: true, newTask: 'do x' }),
    );
    await waitFor(
      () => {
        expect(result.current).not.toBeNull();
      },
      { timeout: 1500 },
    );
    expect(result.current?.track).toBe('standard');
    expect(result.current?.reason).toBe('matched: do');
    expect(result.current?.matched).toEqual([{ list: 'foo', term: 'do' }]);
  });

  it('forwards the trimmed task as a `task=` querystring parameter', async () => {
    let capturedQs = '';
    server.use(
      http.get('/api/meetings/classify-track', ({ request }) => {
        capturedQs = new URL(request.url).search;
        return HttpResponse.json({
          track: 'lightweight',
          matched: [],
          reason: '',
        });
      }),
    );
    renderHook(() =>
      useMeetingClassifyPreview({ open: true, newTask: '  fix bug  ' }),
    );
    await waitFor(
      () => {
        expect(capturedQs).toContain('task=');
      },
      { timeout: 1500 },
    );
    // URLSearchParams encodes spaces as '+', so 'fix bug' → 'fix+bug'.
    expect(capturedQs).toContain('task=fix+bug');
  });

  it('falls back to null when the daemon returns a server error', async () => {
    server.use(
      http.get('/api/meetings/classify-track', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() =>
      useMeetingClassifyPreview({ open: true, newTask: 'x' }),
    );
    // Wait past the debounce + a beat for the rejected fetch to settle.
    await new Promise((r) => setTimeout(r, 500));
    expect(result.current).toBeNull();
  });

  it('clears the preview the moment open flips back to false', async () => {
    server.use(
      http.get('/api/meetings/classify-track', () =>
        HttpResponse.json({ track: 'full', matched: [], reason: 'r' }),
      ),
    );
    const { result, rerender } = renderHook(
      ({ open, task }: { open: boolean; task: string }) =>
        useMeetingClassifyPreview({ open, newTask: task }),
      { initialProps: { open: true, task: 'x' } },
    );
    await waitFor(
      () => {
        expect(result.current).not.toBeNull();
      },
      { timeout: 1500 },
    );
    rerender({ open: false, task: 'x' });
    expect(result.current).toBeNull();
  });
});
