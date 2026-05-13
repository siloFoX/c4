import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale, t } from '../lib/i18n';

// (v1.11.106) MeetingsDetailCompletedActions is the composite shown
// for the completed / escalated terminal states: Publish + PeerRetro
// + Retro control rows, a local Fork toggle Button, and the
// always-mounted ForkForm whose visibility is driven by the parent's
// forkOpen flag. The child controls own their own tests, so mock
// them with marker stubs that expose props via data-* attrs and
// assert composition + Fork-button surface + ForkForm wiring.
// Mirrors v1.11.105's MeetingsDetailCardHeader pattern.

vi.mock('./MeetingsPublishControls', () => ({
  default: ({ meetingId }: { meetingId: string }) => (
    <div data-testid="publish-controls" data-meeting-id={meetingId} />
  ),
}));

vi.mock('./MeetingsPeerRetroControls', () => ({
  default: ({ meetingId }: { meetingId: string }) => (
    <div data-testid="peer-retro-controls" data-meeting-id={meetingId} />
  ),
}));

vi.mock('./MeetingsRetroActions', () => ({
  default: ({ meetingId }: { meetingId: string }) => (
    <div data-testid="retro-actions" data-meeting-id={meetingId} />
  ),
}));

vi.mock('./MeetingsForkForm', () => ({
  default: ({
    open,
    meeting,
    busy,
    onClose,
    onForked,
  }: {
    open: boolean;
    meeting: { id: string; title: string };
    busy: boolean;
    onClose: () => void;
    onForked: (newId: string) => void;
  }) => (
    <div
      data-testid="fork-form"
      data-open={open ? 'true' : 'false'}
      data-meeting-id={meeting.id}
      data-meeting-title={meeting.title}
      data-busy={busy ? 'true' : 'false'}
    >
      <button
        type="button"
        data-testid="fork-form-close"
        onClick={onClose}
      >
        close fork form
      </button>
      <button
        type="button"
        data-testid="fork-form-forked"
        onClick={() => onForked('new-id')}
      >
        forked
      </button>
    </div>
  ),
}));

import MeetingsDetailCompletedActions from './MeetingsDetailCompletedActions';

function renderPanel(
  overrides: Partial<Parameters<typeof MeetingsDetailCompletedActions>[0]> = {},
) {
  const props = {
    meetingId: 'm-1',
    meetingTitle: 'demo meeting',
    forkOpen: false,
    onForkToggle: vi.fn(),
    onForkClose: vi.fn(),
    onForked: vi.fn(),
    ...overrides,
  };
  const utils = render(<MeetingsDetailCompletedActions {...props} />);
  return { ...utils, props };
}

beforeEach(() => {
  setLocale('en');
});

describe('<MeetingsDetailCompletedActions>', () => {
  it('forwards meetingId into the PublishControls child', () => {
    renderPanel({ meetingId: 'mtg-pub' });
    expect(screen.getByTestId('publish-controls')).toHaveAttribute(
      'data-meeting-id',
      'mtg-pub',
    );
  });

  it('forwards meetingId into the PeerRetroControls child', () => {
    renderPanel({ meetingId: 'mtg-pr' });
    expect(screen.getByTestId('peer-retro-controls')).toHaveAttribute(
      'data-meeting-id',
      'mtg-pr',
    );
  });

  it('forwards meetingId into the RetroActions child', () => {
    renderPanel({ meetingId: 'mtg-retro' });
    expect(screen.getByTestId('retro-actions')).toHaveAttribute(
      'data-meeting-id',
      'mtg-retro',
    );
  });

  it('renders the Fork-button text from meetings.fork.button when forkOpen=false', () => {
    renderPanel({ forkOpen: false });
    const btn = screen.getByRole('button', { name: 'Fork meeting' });
    expect(btn.textContent).toBe(t('meetings.fork.button'));
    expect(btn.textContent).not.toContain('Cancel');
  });

  it('renders the Fork-button text "Cancel fork" when forkOpen=true', () => {
    renderPanel({ forkOpen: true });
    const btn = screen.getByRole('button', { name: 'Fork meeting' });
    expect(btn).toHaveTextContent('Cancel fork');
  });

  it('sets the Fork-button aria-label from meetings.fork.button.label', () => {
    renderPanel();
    expect(
      screen.getByRole('button', { name: 'Fork meeting' }),
    ).toHaveAttribute('aria-label', 'Fork meeting');
  });

  it('sets the Fork-button tooltip from meetings.tooltip.fork', () => {
    renderPanel();
    expect(
      screen.getByRole('button', { name: 'Fork meeting' }),
    ).toHaveAttribute('title', t('meetings.tooltip.fork'));
  });

  it('sets aria-expanded=false on the Fork button when forkOpen=false', () => {
    renderPanel({ forkOpen: false });
    expect(
      screen.getByRole('button', { name: 'Fork meeting' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('sets aria-expanded=true on the Fork button when forkOpen=true', () => {
    renderPanel({ forkOpen: true });
    expect(
      screen.getByRole('button', { name: 'Fork meeting' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('fires onForkToggle exactly once when the Fork button is clicked', async () => {
    const user = userEvent.setup();
    const onForkToggle = vi.fn();
    renderPanel({ onForkToggle });
    await user.click(screen.getByRole('button', { name: 'Fork meeting' }));
    expect(onForkToggle).toHaveBeenCalledTimes(1);
  });

  it('mounts the ForkForm with open=true when forkOpen=true', () => {
    renderPanel({ forkOpen: true });
    expect(screen.getByTestId('fork-form')).toHaveAttribute(
      'data-open',
      'true',
    );
  });

  it('forwards meeting={id, title} into the ForkForm', () => {
    renderPanel({ meetingId: 'sel-7', meetingTitle: 'kickoff sync' });
    const form = screen.getByTestId('fork-form');
    expect(form).toHaveAttribute('data-meeting-id', 'sel-7');
    expect(form).toHaveAttribute('data-meeting-title', 'kickoff sync');
  });

  it('fires onForkClose when the ForkForm onClose handler fires', async () => {
    const user = userEvent.setup();
    const onForkClose = vi.fn();
    renderPanel({ onForkClose });
    await user.click(screen.getByTestId('fork-form-close'));
    expect(onForkClose).toHaveBeenCalledTimes(1);
  });

  it('fires onForked with the new id when the ForkForm onForked handler fires', async () => {
    const user = userEvent.setup();
    const onForked = vi.fn();
    renderPanel({ onForked });
    await user.click(screen.getByTestId('fork-form-forked'));
    expect(onForked).toHaveBeenCalledWith('new-id');
  });

  it('drops the English Fork-button aria-label when the locale flips to ko', () => {
    renderPanel();
    expect(
      screen.queryByRole('button', { name: 'Fork meeting' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: 'Fork meeting' }),
    ).not.toBeInTheDocument();
  });
});
