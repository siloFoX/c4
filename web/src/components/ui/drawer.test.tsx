import { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Drawer } from './drawer';

describe('<Drawer>', () => {
  it('renders nothing when open=false', () => {
    render(
      <Drawer open={false} onOpenChange={vi.fn()}>
        <button>inner</button>
      </Drawer>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a dialog when open=true', () => {
    render(
      <Drawer open onOpenChange={vi.fn()}>
        <button>inner</button>
      </Drawer>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(document.body.contains(dialog)).toBe(true);
  });

  it('exposes role=dialog with aria-modal=true', () => {
    render(
      <Drawer open onOpenChange={vi.fn()}>
        <button>x</button>
      </Drawer>,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('side=right default anchors to the right edge', () => {
    render(
      <Drawer open onOpenChange={vi.fn()}>
        <button>x</button>
      </Drawer>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('data-drawer-side', 'right');
    expect(dialog.className).toMatch(/right-0/);
  });

  it('side=left anchors to the left edge', () => {
    render(
      <Drawer open onOpenChange={vi.fn()} side="left">
        <button>x</button>
      </Drawer>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('data-drawer-side', 'left');
    expect(dialog.className).toMatch(/left-0/);
  });

  it('renders title as an h2 linked via aria-labelledby', () => {
    render(
      <Drawer open onOpenChange={vi.fn()} title="Filters">
        <button>x</button>
      </Drawer>,
    );
    const dialog = screen.getByRole('dialog');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    const labelEl = document.getElementById(labelId as string);
    expect(labelEl?.tagName).toBe('H2');
    expect(labelEl).toHaveTextContent('Filters');
  });

  it('renders description linked via aria-describedby', () => {
    render(
      <Drawer open onOpenChange={vi.fn()} description="subtitle">
        <button>x</button>
      </Drawer>,
    );
    const dialog = screen.getByRole('dialog');
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const el = document.getElementById(describedBy as string);
    expect(el).toHaveTextContent('subtitle');
  });

  it('close button calls onOpenChange(false)', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Drawer open onOpenChange={onOpenChange} title="t">
        <button>inner</button>
      </Drawer>,
    );
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('showCloseButton=false hides the X button', () => {
    render(
      <Drawer open onOpenChange={vi.fn()} title="t" showCloseButton={false}>
        <button>inner</button>
      </Drawer>,
    );
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('backdrop click calls onOpenChange(false) by default', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Drawer open onOpenChange={onOpenChange}>
        <button>inner</button>
      </Drawer>,
    );
    const backdrop = document.querySelector('[data-drawer-backdrop]') as HTMLElement;
    await user.click(backdrop);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('backdrop click does NOT close when closeOnBackdropClick=false', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Drawer open onOpenChange={onOpenChange} closeOnBackdropClick={false}>
        <button>inner</button>
      </Drawer>,
    );
    const backdrop = document.querySelector('[data-drawer-backdrop]') as HTMLElement;
    await user.click(backdrop);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('Escape calls onOpenChange(false) by default', () => {
    const onOpenChange = vi.fn();
    render(
      <Drawer open onOpenChange={onOpenChange}>
        <button>inner</button>
      </Drawer>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('Escape does NOT close when closeOnEsc=false', () => {
    const onOpenChange = vi.fn();
    render(
      <Drawer open onOpenChange={onOpenChange} closeOnEsc={false}>
        <button>inner</button>
      </Drawer>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('moves focus into the panel on open', () => {
    render(
      <Drawer open onOpenChange={vi.fn()} title="t" showCloseButton={false}>
        <button>first</button>
        <button>second</button>
      </Drawer>,
    );
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
  });

  it('restores focus to the previously focused element on close', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'trigger';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { rerender } = render(
      <Drawer open onOpenChange={vi.fn()} title="t">
        <button>inner</button>
      </Drawer>,
    );
    rerender(
      <Drawer open={false} onOpenChange={vi.fn()} title="t">
        <button>inner</button>
      </Drawer>,
    );
    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });

  it('width prop applies inline style on the panel', () => {
    render(
      <Drawer open onOpenChange={vi.fn()} width={480}>
        <button>x</button>
      </Drawer>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.width).toBe('480px');
  });

  it('merges className onto the panel', () => {
    render(
      <Drawer open onOpenChange={vi.fn()} className="extra-panel">
        <button>x</button>
      </Drawer>,
    );
    expect(screen.getByRole('dialog')).toHaveClass('extra-panel');
  });

  it('forwardRef points to the panel element', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <Drawer open onOpenChange={vi.fn()} ref={ref}>
        <button>x</button>
      </Drawer>,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current).toBe(screen.getByRole('dialog'));
  });

  it('exposes a stable displayName for devtools', () => {
    expect(Drawer.displayName).toBe('Drawer');
  });

  // (v1.11.297, TODO 11.279) New top / bottom sides + height
  // prop + reduced-motion gate + data-section selectors.

  it('side="top" anchors to the top edge with the matching border', () => {
    render(
      <Drawer open onOpenChange={vi.fn()} side="top">
        <button>x</button>
      </Drawer>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('data-drawer-side', 'top');
    expect(dialog.className).toMatch(/top-0/);
    expect(dialog.className).toMatch(/border-b/);
  });

  it('side="bottom" anchors to the bottom edge with the matching border', () => {
    render(
      <Drawer open onOpenChange={vi.fn()} side="bottom">
        <button>x</button>
      </Drawer>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('data-drawer-side', 'bottom');
    expect(dialog.className).toMatch(/bottom-0/);
    expect(dialog.className).toMatch(/border-t/);
  });

  it('top/bottom drawers use the height prop (number => px)', () => {
    render(
      <Drawer open onOpenChange={vi.fn()} side="top" height={240}>
        <button>x</button>
      </Drawer>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.height).toBe('240px');
  });

  it('top/bottom drawers use the height prop (string passes through)', () => {
    render(
      <Drawer open onOpenChange={vi.fn()} side="bottom" height="40vh">
        <button>x</button>
      </Drawer>,
    );
    expect(screen.getByRole('dialog').style.height).toBe('40vh');
  });

  it('top/bottom drawers default to height 50% when height is omitted', () => {
    render(
      <Drawer open onOpenChange={vi.fn()} side="top">
        <button>x</button>
      </Drawer>,
    );
    expect(screen.getByRole('dialog').style.height).toBe('50%');
  });

  it('left/right drawers ignore the height prop entirely', () => {
    render(
      <Drawer open onOpenChange={vi.fn()} side="left" height={500} width={300}>
        <button>x</button>
      </Drawer>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.height).toBe('');
    expect(dialog.style.width).toBe('300px');
  });

  it('exposes data-section="drawer" + data-section="drawer-backdrop"', () => {
    render(
      <Drawer open onOpenChange={vi.fn()}>
        <button>x</button>
      </Drawer>,
    );
    expect(
      document.querySelector('[data-section="drawer-backdrop"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section="drawer"]'),
    ).not.toBeNull();
  });

  it('data-reduced-motion is "false" when prefers-reduced-motion is allowed', () => {
    render(
      <Drawer open onOpenChange={vi.fn()}>
        <button>x</button>
      </Drawer>,
    );
    expect(
      screen.getByRole('dialog').getAttribute('data-reduced-motion'),
    ).toBe('false');
  });

  it('drops the transition-transform class when reduced motion is set', () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((q: string) => ({
        matches: true,
        media: q,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        onchange: null,
        dispatchEvent: vi.fn(),
      })),
    });
    try {
      render(
        <Drawer open onOpenChange={vi.fn()}>
          <button>x</button>
        </Drawer>,
      );
      const dialog = screen.getByRole('dialog');
      expect(dialog).not.toHaveClass('transition-transform');
      expect(dialog.getAttribute('data-reduced-motion')).toBe('true');
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });

  it('drops the backdrop fade-in class when reduced motion is set', () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((q: string) => ({
        matches: true,
        media: q,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        onchange: null,
        dispatchEvent: vi.fn(),
      })),
    });
    try {
      render(
        <Drawer open onOpenChange={vi.fn()}>
          <button>x</button>
        </Drawer>,
      );
      const backdrop = document.querySelector(
        '[data-section="drawer-backdrop"]',
      ) as HTMLElement;
      expect(backdrop).not.toHaveClass('animate-in');
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });
});
