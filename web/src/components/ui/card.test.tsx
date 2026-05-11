import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
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
