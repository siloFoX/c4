import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  BackToTop,
  DEFAULT_BACK_TO_TOP_LABEL,
  DEFAULT_BACK_TO_TOP_POSITION,
  DEFAULT_BACK_TO_TOP_THRESHOLD,
  getScrollTop,
  scrollTargetToTop,
  shouldShowBackToTop,
} from './back-to-top';

afterEach(() => {
  cleanup();
});

describe('shouldShowBackToTop', () => {
  it('false below threshold', () => {
    expect(shouldShowBackToTop(100, 200)).toBe(false);
  });
  it('true at threshold (inclusive)', () => {
    expect(shouldShowBackToTop(200, 200)).toBe(true);
  });
  it('true above threshold', () => {
    expect(shouldShowBackToTop(500, 200)).toBe(true);
  });
  it('uses default 200 when threshold omitted', () => {
    expect(shouldShowBackToTop(199)).toBe(false);
    expect(shouldShowBackToTop(200)).toBe(true);
  });
  it('negative threshold treated as 0', () => {
    expect(shouldShowBackToTop(0, -10)).toBe(true);
  });
  it('NaN scrollY -> false', () => {
    expect(shouldShowBackToTop(Number.NaN, 100)).toBe(false);
  });
  it('NaN threshold -> false', () => {
    expect(shouldShowBackToTop(500, Number.NaN)).toBe(false);
  });
});

describe('getScrollTop', () => {
  it('returns 0 for null', () => {
    expect(getScrollTop(null)).toBe(0);
  });
  it('returns 0 for undefined', () => {
    expect(getScrollTop(undefined)).toBe(0);
  });
  it('reads window.scrollY when target is window', () => {
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 750,
    });
    expect(getScrollTop(window)).toBe(750);
  });
  it('reads element.scrollTop when target is HTMLElement', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollTop', {
      configurable: true,
      value: 123,
    });
    expect(getScrollTop(el)).toBe(123);
  });
});

describe('scrollTargetToTop', () => {
  it('no-ops on null', () => {
    expect(() => scrollTargetToTop(null)).not.toThrow();
  });
  it('calls window.scrollTo when target is window', () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    scrollTargetToTop(window, 'smooth');
    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'smooth',
    });
  });
  it('calls element.scrollTo when target is HTMLElement', () => {
    const el = document.createElement('div');
    const scrollTo = vi.fn();
    el.scrollTo = scrollTo as unknown as typeof el.scrollTo;
    scrollTargetToTop(el, 'auto');
    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'auto',
    });
  });
  it('falls back to element.scrollTop = 0 when scrollTo missing', () => {
    const el = document.createElement('div');
    (el as unknown as { scrollTo?: unknown }).scrollTo = undefined;
    el.scrollTop = 500;
    scrollTargetToTop(el, 'smooth');
    expect(el.scrollTop).toBe(0);
  });
});

describe('Constants', () => {
  it('DEFAULT_BACK_TO_TOP_THRESHOLD = 200', () => {
    expect(DEFAULT_BACK_TO_TOP_THRESHOLD).toBe(200);
  });
  it('DEFAULT_BACK_TO_TOP_POSITION = bottom-right', () => {
    expect(DEFAULT_BACK_TO_TOP_POSITION).toBe('bottom-right');
  });
  it('DEFAULT_BACK_TO_TOP_LABEL = "Back to top"', () => {
    expect(DEFAULT_BACK_TO_TOP_LABEL).toBe('Back to top');
  });
});

describe('BackToTop component', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 0,
    });
  });

  it('renders a button with the default ariaLabel', () => {
    render(<BackToTop />);
    expect(
      screen.getByRole('button', { hidden: true }),
    ).toHaveAttribute('aria-label', 'Back to top');
  });

  it('custom ariaLabel reflects on the button', () => {
    render(<BackToTop ariaLabel="Jump up" />);
    expect(
      screen.getByRole('button', { hidden: true }),
    ).toHaveAttribute('aria-label', 'Jump up');
  });

  it('initially hidden when scrollY < threshold', () => {
    render(<BackToTop threshold={200} />);
    const btn = screen.getByRole('button', { hidden: true });
    expect(btn).toHaveAttribute('data-visible', 'false');
  });

  it('initiallyVisible flag forces visible on mount', () => {
    render(<BackToTop initiallyVisible />);
    expect(
      screen.getByRole('button'),
    ).toHaveAttribute('data-visible', 'true');
  });

  it('controlled visible=true overrides internal state', () => {
    render(<BackToTop visible />);
    expect(screen.getByRole('button')).toHaveAttribute(
      'data-visible',
      'true',
    );
  });

  it('controlled visible=false overrides internal state', () => {
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 9999,
    });
    render(<BackToTop visible={false} />);
    expect(
      screen.getByRole('button', { hidden: true }),
    ).toHaveAttribute('data-visible', 'false');
  });

  it('scroll event flips visibility when crossing threshold', () => {
    render(<BackToTop threshold={200} />);
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 500,
    });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(
      screen.getByRole('button'),
    ).toHaveAttribute('data-visible', 'true');
  });

  it('aria-hidden when invisible; absent when visible', () => {
    render(<BackToTop initiallyVisible />);
    const btn = screen.getByRole('button');
    expect(btn).not.toHaveAttribute('aria-hidden');
  });

  it('aria-hidden=true when hidden', () => {
    render(<BackToTop />);
    expect(
      screen.getByRole('button', { hidden: true }),
    ).toHaveAttribute('aria-hidden', 'true');
  });

  it('tabIndex=-1 when hidden, 0 when visible', () => {
    const { rerender } = render(<BackToTop />);
    expect(
      screen.getByRole('button', { hidden: true }).tabIndex,
    ).toBe(-1);
    rerender(<BackToTop visible />);
    expect(screen.getByRole('button').tabIndex).toBe(0);
  });

  it('clicking calls window.scrollTo top=0 smooth', () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    render(<BackToTop initiallyVisible />);
    fireEvent.click(screen.getByRole('button'));
    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'smooth',
    });
  });

  it('scrollBehavior="auto" passes through', () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    render(
      <BackToTop initiallyVisible scrollBehavior="auto" />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'auto',
    });
  });

  it('onClick fires before scroll', () => {
    const onClick = vi.fn();
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    render(
      <BackToTop initiallyVisible onClick={onClick} />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalled();
  });

  it('uncontrolled click optimistically hides the button', () => {
    render(<BackToTop initiallyVisible />);
    fireEvent.click(screen.getByRole('button'));
    expect(
      screen.getByRole('button', { hidden: true }),
    ).toHaveAttribute('data-visible', 'false');
  });

  it('hideOnVisible=false keeps button visible after click', () => {
    render(<BackToTop initiallyVisible hideOnVisible={false} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveAttribute(
      'data-visible',
      'true',
    );
  });

  it('controlled visible never flips internally on click', () => {
    const onClick = vi.fn();
    render(
      <BackToTop visible onClick={onClick} />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveAttribute(
      'data-visible',
      'true',
    );
  });

  it('default icon is rendered (ArrowUp svg)', () => {
    const { container } = render(<BackToTop initiallyVisible />);
    const iconSlot = container.querySelector(
      '[data-section="back-to-top-icon"] svg',
    );
    expect(iconSlot).toBeInTheDocument();
  });

  it('custom icon prop replaces the default icon', () => {
    render(
      <BackToTop
        initiallyVisible
        icon={<span data-testid="custom-icon">UP</span>}
      />,
    );
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('showLabel=true renders the label slot', () => {
    render(
      <BackToTop initiallyVisible showLabel label="Top" />,
    );
    expect(screen.getByText('Top')).toBeInTheDocument();
  });

  it('label hidden by default', () => {
    const { container } = render(<BackToTop initiallyVisible />);
    expect(
      container.querySelector('[data-section="back-to-top-label"]'),
    ).toBeNull();
  });

  it('position prop reflects on data-position', () => {
    render(
      <BackToTop initiallyVisible position="bottom-left" />,
    );
    expect(screen.getByRole('button')).toHaveAttribute(
      'data-position',
      'bottom-left',
    );
  });

  it('default position is bottom-right', () => {
    render(<BackToTop initiallyVisible />);
    expect(screen.getByRole('button')).toHaveAttribute(
      'data-position',
      'bottom-right',
    );
  });

  it('custom scrollTarget (HTMLElement) wires the scroll listener', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const addEventListener = vi.spyOn(container, 'addEventListener');
    render(
      <BackToTop scrollTarget={container} threshold={100} />,
    );
    expect(addEventListener).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
      expect.objectContaining({ passive: true }),
    );
    addEventListener.mockRestore();
    container.remove();
  });

  it('custom scrollTarget HTMLElement: click calls element.scrollTo', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const scrollTo = vi.fn();
    container.scrollTo = scrollTo as unknown as typeof container.scrollTo;
    render(
      <BackToTop
        initiallyVisible
        scrollTarget={container}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'smooth',
    });
    container.remove();
  });

  it('exposes a stable displayName', () => {
    expect(BackToTop.displayName).toBe('BackToTop');
  });

  it('forwards ref to the button', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<BackToTop ref={ref} initiallyVisible />);
    expect(ref.current?.tagName.toLowerCase()).toBe('button');
  });

  it('data-section attrs present on root and icon slot', () => {
    const { container } = render(<BackToTop initiallyVisible />);
    expect(
      container.querySelector('[data-section="back-to-top"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="back-to-top-icon"]'),
    ).toBeInTheDocument();
  });

  it('threshold=0 makes the button visible from scrollY=0', () => {
    render(<BackToTop threshold={0} />);
    expect(screen.getByRole('button')).toHaveAttribute(
      'data-visible',
      'true',
    );
  });
});
