import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLinePsarCrossPct,
  classifyLinePsarCrossPctRegime,
  computeLinePsarCrossPct,
  computeLinePsarCrossPctLayout,
  describeLinePsarCrossPctChart,
  getLinePsarCrossPctFinitePoints,
  normalizeLinePsarCrossPctAf,
  runLinePsarCrossPct,
  type ChartLinePsarCrossPctPoint,
} from './chart-line-psar-cross-pct';

const constSeries = (n: number, K: number): ChartLinePsarCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLinePsarCrossPctPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLinePsarCrossPctFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLinePsarCrossPctFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLinePsarCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLinePsarCrossPctPoint,
      { x: 1, close: 2 },
    ];
    expect(getLinePsarCrossPctFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLinePsarCrossPctAf', () => {
  it('returns fallback when value is 0', () => {
    expect(normalizeLinePsarCrossPctAf(0, 0.02)).toBe(0.02);
  });

  it('returns fallback when value is negative', () => {
    expect(normalizeLinePsarCrossPctAf(-0.5, 0.02)).toBe(0.02);
  });

  it('returns fallback when value is above 1', () => {
    expect(normalizeLinePsarCrossPctAf(1.5, 0.02)).toBe(0.02);
  });

  it('returns the value when in (0, 1]', () => {
    expect(normalizeLinePsarCrossPctAf(0.05, 0.02)).toBe(0.05);
  });
});

describe('computeLinePsarCrossPct', () => {
  it('handles null series', () => {
    expect(computeLinePsarCrossPct(null)).toEqual({ psar: [], pct: [] });
  });

  it('CONST close = K > 0 -> SAR = K bit-exact and psarPct = 0', () => {
    for (const K of [1, 5, 17, 100, 1234]) {
      const data = constSeries(40, K);
      const { psar, pct } = computeLinePsarCrossPct(data);
      for (let i = 0; i < data.length; i += 1) {
        expect(psar[i]).toBe(K);
        expect(pct[i]).toBe(0);
      }
    }
  });

  it('CONST close = 0 -> psarPct = null (divide-by-zero)', () => {
    const data = constSeries(20, 0);
    const { psar, pct } = computeLinePsarCrossPct(data);
    for (let i = 0; i < data.length; i += 1) {
      expect(psar[i]).toBe(0);
      expect(pct[i]).toBeNull();
    }
  });

  it('falls back to default afStep and afMax', () => {
    const data = constSeries(40, 5);
    const { psar } = computeLinePsarCrossPct(data);
    expect(psar[20]).toBe(5);
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(20, 3)];
    const snapshot = JSON.stringify(data);
    computeLinePsarCrossPct(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });

  it('LINEAR UP step=1 -> SAR stays at first close (cap at low) -> psarPct > 0', () => {
    const data = linearSeries(30, 10, 1);
    const { psar, pct } = computeLinePsarCrossPct(data);
    // At index 1, newSAR is capped to close[0] = 10; close[1] = 11.
    // newSAR (10) is not > close[1] (11), so no reversal.
    expect(psar[1]).toBeLessThanOrEqual(11);
    expect(pct[1]).toBeGreaterThan(0);
  });
});

describe('classifyLinePsarCrossPctRegime', () => {
  it('returns above for positive pct', () => {
    expect(classifyLinePsarCrossPctRegime(1)).toBe('above');
  });
  it('returns below for negative pct', () => {
    expect(classifyLinePsarCrossPctRegime(-1)).toBe('below');
  });
  it('returns at for zero pct', () => {
    expect(classifyLinePsarCrossPctRegime(0)).toBe('at');
  });
  it('returns none for null pct', () => {
    expect(classifyLinePsarCrossPctRegime(null)).toBe('none');
  });
});

describe('runLinePsarCrossPct', () => {
  it('returns ok=false for short series', () => {
    const res = runLinePsarCrossPct(constSeries(2, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLinePsarCrossPct(constSeries(10, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default afStep and afMax', () => {
    const res = runLinePsarCrossPct(constSeries(10, 5));
    expect(res.afStep).toBe(0.02);
    expect(res.afMax).toBe(0.2);
  });

  it('accepts custom afStep and afMax', () => {
    const res = runLinePsarCrossPct(constSeries(10, 5), {
      afStep: 0.05,
      afMax: 0.3,
    });
    expect(res.afStep).toBe(0.05);
    expect(res.afMax).toBe(0.3);
  });

  it('sorts series by x', () => {
    const res = runLinePsarCrossPct([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K > 0 -> regime at everywhere', () => {
    const res = runLinePsarCrossPct(constSeries(20, 7));
    for (let i = 0; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('at');
    }
    expect(res.aboveCount).toBe(0);
    expect(res.belowCount).toBe(0);
  });

  it('CONST K = 0 -> regime none everywhere', () => {
    const res = runLinePsarCrossPct(constSeries(20, 0));
    expect(res.noneCount).toBe(20);
  });
});

describe('computeLinePsarCrossPctLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLinePsarCrossPctLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.psarPath).toBe('');
    expect(lo.pctPath).toBe('');
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLinePsarCrossPctLayout({
      data: linearSeries(30, 10, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above pct', () => {
    const lo = computeLinePsarCrossPctLayout({
      data: linearSeries(30, 10, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.pctTop);
    expect(lo.pctTop).toBeLessThan(lo.pctBottom);
  });

  it('zero in the pct axis sits between top and bottom', () => {
    const lo = computeLinePsarCrossPctLayout({
      data: linearSeries(30, 10, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.pctTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.pctBottom);
  });

  it('renders price and psar paths', () => {
    const lo = computeLinePsarCrossPctLayout({
      data: linearSeries(30, 10, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.psarPath).toMatch(/^M\s/);
  });
});

describe('describeLinePsarCrossPctChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLinePsarCrossPctChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLinePsarCrossPctChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions afStep and afMax', () => {
    const text = describeLinePsarCrossPctChart(linearSeries(12, 1, 1), {
      afStep: 0.05,
      afMax: 0.3,
    });
    expect(text).toContain('0.05');
    expect(text).toContain('0.3');
  });
});

describe('<ChartLinePsarCrossPct />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLinePsarCrossPct data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-cross-pct-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region role when data is present', () => {
    const { container } = render(
      <ChartLinePsarCrossPct data={linearSeries(30, 10, 1)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-psar-cross-pct"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLinePsarCrossPct ref={ref} data={linearSeries(30, 10, 1)} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes afStep / afMax / total points', () => {
    const { container } = render(
      <ChartLinePsarCrossPct
        data={linearSeries(40, 10, 1)}
        afStep={0.02}
        afMax={0.2}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-psar-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.dataset.afStep).toBe('0.02');
    expect(root?.dataset.afMax).toBe('0.2');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports regime counts as data attributes', () => {
    const { container } = render(
      <ChartLinePsarCrossPct data={constSeries(60, 7)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-psar-cross-pct"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.aboveCount)).toBe(0);
    expect(Number(root?.dataset.belowCount)).toBe(0);
  });

  it('renders an aria description', () => {
    const { container } = render(
      <ChartLinePsarCrossPct data={linearSeries(30, 10, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-psar-cross-pct-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLinePsarCrossPct data={linearSeries(30, 10, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-psar-cross-pct-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLinePsarCrossPct data={linearSeries(30, 10, 1)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="psar"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLinePsarCrossPct
        data={linearSeries(30, 10, 1)}
        hiddenSeries={['psar']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="psar"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'psar',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge', () => {
    const { container } = render(
      <ChartLinePsarCrossPct
        data={linearSeries(30, 10, 1)}
        afStep={0.02}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-cross-pct-badge"]',
      )?.textContent,
    ).toContain('step 0.02');
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLinePsarCrossPct
        data={linearSeries(30, 10, 1)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-cross-pct-zeroline"]',
      ),
    ).toBeNull();
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLinePsarCrossPct
        data={linearSeries(30, 10, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-cross-pct-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLinePsarCrossPct
        data={linearSeries(30, 10, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-cross-pct-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLinePsarCrossPct
        data={linearSeries(30, 10, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-cross-pct-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLinePsarCrossPct
        data={linearSeries(30, 10, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-psar-cross-pct"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLinePsarCrossPct
        data={linearSeries(30, 10, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders psar and pct paths', () => {
    const { container } = render(
      <ChartLinePsarCrossPct data={linearSeries(30, 10, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-cross-pct-psar"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-cross-pct-pct"]',
      ),
    ).not.toBeNull();
  });

  it('renders the close price path', () => {
    const { container } = render(
      <ChartLinePsarCrossPct data={linearSeries(30, 10, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-psar-cross-pct-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides psar when defaultHiddenSeries includes psar', () => {
    const { container } = render(
      <ChartLinePsarCrossPct
        data={linearSeries(30, 10, 1)}
        defaultHiddenSeries={['psar']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="psar"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('PSAR Cross Pct integration', () => {
  it('CONST K > 0 -> SAR = K bit-exact and psarPct = 0 across multiple K', () => {
    for (const K of [1, 5, 17, 100, 1234]) {
      const res = runLinePsarCrossPct(constSeries(40, K));
      for (let i = 0; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.psar).toBe(K);
        expect(res.samples[i]?.psarPct).toBe(0);
      }
    }
  });
});
