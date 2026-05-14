import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListItem } from './list-item';

describe('<ListItem>', () => {
  it('renders the title text', () => {
    render(<ListItem title="hello world" />);
    expect(screen.getByText('hello world')).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(<ListItem title="t" description="some description" />);
    expect(screen.getByText('some description')).toBeInTheDocument();
  });

  it('omits the description element when absent', () => {
    const { container } = render(<ListItem title="t" />);
    expect(container.querySelectorAll('span').length).toBeGreaterThan(0);
    expect(container.querySelector('.line-clamp-2')).toBeNull();
    expect(container.querySelector('.line-clamp-1')).toBeNull();
  });

  it('renders the leading slot', () => {
    render(
      <ListItem
        title="t"
        leading={<span data-testid="lead">L</span>}
      />,
    );
    expect(screen.getByTestId('lead')).toBeInTheDocument();
  });

  it('renders the trailing slot', () => {
    render(
      <ListItem
        title="t"
        trailing={<span data-testid="trail">T</span>}
      />,
    );
    expect(screen.getByTestId('trail')).toBeInTheDocument();
  });

  it('fires onClick when interactive', async () => {
    const onClick = vi.fn();
    render(<ListItem title="t" onClick={onClick} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn();
    render(<ListItem title="t" onClick={onClick} disabled />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies active class set when active', () => {
    render(<ListItem title="t" onClick={() => {}} active />);
    const el = screen.getByRole('button');
    expect(el.className).toContain('bg-muted');
    expect(el.className).toContain('ring-1');
    expect(el.getAttribute('aria-current')).toBe('true');
  });

  it('renders an anchor when href is provided', () => {
    render(<ListItem title="t" href="/somewhere" />);
    const el = screen.getByRole('link');
    expect(el.tagName).toBe('A');
    expect(el.getAttribute('href')).toBe('/somewhere');
  });

  it('applies sm padding/font classes when size is sm', () => {
    render(<ListItem title="t" size="sm" />);
    const el = screen.getByRole('listitem');
    expect(el.className).toContain('px-2');
    expect(el.className).toContain('py-1.5');
    const titleEl = screen.getByText('t');
    expect(titleEl.className).toContain('text-xs');
  });

  it('applies line-clamp-1 when descriptionLines=1', () => {
    const { container } = render(
      <ListItem title="t" description="d" descriptionLines={1} />,
    );
    expect(container.querySelector('.line-clamp-1')).not.toBeNull();
    expect(container.querySelector('.line-clamp-2')).toBeNull();
  });

  it('applies line-clamp-2 by default', () => {
    const { container } = render(<ListItem title="t" description="d" />);
    expect(container.querySelector('.line-clamp-2')).not.toBeNull();
  });

  it('merges caller className with root element', () => {
    const { container } = render(<ListItem title="t" className="my-extra" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('my-extra');
    expect(el.className).toContain('flex');
  });

  it('forwards ref to a div root by default', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ListItem title="t" ref={ref as unknown as React.Ref<HTMLDivElement>} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('DIV');
  });

  it('forwards ref to a button when onClick is provided', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <ListItem
        title="t"
        onClick={() => {}}
        ref={ref as unknown as React.Ref<HTMLButtonElement>}
      />,
    );
    expect(ref.current?.tagName).toBe('BUTTON');
  });

  it('forwards ref to an anchor when href is provided', () => {
    const ref = createRef<HTMLAnchorElement>();
    render(
      <ListItem
        title="t"
        href="/x"
        ref={ref as unknown as React.Ref<HTMLAnchorElement>}
      />,
    );
    expect(ref.current?.tagName).toBe('A');
  });

  it('drops href when disabled to prevent navigation', () => {
    const { container } = render(<ListItem title="t" href="/somewhere" disabled />);
    const el = container.querySelector('a') as HTMLElement;
    expect(el.getAttribute('href')).toBeNull();
    expect(el.getAttribute('aria-disabled')).toBe('true');
  });
});
