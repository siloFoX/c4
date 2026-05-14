import { describe, it, expect, vi } from 'vitest';
import { useState, createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Rating } from './rating';

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
});
