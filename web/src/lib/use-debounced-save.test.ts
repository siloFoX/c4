import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedSave } from './use-debounced-save';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

interface Prefs {
  theme: 'light' | 'dark';
}

describe('useDebouncedSave', () => {
  it('renders the initial value with status=idle', () => {
    const { result } = renderHook(() =>
      useDebouncedSave<Prefs>({
        initialValue: { theme: 'dark' },
        onSave: async () => undefined,
      }),
    );
    expect(result.current.value).toEqual({ theme: 'dark' });
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('commit updates the value immediately + flips to pending', () => {
    const { result } = renderHook(() =>
      useDebouncedSave<Prefs>({
        initialValue: { theme: 'dark' },
        onSave: async () => undefined,
      }),
    );
    act(() => result.current.commit({ theme: 'light' }));
    expect(result.current.value).toEqual({ theme: 'light' });
    expect(result.current.status).toBe('pending');
  });

  it('coalesces rapid commits into one save with the latest value', async () => {
    const onSave = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useDebouncedSave<Prefs>({
        initialValue: { theme: 'dark' },
        onSave,
        debounceMs: 200,
      }),
    );
    act(() => result.current.commit({ theme: 'light' }));
    act(() => result.current.commit({ theme: 'dark' }));
    act(() => result.current.commit({ theme: 'light' }));
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ theme: 'light' });
  });

  it('flips status idle -> pending -> saving -> idle on success', async () => {
    let resolveSave: ((v?: Prefs) => void) | null = null;
    const onSave = vi.fn(
      () =>
        new Promise<Prefs | void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const { result } = renderHook(() =>
      useDebouncedSave<Prefs>({
        initialValue: { theme: 'dark' },
        onSave,
        debounceMs: 50,
      }),
    );
    act(() => result.current.commit({ theme: 'light' }));
    expect(result.current.status).toBe('pending');
    await act(async () => {
      vi.advanceTimersByTime(60);
    });
    expect(result.current.status).toBe('saving');
    await act(async () => {
      resolveSave?.();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe('idle');
  });

  it('reverts value on save failure + flips status to error', async () => {
    let rejectSave: ((err: unknown) => void) | null = null;
    const onSave = vi.fn(
      () =>
        new Promise<Prefs | void>((_, reject) => {
          rejectSave = reject;
        }),
    );
    const { result } = renderHook(() =>
      useDebouncedSave<Prefs>({
        initialValue: { theme: 'dark' },
        onSave,
        debounceMs: 50,
      }),
    );
    act(() => result.current.commit({ theme: 'light' }));
    await act(async () => {
      vi.advanceTimersByTime(60);
    });
    const error = new Error('server-error');
    await act(async () => {
      rejectSave?.(error);
      await Promise.resolve();
    });
    expect(result.current.value).toEqual({ theme: 'dark' });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(error);
  });

  it('adopts the server-authoritative value when onSave returns one', async () => {
    const onSave = vi.fn(async (_next: Prefs) => ({ theme: 'dark' as const }));
    const { result } = renderHook(() =>
      useDebouncedSave<Prefs>({
        initialValue: { theme: 'dark' },
        onSave,
        debounceMs: 50,
      }),
    );
    act(() => result.current.commit({ theme: 'light' }));
    await act(async () => {
      vi.advanceTimersByTime(60);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.value).toEqual({ theme: 'dark' });
  });

  it('flush() fires the pending save immediately', async () => {
    const onSave = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useDebouncedSave<Prefs>({
        initialValue: { theme: 'dark' },
        onSave,
        debounceMs: 5000,
      }),
    );
    act(() => result.current.commit({ theme: 'light' }));
    expect(onSave).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.flush();
    });
    expect(onSave).toHaveBeenCalledWith({ theme: 'light' });
  });

  it('reset() restores to the last committed value when called with no args', async () => {
    const onSave = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useDebouncedSave<Prefs>({
        initialValue: { theme: 'dark' },
        onSave,
        debounceMs: 50,
      }),
    );
    act(() => result.current.commit({ theme: 'light' }));
    await act(async () => {
      vi.advanceTimersByTime(60);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.status).toBe('idle');
    act(() => result.current.commit({ theme: 'dark' }));
    act(() => result.current.reset());
    expect(result.current.value).toEqual({ theme: 'light' });
    expect(result.current.status).toBe('idle');
  });

  it('reset(next) overrides both optimistic + committed', () => {
    const onSave = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useDebouncedSave<Prefs>({
        initialValue: { theme: 'dark' },
        onSave,
      }),
    );
    act(() => result.current.commit({ theme: 'light' }));
    act(() => result.current.reset({ theme: 'dark' }));
    expect(result.current.value).toEqual({ theme: 'dark' });
    expect(result.current.status).toBe('idle');
  });

  it('next commit() after an error clears error + starts fresh', async () => {
    let rejectSave: ((err: unknown) => void) | null = null;
    let saveCount = 0;
    const onSave = vi.fn(() => {
      saveCount += 1;
      if (saveCount === 1) {
        return new Promise<Prefs | void>((_, reject) => {
          rejectSave = reject;
        });
      }
      return Promise.resolve();
    });
    const { result } = renderHook(() =>
      useDebouncedSave<Prefs>({
        initialValue: { theme: 'dark' },
        onSave,
        debounceMs: 50,
      }),
    );
    act(() => result.current.commit({ theme: 'light' }));
    await act(async () => {
      vi.advanceTimersByTime(60);
    });
    await act(async () => {
      rejectSave?.(new Error('boom'));
      await Promise.resolve();
    });
    expect(result.current.status).toBe('error');
    act(() => result.current.commit({ theme: 'light' }));
    expect(result.current.status).toBe('pending');
    expect(result.current.error).toBeNull();
  });

  it('fires onBeforeSave + onAfterSave hooks', async () => {
    const onBeforeSave = vi.fn();
    const onAfterSave = vi.fn();
    const { result } = renderHook(() =>
      useDebouncedSave<Prefs>({
        initialValue: { theme: 'dark' },
        onSave: async (next) => next,
        debounceMs: 50,
        onBeforeSave,
        onAfterSave,
      }),
    );
    act(() => result.current.commit({ theme: 'light' }));
    await act(async () => {
      vi.advanceTimersByTime(60);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onBeforeSave).toHaveBeenCalledWith({ theme: 'light' });
    expect(onAfterSave).toHaveBeenCalledWith({ theme: 'light' });
  });

  it('clears the timer on unmount (no save fires after unmount)', async () => {
    const onSave = vi.fn(async () => undefined);
    const { result, unmount } = renderHook(() =>
      useDebouncedSave<Prefs>({
        initialValue: { theme: 'dark' },
        onSave,
        debounceMs: 200,
      }),
    );
    act(() => result.current.commit({ theme: 'light' }));
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(onSave).not.toHaveBeenCalled();
  });
});
