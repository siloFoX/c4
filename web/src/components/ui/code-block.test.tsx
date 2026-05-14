import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CodeBlock } from './code-block';

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
  // @ts-expect-error -- restore between tests
  delete (navigator as any).clipboard;
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
});
