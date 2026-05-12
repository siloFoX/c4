import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { AttachedRole, AttachedSession } from './SessionsView';
import type { AttachProcessState } from '../lib/use-attach-process-state';
import type { CopyPulseState } from '../lib/use-copy-pulse';

// SessionsAttachedRowActions owns two network/clipboard hooks:
//   - useAttachProcessState (30s /api/attach/:name/process poll)
//   - useCopyPulse           (navigator.clipboard + 1500ms flash)
// Both are stubbed via vi.mock so tests drive the per-row branches
// in isolation from network + browser globals. The component also
// holds two useToggle pieces of state (showResume, showDetachConfirm)
// which we exercise via user-event clicks. Role badge / proc-state
// pill / view + resume + detach buttons + the inline confirm strip
// + the resume-cmd preview are all covered.

let procStateValue: AttachProcessState = { status: 'loading' };
const procStateSpy = vi.fn<(args: { name: string }) => AttachProcessState>();

vi.mock('../lib/use-attach-process-state', () => ({
  useAttachProcessState: (args: { name: string }) => {
    procStateSpy(args);
    return procStateValue;
  },
}));

let copyPulseValue: CopyPulseState = {
  copied: false,
  copy: vi.fn(() => Promise.resolve()),
};
const copyPulseSpy = vi.fn<
  (args: { text: string; durationMs?: number }) => CopyPulseState
>();

vi.mock('../lib/use-copy-pulse', () => ({
  useCopyPulse: (args: { text: string; durationMs?: number }) => {
    copyPulseSpy(args);
    return copyPulseValue;
  },
}));

import SessionsAttachedRowActions from './SessionsAttachedRowActions';

function makeSession(over: Partial<AttachedSession> = {}): AttachedSession {
  return {
    name: 'w1',
    jsonlPath: '/var/c4/w1.jsonl',
    sessionId: 'aaaabbbbccccdddd1111',
    projectPath: '/repo/p',
    createdAt: '2026-05-01T00:00:00Z',
    lastOffset: 0,
    role: 'manager',
    ...over,
  };
}

function makeProcState(
  status: AttachProcessState['status'],
  over: Record<string, unknown> = {},
): AttachProcessState {
  switch (status) {
    case 'loading':
      return { status: 'loading' };
    case 'alive':
      return {
        status: 'alive',
        pid: 4242,
        cwd: '/repo/proc',
        match: 'fd',
        multipleCandidates: false,
        ...over,
      } as AttachProcessState;
    case 'idle':
      return { status: 'idle' };
    case 'error':
      return {
        status: 'error',
        message: 'boom',
        ...over,
      } as AttachProcessState;
  }
}

beforeEach(() => {
  setLocale('en');
  procStateValue = makeProcState('idle');
  procStateSpy.mockClear();
  copyPulseValue = {
    copied: false,
    copy: vi.fn(() => Promise.resolve()),
  };
  copyPulseSpy.mockClear();
});

function renderRow(
  overrides: Partial<Parameters<typeof SessionsAttachedRowActions>[0]> = {},
) {
  const onView = vi.fn();
  const onDetach = vi.fn();
  const props = {
    session: makeSession(),
    isSelected: false,
    onView,
    onDetach,
    ...overrides,
  };
  const utils = render(<SessionsAttachedRowActions {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onView, onDetach, props };
}

describe('<SessionsAttachedRowActions>', () => {
  // ---- hook plumbing ---------------------------------------------

  it('forwards the session name into useAttachProcessState', () => {
    renderRow({ session: makeSession({ name: 'aaa' }) });
    expect(procStateSpy).toHaveBeenCalledWith({ name: 'aaa' });
  });

  it('forwards the constructed resume command into useCopyPulse', () => {
    renderRow({ session: makeSession({ sessionId: 'sid-9' }) });
    expect(copyPulseSpy).toHaveBeenCalledWith({
      text: 'claude --resume sid-9',
    });
  });

  it('falls back to the unknown-session-id placeholder when sessionId is null', () => {
    renderRow({ session: makeSession({ sessionId: null }) });
    expect(copyPulseSpy).toHaveBeenCalledWith({
      text: 'claude --resume <unknown-session-id>',
    });
  });

  // ---- role badge ------------------------------------------------

  it('renders the manager role badge with the role string', () => {
    renderRow({ session: makeSession({ role: 'manager' }) });
    expect(
      screen.getByLabelText('Agent role: manager'),
    ).toHaveTextContent('manager');
  });

  it('renders the manager role badge with the primary-tinted class', () => {
    renderRow({ session: makeSession({ role: 'manager' }) });
    const badge = screen.getByLabelText('Agent role: manager');
    expect(badge.className).toMatch(/border-primary/);
  });

  it('renders the worker role badge with the muted class', () => {
    renderRow({ session: makeSession({ role: 'worker' }) });
    const badge = screen.getByLabelText('Agent role: worker');
    expect(badge.className).toMatch(/bg-muted/);
  });

  it('renders the planner role badge with the secondary class', () => {
    renderRow({ session: makeSession({ role: 'planner' }) });
    const badge = screen.getByLabelText('Agent role: planner');
    expect(badge.className).toMatch(/bg-secondary/);
  });

  it('renders the executor role badge with the secondary class', () => {
    renderRow({ session: makeSession({ role: 'executor' }) });
    const badge = screen.getByLabelText('Agent role: executor');
    expect(badge.className).toMatch(/bg-secondary/);
  });

  it('renders the reviewer role badge with the secondary class', () => {
    renderRow({ session: makeSession({ role: 'reviewer' }) });
    const badge = screen.getByLabelText('Agent role: reviewer');
    expect(badge.className).toMatch(/bg-secondary/);
  });

  it('falls back to the generic role badge when role is undefined', () => {
    renderRow({
      session: makeSession({ role: undefined as unknown as AttachedRole }),
    });
    expect(
      screen.getByLabelText('Agent role: generic'),
    ).toHaveTextContent('generic');
  });

  it('sets the role badge title attribute to the detected-role tooltip', () => {
    renderRow({ session: makeSession({ role: 'manager' }) });
    const badge = screen.getByLabelText('Agent role: manager');
    expect(badge).toHaveAttribute('title', 'Detected agent role: manager');
  });

  it('renders the read-only-mirror caption next to the role badge', () => {
    renderRow();
    expect(screen.getByText('read-only mirror')).toBeInTheDocument();
  });

  // ---- proc-state pill (loading / alive / idle / error) ----------

  it('renders the loading proc-state pill with the i18n aria-label', () => {
    procStateValue = makeProcState('loading');
    renderRow();
    expect(
      screen.getByLabelText('Process status: checking'),
    ).toBeInTheDocument();
    expect(screen.getByText('checking')).toBeInTheDocument();
  });

  it('renders the alive proc-state pill with the live-pid copy', () => {
    procStateValue = makeProcState('alive', {
      pid: 4242,
      cwd: '/repo/x',
      match: 'fd',
    });
    renderRow();
    expect(screen.getByText(/live . pid 4242/)).toBeInTheDocument();
  });

  it('renders the alive proc-state pill with the formatted live aria-label', () => {
    procStateValue = makeProcState('alive', {
      pid: 4242,
      cwd: '/repo/x',
      match: 'fd',
    });
    renderRow();
    expect(
      screen.getByLabelText('Live process: pid 4242, fd-matched'),
    ).toBeInTheDocument();
  });

  it('renders the cwd-matched label when match is cwd', () => {
    procStateValue = makeProcState('alive', {
      pid: 7,
      cwd: '/repo/x',
      match: 'cwd',
    });
    renderRow();
    expect(
      screen.getByLabelText('Live process: pid 7, cwd-matched'),
    ).toBeInTheDocument();
  });

  it('appends the + suffix when multipleCandidates is true', () => {
    procStateValue = makeProcState('alive', {
      pid: 7,
      cwd: '/repo/x',
      match: 'fd',
      multipleCandidates: true,
    });
    renderRow();
    expect(screen.getByText(/live . pid 7\+/)).toBeInTheDocument();
  });

  it('includes the matched-by-cwd hint in the title when match is cwd', () => {
    procStateValue = makeProcState('alive', {
      pid: 7,
      cwd: '/repo/x',
      match: 'cwd',
    });
    renderRow();
    const pill = screen.getByLabelText('Live process: pid 7, cwd-matched');
    expect(pill).toHaveAttribute(
      'title',
      'Live claude pid 7 in /repo/x (matched by cwd)',
    );
  });

  it('includes the multiple-candidates hint in the title when set', () => {
    procStateValue = makeProcState('alive', {
      pid: 9,
      cwd: '/repo/y',
      match: 'fd',
      multipleCandidates: true,
    });
    renderRow();
    const pill = screen.getByLabelText('Live process: pid 9, fd-matched');
    expect(pill.getAttribute('title')).toContain('multiple candidates');
  });

  it('renders the idle proc-state pill with the no-live-process copy', () => {
    procStateValue = makeProcState('idle');
    renderRow();
    expect(
      screen.getByLabelText('No live process — exported transcript only'),
    ).toBeInTheDocument();
    expect(screen.getByText('no live process')).toBeInTheDocument();
  });

  it('renders the idle proc-state pill with the tooltip title attribute', () => {
    procStateValue = makeProcState('idle');
    renderRow();
    const pill = screen.getByLabelText(
      'No live process — exported transcript only',
    );
    expect(pill).toHaveAttribute(
      'title',
      'No running claude process owns this JSONL',
    );
  });

  it('renders the error proc-state pill with the lookup-failed copy', () => {
    procStateValue = makeProcState('error', { message: 'EACCES' });
    renderRow();
    expect(
      screen.getByLabelText('Process lookup failed: EACCES'),
    ).toBeInTheDocument();
    expect(screen.getByText('lookup failed')).toBeInTheDocument();
  });

  it('uses the error message as the title attribute on the error pill', () => {
    procStateValue = makeProcState('error', { message: 'EACCES' });
    renderRow();
    const pill = screen.getByLabelText('Process lookup failed: EACCES');
    expect(pill).toHaveAttribute('title', 'EACCES');
  });

  // ---- view button -----------------------------------------------

  it('renders the View button with the i18n aria-label including the worker name', () => {
    renderRow({ session: makeSession({ name: 'demo' }) });
    expect(
      screen.getByRole('button', { name: 'View conversation for demo' }),
    ).toBeInTheDocument();
  });

  it('renders the View button visible label as "View conversation"', () => {
    renderRow();
    const btn = screen.getByRole('button', {
      name: 'View conversation for w1',
    });
    expect(btn).toHaveTextContent('View conversation');
  });

  it('fires onView when the View button is clicked', async () => {
    const { user, onView } = renderRow();
    await user.click(
      screen.getByRole('button', { name: 'View conversation for w1' }),
    );
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it('only fires onView once per View click (no double-fire / no stale closure)', async () => {
    const { user, onView } = renderRow();
    const btn = screen.getByRole('button', {
      name: 'View conversation for w1',
    });
    await user.click(btn);
    await user.click(btn);
    expect(onView).toHaveBeenCalledTimes(2);
  });

  it('does NOT fire onDetach when the View button is clicked', async () => {
    const { user, onDetach } = renderRow();
    await user.click(
      screen.getByRole('button', { name: 'View conversation for w1' }),
    );
    expect(onDetach).not.toHaveBeenCalled();
  });

  // ---- resume toggle + resume-cmd preview ------------------------

  it('renders the Resume button with the i18n aria-label', () => {
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Resume w1 in terminal' }),
    ).toBeInTheDocument();
  });

  it('sets aria-expanded=false on the Resume button initially', () => {
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Resume w1 in terminal' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('does NOT render the resume-cmd preview region initially', () => {
    renderRow();
    expect(
      screen.queryByRole('region', { name: 'Resume command' }),
    ).not.toBeInTheDocument();
  });

  it('flips aria-expanded=true on the Resume button after a click', async () => {
    const { user } = renderRow();
    await user.click(
      screen.getByRole('button', { name: 'Resume w1 in terminal' }),
    );
    expect(
      screen.getByRole('button', { name: 'Resume w1 in terminal' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders the resume-cmd preview region after the Resume click', async () => {
    const { user } = renderRow();
    await user.click(
      screen.getByRole('button', { name: 'Resume w1 in terminal' }),
    );
    expect(
      screen.getByRole('region', { name: 'Resume command' }),
    ).toBeInTheDocument();
  });

  it('renders the resume command text inside the preview region', async () => {
    const { user } = renderRow({
      session: makeSession({ sessionId: 'sid-zzz' }),
    });
    await user.click(
      screen.getByRole('button', { name: 'Resume w1 in terminal' }),
    );
    const region = screen.getByRole('region', { name: 'Resume command' });
    expect(within(region).getByText('claude --resume sid-zzz')).toBeInTheDocument();
  });

  it('uses the unknown-session-id placeholder in the preview when sessionId is null', async () => {
    const { user } = renderRow({
      session: makeSession({ sessionId: null }),
    });
    await user.click(
      screen.getByRole('button', { name: 'Resume w1 in terminal' }),
    );
    expect(
      screen.getByText('claude --resume <unknown-session-id>'),
    ).toBeInTheDocument();
  });

  it('toggles the resume preview closed on a second Resume click', async () => {
    const { user } = renderRow();
    const btn = screen.getByRole('button', {
      name: 'Resume w1 in terminal',
    });
    await user.click(btn);
    expect(
      screen.getByRole('region', { name: 'Resume command' }),
    ).toBeInTheDocument();
    await user.click(btn);
    expect(
      screen.queryByRole('region', { name: 'Resume command' }),
    ).not.toBeInTheDocument();
  });

  it('fires the useCopyPulse copy() handler when the inline copy button is clicked', async () => {
    const copy = vi.fn(() => Promise.resolve());
    copyPulseValue = { copied: false, copy };
    const { user } = renderRow();
    await user.click(
      screen.getByRole('button', { name: 'Resume w1 in terminal' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Copy resume command' }),
    );
    expect(copy).toHaveBeenCalledTimes(1);
  });

  it('renders the "copied" pulse caption when copied is true', async () => {
    copyPulseValue = {
      copied: true,
      copy: vi.fn(() => Promise.resolve()),
    };
    const { user } = renderRow();
    await user.click(
      screen.getByRole('button', { name: 'Resume w1 in terminal' }),
    );
    expect(screen.getByText('copied')).toBeInTheDocument();
  });

  it('does NOT render the "copied" pulse caption when copied is false', async () => {
    copyPulseValue = {
      copied: false,
      copy: vi.fn(() => Promise.resolve()),
    };
    const { user } = renderRow();
    await user.click(
      screen.getByRole('button', { name: 'Resume w1 in terminal' }),
    );
    expect(screen.queryByText('copied')).not.toBeInTheDocument();
  });

  // ---- detach toggle + confirm strip -----------------------------

  it('renders the Detach button with the i18n aria-label', () => {
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Detach w1' }),
    ).toBeInTheDocument();
  });

  it('renders the Detach button with the destructive text class', () => {
    renderRow();
    const btn = screen.getByRole('button', { name: 'Detach w1' });
    expect(btn.className).toMatch(/text-destructive/);
  });

  it('sets aria-expanded=false on the Detach button initially', () => {
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Detach w1' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('omits aria-controls on the Detach button when the confirm strip is closed', () => {
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Detach w1' }),
    ).not.toHaveAttribute('aria-controls');
  });

  it('does NOT render the confirm strip initially', () => {
    renderRow();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does NOT fire onDetach on the first Detach click (it only opens the confirm)', async () => {
    const { user, onDetach } = renderRow();
    await user.click(screen.getByRole('button', { name: 'Detach w1' }));
    expect(onDetach).not.toHaveBeenCalled();
  });

  it('flips aria-expanded=true on the Detach button after a click', async () => {
    const { user } = renderRow();
    await user.click(screen.getByRole('button', { name: 'Detach w1' }));
    expect(
      screen.getByRole('button', { name: 'Detach w1' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders the confirm strip with role="alert" after the Detach click', async () => {
    const { user } = renderRow();
    await user.click(screen.getByRole('button', { name: 'Detach w1' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('sets aria-controls on the Detach button to the confirm strip id', async () => {
    const { user } = renderRow();
    await user.click(screen.getByRole('button', { name: 'Detach w1' }));
    expect(
      screen.getByRole('button', { name: 'Detach w1' }),
    ).toHaveAttribute('aria-controls', 'detach-confirm-w1');
  });

  it('uses a session-name-suffixed id on the confirm strip', async () => {
    const { user } = renderRow({
      session: makeSession({ name: 'demo-x' }),
    });
    await user.click(
      screen.getByRole('button', { name: 'Detach demo-x' }),
    );
    expect(screen.getByRole('alert').id).toBe('detach-confirm-demo-x');
  });

  it('renders the confirm body copy inside the confirm strip', async () => {
    const { user } = renderRow();
    await user.click(screen.getByRole('button', { name: 'Detach w1' }));
    const alert = screen.getByRole('alert');
    expect(
      within(alert).getByText(
        'Remove this session from the c4 list. Your terminal session keeps running — only the read-only mirror is dropped.',
      ),
    ).toBeInTheDocument();
  });

  it('renders the Cancel + confirm-detach buttons inside the confirm strip', async () => {
    const { user } = renderRow();
    await user.click(screen.getByRole('button', { name: 'Detach w1' }));
    expect(
      screen.getByRole('button', { name: 'Cancel detach' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Confirm detach for w1' }),
    ).toBeInTheDocument();
  });

  it('closes the confirm strip on Cancel without firing onDetach', async () => {
    const { user, onDetach } = renderRow();
    await user.click(screen.getByRole('button', { name: 'Detach w1' }));
    await user.click(screen.getByRole('button', { name: 'Cancel detach' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onDetach).not.toHaveBeenCalled();
  });

  it('flips aria-expanded back to false on Cancel', async () => {
    const { user } = renderRow();
    await user.click(screen.getByRole('button', { name: 'Detach w1' }));
    await user.click(screen.getByRole('button', { name: 'Cancel detach' }));
    expect(
      screen.getByRole('button', { name: 'Detach w1' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('fires onDetach exactly once when the confirm-detach button is clicked', async () => {
    const { user, onDetach } = renderRow();
    await user.click(screen.getByRole('button', { name: 'Detach w1' }));
    await user.click(
      screen.getByRole('button', { name: 'Confirm detach for w1' }),
    );
    expect(onDetach).toHaveBeenCalledTimes(1);
  });

  it('fires onDetach with no arguments (the callback is parameter-less)', async () => {
    const { user, onDetach } = renderRow();
    await user.click(screen.getByRole('button', { name: 'Detach w1' }));
    await user.click(
      screen.getByRole('button', { name: 'Confirm detach for w1' }),
    );
    expect(onDetach).toHaveBeenCalledWith();
  });

  it('closes the confirm strip after the confirm-detach button is clicked', async () => {
    const { user } = renderRow();
    await user.click(screen.getByRole('button', { name: 'Detach w1' }));
    await user.click(
      screen.getByRole('button', { name: 'Confirm detach for w1' }),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // ---- isSelected variant + button count -------------------------

  it('renders three primary action buttons (View / Resume / Detach) on initial render', () => {
    renderRow();
    // 3 visible action buttons — none of the conditional strips are open
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('renders six buttons after opening both the resume preview + detach confirm', async () => {
    const { user } = renderRow();
    await user.click(
      screen.getByRole('button', { name: 'Resume w1 in terminal' }),
    );
    await user.click(screen.getByRole('button', { name: 'Detach w1' }));
    // 3 actions + Cancel + Confirm + Copy resume = 6 buttons total
    expect(screen.getAllByRole('button')).toHaveLength(6);
  });

  // ---- keyboard activation ---------------------------------------

  it('fires onView on Enter activation when the View button is focused', async () => {
    const { user, onView } = renderRow();
    const btn = screen.getByRole('button', {
      name: 'View conversation for w1',
    });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it('opens the resume preview on Space activation when the Resume button is focused', async () => {
    const { user } = renderRow();
    const btn = screen.getByRole('button', {
      name: 'Resume w1 in terminal',
    });
    btn.focus();
    await user.keyboard(' ');
    expect(
      screen.getByRole('region', { name: 'Resume command' }),
    ).toBeInTheDocument();
  });

  // ---- rerender stability ----------------------------------------

  it('rerendering with the same props does not duplicate the action buttons', () => {
    const { rerender, props } = renderRow();
    rerender(<SessionsAttachedRowActions {...props} />);
    expect(
      screen.getAllByRole('button', { name: 'View conversation for w1' }),
    ).toHaveLength(1);
  });

  it('preserves the resume-open state across a same-props rerender', async () => {
    const { user, rerender, props } = renderRow();
    await user.click(
      screen.getByRole('button', { name: 'Resume w1 in terminal' }),
    );
    rerender(<SessionsAttachedRowActions {...props} />);
    expect(
      screen.getByRole('region', { name: 'Resume command' }),
    ).toBeInTheDocument();
  });

  // ---- locale flip ------------------------------------------------

  it('re-renders the View button label in Korean when the locale flips', () => {
    renderRow();
    expect(
      screen.getByRole('button', { name: 'View conversation for w1' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: 'View conversation for w1' }),
    ).not.toBeInTheDocument();
  });

  it('re-renders the read-only mirror caption in Korean when the locale flips', () => {
    renderRow();
    expect(screen.getByText('read-only mirror')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('read-only mirror')).not.toBeInTheDocument();
  });
});
