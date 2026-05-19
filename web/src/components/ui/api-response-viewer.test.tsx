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
  ApiResponseViewer,
  DEFAULT_API_VIEWER_MAX_INITIAL_DEPTH,
  buildCurlCommand,
  copyToClipboard,
  formatJson,
  getJsonNodeType,
  getStatusCodeBadgeClass,
  getStatusCodeKind,
} from './api-response-viewer';

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

describe('getStatusCodeKind', () => {
  it('unknown for undefined / NaN', () => {
    expect(getStatusCodeKind(undefined)).toBe('unknown');
    expect(getStatusCodeKind(Number.NaN)).toBe('unknown');
  });
  it('info for 1xx', () => {
    expect(getStatusCodeKind(100)).toBe('info');
    expect(getStatusCodeKind(199)).toBe('info');
  });
  it('success for 2xx', () => {
    expect(getStatusCodeKind(200)).toBe('success');
    expect(getStatusCodeKind(299)).toBe('success');
  });
  it('redirect for 3xx', () => {
    expect(getStatusCodeKind(301)).toBe('redirect');
    expect(getStatusCodeKind(399)).toBe('redirect');
  });
  it('client-error for 4xx', () => {
    expect(getStatusCodeKind(404)).toBe('client-error');
    expect(getStatusCodeKind(499)).toBe('client-error');
  });
  it('server-error for 5xx', () => {
    expect(getStatusCodeKind(500)).toBe('server-error');
    expect(getStatusCodeKind(599)).toBe('server-error');
  });
  it('unknown for out-of-band codes', () => {
    expect(getStatusCodeKind(99)).toBe('unknown');
    expect(getStatusCodeKind(600)).toBe('unknown');
  });
});

describe('getStatusCodeBadgeClass', () => {
  it('returns non-empty class strings per kind', () => {
    expect(getStatusCodeBadgeClass('success')).toMatch(/text-success/);
    expect(getStatusCodeBadgeClass('client-error')).toMatch(
      /text-destructive/,
    );
    expect(getStatusCodeBadgeClass('server-error')).toMatch(
      /text-destructive/,
    );
    expect(getStatusCodeBadgeClass('info')).toMatch(/text-primary/);
    expect(getStatusCodeBadgeClass('unknown')).toMatch(/text-foreground/);
  });
});

describe('getJsonNodeType', () => {
  it('detects basic types', () => {
    expect(getJsonNodeType('x')).toBe('string');
    expect(getJsonNodeType(1)).toBe('number');
    expect(getJsonNodeType(true)).toBe('boolean');
    expect(getJsonNodeType(null)).toBe('null');
    expect(getJsonNodeType(undefined)).toBe('undefined');
    expect(getJsonNodeType([1, 2])).toBe('array');
    expect(getJsonNodeType({ a: 1 })).toBe('object');
  });
});

describe('formatJson', () => {
  it('pretty-prints with 2-space indent by default', () => {
    expect(formatJson({ a: 1 })).toBe(`{\n  "a": 1\n}`);
  });
  it('accepts a custom indent', () => {
    expect(formatJson({ a: 1 }, 0)).toBe(`{"a":1}`);
  });
  it('falls back to String() on cyclic input', () => {
    const obj: Record<string, unknown> = {};
    obj['self'] = obj;
    expect(formatJson(obj)).toBe(String(obj));
  });
});

describe('buildCurlCommand', () => {
  it('builds a basic GET command', () => {
    expect(
      buildCurlCommand('GET', 'https://example.com/x'),
    ).toBe(`curl "https://example.com/x"`);
  });
  it('emits -X for non-GET methods', () => {
    expect(
      buildCurlCommand('POST', 'https://example.com/x'),
    ).toBe(`curl -X POST "https://example.com/x"`);
  });
  it('emits -H for each header', () => {
    expect(
      buildCurlCommand(
        'GET',
        'https://example.com',
        { 'X-Foo': 'bar' },
      ),
    ).toBe(`curl -H "X-Foo: bar" "https://example.com"`);
  });
  it('emits -d for a body on non-GET', () => {
    const cmd = buildCurlCommand(
      'POST',
      'https://example.com',
      { 'Content-Type': 'application/json' },
      { a: 1 },
    );
    expect(cmd).toContain('-X POST');
    expect(cmd).toContain('-d ');
    // body is JSON-stringified then shell-escaped, so embedded
    // quotes become \" in the command output.
    expect(cmd).toContain('\\"a\\":1');
  });
  it('skips body on GET even when provided', () => {
    const cmd = buildCurlCommand(
      'GET',
      'https://example.com',
      {},
      { ignored: true },
    );
    expect(cmd).not.toContain('-d');
  });
  it('escapes embedded quotes + backslashes', () => {
    const cmd = buildCurlCommand(
      'POST',
      'https://example.com/path"x',
      { 'X-Note': 'has "quotes" and \\backslash' },
    );
    expect(cmd).toContain('\\"quotes\\"');
    expect(cmd).toContain('\\\\backslash');
    expect(cmd).toContain('path\\"x');
  });
  it('default method is GET', () => {
    expect(buildCurlCommand(undefined, 'https://x')).toBe(
      `curl "https://x"`,
    );
  });
});

describe('copyToClipboard', () => {
  it('writes to navigator.clipboard when available', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const ok = await copyToClipboard('hello');
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });
  it('returns false when writeText throws', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error('denied')),
      },
    });
    const ok = await copyToClipboard('hello');
    expect(ok).toBe(false);
  });
});

describe('Constants', () => {
  it('DEFAULT_API_VIEWER_MAX_INITIAL_DEPTH = 2', () => {
    expect(DEFAULT_API_VIEWER_MAX_INITIAL_DEPTH).toBe(2);
  });
});

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

describe('ApiResponseViewer component', () => {
  it('renders a region with default aria-label', () => {
    render(<ApiResponseViewer />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'API response',
    );
  });

  it('honors custom ariaLabel', () => {
    render(<ApiResponseViewer ariaLabel="Inspect call" />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Inspect call',
    );
  });

  it('status badge renders with code + text', () => {
    render(
      <ApiResponseViewer status={200} statusText="OK" />,
    );
    expect(screen.getByText('200 OK')).toBeInTheDocument();
  });

  it('status badge applies the right kind class via data-status-kind', () => {
    render(<ApiResponseViewer status={404} />);
    const root = screen.getByRole('region');
    expect(root).toHaveAttribute('data-status-kind', 'client-error');
  });

  it('method + url render in the header', () => {
    render(
      <ApiResponseViewer
        method="POST"
        url="https://api.example/x"
      />,
    );
    expect(screen.getByText('POST')).toBeInTheDocument();
    expect(
      screen.getByText('https://api.example/x'),
    ).toBeInTheDocument();
  });

  it('durationMs renders when supplied', () => {
    render(
      <ApiResponseViewer
        method="GET"
        url="https://x"
        durationMs={123.4}
      />,
    );
    expect(screen.getByText('123ms')).toBeInTheDocument();
  });

  it('Copy as curl button renders when url is present', () => {
    render(<ApiResponseViewer url="https://x" />);
    expect(
      screen.getByLabelText('Copy as curl'),
    ).toBeInTheDocument();
  });

  it('Copy as curl button absent when no url', () => {
    render(<ApiResponseViewer />);
    expect(
      screen.queryByLabelText('Copy as curl'),
    ).toBeNull();
  });

  it('copyAsCurl=false hides the curl button', () => {
    render(
      <ApiResponseViewer url="https://x" copyAsCurl={false} />,
    );
    expect(
      screen.queryByLabelText('Copy as curl'),
    ).toBeNull();
  });

  it('Copy as curl clicks fire onCopy with the curl command', () => {
    const onCopy = vi.fn();
    render(
      <ApiResponseViewer
        method="POST"
        url="https://x"
        requestHeaders={{ 'X-Foo': 'bar' }}
        requestBody={{ a: 1 }}
        onCopy={onCopy}
      />,
    );
    fireEvent.click(screen.getByLabelText('Copy as curl'));
    const arg = onCopy.mock.calls[0]![0] as string;
    expect(arg).toContain('curl');
    expect(arg).toContain('-X POST');
    expect(arg).toContain('"https://x"');
    expect(arg).toContain('-H "X-Foo: bar"');
    expect(arg).toContain('-d ');
    expect(arg).toContain('\\"a\\":1');
  });

  it('Copy body button renders when a body is present', () => {
    render(<ApiResponseViewer body={{ a: 1 }} />);
    expect(
      screen.getByLabelText('Copy response body'),
    ).toBeInTheDocument();
  });

  it('Copy body absent when no body', () => {
    render(<ApiResponseViewer />);
    expect(
      screen.queryByLabelText('Copy response body'),
    ).toBeNull();
  });

  it('copyBody=false hides the body copy button', () => {
    render(
      <ApiResponseViewer body={{ a: 1 }} copyBody={false} />,
    );
    expect(
      screen.queryByLabelText('Copy response body'),
    ).toBeNull();
  });

  it('Copy body click fires onCopy with pretty-printed JSON', () => {
    const onCopy = vi.fn();
    render(
      <ApiResponseViewer
        body={{ a: 1 }}
        onCopy={onCopy}
      />,
    );
    fireEvent.click(screen.getByLabelText('Copy response body'));
    expect(onCopy).toHaveBeenCalledWith(`{\n  "a": 1\n}`);
  });

  it('JSON tree renders one node per top-level key', () => {
    const { container } = render(
      <ApiResponseViewer
        body={{ a: 1, b: 'x', c: true, d: null }}
      />,
    );
    const tree = container.querySelector(
      '[data-section="api-response-viewer-tree"]',
    );
    expect(tree).toBeInTheDocument();
    const childNodes = tree?.querySelectorAll(
      '[data-section="api-response-viewer-node-child"]',
    );
    expect(childNodes?.length).toBe(4);
  });

  it('JSON tree per-type colour classes appear', () => {
    const { container } = render(
      <ApiResponseViewer
        body={{ s: 'x', n: 1, b: true, e: null }}
      />,
    );
    const scalars = container.querySelectorAll(
      '[data-section="api-response-viewer-scalar"]',
    );
    const types = Array.from(scalars).map((el) =>
      el.getAttribute('data-scalar-type'),
    );
    expect(types).toEqual(
      expect.arrayContaining(['string', 'number', 'boolean', 'null']),
    );
  });

  it('JSON tree node toggle collapses + expands', () => {
    const { container } = render(
      <ApiResponseViewer
        body={{ deep: { nested: { value: 1 } } }}
        maxInitialDepth={1}
      />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="api-response-viewer-node-toggle"]',
    );
    // The "deep" node is at depth=1 (collapsed by default with maxInitialDepth=1)
    expect(buttons.length).toBeGreaterThan(0);
    const deepToggle = container.querySelector(
      '[data-section="api-response-viewer-node-child"][data-key="deep"] [data-section="api-response-viewer-node-toggle"]',
    ) as HTMLElement;
    expect(deepToggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(deepToggle);
    expect(deepToggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('defaultCollapsed=true starts root collapsed (depth=0)', () => {
    const { container } = render(
      <ApiResponseViewer
        body={{ a: 1 }}
        defaultCollapsed
      />,
    );
    const rootToggle = container.querySelector(
      '[data-section="api-response-viewer-tree"] > [data-section="api-response-viewer-node"] > span > [data-section="api-response-viewer-node-toggle"]',
    );
    expect(rootToggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('rawBody renders as a preformatted block (no JSON tree)', () => {
    const { container } = render(
      <ApiResponseViewer rawBody="hello world" />,
    );
    expect(
      container.querySelector('[data-section="api-response-viewer-raw"]'),
    ).toHaveTextContent('hello world');
    expect(
      container.querySelector('[data-section="api-response-viewer-tree"]'),
    ).toBeNull();
  });

  it('rawBody and body both absent -> empty state', () => {
    render(<ApiResponseViewer emptyBody="nothing here" />);
    expect(screen.getByText('nothing here')).toBeInTheDocument();
  });

  it('Response headers section renders when supplied', () => {
    const { container } = render(
      <ApiResponseViewer
        responseHeaders={{ 'X-Foo': 'bar', 'X-Baz': 'qux' }}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="api-response-viewer-headers"]',
      ),
    ).toBeInTheDocument();
    const rows = container.querySelectorAll(
      '[data-section="api-response-viewer-header-row"]',
    );
    expect(rows.length).toBe(2);
  });

  it('Response headers section omitted when empty', () => {
    const { container } = render(
      <ApiResponseViewer responseHeaders={{}} />,
    );
    expect(
      container.querySelector(
        '[data-section="api-response-viewer-headers"]',
      ),
    ).toBeNull();
  });

  it('root data attrs mirror state', () => {
    render(
      <ApiResponseViewer
        status={503}
        method="POST"
        url="https://x"
        body={{ ok: false }}
      />,
    );
    const root = screen.getByRole('region');
    expect(root).toHaveAttribute('data-status', '503');
    expect(root).toHaveAttribute(
      'data-status-kind',
      'server-error',
    );
    expect(root).toHaveAttribute('data-method', 'POST');
    expect(root).toHaveAttribute('data-has-body', 'true');
  });

  it('data-has-body=false when no body / no rawBody', () => {
    render(<ApiResponseViewer />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-has-body',
      'false',
    );
  });

  it('exposes a stable displayName', () => {
    expect(ApiResponseViewer.displayName).toBe('ApiResponseViewer');
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ApiResponseViewer ref={ref} status={200} />);
    expect(ref.current?.getAttribute('role')).toBe('region');
  });

  it('array body renders with items summary when collapsed', () => {
    const { container } = render(
      <ApiResponseViewer
        body={[1, 2, 3]}
        defaultCollapsed
      />,
    );
    const summary = container.querySelector(
      '[data-section="api-response-viewer-node-summary"]',
    );
    expect(summary?.textContent).toContain('3 items');
  });

  it('object body renders with keys summary when collapsed', () => {
    const { container } = render(
      <ApiResponseViewer
        body={{ a: 1, b: 2 }}
        defaultCollapsed
      />,
    );
    const summary = container.querySelector(
      '[data-section="api-response-viewer-node-summary"]',
    );
    expect(summary?.textContent).toContain('2 keys');
  });

  it('node-type data attr mirrors the json type', () => {
    const { container } = render(
      <ApiResponseViewer body={[{ a: 1 }]} />,
    );
    const rootNode = container.querySelector(
      '[data-section="api-response-viewer-node"]',
    );
    expect(rootNode).toHaveAttribute('data-node-type', 'array');
  });
});
