import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineKalmanSmoother,
  DEFAULT_CHART_LINE_KALMAN_SMOOTHER_HEIGHT,
  DEFAULT_CHART_LINE_KALMAN_SMOOTHER_PADDING,
  DEFAULT_CHART_LINE_KALMAN_SMOOTHER_PALETTE,
  DEFAULT_CHART_LINE_KALMAN_SMOOTHER_TICK_COUNT,
  DEFAULT_CHART_LINE_KALMAN_SMOOTHER_WIDTH,
  computeLineKalmanSmootherLayout,
  describeLineKalmanSmootherChart,
  getLineKalmanSmootherDefaultColor,
  getLineKalmanSmootherFinitePoints,
  runRtsSmoother,
  type ChartLineKalmanSmootherSeries,
} from './chart-line-kalman-smoother';

afterEach(() => {
  cleanup();
});

// With Q = 0 (constant-state model) the RTS smoother collapses every
// estimate onto the final filter estimate and every variance onto the
// final (smallest) filter variance.
const Q0 = [10, 12, 8, 10];
const NOISY = [5, 7, 3, 8, 2, 9, 4, 6, 5, 7];

function toPoints(ys: readonly number[]): { x: number; y: number }[] {
  return ys.map((y, i) => ({ x: i, y }));
}

describe('chart-line-kalman-smoother defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_KALMAN_SMOOTHER_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_KALMAN_SMOOTHER_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_KALMAN_SMOOTHER_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_KALMAN_SMOOTHER_TICK_COUNT).toBeGreaterThan(0);
  });
  it('palette has 10 colours', () => {
    expect(DEFAULT_CHART_LINE_KALMAN_SMOOTHER_PALETTE.length).toBe(10);
  });
});

describe('getLineKalmanSmootherDefaultColor', () => {
  it('cycles through the palette', () => {
    const len = DEFAULT_CHART_LINE_KALMAN_SMOOTHER_PALETTE.length;
    expect(getLineKalmanSmootherDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_KALMAN_SMOOTHER_PALETTE[0],
    );
    expect(getLineKalmanSmootherDefaultColor(len)).toBe(
      DEFAULT_CHART_LINE_KALMAN_SMOOTHER_PALETTE[0],
    );
  });
  it('handles non-finite and negative', () => {
    expect(getLineKalmanSmootherDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_KALMAN_SMOOTHER_PALETTE[0],
    );
    expect(getLineKalmanSmootherDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_KALMAN_SMOOTHER_PALETTE[0],
    );
  });
});

describe('getLineKalmanSmootherFinitePoints', () => {
  it('drops non-finite values', () => {
    const r = getLineKalmanSmootherFinitePoints([
      { x: 0, y: 0 },
      { x: NaN, y: 1 },
      { x: 1, y: Infinity },
      { x: 2, y: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineKalmanSmootherFinitePoints(null)).toEqual([]);
    expect(getLineKalmanSmootherFinitePoints(undefined)).toEqual([]);
  });
});

describe('runRtsSmoother', () => {
  it('empty / null -> []', () => {
    expect(runRtsSmoother(null)).toEqual([]);
    expect(runRtsSmoother([])).toEqual([]);
  });

  it('single point: the smoother equals the filter', () => {
    const r = runRtsSmoother(toPoints([7]), {
      measurementNoise: 1,
      initialVariance: 1,
    });
    expect(r.length).toBe(1);
    expect(r[0]!.smoothedEstimate).toBeCloseTo(r[0]!.filterEstimate, 10);
    expect(r[0]!.smoothedVariance).toBeCloseTo(r[0]!.filterVariance, 10);
  });

  it('the last point: smoother estimate / variance equal the filter', () => {
    const r = runRtsSmoother(toPoints(NOISY), {
      processNoise: 0.1,
      measurementNoise: 1,
    });
    const last = r[r.length - 1]!;
    expect(last.smoothedEstimate).toBeCloseTo(last.filterEstimate, 10);
    expect(last.smoothedVariance).toBeCloseTo(last.filterVariance, 10);
  });

  it('Q=0: every smoothed estimate equals the final filter estimate', () => {
    // forward filter estimates are [10, 32/3, 10, 10]; with Q=0 the
    // RTS smoother collapses all of them onto the final estimate 10.
    const r = runRtsSmoother(toPoints(Q0), {
      processNoise: 0,
      measurementNoise: 1,
      initialVariance: 1,
    });
    const finalFilter = r[r.length - 1]!.filterEstimate;
    expect(finalFilter).toBeCloseTo(10, 8);
    for (const s of r) {
      expect(s.smoothedEstimate).toBeCloseTo(10, 8);
    }
  });

  it('Q=0: every smoothed variance equals the final filter variance', () => {
    const r = runRtsSmoother(toPoints(Q0), {
      processNoise: 0,
      measurementNoise: 1,
      initialVariance: 1,
    });
    const finalVar = r[r.length - 1]!.filterVariance;
    expect(finalVar).toBeCloseTo(0.2, 8);
    for (const s of r) {
      expect(s.smoothedVariance).toBeCloseTo(0.2, 8);
    }
  });

  it('the smoother never increases the variance over the filter', () => {
    const r = runRtsSmoother(toPoints(NOISY), {
      processNoise: 0.1,
      measurementNoise: 1,
    });
    for (const s of r) {
      expect(s.smoothedVariance).toBeLessThanOrEqual(
        s.filterVariance + 1e-9,
      );
    }
  });

  it('the smoother differs from the filter at interior points', () => {
    // Q0 filter estimate at index 1 is 32/3 ~ 10.667; the smoothed
    // estimate there is 10 -- the backward pass moved it.
    const r = runRtsSmoother(toPoints(Q0), {
      processNoise: 0,
      measurementNoise: 1,
      initialVariance: 1,
    });
    expect(r[1]!.filterEstimate).toBeCloseTo(32 / 3, 6);
    expect(r[1]!.smoothedEstimate).toBeCloseTo(10, 6);
    expect(
      Math.abs(r[1]!.filterEstimate - r[1]!.smoothedEstimate),
    ).toBeGreaterThan(0.5);
  });

  it('the smoother gain is zero at the final point', () => {
    const r = runRtsSmoother(toPoints(NOISY), {
      processNoise: 0.1,
      measurementNoise: 1,
    });
    expect(r[r.length - 1]!.smootherGain).toBe(0);
  });

  it('smoothed band straddles the smoothed estimate', () => {
    const r = runRtsSmoother(toPoints(NOISY), {
      processNoise: 0.1,
      measurementNoise: 1,
      kSigma: 2,
    });
    for (const s of r) {
      expect(s.smoothedUpper).toBeGreaterThanOrEqual(s.smoothedEstimate);
      expect(s.smoothedLower).toBeLessThanOrEqual(s.smoothedEstimate);
    }
  });

  it('sorts ascending and drops non-finite (inherited from the filter)', () => {
    const r = runRtsSmoother([
      { x: 3, y: 4 },
      { x: NaN, y: 0 },
      { x: 1, y: 2 },
      { x: 0, y: 1 },
      { x: 2, y: 3 },
    ]);
    expect(r.map((s) => s.x)).toEqual([0, 1, 2, 3]);
  });
});

describe('computeLineKalmanSmootherLayout', () => {
  const series: ChartLineKalmanSmootherSeries[] = [
    {
      id: 'a',
      label: 'A',
      data: toPoints(Q0),
      processNoise: 0,
      measurementNoise: 1,
      initialVariance: 1,
    },
  ];

  it('empty series -> ok=false', () => {
    const layout = computeLineKalmanSmootherLayout({
      series: [],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('degenerate canvas -> ok=false', () => {
    const layout = computeLineKalmanSmootherLayout({
      series,
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('all hidden -> ok=false', () => {
    const layout = computeLineKalmanSmootherLayout({
      series,
      hiddenSeries: ['a'],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('builds observation, filter, smoothed and band paths', () => {
    const layout = computeLineKalmanSmootherLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(true);
    const s = layout.series[0]!;
    expect(s.obsPath).toContain('M ');
    expect(s.filterPath).toContain('M ');
    expect(s.smoothedPath).toContain('M ');
    expect(s.bandPath).toContain('M ');
    expect(s.bandPath).toContain('Z');
    expect(s.filterUpperPath).toContain('M ');
    expect(s.filterLowerPath).toContain('M ');
  });

  it('exposes the variance-reduction statistics', () => {
    const layout = computeLineKalmanSmootherLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
    });
    const s = layout.series[0]!;
    // mean filter variance ~ (0.5 + 1/3 + 0.25 + 0.2)/4 ~ 0.3208;
    // mean smoothed variance = 0.2 (Q=0 collapse)
    expect(s.meanSmoothedVariance).toBeCloseTo(0.2, 6);
    expect(s.meanFilterVariance).toBeGreaterThan(s.meanSmoothedVariance);
    expect(s.varianceReductionPct).toBeGreaterThan(0);
  });

  it('exposes per-series Q, R and kSigma', () => {
    const layout = computeLineKalmanSmootherLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
      kSigma: 3,
    });
    const s = layout.series[0]!;
    expect(s.processNoise).toBe(0);
    expect(s.measurementNoise).toBe(1);
    expect(s.kSigma).toBe(3);
  });

  it('per-series process noise override beats chart-level', () => {
    const layout = computeLineKalmanSmootherLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: toPoints(NOISY),
          processNoise: 0.5,
        },
      ],
      width: 400,
      height: 200,
      padding: 30,
      processNoise: 0.01,
    });
    expect(layout.series[0]!.processNoise).toBe(0.5);
  });

  it('hidden series excluded', () => {
    const multi: ChartLineKalmanSmootherSeries[] = [
      ...series,
      { id: 'b', label: 'B', data: toPoints(NOISY) },
    ];
    const layout = computeLineKalmanSmootherLayout({
      series: multi,
      hiddenSeries: ['b'],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.visibleSeriesCount).toBe(1);
    expect(layout.series[0]!.id).toBe('a');
  });

  it('bounds overrides honoured', () => {
    const layout = computeLineKalmanSmootherLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
      xMin: -5,
      xMax: 50,
      yMin: -10,
      yMax: 40,
    });
    expect(layout.xMin).toBe(-5);
    expect(layout.xMax).toBe(50);
    expect(layout.yMin).toBe(-10);
    expect(layout.yMax).toBe(40);
  });

  it('totalPoints sums finite samples', () => {
    const multi: ChartLineKalmanSmootherSeries[] = [
      ...series,
      { id: 'b', label: 'B', data: toPoints(NOISY) },
    ];
    const layout = computeLineKalmanSmootherLayout({
      series: multi,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.totalPoints).toBe(Q0.length + NOISY.length);
  });
});

describe('describeLineKalmanSmootherChart', () => {
  it('no data -> No data', () => {
    expect(describeLineKalmanSmootherChart(null)).toBe('No data');
    expect(describeLineKalmanSmootherChart([])).toBe('No data');
  });
  it('summary mentions the RTS smoother and the variance reduction', () => {
    const s = describeLineKalmanSmootherChart([
      {
        id: 'a',
        label: 'A',
        data: toPoints(Q0),
        processNoise: 0,
        measurementNoise: 1,
      },
    ]);
    expect(s).toContain('Rauch-Tung-Striebel');
    expect(s).toContain('all observations');
    expect(s).toContain('uncertainty');
  });
  it('handles hidden filter', () => {
    const s = describeLineKalmanSmootherChart(
      [{ id: 'a', label: 'A', data: toPoints(NOISY) }],
      { hidden: ['a'] },
    );
    expect(s).toBe('No data');
  });
});

describe('<ChartLineKalmanSmoother> render', () => {
  const series: ChartLineKalmanSmootherSeries[] = [
    {
      id: 'a',
      label: 'Series A',
      data: toPoints(Q0),
      processNoise: 0,
      measurementNoise: 1,
      initialVariance: 1,
    },
  ];

  it('renders empty state when no data', () => {
    render(<ChartLineKalmanSmoother series={[]} />);
    const root = document.querySelector(
      '[data-section="chart-line-kalman-smoother"]',
    );
    expect(root).not.toBeNull();
    expect(root!.getAttribute('data-empty')).toBe('true');
  });

  it('renders observation path with data-kind=observation', () => {
    render(<ChartLineKalmanSmoother series={series} />);
    const obs = document.querySelector(
      '[data-section="chart-line-kalman-smoother-obs-path"]',
    );
    expect(obs).not.toBeNull();
    expect(obs!.getAttribute('data-kind')).toBe('observation');
  });

  it('renders filter path with data-kind=filter', () => {
    render(<ChartLineKalmanSmoother series={series} />);
    const flt = document.querySelector(
      '[data-section="chart-line-kalman-smoother-filter-path"]',
    );
    expect(flt).not.toBeNull();
    expect(flt!.getAttribute('data-kind')).toBe('filter');
  });

  it('renders smoothed path with data-kind=smoothed', () => {
    render(<ChartLineKalmanSmoother series={series} />);
    const sm = document.querySelector(
      '[data-section="chart-line-kalman-smoother-smoothed-path"]',
    );
    expect(sm).not.toBeNull();
    expect(sm!.getAttribute('data-kind')).toBe('smoothed');
  });

  it('renders the smoothed uncertainty band by default', () => {
    render(<ChartLineKalmanSmoother series={series} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-kalman-smoother-band"]',
      ),
    ).not.toBeNull();
  });

  it('hides the band when showBand=false', () => {
    render(<ChartLineKalmanSmoother series={series} showBand={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-kalman-smoother-band"]',
      ),
    ).toBeNull();
  });

  it('hides the observation path when showObservations=false', () => {
    render(
      <ChartLineKalmanSmoother series={series} showObservations={false} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-kalman-smoother-obs-path"]',
      ),
    ).toBeNull();
  });

  it('hides the filter path when showFilter=false', () => {
    render(<ChartLineKalmanSmoother series={series} showFilter={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-kalman-smoother-filter-path"]',
      ),
    ).toBeNull();
  });

  it('omits the filter band by default and shows it via prop', () => {
    const { rerender } = render(<ChartLineKalmanSmoother series={series} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-kalman-smoother-filter-band"]',
      ),
    ).toBeNull();
    rerender(
      <ChartLineKalmanSmoother series={series} showFilterBand={true} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-kalman-smoother-filter-band"]',
      ),
    ).not.toBeNull();
  });

  it('omits dots by default and shows them via showDots', () => {
    const { rerender } = render(<ChartLineKalmanSmoother series={series} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-kalman-smoother-dot"]',
      ).length,
    ).toBe(0);
    rerender(<ChartLineKalmanSmoother series={series} showDots={true} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-kalman-smoother-dot"]',
      ).length,
    ).toBe(4);
  });

  it('config badge shows Q, R and the variance reduction', () => {
    render(<ChartLineKalmanSmoother series={series} />);
    const badge = document.querySelector(
      '[data-section="chart-line-kalman-smoother-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(
      document
        .querySelector(
          '[data-section="chart-line-kalman-smoother-badge-process"]',
        )
        ?.textContent?.startsWith('Q='),
    ).toBe(true);
    expect(
      document
        .querySelector(
          '[data-section="chart-line-kalman-smoother-badge-measurement"]',
        )
        ?.textContent?.startsWith('R='),
    ).toBe(true);
    expect(
      document
        .querySelector(
          '[data-section="chart-line-kalman-smoother-badge-reduction"]',
        )
        ?.textContent?.includes('% var'),
    ).toBe(true);
  });

  it('hides config badge when showConfigBadge=false', () => {
    render(
      <ChartLineKalmanSmoother series={series} showConfigBadge={false} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-kalman-smoother-badge"]',
      ),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineKalmanSmoother series={series} />);
    const root = document.querySelector(
      '[data-section="chart-line-kalman-smoother"]',
    );
    expect(root!.getAttribute('role')).toBe('region');
    const svg = document.querySelector(
      '[data-section="chart-line-kalman-smoother-svg"]',
    );
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = document.querySelector(
      '[data-section="chart-line-kalman-smoother-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Rauch-Tung-Striebel');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineKalmanSmoother series={series} />);
    const root = document.querySelector(
      '[data-section="chart-line-kalman-smoother"]',
    );
    expect(root!.getAttribute('data-series-count')).toBe('1');
    expect(root!.getAttribute('data-visible-series-count')).toBe('1');
    expect(Number(root!.getAttribute('data-total-points'))).toBe(4);
    expect(root!.getAttribute('data-process-noise')).toBe('0');
    expect(
      Number(root!.getAttribute('data-variance-reduction')),
    ).toBeGreaterThan(0);
  });

  it('series group exposes data-* attributes', () => {
    render(<ChartLineKalmanSmoother series={series} />);
    const grp = document.querySelector(
      '[data-section="chart-line-kalman-smoother-series-group"]',
    );
    expect(grp).not.toBeNull();
    expect(grp!.getAttribute('data-series-id')).toBe('a');
    expect(grp!.getAttribute('data-series-process-noise')).toBe('0');
    expect(
      Number(grp!.getAttribute('data-series-mean-smoothed-variance')),
    ).toBeCloseTo(0.2, 5);
    expect(
      Number(grp!.getAttribute('data-series-mean-filter-variance')),
    ).toBeGreaterThan(0.2);
    expect(
      Number(grp!.getAttribute('data-series-finite-count')),
    ).toBe(4);
  });

  it('tooltip appears on dot hover with observation + filter + smoothed rows', () => {
    render(<ChartLineKalmanSmoother series={series} showDots={true} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-kalman-smoother-dot"]',
    );
    fireEvent.mouseEnter(dots[1]!);
    expect(
      document.querySelector(
        '[data-section="chart-line-kalman-smoother-tooltip"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-kalman-smoother-tooltip-observation"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-kalman-smoother-tooltip-filter"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-kalman-smoother-tooltip-smoothed"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-kalman-smoother-tooltip-smoothed-variance"]',
      ),
    ).not.toBeNull();
    fireEvent.mouseLeave(dots[1]!);
    expect(
      document.querySelector(
        '[data-section="chart-line-kalman-smoother-tooltip"]',
      ),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    render(
      <ChartLineKalmanSmoother
        series={series}
        showDots={true}
        showTooltip={false}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-kalman-smoother-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector(
        '[data-section="chart-line-kalman-smoother-tooltip"]',
      ),
    ).toBeNull();
  });

  it('onPointClick fires with series + point payload', () => {
    let captured: { seriesId: string; pointIndex: number } | null = null;
    render(
      <ChartLineKalmanSmoother
        series={series}
        showDots={true}
        onPointClick={({ series: s, point }) => {
          captured = { seriesId: s.id, pointIndex: point.index };
        }}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-kalman-smoother-dot"]',
    );
    fireEvent.click(dot!);
    expect(captured).not.toBeNull();
    expect(captured!.seriesId).toBe('a');
  });

  it('legend shows Q + variance reduction and toggles series', () => {
    let lastHidden: ReadonlySet<string> | null = null;
    render(
      <ChartLineKalmanSmoother
        series={series}
        onHiddenSeriesChange={(h) => {
          lastHidden = h;
        }}
      />,
    );
    const stats = document.querySelector(
      '[data-section="chart-line-kalman-smoother-legend-stats"]',
    );
    expect(stats).not.toBeNull();
    expect(stats!.textContent).toContain('Q=');
    expect(stats!.textContent).toContain('% var');
    const btn = document.querySelector(
      '[data-section="chart-line-kalman-smoother-legend-item"]',
    );
    fireEvent.click(btn!);
    expect(lastHidden).not.toBeNull();
    expect(lastHidden!.has('a')).toBe(true);
  });

  it('omits legend when showLegend=false', () => {
    render(<ChartLineKalmanSmoother series={series} showLegend={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-kalman-smoother-legend"]',
      ),
    ).toBeNull();
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineKalmanSmoother series={series} animate={true} />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-kalman-smoother"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(<ChartLineKalmanSmoother series={series} animate={false} />);
    const root2 = document.querySelector(
      '[data-section="chart-line-kalman-smoother"]',
    );
    expect(root2!.getAttribute('data-animate')).toBe('false');
    expect(root2!.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineKalmanSmoother ref={ref} series={series} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-kalman-smoother',
    );
  });

  it('has displayName', () => {
    expect(ChartLineKalmanSmoother.displayName).toBe(
      'ChartLineKalmanSmoother',
    );
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(
      <ChartLineKalmanSmoother
        series={series}
        ariaLabel="Custom smoother label"
      />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-kalman-smoother"]',
    );
    expect(root!.getAttribute('aria-label')).toBe('Custom smoother label');
    const svg = document.querySelector(
      '[data-section="chart-line-kalman-smoother-svg"]',
    );
    expect(svg!.getAttribute('aria-label')).toBe('Custom smoother label');
  });

  it('xLabel and yLabel render axis text', () => {
    render(
      <ChartLineKalmanSmoother
        series={series}
        xLabel="time"
        yLabel="value"
      />,
    );
    expect(screen.getByText('time').getAttribute('data-section')).toBe(
      'chart-line-kalman-smoother-x-label',
    );
    expect(screen.getByText('value').getAttribute('data-section')).toBe(
      'chart-line-kalman-smoother-y-label',
    );
  });

  it('dot exposes filter and smoothed estimate data attributes', () => {
    render(<ChartLineKalmanSmoother series={series} showDots={true} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-kalman-smoother-dot"]',
    );
    const dot1 = dots[1]!;
    // Q0 index 1: filter estimate 32/3, smoothed estimate 10
    expect(Number(dot1.getAttribute('data-filter-estimate'))).toBeCloseTo(
      32 / 3,
      5,
    );
    expect(Number(dot1.getAttribute('data-smoothed-estimate'))).toBeCloseTo(
      10,
      5,
    );
  });
});
