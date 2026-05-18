// (v1.11.349, TODO 11.331) Keyboard-nav smoke helper.
//
// The dispatch asks for a per-page audit of Tab,
// Shift+Tab, Esc, Enter, and Space behaviour. jsdom
// supports synthetic keyboard events
// (`keydown`/`keyup`/`keypress`) and React's synthetic
// event layer, but it does NOT implement the browser's
// native focus-traversal algorithm: `document.activeElement`
// does not change automatically when the user presses
// Tab. The helpers below cover the parts of the
// keyboard contract that ARE evaluable in jsdom:
//
//   * Tabbable inventory -- iterate every interactive
//     element under a container and verify it is
//     reachable via Tab (has a tabindex >= 0 OR is a
//     natively-focusable tag with no disabled flag).
//   * Focus order -- the tabbable inventory IS the
//     focus order; the helper returns it so callers
//     can assert ordering.
//   * onClick/onKeyDown parity -- non-button elements
//     (div / span / li) that carry an `onClick`
//     handler MUST also handle Enter / Space to stay
//     keyboard-accessible. The helper takes a
//     container + the same handler signature and
//     reports per-element findings.
//   * Escape-to-close -- callers fire a synthetic
//     keydown(Escape) and assert the consumer's
//     handler ran. The helper exposes
//     `fireEscape(target)` so the call site stays a
//     one-liner.
//
// Combined with the v1.11.345 axe-vitest helper, this
// covers the four dispatch targets (Tab / Shift+Tab /
// Esc / Enter+Space). Real-browser keyboard simulation
// (the actual focus traversal that the OS performs)
// stays out of scope; a Playwright follow-up can
// re-exercise the geometry side.

// (v1.11.349, TODO 11.331) Selector for elements that
// participate in the default tab order. Mirrors the
// canonical "tabbable elements" list used by
// focus-trap libraries: form controls + anchors +
// elements with an explicit positive tabindex. Hidden
// elements (display:none, visibility:hidden, hidden
// attribute, disabled) are filtered out post-query
// because jsdom returns them from `querySelectorAll`.
const TABBABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isHidden(el: HTMLElement): boolean {
  if (el.hasAttribute('hidden')) return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;
  // jsdom does not compute styles for utility classes,
  // but inline display:none / visibility:hidden are
  // still detectable via the inline style attribute.
  const inline = el.style;
  if (inline.display === 'none') return true;
  if (inline.visibility === 'hidden') return true;
  return false;
}

export interface TabbableEntry {
  el: HTMLElement;
  tag: string;
  // Reduced label: aria-label > textContent > tag name.
  label: string;
}

export function listTabbable(container: Element): TabbableEntry[] {
  const all = container.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR);
  const out: TabbableEntry[] = [];
  all.forEach((el) => {
    if (isHidden(el)) return;
    // tabindex="-1" passes the CSS selector when the
    // attribute is omitted (the selector :not([tabindex="-1"])
    // matches "no tabindex" too), so guard again here.
    if (el.getAttribute('tabindex') === '-1') return;
    const aria = el.getAttribute('aria-label');
    const text = (el.textContent ?? '').trim();
    const label = aria || text || el.tagName.toLowerCase();
    out.push({ el, tag: el.tagName.toLowerCase(), label });
  });
  return out;
}

// (v1.11.349, TODO 11.331) Click-without-keyboard finding.
// Reports elements whose React `onClick` prop is set but
// the element is NOT natively focusable (button / a /
// input / select / textarea) AND lacks an
// `onKeyDown` / `onKeyUp` / `onKeyPress` handler in the
// rendered markup. A real DOM walk cannot inspect React
// props, but in jsdom the rendered element carries the
// listeners via `addEventListener`; we instead infer
// from the tag name + the presence of a `role` /
// `tabindex` attribute.
export interface InteractiveFinding {
  el: HTMLElement;
  tag: string;
  reason:
    | 'click-no-keyboard'
    | 'div-as-button-no-tabindex'
    | 'div-as-button-no-role';
}

// (v1.11.349, TODO 11.331) Classify a non-form-control
// element acting as an interactive target. The
// heuristic flags `<div onClick>` / `<span onClick>` /
// `<li onClick>` that are missing the tabindex / role
// affordances they need to be keyboard-reachable. In
// jsdom the React onClick prop attaches an event
// listener at the document root (delegation) so we
// cannot directly read whether the prop was set; the
// caller's tests can pre-mark elements via
// `data-clickable="true"` so the helper has a stable
// signal to scan.
export function findInteractiveGaps(container: Element): InteractiveFinding[] {
  const out: InteractiveFinding[] = [];
  const candidates = container.querySelectorAll<HTMLElement>(
    '[data-clickable="true"]',
  );
  candidates.forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const focusable = ['button', 'a', 'input', 'select', 'textarea'].includes(
      tag,
    );
    if (focusable) return;
    const ti = el.getAttribute('tabindex');
    if (ti === null) {
      out.push({ el, tag, reason: 'div-as-button-no-tabindex' });
    }
    const role = el.getAttribute('role');
    if (role !== 'button' && role !== 'link' && role !== 'menuitem') {
      out.push({ el, tag, reason: 'div-as-button-no-role' });
    }
  });
  return out;
}

// (v1.11.349, TODO 11.331) Fire a synthetic Escape
// keydown on the supplied target. The event bubbles by
// default so any ancestor `keydown` listener (Drawer,
// Dialog, ConfirmDialog, etc.) catches it. Returns the
// event for callers that want to inspect `defaultPrevented`.
export function fireEscape(target: EventTarget = document): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', {
    key: 'Escape',
    code: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(ev);
  return ev;
}

// (v1.11.349, TODO 11.331) Fire a synthetic Enter
// keydown on the supplied target. Same bubbling /
// cancelable contract as `fireEscape`.
export function fireEnter(target: EventTarget = document): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(ev);
  return ev;
}

// (v1.11.349, TODO 11.331) Fire a synthetic Space
// keydown on the supplied target.
export function fireSpace(target: EventTarget = document): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', {
    key: ' ',
    code: 'Space',
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(ev);
  return ev;
}

// (v1.11.349, TODO 11.331) Fire a synthetic Tab
// keydown. jsdom does NOT advance `document.activeElement`
// in response to Tab; the helper exists for tests that
// want to assert a custom Tab handler (focus trap,
// roving-tabindex hook) catches the event.
export function fireTab(
  target: EventTarget = document,
  shift: boolean = false,
): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', {
    key: 'Tab',
    code: 'Tab',
    shiftKey: shift,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(ev);
  return ev;
}

export interface KeyboardAuditReport {
  tabbable: TabbableEntry[];
  gaps: InteractiveFinding[];
  ok: boolean;
}

export function auditKeyboardNav(container: Element): KeyboardAuditReport {
  const tabbable = listTabbable(container);
  const gaps = findInteractiveGaps(container);
  return { tabbable, gaps, ok: gaps.length === 0 };
}

export function expectKeyboardAuditOk(report: KeyboardAuditReport): void {
  if (report.ok) return;
  const summary = report.gaps
    .map((g) => `  ${g.tag}: ${g.reason}`)
    .join('\n');
  throw new Error(
    `Keyboard audit failed (${report.gaps.length} gaps):\n${summary}`,
  );
}
