// (v1.11.347, TODO 11.329) Responsive layout smoke
// helper. The dispatch wants a vitest + jsdom test that
// renders each page at the four canonical breakpoints
// (375 / 768 / 1280 / 1920) and asserts no horizontal
// overflow.
//
// jsdom does NOT layout content -- `getBoundingClientRect()`
// returns zero rectangles and `scrollWidth` / `clientWidth`
// are not computed from real measurements. The smoke
// helper therefore relies on three signals that ARE
// available in jsdom:
//
//   1. `window.matchMedia(query).matches` -- driven by a
//      mocked `matchMedia` so responsive hooks (e.g.,
//      `useIsDesktop`, `useEffectiveCollapsed`) flip
//      their state when the harness flips the width.
//   2. `window.innerWidth` -- written via
//      `Object.defineProperty` and a synthetic resize
//      event so size-aware effects can re-run.
//   3. Inline-style scan -- after render, any element
//      with `style="width: <Npx>"` or `style="min-width:
//      <Npx>"` where `<N>` exceeds the viewport is
//      flagged as a real overflow risk.
//
// These three together catch the common regressions
// (responsive hook didn't fire, hardcoded pixel width
// busts the viewport) without requiring a real browser.
// Pixel-perfect layout audits stay out of scope; a
// Playwright follow-up can validate the geometry side.

export interface ResponsiveBreakpoint {
  name: string;
  width: number;
}

export const RESPONSIVE_BREAKPOINTS: readonly ResponsiveBreakpoint[] = [
  { name: 'mobile', width: 375 },
  { name: 'tablet', width: 768 },
  { name: 'desktop', width: 1280 },
  { name: 'wide', width: 1920 },
];

// (v1.11.347, TODO 11.329) Tailwind default breakpoint
// thresholds. The matchMedia mock evaluates `min-width`
// queries against the active width by comparing the
// numeric pixel threshold extracted from the query
// string. Tailwind class names like `sm:`, `md:`,
// `lg:`, `xl:`, `2xl:` resolve to these thresholds in
// the project's `tailwind.config.js`. The values match
// the Tailwind defaults; if the project diverges, the
// custom values can be passed via `opts.breakpoints`.
const DEFAULT_TAILWIND_THRESHOLDS: Record<string, number> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

interface MqlEntry {
  matches: boolean;
  listeners: Set<(e: MediaQueryListEvent) => void>;
}

interface ResponsiveHarness {
  setWidth: (width: number) => void;
  restore: () => void;
}

// Extract the px threshold from a `(min-width: <N>px)`
// or `(max-width: <N>px)` query. Returns `null` for
// queries the harness does not model (`prefers-*` etc.).
function parseQueryThreshold(query: string): {
  kind: 'min' | 'max';
  value: number;
} | null {
  const m = query.match(/\((min|max)-width:\s*(\d+)px\)/);
  if (!m || !m[1] || !m[2]) return null;
  return { kind: m[1] as 'min' | 'max', value: Number(m[2]) };
}

// (v1.11.347, TODO 11.329) Install a matchMedia mock +
// width getter that the smoke harness drives. The
// returned `setWidth` triggers the resize event and
// flips every previously-created MediaQueryList's
// `matches` value to track the new width.
//
// The harness keeps its MQL cache keyed by the literal
// query string so two `window.matchMedia('(min-width:
// 768px)')` calls return the same object -- consumers
// that addEventListener once get every flip notification.
export function installResponsiveHarness(): ResponsiveHarness {
  const mqls = new Map<string, MqlEntry>();
  let currentWidth = window.innerWidth;

  function evaluate(query: string): boolean {
    const parsed = parseQueryThreshold(query);
    if (!parsed) return false;
    if (parsed.kind === 'min') return currentWidth >= parsed.value;
    return currentWidth <= parsed.value;
  }

  const previousMatchMedia = window.matchMedia;
  const previousInnerWidth = Object.getOwnPropertyDescriptor(
    window,
    'innerWidth',
  );

  const matchMediaMock = (query: string) => {
    let entry = mqls.get(query);
    if (!entry) {
      entry = { matches: evaluate(query), listeners: new Set() };
      mqls.set(query, entry);
    }
    return {
      get matches() {
        return entry!.matches;
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
        entry!.listeners.add(cb);
      },
      removeEventListener: (
        _: string,
        cb: (e: MediaQueryListEvent) => void,
      ) => {
        entry!.listeners.delete(cb);
      },
      addListener: (cb: (e: MediaQueryListEvent) => void) => {
        entry!.listeners.add(cb);
      },
      removeListener: (cb: (e: MediaQueryListEvent) => void) => {
        entry!.listeners.delete(cb);
      },
      dispatchEvent: () => false,
    };
  };

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMediaMock,
  });

  return {
    setWidth(width: number): void {
      currentWidth = width;
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: width,
      });
      for (const [query, entry] of mqls.entries()) {
        const next = evaluate(query);
        if (next === entry.matches) continue;
        entry.matches = next;
        for (const cb of entry.listeners) {
          cb({ matches: next, media: query } as MediaQueryListEvent);
        }
      }
      window.dispatchEvent(new Event('resize'));
    },
    restore(): void {
      if (previousMatchMedia) {
        Object.defineProperty(window, 'matchMedia', {
          configurable: true,
          writable: true,
          value: previousMatchMedia,
        });
      }
      if (previousInnerWidth) {
        Object.defineProperty(window, 'innerWidth', previousInnerWidth);
      }
      mqls.clear();
    },
  };
}

export interface OverflowFinding {
  selector: string;
  width: number;
  cssProperty: 'width' | 'min-width';
  cssValue: string;
}

// (v1.11.347, TODO 11.329) Scan the supplied container
// for inline `style="width: <N>px"` or
// `style="min-width: <N>px"` declarations that exceed
// the active viewport width. The check is intentionally
// narrow: utility-class widths (`w-64`, `max-w-md`)
// resolve through the Tailwind stylesheet which jsdom
// does not load, so they cannot be evaluated here. The
// inline-style scan still catches the common foot-gun
// of hardcoding a pixel value that busts a phone-sized
// viewport.
export function findInlineOverflow(
  root: Element,
  viewportWidth: number,
): OverflowFinding[] {
  const out: OverflowFinding[] = [];
  const all = root.querySelectorAll<HTMLElement>('[style]');
  all.forEach((el) => {
    const inline = el.style;
    const widthDecl = inline.width || '';
    const minWidthDecl = inline.minWidth || '';
    for (const [prop, decl] of [
      ['width', widthDecl] as const,
      ['min-width', minWidthDecl] as const,
    ]) {
      const m = /^(\d+(?:\.\d+)?)px$/.exec(decl.trim());
      if (!m) continue;
      const px = Number(m[1]);
      if (!Number.isFinite(px)) continue;
      if (px > viewportWidth) {
        out.push({
          selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
          width: px,
          cssProperty: prop,
          cssValue: decl,
        });
      }
    }
  });
  return out;
}

export interface ResponsiveSmokeReport {
  width: number;
  name: string;
  ok: boolean;
  inlineOverflows: OverflowFinding[];
  errorMessage?: string;
}

// (v1.11.347, TODO 11.329) Run a synchronous smoke
// audit across the supplied breakpoints. `render`
// returns the rendered container; the caller is
// responsible for cleaning up between widths
// (the harness does not own the React tree). The
// helper does NOT throw -- callers decide whether to
// assert ok-everywhere or tolerate specific reports.
export interface RunResponsiveSmokeOpts {
  render: (width: number, name: string) => Element;
  breakpoints?: readonly ResponsiveBreakpoint[];
}

export function runResponsiveSmoke(
  opts: RunResponsiveSmokeOpts,
): ResponsiveSmokeReport[] {
  const breakpoints = opts.breakpoints ?? RESPONSIVE_BREAKPOINTS;
  const harness = installResponsiveHarness();
  const reports: ResponsiveSmokeReport[] = [];
  try {
    for (const bp of breakpoints) {
      harness.setWidth(bp.width);
      let container: Element | null = null;
      let renderError: Error | null = null;
      try {
        container = opts.render(bp.width, bp.name);
      } catch (e) {
        renderError = e as Error;
      }
      if (renderError) {
        reports.push({
          width: bp.width,
          name: bp.name,
          ok: false,
          inlineOverflows: [],
          errorMessage: renderError.message,
        });
        continue;
      }
      const inlineOverflows = container
        ? findInlineOverflow(container, bp.width)
        : [];
      reports.push({
        width: bp.width,
        name: bp.name,
        ok: inlineOverflows.length === 0,
        inlineOverflows,
      });
    }
  } finally {
    harness.restore();
  }
  return reports;
}

export function formatResponsiveReports(
  reports: readonly ResponsiveSmokeReport[],
): string {
  return reports
    .map((r) => {
      const head = `${r.name} (${r.width}px): ${r.ok ? 'ok' : 'FAIL'}`;
      const errLine = r.errorMessage ? `\n  error: ${r.errorMessage}` : '';
      const overflows = r.inlineOverflows
        .map(
          (o) =>
            `\n  overflow: ${o.selector} ${o.cssProperty}=${o.cssValue} (> ${r.width}px)`,
        )
        .join('');
      return `${head}${errLine}${overflows}`;
    })
    .join('\n');
}

// (v1.11.347, TODO 11.329) Helper for tests that want
// a single throw on any width failing.
export function expectAllResponsiveOk(
  reports: readonly ResponsiveSmokeReport[],
): void {
  const failed = reports.filter((r) => !r.ok);
  if (failed.length === 0) return;
  throw new Error(
    `Responsive smoke audit failed (${failed.length}/${reports.length} widths):\n${formatResponsiveReports(reports)}`,
  );
}

// Default-export-style re-export so test files have
// one import block.
export { DEFAULT_TAILWIND_THRESHOLDS };
