import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ALL_CHART_LINE_EVENT_KINDS,
  ChartLineEvent,
  DEFAULT_CHART_LINE_EVENT_HEIGHT,
  DEFAULT_CHART_LINE_EVENT_ICON_RADIUS,
  DEFAULT_CHART_LINE_EVENT_KINDS,
  DEFAULT_CHART_LINE_EVENT_PADDING,
  DEFAULT_CHART_LINE_EVENT_PALETTE,
  DEFAULT_CHART_LINE_EVENT_TICK_COUNT,
  DEFAULT_CHART_LINE_EVENT_TRACK_HEIGHT,
  DEFAULT_CHART_LINE_EVENT_WIDTH,
  buildLineEventIconPath,
  computeLineEventLayout,
  describeLineEventChart,
  getLineEventDefaultColor,
  getLineEventFinitePoints,
  getLineEventKindDef,
  getLineEventValidEvents,
  type ChartLineEventEvent,
  type ChartLineEventSeries,
} from './chart-line-event';

const seriesA: ChartLineEventSeries = {
  id: 'a',
  label: 'Latency',
  data: [
    { x: 0, y: 100 },
    { x: 1, y: 120 },
    { x: 2, y: 140 },
    { x: 3, y: 110 },
    { x: 4, y: 130 },
  ],
};

const eventList: ChartLineEventEvent[] = [
  { id: 'e1', x: 1, title: 'Release 1.2.3', kind: 'release' },
  { id: 'e2', x: 2.5, title: 'Outage', kind: 'incident', description: 'Database failover' },
  { id: 'e3', x: 3, title: 'Patch deploy', kind: 'maintenance' },
];

describe('DEFAULT_CHART_LINE_EVENT_* defaults', () => {
  it('has positive width, height, padding, tick count, track', () => {
    expect(DEFAULT_CHART_LINE_EVENT_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_EVENT_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_EVENT_PADDING).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_LINE_EVENT_TICK_COUNT).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_CHART_LINE_EVENT_TRACK_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_EVENT_ICON_RADIUS).toBeGreaterThan(0);
  });

  it('exposes a 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_EVENT_PALETTE).toHaveLength(10);
  });

  it('has six canonical event kinds', () => {
    expect(ALL_CHART_LINE_EVENT_KINDS).toHaveLength(6);
    for (const k of ALL_CHART_LINE_EVENT_KINDS) {
      const def = DEFAULT_CHART_LINE_EVENT_KINDS[k];
      expect(def.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(def.icon).toMatch(
        /^(circle|triangle|square|diamond|cross|star)$/,
      );
      expect(typeof def.label).toBe('string');
    }
  });

  it('release maps to circle, incident to triangle, milestone to star', () => {
    expect(DEFAULT_CHART_LINE_EVENT_KINDS.release.icon).toBe('circle');
    expect(DEFAULT_CHART_LINE_EVENT_KINDS.incident.icon).toBe('triangle');
    expect(DEFAULT_CHART_LINE_EVENT_KINDS.milestone.icon).toBe('star');
  });
});

describe('getLineEventDefaultColor', () => {
  it('cycles through the palette by index', () => {
    expect(getLineEventDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_EVENT_PALETTE[0],
    );
    expect(getLineEventDefaultColor(11)).toBe(
      DEFAULT_CHART_LINE_EVENT_PALETTE[1],
    );
  });

  it('falls back to first color on invalid index', () => {
    expect(getLineEventDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_EVENT_PALETTE[0],
    );
    expect(getLineEventDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_EVENT_PALETTE[0],
    );
  });
});

describe('getLineEventKindDef', () => {
  it('returns the canonical definition for known kinds', () => {
    expect(getLineEventKindDef('release').icon).toBe('circle');
    expect(getLineEventKindDef('incident').color).toBe(
      DEFAULT_CHART_LINE_EVENT_KINDS.incident.color,
    );
  });

  it('falls back to custom for unknown kinds', () => {
    expect(
      getLineEventKindDef('typo-kind' as never).icon,
    ).toBe(DEFAULT_CHART_LINE_EVENT_KINDS.custom.icon);
    expect(getLineEventKindDef(undefined).icon).toBe(
      DEFAULT_CHART_LINE_EVENT_KINDS.custom.icon,
    );
    expect(getLineEventKindDef(null).icon).toBe(
      DEFAULT_CHART_LINE_EVENT_KINDS.custom.icon,
    );
  });
});

describe('getLineEventFinitePoints', () => {
  it('drops non-finite samples', () => {
    expect(
      getLineEventFinitePoints([
        { x: 0, y: 1 },
        { x: Number.NaN, y: 2 },
        { x: 3, y: Number.POSITIVE_INFINITY },
        { x: 5, y: 8 },
      ]),
    ).toEqual([
      { x: 0, y: 1 },
      { x: 5, y: 8 },
    ]);
  });

  it('returns [] for non-array', () => {
    expect(
      getLineEventFinitePoints(
        null as unknown as ReadonlyArray<{ x: number; y: number }>,
      ),
    ).toEqual([]);
  });
});

describe('getLineEventValidEvents', () => {
  it('keeps valid events', () => {
    expect(getLineEventValidEvents(eventList)).toHaveLength(3);
  });

  it('drops malformed entries', () => {
    const messy: unknown[] = [
      null,
      { id: '', x: 1, title: 'no id' },
      { id: 'a', x: Number.NaN, title: 'NaN x' },
      { id: 'b', x: 5, title: undefined },
      { id: 'c', x: 2, title: 'ok' },
    ];
    const out = getLineEventValidEvents(
      messy as unknown as readonly ChartLineEventEvent[],
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('c');
  });

  it('returns [] for non-array', () => {
    expect(
      getLineEventValidEvents(
        null as unknown as readonly ChartLineEventEvent[],
      ),
    ).toEqual([]);
  });

  it('preserves input order', () => {
    const out = getLineEventValidEvents(eventList);
    expect(out.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });
});

describe('buildLineEventIconPath', () => {
  it('returns empty for non-finite center / radius', () => {
    expect(buildLineEventIconPath('circle', Number.NaN, 5, 7)).toBe('');
    expect(buildLineEventIconPath('circle', 5, Number.NaN, 7)).toBe('');
    expect(buildLineEventIconPath('circle', 5, 5, Number.NaN)).toBe('');
    expect(buildLineEventIconPath('circle', 5, 5, 0)).toBe('');
    expect(buildLineEventIconPath('circle', 5, 5, -1)).toBe('');
  });

  it('builds a closed path for circle / triangle / square / diamond / star', () => {
    for (const icon of ['circle', 'triangle', 'square', 'diamond', 'star'] as const) {
      const d = buildLineEventIconPath(icon, 100, 50, 8);
      expect(d).toMatch(/^M /);
      expect(d).toMatch(/Z$/);
    }
  });

  it('builds two sub-paths for cross via M ... L ... M ... L', () => {
    const d = buildLineEventIconPath('cross', 100, 50, 8);
    expect(d.split('M').length - 1).toBe(2);
    expect(d).not.toMatch(/Z$/);
  });

  it('emits 10 vertices for the star (5 outer + 5 inner)', () => {
    const d = buildLineEventIconPath('star', 100, 100, 10);
    const moveAndLine = (d.match(/[ML]/g) || []).length;
    expect(moveAndLine).toBe(10);
  });
});

describe('computeLineEventLayout', () => {
  it('returns empty when no series + no events', () => {
    const layout = computeLineEventLayout({
      series: [],
      events: [],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
    expect(layout.events).toEqual([]);
  });

  it('returns empty when canvas degenerate', () => {
    const layout = computeLineEventLayout({
      series: [seriesA],
      events: eventList,
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
    expect(layout.events).toEqual([]);
  });

  it('builds layout series with finiteCount and path', () => {
    const layout = computeLineEventLayout({
      series: [seriesA],
      events: eventList,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.finiteCount).toBe(5);
    expect(layout.series[0]?.path).toMatch(/^M /);
  });

  it('builds layout events with icon path and rule positions', () => {
    const layout = computeLineEventLayout({
      series: [seriesA],
      events: eventList,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.events).toHaveLength(3);
    expect(layout.events[0]?.iconPath).toMatch(/^M /);
    expect(layout.events[0]?.kind).toBe('release');
    expect(layout.events[0]?.icon).toBe('circle');
    expect(layout.events[0]?.color).toBe(
      DEFAULT_CHART_LINE_EVENT_KINDS.release.color,
    );
    expect(layout.events[0]?.ruleY1).toBeGreaterThan(0);
    expect(layout.events[0]?.ruleY2).toBeGreaterThan(
      layout.events[0]!.ruleY1,
    );
  });

  it('honors per-event color and icon overrides', () => {
    const custom: ChartLineEventEvent[] = [
      {
        id: 'x',
        x: 1,
        title: 'Custom',
        color: '#abcdef',
        icon: 'square',
      },
    ];
    const layout = computeLineEventLayout({
      series: [seriesA],
      events: custom,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.events[0]?.color).toBe('#abcdef');
    expect(layout.events[0]?.icon).toBe('square');
  });

  it('falls back to custom for unknown kind', () => {
    const layout = computeLineEventLayout({
      series: [seriesA],
      events: [{ id: 'x', x: 1, title: 'X', kind: 'mystery' as never }],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.events[0]?.kind).toBe('mystery');
    expect(layout.events[0]?.color).toBe(
      DEFAULT_CHART_LINE_EVENT_KINDS.custom.color,
    );
  });

  it('expands x bounds to include events', () => {
    const offset: ChartLineEventEvent[] = [
      { id: 'far', x: 100, title: 'Far event', kind: 'incident' },
    ];
    const layout = computeLineEventLayout({
      series: [seriesA],
      events: offset,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.xMax).toBeGreaterThanOrEqual(100);
  });

  it('honors hiddenSeries filter', () => {
    const layout = computeLineEventLayout({
      series: [seriesA, { id: 'b', label: 'B', data: [{ x: 0, y: 5 }] }],
      events: eventList,
      hiddenSeries: new Set(['a']),
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('b');
  });

  it('honors hiddenKinds filter', () => {
    const layout = computeLineEventLayout({
      series: [seriesA],
      events: eventList,
      hiddenKinds: new Set(['incident']),
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.events).toHaveLength(2);
    expect(layout.events.map((e) => e.kind)).not.toContain('incident');
  });

  it('marks out-of-range events with inRange=false', () => {
    const layout = computeLineEventLayout({
      series: [seriesA],
      events: [{ id: 'far', x: 100, title: 'Far', kind: 'info' }],
      xMin: 0,
      xMax: 5,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.events[0]?.inRange).toBe(false);
    expect(layout.visibleEventCount).toBe(0);
  });

  it('reduces track allocation when showEventTrack=false', () => {
    const layoutWithTrack = computeLineEventLayout({
      series: [seriesA],
      events: eventList,
      width: 400,
      height: 300,
      padding: 30,
    });
    const layoutNoTrack = computeLineEventLayout({
      series: [seriesA],
      events: eventList,
      showEventTrack: false,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layoutNoTrack.innerHeight).toBeGreaterThan(
      layoutWithTrack.innerHeight,
    );
    expect(layoutNoTrack.trackBottom).toBe(30);
  });

  it('respects user-supplied bounds overrides', () => {
    const layout = computeLineEventLayout({
      series: [seriesA],
      events: eventList,
      width: 400,
      height: 300,
      padding: 30,
      xMin: -10,
      xMax: 20,
      yMin: -50,
      yMax: 500,
    });
    expect(layout.xMin).toBe(-10);
    expect(layout.xMax).toBe(20);
    expect(layout.yMin).toBe(-50);
    expect(layout.yMax).toBe(500);
  });

  it('produces axis ticks at the requested step count', () => {
    const layout = computeLineEventLayout({
      series: [seriesA],
      events: eventList,
      width: 400,
      height: 300,
      padding: 30,
      tickCount: 6,
    });
    expect(layout.xTicks).toHaveLength(6);
    expect(layout.yTicks).toHaveLength(6);
  });
});

describe('describeLineEventChart', () => {
  it('returns "No data" when both series and events empty', () => {
    expect(describeLineEventChart([], [])).toBe('No data');
    expect(describeLineEventChart(null, null)).toBe('No data');
  });

  it('summarises series + event count', () => {
    const text = describeLineEventChart([seriesA], eventList);
    expect(text).toContain('1 series');
    expect(text).toContain('5 points');
    expect(text).toContain('3 events');
    expect(text).toContain('Release 1.2.3');
  });

  it('omits event mention when no events', () => {
    const text = describeLineEventChart([seriesA], []);
    expect(text).toContain('No events');
  });

  it('honors hiddenSeries and hiddenKinds in description', () => {
    const text = describeLineEventChart(
      [seriesA],
      eventList,
      undefined,
      new Set(['incident']),
    );
    expect(text).toContain('2 events');
    expect(text).not.toContain('Outage');
  });
});

describe('<ChartLineEvent /> rendering', () => {
  it('renders nothing meaningful when empty series and events', () => {
    const { container } = render(<ChartLineEvent series={[]} />);
    const root = container.querySelector('[data-section="chart-line-event"]');
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-event-count')).toBe('0');
    expect(
      container.querySelectorAll('[data-section="chart-line-event-icon"]'),
    ).toHaveLength(0);
  });

  it('renders one line path per series', () => {
    const { container } = render(
      <ChartLineEvent series={[seriesA]} events={eventList} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-event-path"]'),
    ).toHaveLength(1);
  });

  it('renders one icon per visible event', () => {
    const { container } = render(
      <ChartLineEvent series={[seriesA]} events={eventList} />,
    );
    const icons = container.querySelectorAll(
      '[data-section="chart-line-event-icon"]',
    );
    expect(icons).toHaveLength(3);
    expect(icons[0]?.getAttribute('data-event-kind')).toBe('release');
    expect(icons[1]?.getAttribute('data-event-icon')).toBe('triangle');
  });

  it('renders a vertical rule under each event', () => {
    const { container } = render(
      <ChartLineEvent series={[seriesA]} events={eventList} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-event-rule"]'),
    ).toHaveLength(3);
  });

  it('hides rules when showEventRule=false', () => {
    const { container } = render(
      <ChartLineEvent
        series={[seriesA]}
        events={eventList}
        showEventRule={false}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-event-rule"]'),
    ).toHaveLength(0);
  });

  it('hides the entire event track when showEventTrack=false', () => {
    const { container } = render(
      <ChartLineEvent
        series={[seriesA]}
        events={eventList}
        showEventTrack={false}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-event-icon"]'),
    ).toHaveLength(0);
    expect(
      container.querySelector('[data-section="chart-line-event-track-bg"]'),
    ).toBeNull();
  });

  it('renders the track background by default', () => {
    const { container } = render(
      <ChartLineEvent series={[seriesA]} events={eventList} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-event-track-bg"]'),
    ).not.toBeNull();
  });

  it('hides track background when showTrackBg=false', () => {
    const { container } = render(
      <ChartLineEvent
        series={[seriesA]}
        events={eventList}
        showTrackBg={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-event-track-bg"]'),
    ).toBeNull();
  });

  it('renders dots per finite point', () => {
    const { container } = render(
      <ChartLineEvent series={[seriesA]} events={eventList} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-event-dot"]'),
    ).toHaveLength(5);
  });

  it('renders aria description and labels region', () => {
    render(<ChartLineEvent series={[seriesA]} events={eventList} />);
    expect(
      screen.getByRole('region', {
        name: /line chart with event markers/i,
      }),
    ).toBeTruthy();
  });

  it('shows event tooltip on icon hover with title + kind + description', () => {
    const { container } = render(
      <ChartLineEvent series={[seriesA]} events={eventList} />,
    );
    const incidentIcon = container.querySelector(
      '[data-section="chart-line-event-icon"][data-event-id="e2"]',
    ) as SVGPathElement;
    fireEvent.mouseEnter(incidentIcon);
    const tip = container.querySelector(
      '[data-section="chart-line-event-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      tip?.querySelector(
        '[data-section="chart-line-event-tooltip-title"]',
      )?.textContent,
    ).toBe('Outage');
    expect(
      tip?.querySelector(
        '[data-section="chart-line-event-tooltip-kind"]',
      )?.textContent,
    ).toMatch(/Incident/);
    expect(
      tip?.querySelector(
        '[data-section="chart-line-event-tooltip-description"]',
      )?.textContent,
    ).toBe('Database failover');
  });

  it('omits description row when event has no description', () => {
    const { container } = render(
      <ChartLineEvent series={[seriesA]} events={eventList} />,
    );
    const releaseIcon = container.querySelector(
      '[data-section="chart-line-event-icon"][data-event-id="e1"]',
    ) as SVGPathElement;
    fireEvent.mouseEnter(releaseIcon);
    expect(
      container.querySelector(
        '[data-section="chart-line-event-tooltip-description"]',
      ),
    ).toBeNull();
  });

  it('shows timestamp label when provided', () => {
    const stamped: ChartLineEventEvent[] = [
      {
        id: 'ts',
        x: 1,
        title: 'Daily build',
        kind: 'release',
        timestampLabel: '2026-05-19T10:00',
      },
    ];
    const { container } = render(
      <ChartLineEvent series={[seriesA]} events={stamped} />,
    );
    const icon = container.querySelector(
      '[data-section="chart-line-event-icon"][data-event-id="ts"]',
    ) as SVGPathElement;
    fireEvent.mouseEnter(icon);
    expect(
      container.querySelector(
        '[data-section="chart-line-event-tooltip-kind"]',
      )?.textContent,
    ).toContain('2026-05-19T10:00');
  });

  it('hides event tooltip on mouseLeave', () => {
    const { container } = render(
      <ChartLineEvent series={[seriesA]} events={eventList} />,
    );
    const icon = container.querySelector(
      '[data-section="chart-line-event-icon"][data-event-id="e1"]',
    ) as SVGPathElement;
    fireEvent.mouseEnter(icon);
    expect(
      container.querySelector('[data-section="chart-line-event-tooltip"]'),
    ).not.toBeNull();
    fireEvent.mouseLeave(icon);
    expect(
      container.querySelector('[data-section="chart-line-event-tooltip"]'),
    ).toBeNull();
  });

  it('invokes onEventClick when icon is clicked', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineEvent
        series={[seriesA]}
        events={eventList}
        onEventClick={onClick}
      />,
    );
    const icon = container.querySelector(
      '[data-section="chart-line-event-icon"][data-event-id="e1"]',
    ) as SVGPathElement;
    fireEvent.click(icon);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].event.id).toBe('e1');
    expect(onClick.mock.calls[0]?.[0].event.kind).toBe('release');
  });

  it('invokes onPointClick when a dot is clicked', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineEvent
        series={[seriesA]}
        events={eventList}
        onPointClick={onClick}
      />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-event-dot"][data-point-index="2"]',
    ) as SVGCircleElement;
    fireEvent.click(dot);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].point.index).toBe(2);
  });

  it('renders the kind legend with only kinds present in the data', () => {
    const { container } = render(
      <ChartLineEvent series={[seriesA]} events={eventList} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-event-kind-legend-item"]',
    );
    expect(items).toHaveLength(3);
    const kinds = Array.from(items).map((i) =>
      i.getAttribute('data-event-kind'),
    );
    expect(kinds).toContain('release');
    expect(kinds).toContain('incident');
    expect(kinds).toContain('maintenance');
  });

  it('toggles a kind via the kind legend (uncontrolled)', () => {
    const { container } = render(
      <ChartLineEvent series={[seriesA]} events={eventList} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-event-kind-legend-button"][data-event-kind="incident"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(
      container.querySelector(
        '[data-section="chart-line-event-icon"][data-event-id="e2"]',
      ),
    ).toBeNull();
  });

  it('respects controlled hiddenKinds prop', () => {
    const { container } = render(
      <ChartLineEvent
        series={[seriesA]}
        events={eventList}
        hiddenKinds={new Set(['release'])}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-event-icon"][data-event-id="e1"]',
      ),
    ).toBeNull();
  });

  it('emits onKindToggle and onHiddenKindsChange on kind toggle', () => {
    const onToggle = vi.fn();
    const onChange = vi.fn();
    const { container } = render(
      <ChartLineEvent
        series={[seriesA]}
        events={eventList}
        onKindToggle={onToggle}
        onHiddenKindsChange={onChange}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-event-kind-legend-button"][data-event-kind="incident"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle.mock.calls[0]?.[0].kind).toBe('incident');
    expect(onToggle.mock.calls[0]?.[0].hidden).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('omits kind legend when no events present', () => {
    const { container } = render(<ChartLineEvent series={[seriesA]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-event-kind-legend"]',
      ),
    ).toBeNull();
  });

  it('toggles series via the series legend', () => {
    const { container } = render(
      <ChartLineEvent
        series={[
          seriesA,
          { id: 'b', label: 'B', data: [{ x: 0, y: 5 }] },
        ]}
        events={eventList}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-event-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(
      container.querySelectorAll('[data-section="chart-line-event-path"]'),
    ).toHaveLength(1);
  });

  it('hides series legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineEvent
        series={[seriesA]}
        events={eventList}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-event-legend"]'),
    ).toBeNull();
  });

  it('hides kind legend when showKindLegend=false', () => {
    const { container } = render(
      <ChartLineEvent
        series={[seriesA]}
        events={eventList}
        showKindLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-event-kind-legend"]',
      ),
    ).toBeNull();
  });

  it('animate flag toggles data-animate and fade-in class', () => {
    const { container } = render(
      <ChartLineEvent series={[seriesA]} events={eventList} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-event"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-animate')).toBe('true');
    expect(root.className).toContain('motion-safe:animate-fade-in');
    const { container: c2 } = render(
      <ChartLineEvent
        series={[seriesA]}
        events={eventList}
        animate={false}
      />,
    );
    const r2 = c2.querySelector(
      '[data-section="chart-line-event"]',
    ) as HTMLDivElement;
    expect(r2.getAttribute('data-animate')).toBe('false');
    expect(r2.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('forwards ref to root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(
      <ChartLineEvent ref={ref} series={[seriesA]} events={eventList} />,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-event',
    );
  });

  it('renders a stable displayName for devtools', () => {
    expect(ChartLineEvent.displayName).toBe('ChartLineEvent');
  });

  it('exposes data-visible-event-count on root', () => {
    const { container } = render(
      <ChartLineEvent
        series={[seriesA]}
        events={eventList}
        hiddenKinds={new Set(['incident'])}
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-event"]')
        ?.getAttribute('data-visible-event-count'),
    ).toBe('2');
  });

  it('skips out-of-range events from rendering', () => {
    const farEvent: ChartLineEventEvent[] = [
      { id: 'far', x: 999, title: 'Far', kind: 'info' },
      { id: 'near', x: 1, title: 'Near', kind: 'info' },
    ];
    const { container } = render(
      <ChartLineEvent
        series={[seriesA]}
        events={farEvent}
        xMin={0}
        xMax={5}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-event-icon"][data-event-id="far"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-event-icon"][data-event-id="near"]',
      ),
    ).not.toBeNull();
  });
});
