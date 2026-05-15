import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCopyToClipboard } from './use-copy-to-clipboard';

interface ClipboardMock {
  writeText: ReturnType<typeof vi.fn>;
}

function installClipboard(impl: (text: string) => Promise<void>): ClipboardMock {
  const writeText = vi.fn(impl);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  return { writeText };
}

function removeClipboard(): void {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  });
}

const originalDescriptor = Object.getOwnPropertyDescriptor(
  Navigator.prototype,
  'clipboard',
);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  if (originalDescriptor) {
    Object.defineProperty(Navigator.prototype, 'clipboard', originalDescriptor);
  } else {
    removeClipboard();
  }
});

describe('useCopyToClipboard', () => {
  it('calls navigator.clipboard.writeText with the provided text', async () => {
    const { writeText } = installClipboard(() => Promise.resolve());
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => {
      await result.current.copy('hello world');
    });
    expect(writeText).toHaveBeenCalledWith('hello world');
  });

  it('flips copied to true after a successful copy', async () => {
    installClipboard(() => Promise.resolve());
    const { result } = renderHook(() => useCopyToClipboard(500));
    await act(async () => {
      await result.current.copy('x');
    });
    expect(result.current.copied).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('auto-resets copied to false after resetMs', async () => {
    installClipboard(() => Promise.resolve());
    const { result } = renderHook(() => useCopyToClipboard(200));
    await act(async () => {
      await result.current.copy('x');
    });
    expect(result.current.copied).toBe(true);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.copied).toBe(false);
  });

  it('captures error on writeText rejection', async () => {
    installClipboard(() => Promise.reject(new Error('denied')));
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => {
      await result.current.copy('x');
    });
    expect(result.current.copied).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('denied');
  });

  it('falls back to document.execCommand when clipboard is unavailable', async () => {
    removeClipboard();
    const execFn = vi.fn(() => true);
    (document as unknown as { execCommand: typeof execFn }).execCommand = execFn;
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => {
      await result.current.copy('via-fallback');
    });
    expect(execFn).toHaveBeenCalledWith('copy');
    expect(result.current.copied).toBe(true);
    expect(result.current.error).toBeNull();
    delete (document as unknown as { execCommand?: unknown }).execCommand;
  });

  it('captures error when fallback execCommand returns false', async () => {
    removeClipboard();
    const execFn = vi.fn(() => false);
    (document as unknown as { execCommand: typeof execFn }).execCommand = execFn;
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => {
      await result.current.copy('x');
    });
    expect(result.current.copied).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    delete (document as unknown as { execCommand?: unknown }).execCommand;
  });

  it('does not leak a timeout after unmount', async () => {
    installClipboard(() => Promise.resolve());
    const { result, unmount } = renderHook(() => useCopyToClipboard(500));
    await act(async () => {
      await result.current.copy('x');
    });
    expect(result.current.copied).toBe(true);
    unmount();
    expect(() => {
      vi.advanceTimersByTime(1000);
    }).not.toThrow();
  });
});
