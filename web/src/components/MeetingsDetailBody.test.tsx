import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { MeetingDetail } from './MeetingsView';
import type { LineageResponse } from './MeetingsLineageStrip';
import type { RecapResponse } from './MeetingsRecapPanel';
import type { ActionItemsResponse } from './MeetingsActionItemsPanel';

// MeetingsDetailBody is a pure composite over five sibling
// components plus three render branches (empty / error /
// loading). Each child owns its own test, so we stub them
// to thin markers and assert the composition + prop wiring
// without booting the JSON-export hook, the lazy lineage
// chain, or the deeply-nested transcript panes.

vi.mock('./MeetingsDetailHeader', () => ({
  default: ({
    status,
    track,
    currentStage,
    currentRound,
    task,
  }: {
    status: string;
    track: string;
    currentStage: string | null;
    currentRound: number;
    task: string;
  }) => (
    <div
      data-testid="detail-header"
      data-status={status}
      data-track={track}
      data-stage={currentStage ?? ''}
      data-round={String(currentRound)}
      data-task={task}
    />
  ),
}));

vi.mock('./MeetingsLineageStrip', () => ({
  default: ({
    lineage,
    currentId,
    onNavigate,
  }: {
    lineage: LineageResponse | null;
    currentId: string;
    onNavigate: (id: string) => void;
  }) => (
    <div
      data-testid="lineage-strip"
      data-current-id={currentId}
      data-has-lineage={lineage ? 'true' : 'false'}
      data-depth={lineage ? String(lineage.depth) : ''}
    >
      <button
        type="button"
        data-testid="lineage-nav"
        onClick={() => onNavigate('jump-target')}
      >
        nav
      </button>
    </div>
  ),
}));

vi.mock('./MeetingsRecapPanel', () => ({
  default: ({ recap }: { recap: RecapResponse | null }) => (
    <div
      data-testid="recap-panel"
      data-has-recap={recap ? 'true' : 'false'}
      data-recap-id={recap ? recap.id : ''}
    />
  ),
}));

vi.mock('./MeetingsActionItemsPanel', () => ({
  default: ({
    actions,
    meetingId,
  }: {
    actions: ActionItemsResponse | null;
    meetingId: string;
  }) => (
    <div
      data-testid="actions-panel"
      data-has-actions={actions ? 'true' : 'false'}
      data-meeting-id={meetingId}
    />
  ),
}));

vi.mock('./MeetingsStagesView', () => ({
  default: ({
    stages,
    transcripts,
  }: {
    stages: unknown[];
    transcripts: unknown[];
  }) => (
    <div
      data-testid="stages-view"
      data-stages-len={String(stages.length)}
      data-transcripts-len={String(transcripts.length)}
    />
  ),
}));

import MeetingsDetailBody from './MeetingsDetailBody';

const SAMPLE_DETAIL: MeetingDetail = {
  id: 'mtg-99',
  status: 'in-progress',
  track: 'standard',
  title: 'Rotate auth secret',
  task: 'Rotate the staging auth secret before Friday',
  forkOf: null,
  createdAt: '2026-05-01T00:00:00Z',
  startedAt: '2026-05-01T00:01:00Z',
  completedAt: null,
  currentStage: 'discuss',
  currentRound: 2,
  stages: [],
  transcripts: [],
};

const SAMPLE_LINEAGE: LineageResponse = {
  rootId: 'mtg-root',
  depth: 3,
  chainTruncated: false,
  chain: [],
};

const SAMPLE_RECAP: RecapResponse = {
  id: 'mtg-99',
  status: 'in-progress',
  stages: [],
  actions: { count: 0, byType: { decision: 0, action: 0, todo: 0, blocker: 0 } },
} as RecapResponse;

const SAMPLE_ACTIONS: ActionItemsResponse = {
  count: 0,
  byType: { decision: 0, action: 0, todo: 0, blocker: 0 },
  items: [],
};

beforeEach(() => {
  setLocale('en');
});

function renderEmpty(
  overrides: Partial<Parameters<typeof MeetingsDetailBody>[0]> = {},
) {
  const props = {
    selectedId: null,
    detailError: null,
    detail: null,
    lineage: null,
    recap: null,
    actions: null,
    onNavigate: vi.fn(),
    ...overrides,
  };
  const utils = render(<MeetingsDetailBody {...props} />);
  return { ...utils, props };
}

function renderLoaded(
  overrides: Partial<Parameters<typeof MeetingsDetailBody>[0]> = {},
) {
  const props = {
    selectedId: 'mtg-99',
    detailError: null,
    detail: SAMPLE_DETAIL,
    lineage: SAMPLE_LINEAGE,
    recap: SAMPLE_RECAP,
    actions: SAMPLE_ACTIONS,
    onNavigate: vi.fn(),
    ...overrides,
  };
  const utils = render(<MeetingsDetailBody {...props} />);
  return { ...utils, props };
}

describe('<MeetingsDetailBody>', () => {
  it('renders the empty-pick copy when selectedId is null', () => {
    renderEmpty();
    expect(
      screen.getByText(
        'Pick a meeting from the list to see its transcript.',
      ),
    ).toBeInTheDocument();
  });

  it('renders an aria-hidden eye glyph in the empty state', () => {
    const { container } = renderEmpty();
    expect(
      container.querySelector('[aria-hidden="true"]'),
    ).not.toBeNull();
  });

  it('does NOT render the detail header in the empty state', () => {
    renderEmpty();
    expect(screen.queryByTestId('detail-header')).not.toBeInTheDocument();
  });

  it('does NOT render the lineage strip in the empty state', () => {
    renderEmpty();
    expect(screen.queryByTestId('lineage-strip')).not.toBeInTheDocument();
  });

  it('does NOT render the recap panel in the empty state', () => {
    renderEmpty();
    expect(screen.queryByTestId('recap-panel')).not.toBeInTheDocument();
  });

  it('does NOT render the actions panel in the empty state', () => {
    renderEmpty();
    expect(screen.queryByTestId('actions-panel')).not.toBeInTheDocument();
  });

  it('does NOT render the stages view in the empty state', () => {
    renderEmpty();
    expect(screen.queryByTestId('stages-view')).not.toBeInTheDocument();
  });

  it('renders the detailError text when an id is selected but the stream errored', () => {
    renderEmpty({
      selectedId: 'mtg-99',
      detailError: 'detail fetch failed (500)',
    });
    expect(
      screen.getByText('detail fetch failed (500)'),
    ).toBeInTheDocument();
  });

  it('applies the destructive tone class to the detail-error banner', () => {
    renderEmpty({
      selectedId: 'mtg-99',
      detailError: 'boom',
    });
    expect(screen.getByText('boom')).toHaveClass('text-destructive');
  });

  it('prefers the error branch over the loading branch when both apply', () => {
    renderEmpty({
      selectedId: 'mtg-99',
      detailError: 'boom',
      detail: null,
    });
    expect(screen.getByText('boom')).toBeInTheDocument();
    expect(screen.queryByText(/Loading meeting/i)).not.toBeInTheDocument();
  });

  it('renders the loading copy when an id is selected but detail has not arrived', () => {
    renderEmpty({ selectedId: 'mtg-99' });
    expect(screen.getByText(/Loading meeting/i)).toBeInTheDocument();
  });

  it('does NOT render the empty-pick copy when an id is selected and loading', () => {
    renderEmpty({ selectedId: 'mtg-99' });
    expect(
      screen.queryByText(
        'Pick a meeting from the list to see its transcript.',
      ),
    ).not.toBeInTheDocument();
  });

  it('renders the detail header in the loaded state', () => {
    renderLoaded();
    expect(screen.getByTestId('detail-header')).toBeInTheDocument();
  });

  it('forwards detail.status / track / currentStage / currentRound / task to the header', () => {
    renderLoaded();
    const header = screen.getByTestId('detail-header');
    expect(header).toHaveAttribute('data-status', 'in-progress');
    expect(header).toHaveAttribute('data-track', 'standard');
    expect(header).toHaveAttribute('data-stage', 'discuss');
    expect(header).toHaveAttribute('data-round', '2');
    expect(header).toHaveAttribute(
      'data-task',
      'Rotate the staging auth secret before Friday',
    );
  });

  it('renders the lineage strip and forwards detail.id as currentId', () => {
    renderLoaded();
    const strip = screen.getByTestId('lineage-strip');
    expect(strip).toHaveAttribute('data-current-id', 'mtg-99');
  });

  it('forwards the lineage payload presence flag to the lineage strip', () => {
    renderLoaded();
    expect(screen.getByTestId('lineage-strip')).toHaveAttribute(
      'data-has-lineage',
      'true',
    );
  });

  it('forwards null lineage as a falsy data attr', () => {
    renderLoaded({ lineage: null });
    expect(screen.getByTestId('lineage-strip')).toHaveAttribute(
      'data-has-lineage',
      'false',
    );
  });

  it('renders the recap panel with the recap payload presence flag', () => {
    renderLoaded();
    expect(screen.getByTestId('recap-panel')).toHaveAttribute(
      'data-has-recap',
      'true',
    );
  });

  it('forwards null recap as a falsy data attr on the recap panel', () => {
    renderLoaded({ recap: null });
    expect(screen.getByTestId('recap-panel')).toHaveAttribute(
      'data-has-recap',
      'false',
    );
  });

  it('renders the actions panel with the actions presence flag', () => {
    renderLoaded();
    expect(screen.getByTestId('actions-panel')).toHaveAttribute(
      'data-has-actions',
      'true',
    );
  });

  it('forwards the selectedId into the actions panel as meetingId', () => {
    renderLoaded();
    expect(screen.getByTestId('actions-panel')).toHaveAttribute(
      'data-meeting-id',
      'mtg-99',
    );
  });

  it('renders the stages view with stage/transcript length data attrs', () => {
    const detail: MeetingDetail = {
      ...SAMPLE_DETAIL,
      stages: [{ stage: 'discuss' }, { stage: 'consensus' }] as MeetingDetail['stages'],
      transcripts: [[]],
    };
    renderLoaded({ detail });
    const stages = screen.getByTestId('stages-view');
    expect(stages).toHaveAttribute('data-stages-len', '2');
    expect(stages).toHaveAttribute('data-transcripts-len', '1');
  });

  it('forwards onNavigate through to the lineage strip', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderLoaded({ onNavigate });
    await user.click(screen.getByTestId('lineage-nav'));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('jump-target');
  });

  it('does NOT render the error or loading copy in the loaded state', () => {
    renderLoaded();
    expect(screen.queryByText(/Loading meeting/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Pick a meeting/i),
    ).not.toBeInTheDocument();
  });

  it('rerendering with the same props does not duplicate the detail header', () => {
    const { rerender, props } = renderLoaded();
    rerender(<MeetingsDetailBody {...props} />);
    expect(screen.getAllByTestId('detail-header')).toHaveLength(1);
  });

  it('keeps the onNavigate identity stable across rerenders with the same hook output', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const { rerender, props } = renderLoaded({ onNavigate });
    rerender(<MeetingsDetailBody {...props} />);
    await user.click(screen.getByTestId('lineage-nav'));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('re-renders translated copy when the locale flips to ko (empty state)', () => {
    renderEmpty();
    expect(
      screen.getByText(
        'Pick a meeting from the list to see its transcript.',
      ),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByText(
        'Pick a meeting from the list to see its transcript.',
      ),
    ).not.toBeInTheDocument();
  });

  it('re-renders translated copy when the locale flips to ko (loading state)', () => {
    renderEmpty({ selectedId: 'mtg-99' });
    expect(screen.getByText(/Loading meeting/i)).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText(/Loading meeting/i)).not.toBeInTheDocument();
  });
});
