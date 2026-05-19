import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineKalman,
  DEFAULT_CHART_LINE_KALMAN_HEIGHT,
  DEFAULT_CHART_LINE_KALMAN_K_SIGMA,
  DEFAULT_CHART_LINE_KALMAN_MEASUREMENT_NOISE,
  DEFAULT_CHART_LINE_KALMAN_PALETTE,
  DEFAULT_CHART_LINE_KALMAN_PROCESS_NOISE,
  DEFAULT_CHART_LINE_KALMAN_WIDTH,
  computeLineKalmanLayout,
  describeLineKalmanChart,
  getLineKalmanDefaultColor,
  getLineKalmanFinitePoints,
  normaliseLineKalmanKSigma,
  normaliseLineKalmanNoise,
  runLineKalmanFilter,
  type ChartLineKalmanSeries,
} from './chart-line-kalman';

const noisy: ChartLineKalmanSeries = {
  id: 'n',
  label: 'Noisy',
  data: [
    { x: 0, y: 9.8 },
    { x: 1, y: 10.4 },
    { x: 2, y: 9.6 },
    { x: 3, y: 10.7 },
    { x: 4, y: 9.5 },
    { x: 5, y: 10.3 },
    { x: 6, y: 9.9 },
    { x: 7, y: 10.5 },
    { x: 8, y: 9.7 },
    { x: 9, y: 10.6 },
  ],
};

const constSeries: ChartLineKalmanSeries = {
  id: 'c',
  label: 'Const',
  data: [
    { x: 0, y: 5 },
    { x: 1, y: 5 },
    { x: 2, y: 5 },
    { x: 3, y: 5 },
    { x: 4, y: 5 },
  ],
};

describe('chart-line-kalman: defaults', () => {
  it('positive width / height', () => {
    expect(DEFAULT_CHART_LINE_KALMAN_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_KALMAN_HEIGHT).toBeGreaterThan(0);
  });

  it('default process noise < default measurement noise (typical Kalman)', () => {
    expect(DEFAULT_CHART_LINE_KALMAN_PROCESS_NOISE).toBeLessThan(
      DEFAULT_CHART_LINE_KALMAN_MEASUREMENT_NOISE,
    );
  });

  it('default k-sigma is positive', () => {
    expect(DEFAULT_CHART_LINE_KALMAN_K_SIGMA).toBeGreaterThan(0);
  });

  it('10-color palette', () => {
    expect(DEFAULT_CHART_LINE_KALMAN_PALETTE.length).toBe(10);
  });
});

describe('getLineKalmanDefaultColor', () => {
  it('cycles', () => {
    expect(getLineKalmanDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_KALMAN_PALETTE[0],
    );
    expect(getLineKalmanDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_KALMAN_PALETTE[0],
    );
  });

  it('falls back to color 0 for NaN / negative', () => {
    expect(getLineKalmanDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_KALMAN_PALETTE[0],
    );
    expect(getLineKalmanDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_KALMAN_PALETTE[0],
    );
  });
});

describe('getLineKalmanFinitePoints', () => {
  it('drops non-finite', () => {
    const f = getLineKalmanFinitePoints([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 1 },
      { x: 2, y: 3 },
    ]);
    expect(f).toHaveLength(2);
  });

  it('returns [] for null', () => {
    expect(getLineKalmanFinitePoints(null)).toEqual([]);
  });
});

describe('normaliseLineKalmanNoise', () => {
  it('uses fallback for non-finite / negative', () => {
    expect(normaliseLineKalmanNoise(Number.NaN, 7)).toBe(7);
    expect(normaliseLineKalmanNoise(-1, 7)).toBe(7);
  });

  it('allows 0', () => {
    expect(normaliseLineKalmanNoise(0, 7)).toBe(0);
  });

  it('returns positive unchanged', () => {
    expect(normaliseLineKalmanNoise(3.14, 7)).toBe(3.14);
  });
});

describe('normaliseLineKalmanKSigma', () => {
  it('returns default for non-finite / non-positive', () => {
    expect(normaliseLineKalmanKSigma(Number.NaN)).toBe(2);
    expect(normaliseLineKalmanKSigma(0)).toBe(2);
    expect(normaliseLineKalmanKSigma(-1)).toBe(2);
  });

  it('returns positive unchanged', () => {
    expect(normaliseLineKalmanKSigma(1.5)).toBe(1.5);
  });
});

describe('runLineKalmanFilter', () => {
  it('returns [] for empty / null', () => {
    expect(runLineKalmanFilter(null)).toEqual([]);
    expect(runLineKalmanFilter([])).toEqual([]);
  });

  it('first estimate moves from initial estimate toward observation by gain', () => {
    // initialEstimate=0, P0=1, Q=0, R=1 -> first gain = (P0+Q)/(P0+Q+R) = 0.5
    // first est = 0 + 0.5*(10 - 0) = 5
    const out = runLineKalmanFilter(
      [
        { x: 0, y: 10 },
        { x: 1, y: 10 },
      ],
      {
        initialEstimate: 0,
        initialVariance: 1,
        processNoise: 0,
        measurementNoise: 1,
      },
    );
    expect(out[0]?.gain).toBeCloseTo(0.5, 5);
    expect(out[0]?.estimate).toBeCloseTo(5, 5);
    // variance after first step: (1 - 0.5) * 1 = 0.5
    expect(out[0]?.variance).toBeCloseTo(0.5, 5);
  });

  it('gain decreases when prior variance shrinks (Q=0)', () => {
    const out = runLineKalmanFilter(
      [
        { x: 0, y: 10 },
        { x: 1, y: 10 },
        { x: 2, y: 10 },
      ],
      {
        initialEstimate: 0,
        initialVariance: 1,
        processNoise: 0,
        measurementNoise: 1,
      },
    );
    expect(out[0]!.gain).toBeGreaterThan(out[1]!.gain);
    expect(out[1]!.gain).toBeGreaterThan(out[2]!.gain);
  });

  it('process noise Q makes the gain converge to a non-zero steady state', () => {
    // With Q > 0, the prior variance never collapses, so gain doesn't go to 0
    const out = runLineKalmanFilter(
      noisy.data,
      {
        processNoise: 0.5,
        measurementNoise: 1,
        initialEstimate: 10,
        initialVariance: 1,
      },
    );
    const last = out[out.length - 1]!;
    expect(last.gain).toBeGreaterThan(0.1);
  });

  it('constant observations converge to the observed value', () => {
    const out = runLineKalmanFilter(constSeries.data, {
      initialEstimate: 0,
      initialVariance: 10,
      processNoise: 0,
      measurementNoise: 0.1,
    });
    const last = out[out.length - 1]!;
    expect(last.estimate).toBeCloseTo(5, 1);
  });

  it('uses observation[0] as initial estimate when not specified', () => {
    const out = runLineKalmanFilter([
      { x: 0, y: 7 },
      { x: 1, y: 7 },
    ]);
    // first xPred = 7, innovation = 0, estimate stays at 7
    expect(out[0]?.estimate).toBe(7);
  });

  it('attaches upper/lower bands derived from k * sqrt(variance)', () => {
    const out = runLineKalmanFilter(noisy.data, { kSigma: 2 });
    for (const sample of out) {
      const sd = Math.sqrt(Math.max(0, sample.variance));
      expect(sample.upper).toBeCloseTo(sample.estimate + 2 * sd, 5);
      expect(sample.lower).toBeCloseTo(sample.estimate - 2 * sd, 5);
    }
  });

  it('sorts ascending by x before filtering', () => {
    const out = runLineKalmanFilter([
      { x: 3, y: 1 },
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      { x: 1, y: 5 },
    ]);
    expect(out.map((p) => p.x)).toEqual([0, 1, 2, 3]);
  });

  it('drops non-finite before filtering', () => {
    const out = runLineKalmanFilter([
      { x: 0, y: 1 },
      { x: 1, y: Number.NaN },
      { x: 2, y: 3 },
    ]);
    expect(out).toHaveLength(2);
  });

  it('innovation is observation minus predicted', () => {
    const out = runLineKalmanFilter(
      [
        { x: 0, y: 10 },
        { x: 1, y: 15 },
      ],
      {
        initialEstimate: 0,
        initialVariance: 1,
        processNoise: 0,
        measurementNoise: 1,
      },
    );
    // first innovation: 10 - 0 = 10
    expect(out[0]?.innovation).toBe(10);
  });
});

describe('computeLineKalmanLayout', () => {
  it('returns empty for empty series', () => {
    const layout = computeLineKalmanLayout({
      series: [],
      width: 400,
      height: 300,
      padding: 40,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty for degenerate canvas', () => {
    const layout = computeLineKalmanLayout({
      series: [noisy],
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.series).toEqual([]);
  });

  it('builds per-series obs + est + band paths', () => {
    const layout = computeLineKalmanLayout({
      series: [noisy],
      width: 500,
      height: 300,
      padding: 40,
    });
    expect(layout.series).toHaveLength(1);
    const s = layout.series[0]!;
    expect(s.obsPath.length).toBeGreaterThan(0);
    expect(s.estPath.length).toBeGreaterThan(0);
    expect(s.bandPath.length).toBeGreaterThan(0);
    expect(s.points).toHaveLength(10);
  });

  it('records per-series gain stats', () => {
    const layout = computeLineKalmanLayout({
      series: [noisy],
      width: 500,
      height: 300,
      padding: 40,
    });
    const s = layout.series[0]!;
    expect(s.meanGain).toBeGreaterThan(0);
    expect(s.maxGain).toBeGreaterThanOrEqual(s.meanGain);
    expect(s.minGain).toBeLessThanOrEqual(s.meanGain);
    expect(s.finalGain).toBeGreaterThan(0);
  });

  it('records RMSE between observation and estimate', () => {
    const layout = computeLineKalmanLayout({
      series: [noisy],
      width: 500,
      height: 300,
      padding: 40,
    });
    expect(layout.series[0]?.rmseObservation).toBeGreaterThan(0);
  });

  it('expands y range to cover upper/lower bands', () => {
    const layout = computeLineKalmanLayout({
      series: [noisy],
      width: 500,
      height: 300,
      padding: 40,
      initialEstimate: 0,
      initialVariance: 100, // huge initial variance -> wide initial band
    });
    // upper band at i=0 should push yMax well above the data range (data 9.5-10.7)
    expect(layout.yMax).toBeGreaterThan(11);
  });

  it('drops hidden series', () => {
    const layout = computeLineKalmanLayout({
      series: [noisy, constSeries],
      hiddenSeries: ['c'],
      width: 500,
      height: 300,
      padding: 40,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('n');
  });

  it('honors bounds overrides', () => {
    const layout = computeLineKalmanLayout({
      series: [noisy],
      width: 500,
      height: 300,
      padding: 40,
      yMin: -50,
      yMax: 50,
    });
    expect(layout.yMin).toBe(-50);
    expect(layout.yMax).toBe(50);
  });

  it('per-series noise override beats chart-level', () => {
    const layout = computeLineKalmanLayout({
      series: [{ ...noisy, processNoise: 0.5 }],
      width: 500,
      height: 300,
      padding: 40,
      processNoise: 0.01,
    });
    expect(layout.series[0]?.processNoise).toBe(0.5);
  });

  it('records visibleSeriesCount + totalPoints', () => {
    const layout = computeLineKalmanLayout({
      series: [noisy, constSeries],
      width: 500,
      height: 300,
      padding: 40,
    });
    expect(layout.visibleSeriesCount).toBe(2);
    expect(layout.totalPoints).toBe(10 + 5);
  });

  it('per-point projected pys: upper above lower on screen; obs and est diverge after first sample', () => {
    const layout = computeLineKalmanLayout({
      series: [noisy],
      width: 500,
      height: 300,
      padding: 40,
    });
    const points = layout.series[0]!.points;
    // upper band is at a higher y value than lower -> SMALLER py (top of screen)
    expect(points[0]?.upperPy).toBeLessThan(points[0]?.lowerPy ?? 0);
    // After the first sample, obs and est typically diverge as the filter
    // smooths away the noise (innovation != 0 at i >= 1)
    const diverged = points
      .slice(1)
      .some((p) => p.obsPy !== p.estPy);
    expect(diverged).toBe(true);
  });
});

describe('describeLineKalmanChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineKalmanChart([])).toBe('No data');
    expect(describeLineKalmanChart(null)).toBe('No data');
  });

  it('describes Q, R, final estimate, gain', () => {
    const desc = describeLineKalmanChart([noisy]);
    expect(desc).toMatch(/Q /);
    expect(desc).toMatch(/R /);
    expect(desc).toMatch(/final estimate/);
    expect(desc).toMatch(/gain/);
  });
});

describe('<ChartLineKalman> render', () => {
  it('renders empty when no series', () => {
    const { container } = render(<ChartLineKalman series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-kalman"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('renders observation path with kind=observation', () => {
    render(<ChartLineKalman series={[noisy]} />);
    const path = document.querySelector(
      '[data-section="chart-line-kalman-obs-path"]',
    );
    expect(path?.getAttribute('data-kind')).toBe('observation');
  });

  it('renders estimate path with kind=estimate', () => {
    render(<ChartLineKalman series={[noisy]} />);
    const path = document.querySelector(
      '[data-section="chart-line-kalman-est-path"]',
    );
    expect(path?.getAttribute('data-kind')).toBe('estimate');
  });

  it('renders uncertainty band polygon', () => {
    render(<ChartLineKalman series={[noisy]} />);
    const band = document.querySelector(
      '[data-section="chart-line-kalman-band"]',
    );
    expect(band).not.toBeNull();
  });

  it('hides band via showBand=false', () => {
    render(<ChartLineKalman series={[noisy]} showBand={false} />);
    expect(
      document.querySelector('[data-section="chart-line-kalman-band"]'),
    ).toBeNull();
  });

  it('hides obs path via showObservations=false', () => {
    render(<ChartLineKalman series={[noisy]} showObservations={false} />);
    expect(
      document.querySelector('[data-section="chart-line-kalman-obs-path"]'),
    ).toBeNull();
  });

  it('renders dots with gain + variance + innovation attrs', () => {
    render(<ChartLineKalman series={[noisy]} />);
    const dot = document.querySelector(
      '[data-section="chart-line-kalman-dot"][data-point-index="0"]',
    );
    expect(dot?.getAttribute('data-gain')).toBeTruthy();
    expect(dot?.getAttribute('data-variance')).toBeTruthy();
    expect(dot?.getAttribute('data-innovation')).toBeTruthy();
    expect(dot?.getAttribute('data-estimate')).toBeTruthy();
    expect(dot?.getAttribute('data-observation')).toBeTruthy();
  });

  it('hides dots via showDots=false', () => {
    render(<ChartLineKalman series={[noisy]} showDots={false} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-kalman-dot"]')
        .length,
    ).toBe(0);
  });

  it('renders gain badge with final gain', () => {
    render(<ChartLineKalman series={[noisy]} />);
    const badge = document.querySelector(
      '[data-section="chart-line-kalman-badge"]',
    );
    expect(Number(badge?.getAttribute('data-gain'))).toBeGreaterThan(0);
  });

  it('hides gain badge via showGainBadge=false', () => {
    render(<ChartLineKalman series={[noisy]} showGainBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-kalman-badge"]'),
    ).toBeNull();
  });

  it('region+img ARIA', () => {
    render(<ChartLineKalman series={[noisy]} ariaLabel="kf" />);
    const region = screen.getByRole('region', { name: 'kf' });
    const img = within(region).getByRole('img', { name: 'kf' });
    expect(img.tagName.toLowerCase()).toBe('svg');
  });

  it('mirrors root data-*', () => {
    render(
      <ChartLineKalman
        series={[noisy]}
        processNoise={0.1}
        measurementNoise={2}
      />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-kalman"]',
    );
    expect(root?.getAttribute('data-series-count')).toBe('1');
    expect(root?.getAttribute('data-total-points')).toBe('10');
    expect(Number(root?.getAttribute('data-process-noise'))).toBe(0.1);
    expect(Number(root?.getAttribute('data-measurement-noise'))).toBe(2);
    expect(
      Number(root?.getAttribute('data-dominant-gain')),
    ).toBeGreaterThan(0);
  });

  it('mirrors per-series stats on group', () => {
    render(<ChartLineKalman series={[noisy]} />);
    const group = document.querySelector(
      '[data-section="chart-line-kalman-series-group"]',
    );
    expect(group?.getAttribute('data-series-mean-gain')).toBeTruthy();
    expect(group?.getAttribute('data-series-final-gain')).toBeTruthy();
    expect(group?.getAttribute('data-series-rmse')).toBeTruthy();
  });

  it('tooltip shows obs + est + variance + gain + innovation rows', () => {
    render(<ChartLineKalman series={[noisy]} />);
    const dot = document.querySelector(
      '[data-section="chart-line-kalman-dot"][data-point-index="3"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    const obs = document.querySelector(
      '[data-section="chart-line-kalman-tooltip-observation"]',
    );
    const est = document.querySelector(
      '[data-section="chart-line-kalman-tooltip-estimate"]',
    );
    const variance = document.querySelector(
      '[data-section="chart-line-kalman-tooltip-variance"]',
    );
    const gain = document.querySelector(
      '[data-section="chart-line-kalman-tooltip-gain"]',
    );
    const innov = document.querySelector(
      '[data-section="chart-line-kalman-tooltip-innovation"]',
    );
    expect(obs?.textContent).toMatch(/obs:/);
    expect(est?.textContent).toMatch(/est:/);
    expect(variance?.textContent).toMatch(/var:/);
    expect(gain?.textContent).toMatch(/gain:/);
    expect(innov?.textContent).toMatch(/innov:/);
  });

  it('hides tooltip on leave', () => {
    render(<ChartLineKalman series={[noisy]} />);
    const dot = document.querySelector(
      '[data-section="chart-line-kalman-dot"][data-point-index="3"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector('[data-section="chart-line-kalman-tooltip"]'),
    ).toBeNull();
  });

  it('omits tooltip via showTooltip=false', () => {
    render(<ChartLineKalman series={[noisy]} showTooltip={false} />);
    const dot = document.querySelector(
      '[data-section="chart-line-kalman-dot"][data-point-index="3"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector('[data-section="chart-line-kalman-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineKalman series={[noisy]} onPointClick={onPointClick} />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-kalman-dot"][data-point-index="2"]',
    ) as HTMLElement;
    fireEvent.click(dot);
    expect(onPointClick).toHaveBeenCalledTimes(1);
    expect(onPointClick.mock.calls[0]?.[0]?.point?.index).toBe(2);
  });

  it('legend shows Q + R + mean gain', () => {
    render(<ChartLineKalman series={[noisy]} />);
    const stats = document.querySelector(
      '[data-section="chart-line-kalman-legend-stats"]',
    );
    expect(stats?.textContent).toMatch(/Q /);
    expect(stats?.textContent).toMatch(/R /);
    expect(stats?.textContent).toMatch(/gain/);
  });

  it('toggles visibility via legend', () => {
    const onToggle = vi.fn();
    render(
      <ChartLineKalman series={[noisy]} onSeriesToggle={onToggle} />,
    );
    const item = document.querySelector(
      '[data-section="chart-line-kalman-legend-item"]',
    ) as HTMLElement;
    fireEvent.click(item);
    expect(onToggle).toHaveBeenCalledWith({ series: noisy, hidden: true });
  });

  it('omits legend via showLegend=false', () => {
    render(<ChartLineKalman series={[noisy]} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-kalman-legend"]'),
    ).toBeNull();
  });

  it('applies animate class', () => {
    const { container } = render(<ChartLineKalman series={[noisy]} animate />);
    const root = container.querySelector(
      '[data-section="chart-line-kalman"]',
    );
    expect(root?.className).toMatch(/animate-fade-in/);
  });

  it('omits animate class when animate=false', () => {
    const { container } = render(
      <ChartLineKalman series={[noisy]} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kalman"]',
    );
    expect(root?.className ?? '').not.toMatch(/animate-fade-in/);
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineKalman ref={ref} series={[noisy]} />);
    expect(ref.current).not.toBeNull();
  });

  it('has stable displayName', () => {
    expect(ChartLineKalman.displayName).toBe('ChartLineKalman');
  });
});
