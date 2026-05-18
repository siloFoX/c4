import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sheet } from './sheet';

describe('<Sheet>', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <Sheet open={false} onOpenChange={vi.fn()}>
        <div>body</div>
      </Sheet>,
    );
    expect(container.querySelector('[data-section="drawer"]')).toBeNull();
  });

  it('renders the body when open=true', () => {
    render(
      <Sheet open onOpenChange={vi.fn()}>
        <div data-testid="sheet-body">body</div>
      </Sheet>,
    );
    expect(screen.getByTestId('sheet-body')).toBeInTheDocument();
    expect(
      document.querySelector('[data-section="drawer"]'),
    ).not.toBeNull();
  });

  it('defaults side="right"', () => {
    render(
      <Sheet open onOpenChange={vi.fn()}>
        <div>body</div>
      </Sheet>,
    );
    const panel = document.querySelector('[data-section="drawer"]');
    expect(panel?.getAttribute('data-drawer-side')).toBe('right');
  });

  it('forwards side="left" / "top" / "bottom" to the underlying drawer', () => {
    const sides = ['left', 'right', 'top', 'bottom'] as const;
    for (const s of sides) {
      const { unmount } = render(
        <Sheet open onOpenChange={vi.fn()} side={s}>
          <div>body</div>
        </Sheet>,
      );
      const panel = document.querySelector('[data-section="drawer"]');
      expect(panel?.getAttribute('data-drawer-side')).toBe(s);
      unmount();
    }
  });

  // (v1.11.382, TODO 11.364) Size presets.

  describe('size presets', () => {
    it('size="md" applies the default width (320px) on right-anchored sheet', () => {
      render(
        <Sheet open onOpenChange={vi.fn()} size="md" side="right">
          <div>body</div>
        </Sheet>,
      );
      const panel = document.querySelector(
        '[data-section="drawer"]',
      ) as HTMLElement;
      expect(panel.style.width).toBe('320px');
    });

    it('size="sm" applies 256px width on left-anchored sheet', () => {
      render(
        <Sheet open onOpenChange={vi.fn()} size="sm" side="left">
          <div>body</div>
        </Sheet>,
      );
      const panel = document.querySelector(
        '[data-section="drawer"]',
      ) as HTMLElement;
      expect(panel.style.width).toBe('256px');
    });

    it('size="lg" applies 480px width on right-anchored sheet', () => {
      render(
        <Sheet open onOpenChange={vi.fn()} size="lg" side="right">
          <div>body</div>
        </Sheet>,
      );
      const panel = document.querySelector(
        '[data-section="drawer"]',
      ) as HTMLElement;
      expect(panel.style.width).toBe('480px');
    });

    it('size="full" applies the 720px width preset (Drawer maxWidth caps to viewport)', () => {
      render(
        <Sheet open onOpenChange={vi.fn()} size="full" side="right">
          <div>body</div>
        </Sheet>,
      );
      const panel = document.querySelector(
        '[data-section="drawer"]',
      ) as HTMLElement;
      expect(panel.style.width).toBe('720px');
      // The underlying Drawer always applies
      // maxWidth: 100% so the panel clamps to the
      // viewport on narrow screens.
      expect(panel.style.maxWidth).toBe('100%');
    });

    it('top side picks the size from the height preset', () => {
      render(
        <Sheet open onOpenChange={vi.fn()} size="md" side="top">
          <div>body</div>
        </Sheet>,
      );
      const panel = document.querySelector(
        '[data-section="drawer"]',
      ) as HTMLElement;
      expect(panel.style.height).toBe('50%');
      // Width inline style should NOT be set on
      // top-anchored sheets.
      expect(panel.style.width).toBe('');
    });

    it('bottom side size="lg" applies 75% height', () => {
      render(
        <Sheet open onOpenChange={vi.fn()} size="lg" side="bottom">
          <div>body</div>
        </Sheet>,
      );
      const panel = document.querySelector(
        '[data-section="drawer"]',
      ) as HTMLElement;
      expect(panel.style.height).toBe('75%');
    });

    it('explicit width prop wins over size preset', () => {
      render(
        <Sheet
          open
          onOpenChange={vi.fn()}
          size="full"
          side="right"
          width="100px"
        >
          <div>body</div>
        </Sheet>,
      );
      const panel = document.querySelector(
        '[data-section="drawer"]',
      ) as HTMLElement;
      expect(panel.style.width).toBe('100px');
    });

    it('explicit height prop wins over size preset', () => {
      render(
        <Sheet
          open
          onOpenChange={vi.fn()}
          size="full"
          side="top"
          height="200px"
        >
          <div>body</div>
        </Sheet>,
      );
      const panel = document.querySelector(
        '[data-section="drawer"]',
      ) as HTMLElement;
      expect(panel.style.height).toBe('200px');
    });
  });

  describe('passthrough props', () => {
    it('renders the title + close button', async () => {
      const onOpenChange = vi.fn();
      render(
        <Sheet
          open
          onOpenChange={onOpenChange}
          title="Filters"
        >
          <div>body</div>
        </Sheet>,
      );
      expect(screen.getByText('Filters')).toBeInTheDocument();
      const closeBtn = screen.getByLabelText('Close');
      await userEvent.click(closeBtn);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('respects closeOnBackdropClick=false', async () => {
      const onOpenChange = vi.fn();
      render(
        <Sheet
          open
          onOpenChange={onOpenChange}
          closeOnBackdropClick={false}
        >
          <div>body</div>
        </Sheet>,
      );
      const backdrop = document.querySelector(
        '[data-section="drawer-backdrop"]',
      ) as HTMLElement;
      fireEvent.click(backdrop);
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  it('exposes displayName for debugging', () => {
    expect(Sheet.displayName).toBe('Sheet');
  });
});
