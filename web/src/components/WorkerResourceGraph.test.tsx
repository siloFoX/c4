import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server';
import { setToken, clearToken } from '../lib/api';
import WorkerResourceGraph from './WorkerResourceGraph';

// (11.203) Mini-graph: two side-by-side sparklines polling
// /api/metrics on its own sampleIntervalMs. Tests drive fake
// timers + MSW handler so each tick deterministically appends
// one sample to the ring buffer.

interface WorkerRow {
  name: string;
  cpuPct: number | null;
  rssKb: number | null;
}

function metricsHandler(rows: WorkerRow[] | (() => WorkerRow[])) {
  server.use(
    http.get('/api/metrics', () => {
      const workers = typeof rows === 'function' ? rows() : rows;
      return HttpResponse.json({ workers });
    }),
  );
}

afterEach(() => {
  vi.useRealTimers();
  clearToken();
});

describe('WorkerResourceGraph', () => {
  it('renders the no-data placeholder before the first sample resolves', () => {
    let release: () => void = () => {};
    server.use(
      http.get('/api/metrics', async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return HttpResponse.json({ workers: [] });
      }),
    );
    render(<WorkerResourceGraph workerName="w1" />);
    expect(screen.getByTestId('wrg-empty')).toHaveTextContent('no data');
    expect(screen.queryByTestId('wrg-cpu-svg')).toBeNull();
    release();
  });

  it('renders two sparkline SVGs after the first tick lands a sample', async () => {
    vi.useFakeTimers();
    metricsHandler([{ name: 'w1', cpuPct: 42, rssKb: 1024 }]);
    render(<WorkerResourceGraph workerName="w1" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('wrg-cpu-svg')).toBeInTheDocument();
    expect(screen.getByTestId('wrg-rss-svg')).toBeInTheDocument();
    const cpuLine = screen.getByTestId('wrg-cpu-line');
    expect(cpuLine.getAttribute('points')).not.toBe('');
    const rssLine = screen.getByTestId('wrg-rss-line');
    expect(rssLine.getAttribute('points')).not.toBe('');
  });

  it('renders the current CPU% and RSS value text labels', async () => {
    vi.useFakeTimers();
    metricsHandler([{ name: 'w1', cpuPct: 73, rssKb: 2048 }]);
    render(<WorkerResourceGraph workerName="w1" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('wrg-cpu-value')).toHaveTextContent('73%');
    expect(screen.getByTestId('wrg-rss-value').textContent).toMatch(/MB|KB|B/);
  });

  it('caps the ring buffer at windowMs / sampleIntervalMs (older points evicted)', async () => {
    vi.useFakeTimers();
    let tickCount = 0;
    server.use(
      http.get('/api/metrics', () => {
        tickCount++;
        return HttpResponse.json({
          workers: [{ name: 'w1', cpuPct: tickCount * 5, rssKb: 100 }],
        });
      }),
    );
    // windowMs=20000, sampleIntervalMs=5000 -> capacity = 4
    render(
      <WorkerResourceGraph
        workerName="w1"
        sampleIntervalMs={5000}
        windowMs={20000}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // advance 6 intervals so 7 total samples should reduce to 4
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
    }
    expect(tickCount).toBe(7);
    const line = screen.getByTestId('wrg-cpu-line');
    const pts = (line.getAttribute('points') || '').trim().split(/\s+/);
    expect(pts.length).toBe(4);
  });

  it('clears the interval on unmount (no further fetches after teardown)', async () => {
    vi.useFakeTimers();
    let calls = 0;
    server.use(
      http.get('/api/metrics', () => {
        calls++;
        return HttpResponse.json({
          workers: [{ name: 'w1', cpuPct: 1, rssKb: 1 }],
        });
      }),
    );
    const { unmount } = render(<WorkerResourceGraph workerName="w1" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls).toBe(1);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(calls).toBe(1);
  });

  it('ignores rows whose name does not match workerName (stays in no-data state)', async () => {
    vi.useFakeTimers();
    metricsHandler([
      { name: 'other-worker', cpuPct: 99, rssKb: 9999 },
    ]);
    render(<WorkerResourceGraph workerName="w1" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('wrg-empty')).toHaveTextContent('no data');
  });

  // (v1.11.1119, TODO 11.1101) /api/metrics is auth-gated; the poll
  // must carry the session token (the bug: it sent none, 401-flooding
  // the console for signed-in admins via every worker row's graph).
  it('attaches the Authorization header from getToken to the metrics poll', async () => {
    vi.useFakeTimers();
    setToken('test-token-1101');
    let seenAuth: string | null | undefined;
    server.use(
      http.get('/api/metrics', ({ request }) => {
        seenAuth = request.headers.get('authorization');
        return HttpResponse.json({
          workers: [{ name: 'w1', cpuPct: 5, rssKb: 1 }],
        });
      }),
    );
    render(<WorkerResourceGraph workerName="w1" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(seenAuth).toBe('Bearer test-token-1101');
  });

  it('STOPS polling on a 401 (no console flood)', async () => {
    vi.useFakeTimers();
    setToken('expired-token');
    let calls = 0;
    server.use(
      http.get('/api/metrics', () => {
        calls++;
        return HttpResponse.json({ error: 'unauthorized' }, { status: 401 });
      }),
    );
    render(<WorkerResourceGraph workerName="w1" sampleIntervalMs={5000} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls).toBe(1);
    // Advancing past several intervals must NOT fire another request --
    // the 401 cleared the interval entirely.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000 * 5);
    });
    expect(calls).toBe(1);
    expect(screen.getByTestId('wrg-empty')).toHaveTextContent('no data');
  });

  it('updates the latest CPU label as new samples arrive', async () => {
    vi.useFakeTimers();
    let phase = 0;
    server.use(
      http.get('/api/metrics', () => {
        phase++;
        const cpu = phase === 1 ? 10 : 80;
        return HttpResponse.json({
          workers: [{ name: 'w1', cpuPct: cpu, rssKb: 512 }],
        });
      }),
    );
    render(<WorkerResourceGraph workerName="w1" sampleIntervalMs={5000} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('wrg-cpu-value')).toHaveTextContent('10%');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByTestId('wrg-cpu-value')).toHaveTextContent('80%');
  });
});
