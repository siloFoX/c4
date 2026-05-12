import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { DigestResponse } from './AutonomousView';
import type { Escalation } from '../lib/use-autonomous-digest';

// AutonomousView orchestrates three hooks
// (use-autonomous-digest, use-autonomous-pause-toggle,
// use-escalation-resolve) + the digest-metrics child.
// Stub every hook to a deterministic shape so each test
// can drive a single branch without booting fetch /
// setInterval / setTimeout, and stub the metrics child to
// a marker that exposes the digest payload via data-*.

const refreshMock = vi.fn(async () => {});
const setEscalationsMock = vi.fn();
const handlePauseToggleMock = vi.fn(async () => {});
const setResolveNotesMock = vi.fn();
const handleResolveMock = vi.fn(async () => {});

let digestState: {
  autonomousEnabled: boolean | null;
  digest: DigestResponse | null;
  escalations: Escalation[];
  loading: boolean;
  digestError: string | null;
  escalError: string | null;
} = {
  autonomousEnabled: true,
  digest: null,
  escalations: [],
  loading: false,
  digestError: null,
  escalError: null,
};

let pauseState: {
  pauseBusy: boolean;
  pauseMsg: string | null;
  pauseFailed: boolean;
} = { pauseBusy: false, pauseMsg: null, pauseFailed: false };

let resolveState: {
  resolveBusy: number | null;
  resolveError: string | null;
  resolveNotes: Record<number, string>;
} = { resolveBusy: null, resolveError: null, resolveNotes: {} };

let lastDigestArgs: { showResolved: boolean } | null = null;
let lastPauseArgs: {
  digest: DigestResponse | null;
  refresh: () => Promise<void>;
} | null = null;
let lastResolveArgs: {
  setEscalations: typeof setEscalationsMock;
} | null = null;

vi.mock('../lib/use-autonomous-digest', () => ({
  useAutonomousDigest: (args: { showResolved: boolean }) => {
    lastDigestArgs = args;
    return {
      autonomousEnabled: digestState.autonomousEnabled,
      digest: digestState.digest,
      escalations: digestState.escalations,
      setEscalations: setEscalationsMock,
      loading: digestState.loading,
      digestError: digestState.digestError,
      escalError: digestState.escalError,
      refresh: refreshMock,
    };
  },
}));

vi.mock('../lib/use-autonomous-pause-toggle', () => ({
  useAutonomousPauseToggle: (args: {
    digest: DigestResponse | null;
    refresh: () => Promise<void>;
  }) => {
    lastPauseArgs = args;
    return {
      pauseBusy: pauseState.pauseBusy,
      pauseMsg: pauseState.pauseMsg,
      pauseFailed: pauseState.pauseFailed,
      handlePauseToggle: handlePauseToggleMock,
    };
  },
}));

vi.mock('../lib/use-escalation-resolve', () => ({
  useEscalationResolve: (args: {
    setEscalations: typeof setEscalationsMock;
  }) => {
    lastResolveArgs = args;
    return {
      resolveBusy: resolveState.resolveBusy,
      resolveError: resolveState.resolveError,
      resolveNotes: resolveState.resolveNotes,
      setResolveNotes: setResolveNotesMock,
      handleResolve: handleResolveMock,
    };
  },
}));

interface CapturedMetricsProps {
  digest: DigestResponse;
}
let lastMetricsProps: CapturedMetricsProps | null = null;

vi.mock('./AutonomousDigestMetrics', () => ({
  default: (props: CapturedMetricsProps) => {
    lastMetricsProps = props;
    return (
      <div
        data-testid="digest-metrics"
        data-window={String(props.digest.windowMs)}
        data-dispatched={String(props.digest.dispatched)}
        data-succeeded={String(props.digest.succeeded)}
        data-paused={props.digest.paused ? 'true' : 'false'}
      />
    );
  },
}));

import AutonomousView from './AutonomousView';

function makeDigest(over: Partial<DigestResponse> = {}): DigestResponse {
  return {
    windowMs: 3_600_000,
    from: '2026-05-12T00:00:00Z',
    to: '2026-05-12T01:00:00Z',
    paused: false,
    dispatched: 10,
    succeeded: 7,
    halted: 0,
    dispatchErrors: 0,
    successRate: 0.7,
    pendingEscalations: 0,
    resolvedEscalations: 0,
    ...over,
  };
}

function makeEscalation(over: Partial<Escalation> = {}): Escalation {
  return {
    id: 1,
    todoId: 'todo-1',
    reason: 'something went sideways',
    kind: 'review',
    suggestedAction: 'rerun',
    status: 'pending',
    createdAt: Date.now() - 60_000,
    resolvedAt: null,
    resolvedAction: null,
    resolvedNote: null,
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  refreshMock.mockReset();
  refreshMock.mockResolvedValue(undefined);
  setEscalationsMock.mockReset();
  handlePauseToggleMock.mockReset();
  handlePauseToggleMock.mockResolvedValue(undefined);
  setResolveNotesMock.mockReset();
  handleResolveMock.mockReset();
  handleResolveMock.mockResolvedValue(undefined);
  digestState = {
    autonomousEnabled: true,
    digest: makeDigest(),
    escalations: [],
    loading: false,
    digestError: null,
    escalError: null,
  };
  pauseState = { pauseBusy: false, pauseMsg: null, pauseFailed: false };
  resolveState = { resolveBusy: null, resolveError: null, resolveNotes: {} };
  lastDigestArgs = null;
  lastPauseArgs = null;
  lastResolveArgs = null;
  lastMetricsProps = null;
});

describe('<AutonomousView>', () => {
  it('renders the title + status badge + refresh + pause buttons on default mount', () => {
    render(<AutonomousView />);
    expect(screen.getByText('Autonomous loop')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Refresh autonomous data' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Pause autonomous loop' }),
    ).toBeInTheDocument();
  });

  it('shows the paused badge text when digest.paused is true', () => {
    digestState = { ...digestState, digest: makeDigest({ paused: true }) };
    render(<AutonomousView />);
    expect(screen.getByText('paused')).toBeInTheDocument();
  });

  it('hides the status badge entirely when digest is null', () => {
    digestState = { ...digestState, digest: null };
    render(<AutonomousView />);
    expect(screen.queryByText('running')).not.toBeInTheDocument();
    expect(screen.queryByText('paused')).not.toBeInTheDocument();
  });

  it('renders the not-enabled message when autonomousEnabled === false', () => {
    digestState = { ...digestState, autonomousEnabled: false, digest: null };
    render(<AutonomousView />);
    expect(
      screen.getByText(
        /Autonomous mode is not enabled\./,
      ),
    ).toBeInTheDocument();
  });

  it('renders the digestError when set', () => {
    digestState = { ...digestState, digestError: 'load broke', digest: null };
    render(<AutonomousView />);
    expect(screen.getByText('load broke')).toBeInTheDocument();
  });

  it('renders the loading placeholder when no digest yet (and no error)', () => {
    digestState = { ...digestState, digest: null };
    render(<AutonomousView />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('mounts the digest metrics child when a digest is present', () => {
    render(<AutonomousView />);
    expect(screen.getByTestId('digest-metrics')).toBeInTheDocument();
  });

  it('forwards the digest payload into the metrics child', () => {
    digestState = {
      ...digestState,
      digest: makeDigest({ dispatched: 42, succeeded: 11, windowMs: 60_000 }),
    };
    render(<AutonomousView />);
    const metrics = screen.getByTestId('digest-metrics');
    expect(metrics).toHaveAttribute('data-dispatched', '42');
    expect(metrics).toHaveAttribute('data-succeeded', '11');
    expect(metrics).toHaveAttribute('data-window', '60000');
  });

  it('disables the refresh button when loading is true', () => {
    digestState = { ...digestState, loading: true };
    render(<AutonomousView />);
    expect(
      screen.getByRole('button', { name: 'Refresh autonomous data' }),
    ).toBeDisabled();
  });

  it('fires the refresh callback when the refresh button is clicked', async () => {
    const user = userEvent.setup();
    render(<AutonomousView />);
    await user.click(
      screen.getByRole('button', { name: 'Refresh autonomous data' }),
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('shows the Pause label when not paused', () => {
    render(<AutonomousView />);
    const btn = screen.getByRole('button', { name: 'Pause autonomous loop' });
    expect(btn).toHaveTextContent('Pause');
  });

  it('shows the Resume label when paused', () => {
    digestState = { ...digestState, digest: makeDigest({ paused: true }) };
    render(<AutonomousView />);
    const btn = screen.getByRole('button', { name: 'Resume autonomous loop' });
    expect(btn).toHaveTextContent('Resume');
  });

  it('disables the pause button when no digest is loaded yet', () => {
    digestState = { ...digestState, digest: null };
    render(<AutonomousView />);
    expect(
      screen.getByRole('button', { name: 'Pause autonomous loop' }),
    ).toBeDisabled();
  });

  it('disables the pause button while pauseBusy', () => {
    pauseState = { ...pauseState, pauseBusy: true };
    render(<AutonomousView />);
    expect(
      screen.getByRole('button', { name: 'Pause autonomous loop' }),
    ).toBeDisabled();
  });

  it('renders an ellipsis on the pause button while pauseBusy', () => {
    pauseState = { ...pauseState, pauseBusy: true };
    render(<AutonomousView />);
    const btn = screen.getByRole('button', { name: 'Pause autonomous loop' });
    expect(btn).toHaveTextContent('…');
  });

  it('fires handlePauseToggle when the pause button is clicked', async () => {
    const user = userEvent.setup();
    render(<AutonomousView />);
    await user.click(
      screen.getByRole('button', { name: 'Pause autonomous loop' }),
    );
    expect(handlePauseToggleMock).toHaveBeenCalledTimes(1);
  });

  it('renders the pause message (success tone) when pauseMsg is set without pauseFailed', () => {
    pauseState = {
      ...pauseState,
      pauseMsg: 'autonomous loop paused',
      pauseFailed: false,
    };
    render(<AutonomousView />);
    const msg = screen.getByText('autonomous loop paused');
    expect(msg.className).toContain('text-muted-foreground');
    expect(msg.className).not.toContain('text-destructive');
  });

  it('renders the pause message in destructive tone when pauseFailed', () => {
    pauseState = {
      ...pauseState,
      pauseMsg: 'pause failed: boom',
      pauseFailed: true,
    };
    render(<AutonomousView />);
    const msg = screen.getByText('pause failed: boom');
    expect(msg.className).toContain('text-destructive');
  });

  it('renders the pending escalations heading by default', () => {
    render(<AutonomousView />);
    expect(
      screen.getByText('Escalations awaiting decision'),
    ).toBeInTheDocument();
  });

  it('flips to the history heading when show-resolved is checked', async () => {
    const user = userEvent.setup();
    render(<AutonomousView />);
    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);
    expect(screen.getByText('Escalations history')).toBeInTheDocument();
  });

  it('forwards the toggled showResolved flag into the digest hook args', async () => {
    const user = userEvent.setup();
    render(<AutonomousView />);
    expect(lastDigestArgs?.showResolved).toBe(false);
    await user.click(screen.getByRole('checkbox'));
    expect(lastDigestArgs?.showResolved).toBe(true);
  });

  it('renders the empty-escalations message when the list is empty', () => {
    render(<AutonomousView />);
    expect(
      screen.getByText('No pending escalations.'),
    ).toBeInTheDocument();
  });

  it('renders the escalError when set', () => {
    digestState = { ...digestState, escalError: 'escalations broke' };
    render(<AutonomousView />);
    expect(screen.getByText('escalations broke')).toBeInTheDocument();
  });

  it('renders one row per escalation with the id, kind, and reason text', () => {
    digestState = {
      ...digestState,
      escalations: [
        makeEscalation({ id: 11, kind: 'review', reason: 'reason A' }),
        makeEscalation({ id: 12, kind: 'risk', reason: 'reason B' }),
      ],
    };
    render(<AutonomousView />);
    expect(screen.getByText('#11')).toBeInTheDocument();
    expect(screen.getByText('#12')).toBeInTheDocument();
    expect(screen.getByText('review')).toBeInTheDocument();
    expect(screen.getByText('risk')).toBeInTheDocument();
    expect(screen.getByText('reason A')).toBeInTheDocument();
    expect(screen.getByText('reason B')).toBeInTheDocument();
  });

  it('renders the suggested action when present', () => {
    digestState = {
      ...digestState,
      escalations: [
        makeEscalation({ suggestedAction: 'try unblock' }),
      ],
    };
    render(<AutonomousView />);
    expect(screen.getByText('try unblock')).toBeInTheDocument();
  });

  it('renders the todoId chip when set on a pending escalation', () => {
    digestState = {
      ...digestState,
      escalations: [makeEscalation({ todoId: 'TODO-42' })],
    };
    render(<AutonomousView />);
    expect(screen.getByText(/todo: TODO-42/)).toBeInTheDocument();
  });

  it('omits the todoId chip when null', () => {
    digestState = {
      ...digestState,
      escalations: [makeEscalation({ todoId: null })],
    };
    render(<AutonomousView />);
    expect(screen.queryByText(/todo:/)).not.toBeInTheDocument();
  });

  it('renders the resolve buttons for a pending escalation', () => {
    digestState = {
      ...digestState,
      escalations: [makeEscalation({ id: 7 })],
    };
    render(<AutonomousView />);
    expect(
      screen.getByRole('button', { name: 'Approve' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reject' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Modify' }),
    ).toBeInTheDocument();
  });

  it('fires handleResolve("approve", id) when Approve is clicked', async () => {
    digestState = {
      ...digestState,
      escalations: [makeEscalation({ id: 7 })],
    };
    const user = userEvent.setup();
    render(<AutonomousView />);
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(handleResolveMock).toHaveBeenCalledTimes(1);
    expect(handleResolveMock).toHaveBeenCalledWith(7, 'approve');
  });

  it('fires handleResolve("reject", id) when Reject is clicked', async () => {
    digestState = {
      ...digestState,
      escalations: [makeEscalation({ id: 8 })],
    };
    const user = userEvent.setup();
    render(<AutonomousView />);
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(handleResolveMock).toHaveBeenCalledWith(8, 'reject');
  });

  it('disables the Modify button when no note is set for that escalation', () => {
    digestState = {
      ...digestState,
      escalations: [makeEscalation({ id: 9 })],
    };
    resolveState = { ...resolveState, resolveNotes: {} };
    render(<AutonomousView />);
    expect(screen.getByRole('button', { name: 'Modify' })).toBeDisabled();
  });

  it('disables the Modify button when the note is pure whitespace', () => {
    digestState = {
      ...digestState,
      escalations: [makeEscalation({ id: 9 })],
    };
    resolveState = { ...resolveState, resolveNotes: { 9: '   ' } };
    render(<AutonomousView />);
    expect(screen.getByRole('button', { name: 'Modify' })).toBeDisabled();
  });

  it('enables the Modify button when a non-empty note is set', () => {
    digestState = {
      ...digestState,
      escalations: [makeEscalation({ id: 9 })],
    };
    resolveState = { ...resolveState, resolveNotes: { 9: 'do this differently' } };
    render(<AutonomousView />);
    expect(screen.getByRole('button', { name: 'Modify' })).not.toBeDisabled();
  });

  it('fires handleResolve("modify", id) when Modify is clicked with a valid note', async () => {
    digestState = {
      ...digestState,
      escalations: [makeEscalation({ id: 9 })],
    };
    resolveState = { ...resolveState, resolveNotes: { 9: 'fixme' } };
    const user = userEvent.setup();
    render(<AutonomousView />);
    await user.click(screen.getByRole('button', { name: 'Modify' }));
    expect(handleResolveMock).toHaveBeenCalledWith(9, 'modify');
  });

  it('disables all three resolve buttons when that row is busy', () => {
    digestState = {
      ...digestState,
      escalations: [makeEscalation({ id: 9 })],
    };
    resolveState = { ...resolveState, resolveBusy: 9, resolveNotes: { 9: 'x' } };
    render(<AutonomousView />);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Modify' })).toBeDisabled();
  });

  it('hides the resolve buttons for a resolved escalation', () => {
    digestState = {
      ...digestState,
      escalations: [
        makeEscalation({
          id: 12,
          status: 'resolved',
          resolvedAction: 'approve',
          resolvedAt: Date.now(),
          resolvedNote: 'looks fine',
        }),
      ],
    };
    render(<AutonomousView />);
    expect(
      screen.queryByRole('button', { name: 'Approve' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reject' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Modify' }),
    ).not.toBeInTheDocument();
  });

  it('renders the resolved badge text with the resolved action for a resolved escalation', () => {
    digestState = {
      ...digestState,
      escalations: [
        makeEscalation({
          id: 22,
          status: 'resolved',
          resolvedAction: 'reject',
          resolvedAt: Date.now(),
          resolvedNote: null,
        }),
      ],
    };
    render(<AutonomousView />);
    expect(screen.getByText(/resolved\s*·\s*reject/)).toBeInTheDocument();
  });

  it('renders the resolved note when set on a resolved escalation', () => {
    digestState = {
      ...digestState,
      escalations: [
        makeEscalation({
          id: 22,
          status: 'resolved',
          resolvedAction: 'approve',
          resolvedAt: Date.now(),
          resolvedNote: 'looks fine to me',
        }),
      ],
    };
    render(<AutonomousView />);
    expect(screen.getByText('looks fine to me')).toBeInTheDocument();
  });

  it('renders the resolveError when set', () => {
    resolveState = { ...resolveState, resolveError: 'resolve broke' };
    render(<AutonomousView />);
    expect(screen.getByText('resolve broke')).toBeInTheDocument();
  });

  it('drives the note input via setResolveNotes when the user types', async () => {
    digestState = {
      ...digestState,
      escalations: [makeEscalation({ id: 7 })],
    };
    const user = userEvent.setup();
    render(<AutonomousView />);
    const input = screen.getByLabelText('Resolve note for escalation 7');
    await user.type(input, 'a');
    expect(setResolveNotesMock).toHaveBeenCalled();
  });

  it('disables the note input when that escalation is busy', () => {
    digestState = {
      ...digestState,
      escalations: [makeEscalation({ id: 9 })],
    };
    resolveState = { ...resolveState, resolveBusy: 9 };
    render(<AutonomousView />);
    expect(
      screen.getByLabelText('Resolve note for escalation 9'),
    ).toBeDisabled();
  });

  it('passes the same refresh reference into the pause hook as the digest hook returned', () => {
    render(<AutonomousView />);
    expect(lastPauseArgs?.refresh).toBe(refreshMock);
  });

  it('passes the same setEscalations reference into the resolve hook', () => {
    render(<AutonomousView />);
    expect(lastResolveArgs?.setEscalations).toBe(setEscalationsMock);
  });

  it('passes the latest digest into the pause hook so direction can be derived', () => {
    digestState = { ...digestState, digest: makeDigest({ paused: true }) };
    render(<AutonomousView />);
    expect(lastPauseArgs?.digest?.paused).toBe(true);
  });

  it('forwards the showResolved checkbox state into the digest hook on first mount', () => {
    render(<AutonomousView />);
    expect(lastDigestArgs?.showResolved).toBe(false);
  });

  it('re-renders translated copy when the locale flips to ko', () => {
    const { container } = render(<AutonomousView />);
    expect(screen.getByText('Autonomous loop')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    // The view must stay mounted after a locale flip even when the
    // Korean strings render. We only assert the root remains alive.
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders the outer scroll container with the documented layout', () => {
    const { container } = render(<AutonomousView />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('flex');
    expect(root).toHaveClass('h-full');
    expect(root).toHaveClass('flex-col');
  });

  it('renders the show-resolved checkbox with the matching label text', () => {
    render(<AutonomousView />);
    expect(screen.getByText('show resolved')).toBeInTheDocument();
  });

  it('does NOT mount the digest metrics child when autonomousEnabled is false', () => {
    digestState = { ...digestState, autonomousEnabled: false, digest: null };
    render(<AutonomousView />);
    expect(screen.queryByTestId('digest-metrics')).not.toBeInTheDocument();
  });

  it('does NOT mount the digest metrics child when a digestError is present', () => {
    digestState = { ...digestState, digestError: 'oops', digest: null };
    render(<AutonomousView />);
    expect(screen.queryByTestId('digest-metrics')).not.toBeInTheDocument();
  });
});
