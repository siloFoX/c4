import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { setLocale } from '../lib/i18n';

// (v1.11.106) MeetingsDetailPendingActions is the pending-state
// composite: the auto-path RunControls row on top, and an
// "or manually:" label paired with the StateActions row
// (mode="pending") below. Pure composite with no local state -- the
// component only needs to forward meetingId, the mode literal, and
// the localized label. The child controls own their own tests, so
// mock them with marker stubs and assert composition + row layout
// + label wiring. Mirrors v1.11.105's MeetingsDetailCardHeader
// pattern.

vi.mock('./MeetingsRunControls', () => ({
  default: ({ meetingId }: { meetingId: string }) => (
    <div data-testid="run-controls" data-meeting-id={meetingId} />
  ),
}));

vi.mock('./MeetingsStateActions', () => ({
  default: ({ meetingId, mode }: { meetingId: string; mode: string }) => (
    <div
      data-testid="state-actions"
      data-meeting-id={meetingId}
      data-mode={mode}
    />
  ),
}));

import MeetingsDetailPendingActions from './MeetingsDetailPendingActions';

function renderPanel(
  overrides: Partial<Parameters<typeof MeetingsDetailPendingActions>[0]> = {},
) {
  const props = {
    meetingId: 'm-1',
    ...overrides,
  };
  const utils = render(<MeetingsDetailPendingActions {...props} />);
  return { ...utils, props };
}

beforeEach(() => {
  setLocale('en');
});

describe('<MeetingsDetailPendingActions>', () => {
  it('forwards meetingId into the RunControls child', () => {
    renderPanel({ meetingId: 'mtg-run' });
    expect(screen.getByTestId('run-controls')).toHaveAttribute(
      'data-meeting-id',
      'mtg-run',
    );
  });

  it('forwards meetingId into the StateActions child', () => {
    renderPanel({ meetingId: 'mtg-state' });
    expect(screen.getByTestId('state-actions')).toHaveAttribute(
      'data-meeting-id',
      'mtg-state',
    );
  });

  it('passes mode="pending" to the StateActions child', () => {
    renderPanel();
    expect(screen.getByTestId('state-actions')).toHaveAttribute(
      'data-mode',
      'pending',
    );
  });

  it('renders the localized "or manually:" label', () => {
    renderPanel();
    expect(screen.getByText('or manually:')).toBeInTheDocument();
  });

  it('applies the muted-foreground class to the "or manually:" label', () => {
    renderPanel();
    const label = screen.getByText('or manually:');
    expect(label.className).toMatch(/text-muted-foreground/);
  });

  it('renders exactly one RunControls and one StateActions child', () => {
    renderPanel();
    expect(screen.getAllByTestId('run-controls')).toHaveLength(1);
    expect(screen.getAllByTestId('state-actions')).toHaveLength(1);
  });

  it('wraps both rows in flex-wrap containers (2 row wrappers)', () => {
    const { container } = renderPanel();
    const rows = container.querySelectorAll('div.flex-wrap');
    expect(rows).toHaveLength(2);
  });

  it('puts RunControls in the first row and StateActions in the second row', () => {
    const { container } = renderPanel();
    const rows = container.querySelectorAll('div.flex-wrap');
    expect(rows[0]?.contains(screen.getByTestId('run-controls'))).toBe(true);
    expect(rows[1]?.contains(screen.getByTestId('state-actions'))).toBe(true);
  });

  it('renders cleanly when meetingId is an empty string', () => {
    renderPanel({ meetingId: '' });
    expect(screen.getByTestId('run-controls')).toHaveAttribute(
      'data-meeting-id',
      '',
    );
    expect(screen.getByTestId('state-actions')).toHaveAttribute(
      'data-meeting-id',
      '',
    );
  });

  it('propagates a meetingId update on re-render to both children', () => {
    const { rerender } = renderPanel({ meetingId: 'before' });
    expect(screen.getByTestId('run-controls')).toHaveAttribute(
      'data-meeting-id',
      'before',
    );
    rerender(<MeetingsDetailPendingActions meetingId="after" />);
    expect(screen.getByTestId('run-controls')).toHaveAttribute(
      'data-meeting-id',
      'after',
    );
    expect(screen.getByTestId('state-actions')).toHaveAttribute(
      'data-meeting-id',
      'after',
    );
  });

  it('drops the English "or manually:" label when the locale flips to ko', () => {
    renderPanel();
    expect(screen.getByText('or manually:')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('or manually:')).not.toBeInTheDocument();
  });
});
