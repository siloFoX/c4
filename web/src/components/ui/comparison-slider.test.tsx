import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  ComparisonSlider,
  DEFAULT_COMPARISON_ASPECT_RATIO,
  DEFAULT_COMPARISON_STEP,
  DEFAULT_COMPARISON_VALUE,
  clampComparisonValue,
  getPercentFromX,
  stepComparisonValue,
} from './comparison-slider';

afterEach(() => {
  cleanup();
});

const FAKE_BEFORE = 'data:image/svg+xml,<svg/>';
const FAKE_AFTER = 'data:image/svg+xml,<svg/>';

describe('clampComparisonValue', () => {
  it('clamps below 0', () => {
    expect(clampComparisonValue(-10)).toBe(0);
  });
  it('clamps above 100', () => {
    expect(clampComparisonValue(150)).toBe(100);
  });
  it('passes through 0..100', () => {
    expect(clampComparisonValue(50)).toBe(50);
  });
  it('NaN falls back to default 50', () => {
    expect(clampComparisonValue(Number.NaN)).toBe(50);
  });
  it('non-finite falls back to default', () => {
    expect(
      clampComparisonValue(Number.POSITIVE_INFINITY),
    ).toBe(50);
  });
});

describe('getPercentFromX', () => {
  it('returns 0 for x = rect.left', () => {
    expect(getPercentFromX(0, { left: 0, width: 100 })).toBe(0);
  });
  it('returns 100 for x = rect.right', () => {
    expect(getPercentFromX(100, { left: 0, width: 100 })).toBe(100);
  });
  it('returns 50 for x = rect.midpoint', () => {
    expect(getPercentFromX(50, { left: 0, width: 100 })).toBe(50);
  });
  it('clamps x outside the rect bounds', () => {
    expect(getPercentFromX(-10, { left: 0, width: 100 })).toBe(0);
    expect(getPercentFromX(150, { left: 0, width: 100 })).toBe(100);
  });
  it('returns 0 for zero-width rect', () => {
    expect(getPercentFromX(10, { left: 0, width: 0 })).toBe(0);
  });
  it('accounts for non-zero rect.left', () => {
    expect(getPercentFromX(150, { left: 100, width: 100 })).toBe(50);
  });
});

describe('stepComparisonValue', () => {
  it('clamps after adding delta', () => {
    expect(stepComparisonValue(95, 10)).toBe(100);
  });
  it('clamps after subtracting delta', () => {
    expect(stepComparisonValue(5, -10)).toBe(0);
  });
  it('respects mid-range values', () => {
    expect(stepComparisonValue(50, 5)).toBe(55);
  });
});

describe('Constants', () => {
  it('exposes DEFAULT_COMPARISON_VALUE = 50', () => {
    expect(DEFAULT_COMPARISON_VALUE).toBe(50);
  });
  it('exposes DEFAULT_COMPARISON_STEP = 5', () => {
    expect(DEFAULT_COMPARISON_STEP).toBe(5);
  });
  it('exposes a 16/9 aspect ratio default', () => {
    expect(DEFAULT_COMPARISON_ASPECT_RATIO).toBe('16 / 9');
  });
});

describe('ComparisonSlider component', () => {
  it('renders a region with the default aria-label', () => {
    render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
      />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Comparison slider',
    );
  });

  it('honors a custom ariaLabel', () => {
    render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        ariaLabel="Photo retouch comparison"
      />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Photo retouch comparison',
    );
  });

  it('renders a handle slider with aria-valuemin/max/now', () => {
    render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        defaultValue={30}
      />,
    );
    const handle = screen.getByRole('slider');
    expect(handle).toHaveAttribute('aria-valuemin', '0');
    expect(handle).toHaveAttribute('aria-valuemax', '100');
    expect(handle).toHaveAttribute('aria-valuenow', '30');
    expect(handle).toHaveAttribute('aria-orientation', 'horizontal');
  });

  it('renders both before and after images with alt text', () => {
    render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        beforeAlt="Original photo"
        afterAlt="Retouched photo"
      />,
    );
    expect(screen.getByAltText('Original photo')).toBeInTheDocument();
    expect(screen.getByAltText('Retouched photo')).toBeInTheDocument();
  });

  it('uses loading="lazy" on images by default', () => {
    render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        beforeAlt="b"
        afterAlt="a"
      />,
    );
    expect(screen.getByAltText('b')).toHaveAttribute(
      'loading',
      'lazy',
    );
    expect(screen.getByAltText('a')).toHaveAttribute(
      'loading',
      'lazy',
    );
  });

  it('lazy=false swaps to loading="eager"', () => {
    render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        beforeAlt="b"
        afterAlt="a"
        lazy={false}
      />,
    );
    expect(screen.getByAltText('b')).toHaveAttribute(
      'loading',
      'eager',
    );
    expect(screen.getByAltText('a')).toHaveAttribute(
      'loading',
      'eager',
    );
  });

  it('default value is 50 (middle)', () => {
    render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
      />,
    );
    expect(screen.getByRole('slider')).toHaveAttribute(
      'aria-valuenow',
      '50',
    );
  });

  it('defaultValue prop seeds the uncontrolled value', () => {
    render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        defaultValue={25}
      />,
    );
    expect(screen.getByRole('slider')).toHaveAttribute(
      'aria-valuenow',
      '25',
    );
  });

  it('controlled value overrides internal state', () => {
    const { rerender } = render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        value={20}
      />,
    );
    expect(screen.getByRole('slider')).toHaveAttribute(
      'aria-valuenow',
      '20',
    );
    rerender(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        value={75}
      />,
    );
    expect(screen.getByRole('slider')).toHaveAttribute(
      'aria-valuenow',
      '75',
    );
  });

  it('ArrowRight advances by step', () => {
    const onChange = vi.fn();
    render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        defaultValue={50}
        onChange={onChange}
        step={10}
      />,
    );
    fireEvent.keyDown(screen.getByRole('slider'), {
      key: 'ArrowRight',
    });
    expect(onChange).toHaveBeenCalledWith(60);
  });

  it('ArrowLeft retreats by step', () => {
    const onChange = vi.fn();
    render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        defaultValue={50}
        onChange={onChange}
        step={5}
      />,
    );
    fireEvent.keyDown(screen.getByRole('slider'), {
      key: 'ArrowLeft',
    });
    expect(onChange).toHaveBeenCalledWith(45);
  });

  it('ArrowUp advances by step (matches ArrowRight)', () => {
    const onChange = vi.fn();
    render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        defaultValue={50}
        onChange={onChange}
        step={3}
      />,
    );
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith(53);
  });

  it('ArrowDown retreats by step (matches ArrowLeft)', () => {
    const onChange = vi.fn();
    render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        defaultValue={50}
        onChange={onChange}
        step={3}
      />,
    );
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith(47);
  });

  it('PageUp jumps by 2x step', () => {
    const onChange = vi.fn();
    render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        defaultValue={50}
        onChange={onChange}
        step={10}
      />,
    );
    fireEvent.keyDown(screen.getByRole('slider'), {
      key: 'PageUp',
    });
    expect(onChange).toHaveBeenLastCalledWith(70);
  });

  it('PageDown jumps by -2x step', () => {
    const onChange = vi.fn();
    render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        defaultValue={50}
        onChange={onChange}
        step={10}
      />,
    );
    fireEvent.keyDown(screen.getByRole('slider'), {
      key: 'PageDown',
    });
    expect(onChange).toHaveBeenLastCalledWith(30);
  });

  it('Home jumps to 0', () => {
    const onChange = vi.fn();
    render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        defaultValue={42}
        onChange={onChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'Home' });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('End jumps to 100', () => {
    const onChange = vi.fn();
    render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        defaultValue={42}
        onChange={onChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' });
    expect(onChange).toHaveBeenCalledWith(100);
  });

  it('ArrowRight at 95 with step 10 clamps to 100', () => {
    const onChange = vi.fn();
    render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        defaultValue={95}
        onChange={onChange}
        step={10}
      />,
    );
    fireEvent.keyDown(screen.getByRole('slider'), {
      key: 'ArrowRight',
    });
    expect(onChange).toHaveBeenCalledWith(100);
  });

  it('pointerdown updates the value from clientX', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        defaultValue={0}
        onChange={onChange}
      />,
    );
    const region = container.querySelector(
      '[data-section="comparison-slider"]',
    ) as HTMLElement;
    Object.defineProperty(region, 'getBoundingClientRect', {
      configurable: true,
      value: () =>
        ({
          left: 0,
          top: 0,
          right: 100,
          bottom: 100,
          width: 100,
          height: 100,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    });
    fireEvent.pointerDown(region, {
      pointerId: 1,
      clientX: 25,
    });
    expect(onChange).toHaveBeenCalledWith(25);
  });

  it('pointermove without pointerdown does NOT update', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        onChange={onChange}
      />,
    );
    const region = container.querySelector(
      '[data-section="comparison-slider"]',
    ) as HTMLElement;
    fireEvent.pointerMove(region, {
      pointerId: 1,
      clientX: 50,
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('percentage badge renders by default with formatted value', () => {
    render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        defaultValue={33}
      />,
    );
    const badge = screen.getByText('33%');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute(
      'data-section',
      'comparison-slider-percentage',
    );
  });

  it('showPercentage=false hides the badge', () => {
    const { container } = render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        showPercentage={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="comparison-slider-percentage"]',
      ),
    ).toBeNull();
  });

  it('formatValue overrides the badge contents', () => {
    render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        defaultValue={42}
        formatValue={(v) => `Reveal ${v}/100`}
      />,
    );
    expect(screen.getByText('Reveal 42/100')).toBeInTheDocument();
  });

  it('beforeLabel + afterLabel slots render when supplied', () => {
    render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        beforeLabel="Original"
        afterLabel="Edited"
      />,
    );
    expect(screen.getByText('Original')).toBeInTheDocument();
    expect(screen.getByText('Edited')).toBeInTheDocument();
  });

  it('after-clip width matches the value (style)', () => {
    const { container } = render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        defaultValue={37}
      />,
    );
    const clip = container.querySelector(
      '[data-section="comparison-slider-after-clip"]',
    ) as HTMLElement;
    expect(clip.style.width).toBe('37%');
  });

  it('handle left offset matches the value (style)', () => {
    const { container } = render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        defaultValue={37}
      />,
    );
    const handle = container.querySelector(
      '[data-section="comparison-slider-handle"]',
    ) as HTMLElement;
    expect(handle.style.left).toBe('37%');
  });

  it('root data attrs mirror the props', () => {
    render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        defaultValue={40}
        showPercentage={false}
        lazy={false}
      />,
    );
    const root = screen.getByRole('region');
    expect(root).toHaveAttribute('data-value', '40');
    expect(root).toHaveAttribute('data-show-percentage', 'false');
    expect(root).toHaveAttribute('data-lazy', 'false');
  });

  it('aspectRatio prop sets inline style', () => {
    const { container } = render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        aspectRatio="4 / 3"
      />,
    );
    const root = container.querySelector(
      '[data-section="comparison-slider"]',
    ) as HTMLElement;
    expect(root.style.aspectRatio).toBe('4 / 3');
  });

  it('aria-valuetext on handle mirrors the percentage', () => {
    render(
      <ComparisonSlider
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
        defaultValue={80}
      />,
    );
    expect(screen.getByRole('slider')).toHaveAttribute(
      'aria-valuetext',
      '80%',
    );
  });

  it('exposes a stable displayName', () => {
    expect(ComparisonSlider.displayName).toBe('ComparisonSlider');
  });

  it('forwards refs to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ComparisonSlider
        ref={ref}
        beforeSrc={FAKE_BEFORE}
        afterSrc={FAKE_AFTER}
      />,
    );
    expect(ref.current?.getAttribute('role')).toBe('region');
  });
});
