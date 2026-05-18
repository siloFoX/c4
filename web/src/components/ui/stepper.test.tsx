import { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Stepper } from './stepper';
import type { StepperStep } from './stepper';

const baseSteps: StepperStep[] = [
  { id: 'a', label: 'Dispatch', description: 'send work to a worker' },
  { id: 'b', label: 'Work', description: 'worker runs the task' },
  { id: 'c', label: 'Verify', description: 'tests + review pass' },
  { id: 'd', label: 'Merge', description: 'land on main' },
];

describe('<Stepper>', () => {
  it('renders every step label', () => {
    render(<Stepper steps={baseSteps} currentIndex={1} />);
    for (const s of baseSteps) {
      expect(screen.getByText(s.label as string)).toBeInTheDocument();
    }
  });

  it('renders numbered indicators for current + pending steps', () => {
    render(<Stepper steps={baseSteps} currentIndex={1} />);
    // index 1 is current -> shows "2"; index 2,3 pending -> "3", "4"
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('shows a check icon on every completed step', () => {
    render(<Stepper steps={baseSteps} currentIndex={2} />);
    expect(screen.getByTestId('stepper-check-a')).toBeInTheDocument();
    expect(screen.getByTestId('stepper-check-b')).toBeInTheDocument();
    expect(screen.queryByTestId('stepper-check-c')).toBeNull();
    expect(screen.queryByTestId('stepper-check-d')).toBeNull();
  });

  it('marks only the current step with aria-current=step', () => {
    const { container } = render(
      <Stepper steps={baseSteps} currentIndex={1} />,
    );
    const items = container.querySelectorAll('[data-stepper-item]');
    expect(items[0].getAttribute('aria-current')).toBeNull();
    expect(items[1].getAttribute('aria-current')).toBe('step');
    expect(items[2].getAttribute('aria-current')).toBeNull();
    expect(items[3].getAttribute('aria-current')).toBeNull();
  });

  it('vertical orientation renders description text', () => {
    const { container } = render(
      <Stepper
        steps={baseSteps}
        currentIndex={1}
        orientation="vertical"
      />,
    );
    expect(container.getAttribute).toBeDefined();
    expect(
      container.querySelector('[data-stepper]')!.getAttribute('data-orientation'),
    ).toBe('vertical');
    expect(screen.getByText('send work to a worker')).toBeInTheDocument();
    expect(screen.getByText('worker runs the task')).toBeInTheDocument();
  });

  it('horizontal orientation omits description text', () => {
    render(<Stepper steps={baseSteps} currentIndex={0} />);
    expect(screen.queryByText('send work to a worker')).toBeNull();
    expect(screen.queryByText('worker runs the task')).toBeNull();
  });

  it('onStepClick fires for complete + current when allowFuture=false', () => {
    const onStepClick = vi.fn();
    render(
      <Stepper
        steps={baseSteps}
        currentIndex={2}
        onStepClick={onStepClick}
      />,
    );
    fireEvent.click(screen.getByLabelText('Step 1: Dispatch'));
    fireEvent.click(screen.getByLabelText('Step 3: Verify'));
    expect(onStepClick).toHaveBeenCalledWith(0);
    expect(onStepClick).toHaveBeenCalledWith(2);
    expect(onStepClick).toHaveBeenCalledTimes(2);
  });

  it('does not call onStepClick for future steps when allowFuture=false', () => {
    const onStepClick = vi.fn();
    render(
      <Stepper
        steps={baseSteps}
        currentIndex={1}
        onStepClick={onStepClick}
      />,
    );
    const futureBadge = screen.getByLabelText(
      'Step 4: Merge',
    ) as HTMLButtonElement;
    expect(futureBadge.disabled).toBe(true);
    fireEvent.click(futureBadge);
    expect(onStepClick).not.toHaveBeenCalled();
  });

  it('onStepClick fires on any step when allowFuture=true', () => {
    const onStepClick = vi.fn();
    render(
      <Stepper
        steps={baseSteps}
        currentIndex={0}
        onStepClick={onStepClick}
        allowFuture
      />,
    );
    fireEvent.click(screen.getByLabelText('Step 4: Merge'));
    expect(onStepClick).toHaveBeenCalledWith(3);
  });

  it('merges custom className on the root ol', () => {
    const { container } = render(
      <Stepper
        steps={baseSteps}
        currentIndex={0}
        className="custom-stepper-x"
      />,
    );
    const root = container.querySelector('[data-stepper]');
    expect(root).not.toBeNull();
    expect(root!.className).toContain('custom-stepper-x');
    expect(root!.className).toContain('flex');
  });

  it('forwards the ref to the underlying ol', () => {
    const ref = createRef<HTMLOListElement>();
    render(<Stepper ref={ref} steps={baseSteps} currentIndex={0} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('OL');
  });

  it('connector between complete-complete is primary; otherwise muted', () => {
    const { container } = render(
      <Stepper steps={baseSteps} currentIndex={2} />,
    );
    const connectors = container.querySelectorAll('[data-stepper-connector]');
    // 4 steps -> 3 connectors. completed indices: 0,1; current=2
    // connector[0] sits inside item[0] (complete) -> data-complete="true"
    // connector[1] sits inside item[1] (complete) -> "true"
    // connector[2] sits inside item[2] (current)  -> "false"
    expect(connectors).toHaveLength(3);
    expect(connectors[0].getAttribute('data-complete')).toBe('true');
    expect(connectors[1].getAttribute('data-complete')).toBe('true');
    expect(connectors[2].getAttribute('data-complete')).toBe('false');
  });

  it('omits the trailing connector on the last step', () => {
    const { container } = render(
      <Stepper steps={baseSteps} currentIndex={3} />,
    );
    const items = container.querySelectorAll('[data-stepper-item]');
    const last = items[items.length - 1];
    expect(last.querySelector('[data-stepper-connector]')).toBeNull();
  });

  // -- v1.11.270 error state (TODO 11.252) -------------------------

  it('renders the error glyph on a step flagged with error=true', () => {
    const steps: StepperStep[] = [
      { id: 'a', label: 'Dispatch' },
      { id: 'b', label: 'Validate', error: true },
      { id: 'c', label: 'Merge' },
    ];
    render(<Stepper steps={steps} currentIndex={1} />);
    expect(screen.getByTestId('stepper-error-b')).toBeInTheDocument();
    // The numbered span is NOT rendered when the step is in error
    // state.
    const item = document.querySelectorAll('[data-stepper-item]')[1]!;
    expect(item.getAttribute('data-state')).toBe('error');
  });

  it('error state overrides current (current+error -> error)', () => {
    const steps: StepperStep[] = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B', error: true },
      { id: 'c', label: 'C' },
    ];
    const { container } = render(<Stepper steps={steps} currentIndex={1} />);
    const items = container.querySelectorAll('[data-stepper-item]');
    expect(items[1]!.getAttribute('data-state')).toBe('error');
    // aria-current is dropped when the step state flips to error
    // (the step is no longer the "current" step in the conventional
    // sense -- it's an error step that demands attention).
    expect(items[1]!.getAttribute('aria-current')).toBeNull();
  });

  it('error state overrides complete (retroactive earlier-step failure)', () => {
    const steps: StepperStep[] = [
      { id: 'a', label: 'A', error: true },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ];
    const { container } = render(<Stepper steps={steps} currentIndex={2} />);
    const items = container.querySelectorAll('[data-stepper-item]');
    expect(items[0]!.getAttribute('data-state')).toBe('error');
    expect(screen.getByTestId('stepper-error-a')).toBeInTheDocument();
    // The Check glyph for the (would-have-been-complete) step a is
    // NOT rendered.
    expect(screen.queryByTestId('stepper-check-a')).toBeNull();
  });

  it('error state paints the badge bg-destructive', () => {
    const steps: StepperStep[] = [
      { id: 'a', label: 'A', error: true },
    ];
    render(<Stepper steps={steps} currentIndex={0} />);
    const badge = document.querySelector('[data-stepper-badge]');
    expect(badge).not.toBeNull();
    expect(badge!.className).toContain('bg-destructive');
  });

  it('error state paints the label text-destructive', () => {
    const steps: StepperStep[] = [
      { id: 'err', label: 'Failed step', error: true },
    ];
    render(<Stepper steps={steps} currentIndex={0} />);
    const label = document.querySelector('[data-stepper-label]');
    expect(label).not.toBeNull();
    expect(label!.className).toContain('text-destructive');
    expect(label!.className).toContain('font-semibold');
  });

  it('error connector trailing a non-complete step paints bg-destructive', () => {
    const steps: StepperStep[] = [
      { id: 'a', label: 'A', error: true },
      { id: 'b', label: 'B' },
    ];
    const { container } = render(<Stepper steps={steps} currentIndex={0} />);
    const connector = container.querySelector('[data-stepper-connector]');
    expect(connector).not.toBeNull();
    expect(connector!.className).toContain('bg-destructive');
  });

  it('error=false on a step has no effect (state machine unchanged)', () => {
    const steps: StepperStep[] = [
      { id: 'a', label: 'A', error: false },
      { id: 'b', label: 'B' },
    ];
    const { container } = render(<Stepper steps={steps} currentIndex={0} />);
    const items = container.querySelectorAll('[data-stepper-item]');
    expect(items[0]!.getAttribute('data-state')).toBe('current');
    expect(items[1]!.getAttribute('data-state')).toBe('pending');
  });

  it('error state is omitted from clickable gating like pending (no onClick when error)', () => {
    const onStepClick = vi.fn();
    const steps: StepperStep[] = [
      { id: 'a', label: 'A', error: true },
      { id: 'b', label: 'B' },
    ];
    render(
      <Stepper
        steps={steps}
        currentIndex={1}
        onStepClick={onStepClick}
      />,
    );
    // Error state is NOT in the "disabled" path -- it's a clickable
    // attention surface (the operator must click to retry / dismiss).
    // Confirm the button is enabled.
    const badge = document.querySelector(
      '[data-stepper-item][data-state="error"] [data-stepper-badge]',
    ) as HTMLButtonElement;
    expect(badge).not.toBeNull();
    expect(badge.disabled).toBe(false);
    fireEvent.click(badge);
    expect(onStepClick).toHaveBeenCalledWith(0);
  });

  // -- v1.11.394 progressbar + visible progress (TODO 11.376) -----

  it('renders a role=progressbar element with aria-valuemin/max/now', () => {
    const steps = [
      { id: '1', label: 'A' },
      { id: '2', label: 'B' },
      { id: '3', label: 'C' },
    ];
    render(<Stepper steps={steps} currentIndex={1} />);
    const pb = document.querySelector(
      '[role="progressbar"][data-section="stepper-progressbar"]',
    ) as HTMLElement;
    expect(pb).not.toBeNull();
    expect(pb.getAttribute('aria-valuemin')).toBe('0');
    expect(pb.getAttribute('aria-valuemax')).toBe('3');
    // currentIndex=1 -> one step complete.
    expect(pb.getAttribute('aria-valuenow')).toBe('1');
  });

  it('progressbar aria-valuetext is "Step <current+1> of <total>"', () => {
    const steps = [
      { id: '1', label: 'A' },
      { id: '2', label: 'B' },
      { id: '3', label: 'C' },
    ];
    render(<Stepper steps={steps} currentIndex={1} />);
    const pb = document.querySelector(
      '[data-section="stepper-progressbar"]',
    ) as HTMLElement;
    expect(pb.getAttribute('aria-valuetext')).toBe('Step 2 of 3');
    expect(pb.getAttribute('aria-label')).toBe('Step 2 of 3');
  });

  it('progressbar caps valuenow at total when currentIndex exceeds steps', () => {
    const steps = [
      { id: '1', label: 'A' },
      { id: '2', label: 'B' },
    ];
    render(<Stepper steps={steps} currentIndex={5} />);
    const pb = document.querySelector(
      '[data-section="stepper-progressbar"]',
    ) as HTMLElement;
    // All steps are complete + caption flips to "Wizard complete".
    expect(pb.getAttribute('aria-valuenow')).toBe('2');
    expect(pb.getAttribute('aria-valuetext')).toBe('Wizard complete');
  });

  it('progressbar is suppressed when steps is empty', () => {
    render(<Stepper steps={[]} currentIndex={0} />);
    expect(
      document.querySelector('[data-section="stepper-progressbar"]'),
    ).toBeNull();
  });

  it('progressLabel override replaces the auto caption', () => {
    const steps = [
      { id: '1', label: 'A' },
      { id: '2', label: 'B' },
    ];
    render(
      <Stepper
        steps={steps}
        currentIndex={0}
        progressLabel="Configuring deployment, please wait"
      />,
    );
    const pb = document.querySelector(
      '[data-section="stepper-progressbar"]',
    ) as HTMLElement;
    expect(pb.getAttribute('aria-valuetext')).toBe(
      'Configuring deployment, please wait',
    );
  });

  it('progressLabel=null suppresses the visually-hidden progressbar entirely', () => {
    const steps = [
      { id: '1', label: 'A' },
      { id: '2', label: 'B' },
    ];
    render(
      <Stepper steps={steps} currentIndex={0} progressLabel={null} />,
    );
    expect(
      document.querySelector('[data-section="stepper-progressbar"]'),
    ).toBeNull();
  });

  it('showVisibleProgress=true renders the visible caption above the list', () => {
    const steps = [
      { id: '1', label: 'A' },
      { id: '2', label: 'B' },
      { id: '3', label: 'C' },
    ];
    render(
      <Stepper steps={steps} currentIndex={1} showVisibleProgress />,
    );
    expect(
      document.querySelector('[data-section="stepper-visible-progress"]'),
    ).toHaveTextContent('Step 2 of 3');
  });

  it('default showVisibleProgress=false hides the visible caption', () => {
    const steps = [
      { id: '1', label: 'A' },
      { id: '2', label: 'B' },
    ];
    render(<Stepper steps={steps} currentIndex={0} />);
    expect(
      document.querySelector('[data-section="stepper-visible-progress"]'),
    ).toBeNull();
  });

  it('showVisibleProgress + progressLabel override both feed the caption', () => {
    const steps = [
      { id: '1', label: 'A' },
      { id: '2', label: 'B' },
    ];
    render(
      <Stepper
        steps={steps}
        currentIndex={0}
        progressLabel="Step 1 of 2 (uploading)"
        showVisibleProgress
      />,
    );
    const visible = document.querySelector(
      '[data-section="stepper-visible-progress"]',
    );
    expect(visible).toHaveTextContent('Step 1 of 2 (uploading)');
    const pb = document.querySelector(
      '[data-section="stepper-progressbar"]',
    ) as HTMLElement;
    expect(pb.getAttribute('aria-valuetext')).toBe(
      'Step 1 of 2 (uploading)',
    );
  });

  it('root wrapper carries data-section="stepper-root" + data-orientation', () => {
    const steps = [
      { id: '1', label: 'A' },
      { id: '2', label: 'B' },
    ];
    const { container, rerender } = render(
      <Stepper steps={steps} currentIndex={0} />,
    );
    const root = container.querySelector(
      '[data-section="stepper-root"]',
    ) as HTMLElement;
    expect(root.getAttribute('data-orientation')).toBe('horizontal');
    rerender(
      <Stepper steps={steps} currentIndex={0} orientation="vertical" />,
    );
    expect(
      container
        .querySelector('[data-section="stepper-root"]')!
        .getAttribute('data-orientation'),
    ).toBe('vertical');
  });

  it('progressbar valuenow respects retroactive errors (error rows are NOT complete)', () => {
    const steps = [
      { id: '1', label: 'A' },
      { id: '2', label: 'B', error: true },
      { id: '3', label: 'C' },
    ];
    render(<Stepper steps={steps} currentIndex={2} />);
    const pb = document.querySelector(
      '[data-section="stepper-progressbar"]',
    ) as HTMLElement;
    // currentIndex=2, but step 2 (idx 1) is in error -> only
    // 1 step is "complete" (idx 0). The progressbar should
    // report 1, not 2.
    expect(pb.getAttribute('aria-valuenow')).toBe('1');
  });
});
