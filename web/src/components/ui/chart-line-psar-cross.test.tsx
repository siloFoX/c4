import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLinePsarCross,
  classifyLinePsarCrossRelation,
  computeLinePsarCross,
  computeLinePsarCrossLayout,
  describeLinePsarCrossChart,
  detectLinePsarCrossFlips,
  getLinePsarCrossFinitePoints,
  normalizeLinePsarCrossAcceleration,
  runLinePsarCross,
  DEFAULT_CHART_LINE_PSAR_CROSS_AF_INITIAL,
  DEFAULT_CHART_LINE_PSAR_CROSS_AF_STEP,
  DEFAULT_CHART_LINE_PSAR_CROSS_AF_MAX,
} from './chart-line-psar-cross';
import type { ChartLinePsarCrossPoint } from './chart-line-psar-cross';

const constBar = (count: number, K: number): ChartLinePsarCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

const linearUp = (count: number): ChartLinePsarCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i + 1,
    close: i + 1,
  }));

const linearDown = (count: number): ChartLinePsarCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: count - i,
    low: count - i,
    close: count - i,
  }));

describe('getLinePsarCrossFinitePoints', () => {
  it('empty for null', () => {
    expect(getLinePsarCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN', () => {
    const r = getLinePsarCrossFinitePoints([
      { x: 0, high: Number.NaN, low: 0, close: 0 },
      { x: 1, high: 1, low: 0, close: 1 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLinePsarCrossFinitePoints([
      null as unknown as ChartLinePsarCrossPoint,
      { x: 1, high: 1, low: 0, close: 1 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLinePsarCrossAcceleration', () => {
  it('uses default', () => {
    expect(normalizeLinePsarCrossAcceleration(undefined, 0.02)).toBe(0.02);
  });

  it('rejects out-of-range', () => {
    expect(normalizeLinePsarCrossAcceleration(-1, 0.02)).toBe(0.02);
    expect(normalizeLinePsarCrossAcceleration(2, 0.02)).toBe(0.02);
  });

  it('accepts valid', () => {
    expect(normalizeLinePsarCrossAcceleration(0.05, 0.02)).toBe(0.05);
  });
});

describe('computeLinePsarCross', () => {
  it('returns empty for null', () => {
    const ch = computeLinePsarCross(null);
    expect(ch.sar).toEqual([]);
  });

  it('CONST yields SAR = K and trend = up for all bars', () => {
    const ch = computeLinePsarCross(constBar(10, 50));
    for (const v of ch.sar) expect(v).toBe(50);
    for (const t of ch.trends) expect(t).toBe('up');
  });

  it('LINEAR UP starts uptrend with SAR = low[0] = 1', () => {
    const ch = computeLinePsarCross(linearUp(10));
    expect(ch.sar[0]).toBe(1);
    expect(ch.trends[0]).toBe('up');
  });

  it('LINEAR UP keeps trend in uptrend (SAR stays below close, no flip)', () => {
    const ch = computeLinePsarCross(linearUp(10));
    expect(ch.sar[0]).toBe(1);
    expect(ch.sar[1]).toBe(1);
    expect(ch.sar[2]).toBe(1);
    for (let i = 0; i < 10; i += 1) {
      expect(ch.trends[i]).toBe('up');
      // SAR stays below the rising close
      expect(ch.sar[i] as number).toBeLessThanOrEqual(i + 1);
    }
  });

  it('LINEAR DOWN flips to downtrend at bar 1', () => {
    const ch = computeLinePsarCross(linearDown(10));
    expect(ch.trends[0]).toBe('up');
    expect(ch.trends[1]).toBe('down');
    // After flip, SAR becomes prior EP (= high[0] = 10)
    expect(ch.sar[1]).toBe(10);
  });

  it('LINEAR DOWN trend stays down after flip', () => {
    const ch = computeLinePsarCross(linearDown(10));
    for (let i = 1; i < 10; i += 1) {
      expect(ch.trends[i]).toBe('down');
    }
  });

  it('output length matches input', () => {
    const ch = computeLinePsarCross(linearUp(15));
    expect(ch.sar.length).toBe(15);
    expect(ch.trends.length).toBe(15);
  });

  it('does not mutate input', () => {
    const data = linearUp(15);
    const snap = JSON.parse(JSON.stringify(data));
    computeLinePsarCross(data);
    expect(data).toEqual(snap);
  });
});

describe('classifyLinePsarCrossRelation', () => {
  it('bullish when close > sar', () => {
    expect(classifyLinePsarCrossRelation(10, 5)).toBe('bullish');
  });

  it('bearish when close < sar', () => {
    expect(classifyLinePsarCrossRelation(5, 10)).toBe('bearish');
  });

  it('equal when close == sar', () => {
    expect(classifyLinePsarCrossRelation(5, 5)).toBe('equal');
  });

  it('none on null', () => {
    expect(classifyLinePsarCrossRelation(null, 5)).toBe('none');
  });
});

describe('detectLinePsarCrossFlips', () => {
  it('flip-up on up to down transition... no wait, up new is flip-up', () => {
    expect(detectLinePsarCrossFlips(['down', 'up'])[1]).toBe('flip-up');
  });

  it('flip-down on up to down transition', () => {
    expect(detectLinePsarCrossFlips(['up', 'down'])[1]).toBe('flip-down');
  });

  it('null on same trend', () => {
    const r = detectLinePsarCrossFlips(['up', 'up', 'up']);
    expect(r[1]).toBe(null);
    expect(r[2]).toBe(null);
  });

  it('first bar always null', () => {
    expect(detectLinePsarCrossFlips(['up', 'up'])[0]).toBe(null);
  });

  it('none state suppresses flip', () => {
    expect(detectLinePsarCrossFlips(['none', 'up'])[1]).toBe(null);
  });
});

describe('runLinePsarCross', () => {
  it('ok=false on too few bars', () => {
    const run = runLinePsarCross([
      { x: 0, high: 1, low: 0, close: 1 },
    ]);
    expect(run.ok).toBe(false);
  });

  it('ok=true on >= 2 bars', () => {
    const run = runLinePsarCross(linearUp(2));
    expect(run.ok).toBe(true);
  });

  it('uses defaults', () => {
    const run = runLinePsarCross(linearUp(10));
    expect(run.afInitial).toBe(DEFAULT_CHART_LINE_PSAR_CROSS_AF_INITIAL);
    expect(run.afStep).toBe(DEFAULT_CHART_LINE_PSAR_CROSS_AF_STEP);
    expect(run.afMax).toBe(DEFAULT_CHART_LINE_PSAR_CROSS_AF_MAX);
  });

  it('respects explicit options', () => {
    const run = runLinePsarCross(linearUp(10), {
      afInitial: 0.04,
      afStep: 0.04,
      afMax: 0.4,
    });
    expect(run.afInitial).toBe(0.04);
    expect(run.afStep).toBe(0.04);
    expect(run.afMax).toBe(0.4);
  });

  it('sorts by x', () => {
    const data: ChartLinePsarCrossPoint[] = [
      { x: 2, high: 3, low: 3, close: 3 },
      { x: 0, high: 1, low: 1, close: 1 },
      { x: 1, high: 2, low: 2, close: 2 },
    ];
    const run = runLinePsarCross(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST yields zero flips', () => {
    const run = runLinePsarCross(constBar(10, 50));
    expect(run.flipUpCount).toBe(0);
    expect(run.flipDownCount).toBe(0);
  });

  it('LINEAR UP yields zero flips', () => {
    const run = runLinePsarCross(linearUp(15));
    expect(run.flipUpCount).toBe(0);
    expect(run.flipDownCount).toBe(0);
  });

  it('LINEAR DOWN yields exactly 1 flip-down at bar 1', () => {
    const run = runLinePsarCross(linearDown(15));
    expect(run.flipDownCount).toBe(1);
    expect(run.flipUpCount).toBe(0);
    expect(run.samples[1]?.crossed).toBe('flip-down');
  });

  it('LINEAR UP relation is equal at first bar (close == sar)', () => {
    const run = runLinePsarCross(linearUp(15));
    expect(run.samples[0]?.relation).toBe('equal');
  });

  it('LINEAR UP relation becomes bullish from bar 1 onward', () => {
    const run = runLinePsarCross(linearUp(15));
    expect(run.samples[5]?.relation).toBe('bullish');
  });

  it('LINEAR DOWN relation becomes bearish from bar 1 onward', () => {
    const run = runLinePsarCross(linearDown(15));
    expect(run.samples[5]?.relation).toBe('bearish');
  });
});

describe('computeLinePsarCrossLayout', () => {
  it('ok=false on empty', () => {
    const layout = computeLinePsarCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('ok=true on >= 2 bars', () => {
    const layout = computeLinePsarCrossLayout({ data: linearUp(5) });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above deviation', () => {
    const layout = computeLinePsarCrossLayout({ data: linearUp(5) });
    expect(layout.priceBottom).toBeLessThan(layout.devTop);
  });

  it('produces price path and dots', () => {
    const layout = computeLinePsarCrossLayout({ data: linearUp(5) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(5);
  });

  it('produces sar dots', () => {
    const layout = computeLinePsarCrossLayout({ data: linearUp(5) });
    expect(layout.sarDots.length).toBe(5);
  });

  it('produces deviation path', () => {
    const layout = computeLinePsarCrossLayout({ data: linearUp(5) });
    expect(layout.deviationPath.length).toBeGreaterThan(0);
  });

  it('LINEAR DOWN produces 1 marker', () => {
    const layout = computeLinePsarCrossLayout({ data: linearDown(10) });
    expect(layout.markers.length).toBe(1);
    expect(layout.markers[0]?.kind).toBe('flip-down');
  });

  it('LINEAR UP produces 0 markers', () => {
    const layout = computeLinePsarCrossLayout({ data: linearUp(10) });
    expect(layout.markers.length).toBe(0);
  });
});

describe('describeLinePsarCrossChart', () => {
  it('No data on empty', () => {
    expect(describeLinePsarCrossChart([])).toBe('No data');
  });

  it('mentions PSAR Cross', () => {
    expect(describeLinePsarCrossChart(linearUp(5))).toContain('PSAR Cross');
  });

  it('reports parameters', () => {
    const desc = describeLinePsarCrossChart(linearUp(5), {
      afInitial: 0.04,
      afStep: 0.04,
      afMax: 0.4,
    });
    expect(desc).toContain('afInitial 0.04');
    expect(desc).toContain('afStep 0.04');
    expect(desc).toContain('afMax 0.4');
  });
});

describe('<ChartLinePsarCross />', () => {
  it('empty placeholder', () => {
    const { container } = render(<ChartLinePsarCross data={[]} />);
    expect(
      container.querySelector('[data-section="chart-line-psar-cross-empty"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('region role with aria-label', () => {
    const { container } = render(<ChartLinePsarCross data={linearUp(5)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('PSAR Cross');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLinePsarCross data={linearUp(5)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLinePsarCross
        data={linearUp(5)}
        afInitial={0.04}
        afStep={0.04}
        afMax={0.4}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-psar-cross"]',
    );
    expect(root?.getAttribute('data-af-initial')).toBe('0.04');
    expect(root?.getAttribute('data-af-step')).toBe('0.04');
    expect(root?.getAttribute('data-af-max')).toBe('0.4');
  });

  it('exposes flip counts', () => {
    const { container } = render(<ChartLinePsarCross data={linearDown(10)} />);
    const root = container.querySelector(
      '[data-section="chart-line-psar-cross"]',
    );
    expect(root?.getAttribute('data-flip-down-count')).toBe('1');
    expect(root?.getAttribute('data-flip-up-count')).toBe('0');
  });

  it('renders aria description', () => {
    const { container } = render(<ChartLinePsarCross data={linearUp(5)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-cross-aria-desc"]',
      )?.textContent,
    ).toContain('PSAR Cross');
  });

  it('renders all three legend items', () => {
    const { container } = render(<ChartLinePsarCross data={linearUp(5)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="sar"]')).toBeTruthy();
    expect(
      container.querySelector('[data-series-id="deviation"]'),
    ).toBeTruthy();
  });

  it('legend toggle', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLinePsarCross
        data={linearUp(5)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="sar"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'sar', hidden: true });
  });

  it('hides sar when controlled', () => {
    const { container } = render(
      <ChartLinePsarCross
        data={linearUp(5)}
        hiddenSeries={['sar']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-cross-sar-dots"]',
      ),
    ).toBe(null);
  });

  it('renders badge', () => {
    const { container } = render(<ChartLinePsarCross data={linearUp(5)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-cross-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(<ChartLinePsarCross data={linearUp(5)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-cross-zeroline"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLinePsarCross data={linearUp(5)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-cross-zeroline"]',
      ),
    ).toBe(null);
  });

  it('hides axis on showAxis=false', () => {
    const { container } = render(
      <ChartLinePsarCross data={linearUp(5)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-psar-cross-axes"]'),
    ).toBe(null);
  });

  it('hides grid on showGrid=false', () => {
    const { container } = render(
      <ChartLinePsarCross data={linearUp(5)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-psar-cross-grid"]'),
    ).toBe(null);
  });

  it('hides legend on showLegend=false', () => {
    const { container } = render(
      <ChartLinePsarCross data={linearUp(5)} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-psar-cross-legend"]'),
    ).toBe(null);
  });

  it('applies className+style', () => {
    const { container } = render(
      <ChartLinePsarCross
        data={linearUp(5)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-psar-cross"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in', () => {
    const { container } = render(
      <ChartLinePsarCross data={linearUp(5)} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-psar-cross-svg"]')
        ?.classList.contains('motion-safe:animate-fade-in'),
    ).toBe(false);
  });

  it('renders sar dots and deviation path', () => {
    const { container } = render(<ChartLinePsarCross data={linearUp(5)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-cross-sar-dots"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-cross-deviation"]',
      ),
    ).toBeTruthy();
  });

  it('renders price path', () => {
    const { container } = render(<ChartLinePsarCross data={linearUp(5)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-cross-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('renders flip-down marker on LINEAR DOWN', () => {
    const { container } = render(<ChartLinePsarCross data={linearDown(10)} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-psar-cross-marker"]',
    );
    expect(markers.length).toBe(1);
    expect(markers[0]?.getAttribute('data-kind')).toBe('flip-down');
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLinePsarCross
        data={linearUp(5)}
        defaultHiddenSeries={['deviation']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-cross-deviation"]',
      ),
    ).toBe(null);
  });
});

describe('PSAR Cross integration', () => {
  it('CONST and LINEAR UP yield zero flips across af variations', () => {
    for (const af of [0.01, 0.02, 0.05]) {
      const constRun = runLinePsarCross(constBar(20, 50), { afInitial: af });
      expect(constRun.flipUpCount).toBe(0);
      expect(constRun.flipDownCount).toBe(0);
      const upRun = runLinePsarCross(linearUp(20), { afInitial: af });
      expect(upRun.flipUpCount).toBe(0);
      expect(upRun.flipDownCount).toBe(0);
    }
  });

  it('LINEAR DOWN always fires exactly 1 flip-down across af variations', () => {
    for (const af of [0.01, 0.02, 0.05]) {
      const run = runLinePsarCross(linearDown(20), { afInitial: af });
      expect(run.flipDownCount).toBe(1);
      expect(run.flipUpCount).toBe(0);
    }
  });
});
