// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import FeatureFlags from './FeatureFlags';
import { STORAGE_KEY } from '../lib/feature-flags';
import {
  RESPONSIVE_BREAKPOINTS,
  expectAllResponsiveOk,
  runResponsiveSmoke,
} from '../test-utils/responsive';

// (v1.11.347, TODO 11.329) Responsive smoke pass for
// the FeatureFlags admin page. The page is a real
// data-driven surface (filter tabs, search bar,
// per-flag rows) rendered without any daemon round-
// trip, so it makes a good second demonstration of the
// responsive helper alongside the UIDemoRoute gallery.

describe('<FeatureFlags> responsive smoke', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  });

  afterEach(() => {
    cleanup();
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  });

  it('mounts at each canonical width with no inline overflow', () => {
    const reports = runResponsiveSmoke({
      render: () => {
        const { container, unmount } = render(<FeatureFlags />);
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
