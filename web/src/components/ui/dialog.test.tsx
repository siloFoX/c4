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

  // (v1.11.302, TODO 11.284) Variant + description + body
  // scroll lock + backdrop opt-out + data-section selectors.

  it('default variant uses the border-border class', () => {
    render(
      <Dialog open onClose={vi.fn()} title="t">
        <button>x</button>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('border-border');
    expect(dialog.getAttribute('data-variant')).toBe('default');
  });

  it('variant="destructive" swaps in the destructive border + alert icon', () => {
    render(
      <Dialog open onClose={vi.fn()} title="Delete" variant="destructive">
        <button>x</button>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('border-destructive/40');
    expect(dialog.getAttribute('data-variant')).toBe('destructive');
    // AlertTriangle icon should be rendered (lucide-react svg).
    expect(dialog.querySelector('svg')).not.toBeNull();
  });

  it('variant="confirmation" swaps in the warning border + helpcircle icon', () => {
    render(
      <Dialog open onClose={vi.fn()} title="Confirm" variant="confirmation">
        <button>x</button>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('border-warning/40');
    expect(dialog.getAttribute('data-variant')).toBe('confirmation');
  });

  it('icon=false suppresses the auto-icon on destructive variant', () => {
    render(
      <Dialog
        open
        onClose={vi.fn()}
        title="Delete"
        variant="destructive"
        icon={false}
      >
        <button>x</button>
      </Dialog>,
    );
    expect(screen.getByRole('dialog').querySelector('svg')).toBeNull();
  });

  it('description prop renders as aria-describedby paragraph', () => {
    render(
      <Dialog
        open
        onClose={vi.fn()}
        title="Title"
        description="Body context paragraph."
      >
        <button>x</button>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const descEl = document.getElementById(describedBy as string);
    expect(descEl).not.toBeNull();
    expect(descEl).toHaveTextContent('Body context paragraph.');
  });

  it('body scroll lock toggles document.body.style.overflow', () => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = ''; // baseline
    const { rerender } = render(
      <Dialog open onClose={vi.fn()} title="t">
        <button>x</button>
      </Dialog>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    rerender(
      <Dialog open={false} onClose={vi.fn()} title="t">
        <button>x</button>
      </Dialog>,
    );
    expect(document.body.style.overflow).toBe('');
    document.body.style.overflow = prev;
  });

  it('lockBodyScroll=false leaves body overflow untouched', () => {
    const before = document.body.style.overflow;
    render(
      <Dialog
        open
        onClose={vi.fn()}
        title="t"
        lockBodyScroll={false}
      >
        <button>x</button>
      </Dialog>,
    );
    expect(document.body.style.overflow).toBe(before);
  });

  it('closeOnBackdropClick=false ignores backdrop clicks', () => {
    const onClose = vi.fn();
    render(
      <Dialog
        open
        onClose={onClose}
        title="t"
        closeOnBackdropClick={false}
      >
        <button>x</button>
      </Dialog>,
    );
    const backdrop = document.querySelector(
      '[data-section="dialog-backdrop"]',
    ) as HTMLElement;
    backdrop.click();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closeOnBackdropClick (default true) dismisses on backdrop click', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="t">
        <button>x</button>
      </Dialog>,
    );
    const backdrop = document.querySelector(
      '[data-section="dialog-backdrop"]',
    ) as HTMLElement;
    backdrop.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('exposes data-section="dialog" on the panel + "dialog-backdrop" on the scrim', () => {
    render(
      <Dialog open onClose={vi.fn()} title="t">
        <button>x</button>
      </Dialog>,
    );
    expect(
      document.querySelector('[data-section="dialog"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section="dialog-backdrop"]'),
    ).not.toBeNull();
  });

  it('exposes data-section="dialog-body" on the children wrapper + "dialog-footer" on the footer', () => {
    render(
      <Dialog
        open
        onClose={vi.fn()}
        title="t"
        footer={<button>OK</button>}
      >
        <span>body</span>
      </Dialog>,
    );
    expect(
      document.querySelector('[data-section="dialog-body"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section="dialog-footer"]'),
    ).not.toBeNull();
  });
});
