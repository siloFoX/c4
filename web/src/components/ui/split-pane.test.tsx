import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SplitPane } from './split-pane';

beforeEach(() => {
  // Reset the storage between tests.
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
  // Stub getBoundingClientRect on every div so pointer math is
  // deterministic across jsdom renders.
  HTMLDivElement.prototype.getBoundingClientRect = function () {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 800,
      width: 1000,
      height: 800,
      toJSON() {
        return {};
      },
    } as DOMRect;
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('<SplitPane>', () => {
  it('renders start + end children as siblings around the divider', () => {
    const { container } = render(
      <SplitPane
        start={<span data-testid="left">L</span>}
        end={<span data-testid="right">R</span>}
      />,
    );
    expect(screen.getByTestId('left')).toBeInTheDocument();
    expect(screen.getByTestId('right')).toBeInTheDocument();
    const divider = container.querySelector(
      '[data-section="split-pane-divider"]',
    );
    expect(divider).not.toBeNull();
  });

  it('exposes data-section="split-pane" + data-orientation on the root', () => {
    const { container } = render(
      <SplitPane orientation="vertical" start={<i />} end={<i />} />,
    );
    const root = container.querySelector('[data-section="split-pane"]');
    expect(root!.getAttribute('data-orientation')).toBe('vertical');
  });

  it('default orientation is horizontal', () => {
    const { container } = render(<SplitPane start={<i />} end={<i />} />);
    const root = container.querySelector('[data-section="split-pane"]');
    expect(root!.getAttribute('data-orientation')).toBe('horizontal');
  });

  it('divider carries role=separator + aria-orientation + aria-value*', () => {
    render(<SplitPane start={<i />} end={<i />} />);
    const divider = screen.getByRole('separator');
    expect(divider.getAttribute('aria-orientation')).toBe('vertical');
    expect(divider.getAttribute('aria-valuenow')).toBe('50');
    expect(divider.getAttribute('aria-valuemin')).toBe('10');
    expect(divider.getAttribute('aria-valuemax')).toBe('90');
  });

  it('vertical orientation flips aria-orientation', () => {
    render(
      <SplitPane orientation="vertical" start={<i />} end={<i />} />,
    );
    expect(
      screen.getByRole('separator').getAttribute('aria-orientation'),
    ).toBe('horizontal');
  });

  it('default ariaLabel reflects the orientation', () => {
    const { rerender } = render(<SplitPane start={<i />} end={<i />} />);
    expect(
      screen.getByRole('separator').getAttribute('aria-label'),
    ).toBe('Resize panels left/right');
    rerender(<SplitPane orientation="vertical" start={<i />} end={<i />} />);
    expect(
      screen.getByRole('separator').getAttribute('aria-label'),
    ).toBe('Resize panels up/down');
  });

  it('custom dividerAriaLabel wins over the default', () => {
    render(
      <SplitPane
        start={<i />}
        end={<i />}
        dividerAriaLabel="History split"
      />,
    );
    expect(
      screen.getByRole('separator', { name: 'History split' }),
    ).toBeInTheDocument();
  });

  // Helper: jsdom normalises CSS lengths so "25.000%" -> "25%".
  // We compare numerically by parsing the percent back out of the
  // style value rather than asserting on the literal string.
  function basisPct(el: HTMLElement): number {
    const raw = el.style.flexBasis.replace('%', '').trim();
    return Number.parseFloat(raw);
  }

  it('uses defaultRatio for the initial flex-basis of the start pane', () => {
    const { container } = render(
      <SplitPane defaultRatio={0.25} start={<i />} end={<i />} />,
    );
    const startPane = container.querySelector(
      '[data-section="split-pane-start"]',
    ) as HTMLElement;
    expect(basisPct(startPane)).toBeCloseTo(25, 3);
  });

  it('reads the persisted ratio from localStorage on mount', () => {
    window.localStorage.setItem('test-split', '0.75');
    const { container } = render(
      <SplitPane
        storageKey="test-split"
        start={<i />}
        end={<i />}
      />,
    );
    const startPane = container.querySelector(
      '[data-section="split-pane-start"]',
    ) as HTMLElement;
    expect(basisPct(startPane)).toBeCloseTo(75, 3);
  });

  it('falls back to defaultRatio when the stored value is malformed', () => {
    window.localStorage.setItem('test-split', 'not-a-number');
    const { container } = render(
      <SplitPane
        storageKey="test-split"
        defaultRatio={0.3}
        start={<i />}
        end={<i />}
      />,
    );
    const startPane = container.querySelector(
      '[data-section="split-pane-start"]',
    ) as HTMLElement;
    expect(basisPct(startPane)).toBeCloseTo(30, 3);
  });

  it('writes to localStorage when ratio changes via keyboard nudge', async () => {
    const user = userEvent.setup();
    render(
      <SplitPane
        storageKey="test-split"
        defaultRatio={0.5}
        start={<i />}
        end={<i />}
      />,
    );
    const divider = screen.getByRole('separator');
    divider.focus();
    await user.keyboard('{ArrowRight}');
    expect(window.localStorage.getItem('test-split')).toBe('0.55');
  });

  it('ArrowLeft decreases the start-pane ratio by `step`', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SplitPane
        defaultRatio={0.5}
        step={0.1}
        onRatioChange={onChange}
        start={<i />}
        end={<i />}
      />,
    );
    const divider = screen.getByRole('separator');
    divider.focus();
    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith(0.4);
  });

  it('ArrowRight increases the start-pane ratio by `step`', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SplitPane
        defaultRatio={0.5}
        step={0.1}
        onRatioChange={onChange}
        start={<i />}
        end={<i />}
      />,
    );
    const divider = screen.getByRole('separator');
    divider.focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith(0.6);
  });

  it('vertical orientation swaps ArrowUp/Down for the decrease/increase keys', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SplitPane
        orientation="vertical"
        defaultRatio={0.5}
        step={0.1}
        onRatioChange={onChange}
        start={<i />}
        end={<i />}
      />,
    );
    const divider = screen.getByRole('separator');
    divider.focus();
    await user.keyboard('{ArrowDown}');
    expect(onChange).toHaveBeenLastCalledWith(0.6);
    await user.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenLastCalledWith(0.5);
  });

  it('Home jumps ratio to minRatio', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SplitPane
        defaultRatio={0.5}
        minRatio={0.2}
        onRatioChange={onChange}
        start={<i />}
        end={<i />}
      />,
    );
    const divider = screen.getByRole('separator');
    divider.focus();
    await user.keyboard('{Home}');
    expect(onChange).toHaveBeenLastCalledWith(0.2);
  });

  it('End jumps ratio to maxRatio', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SplitPane
        defaultRatio={0.5}
        maxRatio={0.8}
        onRatioChange={onChange}
        start={<i />}
        end={<i />}
      />,
    );
    const divider = screen.getByRole('separator');
    divider.focus();
    await user.keyboard('{End}');
    expect(onChange).toHaveBeenLastCalledWith(0.8);
  });

  it('clamps below minRatio when no snap zone is set', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SplitPane
        defaultRatio={0.15}
        minRatio={0.1}
        step={0.1}
        onRatioChange={onChange}
        start={<i />}
        end={<i />}
      />,
    );
    const divider = screen.getByRole('separator');
    divider.focus();
    await user.keyboard('{ArrowLeft}');
    // 0.15 - 0.1 = 0.05; clamped to minRatio = 0.1.
    expect(onChange).toHaveBeenLastCalledWith(0.1);
  });

  it('snaps to 0 (collapsed) when ratio drops below collapseThreshold', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SplitPane
        defaultRatio={0.15}
        minRatio={0.05}
        step={0.1}
        collapseThreshold={0.1}
        onRatioChange={onChange}
        start={<i />}
        end={<i />}
      />,
    );
    const divider = screen.getByRole('separator');
    divider.focus();
    await user.keyboard('{ArrowLeft}');
    // 0.15 - 0.1 = 0.05 -> below 0.1 threshold -> snap to 0.
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('snaps to 1 (expanded) when ratio crosses expandThreshold', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SplitPane
        defaultRatio={0.85}
        maxRatio={0.95}
        step={0.1}
        expandThreshold={0.9}
        onRatioChange={onChange}
        start={<i />}
        end={<i />}
      />,
    );
    const divider = screen.getByRole('separator');
    divider.focus();
    await user.keyboard('{ArrowRight}');
    // 0.85 + 0.1 = 0.95 -> above 0.9 threshold -> snap to 1.
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('start pane carries data-collapsed=true when ratio is 0', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SplitPane
        defaultRatio={0.15}
        minRatio={0.05}
        step={0.1}
        collapseThreshold={0.1}
        start={<i />}
        end={<i />}
      />,
    );
    const divider = screen.getByRole('separator');
    divider.focus();
    await user.keyboard('{ArrowLeft}');
    const startPane = container.querySelector(
      '[data-section="split-pane-start"]',
    );
    expect(startPane!.getAttribute('data-collapsed')).toBe('true');
  });

  it('end pane carries data-collapsed=true when ratio is 1', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SplitPane
        defaultRatio={0.85}
        maxRatio={0.95}
        step={0.1}
        expandThreshold={0.9}
        start={<i />}
        end={<i />}
      />,
    );
    const divider = screen.getByRole('separator');
    divider.focus();
    await user.keyboard('{ArrowRight}');
    const endPane = container.querySelector(
      '[data-section="split-pane-end"]',
    );
    expect(endPane!.getAttribute('data-collapsed')).toBe('true');
  });

  it('pointer drag updates the ratio based on container width (horizontal)', () => {
    const onChange = vi.fn();
    const { container } = render(
      <SplitPane
        defaultRatio={0.5}
        onRatioChange={onChange}
        start={<i />}
        end={<i />}
      />,
    );
    const divider = container.querySelector(
      '[data-section="split-pane-divider"]',
    ) as HTMLDivElement;
    fireEvent.pointerDown(divider, { pointerId: 1, clientX: 500, clientY: 400 });
    fireEvent.pointerMove(divider, {
      pointerId: 1,
      clientX: 300,
      clientY: 400,
    });
    // 300 / 1000 = 0.30 -> within min/max range.
    expect(onChange).toHaveBeenLastCalledWith(0.3);
    fireEvent.pointerUp(divider, { pointerId: 1 });
  });

  it('pointer drag updates the ratio based on container height (vertical)', () => {
    const onChange = vi.fn();
    const { container } = render(
      <SplitPane
        orientation="vertical"
        defaultRatio={0.5}
        onRatioChange={onChange}
        start={<i />}
        end={<i />}
      />,
    );
    const divider = container.querySelector(
      '[data-section="split-pane-divider"]',
    ) as HTMLDivElement;
    fireEvent.pointerDown(divider, { pointerId: 1, clientX: 0, clientY: 400 });
    fireEvent.pointerMove(divider, { pointerId: 1, clientX: 0, clientY: 200 });
    // 200 / 800 = 0.25 -> within min/max range.
    expect(onChange).toHaveBeenLastCalledWith(0.25);
    fireEvent.pointerUp(divider, { pointerId: 1 });
  });

  it('pointer release flips data-dragging back to false', () => {
    const { container } = render(<SplitPane start={<i />} end={<i />} />);
    const divider = container.querySelector(
      '[data-section="split-pane-divider"]',
    ) as HTMLDivElement;
    fireEvent.pointerDown(divider, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(divider.getAttribute('data-dragging')).toBe('true');
    fireEvent.pointerUp(divider, { pointerId: 1 });
    expect(divider.getAttribute('data-dragging')).toBe('false');
  });

  it('cross-tab storage event re-syncs the ratio', () => {
    const { container } = render(
      <SplitPane storageKey="test-split" defaultRatio={0.5} start={<i />} end={<i />} />,
    );
    window.localStorage.setItem('test-split', '0.75');
    fireEvent(
      window,
      new StorageEvent('storage', { key: 'test-split', newValue: '0.75' }),
    );
    const startPane = container.querySelector(
      '[data-section="split-pane-start"]',
    ) as HTMLElement;
    expect(basisPct(startPane)).toBeCloseTo(75, 3);
  });

  it('merges caller className with the root', () => {
    const { container } = render(
      <SplitPane className="custom-sp" start={<i />} end={<i />} />,
    );
    const root = container.querySelector('[data-section="split-pane"]');
    expect(root!.className).toContain('custom-sp');
    expect(root!.className).toContain('flex');
  });

  it('forwards a ref to the root div', () => {
    const ref = createRef<HTMLDivElement>();
    render(<SplitPane ref={ref} start={<i />} end={<i />} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
