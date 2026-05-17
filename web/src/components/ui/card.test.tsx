import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card';

describe('<Card>', () => {
  it('renders a <div> with the provided children', () => {
    render(<Card>body</Card>);
    expect(screen.getByText('body')).toBeInTheDocument();
    expect(screen.getByText('body').tagName).toBe('DIV');
  });

  it('applies the card surface classes (rounded + border + bg-card)', () => {
    render(<Card data-testid="c">x</Card>);
    const node = screen.getByTestId('c');
    expect(node).toHaveClass('rounded-xl');
    expect(node).toHaveClass('bg-card');
  });

  it('merges caller-provided className with the surface classes', () => {
    render(<Card data-testid="c" className="extra-tag">x</Card>);
    expect(screen.getByTestId('c')).toHaveClass('extra-tag');
  });

  it('forwards a ref to the underlying <div>', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Card ref={ref}>x</Card>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('exposes a stable displayName', () => {
    expect(Card.displayName).toBe('Card');
  });
});

// (v1.11.143) interactive prop: opt-in pointer + keyboard activation
// surface. Default (omitted/false) keeps the static-container shape -
// no class delta, no a11y attribute injection - so the pre-existing
// snapshots and downstream consumers remain unchanged.
describe('<Card interactive>', () => {
  it('without interactive, omits hover-lift / active-press / focus-ring classes', () => {
    render(<Card data-testid="c">x</Card>);
    const node = screen.getByTestId('c');
    expect(node).not.toHaveClass('cursor-pointer');
    expect(node).not.toHaveClass('hover:shadow-md');
    expect(node).not.toHaveClass('active:shadow-sm');
    expect(node).not.toHaveClass('focus-visible:ring-2');
  });

  it('without interactive, does not set role or tabIndex', () => {
    render(<Card data-testid="c">x</Card>);
    const node = screen.getByTestId('c');
    expect(node).not.toHaveAttribute('role');
    expect(node).not.toHaveAttribute('tabindex');
  });

  it('with interactive, adds cursor-pointer + hover/active shadow + focus-visible ring classes', () => {
    render(<Card data-testid="c" interactive>x</Card>);
    const node = screen.getByTestId('c');
    expect(node).toHaveClass('cursor-pointer');
    expect(node).toHaveClass('hover:shadow-md');
    expect(node).toHaveClass('active:shadow-sm');
    expect(node).toHaveClass('focus-visible:outline-none');
    expect(node).toHaveClass('focus-visible:ring-2');
    expect(node).toHaveClass('focus-visible:ring-primary');
    expect(node).toHaveClass('focus-visible:ring-offset-2');
  });

  it('with interactive, applies motion-safe hover/active translate classes for the lift', () => {
    render(<Card data-testid="c" interactive>x</Card>);
    const node = screen.getByTestId('c');
    expect(node).toHaveClass('motion-safe:hover:-translate-y-0.5');
    expect(node).toHaveClass('motion-safe:active:translate-y-0');
  });

  it('with interactive, sets role=button and tabIndex=0 for keyboard reachability', () => {
    render(<Card data-testid="c" interactive>x</Card>);
    const node = screen.getByTestId('c');
    expect(node).toHaveAttribute('role', 'button');
    expect(node).toHaveAttribute('tabindex', '0');
  });

  it('with interactive, lets the caller override role + tabIndex when needed', () => {
    render(
      <Card data-testid="c" interactive role="link" tabIndex={-1}>x</Card>,
    );
    const node = screen.getByTestId('c');
    expect(node).toHaveAttribute('role', 'link');
    expect(node).toHaveAttribute('tabindex', '-1');
  });

  it('clicking an interactive Card fires onClick', () => {
    const handler = vi.fn();
    render(
      <Card data-testid="c" interactive onClick={handler}>x</Card>,
    );
    fireEvent.click(screen.getByTestId('c'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('pressing Enter on an interactive Card fires onClick', () => {
    const handler = vi.fn();
    render(
      <Card data-testid="c" interactive onClick={handler}>x</Card>,
    );
    fireEvent.keyDown(screen.getByTestId('c'), { key: 'Enter' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('pressing Space on an interactive Card also fires onClick (button-like activation)', () => {
    const handler = vi.fn();
    render(
      <Card data-testid="c" interactive onClick={handler}>x</Card>,
    );
    fireEvent.keyDown(screen.getByTestId('c'), { key: ' ' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('pressing Enter on a NON-interactive Card does not auto-fire onClick', () => {
    const handler = vi.fn();
    render(
      <Card data-testid="c" onClick={handler}>x</Card>,
    );
    fireEvent.keyDown(screen.getByTestId('c'), { key: 'Enter' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('forwards caller-provided onKeyDown alongside the Enter/Space activation wiring', () => {
    const onKey = vi.fn();
    const onClick = vi.fn();
    render(
      <Card data-testid="c" interactive onClick={onClick} onKeyDown={onKey}>
        x
      </Card>,
    );
    fireEvent.keyDown(screen.getByTestId('c'), { key: 'Enter' });
    expect(onKey).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('if the caller-provided onKeyDown calls preventDefault, onClick is suppressed', () => {
    const onClick = vi.fn();
    render(
      <Card
        data-testid="c"
        interactive
        onClick={onClick}
        onKeyDown={(e) => e.preventDefault()}
      >
        x
      </Card>,
    );
    fireEvent.keyDown(screen.getByTestId('c'), { key: 'Enter' });
    expect(onClick).not.toHaveBeenCalled();
  });
});

// (v1.11.239) tone variants: subdued background tint + matching
// border using ARPS tokens. 'default' (or omitted) is byte-identical
// to the prior bg-card / border-border surface.
describe('<Card tone>', () => {
  it('omitted tone keeps the default bg-card + border-border surface', () => {
    render(<Card data-testid="c">x</Card>);
    const node = screen.getByTestId('c');
    expect(node).toHaveClass('bg-card');
    expect(node).toHaveClass('border-border');
    expect(node).not.toHaveClass('bg-success/5');
    expect(node).not.toHaveClass('bg-warning/5');
    expect(node).not.toHaveClass('bg-destructive/5');
  });

  it("tone='default' renders the same as omitted", () => {
    render(<Card data-testid="c" tone="default">x</Card>);
    const node = screen.getByTestId('c');
    expect(node).toHaveClass('bg-card');
    expect(node).toHaveClass('border-border');
  });

  it("tone='success' renders with success tint + border", () => {
    render(<Card data-testid="c" tone="success">x</Card>);
    const node = screen.getByTestId('c');
    expect(node).toHaveClass('bg-success/5');
    expect(node).toHaveClass('border-success/30');
    expect(node).not.toHaveClass('bg-card');
    expect(node).not.toHaveClass('border-border');
  });

  it("tone='warning' renders with warning tint + border", () => {
    render(<Card data-testid="c" tone="warning">x</Card>);
    const node = screen.getByTestId('c');
    expect(node).toHaveClass('bg-warning/5');
    expect(node).toHaveClass('border-warning/30');
    expect(node).not.toHaveClass('bg-card');
  });

  it("tone='danger' renders with destructive tint + border", () => {
    render(<Card data-testid="c" tone="danger">x</Card>);
    const node = screen.getByTestId('c');
    expect(node).toHaveClass('bg-destructive/5');
    expect(node).toHaveClass('border-destructive/30');
    expect(node).not.toHaveClass('bg-card');
  });

  it('custom className still passes through alongside a tone', () => {
    render(
      <Card data-testid="c" tone="success" className="extra-tag">x</Card>,
    );
    const node = screen.getByTestId('c');
    expect(node).toHaveClass('extra-tag');
    expect(node).toHaveClass('bg-success/5');
  });

  it('tone composes with interactive (keeps focus-ring + cursor)', () => {
    render(
      <Card data-testid="c" tone="warning" interactive>x</Card>,
    );
    const node = screen.getByTestId('c');
    expect(node).toHaveClass('bg-warning/5');
    expect(node).toHaveClass('cursor-pointer');
    expect(node).toHaveClass('focus-visible:ring-2');
  });
});

describe('<CardHeader>', () => {
  it('renders the children inside a flex column container', () => {
    render(<CardHeader data-testid="h"><span>title</span></CardHeader>);
    const h = screen.getByTestId('h');
    expect(h).toHaveClass('flex');
    expect(h).toHaveClass('flex-col');
    expect(h).toHaveClass('p-6');
  });
  it('exposes the correct displayName', () => {
    expect(CardHeader.displayName).toBe('CardHeader');
  });
});

describe('<CardTitle>', () => {
  it('renders text with semibold + tracking-tight typography classes', () => {
    render(<CardTitle data-testid="t">Title</CardTitle>);
    const node = screen.getByTestId('t');
    expect(node).toHaveTextContent('Title');
    expect(node).toHaveClass('font-semibold');
    expect(node).toHaveClass('tracking-tight');
  });
});

describe('<CardDescription>', () => {
  it('renders muted text', () => {
    render(<CardDescription data-testid="d">desc</CardDescription>);
    const node = screen.getByTestId('d');
    expect(node).toHaveTextContent('desc');
    expect(node).toHaveClass('text-muted-foreground');
  });
});

describe('<CardContent>', () => {
  it('renders the body with p-6 + pt-0 padding', () => {
    render(<CardContent data-testid="c">body</CardContent>);
    const node = screen.getByTestId('c');
    expect(node).toHaveClass('p-6');
    expect(node).toHaveClass('pt-0');
  });
});

describe('<CardFooter>', () => {
  it('renders an items-center flex row with p-6 + pt-0 padding', () => {
    render(<CardFooter data-testid="f">foot</CardFooter>);
    const node = screen.getByTestId('f');
    expect(node).toHaveClass('flex');
    expect(node).toHaveClass('items-center');
    expect(node).toHaveClass('p-6');
    expect(node).toHaveClass('pt-0');
  });
});

// (v1.11.311, TODO 11.293) Link-mode + disabled state + data
// selectors.

describe('<Card> link mode', () => {
  it('renders as <a> when href is set', () => {
    const { container } = render(
      <Card href="/workers/auto-w1" data-testid="c">
        body
      </Card>,
    );
    const anchor = container.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor!.getAttribute('href')).toBe('/workers/auto-w1');
  });

  it('link-mode card is interactive by default (no explicit interactive)', () => {
    const { container } = render(
      <Card href="/x" data-testid="c">
        body
      </Card>,
    );
    const anchor = container.querySelector('a') as HTMLElement;
    expect(anchor.className).toMatch(/cursor-pointer/);
    expect(anchor.getAttribute('data-interactive')).toBe('true');
    expect(anchor.getAttribute('data-mode')).toBe('link');
  });

  it('link-mode + target + rel pass through onto the anchor', () => {
    const { container } = render(
      <Card href="https://example.com" target="_blank" rel="noreferrer">
        body
      </Card>,
    );
    const anchor = container.querySelector('a') as HTMLAnchorElement;
    expect(anchor.target).toBe('_blank');
    expect(anchor.rel).toBe('noreferrer');
  });

  it('link-mode + disabled drops the href + sets aria-disabled', () => {
    const { container } = render(
      <Card href="/x" disabled>
        body
      </Card>,
    );
    const anchor = container.querySelector('a') as HTMLAnchorElement;
    expect(anchor.hasAttribute('href')).toBe(false);
    expect(anchor.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('<Card> disabled state', () => {
  it('disabled drops the interactive affordances', () => {
    const { container } = render(
      <Card interactive disabled data-testid="c">
        body
      </Card>,
    );
    const card = container.querySelector('[data-section="card"]') as HTMLElement;
    expect(card.className).toMatch(/cursor-not-allowed/);
    expect(card.className).toMatch(/opacity-60/);
    expect(card.className).not.toMatch(/cursor-pointer/);
    expect(card.getAttribute('data-disabled')).toBe('true');
    expect(card.getAttribute('data-interactive')).toBe('false');
  });

  it('disabled suppresses the onClick handler', () => {
    const onClick = vi.fn();
    const { container } = render(
      <Card interactive disabled onClick={onClick}>
        body
      </Card>,
    );
    const card = container.querySelector('[data-section="card"]') as HTMLElement;
    card.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disabled sets aria-disabled="true" on the wrapper', () => {
    const { container } = render(
      <Card interactive disabled>
        body
      </Card>,
    );
    const card = container.querySelector('[data-section="card"]') as HTMLElement;
    expect(card.getAttribute('aria-disabled')).toBe('true');
  });

  it('disabled + non-interactive card still shows the disabled chrome', () => {
    const { container } = render(<Card disabled>body</Card>);
    const card = container.querySelector('[data-section="card"]') as HTMLElement;
    expect(card.className).toMatch(/opacity-60/);
  });
});

describe('<Card> data-section selectors', () => {
  it('exposes data-section="card" on every render', () => {
    const { container } = render(<Card>body</Card>);
    expect(
      container.querySelector('[data-section="card"]'),
    ).not.toBeNull();
  });

  it('data-interactive reflects the interactive prop (no link, no disabled)', () => {
    const { container, rerender } = render(<Card>body</Card>);
    const get = () =>
      container.querySelector('[data-section="card"]') as HTMLElement;
    expect(get().getAttribute('data-interactive')).toBe('false');
    rerender(<Card interactive>body</Card>);
    expect(get().getAttribute('data-interactive')).toBe('true');
  });
});
