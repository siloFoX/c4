import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectPlatform,
  formatKeymap,
  formatKeymapForCurrentPlatform,
} from './shortcut-keymap';

function stubNavigator(platform: string, ua = '') {
  vi.stubGlobal('navigator', { platform, userAgent: ua });
}

describe('detectPlatform', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns "mac" when navigator.platform matches MacIntel', () => {
    stubNavigator('MacIntel');
    expect(detectPlatform()).toBe('mac');
  });

  it('returns "mac" for iPhone', () => {
    stubNavigator('iPhone');
    expect(detectPlatform()).toBe('mac');
  });

  it('returns "other" for Win32', () => {
    stubNavigator('Win32');
    expect(detectPlatform()).toBe('other');
  });

  it('returns "other" for Linux', () => {
    stubNavigator('Linux x86_64');
    expect(detectPlatform()).toBe('other');
  });

  it('falls back to userAgent when platform is unrecognised', () => {
    stubNavigator(
      '',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    );
    expect(detectPlatform()).toBe('mac');
  });
});

describe('formatKeymap', () => {
  it('rewrites Ctrl to Cmd on mac', () => {
    expect(formatKeymap('Ctrl+B', 'mac')).toBe('Cmd+B');
  });

  it('rewrites Alt to Option on mac', () => {
    expect(formatKeymap('Alt+F4', 'mac')).toBe('Option+F4');
  });

  it('rewrites Cmd to Ctrl on other platforms', () => {
    expect(formatKeymap('Cmd+K', 'other')).toBe('Ctrl+K');
  });

  it('rewrites Option to Alt on other platforms', () => {
    expect(formatKeymap('Option+F4', 'other')).toBe('Alt+F4');
  });

  it('handles multi-modifier shortcuts', () => {
    expect(formatKeymap('Ctrl+Shift+P', 'mac')).toBe('Cmd+Shift+P');
  });

  it('leaves Shift untouched on mac', () => {
    expect(formatKeymap('Shift+Enter', 'mac')).toBe('Shift+Enter');
  });

  it('leaves chord shortcuts (no +) untouched', () => {
    expect(formatKeymap('g h', 'mac')).toBe('g h');
  });

  it('leaves single-key shortcuts untouched', () => {
    expect(formatKeymap('?', 'mac')).toBe('?');
    expect(formatKeymap('Esc', 'other')).toBe('Esc');
  });

  it('idempotent on already-mac labels for mac', () => {
    expect(formatKeymap('Cmd+B', 'mac')).toBe('Cmd+B');
  });

  it('idempotent on already-pc labels for other', () => {
    expect(formatKeymap('Ctrl+B', 'other')).toBe('Ctrl+B');
  });
});

describe('formatKeymapForCurrentPlatform', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the live platform when called', () => {
    stubNavigator('MacIntel');
    expect(formatKeymapForCurrentPlatform('Ctrl+B')).toBe('Cmd+B');
  });

  it('uses other platform when not mac', () => {
    stubNavigator('Win32');
    expect(formatKeymapForCurrentPlatform('Cmd+B')).toBe('Ctrl+B');
  });
});
