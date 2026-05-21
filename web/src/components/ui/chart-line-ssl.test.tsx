import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ChartLineSsl,
  classifyLineSslZone,
  computeLineSsl,
  computeLineSslHlv,
  computeLineSslLayout,
  computeLineSslSma,
  describeLineSslChart,
  getLineSslFinitePoints,
  normalizeLineSslPeriod,
  runLineSsl,
  type ChartLineSslPoint,
} from './chart-line-ssl';

/**
 * Fixture: 7 OHLC bars read with period 2. Every high and low is even, so
 * the period-2 moving averages are exact integers. The close crosses above
 * the high average (bar 1), holds, crosses below the low average (bar 3),
 * holds, then crosses back above (bar 5) -- so the whole SSL pipeline,
 * including the carried direction state, is exact integer arithmetic.
 */
const SSL_DATA: ChartLineSslPoint[] = [
  { x: 1, high: 30, low: 10, close: 20 },
  { x: 2, high: 40, low: 20, close: 38 },
  { x: 3, high: 50, low: 30, close: 44 },
  { x: 4, high: 44, low: 8, close: 12 },
  { x: 5, high: 30, low: 4, close: 20 },
  { x: 6, high: 60, low: 20, close: 56 },
  { x: 7, high: 70, low: 40, close: 50 },
];
const OPTS = { period: 2 };

const SMA_HIGH_EXPECTED = [null, 35, 45, 47, 37, 45, 65];
const SMA_LOW_EXPECTED = [null, 15, 25, 19, 6, 12, 30];
const HLV_EXPECTED = [0, 1, 1, -1, -1, 1, 1];
const SSL_UP_EXPECTED = [null, 35, 45, 19, 6, 45, 65];
const SSL_DOWN_EXPECTED = [null, 15, 25, 47, 37, 12, 30];
const ZONE_EXPECTED = ['none', 'up', 'up', 'down', 'down', 'up', 'up'];

describe('getLineSslFinitePoints', () => {
  it('keeps only bars with finite x, high, low and close', () => {
    const out = getLineSslFinitePoints([
      { x: 1, high: 30, low: 10, close: 20 },
      { x: Number.NaN, high: 10, low: 5, close: 7 },
      { x: 3, high: 12, low: Number.POSITIVE_INFINITY, close: 7 },
      { x: 4, high: 20, low: 10, close: 15 },
    ]);
    expect(out).toEqual([
      { x: 1, high: 30, low: 10, close: 20 },
      { x: 4, high: 20, low: 10, close: 15 },
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineSslFinitePoints(null)).toEqual([]);
    expect(getLineSslFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(getLineSslFinitePoints([])).toEqual([]);
  });

  it('preserves the input order', () => {
    const out = getLineSslFinitePoints([
      { x: 9, high: 5, low: 1, close: 3 },
      { x: 2, high: 6, low: 2, close: 4 },
      { x: 5, high: 7, low: 3, close: 5 },
    ]);
    expect(out.map((p) => p.x)).toEqual([9, 2, 5]);
  });
});

describe('normalizeLineSslPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineSslPeriod(20, 10)).toBe(20);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineSslPeriod(7.9, 10)).toBe(7);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineSslPeriod(0, 10)).toBe(10);
    expect(normalizeLineSslPeriod(-3, 10)).toBe(10);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineSslPeriod(Number.NaN, 10)).toBe(10);
    expect(normalizeLineSslPeriod('x', 10)).toBe(10);
  });

  it('allows the minimum period of one', () => {
    expect(normalizeLineSslPeriod(1, 10)).toBe(1);
  });
});

describe('computeLineSslSma', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineSslSma(null, 2)).toEqual([]);
  });

  it('keeps the warm-up window null', () => {
    expect(computeLineSslSma([10, 20, 30, 40], 2)[0]).toBeNull();
  });

  it('is the simple moving average of the window', () => {
    expect(computeLineSslSma([10, 20, 30, 40], 2)).toEqual([
      null, 15, 25, 35,
    ]);
  });

  it('matches the input length', () => {
    expect(computeLineSslSma([1, 2, 3, 4, 5], 2)).toHaveLength(5);
  });

  it('yields null for a window with a non-finite value', () => {
    expect(computeLineSslSma([10, Number.NaN, 30, 40], 2)).toEqual([
      null,
      null,
      null,
      35,
    ]);
  });
});

describe('computeLineSslHlv', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineSslHlv(null, [], [])).toEqual([]);
  });

  it('matches the input length', () => {
    expect(
      computeLineSslHlv([20, 38, 44, 12], [null, 35, 45, 47], [null, 15, 25, 19]),
    ).toHaveLength(4);
  });

  it('is zero on a bar without both moving averages', () => {
    expect(computeLineSslHlv([20, 38], [null, 35], [null, 15])[0]).toBe(0);
  });

  it('flips up when the close crosses above the high average', () => {
    expect(computeLineSslHlv([40], [35], [10])[0]).toBe(1);
  });

  it('flips down when the close crosses below the low average', () => {
    expect(computeLineSslHlv([8], [35], [10])[0]).toBe(-1);
  });

  it('carries the direction between crosses', () => {
    // 40 crosses up, 30 sits inside the channel -> carries +1.
    expect(computeLineSslHlv([40, 30], [35, 35], [10, 10])).toEqual([1, 1]);
  });

  it('stays zero before any cross', () => {
    expect(computeLineSslHlv([20], [30], [10])).toEqual([0]);
  });

  it('does not flip up when the close only equals the high average', () => {
    expect(computeLineSslHlv([30], [30], [10])).toEqual([0]);
  });

  it('computes the exact direction state for the fixture closes', () => {
    expect(
      computeLineSslHlv(
        SSL_DATA.map((b) => b.close),
        SMA_HIGH_EXPECTED,
        SMA_LOW_EXPECTED,
      ),
    ).toEqual(HLV_EXPECTED);
  });
});

describe('computeLineSsl', () => {
  it('returns empty arrays for a non-array input', () => {
    const out = computeLineSsl(null, 2);
    expect(out.smaHigh).toEqual([]);
    expect(out.hlv).toEqual([]);
    expect(out.sslUp).toEqual([]);
  });

  it('matches every array to the input length', () => {
    const out = computeLineSsl(SSL_DATA, 2);
    expect(out.smaHigh).toHaveLength(SSL_DATA.length);
    expect(out.smaLow).toHaveLength(SSL_DATA.length);
    expect(out.hlv).toHaveLength(SSL_DATA.length);
    expect(out.sslUp).toHaveLength(SSL_DATA.length);
    expect(out.sslDown).toHaveLength(SSL_DATA.length);
  });

  it('computes the exact high moving average', () => {
    expect(computeLineSsl(SSL_DATA, 2).smaHigh).toEqual(SMA_HIGH_EXPECTED);
  });

  it('computes the exact low moving average', () => {
    expect(computeLineSsl(SSL_DATA, 2).smaLow).toEqual(SMA_LOW_EXPECTED);
  });

  it('computes the exact direction state', () => {
    expect(computeLineSsl(SSL_DATA, 2).hlv).toEqual(HLV_EXPECTED);
  });

  it('computes the exact SSL Up line', () => {
    expect(computeLineSsl(SSL_DATA, 2).sslUp).toEqual(SSL_UP_EXPECTED);
  });

  it('computes the exact SSL Down line', () => {
    expect(computeLineSsl(SSL_DATA, 2).sslDown).toEqual(SSL_DOWN_EXPECTED);
  });

  it('rides the high average with SSL Up in an uptrend', () => {
    const out = computeLineSsl(SSL_DATA, 2);
    expect(out.sslUp[1]).toBe(out.smaHigh[1]);
  });

  it('rides the high average with SSL Down in a downtrend', () => {
    const out = computeLineSsl(SSL_DATA, 2);
    expect(out.sslDown[3]).toBe(out.smaHigh[3]);
  });

  it('swaps the SSL lines when the direction flips', () => {
    const out = computeLineSsl(SSL_DATA, 2);
    // bar 2 uptrend: SSL Up above SSL Down. bar 3 downtrend: swapped.
    expect(out.sslUp[2]!).toBeGreaterThan(out.sslDown[2]!);
    expect(out.sslUp[3]!).toBeLessThan(out.sslDown[3]!);
  });
});

describe('classifyLineSslZone', () => {
  it('is up for a positive direction state', () => {
    expect(classifyLineSslZone(1)).toBe('up');
  });

  it('is down for a negative direction state', () => {
    expect(classifyLineSslZone(-1)).toBe('down');
  });

  it('is none for a zero direction state', () => {
    expect(classifyLineSslZone(0)).toBe('none');
  });

  it('is up for any positive value', () => {
    expect(classifyLineSslZone(5)).toBe('up');
  });
});

describe('runLineSsl', () => {
  it('is not ok for a series shorter than two bars', () => {
    expect(
      runLineSsl([{ x: 1, high: 30, low: 10, close: 20 }], OPTS).ok,
    ).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(runLineSsl(SSL_DATA, OPTS).ok).toBe(true);
  });

  it('carries the default period', () => {
    expect(runLineSsl(SSL_DATA).period).toBe(10);
  });

  it('honours a custom period', () => {
    expect(runLineSsl(SSL_DATA, OPTS).period).toBe(2);
  });

  it('computes the exact SSL lines', () => {
    const run = runLineSsl(SSL_DATA, OPTS);
    expect(run.sslUp).toEqual(SSL_UP_EXPECTED);
    expect(run.sslDown).toEqual(SSL_DOWN_EXPECTED);
  });

  it('computes the exact direction state', () => {
    expect(runLineSsl(SSL_DATA, OPTS).hlv).toEqual(HLV_EXPECTED);
  });

  it('classifies the zone of every bar', () => {
    const run = runLineSsl(SSL_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual(ZONE_EXPECTED);
  });

  it('has self-consistent zone counts', () => {
    const run = runLineSsl(SSL_DATA, OPTS);
    expect(run.upCount).toBe(4);
    expect(run.downCount).toBe(2);
  });

  it('reports the final direction', () => {
    expect(runLineSsl(SSL_DATA, OPTS).hlvFinal).toBe(1);
  });

  it('carries the high and low moving averages', () => {
    const run = runLineSsl(SSL_DATA, OPTS);
    expect(run.smaHigh).toEqual(SMA_HIGH_EXPECTED);
    expect(run.smaLow).toEqual(SMA_LOW_EXPECTED);
  });

  it('emits one sample per bar', () => {
    expect(runLineSsl(SSL_DATA, OPTS).samples).toHaveLength(SSL_DATA.length);
  });

  it('sorts the input by x', () => {
    const shuffled = [...SSL_DATA].reverse();
    const run = runLineSsl(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual(SSL_DATA.map((p) => p.x));
    expect(run.hlv).toEqual(HLV_EXPECTED);
  });

  it('is not ok for an empty series', () => {
    expect(runLineSsl([], OPTS).ok).toBe(false);
    expect(runLineSsl(null, OPTS).ok).toBe(false);
  });
});

describe('computeLineSslLayout', () => {
  it('is not ok for a single bar', () => {
    const layout = computeLineSslLayout({
      data: [{ x: 1, high: 30, low: 10, close: 20 }],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineSslLayout({
      data: SSL_DATA,
      ...OPTS,
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(computeLineSslLayout({ data: SSL_DATA, ...OPTS }).ok).toBe(true);
  });

  it('builds the price and SSL paths', () => {
    const layout = computeLineSslLayout({ data: SSL_DATA, ...OPTS });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.sslUpPath.startsWith('M')).toBe(true);
    expect(layout.sslDownPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineSslLayout({ data: SSL_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(SSL_DATA.length);
  });

  it('emits one marker per bar with a defined channel', () => {
    const layout = computeLineSslLayout({ data: SSL_DATA, ...OPTS });
    const defined = layout.run.sslUp.filter((v) => v !== null).length;
    expect(layout.markers).toHaveLength(defined);
  });

  it('keeps every marker inside the panel', () => {
    const layout = computeLineSslLayout({ data: SSL_DATA, ...OPTS });
    for (const marker of layout.markers) {
      expect(marker.cy).toBeGreaterThanOrEqual(layout.innerTop - 0.01);
      expect(marker.cy).toBeLessThanOrEqual(layout.innerBottom + 0.01);
    }
  });

  it('spans the value domain over the close and SSL lines', () => {
    const layout = computeLineSslLayout({ data: SSL_DATA, ...OPTS });
    expect(layout.valueMin).toBeLessThanOrEqual(6);
    expect(layout.valueMax).toBeGreaterThanOrEqual(65);
  });

  it('carries the run on the layout', () => {
    const layout = computeLineSslLayout({ data: SSL_DATA, ...OPTS });
    expect(layout.run.period).toBe(2);
  });
});

describe('describeLineSslChart', () => {
  it('names the indicator', () => {
    expect(describeLineSslChart(SSL_DATA, OPTS)).toContain('SSL Channel');
  });

  it('mentions the moving averages and the cross', () => {
    const text = describeLineSslChart(SSL_DATA, OPTS);
    expect(text).toContain('moving average');
    expect(text).toContain('cross');
  });

  it('reports the direction counts', () => {
    const text = describeLineSslChart(SSL_DATA, OPTS);
    expect(text).toContain('up on 4');
    expect(text).toContain('down on 2');
  });

  it('returns No data for an empty series', () => {
    expect(describeLineSslChart([], OPTS)).toBe('No data');
  });
});

describe('ChartLineSsl component', () => {
  it('renders a labelled region', () => {
    render(<ChartLineSsl data={SSL_DATA} {...OPTS} />);
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineSsl data={SSL_DATA} {...OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-ssl-aria-desc"]',
    );
    expect(desc?.textContent).toContain('SSL Channel');
  });

  it('renders the empty state for no data', () => {
    const { container } = render(<ChartLineSsl data={[]} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-ssl-empty"]'),
    ).toBeInTheDocument();
  });

  it('marks the root with the run summary', () => {
    const { container } = render(<ChartLineSsl data={SSL_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-ssl"]');
    expect(root?.getAttribute('data-period')).toBe('2');
    expect(root?.getAttribute('data-up-count')).toBe('4');
    expect(root?.getAttribute('data-total-points')).toBe('7');
  });

  it('renders an img-role svg', () => {
    render(<ChartLineSsl data={SSL_DATA} {...OPTS} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('draws the price and both SSL lines', () => {
    const { container } = render(<ChartLineSsl data={SSL_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-ssl-price-path"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-ssl-ssl-up-line"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-ssl-ssl-down-line"]'),
    ).toBeInTheDocument();
  });

  it('renders one marker per bar with a defined channel', () => {
    const run = runLineSsl(SSL_DATA, OPTS);
    const defined = run.sslUp.filter((v) => v !== null).length;
    const { container } = render(<ChartLineSsl data={SSL_DATA} {...OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-ssl-marker"]',
    );
    expect(markers).toHaveLength(defined);
  });

  it('tags each marker with its zone', () => {
    const { container } = render(<ChartLineSsl data={SSL_DATA} {...OPTS} />);
    const markers = Array.from(
      container.querySelectorAll('[data-section="chart-line-ssl-marker"]'),
    );
    expect(markers.map((m) => m.getAttribute('data-zone'))).toEqual([
      'up',
      'up',
      'down',
      'down',
      'up',
      'up',
    ]);
  });

  it('shows the config badge', () => {
    const { container } = render(<ChartLineSsl data={SSL_DATA} {...OPTS} />);
    const badge = container.querySelector(
      '[data-section="chart-line-ssl-badge-config"]',
    );
    expect(badge?.textContent).toBe('SSL 2');
  });

  it('hides the SSL Up line when its legend item is toggled', () => {
    const { container } = render(<ChartLineSsl data={SSL_DATA} {...OPTS} />);
    const button = container.querySelector(
      '[data-section="chart-line-ssl-legend-item"][data-series-id="sslUp"]',
    ) as HTMLButtonElement;
    fireEvent.click(button);
    expect(
      container.querySelector('[data-section="chart-line-ssl-ssl-up-line"]'),
    ).not.toBeInTheDocument();
  });

  it('hides the SSL Down line when showSslDown is false', () => {
    const { container } = render(
      <ChartLineSsl data={SSL_DATA} {...OPTS} showSslDown={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ssl-ssl-down-line"]'),
    ).not.toBeInTheDocument();
  });

  it('honours a controlled hiddenSeries for the price line', () => {
    const { container } = render(
      <ChartLineSsl data={SSL_DATA} {...OPTS} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ssl-price-path"]'),
    ).not.toBeInTheDocument();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineSsl data={SSL_DATA} {...OPTS} onPointClick={onPointClick} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-ssl-marker"]',
    ) as SVGElement;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineSsl ref={ref} data={SSL_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe('chart-line-ssl');
  });
});
