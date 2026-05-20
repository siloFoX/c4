import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLinePmo,
  computeLinePmo,
  computeLinePmoCustomEma,
  computeLinePmoRoc,
  computeLinePmoSmoothingConstant,
  computeLinePmoLayout,
  getLinePmoFinitePoints,
  normalizeLinePmoPeriod,
  runLinePmo,
  describeLinePmoChart,
  type ChartLinePmoPoint,
} from './chart-line-pmo';

afterEach(() => cleanup());

// The DecisionPoint Price Momentum Oscillator double-smooths a
// 1-period rate of change. The fixture is hand-tuned so every step
// lands on an exact number: the price ratios are 0.5 and 1.5 (so
// the ROC is -50 / +50), and the custom EMA periods are all 4 (so
// the smoothing constant 2/4 = 0.5 keeps the arithmetic dyadic).
//
//   prices       [64, 32, 48,  72,  108,  162]
//   roc          [.,  -50, 50,  50,   50,   50]
//   ema1         [.,  -50,  0,  25, 37.5, 43.75]
//   smoothedRoc  [.,-500,   0, 250,  375, 437.5]
//   pmo          [.,-500,-250,   0, 187.5, 312.5]
//   signal       [.,-500,-375,-187.5,  0, 156.25]
const PMO_DATA: ChartLinePmoPoint[] = [
  { x: 0, value: 64 },
  { x: 1, value: 32 },
  { x: 2, value: 48 },
  { x: 3, value: 72 },
  { x: 4, value: 108 },
  { x: 5, value: 162 },
];

const PMO_OPTS = { smooth1Period: 4, smooth2Period: 4, signalPeriod: 4 };

const EXPECTED_ROC = [null, -50, 50, 50, 50, 50];
const EXPECTED_SMOOTHED = [null, -500, 0, 250, 375, 437.5];
const EXPECTED_PMO = [null, -500, -250, 0, 187.5, 312.5];
const EXPECTED_SIGNAL = [null, -500, -375, -187.5, 0, 156.25];

describe('getLinePmoFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLinePmoFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLinePmoFinitePoints(null)).toEqual([]);
    expect(getLinePmoFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLinePmoPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLinePmoPeriod(35.9, 35)).toBe(35);
  });

  it('falls back for a sub-2, NaN or negative period', () => {
    expect(normalizeLinePmoPeriod(1, 35)).toBe(35);
    expect(normalizeLinePmoPeriod(NaN, 20)).toBe(20);
    expect(normalizeLinePmoPeriod(-5, 10)).toBe(10);
  });
});

describe('computeLinePmoSmoothingConstant', () => {
  it('computes two over the period', () => {
    expect(computeLinePmoSmoothingConstant(4)).toBe(0.5);
    expect(computeLinePmoSmoothingConstant(10)).toBe(0.2);
    expect(computeLinePmoSmoothingConstant(20)).toBe(0.1);
  });

  it('falls back to the default period for a sub-2 period', () => {
    expect(computeLinePmoSmoothingConstant(1)).toBe(
      computeLinePmoSmoothingConstant(35),
    );
  });
});

describe('computeLinePmoRoc', () => {
  it('computes the 1-period percentage rate of change', () => {
    expect(computeLinePmoRoc([64, 32, 48, 72, 108, 162])).toEqual(
      EXPECTED_ROC,
    );
  });

  it('reports a null rate of change for the first bar', () => {
    expect(computeLinePmoRoc([10, 20])[0]).toBeNull();
  });

  it('reports a null reading when the prior price is zero', () => {
    expect(computeLinePmoRoc([0, 100])).toEqual([null, null]);
    expect(computeLinePmoRoc([100, 0, 50])).toEqual([null, -100, null]);
  });

  it('holds a flat series at a zero rate of change', () => {
    expect(computeLinePmoRoc([50, 50, 50])).toEqual([null, 0, 0]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLinePmoRoc(null)).toEqual([]);
  });
});

describe('computeLinePmoCustomEma', () => {
  it('seeds with the first value', () => {
    expect(computeLinePmoCustomEma([7, 9, 4], 4)[0]).toBe(7);
  });

  it('carries leading nulls and seeds at the first defined value', () => {
    const ema = computeLinePmoCustomEma([null, 9, 4], 4);
    expect(ema[0]).toBeNull();
    expect(ema[1]).toBe(9);
  });

  it('follows the custom-EMA recursion', () => {
    const k = computeLinePmoSmoothingConstant(4);
    const input = [10, 30, 20, 40];
    const ema = computeLinePmoCustomEma(input, 4);
    for (let i = 1; i < input.length; i += 1) {
      const expected = k * input[i]! + (1 - k) * (ema[i - 1] as number);
      expect(ema[i]).toBe(expected);
    }
  });

  it('holds a flat input at its constant', () => {
    expect(computeLinePmoCustomEma([5, 5, 5, 5], 4)).toEqual([5, 5, 5, 5]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLinePmoCustomEma(null, 4)).toEqual([]);
  });
});

describe('computeLinePmo', () => {
  it('computes the roc, smoothed-roc, pmo and signal series', () => {
    const result = computeLinePmo([64, 32, 48, 72, 108, 162], 4, 4, 4);
    expect(result.roc).toEqual(EXPECTED_ROC);
    expect(result.smoothedRoc).toEqual(EXPECTED_SMOOTHED);
    expect(result.pmo).toEqual(EXPECTED_PMO);
    expect(result.signal).toEqual(EXPECTED_SIGNAL);
  });

  it('derives the pmo as the custom EMA of the smoothed roc', () => {
    const result = computeLinePmo([64, 32, 48, 72, 108, 162], 4, 4, 4);
    expect(result.pmo).toEqual(
      computeLinePmoCustomEma(result.smoothedRoc, 4),
    );
  });

  it('derives the signal as the custom EMA of the pmo', () => {
    const result = computeLinePmo([64, 32, 48, 72, 108, 162], 4, 4, 4);
    expect(result.signal).toEqual(computeLinePmoCustomEma(result.pmo, 4));
  });

  it('scales the smoothed roc to ten times the first custom EMA', () => {
    const result = computeLinePmo([64, 32, 48, 72, 108, 162], 4, 4, 4);
    const ema1 = computeLinePmoCustomEma(result.roc, 4);
    expect(result.smoothedRoc).toEqual(
      ema1.map((v) => (v === null ? null : v * 10)),
    );
  });

  it('holds a flat series at zero through the whole pipeline', () => {
    const result = computeLinePmo([50, 50, 50, 50], 4, 4, 4);
    expect(result.roc).toEqual([null, 0, 0, 0]);
    expect(result.smoothedRoc).toEqual([null, 0, 0, 0]);
    expect(result.pmo).toEqual([null, 0, 0, 0]);
    expect(result.signal).toEqual([null, 0, 0, 0]);
  });

  it('returns empty series for non-array input', () => {
    expect(computeLinePmo(null, 4, 4, 4)).toEqual({
      roc: [],
      smoothedRoc: [],
      pmo: [],
      signal: [],
    });
  });
});

describe('runLinePmo', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLinePmo(PMO_DATA, PMO_OPTS).ok).toBe(true);
  });

  it('carries the smoothing and signal periods onto the run', () => {
    const run = runLinePmo(PMO_DATA, PMO_OPTS);
    expect(run.smooth1Period).toBe(4);
    expect(run.smooth2Period).toBe(4);
    expect(run.signalPeriod).toBe(4);
  });

  it('exposes the roc, smoothed-roc, pmo and signal series', () => {
    const run = runLinePmo(PMO_DATA, PMO_OPTS);
    expect(run.roc).toHaveLength(6);
    expect(run.smoothedRoc).toHaveLength(6);
    expect(run.pmo).toEqual(EXPECTED_PMO);
    expect(run.signal).toEqual(EXPECTED_SIGNAL);
  });

  it('seeds the first bar with a null pmo classified as zero', () => {
    const run = runLinePmo(PMO_DATA, PMO_OPTS);
    expect(run.samples[0]!.pmo).toBeNull();
    expect(run.samples[0]!.sign).toBe('zero');
  });

  it('classifies each sample by the sign of the pmo', () => {
    const run = runLinePmo(PMO_DATA, PMO_OPTS);
    expect(run.samples.map((s) => s.sign)).toEqual([
      'zero',
      'negative',
      'negative',
      'zero',
      'positive',
      'positive',
    ]);
  });

  it('counts the positive and negative bars consistently', () => {
    const run = runLinePmo(PMO_DATA, PMO_OPTS);
    expect(run.positiveCount).toBe(2);
    expect(run.negativeCount).toBe(2);
    expect(run.positiveCount).toBe(
      run.pmo.filter((v) => v !== null && v > 0).length,
    );
    expect(run.negativeCount).toBe(
      run.pmo.filter((v) => v !== null && v < 0).length,
    );
  });

  it('reports the final pmo and signal readings', () => {
    const run = runLinePmo(PMO_DATA, PMO_OPTS);
    expect(run.pmoFinal).toBe(312.5);
    expect(run.signalFinal).toBe(156.25);
  });

  it('reports the min and max pmo readings', () => {
    const run = runLinePmo(PMO_DATA, PMO_OPTS);
    expect(run.pmoMin).toBe(-500);
    expect(run.pmoMax).toBe(312.5);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLinePmo([{ x: 0, value: 5 }], PMO_OPTS);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLinePmo([], PMO_OPTS).ok).toBe(false);
    expect(runLinePmo(null, PMO_OPTS).ok).toBe(false);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...PMO_DATA].reverse();
    const run = runLinePmo(shuffled, PMO_OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('produces one sample per series point', () => {
    expect(runLinePmo(PMO_DATA, PMO_OPTS).samples).toHaveLength(6);
  });

  it('defaults to a 35 / 20 / 10 configuration', () => {
    const run = runLinePmo(PMO_DATA);
    expect(run.smooth1Period).toBe(35);
    expect(run.smooth2Period).toBe(20);
    expect(run.signalPeriod).toBe(10);
  });
});

describe('computeLinePmoLayout', () => {
  const base = {
    data: PMO_DATA,
    smooth1Period: 4,
    smooth2Period: 4,
    signalPeriod: 4,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLinePmoLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(6);
  });

  it('stacks the price panel above the pmo panel', () => {
    const layout = computeLinePmoLayout(base);
    expect(layout.pricePanel.height).toBeGreaterThan(0);
    expect(layout.pmoPanel.height).toBeGreaterThan(0);
    expect(layout.pmoPanel.y).toBeGreaterThan(layout.pricePanel.y);
  });

  it('builds non-empty price, pmo and signal paths', () => {
    const layout = computeLinePmoLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.pmoPath.startsWith('M')).toBe(true);
    expect(layout.signalPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar and one marker per defined pmo', () => {
    const layout = computeLinePmoLayout(base);
    expect(layout.priceDots).toHaveLength(6);
    expect(layout.pmoMarkers).toHaveLength(5);
  });

  it('places the zero line inside the pmo panel', () => {
    const layout = computeLinePmoLayout(base);
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.pmoPanel.y);
    expect(layout.zeroY).toBeLessThanOrEqual(
      layout.pmoPanel.y + layout.pmoPanel.height,
    );
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLinePmoLayout(base);
    expect(layout.smooth1Period).toBe(4);
    expect(layout.smooth2Period).toBe(4);
    expect(layout.signalPeriod).toBe(4);
    expect(layout.pmoFinal).toBe(312.5);
    expect(layout.totalPoints).toBe(6);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLinePmoLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.pmoPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLinePmoLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLinePmoChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLinePmoChart(PMO_DATA, PMO_OPTS);
    expect(text).toContain('Price Momentum Oscillator');
    expect(text).toContain('double-smoothed');
    expect(text).toContain('rate of change');
    expect(text).toContain('signal line');
  });

  it('reports the positive and negative counts', () => {
    const run = runLinePmo(PMO_DATA, PMO_OPTS);
    const text = describeLinePmoChart(PMO_DATA, PMO_OPTS);
    expect(text).toContain(`positive on ${run.positiveCount}`);
    expect(text).toContain(`negative on ${run.negativeCount}`);
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLinePmoChart([])).toBe('No data');
    expect(describeLinePmoChart(null)).toBe('No data');
  });
});

describe('<ChartLinePmo />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLinePmo data={PMO_DATA} smooth1Period={4} smooth2Period={4} signalPeriod={4} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLinePmo data={PMO_DATA} smooth1Period={4} smooth2Period={4} signalPeriod={4} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-pmo-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Price Momentum Oscillator');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLinePmo data={PMO_DATA} smooth1Period={4} smooth2Period={4} signalPeriod={4} />,
    );
    const root = container.querySelector('[data-section="chart-line-pmo"]');
    expect(root!.getAttribute('data-smooth1-period')).toBe('4');
    expect(root!.getAttribute('data-smooth2-period')).toBe('4');
    expect(root!.getAttribute('data-signal-period')).toBe('4');
    expect(root!.getAttribute('data-total-points')).toBe('6');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price, pmo and signal lines', () => {
    const { container } = render(
      <ChartLinePmo data={PMO_DATA} smooth1Period={4} smooth2Period={4} signalPeriod={4} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pmo-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-pmo-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-pmo-pmo-line"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-pmo-signal-line"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLinePmo data={PMO_DATA} smooth1Period={4} smooth2Period={4} signalPeriod={4} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-pmo-panel-label"]'),
    ).toHaveLength(2);
  });

  it('renders one pmo marker per defined pmo value', () => {
    const { container } = render(
      <ChartLinePmo data={PMO_DATA} smooth1Period={4} smooth2Period={4} signalPeriod={4} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-pmo-marker"]'),
    ).toHaveLength(5);
  });

  it('renders the zero line', () => {
    const { container } = render(
      <ChartLinePmo data={PMO_DATA} smooth1Period={4} smooth2Period={4} signalPeriod={4} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pmo-zero-line"]'),
    ).not.toBeNull();
  });

  it('renders a three-item legend', () => {
    const { container } = render(
      <ChartLinePmo data={PMO_DATA} smooth1Period={4} smooth2Period={4} signalPeriod={4} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-pmo-legend-item"]'),
    ).toHaveLength(3);
  });

  it('renders the config badge with all three periods', () => {
    const { container } = render(
      <ChartLinePmo data={PMO_DATA} smooth1Period={35} smooth2Period={20} signalPeriod={10} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-pmo-badge-periods"]',
    );
    expect(badge!.textContent).toContain('35');
    expect(badge!.textContent).toContain('20');
    expect(badge!.textContent).toContain('10');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLinePmo
        data={PMO_DATA}
        smooth1Period={4}
        smooth2Period={4}
        signalPeriod={4}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pmo-price-path"]'),
    ).toBeNull();
  });

  it('hides the pmo line and markers when showPmo is false', () => {
    const { container } = render(
      <ChartLinePmo
        data={PMO_DATA}
        smooth1Period={4}
        smooth2Period={4}
        signalPeriod={4}
        showPmo={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pmo-pmo-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-pmo-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the signal line when showSignal is false', () => {
    const { container } = render(
      <ChartLinePmo
        data={PMO_DATA}
        smooth1Period={4}
        smooth2Period={4}
        signalPeriod={4}
        showSignal={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pmo-signal-line"]'),
    ).toBeNull();
  });

  it('hides the pmo line via the hidden set', () => {
    const { container } = render(
      <ChartLinePmo
        data={PMO_DATA}
        smooth1Period={4}
        smooth2Period={4}
        signalPeriod={4}
        hiddenSeries={['pmo']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pmo-pmo-line"]'),
    ).toBeNull();
  });

  it('hides the signal line via the hidden set', () => {
    const { container } = render(
      <ChartLinePmo
        data={PMO_DATA}
        smooth1Period={4}
        smooth2Period={4}
        signalPeriod={4}
        hiddenSeries={['signal']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pmo-signal-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLinePmo
        data={PMO_DATA}
        smooth1Period={4}
        smooth2Period={4}
        signalPeriod={4}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-pmo-legend-item"][data-series-id="pmo"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'pmo', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLinePmo
        data={PMO_DATA}
        smooth1Period={4}
        smooth2Period={4}
        signalPeriod={4}
        showDots
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-pmo-dot"]'),
    ).toHaveLength(6);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(<ChartLinePmo data={[{ x: 0, value: 5 }]} />);
    const root = container.querySelector('[data-section="chart-line-pmo"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-pmo-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLinePmo
        data={PMO_DATA}
        smooth1Period={4}
        smooth2Period={4}
        signalPeriod={4}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pmo-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLinePmo ref={ref} data={PMO_DATA} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-pmo');
  });

  it('has a stable displayName', () => {
    expect(ChartLinePmo.displayName).toBe('ChartLinePmo');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLinePmo data={PMO_DATA} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-pmo"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
