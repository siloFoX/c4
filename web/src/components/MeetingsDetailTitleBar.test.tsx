import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import MeetingsDetailTitleBar from './MeetingsDetailTitleBar';
import { setLocale } from '../lib/i18n';

// (v1.11.105) Pure display component: meeting title plus an
// optional live/offline streaming badge. No external hooks beyond
// useLocale, so each test renders the bar directly and asserts
// DOM. Mirrors the v1.11.104 ConversationView / HierarchyTree
// pattern (setLocale in beforeEach, locale-flip assertion at the
// end).

beforeEach(() => {
  setLocale('en');
});

function renderBar(
  overrides: Partial<Parameters<typeof MeetingsDetailTitleBar>[0]> = {},
) {
  const props = {
    title: 'demo meeting',
    showStreamingBadge: false,
    streaming: false,
    ...overrides,
  };
  const utils = render(<MeetingsDetailTitleBar {...props} />);
  return { ...utils, props };
}

describe('<MeetingsDetailTitleBar>', () => {
  it('renders the meeting title text inside the CardTitle', () => {
    renderBar({ title: 'kickoff sync' });
    expect(screen.getByText('kickoff sync')).toBeInTheDocument();
  });

  it('does NOT render the streaming badge when showStreamingBadge=false', () => {
    renderBar({ showStreamingBadge: false, streaming: true });
    expect(screen.queryByText('live')).not.toBeInTheDocument();
    expect(screen.queryByText('offline')).not.toBeInTheDocument();
  });

  it('renders the "live" badge label when showStreamingBadge=true + streaming=true', () => {
    renderBar({ showStreamingBadge: true, streaming: true });
    expect(screen.getByText('live')).toBeInTheDocument();
  });

  it('renders the "offline" badge label when showStreamingBadge=true + streaming=false', () => {
    renderBar({ showStreamingBadge: true, streaming: false });
    expect(screen.getByText('offline')).toBeInTheDocument();
  });

  it('sets the live tooltip on the badge when streaming=true', () => {
    renderBar({ showStreamingBadge: true, streaming: true });
    const badge = screen.getByText('live').closest('span');
    expect(badge).not.toBeNull();
    expect(badge).toHaveAttribute('title', 'Receiving live state updates');
  });

  it('sets the offline tooltip on the badge when streaming=false', () => {
    renderBar({ showStreamingBadge: true, streaming: false });
    const badge = screen.getByText('offline').closest('span');
    expect(badge).not.toBeNull();
    expect(badge).toHaveAttribute('title', 'Reconnecting to stream');
  });

  it('marks the badge aria-live=polite so screen readers announce updates', () => {
    renderBar({ showStreamingBadge: true, streaming: true });
    const badge = screen.getByText('live').closest('span');
    expect(badge).toHaveAttribute('aria-live', 'polite');
  });

  it('applies the success-variant border/bg classes to the badge when streaming=true', () => {
    renderBar({ showStreamingBadge: true, streaming: true });
    const badge = screen.getByText('live').closest('span') as HTMLElement;
    expect(badge.className).toMatch(/success/);
    expect(badge.className).not.toMatch(/warning/);
  });

  it('applies the warning-variant border/bg classes to the badge when streaming=false', () => {
    renderBar({ showStreamingBadge: true, streaming: false });
    const badge = screen.getByText('offline').closest('span') as HTMLElement;
    expect(badge.className).toMatch(/warning/);
    expect(badge.className).not.toMatch(/success/);
  });

  it('marks the Radio icon aria-hidden so it does not pollute the accessible name', () => {
    renderBar({ showStreamingBadge: true, streaming: true });
    const badge = screen.getByText('live').closest('span') as HTMLElement;
    const svg = badge.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders an empty title cleanly when title is an empty string', () => {
    const { container } = renderBar({ title: '' });
    const root = container.firstChild as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.className).toMatch(/flex-row/);
  });

  it('keeps the title and badge as siblings in the same row container', () => {
    renderBar({
      title: 'sync',
      showStreamingBadge: true,
      streaming: true,
    });
    const titleEl = screen.getByText('sync');
    const badge = screen.getByText('live').closest('span') as HTMLElement;
    expect(titleEl.parentElement).toBe(badge.parentElement);
  });

  it('re-renders the badge copy in Korean when the locale flips to ko (live)', () => {
    renderBar({ showStreamingBadge: true, streaming: true });
    expect(screen.getByText('live')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('live')).not.toBeInTheDocument();
  });

  it('re-renders the badge copy in Korean when the locale flips to ko (offline)', () => {
    renderBar({ showStreamingBadge: true, streaming: false });
    expect(screen.getByText('offline')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('offline')).not.toBeInTheDocument();
  });
});
