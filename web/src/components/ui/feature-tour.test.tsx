import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import {
  DEFAULT_FEATURE_TOUR_PANEL_OFFSET,
  DEFAULT_FEATURE_TOUR_PLACEMENT,
  DEFAULT_FEATURE_TOUR_STORAGE_PREFIX,
  FeatureTour,
  clampStepIndex,
  clearTourDismissal,
  computeTourPanelPosition,
  getTourStorageKey,
  isTourDismissed,
  markTourDismissed,
  resolveAutoPlacement,
} from './feature-tour';
import type { FeatureTourStep } from './feature-tour';

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.body.innerHTML = '';
});

const STEPS: FeatureTourStep[] = [
  {
    id: 's1',
    target: '#anchor-1',
    title: 'Step 1 title',
    description: 'Step 1 body',
  },
  {
    id: 's2',
    target: '#anchor-2',
    title: 'Step 2 title',
    description: 'Step 2 body',
  },
  {
    id: 's3',
    target: '#anchor-3',
    title: 'Step 3 title',
  },
];

function mountAnchors() {
  for (let i = 1; i <= 3; i += 1) {
    const el = document.createElement('div');
    el.id = `anchor-${i}`;
    el.textContent = `anchor ${i}`;
    document.body.appendChild(el);
  }
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

describe('getTourStorageKey', () => {
  it('prefixes the tour id', () => {
    expect(getTourStorageKey('billing')).toBe(
      `${DEFAULT_FEATURE_TOUR_STORAGE_PREFIX}billing`,
    );
  });
  it('override wins', () => {
    expect(getTourStorageKey('billing', 'custom-key')).toBe(
      'custom-key',
    );
  });
});

describe('isTourDismissed / markTourDismissed / clearTourDismissal', () => {
  it('false when storage is empty', () => {
    expect(isTourDismissed('billing')).toBe(false);
  });
  it('true after marking', () => {
    markTourDismissed('billing');
    expect(isTourDismissed('billing')).toBe(true);
  });
  it('clearTourDismissal removes the flag', () => {
    markTourDismissed('billing');
    clearTourDismissal('billing');
    expect(isTourDismissed('billing')).toBe(false);
  });
  it('honours an override key', () => {
    markTourDismissed('billing', 'custom-key');
    expect(isTourDismissed('billing', 'custom-key')).toBe(true);
    expect(isTourDismissed('billing')).toBe(false);
  });
  it('returns false when storage is null', () => {
    expect(isTourDismissed('x', undefined, null)).toBe(false);
  });
  it('markTourDismissed swallows throwing storage', () => {
    const throwing: Storage = {
      length: 0,
      clear: () => {},
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() =>
      markTourDismissed('x', undefined, throwing),
    ).not.toThrow();
  });
});

describe('clampStepIndex', () => {
  it('returns 0 for empty total', () => {
    expect(clampStepIndex(2, 0)).toBe(0);
  });
  it('clamps below 0', () => {
    expect(clampStepIndex(-5, 3)).toBe(0);
  });
  it('clamps above total-1', () => {
    expect(clampStepIndex(10, 3)).toBe(2);
  });
  it('passes through valid', () => {
    expect(clampStepIndex(1, 3)).toBe(1);
  });
  it('NaN -> 0', () => {
    expect(clampStepIndex(Number.NaN, 3)).toBe(0);
  });
  it('floors fractional', () => {
    expect(clampStepIndex(1.7, 3)).toBe(1);
  });
});

describe('resolveAutoPlacement', () => {
  const viewport = { width: 1000, height: 600 };
  const panel = { width: 320, height: 160 };
  it('bottom when it fits below', () => {
    expect(
      resolveAutoPlacement(
        { top: 100, left: 100, width: 50, height: 50 },
        panel,
        viewport,
        12,
      ),
    ).toBe('bottom');
  });
  it('top when bottom is clipped', () => {
    expect(
      resolveAutoPlacement(
        { top: 500, left: 100, width: 50, height: 50 },
        panel,
        viewport,
        12,
      ),
    ).toBe('top');
  });
  it('right when top + bottom both clipped, right fits', () => {
    expect(
      resolveAutoPlacement(
        { top: 10, left: 0, width: 50, height: 580 },
        panel,
        viewport,
        12,
      ),
    ).toBe('right');
  });
  it('left as the last fallback', () => {
    expect(
      resolveAutoPlacement(
        { top: 10, left: 700, width: 50, height: 580 },
        panel,
        viewport,
        12,
      ),
    ).toBe('left');
  });
});

describe('computeTourPanelPosition', () => {
  const panel = { width: 200, height: 100 };
  const viewport = { width: 1000, height: 600 };
  const anchor = {
    top: 200,
    left: 400,
    width: 100,
    height: 50,
  };
  it('bottom places panel below anchor + offset, centered horizontally', () => {
    const pos = computeTourPanelPosition(
      anchor,
      panel,
      'bottom',
      viewport,
      12,
    );
    expect(pos.placement).toBe('bottom');
    expect(pos.top).toBe(200 + 50 + 12);
    expect(pos.left).toBe(400 + 50 - 100); // anchor center - panel/2
  });
  it('top places panel above anchor', () => {
    const pos = computeTourPanelPosition(
      anchor,
      panel,
      'top',
      viewport,
      12,
    );
    expect(pos.placement).toBe('top');
    expect(pos.top).toBe(200 - 12 - 100);
  });
  it('left places panel to the left of anchor', () => {
    const pos = computeTourPanelPosition(
      anchor,
      panel,
      'left',
      viewport,
      12,
    );
    expect(pos.placement).toBe('left');
    expect(pos.left).toBe(400 - 12 - 200);
  });
  it('right places panel to the right of anchor', () => {
    const pos = computeTourPanelPosition(
      anchor,
      panel,
      'right',
      viewport,
      12,
    );
    expect(pos.placement).toBe('right');
    expect(pos.left).toBe(400 + 100 + 12);
  });
  it('clamps panel into the viewport', () => {
    const pos = computeTourPanelPosition(
      { top: 0, left: 0, width: 50, height: 50 },
      panel,
      'left',
      viewport,
      12,
    );
    expect(pos.left).toBe(0);
    expect(pos.top).toBeGreaterThanOrEqual(0);
  });
  it('auto resolves via the heuristic', () => {
    const pos = computeTourPanelPosition(
      anchor,
      panel,
      'auto',
      viewport,
      12,
    );
    expect(['top', 'bottom', 'left', 'right']).toContain(
      pos.placement,
    );
  });
});

describe('Constants', () => {
  it('DEFAULT_FEATURE_TOUR_PLACEMENT = bottom', () => {
    expect(DEFAULT_FEATURE_TOUR_PLACEMENT).toBe('bottom');
  });
  it('DEFAULT_FEATURE_TOUR_PANEL_OFFSET = 12', () => {
    expect(DEFAULT_FEATURE_TOUR_PANEL_OFFSET).toBe(12);
  });
  it('storage prefix is namespaced', () => {
    expect(DEFAULT_FEATURE_TOUR_STORAGE_PREFIX).toBe(
      'c4:feature-tour:',
    );
  });
});

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

describe('FeatureTour component', () => {
  beforeEach(() => {
    mountAnchors();
  });

  it('renders a dialog by default', () => {
    render(<FeatureTour tourId="t" steps={STEPS} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('honors a custom ariaLabel on the panel', () => {
    render(
      <FeatureTour
        tourId="t"
        steps={STEPS}
        ariaLabel="Welcome tour"
      />,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute(
      'aria-label',
      'Welcome tour',
    );
  });

  it('shows the first step title + description by default', () => {
    render(<FeatureTour tourId="t" steps={STEPS} />);
    expect(screen.getByText('Step 1 title')).toBeInTheDocument();
    expect(screen.getByText('Step 1 body')).toBeInTheDocument();
  });

  it('shows progress text "1 / 3"', () => {
    render(<FeatureTour tourId="t" steps={STEPS} />);
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('showProgress=false hides the counter', () => {
    const { container } = render(
      <FeatureTour
        tourId="t"
        steps={STEPS}
        showProgress={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="feature-tour-progress"]',
      ),
    ).toBeNull();
  });

  it('Next button advances the step', () => {
    render(<FeatureTour tourId="t" steps={STEPS} />);
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Step 2 title')).toBeInTheDocument();
  });

  it('Prev disabled on the first step', () => {
    render(<FeatureTour tourId="t" steps={STEPS} />);
    expect(screen.getByText('Previous')).toBeDisabled();
  });

  it('Prev moves back when not on the first step', () => {
    render(
      <FeatureTour
        tourId="t"
        steps={STEPS}
        defaultStepIndex={1}
      />,
    );
    fireEvent.click(screen.getByText('Previous'));
    expect(screen.getByText('Step 1 title')).toBeInTheDocument();
  });

  it('Next on the last step says "Finish"', () => {
    render(
      <FeatureTour
        tourId="t"
        steps={STEPS}
        defaultStepIndex={2}
      />,
    );
    expect(screen.getByText('Finish')).toBeInTheDocument();
  });

  it('Finish fires onComplete + closes + marks dismissed', () => {
    const onComplete = vi.fn();
    render(
      <FeatureTour
        tourId="welcome"
        steps={STEPS}
        defaultStepIndex={2}
        onComplete={onComplete}
      />,
    );
    fireEvent.click(screen.getByText('Finish'));
    expect(onComplete).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(isTourDismissed('welcome')).toBe(true);
  });

  it('Skip button fires onSkip + closes + marks dismissed', () => {
    const onSkip = vi.fn();
    render(
      <FeatureTour
        tourId="welcome"
        steps={STEPS}
        onSkip={onSkip}
      />,
    );
    fireEvent.click(screen.getByText('Skip'));
    expect(onSkip).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(isTourDismissed('welcome')).toBe(true);
  });

  it('Close button does NOT mark dismissed (manual close)', () => {
    render(
      <FeatureTour tourId="welcome" steps={STEPS} />,
    );
    fireEvent.click(screen.getByLabelText('Close tour'));
    expect(isTourDismissed('welcome')).toBe(false);
  });

  it('clicking the mask closes manually (no dismiss)', () => {
    render(<FeatureTour tourId="welcome" steps={STEPS} />);
    const mask = document.querySelector(
      '[data-section="feature-tour-mask"]',
    ) as HTMLElement;
    fireEvent.click(mask);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(isTourDismissed('welcome')).toBe(false);
  });

  it('mask hidden when showMask=false', () => {
    const { container } = render(
      <FeatureTour
        tourId="t"
        steps={STEPS}
        showMask={false}
      />,
    );
    expect(
      container.querySelector('[data-section="feature-tour-mask"]'),
    ).toBeNull();
  });

  it('initially closed when localStorage already says dismissed', () => {
    markTourDismissed('welcome');
    render(
      <FeatureTour tourId="welcome" steps={STEPS} />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('controlled open=true reopens even after dismissal', () => {
    markTourDismissed('welcome');
    render(
      <FeatureTour tourId="welcome" steps={STEPS} open />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('onStepChange fires when navigating', () => {
    const onStepChange = vi.fn();
    render(
      <FeatureTour
        tourId="t"
        steps={STEPS}
        onStepChange={onStepChange}
      />,
    );
    fireEvent.click(screen.getByText('Next'));
    expect(onStepChange).toHaveBeenCalledWith(1);
  });

  it('controlled stepIndex pins the rendered step', () => {
    const { rerender } = render(
      <FeatureTour
        tourId="t"
        steps={STEPS}
        stepIndex={0}
      />,
    );
    expect(screen.getByText('Step 1 title')).toBeInTheDocument();
    rerender(
      <FeatureTour tourId="t" steps={STEPS} stepIndex={1} />,
    );
    expect(screen.getByText('Step 2 title')).toBeInTheDocument();
  });

  it('Escape skips (closeOnEscape default true)', () => {
    const onSkip = vi.fn();
    render(
      <FeatureTour
        tourId="t"
        steps={STEPS}
        onSkip={onSkip}
      />,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
    });
    expect(onSkip).toHaveBeenCalled();
  });

  it('closeOnEscape=false ignores Escape', () => {
    const onSkip = vi.fn();
    render(
      <FeatureTour
        tourId="t"
        steps={STEPS}
        closeOnEscape={false}
        onSkip={onSkip}
      />,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
    });
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('ArrowRight advances the step', () => {
    const onStepChange = vi.fn();
    render(
      <FeatureTour
        tourId="t"
        steps={STEPS}
        onStepChange={onStepChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'ArrowRight',
    });
    expect(onStepChange).toHaveBeenCalledWith(1);
  });

  it('ArrowLeft retreats the step', () => {
    const onStepChange = vi.fn();
    render(
      <FeatureTour
        tourId="t"
        steps={STEPS}
        defaultStepIndex={1}
        onStepChange={onStepChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'ArrowLeft',
    });
    expect(onStepChange).toHaveBeenCalledWith(0);
  });

  it('spotlight renders when the anchor is found', () => {
    render(<FeatureTour tourId="t" steps={STEPS} />);
    expect(
      document.querySelector('[data-section="feature-tour-spotlight"]'),
    ).toBeInTheDocument();
  });

  it('panel data-anchor-found="false" when the selector misses', () => {
    document.body.innerHTML = '';
    render(
      <FeatureTour
        tourId="t"
        steps={[
          { id: 's1', target: '#does-not-exist', title: 'x' },
        ]}
      />,
    );
    expect(
      document.querySelector('[data-section="feature-tour"]'),
    ).toHaveAttribute('data-anchor-found', 'false');
  });

  it('root data attrs mirror state', () => {
    render(
      <FeatureTour tourId="welcome" steps={STEPS} defaultStepIndex={1} />,
    );
    const root = document.querySelector(
      '[data-section="feature-tour"]',
    );
    expect(root).toHaveAttribute('data-tour-id', 'welcome');
    expect(root).toHaveAttribute('data-step-index', '1');
    expect(root).toHaveAttribute('data-step-id', 's2');
    expect(root).toHaveAttribute('data-step-count', '3');
  });

  it('custom labels override defaults', () => {
    render(
      <FeatureTour
        tourId="t"
        steps={STEPS}
        labels={{ next: 'Continue', skip: 'Bye' }}
      />,
    );
    expect(screen.getByText('Continue')).toBeInTheDocument();
    expect(screen.getByText('Bye')).toBeInTheDocument();
  });

  it('panel renders inside the portal target', () => {
    render(<FeatureTour tourId="t" steps={STEPS} />);
    const portalRoot = document.getElementById('app-portal-root');
    expect(portalRoot).not.toBeNull();
    expect(portalRoot?.contains(screen.getByRole('dialog'))).toBe(
      true,
    );
  });

  it('exposes a stable displayName', () => {
    expect(FeatureTour.displayName).toBe('FeatureTour');
  });
});
