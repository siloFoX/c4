import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineParabolicSar,
  DEFAULT_CHART_LINE_PARABOLIC_SAR_DOWN_COLOR,
  DEFAULT_CHART_LINE_PARABOLIC_SAR_HEIGHT,
  DEFAULT_CHART_LINE_PARABOLIC_SAR_PADDING,
  DEFAULT_CHART_LINE_PARABOLIC_SAR_UP_COLOR,
  DEFAULT_CHART_LINE_PARABOLIC_SAR_WIDTH,
  computeLineParabolicSarLayout,
  describeLineParabolicSarChart,
  getLineParabolicSarFinitePoints,
  normalizeLineParabolicSarStep,
  runLineParabolicSar,
  type ChartLineParabolicSarPoint,
} from './chart-line-parabolic-sar';

afterEach(() => {
  cleanup();
});

// rises through index 3 then falls -> one stop-and-reverse flip
const PSAR_DATA: ChartLineParabolicSarPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 12 },
  { x: 2, value: 14 },
  { x: 3, value: 16 },
  { x: 4, value: 11 },
  { x: 5, value: 9 },
  { x: 6, value: 8 },
];

describe('chart-line-parabolic-sar defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_PARABOLIC_SAR_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_PARABOLIC_SAR_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_PARABOLIC_SAR_PADDING).toBeGreaterThan(0);
  });
});

describe('getLineParabolicSarFinitePoints', () => {
  it('drops points with non-finite x or value', () => {
    const r = getLineParabolicSarFinitePoints([
      { x: 0, value: 0 },
      { x: NaN, value: 1 },
      { x: 1, value: Infinity },
      { x: 2, value: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineParabolicSarFinitePoints(null)).toEqual([]);
  });
});

describe('normalizeLineParabolicSarStep', () => {
  it('keeps a positive value', () => {
    expect(normalizeLineParabolicSarStep(0.05, 0.02)).toBe(0.05);
  });
  it('a non-positive value falls back', () => {
    expect(normalizeLineParabolicSarStep(0, 0.02)).toBe(0.02);
    expect(normalizeLineParabolicSarStep(-1, 0.02)).toBe(0.02);
  });
  it('a non-finite value falls back', () => {
    expect(normalizeLineParabolicSarStep(NaN, 0.02)).toBe(0.02);
  });
});

describe('runLineParabolicSar', () => {
  it('empty -> ok=false', () => {
    expect(runLineParabolicSar([]).ok).toBe(false);
  });
  it('a single point -> ok=false', () => {
    expect(runLineParabolicSar([{ x: 0, value: 1 }]).ok).toBe(false);
  });
  it('the initial trend is up when the first move rises', () => {
    expect(runLineParabolicSar(PSAR_DATA).samples[0]!.trend).toBe('up');
  });
  it('the initial trend is down when the first move falls', () => {
    const r = runLineParabolicSar([
      { x: 0, value: 20 },
      { x: 1, value: 15 },
      { x: 2, value: 10 },
    ]);
    expect(r.samples[0]!.trend).toBe('down');
  });
  it('accelerates the SAR toward the extreme point', () => {
    const r = runLineParabolicSar(PSAR_DATA);
    expect(r.samples[3]!.sar).toBeCloseTo(10.24, 6);
    expect(r.samples[4]!.sar).toBeCloseTo(10.7008, 6);
  });
  it('stops and reverses when price pierces the SAR', () => {
    const r = runLineParabolicSar(PSAR_DATA);
    expect(r.samples[5]!.reversed).toBe(true);
    expect(r.samples[5]!.trend).toBe('down');
    // on a reversal the SAR jumps to the prior extreme point
    expect(r.samples[5]!.sar).toBe(16);
  });
  it('continues the SAR after a reversal', () => {
    expect(runLineParabolicSar(PSAR_DATA).samples[6]!.sar).toBeCloseTo(
      15.86,
      6,
    );
  });
  it('counts the reversals', () => {
    expect(runLineParabolicSar(PSAR_DATA).reversalCount).toBe(1);
  });
  it('reports the per-period trend sequence', () => {
    expect(
      runLineParabolicSar(PSAR_DATA).samples.map((s) => s.trend),
    ).toEqual(['up', 'up', 'up', 'up', 'up', 'down', 'down']);
  });
  it('counts the up and down periods', () => {
    const r = runLineParabolicSar(PSAR_DATA);
    expect(r.upCount).toBe(5);
    expect(r.downCount).toBe(2);
  });
  it('sorts the series by x', () => {
    const r = runLineParabolicSar([
      { x: 2, value: 4 },
      { x: 0, value: 0 },
      { x: 1, value: 8 },
    ]);
    expect(r.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });
  it('clamps maxStep up to at least step', () => {
    const r = runLineParabolicSar(PSAR_DATA, { step: 0.1, maxStep: 0.05 });
    expect(r.maxStep).toBe(0.1);
  });
});

describe('computeLineParabolicSarLayout', () => {
  const base = { width: 500, height: 240, padding: 30 };

  it('empty data -> ok=false', () => {
    expect(computeLineParabolicSarLayout({ data: [], ...base }).ok).toBe(
      false,
    );
  });

  it('degenerate canvas -> ok=false', () => {
    expect(
      computeLineParabolicSarLayout({
        data: PSAR_DATA,
        width: 20,
        height: 20,
        padding: 30,
      }).ok,
    ).toBe(false);
  });

  it('builds the price line path', () => {
    const layout = computeLineParabolicSarLayout({
      data: PSAR_DATA,
      ...base,
    });
    expect(layout.ok).toBe(true);
    expect(layout.pricePath).toContain('M ');
  });

  it('projects a price dot and a SAR dot per period', () => {
    const layout = computeLineParabolicSarLayout({
      data: PSAR_DATA,
      ...base,
    });
    expect(layout.priceDots.length).toBe(7);
    expect(layout.sarDots.length).toBe(7);
  });

  it('SAR dots carry the trend and reversed flag', () => {
    const layout = computeLineParabolicSarLayout({
      data: PSAR_DATA,
      ...base,
    });
    expect(layout.sarDots[0]!.trend).toBe('up');
    expect(layout.sarDots[5]!.reversed).toBe(true);
  });

  it('the y range covers both the price and the SAR', () => {
    const layout = computeLineParabolicSarLayout({
      data: PSAR_DATA,
      ...base,
    });
    expect(layout.yMin).toBeLessThanOrEqual(8);
    expect(layout.yMax).toBeGreaterThanOrEqual(16);
  });

  it('exposes the reversal and trend counts', () => {
    const layout = computeLineParabolicSarLayout({
      data: PSAR_DATA,
      ...base,
    });
    expect(layout.reversalCount).toBe(1);
    expect(layout.upCount).toBe(5);
    expect(layout.totalPoints).toBe(7);
  });

  it('bounds overrides honoured', () => {
    const layout = computeLineParabolicSarLayout({
      data: PSAR_DATA,
      ...base,
      yMin: 0,
      yMax: 100,
    });
    expect(layout.yMin).toBe(0);
    expect(layout.yMax).toBe(100);
  });
});

describe('describeLineParabolicSarChart', () => {
  it('no data -> No data', () => {
    expect(describeLineParabolicSarChart([])).toBe('No data');
    expect(describeLineParabolicSarChart(null)).toBe('No data');
  });
  it('summary mentions Parabolic SAR + stop-and-reverse + trend', () => {
    const s = describeLineParabolicSarChart(PSAR_DATA);
    expect(s).toContain('Parabolic SAR');
    expect(s).toContain('stop-and-reverse');
    expect(s).toContain('trend');
  });
});

describe('<ChartLineParabolicSar> render', () => {
  it('renders empty state with no data', () => {
    render(<ChartLineParabolicSar data={[]} />);
    expect(
      document
        .querySelector('[data-section="chart-line-parabolic-sar"]')!
        .getAttribute('data-empty'),
    ).toBe('true');
  });

  it('renders the price line path', () => {
    render(<ChartLineParabolicSar data={PSAR_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-parabolic-sar-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders one SAR dot per period and hides them via prop', () => {
    const { rerender } = render(<ChartLineParabolicSar data={PSAR_DATA} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-parabolic-sar-dot"]',
      ).length,
    ).toBe(7);
    rerender(<ChartLineParabolicSar data={PSAR_DATA} showSar={false} />);
    expect(
      document.querySelector('[data-section="chart-line-parabolic-sar-dot"]'),
    ).toBeNull();
  });

  it('colours SAR dots by trend', () => {
    render(<ChartLineParabolicSar data={PSAR_DATA} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-parabolic-sar-dot"]',
    );
    expect(dots[0]!.getAttribute('fill')).toBe(
      DEFAULT_CHART_LINE_PARABOLIC_SAR_UP_COLOR,
    );
    expect(dots[5]!.getAttribute('fill')).toBe(
      DEFAULT_CHART_LINE_PARABOLIC_SAR_DOWN_COLOR,
    );
  });

  it('renders a reversal marker per flip and hides them via prop', () => {
    const { rerender } = render(<ChartLineParabolicSar data={PSAR_DATA} />);
    const reversals = document.querySelectorAll(
      '[data-section="chart-line-parabolic-sar-reversal"]',
    );
    expect(reversals.length).toBe(1);
    expect(reversals[0]!.getAttribute('data-point-index')).toBe('5');
    rerender(
      <ChartLineParabolicSar data={PSAR_DATA} showReversals={false} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-parabolic-sar-reversal"]',
      ),
    ).toBeNull();
  });

  it('price dots are off by default and shown via prop', () => {
    const { rerender } = render(<ChartLineParabolicSar data={PSAR_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-parabolic-sar-price-dot"]',
      ),
    ).toBeNull();
    rerender(<ChartLineParabolicSar data={PSAR_DATA} showDots />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-parabolic-sar-price-dot"]',
      ).length,
    ).toBe(7);
  });

  it('config badge shows the step, max and flip count', () => {
    render(<ChartLineParabolicSar data={PSAR_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-parabolic-sar-badge-step"]',
      )?.textContent,
    ).toBe('af=0.02');
    expect(
      document.querySelector(
        '[data-section="chart-line-parabolic-sar-badge-max"]',
      )?.textContent,
    ).toBe('max=0.2');
    expect(
      document.querySelector(
        '[data-section="chart-line-parabolic-sar-badge-flips"]',
      )?.textContent,
    ).toBe('flips=1');
  });

  it('hides the config badge via showConfigBadge=false', () => {
    render(
      <ChartLineParabolicSar data={PSAR_DATA} showConfigBadge={false} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-parabolic-sar-badge"]',
      ),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineParabolicSar data={PSAR_DATA} />);
    expect(
      document
        .querySelector('[data-section="chart-line-parabolic-sar"]')!
        .getAttribute('role'),
    ).toBe('region');
    expect(
      document
        .querySelector('[data-section="chart-line-parabolic-sar-svg"]')!
        .getAttribute('role'),
    ).toBe('img');
    expect(
      document.querySelector(
        '[data-section="chart-line-parabolic-sar-aria-desc"]',
      )!.textContent,
    ).toContain('Parabolic SAR');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineParabolicSar data={PSAR_DATA} />);
    const root = document.querySelector(
      '[data-section="chart-line-parabolic-sar"]',
    );
    expect(root!.getAttribute('data-reversal-count')).toBe('1');
    expect(root!.getAttribute('data-up-count')).toBe('5');
    expect(root!.getAttribute('data-down-count')).toBe('2');
    expect(root!.getAttribute('data-total-points')).toBe('7');
  });

  it('SAR dot exposes trend / reversed / sar / value attributes', () => {
    render(<ChartLineParabolicSar data={PSAR_DATA} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-parabolic-sar-dot"]',
    );
    expect(dots[5]!.getAttribute('data-trend')).toBe('down');
    expect(dots[5]!.getAttribute('data-reversed')).toBe('true');
    expect(Number(dots[5]!.getAttribute('data-sar'))).toBe(16);
    expect(Number(dots[5]!.getAttribute('data-value'))).toBe(9);
  });

  it('tooltip on a SAR dot shows trend + SAR + price', () => {
    render(<ChartLineParabolicSar data={PSAR_DATA} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-parabolic-sar-dot"]',
    );
    fireEvent.mouseEnter(dots[5]!);
    expect(
      document.querySelector(
        '[data-section="chart-line-parabolic-sar-tooltip-trend"]',
      )?.textContent,
    ).toBe('down trend');
    expect(
      document.querySelector(
        '[data-section="chart-line-parabolic-sar-tooltip-sar"]',
      )?.textContent,
    ).toBe('SAR: 16');
    expect(
      document.querySelector(
        '[data-section="chart-line-parabolic-sar-tooltip-reversal"]',
      ),
    ).not.toBeNull();
    fireEvent.mouseLeave(dots[5]!);
    expect(
      document.querySelector(
        '[data-section="chart-line-parabolic-sar-tooltip"]',
      ),
    ).toBeNull();
  });

  it('omits the tooltip when showTooltip=false', () => {
    render(<ChartLineParabolicSar data={PSAR_DATA} showTooltip={false} />);
    const dot = document.querySelector(
      '[data-section="chart-line-parabolic-sar-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector(
        '[data-section="chart-line-parabolic-sar-tooltip"]',
      ),
    ).toBeNull();
  });

  it('onSarClick fires with the SAR-dot payload', () => {
    let captured: number | null = null;
    render(
      <ChartLineParabolicSar
        data={PSAR_DATA}
        onSarClick={({ sample }) => {
          captured = sample.index;
        }}
      />,
    );
    const dots = document.querySelectorAll(
      '[data-section="chart-line-parabolic-sar-dot"]',
    );
    fireEvent.click(dots[2]!);
    expect(captured).toBe(2);
  });

  it('footer reports the step stats and hides via prop', () => {
    const { rerender } = render(<ChartLineParabolicSar data={PSAR_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-parabolic-sar-footer-stats"]',
      )?.textContent,
    ).toContain('flips=1');
    rerender(<ChartLineParabolicSar data={PSAR_DATA} showFooter={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-parabolic-sar-footer"]',
      ),
    ).toBeNull();
  });

  it('renders x and y axis ticks', () => {
    render(<ChartLineParabolicSar data={PSAR_DATA} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-parabolic-sar-tick"][data-axis="x"]',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-parabolic-sar-tick"][data-axis="y"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineParabolicSar data={PSAR_DATA} animate={true} />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-parabolic-sar"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(<ChartLineParabolicSar data={PSAR_DATA} animate={false} />);
    expect(
      document
        .querySelector('[data-section="chart-line-parabolic-sar"]')!
        .getAttribute('data-animate'),
    ).toBe('false');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineParabolicSar ref={ref} data={PSAR_DATA} />);
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-parabolic-sar',
    );
  });

  it('has displayName', () => {
    expect(ChartLineParabolicSar.displayName).toBe('ChartLineParabolicSar');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(
      <ChartLineParabolicSar data={PSAR_DATA} ariaLabel="Trailing stop" />,
    );
    expect(
      document
        .querySelector('[data-section="chart-line-parabolic-sar"]')!
        .getAttribute('aria-label'),
    ).toBe('Trailing stop');
    expect(
      document
        .querySelector('[data-section="chart-line-parabolic-sar-svg"]')!
        .getAttribute('aria-label'),
    ).toBe('Trailing stop');
  });

  it('xLabel and yLabel render axis text', () => {
    render(
      <ChartLineParabolicSar data={PSAR_DATA} xLabel="bar" yLabel="price" />,
    );
    expect(screen.getByText('bar').getAttribute('data-section')).toBe(
      'chart-line-parabolic-sar-x-label',
    );
    expect(screen.getByText('price').getAttribute('data-section')).toBe(
      'chart-line-parabolic-sar-y-label',
    );
  });
});
