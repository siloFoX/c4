import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UndoToast } from './undo-toast';
import type { ActiveUndo } from '../../hooks/use-undo-toast';

function makeActive(over: Partial<ActiveUndo> = {}): ActiveUndo {
  return {
    message: 'Cleared 3 items',
    durationMs: 5000,
    remainingMs: 2500,
    progress: 0.5,
    undo: vi.fn(),
    dismiss: vi.fn(),
    ...over,
  };
}

describe('<UndoToast>', () => {
  it('renders the message verbatim', () => {
    render(<UndoToast active={makeActive({ message: 'Cleared 7 things' })} />);
    expect(screen.getByText('Cleared 7 things')).toBeInTheDocument();
  });

  it('marks the root with role=status + aria-live=polite for screen readers', () => {
    render(<UndoToast active={makeActive()} />);
    const root = document.querySelector('[data-section="undo-toast"]')!;
    expect(root.getAttribute('role')).toBe('status');
    expect(root.getAttribute('aria-live')).toBe('polite');
  });

  it('renders an Undo button that fires active.undo() on click', async () => {
    const undo = vi.fn();
    const active = makeActive({ undo });
    const user = userEvent.setup();
    render(<UndoToast active={active} />);
    await user.click(screen.getByTestId('undo-toast-action'));
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('renders a dismiss button that fires active.dismiss() on click', async () => {
    const dismiss = vi.fn();
    const active = makeActive({ dismiss });
    const user = userEvent.setup();
    render(<UndoToast active={active} />);
    await user.click(screen.getByTestId('undo-toast-dismiss'));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('renders a progress bar with the remaining percent (1 - progress)', () => {
    render(<UndoToast active={makeActive({ progress: 0.25 })} />);
    const bar = screen.getByTestId('undo-toast-progress');
    expect(bar.getAttribute('role')).toBe('progressbar');
    // 25% elapsed -> 75% remaining
    expect(bar.getAttribute('aria-valuenow')).toBe('75');
  });

  it('progress 0 -> 100% remaining (just shown)', () => {
    render(<UndoToast active={makeActive({ progress: 0 })} />);
    expect(
      screen.getByTestId('undo-toast-progress').getAttribute('aria-valuenow'),
    ).toBe('100');
  });

  it('progress 1 -> 0% remaining (about to commit)', () => {
    render(<UndoToast active={makeActive({ progress: 1 })} />);
    expect(
      screen.getByTestId('undo-toast-progress').getAttribute('aria-valuenow'),
    ).toBe('0');
  });

  it('progress bar inner fill width tracks the remaining percent', () => {
    render(<UndoToast active={makeActive({ progress: 0.4 })} />);
    const inner = screen.getByTestId('undo-toast-progress')
      .firstElementChild as HTMLElement;
    expect(inner.style.width).toBe('60%');
  });

  it('passes through arbitrary HTML attributes (data-testid, className)', () => {
    render(
      <UndoToast
        active={makeActive()}
        data-testid="my-undo"
        className="custom"
      />,
    );
    const root = screen.getByTestId('my-undo');
    expect(root.className).toContain('custom');
    expect(root.className).toContain('fixed');
  });

  it('accepts custom labels for Undo + Dismiss', () => {
    render(
      <UndoToast
        active={makeActive()}
        undoLabel="Restore"
        dismissLabel="Close"
      />,
    );
    expect(
      screen.getByTestId('undo-toast-action').textContent,
    ).toContain('Restore');
    expect(
      screen.getByTestId('undo-toast-dismiss').getAttribute('aria-label'),
    ).toBe('Close');
  });
});
