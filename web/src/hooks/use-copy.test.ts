import { describe, expect, it } from 'vitest';
import {
  copyTextToClipboard,
  useCopy,
  useCopyToClipboard,
} from './use-copy';

describe('hooks/use-copy module', () => {
  it('exports useCopy as the canonical hook name', () => {
    expect(typeof useCopy).toBe('function');
  });

  it('keeps useCopyToClipboard exported for legacy consumers', () => {
    expect(typeof useCopyToClipboard).toBe('function');
  });

  it('useCopy and useCopyToClipboard are the same function (alias contract)', () => {
    expect(useCopy).toBe(useCopyToClipboard);
  });

  it('re-exports the imperative copyTextToClipboard helper', () => {
    expect(typeof copyTextToClipboard).toBe('function');
  });
});
