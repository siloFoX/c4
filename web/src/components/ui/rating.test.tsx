import { describe, it, expect, vi } from 'vitest';
import { useState, createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Rating,
  clampRating,
  getRatingAriaChecked,
  getRatingStarFillPercent,
} from './rating';

describe('<Rating>', () => {
  it('renders 5 stars by default', () => {
    render(<Rating value={0} onChange={() => {}} />);
    expect(
      screen.getAllByRole('button').filter((b) =>
        b.hasAttribute('data-rating-star'),
      ).length,
    ).toBe(5);
  });

  it('max=10 renders 10 stars', () => {
    render(<Rating value={0} max={10} onChange={() => {}} />);
    expect(
      screen.getAllByRole('button').filter((b) =>
        b.hasAttribute('data-rating-star'),
      ).length,
    ).toBe(10);
  });

  it('value=3 shows the first 3 overlays at 100% width', () => {
    const { container } = render(
      <Rating value={3} onChange={() => {}} allowHalf={false} />,
    );
    const overlays = container.querySelectorAll(
      '[data-rating-star] > span > span',
    );
    const widths = Array.from(overlays).map(
      (n) => (n as HTMLElement).style.width,
    );
    expect(widths).toEqual(['100%', '100%', '100%', '0%', '0%']);
  });

  it('value=3.5 with allowHalf shows half overlay on the 4th star', () => {
    const { container } = render(<Rating value={3.5} onChange={() => {}} />);
    const overlays = container.querySelectorAll(
      '[data-rating-star] > span > span',
    );
    const widths = Array.from(overlays).map(
      (n) => (n as HTMLElement).style.width,
    );
    expect(widths[3]).toBe('50%');
    expect(widths[0]).toBe('100%');
    expect(widths[4]).toBe('0%');
  });

  it('readonly hides buttons and sets aria-readonly on the slider', () => {
    render(<Rating value={3} readonly />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-readonly', 'true');
  });

  it('readonly inferred when onChange is omitted', () => {
    render(<Rating value={3} />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-readonly', 'true');
  });

  it('click on 3rd star with allowHalf=false fires onChange(3)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Rating value={0} onChange={onChange} allowHalf={false} />);
    const stars = screen
      .getAllByRole('button')
      .filter((b) => b.hasAttribute('data-rating-star'));
    await user.click(stars[2]!);
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('click on left half of 3rd star with allowHalf fires onChange(2.5)', () => {
    const onChange = vi.fn();
    render(<Rating value={0} onChange={onChange} allowHalf />);
    const star = screen
      .getAllByRole('button')
      .filter((b) => b.hasAttribute('data-rating-star'))[2]!;
    const rect = { left: 100, width: 20, top: 0 } as DOMRect;
    star.getBoundingClientRect = () => rect as DOMRect;
    fireEvent.click(star, { clientX: 102 });
    expect(onChange).toHaveBeenCalledWith(2.5);
  });

  it('ArrowRight increments value (controlled)', async () => {
    const user = userEvent.setup();
    const Wrapper = () => {
      const [v, setV] = useState(2);
      return <Rating value={v} onChange={setV} allowHalf />;
    };
    render(<Wrapper />);
    const slider = screen.getByRole('slider');
    slider.focus();
    await user.keyboard('{ArrowRight}');
    expect(slider).toHaveAttribute('aria-valuenow', '2.5');
  });

  it('ArrowLeft decrements value', async () => {
    const user = userEvent.setup();
    const Wrapper = () => {
      const [v, setV] = useState(3);
      return <Rating value={v} onChange={setV} allowHalf />;
    };
    render(<Wrapper />);
    const slider = screen.getByRole('slider');
    slider.focus();
    await user.keyboard('{ArrowLeft}');
    expect(slider).toHaveAttribute('aria-valuenow', '2.5');
  });

  it('Home sets value to 0', async () => {
    const user = userEvent.setup();
    const Wrapper = () => {
      const [v, setV] = useState(3);
      return <Rating value={v} onChange={setV} />;
    };
    render(<Wrapper />);
    const slider = screen.getByRole('slider');
    slider.focus();
    await user.keyboard('{Home}');
    expect(slider).toHaveAttribute('aria-valuenow', '0');
  });

  it('End sets value to max', async () => {
    const user = userEvent.setup();
    const Wrapper = () => {
      const [v, setV] = useState(1);
      return <Rating value={v} onChange={setV} max={7} />;
    };
    render(<Wrapper />);
    const slider = screen.getByRole('slider');
    slider.focus();
    await user.keyboard('{End}');
    expect(slider).toHaveAttribute('aria-valuenow', '7');
  });

  it('hover preview marks hovered stars with data-hover', () => {
    render(<Rating value={0} onChange={() => {}} />);
    const star = screen
      .getAllByRole('button')
      .filter((b) => b.hasAttribute('data-rating-star'))[2]!;
    const rect = { left: 0, width: 20, top: 0 } as DOMRect;
    star.getBoundingClientRect = () => rect as DOMRect;
    fireEvent.mouseEnter(star, { clientX: 15 });
    expect(star).toHaveAttribute('data-hover', 'true');
    fireEvent.mouseLeave(star);
    expect(star).not.toHaveAttribute('data-hover');
  });

  it('aria-valuenow reflects value and aria-valuemax reflects max', () => {
    const { rerender } = render(
      <Rating value={2.5} onChange={() => {}} max={6} />,
    );
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuenow', '2.5');
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '6');
    rerender(<Rating value={4} onChange={() => {}} max={6} />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '4');
  });

  it('className merges onto the slider wrapper', () => {
    render(
      <Rating value={0} onChange={() => {}} className="custom-x" />,
    );
    expect(screen.getByRole('slider').className).toContain('custom-x');
  });

  it('forwardRef points at the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Rating ref={ref} value={0} onChange={() => {}} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current).toBe(screen.getByRole('slider'));
  });

  it('exposes a stable displayName', () => {
    expect(Rating.displayName).toBe('Rating');
  });

  it('keyboard does not mutate when readonly', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Rating value={2} onChange={onChange} readonly />);
    const slider = screen.getByRole('slider');
    slider.focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clamps increments at max', async () => {
    const user = userEvent.setup();
    const Wrapper = () => {
      const [v, setV] = useState(5);
      return <Rating value={v} onChange={setV} max={5} />;
    };
    render(<Wrapper />);
    const slider = screen.getByRole('slider');
    slider.focus();
    await user.keyboard('{ArrowRight}');
    expect(slider).toHaveAttribute('aria-valuenow', '5');
  });

  it('string label is exposed as aria-label', () => {
    render(<Rating value={0} onChange={() => {}} label="Helpfulness" />);
    expect(screen.getByRole('slider')).toHaveAttribute(
      'aria-label',
      'Helpfulness',
    );
  });

  // -- v1.11.434 (TODO 11.416) extensions ----------------------

  describe('clampRating helper', () => {
    it('clamps below 0', () => {
      expect(clampRating(-5, 5)).toBe(0);
    });
    it('clamps above max', () => {
      expect(clampRating(7, 5)).toBe(5);
    });
    it('passes through in-range', () => {
      expect(clampRating(3, 5)).toBe(3);
    });
    it('handles NaN -> 0', () => {
      expect(clampRating(Number.NaN, 5)).toBe(0);
    });
    it('handles negative max -> 0', () => {
      expect(clampRating(2, -1)).toBe(0);
    });
  });

  describe('getRatingStarFillPercent helper', () => {
    it('returns 100 when value covers the star', () => {
      expect(getRatingStarFillPercent(0, 3, true)).toBe(100);
      expect(getRatingStarFillPercent(2, 3, true)).toBe(100);
    });
    it('returns 50 for half-filled star with allowHalf', () => {
      expect(getRatingStarFillPercent(3, 3.5, true)).toBe(50);
    });
    it('returns 0 when star is past the value', () => {
      expect(getRatingStarFillPercent(4, 3, true)).toBe(0);
    });
    it('rounds up to 100 when allowHalf=false and diff > 0', () => {
      expect(getRatingStarFillPercent(0, 0.5, false)).toBe(100);
    });
  });

  describe('getRatingAriaChecked helper', () => {
    it('returns "true" when star is fully covered', () => {
      expect(getRatingAriaChecked(0, 3, true)).toBe('true');
      expect(getRatingAriaChecked(2, 3, true)).toBe('true');
    });
    it('returns "mixed" for half-star with allowHalf', () => {
      expect(getRatingAriaChecked(3, 3.5, true)).toBe('mixed');
    });
    it('returns "false" when star is past value', () => {
      expect(getRatingAriaChecked(4, 3, true)).toBe('false');
    });
    it('treats < 0.5 as "false" with allowHalf', () => {
      expect(getRatingAriaChecked(3, 3.4, true)).toBe('false');
    });
    it('allowHalf=false never returns "mixed"', () => {
      expect(getRatingAriaChecked(3, 3.5, false)).toBe('false');
    });
  });

  describe('ariaRole="radiogroup"', () => {
    it('root carries role=radiogroup instead of slider', () => {
      render(
        <Rating
          value={3}
          onChange={() => {}}
          ariaRole="radiogroup"
        />,
      );
      expect(screen.getByRole('radiogroup')).toBeInTheDocument();
      expect(screen.queryByRole('slider')).toBeNull();
    });

    it('each star carries role=radio + aria-checked', () => {
      render(
        <Rating
          value={3}
          onChange={() => {}}
          ariaRole="radiogroup"
        />,
      );
      const radios = screen.getAllByRole('radio');
      expect(radios).toHaveLength(5);
      expect(radios[0]).toHaveAttribute('aria-checked', 'true');
      expect(radios[2]).toHaveAttribute('aria-checked', 'true');
      expect(radios[3]).toHaveAttribute('aria-checked', 'false');
    });

    it('half-star fills aria-checked="mixed"', () => {
      render(
        <Rating
          value={3.5}
          onChange={() => {}}
          ariaRole="radiogroup"
        />,
      );
      const radios = screen.getAllByRole('radio');
      expect(radios[3]).toHaveAttribute('aria-checked', 'mixed');
    });

    it('readonly + radiogroup: stars stay as spans with role=radio', () => {
      render(
        <Rating
          value={3}
          readonly
          ariaRole="radiogroup"
        />,
      );
      const radios = screen.getAllByRole('radio');
      expect(radios).toHaveLength(5);
      // Readonly should not render <button>
      expect(screen.queryAllByRole('button')).toHaveLength(0);
      // aria-disabled mirrors readonly
      radios.forEach((r) =>
        expect(r).toHaveAttribute('aria-disabled', 'true'),
      );
    });

    it('aria-valuenow / aria-valuemax omitted in radiogroup mode', () => {
      render(
        <Rating
          value={3}
          onChange={() => {}}
          ariaRole="radiogroup"
        />,
      );
      const root = screen.getByRole('radiogroup');
      expect(root).not.toHaveAttribute('aria-valuenow');
      expect(root).not.toHaveAttribute('aria-valuemax');
    });

    it('data-aria-role mirrors the prop', () => {
      const { rerender } = render(
        <Rating value={3} onChange={() => {}} />,
      );
      expect(screen.getByRole('slider')).toHaveAttribute(
        'data-aria-role',
        'slider',
      );
      rerender(
        <Rating
          value={3}
          onChange={() => {}}
          ariaRole="radiogroup"
        />,
      );
      expect(screen.getByRole('radiogroup')).toHaveAttribute(
        'data-aria-role',
        'radiogroup',
      );
    });
  });

  describe('custom icon slot', () => {
    it('icon prop replaces the filled glyph', () => {
      const { container } = render(
        <Rating
          value={3}
          onChange={() => {}}
          icon={<svg data-testid="custom-fill" />}
        />,
      );
      // 3 fully-filled stars => 3 custom icons appear inside the
      // fill wrappers; the unfilled stars still have NO custom
      // icon inside fill (because the fill is 0% wide it is hidden
      // but the icon DOM is still there). So expect 5 custom-fill
      // (one per star).
      const matches = container.querySelectorAll(
        '[data-testid="custom-fill"]',
      );
      expect(matches.length).toBe(5);
    });

    it('emptyIcon prop replaces the unfilled base glyph', () => {
      const { container } = render(
        <Rating
          value={3}
          onChange={() => {}}
          emptyIcon={<svg data-testid="custom-empty" />}
        />,
      );
      const matches = container.querySelectorAll(
        '[data-testid="custom-empty"]',
      );
      expect(matches.length).toBe(5);
    });
  });

  describe('root data attrs', () => {
    it('exposes data-section / data-readonly / data-allow-half / data-value / data-max', () => {
      render(
        <Rating
          value={3.5}
          max={7}
          onChange={() => {}}
          allowHalf
        />,
      );
      const root = screen.getByRole('slider');
      expect(root).toHaveAttribute('data-section', 'rating');
      expect(root).toHaveAttribute('data-readonly', 'false');
      expect(root).toHaveAttribute('data-allow-half', 'true');
      expect(root).toHaveAttribute('data-value', '3.5');
      expect(root).toHaveAttribute('data-max', '7');
    });

    it('data-readonly flips to true in readonly mode', () => {
      render(<Rating value={3} readonly />);
      expect(screen.getByRole('slider')).toHaveAttribute(
        'data-readonly',
        'true',
      );
    });

    it('data-allow-half flips to false when allowHalf=false', () => {
      render(
        <Rating value={3} onChange={() => {}} allowHalf={false} />,
      );
      expect(screen.getByRole('slider')).toHaveAttribute(
        'data-allow-half',
        'false',
      );
    });
  });

  describe('star data attrs', () => {
    it('each star button carries data-section + data-star-index + data-fill-pct', () => {
      const { container } = render(
        <Rating value={3.5} onChange={() => {}} />,
      );
      const stars = container.querySelectorAll(
        '[data-section="rating-star"]',
      );
      expect(stars).toHaveLength(5);
      expect(stars[0]).toHaveAttribute('data-star-index', '0');
      expect(stars[0]).toHaveAttribute('data-fill-pct', '100');
      expect(stars[3]).toHaveAttribute('data-fill-pct', '50');
      expect(stars[4]).toHaveAttribute('data-fill-pct', '0');
    });
  });
});
