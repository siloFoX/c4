// (v1.11.211) Tests for useAnnounce hook + AnnounceRegion provider.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import { useAnnounce } from './use-announce';
import AnnounceRegion from '../components/AnnounceRegion';
import type { ReactNode } from 'react';

function Wrapper({ children }: { children: ReactNode }) {
  return <AnnounceRegion>{children}</AnnounceRegion>;
}

describe('useAnnounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws without provider', () => {
    // Silence the React error boundary log.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAnnounce())).toThrow(
      /must be used inside an <AnnounceRegion>/,
    );
    spy.mockRestore();
  });

  it('returns a function inside the provider', () => {
    const { result } = renderHook(() => useAnnounce(), { wrapper: Wrapper });
    expect(typeof result.current).toBe('function');
  });

  it('AnnounceRegion mounts both live regions', () => {
    const { container } = render(<AnnounceRegion />);
    const polite = container.querySelector('[data-announce-region="polite"]');
    const assertive = container.querySelector('[data-announce-region="assertive"]');
    expect(polite).not.toBeNull();
    expect(assertive).not.toBeNull();
    expect(polite?.getAttribute('aria-live')).toBe('polite');
    expect(polite?.getAttribute('role')).toBe('status');
    expect(polite?.getAttribute('aria-atomic')).toBe('true');
    expect(assertive?.getAttribute('aria-live')).toBe('assertive');
    expect(assertive?.getAttribute('role')).toBe('alert');
    expect(assertive?.getAttribute('aria-atomic')).toBe('true');
  });

  it('announce(message, "polite") populates the polite region', () => {
    let announceFn: ((msg: string, p?: 'polite' | 'assertive') => void) | null = null;
    function Probe() {
      announceFn = useAnnounce();
      return null;
    }
    const { container } = render(
      <AnnounceRegion>
        <Probe />
      </AnnounceRegion>,
    );
    act(() => {
      announceFn!('hello world', 'polite');
      vi.advanceTimersByTime(50);
    });
    const polite = container.querySelector('[data-announce-region="polite"]');
    const assertive = container.querySelector('[data-announce-region="assertive"]');
    expect(polite?.textContent).toBe('hello world');
    expect(assertive?.textContent).toBe('');
  });

  it('announce(message, "assertive") populates the assertive region', () => {
    let announceFn: ((msg: string, p?: 'polite' | 'assertive') => void) | null = null;
    function Probe() {
      announceFn = useAnnounce();
      return null;
    }
    const { container } = render(
      <AnnounceRegion>
        <Probe />
      </AnnounceRegion>,
    );
    act(() => {
      announceFn!('urgent', 'assertive');
      vi.advanceTimersByTime(50);
    });
    const polite = container.querySelector('[data-announce-region="polite"]');
    const assertive = container.querySelector('[data-announce-region="assertive"]');
    expect(assertive?.textContent).toBe('urgent');
    expect(polite?.textContent).toBe('');
  });

  it('duplicate messages re-announce via clear flicker', () => {
    let announceFn: ((msg: string, p?: 'polite' | 'assertive') => void) | null = null;
    function Probe() {
      announceFn = useAnnounce();
      return null;
    }
    const { container } = render(
      <AnnounceRegion>
        <Probe />
      </AnnounceRegion>,
    );
    act(() => {
      announceFn!('repeated', 'polite');
      vi.advanceTimersByTime(50);
    });
    const polite = container.querySelector('[data-announce-region="polite"]');
    expect(polite?.textContent).toBe('repeated');
    act(() => {
      announceFn!('repeated', 'polite');
    });
    // Mid-flicker: region cleared before re-write.
    expect(polite?.textContent).toBe('');
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(polite?.textContent).toBe('repeated');
  });

  it('defaults priority to polite when omitted', () => {
    let announceFn: ((msg: string, p?: 'polite' | 'assertive') => void) | null = null;
    function Probe() {
      announceFn = useAnnounce();
      return null;
    }
    const { container } = render(
      <AnnounceRegion>
        <Probe />
      </AnnounceRegion>,
    );
    act(() => {
      announceFn!('default-prio');
      vi.advanceTimersByTime(50);
    });
    expect(
      container.querySelector('[data-announce-region="polite"]')?.textContent,
    ).toBe('default-prio');
  });

  it('ignores empty messages', () => {
    let announceFn: ((msg: string, p?: 'polite' | 'assertive') => void) | null = null;
    function Probe() {
      announceFn = useAnnounce();
      return null;
    }
    const { container } = render(
      <AnnounceRegion>
        <Probe />
      </AnnounceRegion>,
    );
    act(() => {
      announceFn!('', 'polite');
      vi.advanceTimersByTime(50);
    });
    expect(
      container.querySelector('[data-announce-region="polite"]')?.textContent,
    ).toBe('');
  });
});
