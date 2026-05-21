import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ChartLineRainbow,
  classifyLineRainbowZone,
  computeLineRainbowBands,
  computeLineRainbowLayout,
  computeLineRainbowSma,
  describeLineRainbowChart,
  getLineRainbowBandColor,
  getLineRainbowFinitePoints,
  normalizeLineRainbowInt,
  runLineRainbow,
  type ChartLineRainbowPoint,
} from './chart-line-rainbow';

/**
 * Fixture: a 10-bar linear ramp read with period 3 and 3 bands. A 3-period
 * SMA of an arithmetic progression is its centre value, so each recursive
 * band is the previous band lagged exactly one bar -- band k at bar i is
 * 10*(i-k). Every /3 average is of three consecutive multiples of 10, so
 * the bands land on exact integers. The ramp rises faster than the bands
 * lag, so once the full rainbow is defined the price runs above it.
 */
const RAINBOW_DATA: ChartLineRainbowPoint[] = [
  { x: 1, value: 10 },
  { x: 2, value: 20 },
  { x: 3, value: 30 },
  { x: 4, value: 40 },
  { x: 5, value: 50 },
  { x: 6, value: 60 },
  { x: 7, value: 70 },
  { x: 8, value: 80 },
  { x: 9, value: 90 },
  { x: 10, value: 100 },
];
const RAINBOW_VALUES = RAINBOW_DATA.map((p) => p.value);
const OPTS = { period: 3, bandCount: 3 };

const BAND0_EXPECTED = [null, null, 20, 30, 40, 50, 60, 70, 80, 90];
const BAND1_EXPECTED = [null, null, null, null, 30, 40, 50, 60, 70, 80];
const BAND2_EXPECTED = [null, null, null, null, null, null, 40, 50, 60, 70];
const ZONE_EXPECTED = [
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'above',
  'above',
  'above',
  'above',
];

// 8 bars so the third band (period 3) is defined within range.
const CONST_DATA: ChartLineRainbowPoint[] = [
  { x: 1, value: 8 },
  { x: 2, value: 8 },
  { x: 3, value: 8 },
  { x: 4, value: 8 },
  { x: 5, value: 8 },
  { x: 6, value: 8 },
  { x: 7, value: 8 },
  { x: 8, value: 8 },
];

describe('getLineRainbowFinitePoints', () => {
  it('keeps only points with a finite x and a finite value', () => {
    const out = getLineRainbowFinitePoints([
      { x: 1, value: 10 },
      { x: Number.NaN, value: 20 },
      { x: 3, value: Number.POSITIVE_INFINITY },
      { x: 4, value: 40 },
    ]);
    expect(out).toEqual([
      { x: 1, value: 10 },
      { x: 4, value: 40 },
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineRainbowFinitePoints(null)).toEqual([]);
    expect(getLineRainbowFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(getLineRainbowFinitePoints([])).toEqual([]);
  });

  it('preserves the input order', () => {
    const out = getLineRainbowFinitePoints([
      { x: 9, value: 1 },
      { x: 2, value: 2 },
      { x: 5, value: 3 },
    ]);
    expect(out.map((p) => p.x)).toEqual([9, 2, 5]);
  });
});

describe('normalizeLineRainbowInt', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineRainbowInt(8, 2)).toBe(8);
  });

  it('floors a fractional value', () => {
    expect(normalizeLineRainbowInt(5.9, 2)).toBe(5);
  });

  it('falls back when the value is below one', () => {
    expect(normalizeLineRainbowInt(0, 6)).toBe(6);
    expect(normalizeLineRainbowInt(-3, 6)).toBe(6);
  });

  it('falls back when the value is not finite', () => {
    expect(normalizeLineRainbowInt(Number.NaN, 6)).toBe(6);
    expect(normalizeLineRainbowInt('x', 6)).toBe(6);
  });

  it('allows the minimum of one', () => {
    expect(normalizeLineRainbowInt(1, 6)).toBe(1);
  });
});

describe('computeLineRainbowSma', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineRainbowSma(null, 2)).toEqual([]);
  });

  it('keeps the warm-up window null', () => {
    expect(computeLineRainbowSma([10, 20, 30, 40], 2)[0]).toBeNull();
  });

  it('is the simple moving average of the window', () => {
    expect(computeLineRainbowSma([10, 20, 30, 40], 2)).toEqual([
      null, 15, 25, 35,
    ]);
  });

  it('matches the input length', () => {
    expect(computeLineRainbowSma(RAINBOW_VALUES, 3)).toHaveLength(
      RAINBOW_VALUES.length,
    );
  });

  it('yields null for a window touching a null slot', () => {
    expect(computeLineRainbowSma([10, null, 30, 40], 2)).toEqual([
      null,
      null,
      null,
      35,
    ]);
  });
});

describe('computeLineRainbowBands', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineRainbowBands(null, 3, 3)).toEqual([]);
  });

  it('returns one array per band', () => {
    expect(computeLineRainbowBands(RAINBOW_VALUES, 3, 3)).toHaveLength(3);
  });

  it('makes the first band the SMA of the prices', () => {
    expect(computeLineRainbowBands(RAINBOW_VALUES, 3, 3)[0]).toEqual(
      BAND0_EXPECTED,
    );
  });

  it('makes the second band the SMA of the first', () => {
    expect(computeLineRainbowBands(RAINBOW_VALUES, 3, 3)[1]).toEqual(
      BAND1_EXPECTED,
    );
  });

  it('makes the third band the SMA of the second', () => {
    expect(computeLineRainbowBands(RAINBOW_VALUES, 3, 3)[2]).toEqual(
      BAND2_EXPECTED,
    );
  });

  it('recursively smooths -- band k is the SMA of band k-1', () => {
    const bands = computeLineRainbowBands(RAINBOW_VALUES, 3, 3);
    expect(bands[1]).toEqual(computeLineRainbowSma(bands[0]!, 3));
    expect(bands[2]).toEqual(computeLineRainbowSma(bands[1]!, 3));
  });

  it('keeps every band the input length', () => {
    for (const band of computeLineRainbowBands(RAINBOW_VALUES, 3, 3)) {
      expect(band).toHaveLength(RAINBOW_VALUES.length);
    }
  });

  it('keeps a constant series constant across every band', () => {
    const bands = computeLineRainbowBands([8, 8, 8, 8, 8, 8], 2, 3);
    expect(bands[0]).toEqual([null, 8, 8, 8, 8, 8]);
    expect(bands[2]).toEqual([null, null, null, 8, 8, 8]);
  });

  it('lags each band one more bar than the band before it', () => {
    const bands = computeLineRainbowBands(RAINBOW_VALUES, 3, 3);
    const firstDefined = (b: (number | null)[]): number =>
      b.findIndex((v) => v !== null);
    expect(firstDefined(bands[1]!)).toBe(firstDefined(bands[0]!) + 2);
    expect(firstDefined(bands[2]!)).toBe(firstDefined(bands[1]!) + 2);
  });
});

describe('classifyLineRainbowZone', () => {
  it('is above when the price tops the envelope', () => {
    expect(classifyLineRainbowZone(50, 20, 40)).toBe('above');
  });

  it('is below when the price is under the envelope', () => {
    expect(classifyLineRainbowZone(10, 20, 40)).toBe('below');
  });

  it('is inside when the price is within the envelope', () => {
    expect(classifyLineRainbowZone(30, 20, 40)).toBe('inside');
  });

  it('is none for a null low bound', () => {
    expect(classifyLineRainbowZone(30, null, 40)).toBe('none');
  });

  it('is none for a null high bound', () => {
    expect(classifyLineRainbowZone(30, 20, null)).toBe('none');
  });

  it('is none for a non-finite bound', () => {
    expect(classifyLineRainbowZone(30, Number.NaN, 40)).toBe('none');
  });
});

describe('getLineRainbowBandColor', () => {
  it('returns an hsl colour string', () => {
    expect(getLineRainbowBandColor(0, 6).startsWith('hsl(')).toBe(true);
  });

  it('starts the first band at hue zero', () => {
    expect(getLineRainbowBandColor(0, 6)).toBe('hsl(0, 72%, 52%)');
  });

  it('ends the last band at hue 270', () => {
    expect(getLineRainbowBandColor(5, 6)).toBe('hsl(270, 72%, 52%)');
  });

  it('gives different bands different colours', () => {
    expect(getLineRainbowBandColor(1, 6)).not.toBe(
      getLineRainbowBandColor(4, 6),
    );
  });
});

describe('runLineRainbow', () => {
  it('is not ok for a series shorter than two points', () => {
    expect(runLineRainbow([{ x: 1, value: 10 }], OPTS).ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(runLineRainbow(RAINBOW_DATA, OPTS).ok).toBe(true);
  });

  it('carries the default period and band count', () => {
    const run = runLineRainbow(RAINBOW_DATA);
    expect(run.period).toBe(2);
    expect(run.bandCount).toBe(6);
  });

  it('honours custom period and band count', () => {
    const run = runLineRainbow(RAINBOW_DATA, OPTS);
    expect(run.period).toBe(3);
    expect(run.bandCount).toBe(3);
  });

  it('produces one array per band', () => {
    expect(runLineRainbow(RAINBOW_DATA, OPTS).bands).toHaveLength(3);
  });

  it('emits one sample per point', () => {
    expect(runLineRainbow(RAINBOW_DATA, OPTS).samples).toHaveLength(
      RAINBOW_DATA.length,
    );
  });

  it('classifies the zone of every bar', () => {
    const run = runLineRainbow(RAINBOW_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual(ZONE_EXPECTED);
  });

  it('runs the price above the rising rainbow', () => {
    const run = runLineRainbow(RAINBOW_DATA, OPTS);
    expect(run.aboveCount).toBe(4);
    expect(run.belowCount).toBe(0);
    expect(run.insideCount).toBe(0);
  });

  it('leaves the envelope null through the warm-up', () => {
    const run = runLineRainbow(RAINBOW_DATA, OPTS);
    expect(run.samples[0]!.envelopeLow).toBeNull();
    expect(run.samples[0]!.envelopeHigh).toBeNull();
  });

  it('defines the envelope once the full rainbow exists', () => {
    const run = runLineRainbow(RAINBOW_DATA, OPTS);
    expect(run.samples[6]!.envelopeLow).toBe(40);
    expect(run.samples[6]!.envelopeHigh).toBe(60);
  });

  it('classifies a constant series as inside the rainbow', () => {
    const run = runLineRainbow(CONST_DATA, OPTS);
    expect(run.insideCount).toBeGreaterThanOrEqual(1);
    expect(run.aboveCount).toBe(0);
    expect(run.belowCount).toBe(0);
  });

  it('sorts the input by x', () => {
    const shuffled = [...RAINBOW_DATA].reverse();
    const run = runLineRainbow(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual(RAINBOW_DATA.map((p) => p.x));
  });

  it('is not ok for an empty series', () => {
    expect(runLineRainbow([], OPTS).ok).toBe(false);
    expect(runLineRainbow(null, OPTS).ok).toBe(false);
  });
});

describe('computeLineRainbowLayout', () => {
  it('is not ok for a single point', () => {
    const layout = computeLineRainbowLayout({
      data: [{ x: 1, value: 10 }],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineRainbowLayout({
      data: RAINBOW_DATA,
      ...OPTS,
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(computeLineRainbowLayout({ data: RAINBOW_DATA, ...OPTS }).ok).toBe(
      true,
    );
  });

  it('builds the price path', () => {
    const layout = computeLineRainbowLayout({ data: RAINBOW_DATA, ...OPTS });
    expect(layout.pricePath.startsWith('M')).toBe(true);
  });

  it('emits one band path per band', () => {
    const layout = computeLineRainbowLayout({ data: RAINBOW_DATA, ...OPTS });
    expect(layout.bandPaths).toHaveLength(3);
  });

  it('gives each band path a colour', () => {
    const layout = computeLineRainbowLayout({ data: RAINBOW_DATA, ...OPTS });
    for (const band of layout.bandPaths) {
      expect(band.color.startsWith('hsl(')).toBe(true);
    }
  });

  it('emits one marker per classified bar', () => {
    const layout = computeLineRainbowLayout({ data: RAINBOW_DATA, ...OPTS });
    expect(layout.markers).toHaveLength(4);
  });

  it('keeps every marker inside the panel', () => {
    const layout = computeLineRainbowLayout({ data: RAINBOW_DATA, ...OPTS });
    for (const marker of layout.markers) {
      expect(marker.cy).toBeGreaterThanOrEqual(layout.innerTop - 0.01);
      expect(marker.cy).toBeLessThanOrEqual(layout.innerBottom + 0.01);
    }
  });

  it('carries the run on the layout', () => {
    const layout = computeLineRainbowLayout({ data: RAINBOW_DATA, ...OPTS });
    expect(layout.run.aboveCount).toBe(4);
  });
});

describe('describeLineRainbowChart', () => {
  it('names the indicator', () => {
    expect(describeLineRainbowChart(RAINBOW_DATA, OPTS)).toContain(
      'Rainbow Moving Average',
    );
  });

  it('mentions the recursively smoothed bands', () => {
    const text = describeLineRainbowChart(RAINBOW_DATA, OPTS);
    expect(text).toContain('recursively smoothed');
    expect(text).toContain('bands');
  });

  it('reports the zone counts', () => {
    const text = describeLineRainbowChart(RAINBOW_DATA, OPTS);
    expect(text).toContain('above the whole rainbow on 4');
  });

  it('returns No data for an empty series', () => {
    expect(describeLineRainbowChart([], OPTS)).toBe('No data');
  });
});

describe('ChartLineRainbow component', () => {
  it('renders a labelled region', () => {
    render(<ChartLineRainbow data={RAINBOW_DATA} {...OPTS} />);
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineRainbow data={RAINBOW_DATA} {...OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-rainbow-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Rainbow Moving Average');
  });

  it('renders the empty state for no data', () => {
    const { container } = render(<ChartLineRainbow data={[]} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-rainbow-empty"]'),
    ).toBeInTheDocument();
  });

  it('marks the root with the run summary', () => {
    const { container } = render(
      <ChartLineRainbow data={RAINBOW_DATA} {...OPTS} />,
    );
    const root = container.querySelector('[data-section="chart-line-rainbow"]');
    expect(root?.getAttribute('data-period')).toBe('3');
    expect(root?.getAttribute('data-band-count')).toBe('3');
    expect(root?.getAttribute('data-above-count')).toBe('4');
  });

  it('renders an img-role svg', () => {
    render(<ChartLineRainbow data={RAINBOW_DATA} {...OPTS} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('draws the price line', () => {
    const { container } = render(
      <ChartLineRainbow data={RAINBOW_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rainbow-price-path"]'),
    ).toBeInTheDocument();
  });

  it('draws one band path per band', () => {
    const { container } = render(
      <ChartLineRainbow data={RAINBOW_DATA} {...OPTS} />,
    );
    const bands = container.querySelectorAll(
      '[data-section="chart-line-rainbow-band"]',
    );
    expect(bands).toHaveLength(3);
  });

  it('renders one marker per classified bar', () => {
    const { container } = render(
      <ChartLineRainbow data={RAINBOW_DATA} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-rainbow-marker"]',
    );
    expect(markers).toHaveLength(4);
  });

  it('tags each marker with its zone', () => {
    const { container } = render(
      <ChartLineRainbow data={RAINBOW_DATA} {...OPTS} />,
    );
    const markers = Array.from(
      container.querySelectorAll('[data-section="chart-line-rainbow-marker"]'),
    );
    expect(markers.map((m) => m.getAttribute('data-zone'))).toEqual([
      'above',
      'above',
      'above',
      'above',
    ]);
  });

  it('shows the config badge', () => {
    const { container } = render(
      <ChartLineRainbow data={RAINBOW_DATA} {...OPTS} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-rainbow-badge-config"]',
    );
    expect(badge?.textContent).toBe('RB 3/3');
  });

  it('hides the rainbow bands when the legend item is toggled', () => {
    const { container } = render(
      <ChartLineRainbow data={RAINBOW_DATA} {...OPTS} />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-rainbow-legend-item"][data-series-id="rainbow"]',
    ) as HTMLButtonElement;
    fireEvent.click(button);
    expect(
      container.querySelectorAll('[data-section="chart-line-rainbow-band"]'),
    ).toHaveLength(0);
  });

  it('hides the bands when showRainbow is false', () => {
    const { container } = render(
      <ChartLineRainbow data={RAINBOW_DATA} {...OPTS} showRainbow={false} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-rainbow-band"]'),
    ).toHaveLength(0);
  });

  it('honours a controlled hiddenSeries for the price line', () => {
    const { container } = render(
      <ChartLineRainbow
        data={RAINBOW_DATA}
        {...OPTS}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rainbow-price-path"]'),
    ).not.toBeInTheDocument();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineRainbow
        data={RAINBOW_DATA}
        {...OPTS}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-rainbow-marker"]',
    ) as SVGElement;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineRainbow ref={ref} data={RAINBOW_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-rainbow',
    );
  });
});
