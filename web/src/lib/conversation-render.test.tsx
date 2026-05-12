import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  formatTime,
  formatTokens,
  renderInline,
  renderMarkdown,
  truncate,
  formatToolArgs,
  formatToolResult,
} from './conversation-render';
import type { TurnTokens } from '../components/ConversationView';

const tokens = (overrides: Partial<TurnTokens> = {}): TurnTokens => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheCreate: 0,
  ...overrides,
});

describe('formatTime', () => {
  it('returns empty string for null', () => {
    expect(formatTime(null)).toBe('');
  });

  it('returns empty string for an invalid ISO date', () => {
    expect(formatTime('not-a-date')).toBe('');
  });

  it('returns HH:MM zero-padded for a valid ISO timestamp', () => {
    const iso = new Date(2024, 0, 1, 7, 5).toISOString();
    const local = new Date(iso);
    const hh = String(local.getHours()).padStart(2, '0');
    const mm = String(local.getMinutes()).padStart(2, '0');
    expect(formatTime(iso)).toBe(`${hh}:${mm}`);
  });
});

describe('formatTokens', () => {
  it('returns empty string when every field is zero', () => {
    expect(formatTokens(tokens())).toBe('');
  });

  it('joins only populated fields with the matching suffix', () => {
    expect(formatTokens(tokens({ input: 12 }))).toBe('12 in');
    expect(formatTokens(tokens({ output: 7 }))).toBe('7 out');
    expect(formatTokens(tokens({ cacheRead: 3 }))).toBe('3 cache-r');
    expect(formatTokens(tokens({ cacheCreate: 5 }))).toBe('5 cache-w');
  });

  it('combines all four fields in input/output/cache-r/cache-w order with locale-formatted numbers', () => {
    const out = formatTokens(
      tokens({ input: 1234, output: 56, cacheRead: 7890, cacheCreate: 2 }),
    );
    expect(out).toBe(
      `${(1234).toLocaleString()} in ${(56).toLocaleString()} out ${(7890).toLocaleString()} cache-r ${(2).toLocaleString()} cache-w`,
    );
  });
});

describe('truncate', () => {
  it('returns empty string for empty input', () => {
    expect(truncate('')).toBe('');
  });

  it('returns the input untouched when below the max', () => {
    expect(truncate('short', 400)).toBe('short');
  });

  it('returns the input untouched at exactly max length', () => {
    expect(truncate('abc', 3)).toBe('abc');
  });

  it('cuts and appends "..." when the input exceeds the max', () => {
    expect(truncate('abcdef', 3)).toBe('abc...');
  });

  it('defaults max to 400 characters', () => {
    const input = 'a'.repeat(401);
    expect(truncate(input)).toBe(`${'a'.repeat(400)}...`);
  });
});

describe('formatToolArgs', () => {
  it('returns empty string for null and undefined', () => {
    expect(formatToolArgs(null)).toBe('');
    expect(formatToolArgs(undefined)).toBe('');
  });

  it('returns string args unchanged (no JSON wrapping)', () => {
    expect(formatToolArgs('raw text')).toBe('raw text');
  });

  it('serializes objects as pretty JSON with 2-space indent', () => {
    expect(formatToolArgs({ a: 1, b: 'x' })).toBe('{\n  "a": 1,\n  "b": "x"\n}');
  });

  it('falls back to String() when JSON.stringify throws (circular ref)', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const out = formatToolArgs(circular);
    expect(out).toBe('[object Object]');
  });
});

describe('formatToolResult', () => {
  it('returns empty string for null and undefined', () => {
    expect(formatToolResult(null)).toBe('');
    expect(formatToolResult(undefined)).toBe('');
  });

  it('returns string results unchanged', () => {
    expect(formatToolResult('done')).toBe('done');
  });

  it('joins an array of {text} chunks with newlines', () => {
    expect(formatToolResult([{ text: 'one' }, { text: 'two' }])).toBe('one\ntwo');
  });

  it('falls back to JSON for non-text array entries', () => {
    expect(formatToolResult(['plain', { foo: 'bar' }])).toBe(
      'plain\n{"foo":"bar"}',
    );
  });

  it('filters out empty chunks from an array', () => {
    expect(formatToolResult([{ text: '' }, { text: 'kept' }])).toBe('kept');
  });

  it('serializes plain objects as pretty JSON', () => {
    expect(formatToolResult({ ok: true })).toBe('{\n  "ok": true\n}');
  });

  it('falls back to String() when JSON.stringify throws', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(formatToolResult(circular)).toBe('[object Object]');
  });
});

describe('renderInline', () => {
  function mount(text: string) {
    return render(<>{renderInline(text)}</>);
  }

  it('returns an empty array for an empty string', () => {
    expect(renderInline('')).toEqual([]);
  });

  it('wraps plain text in a <span>', () => {
    const { container } = mount('hello');
    const spans = container.querySelectorAll('span');
    expect(spans).toHaveLength(1);
    expect(spans[0]?.textContent).toBe('hello');
  });

  it('renders `code` segments inside a styled <code>', () => {
    const { container } = mount('see `id` now');
    const code = container.querySelector('code');
    expect(code?.textContent).toBe('id');
    expect(code?.className).toContain('font-mono');
    expect(container.textContent).toBe('see id now');
  });

  it('renders **bold** segments inside <strong>', () => {
    const { container } = mount('a **B** c');
    expect(container.querySelector('strong')?.textContent).toBe('B');
  });

  it('renders *italic* segments inside <em>', () => {
    const { container } = mount('a *it* c');
    expect(container.querySelector('em')?.textContent).toBe('it');
  });

  it('renders [label](href) as an external <a> with rel/target', () => {
    const { container } = mount('go [home](https://example.test/h) now');
    const a = container.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://example.test/h');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a?.textContent).toBe('home');
  });

  it('keeps a literal "<script>" run as plain span text', () => {
    const { container } = mount('hi <script>x</script> bye');
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>x</script>');
  });

  it('produces the same output for repeated calls with the same input (pure)', () => {
    const out1 = renderInline('a **B** c');
    const out2 = renderInline('a **B** c');
    const a = render(<>{out1}</>);
    const b = render(<>{out2}</>);
    expect(a.container.innerHTML).toBe(b.container.innerHTML);
  });
});

describe('renderMarkdown (lib/conversation-render.tsx)', () => {
  function mountMd(src: string) {
    return render(<>{renderMarkdown(src)}</>);
  }

  it('returns an empty array for an empty string', () => {
    expect(renderMarkdown('')).toEqual([]);
  });

  it('renders a paragraph for plain text', () => {
    const { container } = mountMd('hello');
    const p = container.querySelector('p');
    expect(p?.textContent).toBe('hello');
    expect(p?.className).toContain('whitespace-pre-wrap');
  });

  it('coalesces consecutive non-blank lines into one paragraph joined by newline', () => {
    const { container } = mountMd('line1\nline2');
    const ps = container.querySelectorAll('p');
    expect(ps).toHaveLength(1);
    expect(ps[0]?.textContent).toBe('line1\nline2');
  });

  it('splits paragraphs on a blank line', () => {
    const { container } = mountMd('first\n\nsecond');
    const ps = container.querySelectorAll('p');
    expect(ps).toHaveLength(2);
    expect(ps[0]?.textContent).toBe('first');
    expect(ps[1]?.textContent).toBe('second');
  });

  it('renders ATX headings as <p> with size class scaled by level', () => {
    const { container } = mountMd('# big\n### mid\n##### small');
    const ps = container.querySelectorAll('p');
    expect(ps).toHaveLength(3);
    expect(ps[0]?.className).toContain('text-lg');
    expect(ps[0]?.textContent).toBe('big');
    expect(ps[1]?.className).toContain('text-base');
    expect(ps[2]?.className).toContain('text-sm');
  });

  it('renders a fenced code block with language class on <code>', () => {
    const { container } = mountMd('```ts\nconst a = 1;\n```');
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    const code = pre?.querySelector('code');
    expect(code?.className).toContain('language-ts');
    expect(code?.textContent).toBe('const a = 1;');
  });

  it('renders a fence with no language tag without a language-* class', () => {
    const { container } = mountMd('```\nplain body\n```');
    const code = container.querySelector('pre code');
    expect(code?.textContent).toBe('plain body');
    expect(code?.className).not.toContain('language-');
  });

  it('renders a blockquote that joins > lines with newlines', () => {
    const { container } = mountMd('> a\n> b');
    const bq = container.querySelector('blockquote');
    expect(bq).not.toBeNull();
    expect(bq?.textContent).toBe('a\nb');
  });

  it('renders an unordered list (- and *) and exposes list/listitem roles', () => {
    const { container } = mountMd('- one\n* two');
    const ul = container.querySelector('ul');
    expect(ul).not.toBeNull();
    expect(ul?.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByRole('list').tagName).toBe('UL');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders an ordered list for 1. 2. items', () => {
    const { container } = mountMd('1. a\n2. b\n3. c');
    const ol = container.querySelector('ol');
    expect(ol).not.toBeNull();
    expect(ol?.querySelectorAll('li')).toHaveLength(3);
    expect(ol?.className).toContain('list-decimal');
  });

  it('renders inline `code`, **bold**, *italic*, and [link](href) inside a paragraph', () => {
    const { container } = mountMd('mix `c` **b** *i* [t](https://example.test/x)');
    expect(container.querySelector('p code')?.textContent).toBe('c');
    expect(container.querySelector('p strong')?.textContent).toBe('b');
    expect(container.querySelector('p em')?.textContent).toBe('i');
    const a = container.querySelector('p a');
    expect(a?.getAttribute('href')).toBe('https://example.test/x');
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders a script tag in the source as text, not as a DOM <script>', () => {
    const { container } = mountMd('hi <script>alert(1)</script> bye');
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });

  it('survives whitespace-only and single-character inputs', () => {
    const { container: ws } = mountMd('   ');
    expect(ws.querySelectorAll('p')).toHaveLength(0);

    const { container: one } = mountMd('z');
    expect(one.querySelector('p')?.textContent).toBe('z');
  });

  it('handles very long input without throwing', () => {
    const long = 'sentence. '.repeat(2000).trim();
    const { container } = mountMd(long);
    const p = container.querySelector('p');
    expect(p).not.toBeNull();
    expect(p?.textContent?.length).toBeGreaterThan(9000);
  });

  it('produces identical DOM across repeated calls with the same source (pure renderer)', () => {
    const src = '# Title\n\nbody **b**\n\n- a\n- b';
    const a = render(<>{renderMarkdown(src)}</>);
    const html = a.container.innerHTML;
    a.unmount();
    const b = render(<>{renderMarkdown(src)}</>);
    expect(b.container.innerHTML).toBe(html);
  });
});
