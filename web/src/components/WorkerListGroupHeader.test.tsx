import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WorkerListGroupHeader from './WorkerListGroupHeader';

// WorkerListGroupHeader is pure display — no hooks of its own,
// no locale-aware copy. The parent (WorkerList) supplies the
// translated label, the count, the icon variant, the accent
// theme, the open/closed state, and the onToggle callback. Every
// test drives the prop union directly with vi.fn() callbacks and
// asserts the rendered structure, the chevron flip, the
// aria-expanded forwarding, and the callback wiring on click.

type IconKind = 'crown' | 'wrench';
type Accent = 'primary' | 'muted';

interface RenderOpts {
  open?: boolean;
  label?: string;
  count?: number;
  icon?: IconKind;
  accent?: Accent;
  onToggle?: () => void;
}

function renderView(over: RenderOpts = {}) {
  const onToggle = over.onToggle ?? vi.fn();
  const props = {
    open: over.open ?? true,
    onToggle,
    label: over.label ?? 'Managers',
    count: over.count ?? 0,
    icon: over.icon ?? ('crown' as IconKind),
    accent: over.accent ?? ('primary' as Accent),
  };
  const utils = render(<WorkerListGroupHeader {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onToggle, props };
}

function getHeader(label = 'Managers'): HTMLButtonElement {
  return screen.getByRole('button', {
    name: new RegExp(label, 'i'),
  }) as HTMLButtonElement;
}

describe('<WorkerListGroupHeader>', () => {
  // ---- default render -------------------------------------------

  it('renders a single button as the group header', () => {
    renderView();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('renders the label text inside the header button', () => {
    renderView({ label: 'Workers' });
    expect(screen.getByText('Workers')).toBeInTheDocument();
  });

  it('renders the count badge with the numeric value', () => {
    renderView({ count: 5 });
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders zero as a valid count badge value', () => {
    renderView({ count: 0 });
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders a large count badge value without truncation', () => {
    renderView({ count: 99 });
    expect(screen.getByText('99')).toBeInTheDocument();
  });

  it('sets type="button" on the header element', () => {
    renderView();
    expect(getHeader()).toHaveAttribute('type', 'button');
  });

  // ---- aria-expanded forwarding ---------------------------------

  it('forwards aria-expanded=true when open=true', () => {
    renderView({ open: true });
    expect(getHeader()).toHaveAttribute('aria-expanded', 'true');
  });

  it('forwards aria-expanded=false when open=false', () => {
    renderView({ open: false });
    expect(getHeader()).toHaveAttribute('aria-expanded', 'false');
  });

  // ---- aria-controls forwarding ---------------------------------

  it('sets aria-controls to a lowercased label-derived id', () => {
    renderView({ label: 'Managers' });
    expect(getHeader()).toHaveAttribute(
      'aria-controls',
      'worker-group-managers',
    );
  });

  it('preserves the lowercased label when it contains spaces', () => {
    renderView({ label: 'Active workers' });
    expect(getHeader('Active workers')).toHaveAttribute(
      'aria-controls',
      'worker-group-active workers',
    );
  });

  // ---- chevron orientation --------------------------------------

  it('renders the down-chevron SVG marker when open=true', () => {
    const { container } = renderView({ open: true });
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the right-chevron SVG marker when open=false', () => {
    const { container } = renderView({ open: false });
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(2);
  });

  it('renders SVG icons inside the header', () => {
    const { container } = renderView();
    const btn = container.querySelector('button') as HTMLElement;
    expect(btn.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);
  });

  it('marks every SVG icon as aria-hidden=true', () => {
    const { container } = renderView();
    const svgs = container.querySelectorAll('svg');
    svgs.forEach((svg) => {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
    });
  });

  // ---- icon variant ---------------------------------------------

  it('renders two icons when icon="crown" (chevron + crown)', () => {
    const { container } = renderView({ icon: 'crown' });
    expect(container.querySelectorAll('svg')).toHaveLength(2);
  });

  it('renders two icons when icon="wrench" (chevron + wrench)', () => {
    const { container } = renderView({ icon: 'wrench' });
    expect(container.querySelectorAll('svg')).toHaveLength(2);
  });

  // ---- accent variant -> class mapping --------------------------

  it('applies the primary accent class when accent="primary"', () => {
    renderView({ accent: 'primary' });
    expect(getHeader().className).toMatch(/text-primary/);
  });

  it('applies the muted accent class when accent="muted"', () => {
    renderView({ accent: 'muted' });
    expect(getHeader().className).toMatch(/text-muted-foreground/);
  });

  it('applies a primary hover background class when accent="primary"', () => {
    renderView({ accent: 'primary' });
    expect(getHeader().className).toMatch(/hover:bg-primary\/5/);
  });

  it('applies an accent hover background class when accent="muted"', () => {
    renderView({ accent: 'muted' });
    expect(getHeader().className).toMatch(/hover:bg-accent\/40/);
  });

  it('applies the primary border class on the count badge when accent="primary"', () => {
    renderView({ accent: 'primary', count: 3 });
    const badge = screen.getByText('3');
    expect(badge.className).toMatch(/border-primary/);
  });

  it('applies the muted border class on the count badge when accent="muted"', () => {
    renderView({ accent: 'muted', count: 3 });
    const badge = screen.getByText('3');
    expect(badge.className).toMatch(/border-border/);
  });

  // ---- onToggle dispatch ----------------------------------------

  it('fires onToggle exactly once when the header is clicked', async () => {
    const { user, onToggle } = renderView();
    await user.click(getHeader());
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('fires onToggle on each click for repeated clicks', async () => {
    const { user, onToggle } = renderView();
    await user.click(getHeader());
    await user.click(getHeader());
    await user.click(getHeader());
    expect(onToggle).toHaveBeenCalledTimes(3);
  });

  it('fires onToggle when clicking on the label text inside the button', async () => {
    const { user, onToggle } = renderView({ label: 'TargetLabel' });
    await user.click(screen.getByText('TargetLabel'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('fires onToggle when clicking on the count badge inside the button', async () => {
    const { user, onToggle } = renderView({ count: 12 });
    await user.click(screen.getByText('12'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  // ---- keyboard handling ----------------------------------------

  it('fires onToggle when the focused header receives Enter', async () => {
    const { user, onToggle } = renderView();
    getHeader().focus();
    await user.keyboard('{Enter}');
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('fires onToggle when the focused header receives Space', async () => {
    const { user, onToggle } = renderView();
    getHeader().focus();
    await user.keyboard(' ');
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('focuses the header on the first Tab press', async () => {
    const { user } = renderView();
    await user.tab();
    expect(getHeader()).toHaveFocus();
  });

  // ---- count badge layout ---------------------------------------

  it('positions the count badge as the last child of the header (ml-auto)', () => {
    renderView({ count: 7 });
    const badge = screen.getByText('7');
    expect(badge.className).toMatch(/ml-auto/);
  });

  it('renders the label with semibold class', () => {
    renderView({ label: 'BoldLabel' });
    expect(screen.getByText('BoldLabel')).toHaveClass('font-semibold');
  });

  // ---- prop variations / rerender stability ---------------------

  it('flips the aria-expanded attribute when open transitions true->false on rerender', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <WorkerListGroupHeader
        open={true}
        onToggle={onToggle}
        label="Workers"
        count={2}
        icon="wrench"
        accent="muted"
      />,
    );
    expect(getHeader('Workers')).toHaveAttribute('aria-expanded', 'true');
    rerender(
      <WorkerListGroupHeader
        open={false}
        onToggle={onToggle}
        label="Workers"
        count={2}
        icon="wrench"
        accent="muted"
      />,
    );
    expect(getHeader('Workers')).toHaveAttribute('aria-expanded', 'false');
  });

  it('updates the count badge when the count prop changes on rerender', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <WorkerListGroupHeader
        open={true}
        onToggle={onToggle}
        label="Workers"
        count={1}
        icon="wrench"
        accent="muted"
      />,
    );
    expect(screen.getByText('1')).toBeInTheDocument();
    rerender(
      <WorkerListGroupHeader
        open={true}
        onToggle={onToggle}
        label="Workers"
        count={4}
        icon="wrench"
        accent="muted"
      />,
    );
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('updates the label when the label prop changes on rerender', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <WorkerListGroupHeader
        open={true}
        onToggle={onToggle}
        label="Workers"
        count={2}
        icon="wrench"
        accent="muted"
      />,
    );
    expect(screen.getByText('Workers')).toBeInTheDocument();
    rerender(
      <WorkerListGroupHeader
        open={true}
        onToggle={onToggle}
        label="Managers"
        count={2}
        icon="crown"
        accent="primary"
      />,
    );
    expect(screen.queryByText('Workers')).not.toBeInTheDocument();
    expect(screen.getByText('Managers')).toBeInTheDocument();
  });

  it('flips the accent classes when the accent prop changes on rerender', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <WorkerListGroupHeader
        open={true}
        onToggle={onToggle}
        label="Workers"
        count={2}
        icon="wrench"
        accent="muted"
      />,
    );
    expect(getHeader('Workers').className).toMatch(/text-muted-foreground/);
    rerender(
      <WorkerListGroupHeader
        open={true}
        onToggle={onToggle}
        label="Workers"
        count={2}
        icon="wrench"
        accent="primary"
      />,
    );
    expect(getHeader('Workers').className).toMatch(/text-primary/);
  });

  it('keeps a stable single-button DOM after rerendering with identical props', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <WorkerListGroupHeader
        open={true}
        onToggle={onToggle}
        label="Workers"
        count={2}
        icon="wrench"
        accent="muted"
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    rerender(
      <WorkerListGroupHeader
        open={true}
        onToggle={onToggle}
        label="Workers"
        count={2}
        icon="wrench"
        accent="muted"
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('does NOT fire onToggle when only the count prop changes on rerender', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <WorkerListGroupHeader
        open={true}
        onToggle={onToggle}
        label="Workers"
        count={1}
        icon="wrench"
        accent="muted"
      />,
    );
    rerender(
      <WorkerListGroupHeader
        open={true}
        onToggle={onToggle}
        label="Workers"
        count={9}
        icon="wrench"
        accent="muted"
      />,
    );
    expect(onToggle).not.toHaveBeenCalled();
  });

  // ---- combined permutations ------------------------------------

  it('renders a primary/crown/open header (managers, expanded)', () => {
    renderView({
      open: true,
      label: 'Managers',
      count: 3,
      icon: 'crown',
      accent: 'primary',
    });
    expect(getHeader('Managers')).toHaveAttribute('aria-expanded', 'true');
    expect(getHeader('Managers').className).toMatch(/text-primary/);
  });

  it('renders a muted/wrench/closed header (workers, collapsed)', () => {
    renderView({
      open: false,
      label: 'Workers',
      count: 5,
      icon: 'wrench',
      accent: 'muted',
    });
    expect(getHeader('Workers')).toHaveAttribute('aria-expanded', 'false');
    expect(getHeader('Workers').className).toMatch(/text-muted-foreground/);
  });
});
