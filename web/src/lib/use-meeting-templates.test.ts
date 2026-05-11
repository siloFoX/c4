import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useMeetingTemplates } from './use-meeting-templates';

describe('useMeetingTemplates', () => {
  it('returns an empty list when open=false (no fetch)', () => {
    let calls = 0;
    server.use(
      http.get('/api/meetings/templates', () => {
        calls++;
        return HttpResponse.json({ templates: [] });
      }),
    );
    const { result } = renderHook(() => useMeetingTemplates({ open: false }));
    expect(result.current.templates).toEqual([]);
    expect(calls).toBe(0);
  });

  it('fetches the saved-template list when open flips to true', async () => {
    server.use(
      http.get('/api/meetings/templates', () =>
        HttpResponse.json({
          templates: [
            { name: 'Daily', task: 'standup', track: 'lightweight' },
            { name: 'Postmortem', task: 'retro', description: 'incident review' },
          ],
        }),
      ),
    );
    const { result } = renderHook(() => useMeetingTemplates({ open: true }));
    await waitFor(() => {
      expect(result.current.templates).toHaveLength(2);
    });
    expect(result.current.templates[0]?.name).toBe('Daily');
    expect(result.current.templates[1]?.name).toBe('Postmortem');
  });

  it('treats a missing templates field as an empty list', async () => {
    server.use(
      http.get('/api/meetings/templates', () => HttpResponse.json({})),
    );
    const { result } = renderHook(() => useMeetingTemplates({ open: true }));
    // Yield to let the effect settle.
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.templates).toEqual([]);
  });

  it('swallows server errors and leaves templates as []', async () => {
    server.use(
      http.get('/api/meetings/templates', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useMeetingTemplates({ open: true }));
    await new Promise((r) => setTimeout(r, 100));
    expect(result.current.templates).toEqual([]);
  });

  it('refresh() re-issues the GET and updates the list', async () => {
    let count = 0;
    server.use(
      http.get('/api/meetings/templates', () => {
        count++;
        return HttpResponse.json({
          templates: [{ name: `T${count}`, task: 'x' }],
        });
      }),
    );
    const { result } = renderHook(() => useMeetingTemplates({ open: true }));
    await waitFor(() => {
      expect(result.current.templates[0]?.name).toBe('T1');
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.templates[0]?.name).toBe('T2');
  });

  it('cancels the in-flight effect when open flips false before resolution', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('/api/meetings/templates', async () => {
        await gate;
        return HttpResponse.json({
          templates: [{ name: 'late', task: 'x' }],
        });
      }),
    );
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) => useMeetingTemplates({ open }),
      { initialProps: { open: true } },
    );
    rerender({ open: false });
    release();
    // Even after the late response resolves, cancelled guard suppresses setState.
    await new Promise((r) => setTimeout(r, 100));
    expect(result.current.templates).toEqual([]);
  });
});
