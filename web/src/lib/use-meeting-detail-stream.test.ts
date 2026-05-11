import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useMeetingDetailStream } from './use-meeting-detail-stream';

// jsdom doesn't ship EventSource. This stub mirrors the slice the hook
// uses (addEventListener for typed events + onopen / onerror handlers
// + close()), and exposes an `emit()` so the test can drive frames.
class EventSourceStub {
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((ev: unknown) => void) | null = null;
  closed = false;
  private listeners: Record<string, Array<(ev: unknown) => void>> = {};
  static instances: EventSourceStub[] = [];

  constructor(url: string) {
    this.url = url;
    EventSourceStub.instances.push(this);
  }
  addEventListener(name: string, fn: (ev: unknown) => void) {
    (this.listeners[name] ||= []).push(fn);
  }
  emit(name: string, ev: unknown) {
    (this.listeners[name] || []).forEach((fn) => fn(ev));
  }
  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  EventSourceStub.instances = [];
  vi.stubGlobal('EventSource', EventSourceStub);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMeetingDetailStream', () => {
  it('returns null detail + not-streaming when selectedId is null (no EventSource)', () => {
    const { result } = renderHook(() => useMeetingDetailStream(null));
    expect(result.current.detail).toBeNull();
    expect(result.current.streaming).toBe(false);
    expect(EventSourceStub.instances).toHaveLength(0);
  });

  it('opens EventSource on /api/meetings/<id>/stream and reports streaming=true', () => {
    const { result } = renderHook(() => useMeetingDetailStream('m1'));
    expect(EventSourceStub.instances).toHaveLength(1);
    expect(EventSourceStub.instances[0]?.url).toContain('/api/meetings/m1/stream');
    expect(result.current.streaming).toBe(true);
  });

  it('URL-encodes the meeting id in the stream path', () => {
    renderHook(() => useMeetingDetailStream('a/b c'));
    expect(EventSourceStub.instances[0]?.url).toContain('a%2Fb%20c');
  });

  it('captures the snapshot frame and sets it as the initial detail payload', () => {
    const { result } = renderHook(() => useMeetingDetailStream('m1'));
    const es = EventSourceStub.instances[0]!;
    const snap = { id: 'm1', status: 'pending', transcripts: [] };
    act(() => {
      es.emit('snapshot', { data: JSON.stringify(snap) } as unknown);
    });
    expect(result.current.detail).toEqual(snap);
  });

  it('ignores a malformed snapshot frame (no JSON parse throw to UI)', () => {
    const { result } = renderHook(() => useMeetingDetailStream('m1'));
    const es = EventSourceStub.instances[0]!;
    expect(() => {
      act(() => {
        es.emit('snapshot', { data: 'not-valid-json' } as unknown);
      });
    }).not.toThrow();
    expect(result.current.detail).toBeNull();
  });

  it('on `state` event: refetches GET /api/meetings/<id> and merges status fast-path', async () => {
    server.use(
      http.get('/api/meetings/:id', () =>
        HttpResponse.json({
          id: 'm1', status: 'completed', transcripts: [[{ i: 1 }]],
        }),
      ),
    );
    const { result } = renderHook(() => useMeetingDetailStream('m1'));
    const es = EventSourceStub.instances[0]!;
    // Seed an initial snapshot so the status-merge has something to update.
    act(() => {
      es.emit('snapshot', {
        data: JSON.stringify({ id: 'm1', status: 'pending', transcripts: [] }),
      } as unknown);
    });
    expect(result.current.detail?.status).toBe('pending');

    act(() => {
      es.emit('state', {
        data: JSON.stringify({
          event: 'advance',
          payload: {},
          status: 'in-progress',
          ts: '2026-05-11T00:00:00Z',
        }),
      } as unknown);
    });
    // Fast-path merge should apply the new status synchronously.
    expect(result.current.detail?.status).toBe('in-progress');
    // The follow-up GET should land asynchronously and replace the detail.
    await waitFor(() => {
      expect(result.current.detail?.status).toBe('completed');
    });
  });

  it('on `terminal` event: refetches GET /api/meetings/<id> for the final state', async () => {
    server.use(
      http.get('/api/meetings/:id', () =>
        HttpResponse.json({
          id: 'm1', status: 'completed', transcripts: [],
        }),
      ),
    );
    const { result } = renderHook(() => useMeetingDetailStream('m1'));
    const es = EventSourceStub.instances[0]!;
    act(() => {
      es.emit('terminal', {} as unknown);
    });
    await waitFor(() => {
      expect(result.current.detail?.status).toBe('completed');
    });
  });

  it('flips streaming=false when the EventSource emits onerror', () => {
    const { result } = renderHook(() => useMeetingDetailStream('m1'));
    const es = EventSourceStub.instances[0]!;
    expect(result.current.streaming).toBe(true);
    act(() => {
      es.onerror?.();
    });
    expect(result.current.streaming).toBe(false);
  });

  it('closes the EventSource and resets streaming on unmount', () => {
    const { unmount } = renderHook(() => useMeetingDetailStream('m1'));
    const es = EventSourceStub.instances[0]!;
    expect(es.closed).toBe(false);
    unmount();
    expect(es.closed).toBe(true);
  });

  it('opens a fresh stream when selectedId changes (and closes the previous one)', () => {
    const { rerender } = renderHook(
      ({ id }: { id: string | null }) => useMeetingDetailStream(id),
      { initialProps: { id: 'm1' } },
    );
    expect(EventSourceStub.instances).toHaveLength(1);
    rerender({ id: 'm2' });
    expect(EventSourceStub.instances).toHaveLength(2);
    expect(EventSourceStub.instances[0]?.closed).toBe(true);
    expect(EventSourceStub.instances[1]?.url).toContain('/api/meetings/m2/stream');
  });
});
