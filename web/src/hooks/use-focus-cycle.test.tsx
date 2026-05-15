import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import {
  useFocusCycle,
  type UseFocusCycleOptions,
} from './use-focus-cycle';

interface HarnessProps {
  orientation?: UseFocusCycleOptions['orientation'];
  wrap?: boolean;
  withDisabled?: boolean;
  onSelect?: (el: HTMLElement) => void;
}

function Harness({
  orientation = 'vertical',
  wrap = true,
  withDisabled = false,
  onSelect,
}: HarnessProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { handleKeyDown } = useFocusCycle({
    containerRef,
    orientation,
    wrap,
    onSelect,
  });
  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      data-testid="container"
    >
      <button data-idx="0">one</button>
      <button data-idx="1" disabled={withDisabled}>
        two
      </button>
      <button data-idx="2">three</button>
    </div>
  );
}

describe('useFocusCycle', () => {
  it('ArrowDown moves focus 0 -> 1 -> 2 (vertical)', () => {
    const { getByText, getByTestId } = render(<Harness />);
    const first = getByText('one') as HTMLButtonElement;
    first.focus();
    fireEvent.keyDown(getByTestId('container'), { key: 'ArrowDown' });
    expect(getByText('two')).toHaveFocus();
    fireEvent.keyDown(getByTestId('container'), { key: 'ArrowDown' });
    expect(getByText('three')).toHaveFocus();
  });

  it('ArrowUp moves focus 2 -> 1 -> 0', () => {
    const { getByText, getByTestId } = render(<Harness />);
    const last = getByText('three') as HTMLButtonElement;
    last.focus();
    fireEvent.keyDown(getByTestId('container'), { key: 'ArrowUp' });
    expect(getByText('two')).toHaveFocus();
    fireEvent.keyDown(getByTestId('container'), { key: 'ArrowUp' });
    expect(getByText('one')).toHaveFocus();
  });

  it('wrap=true: ArrowDown from last goes to first', () => {
    const { getByText, getByTestId } = render(<Harness wrap={true} />);
    const last = getByText('three') as HTMLButtonElement;
    last.focus();
    fireEvent.keyDown(getByTestId('container'), { key: 'ArrowDown' });
    expect(getByText('one')).toHaveFocus();
  });

  it('wrap=false: ArrowDown from last stays on last', () => {
    const { getByText, getByTestId } = render(<Harness wrap={false} />);
    const last = getByText('three') as HTMLButtonElement;
    last.focus();
    fireEvent.keyDown(getByTestId('container'), { key: 'ArrowDown' });
    expect(getByText('three')).toHaveFocus();
  });

  it('wrap=false: ArrowUp from first stays on first', () => {
    const { getByText, getByTestId } = render(<Harness wrap={false} />);
    const first = getByText('one') as HTMLButtonElement;
    first.focus();
    fireEvent.keyDown(getByTestId('container'), { key: 'ArrowUp' });
    expect(getByText('one')).toHaveFocus();
  });

  it('Home / End jump to first / last', () => {
    const { getByText, getByTestId } = render(<Harness />);
    const second = getByText('two') as HTMLButtonElement;
    second.focus();
    fireEvent.keyDown(getByTestId('container'), { key: 'End' });
    expect(getByText('three')).toHaveFocus();
    fireEvent.keyDown(getByTestId('container'), { key: 'Home' });
    expect(getByText('one')).toHaveFocus();
  });

  it('Skips disabled items', () => {
    const { getByText, getByTestId } = render(<Harness withDisabled />);
    const first = getByText('one') as HTMLButtonElement;
    first.focus();
    fireEvent.keyDown(getByTestId('container'), { key: 'ArrowDown' });
    // disabled "two" is filtered out -> jumps to "three"
    expect(getByText('three')).toHaveFocus();
  });

  it("orientation='horizontal' responds to ArrowLeft/Right", () => {
    const { getByText, getByTestId } = render(
      <Harness orientation="horizontal" />,
    );
    const first = getByText('one') as HTMLButtonElement;
    first.focus();
    fireEvent.keyDown(getByTestId('container'), { key: 'ArrowRight' });
    expect(getByText('two')).toHaveFocus();
    fireEvent.keyDown(getByTestId('container'), { key: 'ArrowLeft' });
    expect(getByText('one')).toHaveFocus();
    // vertical keys should NOT move focus
    fireEvent.keyDown(getByTestId('container'), { key: 'ArrowDown' });
    expect(getByText('one')).toHaveFocus();
  });

  it("orientation='both' responds to all 4 arrow keys", () => {
    const { getByText, getByTestId } = render(
      <Harness orientation="both" />,
    );
    const first = getByText('one') as HTMLButtonElement;
    first.focus();
    fireEvent.keyDown(getByTestId('container'), { key: 'ArrowRight' });
    expect(getByText('two')).toHaveFocus();
    fireEvent.keyDown(getByTestId('container'), { key: 'ArrowDown' });
    expect(getByText('three')).toHaveFocus();
    fireEvent.keyDown(getByTestId('container'), { key: 'ArrowLeft' });
    expect(getByText('two')).toHaveFocus();
    fireEvent.keyDown(getByTestId('container'), { key: 'ArrowUp' });
    expect(getByText('one')).toHaveFocus();
  });

  it('onSelect fires with focused element', () => {
    const onSelect = vi.fn();
    const { getByText, getByTestId } = render(<Harness onSelect={onSelect} />);
    const first = getByText('one') as HTMLButtonElement;
    first.focus();
    fireEvent.keyDown(getByTestId('container'), { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(getByText('two'));
  });

  it('Tab is passthrough (no preventDefault, no focus change)', () => {
    const { getByText, getByTestId } = render(<Harness />);
    const first = getByText('one') as HTMLButtonElement;
    first.focus();
    fireEvent.keyDown(getByTestId('container'), { key: 'Tab' });
    expect(getByText('one')).toHaveFocus();
  });
});
