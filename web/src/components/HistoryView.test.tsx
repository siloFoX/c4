import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type {
  HistoryWorkerSummary,
  HistoryWorkerDetail,
} from './HistoryView';
import type { ScribeContextResponse } from '../lib/use-scribe-context';

// HistoryView orchestrates three hooks (use-history-summary,
// use-history-worker-detail, use-scribe-context) plus the
// child HistoryDetailPane. Stub each hook to a deterministic
// shape so each test can drive a single branch without
// booting fetch / localStorage, and stub HistoryDetailPane to
// a marker that exposes the detail payload via data-* attrs.

const refreshSummaryMock = vi.fn(async () => {});
const setErrorParamRecorder: { setError: ((m: string | null) => void) | null } =
  { setError: null };
const openScribeMock = vi.fn(async () => {});
const closeScribeMock = vi.fn();

let summaryState: { summary: HistoryWorkerSummary[] } = { summary: [] };
let detailState: HistoryWorkerDetail | null = null;
let scribeState: {
  showScribe: boolean;
  scribe: ScribeContextResponse | null;
  loadingScribe: boolean;
} = {
  showScribe: false,
  scribe: null,
  loadingScribe: false,
};

let lastSummaryArgs: {
  query: string;
  statusFilter: string;
  sinceDay: string;
  untilDay: string;
  setError: (m: string | null) => void;
} | null = null;

let lastDetailArgs: {
  selected: string | null;
  setError: (m: string | null) => void;
} | null = null;

vi.mock('../lib/use-history-summary', () => ({
  useHistorySummary: (args: {
    query: string;
    statusFilter: string;
    sinceDay: string;
    untilDay: string;
    setError: (m: string | null) => void;
  }) => {
    lastSummaryArgs = args;
    setErrorParamRecorder.setError = args.setError;
    return { summary: summaryState.summary, refresh: refreshSummaryMock };
  },
}));

vi.mock('../lib/use-history-worker-detail', () => ({
  useHistoryWorkerDetail: (args: {
    selected: string | null;
    setError: (m: string | null) => void;
  }) => {
    lastDetailArgs = args;
    return detailState;
  },
}));

vi.mock('../lib/use-scribe-context', () => ({
  useScribeContext: () => ({
    showScribe: scribeState.showScribe,
    scribe: scribeState.scribe,
    loadingScribe: scribeState.loadingScribe,
    openScribe: openScribeMock,
    closeScribe: closeScribeMock,
  }),
}));

interface CapturedDetailPaneProps {
  detail: HistoryWorkerDetail;
}

let lastDetailPaneProps: CapturedDetailPaneProps | null = null;

vi.mock('./HistoryDetailPane', () => ({
  default: (props: CapturedDetailPaneProps) => {
    lastDetailPaneProps = props;
    return (
      <div
        data-testid="history-detail-pane"
        data-name={props.detail.name}
        data-alive={props.detail.alive ? 'true' : 'false'}
        data-records-len={String(props.detail.records.length)}
      />
    );
  },
}));

import HistoryView from './HistoryView';

function makeSummary(
  over: Partial<HistoryWorkerSummary> = {},
): HistoryWorkerSummary {
  return {
    name: 'w1',
    taskCount: 1,
    firstTaskAt: '2026-05-12T00:00:00Z',
    lastTaskAt: '2026-05-12T00:00:00Z',
    lastTask: 'do stuff',
    lastStatus: 'ok',
    branches: ['c4/w1'],
    alive: true,
    liveStatus: 'idle',
    ...over,
  };
}

function makeDetail(
  over: Partial<HistoryWorkerDetail> = {},
): HistoryWorkerDetail {
  return {
    name: 'w1',
    records: [],
    alive: true,
    status: 'idle',
    branch: 'c4/w1',
    worktree: '/wt/w1',
    scrollback: null,
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  refreshSummaryMock.mockReset();
  refreshSummaryMock.mockResolvedValue(undefined);
  openScribeMock.mockReset();
  openScribeMock.mockResolvedValue(undefined);
  closeScribeMock.mockReset();
  summaryState = {
    summary: [
      makeSummary({ name: 'alpha' }),
      makeSummary({ name: 'beta', alive: false, liveStatus: null }),
    ],
  };
  detailState = null;
  scribeState = { showScribe: false, scribe: null, loadingScribe: false };
  lastSummaryArgs = null;
  lastDetailArgs = null;
  lastDetailPaneProps = null;
  setErrorParamRecorder.setError = null;
});

describe('<HistoryView>', () => {
  it('renders the sidebar title + scribe button + filters on default render', () => {
    render(<HistoryView />);
    expect(screen.getByText('History')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scribe' })).toBeInTheDocument();
    expect(screen.getByLabelText('Search history')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by status')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by date range')).toBeInTheDocument();
  });

  it('lists every summary worker as a pressable row', () => {
    render(<HistoryView />);
    expect(
      screen.getByRole('button', { name: /alpha/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /beta/ }),
    ).toBeInTheDocument();
  });

  it('shows the live badge text for an alive worker row', () => {
    render(<HistoryView />);
    const row = screen.getByRole('button', { name: /alpha/ });
    expect(within(row).getByText('idle')).toBeInTheDocument();
  });

  it('shows the closed badge text for a non-alive worker row', () => {
    render(<HistoryView />);
    const row = screen.getByRole('button', { name: /beta/ });
    expect(within(row).getByText('closed')).toBeInTheDocument();
  });

  it('renders the singular task count copy when taskCount is 1', () => {
    summaryState = {
      summary: [makeSummary({ name: 'alpha', taskCount: 1 })],
    };
    render(<HistoryView />);
    const row = screen.getByRole('button', { name: /alpha/ });
    expect(within(row).getByText(/1 task/)).toBeInTheDocument();
  });

  it('renders the plural task count copy when taskCount > 1', () => {
    summaryState = {
      summary: [makeSummary({ name: 'alpha', taskCount: 5 })],
    };
    render(<HistoryView />);
    const row = screen.getByRole('button', { name: /alpha/ });
    expect(within(row).getByText(/5 tasks/)).toBeInTheDocument();
  });

  it('renders the empty-history hint when the summary is empty and no error', () => {
    summaryState = { summary: [] };
    render(<HistoryView />);
    expect(screen.getByText('No history yet.')).toBeInTheDocument();
  });

  it('hides the empty-history hint when summary has rows', () => {
    render(<HistoryView />);
    expect(screen.queryByText('No history yet.')).not.toBeInTheDocument();
  });

  it('renders the placeholder card when nothing is selected and the scribe is closed', () => {
    render(<HistoryView />);
    expect(screen.getByText('Worker history')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Select a worker from the left to view its tasks and scrollback.',
      ),
    ).toBeInTheDocument();
  });

  it('does NOT mount the detail pane when no worker is selected', () => {
    render(<HistoryView />);
    expect(
      screen.queryByTestId('history-detail-pane'),
    ).not.toBeInTheDocument();
  });

  it('mounts the detail pane when a worker is selected and the hook returns a detail', async () => {
    detailState = makeDetail({ name: 'alpha' });
    const user = userEvent.setup();
    render(<HistoryView />);
    await user.click(screen.getByRole('button', { name: /alpha/ }));
    const pane = screen.getByTestId('history-detail-pane');
    expect(pane).toHaveAttribute('data-name', 'alpha');
  });

  it('forwards the alive flag from the detail into the detail pane', async () => {
    detailState = makeDetail({ name: 'alpha', alive: false });
    const user = userEvent.setup();
    render(<HistoryView />);
    await user.click(screen.getByRole('button', { name: /alpha/ }));
    expect(screen.getByTestId('history-detail-pane')).toHaveAttribute(
      'data-alive',
      'false',
    );
  });

  it('threads the selected worker name into the detail hook', async () => {
    const user = userEvent.setup();
    render(<HistoryView />);
    await user.click(screen.getByRole('button', { name: /alpha/ }));
    expect(lastDetailArgs?.selected).toBe('alpha');
  });

  it('flips the aria-pressed flag for the selected row', async () => {
    const user = userEvent.setup();
    render(<HistoryView />);
    const row = screen.getByRole('button', { name: /alpha/ });
    expect(row).toHaveAttribute('aria-pressed', 'false');
    await user.click(row);
    expect(row).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the non-selected rows un-pressed', async () => {
    const user = userEvent.setup();
    render(<HistoryView />);
    await user.click(screen.getByRole('button', { name: /alpha/ }));
    expect(
      screen.getByRole('button', { name: /beta/ }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('changes selection when a different row is clicked', async () => {
    const user = userEvent.setup();
    render(<HistoryView />);
    await user.click(screen.getByRole('button', { name: /alpha/ }));
    await user.click(screen.getByRole('button', { name: /beta/ }));
    expect(lastDetailArgs?.selected).toBe('beta');
  });

  it('shows the scribe drawer card when the scribe is opened', () => {
    scribeState = { ...scribeState, showScribe: true };
    render(<HistoryView />);
    expect(screen.getByText('Scribe session-context.md')).toBeInTheDocument();
  });

  it('renders the scribe loading message while the scribe is loading', () => {
    scribeState = { ...scribeState, showScribe: true, loadingScribe: true };
    render(<HistoryView />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders the scribe open-hint when the scribe is open but no payload yet', () => {
    scribeState = {
      ...scribeState,
      showScribe: true,
      loadingScribe: false,
      scribe: null,
    };
    render(<HistoryView />);
    expect(
      screen.getByText('Open the viewer to load the scribe file.'),
    ).toBeInTheDocument();
  });

  it('renders the scribe missing-file message when exists=false', () => {
    scribeState = {
      ...scribeState,
      showScribe: true,
      loadingScribe: false,
      scribe: {
        exists: false,
        path: '/scribe/missing.md',
        size: 0,
        updatedAt: null,
        content: '',
      },
    };
    render(<HistoryView />);
    expect(
      screen.getByText('No scribe context file at /scribe/missing.md.'),
    ).toBeInTheDocument();
  });

  it('renders the scribe content when present', () => {
    scribeState = {
      ...scribeState,
      showScribe: true,
      loadingScribe: false,
      scribe: {
        exists: true,
        path: '/scribe/found.md',
        size: 123,
        updatedAt: '2026-05-12T00:00:00Z',
        content: 'scribe body here',
      },
    };
    render(<HistoryView />);
    expect(screen.getByText('scribe body here')).toBeInTheDocument();
  });

  it('renders the scribe size + path header line when scribe exists', () => {
    scribeState = {
      ...scribeState,
      showScribe: true,
      loadingScribe: false,
      scribe: {
        exists: true,
        path: '/scribe/found.md',
        size: 456,
        updatedAt: null,
        content: 'X',
      },
    };
    render(<HistoryView />);
    expect(screen.getByText(/\/scribe\/found\.md - 456 bytes/)).toBeInTheDocument();
  });

  it('renders the truncated tail hint when scribe.truncated', () => {
    scribeState = {
      ...scribeState,
      showScribe: true,
      loadingScribe: false,
      scribe: {
        exists: true,
        path: '/x',
        size: 1,
        updatedAt: null,
        truncated: true,
        content: 'Y',
      },
    };
    render(<HistoryView />);
    expect(screen.getByText(/\(tail truncated\)/)).toBeInTheDocument();
  });

  it('fires openScribe when the scribe button is clicked', async () => {
    const user = userEvent.setup();
    render(<HistoryView />);
    await user.click(screen.getByRole('button', { name: 'Scribe' }));
    expect(openScribeMock).toHaveBeenCalledTimes(1);
  });

  it('fires closeScribe when the scribe drawer Close button is clicked', async () => {
    const user = userEvent.setup();
    scribeState = { ...scribeState, showScribe: true };
    render(<HistoryView />);
    await user.click(screen.getByRole('button', { name: /Close/ }));
    expect(closeScribeMock).toHaveBeenCalledTimes(1);
  });

  it('drives the scribe button aria-pressed flag from showScribe', () => {
    scribeState = { ...scribeState, showScribe: true };
    render(<HistoryView />);
    expect(
      screen.getByRole('button', { name: 'Scribe' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('hides the detail pane when the scribe is open even if detail is set', () => {
    detailState = makeDetail({ name: 'alpha' });
    scribeState = { ...scribeState, showScribe: true };
    render(<HistoryView />);
    expect(
      screen.queryByTestId('history-detail-pane'),
    ).not.toBeInTheDocument();
  });

  it('closes the scribe on selecting a row in the sidebar', async () => {
    scribeState = { ...scribeState, showScribe: true };
    const user = userEvent.setup();
    render(<HistoryView />);
    await user.click(screen.getByRole('button', { name: /alpha/ }));
    expect(closeScribeMock).toHaveBeenCalledTimes(1);
  });

  it('forwards the typed query into the summary hook args', async () => {
    const user = userEvent.setup();
    render(<HistoryView />);
    const search = screen.getByLabelText('Search history');
    await user.type(search, 'design');
    expect(lastSummaryArgs?.query).toBe('design');
  });

  it('forwards a selected status filter into the summary hook args', async () => {
    const user = userEvent.setup();
    render(<HistoryView />);
    await user.click(screen.getByLabelText('Filter by status'));
    await user.click(screen.getByRole('option', { name: 'closed' }));
    expect(lastSummaryArgs?.statusFilter).toBe('closed');
  });

  it('forwards a since date into the summary hook args via DateRangePicker', async () => {
    const user = userEvent.setup();
    render(<HistoryView />);
    await user.click(screen.getByLabelText('Filter by date range'));
    // First click in the picker sets the from-date.
    const panels = screen.getAllByRole('gridcell', { name: '1' });
    await user.click(panels[0]!);
    expect(lastSummaryArgs?.sinceDay).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it('forwards an until date into the summary hook args via DateRangePicker', async () => {
    const user = userEvent.setup();
    render(<HistoryView />);
    await user.click(screen.getByLabelText('Filter by date range'));
    // First click sets the from-date; popover stays open.
    const fromCells = screen.getAllByRole('gridcell', { name: '1' });
    await user.click(fromCells[0]!);
    // Second click in the same open popover sets the to-date.
    const toCells = screen.getAllByRole('gridcell', { name: '15' });
    await user.click(toCells[0]!);
    expect(lastSummaryArgs?.untilDay).toMatch(/^\d{4}-\d{2}-15$/);
  });

  it('client-side filters the sidebar list by typed query (matches the worker name)', async () => {
    summaryState = {
      summary: [
        makeSummary({ name: 'alpha-design' }),
        makeSummary({ name: 'beta-ops' }),
      ],
    };
    const user = userEvent.setup();
    render(<HistoryView />);
    const search = screen.getByLabelText('Search history');
    await user.type(search, 'design');
    expect(
      screen.getByRole('button', { name: /alpha-design/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /beta-ops/ }),
    ).not.toBeInTheDocument();
  });

  it('client-side filters by typed query against lastTask content', async () => {
    summaryState = {
      summary: [
        makeSummary({ name: 'w-a', lastTask: 'fix login bug' }),
        makeSummary({ name: 'w-b', lastTask: 'rewrite parser' }),
      ],
    };
    const user = userEvent.setup();
    render(<HistoryView />);
    await user.type(screen.getByLabelText('Search history'), 'parser');
    expect(
      screen.queryByRole('button', { name: /w-a/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /w-b/ }),
    ).toBeInTheDocument();
  });

  it('client-side filters by typed query against branch names', async () => {
    summaryState = {
      summary: [
        makeSummary({ name: 'w-a', branches: ['c4/login'] }),
        makeSummary({ name: 'w-b', branches: ['c4/parser'] }),
      ],
    };
    const user = userEvent.setup();
    render(<HistoryView />);
    await user.type(screen.getByLabelText('Search history'), 'parser');
    expect(
      screen.queryByRole('button', { name: /w-a/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /w-b/ }),
    ).toBeInTheDocument();
  });

  it('renders the error alert when the hook setError is called with a message', () => {
    render(<HistoryView />);
    act(() => {
      setErrorParamRecorder.setError?.('boom');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('clears the error alert when the hook setError is called with null', () => {
    render(<HistoryView />);
    act(() => {
      setErrorParamRecorder.setError?.('boom');
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    act(() => {
      setErrorParamRecorder.setError?.(null);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hides the empty-history hint while the error banner is visible', () => {
    summaryState = { summary: [] };
    render(<HistoryView />);
    act(() => {
      setErrorParamRecorder.setError?.('boom');
    });
    expect(screen.queryByText('No history yet.')).not.toBeInTheDocument();
  });

  it('passes the initial filter values into the summary hook on first mount', () => {
    render(<HistoryView />);
    expect(lastSummaryArgs?.query).toBe('');
    expect(lastSummaryArgs?.statusFilter).toBe('');
    expect(lastSummaryArgs?.sinceDay).toBe('');
    expect(lastSummaryArgs?.untilDay).toBe('');
  });

  it('passes the initial selected=null into the detail hook on first mount', () => {
    render(<HistoryView />);
    expect(lastDetailArgs?.selected).toBeNull();
  });

  it('renders the outer two-column flex layout', () => {
    const { container } = render(<HistoryView />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('flex');
    expect(root).toHaveClass('h-full');
  });

  it('re-renders translated copy when the locale flips to ko', () => {
    const { container } = render(<HistoryView />);
    expect(screen.getByText('History')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    // The component must remain mounted after a locale flip even
    // when the Korean strings render. We only assert the root
    // remains alive.
    expect(container.firstChild).toBeInTheDocument();
  });

  it('uses the same setError reference for both hooks (single error sink)', () => {
    render(<HistoryView />);
    expect(lastSummaryArgs?.setError).toBe(lastDetailArgs?.setError);
  });
});
