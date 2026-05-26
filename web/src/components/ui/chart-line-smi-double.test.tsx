import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineSmiDouble,
  applyLineSmiDoubleEma,
  applyLineSmiDoubleRollingMax,
  applyLineSmiDoubleRollingMin,
  classifyLineSmiDoubleZone,
  computeLineSmiDouble,
  computeLineSmiDoubleLayout,
  describeLineSmiDoubleChart,
  detectLineSmiDoubleCrosses,
  getLineSmiDoubleFinitePoints,
  normalizeLineSmiDoubleLength,
  normalizeLineSmiDoubleSmoothLength,
  normalizeLineSmiDoubleThreshold,
  runLineSmiDouble,
  DEFAULT_CHART_LINE_SMI_DOUBLE_LENGTH,
} from './chart-line-smi-double';
import type { ChartLineSmiDoublePoint } from './chart-line-smi-double';

const constBar = (count: number, K: number): ChartLineSmiDoublePoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

const linearUp = (count: number): ChartLineSmiDoublePoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i + 1,
    close: i + 1,
  }));

const linearDown = (count: number): ChartLineSmiDoublePoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: count - i,
    low: count - i,
    close: count - i,
  }));

describe('getLineSmiDoubleFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineSmiDoubleFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite high', () => {
    const r = getLineSmiDoubleFinitePoints([
      { x: 0, high: Number.NaN, low: 5, close: 7 },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineSmiDoubleFinitePoints([
      null as unknown as ChartLineSmiDoublePoint,
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineSmiDoubleLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineSmiDoubleLength(undefined, 10)).toBe(10);
  });

  it('rejects below 2', () => {
    expect(normalizeLineSmiDoubleLength(1, 10)).toBe(10);
  });

  it('floors fractional', () => {
    expect(normalizeLineSmiDoubleLength(7.6, 10)).toBe(7);
  });
});

describe('normalizeLineSmiDoubleSmoothLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineSmiDoubleSmoothLength(undefined, 3)).toBe(3);
  });

  it('accepts 1', () => {
    expect(normalizeLineSmiDoubleSmoothLength(1, 3)).toBe(1);
  });

  it('rejects zero', () => {
    expect(normalizeLineSmiDoubleSmoothLength(0, 3)).toBe(3);
  });
});

describe('normalizeLineSmiDoubleThreshold', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineSmiDoubleThreshold(undefined, 40)).toBe(40);
  });

  it('accepts -100 and 100', () => {
    expect(normalizeLineSmiDoubleThreshold(-100, 40)).toBe(-100);
    expect(normalizeLineSmiDoubleThreshold(100, 40)).toBe(100);
  });

  it('rejects out of range', () => {
    expect(normalizeLineSmiDoubleThreshold(-101, 40)).toBe(40);
    expect(normalizeLineSmiDoubleThreshold(101, 40)).toBe(40);
  });
});

describe('applyLineSmiDoubleRollingMax', () => {
  it('CONST K max is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineSmiDoubleRollingMax(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineSmiDoubleRollingMax([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(3);
  });
});

describe('applyLineSmiDoubleRollingMin', () => {
  it('CONST K min is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineSmiDoubleRollingMin(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });
});

describe('applyLineSmiDoubleEma', () => {
  it('CONST K EMA is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineSmiDoubleEma(Array(10).fill(K), 3);
      for (let i = 2; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineSmiDoubleEma([1, 1, 1, 1, 1], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(1);
  });

  it('null resets seed', () => {
    const out = applyLineSmiDoubleEma([1, 1, null, 1, 1, 1], 3);
    expect(out[2]).toBe(null);
    expect(out[5]).toBe(1);
  });

  it('null padded prefix delays seed', () => {
    const out = applyLineSmiDoubleEma([null, null, 1, 1, 1, 1], 3);
    expect(out[3]).toBe(null);
    expect(out[4]).toBe(1);
  });
});

describe('computeLineSmiDouble', () => {
  it('returns empty for null', () => {
    const ch = computeLineSmiDouble(null);
    expect(ch.smi).toEqual([]);
  });

  it('CONST close yields smi = null (range = 0)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const series = constBar(20, K);
      const ch = computeLineSmiDouble(series, {
        length: 4,
        smoothLength1: 3,
        smoothLength2: 3,
      });
      for (let i = 7; i < 20; i += 1) {
        expect(ch.smi[i]).toBe(null);
      }
    }
  });

  it('LINEAR UP yields smi = 100 bit-exact, L=4', () => {
    const series = linearUp(20);
    const ch = computeLineSmiDouble(series, {
      length: 4,
      smoothLength1: 3,
      smoothLength2: 3,
    });
    for (let i = 7; i < 20; i += 1) {
      expect(ch.smi[i]).toBe(100);
    }
  });

  it('LINEAR DOWN yields smi = -100 bit-exact, L=4', () => {
    const series = linearDown(20);
    const ch = computeLineSmiDouble(series, {
      length: 4,
      smoothLength1: 3,
      smoothLength2: 3,
    });
    for (let i = 7; i < 20; i += 1) {
      expect(ch.smi[i]).toBe(-100);
    }
  });

  it('LINEAR UP yields smi = 100 bit-exact at default params', () => {
    const series = linearUp(30);
    const ch = computeLineSmiDouble(series, { length: 10 });
    for (let i = 13; i < 30; i += 1) {
      expect(ch.smi[i]).toBe(100);
    }
  });

  it('warmup region is null', () => {
    const series = linearUp(20);
    const ch = computeLineSmiDouble(series, {
      length: 4,
      smoothLength1: 3,
      smoothLength2: 3,
    });
    expect(ch.smi[0]).toBe(null);
    expect(ch.smi[6]).toBe(null);
    expect(ch.smi[7]).toBe(100);
  });

  it('output length matches input length', () => {
    const series = linearUp(20);
    const ch = computeLineSmiDouble(series, { length: 4 });
    expect(ch.smi.length).toBe(20);
  });

  it('does not mutate input', () => {
    const series = linearUp(20);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineSmiDouble(series, { length: 4 });
    expect(series).toEqual(snap);
  });

  it('centered = (L-1)/2 bit-exact for LINEAR UP', () => {
    const series = linearUp(20);
    const ch = computeLineSmiDouble(series, { length: 4 });
    for (let i = 3; i < 20; i += 1) {
      expect(ch.centered[i]).toBe(1.5);
    }
  });

  it('range = L-1 bit-exact for LINEAR UP', () => {
    const series = linearUp(20);
    const ch = computeLineSmiDouble(series, { length: 4 });
    for (let i = 3; i < 20; i += 1) {
      expect(ch.range[i]).toBe(3);
    }
  });
});

describe('classifyLineSmiDoubleZone', () => {
  it('classifies overbought', () => {
    expect(classifyLineSmiDoubleZone(50, 40, -40)).toBe('overbought');
  });

  it('classifies oversold', () => {
    expect(classifyLineSmiDoubleZone(-50, 40, -40)).toBe('oversold');
  });

  it('classifies neutral', () => {
    expect(classifyLineSmiDoubleZone(10, 40, -40)).toBe('neutral');
  });

  it('returns none for null', () => {
    expect(classifyLineSmiDoubleZone(null, 40, -40)).toBe('none');
  });
});

describe('detectLineSmiDoubleCrosses', () => {
  it('returns nulls for warmup', () => {
    expect(detectLineSmiDoubleCrosses([null, null], 40, -40)).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when entering overbought', () => {
    const ev = detectLineSmiDoubleCrosses([null, 10, 50], 40, -40);
    expect(ev[2]).toBe('up');
  });

  it('flags down when entering oversold', () => {
    const ev = detectLineSmiDoubleCrosses([null, -10, -50], 40, -40);
    expect(ev[2]).toBe('down');
  });

  it('first defined sample is not a cross', () => {
    expect(detectLineSmiDoubleCrosses([null, 50], 40, -40)[1]).toBe(null);
  });
});

describe('runLineSmiDouble', () => {
  it('marks ok=false for short data', () => {
    const run = runLineSmiDouble(constBar(5, 10), {
      length: 4,
      smoothLength1: 3,
      smoothLength2: 3,
    });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineSmiDouble(constBar(10, 10), {
      length: 4,
      smoothLength1: 3,
      smoothLength2: 3,
    });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineSmiDouble(constBar(30, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_SMI_DOUBLE_LENGTH);
    expect(run.smoothLength1).toBe(3);
    expect(run.smoothLength2).toBe(3);
    expect(run.overbought).toBe(40);
    expect(run.oversold).toBe(-40);
  });

  it('respects explicit options', () => {
    const run = runLineSmiDouble(constBar(30, 10), {
      length: 7,
      smoothLength1: 5,
      smoothLength2: 2,
      overbought: 50,
      oversold: -30,
    });
    expect(run.length).toBe(7);
    expect(run.smoothLength1).toBe(5);
    expect(run.smoothLength2).toBe(2);
    expect(run.overbought).toBe(50);
    expect(run.oversold).toBe(-30);
  });

  it('sorts by x', () => {
    const data: ChartLineSmiDoublePoint[] = [
      { x: 2, high: 10, low: 10, close: 10 },
      { x: 0, high: 10, low: 10, close: 10 },
      { x: 1, high: 10, low: 10, close: 10 },
    ];
    const run = runLineSmiDouble(data, {
      length: 2,
      smoothLength1: 1,
      smoothLength2: 1,
    });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('LINEAR UP classifies as overbought', () => {
    const run = runLineSmiDouble(linearUp(20), {
      length: 4,
      smoothLength1: 3,
      smoothLength2: 3,
    });
    expect(run.overboughtCount).toBe(13);
  });

  it('LINEAR DOWN classifies as oversold', () => {
    const run = runLineSmiDouble(linearDown(20), {
      length: 4,
      smoothLength1: 3,
      smoothLength2: 3,
    });
    expect(run.oversoldCount).toBe(13);
  });

  it('CONST classifies as none', () => {
    const run = runLineSmiDouble(constBar(20, 10), {
      length: 4,
      smoothLength1: 3,
      smoothLength2: 3,
    });
    expect(run.noneCount).toBe(20);
  });
});

describe('computeLineSmiDoubleLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineSmiDoubleLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineSmiDoubleLayout({
      data: linearUp(30),
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above smi', () => {
    const layout = computeLineSmiDoubleLayout({
      data: linearUp(30),
    });
    expect(layout.priceBottom).toBeLessThan(layout.smiTop);
  });

  it('smi axis is fixed [-100, 100]', () => {
    const layout = computeLineSmiDoubleLayout({
      data: linearUp(30),
    });
    expect(layout.smiMin).toBe(-100);
    expect(layout.smiMax).toBe(100);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineSmiDoubleLayout({
      data: linearUp(30),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('threshold lines in smi panel bounds', () => {
    const layout = computeLineSmiDoubleLayout({
      data: linearUp(30),
    });
    expect(layout.overboughtY).toBeGreaterThanOrEqual(layout.smiTop);
    expect(layout.overboughtY).toBeLessThanOrEqual(layout.smiBottom);
    expect(layout.oversoldY).toBeGreaterThanOrEqual(layout.smiTop);
    expect(layout.oversoldY).toBeLessThanOrEqual(layout.smiBottom);
  });
});

describe('describeLineSmiDoubleChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineSmiDoubleChart([])).toBe('No data');
  });

  it('mentions Double-smoothed SMI', () => {
    const desc = describeLineSmiDoubleChart(linearUp(30));
    expect(desc).toContain('Double-smoothed SMI');
  });

  it('reports parameters', () => {
    const desc = describeLineSmiDoubleChart(linearUp(30), {
      length: 7,
      smoothLength1: 5,
      smoothLength2: 2,
      overbought: 50,
      oversold: -30,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('smoothLength1 5');
    expect(desc).toContain('smoothLength2 2');
    expect(desc).toContain('overbought 50');
    expect(desc).toContain('oversold -30');
  });
});

describe('<ChartLineSmiDouble />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineSmiDouble data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-smi-double-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineSmiDouble data={linearUp(30)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('SMI');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineSmiDouble data={linearUp(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineSmiDouble
        data={linearUp(30)}
        length={7}
        smoothLength1={5}
        smoothLength2={2}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-smi-double"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-smooth-length-1')).toBe('5');
    expect(root?.getAttribute('data-smooth-length-2')).toBe('2');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineSmiDouble data={linearUp(30)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-smi-double"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineSmiDouble data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-smi-double-aria-desc"]',
      )?.textContent,
    ).toContain('Double-smoothed SMI');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineSmiDouble data={linearUp(30)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="smi"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineSmiDouble
        data={linearUp(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="smi"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'smi',
      hidden: true,
    });
  });

  it('hides smi when controlled hidden', () => {
    const { container } = render(
      <ChartLineSmiDouble
        data={linearUp(30)}
        hiddenSeries={['smi']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-smi-double-line"]',
      ),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineSmiDouble data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-smi-double-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders thresholds by default', () => {
    const { container } = render(
      <ChartLineSmiDouble data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-smi-double-overbought-line"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-smi-double-oversold-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides thresholds when showThresholds is false', () => {
    const { container } = render(
      <ChartLineSmiDouble
        data={linearUp(30)}
        showThresholds={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-smi-double-overbought-line"]',
      ),
    ).toBe(null);
  });

  it('renders midline by default', () => {
    const { container } = render(
      <ChartLineSmiDouble data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-smi-double-midline"]',
      ),
    ).toBeTruthy();
  });

  it('hides midline when showMidline is false', () => {
    const { container } = render(
      <ChartLineSmiDouble data={linearUp(30)} showMidline={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-smi-double-midline"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineSmiDouble data={linearUp(30)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-smi-double-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineSmiDouble data={linearUp(30)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-smi-double-grid"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineSmiDouble data={linearUp(30)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-smi-double-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineSmiDouble
        data={linearUp(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-smi-double"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineSmiDouble data={linearUp(30)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-smi-double-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders the smi line by default', () => {
    const { container } = render(
      <ChartLineSmiDouble data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-smi-double-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineSmiDouble data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-smi-double-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineSmiDouble
        data={linearUp(30)}
        defaultHiddenSeries={['smi']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-smi-double-line"]',
      ),
    ).toBe(null);
  });
});

describe('SMI Double integration', () => {
  it('CONST yields smi = null across (K, length, S1, S2)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [4, 7]) {
        for (const S1 of [2, 3]) {
          for (const S2 of [2, 3]) {
            const total = L + S1 + S2 + 5;
            const series = constBar(total, K);
            const ch = computeLineSmiDouble(series, {
              length: L,
              smoothLength1: S1,
              smoothLength2: S2,
            });
            const start = L + S1 + S2 - 3;
            for (let i = start; i < total; i += 1) {
              expect(ch.smi[i]).toBe(null);
            }
          }
        }
      }
    }
  });

  it('LINEAR UP yields smi = 100 across length sweep', () => {
    for (const L of [4, 5, 7]) {
      for (const S1 of [2, 3]) {
        for (const S2 of [2, 3]) {
          const total = L + S1 + S2 + 5;
          const series = linearUp(total);
          const ch = computeLineSmiDouble(series, {
            length: L,
            smoothLength1: S1,
            smoothLength2: S2,
          });
          const start = L + S1 + S2 - 3;
          for (let i = start; i < total; i += 1) {
            expect(ch.smi[i]).toBe(100);
          }
        }
      }
    }
  });

  it('LINEAR DOWN yields smi = -100 across length sweep', () => {
    for (const L of [4, 5, 7]) {
      for (const S1 of [2, 3]) {
        for (const S2 of [2, 3]) {
          const total = L + S1 + S2 + 5;
          const series = linearDown(total);
          const ch = computeLineSmiDouble(series, {
            length: L,
            smoothLength1: S1,
            smoothLength2: S2,
          });
          const start = L + S1 + S2 - 3;
          for (let i = start; i < total; i += 1) {
            expect(ch.smi[i]).toBe(-100);
          }
        }
      }
    }
  });
});
