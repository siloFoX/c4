import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { HoverCard, computeHoverCardPosition } from './hover-card';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function Controlled({
  defaultOpen = false,
  openDelay,
  closeDelay,
}: {
  defaultOpen?: boolean;
  openDelay?: number;
  closeDelay?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <HoverCard
      trigger={<button type="button">Open</button>}
      content={<span>card body</span>}
      open={open}
      onOpenChange={setOpen}
      {...(openDelay !== undefined ? { openDelay } : {})}
      {...(closeDelay !== undefined ? { closeDelay } : {})}
    />
  );
}

describe('computeHoverCardPosition()', () => {
  const VP = { width: 1024, height: 768 };

  it('places below the trigger when bottom fits', () => {
    const trigger = { top: 100, left: 100, right: 200, bottom: 130, width: 100, height: 30 };
    const panel = { width: 200, height: 100 };
    const pos = computeHoverCardPosition(trigger, panel, VP, 'bottom', 'center', 8);
    expect(pos.placement).toBe('bottom');
    expect(pos.top).toBe(138);
  });

  it('flips to top when bottom does not fit', () => {
    const trigger = { top: 700, left: 100, right: 200, bottom: 750, width: 100, height: 50 };
    const panel = { width: 200, height: 200 };
    const pos = computeHoverCardPosition(trigger, panel, VP, 'bottom', 'center', 8);
    expect(pos.placement).toBe('top');
    expect(pos.top).toBe(700 - 200 - 8);
  });

  it('flips to right when left does not fit', () => {
    const trigger = { top: 100, left: 20, right: 100, bottom: 130, width: 80, height: 30 };
    const panel = { width: 200, height: 100 };
    const pos = computeHoverCardPosition(trigger, panel, VP, 'left', 'center', 8);
    expect(pos.placement).toBe('right');
    expect(pos.left).toBe(100 + 8);
  });

  it('center align centers the panel on the trigger', () => {
    const trigger = { top: 100, left: 100, right: 300, bottom: 150, width: 200, height: 50 };
    const panel = { width: 100, height: 50 };
    const pos = computeHoverCardPosition(trigger, panel, VP, 'bottom', 'center', 0);
    // Trigger center = 200; panel half-width = 50 -> left = 150.
    expect(pos.left).toBe(150);
  });

  it('start align pins to the trigger left edge', () => {
    const trigger = { top: 100, left: 100, right: 300, bottom: 150, width: 200, height: 50 };
    const panel = { width: 100, height: 50 };
    const pos = computeHoverCardPosition(trigger, panel, VP, 'bottom', 'start', 0);
    expect(pos.left).toBe(100);
  });

  it('end align pins to the trigger right edge', () => {
    const trigger = { top: 100, left: 100, right: 300, bottom: 150, width: 200, height: 50 };
    const panel = { width: 100, height: 50 };
    const pos = computeHoverCardPosition(trigger, panel, VP, 'bottom', 'end', 0);
    expect(pos.left).toBe(200);
  });
});

describe('<HoverCard>', () => {
  it('does not render the panel by default', () => {
    render(
      <HoverCard
        trigger={<button type="button">Open</button>}
        content={<span>body</span>}
      />,
    );
    expect(
      document.querySelector('[data-section="hover-card-panel"]'),
    ).toBeNull();
  });

  it('renders the trigger with data-hover-card-trigger attr', () => {
    render(
      <HoverCard
        trigger={<button type="button">Open</button>}
        content={<span>body</span>}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Open' }).getAttribute(
        'data-hover-card-trigger',
      ),
    ).toBe('true');
  });

  it('opens after openDelay on mouseenter', () => {
    render(
      <HoverCard
        trigger={<button type="button">Open</button>}
        content={<span>body</span>}
        openDelay={200}
      />,
    );
    fireEvent.mouseEnter(screen.getByRole('button'));
    expect(
      document.querySelector('[data-section="hover-card-panel"]'),
    ).toBeNull();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(
      document.querySelector('[data-section="hover-card-panel"]'),
    ).not.toBeNull();
  });

  it('does NOT open if mouseleave fires before the delay elapses', () => {
    render(
      <HoverCard
        trigger={<button type="button">Open</button>}
        content={<span>body</span>}
        openDelay={300}
      />,
    );
    const btn = screen.getByRole('button');
    fireEvent.mouseEnter(btn);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.mouseLeave(btn);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(
      document.querySelector('[data-section="hover-card-panel"]'),
    ).toBeNull();
  });

  it('opens immediately when openDelay=0', () => {
    render(
      <HoverCard
        trigger={<button type="button">Open</button>}
        content={<span>body</span>}
        openDelay={0}
      />,
    );
    fireEvent.mouseEnter(screen.getByRole('button'));
    expect(
      document.querySelector('[data-section="hover-card-panel"]'),
    ).not.toBeNull();
  });

  it('closes after closeDelay on mouseleave', () => {
    render(
      <HoverCard
        trigger={<button type="button">Open</button>}
        content={<span>body</span>}
        openDelay={0}
        closeDelay={200}
      />,
    );
    const btn = screen.getByRole('button');
    fireEvent.mouseEnter(btn);
    expect(
      document.querySelector('[data-section="hover-card-panel"]'),
    ).not.toBeNull();
    fireEvent.mouseLeave(btn);
    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(
      document.querySelector('[data-section="hover-card-panel"]'),
    ).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(
      document.querySelector('[data-section="hover-card-panel"]'),
    ).toBeNull();
  });

  it('hovering the panel cancels the pending close', () => {
    render(
      <HoverCard
        trigger={<button type="button">Open</button>}
        content={<span>body</span>}
        openDelay={0}
        closeDelay={300}
      />,
    );
    const btn = screen.getByRole('button');
    fireEvent.mouseEnter(btn);
    fireEvent.mouseLeave(btn);
    // Pending close, but user enters the panel.
    const panel = document.querySelector(
      '[data-section="hover-card-panel"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(panel);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(
      document.querySelector('[data-section="hover-card-panel"]'),
    ).not.toBeNull();
  });

  it('leaving the panel schedules another close', () => {
    render(
      <HoverCard
        trigger={<button type="button">Open</button>}
        content={<span>body</span>}
        openDelay={0}
        closeDelay={100}
      />,
    );
    const btn = screen.getByRole('button');
    fireEvent.mouseEnter(btn);
    fireEvent.mouseLeave(btn);
    const panel = document.querySelector(
      '[data-section="hover-card-panel"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(panel);
    fireEvent.mouseLeave(panel);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(
      document.querySelector('[data-section="hover-card-panel"]'),
    ).toBeNull();
  });

  it('does NOT open on focus (focus is reserved for Popover)', () => {
    render(
      <HoverCard
        trigger={<button type="button">Open</button>}
        content={<span>body</span>}
        openDelay={0}
      />,
    );
    fireEvent.focus(screen.getByRole('button'));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(
      document.querySelector('[data-section="hover-card-panel"]'),
    ).toBeNull();
  });

  it('touchstart on the trigger opens the card (touch fallback)', () => {
    render(
      <HoverCard
        trigger={<button type="button">Open</button>}
        content={<span>body</span>}
        openDelay={0}
      />,
    );
    fireEvent.touchStart(screen.getByRole('button'));
    expect(
      document.querySelector('[data-section="hover-card-panel"]'),
    ).not.toBeNull();
  });

  it('Escape on the trigger closes a stale-open card', () => {
    render(<Controlled defaultOpen openDelay={0} closeDelay={0} />);
    expect(
      document.querySelector('[data-section="hover-card-panel"]'),
    ).not.toBeNull();
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Escape' });
    expect(
      document.querySelector('[data-section="hover-card-panel"]'),
    ).toBeNull();
  });

  it('document-level Escape closes when the card is open', () => {
    render(<Controlled defaultOpen openDelay={0} closeDelay={0} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      document.querySelector('[data-section="hover-card-panel"]'),
    ).toBeNull();
  });

  it('controlled open prop drives the panel visibility', () => {
    const { rerender } = render(
      <HoverCard
        trigger={<button type="button">Open</button>}
        content={<span>body</span>}
        open={false}
        onOpenChange={() => {}}
      />,
    );
    expect(
      document.querySelector('[data-section="hover-card-panel"]'),
    ).toBeNull();
    rerender(
      <HoverCard
        trigger={<button type="button">Open</button>}
        content={<span>body</span>}
        open={true}
        onOpenChange={() => {}}
      />,
    );
    expect(
      document.querySelector('[data-section="hover-card-panel"]'),
    ).not.toBeNull();
  });

  it('onOpenChange fires with the expected boolean transitions', () => {
    const onOpenChange = vi.fn();
    render(
      <HoverCard
        trigger={<button type="button">Open</button>}
        content={<span>body</span>}
        onOpenChange={onOpenChange}
        openDelay={0}
        closeDelay={0}
      />,
    );
    const btn = screen.getByRole('button');
    fireEvent.mouseEnter(btn);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    fireEvent.mouseLeave(btn);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('panel renders inside the hover-card-root portal node', () => {
    render(
      <HoverCard
        trigger={<button type="button">Open</button>}
        content={<span>body</span>}
        openDelay={0}
      />,
    );
    fireEvent.mouseEnter(screen.getByRole('button'));
    const portalRoot = document.getElementById('hover-card-root');
    expect(portalRoot).not.toBeNull();
    expect(
      portalRoot!.querySelector('[data-section="hover-card-panel"]'),
    ).not.toBeNull();
  });

  it('panel exposes role="tooltip" + data-hover-card-placement', () => {
    render(
      <HoverCard
        trigger={<button type="button">Open</button>}
        content={<span>body</span>}
        openDelay={0}
        placement="top"
      />,
    );
    fireEvent.mouseEnter(screen.getByRole('button'));
    const panel = document.querySelector(
      '[data-section="hover-card-panel"]',
    ) as HTMLElement;
    expect(panel.getAttribute('role')).toBe('tooltip');
    expect(panel.getAttribute('data-hover-card-placement')).toBeTruthy();
  });

  it('trigger aria-describedby links to the panel when open', () => {
    render(
      <HoverCard
        trigger={<button type="button">Open</button>}
        content={<span>body</span>}
        openDelay={0}
      />,
    );
    const btn = screen.getByRole('button');
    fireEvent.mouseEnter(btn);
    const panel = document.querySelector(
      '[data-section="hover-card-panel"]',
    ) as HTMLElement;
    expect(btn.getAttribute('aria-describedby')).toBe(panel.id);
  });

  it('data-hover-card-open on the trigger mirrors the open state', () => {
    render(
      <HoverCard
        trigger={<button type="button">Open</button>}
        content={<span>body</span>}
        openDelay={0}
        closeDelay={0}
      />,
    );
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('data-hover-card-open')).toBe('false');
    fireEvent.mouseEnter(btn);
    expect(btn.getAttribute('data-hover-card-open')).toBe('true');
    fireEvent.mouseLeave(btn);
    expect(btn.getAttribute('data-hover-card-open')).toBe('false');
  });

  it('forwards a custom data-testid onto the panel', () => {
    render(
      <HoverCard
        trigger={<button type="button">Open</button>}
        content={<span>body</span>}
        openDelay={0}
        data-testid="my-card"
      />,
    );
    fireEvent.mouseEnter(screen.getByRole('button'));
    expect(screen.getByTestId('my-card')).toBeInTheDocument();
  });

  it('exposes a stable displayName for devtools', () => {
    expect(HoverCard.displayName).toBe('HoverCard');
  });
});
