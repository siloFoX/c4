// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import UIDemoRoute from './UIDemoRoute';
import {
  STORAGE_KEY,
  resetFlags,
  setFlag,
} from '../lib/feature-flags';
import { applyTheme } from '../lib/preferences';
import {
  pageA11yCheck,
  expectNoA11yViolations,
} from '../test-utils/axe';

// (v1.11.345, TODO 11.327) axe-core sweep of the storybook
// gallery. The demo route exists so every primitive
// variant is exercised in one place -- running axe against
// it gives the project its broadest accessibility check
// without spinning up Playwright. Color-contrast is skipped
// by the helper's jsdom default skip list (see
// src/test-utils/axe.ts for the rationale); other dispatch
// targets (missing aria-label, focus traps, heading
// order) are exercised under both themes.

describe('<UIDemoRoute> a11y', () => {
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

  it('passes axe-core (dark theme) with the default jsdom rule set', async () => {
    applyTheme('dark');
    const { container } = render(<UIDemoRoute />);
    const result = await pageA11yCheck(container);
    expectNoA11yViolations(result);
  });

  it('passes axe-core (light theme) with the default jsdom rule set', async () => {
    applyTheme('light');
    const { container } = render(<UIDemoRoute />);
    const result = await pageA11yCheck(container);
    expectNoA11yViolations(result);
  });
});
