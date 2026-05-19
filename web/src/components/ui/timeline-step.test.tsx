import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  TIMELINE_STEP_STATE_CLASS,
  TimelineStep,
  getTimelineStepAriaCurrent,
  getTimelineStepDefaultIcon,
  isTimelineStepReachable,
} from './timeline-step';

afterEach(() => {
  cleanup();
});

describe('TIMELINE_STEP_STATE_CLASS', () => {
  it('declares all four states', () => {
    expect(Object.keys(TIMELINE_STEP_STATE_CLASS).sort()).toEqual(
      ['completed', 'current', 'error', 'pending'],
    );
  });

  it('each state has circle / icon / label / description classes', () => {
    for (const key of Object.keys(
      TIMELINE_STEP_STATE_CLASS,
    ) as Array<keyof typeof TIMELINE_STEP_STATE_CLASS>) {
      const cls = TIMELINE_STEP_STATE_CLASS[key];
      expect(typeof cls.circle).toBe('string');
      expect(cls.circle.length).toBeGreaterThan(0);
      expect(typeof cls.icon).toBe('string');
      expect(typeof cls.label).toBe('string');
      expect(typeof cls.description).toBe('string');
    }
  });
});

describe('isTimelineStepReachable', () => {
  it('completed -> true', () => {
    expect(isTimelineStepReachable('completed')).toBe(true);
  });
  it('current -> true', () => {
    expect(isTimelineStepReachable('current')).toBe(true);
  });
  it('pending -> false', () => {
    expect(isTimelineStepReachable('pending')).toBe(false);
  });
  it('error -> false', () => {
    expect(isTimelineStepReachable('error')).toBe(false);
  });
});

describe('getTimelineStepDefaultIcon', () => {
  it('returns a node for completed', () => {
    expect(getTimelineStepDefaultIcon('completed')).not.toBeNull();
  });
  it('returns a node for error', () => {
    expect(getTimelineStepDefaultIcon('error')).not.toBeNull();
  });
  it('returns null for pending', () => {
    expect(getTimelineStepDefaultIcon('pending')).toBeNull();
  });
  it('returns null for current', () => {
    expect(getTimelineStepDefaultIcon('current')).toBeNull();
  });
});

describe('getTimelineStepAriaCurrent', () => {
  it('returns "step" only for current', () => {
    expect(getTimelineStepAriaCurrent('current')).toBe('step');
    expect(getTimelineStepAriaCurrent('completed')).toBeUndefined();
    expect(getTimelineStepAriaCurrent('pending')).toBeUndefined();
    expect(getTimelineStepAriaCurrent('error')).toBeUndefined();
  });
});

describe('TimelineStep component', () => {
  it('renders as a listitem', () => {
    render(<TimelineStep label="Step" />);
    expect(screen.getByRole('listitem')).toBeInTheDocument();
  });

  it('default state is pending (data-state)', () => {
    render(<TimelineStep label="Step" />);
    expect(screen.getByRole('listitem')).toHaveAttribute(
      'data-state',
      'pending',
    );
  });

  it('data-state mirrors the state prop', () => {
    const { rerender } = render(
      <TimelineStep label="Step" state="completed" />,
    );
    expect(screen.getByRole('listitem')).toHaveAttribute(
      'data-state',
      'completed',
    );
    rerender(<TimelineStep label="Step" state="current" />);
    expect(screen.getByRole('listitem')).toHaveAttribute(
      'data-state',
      'current',
    );
    rerender(<TimelineStep label="Step" state="error" />);
    expect(screen.getByRole('listitem')).toHaveAttribute(
      'data-state',
      'error',
    );
  });

  it('state=current sets aria-current="step"', () => {
    render(<TimelineStep label="Step" state="current" />);
    expect(screen.getByRole('listitem')).toHaveAttribute(
      'aria-current',
      'step',
    );
  });

  it('non-current states omit aria-current', () => {
    const { rerender } = render(
      <TimelineStep label="Step" state="completed" />,
    );
    expect(screen.getByRole('listitem')).not.toHaveAttribute(
      'aria-current',
    );
    rerender(<TimelineStep label="Step" state="pending" />);
    expect(screen.getByRole('listitem')).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('ariaLabel prop applies to the listitem', () => {
    render(
      <TimelineStep label="Step" ariaLabel="Step 2 of 3" />,
    );
    expect(screen.getByRole('listitem')).toHaveAttribute(
      'aria-label',
      'Step 2 of 3',
    );
  });

  it('renders the label slot', () => {
    render(<TimelineStep label="Initialize" />);
    expect(screen.getByText('Initialize')).toBeInTheDocument();
  });

  it('renders the description slot', () => {
    render(
      <TimelineStep
        label="Initialize"
        description="Set up the workspace"
      />,
    );
    expect(
      screen.getByText('Set up the workspace'),
    ).toBeInTheDocument();
  });

  it('renders the meta slot', () => {
    render(
      <TimelineStep
        label="Step"
        meta="5m ago"
      />,
    );
    expect(screen.getByText('5m ago')).toBeInTheDocument();
  });

  it('omits the content block when no label / description / meta', () => {
    const { container } = render(<TimelineStep />);
    expect(
      container.querySelector(
        '[data-section="timeline-step-content"]',
      ),
    ).toBeNull();
  });

  it('renders a circle indicator', () => {
    const { container } = render(<TimelineStep label="Step" />);
    expect(
      container.querySelector(
        '[data-section="timeline-step-circle"]',
      ),
    ).toBeInTheDocument();
  });

  it('completed state shows a check icon by default', () => {
    const { container } = render(
      <TimelineStep label="Step" state="completed" />,
    );
    const icon = container.querySelector(
      '[data-section="timeline-step-icon"]',
    );
    expect(icon).toHaveAttribute(
      'data-icon-kind',
      'default-completed',
    );
  });

  it('error state shows an alert icon by default', () => {
    const { container } = render(
      <TimelineStep label="Step" state="error" />,
    );
    const icon = container.querySelector(
      '[data-section="timeline-step-icon"]',
    );
    expect(icon).toHaveAttribute(
      'data-icon-kind',
      'default-error',
    );
  });

  it('pending state has no default icon', () => {
    const { container } = render(
      <TimelineStep label="Step" state="pending" />,
    );
    expect(
      container.querySelector(
        '[data-section="timeline-step-icon"]',
      ),
    ).toBeNull();
  });

  it('current state has no default icon', () => {
    const { container } = render(
      <TimelineStep label="Step" state="current" />,
    );
    expect(
      container.querySelector(
        '[data-section="timeline-step-icon"]',
      ),
    ).toBeNull();
  });

  it('custom icon prop replaces the default icon', () => {
    const { container } = render(
      <TimelineStep
        label="Step"
        state="completed"
        icon={<svg data-testid="custom-icon" />}
      />,
    );
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    const icon = container.querySelector(
      '[data-section="timeline-step-icon"]',
    );
    expect(icon).toHaveAttribute('data-icon-kind', 'custom');
  });

  it('showConnectorBefore=false omits the connector before', () => {
    const { container } = render(
      <TimelineStep label="Step" />,
    );
    expect(
      container.querySelector(
        '[data-section="timeline-step-connector-before"]',
      ),
    ).toBeNull();
  });

  it('showConnectorBefore=true renders the connector before', () => {
    const { container } = render(
      <TimelineStep label="Step" showConnectorBefore />,
    );
    expect(
      container.querySelector(
        '[data-section="timeline-step-connector-before"]',
      ),
    ).toBeInTheDocument();
  });

  it('showConnectorAfter=true renders the connector after', () => {
    const { container } = render(
      <TimelineStep label="Step" showConnectorAfter />,
    );
    expect(
      container.querySelector(
        '[data-section="timeline-step-connector-after"]',
      ),
    ).toBeInTheDocument();
  });

  it('connector before "completed" colour when state=completed', () => {
    const { container } = render(
      <TimelineStep
        label="Step"
        state="completed"
        showConnectorBefore
      />,
    );
    expect(
      container.querySelector(
        '[data-section="timeline-step-connector-before"]',
      ),
    ).toHaveAttribute('data-connector-state', 'completed');
  });

  it('connector after "pending" colour for current state', () => {
    const { container } = render(
      <TimelineStep
        label="Step"
        state="current"
        showConnectorAfter
      />,
    );
    expect(
      container.querySelector(
        '[data-section="timeline-step-connector-after"]',
      ),
    ).toHaveAttribute('data-connector-state', 'pending');
  });

  it('connector after "completed" when state=completed', () => {
    const { container } = render(
      <TimelineStep
        label="Step"
        state="completed"
        showConnectorAfter
      />,
    );
    expect(
      container.querySelector(
        '[data-section="timeline-step-connector-after"]',
      ),
    ).toHaveAttribute('data-connector-state', 'completed');
  });

  it('connectorState prop overrides both before + after', () => {
    const { container } = render(
      <TimelineStep
        label="Step"
        state="pending"
        showConnectorBefore
        showConnectorAfter
        connectorState="completed"
      />,
    );
    expect(
      container.querySelector(
        '[data-section="timeline-step-connector-before"]',
      ),
    ).toHaveAttribute('data-connector-state', 'completed');
    expect(
      container.querySelector(
        '[data-section="timeline-step-connector-after"]',
      ),
    ).toHaveAttribute('data-connector-state', 'completed');
  });

  it('data-show-connector-before / -after mirror props', () => {
    render(
      <TimelineStep
        label="Step"
        showConnectorBefore
        showConnectorAfter
      />,
    );
    expect(screen.getByRole('listitem')).toHaveAttribute(
      'data-show-connector-before',
      'true',
    );
    expect(screen.getByRole('listitem')).toHaveAttribute(
      'data-show-connector-after',
      'true',
    );
  });

  it('data-size mirrors size prop', () => {
    const { rerender } = render(
      <TimelineStep label="Step" size="sm" />,
    );
    expect(screen.getByRole('listitem')).toHaveAttribute(
      'data-size',
      'sm',
    );
    rerender(<TimelineStep label="Step" size="lg" />);
    expect(screen.getByRole('listitem')).toHaveAttribute(
      'data-size',
      'lg',
    );
  });

  it('size variants adjust circle dimensions', () => {
    const { container, rerender } = render(
      <TimelineStep label="Step" size="sm" />,
    );
    const smCircle = container.querySelector(
      '[data-section="timeline-step-circle"]',
    );
    expect(smCircle?.className).toContain('h-5');
    rerender(<TimelineStep label="Step" size="lg" />);
    const lgCircle = container.querySelector(
      '[data-section="timeline-step-circle"]',
    );
    expect(lgCircle?.className).toContain('h-8');
  });

  it('data-reachable reflects state', () => {
    const { rerender } = render(
      <TimelineStep label="Step" state="completed" />,
    );
    expect(screen.getByRole('listitem')).toHaveAttribute(
      'data-reachable',
      'true',
    );
    rerender(<TimelineStep label="Step" state="pending" />);
    expect(screen.getByRole('listitem')).toHaveAttribute(
      'data-reachable',
      'false',
    );
    rerender(<TimelineStep label="Step" state="error" />);
    expect(screen.getByRole('listitem')).toHaveAttribute(
      'data-reachable',
      'false',
    );
  });

  it('forwards extra HTML attributes to the root li', () => {
    render(
      <TimelineStep
        label="Step"
        data-testid="custom-id"
      />,
    );
    expect(screen.getByTestId('custom-id')).toBeInTheDocument();
  });

  it('honors className', () => {
    render(<TimelineStep label="Step" className="my-class" />);
    expect(screen.getByRole('listitem').className).toContain(
      'my-class',
    );
  });

  it('exposes a stable displayName', () => {
    expect(TimelineStep.displayName).toBe('TimelineStep');
  });

  it('forwards refs to the root li', () => {
    const ref = createRef<HTMLLIElement>();
    render(<TimelineStep ref={ref} label="Step" />);
    expect(ref.current?.tagName).toBe('LI');
  });

  it('label colour token shifts on state', () => {
    render(
      <TimelineStep label="Step" state="error" />,
    );
    const labelEl = screen.getByText('Step');
    expect(labelEl.className).toContain('text-rose-500');
  });
});
