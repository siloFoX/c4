import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import GridDebugOverlay from './GridDebugOverlay';

const KEY = 'c4:grid-debug:visible';

function setViewport(width: number, height = 800) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: height,
  });
}

describe('GridDebugOverlay', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setViewport(1280, 800);
    vi.stubEnv('PROD', false as unknown as string);
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders null when import.meta.env.PROD=true', () => {
    vi.stubEnv('PROD', true as unknown as string);
    window.localStorage.setItem(KEY, '1');
    const { container } = render(<GridDebugOverlay />);
    expect(container.firstChild).toBeNull();
  });

  it('renders overlay when dev + localStorage visible=1', () => {
    window.localStorage.setItem(KEY, '1');
    render(<GridDebugOverlay />);
    const overlay = screen.getByTestId('grid-debug-overlay');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    expect(overlay.className).toContain('pointer-events-none');
    // 12 columns
    for (let i = 0; i < 12; i++) {
      expect(screen.getByTestId(`grid-debug-col-${i}`)).toBeInTheDocument();
    }
  });

  it('starts hidden when localStorage is empty, toggles on Cmd+Shift+G', () => {
    const { queryByTestId } = render(<GridDebugOverlay />);
    expect(queryByTestId('grid-debug-overlay')).toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: 'G', metaKey: true, shiftKey: true });
    });
    expect(screen.getByTestId('grid-debug-overlay')).toBeInTheDocument();
    expect(window.localStorage.getItem(KEY)).toBe('1');
    // Toggle off
    act(() => {
      fireEvent.keyDown(window, { key: 'g', metaKey: true, shiftKey: true });
    });
    expect(queryByTestId('grid-debug-overlay')).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBe('0');
  });

  it('Ctrl+Shift+G also toggles (non-Mac)', () => {
    render(<GridDebugOverlay />);
    expect(screen.queryByTestId('grid-debug-overlay')).toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: 'G', ctrlKey: true, shiftKey: true });
    });
    expect(screen.getByTestId('grid-debug-overlay')).toBeInTheDocument();
  });

  it('persists visibility across mount via localStorage', () => {
    window.localStorage.setItem(KEY, '1');
    const { unmount } = render(<GridDebugOverlay />);
    expect(screen.getByTestId('grid-debug-overlay')).toBeInTheDocument();
    unmount();
    render(<GridDebugOverlay />);
    expect(screen.getByTestId('grid-debug-overlay')).toBeInTheDocument();
  });

  it('breakpoint label reflects window.innerWidth', () => {
    window.localStorage.setItem(KEY, '1');
    setViewport(500);
    const { rerender } = render(<GridDebugOverlay />);
    expect(screen.getByTestId('grid-debug-breakpoint').textContent).toBe('xs');

    setViewport(800);
    act(() => {
      fireEvent(window, new Event('resize'));
    });
    rerender(<GridDebugOverlay />);
    expect(screen.getByTestId('grid-debug-breakpoint').textContent).toBe('md');

    setViewport(1600);
    act(() => {
      fireEvent(window, new Event('resize'));
    });
    expect(screen.getByTestId('grid-debug-breakpoint').textContent).toBe('2xl');
  });

  it('viewport pill shows innerWidth x innerHeight', () => {
    window.localStorage.setItem(KEY, '1');
    setViewport(1024, 768);
    render(<GridDebugOverlay />);
    const pill = screen.getByTestId('grid-debug-viewport');
    expect(pill.textContent).toContain('1024x768');
  });
});
