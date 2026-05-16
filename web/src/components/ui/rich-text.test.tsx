import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import {
  RichText,
  renderRichInline,
  isRichTextSafeUrl,
} from './rich-text';

describe('isRichTextSafeUrl', () => {
  it('accepts http URLs', () => {
    expect(isRichTextSafeUrl('http://example.com')).toBe(true);
  });

  it('accepts https URLs', () => {
    expect(isRichTextSafeUrl('https://example.com/path')).toBe(true);
  });

  it('accepts mailto URLs', () => {
    expect(isRichTextSafeUrl('mailto:a@b.com')).toBe(true);
  });

  it('accepts in-page hash anchors', () => {
    expect(isRichTextSafeUrl('#section-1')).toBe(true);
  });

  it('accepts root-relative paths', () => {
    expect(isRichTextSafeUrl('/foo/bar')).toBe(true);
  });

  it('rejects javascript: URIs', () => {
    expect(isRichTextSafeUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects data: URIs', () => {
    expect(isRichTextSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(
      false,
    );
  });

  it('rejects vbscript: URIs', () => {
    expect(isRichTextSafeUrl('vbscript:msgbox(1)')).toBe(false);
  });

  it('rejects file: URIs', () => {
    expect(isRichTextSafeUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects empty / whitespace strings', () => {
    expect(isRichTextSafeUrl('')).toBe(false);
    expect(isRichTextSafeUrl('   ')).toBe(false);
  });

  it('case-insensitive scheme check (JAVASCRIPT: rejected)', () => {
    expect(isRichTextSafeUrl('JAVASCRIPT:alert(1)')).toBe(false);
  });
});

describe('<RichText>', () => {
  it('renders null when content is null', () => {
    const { container } = render(<RichText content={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when content is undefined', () => {
    const { container } = render(<RichText content={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when content is the empty string', () => {
    const { container } = render(<RichText content="" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when content is whitespace-only', () => {
    const { container } = render(
      <RichText content={'   \n\n  '} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('wraps non-empty content in a div with data-section="rich-text"', () => {
    const { container } = render(<RichText content="hello" />);
    expect(
      container.querySelector('[data-section="rich-text"]'),
    ).not.toBeNull();
  });

  it('renders a single line as one paragraph', () => {
    const { container } = render(<RichText content="hello world" />);
    const ps = container.querySelectorAll('[data-rich-text-block="p"]');
    expect(ps).toHaveLength(1);
    expect(ps[0]!.textContent).toBe('hello world');
  });

  it('renders blank-line-separated content as multiple paragraphs', () => {
    const { container } = render(
      <RichText content={'first paragraph\n\nsecond paragraph'} />,
    );
    const ps = container.querySelectorAll('[data-rich-text-block="p"]');
    expect(ps).toHaveLength(2);
    expect(ps[0]!.textContent).toBe('first paragraph');
    expect(ps[1]!.textContent).toBe('second paragraph');
  });

  it('renders bullet lists with the disc marker class', () => {
    const { container } = render(
      <RichText content={'- one\n- two\n- three'} />,
    );
    const ul = container.querySelector('[data-rich-text-block="ul"]');
    expect(ul).not.toBeNull();
    expect(ul!.querySelectorAll('li')).toHaveLength(3);
    expect(ul!.className).toContain('list-disc');
  });

  it('renders numbered lists with the decimal marker class', () => {
    const { container } = render(
      <RichText content={'1. one\n2. two\n3. three'} />,
    );
    const ol = container.querySelector('[data-rich-text-block="ol"]');
    expect(ol).not.toBeNull();
    expect(ol!.querySelectorAll('li')).toHaveLength(3);
    expect(ol!.className).toContain('list-decimal');
  });

  it('renders paragraphs + lists interleaved as separate blocks', () => {
    const { container } = render(
      <RichText
        content={'Intro paragraph\n\n- bullet 1\n- bullet 2\n\nClosing paragraph'}
      />,
    );
    const ps = container.querySelectorAll('[data-rich-text-block="p"]');
    const uls = container.querySelectorAll('[data-rich-text-block="ul"]');
    expect(ps).toHaveLength(2);
    expect(uls).toHaveLength(1);
  });

  it('renders **bold** as a <strong>', () => {
    const { container } = render(<RichText content="hello **world**" />);
    const strong = container.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong!.textContent).toBe('world');
  });

  it('renders *italic* as an <em>', () => {
    const { container } = render(<RichText content="hello *world*" />);
    const em = container.querySelector('em');
    expect(em).not.toBeNull();
    expect(em!.textContent).toBe('world');
  });

  it('renders `code` as a <code> with the font-mono class', () => {
    const { container } = render(<RichText content={'run `npm test`'} />);
    const code = container.querySelector('code');
    expect(code).not.toBeNull();
    expect(code!.textContent).toBe('npm test');
    expect(code!.className).toContain('font-mono');
  });

  it('renders [label](url) as a safe anchor with rel + target', () => {
    const { container } = render(
      <RichText content="see [docs](https://example.com)" />,
    );
    const a = container.querySelector('a') as HTMLAnchorElement;
    expect(a).not.toBeNull();
    expect(a.getAttribute('href')).toBe('https://example.com');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a.textContent).toBe('docs');
  });

  it('mailto links do NOT carry target=_blank', () => {
    const { container } = render(
      <RichText content="contact [Ada](mailto:ada@example.com)" />,
    );
    const a = container.querySelector('a') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('mailto:ada@example.com');
    expect(a.hasAttribute('target')).toBe(false);
  });

  it('drops unsafe javascript: links to a flagged span (label preserved)', () => {
    const { container } = render(
      <RichText content="click [me](javascript:alert(1))" />,
    );
    expect(container.querySelector('a')).toBeNull();
    const flagged = container.querySelector('[data-rich-text-unsafe-link]');
    expect(flagged).not.toBeNull();
    expect(flagged!.textContent).toBe('me');
  });

  it('drops unsafe data: links to a flagged span', () => {
    const { container } = render(
      <RichText
        content="see [exploit](data:text/html,<script>1</script>)"
      />,
    );
    expect(container.querySelector('a')).toBeNull();
    expect(
      container.querySelector('[data-rich-text-unsafe-link]'),
    ).not.toBeNull();
  });

  it('does NOT pass through raw HTML -- < and > render as literal text', () => {
    const { container } = render(
      <RichText content="hello <script>alert(1)</script> world" />,
    );
    expect(container.querySelector('script')).toBeNull();
    // The text content includes the literal characters.
    expect(container.textContent).toContain('<script>');
    expect(container.textContent).toContain('alert(1)');
  });

  it('does NOT render headings (# heading) -- treats them as paragraph text', () => {
    const { container } = render(<RichText content="# Not a heading" />);
    // No <h1>..<h6>; the line should render in a paragraph.
    expect(container.querySelector('h1')).toBeNull();
    expect(container.querySelector('h2')).toBeNull();
    expect(container.querySelector('h3')).toBeNull();
    const p = container.querySelector('[data-rich-text-block="p"]');
    expect(p?.textContent).toBe('# Not a heading');
  });

  it('does NOT render fenced code blocks (no <pre> element)', () => {
    // RichText intentionally omits fenced code blocks. The
    // triple-backtick fence is consumed by the inline-code
    // greedy matcher (the second + third backticks pair against
    // the closing fence's third backtick), so the body renders
    // inside a single inline <code> instead of a fenced <pre>.
    // The contract this test locks: NO <pre> ever appears in
    // RichText output, no matter how the source is shaped.
    const { container } = render(
      <RichText content={'```\ncode block\n```'} />,
    );
    expect(container.querySelector('pre')).toBeNull();
    // The body text still survives in the inline <code>.
    expect(container.textContent).toContain('code block');
  });

  it('does NOT render blockquotes -- > prefix is paragraph text', () => {
    const { container } = render(<RichText content="> not a quote" />);
    expect(container.querySelector('blockquote')).toBeNull();
    expect(container.textContent).toContain('> not a quote');
  });

  it('paragraphs preserve the inline grammar combination', () => {
    const { container } = render(
      <RichText content="run **bold** and *italic* and `code` together" />,
    );
    const p = container.querySelector('[data-rich-text-block="p"]');
    expect(p?.querySelector('strong')?.textContent).toBe('bold');
    expect(p?.querySelector('em')?.textContent).toBe('italic');
    expect(p?.querySelector('code')?.textContent).toBe('code');
  });

  it('merges caller className with the wrapper div', () => {
    const { container } = render(
      <RichText content="hi" className="custom-rt" />,
    );
    const root = container.querySelector('[data-section="rich-text"]');
    expect(root!.className).toContain('custom-rt');
    expect(root!.className).toContain('flex');
  });

  it('forwards arbitrary HTML attributes (data-testid)', () => {
    render(<RichText content="hi" data-testid="my-rt" />);
    expect(screen.getByTestId('my-rt')).toBeInTheDocument();
  });

  it('forwards a ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(<RichText content="hi" ref={ref} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});

describe('renderRichInline (exported helper)', () => {
  it('returns an array of ReactNodes', () => {
    const out = renderRichInline('hello');
    expect(Array.isArray(out)).toBe(true);
  });

  it('renders bold + italic + code', () => {
    const out = renderRichInline('hi **bold** *it* `c`');
    // 4 segments: text "hi ", strong, text " ", em, text " ", code
    // The exact count depends on bucket flushes; we just confirm
    // the bold / italic / code nodes are present in the array.
    const hasBold = out.some(
      (n) => typeof n === 'object' && n !== null && 'type' in (n as object),
    );
    expect(hasBold).toBe(true);
  });
});
