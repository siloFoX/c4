import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';

// SessionsTour is a self-contained three-step onboarding modal.
// It owns one piece of internal state (the current step index)
// and consumes TOUR_STEPS + onDismiss from props. No network or
// localStorage access (the parent manages persistence). Tests
// drive the step machine via user-event clicks on Next / Skip /
// Done / X, assert the per-step title/body/step-counter copy,
// the role="dialog" + aria-modal + aria-label scaffolding, and
// the onDismiss callback firing on every dismissal path.

import SessionsTour from './SessionsTour';

beforeEach(() => {
  setLocale('en');
});

function renderTour(
  overrides: Partial<Parameters<typeof SessionsTour>[0]> = {},
) {
  const onDismiss = vi.fn();
  const props = {
    onDismiss,
    ...overrides,
  };
  const utils = render(<SessionsTour {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onDismiss, props };
}

describe('<SessionsTour>', () => {
  // ---- dialog scaffolding ----------------------------------------

  it('renders a single dialog element', () => {
    renderTour();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('marks the dialog with aria-modal=true', () => {
    renderTour();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('uses the i18n onboarding aria-label on the dialog', () => {
    renderTour();
    expect(
      screen.getByRole('dialog', { name: 'Sessions onboarding' }),
    ).toBeInTheDocument();
  });

  it('renders the dialog at z-40 with the dimming overlay class', () => {
    renderTour();
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toMatch(/z-40/);
    expect(dialog.className).toMatch(/bg-black\/30/);
  });

  it('renders the dialog as fixed inset-0 so it overlays the page', () => {
    renderTour();
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toMatch(/fixed/);
    expect(dialog.className).toMatch(/inset-0/);
  });

  // ---- step 0 copy (welcome) -------------------------------------

  it('renders the welcome step title on initial render', () => {
    renderTour();
    expect(screen.getByText('Welcome to Sessions')).toBeInTheDocument();
  });

  it('renders the welcome step body on initial render', () => {
    renderTour();
    expect(
      screen.getByText(
        'Browse past Claude Code conversations recorded under ~/.claude/projects.',
      ),
    ).toBeInTheDocument();
  });

  it('renders the 1/3 step counter on initial render', () => {
    renderTour();
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('does NOT render the attach step title on initial render', () => {
    renderTour();
    expect(
      screen.queryByText('Attach external sessions'),
    ).not.toBeInTheDocument();
  });

  it('does NOT render the view step title on initial render', () => {
    renderTour();
    expect(screen.queryByText('View or resume')).not.toBeInTheDocument();
  });

  // ---- step counter format ---------------------------------------

  it('renders the step-counter span next to the title', () => {
    renderTour();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('1/3')).toBeInTheDocument();
  });

  // ---- dismiss buttons (X / Skip / Done) -------------------------

  it('renders the X dismiss button with the i18n aria-label', () => {
    renderTour();
    expect(
      screen.getByRole('button', { name: 'Dismiss tour' }),
    ).toBeInTheDocument();
  });

  it('renders the Skip button on every step (including the first)', () => {
    renderTour();
    expect(
      screen.getByRole('button', { name: 'Skip tour' }),
    ).toBeInTheDocument();
  });

  it('renders the Next button (not Done) on the first step', () => {
    renderTour();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
  });

  it('renders exactly three buttons on a non-final step (X, Skip, Next)', () => {
    renderTour();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  // ---- dismiss callback wiring -----------------------------------

  it('fires onDismiss once when the X dismiss button is clicked', async () => {
    const { user, onDismiss } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Dismiss tour' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('fires onDismiss once when the Skip button is clicked on step 1', async () => {
    const { user, onDismiss } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onDismiss when the Next button is clicked', async () => {
    const { user, onDismiss } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  // ---- step advance (next) ---------------------------------------

  it('advances to step 2 (attach) when Next is clicked from step 1', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Attach external sessions')).toBeInTheDocument();
  });

  it('renders the 2/3 step counter after one Next click', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('2/3')).toBeInTheDocument();
  });

  it('renders the attach step body after one Next click', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      screen.getByText(
        'Click "Attach new..." to pin a JSONL transcript so it shows up in this tab.',
      ),
    ).toBeInTheDocument();
  });

  it('drops the welcome copy after advancing past it', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.queryByText('Welcome to Sessions')).not.toBeInTheDocument();
    expect(screen.queryByText('1/3')).not.toBeInTheDocument();
  });

  it('keeps the Next button (not Done) on the middle step', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
  });

  it('advances to step 3 (view) on a second Next click', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('View or resume')).toBeInTheDocument();
  });

  it('renders the 3/3 step counter on the final step', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('3/3')).toBeInTheDocument();
  });

  it('renders the view step body on the final step', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      screen.getByText(
        'Open an attached row to read the timeline, or copy the claude --resume command to pick it back up.',
      ),
    ).toBeInTheDocument();
  });

  // ---- final-step Done button ------------------------------------

  it('renders the Done button (not Next) on the final step', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('keeps the Skip button on the final step', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      screen.getByRole('button', { name: 'Skip tour' }),
    ).toBeInTheDocument();
  });

  it('keeps the X dismiss button on the final step', async () => {
    const { user } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      screen.getByRole('button', { name: 'Dismiss tour' }),
    ).toBeInTheDocument();
  });

  it('fires onDismiss when the Done button is clicked on the final step', async () => {
    const { user, onDismiss } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('fires onDismiss when the Skip button is clicked on the final step', async () => {
    const { user, onDismiss } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('fires onDismiss when the X button is clicked on the final step', async () => {
    const { user, onDismiss } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss tour' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // ---- dismiss-mid-tour --------------------------------------------

  it('fires onDismiss when the Skip button is clicked on the middle step', async () => {
    const { user, onDismiss } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('fires onDismiss when the X button is clicked on the middle step', async () => {
    const { user, onDismiss } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss tour' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // ---- icon aria-hidden -----------------------------------------

  it('renders the X close-icon as aria-hidden inside the dismiss button', () => {
    renderTour();
    const dismissBtn = screen.getByRole('button', { name: 'Dismiss tour' });
    const svg = dismissBtn.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  // ---- keyboard activation --------------------------------------

  it('advances to step 2 when Enter is pressed with Next focused', async () => {
    const { user } = renderTour();
    const next = screen.getByRole('button', { name: 'Next' });
    next.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Attach external sessions')).toBeInTheDocument();
  });

  it('fires onDismiss when Space is pressed with Skip focused', async () => {
    const { user, onDismiss } = renderTour();
    const skip = screen.getByRole('button', { name: 'Skip tour' });
    skip.focus();
    await user.keyboard(' ');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('fires onDismiss when Enter is pressed with Done focused on the final step', async () => {
    const { user, onDismiss } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    const done = screen.getByRole('button', { name: 'Done' });
    done.focus();
    await user.keyboard('{Enter}');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // ---- rerender stability ----------------------------------------

  it('rerendering with the same props does not duplicate the dialog', () => {
    const { rerender, props } = renderTour();
    rerender(<SessionsTour {...props} />);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('preserves the step index across a same-props rerender', async () => {
    const { user, rerender, props } = renderTour();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('2/3')).toBeInTheDocument();
    rerender(<SessionsTour {...props} />);
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByText('Attach external sessions')).toBeInTheDocument();
  });

  // ---- locale flip ------------------------------------------------

  it('re-renders the welcome title in Korean when the locale flips', () => {
    renderTour();
    expect(screen.getByText('Welcome to Sessions')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Welcome to Sessions')).not.toBeInTheDocument();
  });

  it('re-renders the dialog aria-label in Korean when the locale flips', () => {
    renderTour();
    expect(
      screen.getByRole('dialog', { name: 'Sessions onboarding' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('dialog', { name: 'Sessions onboarding' }),
    ).not.toBeInTheDocument();
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

  it('re-renders the Next button label in Korean when the locale flips', () => {
    renderTour();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: 'Next' }),
    ).not.toBeInTheDocument();
  });

  it('re-renders the dismiss aria-label in Korean when the locale flips', () => {
    renderTour();
    expect(
      screen.getByRole('button', { name: 'Dismiss tour' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: 'Dismiss tour' }),
    ).not.toBeInTheDocument();
  });
});
