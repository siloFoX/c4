import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetForTests,
  clear,
  downloadJson,
  getAll,
  install,
  report,
  subscribe,
} from './error-reporter';

describe('error-reporter', () => {
  beforeEach(() => {
    _resetForTests();
  });

  afterEach(() => {
    _resetForTests();
  });

  it('report() appends a record to the buffer and getAll returns newest-first', () => {
    expect(getAll()).toHaveLength(0);
    report({ source: 'manual', message: 'first' });
    report({ source: 'manual', message: 'second' });
    const all = getAll();
    expect(all).toHaveLength(2);
    expect(all[0].message).toBe('second');
    expect(all[1].message).toBe('first');
    expect(typeof all[0].id).toBe('string');
    expect(typeof all[0].timestamp).toBe('string');
  });

  it('buffer caps at 50 records with FIFO eviction (oldest dropped)', () => {
    for (let i = 0; i < 60; i++) {
      report({ source: 'manual', message: `msg-${i}` });
    }
    const all = getAll();
    expect(all).toHaveLength(50);
    expect(all[0].message).toBe('msg-59');
    expect(all[49].message).toBe('msg-10');
  });

  it('clear() empties the buffer and notifies subscribers', () => {
    report({ source: 'manual', message: 'a' });
    report({ source: 'manual', message: 'b' });
    const listener = vi.fn();
    const unsub = subscribe(listener);
    clear();
    expect(getAll()).toHaveLength(0);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toEqual([]);
    unsub();
  });

  it('subscribe fires on report and unsubscribe stops further notifications', () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    report({ source: 'manual', message: 'one' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toHaveLength(1);
    unsub();
    report({ source: 'manual', message: 'two' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('install() is idempotent - calling twice does not double-wire', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    install();
    install();
    install();
    const errorCalls = addSpy.mock.calls.filter((c) => c[0] === 'error');
    const rejCalls = addSpy.mock.calls.filter(
      (c) => c[0] === 'unhandledrejection'
    );
    expect(errorCalls).toHaveLength(1);
    expect(rejCalls).toHaveLength(1);
    addSpy.mockRestore();
  });

  it('window.onerror chain captures synthetic error and preserves previous handler', () => {
    const prev = vi.fn();
    window.onerror = prev;
    install();
    const handler = window.onerror;
    expect(handler).not.toBe(prev);
    // Invoke the chained handler directly to simulate a runtime error
    if (typeof handler === 'function') {
      handler.call(window, 'boom', 'app.js', 10, 5, new Error('boom'));
    }
    const all = getAll();
    expect(all).toHaveLength(1);
    expect(all[0].source).toBe('window');
    expect(all[0].message).toBe('boom');
    expect(prev).toHaveBeenCalledTimes(1);
  });

  it("addEventListener('error') handler captures synthetic ErrorEvent", () => {
    install();
    const err = new Error('synthetic');
    const evt = new ErrorEvent('error', {
      message: 'synthetic',
      filename: 'http://x/app.js',
      lineno: 1,
      colno: 2,
      error: err,
    });
    window.dispatchEvent(evt);
    const all = getAll();
    // At least one window-source record must have been captured.
    const windowRecs = all.filter((r) => r.source === 'window');
    expect(windowRecs.length).toBeGreaterThanOrEqual(1);
    expect(windowRecs[0].message).toBe('synthetic');
  });

  it('downloadJson() creates a Blob and triggers an anchor click (mocked URL)', () => {
    report({ source: 'manual', message: 'dl-test' });
    const createUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock');
    const revokeUrl = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    downloadJson('errs.json');

    expect(createUrl).toHaveBeenCalledTimes(1);
    const blobArg = createUrl.mock.calls[0][0] as Blob;
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toBe('application/json');
    expect(clickSpy).toHaveBeenCalledTimes(1);

    createUrl.mockRestore();
    revokeUrl.mockRestore();
    clickSpy.mockRestore();
  });
});
