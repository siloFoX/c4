// (v1.11.132) Tests for installErrorCapture(). Verifies that:
//   1. window 'error' events trigger exactly one POST with the
//      expected JSON shape (kind, message, stack, url, line, column,
//      userAgent, timestamp).
//   2. window 'unhandledrejection' events trigger exactly one POST
//      with kind = 'unhandledrejection' and the reason's message +
//      stack extracted onto the payload.
//   3. Double-install is a no-op -- calling installErrorCapture()
//      twice does NOT register a duplicate listener, so a single
//      event still fires exactly one POST.
//   4. fetch rejections are swallowed silently -- the listener never
//      re-throws into the browser's error pipeline (which would
//      double-fire 'error').
//
// Pattern: stub global.fetch via vi.stubGlobal so the module-level
// `fetch` call lands on our mock rather than msw's setupServer (which
// intercepts via the same global). installErrorCapture() is called
// once in beforeAll because the module-scope `installed` guard makes
// every subsequent call a no-op for the lifetime of the module -- this
// is exactly the contract we want to test.

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { installErrorCapture } from './error-capture';

type FetchMock = ReturnType<typeof vi.fn>;

let fetchMock: FetchMock;

beforeAll(() => {
  installErrorCapture();
});

beforeEach(() => {
  fetchMock = vi.fn(() =>
    Promise.resolve(new Response(null, { status: 204 })),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function dispatchError(opts: Partial<ErrorEventInit> = {}): void {
  window.dispatchEvent(
    new ErrorEvent('error', {
      message: 'boom',
      filename: 'http://test/app.js',
      lineno: 42,
      colno: 7,
      error: new Error('boom'),
      ...opts,
    }),
  );
}

function dispatchRejection(reason: unknown): void {
  // jsdom provides PromiseRejectionEvent; fall back to a CustomEvent
  // shim if the constructor is missing on older engines.
  const PRE = (
    globalThis as unknown as { PromiseRejectionEvent?: typeof PromiseRejectionEvent }
  ).PromiseRejectionEvent;
  if (typeof PRE === 'function') {
    const promise = Promise.reject(reason);
    promise.catch(() => {});
    window.dispatchEvent(
      new PRE('unhandledrejection', { promise, reason }),
    );
  } else {
    const evt = new Event('unhandledrejection') as Event & {
      reason: unknown;
    };
    evt.reason = reason;
    window.dispatchEvent(evt);
  }
}

interface Payload {
  kind: string;
  message: string;
  stack: string;
  url: string;
  line: number | null;
  column: number | null;
  userAgent: string;
  timestamp: string;
}

function lastBody(): Payload {
  const [, opts] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
    string,
    RequestInit,
  ];
  return JSON.parse(String(opts.body)) as Payload;
}

describe('installErrorCapture', () => {
  it('POSTs exactly one payload to /api/client-errors on window error', async () => {
    dispatchError();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/client-errors');
    expect(opts.method).toBe('POST');
    expect((opts.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
    expect(opts.keepalive).toBe(true);
    const body = JSON.parse(String(opts.body)) as Payload;
    expect(body.kind).toBe('error');
    expect(body.message).toBe('boom');
    expect(typeof body.stack).toBe('string');
    expect(body.url).toBe('http://test/app.js');
    expect(body.line).toBe(42);
    expect(body.column).toBe(7);
    expect(typeof body.timestamp).toBe('string');
    expect(typeof body.userAgent).toBe('string');
  });

  it('POSTs exactly one payload with kind=unhandledrejection on unhandledrejection', async () => {
    dispatchRejection(new Error('async-kaboom'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = lastBody();
    expect(body.kind).toBe('unhandledrejection');
    expect(body.message).toBe('async-kaboom');
    expect(typeof body.stack).toBe('string');
    expect(body.line).toBeNull();
    expect(body.column).toBeNull();
    expect(typeof body.timestamp).toBe('string');
  });

  it('stringifies non-Error rejection reasons onto the message field', async () => {
    dispatchRejection('plain-string-reason');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = lastBody();
    expect(body.kind).toBe('unhandledrejection');
    expect(body.message).toBe('plain-string-reason');
    expect(body.stack).toBe('');
  });

  it('truncates an oversized message at 4096 chars', () => {
    const huge = 'x'.repeat(10000);
    dispatchError({ message: huge });
    const body = lastBody();
    expect(body.message.length).toBe(4096);
  });

  it('is a no-op on double-install (single dispatch still posts exactly once)', () => {
    // The module-scope guard means a second installErrorCapture() call
    // must NOT re-register the same handler -- otherwise this dispatch
    // would land on two listeners and POST twice.
    installErrorCapture();
    installErrorCapture();
    dispatchError({ message: 'once' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('swallows fetch rejections without re-throwing', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.reject(new Error('network down')),
    );
    // dispatchEvent re-throws synchronously if the listener throws --
    // assert that it does not. The unhandled-rejection from the inner
    // fetch().catch() is also handled inside the module.
    expect(() => dispatchError({ message: 'with-failing-fetch' })).not.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Let the (already-handled) microtask drain so vitest does not flag
    // an unhandledrejection at the suite level.
    await Promise.resolve();
    await Promise.resolve();
  });
});
