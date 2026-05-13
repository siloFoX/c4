import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { MeetingDetail, MeetingStatus } from './MeetingsView';

// (v1.11.105) MeetingsDetailCardHeader is a composite: a title bar
// plus exactly one of three status-conditional action panels
// (pending / in-progress / completed-or-escalated). Children own
// their own tests. Render thin marker stubs so this test asserts
// composition + prop wiring + the conditional render gates without
// pulling in real run/contrib/fork controls. Mirrors the v1.11.104
// ConversationView / HierarchyTree pattern.

vi.mock('./MeetingsDetailTitleBar', () => ({
  default: ({
    title,
    showStreamingBadge,
    streaming,
  }: {
    title: string;
    showStreamingBadge: boolean;
    streaming: boolean;
  }) => (
    <div
      data-testid="title-bar"
      data-title={title}
      data-show-badge={showStreamingBadge ? 'true' : 'false'}
      data-streaming={streaming ? 'true' : 'false'}
    />
  ),
}));

vi.mock('./MeetingsDetailPendingActions', () => ({
  default: ({ meetingId }: { meetingId: string }) => (
    <div data-testid="pending-actions" data-meeting-id={meetingId} />
  ),
}));

vi.mock('./MeetingsDetailInProgressActions', () => ({
  default: ({
    meetingId,
    contribOpen,
    onContribToggle,
  }: {
    meetingId: string;
    contribOpen: boolean;
    onContribToggle: () => void;
  }) => (
    <div
      data-testid="in-progress-actions"
      data-meeting-id={meetingId}
      data-contrib-open={contribOpen ? 'true' : 'false'}
    >
      <button
        type="button"
        data-testid="in-progress-toggle"
        onClick={onContribToggle}
      >
        toggle contrib
      </button>
    </div>
  ),
}));

vi.mock('./MeetingsDetailCompletedActions', () => ({
  default: ({
    meetingId,
    meetingTitle,
    forkOpen,
    onForkToggle,
    onForkClose,
    onForked,
  }: {
    meetingId: string;
    meetingTitle: string;
    forkOpen: boolean;
    onForkToggle: () => void;
    onForkClose: () => void;
    onForked: (newId: string) => void;
  }) => (
    <div
      data-testid="completed-actions"
      data-meeting-id={meetingId}
      data-meeting-title={meetingTitle}
      data-fork-open={forkOpen ? 'true' : 'false'}
    >
      <button
        type="button"
        data-testid="completed-toggle"
        onClick={onForkToggle}
      >
        toggle fork
      </button>
      <button
        type="button"
        data-testid="completed-close"
        onClick={onForkClose}
      >
        close fork
      </button>
      <button
        type="button"
        data-testid="completed-forked"
        onClick={() => onForked('forked-id')}
      >
        forked
      </button>
    </div>
  ),
}));

import MeetingsDetailCardHeader from './MeetingsDetailCardHeader';

function makeDetail(
  status: MeetingStatus,
  over: Partial<MeetingDetail> = {},
): MeetingDetail {
  return {
    id: 'm-1',
    status,
    track: 'standard',
    title: 'detail-title',
    task: 'discuss the cutover',
    forkOf: null,
    createdAt: '2026-05-13T03:00:00Z',
    startedAt: null,
    completedAt: null,
    currentStage: 'discuss',
    currentRound: 1,
    stages: [],
    transcripts: [],
    ...over,
  };
}

function renderHeader(
  overrides: Partial<Parameters<typeof MeetingsDetailCardHeader>[0]> = {},
) {
  const props = {
    title: 'demo title',
    selectedId: null as string | null,
    detail: null as MeetingDetail | null,
    streaming: false,
    contribOpen: false,
    onContribToggle: vi.fn(),
    forkOpen: false,
    onForkToggle: vi.fn(),
    onForkClose: vi.fn(),
    onForked: vi.fn(),
    ...overrides,
  };
  const utils = render(<MeetingsDetailCardHeader {...props} />);
  return { ...utils, props };
}

beforeEach(() => {
  setLocale('en');
});

describe('<MeetingsDetailCardHeader>', () => {
  it('always renders the TitleBar child marker', () => {
    renderHeader();
    expect(screen.getByTestId('title-bar')).toBeInTheDocument();
  });

  it('forwards title + streaming to the TitleBar', () => {
    renderHeader({ title: 'my-title', streaming: true });
    const bar = screen.getByTestId('title-bar');
    expect(bar).toHaveAttribute('data-title', 'my-title');
    expect(bar).toHaveAttribute('data-streaming', 'true');
  });

  it('passes showStreamingBadge=false to the TitleBar when selectedId is null', () => {
    renderHeader({ selectedId: null });
    expect(screen.getByTestId('title-bar')).toHaveAttribute(
      'data-show-badge',
      'false',
    );
  });

  it('passes showStreamingBadge=true to the TitleBar when selectedId is set', () => {
    renderHeader({ selectedId: 'm-1' });
    expect(screen.getByTestId('title-bar')).toHaveAttribute(
      'data-show-badge',
      'true',
    );
  });

  it('renders no action panel when selectedId is null', () => {
    renderHeader({ selectedId: null, detail: makeDetail('pending') });
    expect(screen.queryByTestId('pending-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('in-progress-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('completed-actions')).not.toBeInTheDocument();
  });

  it('renders no action panel when detail is null', () => {
    renderHeader({ selectedId: 'm-1', detail: null });
    expect(screen.queryByTestId('pending-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('in-progress-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('completed-actions')).not.toBeInTheDocument();
  });

  it('renders the PendingActions panel when detail.status="pending"', () => {
    renderHeader({
      selectedId: 'm-1',
      detail: makeDetail('pending'),
    });
    expect(screen.getByTestId('pending-actions')).toBeInTheDocument();
    expect(screen.queryByTestId('in-progress-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('completed-actions')).not.toBeInTheDocument();
  });

  it('forwards meetingId=selectedId into the PendingActions panel', () => {
    renderHeader({
      selectedId: 'sel-7',
      detail: makeDetail('pending'),
    });
    expect(screen.getByTestId('pending-actions')).toHaveAttribute(
      'data-meeting-id',
      'sel-7',
    );
  });

  it('renders the InProgressActions panel when detail.status="in-progress"', () => {
    renderHeader({
      selectedId: 'm-2',
      detail: makeDetail('in-progress'),
    });
    expect(screen.getByTestId('in-progress-actions')).toBeInTheDocument();
    expect(screen.queryByTestId('pending-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('completed-actions')).not.toBeInTheDocument();
  });

  it('forwards meetingId + contribOpen into the InProgressActions panel', () => {
    renderHeader({
      selectedId: 'sel-9',
      detail: makeDetail('in-progress'),
      contribOpen: true,
    });
    const panel = screen.getByTestId('in-progress-actions');
    expect(panel).toHaveAttribute('data-meeting-id', 'sel-9');
    expect(panel).toHaveAttribute('data-contrib-open', 'true');
  });

  it('fires onContribToggle when the InProgressActions panel toggles', async () => {
    const user = userEvent.setup();
    const onContribToggle = vi.fn();
    renderHeader({
      selectedId: 'm-2',
      detail: makeDetail('in-progress'),
      onContribToggle,
    });
    await user.click(screen.getByTestId('in-progress-toggle'));
    expect(onContribToggle).toHaveBeenCalledTimes(1);
  });

  it('renders the CompletedActions panel when detail.status="completed"', () => {
    renderHeader({
      selectedId: 'm-3',
      detail: makeDetail('completed'),
    });
    expect(screen.getByTestId('completed-actions')).toBeInTheDocument();
    expect(screen.queryByTestId('pending-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('in-progress-actions')).not.toBeInTheDocument();
  });

  it('renders the CompletedActions panel when detail.status="escalated"', () => {
    renderHeader({
      selectedId: 'm-4',
      detail: makeDetail('escalated'),
    });
    expect(screen.getByTestId('completed-actions')).toBeInTheDocument();
  });

  it('does NOT render the CompletedActions panel when detail.status="aborted"', () => {
    renderHeader({
      selectedId: 'm-5',
      detail: makeDetail('aborted'),
    });
    expect(screen.queryByTestId('completed-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pending-actions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('in-progress-actions')).not.toBeInTheDocument();
  });

  it('forwards meetingId + meetingTitle + forkOpen into the CompletedActions panel', () => {
    renderHeader({
      selectedId: 'sel-11',
      detail: makeDetail('completed', { title: 'completed-title' }),
      forkOpen: true,
    });
    const panel = screen.getByTestId('completed-actions');
    expect(panel).toHaveAttribute('data-meeting-id', 'sel-11');
    expect(panel).toHaveAttribute('data-meeting-title', 'completed-title');
    expect(panel).toHaveAttribute('data-fork-open', 'true');
  });

  it('fires onForkToggle / onForkClose / onForked from the CompletedActions panel', async () => {
    const user = userEvent.setup();
    const onForkToggle = vi.fn();
    const onForkClose = vi.fn();
    const onForked = vi.fn();
    renderHeader({
      selectedId: 'm-3',
      detail: makeDetail('completed'),
      onForkToggle,
      onForkClose,
      onForked,
    });
    await user.click(screen.getByTestId('completed-toggle'));
    expect(onForkToggle).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId('completed-close'));
    expect(onForkClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId('completed-forked'));
    expect(onForked).toHaveBeenCalledWith('forked-id');
  });

  it('wraps the children in a CardHeader with the border-b + flex-col classes', () => {
    const { container } = renderHeader();
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('border-b');
    expect(wrapper).toHaveClass('flex-col');
  });

  it('does not fire any callback on initial render', () => {
    const onContribToggle = vi.fn();
    const onForkToggle = vi.fn();
    const onForkClose = vi.fn();
    const onForked = vi.fn();
    renderHeader({
      selectedId: 'm-3',
      detail: makeDetail('completed'),
      onContribToggle,
      onForkToggle,
      onForkClose,
      onForked,
    });
    expect(onContribToggle).not.toHaveBeenCalled();
    expect(onForkToggle).not.toHaveBeenCalled();
    expect(onForkClose).not.toHaveBeenCalled();
    expect(onForked).not.toHaveBeenCalled();
  });

  it('re-renders when the locale flips (useLocale subscription on the wrapper)', () => {
    renderHeader();
    expect(screen.getByTestId('title-bar')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.getByTestId('title-bar')).toBeInTheDocument();
  });
});
