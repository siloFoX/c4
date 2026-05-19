import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartCandlestick,
  DEFAULT_CHART_CANDLESTICK_CANDLE_GAP,
  DEFAULT_CHART_CANDLESTICK_DOJI_COLOR,
  DEFAULT_CHART_CANDLESTICK_DOWN_COLOR,
  DEFAULT_CHART_CANDLESTICK_HEIGHT,
  DEFAULT_CHART_CANDLESTICK_PADDING,
  DEFAULT_CHART_CANDLESTICK_TICK_COUNT,
  DEFAULT_CHART_CANDLESTICK_UP_COLOR,
  DEFAULT_CHART_CANDLESTICK_WIDTH,
  describeCandlestickChart,
  formatCandleDate,
  getCandleColor,
  getCandlestickBounds,
  getCandlestickDirection,
  getCandlestickTicks,
} from './chart-candlestick';
import type { ChartCandlestickPoint } from './chart-candlestick';

const data: ChartCandlestickPoint[] = [
  { date: '2026-05-12', open: 100, high: 110, low: 95, close: 108 },
  { date: '2026-05-13', open: 108, high: 112, low: 102, close: 104 },
  { date: '2026-05-14', open: 104, high: 109, low: 100, close: 109, volume: 1500 },
  { date: '2026-05-15', open: 109, high: 109, low: 100, close: 109 },
];

describe('chart-candlestick pure helpers', () => {
  describe('getCandlestickBounds', () => {
    it('returns min(low), max(high) across the series', () => {
      const b = getCandlestickBounds(data);
      expect(b.min).toBe(95);
      expect(b.max).toBe(112);
    });
    it('falls back to (0,1) for empty data', () => {
      const b = getCandlestickBounds([]);
      expect(b.min).toBe(0);
      expect(b.max).toBe(1);
    });
    it('expands collapsed range', () => {
      const b = getCandlestickBounds([
        { date: 'd', open: 100, high: 100, low: 100, close: 100 },
      ]);
      expect(b.min).toBeLessThan(100);
      expect(b.max).toBeGreaterThan(100);
    });
    it('ignores non-finite candle values', () => {
      const b = getCandlestickBounds([
        { date: 'a', open: 0, high: 50, low: 10, close: 0 },
        { date: 'b', open: 0, high: Number.NaN, low: Number.NaN, close: 0 },
      ]);
      expect(b.min).toBe(10);
      expect(b.max).toBe(50);
    });
  });

  describe('getCandlestickDirection', () => {
    it('returns "up" when close > open', () => {
      expect(getCandlestickDirection(100, 110)).toBe('up');
    });
    it('returns "down" when close < open', () => {
      expect(getCandlestickDirection(110, 100)).toBe('down');
    });
    it('returns "doji" when close == open', () => {
      expect(getCandlestickDirection(100, 100)).toBe('doji');
    });
    it('returns "doji" for non-finite inputs', () => {
      expect(
        getCandlestickDirection(Number.NaN, 100),
      ).toBe('doji');
      expect(
        getCandlestickDirection(100, Number.NaN),
      ).toBe('doji');
    });
  });

  describe('getCandleColor', () => {
    it('picks up colour for up direction', () => {
      expect(getCandleColor('up', 'u', 'd', 'j')).toBe('u');
    });
    it('picks down colour for down direction', () => {
      expect(getCandleColor('down', 'u', 'd', 'j')).toBe('d');
    });
    it('picks doji colour for doji direction', () => {
      expect(getCandleColor('doji', 'u', 'd', 'j')).toBe('j');
    });
  });

  describe('getCandlestickTicks', () => {
    it('emits evenly-spaced ticks', () => {
      expect(getCandlestickTicks(0, 100, 5)).toEqual([
        0, 25, 50, 75, 100,
      ]);
    });
    it('defaults to 5 ticks', () => {
      expect(getCandlestickTicks(0, 100).length).toBe(
        DEFAULT_CHART_CANDLESTICK_TICK_COUNT,
      );
    });
    it('returns [min] when range is collapsed', () => {
      expect(getCandlestickTicks(50, 50)).toEqual([50]);
      expect(getCandlestickTicks(60, 40)).toEqual([60]);
    });
    it('clamps minimum count to 2', () => {
      expect(getCandlestickTicks(0, 100, 1)).toEqual([0, 100]);
    });
  });

  describe('formatCandleDate', () => {
    it('uses formatter when supplied', () => {
      expect(
        formatCandleDate('2026-05-12', (d) => `D:${d}`),
      ).toBe('D:2026-05-12');
    });
    it('passes through string dates without formatter', () => {
      expect(formatCandleDate('2026-05-12')).toBe(
        '2026-05-12',
      );
    });
    it('converts epoch ms to ISO date', () => {
      const epoch = Date.UTC(2026, 4, 12);
      expect(formatCandleDate(epoch)).toBe('2026-05-12');
    });
    it('falls back to string for invalid epoch numbers', () => {
      const bad = Number.NaN;
      expect(formatCandleDate(bad)).toBe('NaN');
    });
  });

  describe('describeCandlestickChart', () => {
    it('returns "No data" for empty input', () => {
      expect(describeCandlestickChart([])).toBe('No data');
    });
    it('summarises sessions + bull count + endpoints', () => {
      const text = describeCandlestickChart(data);
      expect(text).toContain('4 sessions');
      expect(text).toContain('bullish');
      expect(text).toContain('2026-05-12');
      expect(text).toContain('2026-05-15');
    });
    it('honours formatValue + formatDate', () => {
      const text = describeCandlestickChart(
        data,
        (v) => `$${v}`,
        (d) => `~${d}`,
      );
      expect(text).toContain('$100');
      expect(text).toContain('~2026-05-12');
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_CANDLESTICK_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_CANDLESTICK_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_CANDLESTICK_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_CANDLESTICK_TICK_COUNT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_CANDLESTICK_UP_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_CANDLESTICK_DOWN_COLOR).toMatch(/^#/);
    expect(DEFAULT_CHART_CANDLESTICK_DOJI_COLOR).toMatch(/^#/);
    expect(
      DEFAULT_CHART_CANDLESTICK_CANDLE_GAP,
    ).toBeGreaterThanOrEqual(0);
  });
});

describe('<ChartCandlestick />', () => {
  it('renders a region with role + aria-label', () => {
    render(<ChartCandlestick data={data} />);
    const root = screen.getByRole('region', {
      name: 'Candlestick chart',
    });
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute(
      'data-section',
      'chart-candlestick',
    );
    expect(root).toHaveAttribute('data-candle-count', '4');
  });

  it('renders a custom aria-label', () => {
    render(
      <ChartCandlestick data={data} ariaLabel="AAPL OHLC" />,
    );
    expect(
      screen.getByRole('region', { name: 'AAPL OHLC' }),
    ).toBeInTheDocument();
  });

  it('renders one candle group per point', () => {
    const { container } = render(<ChartCandlestick data={data} />);
    const candles = container.querySelectorAll(
      '[data-section="chart-candlestick-candle"]',
    );
    expect(candles.length).toBe(data.length);
  });

  it('renders body + wick per candle', () => {
    const { container } = render(<ChartCandlestick data={data} />);
    const bodies = container.querySelectorAll(
      '[data-section="chart-candlestick-body"]',
    );
    const wicks = container.querySelectorAll(
      '[data-section="chart-candlestick-wick"]',
    );
    expect(bodies.length).toBe(data.length);
    expect(wicks.length).toBe(data.length);
  });

  it('mirrors direction + colour on candle group', () => {
    const { container } = render(<ChartCandlestick data={data} />);
    const candles = container.querySelectorAll(
      '[data-section="chart-candlestick-candle"]',
    );
    // 1st candle: open=100, close=108 -> up
    expect(candles[0]?.getAttribute('data-candle-direction')).toBe(
      'up',
    );
    expect(candles[0]?.getAttribute('data-candle-color')).toBe(
      DEFAULT_CHART_CANDLESTICK_UP_COLOR,
    );
    // 2nd candle: open=108, close=104 -> down
    expect(candles[1]?.getAttribute('data-candle-direction')).toBe(
      'down',
    );
    expect(candles[1]?.getAttribute('data-candle-color')).toBe(
      DEFAULT_CHART_CANDLESTICK_DOWN_COLOR,
    );
    // 4th candle: open=close=109 -> doji
    expect(candles[3]?.getAttribute('data-candle-direction')).toBe(
      'doji',
    );
    expect(candles[3]?.getAttribute('data-candle-color')).toBe(
      DEFAULT_CHART_CANDLESTICK_DOJI_COLOR,
    );
  });

  it('renders axis ticks by default', () => {
    const { container } = render(<ChartCandlestick data={data} />);
    const ticks = container.querySelectorAll(
      '[data-section="chart-candlestick-tick"]',
    );
    expect(ticks.length).toBeGreaterThan(0);
  });

  it('suppresses ticks when showAxisTicks=false + showGrid=false', () => {
    const { container } = render(
      <ChartCandlestick
        data={data}
        showAxisTicks={false}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-candlestick-tick"]',
      ),
    ).toBeNull();
  });

  it('suppresses tick labels when showAxisTicks=false but keeps grid lines', () => {
    const { container } = render(
      <ChartCandlestick data={data} showAxisTicks={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-candlestick-tick-label"]',
      ),
    ).toBeNull();
  });

  it('shows tooltip on body hover with all four OHLC values', () => {
    const { container } = render(<ChartCandlestick data={data} />);
    const body = container.querySelector(
      '[data-section="chart-candlestick-body"]',
    );
    fireEvent.mouseEnter(body!);
    const tip = container.querySelector(
      '[data-section="chart-candlestick-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-candlestick-tooltip-date"]',
      )?.textContent,
    ).toBe('2026-05-12');
    expect(
      container.querySelector(
        '[data-section="chart-candlestick-tooltip-open"]',
      )?.textContent,
    ).toContain('100');
    expect(
      container.querySelector(
        '[data-section="chart-candlestick-tooltip-high"]',
      )?.textContent,
    ).toContain('110');
    expect(
      container.querySelector(
        '[data-section="chart-candlestick-tooltip-low"]',
      )?.textContent,
    ).toContain('95');
    expect(
      container.querySelector(
        '[data-section="chart-candlestick-tooltip-close"]',
      )?.textContent,
    ).toContain('108');
  });

  it('shows volume row in tooltip when volume is present', () => {
    const { container } = render(<ChartCandlestick data={data} />);
    const bodies = container.querySelectorAll(
      '[data-section="chart-candlestick-body"]',
    );
    fireEvent.mouseEnter(bodies[2]!);
    const vol = container.querySelector(
      '[data-section="chart-candlestick-tooltip-volume"]',
    );
    expect(vol).not.toBeNull();
    expect(vol?.textContent).toContain('1500');
  });

  it('omits volume row when volume is absent', () => {
    const { container } = render(<ChartCandlestick data={data} />);
    const body = container.querySelector(
      '[data-section="chart-candlestick-body"]',
    );
    fireEvent.mouseEnter(body!);
    expect(
      container.querySelector(
        '[data-section="chart-candlestick-tooltip-volume"]',
      ),
    ).toBeNull();
  });

  it('hides tooltip on mouse-leave', () => {
    const { container } = render(<ChartCandlestick data={data} />);
    const body = container.querySelector(
      '[data-section="chart-candlestick-body"]',
    );
    fireEvent.mouseEnter(body!);
    fireEvent.mouseLeave(body!);
    expect(
      container.querySelector(
        '[data-section="chart-candlestick-tooltip"]',
      ),
    ).toBeNull();
  });

  it('suppresses tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartCandlestick data={data} showTooltip={false} />,
    );
    const body = container.querySelector(
      '[data-section="chart-candlestick-body"]',
    );
    fireEvent.mouseEnter(body!);
    expect(
      container.querySelector(
        '[data-section="chart-candlestick-tooltip"]',
      ),
    ).toBeNull();
  });

  it('uses formatValue + formatDate', () => {
    const { container } = render(
      <ChartCandlestick
        data={data}
        formatValue={(v) => `$${v}`}
        formatDate={(d) => `~${d}`}
      />,
    );
    const body = container.querySelector(
      '[data-section="chart-candlestick-body"]',
    );
    fireEvent.mouseEnter(body!);
    expect(
      container.querySelector(
        '[data-section="chart-candlestick-tooltip-date"]',
      )?.textContent,
    ).toBe('~2026-05-12');
    expect(
      container.querySelector(
        '[data-section="chart-candlestick-tooltip-open"]',
      )?.textContent,
    ).toContain('$100');
  });

  it('honours custom colours', () => {
    const { container } = render(
      <ChartCandlestick
        data={data}
        upColor="#0000ff"
        downColor="#ffff00"
        dojiColor="#000000"
      />,
    );
    const candles = container.querySelectorAll(
      '[data-section="chart-candlestick-candle"]',
    );
    expect(candles[0]?.getAttribute('data-candle-color')).toBe(
      '#0000ff',
    );
    expect(candles[1]?.getAttribute('data-candle-color')).toBe(
      '#ffff00',
    );
    expect(candles[3]?.getAttribute('data-candle-color')).toBe(
      '#000000',
    );
  });

  it('uses wickColor when supplied', () => {
    const { container } = render(
      <ChartCandlestick data={data} wickColor="#abcdef" />,
    );
    const wick = container.querySelector(
      '[data-section="chart-candlestick-wick"]',
    );
    expect(wick?.getAttribute('stroke')).toBe('#abcdef');
  });

  it('defaults wick colour to candle colour', () => {
    const { container } = render(<ChartCandlestick data={data} />);
    const wicks = container.querySelectorAll(
      '[data-section="chart-candlestick-wick"]',
    );
    expect(wicks[0]?.getAttribute('stroke')).toBe(
      DEFAULT_CHART_CANDLESTICK_UP_COLOR,
    );
  });

  it('invokes onCandleClick with point + index + direction', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartCandlestick data={data} onCandleClick={onClick} />,
    );
    const bodies = container.querySelectorAll(
      '[data-section="chart-candlestick-body"]',
    );
    fireEvent.click(bodies[1]!);
    expect(onClick).toHaveBeenCalledTimes(1);
    const arg = onClick.mock.calls[0]?.[0];
    expect(arg?.point?.date).toBe('2026-05-13');
    expect(arg?.index).toBe(1);
    expect(arg?.direction).toBe('down');
  });

  it('exposes role=graphics-symbol + aria-label per body', () => {
    const { container } = render(<ChartCandlestick data={data} />);
    const body = container.querySelector(
      '[data-section="chart-candlestick-body"]',
    );
    expect(body?.getAttribute('role')).toBe('graphics-symbol');
    expect(body?.getAttribute('aria-label')).toContain('OHLC');
  });

  it('mirrors animate flag on the root', () => {
    const { container, rerender } = render(
      <ChartCandlestick data={data} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-candlestick"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(<ChartCandlestick data={data} animate={false} />);
    expect(
      container
        .querySelector('[data-section="chart-candlestick"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('mirrors size on the svg', () => {
    const { container } = render(
      <ChartCandlestick data={data} width={800} height={400} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-candlestick-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('800');
    expect(svg?.getAttribute('height')).toBe('400');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 800 400');
  });

  it('renders auto-generated ARIA description by default', () => {
    const { container } = render(<ChartCandlestick data={data} />);
    const desc = container.querySelector(
      '[data-section="chart-candlestick-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Candlestick chart');
    expect(desc?.textContent).toContain('4 sessions');
  });

  it('honours ariaDescription override', () => {
    const { container } = render(
      <ChartCandlestick data={data} ariaDescription="custom" />,
    );
    const desc = container.querySelector(
      '[data-section="chart-candlestick-aria-desc"]',
    );
    expect(desc?.textContent).toBe('custom');
  });

  it('handles empty data without crashing', () => {
    const { container } = render(<ChartCandlestick data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-candlestick"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-candlestick-body"]',
      ).length,
    ).toBe(0);
  });

  it('honours custom candleWidth', () => {
    const { container } = render(
      <ChartCandlestick data={data} candleWidth={20} />,
    );
    const body = container.querySelector(
      '[data-section="chart-candlestick-body"]',
    );
    expect(body?.getAttribute('width')).toBe('20');
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartCandlestick ref={ref} data={data} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-candlestick',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartCandlestick.displayName).toBe('ChartCandlestick');
  });
});
