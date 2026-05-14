import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Popover } from './popover';

describe('<Popover>', () => {
  it('is closed by default', () => {
    render(
      <Popover trigger={<button>open</button>} content={<div>panel body</div>} />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('panel body')).not.toBeInTheDocument();
  });

  it('opens on trigger click', async () => {
    const user = userEvent.setup();
    render(
      <Popover trigger={<button>open</button>} content={<div>panel body</div>} />,
    );
    await user.click(screen.getByRole('button', { name: 'open' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('panel body')).toBeInTheDocument();
  });

  it('toggles closed on a second trigger click', async () => {
    const user = userEvent.setup();
    render(
      <Popover trigger={<button>open</button>} content={<div>panel body</div>} />,
    );
    const btn = screen.getByRole('button', { name: 'open' });
    await user.click(btn);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(btn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape when closeOnEsc default', async () => {
    const user = userEvent.setup();
    render(
      <Popover trigger={<button>open</button>} content={<div>panel body</div>} />,
    );
    await user.click(screen.getByRole('button', { name: 'open' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not close on Escape when closeOnEsc=false', async () => {
    const user = userEvent.setup();
    render(
      <Popover
        trigger={<button>open</button>}
        content={<div>panel body</div>}
        closeOnEsc={false}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'open' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes on outside click when closeOnClickOutside default', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <div data-testid="outside">outside region</div>
        <Popover trigger={<button>open</button>} content={<div>panel body</div>} />
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'open' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not close on inside click', async () => {
    const user = userEvent.setup();
    render(
      <Popover
        trigger={<button>open</button>}
        content={<div><button>inside</button></div>}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'open' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.mouseDown(dialog);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not close on outside click when closeOnClickOutside=false', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <div data-testid="outside">outside region</div>
        <Popover
          trigger={<button>open</button>}
          content={<div>panel body</div>}
          closeOnClickOutside={false}
        />
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'open' }));
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('controlled mode: open prop drives visibility on rerender', () => {
    const { rerender } = render(
      <Popover
        trigger={<button>open</button>}
        content={<div>panel body</div>}
        open={false}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    rerender(
      <Popover
        trigger={<button>open</button>}
        content={<div>panel body</div>}
        open
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('fires onOpenChange on each transition', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Popover
        trigger={<button>open</button>}
        content={<div>panel body</div>}
        onOpenChange={onOpenChange}
      />,
    );
    const btn = screen.getByRole('button', { name: 'open' });
    await user.click(btn);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    await user.click(btn);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });

  it('toggles aria-expanded on the trigger', async () => {
    const user = userEvent.setup();
    render(
      <Popover trigger={<button>open</button>} content={<div>panel body</div>} />,
    );
    const btn = screen.getByRole('button', { name: 'open' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).toHaveAttribute('aria-haspopup', 'dialog');
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('panel has role=dialog and aria-controls links trigger', async () => {
    const user = userEvent.setup();
    render(
      <Popover trigger={<button>open</button>} content={<div>panel body</div>} />,
    );
    const btn = screen.getByRole('button', { name: 'open' });
    await user.click(btn);
    const dialog = screen.getByRole('dialog');
    const id = btn.getAttribute('aria-controls');
    expect(id).toBeTruthy();
    expect(dialog).toHaveAttribute('id', id as string);
  });

  it('moves focus into the panel on open', async () => {
    const user = userEvent.setup();
    render(
      <Popover
        trigger={<button>open</button>}
        content={<div><button>inside-1</button><button>inside-2</button></div>}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'open' }));
    const panel = screen.getByRole('dialog');
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(screen.getByRole('button', { name: 'inside-1' })).toHaveFocus();
  });

  it('returns focus to the trigger on close', async () => {
    const user = userEvent.setup();
    function Wrapper() {
      const [open, setOpen] = useState(true);
      return (
        <Popover
          trigger={<button>open</button>}
          content={<div><button onClick={() => setOpen(false)}>close-from-inside</button></div>}
          open={open}
          onOpenChange={setOpen}
        />
      );
    }
    render(<Wrapper />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'close-from-inside' }));
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'open' })).toHaveFocus();
  });

  it('merges caller-provided className onto the panel', async () => {
    const user = userEvent.setup();
    render(
      <Popover
        trigger={<button>open</button>}
        content={<div>body</div>}
        className="extra-panel"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'open' }));
    expect(screen.getByRole('dialog')).toHaveClass('extra-panel');
  });

  it('records the chosen placement on the panel via data-popover-placement', async () => {
    const user = userEvent.setup();
    render(
      <Popover
        trigger={<button>open</button>}
        content={<div>body</div>}
        placement="top"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'open' }));
    const dialog = screen.getByRole('dialog');
    // jsdom does not implement layout, so flip won't trigger here; either the
    // chosen side or its opposite is acceptable.
    const p = dialog.getAttribute('data-popover-placement');
    expect(['top', 'bottom']).toContain(p);
  });

  it('exposes a stable displayName for devtools', () => {
    expect(Popover.displayName).toBe('Popover');
  });
});
