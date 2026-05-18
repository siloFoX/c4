import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DrawerResize, clampDrawerWidth } from './drawer-resize';

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe('clampDrawerWidth()', () => {
  it('clamps below min to min', () => {
    expect(clampDrawerWidth(100, 200, 600)).toBe(200);
  });

  it('clamps above max to max', () => {
    expect(clampDrawerWidth(800, 200, 600)).toBe(600);
  });

  it('passes through value within range', () => {
    expect(clampDrawerWidth(300, 200, 600)).toBe(300);
  });

  it('returns min for NaN', () => {
    expect(clampDrawerWidth(NaN, 200, 600)).toBe(200);
  });

  it('returns min when min > max (defensive)', () => {
    expect(clampDrawerWidth(300, 600, 200)).toBe(600);
  });
});

describe('<DrawerResize>', () => {
  it('renders children inside the body slot', () => {
    render(
      <DrawerResize>
        <div data-testid="body">hello</div>
      </DrawerResize>,
    );
    expect(screen.getByTestId('body')).toHaveTextContent('hello');
  });

  it('default width is 280px', () => {
    const { container } = render(
      <DrawerResize>
        <span>x</span>
      </DrawerResize>,
    );
    const root = container.querySelector(
      '[data-section="drawer-resize"]',
    ) as HTMLElement;
    expect(root.style.width).toBe('280px');
  });

  it('defaultWidth prop seeds the initial width (uncontrolled)', () => {
    const { container } = render(
      <DrawerResize defaultWidth={350}>
        <span>x</span>
      </DrawerResize>,
    );
    const root = container.querySelector(
      '[data-section="drawer-resize"]',
    ) as HTMLElement;
    expect(root.style.width).toBe('350px');
  });

  it('defaultWidth is clamped to [minWidth, maxWidth]', () => {
    const { container } = render(
      <DrawerResize defaultWidth={50} minWidth={100} maxWidth={400}>
        <span>x</span>
      </DrawerResize>,
    );
    const root = container.querySelector(
      '[data-section="drawer-resize"]',
    ) as HTMLElement;
    expect(root.style.width).toBe('100px');
  });

  it('controlled width prop overrides internal state', () => {
    const { container, rerender } = render(
      <DrawerResize width={250} onWidthChange={() => {}}>
        <span>x</span>
      </DrawerResize>,
    );
    expect(
      (container.querySelector(
        '[data-section="drawer-resize"]',
      ) as HTMLElement).style.width,
    ).toBe('250px');
    rerender(
      <DrawerResize width={400} onWidthChange={() => {}}>
        <span>x</span>
      </DrawerResize>,
    );
    expect(
      (container.querySelector(
        '[data-section="drawer-resize"]',
      ) as HTMLElement).style.width,
    ).toBe('400px');
  });

  it('renders a drag handle with role=separator + aria attrs', () => {
    render(
      <DrawerResize defaultWidth={300} minWidth={200} maxWidth={600}>
        <span>x</span>
      </DrawerResize>,
    );
    const handle = screen.getByRole('separator', { name: 'Resize panel' });
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('aria-valuemin')).toBe('200');
    expect(handle.getAttribute('aria-valuemax')).toBe('600');
    expect(handle.getAttribute('aria-valuenow')).toBe('300');
  });

  it('default side="right" docks the handle to the LEFT edge of the panel', () => {
    const { container } = render(
      <DrawerResize>
        <span>x</span>
      </DrawerResize>,
    );
    const handle = container.querySelector(
      '[data-section="drawer-resize-handle"]',
    ) as HTMLElement;
    expect(handle.className).toContain('left-0');
  });

  it('side="left" docks the handle to the RIGHT edge', () => {
    const { container } = render(
      <DrawerResize side="left">
        <span>x</span>
      </DrawerResize>,
    );
    const handle = container.querySelector(
      '[data-section="drawer-resize-handle"]',
    ) as HTMLElement;
    expect(handle.className).toContain('right-0');
  });

  it('ArrowLeft on a right-side handle grows the panel', () => {
    const onWidthChange = vi.fn();
    render(
      <DrawerResize
        defaultWidth={300}
        keyboardStep={20}
        onWidthChange={onWidthChange}
      >
        <span>x</span>
      </DrawerResize>,
    );
    const handle = screen.getByRole('separator');
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(onWidthChange).toHaveBeenCalledWith(320);
  });

  it('ArrowRight on a right-side handle shrinks the panel', () => {
    const onWidthChange = vi.fn();
    render(
      <DrawerResize
        defaultWidth={300}
        keyboardStep={20}
        onWidthChange={onWidthChange}
      >
        <span>x</span>
      </DrawerResize>,
    );
    const handle = screen.getByRole('separator');
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onWidthChange).toHaveBeenCalledWith(280);
  });

  it('ArrowLeft on a left-side handle shrinks the panel', () => {
    const onWidthChange = vi.fn();
    render(
      <DrawerResize
        side="left"
        defaultWidth={300}
        keyboardStep={20}
        onWidthChange={onWidthChange}
      >
        <span>x</span>
      </DrawerResize>,
    );
    const handle = screen.getByRole('separator');
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(onWidthChange).toHaveBeenCalledWith(280);
  });

  it('ArrowRight on a left-side handle grows the panel', () => {
    const onWidthChange = vi.fn();
    render(
      <DrawerResize
        side="left"
        defaultWidth={300}
        keyboardStep={20}
        onWidthChange={onWidthChange}
      >
        <span>x</span>
      </DrawerResize>,
    );
    const handle = screen.getByRole('separator');
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onWidthChange).toHaveBeenCalledWith(320);
  });

  it('PageUp grows by pageStep', () => {
    const onWidthChange = vi.fn();
    render(
      <DrawerResize
        defaultWidth={300}
        pageStep={100}
        onWidthChange={onWidthChange}
      >
        <span>x</span>
      </DrawerResize>,
    );
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'PageUp' });
    expect(onWidthChange).toHaveBeenCalledWith(400);
  });

  it('PageDown shrinks by pageStep', () => {
    const onWidthChange = vi.fn();
    render(
      <DrawerResize
        defaultWidth={300}
        pageStep={100}
        onWidthChange={onWidthChange}
      >
        <span>x</span>
      </DrawerResize>,
    );
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'PageDown' });
    expect(onWidthChange).toHaveBeenCalledWith(200);
  });

  it('Home jumps to minWidth', () => {
    const onWidthChange = vi.fn();
    render(
      <DrawerResize
        defaultWidth={400}
        minWidth={150}
        onWidthChange={onWidthChange}
      >
        <span>x</span>
      </DrawerResize>,
    );
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'Home' });
    expect(onWidthChange).toHaveBeenCalledWith(150);
  });

  it('End jumps to maxWidth', () => {
    const onWidthChange = vi.fn();
    render(
      <DrawerResize
        defaultWidth={300}
        maxWidth={550}
        onWidthChange={onWidthChange}
      >
        <span>x</span>
      </DrawerResize>,
    );
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'End' });
    expect(onWidthChange).toHaveBeenCalledWith(550);
  });

  it('keyboard nudge clamps the result to minWidth', () => {
    const onWidthChange = vi.fn();
    render(
      <DrawerResize
        defaultWidth={210}
        minWidth={200}
        keyboardStep={50}
        onWidthChange={onWidthChange}
      >
        <span>x</span>
      </DrawerResize>,
    );
    // Right side: ArrowRight -> width - 50 = 160 -> clamp to 200.
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' });
    expect(onWidthChange).toHaveBeenCalledWith(200);
  });

  it('keyboard nudge clamps the result to maxWidth', () => {
    const onWidthChange = vi.fn();
    render(
      <DrawerResize
        defaultWidth={590}
        maxWidth={600}
        keyboardStep={50}
        onWidthChange={onWidthChange}
      >
        <span>x</span>
      </DrawerResize>,
    );
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowLeft' });
    expect(onWidthChange).toHaveBeenCalledWith(600);
  });

  it('localStorage persistence: writes width on keyboard commit', () => {
    render(
      <DrawerResize
        defaultWidth={300}
        keyboardStep={20}
        storageKey="my-panel"
      >
        <span>x</span>
      </DrawerResize>,
    );
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowLeft' });
    expect(window.localStorage.getItem('c4:drawer-resize:my-panel')).toBe('320');
  });

  it('localStorage persistence: reads width on mount', () => {
    window.localStorage.setItem('c4:drawer-resize:my-panel', '425');
    const { container } = render(
      <DrawerResize storageKey="my-panel" defaultWidth={300}>
        <span>x</span>
      </DrawerResize>,
    );
    const root = container.querySelector(
      '[data-section="drawer-resize"]',
    ) as HTMLElement;
    expect(root.style.width).toBe('425px');
  });

  it('stored width is clamped to [minWidth, maxWidth] on mount', () => {
    window.localStorage.setItem('c4:drawer-resize:capped', '9999');
    const { container } = render(
      <DrawerResize
        storageKey="capped"
        defaultWidth={300}
        minWidth={200}
        maxWidth={500}
      >
        <span>x</span>
      </DrawerResize>,
    );
    const root = container.querySelector(
      '[data-section="drawer-resize"]',
    ) as HTMLElement;
    expect(root.style.width).toBe('500px');
  });

  it('NaN stored width is ignored (falls back to defaultWidth)', () => {
    window.localStorage.setItem('c4:drawer-resize:bad', 'not-a-number');
    const { container } = render(
      <DrawerResize storageKey="bad" defaultWidth={300}>
        <span>x</span>
      </DrawerResize>,
    );
    const root = container.querySelector(
      '[data-section="drawer-resize"]',
    ) as HTMLElement;
    expect(root.style.width).toBe('300px');
  });

  it('absent storageKey skips persistence', () => {
    render(
      <DrawerResize defaultWidth={300}>
        <span>x</span>
      </DrawerResize>,
    );
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowLeft' });
    expect(window.localStorage.length).toBe(0);
  });

  it('pointer drag updates width during pointermove', () => {
    const onWidthChange = vi.fn();
    render(
      <DrawerResize defaultWidth={300} onWidthChange={onWidthChange}>
        <span>x</span>
      </DrawerResize>,
    );
    const handle = screen.getByRole('separator');
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      button: 0,
      clientX: 500,
    });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 450 });
    // right side: dx = -50, delta = +50 -> width 350.
    expect(onWidthChange).toHaveBeenLastCalledWith(350);
  });

  it('pointerup ends the drag + sets data-dragging=false', () => {
    const { container } = render(
      <DrawerResize defaultWidth={300}>
        <span>x</span>
      </DrawerResize>,
    );
    const handle = container.querySelector(
      '[data-section="drawer-resize-handle"]',
    ) as HTMLElement;
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      button: 0,
      clientX: 500,
    });
    expect(handle.getAttribute('data-dragging')).toBe('true');
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 480 });
    expect(handle.getAttribute('data-dragging')).toBe('false');
  });

  it('pointerup persists the final width to localStorage', () => {
    render(
      <DrawerResize defaultWidth={300} storageKey="persist-test">
        <span>x</span>
      </DrawerResize>,
    );
    const handle = screen.getByRole('separator');
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      button: 0,
      clientX: 500,
    });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 430 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 430 });
    // dx = -70 -> width 370.
    expect(
      window.localStorage.getItem('c4:drawer-resize:persist-test'),
    ).toBe('370');
  });

  it('non-primary pointer button does NOT start a drag', () => {
    const onWidthChange = vi.fn();
    render(
      <DrawerResize defaultWidth={300} onWidthChange={onWidthChange}>
        <span>x</span>
      </DrawerResize>,
    );
    const handle = screen.getByRole('separator');
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      button: 2, // right-click
      clientX: 500,
    });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 450 });
    expect(onWidthChange).not.toHaveBeenCalled();
  });

  it('drag delta is clamped to maxWidth during move', () => {
    const onWidthChange = vi.fn();
    render(
      <DrawerResize
        defaultWidth={300}
        maxWidth={500}
        onWidthChange={onWidthChange}
      >
        <span>x</span>
      </DrawerResize>,
    );
    const handle = screen.getByRole('separator');
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      button: 0,
      clientX: 500,
    });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 100 });
    // right side: dx = -400, delta = +400 -> 700 clamped to 500.
    expect(onWidthChange).toHaveBeenLastCalledWith(500);
  });

  it('exposes data-section + data-side + data-width attrs on root', () => {
    const { container } = render(
      <DrawerResize defaultWidth={350} side="left">
        <span>x</span>
      </DrawerResize>,
    );
    const root = container.querySelector(
      '[data-section="drawer-resize"]',
    ) as HTMLElement;
    expect(root.getAttribute('data-side')).toBe('left');
    expect(root.getAttribute('data-width')).toBe('350');
  });

  it('exposes a stable displayName for devtools', () => {
    expect(DrawerResize.displayName).toBe('DrawerResize');
  });

  it('controlled mode: onWidthChange fires but internal state is not used', () => {
    const onWidthChange = vi.fn();
    const { container } = render(
      <DrawerResize width={300} onWidthChange={onWidthChange}>
        <span>x</span>
      </DrawerResize>,
    );
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'End' });
    // Controlled: width stays at 300 until parent updates the prop.
    expect(
      (container.querySelector(
        '[data-section="drawer-resize"]',
      ) as HTMLElement).style.width,
    ).toBe('300px');
    // But onWidthChange should fire with the requested target (max=600 default).
    expect(onWidthChange).toHaveBeenCalledWith(600);
  });
});
