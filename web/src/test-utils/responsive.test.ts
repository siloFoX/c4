// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RESPONSIVE_BREAKPOINTS,
  expectAllResponsiveOk,
  findInlineOverflow,
  formatResponsiveReports,
  installResponsiveHarness,
  runResponsiveSmoke,
} from './responsive';

afterEach(() => {
  vi.useRealTimers();
});

describe('RESPONSIVE_BREAKPOINTS', () => {
  it('lists the four canonical widths the dispatch calls for', () => {
    const names = RESPONSIVE_BREAKPOINTS.map((b) => b.name);
    expect(names).toEqual(['mobile', 'tablet', 'desktop', 'wide']);
    const widths = RESPONSIVE_BREAKPOINTS.map((b) => b.width);
    expect(widths).toEqual([375, 768, 1280, 1920]);
  });
});

describe('installResponsiveHarness', () => {
  it('installs a matchMedia mock that evaluates min-width queries against the current width', () => {
    const harness = installResponsiveHarness();
    try {
      harness.setWidth(500);
      expect(window.matchMedia('(min-width: 768px)').matches).toBe(false);
      harness.setWidth(1024);
      expect(window.matchMedia('(min-width: 768px)').matches).toBe(true);
    } finally {
      harness.restore();
    }
  });

  it('evaluates max-width queries against the current width', () => {
    const harness = installResponsiveHarness();
    try {
      harness.setWidth(500);
      expect(window.matchMedia('(max-width: 767px)').matches).toBe(true);
      harness.setWidth(1024);
      expect(window.matchMedia('(max-width: 767px)').matches).toBe(false);
    } finally {
      harness.restore();
    }
  });

  it('returns the same MQL on repeated matchMedia(query) calls so listeners stay attached', () => {
    const harness = installResponsiveHarness();
    try {
      // Anchor below the 768 threshold first so the
      // subsequent setWidth(1024) is a real flip.
      harness.setWidth(500);
      const a = window.matchMedia('(min-width: 768px)');
      const b = window.matchMedia('(min-width: 768px)');
      const listener = vi.fn();
      a.addEventListener('change', listener);
      harness.setWidth(1024);
      expect(listener).toHaveBeenCalledTimes(1);
      // The second handle observes the same flips.
      expect(b.matches).toBe(true);
    } finally {
      harness.restore();
    }
  });

  it('fires a window resize event when setWidth is called', () => {
    const harness = installResponsiveHarness();
    const cb = vi.fn();
    window.addEventListener('resize', cb);
    try {
      harness.setWidth(1024);
      expect(cb).toHaveBeenCalledTimes(1);
      harness.setWidth(375);
      expect(cb).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener('resize', cb);
      harness.restore();
    }
  });

  it('updates window.innerWidth so size-aware effects can re-read it', () => {
    const harness = installResponsiveHarness();
    try {
      harness.setWidth(1280);
      expect(window.innerWidth).toBe(1280);
      harness.setWidth(375);
      expect(window.innerWidth).toBe(375);
    } finally {
      harness.restore();
    }
  });

  it('restores the previous matchMedia + innerWidth on restore()', () => {
    const before = window.matchMedia;
    const beforeWidth = window.innerWidth;
    const harness = installResponsiveHarness();
    harness.setWidth(2000);
    harness.restore();
    expect(window.matchMedia).toBe(before);
    expect(window.innerWidth).toBe(beforeWidth);
  });
});

describe('findInlineOverflow', () => {
  it('returns an empty array when no inline width style exceeds the viewport', () => {
    const root = document.createElement('div');
    root.innerHTML = '<span style="width: 320px"></span>';
    expect(findInlineOverflow(root, 375)).toHaveLength(0);
  });

  it('flags an inline width that exceeds the viewport', () => {
    const root = document.createElement('div');
    root.innerHTML = '<span style="width: 400px"></span>';
    const out = findInlineOverflow(root, 375);
    expect(out).toHaveLength(1);
    expect(out[0]?.cssProperty).toBe('width');
    expect(out[0]?.width).toBe(400);
  });

  it('flags inline min-width when it exceeds the viewport', () => {
    const root = document.createElement('div');
    root.innerHTML = '<span style="min-width: 500px"></span>';
    const out = findInlineOverflow(root, 375);
    expect(out).toHaveLength(1);
    expect(out[0]?.cssProperty).toBe('min-width');
  });

  it('ignores non-pixel width values (auto, %, em, calc)', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <span style="width: auto"></span>
      <span style="width: 100%"></span>
      <span style="width: 20em"></span>
      <span style="width: calc(100% - 16px)"></span>
    `;
    expect(findInlineOverflow(root, 375)).toHaveLength(0);
  });

  it('does NOT flag an inline width that equals the viewport (boundary case)', () => {
    const root = document.createElement('div');
    root.innerHTML = '<span style="width: 375px"></span>';
    expect(findInlineOverflow(root, 375)).toHaveLength(0);
  });
});

describe('runResponsiveSmoke', () => {
  it('returns one report per breakpoint, in order', () => {
    const reports = runResponsiveSmoke({
      render: () => {
        const root = document.createElement('div');
        return root;
      },
    });
    expect(reports.map((r) => r.name)).toEqual([
      'mobile',
      'tablet',
      'desktop',
      'wide',
    ]);
    for (const r of reports) {
      expect(r.ok).toBe(true);
      expect(r.inlineOverflows).toHaveLength(0);
    }
  });

  it('captures inline overflow findings per width', () => {
    const reports = runResponsiveSmoke({
      render: () => {
        const root = document.createElement('div');
        root.innerHTML = '<span style="width: 600px"></span>';
        return root;
      },
    });
    // mobile (375), tablet (768), desktop (1280), wide (1920)
    // -- only mobile fails (600 > 375).
    const mobile = reports.find((r) => r.name === 'mobile');
    expect(mobile?.ok).toBe(false);
    expect(mobile?.inlineOverflows.length).toBe(1);
    const tablet = reports.find((r) => r.name === 'tablet');
    expect(tablet?.ok).toBe(true);
  });

  it('captures a render error rather than throwing', () => {
    const reports = runResponsiveSmoke({
      render: (width) => {
        if (width === 375) throw new Error('boom');
        const root = document.createElement('div');
        return root;
      },
    });
    const mobile = reports.find((r) => r.name === 'mobile');
    expect(mobile?.ok).toBe(false);
    expect(mobile?.errorMessage).toContain('boom');
    const others = reports.filter((r) => r.name !== 'mobile');
    expect(others.every((r) => r.ok)).toBe(true);
  });

  it('honours a caller-supplied breakpoints override', () => {
    const reports = runResponsiveSmoke({
      breakpoints: [{ name: 'phone', width: 320 }],
      render: () => document.createElement('div'),
    });
    expect(reports).toHaveLength(1);
    expect(reports[0]?.name).toBe('phone');
  });

  it('restores matchMedia after the run completes', () => {
    const before = window.matchMedia;
    runResponsiveSmoke({
      render: () => document.createElement('div'),
    });
    expect(window.matchMedia).toBe(before);
  });
});

describe('formatResponsiveReports', () => {
  it('formats each report on a single header line + overflow rows', () => {
    const out = formatResponsiveReports([
      {
        name: 'mobile',
        width: 375,
        ok: false,
        inlineOverflows: [
          {
            selector: 'span',
            width: 600,
            cssProperty: 'width',
            cssValue: '600px',
          },
        ],
      },
      {
        name: 'tablet',
        width: 768,
        ok: true,
        inlineOverflows: [],
      },
    ]);
    expect(out).toContain('mobile (375px): FAIL');
    expect(out).toContain('tablet (768px): ok');
    expect(out).toContain('span width=600px');
  });

  it('renders the errorMessage when set', () => {
    const out = formatResponsiveReports([
      {
        name: 'mobile',
        width: 375,
        ok: false,
        inlineOverflows: [],
        errorMessage: 'render exploded',
      },
    ]);
    expect(out).toContain('error: render exploded');
  });
});

describe('expectAllResponsiveOk', () => {
  it('is a no-op when every report is ok', () => {
    expect(() =>
      expectAllResponsiveOk([
        { name: 'mobile', width: 375, ok: true, inlineOverflows: [] },
      ]),
    ).not.toThrow();
  });

  it('throws with a multi-width summary when any report fails', () => {
    expect(() =>
      expectAllResponsiveOk([
        { name: 'mobile', width: 375, ok: false, inlineOverflows: [] },
        { name: 'tablet', width: 768, ok: true, inlineOverflows: [] },
      ]),
    ).toThrow(/1\/2 widths/);
  });
});
