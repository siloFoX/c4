import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  DEFAULT_PROGRESS_TRACKER_ORIENTATION,
  DEFAULT_PROGRESS_TRACKER_SIZE,
  ProgressTracker,
  clampProgressActiveIndex,
  getProgressTrackerPercent,
  getProgressTrackerStepState,
} from './progress-tracker';
import type { ProgressTrackerStep } from './progress-tracker';

afterEach(() => {
  cleanup();
});

const steps: ProgressTrackerStep[] = [
  { id: 'plan', label: 'Plan', description: 'Outline the goal' },
  { id: 'build', label: 'Build', description: 'Ship the feature' },
  { id: 'test', label: 'Test', description: 'Verify everything' },
  { id: 'ship', label: 'Ship', description: 'Push live' },
];

describe('clampProgressActiveIndex', () => {
  it('returns -1 for empty total', () => {
    expect(clampProgressActiveIndex(2, 0)).toBe(-1);
  });
  it('clamps below -1 to -1', () => {
    expect(clampProgressActiveIndex(-5, 4)).toBe(-1);
  });
  it('clamps above total-1', () => {
    expect(clampProgressActiveIndex(10, 4)).toBe(3);
  });
  it('passes through valid indices', () => {
    expect(clampProgressActiveIndex(2, 4)).toBe(2);
  });
  it('NaN -> -1', () => {
    expect(clampProgressActiveIndex(Number.NaN, 4)).toBe(-1);
  });
  it('floors fractional', () => {
    expect(clampProgressActiveIndex(2.7, 4)).toBe(2);
  });
});

describe('getProgressTrackerStepState', () => {
  it('completed when index < activeIndex', () => {
    expect(getProgressTrackerStepState(0, 2)).toBe('completed');
    expect(getProgressTrackerStepState(1, 2)).toBe('completed');
  });
  it('active when index = activeIndex', () => {
    expect(getProgressTrackerStepState(2, 2)).toBe('active');
  });
  it('pending when index > activeIndex', () => {
    expect(getProgressTrackerStepState(3, 2)).toBe('pending');
  });
  it('override wins', () => {
    expect(
      getProgressTrackerStepState(2, 5, 'error'),
    ).toBe('error');
    expect(
      getProgressTrackerStepState(0, 5, 'pending'),
    ).toBe('pending');
  });
  it('all pending when activeIndex=-1', () => {
    expect(getProgressTrackerStepState(0, -1)).toBe('pending');
  });
});

describe('getProgressTrackerPercent', () => {
  it('0 for empty total', () => {
    expect(getProgressTrackerPercent(0, 0)).toBe(0);
  });
  it('0 when activeIndex < 0', () => {
    expect(getProgressTrackerPercent(-1, 4)).toBe(0);
  });
  it('mid step adds half-progress', () => {
    // index=0, total=4 -> 0.5/4 = 12.5
    expect(getProgressTrackerPercent(0, 4)).toBe(12.5);
    // index=2, total=4 -> 2.5/4 = 62.5
    expect(getProgressTrackerPercent(2, 4)).toBe(62.5);
  });
  it('100 when activeIndex >= total', () => {
    expect(getProgressTrackerPercent(4, 4)).toBe(100);
  });
});

describe('Constants', () => {
  it('DEFAULT_PROGRESS_TRACKER_ORIENTATION = horizontal', () => {
    expect(DEFAULT_PROGRESS_TRACKER_ORIENTATION).toBe('horizontal');
  });
  it('DEFAULT_PROGRESS_TRACKER_SIZE = md', () => {
    expect(DEFAULT_PROGRESS_TRACKER_SIZE).toBe('md');
  });
});

describe('ProgressTracker component', () => {
  it('renders root with role=progressbar + default aria-label', () => {
    render(<ProgressTracker steps={steps} activeIndex={1} />);
    const root = screen.getByRole('progressbar');
    expect(root).toHaveAttribute('aria-label', 'Progress tracker');
  });

  it('honors custom ariaLabel', () => {
    render(
      <ProgressTracker
        steps={steps}
        activeIndex={1}
        ariaLabel="Onboarding progress"
      />,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-label',
      'Onboarding progress',
    );
  });

  it('aria-valuemin / valuemax / valuenow reflect the active step', () => {
    render(<ProgressTracker steps={steps} activeIndex={2} />);
    const root = screen.getByRole('progressbar');
    expect(root).toHaveAttribute('aria-valuemin', '0');
    expect(root).toHaveAttribute('aria-valuemax', '4');
    expect(root).toHaveAttribute('aria-valuenow', '3');
    expect(root).toHaveAttribute(
      'aria-valuetext',
      'Step 3 of 4',
    );
  });

  it('renders one step element per item', () => {
    const { container } = render(
      <ProgressTracker steps={steps} activeIndex={0} />,
    );
    const stepNodes = container.querySelectorAll(
      '[data-section="progress-tracker-step"]',
    );
    expect(stepNodes.length).toBe(4);
  });

  it('step labels render when showLabels=true (default)', () => {
    render(<ProgressTracker steps={steps} activeIndex={1} />);
    expect(screen.getByText('Plan')).toBeInTheDocument();
    expect(screen.getByText('Build')).toBeInTheDocument();
    expect(screen.getByText('Test')).toBeInTheDocument();
    expect(screen.getByText('Ship')).toBeInTheDocument();
  });

  it('showLabels=false hides labels', () => {
    const { container } = render(
      <ProgressTracker
        steps={steps}
        activeIndex={1}
        showLabels={false}
        showDescriptions={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="progress-tracker-label"]',
      ),
    ).toBeNull();
  });

  it('descriptions render by default when supplied', () => {
    render(<ProgressTracker steps={steps} activeIndex={1} />);
    expect(screen.getByText('Outline the goal')).toBeInTheDocument();
  });

  it('showDescriptions=false hides descriptions', () => {
    const { container } = render(
      <ProgressTracker
        steps={steps}
        activeIndex={1}
        showDescriptions={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="progress-tracker-description"]',
      ),
    ).toBeNull();
  });

  it('per-step data-state reflects derived state', () => {
    const { container } = render(
      <ProgressTracker steps={steps} activeIndex={1} />,
    );
    const stepNodes = container.querySelectorAll(
      '[data-section="progress-tracker-step"]',
    );
    expect(stepNodes[0]?.getAttribute('data-state')).toBe(
      'completed',
    );
    expect(stepNodes[1]?.getAttribute('data-state')).toBe('active');
    expect(stepNodes[2]?.getAttribute('data-state')).toBe('pending');
    expect(stepNodes[3]?.getAttribute('data-state')).toBe('pending');
  });

  it('per-step state override wins', () => {
    const withOverride: ProgressTrackerStep[] = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B', state: 'error' },
      { id: 'c', label: 'C' },
    ];
    const { container } = render(
      <ProgressTracker steps={withOverride} activeIndex={2} />,
    );
    const stepNodes = container.querySelectorAll(
      '[data-section="progress-tracker-step"]',
    );
    expect(stepNodes[1]?.getAttribute('data-state')).toBe('error');
  });

  it('orientation defaults to horizontal', () => {
    render(<ProgressTracker steps={steps} activeIndex={1} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'data-orientation',
      'horizontal',
    );
  });

  it('orientation="vertical" reflects on root', () => {
    render(
      <ProgressTracker
        steps={steps}
        activeIndex={1}
        orientation="vertical"
      />,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'data-orientation',
      'vertical',
    );
  });

  it('size attribute reflects on root', () => {
    render(
      <ProgressTracker steps={steps} activeIndex={0} size="lg" />,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'data-size',
      'lg',
    );
  });

  it('data-total + data-active-index + data-percent are present', () => {
    render(<ProgressTracker steps={steps} activeIndex={2} />);
    const root = screen.getByRole('progressbar');
    expect(root).toHaveAttribute('data-total', '4');
    expect(root).toHaveAttribute('data-active-index', '2');
    expect(root).toHaveAttribute('data-percent', '62.5');
  });

  it('onStepClick callback fires with the index', () => {
    const onStepClick = vi.fn();
    render(
      <ProgressTracker
        steps={steps}
        activeIndex={1}
        onStepClick={onStepClick}
      />,
    );
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[2]!);
    expect(onStepClick).toHaveBeenCalledWith(2);
  });

  it('without onStepClick, indicators render as span not button', () => {
    const { container } = render(
      <ProgressTracker steps={steps} activeIndex={1} />,
    );
    expect(
      container.querySelectorAll('button').length,
    ).toBe(0);
    const indicators = container.querySelectorAll(
      '[data-section="progress-tracker-indicator"]',
    );
    expect(indicators.length).toBe(4);
  });

  it('indicator shows step number for pending step', () => {
    render(<ProgressTracker steps={steps} activeIndex={0} />);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('indicator shows Check icon for completed steps', () => {
    const { container } = render(
      <ProgressTracker steps={steps} activeIndex={2} />,
    );
    const completedIndicators = container.querySelectorAll(
      '[data-section="progress-tracker-step"][data-state="completed"] [data-section="progress-tracker-indicator"] svg',
    );
    expect(completedIndicators.length).toBe(2);
  });

  it('active indicator has aria-current="step"', () => {
    const { container } = render(
      <ProgressTracker steps={steps} activeIndex={1} />,
    );
    const indicator = container.querySelector(
      '[data-section="progress-tracker-step"][data-state="active"] [data-section="progress-tracker-indicator"]',
    );
    expect(indicator).toHaveAttribute('aria-current', 'step');
  });

  it('connectors render between non-last steps', () => {
    const { container } = render(
      <ProgressTracker steps={steps} activeIndex={2} />,
    );
    const connectors = container.querySelectorAll(
      '[data-section="progress-tracker-connector"]',
    );
    // horizontal: between each consecutive pair (trailing) +
    // a leading connector before the first non-first indicator
    expect(connectors.length).toBeGreaterThan(0);
  });

  it('aria-valuenow clamps active >= total to total', () => {
    render(<ProgressTracker steps={steps} activeIndex={10} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '4',
    );
  });

  it('aria-valuenow=0 + percent=0 when activeIndex < 0', () => {
    render(<ProgressTracker steps={steps} activeIndex={-1} />);
    const root = screen.getByRole('progressbar');
    expect(root).toHaveAttribute('aria-valuenow', '0');
    expect(root).toHaveAttribute('data-percent', '0');
  });

  it('renders nothing visible but role=progressbar with 0 steps', () => {
    render(<ProgressTracker steps={[]} activeIndex={0} />);
    const root = screen.getByRole('progressbar');
    expect(root).toHaveAttribute('aria-valuemax', '1');
    expect(root).toHaveAttribute('data-total', '0');
  });

  it('exposes a stable displayName', () => {
    expect(ProgressTracker.displayName).toBe('ProgressTracker');
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ProgressTracker ref={ref} steps={steps} activeIndex={1} />,
    );
    expect(ref.current?.getAttribute('role')).toBe('progressbar');
  });

  it('indicator button has accessible label including state', () => {
    render(
      <ProgressTracker
        steps={steps}
        activeIndex={1}
        onStepClick={() => {}}
      />,
    );
    expect(
      screen.getByLabelText('Plan (completed)'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Build (active)'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Test (pending)'),
    ).toBeInTheDocument();
  });

  it('data-step-id and data-step-index attrs on each step', () => {
    const { container } = render(
      <ProgressTracker steps={steps} activeIndex={0} />,
    );
    const stepNodes = container.querySelectorAll(
      '[data-section="progress-tracker-step"]',
    );
    expect(stepNodes[0]?.getAttribute('data-step-id')).toBe('plan');
    expect(stepNodes[0]?.getAttribute('data-step-index')).toBe('0');
    expect(stepNodes[3]?.getAttribute('data-step-id')).toBe('ship');
  });
});
