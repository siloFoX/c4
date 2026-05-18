import {
  onCLS,
  onINP,
  onLCP,
  onTTFB,
} from 'web-vitals';
import type { Metric } from 'web-vitals';

// (v1.11.359, TODO 11.341) FID is deprecated as of
// web-vitals v5 -- INP replaces it as the canonical
// input-responsiveness Core Web Vital. The dispatch
// mentions FID for backwards compat; we honour the
// spirit (input-latency reporting) via INP and skip
// FID since the library no longer exports it.

// (v1.11.359, TODO 11.341) Core Web Vitals reporter
// glue.
//
// Wraps the `web-vitals` library so a single call from
// App.tsx (`initWebVitals()`) registers the canonical
// metric callbacks: LCP (Largest Contentful Paint),
// FID (First Input Delay -- legacy, still useful for
// reporting compat), INP (Interaction to Next Paint,
// the current CWV input metric), CLS (Cumulative
// Layout Shift), TTFB (Time to First Byte -- not a
// CWV but the most useful network-side signal).
//
// Two report sinks:
//
//   - Dev (`import.meta.env.DEV === true`): always
//     `console.log` each metric so the operator sees
//     CWV measurements in devtools without wiring
//     anything.
//   - Prod: the caller can pass an `onReport` callback
//     that posts to an analytics / RUM endpoint. The
//     console log is skipped in prod so the deployed
//     bundle does not chatter.
//
// The hook is idempotent: a second `initWebVitals()`
// call no-ops via an internal flag so multiple App
// mounts (HMR, tests) do not double-register
// listeners.

export interface WebVitalsReport {
  name: 'LCP' | 'INP' | 'CLS' | 'TTFB';
  value: number;
  id: string;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  navigationType: string;
}

export interface InitWebVitalsOptions {
  // Optional reporter. Receives a fully-formed
  // WebVitalsReport on every metric event. Errors
  // thrown FROM the reporter are swallowed so a buggy
  // sink cannot crash the page.
  onReport?: (report: WebVitalsReport) => void;
  // Force dev logging on regardless of
  // `import.meta.env.DEV`. Used by tests + by
  // operators who want production-bundle debugging.
  forceDevLog?: boolean;
  // Force dev logging off. Useful when a test wants
  // to assert reporter-only behaviour without dev
  // log noise.
  forceQuiet?: boolean;
}

let initialised = false;

// (v1.11.359, TODO 11.341) Reset hook for tests. Clears
// the internal idempotency flag so a single test file
// can drive multiple init cycles. NOT exported via the
// public adoption path (App.tsx never calls it).
export function __resetWebVitalsForTest(): void {
  initialised = false;
}

function safeReport(
  reporter: ((r: WebVitalsReport) => void) | undefined,
  report: WebVitalsReport,
): void {
  if (!reporter) return;
  try {
    reporter(report);
  } catch {
    // Reporter must never re-throw into the page.
  }
}

function shouldLogDev(opts: InitWebVitalsOptions): boolean {
  if (opts.forceQuiet) return false;
  if (opts.forceDevLog) return true;
  try {
    // Vite injects import.meta.env.DEV at build time.
    return Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
}

function metricToReport(metric: Metric): WebVitalsReport {
  return {
    name: metric.name as WebVitalsReport['name'],
    value: metric.value,
    id: metric.id,
    rating: metric.rating as WebVitalsReport['rating'],
    delta: metric.delta,
    navigationType: metric.navigationType,
  };
}

export function initWebVitals(options: InitWebVitalsOptions = {}): void {
  if (initialised) return;
  initialised = true;

  const logDev = shouldLogDev(options);
  const handle = (metric: Metric) => {
    const report = metricToReport(metric);
    if (logDev) {
      // eslint-disable-next-line no-console
      console.log(
        `[web-vitals] ${report.name}=${report.value.toFixed(2)} (${report.rating})`,
      );
    }
    safeReport(options.onReport, report);
  };

  // (v1.11.359, TODO 11.341) Register all five metric
  // callbacks. Each `on*` listener wakes when the
  // metric resolves; the web-vitals library handles
  // page-visibility transitions for the
  // delayed-final-value semantics of CLS / INP.
  onLCP(handle);
  onINP(handle);
  onCLS(handle);
  onTTFB(handle);
}
