import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import RelativeTime from './RelativeTime';

// (v1.11.228) Dedicated coverage for the RelativeTime component.
// Uses vi.useFakeTimers + an explicit `now` prop where determinism
// matters; lets the wall clock drive the auto-refresh test.

const NOW = new Date('2026-05-15T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function offsetIso(deltaMs: number): string {
  return new Date(NOW.getTime() - deltaMs).toISOString();
}

describe('<RelativeTime>', () => {
  it("renders 'just now' for a delta under 30 seconds", () => {
    render(<RelativeTime value={offsetIso(5_000)} now={NOW} />);
    expect(screen.getByText('just now')).toBeInTheDocument();
  });

  it("renders 'N seconds ago' for a delta between 30s and 1min", () => {
    render(<RelativeTime value={offsetIso(45_000)} now={NOW} />);
    expect(screen.getByText('45 seconds ago')).toBeInTheDocument();
  });

  it("renders 'N minutes ago' for a delta in the 1-59 minute range", () => {
    render(<RelativeTime value={offsetIso(7 * 60_000)} now={NOW} />);
    expect(screen.getByText('7 minutes ago')).toBeInTheDocument();
  });

  it("uses the singular 'minute' form for exactly one minute", () => {
    render(<RelativeTime value={offsetIso(60_000)} now={NOW} />);
    expect(screen.getByText('1 minute ago')).toBeInTheDocument();
  });

  it("renders 'N hours ago' for a delta in the 1-23 hour range", () => {
    render(<RelativeTime value={offsetIso(3 * 3_600_000)} now={NOW} />);
    expect(screen.getByText('3 hours ago')).toBeInTheDocument();
  });

  it("renders 'N days ago' for a delta in the 1-29 day range", () => {
    render(<RelativeTime value={offsetIso(5 * 86_400_000)} now={NOW} />);
    expect(screen.getByText('5 days ago')).toBeInTheDocument();
  });

  it("renders 'N months ago' once the delta crosses 30 days", () => {
    render(<RelativeTime value={offsetIso(95 * 86_400_000)} now={NOW} />);
    expect(screen.getByText('3 months ago')).toBeInTheDocument();
  });

  it("renders 'N years ago' once the delta crosses 365 days", () => {
    render(<RelativeTime value={offsetIso(2 * 365 * 86_400_000)} now={NOW} />);
    expect(screen.getByText('2 years ago')).toBeInTheDocument();
  });

  it("renders future tense 'in N minutes' for negative deltas", () => {
    const future = new Date(NOW.getTime() + 5 * 60_000).toISOString();
    render(<RelativeTime value={future} now={NOW} />);
    expect(screen.getByText('in 5 minutes')).toBeInTheDocument();
  });

  it("renders future tense 'in N hours' for a multi-hour negative delta", () => {
    const future = new Date(NOW.getTime() + 4 * 3_600_000).toISOString();
    render(<RelativeTime value={future} now={NOW} />);
    expect(screen.getByText('in 4 hours')).toBeInTheDocument();
  });

  it('puts the ISO string on the dateTime attribute', () => {
    const iso = offsetIso(60_000);
    render(<RelativeTime value={iso} now={NOW} />);
    const node = screen.getByText('1 minute ago');
    expect(node.tagName.toLowerCase()).toBe('time');
    expect(node.getAttribute('datetime')).toBe(iso);
  });

  it('puts the locale string on the title attribute when absoluteOnHover is the default', () => {
    const iso = offsetIso(60_000);
    render(<RelativeTime value={iso} now={NOW} />);
    const node = screen.getByText('1 minute ago');
    expect(node.getAttribute('title')).toBe(new Date(iso).toLocaleString());
  });

  it('omits the title attribute when absoluteOnHover is false', () => {
    const iso = offsetIso(60_000);
    render(<RelativeTime value={iso} now={NOW} absoluteOnHover={false} />);
    const node = screen.getByText('1 minute ago');
    expect(node.getAttribute('title')).toBeNull();
  });

  it('accepts a Date instance as the value prop', () => {
    const dateValue = new Date(NOW.getTime() - 60_000);
    render(<RelativeTime value={dateValue} now={NOW} />);
    expect(screen.getByText('1 minute ago')).toBeInTheDocument();
  });

  it('accepts a number (epoch ms) as the value prop', () => {
    const epoch = NOW.getTime() - 2 * 60_000;
    render(<RelativeTime value={epoch} now={NOW} />);
    expect(screen.getByText('2 minutes ago')).toBeInTheDocument();
  });

  it('renders a fallback when value cannot be parsed as a date', () => {
    render(<RelativeTime value="not a date" now={NOW} />);
    expect(screen.getByText('not a date')).toBeInTheDocument();
  });

  it('auto-refreshes the displayed label as wall time advances', () => {
    // No `now` prop -> the component installs a real timeout off
    // vi.useFakeTimers (which patches setTimeout). Advancing the
    // timer reschedules the tick and re-renders with a new label.
    const start = new Date(NOW.getTime() - 5_000);
    render(<RelativeTime value={start} />);
    expect(screen.getByText('just now')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText(/^1 minute ago$/)).toBeInTheDocument();
  });

  it('clears its scheduled timeout on unmount', () => {
    const start = new Date(NOW.getTime() - 5_000);
    const { unmount } = render(<RelativeTime value={start} />);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
