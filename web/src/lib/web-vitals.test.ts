// @vitest-environment jsdom
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// Mock the web-vitals library before importing the
// module under test. The captured callbacks let each
// test fire a synthetic metric without waiting for a
// real Largest Contentful Paint to happen.

type MetricHandler = (m: import('web-vitals').Metric) => void;

const handlers: Record<
  'LCP' | 'INP' | 'CLS' | 'TTFB',
  MetricHandler | null
> = {
  LCP: null,
  INP: null,
  CLS: null,
  TTFB: null,
};

vi.mock('web-vitals', () => ({
  onLCP: (cb: MetricHandler) => {
    handlers.LCP = cb;
  },
  onINP: (cb: MetricHandler) => {
    handlers.INP = cb;
  },
  onCLS: (cb: MetricHandler) => {
    handlers.CLS = cb;
  },
  onTTFB: (cb: MetricHandler) => {
    handlers.TTFB = cb;
  },
}));

import {
  __resetWebVitalsForTest,
  initWebVitals,
} from './web-vitals';

function makeMetric(over: Partial<import('web-vitals').Metric>): import('web-vitals').Metric {
  return {
    name: 'LCP',
    value: 1234,
    id: 'v3-abc',
    rating: 'good',
    delta: 100,
    navigationType: 'navigate',
    entries: [],
    ...over,
  } as unknown as import('web-vitals').Metric;
}

let consoleLogSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  __resetWebVitalsForTest();
  for (const k of Object.keys(handlers) as Array<keyof typeof handlers>) {
    handlers[k] = null;
  }
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  consoleLogSpy.mockRestore();
});

describe('initWebVitals', () => {
  it('registers handlers for LCP / INP / CLS / TTFB (FID dropped in web-vitals v5)', () => {
    initWebVitals();
    expect(handlers.LCP).toBeInstanceOf(Function);
    expect(handlers.INP).toBeInstanceOf(Function);
    expect(handlers.CLS).toBeInstanceOf(Function);
    expect(handlers.TTFB).toBeInstanceOf(Function);
  });

  it('is idempotent (second call does NOT re-register)', () => {
    initWebVitals();
    const firstLCP = handlers.LCP;
    handlers.LCP = null;
    initWebVitals();
    // Second init must NOT overwrite handlers, so the
    // local `handlers.LCP = null` we just did stays
    // null (the second init was a no-op).
    expect(handlers.LCP).toBeNull();
    expect(firstLCP).toBeInstanceOf(Function);
  });

  it('fires the onReport callback for every metric', () => {
    const onReport = vi.fn();
    initWebVitals({ onReport });
    handlers.LCP?.(
      makeMetric({ name: 'LCP', value: 1234, rating: 'good' }),
    );
    handlers.CLS?.(
      makeMetric({ name: 'CLS', value: 0.05, rating: 'good' }),
    );
    expect(onReport).toHaveBeenCalledTimes(2);
    expect(onReport.mock.calls[0]?.[0]?.name).toBe('LCP');
    expect(onReport.mock.calls[1]?.[0]?.name).toBe('CLS');
  });

  it('shapes the report payload with name/value/id/rating/delta/navigationType', () => {
    const onReport = vi.fn();
    initWebVitals({ onReport });
    handlers.INP?.(
      makeMetric({
        name: 'INP',
        value: 220,
        id: 'v3-inp-1',
        rating: 'needs-improvement',
        delta: 50,
        navigationType: 'reload',
      }),
    );
    const report = onReport.mock.calls[0]?.[0];
    expect(report).toEqual({
      name: 'INP',
      value: 220,
      id: 'v3-inp-1',
      rating: 'needs-improvement',
      delta: 50,
      navigationType: 'reload',
    });
  });

  it('swallows errors thrown FROM the reporter (no re-throw into the page)', () => {
    const onReport = vi.fn(() => {
      throw new Error('reporter blew up');
    });
    expect(() => {
      initWebVitals({ onReport });
      handlers.LCP?.(makeMetric({ name: 'LCP', value: 100 }));
    }).not.toThrow();
    expect(onReport).toHaveBeenCalledTimes(1);
  });

  it('logs to console when forceDevLog=true regardless of env', () => {
    initWebVitals({ forceDevLog: true });
    handlers.LCP?.(makeMetric({ name: 'LCP', value: 1234, rating: 'good' }));
    expect(consoleLogSpy).toHaveBeenCalled();
    const message = consoleLogSpy.mock.calls[0]?.[0];
    expect(typeof message).toBe('string');
    expect(message).toContain('[web-vitals]');
    expect(message).toContain('LCP');
    expect(message).toContain('1234.00');
    expect(message).toContain('(good)');
  });

  it('does NOT log to console when forceQuiet=true', () => {
    initWebVitals({ forceQuiet: true, forceDevLog: true });
    handlers.LCP?.(makeMetric({ name: 'LCP', value: 100 }));
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('still fires onReport when forceQuiet=true', () => {
    const onReport = vi.fn();
    initWebVitals({ forceQuiet: true, onReport });
    handlers.LCP?.(makeMetric({ name: 'LCP', value: 100 }));
    expect(onReport).toHaveBeenCalledTimes(1);
  });

  it('runs with no options (no reporter, no log) without throwing', () => {
    expect(() => initWebVitals()).not.toThrow();
    expect(() => {
      handlers.LCP?.(makeMetric({ name: 'LCP', value: 100 }));
    }).not.toThrow();
  });

  it('formats the dev-log message with the metric value to 2 decimals', () => {
    initWebVitals({ forceDevLog: true });
    handlers.CLS?.(makeMetric({ name: 'CLS', value: 0.0567, rating: 'good' }));
    const message = consoleLogSpy.mock.calls[0]?.[0];
    expect(message).toContain('CLS');
    expect(message).toContain('0.06');
  });

  it('__resetWebVitalsForTest allows re-initialization in subsequent tests', () => {
    initWebVitals();
    const firstLCP = handlers.LCP;
    __resetWebVitalsForTest();
    handlers.LCP = null;
    initWebVitals();
    expect(handlers.LCP).toBeInstanceOf(Function);
    expect(handlers.LCP).not.toBe(firstLCP);
  });
});
