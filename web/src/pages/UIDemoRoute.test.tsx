import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import UIDemoRoute from './UIDemoRoute';
import {
  STORAGE_KEY,
  setFlag,
  resetFlags,
} from '../lib/feature-flags';

describe('<UIDemoRoute>', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    resetFlags();
  });

  afterEach(() => {
    cleanup();
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  });

  it('renders the disabled state when the uiDemoRoute flag is off', () => {
    render(<UIDemoRoute />);
    expect(
      document.querySelector('[data-section="ui-demo-disabled"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section="ui-demo-root"]'),
    ).toBeNull();
    expect(screen.getByText(/UI demo route is disabled/i)).toBeInTheDocument();
  });

  it('renders the primitive gallery when the uiDemoRoute flag is on', () => {
    setFlag('uiDemoRoute', true);
    render(<UIDemoRoute />);
    const root = document.querySelector('[data-section="ui-demo-root"]');
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-demo-enabled')).toBe('true');
    expect(
      document.querySelector('[data-section="ui-demo-disabled"]'),
    ).toBeNull();
  });

  it('renders the documented primitive sections when enabled', () => {
    setFlag('uiDemoRoute', true);
    render(<UIDemoRoute />);
    const expected = [
      'Buttons',
      'Badges and Chips',
      'Status',
      'Avatars',
      'Form controls',
      'Feedback',
      'States',
      'Layout helpers',
      'Navigation and misc',
    ];
    for (const section of expected) {
      const node = document.querySelector(
        `[data-demo-section="${section}"]`,
      );
      expect(node, `missing section ${section}`).not.toBeNull();
    }
  });

  it('always renders the page title regardless of flag state', () => {
    render(<UIDemoRoute />);
    expect(screen.getByText('UI Demo')).toBeInTheDocument();
    cleanup();
    setFlag('uiDemoRoute', true);
    render(<UIDemoRoute />);
    expect(screen.getByText('UI Demo')).toBeInTheDocument();
  });

  it('every section in the gallery has data-section="ui-demo-section"', () => {
    setFlag('uiDemoRoute', true);
    render(<UIDemoRoute />);
    const sections = document.querySelectorAll(
      '[data-section="ui-demo-section"]',
    );
    expect(sections.length).toBeGreaterThanOrEqual(9);
  });
});
