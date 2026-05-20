import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  ChartLineCdf,
  getLineCdfFiniteValues,
  computeLineCdfMedian,
  computeLineCdf,
  runLineCdf,
  computeLineCdfLayout,
  describeLineCdfChart,
} from './chart-line-cdf';

afterEach(() => cleanup());

/**
 * Canonical fixture. values = [30,10,20,10,40] -> sorted
 * [10,10,20,30,40], n = 5. The ECDF jumps by count/n at each
 * distinct value:
 *   value 10: count 2, cumulative 2 -> probability 2/5 = 0.4
 *   value 20: count 1, cumulative 3 -> probability 3/5 = 0.6
 *   value 30: count 1, cumulative 4 -> probability 4/5 = 0.8
 *   value 40: count 1, cumulative 5 -> probability 5/5 = 1.0
 * 4 distinct values, median 20 (first probability >= 0.5).
 */
const CDF_DATA: number[] = [30, 10, 20, 10, 40];

const LAYOUT_OPTS = {
  width: 560,
  height: 320,
  padding: 40,
};

describe('getLineCdfFiniteValues', () => {
  it('keeps all finite values', () => {
    expect(getLineCdfFiniteValues(CDF_DATA)).toHaveLength(5);
  });

  it('returns empty for null input', () => {
    expect(getLineCdfFiniteValues(null)).toEqual([]);
  });

  it('returns empty for undefined input', () => {
    expect(getLineCdfFiniteValues(undefined)).toEqual([]);
  });

  it('drops non-finite values', () => {
    expect(getLineCdfFiniteValues([10, NaN, 20, Infinity, -Infinity])).toEqual([
      10, 20,
    ]);
  });

  it('preserves the original order', () => {
    expect(getLineCdfFiniteValues([30, 10, 20])).toEqual([30, 10, 20]);
  });
});

describe('computeLineCdfMedian', () => {
  it('returns the first value reaching probability 0.5 or above', () => {
    expect(computeLineCdfMedian(computeLineCdf(CDF_DATA))).toBe(20);
  });

  it('returns the value when probability is exactly 0.5', () => {
    expect(
      computeLineCdfMedian([
        { value: 3, count: 1, cumulative: 1, probability: 0.5 },
        { value: 7, count: 1, cumulative: 2, probability: 1 },
      ]),
    ).toBe(3);
  });

  it('returns the single value for a one-step ECDF', () => {
    expect(
      computeLineCdfMedian([
        { value: 7, count: 1, cumulative: 1, probability: 1 },
      ]),
    ).toBe(7);
  });

  it('returns null for an empty step list', () => {
    expect(computeLineCdfMedian([])).toBeNull();
  });

  it('returns null for a non-array', () => {
    expect(computeLineCdfMedian(null)).toBeNull();
  });
});

describe('computeLineCdf', () => {
  it('computes the ECDF steps for the fixture', () => {
    expect(computeLineCdf(CDF_DATA)).toEqual([
      { value: 10, count: 2, cumulative: 2, probability: 0.4 },
      { value: 20, count: 1, cumulative: 3, probability: 0.6 },
      { value: 30, count: 1, cumulative: 4, probability: 0.8 },
      { value: 40, count: 1, cumulative: 5, probability: 1 },
    ]);
  });

  it('groups duplicate values into one step with their multiplicity', () => {
    expect(computeLineCdf(CDF_DATA)[0]).toEqual({
      value: 10,
      count: 2,
      cumulative: 2,
      probability: 0.4,
    });
  });

  it('reaches probability 1 at the last step', () => {
    const steps = computeLineCdf(CDF_DATA);
    expect(steps[steps.length - 1]!.probability).toBe(1);
  });

  it('produces monotonically increasing probabilities', () => {
    const steps = computeLineCdf(CDF_DATA);
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i]!.probability).toBeGreaterThan(
        steps[i - 1]!.probability,
      );
    }
  });

  it('produces monotonically increasing values', () => {
    const steps = computeLineCdf(CDF_DATA);
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i]!.value).toBeGreaterThan(steps[i - 1]!.value);
    }
  });

  it('returns one step for an all-identical series', () => {
    expect(computeLineCdf([5, 5, 5])).toEqual([
      { value: 5, count: 3, cumulative: 3, probability: 1 },
    ]);
  });

  it('returns a single full step for a one-value series', () => {
    expect(computeLineCdf([7])).toEqual([
      { value: 7, count: 1, cumulative: 1, probability: 1 },
    ]);
  });

  it('returns empty for an empty series', () => {
    expect(computeLineCdf([])).toEqual([]);
  });

  it('returns empty for a non-array', () => {
    expect(computeLineCdf(null)).toEqual([]);
  });

  it('drops non-finite values before computing', () => {
    expect(computeLineCdf([10, NaN, 20, Infinity])).toEqual([
      { value: 10, count: 1, cumulative: 1, probability: 0.5 },
      { value: 20, count: 1, cumulative: 2, probability: 1 },
    ]);
  });

  it('sorts unsorted input before computing', () => {
    expect(computeLineCdf([40, 10, 30, 20]).map((s) => s.value)).toEqual([
      10, 20, 30, 40,
    ]);
  });

  it('reports the cumulative count of values at or below each value', () => {
    expect(computeLineCdf(CDF_DATA).map((s) => s.cumulative)).toEqual([
      2, 3, 4, 5,
    ]);
  });
});

describe('runLineCdf', () => {
  it('marks ok for a valid series', () => {
    expect(runLineCdf(CDF_DATA).ok).toBe(true);
  });

  it('reports not ok for fewer than two values', () => {
    expect(runLineCdf([5]).ok).toBe(false);
  });

  it('reports not ok for empty input', () => {
    expect(runLineCdf([]).ok).toBe(false);
  });

  it('reports the sample size', () => {
    expect(runLineCdf(CDF_DATA).n).toBe(5);
  });

  it('reports the distinct value count', () => {
    expect(runLineCdf(CDF_DATA).distinctCount).toBe(4);
  });

  it('computes the ECDF steps', () => {
    expect(runLineCdf(CDF_DATA).steps.map((s) => s.probability)).toEqual([
      0.4, 0.6, 0.8, 1,
    ]);
  });

  it('reports the min and max values', () => {
    const run = runLineCdf(CDF_DATA);
    expect(run.minValue).toBe(10);
    expect(run.maxValue).toBe(40);
  });

  it('reports the median', () => {
    expect(runLineCdf(CDF_DATA).median).toBe(20);
  });

  it('returns the sorted values', () => {
    expect(runLineCdf(CDF_DATA).values).toEqual([10, 10, 20, 30, 40]);
  });

  it('drops non-finite values before computing', () => {
    expect(runLineCdf([10, NaN, 20]).n).toBe(2);
  });

  it('is not ok when only one finite value remains', () => {
    expect(runLineCdf([10, NaN, Infinity]).ok).toBe(false);
  });
});

describe('computeLineCdfLayout', () => {
  it('is ok for a valid series', () => {
    expect(computeLineCdfLayout({ data: CDF_DATA, ...LAYOUT_OPTS }).ok).toBe(
      true,
    );
  });

  it('is not ok for too few values', () => {
    expect(
      computeLineCdfLayout({ data: [5], ...LAYOUT_OPTS }).ok,
    ).toBe(false);
  });

  it('reports the sample size and distinct count', () => {
    const layout = computeLineCdfLayout({ data: CDF_DATA, ...LAYOUT_OPTS });
    expect(layout.n).toBe(5);
    expect(layout.distinctCount).toBe(4);
  });

  it('reports the min, max and median', () => {
    const layout = computeLineCdfLayout({ data: CDF_DATA, ...LAYOUT_OPTS });
    expect(layout.minValue).toBe(10);
    expect(layout.maxValue).toBe(40);
    expect(layout.median).toBe(20);
  });

  it('reports the step count', () => {
    expect(
      computeLineCdfLayout({ data: CDF_DATA, ...LAYOUT_OPTS }).totalSteps,
    ).toBe(4);
  });

  it('spans the x-axis from the min to the max value', () => {
    const layout = computeLineCdfLayout({ data: CDF_DATA, ...LAYOUT_OPTS });
    expect(layout.xMin).toBe(10);
    expect(layout.xMax).toBe(40);
  });

  it('builds a non-empty step path', () => {
    expect(
      computeLineCdfLayout({ data: CDF_DATA, ...LAYOUT_OPTS }).stepPath.startsWith(
        'M',
      ),
    ).toBe(true);
  });

  it('emits one step marker per distinct value', () => {
    expect(
      computeLineCdfLayout({ data: CDF_DATA, ...LAYOUT_OPTS }).stepMarkers,
    ).toHaveLength(4);
  });

  it('projects the median x position', () => {
    const layout = computeLineCdfLayout({ data: CDF_DATA, ...LAYOUT_OPTS });
    expect(layout.medianX).toBeGreaterThan(layout.panel.x);
    expect(layout.medianX).toBeLessThan(layout.panel.x + layout.panel.width);
  });

  it('builds a 0 to 1 probability y-axis', () => {
    const layout = computeLineCdfLayout({ data: CDF_DATA, ...LAYOUT_OPTS });
    expect(layout.yTicks[0]!.value).toBe(0);
    expect(layout.yTicks[layout.yTicks.length - 1]!.value).toBe(1);
  });

  it('places the rising markers in order up the panel', () => {
    const layout = computeLineCdfLayout({ data: CDF_DATA, ...LAYOUT_OPTS });
    expect(layout.stepMarkers[0]!.py).toBeGreaterThan(
      layout.stepMarkers[3]!.py,
    );
  });

  it('keeps step markers inside the panel', () => {
    const layout = computeLineCdfLayout({ data: CDF_DATA, ...LAYOUT_OPTS });
    for (const m of layout.stepMarkers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.panel.y - 0.01);
      expect(m.py).toBeLessThanOrEqual(
        layout.panel.y + layout.panel.height + 0.01,
      );
    }
  });

  it('is not ok when the inner box collapses', () => {
    const layout = computeLineCdfLayout({
      data: CDF_DATA,
      width: 40,
      height: 40,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineCdfChart', () => {
  it('mentions the empirical cumulative distribution function', () => {
    expect(describeLineCdfChart(CDF_DATA)).toContain(
      'Empirical cumulative distribution function',
    );
  });

  it('mentions the step curve', () => {
    expect(describeLineCdfChart(CDF_DATA)).toContain('step curve');
  });

  it('mentions rising from zero to one', () => {
    expect(describeLineCdfChart(CDF_DATA)).toContain(
      'rises from zero to one',
    );
  });

  it('reports the distinct and observation counts', () => {
    expect(describeLineCdfChart(CDF_DATA)).toContain(
      '4 distinct values across 5 observations',
    );
  });

  it('returns a no-data string for too few values', () => {
    expect(describeLineCdfChart([5])).toBe('No data');
  });
});

describe('<ChartLineCdf />', () => {
  it('renders the root region', () => {
    render(<ChartLineCdf data={CDF_DATA} />);
    expect(
      document.querySelector('[data-section="chart-line-cdf"]'),
    ).toBeTruthy();
  });

  it('marks data-empty false for a valid series', () => {
    render(<ChartLineCdf data={CDF_DATA} />);
    const root = document.querySelector('[data-section="chart-line-cdf"]');
    expect(root?.getAttribute('data-empty')).toBe('false');
  });

  it('marks data-empty true for too few values', () => {
    render(<ChartLineCdf data={[5]} />);
    const root = document.querySelector('[data-section="chart-line-cdf"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('exposes the sample size and distinct count as data attributes', () => {
    render(<ChartLineCdf data={CDF_DATA} />);
    const root = document.querySelector('[data-section="chart-line-cdf"]');
    expect(root?.getAttribute('data-n')).toBe('5');
    expect(root?.getAttribute('data-distinct-count')).toBe('4');
  });

  it('exposes the median as a data attribute', () => {
    render(<ChartLineCdf data={CDF_DATA} />);
    const root = document.querySelector('[data-section="chart-line-cdf"]');
    expect(root?.getAttribute('data-median')).toBe('20');
  });

  it('renders an accessible description', () => {
    render(<ChartLineCdf data={CDF_DATA} />);
    const desc = document.querySelector(
      '[data-section="chart-line-cdf-aria-desc"]',
    );
    expect(desc?.textContent).toContain(
      'Empirical cumulative distribution function',
    );
  });

  it('renders the step path', () => {
    render(<ChartLineCdf data={CDF_DATA} />);
    expect(
      document.querySelector('[data-section="chart-line-cdf-step-path"]'),
    ).toBeTruthy();
  });

  it('renders one step marker per distinct value', () => {
    render(<ChartLineCdf data={CDF_DATA} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-cdf-marker"]'),
    ).toHaveLength(4);
  });

  it('renders the median line', () => {
    render(<ChartLineCdf data={CDF_DATA} />);
    expect(
      document.querySelector('[data-section="chart-line-cdf-median-line"]'),
    ).toBeTruthy();
  });

  it('hides the median line when showMedianLine is false', () => {
    render(<ChartLineCdf data={CDF_DATA} showMedianLine={false} />);
    expect(
      document.querySelector('[data-section="chart-line-cdf-median-line"]'),
    ).toBeNull();
  });

  it('renders the config badge with sample size and median', () => {
    render(<ChartLineCdf data={CDF_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-cdf-badge-n"]',
      )?.textContent,
    ).toBe('n=5');
    expect(
      document.querySelector(
        '[data-section="chart-line-cdf-badge-median"]',
      )?.textContent,
    ).toBe('median=20');
  });

  it('hides the badge when showConfigBadge is false', () => {
    render(<ChartLineCdf data={CDF_DATA} showConfigBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-cdf-badge"]'),
    ).toBeNull();
  });

  it('renders two legend items', () => {
    render(<ChartLineCdf data={CDF_DATA} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-cdf-legend-item"]'),
    ).toHaveLength(2);
  });

  it('toggles the ECDF series off via the legend', () => {
    render(<ChartLineCdf data={CDF_DATA} />);
    const cdfItem = document.querySelector(
      '[data-section="chart-line-cdf-legend-item"][data-series-id="cdf"]',
    ) as HTMLElement;
    fireEvent.click(cdfItem);
    expect(
      document.querySelector('[data-section="chart-line-cdf-step-path"]'),
    ).toBeNull();
  });

  it('toggles the median line off via the legend', () => {
    render(<ChartLineCdf data={CDF_DATA} />);
    const medianItem = document.querySelector(
      '[data-section="chart-line-cdf-legend-item"][data-series-id="median"]',
    ) as HTMLElement;
    fireEvent.click(medianItem);
    expect(
      document.querySelector('[data-section="chart-line-cdf-median-line"]'),
    ).toBeNull();
  });

  it('fires onSeriesToggle when a legend item is clicked', () => {
    const onSeriesToggle = vi.fn();
    render(<ChartLineCdf data={CDF_DATA} onSeriesToggle={onSeriesToggle} />);
    const cdfItem = document.querySelector(
      '[data-section="chart-line-cdf-legend-item"][data-series-id="cdf"]',
    ) as HTMLElement;
    fireEvent.click(cdfItem);
    expect(onSeriesToggle).toHaveBeenCalledWith({
      seriesId: 'cdf',
      hidden: true,
    });
  });

  it('hides the step markers when showMarkers is false', () => {
    render(<ChartLineCdf data={CDF_DATA} showMarkers={false} />);
    expect(
      document.querySelector('[data-section="chart-line-cdf-marker"]'),
    ).toBeNull();
  });

  it('shows a tooltip when a step marker is hovered', () => {
    render(<ChartLineCdf data={CDF_DATA} />);
    const marker = document.querySelector(
      '[data-section="chart-line-cdf-marker"][data-point-index="0"]',
    ) as Element;
    fireEvent.mouseEnter(marker);
    expect(
      document.querySelector(
        '[data-section="chart-line-cdf-tooltip-probability"]',
      )?.textContent,
    ).toBe('probability: 0.40');
    expect(
      document.querySelector(
        '[data-section="chart-line-cdf-tooltip-count"]',
      )?.textContent,
    ).toBe('count: 2');
  });

  it('clears the tooltip on mouse leave', () => {
    render(<ChartLineCdf data={CDF_DATA} />);
    const marker = document.querySelector(
      '[data-section="chart-line-cdf-marker"]',
    ) as Element;
    fireEvent.mouseEnter(marker);
    expect(
      document.querySelector('[data-section="chart-line-cdf-tooltip"]'),
    ).toBeTruthy();
    fireEvent.mouseLeave(marker);
    expect(
      document.querySelector('[data-section="chart-line-cdf-tooltip"]'),
    ).toBeNull();
  });

  it('fires onStepClick when a step marker is clicked', () => {
    const onStepClick = vi.fn();
    render(<ChartLineCdf data={CDF_DATA} onStepClick={onStepClick} />);
    const marker = document.querySelector(
      '[data-section="chart-line-cdf-marker"]',
    ) as Element;
    fireEvent.click(marker);
    expect(onStepClick).toHaveBeenCalledTimes(1);
  });

  it('applies the fade-in animation class by default', () => {
    render(<ChartLineCdf data={CDF_DATA} />);
    const root = document.querySelector('[data-section="chart-line-cdf"]');
    expect(root?.className).toContain('motion-safe:animate-fade-in');
  });

  it('omits the animation class when animate is false', () => {
    render(<ChartLineCdf data={CDF_DATA} animate={false} />);
    const root = document.querySelector('[data-section="chart-line-cdf"]');
    expect(root?.className ?? '').not.toContain(
      'motion-safe:animate-fade-in',
    );
  });

  it('forwards a ref to the root element', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineCdf ref={ref} data={CDF_DATA} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('applies a custom class name', () => {
    render(<ChartLineCdf data={CDF_DATA} className="custom-cdf" />);
    const root = document.querySelector('[data-section="chart-line-cdf"]');
    expect(root?.className).toContain('custom-cdf');
  });

  it('renders an accessible region role', () => {
    render(<ChartLineCdf data={CDF_DATA} />);
    expect(screen.getByRole('region')).toBeTruthy();
  });

  it('reports the value counts in the legend stats', () => {
    render(<ChartLineCdf data={CDF_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-cdf-legend-stats"]',
      )?.textContent,
    ).toContain('5 values, 4 distinct');
  });
});
