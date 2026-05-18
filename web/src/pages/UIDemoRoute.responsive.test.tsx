// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import UIDemoRoute from './UIDemoRoute';
import {
  STORAGE_KEY,
  resetFlags,
  setFlag,
} from '../lib/feature-flags';
import {
  RESPONSIVE_BREAKPOINTS,
  expectAllResponsiveOk,
  runResponsiveSmoke,
} from '../test-utils/responsive';

// (v1.11.347, TODO 11.329) Responsive smoke pass over
// the storybook gallery. The demo route renders every
// primitive variant in one place, so a single sweep at
// the four canonical widths exercises the broadest
// responsive surface in the project without spinning
// up Playwright. jsdom does NOT layout content -- the
// helper relies on the matchMedia flip + an inline-
// `width: <Npx>` audit instead of real geometry.

describe('<UIDemoRoute> responsive smoke', () => {
  beforeEach(() => {
    setFlag('uiDemoRoute', true);
  });

  afterEach(() => {
    cleanup();
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    resetFlags();
  });

  it('mounts at each of mobile / tablet / desktop / wide widths with no inline overflow', () => {
    const reports = runResponsiveSmoke({
      render: () => {
        const { container, unmount } = render(<UIDemoRoute />);
        // Snapshot the container, then unmount so the
        // next width starts from a clean DOM. The
        // helper's `findInlineOverflow` reads the
        // returned element directly (no live tree).
        const snapshot = container.cloneNode(true) as Element;
        unmount();
        return snapshot;
      },
    });
    expect(reports.map((r) => r.name)).toEqual(
      RESPONSIVE_BREAKPOINTS.map((b) => b.name),
    );
    expectAllResponsiveOk(reports);
  });
});
