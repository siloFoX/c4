import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useMeetingsList } from './use-meetings-list';

// jsdom doesn't ship EventSource — provide a no-op stub so the hook's
// `new EventSource(...)` doesn't crash and we can assert open / message
// dispatch / close instead of relying on real network streams.
class EventSourceStub {
  url: string;
  onmessage: ((ev: unknown) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  static instances: EventSourceStub[] = [];
  constructor(url: string) {
    this.url = url;
    EventSourceStub.instances.push(this);
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

describe('useMeetingsList', () => {
  it('starts loading, then surfaces the daemon payload', async () => {
    server.use(
      http.get('/api/meetings', () =>
        HttpResponse.json({ meetings: [{ id: 'm1' }], total: 1 }),
      ),
    );
    const { result } = renderHook(() =>
      useMeetingsList({ listStatus: '', listTrack: '' }),
    );
    expect(result.current.loading).toBe(true);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data).toEqual({
      meetings: [{ id: 'm1' }],
      total: 1,
    });
    expect(result.current.error).toBeNull();
  });

  it('forwards listStatus + listTrack as querystring parameters', async () => {
    let qs = '';
    server.use(
      http.get('/api/meetings', ({ request }) => {
        qs = new URL(request.url).search;
        return HttpResponse.json({ meetings: [], total: 0 });
      }),
    );
    renderHook(() =>
      useMeetingsList({ listStatus: 'pending', listTrack: 'standard' }),
    );
    await waitFor(() => {
      expect(qs).toContain('status=pending');
      expect(qs).toContain('track=standard');
    });
  });

  it('omits status / track keys entirely when both fields are blank', async () => {
    let qs = '';
    server.use(
      http.get('/api/meetings', ({ request }) => {
        qs = new URL(request.url).search;
        return HttpResponse.json({ meetings: [], total: 0 });
      }),
    );
    renderHook(() => useMeetingsList({ listStatus: '', listTrack: '' }));
    await waitFor(() => {
      expect(qs).toBe('');
    });
  });

  it('surfaces the error message on server failure', async () => {
    server.use(
      http.get('/api/meetings', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() =>
      useMeetingsList({ listStatus: '', listTrack: '' }),
    );
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.data).toBeNull();
  });

  it('refresh() re-fetches and updates the list', async () => {
    let count = 0;
    server.use(
      http.get('/api/meetings', () => {
        count++;
        return HttpResponse.json({ meetings: [], total: count });
      }),
    );
    const { result } = renderHook(() =>
      useMeetingsList({ listStatus: '', listTrack: '' }),
    );
    await waitFor(() => {
      expect(result.current.data?.total).toBe(1);
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.data?.total).toBe(2);
  });

  it('opens an EventSource on /api/meetings/stream and closes it on unmount', async () => {
    server.use(
      http.get('/api/meetings', () =>
        HttpResponse.json({ meetings: [], total: 0 }),
      ),
    );
    const { unmount } = renderHook(() =>
      useMeetingsList({ listStatus: '', listTrack: '' }),
    );
    expect(EventSourceStub.instances).toHaveLength(1);
    expect(EventSourceStub.instances[0]?.url).toContain('/api/meetings/stream');
    expect(EventSourceStub.instances[0]?.closed).toBe(false);
    unmount();
    expect(EventSourceStub.instances[0]?.closed).toBe(true);
  });

  it('triggers a refetch when the EventSource emits a message', async () => {
    let count = 0;
    server.use(
      http.get('/api/meetings', () => {
        count++;
        return HttpResponse.json({ meetings: [], total: count });
      }),
    );
    const { result } = renderHook(() =>
      useMeetingsList({ listStatus: '', listTrack: '' }),
    );
    await waitFor(() => {
      expect(result.current.data?.total).toBe(1);
    });
    const es = EventSourceStub.instances[0];
    expect(typeof es?.onmessage).toBe('function');
    act(() => {
      es?.onmessage?.({ data: 'meeting-added' });
    });
    await waitFor(() => {
      expect(result.current.data?.total).toBe(2);
    });
  });

  it('schedules the 90s fallback poll', () => {
    server.use(
      http.get('/api/meetings', () =>
        HttpResponse.json({ meetings: [], total: 0 }),
      ),
    );
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    try {
      renderHook(() =>
        useMeetingsList({ listStatus: '', listTrack: '' }),
      );
      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        90_000,
      );
    } finally {
      setIntervalSpy.mockRestore();
    }
  });

  it('clears the polling interval on unmount', () => {
    server.use(
      http.get('/api/meetings', () =>
        HttpResponse.json({ meetings: [], total: 0 }),
      ),
    );
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    try {
      const { unmount } = renderHook(() =>
        useMeetingsList({ listStatus: '', listTrack: '' }),
      );
      unmount();
      expect(clearIntervalSpy).toHaveBeenCalled();
    } finally {
      clearIntervalSpy.mockRestore();
    }
  });
});
