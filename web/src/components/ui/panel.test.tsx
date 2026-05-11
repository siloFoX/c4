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
});
