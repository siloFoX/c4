// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  auditKeyboardNav,
  expectKeyboardAuditOk,
  findInteractiveGaps,
  fireEnter,
  fireEscape,
  fireSpace,
  fireTab,
  listTabbable,
} from './keyboard';

function fragment(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

describe('listTabbable', () => {
  it('returns every natively focusable form element', () => {
    const root = fragment(`
      <button>btn</button>
      <a href="#">link</a>
      <input type="text" />
      <select><option>x</option></select>
      <textarea></textarea>
    `);
    const out = listTabbable(root);
    expect(out.map((e) => e.tag).sort()).toEqual([
      'a',
      'button',
      'input',
      'select',
      'textarea',
    ]);
    root.remove();
  });

  it('skips disabled form controls', () => {
    const root = fragment(`
      <button disabled>btn</button>
      <input type="text" disabled />
    `);
    expect(listTabbable(root)).toHaveLength(0);
    root.remove();
  });

  it('skips hidden / aria-hidden / display:none elements', () => {
    const root = fragment(`
      <button hidden>a</button>
      <button aria-hidden="true">b</button>
      <button style="display:none">c</button>
      <button style="visibility:hidden">d</button>
      <button>e</button>
    `);
    const out = listTabbable(root);
    expect(out).toHaveLength(1);
    expect(out[0]?.label).toBe('e');
    root.remove();
  });

  it('includes elements with explicit non-negative tabindex', () => {
    const root = fragment(`<div tabindex="0">divbtn</div>`);
    expect(listTabbable(root)).toHaveLength(1);
    root.remove();
  });

  it('excludes elements with tabindex="-1"', () => {
    const root = fragment(`<div tabindex="-1">skipme</div>`);
    expect(listTabbable(root)).toHaveLength(0);
    root.remove();
  });

  it('reports the aria-label when present, falling back to textContent', () => {
    const root = fragment(`
      <button aria-label="Save document">save</button>
      <button>Delete</button>
    `);
    const labels = listTabbable(root).map((e) => e.label);
    expect(labels).toContain('Save document');
    expect(labels).toContain('Delete');
    root.remove();
  });
});

describe('findInteractiveGaps', () => {
  it('flags div[data-clickable=true] without tabindex or role', () => {
    const root = fragment(`<div data-clickable="true">click me</div>`);
    const out = findInteractiveGaps(root);
    expect(out.length).toBeGreaterThan(0);
    const reasons = out.map((g) => g.reason);
    expect(reasons).toContain('div-as-button-no-tabindex');
    expect(reasons).toContain('div-as-button-no-role');
    root.remove();
  });

  it('passes div[data-clickable=true] with tabindex=0 + role=button', () => {
    const root = fragment(
      `<div data-clickable="true" tabindex="0" role="button">click</div>`,
    );
    expect(findInteractiveGaps(root)).toHaveLength(0);
    root.remove();
  });

  it('does NOT flag native button/a/input/select/textarea', () => {
    const root = fragment(`
      <button data-clickable="true">b</button>
      <a href="#" data-clickable="true">l</a>
      <input data-clickable="true" />
    `);
    expect(findInteractiveGaps(root)).toHaveLength(0);
    root.remove();
  });

  it('accepts role=link / role=menuitem as keyboard-equivalent roles', () => {
    const root = fragment(`
      <div data-clickable="true" tabindex="0" role="link">l</div>
      <div data-clickable="true" tabindex="0" role="menuitem">m</div>
    `);
    expect(findInteractiveGaps(root)).toHaveLength(0);
    root.remove();
  });
});

describe('fire helpers', () => {
  it('fireEscape dispatches a bubbling, cancelable keydown(Escape)', () => {
    const handler = vi.fn();
    document.addEventListener('keydown', handler);
    fireEscape();
    expect(handler).toHaveBeenCalledTimes(1);
    const ev = handler.mock.calls[0]?.[0] as KeyboardEvent;
    expect(ev.key).toBe('Escape');
    expect(ev.bubbles).toBe(true);
    expect(ev.cancelable).toBe(true);
    document.removeEventListener('keydown', handler);
  });

  it('fireEnter dispatches keydown(Enter)', () => {
    const handler = vi.fn();
    document.addEventListener('keydown', handler);
    fireEnter();
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]?.[0] as KeyboardEvent).key).toBe('Enter');
    document.removeEventListener('keydown', handler);
  });

  it('fireSpace dispatches keydown(Space)', () => {
    const handler = vi.fn();
    document.addEventListener('keydown', handler);
    fireSpace();
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]?.[0] as KeyboardEvent).key).toBe(' ');
    document.removeEventListener('keydown', handler);
  });

  it('fireTab dispatches keydown(Tab) without shift by default', () => {
    const handler = vi.fn();
    document.addEventListener('keydown', handler);
    fireTab();
    expect((handler.mock.calls[0]?.[0] as KeyboardEvent).shiftKey).toBe(false);
    handler.mockReset();
    fireTab(document, true);
    expect((handler.mock.calls[0]?.[0] as KeyboardEvent).shiftKey).toBe(true);
    document.removeEventListener('keydown', handler);
  });

  it('fireEscape targets a specific element when provided', () => {
    const target = document.createElement('button');
    document.body.appendChild(target);
    const handler = vi.fn();
    target.addEventListener('keydown', handler);
    fireEscape(target);
    expect(handler).toHaveBeenCalledTimes(1);
    target.remove();
  });
});

describe('auditKeyboardNav', () => {
  it('returns ok=true when every clickable has the right tabindex+role', () => {
    const root = fragment(`
      <button>save</button>
      <div data-clickable="true" tabindex="0" role="button">custom</div>
    `);
    const report = auditKeyboardNav(root);
    expect(report.ok).toBe(true);
    expect(report.tabbable.length).toBeGreaterThan(0);
    expect(report.gaps).toHaveLength(0);
    root.remove();
  });

  it('returns ok=false when a clickable div lacks tabindex+role', () => {
    const root = fragment(`<div data-clickable="true">x</div>`);
    const report = auditKeyboardNav(root);
    expect(report.ok).toBe(false);
    expect(report.gaps.length).toBeGreaterThan(0);
    root.remove();
  });
});

describe('expectKeyboardAuditOk', () => {
  it('is a no-op when the report is ok', () => {
    expect(() =>
      expectKeyboardAuditOk({
        tabbable: [],
        gaps: [],
        ok: true,
      }),
    ).not.toThrow();
  });

  it('throws with a multi-gap summary when the report has gaps', () => {
    expect(() =>
      expectKeyboardAuditOk({
        tabbable: [],
        gaps: [
          {
            el: document.createElement('div'),
            tag: 'div',
            reason: 'div-as-button-no-tabindex',
          },
        ],
        ok: false,
      }),
    ).toThrow(/1 gaps/);
  });
});
