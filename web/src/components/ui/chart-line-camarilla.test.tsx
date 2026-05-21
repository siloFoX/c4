import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineCamarilla,
  getLineCamarillaFinitePoints,
  computeLineCamarillaPivots,
  computeLineCamarilla,
  runLineCamarilla,
  computeLineCamarillaLayout,
  describeLineCamarillaChart,
  type ChartLineCamarillaPoint,
} from './chart-line-camarilla';

afterEach(() => cleanup());

// Every bar has a high-to-low range of exactly 120: the Camarilla
// offsets range * 11 / {120, 60, 40, 20} then land on the exact
// integers 11, 22, 33, 66, so each bar's eight pivot levels --
// derived from the prior bar's close -- are exact integers.
const CAMARILLA_BARS: ChartLineCamarillaPoint[] = [
  { x: 0, high: 120, low: 0, close: 60 },
  { x: 1, high: 130, low: 10, close: 100 },
  { x: 2, high: 140, low: 20, close: 60 },
  { x: 3, high: 120, low: 0, close: 20 },
  { x: 4, high: 130, low: 10, close: 60 },
  { x: 5, high: 150, low: 30, close: 100 },
  { x: 6, high: 160, low: 40, close: 95 },
  { x: 7, high: 140, low: 20, close: 55 },
  { x: 8, high: 150, low: 30, close: 90 },
  { x: 9, high: 130, low: 10, close: 50 },
];

const R3_EXPECTED = [null, 93, 133, 93, 53, 93, 133, 128, 88, 123];
const S3_EXPECTED = [null, 27, 67, 27, -13, 27, 67, 62, 22, 57];
const R4_EXPECTED = [null, 126, 166, 126, 86, 126, 166, 161, 121, 156];
const S4_EXPECTED = [null, -6, 34, -6, -46, -6, 34, 29, -11, 24];
const ZONE_EXPECTED = [
  'none',
  'bull',
  'bear',
  'bear',
  'bull',
  'bull',
  'neutral',
  'bear',
  'bull',
  'bear',
];

describe('getLineCamarillaFinitePoints', () => {
  it('keeps only bars with a finite x, high, low and close', () => {
    const points = [
      { x: 0, high: 5, low: 3, close: 4 },
      { x: 1, high: Number.NaN, low: 3, close: 4 },
      { x: 2, high: 5, low: 3, close: Number.POSITIVE_INFINITY },
      { x: 3, high: 9, low: 7, close: 8 },
    ] as ChartLineCamarillaPoint[];
    expect(getLineCamarillaFinitePoints(points)).toEqual([
      { x: 0, high: 5, low: 3, close: 4 },
      { x: 3, high: 9, low: 7, close: 8 },
    ]);
  });
  it('returns an empty array for a non-array input', () => {
    expect(getLineCamarillaFinitePoints(null)).toEqual([]);
  });
  it('returns an empty array for an empty input', () => {
    expect(getLineCamarillaFinitePoints([])).toEqual([]);
  });
  it('preserves the input order', () => {
    const points = [
      { x: 5, high: 2, low: 1, close: 1.5 },
      { x: 2, high: 4, low: 3, close: 3.5 },
    ] as ChartLineCamarillaPoint[];
    expect(getLineCamarillaFinitePoints(points)).toEqual(points);
  });
});

describe('computeLineCamarillaPivots', () => {
  it('computes the eight exact pivot levels', () => {
    expect(computeLineCamarillaPivots(120, 0, 60)).toEqual({
      r1: 71,
      r2: 82,
      r3: 93,
      r4: 126,
      s1: 49,
      s2: 38,
      s3: 27,
      s4: -6,
    });
  });
  it('orders the resistance levels above the close', () => {
    const p = computeLineCamarillaPivots(120, 0, 60);
    expect(p.r4).toBeGreaterThan(p.r3);
    expect(p.r3).toBeGreaterThan(p.r2);
    expect(p.r2).toBeGreaterThan(p.r1);
    expect(p.r1).toBeGreaterThan(60);
  });
  it('orders the support levels below the close', () => {
    const p = computeLineCamarillaPivots(120, 0, 60);
    expect(p.s1).toBeLessThan(60);
    expect(p.s2).toBeLessThan(p.s1);
    expect(p.s3).toBeLessThan(p.s2);
    expect(p.s4).toBeLessThan(p.s3);
  });
  it('places resistance and support symmetrically around the close', () => {
    const p = computeLineCamarillaPivots(120, 0, 60);
    expect(p.r3 - 60).toBe(60 - p.s3);
    expect(p.r4 - 60).toBe(60 - p.s4);
  });
  it('collapses every level onto the close for a zero-range bar', () => {
    expect(computeLineCamarillaPivots(50, 50, 30)).toEqual({
      r1: 30,
      r2: 30,
      r3: 30,
      r4: 30,
      s1: 30,
      s2: 30,
      s3: 30,
      s4: 30,
    });
  });
});

describe('computeLineCamarilla', () => {
  it('returns empty arrays for a non-array input', () => {
    expect(computeLineCamarilla(null)).toEqual({
      r1: [],
      r2: [],
      r3: [],
      r4: [],
      s1: [],
      s2: [],
      s3: [],
      s4: [],
    });
  });
  it('leaves the opening bar null', () => {
    const levels = computeLineCamarilla(CAMARILLA_BARS);
    expect(levels.r3[0]).toBeNull();
    expect(levels.s3[0]).toBeNull();
  });
  it('derives the R3 level from the prior bar', () => {
    expect(computeLineCamarilla(CAMARILLA_BARS).r3).toEqual(R3_EXPECTED);
  });
  it('derives the S3 level from the prior bar', () => {
    expect(computeLineCamarilla(CAMARILLA_BARS).s3).toEqual(S3_EXPECTED);
  });
  it('derives the outer R4 and S4 breakout levels', () => {
    const levels = computeLineCamarilla(CAMARILLA_BARS);
    expect(levels.r4).toEqual(R4_EXPECTED);
    expect(levels.s4).toEqual(S4_EXPECTED);
  });
  it('matches the input length on every level', () => {
    const levels = computeLineCamarilla(CAMARILLA_BARS);
    expect(levels.r1).toHaveLength(CAMARILLA_BARS.length);
    expect(levels.s4).toHaveLength(CAMARILLA_BARS.length);
  });
});

describe('runLineCamarilla', () => {
  it('is not ok with fewer than two bars', () => {
    expect(
      runLineCamarilla([{ x: 0, high: 2, low: 1, close: 1.5 }]).ok,
    ).toBe(false);
  });
  it('is ok with a usable series', () => {
    expect(runLineCamarilla(CAMARILLA_BARS).ok).toBe(true);
  });
  it('exposes the exact R3 and S3 level series', () => {
    const run = runLineCamarilla(CAMARILLA_BARS);
    expect(run.r3).toEqual(R3_EXPECTED);
    expect(run.s3).toEqual(S3_EXPECTED);
  });
  it('classifies each bar against the R3 and S3 reversal levels', () => {
    expect(runLineCamarilla(CAMARILLA_BARS).samples.map((s) => s.zone)).toEqual(
      ZONE_EXPECTED,
    );
  });
  it('returns one sample per bar', () => {
    expect(runLineCamarilla(CAMARILLA_BARS).samples).toHaveLength(
      CAMARILLA_BARS.length,
    );
  });
  it('carries all eight levels on each sample', () => {
    const s = runLineCamarilla(CAMARILLA_BARS).samples[1]!;
    expect(s.r1).toBe(71);
    expect(s.r4).toBe(126);
    expect(s.s4).toBe(-6);
  });
  it('counts the bull, bear and neutral bars', () => {
    const run = runLineCamarilla(CAMARILLA_BARS);
    expect(run.bullCount).toBe(4);
    expect(run.bearCount).toBe(4);
    expect(run.neutralCount).toBe(1);
  });
  it('reports the final R3 and S3 readings', () => {
    const run = runLineCamarilla(CAMARILLA_BARS);
    expect(run.r3Final).toBe(123);
    expect(run.s3Final).toBe(57);
  });
  it('sorts unsorted input by x', () => {
    const shuffled = [...CAMARILLA_BARS].reverse();
    const run = runLineCamarilla(shuffled);
    const xs = run.series.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });
});

describe('computeLineCamarillaLayout', () => {
  const base = {
    data: CAMARILLA_BARS,
    width: 560,
    height: 360,
    padding: 40,
  };
  it('is not ok for a single bar', () => {
    expect(
      computeLineCamarillaLayout({
        ...base,
        data: [{ x: 0, high: 2, low: 1, close: 1.5 }],
      }).ok,
    ).toBe(false);
  });
  it('is not ok for a collapsed canvas', () => {
    expect(computeLineCamarillaLayout({ ...base, width: 0 }).ok).toBe(false);
  });
  it('is ok for a usable series', () => {
    expect(computeLineCamarillaLayout(base).ok).toBe(true);
  });
  it('builds the price path', () => {
    expect(computeLineCamarillaLayout(base).pricePath.length).toBeGreaterThan(
      0,
    );
  });
  it('emits eight level lines', () => {
    const layout = computeLineCamarillaLayout(base);
    expect(layout.levelLines).toHaveLength(8);
    expect(layout.levelLines.filter((l) => l.kind === 'resistance')).toHaveLength(
      4,
    );
    expect(layout.levelLines.filter((l) => l.kind === 'support')).toHaveLength(
      4,
    );
  });
  it('spans the y-domain across the price and the outer levels', () => {
    const layout = computeLineCamarillaLayout(base);
    expect(layout.yMin).toBe(-46);
    expect(layout.yMax).toBe(166);
  });
  it('emits one marker per classified bar', () => {
    const layout = computeLineCamarillaLayout(base);
    expect(layout.markers).toHaveLength(9);
    expect(layout.priceDots).toHaveLength(CAMARILLA_BARS.length);
  });
  it('reports the total bar count and final readings', () => {
    const layout = computeLineCamarillaLayout(base);
    expect(layout.totalPoints).toBe(CAMARILLA_BARS.length);
    expect(layout.r3Final).toBe(123);
  });
});

describe('describeLineCamarillaChart', () => {
  it('reports no data for an empty series', () => {
    expect(describeLineCamarillaChart([])).toBe('No data');
  });
  it('names the Camarilla pivot levels', () => {
    expect(describeLineCamarillaChart(CAMARILLA_BARS)).toContain(
      'Camarilla pivot levels',
    );
  });
  it('explains the prior-bar derivation and the level groups', () => {
    const desc = describeLineCamarillaChart(CAMARILLA_BARS);
    expect(desc).toContain('prior bar');
    expect(desc).toContain('resistance');
    expect(desc).toContain('support');
  });
  it('reports the zone counts', () => {
    expect(describeLineCamarillaChart(CAMARILLA_BARS)).toContain(
      'clears R3 on 4 bars',
    );
  });
});

describe('ChartLineCamarilla', () => {
  it('renders an accessible region', () => {
    const { getByRole } = render(<ChartLineCamarilla data={CAMARILLA_BARS} />);
    expect(getByRole('region')).toBeTruthy();
  });
  it('applies the aria label', () => {
    const { getByRole } = render(
      <ChartLineCamarilla data={CAMARILLA_BARS} ariaLabel="CAM demo" />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe('CAM demo');
  });
  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLineCamarilla data={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-camarilla"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });
  it('marks the populated root as not empty', () => {
    const { container } = render(<ChartLineCamarilla data={CAMARILLA_BARS} />);
    const root = container.querySelector(
      '[data-section="chart-line-camarilla"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('false');
  });
  it('exposes the final levels and counts as data attributes', () => {
    const { container } = render(<ChartLineCamarilla data={CAMARILLA_BARS} />);
    const root = container.querySelector(
      '[data-section="chart-line-camarilla"]',
    );
    expect(root?.getAttribute('data-r3-final')).toBe('123');
    expect(root?.getAttribute('data-bull-count')).toBe('4');
  });
  it('renders an img-role svg', () => {
    const { container } = render(<ChartLineCamarilla data={CAMARILLA_BARS} />);
    const svg = container.querySelector(
      '[data-section="chart-line-camarilla-svg"]',
    );
    expect(svg?.getAttribute('role')).toBe('img');
  });
  it('renders the eight Camarilla level lines', () => {
    const { container } = render(<ChartLineCamarilla data={CAMARILLA_BARS} />);
    const levels = container.querySelectorAll(
      '[data-section="chart-line-camarilla-level-line"]',
    );
    expect(levels).toHaveLength(8);
  });
  it('renders one marker per classified bar', () => {
    const { container } = render(<ChartLineCamarilla data={CAMARILLA_BARS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-camarilla-marker"]',
    );
    expect(markers).toHaveLength(9);
  });
  it('shows the bar count in the config badge', () => {
    const { container } = render(<ChartLineCamarilla data={CAMARILLA_BARS} />);
    const cfg = container.querySelector(
      '[data-section="chart-line-camarilla-badge-config"]',
    );
    expect(cfg?.textContent).toBe('10 bars');
  });
  it('renders three legend items', () => {
    const { container } = render(<ChartLineCamarilla data={CAMARILLA_BARS} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-camarilla-legend-item"]',
    );
    expect(items).toHaveLength(3);
  });
  it('hides the resistance levels when its legend item is clicked', () => {
    const { container } = render(<ChartLineCamarilla data={CAMARILLA_BARS} />);
    const item = container.querySelector(
      '[data-section="chart-line-camarilla-legend-item"][data-series-id="resistance"]',
    ) as HTMLElement;
    fireEvent.click(item);
    const levels = container.querySelectorAll(
      '[data-section="chart-line-camarilla-level-line"]',
    );
    expect(levels).toHaveLength(4);
  });
  it('honours a controlled hiddenSeries set', () => {
    const { container } = render(
      <ChartLineCamarilla
        data={CAMARILLA_BARS}
        hiddenSeries={new Set(['price'])}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-camarilla-price-path"]',
      ),
    ).toBeNull();
  });
  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineCamarilla ref={ref} data={CAMARILLA_BARS} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
