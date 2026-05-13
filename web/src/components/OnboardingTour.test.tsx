import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import {
  OnboardingTour,
  TOUR_STORAGE_KEY,
  TOUR_SKIP_KEY,
  TOUR_EVENT_START,
  startOnboardingTour,
} from './OnboardingTour';

// OnboardingTour is the 4-step popover tour rendered by HelpUIRoot.
// Tests exercise: cold-start auto-open, skip persistence under the
// dedicated 'c4.tour.skipped' key, done persistence under the legacy
// TOUR_STORAGE_KEY 'seen' marker, the step counter, the next/back/
// done/skip button matrix, Escape-key dismissal, the forceOpen sync
// effect, TOUR_EVENT_START replay, locale flips, the motion-safe
// transition/backdrop-blur classes on the overlay + popover, the
// box-shadow ring on the spotlight when a target resolves, and the
// data-tour-active attribute applied to the target for the duration
// of the active step.

beforeEach(() => {
  setLocale('en');
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.body.innerHTML = '';
});

function renderTour(props: Parameters<typeof OnboardingTour>[0] = {}) {
  const utils = render(<OnboardingTour {...props} />);
  const user = userEvent.setup();
  return { ...utils, user };
}

describe('<OnboardingTour>', () => {
  // ---- exported constants ----------------------------------------

  it('exports TOUR_STORAGE_KEY for legacy "seen" persistence', () => {
    expect(TOUR_STORAGE_KEY).toBe('c4.onboardingTour.v1');
  });

  it('exports the dedicated skip-persistence key', () => {
    expect(TOUR_SKIP_KEY).toBe('c4.tour.skipped');
  });

  it('exports the TOUR_EVENT_START event name', () => {
    expect(TOUR_EVENT_START).toBe('c4:tour-start');
  });

  // ---- auto-open gates -------------------------------------------

  it('auto-opens on a cold start (no storage flags)', () => {
    renderTour();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does NOT auto-open when "c4.tour.skipped" is set to "true"', () => {
    window.localStorage.setItem(TOUR_SKIP_KEY, 'true');
    renderTour();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does NOT auto-open when the legacy "seen" flag is set', () => {
    window.localStorage.setItem(TOUR_STORAGE_KEY, 'seen');
    renderTour();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('respects forceOpen=true even when both flags are set', () => {
    window.localStorage.setItem(TOUR_STORAGE_KEY, 'seen');
    window.localStorage.setItem(TOUR_SKIP_KEY, 'true');
    renderTour({ forceOpen: true });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('respects forceOpen=false even on a cold start', () => {
    renderTour({ forceOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('survives a localStorage.getItem throw and treats the tour as unseen', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('private mode');
      });
    try {
      renderTour();
      // Both gates fail closed -> shouldAutoOpen returns false.
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });

  // ---- dialog scaffolding ----------------------------------------

  it('renders a single dialog element', () => {
    renderTour();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('marks the dialog with aria-modal=true', () => {
    renderTour();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('uses the welcome-step i18n title as the dialog aria-label', () => {
    renderTour();
    expect(
      screen.getByRole('dialog', { name: 'Welcome to C4' }),
    ).toBeInTheDocument();
  });

  it('tags the overlay with the data-tour-overlay marker', () => {
    renderTour();
    expect(screen.getByRole('dialog')).toHaveAttribute('data-tour-overlay');
  });

  it('tags the overlay with data-tour-step="1" on initial render', () => {
    renderTour();
    expect(screen.getByRole('dialog')).toHaveAttribute('data-tour-step', '1');
  });

  it('renders the dialog as fixed inset-0 so it overlays the page', () => {
    renderTour();
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toMatch(/fixed/);
    expect(dialog.className).toMatch(/inset-0/);
  });

  // ---- backdrop-blur + motion classes ----------------------------

  it('applies motion-safe:backdrop-blur-sm on the overlay', () => {
    renderTour();
    expect(screen.getByRole('dialog').className).toMatch(
      /motion-safe:backdrop-blur-sm/,
    );
  });

  it('applies motion-safe:duration-200 on the overlay', () => {
    renderTour();
    expect(screen.getByRole('dialog').className).toMatch(
      /motion-safe:duration-200/,
    );
  });

  it('applies motion-safe ease-out timing on the overlay', () => {
    renderTour();
    expect(screen.getByRole('dialog').className).toMatch(
      /motion-safe:ease-out/,
    );
  });

  it('dims the background with bg-background/40 under the blur', () => {
    renderTour();
    expect(screen.getByRole('dialog').className).toMatch(/bg-background\/40/);
  });

  it('applies motion-safe transition + 200ms duration on the popover', () => {
    renderTour();
    const popover = document.querySelector('[data-tour-popover]');
    expect(popover).not.toBeNull();
    expect(popover!.className).toMatch(/motion-safe:transition-all/);
    expect(popover!.className).toMatch(/motion-safe:duration-200/);
    expect(popover!.className).toMatch(/motion-safe:ease-out/);
  });

  // ---- step 1 copy -----------------------------------------------

  it('renders the welcome step title on initial render', () => {
    renderTour();
    expect(screen.getByText('Welcome to C4')).toBeInTheDocument();
  });

  it('renders the welcome step body on initial render', () => {
    renderTour();
    expect(
      screen.getByText(/Every CLI feature has a matching page/),
    ).toBeInTheDocument();
  });

  it('renders the 1 / 4 step counter on initial render', () => {
    renderTour();
    expect(screen.getByText('1 / 4')).toBeInTheDocument();
  });

  // ---- button matrix --------------------------------------------

  it('renders the X dismiss icon-button with the i18n aria-label', () => {
    renderTour();
    expect(
      screen.getByRole('button', { name: 'Dismiss' }),
    ).toBeInTheDocument();
  });

  it('renders the Skip button on every step', () => {
    renderTour();
    expect(
      screen.getByRole('button', { name: 'Skip tour' }),
    ).toBeInTheDocument();
  });

  it('renders the Next button on the first step (no Done yet)', () => {
    renderTour();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Done' }),
    ).not.toBeInTheDocument();
  });

  it('does NOT render the Back button on the first step', () => {
    renderTour();
    expect(
      screen.queryByRole('button', { name: 'Back' }),
    ).not.toBeInTheDocument();
  });

  // ---- navigation -----------------------------------------------

  it('advances to step 2 when Next is clicked', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Feature categories')).toBeInTheDocument();
    expect(screen.getByText('2 / 4')).toBeInTheDocument();
  });

  it('reveals the Back button on step 2', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('rewinds to step 1 when Back is clicked on step 2', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('1 / 4')).toBeInTheDocument();
    expect(screen.getByText('Welcome to C4')).toBeInTheDocument();
  });

  it('updates the overlay data-tour-step attribute when the step advances', async () => {
    const { user } = renderTour();
    expect(screen.getByRole('dialog')).toHaveAttribute('data-tour-step', '1');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog')).toHaveAttribute('data-tour-step', '2');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog')).toHaveAttribute('data-tour-step', '3');
  });

  it('renders the Done button (not Next) on the final step', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Next' }),
    ).not.toBeInTheDocument();
  });

  it('renders the 4 / 4 step counter on the final step', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('4 / 4')).toBeInTheDocument();
  });

  // ---- skip persistence under the new key ------------------------

  it('writes "true" to c4.tour.skipped when Skip is clicked', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(window.localStorage.getItem(TOUR_SKIP_KEY)).toBe('true');
  });

  it('does NOT write the legacy "seen" flag when Skip is clicked', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBeNull();
  });

  it('closes the dialog after Skip is clicked', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('writes "true" to c4.tour.skipped when the X dismiss icon is clicked', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(window.localStorage.getItem(TOUR_SKIP_KEY)).toBe('true');
  });

  // ---- done persistence under the legacy key ---------------------

  it('writes "seen" to the legacy TOUR_STORAGE_KEY when Done is clicked', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBe('seen');
  });

  it('does NOT write the skip key when Done is clicked', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(window.localStorage.getItem(TOUR_SKIP_KEY)).toBeNull();
  });

  it('closes the dialog after Done is clicked', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // ---- onClose callback ------------------------------------------

  it('fires onClose when Skip is clicked', async () => {
    const onClose = vi.fn();
    const { user } = renderTour({ onClose });
    await user.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires onClose when Done is clicked', async () => {
    const onClose = vi.fn();
    const { user } = renderTour({ onClose });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onClose when Next is clicked', async () => {
    const onClose = vi.fn();
    const { user } = renderTour({ onClose });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('tolerates an undefined onClose without throwing', async () => {
    const { user } = renderTour();
    await expect(
      user.click(screen.getByRole('button', { name: 'Skip tour' })),
    ).resolves.not.toThrow();
  });

  // ---- Escape dismissal -----------------------------------------

  it('Escape key dismisses the tour (treated as a skip)', () => {
    renderTour();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(TOUR_SKIP_KEY)).toBe('true');
  });

  it('Enter and ArrowRight do NOT dismiss the tour', () => {
    renderTour();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight' }),
      );
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Escape is ignored once the tour has been dismissed (listener unbinds)', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Skip tour' }));
    // Reset the skip flag so we can observe whether Escape rewrites it.
    window.localStorage.removeItem(TOUR_SKIP_KEY);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(window.localStorage.getItem(TOUR_SKIP_KEY)).toBeNull();
  });

  // ---- forceOpen sync -------------------------------------------

  it('forceOpen=true overrides a "seen" flag and opens at step 1', () => {
    window.localStorage.setItem(TOUR_STORAGE_KEY, 'seen');
    renderTour({ forceOpen: true });
    expect(screen.getByText('1 / 4')).toBeInTheDocument();
  });

  it('forceOpen flipping false -> true rewinds the step index to 1', async () => {
    const { rerender } = render(<OnboardingTour forceOpen={true} />);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Next' }));
    await u.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('3 / 4')).toBeInTheDocument();
    rerender(<OnboardingTour forceOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    rerender(<OnboardingTour forceOpen={true} />);
    expect(screen.getByText('1 / 4')).toBeInTheDocument();
  });

  // ---- TOUR_EVENT_START -----------------------------------------

  it('TOUR_EVENT_START re-opens a previously skipped tour from step 1', () => {
    window.localStorage.setItem(TOUR_SKIP_KEY, 'true');
    renderTour();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event(TOUR_EVENT_START));
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('1 / 4')).toBeInTheDocument();
  });

  it('TOUR_EVENT_START rewinds the index when the tour is already open', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('3 / 4')).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event(TOUR_EVENT_START));
    });
    expect(screen.getByText('1 / 4')).toBeInTheDocument();
  });

  // ---- startOnboardingTour helper -------------------------------

  it('startOnboardingTour clears both storage flags and dispatches the start event', () => {
    window.localStorage.setItem(TOUR_STORAGE_KEY, 'seen');
    window.localStorage.setItem(TOUR_SKIP_KEY, 'true');
    const listener = vi.fn();
    window.addEventListener(TOUR_EVENT_START, listener);
    try {
      startOnboardingTour();
      expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBeNull();
      expect(window.localStorage.getItem(TOUR_SKIP_KEY)).toBeNull();
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(TOUR_EVENT_START, listener);
    }
  });

  // ---- target spotlight + data-tour-active ---------------------

  it('renders no spotlight when no element matches the step target selector', () => {
    renderTour();
    expect(
      document.querySelector('[data-tour-spotlight]'),
    ).toBeNull();
  });

  it('renders a spotlight when the step-1 target exists in the DOM', () => {
    const target = document.createElement('div');
    target.setAttribute('data-tour-step', 'tabs');
    document.body.appendChild(target);
    renderTour();
    const spotlight = document.querySelector('[data-tour-spotlight]');
    expect(spotlight).not.toBeNull();
    expect(spotlight!.getAttribute('data-tour-step')).toBe('1');
  });

  it('applies the box-shadow ring class on the spotlight', () => {
    const target = document.createElement('div');
    target.setAttribute('data-tour-step', 'tabs');
    document.body.appendChild(target);
    renderTour();
    const spotlight = document.querySelector('[data-tour-spotlight]');
    expect(spotlight!.className).toMatch(/ring-2/);
    expect(spotlight!.className).toMatch(/ring-primary/);
    expect(spotlight!.className).toMatch(/ring-offset-2/);
  });

  it('applies the motion-safe 200ms ease-out transition on the spotlight', () => {
    const target = document.createElement('div');
    target.setAttribute('data-tour-step', 'tabs');
    document.body.appendChild(target);
    renderTour();
    const spotlight = document.querySelector('[data-tour-spotlight]');
    expect(spotlight!.className).toMatch(/motion-safe:transition-all/);
    expect(spotlight!.className).toMatch(/motion-safe:duration-200/);
    expect(spotlight!.className).toMatch(/motion-safe:ease-out/);
  });

  it('tags the active step target with data-tour-active="true"', () => {
    const target = document.createElement('div');
    target.setAttribute('data-tour-step', 'tabs');
    document.body.appendChild(target);
    renderTour();
    expect(target.getAttribute('data-tour-active')).toBe('true');
  });

  it('moves data-tour-active to the next target when the step advances', async () => {
    const tabs = document.createElement('div');
    tabs.setAttribute('data-tour-step', 'tabs');
    const sidebar = document.createElement('div');
    sidebar.setAttribute('data-tour-step', 'sidebar');
    document.body.appendChild(tabs);
    document.body.appendChild(sidebar);
    const { user } = renderTour();
    expect(tabs.getAttribute('data-tour-active')).toBe('true');
    expect(sidebar.getAttribute('data-tour-active')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(tabs.getAttribute('data-tour-active')).toBeNull();
    expect(sidebar.getAttribute('data-tour-active')).toBe('true');
  });

  it('clears data-tour-active when the tour is dismissed', async () => {
    const target = document.createElement('div');
    target.setAttribute('data-tour-step', 'tabs');
    document.body.appendChild(target);
    const { user } = renderTour();
    expect(target.getAttribute('data-tour-active')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(target.getAttribute('data-tour-active')).toBeNull();
  });

  // ---- popover markers -----------------------------------------

  it('tags the popover with data-tour-popover + matching data-tour-step', () => {
    renderTour();
    const popover = document.querySelector('[data-tour-popover]');
    expect(popover).not.toBeNull();
    expect(popover!.getAttribute('data-tour-step')).toBe('1');
  });

  it('updates the popover data-tour-step when navigating forward', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const popover = document.querySelector('[data-tour-popover]');
    expect(popover!.getAttribute('data-tour-step')).toBe('2');
  });

  // ---- locale flip ---------------------------------------------

  it('re-renders the welcome title in Korean when the locale flips', () => {
    renderTour();
    expect(screen.getByText('Welcome to C4')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Welcome to C4')).not.toBeInTheDocument();
  });

  it('re-renders the Skip button label in Korean when the locale flips', () => {
    renderTour();
    expect(
      screen.getByRole('button', { name: 'Skip tour' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: 'Skip tour' }),
    ).not.toBeInTheDocument();
  });

  // ---- rerender stability --------------------------------------

  it('does not duplicate the dialog on a same-props rerender', () => {
    const { rerender } = render(<OnboardingTour />);
    rerender(<OnboardingTour />);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});
