import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import {
  FLAGS,
  STORAGE_KEY,
  resetFlags,
} from '../lib/feature-flags';
import FeatureFlags from './FeatureFlags';

// FeatureFlags is a pure browser page -- no daemon round-trip,
// no apiGet / apiPost stubbing. The Switch row reads + writes
// `localStorage` under `c4:feature-flags` directly. Each test
// clears the key in `beforeEach` so flag state never leaks.

beforeEach(() => {
  setLocale('en');
  window.localStorage.removeItem(STORAGE_KEY);
});

afterEach(() => {
  resetFlags();
  vi.useRealTimers();
});

describe('<FeatureFlags>', () => {
  it('renders one row per declared flag (default tab "all")', () => {
    render(<FeatureFlags />);
    for (const flag of FLAGS) {
      expect(
        screen.getByTestId(`feature-flag-row-${flag.key}`),
      ).toBeInTheDocument();
    }
    expect(screen.getByTestId('feature-flags-tab-count-all').textContent).toBe(
      String(FLAGS.length),
    );
  });

  it('renders the experimental AlertBanner at the top', () => {
    render(<FeatureFlags />);
    expect(
      screen.getByTestId('feature-flags-experimental-banner'),
    ).toBeInTheDocument();
  });

  // (v1.11.339, TODO 11.321) Category Tabs narrow the visible
  // rows to flags whose `category` matches the active tab.
  it('filters rows by category when a category tab is clicked', async () => {
    const user = userEvent.setup();
    render(<FeatureFlags />);
    const tabs = screen.getByTestId('feature-flags-category-tabs');
    await user.click(within(tabs).getByRole('tab', { name: /motion/i }));

    // Motion-category flags survive (motion, pageTransitions, reducedMotion).
    for (const flag of FLAGS.filter((f) => f.category === 'motion')) {
      expect(
        screen.getByTestId(`feature-flag-row-${flag.key}`),
      ).toBeInTheDocument();
    }
    // Non-motion flags are hidden.
    for (const flag of FLAGS.filter((f) => f.category !== 'motion')) {
      expect(
        screen.queryByTestId(`feature-flag-row-${flag.key}`),
      ).not.toBeInTheDocument();
    }
  });

  // (v1.11.339, TODO 11.321) Count chips reflect the per-category
  // totals derived from FLAGS.
  it('renders per-category count chips on the Tabs strip', () => {
    render(<FeatureFlags />);
    const counts = {
      motion: FLAGS.filter((f) => f.category === 'motion').length,
      navigation: FLAGS.filter((f) => f.category === 'navigation').length,
      developer: FLAGS.filter((f) => f.category === 'developer').length,
    };
    expect(screen.getByTestId('feature-flags-tab-count-all').textContent).toBe(
      String(FLAGS.length),
    );
    expect(
      screen.getByTestId('feature-flags-tab-count-motion').textContent,
    ).toBe(String(counts.motion));
    expect(
      screen.getByTestId('feature-flags-tab-count-navigation').textContent,
    ).toBe(String(counts.navigation));
    expect(
      screen.getByTestId('feature-flags-tab-count-developer').textContent,
    ).toBe(String(counts.developer));
  });

  // (v1.11.339, TODO 11.321) Debounced SearchBar filters by
  // key / label / description substring. Use fake timers to
  // step past the 200ms debounce window without sleeping.
  it('filters rows by debounced search across key / label / description', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      advanceTimers: (ms: number) => vi.advanceTimersByTime(ms),
    });
    render(<FeatureFlags />);

    const searchInput = screen.getByTestId(
      'feature-flags-search',
    ) as HTMLInputElement;
    await user.type(searchInput, 'transition');

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId('feature-flag-row-gridDebug'),
      ).not.toBeInTheDocument();
    });

    // "transition" appears in the pageTransitions label and
    // description, so that row survives.
    expect(
      screen.getByTestId('feature-flag-row-pageTransitions'),
    ).toBeInTheDocument();
  });

  // (v1.11.339, TODO 11.321) Combined tab + search filter.
  it('composes the category tab and the search filter', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      advanceTimers: (ms: number) => vi.advanceTimersByTime(ms),
    });
    render(<FeatureFlags />);

    const tabs = screen.getByTestId('feature-flags-category-tabs');
    await user.click(within(tabs).getByRole('tab', { name: /motion/i }));

    const searchInput = screen.getByTestId(
      'feature-flags-search',
    ) as HTMLInputElement;
    await user.type(searchInput, 'reduced');

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId('feature-flag-row-pageTransitions'),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByTestId('feature-flag-row-reducedMotion'),
    ).toBeInTheDocument();
  });

  // (v1.11.339, TODO 11.321) Placeholder when the filter
  // eliminates every row.
  it('shows the "no flags match" placeholder when the filter leaves nothing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      advanceTimers: (ms: number) => vi.advanceTimersByTime(ms),
    });
    render(<FeatureFlags />);
    const searchInput = screen.getByTestId(
      'feature-flags-search',
    ) as HTMLInputElement;
    await user.type(searchInput, 'zzz-not-a-real-flag');

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    await waitFor(() => {
      expect(
        screen.getByTestId('feature-flags-empty-filter'),
      ).toBeInTheDocument();
    });
  });

  // (v1.11.339, TODO 11.321) Each Switch is wrapped in a
  // FormField with the description as helperText.
  it('each row uses FormField (data-section="form-field") with the description as helper text', () => {
    render(<FeatureFlags />);
    const motionRow = screen.getByTestId('feature-flag-row-motion');
    const formField = motionRow.querySelector('[data-section="form-field"]');
    expect(formField).not.toBeNull();
    expect(formField?.getAttribute('data-layout')).toBe('horizontal');
    const helper = motionRow.querySelector('[data-section="form-field-helper"]');
    expect(helper?.textContent).toContain('Master toggle for all UI animations');
  });

  // (v1.11.339, TODO 11.321) Each Switch carries the
  // motion-aware data-reduced-motion attribute that the
  // primitive sets based on useReducedMotion(). In jsdom
  // matchMedia returns false by default so the attribute
  // is "false" -- still asserts the primitive landed.
  it('each Switch surfaces the motion-aware data-reduced-motion attribute', () => {
    render(<FeatureFlags />);
    const motionRow = screen.getByTestId('feature-flag-row-motion');
    const switchEl = motionRow.querySelector(
      '[data-section="switch"]',
    ) as HTMLElement | null;
    expect(switchEl).not.toBeNull();
    expect(switchEl?.hasAttribute('data-reduced-motion')).toBe(true);
  });

  // (v1.11.339, TODO 11.321) Clicking the Switch flips the
  // localStorage value AND surfaces the override badge.
  it('toggles a flag and shows the override badge when the value differs from the default', async () => {
    const user = userEvent.setup();
    render(<FeatureFlags />);
    const motionRow = screen.getByTestId('feature-flag-row-motion');
    const switchBtn = within(motionRow).getByRole('switch', {
      name: /Toggle Motion \/ Animations/i,
    });
    expect(switchBtn.getAttribute('aria-checked')).toBe('true');
    expect(
      screen.queryByTestId('feature-flag-override-motion'),
    ).not.toBeInTheDocument();

    await user.click(switchBtn);

    expect(switchBtn.getAttribute('aria-checked')).toBe('false');
    expect(
      screen.getByTestId('feature-flag-override-motion'),
    ).toBeInTheDocument();
    const stored = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) || '{}',
    ) as Record<string, boolean>;
    expect(stored['motion']).toBe(false);
  });

  // (v1.11.339, TODO 11.321) The Reset button clears all
  // overrides and brings every flag back to its default.
  it('Reset clears overrides and restores defaults', async () => {
    const user = userEvent.setup();
    render(<FeatureFlags />);
    const motionRow = screen.getByTestId('feature-flag-row-motion');
    const switchBtn = within(motionRow).getByRole('switch', {
      name: /Toggle Motion \/ Animations/i,
    });
    await user.click(switchBtn);
    expect(switchBtn.getAttribute('aria-checked')).toBe('false');

    const resetBtn = screen.getByRole('button', { name: /Reset/i });
    await user.click(resetBtn);
    expect(switchBtn.getAttribute('aria-checked')).toBe('true');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeFalsy();
  });

  // (v1.11.339, TODO 11.321) The Tooltip wrapper for the
  // Switch carries data-section="tooltip" so e2e can detect
  // it. The label content is the description + default; full
  // visibility behaviour (hover / focus) is exercised in the
  // Tooltip primitive's own tests.
  it('wraps the Switch in a Tooltip with the description + default value', () => {
    render(<FeatureFlags />);
    const motionRow = screen.getByTestId('feature-flag-row-motion');
    const tooltip = motionRow.querySelector('[data-section="tooltip"]');
    expect(tooltip).not.toBeNull();
    // The tooltip body is rendered (opacity-0 until visible);
    // assert the description shows up in the rendered DOM so a
    // hover-triggered tooltip would have the right content.
    const tooltipBody = tooltip?.querySelector('[role="tooltip"]');
    expect(tooltipBody?.textContent || '').toContain(
      'Master toggle for all UI animations',
    );
    expect(tooltipBody?.textContent || '').toContain('Default true');
  });

  // (v1.11.339, TODO 11.321) The TagInput chip filter is
  // preserved and composes with the new tab + search filters.
  it('the legacy TagInput chip filter still narrows the list', async () => {
    const user = userEvent.setup();
    render(<FeatureFlags />);
    const chipBlock = screen.getByTestId('feature-flags-filter-chips');
    const chipInput = within(chipBlock).getByRole('textbox');
    await user.type(chipInput, 'route');
    await user.keyboard('{Enter}');

    expect(
      screen.getByTestId('feature-flag-row-routeProgress'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('feature-flag-row-gridDebug'),
    ).not.toBeInTheDocument();
  });
});
