import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from './dialog';

describe('<Dialog>', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <Dialog open={false} onClose={vi.fn()} title="hidden">
        <button>inner</button>
      </Dialog>,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('mounts into document.body via a portal when open=true', () => {
    const { container } = render(
      <Dialog open onClose={vi.fn()} title="hello">
        <button>inner</button>
      </Dialog>,
    );
    // Portal escapes the test container.
    expect(container.firstChild).toBeNull();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(document.body.contains(dialog)).toBe(true);
  });

  it('exposes role=dialog with aria-modal=true', () => {
    render(
      <Dialog open onClose={vi.fn()} title="t">
        <button>x</button>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('wires aria-labelledby to a title element carrying the title text', () => {
    render(
      <Dialog open onClose={vi.fn()} title="Delete worker">
        <button>x</button>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    const labelEl = document.getElementById(labelId as string);
    expect(labelEl).not.toBeNull();
    expect(labelEl).toHaveTextContent('Delete worker');
  });

  it('omits aria-labelledby when no title is provided', () => {
    render(
      <Dialog open onClose={vi.fn()}>
        <button>x</button>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveAttribute('aria-labelledby');
  });

  it('renders children and footer slots', () => {
    render(
      <Dialog
        open
        onClose={vi.fn()}
        title="t"
        footer={<button>Save</button>}
      >
        <p>body copy</p>
      </Dialog>,
    );
    expect(screen.getByText('body copy')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save' }),
    ).toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialog open onClose={onClose} title="t">
        <button>inner</button>
      </Dialog>,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialog open onClose={onClose} title="t">
        <button>inner</button>
      </Dialog>,
    );
    const backdrop = document.querySelector(
      '[data-dialog-backdrop]',
    ) as HTMLElement;
    expect(backdrop).not.toBeNull();
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when the inner card is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialog open onClose={onClose} title="t">
        <button>inner</button>
      </Dialog>,
    );
    await user.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('moves initial focus onto the first focusable inside the card', () => {
    render(
      <Dialog open onClose={vi.fn()} title="t">
        <button>first</button>
        <button>second</button>
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
  });

  it('focuses the card itself when no focusables exist inside', () => {
    render(
      <Dialog open onClose={vi.fn()} title="t">
        <p>nothing-focusable</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('traps Tab from the last focusable back to the first', () => {
    render(
      <Dialog open onClose={vi.fn()} title="t">
        <button>first</button>
        <button>middle</button>
        <button>last</button>
      </Dialog>,
    );
    const first = screen.getByRole('button', { name: 'first' });
    const last = screen.getByRole('button', { name: 'last' });
    last.focus();
    expect(last).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(first).toHaveFocus();
  });

  it('traps Shift+Tab from the first focusable back to the last', () => {
    render(
      <Dialog open onClose={vi.fn()} title="t">
        <button>first</button>
        <button>middle</button>
        <button>last</button>
      </Dialog>,
    );
    const first = screen.getByRole('button', { name: 'first' });
    const last = screen.getByRole('button', { name: 'last' });
    first.focus();
    expect(first).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('unmounts the dialog when open flips from true to false', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Dialog open onClose={onClose} title="t">
        <button>x</button>
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    rerender(
      <Dialog open={false} onClose={onClose} title="t">
        <button>x</button>
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('merges caller-provided className onto the card', () => {
    render(
      <Dialog open onClose={vi.fn()} title="t" className="extra-card">
        <button>x</button>
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toHaveClass('extra-card');
  });

  it('exposes a stable displayName for devtools', () => {
    expect(Dialog.displayName).toBe('Dialog');
  });
});
