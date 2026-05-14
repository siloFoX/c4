import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { renderSnippet } from './snippet';

describe('renderSnippet', () => {
  it('returns the input untouched when the snippet is an empty string', () => {
    expect(renderSnippet('')).toBe('');
  });

  it('renders the same text when there are no <<…>> markers (no <span> emitted)', () => {
    const result = renderSnippet('plain text with no markers');
    const { container } = render(<>{result}</>);
    expect(container).toHaveTextContent('plain text with no markers');
    expect(container.querySelectorAll('span')).toHaveLength(0);
  });

  it('wraps each token in a highlighted <span> while preserving surrounding text', () => {
    const result = renderSnippet('hello <<world>>');
    const { container } = render(<>{result}</>);
    expect(container).toHaveTextContent('hello world');
    const spans = container.querySelectorAll('span');
    expect(spans).toHaveLength(1);
    expect(spans[0]).toHaveTextContent('world');
    expect(spans[0]?.className).toContain('amber');
  });

  it('emits multiple highlighted spans when the snippet has multiple tokens', () => {
    const result = renderSnippet('<<foo>> in the <<bar>> baz');
    const { container } = render(<>{result}</>);
    expect(container).toHaveTextContent('foo in the bar baz');
    const spans = container.querySelectorAll('span');
    expect(spans).toHaveLength(2);
    expect(spans[0]).toHaveTextContent('foo');
    expect(spans[1]).toHaveTextContent('bar');
  });

  it('supports tokens at the very start and end of the snippet', () => {
    const result = renderSnippet('<<head>> middle <<tail>>');
    const { container } = render(<>{result}</>);
    expect(container).toHaveTextContent('head middle tail');
    const spans = container.querySelectorAll('span');
    expect(spans).toHaveLength(2);
    expect(spans[0]).toHaveTextContent('head');
    expect(spans[1]).toHaveTextContent('tail');
  });

  it('treats unmatched << without a closing >> as plain text (no <span> emitted)', () => {
    const result = renderSnippet('lonely << marker without close');
    const { container } = render(<>{result}</>);
    expect(container).toHaveTextContent('lonely << marker without close');
    expect(container.querySelectorAll('span')).toHaveLength(0);
  });

  it('renders adjacent tokens with no separator as two consecutive spans', () => {
    const result = renderSnippet('<<a>><<b>>');
    const { container } = render(<>{result}</>);
    expect(container).toHaveTextContent('ab');
    const spans = container.querySelectorAll('span');
    expect(spans).toHaveLength(2);
    expect(spans[0]).toHaveTextContent('a');
    expect(spans[1]).toHaveTextContent('b');
  });

  it('preserves whitespace inside a token verbatim', () => {
    const result = renderSnippet('left <<  spaced  >> right');
    const { container } = render(<>{result}</>);
    const spans = container.querySelectorAll('span');
    expect(spans).toHaveLength(1);
    expect(spans[0]?.textContent).toBe('  spaced  ');
  });

  it('emits each highlighted span with the amber utility classes', () => {
    const result = renderSnippet('hello <<world>>');
    const { container } = render(<>{result}</>);
    const span = container.querySelector('span');
    expect(span?.className).toContain('bg-amber-500/20');
    expect(span?.className).toContain('text-amber-700');
    expect(span?.className).toContain('dark:text-amber-300');
  });

  it('assigns a stable unique key to each emitted span (no React key warnings expected)', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = renderSnippet('<<one>> <<two>> <<three>>');
      const { container } = render(<>{result}</>);
      expect(container.querySelectorAll('span')).toHaveLength(3);
      const keyMsg = warn.mock.calls
        .map((args) => String(args[0] ?? ''))
        .find((m) => m.includes('unique "key" prop'));
      expect(keyMsg).toBeUndefined();
    } finally {
      warn.mockRestore();
    }
  });

  it('returns the original empty string (falsy short-circuit) unchanged in type', () => {
    // The empty-string short-circuit returns the input directly so
    // renderSnippet('') stays a string, distinct from the array path.
    const result = renderSnippet('');
    expect(typeof result).toBe('string');
    expect(result).toBe('');
  });
});
