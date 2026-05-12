import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderMarkdown } from './markdown';

function renderMd(src: string) {
  return render(<>{renderMarkdown(src)}</>);
}

describe('renderMarkdown (lib/markdown.tsx)', () => {
  describe('empty / whitespace / single-char inputs', () => {
    it('returns null for an empty string', () => {
      expect(renderMarkdown('')).toBeNull();
    });

    it('renders nothing meaningful for a whitespace-only string', () => {
      const { container } = renderMd('   \n  \n\t');
      // The outer wrapper exists but contains no block children.
      const wrapper = container.querySelector('div.flex.flex-col');
      expect(wrapper).not.toBeNull();
      expect(wrapper?.children.length).toBe(0);
    });

    it('renders a single character as a paragraph', () => {
      renderMd('x');
      const p = screen.getByText('x');
      expect(p.tagName).toBe('P');
    });

    it('handles very long input without throwing', () => {
      const long = 'word '.repeat(2000).trim();
      const { container } = renderMd(long);
      expect(container.querySelectorAll('p')).toHaveLength(1);
      const p = container.querySelector('p');
      expect(p?.textContent?.length).toBeGreaterThan(9000);
    });
  });

  describe('block branches', () => {
    it('renders a single paragraph wrapping plain text', () => {
      renderMd('hello world');
      const p = screen.getByText('hello world');
      expect(p.tagName).toBe('P');
      expect(p.className).toContain('text-sm');
    });

    it('coalesces consecutive non-empty lines into one paragraph (space-joined)', () => {
      renderMd('alpha\nbeta\ngamma');
      // Inline text is joined by a single space.
      expect(screen.getByText('alpha beta gamma').tagName).toBe('P');
    });

    it('emits headings with role="heading" and matching aria-level for #..######', () => {
      const { container } = renderMd(
        '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6',
      );
      const headings = container.querySelectorAll('[role="heading"]');
      expect(headings).toHaveLength(6);
      headings.forEach((h, idx) => {
        expect(h.getAttribute('aria-level')).toBe(String(idx + 1));
        expect(h.textContent).toBe(`H${idx + 1}`);
      });
    });

    it('applies size classes by heading level', () => {
      const { container } = renderMd('# big\n###### small');
      const h1 = container.querySelector('[aria-level="1"]');
      const h6 = container.querySelector('[aria-level="6"]');
      expect(h1?.className).toContain('text-2xl');
      expect(h6?.className).toContain('text-sm');
    });

    it('renders a fenced code block as <pre><code> preserving the body verbatim', () => {
      const { container } = renderMd('```js\nconst x = 1;\nconst y = 2;\n```');
      const pre = container.querySelector('pre');
      expect(pre).not.toBeNull();
      const code = pre?.querySelector('code');
      expect(code).not.toBeNull();
      expect(code?.getAttribute('data-lang')).toBe('js');
      expect(code?.textContent).toBe('const x = 1;\nconst y = 2;');
    });

    it('omits data-lang when fence has no language tag', () => {
      const { container } = renderMd('```\nplain\n```');
      const code = container.querySelector('pre code');
      expect(code).not.toBeNull();
      expect(code?.hasAttribute('data-lang')).toBe(false);
    });

    it('renders an unordered list (list + listitem roles) for - * + bullets', () => {
      const { container } = renderMd('- one\n* two\n+ three');
      const lists = container.querySelectorAll('ul');
      expect(lists).toHaveLength(1);
      const items = lists[0]?.querySelectorAll('li') ?? [];
      expect(items).toHaveLength(3);
      expect(items[0]?.textContent).toBe('one');
      expect(items[1]?.textContent).toBe('two');
      expect(items[2]?.textContent).toBe('three');
      // Implicit ARIA roles
      expect(screen.getByRole('list').tagName).toBe('UL');
      expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });

    it('renders an ordered list for 1. 2. 3. items', () => {
      const { container } = renderMd('1. first\n2. second\n3. third');
      const ol = container.querySelector('ol');
      expect(ol).not.toBeNull();
      expect(ol?.querySelectorAll('li')).toHaveLength(3);
      expect(ol?.className).toContain('list-decimal');
    });

    it('renders a blockquote that joins multiple > lines with a single space', () => {
      const { container } = renderMd('> line one\n> line two');
      const bq = container.querySelector('blockquote');
      expect(bq).not.toBeNull();
      expect(bq?.textContent).toBe('line one line two');
    });

    it('renders a horizontal rule for --- and longer dash runs', () => {
      const { container } = renderMd('above\n\n---\n\nbelow');
      expect(container.querySelector('hr')).not.toBeNull();
      // The hr stays between the two paragraphs.
      const ps = container.querySelectorAll('p');
      expect(ps).toHaveLength(2);
    });
  });

  describe('inline branches', () => {
    it('renders inline `code` inside a paragraph', () => {
      const { container } = renderMd('use `foo` here');
      const code = container.querySelector('p code');
      expect(code).not.toBeNull();
      expect(code?.textContent).toBe('foo');
    });

    it('renders **bold** as <strong>', () => {
      const { container } = renderMd('a **bold** word');
      const strong = container.querySelector('strong');
      expect(strong?.textContent).toBe('bold');
    });

    it('renders *italic* and _italic_ as <em>', () => {
      const { container } = renderMd('an *it* and _en_');
      const ems = container.querySelectorAll('em');
      expect(ems).toHaveLength(2);
      expect(ems[0]?.textContent).toBe('it');
      expect(ems[1]?.textContent).toBe('en');
    });

    it('renders a [label](url) as an external <a> with rel/target', () => {
      const { container } = renderMd('see [docs](https://example.test/d)');
      const a = container.querySelector('a');
      expect(a).not.toBeNull();
      expect(a?.getAttribute('href')).toBe('https://example.test/d');
      expect(a?.getAttribute('target')).toBe('_blank');
      expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
      expect(a?.textContent).toBe('docs');
    });

    it('renders inline markup inside heading text too', () => {
      const { container } = renderMd('## a **B** c');
      const h = container.querySelector('[aria-level="2"]');
      expect(h?.querySelector('strong')?.textContent).toBe('B');
    });
  });

  describe('special-character / XSS resistance', () => {
    it('renders a <script> tag in input as plain text, not as DOM', () => {
      const { container } = renderMd('hello <script>alert(1)</script> world');
      expect(container.querySelector('script')).toBeNull();
      expect(container.textContent).toContain('<script>alert(1)</script>');
    });

    it('renders an <img onerror> payload as plain text, not an executing image', () => {
      const { container } = renderMd('x <img src=y onerror=alert(1)> z');
      expect(container.querySelector('img')).toBeNull();
      expect(container.textContent).toContain('<img src=y onerror=alert(1)>');
    });

    it('does not auto-link a bare URL written without [..](..) syntax', () => {
      const { container } = renderMd('see https://evil.test/path');
      expect(container.querySelector('a')).toBeNull();
      expect(container.textContent).toContain('https://evil.test/path');
    });
  });

  describe('stability across re-renders with identical input', () => {
    it('produces structurally identical DOM when invoked twice with the same input', () => {
      const src = '# Hi\n\nhello **world**\n\n- a\n- b';
      const first = render(<>{renderMarkdown(src)}</>);
      const firstHtml = first.container.innerHTML;
      first.unmount();
      const second = render(<>{renderMarkdown(src)}</>);
      expect(second.container.innerHTML).toBe(firstHtml);
    });
  });
});
