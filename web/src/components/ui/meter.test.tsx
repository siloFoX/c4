import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  Meter,
  buildMeterStops,
  findMeterSegment,
} from './meter';

afterEach(() => {
  cleanup();
});

describe('findMeterSegment', () => {
  const segs = [
    { from: 0, to: 30, color: 'green', label: 'low' },
    { from: 30, to: 70, color: 'orange', label: 'mid' },
    { from: 70, to: 100, color: 'red', label: 'high' },
  ];

  it('returns null for undefined / empty segments', () => {
    expect(findMeterSegment(50, undefined)).toBeNull();
    expect(findMeterSegment(50, [])).toBeNull();
  });

  it('returns the matching segment', () => {
    expect(findMeterSegment(20, segs)?.label).toBe('low');
    expect(findMeterSegment(50, segs)?.label).toBe('mid');
    expect(findMeterSegment(85, segs)?.label).toBe('high');
  });

  it('matches inclusive boundaries on the lower end', () => {
    expect(findMeterSegment(0, segs)?.label).toBe('low');
  });
});

describe('buildMeterStops', () => {
  it('returns fallback for no segments', () => {
    expect(buildMeterStops(undefined, 0, 100, 'fallback')).toBe(
      'fallback',
    );
    expect(buildMeterStops([], 0, 100, 'fallback')).toBe(
      'fallback',
    );
  });

  it('returns a CSS stops list', () => {
    const stops = buildMeterStops(
      [
        { from: 0, to: 50, color: 'green' },
        { from: 50, to: 100, color: 'red' },
      ],
      0,
      100,
      '#ccc',
    );
    expect(stops).toContain('green 0.00%');
    expect(stops).toContain('green 50.00%');
    expect(stops).toContain('red 50.00%');
    expect(stops).toContain('red 100.00%');
  });

  it('uses fallback color for segments without color', () => {
    const stops = buildMeterStops(
      [{ from: 0, to: 100 }],
      0,
      100,
      '#777',
    );
    expect(stops).toContain('#777 0.00%');
    expect(stops).toContain('#777 100.00%');
  });

  it('returns fallback when range collapses', () => {
    expect(
      buildMeterStops(
        [{ from: 0, to: 50, color: 'green' }],
        10,
        5,
        'fallback',
      ),
    ).toBe('fallback');
  });
});

describe('Meter component', () => {
  it('renders role=progressbar with default aria-label', () => {
    render(<Meter value={50} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-label',
      'Meter',
    );
  });

  it('honors a custom ariaLabel', () => {
    render(<Meter value={50} ariaLabel="Disk usage" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-label',
      'Disk usage',
    );
  });

  it('aria-valuemin / aria-valuemax / aria-valuenow reflect props', () => {
    render(<Meter value={120} min={0} max={200} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '200');
    expect(bar).toHaveAttribute('aria-valuenow', '120');
  });

  it('clamps the value to [min, max]', () => {
    render(<Meter value={-10} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
    cleanup();
    render(<Meter value={1000} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
  });

  it('exposes data attrs (orientation, size, value, fraction)', () => {
    render(
      <Meter
        value={25}
        size="lg"
        orientation="vertical"
      />,
    );
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('data-orientation', 'vertical');
    expect(bar).toHaveAttribute('data-size', 'lg');
    expect(bar).toHaveAttribute('data-value', '25');
    expect(bar).toHaveAttribute('data-fraction', '0.25');
  });

  it('renders a track + indicator', () => {
    const { container } = render(<Meter value={50} />);
    expect(
      container.querySelector('[data-section="meter-track"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="meter-indicator"]'),
    ).toBeInTheDocument();
  });

  it('indicator width is value/max for horizontal', () => {
    const { container } = render(<Meter value={50} />);
    const indicator = container.querySelector(
      '[data-section="meter-indicator"]',
    ) as HTMLElement;
    expect(indicator.style.width).toBe('50%');
  });

  it('indicator height is value/max for vertical', () => {
    const { container } = render(
      <Meter value={50} orientation="vertical" />,
    );
    const indicator = container.querySelector(
      '[data-section="meter-indicator"]',
    ) as HTMLElement;
    expect(indicator.style.height).toBe('50%');
  });

  it('segments drive the active fill color', () => {
    const { container } = render(
      <Meter
        value={85}
        segments={[
          { from: 0, to: 50, color: 'green' },
          { from: 50, to: 80, color: 'orange' },
          { from: 80, to: 100, color: 'red' },
        ]}
      />,
    );
    const indicator = container.querySelector(
      '[data-section="meter-indicator"]',
    );
    expect(indicator).toHaveAttribute('data-fill-color', 'red');
  });

  it('fillColor prop wins when no segment matches', () => {
    const { container } = render(
      <Meter
        value={120}
        max={200}
        segments={[{ from: 0, to: 50, color: 'green' }]}
        fillColor="purple"
      />,
    );
    const indicator = container.querySelector(
      '[data-section="meter-indicator"]',
    );
    expect(indicator).toHaveAttribute('data-fill-color', 'purple');
  });

  it('aria-orientation reflects the orientation prop', () => {
    render(<Meter value={50} orientation="vertical" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-orientation',
      'vertical',
    );
  });

  it('showValue renders the value badge', () => {
    render(<Meter value={42} showValue />);
    expect(
      screen.getByText('42', {
        selector: '[data-section="meter-value"]',
      }),
    ).toBeInTheDocument();
  });

  it('hides value badge by default', () => {
    const { container } = render(<Meter value={42} />);
    expect(
      container.querySelector('[data-section="meter-value"]'),
    ).toBeNull();
  });

  it('formatValue replaces the rendered value', () => {
    render(
      <Meter
        value={42}
        showValue
        formatValue={(v) => `${v}%`}
      />,
    );
    expect(
      screen.getByText('42%', {
        selector: '[data-section="meter-value"]',
      }),
    ).toBeInTheDocument();
  });

  it('aria-valuetext mirrors the formatted value', () => {
    render(
      <Meter value={42} formatValue={() => 'High'} />,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      'High',
    );
  });

  it('data-segment reflects matching segment label', () => {
    render(
      <Meter
        value={20}
        segments={[
          { from: 0, to: 30, color: 'green', label: 'low' },
          { from: 30, to: 100, color: 'red', label: 'high' },
        ]}
      />,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'data-segment',
      'low',
    );
  });

  it('track background uses gradient when segments supplied', () => {
    const { container } = render(
      <Meter
        value={50}
        segments={[
          { from: 0, to: 50, color: 'green' },
          { from: 50, to: 100, color: 'red' },
        ]}
      />,
    );
    const track = container.querySelector(
      '[data-section="meter-track"]',
    ) as HTMLElement;
    expect(track.style.background).toContain('linear-gradient');
  });

  it('track background uses solid color when no segments', () => {
    const { container } = render(<Meter value={50} />);
    const track = container.querySelector(
      '[data-section="meter-track"]',
    ) as HTMLElement;
    expect(track.style.background).not.toContain('linear-gradient');
  });

  it('falls back when max <= min (zero range)', () => {
    render(<Meter value={5} min={10} max={5} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuemin',
      '10',
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuemax',
      '110',
    );
  });

  it('exposes a stable displayName', () => {
    expect(Meter.displayName).toBe('Meter');
  });

  it('forwards refs to the root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Meter ref={ref} value={50} />);
    expect(ref.current?.getAttribute('role')).toBe('progressbar');
  });
});
