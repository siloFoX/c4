import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { VisuallyHidden } from './visually-hidden';

describe('<VisuallyHidden>', () => {
  it('renders a <span> element carrying the children as accessible text', () => {
    render(<VisuallyHidden>Refresh</VisuallyHidden>);
    const node = screen.getByText('Refresh');
    expect(node).toBeInTheDocument();
    expect(node.tagName).toBe('SPAN');
  });

  it('applies the `sr-only` Tailwind utility class', () => {
    render(<VisuallyHidden data-testid="vh">x</VisuallyHidden>);
    expect(screen.getByTestId('vh')).toHaveClass('sr-only');
  });

  it('merges caller-provided className without dropping `sr-only`', () => {
    render(
      <VisuallyHidden data-testid="vh" className="some-extra-class">
        x
      </VisuallyHidden>,
    );
    const node = screen.getByTestId('vh');
    expect(node).toHaveClass('sr-only');
    expect(node).toHaveClass('some-extra-class');
  });

  it('forwards arbitrary HTML attributes (data-* / aria-*) to the span', () => {
    render(
      <VisuallyHidden data-testid="vh" aria-label="hidden-label" id="vh-1">
        x
      </VisuallyHidden>,
    );
    const node = screen.getByTestId('vh');
    expect(node).toHaveAttribute('aria-label', 'hidden-label');
    expect(node).toHaveAttribute('id', 'vh-1');
  });

  it('forwards a ref to the underlying <span> element', () => {
    const ref = createRef<HTMLSpanElement>();
    render(<VisuallyHidden ref={ref}>x</VisuallyHidden>);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });

  it('supports interpolated and nested children', () => {
    render(
      <VisuallyHidden>
        Edit {'row-42'}
      </VisuallyHidden>,
    );
    // RTL collapses adjacent text nodes; assert the textContent
    // round-trip rather than a literal segment match.
    const node = screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'Edit row-42');
    expect(node).toBeInTheDocument();
  });

  it('exposes a stable displayName', () => {
    expect(VisuallyHidden.displayName).toBe('VisuallyHidden');
  });

  it('continues to be queryable by the `.sr-only` selector (legacy contract)', () => {
    // Existing tests in the project (e.g. Spinner.test.tsx) reach for
    // `node.querySelector('.sr-only')`. The primitive must keep that
    // contract intact so adoption does not require a sweep of test
    // selectors.
    const { container } = render(
      <div>
        <VisuallyHidden>Loading workers</VisuallyHidden>
      </div>,
    );
    const found = container.querySelector('.sr-only');
    expect(found).not.toBeNull();
    expect(found?.textContent).toBe('Loading workers');
  });
});
