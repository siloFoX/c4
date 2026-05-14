import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale, t } from '../lib/i18n';

// (v1.11.106) MeetingsDetailInProgressActions is the in-progress
// composite: a "manual:" label, a local Contribute toggle Button,
// the state-machine action row (StateActions mode="in-progress"),
// and the always-mounted ContributePanel whose visibility is driven
// by the parent's contribOpen flag. The child controls own their
// own tests, so mock them with marker stubs that expose props via
// data-* attrs and assert composition + Contribute-button surface
// + ContributePanel wiring. Mirrors v1.11.105's
// MeetingsDetailCardHeader pattern.

vi.mock('./MeetingsStateActions', () => ({
  default: ({ meetingId, mode }: { meetingId: string; mode: string }) => (
    <div
      data-testid="state-actions"
      data-meeting-id={meetingId}
      data-mode={mode}
    />
  ),
}));

vi.mock('./MeetingsContributePanel', () => ({
  default: ({ open, meetingId }: { open: boolean; meetingId: string }) => (
    <div
      data-testid="contribute-panel"
      data-open={open ? 'true' : 'false'}
      data-meeting-id={meetingId}
    />
  ),
}));

import MeetingsDetailInProgressActions from './MeetingsDetailInProgressActions';

function renderPanel(
  overrides: Partial<
    Parameters<typeof MeetingsDetailInProgressActions>[0]
  > = {},
) {
  const props = {
    meetingId: 'm-1',
    contribOpen: false,
    onContribToggle: vi.fn(),
    ...overrides,
  };
  const utils = render(<MeetingsDetailInProgressActions {...props} />);
  return { ...utils, props };
}

beforeEach(() => {
  setLocale('en');
});

describe('<MeetingsDetailInProgressActions>', () => {
  it('renders the localized "manual:" label', () => {
    renderPanel();
    expect(screen.getByText('manual:')).toBeInTheDocument();
  });

  it('renders the Contribute-button text from meetings.contributeButton when contribOpen=false', () => {
    renderPanel({ contribOpen: false });
    const btn = screen.getByRole('button', { name: 'Toggle contribute form' });
    expect(btn.textContent).toBe(t('meetings.contributeButton'));
    expect(btn.textContent).not.toContain('Hide');
  });

  it('renders the Contribute-button text "Hide contribute" when contribOpen=true', () => {
    renderPanel({ contribOpen: true });
    const btn = screen.getByRole('button', { name: 'Toggle contribute form' });
    expect(btn).toHaveTextContent('Hide contribute');
  });

  it('sets the Contribute-button aria-label from meetings.contribute.toggle.label', () => {
    renderPanel();
    expect(
      screen.getByRole('button', { name: 'Toggle contribute form' }),
    ).toHaveAttribute('aria-label', 'Toggle contribute form');
  });

  it('wraps the Contribute button with a Tooltip carrying the contribute hint', () => {
    renderPanel();
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent(
      'Post a contribution from a specific specialist',
    );
  });

  it('sets aria-expanded=false on the Contribute button when contribOpen=false', () => {
    renderPanel({ contribOpen: false });
    expect(
      screen.getByRole('button', { name: 'Toggle contribute form' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('sets aria-expanded=true on the Contribute button when contribOpen=true', () => {
    renderPanel({ contribOpen: true });
    expect(
      screen.getByRole('button', { name: 'Toggle contribute form' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('fires onContribToggle exactly once when the Contribute button is clicked', async () => {
    const user = userEvent.setup();
    const onContribToggle = vi.fn();
    renderPanel({ onContribToggle });
    await user.click(
      screen.getByRole('button', { name: 'Toggle contribute form' }),
    );
    expect(onContribToggle).toHaveBeenCalledTimes(1);
  });

  it('forwards meetingId + mode="in-progress" into the StateActions child', () => {
    renderPanel({ meetingId: 'sel-9' });
    const actions = screen.getByTestId('state-actions');
    expect(actions).toHaveAttribute('data-meeting-id', 'sel-9');
    expect(actions).toHaveAttribute('data-mode', 'in-progress');
  });

  it('forwards meetingId + open=false into the ContributePanel when contribOpen=false', () => {
    renderPanel({ meetingId: 'sel-3', contribOpen: false });
    const panel = screen.getByTestId('contribute-panel');
    expect(panel).toHaveAttribute('data-meeting-id', 'sel-3');
    expect(panel).toHaveAttribute('data-open', 'false');
  });

  it('forwards open=true into the ContributePanel when contribOpen=true', () => {
    renderPanel({ contribOpen: true });
    expect(screen.getByTestId('contribute-panel')).toHaveAttribute(
      'data-open',
      'true',
    );
  });

  it('drops the English "manual:" label when the locale flips to ko', () => {
    renderPanel();
    expect(screen.getByText('manual:')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('manual:')).not.toBeInTheDocument();
  });
});
