import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Slider, RangeSlider, clampToStep, sliderFormatters } from './slider';

describe('clampToStep()', () => {
  it('clamps below min to min', () => {
    expect(clampToStep(-5, 0, 100, 1)).toBe(0);
  });

  it('clamps above max to max', () => {
    expect(clampToStep(150, 0, 100, 1)).toBe(100);
  });

  it('snaps to the nearest step anchored at min', () => {
    expect(clampToStep(7, 0, 100, 5)).toBe(5);
    expect(clampToStep(8, 0, 100, 5)).toBe(10);
  });

  it('preserves the exact value when already aligned', () => {
    expect(clampToStep(20, 0, 100, 5)).toBe(20);
  });

  it('respects a non-zero min anchor', () => {
    expect(clampToStep(7, 1, 100, 2)).toBe(7);
    expect(clampToStep(8, 1, 100, 2)).toBe(9);
  });

  it('returns min for NaN', () => {
    expect(clampToStep(NaN, 0, 100, 1)).toBe(0);
  });

  it('does not snap when step <= 0', () => {
    expect(clampToStep(7.5, 0, 100, 0)).toBe(7.5);
    expect(clampToStep(7.5, 0, 100, -1)).toBe(7.5);
  });
});

describe('<Slider>', () => {
  it('renders a role=slider thumb with valuemin/valuemax/valuenow', () => {
    render(<Slider value={42} onChange={() => {}} aria-label="Volume" />);
    const thumb = screen.getByRole('slider');
    expect(thumb.getAttribute('aria-valuemin')).toBe('0');
    expect(thumb.getAttribute('aria-valuemax')).toBe('100');
    expect(thumb.getAttribute('aria-valuenow')).toBe('42');
  });

  it('aria-orientation defaults to horizontal', () => {
    render(<Slider value={50} onChange={() => {}} />);
    expect(
      screen.getByRole('slider').getAttribute('aria-orientation'),
    ).toBe('horizontal');
  });

  it('snaps the rendered valuenow to the nearest step', () => {
    render(<Slider value={7} step={5} onChange={() => {}} />);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe(
      '5',
    );
  });

  it('positions the thumb at the value percentage of the range', () => {
    const { container } = render(<Slider value={25} onChange={() => {}} />);
    const thumb = container.querySelector(
      '[data-section="slider-thumb"]',
    ) as HTMLElement;
    expect(thumb.style.left).toBe('25%');
  });

  it('positions the filled track from 0 to the value percentage', () => {
    const { container } = render(<Slider value={75} onChange={() => {}} />);
    const filled = container.querySelector(
      '[data-section="slider-track-filled"]',
    ) as HTMLElement;
    expect(filled.style.width).toBe('75%');
  });

  it('ArrowRight increments by step + fires onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Slider value={50} onChange={onChange} step={2} aria-label="V" />,
    );
    screen.getByRole('slider').focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith(52);
  });

  it('ArrowLeft decrements by step + fires onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Slider value={50} onChange={onChange} step={2} aria-label="V" />,
    );
    screen.getByRole('slider').focus();
    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenCalledWith(48);
  });

  it('ArrowUp increments same as ArrowRight (horizontal pattern)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Slider value={10} onChange={onChange} aria-label="V" />);
    screen.getByRole('slider').focus();
    await user.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenCalledWith(11);
  });

  it('PageUp increments by 10% of range when pageStep is unset', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Slider value={50} onChange={onChange} aria-label="V" />);
    screen.getByRole('slider').focus();
    await user.keyboard('{PageUp}');
    // (100 - 0) / 10 = 10
    expect(onChange).toHaveBeenCalledWith(60);
  });

  it('PageDown decrements by the page step', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Slider value={50} onChange={onChange} pageStep={20} aria-label="V" />,
    );
    screen.getByRole('slider').focus();
    await user.keyboard('{PageDown}');
    expect(onChange).toHaveBeenCalledWith(30);
  });

  it('Home jumps to min', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Slider value={50} min={10} onChange={onChange} aria-label="V" />,
    );
    screen.getByRole('slider').focus();
    await user.keyboard('{Home}');
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it('End jumps to max', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Slider value={50} max={80} onChange={onChange} aria-label="V" />,
    );
    screen.getByRole('slider').focus();
    await user.keyboard('{End}');
    expect(onChange).toHaveBeenCalledWith(80);
  });

  it('clamps onChange to max when stepping past it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    // value=95 with step=5 stays at 95 (95 snaps to itself).
    // ArrowRight raw -> 100 (snaps to max).
    render(
      <Slider value={95} max={100} onChange={onChange} step={5} aria-label="V" />,
    );
    screen.getByRole('slider').focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith(100);
  });

  it('uncontrolled defaultValue seeds the initial value', () => {
    render(<Slider defaultValue={30} aria-label="V" />);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe(
      '30',
    );
  });

  it('uncontrolled keyboard nav updates internal state', async () => {
    const user = userEvent.setup();
    render(<Slider defaultValue={40} aria-label="V" />);
    const thumb = screen.getByRole('slider');
    thumb.focus();
    await user.keyboard('{ArrowRight}');
    expect(thumb.getAttribute('aria-valuenow')).toBe('41');
  });

  it('uncontrolled onChange still fires when supplied', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Slider defaultValue={40} onChange={onChange} aria-label="V" />);
    screen.getByRole('slider').focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith(41);
  });

  it('controlled: parent value wins over defaultValue', () => {
    render(
      <Slider value={70} defaultValue={20} onChange={() => {}} aria-label="V" />,
    );
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe(
      '70',
    );
  });

  it('disabled: tabindex is -1 and keyboard is a no-op', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Slider value={50} onChange={onChange} disabled aria-label="V" />,
    );
    const thumb = screen.getByRole('slider');
    expect(thumb.getAttribute('tabindex')).toBe('-1');
    thumb.focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('aria-valuetext uses formatValue when supplied', () => {
    render(
      <Slider
        value={42}
        onChange={() => {}}
        formatValue={(v) => `${v}%`}
        aria-label="V"
      />,
    );
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe(
      '42%',
    );
  });

  it('renders the tooltip with the formatted value', () => {
    render(
      <Slider
        value={42}
        onChange={() => {}}
        formatValue={sliderFormatters.withPercent}
      />,
    );
    const tooltip = document.querySelector(
      '[data-section="slider-tooltip"]',
    );
    expect(tooltip).toHaveTextContent('42%');
  });

  it('showTooltip=false omits the tooltip', () => {
    render(<Slider value={42} onChange={() => {}} showTooltip={false} />);
    expect(
      document.querySelector('[data-section="slider-tooltip"]'),
    ).toBeNull();
  });

  it('does not refire onChange when the snapped value equals the current value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Slider value={100} max={100} onChange={onChange} aria-label="V" />,
    );
    screen.getByRole('slider').focus();
    await user.keyboard('{ArrowRight}'); // already at max
    expect(onChange).not.toHaveBeenCalled();
  });

  it('exposes a stable displayName', () => {
    expect(Slider.displayName).toBe('Slider');
  });
});

// ----- RangeSlider -----------------------------------------

describe('<RangeSlider>', () => {
  it('renders two role=slider thumbs (low + high)', () => {
    render(
      <RangeSlider
        values={[20, 80]}
        onChange={() => {}}
        ariaLabelLow="Low"
        ariaLabelHigh="High"
      />,
    );
    expect(screen.getAllByRole('slider')).toHaveLength(2);
  });

  it('low thumb exposes aria-valuemin=min and aria-valuemax=high', () => {
    render(<RangeSlider values={[20, 80]} onChange={() => {}} />);
    const low = document.querySelector(
      '[data-section="range-slider-thumb-low"]',
    ) as HTMLElement;
    expect(low.getAttribute('aria-valuemin')).toBe('0');
    expect(low.getAttribute('aria-valuemax')).toBe('80');
    expect(low.getAttribute('aria-valuenow')).toBe('20');
  });

  it('high thumb exposes aria-valuemin=low and aria-valuemax=max', () => {
    render(<RangeSlider values={[20, 80]} onChange={() => {}} />);
    const high = document.querySelector(
      '[data-section="range-slider-thumb-high"]',
    ) as HTMLElement;
    expect(high.getAttribute('aria-valuemin')).toBe('20');
    expect(high.getAttribute('aria-valuemax')).toBe('100');
    expect(high.getAttribute('aria-valuenow')).toBe('80');
  });

  it('filled track spans the inclusive range', () => {
    const { container } = render(
      <RangeSlider values={[20, 80]} onChange={() => {}} />,
    );
    const filled = container.querySelector(
      '[data-section="range-slider-track-filled"]',
    ) as HTMLElement;
    expect(filled.style.left).toBe('20%');
    expect(filled.style.width).toBe('60%');
  });

  it('ArrowRight on low thumb increases the low bound', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RangeSlider values={[20, 80]} onChange={onChange} />);
    const low = document.querySelector(
      '[data-section="range-slider-thumb-low"]',
    ) as HTMLElement;
    low.focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith([21, 80]);
  });

  it('ArrowLeft on high thumb decreases the high bound', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RangeSlider values={[20, 80]} onChange={onChange} />);
    const high = document.querySelector(
      '[data-section="range-slider-thumb-high"]',
    ) as HTMLElement;
    high.focus();
    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenCalledWith([20, 79]);
  });

  it('low thumb cannot cross above the high thumb', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RangeSlider values={[50, 50]} onChange={onChange} />);
    const low = document.querySelector(
      '[data-section="range-slider-thumb-low"]',
    ) as HTMLElement;
    low.focus();
    await user.keyboard('{ArrowRight}'); // would push to 51
    // commit clamps low to min(51, hi=50) = 50, so no change.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('high thumb cannot cross below the low thumb', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RangeSlider values={[50, 50]} onChange={onChange} />);
    const high = document.querySelector(
      '[data-section="range-slider-thumb-high"]',
    ) as HTMLElement;
    high.focus();
    await user.keyboard('{ArrowLeft}'); // would push to 49
    expect(onChange).not.toHaveBeenCalled();
  });

  it('PageUp on low jumps by 10% of range', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RangeSlider values={[10, 80]} onChange={onChange} />);
    const low = document.querySelector(
      '[data-section="range-slider-thumb-low"]',
    ) as HTMLElement;
    low.focus();
    await user.keyboard('{PageUp}');
    expect(onChange).toHaveBeenCalledWith([20, 80]);
  });

  it('Home on low jumps to min', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RangeSlider values={[40, 60]} min={5} onChange={onChange} />,
    );
    const low = document.querySelector(
      '[data-section="range-slider-thumb-low"]',
    ) as HTMLElement;
    low.focus();
    await user.keyboard('{Home}');
    expect(onChange).toHaveBeenCalledWith([5, 60]);
  });

  it('End on high jumps to max', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RangeSlider values={[40, 60]} max={90} onChange={onChange} />,
    );
    const high = document.querySelector(
      '[data-section="range-slider-thumb-high"]',
    ) as HTMLElement;
    high.focus();
    await user.keyboard('{End}');
    expect(onChange).toHaveBeenCalledWith([40, 90]);
  });

  it('uncontrolled defaultValues seeds the initial range', () => {
    render(<RangeSlider defaultValues={[30, 70]} />);
    const low = document.querySelector(
      '[data-section="range-slider-thumb-low"]',
    ) as HTMLElement;
    const high = document.querySelector(
      '[data-section="range-slider-thumb-high"]',
    ) as HTMLElement;
    expect(low.getAttribute('aria-valuenow')).toBe('30');
    expect(high.getAttribute('aria-valuenow')).toBe('70');
  });

  it('uncontrolled keyboard nav updates internal state', async () => {
    const user = userEvent.setup();
    render(<RangeSlider defaultValues={[40, 60]} />);
    const high = document.querySelector(
      '[data-section="range-slider-thumb-high"]',
    ) as HTMLElement;
    high.focus();
    await user.keyboard('{ArrowRight}');
    expect(high.getAttribute('aria-valuenow')).toBe('61');
  });

  it('disabled: both thumbs have tabindex=-1', () => {
    render(<RangeSlider values={[20, 80]} disabled />);
    document
      .querySelectorAll('[role="slider"]')
      .forEach((el) => expect(el.getAttribute('tabindex')).toBe('-1'));
  });

  it('renders a tooltip per thumb when showTooltip is on', () => {
    render(<RangeSlider values={[20, 80]} onChange={() => {}} />);
    expect(
      document.querySelector('[data-section="range-slider-tooltip-low"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section="range-slider-tooltip-high"]'),
    ).not.toBeNull();
  });

  it('formatValue feeds both tooltips and aria-valuetext', () => {
    render(
      <RangeSlider
        values={[25, 75]}
        onChange={() => {}}
        formatValue={(v) => `${v}%`}
      />,
    );
    const low = document.querySelector(
      '[data-section="range-slider-thumb-low"]',
    ) as HTMLElement;
    const high = document.querySelector(
      '[data-section="range-slider-thumb-high"]',
    ) as HTMLElement;
    expect(low.getAttribute('aria-valuetext')).toBe('25%');
    expect(high.getAttribute('aria-valuetext')).toBe('75%');
    expect(
      document.querySelector('[data-section="range-slider-tooltip-low"]')!
        .textContent,
    ).toBe('25%');
  });

  it('aria-label defaults to "Minimum" / "Maximum" when not provided', () => {
    render(<RangeSlider values={[20, 80]} onChange={() => {}} />);
    const low = document.querySelector(
      '[data-section="range-slider-thumb-low"]',
    ) as HTMLElement;
    const high = document.querySelector(
      '[data-section="range-slider-thumb-high"]',
    ) as HTMLElement;
    expect(low.getAttribute('aria-label')).toBe('Minimum');
    expect(high.getAttribute('aria-label')).toBe('Maximum');
  });

  it('snaps the rendered valuenow to the nearest step', () => {
    render(<RangeSlider values={[7, 33]} step={5} />);
    const low = document.querySelector(
      '[data-section="range-slider-thumb-low"]',
    ) as HTMLElement;
    const high = document.querySelector(
      '[data-section="range-slider-thumb-high"]',
    ) as HTMLElement;
    expect(low.getAttribute('aria-valuenow')).toBe('5');
    expect(high.getAttribute('aria-valuenow')).toBe('35');
  });

  it('exposes a stable displayName', () => {
    expect(RangeSlider.displayName).toBe('RangeSlider');
  });
});

describe('sliderFormatters', () => {
  it('withPercent appends "%"', () => {
    expect(sliderFormatters.withPercent(42)).toBe('42%');
  });

  it('fixed1 produces a single fractional digit', () => {
    expect(sliderFormatters.fixed1(3.14)).toBe('3.1');
  });

  it('fixed2 produces two fractional digits', () => {
    expect(sliderFormatters.fixed2(3.141)).toBe('3.14');
  });

  it('none stringifies the number', () => {
    expect(sliderFormatters.none(42)).toBe('42');
  });
});
