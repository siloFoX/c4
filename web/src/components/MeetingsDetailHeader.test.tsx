import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import MeetingsDetailHeader from './MeetingsDetailHeader';
import { setLocale } from '../lib/i18n';
import type { MeetingStatus } from './MeetingsView';

// (v1.11.105) Pure-display strip rendered above the transcript:
// 4-cell metadata grid (status / track / stage / round) and the
// full task description on the second line. No external hooks
// beyond useLocale, so each test renders the strip directly and
// asserts DOM. Mirrors the v1.11.104 ConversationView /
// HierarchyTree pattern.

beforeEach(() => {
  setLocale('en');
});

function renderHeader(
  overrides: Partial<Parameters<typeof MeetingsDetailHeader>[0]> = {},
) {
  const props = {
    status: 'pending' as MeetingStatus,
    track: 'standard',
    currentStage: 'discuss',
    currentRound: 2,
    task: 'agree on the rollout window for the new auth middleware',
    ...overrides,
  };
  const utils = render(<MeetingsDetailHeader {...props} />);
  return { ...utils, props };
}

describe('<MeetingsDetailHeader>', () => {
  it('renders the localized "Status" label cell', () => {
    renderHeader();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders the localized "Track" label cell', () => {
    renderHeader();
    expect(screen.getByText('Track')).toBeInTheDocument();
  });

  it('renders the localized "Stage" label cell', () => {
    renderHeader();
    expect(screen.getByText('Stage')).toBeInTheDocument();
  });

  it('renders the localized "Round" label cell', () => {
    renderHeader();
    expect(screen.getByText('Round')).toBeInTheDocument();
  });

  it('renders the status value passed in via props', () => {
    renderHeader({ status: 'in-progress' });
    expect(screen.getByText('in-progress')).toBeInTheDocument();
  });

  it('renders the track value passed in via props', () => {
    renderHeader({ track: 'lightweight' });
    expect(screen.getByText('lightweight')).toBeInTheDocument();
  });

  it('renders the currentStage value when it is a non-null string', () => {
    renderHeader({ currentStage: 'finalize' });
    expect(screen.getByText('finalize')).toBeInTheDocument();
  });

  it('falls back to "-" when currentStage is null', () => {
    renderHeader({ currentStage: null });
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('falls back to "-" when currentStage is an empty string', () => {
    renderHeader({ currentStage: '' });
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('renders the currentRound number as text', () => {
    renderHeader({ currentRound: 7 });
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('renders 0 as the round value (does not get coerced to fallback)', () => {
    renderHeader({ currentRound: 0 });
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders the localized "Task:" label next to the task description', () => {
    renderHeader();
    expect(screen.getByText('Task:')).toBeInTheDocument();
  });

  it('renders the task description text on the second line', () => {
    renderHeader({ task: 'compare quotes from vendors A and B' });
    expect(
      screen.getByText(/compare quotes from vendors A and B/),
    ).toBeInTheDocument();
  });

  it('renders an empty task body cleanly without crashing', () => {
    const { container } = renderHeader({ task: '' });
    expect(container.firstChild).not.toBeNull();
    expect(screen.getByText('Task:')).toBeInTheDocument();
  });

  it('renders the metadata cells inside a 4-column grid wrapper at sm and up', () => {
    const { container } = renderHeader();
    const grid = container.querySelector('div.grid') as HTMLElement;
    expect(grid).not.toBeNull();
    expect(grid.className).toMatch(/sm:grid-cols-4/);
    expect(grid.className).toMatch(/grid-cols-2/);
  });

  it('re-renders the labels in Korean when the locale flips to ko', () => {
    renderHeader();
    expect(screen.getByText('Status')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
    expect(screen.getByText('상태')).toBeInTheDocument();
    expect(screen.getByText('트랙')).toBeInTheDocument();
    expect(screen.getByText('단계')).toBeInTheDocument();
    expect(screen.getByText('라운드')).toBeInTheDocument();
    expect(screen.getByText('작업:')).toBeInTheDocument();
  });
});
