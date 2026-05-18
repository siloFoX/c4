// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getPortalRoot,
  cleanupPortalRoot,
  definePortalRoot,
} from './portal-root';

describe('portal-root', () => {
  // (v1.11.322, TODO 11.304) Some tests create elements with
  // a known portal id WITHOUT the `data-portal-root="true"`
  // sentinel (the "reuses pre-existing element" case). To
  // keep tests independent, also purge by known id.
  const KNOWN_IDS = [
    'toast-root',
    'dialog-root',
    'popover-root',
    'dropdown-root',
    'app-portal-root',
  ];
  function purgeAll() {
    document
      .querySelectorAll('[data-portal-root="true"]')
      .forEach((n) => n.remove());
    for (const id of KNOWN_IDS) {
      document.getElementById(id)?.remove();
    }
  }
  beforeEach(() => {
    purgeAll();
  });

  afterEach(() => {
    purgeAll();
  });

  it('creates a node with the requested id under document.body', () => {
    const root = getPortalRoot('toast-root');
    expect(root).not.toBeNull();
    expect(root!.id).toBe('toast-root');
    expect(root!.parentElement).toBe(document.body);
  });

  it('tags the created node with data-portal-root="true"', () => {
    const root = getPortalRoot('toast-root');
    expect(root!.getAttribute('data-portal-root')).toBe('true');
  });

  it('returns the same element on repeated calls (idempotent)', () => {
    const a = getPortalRoot('toast-root');
    const b = getPortalRoot('toast-root');
    expect(b).toBe(a);
    expect(document.querySelectorAll('#toast-root').length).toBe(1);
  });

  it('different ids create separate elements', () => {
    const a = getPortalRoot('toast-root');
    const b = getPortalRoot('dialog-root');
    const c = getPortalRoot('popover-root');
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a!.id).toBe('toast-root');
    expect(b!.id).toBe('dialog-root');
    expect(c!.id).toBe('popover-root');
  });

  it('reuses a pre-existing element with the requested id', () => {
    const preexisting = document.createElement('div');
    preexisting.id = 'popover-root';
    document.body.appendChild(preexisting);
    const root = getPortalRoot('popover-root');
    expect(root).toBe(preexisting);
  });

  it('cleanupPortalRoot removes the element when it has no children', () => {
    getPortalRoot('toast-root');
    expect(document.getElementById('toast-root')).not.toBeNull();
    cleanupPortalRoot('toast-root');
    expect(document.getElementById('toast-root')).toBeNull();
  });

  it('cleanupPortalRoot is a no-op when the element has children', () => {
    const root = getPortalRoot('dialog-root')!;
    root.appendChild(document.createElement('span'));
    cleanupPortalRoot('dialog-root');
    expect(document.getElementById('dialog-root')).not.toBeNull();
  });

  it('cleanupPortalRoot is a no-op when the element does not exist', () => {
    expect(() => cleanupPortalRoot('does-not-exist')).not.toThrow();
  });

  it('returns null in SSR (no document) without throwing', async () => {
    const docDesc = Object.getOwnPropertyDescriptor(globalThis, 'document');
    // Simulate SSR by removing the global document.
    // @ts-expect-error - intentional teardown for SSR branch.
    delete (globalThis as { document?: unknown }).document;
    try {
      const mod = await import('./portal-root');
      expect(mod.getPortalRoot('toast-root')).toBeNull();
    } finally {
      if (docDesc) Object.defineProperty(globalThis, 'document', docDesc);
    }
  });

  // (v1.11.322, TODO 11.304) Decoration overload and the
  // definePortalRoot factory.

  it('getPortalRoot with descriptor stamps className on first creation', () => {
    const root = getPortalRoot('toast-root', {
      className: 'fixed top-0 right-0 z-50',
    });
    expect(root).not.toBeNull();
    expect(root!.className).toBe('fixed top-0 right-0 z-50');
  });

  it('getPortalRoot with descriptor stamps custom attributes', () => {
    const root = getPortalRoot('toast-root', {
      attributes: { 'data-toast-root': 'true', role: 'region' },
    });
    expect(root!.getAttribute('data-toast-root')).toBe('true');
    expect(root!.getAttribute('role')).toBe('region');
  });

  it('decoration is idempotent across repeated calls', () => {
    const first = getPortalRoot('toast-root', {
      className: 'a b c',
      attributes: { 'data-x': '1' },
    });
    // Caller could mutate the className post-creation; if
    // they do, the decorator must NOT re-stamp on the next
    // get() call.
    first!.className = 'mutated';
    const second = getPortalRoot('toast-root', {
      className: 'a b c',
      attributes: { 'data-x': '1' },
    });
    expect(second).toBe(first);
    expect(second!.className).toBe('mutated');
  });

  it('decoration marker uses the default data-decorated-<id> sentinel', () => {
    const root = getPortalRoot('toast-root', { className: 'foo' });
    expect(root!.getAttribute('data-decorated-toast-root')).toBe('true');
  });

  it('custom decorationMarker overrides the sentinel', () => {
    const root = getPortalRoot('toast-root', {
      className: 'foo',
      decorationMarker: 'data-my-marker',
    });
    expect(root!.getAttribute('data-my-marker')).toBe('true');
    expect(root!.getAttribute('data-decorated-toast-root')).toBeNull();
  });

  it('definePortalRoot returns a typed getter that reuses the underlying element', () => {
    const getter = definePortalRoot('dropdown-root', {
      className: 'pointer-events-none',
      attributes: { 'data-dropdown-root': 'true' },
    });
    const a = getter();
    const b = getter();
    expect(a).not.toBeNull();
    expect(b).toBe(a);
    expect(a!.id).toBe('dropdown-root');
    expect(a!.className).toBe('pointer-events-none');
    expect(a!.getAttribute('data-dropdown-root')).toBe('true');
  });

  it('definePortalRoot preserves data-portal-root="true" on the element', () => {
    const getter = definePortalRoot('popover-root', {
      className: 'z-40',
    });
    const root = getter();
    expect(root!.getAttribute('data-portal-root')).toBe('true');
  });

  it('definePortalRoot returns null in SSR', async () => {
    const docDesc = Object.getOwnPropertyDescriptor(globalThis, 'document');
    // @ts-expect-error - intentional teardown for SSR branch.
    delete (globalThis as { document?: unknown }).document;
    try {
      const mod = await import('./portal-root');
      const getter = mod.definePortalRoot('toast-root', { className: 'x' });
      expect(getter()).toBeNull();
    } finally {
      if (docDesc) Object.defineProperty(globalThis, 'document', docDesc);
    }
  });

  it('warns and returns null when document.body is missing', () => {
    const original = document.body;
    Object.defineProperty(document, 'body', {
      configurable: true,
      get: () => null,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const root = getPortalRoot('toast-root');
      expect(root).toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally {
      Object.defineProperty(document, 'body', {
        configurable: true,
        value: original,
      });
      warn.mockRestore();
    }
  });
});
