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
});
