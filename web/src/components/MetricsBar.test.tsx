import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { setLocale } from '../lib/i18n';
import type { MetricsResponse, MetricsStatus } from '../lib/use-metrics';

// MetricsBar is a pure-display strip rendered above the daemon
// dashboard. The 5s self-poll fetch + the MetricsResponse shape
// live in lib/use-metrics (own unit tests), so we mock it here
// with a per-test-tunable response object. State machine:
// hook=null returns null (early bail), hook=MetricsResponse renders
// the four-cell strip (live, cpu, rss, host). Two private
// formatters (fmtPct, fmtMb) own the unit suffixes — we drive both
// branches (under/over 1024 KB threshold for fmtMb, null/non-null
// for both).

let mockMetrics: MetricsResponse | null = null;
let mockStatus: MetricsStatus = 'ok';

vi.mock('../lib/use-metrics', () => ({
  useMetrics: () => ({ data: mockMetrics, status: mockStatus }),
}));

import MetricsBar from './MetricsBar';

function makeMetrics(over: Partial<MetricsResponse> = {}): MetricsResponse {
  return {
    daemon: {
      platform: 'linux',
      pid: 4242,
      uptimeSec: 9999,
      rssKb: 51200,
      heapUsedKb: 1024,
      heapTotalKb: 2048,
      cpus: 8,
      loadavg: [0.42, 0.5, 0.6],
      ...over.daemon,
    },
    workers: over.workers ?? [],
    totals: {
      liveWorkers: 3,
      totalWorkers: 5,
      totalRssKb: 102400,
      totalCpuPct: 12.34,
      ...over.totals,
    },
  };
}

beforeEach(() => {
  setLocale('en');
  mockMetrics = null;
  mockStatus = 'ok';
});

describe('<MetricsBar>', () => {
  // ---- null bail ---------------------------------------------------

  it('renders nothing when the metrics hook returns null', () => {
    mockMetrics = null;
    const { container } = render(<MetricsBar />);
    expect(container.firstChild).toBeNull();
  });

  // ---- needs-login (401 backoff, TODO 11.1082) --------------------

  it('renders the quiet needs-login strip when status is needs-login', () => {
    mockMetrics = null;
    mockStatus = 'needs-login';
    const { container } = render(<MetricsBar />);
    const strip = container.querySelector(
      '[data-section="metrics-bar-needs-login"]',
    );
    expect(strip).not.toBeNull();
    expect(strip?.textContent).toMatch(/sign in/i);
  });

  it('does not render the live cells while in the needs-login state', () => {
    mockMetrics = makeMetrics({
      totals: {
        liveWorkers: 7,
        totalWorkers: 9,
        totalRssKb: 0,
        totalCpuPct: 0,
      },
    });
    mockStatus = 'needs-login';
    render(<MetricsBar />);
    // The live worker count cell must NOT render in needs-login.
    expect(screen.queryByText('7')).not.toBeInTheDocument();
  });

  // ---- live workers cell ------------------------------------------

  it('renders the live worker count from totals.liveWorkers', () => {
    mockMetrics = makeMetrics({
      totals: {
        liveWorkers: 7,
        totalWorkers: 10,
        totalRssKb: 1024,
        totalCpuPct: 0,
      },
    });
    render(<MetricsBar />);
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('renders the localized "live" label next to the live worker count', () => {
    mockMetrics = makeMetrics();
    render(<MetricsBar />);
    expect(screen.getByText('live')).toBeInTheDocument();
  });

  it('renders the localized "/ N total" suffix from totalWorkers', () => {
    mockMetrics = makeMetrics({
      totals: {
        liveWorkers: 1,
        totalWorkers: 4,
        totalRssKb: 0,
        totalCpuPct: 0,
      },
    });
    render(<MetricsBar />);
    expect(screen.getByText('/ 4 total')).toBeInTheDocument();
  });

  // ---- cpu cell + fmtPct -----------------------------------------

  it('renders the totalCpuPct rounded to one decimal place with a % suffix', () => {
    mockMetrics = makeMetrics({
      totals: {
        liveWorkers: 1,
        totalWorkers: 1,
        totalRssKb: 0,
        totalCpuPct: 12.345,
      },
    });
    render(<MetricsBar />);
    expect(screen.getByText('12.3%')).toBeInTheDocument();
  });

  it('rounds totalCpuPct to one decimal place (3.789 -> 3.8%)', () => {
    mockMetrics = makeMetrics({
      totals: {
        liveWorkers: 0,
        totalWorkers: 0,
        totalRssKb: 0,
        totalCpuPct: 3.789,
      },
    });
    render(<MetricsBar />);
    expect(screen.getByText('3.8%')).toBeInTheDocument();
  });

  it('renders an em dash placeholder when totalCpuPct is missing (null cast)', () => {
    mockMetrics = makeMetrics({
      totals: {
        liveWorkers: 0,
        totalWorkers: 0,
        totalRssKb: 0,
        totalCpuPct: null as unknown as number,
      },
    });
    render(<MetricsBar />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders the localized "workers" + "load" labels alongside the cpu cell', () => {
    mockMetrics = makeMetrics();
    render(<MetricsBar />);
    // 'workers' shows up twice (cpu cell + rss cell), so use queryAll.
    expect(screen.getAllByText(/workers/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/load/)).toBeInTheDocument();
  });

  it('formats loadavg[0] to two decimal places in the cpu cell', () => {
    mockMetrics = makeMetrics({
      daemon: {
        platform: 'linux',
        pid: 1,
        uptimeSec: 0,
        rssKb: 0,
        heapUsedKb: 0,
        heapTotalKb: 0,
        cpus: 1,
        loadavg: [1.234, 1.5, 1.6],
      },
    });
    render(<MetricsBar />);
    expect(screen.getByText(/load 1\.23/)).toBeInTheDocument();
  });

  it('falls back to 0.00 when loadavg[0] is missing', () => {
    mockMetrics = makeMetrics({
      daemon: {
        platform: 'linux',
        pid: 1,
        uptimeSec: 0,
        rssKb: 0,
        heapUsedKb: 0,
        heapTotalKb: 0,
        cpus: 1,
        loadavg: [],
      },
    });
    render(<MetricsBar />);
    expect(screen.getByText(/load 0\.00/)).toBeInTheDocument();
  });

  // ---- rss cell + fmtMb -----------------------------------------

  it('formats sub-1024 KB totalRssKb in KB (no MB conversion)', () => {
    mockMetrics = makeMetrics({
      totals: {
        liveWorkers: 0,
        totalWorkers: 0,
        totalRssKb: 512,
        totalCpuPct: 0,
      },
    });
    render(<MetricsBar />);
    expect(screen.getByText('512 KB')).toBeInTheDocument();
  });

  it('formats 1024 KB exactly as 1.0 MB (>= 1024 branch)', () => {
    mockMetrics = makeMetrics({
      totals: {
        liveWorkers: 0,
        totalWorkers: 0,
        totalRssKb: 1024,
        totalCpuPct: 0,
      },
    });
    render(<MetricsBar />);
    expect(screen.getByText('1.0 MB')).toBeInTheDocument();
  });

  it('formats large KB values as MB rounded to one decimal place', () => {
    mockMetrics = makeMetrics({
      totals: {
        liveWorkers: 0,
        totalWorkers: 0,
        totalRssKb: 102400,
        totalCpuPct: 0,
      },
    });
    render(<MetricsBar />);
    expect(screen.getByText('100.0 MB')).toBeInTheDocument();
  });

  it('formats the daemon.rssKb separately from the totals.totalRssKb', () => {
    mockMetrics = makeMetrics({
      daemon: {
        platform: 'linux',
        pid: 1,
        uptimeSec: 0,
        rssKb: 32768,
        heapUsedKb: 0,
        heapTotalKb: 0,
        cpus: 1,
        loadavg: [0],
      },
      totals: {
        liveWorkers: 0,
        totalWorkers: 0,
        totalRssKb: 102400,
        totalCpuPct: 0,
      },
    });
    render(<MetricsBar />);
    expect(screen.getByText('100.0 MB')).toBeInTheDocument();
    expect(screen.getByText(/daemon 32\.0 MB/)).toBeInTheDocument();
  });

  it('renders em dash for daemon.rssKb when null is passed (null guard)', () => {
    mockMetrics = makeMetrics({
      daemon: {
        platform: 'linux',
        pid: 1,
        uptimeSec: 0,
        rssKb: null as unknown as number,
        heapUsedKb: 0,
        heapTotalKb: 0,
        cpus: 1,
        loadavg: [0],
      },
    });
    render(<MetricsBar />);
    expect(screen.getByText(/daemon —/)).toBeInTheDocument();
  });

  // ---- host suffix ----------------------------------------------

  it('renders the cpu count + platform + pid host suffix from the daemon block', () => {
    mockMetrics = makeMetrics({
      daemon: {
        platform: 'darwin',
        pid: 9999,
        uptimeSec: 0,
        rssKb: 1024,
        heapUsedKb: 0,
        heapTotalKb: 0,
        cpus: 12,
        loadavg: [0],
      },
    });
    render(<MetricsBar />);
    expect(screen.getByText(/12c · darwin · pid 9999/)).toBeInTheDocument();
  });

  it('interpolates the daemon.pid into the pid label via tFormat', () => {
    mockMetrics = makeMetrics({
      daemon: {
        platform: 'linux',
        pid: 12345,
        uptimeSec: 0,
        rssKb: 0,
        heapUsedKb: 0,
        heapTotalKb: 0,
        cpus: 4,
        loadavg: [0],
      },
    });
    render(<MetricsBar />);
    expect(screen.getByText(/pid 12345/)).toBeInTheDocument();
  });

  // ---- icons ----------------------------------------------------

  it('renders three lucide icons (Activity, Cpu, MemoryStick) inside the bar', () => {
    mockMetrics = makeMetrics();
    const { container } = render(<MetricsBar />);
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(3);
  });

  // ---- structure ------------------------------------------------

  it('renders a single root <div> wrapper when metrics are present', () => {
    mockMetrics = makeMetrics();
    const { container } = render(<MetricsBar />);
    const root = container.firstChild as HTMLElement;
    expect(root.tagName).toBe('DIV');
  });

  it('applies the muted background + bottom-border classes on the root wrapper', () => {
    mockMetrics = makeMetrics();
    const { container } = render(<MetricsBar />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/border-b/);
    expect(root.className).toMatch(/bg-muted/);
  });

  // ---- rerender stability ---------------------------------------

  it('rerendering after the hook switches from null to a payload reveals the bar', () => {
    mockMetrics = null;
    const { rerender, container } = render(<MetricsBar />);
    expect(container.firstChild).toBeNull();
    mockMetrics = makeMetrics();
    rerender(<MetricsBar />);
    expect(container.firstChild).not.toBeNull();
  });

  it('rerendering after the hook payload changes updates the live worker count', () => {
    mockMetrics = makeMetrics({
      totals: {
        liveWorkers: 1,
        totalWorkers: 3,
        totalRssKb: 1024,
        totalCpuPct: 0,
      },
    });
    const { rerender } = render(<MetricsBar />);
    expect(screen.getByText('1')).toBeInTheDocument();
    mockMetrics = makeMetrics({
      totals: {
        liveWorkers: 9,
        totalWorkers: 12,
        totalRssKb: 1024,
        totalCpuPct: 0,
      },
    });
    rerender(<MetricsBar />);
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  // ---- locale flip ----------------------------------------------

  it('re-renders the "live" label in Korean when the locale flips to ko', () => {
    mockMetrics = makeMetrics();
    render(<MetricsBar />);
    expect(screen.getByText('live')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('live')).not.toBeInTheDocument();
  });

  it('re-renders the "load" label in Korean when the locale flips to ko', () => {
    mockMetrics = makeMetrics();
    render(<MetricsBar />);
    expect(screen.getByText(/load 0\.42/)).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText(/load 0\.42/)).not.toBeInTheDocument();
  });
});
