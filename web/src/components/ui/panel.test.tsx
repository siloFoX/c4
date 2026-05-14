import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { Panel } from './panel';

describe('<Panel>', () => {
  it('renders the children inside a bordered surface', () => {
    render(<Panel data-testid="p">body</Panel>);
    const node = screen.getByTestId('p');
    expect(node).toHaveClass('rounded-lg');
    expect(node).toHaveClass('border');
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  it('omits the header when no icon / title / action is given', () => {
    render(<Panel data-testid="p">body</Panel>);
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  it('renders the title as an <h3> when provided', () => {
    render(<Panel title="My Panel">body</Panel>);
    const heading = screen.getByRole('heading', { level: 3, name: 'My Panel' });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe('H3');
  });

  it('renders the icon node in the header when provided', () => {
    render(
      <Panel icon={<svg data-testid="i" />} title="x">
        body
      </Panel>,
    );
    expect(screen.getByTestId('i')).toBeInTheDocument();
  });

  it('renders the action node in the header when provided', () => {
    render(
      <Panel title="x" action={<button>Refresh</button>}>
        body
      </Panel>,
    );
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('still renders the header when only the action is provided (no title / icon)', () => {
    render(<Panel action={<button>Only</button>}>body</Panel>);
    expect(screen.getByRole('button', { name: 'Only' })).toBeInTheDocument();
  });

  it('merges caller-provided className', () => {
    render(<Panel data-testid="p" className="extra-tag">body</Panel>);
    expect(screen.getByTestId('p')).toHaveClass('extra-tag');
  });

  it('forwards a ref to the underlying <div>', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Panel ref={ref}>body</Panel>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('exposes a stable displayName', () => {
    expect(Panel.displayName).toBe('Panel');
  });

  it('renders the action node in the right slot to the right of the title', () => {
    render(
      <Panel title="My Panel" action={<button>Go</button>}>
        body
      </Panel>,
    );
    const heading = screen.getByRole('heading', { level: 3, name: 'My Panel' });
    const button = screen.getByRole('button', { name: 'Go' });
    const headerRow = heading.parentElement?.parentElement;
    expect(headerRow).not.toBeNull();
    expect(headerRow).toHaveClass('justify-between');
    expect(headerRow).toContainElement(button);
    const buttonWrapper = button.parentElement as HTMLElement;
    expect(buttonWrapper).toHaveClass('shrink-0');
    const titleColumn = heading.parentElement as HTMLElement;
    const children = Array.from(headerRow!.children);
    expect(children.indexOf(titleColumn)).toBeLessThan(children.indexOf(buttonWrapper));
  });

  it('renders the description as a <p> with muted classes when provided', () => {
    render(
      <Panel title="My Panel" description="A subtitle below the title">
        body
      </Panel>,
    );
    const desc = screen.getByText('A subtitle below the title');
    expect(desc.tagName).toBe('P');
    expect(desc).toHaveClass('text-sm');
    expect(desc).toHaveClass('text-muted-foreground');
  });

  it('omits the description paragraph when description is not provided', () => {
    const { container } = render(<Panel title="x">body</Panel>);
    expect(container.querySelector('p')).toBeNull();
  });

  it('renders breadcrumbs as a <nav aria-label="Breadcrumb"> with the right links and labels', () => {
    render(
      <Panel
        title="Detail"
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Workers', href: '/workers' },
          { label: 'auto-w1' },
        ]}
      >
        body
      </Panel>,
    );
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toBeInTheDocument();
    const links = nav.querySelectorAll('a');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent('Home');
    expect(links[0]).toHaveAttribute('href', '/');
    expect(links[1]).toHaveTextContent('Workers');
    expect(links[1]).toHaveAttribute('href', '/workers');
    expect(nav).toHaveTextContent('auto-w1');
    const separators = nav.querySelectorAll('[aria-hidden="true"]');
    expect(separators).toHaveLength(2);
    separators.forEach((s) => expect(s.textContent).toBe('/'));
  });

  it('omits the breadcrumb nav when breadcrumbs is an empty array', () => {
    render(
      <Panel title="x" breadcrumbs={[]}>
        body
      </Panel>,
    );
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
  });

  it('renders only breadcrumbs / description without an old-header row when title is omitted', () => {
    render(
      <Panel
        description="just a description"
        breadcrumbs={[{ label: 'Root' }]}
      >
        body
      </Panel>,
    );
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByText('just a description').tagName).toBe('P');
  });
});
