import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  ChartLineSurvival,
  getLineSurvivalFiniteObservations,
  computeLineSurvivalMedian,
  computeKaplanMeier,
  runLineSurvival,
  computeLineSurvivalLayout,
  describeLineSurvivalChart,
  type ChartLineSurvivalObservation,
} from './chart-line-survival';

afterEach(() => cleanup());

/**
 * Canonical fixture. 4 subjects:
 *   t=1 event, t=2 event, t=3 censored, t=4 event.
 * Kaplan-Meier (S multiplied by 1 - deaths/atRisk at each event):
 *   t=1 d=1 n=4 -> S = 1   * (1 - 1/4) = 0.75
 *   t=2 d=1 n=3 -> S = 0.75 * (1 - 1/3) = 0.5
 *   t=3 d=0 n=2 -> S unchanged 0.5 (censored, one tick)
 *   t=4 d=1 n=1 -> S = 0.5  * (1 - 1/1) = 0
 * steps survival = [0.75, 0.5, 0.5, 0]. survivalFinal 0,
 * eventCount 3, censorCount 1, medianSurvival 2 (first S <= 0.5).
 */
const SURVIVAL_DATA: ChartLineSurvivalObservation[] = [
  { time: 1, event: true },
  { time: 2, event: true },
  { time: 3, event: false },
  { time: 4, event: true },
];

const LAYOUT_OPTS = {
  width: 560,
  height: 320,
  padding: 40,
};

describe('getLineSurvivalFiniteObservations', () => {
  it('keeps all finite observations', () => {
    expect(getLineSurvivalFiniteObservations(SURVIVAL_DATA)).toHaveLength(4);
  });

  it('returns empty for null input', () => {
    expect(getLineSurvivalFiniteObservations(null)).toEqual([]);
  });

  it('returns empty for undefined input', () => {
    expect(getLineSurvivalFiniteObservations(undefined)).toEqual([]);
  });

  it('drops observations with a non-finite time', () => {
    const out = getLineSurvivalFiniteObservations([
      { time: 1, event: true },
      { time: NaN, event: true },
      { time: Infinity, event: false },
    ]);
    expect(out).toHaveLength(1);
  });

  it('coerces a strict-true event flag', () => {
    const out = getLineSurvivalFiniteObservations([{ time: 1, event: true }]);
    expect(out[0]!.event).toBe(true);
  });

  it('treats anything other than strict true as censored', () => {
    const out = getLineSurvivalFiniteObservations([
      { time: 1, event: false },
    ]);
    expect(out[0]!.event).toBe(false);
  });
});

describe('computeLineSurvivalMedian', () => {
  it('returns the earliest time the survival drops to 0.5 or below', () => {
    expect(computeLineSurvivalMedian(computeKaplanMeier(SURVIVAL_DATA).steps)).toBe(
      2,
    );
  });

  it('returns null when the curve never reaches 0.5', () => {
    expect(
      computeLineSurvivalMedian([
        { time: 1, survival: 0.9, atRisk: 5, deaths: 0, censored: 0 },
        { time: 2, survival: 0.8, atRisk: 4, deaths: 0, censored: 0 },
      ]),
    ).toBeNull();
  });

  it('returns the time when survival is exactly 0.5', () => {
    expect(
      computeLineSurvivalMedian([
        { time: 7, survival: 0.5, atRisk: 2, deaths: 1, censored: 0 },
      ]),
    ).toBe(7);
  });

  it('returns null for an empty step list', () => {
    expect(computeLineSurvivalMedian([])).toBeNull();
  });

  it('returns null for a non-array', () => {
    expect(computeLineSurvivalMedian(null)).toBeNull();
  });
});

describe('computeKaplanMeier', () => {
  it('computes the survival step values for the fixture', () => {
    expect(
      computeKaplanMeier(SURVIVAL_DATA).steps.map((s) => s.survival),
    ).toEqual([0.75, 0.5, 0.5, 0]);
  });

  it('records the at-risk count before each time', () => {
    expect(
      computeKaplanMeier(SURVIVAL_DATA).steps.map((s) => s.atRisk),
    ).toEqual([4, 3, 2, 1]);
  });

  it('records the deaths at each time', () => {
    expect(
      computeKaplanMeier(SURVIVAL_DATA).steps.map((s) => s.deaths),
    ).toEqual([1, 1, 0, 1]);
  });

  it('reports the final survival', () => {
    expect(computeKaplanMeier(SURVIVAL_DATA).survivalFinal).toBe(0);
  });

  it('counts the events and censored observations', () => {
    const km = computeKaplanMeier(SURVIVAL_DATA);
    expect(km.eventCount).toBe(3);
    expect(km.censorCount).toBe(1);
  });

  it('reports the total subject count', () => {
    expect(computeKaplanMeier(SURVIVAL_DATA).total).toBe(4);
  });

  it('emits a censoring tick for each censored time', () => {
    const km = computeKaplanMeier(SURVIVAL_DATA);
    expect(km.censorTicks).toEqual([{ time: 3, survival: 0.5, count: 1 }]);
  });

  it('reports the median survival time', () => {
    expect(computeKaplanMeier(SURVIVAL_DATA).medianSurvival).toBe(2);
  });

  it('does not drop survival at a purely censored time', () => {
    const km = computeKaplanMeier(SURVIVAL_DATA);
    expect(km.steps[2]!.survival).toBe(km.steps[1]!.survival);
  });

  it('groups tied times into one step and drops by the combined deaths', () => {
    const km = computeKaplanMeier([
      { time: 5, event: true },
      { time: 5, event: true },
      { time: 6, event: false },
      { time: 7, event: false },
    ]);
    expect(km.steps).toHaveLength(3);
    expect(km.steps[0]!.deaths).toBe(2);
    expect(km.steps[0]!.survival).toBe(0.5);
  });

  it('holds survival at 1 when every observation is censored', () => {
    const km = computeKaplanMeier([
      { time: 1, event: false },
      { time: 2, event: false },
    ]);
    expect(km.survivalFinal).toBe(1);
    expect(km.medianSurvival).toBeNull();
  });

  it('sorts unsorted observations before computing', () => {
    const km = computeKaplanMeier([
      { time: 4, event: true },
      { time: 1, event: true },
      { time: 3, event: false },
      { time: 2, event: true },
    ]);
    expect(km.steps.map((s) => s.survival)).toEqual([0.75, 0.5, 0.5, 0]);
  });

  it('returns an empty result for a non-array', () => {
    expect(computeKaplanMeier(null).steps).toEqual([]);
  });
});

describe('runLineSurvival', () => {
  it('marks ok for a valid set of observations', () => {
    expect(runLineSurvival(SURVIVAL_DATA).ok).toBe(true);
  });

  it('reports not ok for fewer than two observations', () => {
    expect(runLineSurvival([{ time: 1, event: true }]).ok).toBe(false);
  });

  it('reports not ok for empty input', () => {
    expect(runLineSurvival([]).ok).toBe(false);
  });

  it('computes the survival steps', () => {
    expect(
      runLineSurvival(SURVIVAL_DATA).steps.map((s) => s.survival),
    ).toEqual([0.75, 0.5, 0.5, 0]);
  });

  it('reports the final survival', () => {
    expect(runLineSurvival(SURVIVAL_DATA).survivalFinal).toBe(0);
  });

  it('reports the event and censored counts', () => {
    const run = runLineSurvival(SURVIVAL_DATA);
    expect(run.eventCount).toBe(3);
    expect(run.censorCount).toBe(1);
  });

  it('reports the median survival', () => {
    expect(runLineSurvival(SURVIVAL_DATA).medianSurvival).toBe(2);
  });

  it('reports the total subject count', () => {
    expect(runLineSurvival(SURVIVAL_DATA).total).toBe(4);
  });

  it('returns the sorted observations', () => {
    const run = runLineSurvival([
      { time: 4, event: true },
      { time: 1, event: true },
      { time: 2, event: true },
      { time: 3, event: false },
    ]);
    expect(run.observations.map((o) => o.time)).toEqual([1, 2, 3, 4]);
  });

  it('emits one censoring tick for the censored time', () => {
    expect(runLineSurvival(SURVIVAL_DATA).censorTicks).toHaveLength(1);
  });

  it('drops non-finite observations before computing', () => {
    const run = runLineSurvival([
      { time: 1, event: true },
      { time: NaN, event: true },
      { time: 2, event: true },
    ]);
    expect(run.total).toBe(2);
  });
});

describe('computeLineSurvivalLayout', () => {
  it('is ok for a valid set of observations', () => {
    expect(
      computeLineSurvivalLayout({ data: SURVIVAL_DATA, ...LAYOUT_OPTS }).ok,
    ).toBe(true);
  });

  it('is not ok for too few observations', () => {
    const layout = computeLineSurvivalLayout({
      data: [{ time: 1, event: true }],
      ...LAYOUT_OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('reports the total, event and censored counts', () => {
    const layout = computeLineSurvivalLayout({
      data: SURVIVAL_DATA,
      ...LAYOUT_OPTS,
    });
    expect(layout.total).toBe(4);
    expect(layout.eventCount).toBe(3);
    expect(layout.censorCount).toBe(1);
  });

  it('reports the final survival and median', () => {
    const layout = computeLineSurvivalLayout({
      data: SURVIVAL_DATA,
      ...LAYOUT_OPTS,
    });
    expect(layout.survivalFinal).toBe(0);
    expect(layout.medianSurvival).toBe(2);
  });

  it('reports the step count', () => {
    const layout = computeLineSurvivalLayout({
      data: SURVIVAL_DATA,
      ...LAYOUT_OPTS,
    });
    expect(layout.totalSteps).toBe(4);
  });

  it('spans the x-axis from the first to the last event time', () => {
    const layout = computeLineSurvivalLayout({
      data: SURVIVAL_DATA,
      ...LAYOUT_OPTS,
    });
    expect(layout.xMin).toBe(1);
    expect(layout.xMax).toBe(4);
  });

  it('builds a non-empty step path', () => {
    const layout = computeLineSurvivalLayout({
      data: SURVIVAL_DATA,
      ...LAYOUT_OPTS,
    });
    expect(layout.stepPath.startsWith('M')).toBe(true);
  });

  it('emits one step marker per step', () => {
    const layout = computeLineSurvivalLayout({
      data: SURVIVAL_DATA,
      ...LAYOUT_OPTS,
    });
    expect(layout.stepMarkers).toHaveLength(4);
  });

  it('emits one censor mark per censored time', () => {
    const layout = computeLineSurvivalLayout({
      data: SURVIVAL_DATA,
      ...LAYOUT_OPTS,
    });
    expect(layout.censorMarks).toHaveLength(1);
  });

  it('projects the median x position', () => {
    const layout = computeLineSurvivalLayout({
      data: SURVIVAL_DATA,
      ...LAYOUT_OPTS,
    });
    expect(layout.medianX).toBeGreaterThan(layout.panel.x);
    expect(layout.medianX).toBeLessThan(layout.panel.x + layout.panel.width);
  });

  it('builds a 0 to 1 survival y-axis', () => {
    const layout = computeLineSurvivalLayout({
      data: SURVIVAL_DATA,
      ...LAYOUT_OPTS,
    });
    expect(layout.yTicks[0]!.value).toBe(0);
    expect(layout.yTicks[layout.yTicks.length - 1]!.value).toBe(1);
  });

  it('places the descending markers in order down the panel', () => {
    const layout = computeLineSurvivalLayout({
      data: SURVIVAL_DATA,
      ...LAYOUT_OPTS,
    });
    expect(layout.stepMarkers[0]!.py).toBeLessThan(
      layout.stepMarkers[3]!.py,
    );
  });

  it('keeps step markers inside the panel', () => {
    const layout = computeLineSurvivalLayout({
      data: SURVIVAL_DATA,
      ...LAYOUT_OPTS,
    });
    for (const m of layout.stepMarkers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.panel.y - 0.01);
      expect(m.py).toBeLessThanOrEqual(
        layout.panel.y + layout.panel.height + 0.01,
      );
    }
  });

  it('reports a null median x when the curve never reaches 0.5', () => {
    const layout = computeLineSurvivalLayout({
      data: [
        { time: 1, event: false },
        { time: 2, event: false },
      ],
      ...LAYOUT_OPTS,
    });
    expect(layout.medianX).toBeNull();
  });

  it('is not ok when the inner box collapses', () => {
    const layout = computeLineSurvivalLayout({
      data: SURVIVAL_DATA,
      width: 40,
      height: 40,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineSurvivalChart', () => {
  it('mentions the Kaplan-Meier curve', () => {
    expect(describeLineSurvivalChart(SURVIVAL_DATA)).toContain('Kaplan-Meier');
  });

  it('mentions the survival step line', () => {
    const text = describeLineSurvivalChart(SURVIVAL_DATA);
    expect(text).toContain('survival');
    expect(text).toContain('step line');
  });

  it('mentions censored observations', () => {
    expect(describeLineSurvivalChart(SURVIVAL_DATA)).toContain('censored');
  });

  it('reports the event and censored counts', () => {
    expect(describeLineSurvivalChart(SURVIVAL_DATA)).toContain(
      '3 events and 1 censored',
    );
  });

  it('returns a no-data string for too few observations', () => {
    expect(describeLineSurvivalChart([{ time: 1, event: true }])).toBe(
      'No data',
    );
  });
});

describe('<ChartLineSurvival />', () => {
  it('renders the root region', () => {
    render(<ChartLineSurvival data={SURVIVAL_DATA} />);
    expect(
      document.querySelector('[data-section="chart-line-survival"]'),
    ).toBeTruthy();
  });

  it('marks data-empty false for a valid set', () => {
    render(<ChartLineSurvival data={SURVIVAL_DATA} />);
    const root = document.querySelector('[data-section="chart-line-survival"]');
    expect(root?.getAttribute('data-empty')).toBe('false');
  });

  it('marks data-empty true for too few observations', () => {
    render(<ChartLineSurvival data={[{ time: 1, event: true }]} />);
    const root = document.querySelector('[data-section="chart-line-survival"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('exposes the total, event and censored counts as data attributes', () => {
    render(<ChartLineSurvival data={SURVIVAL_DATA} />);
    const root = document.querySelector('[data-section="chart-line-survival"]');
    expect(root?.getAttribute('data-total')).toBe('4');
    expect(root?.getAttribute('data-event-count')).toBe('3');
    expect(root?.getAttribute('data-censor-count')).toBe('1');
  });

  it('renders an accessible description', () => {
    render(<ChartLineSurvival data={SURVIVAL_DATA} />);
    const desc = document.querySelector(
      '[data-section="chart-line-survival-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Kaplan-Meier');
  });

  it('renders the survival step path', () => {
    render(<ChartLineSurvival data={SURVIVAL_DATA} />);
    expect(
      document.querySelector('[data-section="chart-line-survival-step-path"]'),
    ).toBeTruthy();
  });

  it('renders one step marker per step', () => {
    render(<ChartLineSurvival data={SURVIVAL_DATA} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-survival-marker"]'),
    ).toHaveLength(4);
  });

  it('renders one censoring tick per censored time', () => {
    render(<ChartLineSurvival data={SURVIVAL_DATA} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-survival-censor-tick"]',
      ),
    ).toHaveLength(1);
  });

  it('hides the censoring ticks when showCensorTicks is false', () => {
    render(<ChartLineSurvival data={SURVIVAL_DATA} showCensorTicks={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-survival-censor-tick"]',
      ),
    ).toBeNull();
  });

  it('renders the median line', () => {
    render(<ChartLineSurvival data={SURVIVAL_DATA} />);
    expect(
      document.querySelector('[data-section="chart-line-survival-median-line"]'),
    ).toBeTruthy();
  });

  it('hides the median line when showMedianLine is false', () => {
    render(<ChartLineSurvival data={SURVIVAL_DATA} showMedianLine={false} />);
    expect(
      document.querySelector('[data-section="chart-line-survival-median-line"]'),
    ).toBeNull();
  });

  it('renders the config badge with subject count and median', () => {
    render(<ChartLineSurvival data={SURVIVAL_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-survival-badge-subjects"]',
      )?.textContent,
    ).toBe('n=4');
    expect(
      document.querySelector(
        '[data-section="chart-line-survival-badge-median"]',
      )?.textContent,
    ).toBe('median=2');
  });

  it('hides the badge when showConfigBadge is false', () => {
    render(<ChartLineSurvival data={SURVIVAL_DATA} showConfigBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-survival-badge"]'),
    ).toBeNull();
  });

  it('renders two legend items', () => {
    render(<ChartLineSurvival data={SURVIVAL_DATA} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-survival-legend-item"]',
      ),
    ).toHaveLength(2);
  });

  it('toggles the survival series off via the legend', () => {
    render(<ChartLineSurvival data={SURVIVAL_DATA} />);
    const survivalItem = document.querySelector(
      '[data-section="chart-line-survival-legend-item"][data-series-id="survival"]',
    ) as HTMLElement;
    fireEvent.click(survivalItem);
    expect(
      document.querySelector('[data-section="chart-line-survival-step-path"]'),
    ).toBeNull();
  });

  it('toggles the censored series off via the legend', () => {
    render(<ChartLineSurvival data={SURVIVAL_DATA} />);
    const censoredItem = document.querySelector(
      '[data-section="chart-line-survival-legend-item"][data-series-id="censored"]',
    ) as HTMLElement;
    fireEvent.click(censoredItem);
    expect(
      document.querySelector(
        '[data-section="chart-line-survival-censor-tick"]',
      ),
    ).toBeNull();
  });

  it('fires onSeriesToggle when a legend item is clicked', () => {
    const onSeriesToggle = vi.fn();
    render(
      <ChartLineSurvival data={SURVIVAL_DATA} onSeriesToggle={onSeriesToggle} />,
    );
    const survivalItem = document.querySelector(
      '[data-section="chart-line-survival-legend-item"][data-series-id="survival"]',
    ) as HTMLElement;
    fireEvent.click(survivalItem);
    expect(onSeriesToggle).toHaveBeenCalledWith({
      seriesId: 'survival',
      hidden: true,
    });
  });

  it('hides the step markers when showMarkers is false', () => {
    render(<ChartLineSurvival data={SURVIVAL_DATA} showMarkers={false} />);
    expect(
      document.querySelector('[data-section="chart-line-survival-marker"]'),
    ).toBeNull();
  });

  it('shows a tooltip when a step marker is hovered', () => {
    render(<ChartLineSurvival data={SURVIVAL_DATA} />);
    const marker = document.querySelector(
      '[data-section="chart-line-survival-marker"][data-point-index="0"]',
    ) as Element;
    fireEvent.mouseEnter(marker);
    expect(
      document.querySelector(
        '[data-section="chart-line-survival-tooltip-survival"]',
      )?.textContent,
    ).toBe('survival: 0.75');
    expect(
      document.querySelector(
        '[data-section="chart-line-survival-tooltip-at-risk"]',
      )?.textContent,
    ).toBe('at risk: 4');
  });

  it('clears the tooltip on mouse leave', () => {
    render(<ChartLineSurvival data={SURVIVAL_DATA} />);
    const marker = document.querySelector(
      '[data-section="chart-line-survival-marker"]',
    ) as Element;
    fireEvent.mouseEnter(marker);
    expect(
      document.querySelector('[data-section="chart-line-survival-tooltip"]'),
    ).toBeTruthy();
    fireEvent.mouseLeave(marker);
    expect(
      document.querySelector('[data-section="chart-line-survival-tooltip"]'),
    ).toBeNull();
  });

  it('fires onStepClick when a step marker is clicked', () => {
    const onStepClick = vi.fn();
    render(<ChartLineSurvival data={SURVIVAL_DATA} onStepClick={onStepClick} />);
    const marker = document.querySelector(
      '[data-section="chart-line-survival-marker"]',
    ) as Element;
    fireEvent.click(marker);
    expect(onStepClick).toHaveBeenCalledTimes(1);
  });

  it('applies the fade-in animation class by default', () => {
    render(<ChartLineSurvival data={SURVIVAL_DATA} />);
    const root = document.querySelector('[data-section="chart-line-survival"]');
    expect(root?.className).toContain('motion-safe:animate-fade-in');
  });

  it('omits the animation class when animate is false', () => {
    render(<ChartLineSurvival data={SURVIVAL_DATA} animate={false} />);
    const root = document.querySelector('[data-section="chart-line-survival"]');
    expect(root?.className ?? '').not.toContain(
      'motion-safe:animate-fade-in',
    );
  });

  it('forwards a ref to the root element', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineSurvival ref={ref} data={SURVIVAL_DATA} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('applies a custom class name', () => {
    render(<ChartLineSurvival data={SURVIVAL_DATA} className="custom-km" />);
    const root = document.querySelector('[data-section="chart-line-survival"]');
    expect(root?.className).toContain('custom-km');
  });

  it('renders an accessible region role', () => {
    render(<ChartLineSurvival data={SURVIVAL_DATA} />);
    expect(screen.getByRole('region')).toBeTruthy();
  });

  it('reports the event and censored counts in the legend stats', () => {
    render(<ChartLineSurvival data={SURVIVAL_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-survival-legend-stats"]',
      )?.textContent,
    ).toContain('3 events, 1 censored');
  });
});
