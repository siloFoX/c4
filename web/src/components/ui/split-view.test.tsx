import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SplitView } from './split-view';
import { SplitPane } from './split-pane';

beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

// (v1.11.409, TODO 11.391) Force a measurable container so
// the divider math runs in jsdom (which returns zero
// width/height by default).
function mockContainerRect(width: number, height: number): void {
  const orig = HTMLElement.prototype.getBoundingClientRect;
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
  // Cleanup via afterEach of caller (we leave the override
  // in place per-test and restore in cleanup).
  (HTMLElement.prototype.getBoundingClientRect as unknown as {
    __c4Original?: typeof orig;
  }).__c4Original = orig;
}

describe('<SplitView> alias', () => {
  it('exports SplitPane component under the SplitView name', () => {
    expect(SplitView).toBe(SplitPane);
  });

  it('renders identically when used as SplitView', () => {
    render(
      <SplitView
        start={<div data-testid="s">start</div>}
        end={<div data-testid="e">end</div>}
      />,
    );
    expect(screen.getByTestId('s')).toBeInTheDocument();
    expect(screen.getByTestId('e')).toBeInTheDocument();
    expect(
      document.querySelector('[data-section="split-pane"]'),
    ).not.toBeNull();
  });
});

describe('<SplitPane> collapseOnDoubleClick (TODO 11.391)', () => {
  it('default collapseOnDoubleClick=false: dblclick is a no-op', () => {
    render(
      <SplitPane
        defaultRatio={0.4}
        start={<div>a</div>}
        end={<div>b</div>}
      />,
    );
    const divider = screen.getByRole('separator');
    expect(divider.getAttribute('aria-valuenow')).toBe('40');
    fireEvent.doubleClick(divider);
    expect(divider.getAttribute('aria-valuenow')).toBe('40');
    expect(
      divider.getAttribute('data-collapse-on-double-click'),
    ).toBe('false');
  });

  it('collapseOnDoubleClick=true: dblclick collapses the start pane to ratio=0', () => {
    render(
      <SplitPane
        collapseOnDoubleClick
        defaultRatio={0.4}
        start={<div>a</div>}
        end={<div>b</div>}
      />,
    );
    const divider = screen.getByRole('separator');
    expect(divider.getAttribute('data-collapse-on-double-click')).toBe('true');
    fireEvent.doubleClick(divider);
    expect(divider.getAttribute('aria-valuenow')).toBe('0');
  });

  it('collapseOnDoubleClick=true: second dblclick restores the previous ratio', () => {
    render(
      <SplitPane
        collapseOnDoubleClick
        defaultRatio={0.35}
        start={<div>a</div>}
        end={<div>b</div>}
      />,
    );
    const divider = screen.getByRole('separator');
    // First dblclick collapses.
    fireEvent.doubleClick(divider);
    expect(divider.getAttribute('aria-valuenow')).toBe('0');
    // Second dblclick restores to the last open ratio (35%).
    fireEvent.doubleClick(divider);
    expect(divider.getAttribute('aria-valuenow')).toBe('35');
  });

  it('collapseOnDoubleClick=true: restores to defaultRatio when no prior open size', () => {
    // Pre-seed with ratio=0 via storage so the initial open
    // size has never been recorded.
    window.localStorage.setItem('split-key-no-prior', '0');
    render(
      <SplitPane
        storageKey="split-key-no-prior"
        collapseOnDoubleClick
        defaultRatio={0.55}
        start={<div>a</div>}
        end={<div>b</div>}
      />,
    );
    const divider = screen.getByRole('separator');
    expect(divider.getAttribute('aria-valuenow')).toBe('0');
    fireEvent.doubleClick(divider);
    // Restore to defaultRatio (55%).
    expect(divider.getAttribute('aria-valuenow')).toBe('55');
  });

  it('collapse via dblclick persists to localStorage (skipSnap)', () => {
    render(
      <SplitPane
        storageKey="my-split"
        collapseOnDoubleClick
        defaultRatio={0.4}
        start={<div>a</div>}
        end={<div>b</div>}
      />,
    );
    const divider = screen.getByRole('separator');
    fireEvent.doubleClick(divider);
    expect(window.localStorage.getItem('my-split')).toBe('0');
  });

  it('dblclick keyboard nudge between collapses works (Arrow keys still respect min/max)', () => {
    render(
      <SplitPane
        collapseOnDoubleClick
        defaultRatio={0.5}
        minRatio={0.2}
        maxRatio={0.8}
        step={0.1}
        start={<div>a</div>}
        end={<div>b</div>}
      />,
    );
    const divider = screen.getByRole('separator');
    fireEvent.doubleClick(divider);
    expect(divider.getAttribute('aria-valuenow')).toBe('0');
    // ArrowRight grows from 0 by 0.1 -> clamped to minRatio=0.2.
    fireEvent.keyDown(divider, { key: 'ArrowRight' });
    expect(divider.getAttribute('aria-valuenow')).toBe('20');
  });
});

describe('<SplitPane> defaultSizePx (TODO 11.391)', () => {
  it('converts pixel size to ratio on mount using container width', () => {
    mockContainerRect(800, 600);
    render(
      <SplitPane
        defaultSizePx={200}
        start={<div>a</div>}
        end={<div>b</div>}
      />,
    );
    const divider = screen.getByRole('separator');
    // 200 / 800 = 0.25.
    expect(divider.getAttribute('aria-valuenow')).toBe('25');
  });

  it('vertical orientation uses container height for px conversion', () => {
    mockContainerRect(800, 400);
    render(
      <SplitPane
        orientation="vertical"
        defaultSizePx={100}
        start={<div>a</div>}
        end={<div>b</div>}
      />,
    );
    const divider = screen.getByRole('separator');
    // 100 / 400 = 0.25.
    expect(divider.getAttribute('aria-valuenow')).toBe('25');
  });

  it('stored ratio wins over defaultSizePx when storageKey is supplied', () => {
    mockContainerRect(800, 600);
    window.localStorage.setItem('px-vs-stored', '0.6');
    render(
      <SplitPane
        storageKey="px-vs-stored"
        defaultSizePx={100}
        start={<div>a</div>}
        end={<div>b</div>}
      />,
    );
    const divider = screen.getByRole('separator');
    // Stored 0.6 (60%) wins; defaultSizePx is ignored.
    expect(divider.getAttribute('aria-valuenow')).toBe('60');
  });

  it('defaultSizePx clamps to [0, 1] when oversized', () => {
    mockContainerRect(200, 600);
    render(
      <SplitPane
        defaultSizePx={500}
        start={<div>a</div>}
        end={<div>b</div>}
      />,
    );
    const divider = screen.getByRole('separator');
    // 500 / 200 = 2.5 -> clamp to 1.
    expect(divider.getAttribute('aria-valuenow')).toBe('100');
  });

  it('defaultSizePx omitted leaves ratio at defaultRatio (legacy behaviour)', () => {
    mockContainerRect(800, 600);
    render(
      <SplitPane
        defaultRatio={0.5}
        start={<div>a</div>}
        end={<div>b</div>}
      />,
    );
    const divider = screen.getByRole('separator');
    expect(divider.getAttribute('aria-valuenow')).toBe('50');
  });
});

describe('<SplitPane> onSizeChange (TODO 11.391)', () => {
  it('fires alongside onRatioChange with the pixel size', () => {
    mockContainerRect(1000, 600);
    const onSizeChange = vi.fn();
    const onRatioChange = vi.fn();
    render(
      <SplitPane
        defaultRatio={0.5}
        step={0.1}
        minRatio={0.1}
        maxRatio={0.9}
        onRatioChange={onRatioChange}
        onSizeChange={onSizeChange}
        start={<div>a</div>}
        end={<div>b</div>}
      />,
    );
    const divider = screen.getByRole('separator');
    fireEvent.keyDown(divider, { key: 'ArrowRight' });
    // ratio 0.5 + 0.1 = 0.6 -> 0.6 * 1000 = 600px.
    expect(onRatioChange).toHaveBeenCalledWith(0.6);
    expect(onSizeChange).toHaveBeenCalledWith(600);
  });

  it('vertical orientation fires onSizeChange using container height', () => {
    mockContainerRect(800, 400);
    const onSizeChange = vi.fn();
    render(
      <SplitPane
        orientation="vertical"
        defaultRatio={0.25}
        step={0.25}
        minRatio={0.1}
        maxRatio={0.9}
        onSizeChange={onSizeChange}
        start={<div>a</div>}
        end={<div>b</div>}
      />,
    );
    const divider = screen.getByRole('separator');
    fireEvent.keyDown(divider, { key: 'ArrowDown' });
    // ratio 0.25 + 0.25 = 0.5 -> 0.5 * 400 = 200px.
    expect(onSizeChange).toHaveBeenCalledWith(200);
  });

  it('onSizeChange omitted does not throw', () => {
    mockContainerRect(800, 600);
    render(
      <SplitPane
        defaultRatio={0.5}
        start={<div>a</div>}
        end={<div>b</div>}
      />,
    );
    const divider = screen.getByRole('separator');
    expect(() =>
      fireEvent.keyDown(divider, { key: 'ArrowRight' }),
    ).not.toThrow();
  });
});
