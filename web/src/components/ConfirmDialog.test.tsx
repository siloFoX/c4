import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import { ConfirmDialog } from './ConfirmDialog';

// ConfirmDialog is a shared confirm overlay for destructive actions.
// Internal state machine is split across two layers: the JSX itself
// (open=false null-return, destructive vs default styling, optional
// preview block, busy-disabled buttons) and the useDialogA11y hook
// (Escape-to-close + focus restore + dialog focus on open). The hook
// owns its own unit test, so here we drive the visible surface
// directly: prop-union rendering, callback wiring on Confirm / Cancel
// / Close (X) / backdrop, the busy gate, the preview slot, and the
// locale-flip re-render of the default labels.

beforeEach(() => {
  setLocale('en');
});

function renderDialog(
  overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {},
) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const props = {
    open: true,
    title: 'Delete worker?',
    onConfirm,
    onCancel,
    ...overrides,
  };
  const utils = render(<ConfirmDialog {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onConfirm, onCancel, props };
}

describe('<ConfirmDialog>', () => {
  // ---- open=false null return ------------------------------------

  it('renders nothing when open=false', () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        title="hidden"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('does not render the dialog when open=false', () => {
    render(
      <ConfirmDialog
        open={false}
        title="hidden"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // ---- dialog scaffolding ----------------------------------------

  it('renders a single dialog with role=dialog and aria-modal=true', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('exposes the title as the dialog aria-label', () => {
    renderDialog({ title: 'Drop branch?' });
    expect(
      screen.getByRole('dialog', { name: 'Drop branch?' }),
    ).toBeInTheDocument();
  });

  it('renders the title text as a heading', () => {
    renderDialog({ title: 'Delete worker?' });
    expect(
      screen.getByRole('heading', { name: 'Delete worker?' }),
    ).toBeInTheDocument();
  });

  it('makes the dialog programmatically focusable via tabIndex=-1', () => {
    renderDialog();
    expect(screen.getByRole('dialog')).toHaveAttribute('tabindex', '-1');
  });

  // ---- description / preview optional slots ----------------------

  it('renders the description paragraph when provided', () => {
    renderDialog({ description: 'This will drop the worktree.' });
    expect(
      screen.getByText('This will drop the worktree.'),
    ).toBeInTheDocument();
  });

  it('does NOT render any description copy when description prop is omitted', () => {
    const { container } = renderDialog();
    expect(container.querySelector('p')).toBeNull();
  });

  it('renders the preview block + the localized "Preview" label when preview is provided', () => {
    renderDialog({ preview: <span data-testid="preview-content">branch-a · branch-b</span> });
    expect(screen.getByText('Preview')).toBeInTheDocument();
    expect(screen.getByTestId('preview-content')).toHaveTextContent(
      'branch-a · branch-b',
    );
  });

  it('does NOT render the Preview label when preview prop is omitted', () => {
    renderDialog();
    expect(screen.queryByText('Preview')).not.toBeInTheDocument();
  });

  it('accepts ReactNode preview content (not just strings)', () => {
    renderDialog({
      preview: (
        <ul>
          <li>worker-1</li>
          <li>worker-2</li>
        </ul>
      ),
    });
    expect(screen.getByText('worker-1')).toBeInTheDocument();
    expect(screen.getByText('worker-2')).toBeInTheDocument();
  });

  // ---- destructive variant --------------------------------------

  it('applies the destructive border class on the dialog when destructive=true (the default)', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toMatch(/border-destructive/);
  });

  it('renders the AlertTriangle warning icon as aria-hidden when destructive=true', () => {
    const { container } = renderDialog();
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('does NOT apply the destructive border class on the dialog when destructive=false', () => {
    renderDialog({ destructive: false });
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).not.toMatch(/border-destructive\//);
  });

  it('does NOT render the AlertTriangle icon when destructive=false', () => {
    const { container } = renderDialog({ destructive: false });
    const svgs = container.querySelectorAll('svg');
    // Only the X close icon remains.
    expect(svgs.length).toBe(1);
  });

  it('uses the destructive button variant on the confirm button when destructive=true', () => {
    renderDialog();
    expect(
      screen.getByRole('button', { name: 'Confirm' }).className,
    ).toMatch(/bg-destructive/);
  });

  it('uses the default button variant on the confirm button when destructive=false', () => {
    renderDialog({ destructive: false });
    expect(
      screen.getByRole('button', { name: 'Confirm' }).className,
    ).toMatch(/bg-primary/);
  });

  // ---- default + override labels --------------------------------

  it('renders the localized default Confirm + Cancel labels when no override is given', () => {
    renderDialog();
    expect(
      screen.getByRole('button', { name: 'Confirm' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cancel' }),
    ).toBeInTheDocument();
  });

  it('renders the override confirmLabel when provided', () => {
    renderDialog({ confirmLabel: 'Drop branch' });
    expect(
      screen.getByRole('button', { name: 'Drop branch' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Confirm' }),
    ).not.toBeInTheDocument();
  });

  it('renders the override cancelLabel when provided', () => {
    renderDialog({ cancelLabel: 'Keep' });
    expect(
      screen.getByRole('button', { name: 'Keep' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument();
  });

  it('renders the localized Close (X) button', () => {
    renderDialog();
    expect(
      screen.getByRole('button', { name: 'Close' }),
    ).toBeInTheDocument();
  });

  // ---- callback wiring ------------------------------------------

  it('fires onConfirm exactly once when the Confirm button is clicked', async () => {
    const { user, onConfirm } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('fires onCancel exactly once when the Cancel button is clicked', async () => {
    const { user, onCancel } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('fires onCancel when the Close (X) header button is clicked', async () => {
    const { user, onCancel } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('fires onCancel when the backdrop is clicked while not busy', async () => {
    const { user, onCancel, container } = renderDialog();
    const backdrop = container.firstChild as HTMLElement;
    await user.click(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onCancel when the inner card is clicked (stopPropagation)', async () => {
    const { user, onCancel } = renderDialog();
    await user.click(screen.getByRole('dialog'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('does NOT fire any callback on initial render', () => {
    const { onConfirm, onCancel } = renderDialog();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  // ---- keyboard --------------------------------------------------

  it('fires onCancel when Escape is pressed while open', async () => {
    const { user, onCancel } = renderDialog();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onCancel on Escape when busy=true', async () => {
    const { user, onCancel } = renderDialog({ busy: true });
    await user.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('moves focus onto the dialog itself on mount', () => {
    renderDialog();
    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  // ---- busy gate -------------------------------------------------

  it('disables Confirm + Cancel + Close buttons when busy=true', () => {
    renderDialog({ busy: true });
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
  });

  it('does NOT fire onCancel on backdrop click when busy=true', async () => {
    const { user, onCancel, container } = renderDialog({ busy: true });
    const backdrop = container.firstChild as HTMLElement;
    await user.click(backdrop);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('does NOT fire onConfirm when the disabled Confirm button is clicked while busy', async () => {
    const { user, onConfirm } = renderDialog({ busy: true });
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // ---- rerender stability ---------------------------------------

  it('rerendering with the same props does not duplicate the dialog', () => {
    const { rerender, props } = renderDialog();
    rerender(<ConfirmDialog {...props} />);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('rerendering from open=true to open=false drops the dialog entirely', () => {
    const { rerender, props, container } = renderDialog();
    expect(container.firstChild).not.toBeNull();
    rerender(<ConfirmDialog {...props} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('rerendering with a new title updates the dialog aria-label and heading', () => {
    const { rerender, props } = renderDialog({ title: 'first' });
    expect(
      screen.getByRole('dialog', { name: 'first' }),
    ).toBeInTheDocument();
    rerender(<ConfirmDialog {...props} title="second" />);
    expect(
      screen.queryByRole('dialog', { name: 'first' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'second' }),
    ).toBeInTheDocument();
  });

  // ---- locale flip ----------------------------------------------

  it('re-renders the default Confirm label in Korean when the locale flips to ko', () => {
    renderDialog();
    expect(
      screen.getByRole('button', { name: 'Confirm' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: 'Confirm' }),
    ).not.toBeInTheDocument();
  });

  it('re-renders the default Cancel label in Korean when the locale flips to ko', () => {
    renderDialog();
    expect(
      screen.getByRole('button', { name: 'Cancel' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument();
  });

  it('re-renders the Preview label in Korean when the locale flips to ko', () => {
    renderDialog({ preview: <span>x</span> });
    expect(screen.getByText('Preview')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Preview')).not.toBeInTheDocument();
  });

  it('keeps the override confirmLabel through a locale flip (consumer-supplied, not localized)', () => {
    renderDialog({ confirmLabel: 'Drop branch' });
    expect(
      screen.getByRole('button', { name: 'Drop branch' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.getByRole('button', { name: 'Drop branch' }),
    ).toBeInTheDocument();
  });

  // ---- 11.242 initialFocus prop --------------------------------

  it('exposes a data-confirm-dialog-cancel hook on the Cancel button', () => {
    renderDialog();
    expect(
      document.querySelector('[data-confirm-dialog-cancel]'),
    ).not.toBeNull();
  });

  it('exposes a data-confirm-dialog-confirm hook on the Confirm button', () => {
    renderDialog();
    expect(
      document.querySelector('[data-confirm-dialog-confirm]'),
    ).not.toBeNull();
  });

  it('initialFocus="cancel" focuses the Cancel button after open', async () => {
    renderDialog({ initialFocus: 'cancel' });
    const cancel = document.querySelector(
      '[data-confirm-dialog-cancel]',
    ) as HTMLButtonElement;
    expect(cancel).not.toBeNull();
    // The focus runs in a setTimeout(0); flush the macrotask queue.
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(document.activeElement).toBe(cancel);
  });

  it('initialFocus="confirm" focuses the Confirm button after open', async () => {
    renderDialog({ initialFocus: 'confirm' });
    const confirm = document.querySelector(
      '[data-confirm-dialog-confirm]',
    ) as HTMLButtonElement;
    expect(confirm).not.toBeNull();
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(document.activeElement).toBe(confirm);
  });

  it('initialFocus default leaves focus on the dialog container (back-compat)', async () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(document.activeElement).toBe(dialog);
  });
});
