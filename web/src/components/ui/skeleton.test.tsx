import { createRef } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  AvatarShape,
  Circle,
  Rect,
  Skeleton,
  StatCardShape,
  TableRowShape,
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
