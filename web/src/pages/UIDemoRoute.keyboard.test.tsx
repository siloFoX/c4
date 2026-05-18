// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import UIDemoRoute from './UIDemoRoute';
import {
  STORAGE_KEY,
  resetFlags,
  setFlag,
} from '../lib/feature-flags';
import {
  auditKeyboardNav,
  expectKeyboardAuditOk,
  listTabbable,
} from '../test-utils/keyboard';

// (v1.11.349, TODO 11.331) Keyboard-nav smoke pass over
// the storybook gallery. The demo route renders every
// primitive variant in one place; running the keyboard
// audit against it catches the broadest surface of
// "div-as-button" foot-guns without spinning up
// Playwright.

describe('<UIDemoRoute> keyboard audit', () => {
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

  it('every interactive primitive in the gallery is keyboard-reachable', () => {
    const { container } = render(<UIDemoRoute />);
    const report = auditKeyboardNav(container);
    expectKeyboardAuditOk(report);
  });

  it('the gallery exposes a non-empty tabbable inventory', () => {
    const { container } = render(<UIDemoRoute />);
    const tabbable = listTabbable(container);
    // Buttons + inputs + switches + nav items add up
    // to dozens of tabbable nodes in the gallery; assert
    // the floor so a future regression that wipes
    // tabindex from every primitive surfaces clearly.
    expect(tabbable.length).toBeGreaterThan(10);
  });
});
