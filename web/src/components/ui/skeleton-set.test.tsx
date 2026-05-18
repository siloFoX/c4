import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanup,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import { SkeletonSet } from './skeleton-set';

afterEach(() => {
  cleanup();
});

describe('SkeletonSet component', () => {
  it('renders with role=status + default aria-label per variant', () => {
    render(<SkeletonSet variant="card" />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Loading card',
    );
  });

  it('honors a custom ariaLabel', () => {
    render(
      <SkeletonSet variant="list" ariaLabel="Loading inbox" />,
    );
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Loading inbox',
    );
  });

  it('sets aria-busy="true"', () => {
    render(<SkeletonSet variant="card" />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('exposes data-section + data-variant on root', () => {
    render(<SkeletonSet variant="table" />);
    const root = screen.getByRole('status');
    expect(root).toHaveAttribute('data-section', 'skeleton-set');
    expect(root).toHaveAttribute('data-variant', 'table');
  });

  it('variant="card" renders 3 cards by default', () => {
    const { container } = render(<SkeletonSet variant="card" />);
    const cards = container.querySelectorAll(
      '[data-section="skeleton-set-cards"] [data-skeleton-sub="card"]',
    );
    expect(cards).toHaveLength(3);
  });

  it('variant="card" honors count override', () => {
    const { container } = render(
      <SkeletonSet variant="card" count={5} />,
    );
    const cards = container.querySelectorAll(
      '[data-skeleton-sub="card"]',
    );
    expect(cards).toHaveLength(5);
  });

  it('variant="card" exposes data-card-count', () => {
    const { container } = render(
      <SkeletonSet variant="card" count={2} />,
    );
    const wrapper = container.querySelector(
      '[data-section="skeleton-set-cards"]',
    );
    expect(wrapper).toHaveAttribute('data-card-count', '2');
  });

  it('variant="card" clamps negative count to 0', () => {
    const { container } = render(
      <SkeletonSet variant="card" count={-2} />,
    );
    expect(
      container.querySelectorAll('[data-skeleton-sub="card"]'),
    ).toHaveLength(0);
  });

  it('variant="card" floors fractional count', () => {
    const { container } = render(
      <SkeletonSet variant="card" count={2.7} />,
    );
    expect(
      container.querySelectorAll('[data-skeleton-sub="card"]'),
    ).toHaveLength(2);
  });

  it('variant="list" renders the list sub-component', () => {
    const { container } = render(<SkeletonSet variant="list" />);
    const list = container.querySelector(
      '[data-skeleton-sub="list"]',
    );
    expect(list).toBeInTheDocument();
  });

  it('variant="list" defaults to 6 rows', () => {
    const { container } = render(<SkeletonSet variant="list" />);
    const list = container.querySelector(
      '[data-skeleton-sub="list"]',
    );
    expect(list).toHaveAttribute('data-skeleton-rows', '6');
  });

  it('variant="list" honors rows override', () => {
    const { container } = render(
      <SkeletonSet variant="list" rows={2} />,
    );
    const list = container.querySelector(
      '[data-skeleton-sub="list"]',
    );
    expect(list).toHaveAttribute('data-skeleton-rows', '2');
  });

  it('variant="list" renders avatar shapes when showAvatar=true', () => {
    const { container } = render(
      <SkeletonSet variant="list" showAvatar={true} rows={2} />,
    );
    const avatars = container.querySelectorAll(
      '[data-skeleton-list-avatar]',
    );
    expect(avatars).toHaveLength(2);
  });

  it('variant="list" omits avatars by default', () => {
    const { container } = render(
      <SkeletonSet variant="list" rows={2} />,
    );
    const avatars = container.querySelectorAll(
      '[data-skeleton-list-avatar]',
    );
    expect(avatars).toHaveLength(0);
  });

  it('variant="list" linesPerRow controls inline lines', () => {
    const { container } = render(
      <SkeletonSet
        variant="list"
        rows={1}
        linesPerRow={4}
      />,
    );
    // Count the line shapes inside the first row container -- the
    // outer [data-skeleton-list-row="0"] match shape varies because
    // the attribute holds the numeric row index.
    const rows = container.querySelectorAll(
      '[data-skeleton-list-row]',
    );
    expect(rows.length).toBeGreaterThan(0);
    const firstRow = rows[0]!;
    const rowLines = firstRow.querySelectorAll('[data-skeleton-line]');
    expect(rowLines).toHaveLength(4);
  });

  it('variant="table" renders the table sub-component', () => {
    const { container } = render(
      <SkeletonSet variant="table" />,
    );
    const table = container.querySelector(
      '[data-skeleton-sub="table"]',
    );
    expect(table).toBeInTheDocument();
  });

  it('variant="table" defaults to 5 rows x 4 cols', () => {
    const { container } = render(
      <SkeletonSet variant="table" />,
    );
    const body = container.querySelectorAll(
      '[data-skeleton-table-row="body"]',
    );
    expect(body).toHaveLength(5);
    const headerCells = container.querySelectorAll(
      '[data-skeleton-table-row="header"] [data-skeleton-table-cell]',
    );
    expect(headerCells).toHaveLength(4);
  });

  it('variant="table" honors rows + cols overrides', () => {
    const { container } = render(
      <SkeletonSet variant="table" rows={3} cols={6} />,
    );
    const body = container.querySelectorAll(
      '[data-skeleton-table-row="body"]',
    );
    expect(body).toHaveLength(3);
    const headerCells = container.querySelectorAll(
      '[data-skeleton-table-row="header"] [data-skeleton-table-cell]',
    );
    expect(headerCells).toHaveLength(6);
  });

  it('variant="detail-page" renders the canonical layout', () => {
    const { container } = render(
      <SkeletonSet variant="detail-page" />,
    );
    expect(
      container.querySelector(
        '[data-section="skeleton-set-detail-header"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="skeleton-set-detail-body"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="skeleton-set-detail-main"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="skeleton-set-detail-side"]',
      ),
    ).toBeInTheDocument();
  });

  it('variant="detail-page" main column has a paragraph + card', () => {
    const { container } = render(
      <SkeletonSet variant="detail-page" />,
    );
    const main = container.querySelector(
      '[data-section="skeleton-set-detail-main"]',
    )!;
    const text = main.querySelector('[data-skeleton-sub="text"]');
    const card = main.querySelector('[data-skeleton-sub="card"]');
    expect(text).toBeInTheDocument();
    expect(card).toBeInTheDocument();
  });

  it('variant="detail-page" side column has two cards', () => {
    const { container } = render(
      <SkeletonSet variant="detail-page" />,
    );
    const side = container.querySelector(
      '[data-section="skeleton-set-detail-side"]',
    )!;
    const cards = side.querySelectorAll('[data-skeleton-sub="card"]');
    expect(cards).toHaveLength(2);
  });

  it('variant="detail-page" header has title + subtitle bars', () => {
    const { container } = render(
      <SkeletonSet variant="detail-page" />,
    );
    expect(
      container.querySelector('[data-skeleton-detail="title"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-skeleton-detail="subtitle"]'),
    ).toBeInTheDocument();
  });

  it('data-motion-reduced reflects matchMedia state', () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (q: string) => ({
        matches: q.includes('reduce'),
        media: q,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    try {
      render(<SkeletonSet variant="card" />);
      expect(screen.getByRole('status')).toHaveAttribute(
        'data-motion-reduced',
        'true',
      );
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      });
    }
  });

  it('data-motion-reduced is "false" when no preference is set', () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (q: string) => ({
        matches: false,
        media: q,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    try {
      render(<SkeletonSet variant="card" />);
      expect(screen.getByRole('status')).toHaveAttribute(
        'data-motion-reduced',
        'false',
      );
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      });
    }
  });

  it('exposes a stable displayName', () => {
    expect(SkeletonSet.displayName).toBe('SkeletonSet');
  });

  it('forwards refs to the root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<SkeletonSet ref={ref} variant="card" />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('role')).toBe('status');
  });

  it('forwards extra HTML attributes to the root', () => {
    render(
      <SkeletonSet
        variant="card"
        data-testid="custom"
      />,
    );
    expect(screen.getByTestId('custom')).toBeInTheDocument();
  });

  it('honors className', () => {
    render(
      <SkeletonSet variant="card" className="my-special-cls" />,
    );
    expect(screen.getByRole('status').className).toContain(
      'my-special-cls',
    );
  });
});
