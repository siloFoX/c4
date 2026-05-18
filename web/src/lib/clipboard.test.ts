import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderHook } from '@testing-library/react';
import {
  copyTextToClipboard,
  copyTextToClipboardWithError,
  copyWithToast,
  useCopyShortcut,
} from './clipboard';

interface MockClipboard {
  writeText: ReturnType<typeof vi.fn>;
}

function installClipboard(impl: (text: string) => Promise<void> | void): MockClipboard {
  const writeText = vi.fn(async (text: string) => {
    await impl(text);
  });
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

afterEach(() => {
  removeClipboard();
});

describe('copyTextToClipboardWithError()', () => {
  it('writes via the Clipboard API when available and returns { ok: true }', async () => {
    const { writeText } = installClipboard(() => Promise.resolve());
    const result = await copyTextToClipboardWithError('hello');
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
  });

  it('surfaces the original writeText rejection in the error field', async () => {
    installClipboard(() => Promise.reject(new Error('NotAllowedError: write denied')));
    // Make execCommand fail too so the fallback does not paper over
    // the original error.
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    const result = await copyTextToClipboardWithError('x');
    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe('NotAllowedError: write denied');
  });

  it('falls back to document.execCommand when Clipboard API is missing', async () => {
    removeClipboard();
    const execFn = vi.fn(() => true);
    (document as unknown as { execCommand: typeof execFn }).execCommand = execFn;
    const result = await copyTextToClipboardWithError('via-fallback');
    expect(execFn).toHaveBeenCalledWith('copy');
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
  });

  it('returns "Clipboard API unavailable" when both paths fail', async () => {
    removeClipboard();
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    const result = await copyTextToClipboardWithError('x');
    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe('Clipboard API unavailable');
  });

  it('still succeeds via the fallback when writeText rejects but execCommand works', async () => {
    installClipboard(() => Promise.reject(new Error('insecure')));
    (document as unknown as { execCommand: () => boolean }).execCommand = () => true;
    const result = await copyTextToClipboardWithError('mixed');
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
  });

  it('wraps non-Error throws into Error instances', async () => {
    installClipboard(() => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw 'string-throw';
    });
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    const result = await copyTextToClipboardWithError('x');
    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe('string-throw');
  });
});

describe('copyTextToClipboard() (boolean shim)', () => {
  it('returns true on success', async () => {
    installClipboard(() => Promise.resolve());
    expect(await copyTextToClipboard('ok')).toBe(true);
  });

  it('returns false when every path fails', async () => {
    removeClipboard();
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    expect(await copyTextToClipboard('x')).toBe(false);
  });
});

// (v1.11.365, TODO 11.347) Toast wrapper.

describe('copyWithToast()', () => {
  it('emits a success toast with the default label-derived message', async () => {
    installClipboard(() => Promise.resolve());
    const showToast = vi.fn();
    const result = await copyWithToast('hash', { label: 'commit hash', showToast });
    expect(result.ok).toBe(true);
    expect(result.toasted).toBe(true);
    expect(showToast).toHaveBeenCalledWith('Copied commit hash', 'success');
  });

  it('emits a failure toast when both paths fail', async () => {
    removeClipboard();
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    const showToast = vi.fn();
    const result = await copyWithToast('x', { label: 'id', showToast });
    expect(result.ok).toBe(false);
    expect(showToast).toHaveBeenCalledWith('Failed to copy id', 'error');
  });

  it('honours custom success / error messages', async () => {
    installClipboard(() => Promise.resolve());
    const showToast = vi.fn();
    await copyWithToast('x', {
      showToast,
      successMessage: 'Copied 5 IDs',
    });
    expect(showToast).toHaveBeenCalledWith('Copied 5 IDs', 'success');
  });

  it('omits the toast when no showToast is wired (toasted=false)', async () => {
    installClipboard(() => Promise.resolve());
    const result = await copyWithToast('x');
    expect(result.ok).toBe(true);
    expect(result.toasted).toBe(false);
  });

  it('falls back to "Copied" / "Failed to copy" when no label is set', async () => {
    installClipboard(() => Promise.resolve());
    const ok = vi.fn();
    await copyWithToast('x', { showToast: ok });
    expect(ok).toHaveBeenCalledWith('Copied', 'success');

    removeClipboard();
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    const bad = vi.fn();
    await copyWithToast('x', { showToast: bad });
    expect(bad).toHaveBeenCalledWith('Failed to copy', 'error');
  });

  it('fires onCopy on success and onError on failure', async () => {
    installClipboard(() => Promise.resolve());
    const onCopy = vi.fn();
    await copyWithToast('text', { onCopy });
    expect(onCopy).toHaveBeenCalledWith('text');

    removeClipboard();
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    const onError = vi.fn();
    await copyWithToast('text', { onError });
    expect(onError).toHaveBeenCalled();
  });
});

// (v1.11.365, TODO 11.347) Cmd+C / Ctrl+C row shortcut.

function fireCopyShortcut(target?: Element): boolean {
  const evt = new KeyboardEvent('keydown', {
    key: 'c',
    metaKey: true,
    bubbles: true,
    cancelable: true,
  });
  (target ?? window).dispatchEvent(evt);
  return evt.defaultPrevented;
}

describe('useCopyShortcut()', () => {
  it('writes the value to the clipboard on Cmd+C when enabled', async () => {
    const { writeText } = installClipboard(() => Promise.resolve());
    renderHook(() =>
      useCopyShortcut({ value: 'worker-1', enabled: true }),
    );
    fireCopyShortcut();
    // Wait a microtask for the async copyWithToast to land.
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('worker-1');
  });

  it('no-ops when enabled is false', async () => {
    const { writeText } = installClipboard(() => Promise.resolve());
    renderHook(() =>
      useCopyShortcut({ value: 'worker-1', enabled: false }),
    );
    fireCopyShortcut();
    await Promise.resolve();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('no-ops when the focus is inside an INPUT', async () => {
    const { writeText } = installClipboard(() => Promise.resolve());
    const input = document.createElement('input');
    document.body.appendChild(input);
    try {
      renderHook(() =>
        useCopyShortcut({ value: 'x', enabled: true }),
      );
      fireEvent.keyDown(input, { key: 'c', metaKey: true });
      await Promise.resolve();
      expect(writeText).not.toHaveBeenCalled();
    } finally {
      document.body.removeChild(input);
    }
  });

  it('ignores Cmd+Shift+C and Cmd+Alt+C', async () => {
    const { writeText } = installClipboard(() => Promise.resolve());
    renderHook(() =>
      useCopyShortcut({ value: 'x', enabled: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'c', metaKey: true, shiftKey: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'c', metaKey: true, altKey: true }),
    );
    await Promise.resolve();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('fires the toast through showToast', async () => {
    installClipboard(() => Promise.resolve());
    const showToast = vi.fn();
    renderHook(() =>
      useCopyShortcut({
        value: 'demo',
        enabled: true,
        label: 'worker name',
        showToast,
      }),
    );
    fireCopyShortcut();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(showToast).toHaveBeenCalledWith('Copied worker name', 'success');
  });

  it('calls preventDefault on the matched keydown', async () => {
    installClipboard(() => Promise.resolve());
    renderHook(() =>
      useCopyShortcut({ value: 'demo', enabled: true }),
    );
    const prevented = fireCopyShortcut();
    expect(prevented).toBe(true);
  });
});
