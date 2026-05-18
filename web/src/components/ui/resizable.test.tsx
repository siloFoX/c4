import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  Resizable,
  applyResizableDelta,
  normalizeResizableSizes,
  type ResizablePanelConfig,
} from './resizable';

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

function mockContainerRect(width: number, height: number): void {
  HTMLElement.prototype.getBoundingClientRect = function () {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    } as DOMRect;
  };
}

function basicPanels(): ResizablePanelConfig[] {
  return [
    { id: 'a', content: <div data-testid="a">A</div>, defaultSize: 0.3 },
    { id: 'b', content: <div data-testid="b">B</div>, defaultSize: 0.4 },
    { id: 'c', content: <div data-testid="c">C</div>, defaultSize: 0.3 },
  ];
}

describe('normalizeResizableSizes()', () => {
  it('returns empty array for empty input', () => {
    expect(normalizeResizableSizes([], [], [])).toEqual([]);
  });

  it('returns sizes summing to 1.0 within tolerance', () => {
    const out = normalizeResizableSizes(
      [0.3, 0.4, 0.3],
      [0.1, 0.1, 0.1],
      [0.9, 0.9, 0.9],
    );
    const sum = out.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 9);
  });

  it('scales an unnormalized array to sum=1', () => {
    const out = normalizeResizableSizes(
      [1, 2, 1],
      [0.1, 0.1, 0.1],
      [0.9, 0.9, 0.9],
    );
    // After scaling: 0.25, 0.5, 0.25. Sum = 1.
    expect(out[0]).toBeCloseTo(0.25);
    expect(out[1]).toBeCloseTo(0.5);
    expect(out[2]).toBeCloseTo(0.25);
  });

  it('falls back to equal split when sum is zero', () => {
    const out = normalizeResizableSizes(
      [0, 0, 0],
      [0.1, 0.1, 0.1],
      [0.9, 0.9, 0.9],
    );
    expect(out).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });

  it('falls back to equal split when input lengths mismatch', () => {
    const out = normalizeResizableSizes(
      [0.3, 0.4, 0.3],
      [0.1, 0.1],
      [0.9, 0.9, 0.9],
    );
    expect(out).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });

  it('replaces NaN entries with their minSize', () => {
    const out = normalizeResizableSizes(
      [NaN, 0.5, 0.3],
      [0.2, 0.1, 0.1],
      [0.9, 0.9, 0.9],
    );
    // After replacement: [0.2, 0.5, 0.3] -> sum 1.0 already.
    expect(out[0]).toBeCloseTo(0.2);
    expect(out[1]).toBeCloseTo(0.5);
    expect(out[2]).toBeCloseTo(0.3);
  });

  it('clamps over-max entries to maxSize', () => {
    const out = normalizeResizableSizes(
      [0.7, 0.2, 0.1],
      [0.1, 0.1, 0.1],
      [0.4, 0.9, 0.9],
    );
    expect(out[0]).toBeLessThanOrEqual(0.4 + 1e-6);
  });
});

describe('applyResizableDelta()', () => {
  it('moves the boundary by the requested delta', () => {
    const next = applyResizableDelta(
      [0.3, 0.4, 0.3],
      0,
      0.1,
      [0.1, 0.1, 0.1],
      [0.9, 0.9, 0.9],
    );
    expect(next[0]).toBeCloseTo(0.4);
    expect(next[1]).toBeCloseTo(0.3);
    expect(next[2]).toBe(0.3);
  });

  it('clamps to panel[i] maxSize', () => {
    const next = applyResizableDelta(
      [0.3, 0.4, 0.3],
      0,
      0.5,
      [0.1, 0.1, 0.1],
      [0.4, 0.9, 0.9],
    );
    // a max=0.4 -> dx capped to 0.1.
    expect(next[0]).toBeCloseTo(0.4);
    expect(next[1]).toBeCloseTo(0.3);
  });

  it('clamps to panel[i+1] minSize', () => {
    const next = applyResizableDelta(
      [0.3, 0.4, 0.3],
      0,
      0.5,
      [0.1, 0.3, 0.1],
      [0.9, 0.9, 0.9],
    );
    // b min=0.3 -> dx capped so b stays >= 0.3 -> dx <= 0.1.
    expect(next[1]).toBeCloseTo(0.3);
  });

  it('clamps to panel[i] minSize on negative delta', () => {
    const next = applyResizableDelta(
      [0.3, 0.4, 0.3],
      0,
      -0.5,
      [0.2, 0.1, 0.1],
      [0.9, 0.9, 0.9],
    );
    expect(next[0]).toBeCloseTo(0.2);
    expect(next[1]).toBeCloseTo(0.5);
  });

  it('out-of-range handleIndex returns unchanged sizes', () => {
    const sizes = [0.3, 0.4, 0.3];
    expect(applyResizableDelta(sizes, -1, 0.1, [0, 0, 0], [1, 1, 1])).toBe(
      sizes,
    );
    expect(applyResizableDelta(sizes, 2, 0.1, [0, 0, 0], [1, 1, 1])).toBe(
      sizes,
    );
  });

  it('siblings beyond the boundary stay put', () => {
    const next = applyResizableDelta(
      [0.2, 0.3, 0.3, 0.2],
      1,
      0.1,
      [0.1, 0.1, 0.1, 0.1],
      [0.9, 0.9, 0.9, 0.9],
    );
    // Boundary between i=1 and i=2 changes; i=0 and i=3 unchanged.
    expect(next[0]).toBe(0.2);
    expect(next[3]).toBe(0.2);
    expect(next[1]).toBeCloseTo(0.4);
    expect(next[2]).toBeCloseTo(0.2);
  });
});

describe('<Resizable>', () => {
  it('renders one panel per config + handles between adjacent panels', () => {
    render(<Resizable panels={basicPanels()} />);
    const panels = document.querySelectorAll(
      '[data-section="resizable-panel"]',
    );
    expect(panels).toHaveLength(3);
    const handles = document.querySelectorAll(
      '[data-section="resizable-handle"]',
    );
    expect(handles).toHaveLength(2);
  });

  it('exposes data-section="resizable" + data-direction + data-panel-count on root', () => {
    render(<Resizable panels={basicPanels()} direction="vertical" />);
    const root = document.querySelector(
      '[data-section="resizable"]',
    ) as HTMLElement;
    expect(root.getAttribute('data-direction')).toBe('vertical');
    expect(root.getAttribute('data-panel-count')).toBe('3');
  });

  it('root has role=group + aria-orientation', () => {
    render(<Resizable panels={basicPanels()} ariaLabel="Workbench" />);
    const root = screen.getByRole('group', { name: 'Workbench' });
    expect(root.getAttribute('aria-orientation')).toBe('horizontal');
  });

  it('handle has role=separator + aria-valuemin/now/max', () => {
    render(<Resizable panels={basicPanels()} />);
    const handles = screen.getAllByRole('separator');
    expect(handles).toHaveLength(2);
    expect(handles[0]!.getAttribute('aria-valuemin')).toBe('10');
    expect(handles[0]!.getAttribute('aria-valuemax')).toBe('100');
    expect(handles[0]!.getAttribute('aria-valuenow')).toBe('30');
  });

  it('handle aria-label uses the default "Resize between A and B" format', () => {
    render(<Resizable panels={basicPanels()} />);
    expect(
      screen.getByRole('separator', { name: 'Resize between a and b' }),
    ).toBeInTheDocument();
  });

  it('handleAriaLabel override controls the announcement', () => {
    render(
      <Resizable
        panels={basicPanels()}
        handleAriaLabel={(p, n) => `Drag ${p}|${n}`}
      />,
    );
    expect(
      screen.getByRole('separator', { name: 'Drag a|b' }),
    ).toBeInTheDocument();
  });

  it('default sizes apply flex-basis ratios on each panel', () => {
    const { container } = render(<Resizable panels={basicPanels()} />);
    const panels = container.querySelectorAll(
      '[data-section="resizable-panel"]',
    );
    expect((panels[0] as HTMLElement).style.flexBasis).toBe('30%');
    expect((panels[1] as HTMLElement).style.flexBasis).toBe('40%');
    expect((panels[2] as HTMLElement).style.flexBasis).toBe('30%');
  });

  it('keyboard ArrowRight grows the left panel + shrinks the right panel', () => {
    const onSizesChange = vi.fn();
    render(
      <Resizable
        panels={basicPanels()}
        keyboardStep={0.1}
        onSizesChange={onSizesChange}
      />,
    );
    const handles = screen.getAllByRole('separator');
    fireEvent.keyDown(handles[0]!, { key: 'ArrowRight' });
    const next = onSizesChange.mock.calls[0]![0] as number[];
    expect(next[0]).toBeCloseTo(0.4);
    expect(next[1]).toBeCloseTo(0.3);
  });

  it('keyboard ArrowLeft shrinks the left panel + grows the right panel', () => {
    const onSizesChange = vi.fn();
    render(
      <Resizable
        panels={basicPanels()}
        keyboardStep={0.1}
        onSizesChange={onSizesChange}
      />,
    );
    const handles = screen.getAllByRole('separator');
    fireEvent.keyDown(handles[0]!, { key: 'ArrowLeft' });
    const next = onSizesChange.mock.calls[0]![0] as number[];
    expect(next[0]).toBeCloseTo(0.2);
    expect(next[1]).toBeCloseTo(0.5);
  });

  it('vertical direction uses ArrowUp/Down for the same shrink/grow semantics', () => {
    const onSizesChange = vi.fn();
    render(
      <Resizable
        panels={basicPanels()}
        direction="vertical"
        keyboardStep={0.1}
        onSizesChange={onSizesChange}
      />,
    );
    const handles = screen.getAllByRole('separator');
    fireEvent.keyDown(handles[0]!, { key: 'ArrowDown' });
    const next = onSizesChange.mock.calls[0]![0] as number[];
    expect(next[0]).toBeCloseTo(0.4);
    expect(next[1]).toBeCloseTo(0.3);
  });

  it('Home key pushes the left panel to its minSize', () => {
    const onSizesChange = vi.fn();
    const panels: ResizablePanelConfig[] = [
      { id: 'a', content: <span>A</span>, defaultSize: 0.4, minSize: 0.15 },
      { id: 'b', content: <span>B</span>, defaultSize: 0.6 },
    ];
    render(<Resizable panels={panels} onSizesChange={onSizesChange} />);
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'Home' });
    const next = onSizesChange.mock.calls[0]![0] as number[];
    expect(next[0]).toBeCloseTo(0.15);
    expect(next[1]).toBeCloseTo(0.85);
  });

  it('End key pushes the left panel to its maxSize', () => {
    const onSizesChange = vi.fn();
    const panels: ResizablePanelConfig[] = [
      { id: 'a', content: <span>A</span>, defaultSize: 0.4, maxSize: 0.7 },
      { id: 'b', content: <span>B</span>, defaultSize: 0.6, minSize: 0.2 },
    ];
    render(<Resizable panels={panels} onSizesChange={onSizesChange} />);
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'End' });
    const next = onSizesChange.mock.calls[0]![0] as number[];
    // panel[0] grows to maxSize 0.7; panel[1] = 1-0.7 = 0.3.
    expect(next[0]).toBeCloseTo(0.7);
    expect(next[1]).toBeCloseTo(0.3);
  });

  it('pointer drag updates sizes proportional to container width', () => {
    mockContainerRect(1000, 600);
    const onSizesChange = vi.fn();
    render(<Resizable panels={basicPanels()} onSizesChange={onSizesChange} />);
    const handles = screen.getAllByRole('separator');
    fireEvent.pointerDown(handles[0]!, {
      pointerId: 1,
      button: 0,
      clientX: 300,
      clientY: 0,
    });
    fireEvent.pointerMove(handles[0]!, {
      pointerId: 1,
      clientX: 400,
      clientY: 0,
    });
    // dx = 100 / 1000 = 0.1.
    const next = onSizesChange.mock.calls[0]![0] as number[];
    expect(next[0]).toBeCloseTo(0.4);
    expect(next[1]).toBeCloseTo(0.3);
  });

  it('pointer drag respects per-panel maxSize cap during move', () => {
    mockContainerRect(1000, 600);
    const onSizesChange = vi.fn();
    const panels: ResizablePanelConfig[] = [
      { id: 'a', content: <span>A</span>, defaultSize: 0.3, maxSize: 0.4 },
      { id: 'b', content: <span>B</span>, defaultSize: 0.7, minSize: 0.2 },
    ];
    render(<Resizable panels={panels} onSizesChange={onSizesChange} />);
    fireEvent.pointerDown(screen.getByRole('separator'), {
      pointerId: 1,
      button: 0,
      clientX: 300,
    });
    fireEvent.pointerMove(screen.getByRole('separator'), {
      pointerId: 1,
      clientX: 700,
    });
    // dx = 0.4 -> 0.3+0.4=0.7 capped at maxSize 0.4.
    const calls = onSizesChange.mock.calls;
    const last = calls[calls.length - 1]![0] as number[];
    expect(last[0]).toBeCloseTo(0.4);
  });

  it('pointerup ends the drag + flips data-dragging to "false"', () => {
    mockContainerRect(800, 600);
    render(<Resizable panels={basicPanels()} />);
    const handle = screen.getAllByRole('separator')[0]!;
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      button: 0,
      clientX: 240,
    });
    expect(handle.getAttribute('data-dragging')).toBe('true');
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 240 });
    expect(handle.getAttribute('data-dragging')).toBe('false');
  });

  it('non-primary button does NOT start a drag', () => {
    mockContainerRect(800, 600);
    const onSizesChange = vi.fn();
    render(<Resizable panels={basicPanels()} onSizesChange={onSizesChange} />);
    const handle = screen.getAllByRole('separator')[0]!;
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      button: 2, // right click
      clientX: 240,
    });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 320 });
    expect(onSizesChange).not.toHaveBeenCalled();
  });

  it('persists sizes to localStorage on commit when storageKey is set', () => {
    render(
      <Resizable
        panels={basicPanels()}
        keyboardStep={0.1}
        storageKey="layout-1"
      />,
    );
    fireEvent.keyDown(screen.getAllByRole('separator')[0]!, {
      key: 'ArrowRight',
    });
    const raw = window.localStorage.getItem('c4:resizable:layout-1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed[0]).toBeCloseTo(0.4);
  });

  it('reads stored sizes on mount + normalizes', () => {
    window.localStorage.setItem(
      'c4:resizable:saved',
      JSON.stringify([0.5, 0.3, 0.2]),
    );
    const { container } = render(
      <Resizable panels={basicPanels()} storageKey="saved" />,
    );
    const panels = container.querySelectorAll(
      '[data-section="resizable-panel"]',
    );
    expect((panels[0] as HTMLElement).style.flexBasis).toBe('50%');
    expect((panels[1] as HTMLElement).style.flexBasis).toBe('30%');
    expect((panels[2] as HTMLElement).style.flexBasis).toBe('20%');
  });

  it('invalid stored sizes (wrong length) fall back to defaults', () => {
    window.localStorage.setItem(
      'c4:resizable:wrong',
      JSON.stringify([0.5, 0.5]),
    );
    const { container } = render(
      <Resizable panels={basicPanels()} storageKey="wrong" />,
    );
    const panels = container.querySelectorAll(
      '[data-section="resizable-panel"]',
    );
    expect((panels[0] as HTMLElement).style.flexBasis).toBe('30%');
  });

  it('invalid stored JSON falls back to defaults', () => {
    window.localStorage.setItem('c4:resizable:bad', 'not-json');
    const { container } = render(
      <Resizable panels={basicPanels()} storageKey="bad" />,
    );
    const panels = container.querySelectorAll(
      '[data-section="resizable-panel"]',
    );
    expect((panels[0] as HTMLElement).style.flexBasis).toBe('30%');
  });

  it('per-panel data-panel-id + data-panel-index mirror the config', () => {
    const { container } = render(<Resizable panels={basicPanels()} />);
    const panels = container.querySelectorAll(
      '[data-section="resizable-panel"]',
    );
    expect(panels[0]!.getAttribute('data-panel-id')).toBe('a');
    expect(panels[0]!.getAttribute('data-panel-index')).toBe('0');
    expect(panels[2]!.getAttribute('data-panel-id')).toBe('c');
    expect(panels[2]!.getAttribute('data-panel-index')).toBe('2');
  });

  it('handle data-handle-index mirrors the boundary position', () => {
    const { container } = render(<Resizable panels={basicPanels()} />);
    const handles = container.querySelectorAll(
      '[data-section="resizable-handle"]',
    );
    expect(handles[0]!.getAttribute('data-handle-index')).toBe('0');
    expect(handles[1]!.getAttribute('data-handle-index')).toBe('1');
  });

  it('exposes a stable displayName', () => {
    expect(Resizable.displayName).toBe('Resizable');
  });
});
