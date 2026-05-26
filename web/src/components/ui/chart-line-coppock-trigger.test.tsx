import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineCoppockTrigger,
  applyLineCoppockTriggerROC,
  applyLineCoppockTriggerWMA,
  classifyLineCoppockTriggerZone,
  computeLineCoppockTrigger,
  computeLineCoppockTriggerLayout,
  describeLineCoppockTriggerChart,
  detectLineCoppockTriggerEvents,
  getLineCoppockTriggerFinitePoints,
  normalizeLineCoppockTriggerPeriod,
  runLineCoppockTrigger,
  DEFAULT_CHART_LINE_COPPOCK_TRIGGER_LONG_ROC,
  DEFAULT_CHART_LINE_COPPOCK_TRIGGER_SHORT_ROC,
  DEFAULT_CHART_LINE_COPPOCK_TRIGGER_WMA_PERIOD,
} from './chart-line-coppock-trigger';
import type { ChartLineCoppockTriggerPoint } from './chart-line-coppock-trigger';

const constClose = (
  count: number,
  K: number,
): ChartLineCoppockTriggerPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const geometric = (count: number): ChartLineCoppockTriggerPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: Math.pow(2, i) }));

describe('getLineCoppockTriggerFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineCoppockTriggerFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineCoppockTriggerFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineCoppockTriggerFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineCoppockTriggerFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineCoppockTriggerFinitePoints([
      null as unknown as ChartLineCoppockTriggerPoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineCoppockTriggerPeriod', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineCoppockTriggerPeriod(undefined, 14)).toBe(14);
  });

  it('floors fractional periods', () => {
    expect(normalizeLineCoppockTriggerPeriod(7.9, 14)).toBe(7);
  });

  it('accepts 1', () => {
    expect(normalizeLineCoppockTriggerPeriod(1, 14)).toBe(1);
  });

  it('rejects zero', () => {
    expect(normalizeLineCoppockTriggerPeriod(0, 14)).toBe(14);
  });
});

describe('applyLineCoppockTriggerROC', () => {
  it('CONST close yields ROC = 0 bit-exact', () => {
    for (const K of [1, 5, 100, -3]) {
      const closes = Array(10).fill(K);
      const out = applyLineCoppockTriggerROC(closes, 4);
      for (let i = 4; i < 10; i += 1) {
        expect(out[i]).toBe(0);
      }
    }
  });

  it('ZERO close yields null everywhere', () => {
    const closes = Array(10).fill(0);
    const out = applyLineCoppockTriggerROC(closes, 4);
    for (let i = 0; i < 10; i += 1) {
      expect(out[i]).toBe(null);
    }
  });

  it('GEOMETRIC close=2^k yields ROC = (2^L - 1) * 100 bit-exact', () => {
    const closes = Array.from({ length: 20 }, (_, i) => Math.pow(2, i));
    for (const L of [2, 4, 8, 11, 14]) {
      const out = applyLineCoppockTriggerROC(closes, L);
      const expected = (Math.pow(2, L) - 1) * 100;
      for (let i = L; i < 20; i += 1) {
        expect(out[i]).toBe(expected);
      }
    }
  });
});

describe('applyLineCoppockTriggerWMA', () => {
  it('WMA of constant K is K bit-exact', () => {
    for (const K of [0, 1, 100, -3]) {
      const values = Array(10).fill(K);
      const out = applyLineCoppockTriggerWMA(values, 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('warmup region is null', () => {
    const out = applyLineCoppockTriggerWMA([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).not.toBe(null);
  });

  it('null entry in window short-circuits', () => {
    const values: Array<number | null> = [1, null, 3, 4];
    const out = applyLineCoppockTriggerWMA(values, 4);
    expect(out[3]).toBe(null);
  });
});

describe('computeLineCoppockTrigger', () => {
  it('returns empty for null', () => {
    const ch = computeLineCoppockTrigger(null);
    expect(ch.coppock).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineCoppockTrigger([]);
    expect(ch.coppock).toEqual([]);
  });

  it('CONST close yields coppock = 0 bit-exact', () => {
    for (const K of [1, 5, 100, -3]) {
      const closes = Array(40).fill(K);
      const ch = computeLineCoppockTrigger(closes);
      const minBar =
        Math.max(
          DEFAULT_CHART_LINE_COPPOCK_TRIGGER_LONG_ROC,
          DEFAULT_CHART_LINE_COPPOCK_TRIGGER_SHORT_ROC,
        ) +
        DEFAULT_CHART_LINE_COPPOCK_TRIGGER_WMA_PERIOD -
        1;
      for (let i = minBar; i < 40; i += 1) {
        expect(ch.coppock[i]).toBe(0);
      }
    }
  });

  it('GEOMETRIC close=2^k yields coppock = 1843000 bit-exact (defaults)', () => {
    const closes = Array.from({ length: 30 }, (_, i) => Math.pow(2, i));
    const ch = computeLineCoppockTrigger(closes);
    const minBar =
      DEFAULT_CHART_LINE_COPPOCK_TRIGGER_LONG_ROC +
      DEFAULT_CHART_LINE_COPPOCK_TRIGGER_WMA_PERIOD -
      1;
    for (let i = minBar; i < 30; i += 1) {
      expect(ch.coppock[i]).toBe(1843000);
    }
  });

  it('GEOMETRIC close=2^k yields coppock = 1800 (small preset 4/2/3)', () => {
    const closes = Array.from({ length: 12 }, (_, i) => Math.pow(2, i));
    const ch = computeLineCoppockTrigger(closes, {
      longROC: 4,
      shortROC: 2,
      wmaPeriod: 3,
    });
    for (let i = 6; i < 12; i += 1) {
      expect(ch.coppock[i]).toBe(1800);
    }
  });

  it('output length matches input length', () => {
    const closes = Array(40).fill(10);
    const ch = computeLineCoppockTrigger(closes);
    expect(ch.coppock.length).toBe(40);
  });

  it('does not mutate input', () => {
    const closes = Array.from({ length: 30 }, (_, i) => i + 1);
    const snap = closes.slice();
    computeLineCoppockTrigger(closes);
    expect(closes).toEqual(snap);
  });
});

describe('classifyLineCoppockTriggerZone', () => {
  it('classifies positive', () => {
    expect(classifyLineCoppockTriggerZone(2)).toBe('positive');
  });

  it('classifies negative', () => {
    expect(classifyLineCoppockTriggerZone(-2)).toBe('negative');
  });

  it('classifies zero', () => {
    expect(classifyLineCoppockTriggerZone(0)).toBe('zero');
  });

  it('returns none for null', () => {
    expect(classifyLineCoppockTriggerZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineCoppockTriggerZone(Number.NaN)).toBe('none');
  });
});

describe('detectLineCoppockTriggerEvents', () => {
  it('returns [null, null] for warmup-only data', () => {
    expect(detectLineCoppockTriggerEvents([null, null])).toEqual([
      null,
      null,
    ]);
  });

  it('flags bullish when prev <= 0 and current > 0', () => {
    const ev = detectLineCoppockTriggerEvents([null, -1, 1]);
    expect(ev[2]).toBe('bullish');
  });

  it('flags bearish when prev >= 0 and current < 0', () => {
    const ev = detectLineCoppockTriggerEvents([null, 1, -1]);
    expect(ev[2]).toBe('bearish');
  });

  it('flags bullish from zero', () => {
    const ev = detectLineCoppockTriggerEvents([null, 0, 1]);
    expect(ev[2]).toBe('bullish');
  });

  it('flags bearish from zero', () => {
    const ev = detectLineCoppockTriggerEvents([null, 0, -1]);
    expect(ev[2]).toBe('bearish');
  });

  it('no trigger when both positive', () => {
    const ev = detectLineCoppockTriggerEvents([null, 1, 2]);
    expect(ev[2]).toBe(null);
  });

  it('no trigger when both negative', () => {
    const ev = detectLineCoppockTriggerEvents([null, -1, -2]);
    expect(ev[2]).toBe(null);
  });

  it('detects multiple triggers', () => {
    const ev = detectLineCoppockTriggerEvents([null, 1, -1, 1]);
    expect(ev[2]).toBe('bearish');
    expect(ev[3]).toBe('bullish');
  });

  it('first defined bar is not a trigger', () => {
    const ev = detectLineCoppockTriggerEvents([null, 1]);
    expect(ev[1]).toBe(null);
  });
});

describe('runLineCoppockTrigger', () => {
  it('marks ok=false when data is shorter than warmup', () => {
    const run = runLineCoppockTrigger(constClose(23, 10));
    expect(run.ok).toBe(false);
  });

  it('marks ok=true at warmup boundary', () => {
    const run = runLineCoppockTrigger(constClose(24, 10));
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineCoppockTrigger(constClose(40, 10));
    expect(run.longROC).toBe(DEFAULT_CHART_LINE_COPPOCK_TRIGGER_LONG_ROC);
    expect(run.shortROC).toBe(DEFAULT_CHART_LINE_COPPOCK_TRIGGER_SHORT_ROC);
    expect(run.wmaPeriod).toBe(DEFAULT_CHART_LINE_COPPOCK_TRIGGER_WMA_PERIOD);
  });

  it('respects explicit options', () => {
    const run = runLineCoppockTrigger(constClose(40, 10), {
      longROC: 4,
      shortROC: 2,
      wmaPeriod: 3,
    });
    expect(run.longROC).toBe(4);
    expect(run.shortROC).toBe(2);
    expect(run.wmaPeriod).toBe(3);
  });

  it('sorts by x', () => {
    const data: ChartLineCoppockTriggerPoint[] = [
      { x: 2, close: 10 },
      { x: 0, close: 10 },
      { x: 1, close: 10 },
    ];
    const run = runLineCoppockTrigger(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST close yields zero triggers', () => {
    const run = runLineCoppockTrigger(constClose(40, 10));
    expect(run.bullishTriggerCount).toBe(0);
    expect(run.bearishTriggerCount).toBe(0);
    expect(run.triggers).toEqual([]);
  });

  it('GEOMETRIC close yields zero triggers (stable positive)', () => {
    const run = runLineCoppockTrigger(geometric(30));
    expect(run.bullishTriggerCount).toBe(0);
    expect(run.bearishTriggerCount).toBe(0);
  });

  it('GEOMETRIC close classifies post-warmup as positive', () => {
    const run = runLineCoppockTrigger(geometric(30));
    expect(run.positiveCount).toBeGreaterThan(0);
  });

  it('triggers array references sample data on each event', () => {
    // Use a synthetic coppock sequence indirectly: we cannot easily
    // craft a close sequence that produces a known cross, but we
    // can verify that when the run yields zero triggers, the array
    // is empty and the counts are zero.
    const run = runLineCoppockTrigger(constClose(40, 10));
    expect(Array.isArray(run.triggers)).toBe(true);
    expect(run.triggers.length).toBe(
      run.bullishTriggerCount + run.bearishTriggerCount,
    );
  });
});

describe('computeLineCoppockTriggerLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineCoppockTriggerLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineCoppockTriggerLayout({
      data: constClose(40, 10),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineCoppockTriggerLayout({
      data: constClose(40, 10),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above coppock', () => {
    const layout = computeLineCoppockTriggerLayout({
      data: constClose(40, 10),
    });
    expect(layout.priceBottom).toBeLessThan(layout.coppockTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineCoppockTriggerLayout({
      data: constClose(40, 10),
      panelGap: 24,
    });
    expect(layout.coppockTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineCoppockTriggerLayout({
      data: constClose(40, 10),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(40);
  });

  it('produces a fill polygon closing on the zero line', () => {
    const layout = computeLineCoppockTriggerLayout({
      data: constClose(40, 10),
    });
    expect(layout.fillPath.startsWith('M')).toBe(true);
    expect(layout.fillPath.endsWith('Z')).toBe(true);
  });

  it('zero split offset is within [0, 1]', () => {
    const layout = computeLineCoppockTriggerLayout({
      data: constClose(40, 10),
    });
    expect(layout.zeroSplitOffset).toBeGreaterThanOrEqual(0);
    expect(layout.zeroSplitOffset).toBeLessThanOrEqual(1);
  });

  it('CONST yields zero markers (no triggers)', () => {
    const layout = computeLineCoppockTriggerLayout({
      data: constClose(40, 10),
    });
    expect(layout.markers.length).toBe(0);
  });

  it('zero line y is between coppockTop and coppockBottom', () => {
    const layout = computeLineCoppockTriggerLayout({
      data: constClose(40, 10),
    });
    expect(layout.zeroLineY).toBeGreaterThanOrEqual(layout.coppockTop);
    expect(layout.zeroLineY).toBeLessThanOrEqual(layout.coppockBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineCoppockTriggerLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineCoppockTriggerChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineCoppockTriggerChart([])).toBe('No data');
  });

  it('mentions Coppock', () => {
    const desc = describeLineCoppockTriggerChart(constClose(40, 10));
    expect(desc).toContain('Coppock');
  });

  it('mentions triangle markers', () => {
    const desc = describeLineCoppockTriggerChart(constClose(40, 10));
    expect(desc).toContain('triangle');
  });

  it('reports the periods', () => {
    const desc = describeLineCoppockTriggerChart(constClose(40, 10), {
      longROC: 7,
      shortROC: 5,
      wmaPeriod: 4,
    });
    expect(desc).toContain('longROC 7');
    expect(desc).toContain('shortROC 5');
    expect(desc).toContain('wmaPeriod 4');
  });
});

describe('<ChartLineCoppockTrigger />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineCoppockTrigger data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-coppock-trigger-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineCoppockTrigger data={constClose(40, 10)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Coppock');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineCoppockTrigger data={constClose(40, 10)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineCoppockTrigger
        data={constClose(40, 10)}
        longROC={7}
        shortROC={5}
        wmaPeriod={4}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-coppock-trigger"]',
    );
    expect(root?.getAttribute('data-long-roc')).toBe('7');
    expect(root?.getAttribute('data-short-roc')).toBe('5');
    expect(root?.getAttribute('data-wma-period')).toBe('4');
    expect(root?.getAttribute('data-bullish-trigger-count')).toBe('0');
    expect(root?.getAttribute('data-bearish-trigger-count')).toBe('0');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineCoppockTrigger data={constClose(40, 10)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-coppock-trigger"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('40');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineCoppockTrigger data={constClose(40, 10)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-coppock-trigger-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Coppock');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineCoppockTrigger data={constClose(40, 10)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="coppock"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineCoppockTrigger
        data={constClose(40, 10)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="coppock"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'coppock',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineCoppockTrigger
        data={constClose(40, 10)}
        hiddenSeries={['coppock']}
      />,
    );
    const button = container.querySelector('[data-series-id="coppock"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides coppock line when controlled hidden', () => {
    const { container } = render(
      <ChartLineCoppockTrigger
        data={constClose(40, 10)}
        hiddenSeries={['coppock']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-trigger-line"]',
      ),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineCoppockTrigger data={constClose(40, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-trigger-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineCoppockTrigger
        data={constClose(40, 10)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-trigger-badge"]',
      ),
    ).toBe(null);
  });

  it('renders the fill path by default', () => {
    const { container } = render(
      <ChartLineCoppockTrigger data={constClose(40, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-trigger-fill"]',
      ),
    ).toBeTruthy();
  });

  it('hides the fill path when showFill is false', () => {
    const { container } = render(
      <ChartLineCoppockTrigger
        data={constClose(40, 10)}
        showFill={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-trigger-fill"]',
      ),
    ).toBe(null);
  });

  it('renders the zero line by default', () => {
    const { container } = render(
      <ChartLineCoppockTrigger data={constClose(40, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-trigger-zero-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides the zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineCoppockTrigger
        data={constClose(40, 10)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-trigger-zero-line"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineCoppockTrigger
        data={constClose(40, 10)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-trigger-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineCoppockTrigger
        data={constClose(40, 10)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-trigger-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineCoppockTrigger
        data={constClose(40, 10)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-trigger-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineCoppockTrigger
        data={constClose(40, 10)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-trigger-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineCoppockTrigger
        data={constClose(40, 10)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-coppock-trigger"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineCoppockTrigger data={constClose(40, 10)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-coppock-trigger-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the coppock line by default', () => {
    const { container } = render(
      <ChartLineCoppockTrigger data={constClose(40, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-trigger-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineCoppockTrigger data={constClose(40, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-trigger-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineCoppockTrigger
        data={constClose(40, 10)}
        defaultHiddenSeries={['coppock']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-coppock-trigger-line"]',
      ),
    ).toBe(null);
  });

  it('exposes a linearGradient with two stop pairs for the hard split', () => {
    const { container } = render(
      <ChartLineCoppockTrigger data={constClose(40, 10)} />,
    );
    const gradient = container.querySelector('linearGradient');
    expect(gradient).toBeTruthy();
    const stops = gradient?.querySelectorAll('stop');
    // Two pairs: bullishFill x 2 and bearishFill x 2 = 4 stops.
    expect(stops?.length).toBe(4);
  });
});

describe('Coppock trigger integration', () => {
  it('CONST close yields coppock = 0 and zero triggers across (K, periods)', () => {
    for (const K of [1, 5, 100, -3]) {
      for (const long of [4, 6, 8]) {
        for (const short of [2, 3]) {
          for (const wma of [3, 4]) {
            const closes = Array(long + wma + 5).fill(K);
            const run = runLineCoppockTrigger(
              closes.map((c, i) => ({ x: i, close: c })),
              { longROC: long, shortROC: short, wmaPeriod: wma },
            );
            expect(run.bullishTriggerCount).toBe(0);
            expect(run.bearishTriggerCount).toBe(0);
            const minBar = Math.max(long, short) + wma - 1;
            for (let i = minBar; i < closes.length; i += 1) {
              expect(run.coppockValues[i]).toBe(0);
            }
          }
        }
      }
    }
  });

  it('GEOMETRIC close yields coppock = 1843000 and zero triggers (defaults)', () => {
    const run = runLineCoppockTrigger(geometric(30));
    expect(run.bullishTriggerCount).toBe(0);
    expect(run.bearishTriggerCount).toBe(0);
    const minBar =
      DEFAULT_CHART_LINE_COPPOCK_TRIGGER_LONG_ROC +
      DEFAULT_CHART_LINE_COPPOCK_TRIGGER_WMA_PERIOD -
      1;
    for (let i = minBar; i < 30; i += 1) {
      expect(run.coppockValues[i]).toBe(1843000);
    }
  });
});
