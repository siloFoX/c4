import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  copyTextToClipboard,
  copyTextToClipboardWithError,
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
