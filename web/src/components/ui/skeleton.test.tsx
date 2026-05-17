import { createRef } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  AvatarShape,
  AvatarSkeleton,
  ChipSkeleton,
  Circle,
  Rect,
  Skeleton,
  StatCardShape,
  TableRowShape,
  TableRowSkeleton,
  TextLine,
} from './skeleton';

describe('<Skeleton>', () => {
  it('renders an animate-pulse + bg-muted node by default', () => {
    const { container } = render(<Skeleton />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveClass('animate-pulse');
    expect(node).toHaveClass('bg-muted');
  });

  it('applies the rect variant classes by default', () => {
    const { container } = render(<Skeleton />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveClass('rounded-md');
  });

  it('applies the avatar variant (rounded-full + 10x10)', () => {
    const { container } = render(<Skeleton variant="avatar" />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveClass('rounded-full');
    expect(node).toHaveClass('h-10');
    expect(node).toHaveClass('w-10');
  });

  it('applies the row variant (h-8 + rounded-md)', () => {
    const { container } = render(<Skeleton variant="row" />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveClass('h-8');
    expect(node).toHaveClass('rounded-md');
  });

  it('applies the card variant (h-32 + rounded-md)', () => {
    const { container } = render(<Skeleton variant="card" />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveClass('h-32');
  });

  it('renders a single text-variant line by default', () => {
    const { container } = render(<Skeleton variant="text" />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveClass('h-3');
    expect(node).toHaveClass('w-full');
  });

  it('renders N rows when lines is set on the text variant', () => {
    const { container } = render(<Skeleton variant="text" lines={4} />);
    const rows = container.querySelectorAll('[data-skeleton-line]');
    expect(rows).toHaveLength(4);
  });

  it('shortens the final text line for a more natural paragraph look', () => {
    const { container } = render(<Skeleton variant="text" lines={3} />);
    const rows = container.querySelectorAll('[data-skeleton-line]');
    expect(rows[2]?.className).toContain('w-4/5');
    expect(rows[0]?.className).not.toContain('w-4/5');
  });

  it('applies width / height props as inline style', () => {
    const { container } = render(<Skeleton width={120} height={20} />);
    const node = container.firstChild as HTMLElement;
    expect(node.style.width).toBe('120px');
    expect(node.style.height).toBe('20px');
  });

  it('accepts string width / height (passes through as-is)', () => {
    const { container } = render(<Skeleton width="50%" height="2rem" />);
    const node = container.firstChild as HTMLElement;
    expect(node.style.width).toBe('50%');
    expect(node.style.height).toBe('2rem');
  });

  it('merges caller className', () => {
    const { container } = render(<Skeleton className="my-sk" />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveClass('my-sk');
    expect(node).toHaveClass('animate-pulse');
  });

  it('sets role=status + aria-hidden on the placeholder', () => {
    render(<Skeleton data-testid="sk" />);
    const node = screen.getByTestId('sk');
    expect(node).toHaveAttribute('role', 'status');
    expect(node).toHaveAttribute('aria-hidden', 'true');
  });

  // ---- v1.11.135: new variant aliases ------------------------------

  it('applies the line variant (h-3 + w-full + rounded) as a thin horizontal bar', () => {
    const { container } = render(<Skeleton variant="line" />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveClass('h-3');
    expect(node).toHaveClass('w-full');
    expect(node).toHaveClass('animate-pulse');
    expect(node).toHaveClass('bg-muted');
  });

  it('applies the circle variant (rounded-full + 10x10 square aspect)', () => {
    const { container } = render(<Skeleton variant="circle" />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveClass('rounded-full');
    expect(node).toHaveClass('h-10');
    expect(node).toHaveClass('w-10');
  });

  it('applies the card variant (taller rounded block) explicitly', () => {
    const { container } = render(<Skeleton variant="card" />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveClass('h-32');
    expect(node).toHaveClass('w-full');
    expect(node).toHaveClass('rounded-md');
  });

  it('renders the page variant as 1 header line + 3 body lines stacked', () => {
    const { container } = render(<Skeleton variant="page" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveAttribute('role', 'status');
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
    expect(wrapper.querySelectorAll('[data-skeleton-page="header"]')).toHaveLength(1);
    expect(wrapper.querySelectorAll('[data-skeleton-page="body"]')).toHaveLength(3);
  });

  it('shortens the final body line on the page variant for a natural look', () => {
    const { container } = render(<Skeleton variant="page" />);
    const bodyLines = container.querySelectorAll('[data-skeleton-page="body"]');
    expect(bodyLines[2]?.className).toContain('w-4/5');
    expect(bodyLines[0]?.className).not.toContain('w-4/5');
  });

  it('preserves the legacy default (no variant) as a single rect node', () => {
    const { container } = render(<Skeleton data-testid="sk" />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveClass('rounded-md');
    expect(node).toHaveClass('animate-pulse');
    expect(node).toHaveClass('bg-muted');
    expect(container.querySelectorAll('[data-skeleton-page="body"]')).toHaveLength(0);
  });

  it('forwards caller className on the page variant wrapper', () => {
    const { container } = render(<Skeleton variant="page" className="my-page" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('my-page');
  });
});

// ---- v1.11.174: composable shape variants ------------------------

describe('<TextLine>', () => {
  it('renders with the default 100% width and 0.875em height', () => {
    const { container } = render(<TextLine />);
    const node = container.firstChild as HTMLElement;
    expect(node.style.width).toBe('100%');
    expect(node.style.height).toBe('0.875em');
    expect(node).toHaveClass('animate-pulse');
    expect(node).toHaveClass('bg-muted');
  });

  it('accepts a custom width prop (string + number)', () => {
    const { container: c1 } = render(<TextLine width="70%" />);
    expect((c1.firstChild as HTMLElement).style.width).toBe('70%');
    const { container: c2 } = render(<TextLine width={120} />);
    expect((c2.firstChild as HTMLElement).style.width).toBe('120px');
  });

  it('merges caller className', () => {
    const { container } = render(<TextLine className="my-line" />);
    expect(container.firstChild as HTMLElement).toHaveClass('my-line');
  });

  it('forwardRef exposes the underlying DOM node', () => {
    const ref = createRef<HTMLDivElement>();
    render(<TextLine ref={ref} data-testid="tl" />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('DIV');
  });
});

describe('<Rect>', () => {
  it('applies rounded-md by default', () => {
    const { container } = render(<Rect width={50} height={20} />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveClass('rounded-md');
    expect(node.style.width).toBe('50px');
    expect(node.style.height).toBe('20px');
  });

  it('rounded="full" applies rounded-full class', () => {
    const { container } = render(<Rect rounded="full" width={20} height={20} />);
    expect(container.firstChild as HTMLElement).toHaveClass('rounded-full');
  });

  it('accepts string width/height (passes through)', () => {
    const { container } = render(<Rect width="50%" height="1rem" />);
    const node = container.firstChild as HTMLElement;
    expect(node.style.width).toBe('50%');
    expect(node.style.height).toBe('1rem');
  });

  it('merges caller className', () => {
    const { container } = render(<Rect className="my-rect" />);
    expect(container.firstChild as HTMLElement).toHaveClass('my-rect');
  });

  it('forwardRef exposes the underlying DOM node', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Rect ref={ref} />);
    expect(ref.current).not.toBeNull();
  });
});

describe('<Circle>', () => {
  it('matches w/h to the size prop', () => {
    const { container } = render(<Circle size="3rem" />);
    const node = container.firstChild as HTMLElement;
    expect(node.style.width).toBe('3rem');
    expect(node.style.height).toBe('3rem');
    expect(node).toHaveClass('rounded-full');
  });

  it('accepts numeric size', () => {
    const { container } = render(<Circle size={48} />);
    const node = container.firstChild as HTMLElement;
    expect(node.style.width).toBe('48px');
    expect(node.style.height).toBe('48px');
  });

  it('merges caller className', () => {
    const { container } = render(<Circle className="my-circle" />);
    expect(container.firstChild as HTMLElement).toHaveClass('my-circle');
  });
});

describe('<AvatarShape>', () => {
  it('sm size applies h-6/w-6 classes', () => {
    const { container } = render(<AvatarShape size="sm" />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveClass('h-6');
    expect(node).toHaveClass('w-6');
    expect(node).toHaveAttribute('data-avatar-size', 'sm');
  });

  it('md size applies h-10/w-10 classes', () => {
    const { container } = render(<AvatarShape size="md" />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveClass('h-10');
    expect(node).toHaveClass('w-10');
  });

  it('lg size applies h-14/w-14 classes', () => {
    const { container } = render(<AvatarShape size="lg" />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveClass('h-14');
    expect(node).toHaveClass('w-14');
  });

  it('merges caller className', () => {
    const { container } = render(<AvatarShape className="my-av" />);
    expect(container.firstChild as HTMLElement).toHaveClass('my-av');
  });
});

describe('<StatCardShape>', () => {
  it('renders 3 Rect children (label + number + delta)', () => {
    const { container } = render(<StatCardShape />);
    const rects = container.querySelectorAll('[data-skeleton-shape="rect"]');
    expect(rects).toHaveLength(3);
  });

  it('merges caller className on the wrapper', () => {
    const { container } = render(<StatCardShape className="my-stat" />);
    expect(container.firstChild as HTMLElement).toHaveClass('my-stat');
  });
});

describe('<TableRowShape>', () => {
  it('renders 5 rects by default', () => {
    const { container } = render(<TableRowShape />);
    const rects = container.querySelectorAll('[data-skeleton-shape="rect"]');
    expect(rects).toHaveLength(5);
  });

  it('renders N rects when columns=N', () => {
    const { container } = render(<TableRowShape columns={3} />);
    const rects = container.querySelectorAll('[data-skeleton-shape="rect"]');
    expect(rects).toHaveLength(3);
  });

  it('merges caller className on the row wrapper', () => {
    const { container } = render(<TableRowShape className="my-row" />);
    expect(container.firstChild as HTMLElement).toHaveClass('my-row');
  });

  it('cycles the 60/100/45/70/30 width pattern for >5 columns', () => {
    const { container } = render(<TableRowShape columns={7} />);
    const rects = container.querySelectorAll('[data-skeleton-shape="rect"]');
    expect(rects).toHaveLength(7);
    expect((rects[0] as HTMLElement).style.width).toBe('60%');
    expect((rects[5] as HTMLElement).style.width).toBe('60%');
    expect((rects[6] as HTMLElement).style.width).toBe('100%');
  });
});

// ---- v1.11.208: Skeleton.* compound sub-components ---------------

describe('Skeleton.* compound sub-components', () => {
  it('Skeleton base renders animate-pulse + role=status (a11y)', () => {
    const { container } = render(<Skeleton data-testid="sk-base" />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveClass('animate-pulse');
    expect(node).toHaveAttribute('role', 'status');
    expect(node).toHaveAttribute('aria-hidden', 'true');
  });

  it('Skeleton.Text renders a single line at default 100% width / 1em height', () => {
    const { container } = render(<Skeleton.Text />);
    const node = container.firstChild as HTMLElement;
    expect(node.style.width).toBe('100%');
    expect(node.style.height).toBe('1em');
    expect(node).toHaveAttribute('data-skeleton-sub', 'text');
    expect(node).toHaveClass('animate-pulse');
    expect(node).toHaveClass('bg-muted');
  });

  it('Skeleton.Text accepts a width prop (string + number)', () => {
    const { container: c1 } = render(<Skeleton.Text width="60%" />);
    expect((c1.firstChild as HTMLElement).style.width).toBe('60%');
    const { container: c2 } = render(<Skeleton.Text width={140} />);
    expect((c2.firstChild as HTMLElement).style.width).toBe('140px');
  });

  it('Skeleton.Text lines=3 renders 3 line elements inside the wrapper', () => {
    const { container } = render(<Skeleton.Text lines={3} />);
    const lines = container.querySelectorAll('[data-skeleton-line]');
    expect(lines).toHaveLength(3);
    // last line should be naturally shortened
    expect((lines[2] as HTMLElement).className).toContain('w-4/5');
  });

  it('Skeleton.Text lines=1 collapses to a single bar (no wrapper)', () => {
    const { container } = render(<Skeleton.Text lines={1} />);
    const lines = container.querySelectorAll('[data-skeleton-line]');
    expect(lines).toHaveLength(0);
    expect(container.firstChild).toHaveAttribute('data-skeleton-sub', 'text');
  });

  it('Skeleton.Avatar size=sm renders a 24px circular placeholder', () => {
    const { container } = render(<Skeleton.Avatar size="sm" />);
    const node = container.firstChild as HTMLElement;
    expect(node.style.width).toBe('24px');
    expect(node.style.height).toBe('24px');
    expect(node).toHaveClass('rounded-full');
    expect(node).toHaveAttribute('data-skeleton-avatar-size', 'sm');
  });

  it('Skeleton.Avatar size=md renders a 32px circular placeholder', () => {
    const { container } = render(<Skeleton.Avatar size="md" />);
    const node = container.firstChild as HTMLElement;
    expect(node.style.width).toBe('32px');
    expect(node.style.height).toBe('32px');
  });

  it('Skeleton.Avatar size=lg renders a 48px circular placeholder', () => {
    const { container } = render(<Skeleton.Avatar size="lg" />);
    const node = container.firstChild as HTMLElement;
    expect(node.style.width).toBe('48px');
    expect(node.style.height).toBe('48px');
    expect(node).toHaveClass('rounded-full');
  });

  it('Skeleton.Avatar defaults to md (32px) when no size is supplied', () => {
    const { container } = render(<Skeleton.Avatar />);
    const node = container.firstChild as HTMLElement;
    expect(node.style.width).toBe('32px');
  });

  it('Skeleton.Card renders a bordered panel with a header + 2 text rows', () => {
    const { container } = render(<Skeleton.Card />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveAttribute('data-skeleton-sub', 'card');
    expect(wrapper).toHaveClass('rounded-md');
    expect(wrapper).toHaveClass('border');
    const header = wrapper.querySelectorAll('[data-skeleton-card="header"]');
    const lines = wrapper.querySelectorAll('[data-skeleton-card="line"]');
    expect(header).toHaveLength(1);
    expect(lines).toHaveLength(2);
  });

  it('Skeleton.Table renders 1 header row + N body rows with C cells each', () => {
    const { container } = render(<Skeleton.Table rows={5} cols={3} />);
    const wrapper = container.firstChild as HTMLElement;
    const header = wrapper.querySelectorAll('[data-skeleton-table-row="header"]');
    const body = wrapper.querySelectorAll('[data-skeleton-table-row="body"]');
    expect(header).toHaveLength(1);
    expect(body).toHaveLength(5);
    // 1 header + 5 body = 6 row containers
    expect(header.length + body.length).toBe(6);
    body.forEach((row) => {
      expect(row.querySelectorAll('[data-skeleton-table-cell]')).toHaveLength(3);
    });
    expect(header[0]?.querySelectorAll('[data-skeleton-table-cell]')).toHaveLength(
      3,
    );
  });

  it('Skeleton.Table defaults rows=5 cols=3', () => {
    const { container } = render(<Skeleton.Table />);
    const wrapper = container.firstChild as HTMLElement;
    expect(
      wrapper.querySelectorAll('[data-skeleton-table-row="body"]'),
    ).toHaveLength(5);
    expect(
      wrapper.querySelectorAll('[data-skeleton-table-cell]'),
    ).toHaveLength(3 * 6); // 6 rows (header + 5 body) x 3 cols
  });

  it('custom className passes through on every sub-component wrapper', () => {
    const { container: c1 } = render(<Skeleton.Text className="x-text" />);
    expect(c1.firstChild as HTMLElement).toHaveClass('x-text');
    const { container: c2 } = render(<Skeleton.Avatar className="x-av" />);
    expect(c2.firstChild as HTMLElement).toHaveClass('x-av');
    const { container: c3 } = render(<Skeleton.Card className="x-card" />);
    expect(c3.firstChild as HTMLElement).toHaveClass('x-card');
    const { container: c4 } = render(<Skeleton.Table className="x-tbl" />);
    expect(c4.firstChild as HTMLElement).toHaveClass('x-tbl');
  });

  it('every sub-component carries role=status + aria-hidden on its wrapper (a11y)', () => {
    const { container: c1 } = render(<Skeleton.Text />);
    expect(c1.firstChild as HTMLElement).toHaveAttribute('role', 'status');
    expect(c1.firstChild as HTMLElement).toHaveAttribute('aria-hidden', 'true');
    const { container: c2 } = render(<Skeleton.Avatar />);
    expect(c2.firstChild as HTMLElement).toHaveAttribute('role', 'status');
    expect(c2.firstChild as HTMLElement).toHaveAttribute('aria-hidden', 'true');
    const { container: c3 } = render(<Skeleton.Card />);
    expect(c3.firstChild as HTMLElement).toHaveAttribute('role', 'status');
    expect(c3.firstChild as HTMLElement).toHaveAttribute('aria-hidden', 'true');
    const { container: c4 } = render(<Skeleton.Table />);
    expect(c4.firstChild as HTMLElement).toHaveAttribute('role', 'status');
    expect(c4.firstChild as HTMLElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('Skeleton.* sub-components allow callers to override role (e.g. nested inside another status region)', () => {
    const { container } = render(<Skeleton.Text role="presentation" />);
    const node = container.firstChild as HTMLElement;
    expect(node).toHaveAttribute('role', 'presentation');
  });

  // -- v1.11.273 Skeleton.List (TODO 11.255) -----------------------

  it('Skeleton.List renders N row containers (default 5)', () => {
    const { container } = render(<Skeleton.List />);
    const rows = container.querySelectorAll('[data-skeleton-list-row]');
    expect(rows.length).toBe(5);
  });

  it('Skeleton.List rows respect the rows prop', () => {
    const { container } = render(<Skeleton.List rows={3} />);
    const rows = container.querySelectorAll('[data-skeleton-list-row]');
    expect(rows.length).toBe(3);
  });

  it('Skeleton.List clamps negative / fractional rows to 0 / floor', () => {
    const { container: a } = render(<Skeleton.List rows={-2} />);
    expect(
      a.querySelectorAll('[data-skeleton-list-row]'),
    ).toHaveLength(0);
    const { container: b } = render(<Skeleton.List rows={3.7} />);
    expect(
      b.querySelectorAll('[data-skeleton-list-row]'),
    ).toHaveLength(3);
  });

  it('Skeleton.List exposes data-skeleton-rows on the root', () => {
    render(<Skeleton.List rows={4} />);
    const root = document.querySelector('[data-skeleton-sub="list"]')!;
    expect(root.getAttribute('data-skeleton-rows')).toBe('4');
  });

  it('Skeleton.List shows an avatar circle per row only when showAvatar is true', () => {
    const { container: a } = render(<Skeleton.List rows={3} />);
    expect(
      a.querySelectorAll('[data-skeleton-list-avatar]'),
    ).toHaveLength(0);
    const { container: b } = render(
      <Skeleton.List rows={3} showAvatar />,
    );
    expect(
      b.querySelectorAll('[data-skeleton-list-avatar]'),
    ).toHaveLength(3);
  });

  it('Skeleton.List default linesPerRow=2 yields 2 line shapes per row', () => {
    const { container } = render(<Skeleton.List rows={3} />);
    const lines = container.querySelectorAll('[data-skeleton-line]');
    expect(lines.length).toBe(6);
  });

  it('Skeleton.List honours custom linesPerRow', () => {
    const { container } = render(
      <Skeleton.List rows={2} linesPerRow={4} />,
    );
    const lines = container.querySelectorAll('[data-skeleton-line]');
    expect(lines.length).toBe(8);
  });

  it('Skeleton.List linesPerRow=0 clamps to 1 minimum', () => {
    const { container } = render(
      <Skeleton.List rows={2} linesPerRow={0} />,
    );
    const lines = container.querySelectorAll('[data-skeleton-line]');
    expect(lines.length).toBe(2);
  });

  it('Skeleton.List gap prop maps to Tailwind gap-N on the root', () => {
    const { container } = render(<Skeleton.List rows={2} gap={5} />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('gap-5');
  });

  it('Skeleton.List default gap=3 -> gap-3', () => {
    const { container } = render(<Skeleton.List rows={2} />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('gap-3');
  });

  it('Skeleton.List rows=0 renders no row containers (still valid root)', () => {
    const { container } = render(<Skeleton.List rows={0} />);
    expect(
      container.querySelectorAll('[data-skeleton-list-row]'),
    ).toHaveLength(0);
    expect(
      container.querySelector('[data-skeleton-sub="list"]'),
    ).not.toBeNull();
  });

  it('Skeleton.List root carries role=status + aria-hidden for screen readers', () => {
    const { container } = render(<Skeleton.List rows={2} />);
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute('role')).toBe('status');
    expect(root.getAttribute('aria-hidden')).toBe('true');
  });

  it('Skeleton.List merges caller className with built-in classes', () => {
    const { container } = render(
      <Skeleton.List rows={1} className="custom-list" />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('custom-list');
    expect(root.className).toContain('flex-col');
  });
});

// (v1.11.312, TODO 11.294) New ChipSkeleton variant + dispatch
// aliases (AvatarSkeleton + TableRowSkeleton).

describe('<ChipSkeleton>', () => {
  it('renders a rounded-full pill with role=status + aria-hidden', () => {
    const { container } = render(<ChipSkeleton />);
    const node = container.firstChild as HTMLElement;
    expect(node.getAttribute('role')).toBe('status');
    expect(node.getAttribute('aria-hidden')).toBe('true');
    expect(node.className).toContain('rounded-full');
  });

  it('exposes data-section="chip-skeleton" + data-skeleton-shape="chip"', () => {
    const { container } = render(<ChipSkeleton />);
    const node = container.firstChild as HTMLElement;
    expect(node.getAttribute('data-section')).toBe('chip-skeleton');
    expect(node.getAttribute('data-skeleton-shape')).toBe('chip');
  });

  it('default size="md" applies the matching height + width', () => {
    const { container } = render(<ChipSkeleton />);
    const node = container.firstChild as HTMLElement;
    expect(node.style.height).toBe('1.125rem');
    expect(node.style.width).toBe('4rem');
    expect(node.getAttribute('data-chip-skeleton-size')).toBe('md');
  });

  it('size="sm" applies the smaller height + width', () => {
    const { container } = render(<ChipSkeleton size="sm" />);
    const node = container.firstChild as HTMLElement;
    expect(node.style.height).toBe('0.875rem');
    expect(node.style.width).toBe('3rem');
    expect(node.getAttribute('data-chip-skeleton-size')).toBe('sm');
  });

  it('size="lg" applies the larger height + width', () => {
    const { container } = render(<ChipSkeleton size="lg" />);
    const node = container.firstChild as HTMLElement;
    expect(node.style.height).toBe('1.5rem');
    expect(node.style.width).toBe('5rem');
  });

  it('custom width prop overrides the size default', () => {
    const { container } = render(<ChipSkeleton width="8rem" />);
    const node = container.firstChild as HTMLElement;
    expect(node.style.width).toBe('8rem');
  });

  it('numeric width coerces to px', () => {
    const { container } = render(<ChipSkeleton width={120} />);
    const node = container.firstChild as HTMLElement;
    expect(node.style.width).toBe('120px');
  });

  it('merges caller className onto the surface', () => {
    const { container } = render(
      <ChipSkeleton className="my-chip" />,
    );
    expect((container.firstChild as HTMLElement).className).toContain(
      'my-chip',
    );
  });

  it('exposes a stable displayName for devtools', () => {
    expect(ChipSkeleton.displayName).toBe('ChipSkeleton');
  });
});

describe('AvatarSkeleton + TableRowSkeleton aliases', () => {
  it('AvatarSkeleton is the same component as AvatarShape', () => {
    expect(AvatarSkeleton).toBe(AvatarShape);
  });

  it('AvatarSkeleton renders the avatar shape', () => {
    const { container } = render(<AvatarSkeleton size="md" />);
    const node = container.firstChild as HTMLElement;
    expect(node.getAttribute('data-skeleton-shape')).toBe('avatar');
    expect(node.getAttribute('data-avatar-size')).toBe('md');
  });

  it('TableRowSkeleton is the same component as TableRowShape', () => {
    expect(TableRowSkeleton).toBe(TableRowShape);
  });

  it('TableRowSkeleton renders the table-row shape', () => {
    const { container } = render(<TableRowSkeleton columns={3} />);
    const node = container.firstChild as HTMLElement;
    expect(node.getAttribute('data-skeleton-shape')).toBe('table-row');
    const cells = node.querySelectorAll('[data-table-row-cell]');
    expect(cells).toHaveLength(3);
  });
});
