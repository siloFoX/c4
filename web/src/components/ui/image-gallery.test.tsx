import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  DEFAULT_GALLERY_COLUMNS,
  DEFAULT_GALLERY_GAP,
  DEFAULT_SWIPE_THRESHOLD,
  ImageGallery,
  clampGalleryIndex,
  isSwipeLeft,
  isSwipeRight,
  nextGalleryIndex,
  prevGalleryIndex,
} from './image-gallery';
import type { ImageGalleryItem } from './image-gallery';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

const items: ImageGalleryItem[] = [
  { src: 'a.jpg', alt: 'Alpha' },
  { src: 'b.jpg', alt: 'Bravo' },
  { src: 'c.jpg', alt: 'Charlie' },
];

describe('clampGalleryIndex', () => {
  it('returns 0 for empty total', () => {
    expect(clampGalleryIndex(2, 0)).toBe(0);
  });
  it('clamps below 0', () => {
    expect(clampGalleryIndex(-5, 3)).toBe(0);
  });
  it('clamps above total-1', () => {
    expect(clampGalleryIndex(10, 3)).toBe(2);
  });
  it('passes through valid', () => {
    expect(clampGalleryIndex(1, 3)).toBe(1);
  });
  it('NaN becomes 0', () => {
    expect(clampGalleryIndex(Number.NaN, 3)).toBe(0);
  });
  it('floors fractional', () => {
    expect(clampGalleryIndex(1.7, 3)).toBe(1);
  });
});

describe('nextGalleryIndex', () => {
  it('advances by 1', () => {
    expect(nextGalleryIndex(0, 3)).toBe(1);
    expect(nextGalleryIndex(1, 3)).toBe(2);
  });
  it('wraps at end by default', () => {
    expect(nextGalleryIndex(2, 3)).toBe(0);
  });
  it('clamps at end when wrap=false', () => {
    expect(nextGalleryIndex(2, 3, false)).toBe(2);
  });
  it('returns 0 for empty total', () => {
    expect(nextGalleryIndex(0, 0)).toBe(0);
  });
});

describe('prevGalleryIndex', () => {
  it('retreats by 1', () => {
    expect(prevGalleryIndex(2, 3)).toBe(1);
    expect(prevGalleryIndex(1, 3)).toBe(0);
  });
  it('wraps at start by default', () => {
    expect(prevGalleryIndex(0, 3)).toBe(2);
  });
  it('clamps at start when wrap=false', () => {
    expect(prevGalleryIndex(0, 3, false)).toBe(0);
  });
  it('returns 0 for empty total', () => {
    expect(prevGalleryIndex(0, 0)).toBe(0);
  });
});

describe('isSwipeLeft / isSwipeRight', () => {
  it('left when dx <= -threshold', () => {
    expect(isSwipeLeft(-60, 50)).toBe(true);
    expect(isSwipeLeft(-50, 50)).toBe(true);
    expect(isSwipeLeft(-40, 50)).toBe(false);
  });
  it('right when dx >= threshold', () => {
    expect(isSwipeRight(60, 50)).toBe(true);
    expect(isSwipeRight(50, 50)).toBe(true);
    expect(isSwipeRight(40, 50)).toBe(false);
  });
  it('uses default threshold when omitted', () => {
    expect(isSwipeLeft(-DEFAULT_SWIPE_THRESHOLD)).toBe(true);
    expect(isSwipeRight(DEFAULT_SWIPE_THRESHOLD)).toBe(true);
  });
});

describe('Constants', () => {
  it('DEFAULT_GALLERY_COLUMNS = 3', () => {
    expect(DEFAULT_GALLERY_COLUMNS).toBe(3);
  });
  it('DEFAULT_GALLERY_GAP = 8', () => {
    expect(DEFAULT_GALLERY_GAP).toBe(8);
  });
  it('DEFAULT_SWIPE_THRESHOLD = 50', () => {
    expect(DEFAULT_SWIPE_THRESHOLD).toBe(50);
  });
});

describe('ImageGallery component', () => {
  it('renders a region with default aria-label', () => {
    render(<ImageGallery items={items} />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Image gallery',
    );
  });

  it('honors a custom ariaLabel', () => {
    render(<ImageGallery items={items} ariaLabel="Photo grid" />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Photo grid',
    );
  });

  it('renders one button per item', () => {
    render(<ImageGallery items={items} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(items.length);
  });

  it('renders thumbs with alt + lazy loading by default', () => {
    render(<ImageGallery items={items} />);
    const img = screen.getByAltText('Alpha');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('src', 'a.jpg');
  });

  it('lazy=false flips to loading="eager"', () => {
    render(<ImageGallery items={items} lazy={false} />);
    expect(screen.getByAltText('Alpha')).toHaveAttribute(
      'loading',
      'eager',
    );
  });

  it('uses thumb override when provided', () => {
    const withThumbs: ImageGalleryItem[] = [
      { src: 'full.jpg', alt: 'Alpha', thumb: 'thumb.jpg' },
    ];
    render(<ImageGallery items={withThumbs} />);
    expect(screen.getByAltText('Alpha')).toHaveAttribute(
      'src',
      'thumb.jpg',
    );
  });

  it('grid layout is default with columns 3 in style', () => {
    const { container } = render(<ImageGallery items={items} />);
    const region = container.querySelector(
      '[data-section="image-gallery"]',
    ) as HTMLElement;
    expect(region).toHaveAttribute('data-layout', 'grid');
    expect(region).toHaveAttribute('data-columns', '3');
    expect(region.style.display).toBe('grid');
    expect(region.style.gridTemplateColumns).toContain('repeat(3');
  });

  it('masonry layout switches to columnCount', () => {
    const { container } = render(
      <ImageGallery items={items} layout="masonry" columns={4} />,
    );
    const region = container.querySelector(
      '[data-section="image-gallery"]',
    ) as HTMLElement;
    expect(region).toHaveAttribute('data-layout', 'masonry');
    expect(region).toHaveAttribute('data-columns', '4');
    expect(region.style.columnCount).toBe('4');
  });

  it('gap prop sets inline gap style', () => {
    const { container } = render(
      <ImageGallery items={items} gap={20} />,
    );
    const region = container.querySelector(
      '[data-section="image-gallery"]',
    ) as HTMLElement;
    expect(region.style.gap).toBe('20px');
  });

  it('clicking a thumb opens the lightbox', () => {
    render(<ImageGallery items={items} />);
    fireEvent.click(screen.getAllByRole('button')[1]!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('clicking a thumb calls onSelect with the index', () => {
    const onSelect = vi.fn();
    render(<ImageGallery items={items} onSelect={onSelect} />);
    fireEvent.click(screen.getAllByRole('button')[2]!);
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('clicking a thumb calls onOpenChange with the index', () => {
    const onOpenChange = vi.fn();
    render(
      <ImageGallery items={items} onOpenChange={onOpenChange} />,
    );
    fireEvent.click(screen.getAllByRole('button')[0]!);
    expect(onOpenChange).toHaveBeenCalledWith(0);
  });

  it('controlled openIndex shows the lightbox', () => {
    render(<ImageGallery items={items} openIndex={1} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('data-active-index', '1');
  });

  it('lightbox shows the full-size image for the active item', () => {
    render(<ImageGallery items={items} openIndex={1} />);
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByAltText('Bravo'),
    ).toBeInTheDocument();
  });

  it('lightbox renders inside the portal target', () => {
    render(<ImageGallery items={items} openIndex={0} />);
    const portalRoot = document.getElementById('app-portal-root');
    expect(portalRoot).not.toBeNull();
    expect(portalRoot?.contains(screen.getByRole('dialog'))).toBe(
      true,
    );
  });

  it('close button closes the lightbox', () => {
    const onOpenChange = vi.fn();
    render(
      <ImageGallery
        items={items}
        openIndex={0}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('Close lightbox'));
    expect(onOpenChange).toHaveBeenCalledWith(null);
  });

  it('ArrowRight on lightbox advances index', () => {
    const onOpenChange = vi.fn();
    render(
      <ImageGallery
        items={items}
        openIndex={0}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'ArrowRight',
    });
    expect(onOpenChange).toHaveBeenCalledWith(1);
  });

  it('ArrowLeft on lightbox retreats index', () => {
    const onOpenChange = vi.fn();
    render(
      <ImageGallery
        items={items}
        openIndex={1}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'ArrowLeft',
    });
    expect(onOpenChange).toHaveBeenCalledWith(0);
  });

  it('Home jumps to 0', () => {
    const onOpenChange = vi.fn();
    render(
      <ImageGallery
        items={items}
        openIndex={2}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Home' });
    expect(onOpenChange).toHaveBeenCalledWith(0);
  });

  it('End jumps to last', () => {
    const onOpenChange = vi.fn();
    render(
      <ImageGallery
        items={items}
        openIndex={0}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'End' });
    expect(onOpenChange).toHaveBeenCalledWith(2);
  });

  it('Escape closes', () => {
    const onOpenChange = vi.fn();
    render(
      <ImageGallery
        items={items}
        openIndex={1}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(null);
  });

  it('next button advances', () => {
    const onOpenChange = vi.fn();
    render(
      <ImageGallery
        items={items}
        openIndex={0}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('Next image'));
    expect(onOpenChange).toHaveBeenCalledWith(1);
  });

  it('prev button retreats', () => {
    const onOpenChange = vi.fn();
    render(
      <ImageGallery
        items={items}
        openIndex={2}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('Previous image'));
    expect(onOpenChange).toHaveBeenCalledWith(1);
  });

  it('wraps next from last by default', () => {
    const onOpenChange = vi.fn();
    render(
      <ImageGallery
        items={items}
        openIndex={2}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('Next image'));
    expect(onOpenChange).toHaveBeenCalledWith(0);
  });

  it('wraps prev from first by default', () => {
    const onOpenChange = vi.fn();
    render(
      <ImageGallery
        items={items}
        openIndex={0}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('Previous image'));
    expect(onOpenChange).toHaveBeenCalledWith(2);
  });

  it('wrap=false disables wrap (next from last disabled)', () => {
    render(
      <ImageGallery items={items} openIndex={2} wrap={false} />,
    );
    const next = screen.getByLabelText('Next image');
    expect(next).toBeDisabled();
  });

  it('wrap=false disables wrap (prev from first disabled)', () => {
    render(
      <ImageGallery items={items} openIndex={0} wrap={false} />,
    );
    const prev = screen.getByLabelText('Previous image');
    expect(prev).toBeDisabled();
  });

  it('swipe left advances', () => {
    const onOpenChange = vi.fn();
    render(
      <ImageGallery
        items={items}
        openIndex={0}
        onOpenChange={onOpenChange}
      />,
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.pointerDown(dialog, { clientX: 200 });
    fireEvent.pointerUp(dialog, { clientX: 100 });
    expect(onOpenChange).toHaveBeenCalledWith(1);
  });

  it('swipe right retreats', () => {
    const onOpenChange = vi.fn();
    render(
      <ImageGallery
        items={items}
        openIndex={1}
        onOpenChange={onOpenChange}
      />,
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.pointerDown(dialog, { clientX: 100 });
    fireEvent.pointerUp(dialog, { clientX: 200 });
    expect(onOpenChange).toHaveBeenCalledWith(0);
  });

  it('swipe under threshold does NOT navigate', () => {
    const onOpenChange = vi.fn();
    render(
      <ImageGallery
        items={items}
        openIndex={0}
        onOpenChange={onOpenChange}
        swipeThreshold={100}
      />,
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.pointerDown(dialog, { clientX: 100 });
    fireEvent.pointerUp(dialog, { clientX: 130 });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('backdrop click closes (default)', () => {
    const onOpenChange = vi.fn();
    render(
      <ImageGallery
        items={items}
        openIndex={0}
        onOpenChange={onOpenChange}
      />,
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog, {
      target: dialog,
      currentTarget: dialog,
    });
    expect(onOpenChange).toHaveBeenCalledWith(null);
  });

  it('closeOnBackdropClick=false keeps lightbox open on backdrop click', () => {
    const onOpenChange = vi.fn();
    render(
      <ImageGallery
        items={items}
        openIndex={0}
        onOpenChange={onOpenChange}
        closeOnBackdropClick={false}
      />,
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog, {
      target: dialog,
      currentTarget: dialog,
    });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('counter shows "N / total"', () => {
    render(<ImageGallery items={items} openIndex={1} />);
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('caption renders when supplied', () => {
    const captioned: ImageGalleryItem[] = [
      { src: 'a.jpg', alt: 'Alpha', caption: 'Wide Alpha' },
    ];
    render(<ImageGallery items={captioned} openIndex={0} />);
    expect(screen.getByText('Wide Alpha')).toBeInTheDocument();
  });

  it('caption absent when item.caption is undefined', () => {
    const { container } = render(
      <ImageGallery items={items} openIndex={0} />,
    );
    expect(
      container.querySelector('[data-section="image-gallery-caption"]'),
    ).toBeNull();
  });

  it('item-count data attr matches items.length', () => {
    render(<ImageGallery items={items} />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-item-count',
      '3',
    );
  });

  it('handles empty items array gracefully (no buttons)', () => {
    render(<ImageGallery items={[]} />);
    expect(screen.queryAllByRole('button').length).toBe(0);
  });

  it('default uncontrolled defaultIndex opens the lightbox', () => {
    render(<ImageGallery items={items} defaultIndex={1} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('exposes a stable displayName', () => {
    expect(ImageGallery.displayName).toBe('ImageGallery');
  });

  it('forwards ref to the gallery region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ImageGallery ref={ref} items={items} />);
    expect(ref.current?.getAttribute('role')).toBe('region');
  });

  it('per-thumb buttons carry data-section + data-index', () => {
    render(<ImageGallery items={items} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveAttribute(
      'data-section',
      'image-gallery-item',
    );
    expect(buttons[0]).toHaveAttribute('data-index', '0');
    expect(buttons[2]).toHaveAttribute('data-index', '2');
  });

  it('lightbox has data-section + data-active-index attrs', () => {
    render(<ImageGallery items={items} openIndex={1} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute(
      'data-section',
      'image-gallery-lightbox',
    );
    expect(dialog).toHaveAttribute('data-active-index', '1');
  });

  it('body overflow locks while open and restores on close', () => {
    const { rerender } = render(
      <ImageGallery items={items} openIndex={0} />,
    );
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<ImageGallery items={items} openIndex={null} />);
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
