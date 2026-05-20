import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineVidya,
  computeLineVidya,
  computeLineVidyaCmo,
  computeLineVidyaLayout,
  getLineVidyaFinitePoints,
  normalizeLineVidyaPeriod,
  runLineVidya,
  describeLineVidyaChart,
  type ChartLineVidyaPoint,
} from './chart-line-vidya';

afterEach(() => cleanup());

// With period 3 the base smoothing constant is exactly
// alpha = 2/(3+1) = 0.5, and with cmoPeriod 2 the CMO comes out to
// clean 100 / 0 / -100, so the volatility index k = |CMO|/100 is
// 1 / 0 / 1 and the whole pipeline stays bit-exact.
//   changes = [_, +4, +4, -4, +4, -4, -4]
//   cmo  = [_, _, 100, 0, 0, 0, -100]   (2-change windows)
//   k    = [_, _, 1, 0, 0, 0, 1]
//   VIDYA seeded at index 1 with value[1] = 14, then recursive:
//     VIDYA[i] = alpha*k*value[i] + (1 - alpha*k)*VIDYA[i-1]
//     VIDYA[2] = 0.5*1*18 + 0.5*14 = 16
//     VIDYA[3] = 0.5*0*14 + 1*16   = 16   (k=0 -> frozen)
//     VIDYA[4] = 16, VIDYA[5] = 16        (k=0 -> frozen)
//     VIDYA[6] = 0.5*1*10 + 0.5*16 = 13
//   vidya = [null, 14, 16, 16, 16, 16, 13]
const VIDYA_DATA: ChartLineVidyaPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 14 },
  { x: 2, value: 18 },
  { x: 3, value: 14 },
  { x: 4, value: 18 },
  { x: 5, value: 14 },
  { x: 6, value: 10 },
];

describe('getLineVidyaFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineVidyaFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineVidyaFinitePoints(null)).toEqual([]);
    expect(getLineVidyaFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineVidyaPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineVidyaPeriod(14.8, 14)).toBe(14);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineVidyaPeriod(0, 14)).toBe(14);
    expect(normalizeLineVidyaPeriod(NaN, 14)).toBe(14);
    expect(normalizeLineVidyaPeriod(-3, 14)).toBe(14);
  });
});

describe('computeLineVidyaCmo', () => {
  const values = VIDYA_DATA.map((p) => p.value);

  it('computes the Chande Momentum Oscillator series', () => {
    expect(computeLineVidyaCmo(values, 2)).toEqual([
      null,
      null,
      100,
      0,
      0,
      0,
      -100,
    ]);
  });

  it('reads +100 for a window of pure gains', () => {
    const cmo = computeLineVidyaCmo([1, 2, 3, 4], 2);
    expect(cmo[2]).toBe(100);
    expect(cmo[3]).toBe(100);
  });

  it('reads -100 for a window of pure losses', () => {
    const cmo = computeLineVidyaCmo([4, 3, 2, 1], 2);
    expect(cmo[2]).toBe(-100);
  });

  it('reads 0 for a window whose gains and losses cancel', () => {
    const cmo = computeLineVidyaCmo([10, 14, 10], 2);
    expect(cmo[2]).toBe(0);
  });

  it('leaves the first cmoPeriod entries as a null warm-up', () => {
    const cmo = computeLineVidyaCmo(values, 2);
    expect(cmo[0]).toBeNull();
    expect(cmo[1]).toBeNull();
    expect(cmo[2]).not.toBeNull();
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineVidyaCmo(null, 2)).toEqual([]);
  });
});

describe('computeLineVidya', () => {
  const values = VIDYA_DATA.map((p) => p.value);

  it('exposes the CMO series', () => {
    const { cmo } = computeLineVidya(values, 3, 2);
    expect(cmo).toEqual([null, null, 100, 0, 0, 0, -100]);
  });

  it('derives the volatility index as the absolute CMO over 100', () => {
    const { k } = computeLineVidya(values, 3, 2);
    expect(k).toEqual([null, null, 1, 0, 0, 0, 1]);
  });

  it('scales the smoothing by the volatility index', () => {
    const { vidya } = computeLineVidya(values, 3, 2);
    expect(vidya).toEqual([null, 14, 16, 16, 16, 16, 13]);
  });

  it('holds the prior VIDYA when the volatility index is zero', () => {
    const { vidya } = computeLineVidya(values, 3, 2);
    // k = 0 at indices 3, 4, 5 -> the VIDYA freezes at 16.
    expect(vidya[3]).toBe(vidya[2]);
    expect(vidya[5]).toBe(16);
  });

  it('seeds the VIDYA at index cmoPeriod-1 with that bar value', () => {
    const { vidya } = computeLineVidya(values, 3, 2);
    expect(vidya[1]).toBe(14);
    expect(vidya[0]).toBeNull();
  });

  it('freezes a flat series at its constant value', () => {
    const { vidya } = computeLineVidya([5, 5, 5, 5, 5], 3, 2);
    expect(vidya).toEqual([null, 5, 5, 5, 5]);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineVidya(null, 3, 2)).toEqual({
      cmo: [],
      k: [],
      vidya: [],
    });
  });
});

describe('runLineVidya', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineVidya(VIDYA_DATA, { period: 3, cmoPeriod: 2 }).ok).toBe(
      true,
    );
  });

  it('carries the period and cmoPeriod onto the run', () => {
    const run = runLineVidya(VIDYA_DATA, { period: 3, cmoPeriod: 2 });
    expect(run.period).toBe(3);
    expect(run.cmoPeriod).toBe(2);
  });

  it('exposes the cmo, k and vidya series', () => {
    const run = runLineVidya(VIDYA_DATA, { period: 3, cmoPeriod: 2 });
    expect(run.cmo).toEqual([null, null, 100, 0, 0, 0, -100]);
    expect(run.k).toEqual([null, null, 1, 0, 0, 0, 1]);
    expect(run.vidya).toEqual([null, 14, 16, 16, 16, 16, 13]);
  });

  it('reports the final, min and max VIDYA readings', () => {
    const run = runLineVidya(VIDYA_DATA, { period: 3, cmoPeriod: 2 });
    expect(run.vidyaFinal).toBe(13);
    expect(run.vidyaMin).toBe(13);
    expect(run.vidyaMax).toBe(16);
  });

  it('classifies each sample by price position versus the VIDYA', () => {
    const run = runLineVidya(VIDYA_DATA, { period: 3, cmoPeriod: 2 });
    expect(run.samples[1]!.position).toBe('on');
    expect(run.samples[2]!.position).toBe('above');
    expect(run.samples[3]!.position).toBe('below');
    expect(run.samples[6]!.position).toBe('below');
  });

  it('counts bars above and below the VIDYA', () => {
    const run = runLineVidya(VIDYA_DATA, { period: 3, cmoPeriod: 2 });
    expect(run.aboveCount).toBe(2);
    expect(run.belowCount).toBe(3);
  });

  it('leaves warm-up samples with a null VIDYA', () => {
    const run = runLineVidya(VIDYA_DATA, { period: 3, cmoPeriod: 2 });
    expect(run.samples[0]!.vidya).toBeNull();
    expect(run.samples[1]!.vidya).toBe(14);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...VIDYA_DATA].reverse();
    const run = runLineVidya(shuffled, { period: 3, cmoPeriod: 2 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(run.vidya).toEqual([null, 14, 16, 16, 16, 16, 13]);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineVidya([{ x: 0, value: 5 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineVidya([]).ok).toBe(false);
    expect(runLineVidya(null).ok).toBe(false);
  });

  it('produces one sample per series point', () => {
    expect(
      runLineVidya(VIDYA_DATA, { period: 3, cmoPeriod: 2 }).samples,
    ).toHaveLength(7);
  });

  it('defaults to period 14 / cmoPeriod 9 and reads no VIDYA for a short series', () => {
    const run = runLineVidya(VIDYA_DATA);
    expect(run.period).toBe(14);
    expect(run.cmoPeriod).toBe(9);
    expect(run.vidya.every((v) => v === null)).toBe(true);
    expect(Number.isNaN(run.vidyaFinal)).toBe(true);
  });
});

describe('computeLineVidyaLayout', () => {
  const base = {
    data: VIDYA_DATA,
    period: 3,
    cmoPeriod: 2,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineVidyaLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(7);
  });

  it('builds non-empty price and VIDYA paths', () => {
    const layout = computeLineVidyaLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.vidyaPath.startsWith('M')).toBe(true);
  });

  it('emits a marker only where the VIDYA is defined', () => {
    const layout = computeLineVidyaLayout(base);
    expect(layout.vidyaMarkers).toHaveLength(6);
    expect(layout.priceDots).toHaveLength(7);
  });

  it('spans a y domain covering both the price and the VIDYA', () => {
    const layout = computeLineVidyaLayout(base);
    expect(layout.yMin).toBeLessThanOrEqual(10);
    expect(layout.yMax).toBeGreaterThanOrEqual(18);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineVidyaLayout(base);
    expect(layout.vidyaFinal).toBe(13);
    expect(layout.period).toBe(3);
    expect(layout.cmoPeriod).toBe(2);
  });

  it('keeps the VIDYA markers inside the panel', () => {
    const layout = computeLineVidyaLayout(base);
    for (const m of layout.vidyaMarkers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.panel.y);
      expect(m.py).toBeLessThanOrEqual(layout.panel.y + layout.panel.height);
    }
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineVidyaLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.vidyaPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineVidyaLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineVidyaChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineVidyaChart(VIDYA_DATA, {
      period: 3,
      cmoPeriod: 2,
    });
    expect(text).toContain('Variable Index Dynamic Average');
    expect(text).toContain('VIDYA');
    expect(text).toContain('adaptive');
    expect(text).toContain('Chande Momentum Oscillator');
    expect(text).toContain('volatility');
  });

  it('reports the above and below counts', () => {
    const text = describeLineVidyaChart(VIDYA_DATA, {
      period: 3,
      cmoPeriod: 2,
    });
    expect(text).toContain('above the VIDYA on 2');
    expect(text).toContain('below on 3');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineVidyaChart([])).toBe('No data');
    expect(describeLineVidyaChart(null)).toBe('No data');
  });
});

describe('<ChartLineVidya />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineVidya data={VIDYA_DATA} period={3} cmoPeriod={2} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineVidya data={VIDYA_DATA} period={3} cmoPeriod={2} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-vidya-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Variable Index Dynamic Average');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineVidya data={VIDYA_DATA} period={3} cmoPeriod={2} />,
    );
    const root = container.querySelector('[data-section="chart-line-vidya"]');
    expect(root!.getAttribute('data-period')).toBe('3');
    expect(root!.getAttribute('data-cmo-period')).toBe('2');
    expect(root!.getAttribute('data-vidya-final')).toBe('13');
    expect(root!.getAttribute('data-above-count')).toBe('2');
    expect(root!.getAttribute('data-below-count')).toBe('3');
    expect(root!.getAttribute('data-total-points')).toBe('7');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and VIDYA lines', () => {
    const { container } = render(
      <ChartLineVidya data={VIDYA_DATA} period={3} cmoPeriod={2} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vidya-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-vidya-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-vidya-vidya-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per defined VIDYA value', () => {
    const { container } = render(
      <ChartLineVidya data={VIDYA_DATA} period={3} cmoPeriod={2} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-vidya-marker"]',
    );
    expect(markers).toHaveLength(6);
  });

  it('renders a two-item legend', () => {
    const { container } = render(
      <ChartLineVidya data={VIDYA_DATA} period={3} cmoPeriod={2} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-vidya-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('renders the config badge with the period and cmoPeriod', () => {
    const { container } = render(
      <ChartLineVidya data={VIDYA_DATA} period={3} cmoPeriod={2} />,
    );
    const period = container.querySelector(
      '[data-section="chart-line-vidya-badge-period"]',
    );
    const cmo = container.querySelector(
      '[data-section="chart-line-vidya-badge-cmo"]',
    );
    expect(period!.textContent).toContain('3');
    expect(cmo!.textContent).toContain('2');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineVidya
        data={VIDYA_DATA}
        period={3}
        cmoPeriod={2}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vidya-price-path"]'),
    ).toBeNull();
  });

  it('hides the VIDYA line and markers when showVidya is false', () => {
    const { container } = render(
      <ChartLineVidya
        data={VIDYA_DATA}
        period={3}
        cmoPeriod={2}
        showVidya={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vidya-vidya-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-vidya-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the VIDYA line via the hidden set', () => {
    const { container } = render(
      <ChartLineVidya
        data={VIDYA_DATA}
        period={3}
        cmoPeriod={2}
        hiddenSeries={['vidya']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vidya-vidya-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineVidya
        data={VIDYA_DATA}
        period={3}
        cmoPeriod={2}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-vidya-legend-item"][data-series-id="vidya"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'vidya', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineVidya data={VIDYA_DATA} period={3} cmoPeriod={2} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-vidya-dot"]'),
    ).toHaveLength(7);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineVidya data={[{ x: 0, value: 5 }]} />,
    );
    const root = container.querySelector('[data-section="chart-line-vidya"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-vidya-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineVidya
        data={VIDYA_DATA}
        period={3}
        cmoPeriod={2}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vidya-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineVidya ref={ref} data={VIDYA_DATA} period={3} cmoPeriod={2} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-vidya');
  });

  it('has a stable displayName', () => {
    expect(ChartLineVidya.displayName).toBe('ChartLineVidya');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineVidya
        data={VIDYA_DATA}
        period={3}
        cmoPeriod={2}
        animate={false}
      />,
    );
    const root = container.querySelector('[data-section="chart-line-vidya"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
