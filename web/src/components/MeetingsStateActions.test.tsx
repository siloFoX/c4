import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { MeetingAction } from '../lib/use-meeting-state-action';

// MeetingsStateActions is hook-owning. Stub useMeetingStateAction
// with a per-test-tunable shape so the JSX wiring is exercised in
// isolation from the /api/meetings/:id/<action> POST. Tests cover
// both `mode` branches (pending vs in-progress), the start /
// advance / next-round / escalate / abort buttons, every callback
// payload (including the confirm prompt copy passed to fire()),
// the per-action busy-spinner branch (button disabled + ellipsis
// label), the error span render, and the locale flip.

interface StateActionHookValue {
  busy: MeetingAction | null;
  error: string | null;
  fire: (action: MeetingAction, confirm?: string) => Promise<void>;
}

let hookValue: StateActionHookValue = {
  busy: null,
  error: null,
  fire: vi.fn(() => Promise.resolve()),
};
const hookSpy = vi.fn<(args: { meetingId: string }) => StateActionHookValue>();

vi.mock('../lib/use-meeting-state-action', () => ({
  useMeetingStateAction: (args: { meetingId: string }) => {
    hookSpy(args);
    return hookValue;
  },
}));

import MeetingsStateActions from './MeetingsStateActions';

function makeHookValue(
  over: Partial<StateActionHookValue> = {},
): StateActionHookValue {
  return {
    busy: null,
    error: null,
    fire: vi.fn(() => Promise.resolve()),
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  hookValue = makeHookValue();
  hookSpy.mockClear();
});

describe('<MeetingsStateActions>', () => {
  it('forwards meetingId to useMeetingStateAction', () => {
    render(<MeetingsStateActions meetingId="m-42" mode="pending" />);
    expect(hookSpy).toHaveBeenCalledWith({ meetingId: 'm-42' });
  });

  // ---- mode='pending' ----------------------------------------------

  it('renders only the Start button when mode is pending', () => {
    render(<MeetingsStateActions meetingId="m1" mode="pending" />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('renders the Start button by accessible name from i18n in pending mode', () => {
    render(<MeetingsStateActions meetingId="m1" mode="pending" />);
    expect(
      screen.getByRole('button', {
        name: 'Start meeting (transition to in-progress)',
      }),
    ).toBeInTheDocument();
  });

  it('renders the "Start (manual)" visible label on the Start button', () => {
    render(<MeetingsStateActions meetingId="m1" mode="pending" />);
    const btn = screen.getByRole('button', {
      name: 'Start meeting (transition to in-progress)',
    });
    expect(btn.textContent).toBe('Start (manual)');
  });

  it('wraps the Start button with a Tooltip carrying the start-manual hint', () => {
    render(<MeetingsStateActions meetingId="m1" mode="pending" />);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent(
      'Mark the meeting as in-progress without running. For manual / CLI-driven sessions.',
    );
  });

  it('fires fire("start") when the Start button is clicked', async () => {
    const fire = vi.fn(() => Promise.resolve());
    hookValue = makeHookValue({ fire });
    const user = userEvent.setup();
    render(<MeetingsStateActions meetingId="m1" mode="pending" />);
    await user.click(
      screen.getByRole('button', {
        name: 'Start meeting (transition to in-progress)',
      }),
    );
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith('start');
  });

  it('fires fire("start") on Enter activation of the Start button', async () => {
    const fire = vi.fn(() => Promise.resolve());
    hookValue = makeHookValue({ fire });
    const user = userEvent.setup();
    render(<MeetingsStateActions meetingId="m1" mode="pending" />);
    const btn = screen.getByRole('button', {
      name: 'Start meeting (transition to in-progress)',
    });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(fire).toHaveBeenCalledWith('start');
  });

  it('disables the Start button when busy is "start" and shows the ellipsis label', () => {
    hookValue = makeHookValue({ busy: 'start' });
    render(<MeetingsStateActions meetingId="m1" mode="pending" />);
    const btn = screen.getByRole('button', {
      name: 'Start meeting (transition to in-progress)',
    });
    expect(btn).toBeDisabled();
    expect(btn.textContent).toBe('…');
  });

  it('disables the Start button when any other action is busy', () => {
    hookValue = makeHookValue({ busy: 'advance' });
    render(<MeetingsStateActions meetingId="m1" mode="pending" />);
    const btn = screen.getByRole('button', {
      name: 'Start meeting (transition to in-progress)',
    });
    expect(btn).toBeDisabled();
    // But the visible label remains "Start (manual)" -- only the
    // matching action shows the ellipsis spinner.
    expect(btn.textContent).toBe('Start (manual)');
  });

  it('enables the Start button when busy is null', () => {
    hookValue = makeHookValue({ busy: null });
    render(<MeetingsStateActions meetingId="m1" mode="pending" />);
    expect(
      screen.getByRole('button', {
        name: 'Start meeting (transition to in-progress)',
      }),
    ).toBeEnabled();
  });

  it('does NOT fire on click when the Start button is disabled (busy)', async () => {
    const fire = vi.fn(() => Promise.resolve());
    hookValue = makeHookValue({ busy: 'start', fire });
    const user = userEvent.setup();
    render(<MeetingsStateActions meetingId="m1" mode="pending" />);
    await user.click(
      screen.getByRole('button', {
        name: 'Start meeting (transition to in-progress)',
      }),
    );
    expect(fire).not.toHaveBeenCalled();
  });

  it('renders the error span on the pending branch when error is set', () => {
    hookValue = makeHookValue({ error: 'start failed: bad state' });
    render(<MeetingsStateActions meetingId="m1" mode="pending" />);
    const msg = screen.getByText('start failed: bad state');
    expect(msg).toHaveClass('text-destructive');
  });

  it('does NOT render the error span on the pending branch when error is null', () => {
    hookValue = makeHookValue({ error: null });
    const { container } = render(
      <MeetingsStateActions meetingId="m1" mode="pending" />,
    );
    expect(container.querySelector('.text-destructive')).toBeNull();
  });

  // ---- mode='in-progress' -----------------------------------------

  it('renders four buttons in order on the in-progress branch', () => {
    render(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    const btns = screen.getAllByRole('button');
    expect(btns).toHaveLength(4);
    expect(btns[0].textContent).toBe('Advance');
    expect(btns[1].textContent).toBe('Next round');
    expect(btns[2].textContent).toBe('Escalate');
    expect(btns[3].textContent).toBe('Abort');
  });

  it('does NOT render the Start button on the in-progress branch', () => {
    render(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    expect(
      screen.queryByRole('button', {
        name: 'Start meeting (transition to in-progress)',
      }),
    ).not.toBeInTheDocument();
  });

  it('renders the Advance button by accessible name from i18n', () => {
    render(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    expect(
      screen.getByRole('button', { name: 'Advance to next stage' }),
    ).toBeInTheDocument();
  });

  it('renders the Next-round button by accessible name from i18n', () => {
    render(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    expect(
      screen.getByRole('button', { name: 'Bump round counter' }),
    ).toBeInTheDocument();
  });

  it('renders the Escalate button by accessible name from i18n', () => {
    render(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    expect(
      screen.getByRole('button', { name: 'Escalate meeting' }),
    ).toBeInTheDocument();
  });

  it('renders the Abort button by accessible name from i18n', () => {
    render(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    expect(
      screen.getByRole('button', { name: 'Abort meeting' }),
    ).toBeInTheDocument();
  });

  it('wraps the Advance button with a Tooltip carrying the advance hint', () => {
    render(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    const tip = screen.getByText(
      'Advance to the next stage if consensus is reached',
    );
    expect(tip).toHaveAttribute('role', 'tooltip');
  });

  it('wraps the Next-round button with a Tooltip carrying the next-round hint', () => {
    render(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    const tip = screen.getByText(
      'Bump round counter on the current stage (refused past round cap)',
    );
    expect(tip).toHaveAttribute('role', 'tooltip');
  });

  it('fires fire("advance") with no confirm prompt when Advance is clicked', async () => {
    const fire = vi.fn(() => Promise.resolve());
    hookValue = makeHookValue({ fire });
    const user = userEvent.setup();
    render(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    await user.click(
      screen.getByRole('button', { name: 'Advance to next stage' }),
    );
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith('advance');
  });

  it('fires fire("next-round") with no confirm prompt when Next-round is clicked', async () => {
    const fire = vi.fn(() => Promise.resolve());
    hookValue = makeHookValue({ fire });
    const user = userEvent.setup();
    render(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    await user.click(
      screen.getByRole('button', { name: 'Bump round counter' }),
    );
    expect(fire).toHaveBeenCalledWith('next-round');
  });

  it('fires fire("escalate", <confirm>) with the i18n confirm copy when Escalate is clicked', async () => {
    const fire = vi.fn(() => Promise.resolve());
    hookValue = makeHookValue({ fire });
    const user = userEvent.setup();
    render(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    await user.click(
      screen.getByRole('button', { name: 'Escalate meeting' }),
    );
    expect(fire).toHaveBeenCalledWith(
      'escalate',
      'Mark this meeting as escalated? (round cap or veto deadlock)',
    );
  });

  it('fires fire("abort", <confirm>) with the i18n confirm copy when Abort is clicked', async () => {
    const fire = vi.fn(() => Promise.resolve());
    hookValue = makeHookValue({ fire });
    const user = userEvent.setup();
    render(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    await user.click(
      screen.getByRole('button', { name: 'Abort meeting' }),
    );
    expect(fire).toHaveBeenCalledWith(
      'abort',
      'Abort this meeting? Mutations refused after.',
    );
  });

  it('fires fire("advance") on Enter activation of the Advance button', async () => {
    const fire = vi.fn(() => Promise.resolve());
    hookValue = makeHookValue({ fire });
    const user = userEvent.setup();
    render(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    const btn = screen.getByRole('button', { name: 'Advance to next stage' });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(fire).toHaveBeenCalledWith('advance');
  });

  it('fires fire("abort", <confirm>) on Space activation of the Abort button', async () => {
    const fire = vi.fn(() => Promise.resolve());
    hookValue = makeHookValue({ fire });
    const user = userEvent.setup();
    render(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    const btn = screen.getByRole('button', { name: 'Abort meeting' });
    btn.focus();
    await user.keyboard(' ');
    expect(fire).toHaveBeenCalledWith(
      'abort',
      'Abort this meeting? Mutations refused after.',
    );
  });

  it('shows the ellipsis label on Advance only when busy is "advance"', () => {
    hookValue = makeHookValue({ busy: 'advance' });
    render(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    expect(
      screen.getByRole('button', { name: 'Advance to next stage' }).textContent,
    ).toBe('…');
    expect(
      screen.getByRole('button', { name: 'Bump round counter' }).textContent,
    ).toBe('Next round');
    expect(
      screen.getByRole('button', { name: 'Escalate meeting' }).textContent,
    ).toBe('Escalate');
    expect(
      screen.getByRole('button', { name: 'Abort meeting' }).textContent,
    ).toBe('Abort');
  });

  it('shows the ellipsis label on Next-round only when busy is "next-round"', () => {
    hookValue = makeHookValue({ busy: 'next-round' });
    render(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    expect(
      screen.getByRole('button', { name: 'Bump round counter' }).textContent,
    ).toBe('…');
    expect(
      screen.getByRole('button', { name: 'Advance to next stage' }).textContent,
    ).toBe('Advance');
  });

  it('shows the ellipsis label on Escalate only when busy is "escalate"', () => {
    hookValue = makeHookValue({ busy: 'escalate' });
    render(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    expect(
      screen.getByRole('button', { name: 'Escalate meeting' }).textContent,
    ).toBe('…');
  });

  it('shows the ellipsis label on Abort only when busy is "abort"', () => {
    hookValue = makeHookValue({ busy: 'abort' });
    render(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    expect(
      screen.getByRole('button', { name: 'Abort meeting' }).textContent,
    ).toBe('…');
  });

  it('disables ALL four in-progress buttons when busy is non-null', () => {
    hookValue = makeHookValue({ busy: 'advance' });
    render(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    expect(
      screen.getByRole('button', { name: 'Advance to next stage' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Bump round counter' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Escalate meeting' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Abort meeting' }),
    ).toBeDisabled();
  });

  it('enables ALL four in-progress buttons when busy is null', () => {
    hookValue = makeHookValue({ busy: null });
    render(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    expect(
      screen.getByRole('button', { name: 'Advance to next stage' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Bump round counter' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Escalate meeting' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Abort meeting' }),
    ).toBeEnabled();
  });

  it('does NOT fire on click when the in-progress buttons are disabled (busy)', async () => {
    const fire = vi.fn(() => Promise.resolve());
    hookValue = makeHookValue({ busy: 'advance', fire });
    const user = userEvent.setup();
    render(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    await user.click(
      screen.getByRole('button', { name: 'Bump round counter' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Abort meeting' }),
    );
    expect(fire).not.toHaveBeenCalled();
  });

  it('renders the error span on the in-progress branch when error is set', () => {
    hookValue = makeHookValue({ error: 'abort failed: 409 conflict' });
    render(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    const msg = screen.getByText('abort failed: 409 conflict');
    expect(msg).toHaveClass('text-destructive');
  });

  it('does NOT render the error span on the in-progress branch when error is null', () => {
    hookValue = makeHookValue({ error: null });
    const { container } = render(
      <MeetingsStateActions meetingId="m1" mode="in-progress" />,
    );
    expect(container.querySelector('.text-destructive')).toBeNull();
  });

  it('uses the destructive variant on the Abort button (visual gating)', () => {
    render(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    const abort = screen.getByRole('button', { name: 'Abort meeting' });
    // The shared <Button> primitive applies the bg-destructive class
    // for variant="destructive"; assert by class presence so we don't
    // depend on the exact Tailwind class string.
    expect(abort.className).toMatch(/destructive/);
  });

  // ---- shared / lifecycle -----------------------------------------

  it('does NOT fire on initial render', () => {
    const fire = vi.fn(() => Promise.resolve());
    hookValue = makeHookValue({ fire });
    render(<MeetingsStateActions meetingId="m1" mode="pending" />);
    expect(fire).not.toHaveBeenCalled();
  });

  it('rerendering with the same props does not duplicate fire calls', async () => {
    const fire = vi.fn(() => Promise.resolve());
    hookValue = makeHookValue({ fire });
    const user = userEvent.setup();
    const { rerender } = render(
      <MeetingsStateActions meetingId="m1" mode="pending" />,
    );
    rerender(<MeetingsStateActions meetingId="m1" mode="pending" />);
    await user.click(
      screen.getByRole('button', {
        name: 'Start meeting (transition to in-progress)',
      }),
    );
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('rerendering from pending to in-progress swaps the rendered button set', () => {
    const { rerender } = render(
      <MeetingsStateActions meetingId="m1" mode="pending" />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    rerender(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(
      screen.queryByRole('button', {
        name: 'Start meeting (transition to in-progress)',
      }),
    ).not.toBeInTheDocument();
  });

  it('rerendering from idle to busy flips the visible spinner label on the matched button', () => {
    hookValue = makeHookValue({ busy: null });
    const { rerender } = render(
      <MeetingsStateActions meetingId="m1" mode="in-progress" />,
    );
    expect(
      screen.getByRole('button', { name: 'Advance to next stage' }).textContent,
    ).toBe('Advance');
    hookValue = makeHookValue({ busy: 'advance' });
    rerender(<MeetingsStateActions meetingId="m1" mode="in-progress" />);
    expect(
      screen.getByRole('button', { name: 'Advance to next stage' }).textContent,
    ).toBe('…');
  });

  it('re-renders when the locale flips (useLocale subscription)', () => {
    render(<MeetingsStateActions meetingId="m1" mode="pending" />);
    expect(
      screen.getByRole('button', {
        name: 'Start meeting (transition to in-progress)',
      }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    // After the locale flip the English aria-label is gone -- the
    // Korean bundle overrides the accessible name copy.
    expect(
      screen.queryByRole('button', {
        name: 'Start meeting (transition to in-progress)',
      }),
    ).not.toBeInTheDocument();
  });
});
