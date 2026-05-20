import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineEnvelope,
  computeLineEnvelopeBands,
  computeLineEnvelopeBasis,
  computeLineEnvelopeLayout,
  getLineEnvelopeFinitePoints,
  normalizeLineEnvelopePeriod,
  normalizeLineEnvelopePercent,
  runLineEnvelope,
  describeLineEnvelopeChart,
  type ChartLineEnvelopePoint,
} from './chart-line-envelope';

afterEach(() => cleanup());

// With period 2 the basis is the two-bar midpoint and a 25 percent
// envelope multiplies it by 1.25 and 0.75, so every value lands on
// a clean number:
//   [6,18]  -> basis 12, upper 15,   lower 9
//   [18,10] -> basis 14, upper 17.5, lower 10.5
//   [10,30] -> basis 20, upper 25,   lower 15
//   [30,14] -> basis 22, upper 27.5, lower 16.5
const ENVELOPE_DATA: ChartLineEnvelopePoint[] = [
  { x: 0, value: 6 },
  { x: 1, value: 18 },
  { x: 2, value: 10 },
  { x: 3, value: 30 },
  { x: 4, value: 14 },
];

describe('getLineEnvelopeFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineEnvelopeFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineEnvelopeFinitePoints(null)).toEqual([]);
    expect(getLineEnvelopeFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineEnvelopePeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineEnvelopePeriod(20.8, 20)).toBe(20);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineEnvelopePeriod(0, 20)).toBe(20);
    expect(normalizeLineEnvelopePeriod(NaN, 20)).toBe(20);
    expect(normalizeLineEnvelopePeriod(-3, 20)).toBe(20);
  });
});

describe('normalizeLineEnvelopePercent', () => {
  it('keeps a positive finite percent', () => {
    expect(normalizeLineEnvelopePercent(2.5, 5)).toBe(2.5);
  });

  it('falls back for a zero, negative or non-finite percent', () => {
    expect(normalizeLineEnvelopePercent(0, 5)).toBe(5);
    expect(normalizeLineEnvelopePercent(-1, 5)).toBe(5);
    expect(normalizeLineEnvelopePercent(NaN, 5)).toBe(5);
  });
});

describe('computeLineEnvelopeBasis', () => {
  const values = ENVELOPE_DATA.map((p) => p.value);

  it('takes the period-bar simple moving average', () => {
    expect(computeLineEnvelopeBasis(values, 2)).toEqual([
      null, 12, 14, 20, 22,
    ]);
  });

  it('leaves the first period-1 bars as a null warm-up', () => {
    expect(computeLineEnvelopeBasis(values, 2)[0]).toBeNull();
  });

  it('holds a flat series at its constant', () => {
    expect(computeLineEnvelopeBasis([8, 8, 8, 8], 2)).toEqual([
      null, 8, 8, 8,
    ]);
  });

  it('returns all null when shorter than the period', () => {
    expect(computeLineEnvelopeBasis([8], 2)).toEqual([null]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineEnvelopeBasis(null, 2)).toEqual([]);
  });
});

describe('computeLineEnvelopeBands', () => {
  const values = ENVELOPE_DATA.map((p) => p.value);

  it('places the bands a fixed percent above and below the basis', () => {
    const bands = computeLineEnvelopeBands(values, 2, 25);
    expect(bands.upper).toEqual([null, 15, 17.5, 25, 27.5]);
    expect(bands.lower).toEqual([null, 9, 10.5, 15, 16.5]);
  });

  it('leaves the first period-1 bars as a null warm-up', () => {
    const bands = computeLineEnvelopeBands(values, 2, 25);
    expect(bands.upper[0]).toBeNull();
    expect(bands.lower[0]).toBeNull();
  });

  it('keeps a non-zero band even for a flat series', () => {
    const bands = computeLineEnvelopeBands([8, 8, 8, 8], 2, 25);
    expect(bands.upper).toEqual([null, 10, 10, 10]);
    expect(bands.lower).toEqual([null, 6, 6, 6]);
  });

  it('matches the basis scaled by the percent factor', () => {
    const basis = computeLineEnvelopeBasis(values, 2);
    const bands = computeLineEnvelopeBands(values, 2, 25);
    for (let i = 0; i < basis.length; i += 1) {
      const b = basis[i];
      if (b === null || b === undefined) continue;
      expect(bands.upper[i]).toBe(b * (1 + 25 / 100));
      expect(bands.lower[i]).toBe(b * (1 - 25 / 100));
    }
  });

  it('returns empty bands for non-array input', () => {
    expect(computeLineEnvelopeBands(null, 2, 25)).toEqual({
      upper: [],
      lower: [],
    });
  });
});

describe('runLineEnvelope', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineEnvelope(ENVELOPE_DATA, { period: 2, percent: 25 }).ok).toBe(
      true,
    );
  });

  it('carries the period and percent onto the run', () => {
    const run = runLineEnvelope(ENVELOPE_DATA, { period: 2, percent: 25 });
    expect(run.period).toBe(2);
    expect(run.percent).toBe(25);
  });

  it('exposes the basis, upper and lower series', () => {
    const run = runLineEnvelope(ENVELOPE_DATA, { period: 2, percent: 25 });
    expect(run.basis).toEqual([null, 12, 14, 20, 22]);
    expect(run.upper).toEqual([null, 15, 17.5, 25, 27.5]);
    expect(run.lower).toEqual([null, 9, 10.5, 15, 16.5]);
  });

  it('places the envelope a fixed percent from the basis', () => {
    const run = runLineEnvelope(ENVELOPE_DATA, { period: 2, percent: 25 });
    for (const s of run.samples) {
      if (s.basis === null) continue;
      expect(s.upper).toBe(s.basis * (1 + run.percent / 100));
      expect(s.lower).toBe(s.basis * (1 - run.percent / 100));
    }
  });

  it('classifies each sample by price position versus the basis', () => {
    const run = runLineEnvelope(ENVELOPE_DATA, { period: 2, percent: 25 });
    expect(run.samples[0]!.position).toBe('on');
    expect(run.samples[1]!.position).toBe('above');
    expect(run.samples[2]!.position).toBe('below');
    expect(run.samples[3]!.position).toBe('above');
  });

  it('counts bars above and below the basis', () => {
    const run = runLineEnvelope(ENVELOPE_DATA, { period: 2, percent: 25 });
    expect(run.aboveCount).toBe(2);
    expect(run.belowCount).toBe(2);
  });

  it('reports the final basis and envelope readings', () => {
    const run = runLineEnvelope(ENVELOPE_DATA, { period: 2, percent: 25 });
    expect(run.basisFinal).toBe(22);
    expect(run.upperFinal).toBe(27.5);
    expect(run.lowerFinal).toBe(16.5);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineEnvelope([{ x: 0, value: 5 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineEnvelope([]).ok).toBe(false);
    expect(runLineEnvelope(null).ok).toBe(false);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...ENVELOPE_DATA].reverse();
    const run = runLineEnvelope(shuffled, { period: 2, percent: 25 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4]);
    expect(run.basis).toEqual([null, 12, 14, 20, 22]);
  });

  it('produces one sample per series point', () => {
    expect(
      runLineEnvelope(ENVELOPE_DATA, { period: 2, percent: 25 }).samples,
    ).toHaveLength(5);
  });

  it('defaults to period 20 and percent 5', () => {
    const run = runLineEnvelope(ENVELOPE_DATA);
    expect(run.period).toBe(20);
    expect(run.percent).toBe(5);
  });
});

describe('computeLineEnvelopeLayout', () => {
  const base = {
    data: ENVELOPE_DATA,
    period: 2,
    percent: 25,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineEnvelopeLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(5);
  });

  it('builds non-empty price, basis and envelope paths', () => {
    const layout = computeLineEnvelopeLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.basisPath.startsWith('M')).toBe(true);
    expect(layout.upperPath.startsWith('M')).toBe(true);
    expect(layout.lowerPath.startsWith('M')).toBe(true);
  });

  it('closes the band area path', () => {
    const layout = computeLineEnvelopeLayout(base);
    expect(layout.bandAreaPath.startsWith('M')).toBe(true);
    expect(layout.bandAreaPath.endsWith('Z')).toBe(true);
  });

  it('emits a price dot per bar and a marker per defined basis', () => {
    const layout = computeLineEnvelopeLayout(base);
    expect(layout.priceDots).toHaveLength(5);
    expect(layout.basisMarkers).toHaveLength(4);
  });

  it('spans a y domain covering the price and the envelope', () => {
    const layout = computeLineEnvelopeLayout(base);
    expect(layout.yMin).toBeLessThanOrEqual(6);
    expect(layout.yMax).toBeGreaterThanOrEqual(30);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineEnvelopeLayout(base);
    expect(layout.basisFinal).toBe(22);
    expect(layout.aboveCount).toBe(2);
    expect(layout.period).toBe(2);
  });

  it('keeps the basis markers inside the panel', () => {
    const layout = computeLineEnvelopeLayout(base);
    for (const m of layout.basisMarkers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.panel.y);
      expect(m.py).toBeLessThanOrEqual(layout.panel.y + layout.panel.height);
    }
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineEnvelopeLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.basisPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineEnvelopeLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineEnvelopeChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineEnvelopeChart(ENVELOPE_DATA, {
      period: 2,
      percent: 25,
    });
    expect(text).toContain('moving average envelope');
    expect(text).toContain('percent');
    expect(text).toContain('basis');
    expect(text).toContain('fixed');
  });

  it('reports the above and below counts', () => {
    const text = describeLineEnvelopeChart(ENVELOPE_DATA, {
      period: 2,
      percent: 25,
    });
    expect(text).toContain('above the basis on 2');
    expect(text).toContain('below on 2');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineEnvelopeChart([])).toBe('No data');
    expect(describeLineEnvelopeChart(null)).toBe('No data');
  });
});

describe('<ChartLineEnvelope />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineEnvelope data={ENVELOPE_DATA} period={2} percent={25} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineEnvelope data={ENVELOPE_DATA} period={2} percent={25} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-envelope-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('moving average envelope');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineEnvelope data={ENVELOPE_DATA} period={2} percent={25} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-envelope"]',
    );
    expect(root!.getAttribute('data-period')).toBe('2');
    expect(root!.getAttribute('data-percent')).toBe('25');
    expect(root!.getAttribute('data-above-count')).toBe('2');
    expect(root!.getAttribute('data-below-count')).toBe('2');
    expect(root!.getAttribute('data-total-points')).toBe('5');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price, basis and envelope lines', () => {
    const { container } = render(
      <ChartLineEnvelope data={ENVELOPE_DATA} period={2} percent={25} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-envelope-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-envelope-price-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-envelope-basis-line"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-envelope-upper-line"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-envelope-lower-line"]',
      ),
    ).not.toBeNull();
  });

  it('renders the band area', () => {
    const { container } = render(
      <ChartLineEnvelope data={ENVELOPE_DATA} period={2} percent={25} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-envelope-band-area"]'),
    ).not.toBeNull();
  });

  it('renders one marker per defined basis value', () => {
    const { container } = render(
      <ChartLineEnvelope data={ENVELOPE_DATA} period={2} percent={25} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-envelope-marker"]'),
    ).toHaveLength(4);
  });

  it('renders a three-item legend', () => {
    const { container } = render(
      <ChartLineEnvelope data={ENVELOPE_DATA} period={2} percent={25} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-envelope-legend-item"]',
      ),
    ).toHaveLength(3);
  });

  it('renders the config badge with the period and percent', () => {
    const { container } = render(
      <ChartLineEnvelope data={ENVELOPE_DATA} period={2} percent={25} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-envelope-badge-config"]',
    );
    expect(badge!.textContent).toContain('2');
    expect(badge!.textContent).toContain('25');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineEnvelope
        data={ENVELOPE_DATA}
        period={2}
        percent={25}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-envelope-price-path"]',
      ),
    ).toBeNull();
  });

  it('hides the basis line and markers when showBasis is false', () => {
    const { container } = render(
      <ChartLineEnvelope
        data={ENVELOPE_DATA}
        period={2}
        percent={25}
        showBasis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-envelope-basis-line"]',
      ),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-envelope-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the envelope when showEnvelope is false', () => {
    const { container } = render(
      <ChartLineEnvelope
        data={ENVELOPE_DATA}
        period={2}
        percent={25}
        showEnvelope={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-envelope-upper-line"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-envelope-lower-line"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-envelope-band-area"]'),
    ).toBeNull();
  });

  it('hides the envelope via the hidden set', () => {
    const { container } = render(
      <ChartLineEnvelope
        data={ENVELOPE_DATA}
        period={2}
        percent={25}
        hiddenSeries={['envelope']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-envelope-upper-line"]',
      ),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineEnvelope
        data={ENVELOPE_DATA}
        period={2}
        percent={25}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-envelope-legend-item"][data-series-id="envelope"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'envelope', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineEnvelope
        data={ENVELOPE_DATA}
        period={2}
        percent={25}
        showDots
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-envelope-dot"]'),
    ).toHaveLength(5);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineEnvelope data={[{ x: 0, value: 5 }]} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-envelope"]',
    );
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-envelope-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineEnvelope
        data={ENVELOPE_DATA}
        period={2}
        percent={25}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-envelope-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineEnvelope
        ref={ref}
        data={ENVELOPE_DATA}
        period={2}
        percent={25}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-envelope',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineEnvelope.displayName).toBe('ChartLineEnvelope');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineEnvelope
        data={ENVELOPE_DATA}
        period={2}
        percent={25}
        animate={false}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-envelope"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
