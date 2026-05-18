import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  RICH_TEXT_TOOLBAR_COMMANDS,
  RichTextEditor,
  extractRichTextLinks,
  safeRichTextHref,
  sanitizeHtmlForRichText,
} from './rich-text-editor';

beforeAll(() => {
  // jsdom does not implement document.execCommand. Stub it so
  // vi.spyOn can replace the function in the toolbar / paste
  // tests below.
  if (typeof (document as unknown as { execCommand?: unknown }).execCommand !== 'function') {
    (document as unknown as { execCommand: () => boolean }).execCommand = () => true;
  }
});

afterEach(() => {
  cleanup();
});

describe('safeRichTextHref', () => {
  it('returns null for empty input', () => {
    expect(safeRichTextHref('')).toBeNull();
    expect(safeRichTextHref('   ')).toBeNull();
  });

  it('allows http(s)', () => {
    expect(safeRichTextHref('http://example.com')).toBe(
      'http://example.com',
    );
    expect(safeRichTextHref('https://example.com')).toBe(
      'https://example.com',
    );
  });

  it('allows mailto + tel', () => {
    expect(safeRichTextHref('mailto:a@b.com')).toBe(
      'mailto:a@b.com',
    );
    expect(safeRichTextHref('tel:+15551234567')).toBe(
      'tel:+15551234567',
    );
  });

  it('blocks javascript: / data: / vbscript: / file:', () => {
    expect(safeRichTextHref('javascript:alert(1)')).toBeNull();
    expect(safeRichTextHref('data:text/html,x')).toBeNull();
    expect(safeRichTextHref('vbscript:msgbox')).toBeNull();
    expect(safeRichTextHref('file:///etc/passwd')).toBeNull();
  });

  it('allows relative path / fragment', () => {
    expect(safeRichTextHref('/foo')).toBe('/foo');
    expect(safeRichTextHref('#bar')).toBe('#bar');
    expect(safeRichTextHref('relative')).toBe('relative');
  });

  it('blocks unknown schemes', () => {
    expect(safeRichTextHref('weird://x')).toBeNull();
    expect(safeRichTextHref('ftp://example.com')).toBeNull();
  });
});

describe('sanitizeHtmlForRichText', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeHtmlForRichText('')).toBe('');
  });

  it('passes through allowed tags', () => {
    const out = sanitizeHtmlForRichText(
      '<p>hello <b>world</b></p>',
    );
    expect(out).toContain('<b>world</b>');
    expect(out).toContain('<p>');
  });

  it('strips disallowed tags but keeps content', () => {
    const out = sanitizeHtmlForRichText(
      '<script>alert(1)</script>hello',
    );
    expect(out).not.toContain('<script>');
    expect(out).toContain('hello');
  });

  it('drops dangerous tags entirely (style/script kept-as-text only via strip-wrapper)', () => {
    const out = sanitizeHtmlForRichText(
      'pre<iframe src="x"></iframe>post',
    );
    expect(out).not.toContain('<iframe');
    expect(out).toContain('pre');
    expect(out).toContain('post');
  });

  it('strips disallowed attributes', () => {
    const out = sanitizeHtmlForRichText(
      '<a href="https://x" onclick="bad()">link</a>',
    );
    expect(out).toContain('href="https://x"');
    expect(out).not.toContain('onclick');
  });

  it('blocks javascript: hrefs', () => {
    const out = sanitizeHtmlForRichText(
      '<a href="javascript:alert(1)">x</a>',
    );
    expect(out).not.toContain('javascript:');
    // The <a> tag still exists; just no href.
    expect(out).toContain('<a');
  });

  it('forces rel + target on cross-origin links', () => {
    const out = sanitizeHtmlForRichText(
      '<a href="https://example.com">x</a>',
    );
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
  });

  it('respects custom allowedTags', () => {
    const out = sanitizeHtmlForRichText(
      '<b>keep</b><i>drop</i>',
      { allowedTags: ['b'] },
    );
    expect(out).toContain('<b>keep</b>');
    expect(out).not.toContain('<i>');
    expect(out).toContain('drop');
  });
});

describe('extractRichTextLinks', () => {
  it('returns [] for empty input', () => {
    expect(extractRichTextLinks('')).toEqual([]);
  });

  it('returns href values', () => {
    expect(
      extractRichTextLinks(
        '<a href="https://a">x</a><a href="/b">y</a>',
      ),
    ).toEqual(['https://a', '/b']);
  });

  it('ignores anchors without href', () => {
    expect(extractRichTextLinks('<a>noop</a>')).toEqual([]);
  });
});

describe('RICH_TEXT_TOOLBAR_COMMANDS', () => {
  it('exposes bold/italic/underline/list/list/link in order', () => {
    expect(RICH_TEXT_TOOLBAR_COMMANDS.map((c) => c.command)).toEqual([
      'bold',
      'italic',
      'underline',
      'insertUnorderedList',
      'insertOrderedList',
      'createLink',
    ]);
  });
});

describe('RichTextEditor component', () => {
  it('renders a textbox with the default aria-label', () => {
    render(<RichTextEditor value="" />);
    expect(screen.getByRole('textbox')).toHaveAttribute(
      'aria-label',
      'Rich text editor',
    );
  });

  it('honors a custom ariaLabel', () => {
    render(
      <RichTextEditor value="" ariaLabel="Comment body" />,
    );
    expect(screen.getByRole('textbox')).toHaveAttribute(
      'aria-label',
      'Comment body',
    );
  });

  it('renders a toolbar by default', () => {
    render(<RichTextEditor value="" />);
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
  });

  it('omits the toolbar when showToolbar=false', () => {
    render(<RichTextEditor value="" showToolbar={false} />);
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('renders 6 toolbar buttons (bold / italic / underline / 2 lists / link)', () => {
    render(<RichTextEditor value="" />);
    const buttons = screen
      .getAllByRole('button')
      .filter((b) =>
        b
          .getAttribute('data-section')
          ?.startsWith('rich-text-editor-toolbar-button'),
      );
    expect(buttons).toHaveLength(6);
  });

  it('renders the controlled value into the contenteditable', () => {
    render(<RichTextEditor value="<b>hi</b>" />);
    const textbox = screen.getByRole('textbox');
    expect(textbox.innerHTML).toBe('<b>hi</b>');
  });

  it('updating the value prop updates the innerHTML', () => {
    const { rerender } = render(<RichTextEditor value="a" />);
    const textbox = screen.getByRole('textbox');
    expect(textbox.innerHTML).toBe('a');
    rerender(<RichTextEditor value="b" />);
    expect(textbox.innerHTML).toBe('b');
  });

  it('input event fires onChange with the new innerHTML', () => {
    const onChange = vi.fn();
    render(<RichTextEditor value="" onChange={onChange} />);
    const textbox = screen.getByRole('textbox');
    textbox.innerHTML = '<b>x</b>';
    fireEvent.input(textbox);
    expect(onChange).toHaveBeenCalledWith('<b>x</b>');
  });

  it('bold toolbar button calls execCommand("bold")', () => {
    const execSpy = vi
      .spyOn(document, 'execCommand')
      .mockImplementation(() => true);
    render(<RichTextEditor value="" />);
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(execSpy).toHaveBeenCalledWith('bold', false, undefined);
    execSpy.mockRestore();
  });

  it('italic button calls execCommand("italic")', () => {
    const execSpy = vi
      .spyOn(document, 'execCommand')
      .mockImplementation(() => true);
    render(<RichTextEditor value="" />);
    fireEvent.click(screen.getByRole('button', { name: 'Italic' }));
    expect(execSpy).toHaveBeenCalledWith('italic', false, undefined);
    execSpy.mockRestore();
  });

  it('underline button calls execCommand("underline")', () => {
    const execSpy = vi
      .spyOn(document, 'execCommand')
      .mockImplementation(() => true);
    render(<RichTextEditor value="" />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Underline' }),
    );
    expect(execSpy).toHaveBeenCalledWith(
      'underline',
      false,
      undefined,
    );
    execSpy.mockRestore();
  });

  it('bullet list button calls execCommand("insertUnorderedList")', () => {
    const execSpy = vi
      .spyOn(document, 'execCommand')
      .mockImplementation(() => true);
    render(<RichTextEditor value="" />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Bullet list' }),
    );
    expect(execSpy).toHaveBeenCalledWith(
      'insertUnorderedList',
      false,
      undefined,
    );
    execSpy.mockRestore();
  });

  it('numbered list button calls execCommand("insertOrderedList")', () => {
    const execSpy = vi
      .spyOn(document, 'execCommand')
      .mockImplementation(() => true);
    render(<RichTextEditor value="" />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Numbered list' }),
    );
    expect(execSpy).toHaveBeenCalledWith(
      'insertOrderedList',
      false,
      undefined,
    );
    execSpy.mockRestore();
  });

  it('link button calls onLinkRequest when supplied', async () => {
    const execSpy = vi
      .spyOn(document, 'execCommand')
      .mockImplementation(() => true);
    const onLinkRequest = vi.fn(() => Promise.resolve('https://x.test'));
    render(
      <RichTextEditor
        value=""
        onLinkRequest={onLinkRequest}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    });
    expect(onLinkRequest).toHaveBeenCalled();
    expect(execSpy).toHaveBeenCalledWith(
      'createLink',
      false,
      'https://x.test',
    );
    execSpy.mockRestore();
  });

  it('link button drops javascript: URL silently (no exec)', async () => {
    const execSpy = vi
      .spyOn(document, 'execCommand')
      .mockImplementation(() => true);
    const onLinkRequest = vi.fn(() =>
      Promise.resolve('javascript:alert(1)'),
    );
    render(
      <RichTextEditor
        value=""
        onLinkRequest={onLinkRequest}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    });
    expect(execSpy).not.toHaveBeenCalledWith(
      'createLink',
      expect.anything(),
      expect.anything(),
    );
    execSpy.mockRestore();
  });

  it('link button null result is a no-op', async () => {
    const execSpy = vi
      .spyOn(document, 'execCommand')
      .mockImplementation(() => true);
    const onLinkRequest = vi.fn(() => Promise.resolve(null));
    render(
      <RichTextEditor
        value=""
        onLinkRequest={onLinkRequest}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    });
    expect(execSpy).not.toHaveBeenCalledWith(
      'createLink',
      expect.anything(),
      expect.anything(),
    );
    execSpy.mockRestore();
  });

  it('readOnly disables contentEditable + toolbar buttons', () => {
    render(<RichTextEditor value="" readOnly />);
    const textbox = screen.getByRole('textbox');
    expect(textbox).toHaveAttribute('contenteditable', 'false');
    const bold = screen.getByRole('button', { name: 'Bold' });
    expect(bold).toBeDisabled();
  });

  it('readOnly skips execCommand entirely', () => {
    const execSpy = vi
      .spyOn(document, 'execCommand')
      .mockImplementation(() => true);
    render(<RichTextEditor value="" readOnly />);
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(execSpy).not.toHaveBeenCalled();
    execSpy.mockRestore();
  });

  it('paste handler sanitizes HTML before insertion', () => {
    const execSpy = vi
      .spyOn(document, 'execCommand')
      .mockImplementation(() => true);
    const onPaste = vi.fn();
    render(<RichTextEditor value="" onPaste={onPaste} />);
    const textbox = screen.getByRole('textbox');
    const event = new Event('paste', { bubbles: true }) as Event & {
      clipboardData: DataTransfer;
    };
    const dt = {
      getData: vi.fn((type: string) => {
        if (type === 'text/html')
          return '<script>bad()</script><b>good</b>';
        return '';
      }),
    } as unknown as DataTransfer;
    (event as any).clipboardData = dt;
    fireEvent(textbox, event);
    // execCommand insertHTML was called with sanitized HTML
    expect(execSpy).toHaveBeenCalledWith(
      'insertHTML',
      false,
      expect.stringContaining('<b>good</b>'),
    );
    const insertedHtml = execSpy.mock.calls[0]?.[2] as string;
    expect(insertedHtml).not.toContain('<script>');
    expect(onPaste).toHaveBeenCalledTimes(1);
    execSpy.mockRestore();
  });

  it('paste fires onPaste(sanitized, raw)', () => {
    const execSpy = vi
      .spyOn(document, 'execCommand')
      .mockImplementation(() => true);
    const onPaste = vi.fn();
    render(<RichTextEditor value="" onPaste={onPaste} />);
    const textbox = screen.getByRole('textbox');
    const event = new Event('paste', { bubbles: true }) as Event & {
      clipboardData: DataTransfer;
    };
    const dt = {
      getData: vi.fn((type: string) => {
        if (type === 'text/html') return '<b>x</b>';
        return '';
      }),
    } as unknown as DataTransfer;
    (event as any).clipboardData = dt;
    fireEvent(textbox, event);
    expect(onPaste).toHaveBeenCalledTimes(1);
    const [sanitized, raw] = onPaste.mock.calls[0] ?? [];
    expect(sanitized).toContain('<b>x</b>');
    expect(raw).toBe('<b>x</b>');
    execSpy.mockRestore();
  });

  it('paste handler falls back to text/plain when no text/html', () => {
    const execSpy = vi
      .spyOn(document, 'execCommand')
      .mockImplementation(() => true);
    render(<RichTextEditor value="" />);
    const textbox = screen.getByRole('textbox');
    const event = new Event('paste', { bubbles: true }) as Event & {
      clipboardData: DataTransfer;
    };
    const dt = {
      getData: vi.fn((type: string) => {
        if (type === 'text/html') return '';
        if (type === 'text/plain') return 'hello';
        return '';
      }),
    } as unknown as DataTransfer;
    (event as any).clipboardData = dt;
    fireEvent(textbox, event);
    expect(execSpy).toHaveBeenCalledWith(
      'insertHTML',
      false,
      expect.stringContaining('hello'),
    );
    execSpy.mockRestore();
  });

  it('shows placeholder hint via data-placeholder attribute', () => {
    render(
      <RichTextEditor
        value=""
        placeholder="Write a comment..."
      />,
    );
    const textbox = screen.getByRole('textbox');
    expect(textbox).toHaveAttribute(
      'data-placeholder',
      'Write a comment...',
    );
  });

  it('exposes data-section + data-read-only + data-empty on root', () => {
    const { container } = render(
      <RichTextEditor value="" />,
    );
    const root = container.querySelector(
      '[data-section="rich-text-editor"]',
    );
    expect(root).toHaveAttribute('data-read-only', 'false');
    expect(root).toHaveAttribute('data-empty', 'true');
  });

  it('data-empty flips to false when value has content', () => {
    const { container } = render(
      <RichTextEditor value="<p>hi</p>" />,
    );
    expect(
      container.querySelector('[data-section="rich-text-editor"]'),
    ).toHaveAttribute('data-empty', 'false');
  });

  it('data-read-only="true" when readOnly', () => {
    const { container } = render(
      <RichTextEditor value="" readOnly />,
    );
    expect(
      container.querySelector('[data-section="rich-text-editor"]'),
    ).toHaveAttribute('data-read-only', 'true');
  });

  it('exposes a stable displayName', () => {
    expect(RichTextEditor.displayName).toBe('RichTextEditor');
  });

  it('forwards refs to the content editable', () => {
    const ref = createRef<HTMLDivElement>();
    render(<RichTextEditor ref={ref} value="" />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('role')).toBe('textbox');
  });

  it('toolbar each button has data-command matching its kind', () => {
    const { container } = render(<RichTextEditor value="" />);
    const cmds = Array.from(
      container.querySelectorAll(
        '[data-section="rich-text-editor-toolbar-button"]',
      ),
    ).map((b) => b.getAttribute('data-command'));
    expect(cmds).toEqual([
      'bold',
      'italic',
      'underline',
      'insertUnorderedList',
      'insertOrderedList',
      'createLink',
    ]);
  });
});
