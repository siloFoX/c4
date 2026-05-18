import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  MarkdownRenderer,
  parseMarkdownBlocks,
  safeUrl,
} from './markdown-renderer';

afterEach(() => {
  cleanup();
});

describe('safeUrl', () => {
  it('returns null for empty input', () => {
    expect(safeUrl('')).toBeNull();
    expect(safeUrl('   ')).toBeNull();
  });

  it('allows http and https', () => {
    expect(safeUrl('http://example.com')).toBe('http://example.com');
    expect(safeUrl('https://example.com')).toBe('https://example.com');
  });

  it('allows mailto and tel', () => {
    expect(safeUrl('mailto:hello@example.com')).toBe(
      'mailto:hello@example.com',
    );
    expect(safeUrl('tel:+15551234567')).toBe('tel:+15551234567');
  });

  it('blocks javascript:', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('JavaScript:alert(1)')).toBeNull();
    expect(safeUrl('  javascript:void(0)')).toBeNull();
  });

  it('blocks data: URLs', () => {
    expect(safeUrl('data:text/html,<script>')).toBeNull();
  });

  it('blocks vbscript: and file:', () => {
    expect(safeUrl('vbscript:msgbox')).toBeNull();
    expect(safeUrl('file:///etc/passwd')).toBeNull();
  });

  it('allows absolute path / relative / fragment', () => {
    expect(safeUrl('/foo/bar')).toBe('/foo/bar');
    expect(safeUrl('./local')).toBe('./local');
    expect(safeUrl('../sibling')).toBe('../sibling');
    expect(safeUrl('#anchor')).toBe('#anchor');
    expect(safeUrl('relative/path')).toBe('relative/path');
  });

  it('blocks unknown schemes by default', () => {
    expect(safeUrl('weird://thing')).toBeNull();
    expect(safeUrl('ftp://example.com')).toBeNull();
  });
});

describe('parseMarkdownBlocks', () => {
  it('returns [] for empty input', () => {
    expect(parseMarkdownBlocks('')).toEqual([]);
  });

  it('parses ATX headings 1..6', () => {
    const blocks = parseMarkdownBlocks(
      '# h1\n## h2\n### h3\n#### h4\n##### h5\n###### h6',
    );
    expect(blocks).toHaveLength(6);
    expect(blocks[0]).toMatchObject({
      type: 'heading',
      level: 1,
      text: 'h1',
    });
    expect(blocks[5]).toMatchObject({
      type: 'heading',
      level: 6,
      text: 'h6',
    });
  });

  it('parses fenced code with language tag', () => {
    const src = '```ts\nconst x = 1;\nconst y = 2;\n```';
    const blocks = parseMarkdownBlocks(src);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe('code');
    expect(blocks[0]?.language).toBe('ts');
    expect(blocks[0]?.text).toBe('const x = 1;\nconst y = 2;');
  });

  it('parses fenced code without a language tag', () => {
    const blocks = parseMarkdownBlocks('```\nplain\n```');
    expect(blocks[0]?.language).toBe('');
  });

  it('parses unordered list', () => {
    const blocks = parseMarkdownBlocks('- a\n- b\n- c');
    expect(blocks).toEqual([
      { type: 'ul', items: ['a', 'b', 'c'] },
    ]);
  });

  it('parses ordered list', () => {
    const blocks = parseMarkdownBlocks('1. first\n2. second');
    expect(blocks).toEqual([
      { type: 'ol', items: ['first', 'second'] },
    ]);
  });

  it('parses checkbox list', () => {
    const blocks = parseMarkdownBlocks(
      '- [ ] todo\n- [x] done\n- [X] also done',
    );
    expect(blocks[0]?.type).toBe('checkbox-list');
    expect(blocks[0]?.checkboxes).toEqual([
      { checked: false, text: 'todo' },
      { checked: true, text: 'done' },
      { checked: true, text: 'also done' },
    ]);
  });

  it('parses blockquote', () => {
    const blocks = parseMarkdownBlocks('> first line\n> second line');
    expect(blocks).toEqual([
      { type: 'blockquote', text: 'first line\nsecond line' },
    ]);
  });

  it('parses horizontal rule', () => {
    const blocks = parseMarkdownBlocks('---\n***\n___');
    expect(blocks).toHaveLength(3);
    expect(blocks.every((b) => b.type === 'hr')).toBe(true);
  });

  it('parses paragraph', () => {
    const blocks = parseMarkdownBlocks('This is a\nparagraph.');
    expect(blocks).toEqual([
      { type: 'paragraph', text: 'This is a paragraph.' },
    ]);
  });

  it('separates blocks by blank lines', () => {
    const blocks = parseMarkdownBlocks('first\n\nsecond');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.text).toBe('first');
    expect(blocks[1]?.text).toBe('second');
  });

  it('keeps checkbox list separate from regular unordered list', () => {
    const blocks = parseMarkdownBlocks('- regular\n- [ ] checkbox');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.type).toBe('ul');
    expect(blocks[1]?.type).toBe('checkbox-list');
  });
});

describe('MarkdownRenderer component', () => {
  it('renders a region with default aria-label', () => {
    render(<MarkdownRenderer source="hello" />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Markdown content',
    );
  });

  it('honors a custom ariaLabel', () => {
    render(
      <MarkdownRenderer source="hello" ariaLabel="Plan body" />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Plan body',
    );
  });

  it('exposes data-block-count on root', () => {
    render(<MarkdownRenderer source={'# h1\n\nparagraph'} />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-block-count',
      '2',
    );
  });

  it('renders heading at the correct level', () => {
    const { container } = render(
      <MarkdownRenderer source="## Hello" />,
    );
    const h2 = container.querySelector('h2');
    expect(h2).toBeInTheDocument();
    expect(h2?.textContent).toBe('Hello');
    expect(h2).toHaveAttribute('data-level', '2');
  });

  it('renders paragraphs', () => {
    const { container } = render(
      <MarkdownRenderer source="hello world" />,
    );
    const p = container.querySelector('p');
    expect(p?.textContent).toBe('hello world');
    expect(p).toHaveAttribute('data-section', 'markdown-paragraph');
  });

  it('renders bold + italic + strikethrough inline', () => {
    const { container } = render(
      <MarkdownRenderer source="**bold** and *italic* and ~~strike~~" />,
    );
    expect(container.querySelector('strong')).toBeInTheDocument();
    expect(container.querySelector('em')).toBeInTheDocument();
    expect(container.querySelector('del')).toBeInTheDocument();
  });

  it('renders inline `code`', () => {
    const { container } = render(
      <MarkdownRenderer source="run `npm test` first" />,
    );
    const code = container.querySelector(
      '[data-section="markdown-inline-code"]',
    );
    expect(code?.textContent).toBe('npm test');
  });

  it('renders fenced code block via CodeBlock primitive', () => {
    const { container } = render(
      <MarkdownRenderer
        source={'```ts\nconst x = 1;\n```'}
      />,
    );
    // CodeBlock root carries data-section="code-block" in 11.379.
    // Our wrapper passes the markdown-code-block data section
    // through the props.
    expect(
      container.querySelector(
        '[data-section="markdown-code-block"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders an unordered list', () => {
    const { container } = render(
      <MarkdownRenderer source={'- a\n- b'} />,
    );
    const ul = container.querySelector(
      '[data-section="markdown-ul"]',
    );
    expect(ul).toBeInTheDocument();
    const items = ul?.querySelectorAll('li');
    expect(items?.length).toBe(2);
  });

  it('renders an ordered list', () => {
    const { container } = render(
      <MarkdownRenderer source={'1. one\n2. two'} />,
    );
    const ol = container.querySelector(
      '[data-section="markdown-ol"]',
    );
    expect(ol).toBeInTheDocument();
  });

  it('renders checkbox list when enableCheckboxes=true', () => {
    const { container } = render(
      <MarkdownRenderer source={'- [ ] todo\n- [x] done'} />,
    );
    const list = container.querySelector(
      '[data-section="markdown-checkbox-list"]',
    );
    expect(list).toBeInTheDocument();
    const items = container.querySelectorAll(
      '[data-section="markdown-checkbox-item"]',
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute('data-checked', 'false');
    expect(items[1]).toHaveAttribute('data-checked', 'true');
  });

  it('falls back to a regular ul when enableCheckboxes=false', () => {
    const { container } = render(
      <MarkdownRenderer
        source={'- [ ] todo'}
        enableCheckboxes={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="markdown-checkbox-list"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="markdown-ul"][data-checkbox-disabled="true"]',
      ),
    ).toBeInTheDocument();
  });

  it('checkbox click fires onCheckboxChange with flat index', () => {
    const onCheckboxChange = vi.fn();
    const { container } = render(
      <MarkdownRenderer
        source={'- [ ] a\n- [x] b\n\nparagraph\n\n- [ ] c'}
        onCheckboxChange={onCheckboxChange}
      />,
    );
    const checkboxes = container.querySelectorAll(
      'input[type="checkbox"]',
    );
    expect(checkboxes).toHaveLength(3);
    fireEvent.click(checkboxes[2]!);
    // c is the third checkbox across both lists -> flat index 2
    expect(onCheckboxChange).toHaveBeenCalledWith(2, true);
  });

  it('renders blockquote', () => {
    const { container } = render(
      <MarkdownRenderer source="> quoted" />,
    );
    expect(
      container.querySelector('blockquote'),
    ).toBeInTheDocument();
  });

  it('renders horizontal rule', () => {
    const { container } = render(<MarkdownRenderer source="---" />);
    expect(container.querySelector('hr')).toBeInTheDocument();
  });

  it('renders [label](url) as a sanitized anchor', () => {
    const { container } = render(
      <MarkdownRenderer source="see [docs](https://example.com)" />,
    );
    const a = container.querySelector(
      'a[data-section="markdown-link"]',
    );
    expect(a).toHaveAttribute('href', 'https://example.com');
    expect(a?.textContent).toBe('docs');
  });

  it('drops javascript: links and keeps the label as text', () => {
    const { container } = render(
      <MarkdownRenderer
        source="click [here](javascript:alert(1))"
      />,
    );
    expect(
      container.querySelector('a[data-section="markdown-link"]'),
    ).toBeNull();
    // The label text remains
    expect(container.textContent).toContain('here');
  });

  it('drops data: URL links', () => {
    const { container } = render(
      <MarkdownRenderer
        source="bad [link](data:text/html,<script>)"
      />,
    );
    expect(
      container.querySelector('a[data-section="markdown-link"]'),
    ).toBeNull();
  });

  it('renders bare http(s) URLs as autolinks', () => {
    const { container } = render(
      <MarkdownRenderer source="visit https://example.com today" />,
    );
    const a = container.querySelector(
      'a[data-section="markdown-autolink"]',
    );
    expect(a).toHaveAttribute('href', 'https://example.com');
  });

  it('uses linkTarget="_blank" with noopener noreferrer by default', () => {
    const { container } = render(
      <MarkdownRenderer source="see [docs](https://example.com)" />,
    );
    const a = container.querySelector(
      'a[data-section="markdown-link"]',
    );
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('linkTarget="_self" omits rel', () => {
    const { container } = render(
      <MarkdownRenderer
        source="see [docs](https://example.com)"
        linkTarget="_self"
      />,
    );
    const a = container.querySelector(
      'a[data-section="markdown-link"]',
    );
    expect(a).toHaveAttribute('target', '_self');
    expect(a).not.toHaveAttribute('rel');
  });

  it('onAnchorClick fires with sanitized href', () => {
    const onAnchorClick = vi.fn();
    const { container } = render(
      <MarkdownRenderer
        source="[click](https://example.com)"
        onAnchorClick={onAnchorClick}
      />,
    );
    const a = container.querySelector(
      'a[data-section="markdown-link"]',
    ) as HTMLAnchorElement;
    fireEvent.click(a);
    expect(onAnchorClick).toHaveBeenCalledTimes(1);
    expect(onAnchorClick.mock.calls[0]?.[0]).toBe(
      'https://example.com',
    );
  });

  it('custom sanitizeUrl prop overrides the default', () => {
    const sanitizeUrl = vi.fn((url: string) =>
      url.startsWith('myapp:') ? url : null,
    );
    const { container } = render(
      <MarkdownRenderer
        source="[a](myapp:open) [b](https://example.com)"
        sanitizeUrl={sanitizeUrl}
      />,
    );
    const links = container.querySelectorAll(
      'a[data-section="markdown-link"]',
    );
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'myapp:open');
  });

  it('renders multiple blocks in source order', () => {
    const { container } = render(
      <MarkdownRenderer
        source={'# Title\n\nintro\n\n- a\n- b\n\n```\ncode\n```'}
      />,
    );
    expect(container.querySelector('h1')).toBeInTheDocument();
    expect(container.querySelector('p')).toBeInTheDocument();
    expect(container.querySelector('ul')).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="markdown-code-block"]'),
    ).toBeInTheDocument();
  });

  it('exposes a stable displayName', () => {
    expect(MarkdownRenderer.displayName).toBe('MarkdownRenderer');
  });

  it('forwards refs to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<MarkdownRenderer ref={ref} source="hello" />);
    expect(ref.current?.getAttribute('role')).toBe('region');
  });

  it('preserves the raw href via data-href-raw on dropped links', () => {
    // dropped link: javascript: -> no anchor produced, no data-href-raw
    // safe link: passes through as data-href-raw
    const { container } = render(
      <MarkdownRenderer source="[a](https://safe.test)" />,
    );
    const a = container.querySelector(
      'a[data-section="markdown-link"]',
    );
    expect(a).toHaveAttribute('data-href-raw', 'https://safe.test');
  });

  it('renders code-block with the supplied language', () => {
    const { container } = render(
      <MarkdownRenderer source={'```bash\nls -la\n```'} />,
    );
    const block = container.querySelector(
      '[data-section="markdown-code-block"]',
    );
    expect(block).toBeInTheDocument();
  });

  it('renders code-block with the fallback language for unmarked fences', () => {
    const { container } = render(
      <MarkdownRenderer
        source={'```\nplain\n```'}
        language="ts"
      />,
    );
    const block = container.querySelector(
      '[data-section="markdown-code-block"]',
    );
    expect(block).toBeInTheDocument();
  });

  it('renders heading with inline formatting', () => {
    const { container } = render(
      <MarkdownRenderer source="## Hello **world**" />,
    );
    const h2 = container.querySelector('h2');
    expect(h2?.querySelector('strong')?.textContent).toBe('world');
  });

  it('keeps paragraphs separated when blank line is present', () => {
    const { container } = render(
      <MarkdownRenderer source={'first\n\nsecond'} />,
    );
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
  });

  it('renders an autolink only for http(s), not for ftp://', () => {
    const { container } = render(
      <MarkdownRenderer source="visit ftp://example.com" />,
    );
    expect(
      container.querySelector(
        'a[data-section="markdown-autolink"]',
      ),
    ).toBeNull();
  });
});
