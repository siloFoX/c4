import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  CodeBlock,
  highlightCode,
  CODE_BLOCK_SUPPORTED_LANGUAGES,
} from './code-block';

function installClipboard() {
  const writeText = vi.fn();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: { writeText },
  });
  return writeText;
}

afterEach(() => {
  delete (navigator as { clipboard?: unknown }).clipboard;
});

describe('<CodeBlock>', () => {
  it('renders bare content inside a pre > code block', () => {
    const { container } = render(<CodeBlock>hello world</CodeBlock>);
    const pre = container.querySelector('pre');
    const code = container.querySelector('pre > code');
    expect(pre).not.toBeNull();
    expect(code).not.toBeNull();
    expect(code?.textContent).toBe('hello world');
  });

  it('accepts a `code` prop in lieu of children', () => {
    const { container } = render(<CodeBlock code="from-prop" />);
    expect(container.querySelector('pre > code')?.textContent).toBe('from-prop');
  });

  it('uses font-mono + text-sm + bg-muted + border + rounded on the pre', () => {
    const { container } = render(<CodeBlock>x</CodeBlock>);
    const pre = container.querySelector('pre');
    const cls = pre?.getAttribute('class') || '';
    expect(cls).toContain('font-mono');
    expect(cls).toContain('text-sm');
    expect(cls).toContain('bg-muted');
    expect(cls).toContain('border');
    expect(cls).toMatch(/rounded/);
  });

  it('renders a language badge when language is set', () => {
    const { container } = render(
      <CodeBlock language="bash">echo hi</CodeBlock>,
    );
    const badge = container.querySelector('[data-code-block-language]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('bash');
  });

  it('omits the language badge when language is null/undefined', () => {
    const { container } = render(<CodeBlock>echo hi</CodeBlock>);
    expect(container.querySelector('[data-code-block-language]')).toBeNull();
  });

  it('copy button click writes textContent to navigator.clipboard.writeText', () => {
    const writeText = installClipboard();
    render(<CodeBlock>payload-text</CodeBlock>);
    fireEvent.click(screen.getByRole('button', { name: /copy code/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('payload-text');
  });

  it('flips the Copied chip on after click then off after 2s', () => {
    installClipboard();
    vi.useFakeTimers();
    try {
      const { container } = render(<CodeBlock>x</CodeBlock>);
      expect(container.querySelector('[data-code-block-copied]')).toBeNull();
      act(() => {
        fireEvent.click(
          screen.getByRole('button', { name: /copy code/i }),
        );
      });
      expect(container.querySelector('[data-code-block-copied]')).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(container.querySelector('[data-code-block-copied]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('wrap toggle flips the whitespace class on the <code>', () => {
    const { container } = render(
      <CodeBlock defaultWrap={false}>abc</CodeBlock>,
    );
    const code = container.querySelector('[data-code-block-code]') as HTMLElement;
    expect(code.className).toContain('whitespace-pre');
    expect(code.className).not.toContain('whitespace-pre-wrap');
    fireEvent.click(screen.getByRole('button', { name: /enable wrap/i }));
    const codeAfter = container.querySelector(
      '[data-code-block-code]',
    ) as HTMLElement;
    expect(codeAfter.className).toContain('whitespace-pre-wrap');
  });

  it('honors defaultWrap=true as the initial wrap state', () => {
    const { container } = render(
      <CodeBlock defaultWrap={true}>abc</CodeBlock>,
    );
    const code = container.querySelector('[data-code-block-code]') as HTMLElement;
    expect(code.className).toContain('whitespace-pre-wrap');
  });

  it('respects controlled wrap prop (no toggle button rendered)', () => {
    render(<CodeBlock wrap={true}>abc</CodeBlock>);
    expect(
      screen.queryByRole('button', { name: /disable wrap/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /enable wrap/i }),
    ).toBeNull();
  });

  it('showCopy=false suppresses the copy button', () => {
    render(<CodeBlock showCopy={false}>abc</CodeBlock>);
    expect(
      screen.queryByRole('button', { name: /copy code/i }),
    ).toBeNull();
  });

  it('exposes role=region with an aria-label for assistive tech', () => {
    render(<CodeBlock language="json">{'{"a":1}'}</CodeBlock>);
    const region = screen.getByRole('region');
    expect(region).not.toBeNull();
    expect(region.getAttribute('aria-label')).toMatch(/code block/i);
  });

  // -- v1.11.271 filename header (TODO 11.253) ---------------------

  it('omits the header bar when no filename + no language is passed', () => {
    render(<CodeBlock>abc</CodeBlock>);
    expect(
      document.querySelector('[data-code-block-header]'),
    ).toBeNull();
  });

  it('renders the editor-style header bar when filename is passed', () => {
    render(<CodeBlock filename="config.json">{'{"a":1}'}</CodeBlock>);
    const header = document.querySelector('[data-code-block-header]');
    expect(header).not.toBeNull();
    expect(
      document.querySelector('[data-code-block-filename]')!.textContent,
    ).toBe('config.json');
  });

  it('filename header includes the language badge on the right', () => {
    render(
      <CodeBlock filename="config.json" language="json">
        {'{"a":1}'}
      </CodeBlock>,
    );
    const header = document.querySelector('[data-code-block-header]');
    expect(header).not.toBeNull();
    expect(
      header!.querySelector('[data-code-block-language]')!.textContent,
    ).toBe('json');
  });

  it('region aria-label uses the filename when provided', () => {
    render(<CodeBlock filename="config.json">{'{"a":1}'}</CodeBlock>);
    const region = screen.getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('config.json code block');
  });

  it('region aria-label falls back to language when no filename is passed', () => {
    render(<CodeBlock language="json">{'{"a":1}'}</CodeBlock>);
    const region = screen.getByRole('region');
    expect(region.getAttribute('aria-label')).toBe('json code block');
  });

  // -- v1.11.271 line numbers (TODO 11.253) ------------------------

  it('omits the line-number gutter by default', () => {
    render(<CodeBlock>{'a\nb\nc'}</CodeBlock>);
    expect(
      document.querySelector('[data-code-block-line-numbers]'),
    ).toBeNull();
  });

  it('renders the line-number gutter when showLineNumbers is true', () => {
    render(
      <CodeBlock showLineNumbers code={'line1\nline2\nline3'} />,
    );
    const gutter = document.querySelector(
      '[data-code-block-line-numbers]',
    );
    expect(gutter).not.toBeNull();
    expect(gutter!.querySelectorAll('span')).toHaveLength(3);
    expect(gutter!.textContent).toBe('123');
  });

  it('line-number gutter counts at least 1 even for empty code', () => {
    render(<CodeBlock showLineNumbers code="" />);
    const gutter = document.querySelector(
      '[data-code-block-line-numbers]',
    );
    expect(gutter).not.toBeNull();
    expect(gutter!.querySelectorAll('span')).toHaveLength(1);
    expect(gutter!.textContent).toBe('1');
  });

  it('gutter is marked aria-hidden so screen readers do not read "1 2 3..." over code', () => {
    render(<CodeBlock showLineNumbers code={'a\nb'} />);
    const gutter = document.querySelector(
      '[data-code-block-line-numbers]',
    );
    expect(gutter!.getAttribute('aria-hidden')).toBe('true');
  });

  it('line-number gutter falls back to children when no `code` prop is passed', () => {
    render(<CodeBlock showLineNumbers>{'one\ntwo\nthree\nfour'}</CodeBlock>);
    const gutter = document.querySelector(
      '[data-code-block-line-numbers]',
    );
    expect(gutter!.querySelectorAll('span')).toHaveLength(4);
  });

  it('filename + showLineNumbers combine without crashing (kitchen sink)', () => {
    render(
      <CodeBlock
        filename="src/lib/foo.ts"
        language="ts"
        showLineNumbers
        code={'export function foo() {\n  return 42;\n}'}
      />,
    );
    expect(
      document.querySelector('[data-code-block-filename]')!.textContent,
    ).toBe('src/lib/foo.ts');
    expect(
      document.querySelector('[data-code-block-language]')!.textContent,
    ).toBe('ts');
    const gutter = document.querySelector(
      '[data-code-block-line-numbers]',
    );
    expect(gutter!.querySelectorAll('span')).toHaveLength(3);
  });

  // -- v1.11.397 syntax highlighter (TODO 11.379) -----------------

  it('highlightCode() returns plain token for unsupported language', () => {
    const tokens = highlightCode('whatever', 'rust');
    expect(tokens).toEqual([{ type: 'plain', text: 'whatever' }]);
  });

  it('highlightCode() returns empty array for empty source', () => {
    expect(highlightCode('', 'json')).toEqual([]);
  });

  it('highlightCode() tokenizes JSON strings + numbers + booleans', () => {
    const tokens = highlightCode(
      '{"name": "alice", "age": 30, "ok": true}',
      'json',
    );
    const types = tokens.map((t) => t.type);
    expect(types).toContain('string');
    expect(types).toContain('number');
    expect(types).toContain('boolean');
    // String tokens should retain their quotes.
    const strings = tokens.filter((t) => t.type === 'string');
    expect(strings[0]!.text).toBe('"name"');
    const numbers = tokens.filter((t) => t.type === 'number');
    expect(numbers[0]!.text).toBe('30');
    const booleans = tokens.filter((t) => t.type === 'boolean');
    expect(booleans[0]!.text).toBe('true');
  });

  it('highlightCode() tokenizes JS keywords + line comments + numbers', () => {
    const tokens = highlightCode(
      '// header\nconst x = 42; // trailing\nlet y = 1.5e-2;',
      'javascript',
    );
    const comments = tokens.filter((t) => t.type === 'comment');
    expect(comments.length).toBe(2);
    expect(comments[0]!.text).toBe('// header');
    const keywords = tokens.filter((t) => t.type === 'keyword');
    expect(keywords.map((t) => t.text)).toEqual(['const', 'let']);
    const numbers = tokens.filter((t) => t.type === 'number');
    expect(numbers.length).toBeGreaterThanOrEqual(2);
  });

  it('highlightCode() handles JS template literals as strings', () => {
    const tokens = highlightCode(
      'const greeting = `hello, ${name}!`;',
      'javascript',
    );
    const strings = tokens.filter((t) => t.type === 'string');
    expect(strings[0]!.text).toBe('`hello, ${name}!`');
  });

  it('highlightCode() tokenizes TS-only keywords (type, keyof)', () => {
    const tokens = highlightCode(
      'type Foo = keyof Bar;',
      'typescript',
    );
    const keywords = tokens.filter((t) => t.type === 'keyword');
    expect(keywords.map((t) => t.text)).toEqual(['type', 'keyof']);
  });

  it('highlightCode() resolves language aliases (js -> javascript)', () => {
    const tokens = highlightCode('const x = 42;', 'js');
    const keywords = tokens.filter((t) => t.type === 'keyword');
    expect(keywords.map((t) => t.text)).toEqual(['const']);
  });

  it('highlightCode() resolves ts -> typescript', () => {
    const tokens = highlightCode('type Foo = 1;', 'ts');
    const keywords = tokens.filter((t) => t.type === 'keyword');
    expect(keywords.map((t) => t.text)).toEqual(['type']);
  });

  it('highlightCode() resolves sh / shell -> bash', () => {
    const shTokens = highlightCode('echo hello', 'sh');
    const shellTokens = highlightCode('echo hello', 'shell');
    expect(shTokens.filter((t) => t.type === 'keyword').length).toBe(1);
    expect(shellTokens.filter((t) => t.type === 'keyword').length).toBe(1);
  });

  it('highlightCode() tokenizes bash comments + variables + keywords', () => {
    const tokens = highlightCode(
      '# header\nif [ -z "$NAME" ]; then\n  echo $NAME\nfi',
      'bash',
    );
    const comments = tokens.filter((t) => t.type === 'comment');
    expect(comments[0]!.text).toBe('# header');
    const variables = tokens.filter((t) => t.type === 'variable');
    expect(variables.length).toBeGreaterThanOrEqual(1);
    expect(variables[0]!.text).toBe('$NAME');
    const keywords = tokens.filter((t) => t.type === 'keyword');
    expect(keywords.map((t) => t.text)).toContain('if');
    expect(keywords.map((t) => t.text)).toContain('then');
    expect(keywords.map((t) => t.text)).toContain('echo');
    expect(keywords.map((t) => t.text)).toContain('fi');
  });

  it('highlightCode() tokenizes ${var} braced bash variables', () => {
    const tokens = highlightCode('echo ${HOME}/foo', 'bash');
    const variables = tokens.filter((t) => t.type === 'variable');
    expect(variables[0]!.text).toBe('${HOME}');
  });

  it('CODE_BLOCK_SUPPORTED_LANGUAGES includes the four canonical languages', () => {
    expect(CODE_BLOCK_SUPPORTED_LANGUAGES).toContain('javascript');
    expect(CODE_BLOCK_SUPPORTED_LANGUAGES).toContain('typescript');
    expect(CODE_BLOCK_SUPPORTED_LANGUAGES).toContain('json');
    expect(CODE_BLOCK_SUPPORTED_LANGUAGES).toContain('bash');
  });

  it('<CodeBlock> renders token spans for supported language by default', () => {
    render(
      <CodeBlock language="javascript" code={'const x = "hello";'} />,
    );
    const keyword = document.querySelector('[data-token="keyword"]');
    expect(keyword).toHaveTextContent('const');
    const str = document.querySelector('[data-token="string"]');
    expect(str).toHaveTextContent('"hello"');
  });

  it('<CodeBlock> renders plain text when language is unsupported', () => {
    render(<CodeBlock language="rust" code={'fn main() {}'} />);
    expect(document.querySelector('[data-token="keyword"]')).toBeNull();
  });

  it('<CodeBlock> renders plain text when language is omitted', () => {
    render(<CodeBlock code={'const x = 1;'} />);
    expect(document.querySelector('[data-token]')).toBeNull();
  });

  it('<CodeBlock> highlight={false} suppresses the built-in highlighter', () => {
    render(
      <CodeBlock
        language="javascript"
        code={'const x = 1;'}
        highlight={false}
      />,
    );
    expect(document.querySelector('[data-token="keyword"]')).toBeNull();
  });

  it('<CodeBlock> highlight={fn} calls the plug-in highlighter', () => {
    const fn = vi.fn((c: string) => (
      <span data-testid="plug">{c.toUpperCase()}</span>
    ));
    render(<CodeBlock language="rust" code={'hello'} highlight={fn} />);
    expect(fn).toHaveBeenCalledWith('hello', 'rust');
    expect(screen.getByTestId('plug')).toHaveTextContent('HELLO');
  });

  it('<CodeBlock> highlight={fn} bypasses the built-in even on supported languages', () => {
    const fn = vi.fn(() => <span data-testid="plug">x</span>);
    render(
      <CodeBlock language="json" code={'{"x":1}'} highlight={fn} />,
    );
    expect(fn).toHaveBeenCalled();
    // No built-in tokens.
    expect(document.querySelector('[data-token="string"]')).toBeNull();
  });

  it('<CodeBlock> copy button still copies the raw text after highlighting', () => {
    const writeText = installClipboard();
    render(
      <CodeBlock language="javascript" code={'const x = 1;'} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Copy code/ }));
    expect(writeText).toHaveBeenCalledWith('const x = 1;');
  });

  it('<CodeBlock> tokens render inside the existing <code> element', () => {
    render(<CodeBlock language="json" code={'true'} />);
    const code = document.querySelector('[data-code-block-code]');
    expect(code).not.toBeNull();
    expect(
      code!.querySelector('[data-token="boolean"]'),
    ).toHaveTextContent('true');
  });
});
