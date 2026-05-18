import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_TOAST_DURATION_MS,
  DEFAULT_TOAST_VISIBLE_LIMIT,
  createToastApi,
  createToaster,
  getToasterEntries,
  resetToaster,
  subscribeToaster,
  toast,
} from './toaster';

describe('createToaster store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with no entries', () => {
    const store = createToaster();
    expect(store.list()).toEqual([]);
  });

  it('push appends an entry and returns id', () => {
    const store = createToaster();
    const id = store.push('success', 'hello');
    const entries = store.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe(id);
    expect(entries[0]?.kind).toBe('success');
    expect(entries[0]?.message).toBe('hello');
  });

  it('push notifies subscribers with snapshot', () => {
    const store = createToaster();
    const listener = vi.fn();
    store.subscribe(listener);
    listener.mockClear();
    store.push('info', 'go');
    expect(listener).toHaveBeenCalledTimes(1);
    const snapshot = listener.mock.calls[0]?.[0];
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].message).toBe('go');
  });

  it('subscribe fires initial snapshot immediately', () => {
    const store = createToaster();
    store.push('warning', 'pre');
    const listener = vi.fn();
    store.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toHaveLength(1);
  });

  it('subscribe unsubscribe stops further notifications', () => {
    const store = createToaster();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    listener.mockClear();
    unsubscribe();
    store.push('info', 'after-unsubscribe');
    expect(listener).not.toHaveBeenCalled();
  });

  it('push assigns a default duration based on kind', () => {
    const store = createToaster({ defaultDurationMs: 4000 });
    store.push('success', 's');
    store.push('error', 'e');
    store.push('info', 'i');
    store.push('warning', 'w');
    const entries = store.list();
    expect(entries[0]?.durationMs).toBe(4000);
    expect(entries[1]?.durationMs).toBe(8000);
    expect(entries[2]?.durationMs).toBe(4000);
    expect(entries[3]?.durationMs).toBe(4000);
  });

  it('explicit durationMs overrides default', () => {
    const store = createToaster();
    store.push('error', 'e', { durationMs: 2000 });
    expect(store.list()[0]?.durationMs).toBe(2000);
  });

  it('Infinity durationMs marks the entry as sticky (no timer)', () => {
    const store = createToaster();
    store.push('info', 'sticky', { durationMs: Infinity });
    expect(store.list()[0]?.durationMs).toBeUndefined();
    vi.advanceTimersByTime(60_000);
    expect(store.list()).toHaveLength(1);
  });

  it('zero / negative durationMs is sticky', () => {
    const store = createToaster();
    store.push('info', 'zero', { durationMs: 0 });
    store.push('info', 'neg', { durationMs: -100 });
    expect(store.list()[0]?.durationMs).toBeUndefined();
    expect(store.list()[1]?.durationMs).toBeUndefined();
    vi.advanceTimersByTime(60_000);
    expect(store.list()).toHaveLength(2);
  });

  it('timer auto-dismisses after durationMs', () => {
    const store = createToaster();
    store.push('info', 't', { durationMs: 1000 });
    expect(store.list()).toHaveLength(1);
    vi.advanceTimersByTime(999);
    expect(store.list()).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(store.list()).toHaveLength(0);
  });

  it('dismiss removes entry and clears its timer', () => {
    const store = createToaster();
    const id = store.push('info', 'x', { durationMs: 1000 });
    store.dismiss(id);
    expect(store.list()).toHaveLength(0);
    vi.advanceTimersByTime(2000); // timer must not throw / re-add
    expect(store.list()).toHaveLength(0);
  });

  it('dismiss with unknown id is a no-op', () => {
    const store = createToaster();
    const listener = vi.fn();
    store.subscribe(listener);
    listener.mockClear();
    store.dismiss(99999);
    expect(listener).not.toHaveBeenCalled();
  });

  it('clear removes all entries and clears all timers', () => {
    const store = createToaster();
    store.push('info', 'a', { durationMs: 1000 });
    store.push('info', 'b', { durationMs: 2000 });
    store.clear();
    expect(store.list()).toEqual([]);
    vi.advanceTimersByTime(5000);
    expect(store.list()).toEqual([]);
  });

  it('clear is a no-op when there is nothing to clear', () => {
    const store = createToaster();
    const listener = vi.fn();
    store.subscribe(listener);
    listener.mockClear();
    store.clear();
    expect(listener).not.toHaveBeenCalled();
  });

  it('push with reused id replaces the existing entry in place', () => {
    const store = createToaster();
    const id = store.push('info', 'first', { durationMs: 1000 });
    store.push('success', 'second', { id, durationMs: Infinity });
    const entries = store.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe(id);
    expect(entries[0]?.kind).toBe('success');
    expect(entries[0]?.message).toBe('second');
    expect(entries[0]?.durationMs).toBeUndefined();
    // original auto-dismiss timer must be cancelled
    vi.advanceTimersByTime(5000);
    expect(store.list()).toHaveLength(1);
  });

  it('push enforces visibleLimit by dropping oldest', () => {
    const store = createToaster({ visibleLimit: 3 });
    store.push('info', '1');
    store.push('info', '2');
    store.push('info', '3');
    store.push('info', '4');
    const messages = store.list().map((e) => e.message);
    expect(messages).toEqual(['2', '3', '4']);
  });

  it('visibleLimit floor is 1', () => {
    const store = createToaster({ visibleLimit: 0 });
    store.push('info', 'only');
    store.push('info', 'replaces');
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.message).toBe('replaces');
  });

  it('exports the default duration and limit constants', () => {
    expect(DEFAULT_TOAST_DURATION_MS).toBe(5000);
    expect(DEFAULT_TOAST_VISIBLE_LIMIT).toBe(100);
  });

  it('push records action when supplied', () => {
    const store = createToaster();
    const onClick = vi.fn();
    store.push('info', 'with action', {
      action: { label: 'Undo', onClick },
    });
    const entries = store.list();
    expect(entries[0]?.action?.label).toBe('Undo');
    entries[0]?.action?.onClick();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('push records description when supplied', () => {
    const store = createToaster();
    store.push('info', 'title', { description: 'more detail' });
    expect(store.list()[0]?.description).toBe('more detail');
  });

  it('update changes existing entry contents', () => {
    const store = createToaster();
    const id = store.push('info', 'loading...');
    expect(store.update(id, { kind: 'success', message: 'ok' })).toBe(true);
    const entries = store.list();
    expect(entries[0]?.kind).toBe('success');
    expect(entries[0]?.message).toBe('ok');
  });

  it('update with unknown id returns false', () => {
    const store = createToaster();
    expect(store.update(99999, { kind: 'error' })).toBe(false);
  });

  it('update with new durationMs reschedules the timer', () => {
    const store = createToaster();
    const id = store.push('info', 'l', { durationMs: 100 });
    store.update(id, { durationMs: 5000 });
    vi.advanceTimersByTime(200);
    expect(store.list()).toHaveLength(1);
    vi.advanceTimersByTime(5000);
    expect(store.list()).toHaveLength(0);
  });

  it('list returns an immutable snapshot', () => {
    const store = createToaster();
    store.push('info', 'a');
    const snapshot = store.list() as unknown as { length: number };
    expect(() => {
      // mutating the snapshot must not affect store
      (snapshot as unknown as unknown[]).length = 0;
    }).not.toThrow();
    expect(store.list()).toHaveLength(1);
  });

  it('rapid push calls produce unique ids', () => {
    const store = createToaster({ now: () => 12345 });
    const ids = new Set<number>();
    for (let i = 0; i < 10; i++) ids.add(store.push('info', `${i}`));
    expect(ids.size).toBe(10);
  });

  it('uses custom now() for createdAt', () => {
    let t = 7777;
    const store = createToaster({ now: () => t });
    store.push('info', 'a');
    t = 9999;
    store.push('info', 'b');
    const entries = store.list();
    expect(entries[0]?.createdAt).toBe(7777);
    expect(entries[1]?.createdAt).toBe(9999);
  });
});

describe('createToastApi facade', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('success / error / info / warning push the matching kind', () => {
    const store = createToaster();
    const api = createToastApi(store);
    api.success('s');
    api.error('e');
    api.info('i');
    api.warning('w');
    const kinds = store.list().map((e) => e.kind);
    expect(kinds).toEqual(['success', 'error', 'info', 'warning']);
  });

  it('forwards opts to the store', () => {
    const store = createToaster();
    const api = createToastApi(store);
    const onClick = vi.fn();
    api.success('s', { durationMs: 2500, action: { label: 'OK', onClick } });
    const entry = store.list()[0];
    expect(entry?.durationMs).toBe(2500);
    expect(entry?.action?.label).toBe('OK');
  });

  it('dismiss forwards to store.dismiss', () => {
    const store = createToaster();
    const api = createToastApi(store);
    const id = api.info('go');
    api.dismiss(id);
    expect(store.list()).toHaveLength(0);
  });

  it('clear forwards to store.clear', () => {
    const store = createToaster();
    const api = createToastApi(store);
    api.info('a');
    api.error('b');
    api.clear();
    expect(store.list()).toHaveLength(0);
  });

  it('promise: pushes a sticky loading entry while pending', async () => {
    const store = createToaster();
    const api = createToastApi(store);
    let resolveFn: (v: string) => void = () => {};
    const p = new Promise<string>((resolve) => {
      resolveFn = resolve;
    });
    const wrapped = api.promise(p, {
      loading: 'loading...',
      success: 'done!',
      error: 'failed!',
    });
    const loadingEntry = store.list()[0];
    expect(loadingEntry?.kind).toBe('info');
    expect(loadingEntry?.message).toBe('loading...');
    expect(loadingEntry?.durationMs).toBeUndefined();
    resolveFn('ok');
    await wrapped;
  });

  it('promise: resolves -> in-place success swap, returns value', async () => {
    const store = createToaster();
    const api = createToastApi(store);
    const wrapped = api.promise(Promise.resolve(42), {
      loading: 'loading...',
      success: (data) => `done: ${data}`,
      error: 'failed!',
    });
    const result = await wrapped;
    expect(result).toBe(42);
    const entries = store.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('success');
    expect(entries[0]?.message).toBe('done: 42');
  });

  it('promise: rejects -> in-place error swap, rethrows', async () => {
    const store = createToaster();
    const api = createToastApi(store);
    const cause = new Error('boom');
    const wrapped = api.promise(Promise.reject(cause), {
      loading: 'loading...',
      success: 'done!',
      error: (err) => `oops: ${(err as Error).message}`,
    });
    await expect(wrapped).rejects.toBe(cause);
    const entries = store.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('error');
    expect(entries[0]?.message).toBe('oops: boom');
  });

  it('promise: applies messages.durationMs to the success entry', async () => {
    const store = createToaster();
    const api = createToastApi(store);
    await api.promise(Promise.resolve(1), {
      loading: 'l',
      success: 's',
      error: 'e',
      durationMs: 1500,
    });
    expect(store.list()[0]?.durationMs).toBe(1500);
  });

  it('promise: rejects -> success message function not invoked', async () => {
    const store = createToaster();
    const api = createToastApi(store);
    const successFn = vi.fn(() => 'ok');
    const wrapped = api.promise(Promise.reject(new Error('x')), {
      loading: 'l',
      success: successFn,
      error: 'e',
    });
    await expect(wrapped).rejects.toThrow('x');
    expect(successFn).not.toHaveBeenCalled();
  });
});

describe('module-level singleton', () => {
  beforeEach(() => {
    resetToaster();
  });
  afterEach(() => {
    resetToaster();
  });

  it('toast.success pushes into the shared singleton', () => {
    toast.success('hi');
    const entries = getToasterEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('success');
    expect(entries[0]?.message).toBe('hi');
  });

  it('toast.warning pushes the warning kind', () => {
    toast.warning('be careful');
    expect(getToasterEntries()[0]?.kind).toBe('warning');
  });

  it('subscribeToaster receives push events', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToaster(listener);
    listener.mockClear();
    toast.info('hello');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toHaveLength(1);
    unsubscribe();
  });

  it('subscribeToaster fires initial snapshot on subscribe', () => {
    toast.info('pre');
    const listener = vi.fn();
    const unsubscribe = subscribeToaster(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toHaveLength(1);
    unsubscribe();
  });

  it('resetToaster clears the shared queue', () => {
    toast.info('a');
    toast.error('b');
    resetToaster();
    expect(getToasterEntries()).toEqual([]);
  });

  it('toast.dismiss removes a single entry by id', () => {
    const id1 = toast.info('a');
    toast.info('b');
    toast.dismiss(id1);
    const entries = getToasterEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.message).toBe('b');
  });
});
