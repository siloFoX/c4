// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getPortalRoot, cleanupPortalRoot } from './portal-root';

describe('portal-root', () => {
  beforeEach(() => {
    document
      .querySelectorAll('[data-portal-root="true"]')
      .forEach((n) => n.remove());
  });

  afterEach(() => {
    document
      .querySelectorAll('[data-portal-root="true"]')
      .forEach((n) => n.remove());
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
