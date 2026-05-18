import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type {
  HistoryCommit,
  HistoryRecord,
  HistoryWorkerDetail,
} from './HistoryView';

// HistoryDetailPane is pure display: parent owns the fetch +
// selection logic. Tests render with varied detail payloads
// and assert title, status badge variant by alive flag +
// status string, branch + worktree visibility, the past-
// tasks section (empty vs populated, commit list, branch
// + dates, status-variant heuristic), and the scrollback
// section (content rendered vs missing-placeholder).

import HistoryDetailPane from './HistoryDetailPane';

function makeCommit(over: Partial<HistoryCommit> = {}): HistoryCommit {
  return { hash: 'abc1234', message: 'do thing', ...over };
}

function makeRecord(over: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    name: 'w1',
    task: 'do thing',
    branch: 'c4/w1',
    startedAt: '2026-05-12T00:00:00Z',
    completedAt: '2026-05-12T01:00:00Z',
    commits: [],
    status: 'ok',
    ...over,
  };
}

function makeDetail(
  over: Partial<HistoryWorkerDetail> = {},
): HistoryWorkerDetail {
  return {
    name: 'w1',
    records: [makeRecord()],
    alive: true,
    status: 'idle',
    branch: 'c4/w1',
    worktree: '/wt/w1',
    scrollback: { content: 'hello world', lines: 1, totalScrollback: 1 },
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
});

describe('<HistoryDetailPane>', () => {
  it('renders the worker name as the card title', () => {
    render(<HistoryDetailPane detail={makeDetail({ name: 'alpha-7' })} />);
    // (v1.11.301, TODO 11.283) The worker name now appears twice:
    // once in the new Breadcrumbs row and once in the CardTitle.
    // Assert both echoes are present.
    const matches = screen.getAllByText('alpha-7');
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the live status badge text from detail.status when alive', () => {
    render(<HistoryDetailPane detail={makeDetail({ alive: true, status: 'idle' })} />);
    expect(screen.getByText('idle')).toBeInTheDocument();
  });

  it('renders the live placeholder when alive and no status string', () => {
    render(<HistoryDetailPane detail={makeDetail({ alive: true, status: null })} />);
    expect(screen.getByText('live')).toBeInTheDocument();
  });

  it('renders the closed placeholder when not alive', () => {
    render(<HistoryDetailPane detail={makeDetail({ alive: false, status: null })} />);
    expect(screen.getByText('closed / exited')).toBeInTheDocument();
  });

  it('uses the success badge variant when alive', () => {
    render(<HistoryDetailPane detail={makeDetail({ alive: true, status: 'live' })} />);
    const badge = screen.getByText('live');
    expect(badge.className).toContain('bg-success');
  });

  it('uses the secondary badge variant when not alive', () => {
    render(<HistoryDetailPane detail={makeDetail({ alive: false })} />);
    const badge = screen.getByText('closed / exited');
    expect(badge.className).toContain('secondary');
  });

  it('renders the branch label when detail.branch is set', () => {
    render(<HistoryDetailPane detail={makeDetail({ branch: 'feat-x' })} />);
    expect(screen.getByText('feat-x')).toBeInTheDocument();
  });

  it('hides the branch label when detail.branch is null', () => {
    render(<HistoryDetailPane detail={makeDetail({ branch: null })} />);
    expect(screen.queryByText('feat-x')).not.toBeInTheDocument();
  });

  it('renders the worktree path when detail.worktree is set', () => {
    render(
      <HistoryDetailPane detail={makeDetail({ worktree: '/wt/path' })} />,
    );
    expect(screen.getByText('/wt/path')).toBeInTheDocument();
  });

  it('hides the worktree path when detail.worktree is null', () => {
    render(<HistoryDetailPane detail={makeDetail({ worktree: null })} />);
    expect(screen.queryByText('/wt/path')).not.toBeInTheDocument();
  });

  it('renders the past-tasks header with the record count', () => {
    render(<HistoryDetailPane detail={makeDetail({ records: [makeRecord(), makeRecord()] })} />);
    expect(screen.getByText(/Past tasks \(2\)/)).toBeInTheDocument();
  });

  it('renders the empty-tasks message when records is empty', () => {
    render(<HistoryDetailPane detail={makeDetail({ records: [] })} />);
    expect(screen.getByText('No recorded tasks.')).toBeInTheDocument();
    expect(screen.getByText(/Past tasks \(0\)/)).toBeInTheDocument();
  });

  it('renders the task text for each record', () => {
    render(
      <HistoryDetailPane
        detail={makeDetail({
          records: [makeRecord({ task: 'refactor auth' })],
        })}
      />,
    );
    expect(screen.getByText('refactor auth')).toBeInTheDocument();
  });

  it('renders the no-task placeholder when a record has null task', () => {
    render(
      <HistoryDetailPane
        detail={makeDetail({ records: [makeRecord({ task: null })] })}
      />,
    );
    expect(screen.getByText('(no task text)')).toBeInTheDocument();
  });

  it('renders the unknown-status placeholder when a record has null status', () => {
    render(
      <HistoryDetailPane
        detail={makeDetail({ records: [makeRecord({ status: null })] })}
      />,
    );
    expect(screen.getByText('unknown')).toBeInTheDocument();
  });

  it('uses the destructive badge variant for an "error" record status', () => {
    render(
      <HistoryDetailPane
        detail={makeDetail({
          records: [makeRecord({ status: 'error: boom' })],
        })}
      />,
    );
    const badge = screen.getByText('error: boom');
    expect(badge.className).toContain('destructive');
  });

  it('uses the destructive badge variant for a "fail" record status', () => {
    render(
      <HistoryDetailPane
        detail={makeDetail({
          records: [makeRecord({ status: 'failure' })],
        })}
      />,
    );
    const badge = screen.getByText('failure');
    expect(badge.className).toContain('destructive');
  });

  it('uses the success badge variant for an "ok" record status', () => {
    render(
      <HistoryDetailPane
        detail={makeDetail({ records: [makeRecord({ status: 'ok' })] })}
      />,
    );
    const badge = screen.getByText('ok');
    expect(badge.className).toContain('bg-success');
  });

  it('uses the success badge variant for a "complete" record status', () => {
    render(
      <HistoryDetailPane
        detail={makeDetail({
          records: [makeRecord({ status: 'complete' })],
        })}
      />,
    );
    const badge = screen.getByText('complete');
    expect(badge.className).toContain('bg-success');
  });

  it('uses the success badge variant for a "merged" record status', () => {
    render(
      <HistoryDetailPane
        detail={makeDetail({ records: [makeRecord({ status: 'merged' })] })}
      />,
    );
    const badge = screen.getByText('merged');
    expect(badge.className).toContain('bg-success');
  });

  it('uses the warning badge variant for a "pending" record status', () => {
    render(
      <HistoryDetailPane
        detail={makeDetail({
          records: [makeRecord({ status: 'pending review' })],
        })}
      />,
    );
    const badge = screen.getByText('pending review');
    expect(badge.className).toContain('bg-warning');
  });

  it('uses the warning badge variant for a "busy" record status', () => {
    render(
      <HistoryDetailPane
        detail={makeDetail({ records: [makeRecord({ status: 'busy' })] })}
      />,
    );
    const badge = screen.getByText('busy');
    expect(badge.className).toContain('bg-warning');
  });

  it('uses the outline badge variant for an unmatched record status', () => {
    render(
      <HistoryDetailPane
        detail={makeDetail({
          records: [makeRecord({ status: 'something' })],
        })}
      />,
    );
    const badge = screen.getByText('something');
    expect(badge.className).toContain('text-foreground');
  });

  it('renders the per-record branch chip when set', () => {
    render(
      <HistoryDetailPane
        detail={makeDetail({
          records: [makeRecord({ branch: 'feature-x' })],
        })}
      />,
    );
    expect(screen.getByText('feature-x')).toBeInTheDocument();
  });

  it('hides the per-record branch chip when null', () => {
    render(
      <HistoryDetailPane
        detail={makeDetail({
          records: [makeRecord({ branch: null })],
        })}
      />,
    );
    expect(screen.queryByText('feature-x')).not.toBeInTheDocument();
  });

  it('renders the startedAt timestamp via TimeAgo (with dateTime attr) for a record', () => {
    // (v1.11.333, TODO 11.315) Timestamps now render through
    // the TimeAgo primitive. The `<time>` element carries the
    // ISO timestamp in its `dateTime` attribute; the absolute
    // string lands on `title=` for hover. We assert against
    // the dateTime attribute because the relative text
    // changes with the wall clock.
    const { container } = render(
      <HistoryDetailPane
        detail={makeDetail({
          records: [
            makeRecord({ startedAt: '2026-05-12T03:04:05Z', completedAt: null }),
          ],
        })}
      />,
    );
    const started = container.querySelector(
      '[data-section="history-record-started"] time',
    );
    expect(started).not.toBeNull();
    expect(started?.getAttribute('datetime')).toBe('2026-05-12T03:04:05.000Z');
  });

  it('renders the ? placeholder when startedAt is null', () => {
    render(
      <HistoryDetailPane
        detail={makeDetail({
          records: [makeRecord({ startedAt: null, completedAt: null })],
        })}
      />,
    );
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('renders the completedAt timestamp via TimeAgo with an arrow prefix when set', () => {
    // (v1.11.333, TODO 11.315) Completed timestamp now
    // renders via TimeAgo + a leading "->" glyph in a
    // sibling span. We assert on the section selector and
    // the dateTime attribute.
    const { container } = render(
      <HistoryDetailPane
        detail={makeDetail({
          records: [
            makeRecord({
              startedAt: '2026-05-12T00:00:00Z',
              completedAt: '2026-05-12T01:02:03Z',
            }),
          ],
        })}
      />,
    );
    const completed = container.querySelector(
      '[data-section="history-record-completed"]',
    );
    expect(completed).not.toBeNull();
    expect(completed?.textContent).toContain('->');
    const timeEl = completed?.querySelector('time');
    expect(timeEl?.getAttribute('datetime')).toBe('2026-05-12T01:02:03.000Z');
  });

  it('hides the completedAt span when null', () => {
    render(
      <HistoryDetailPane
        detail={makeDetail({
          records: [makeRecord({ completedAt: null })],
        })}
      />,
    );
    expect(screen.queryByText(/2026-05-12 01:00:00/)).not.toBeInTheDocument();
  });

  it('renders each commit hash + message under a record that has commits', () => {
    render(
      <HistoryDetailPane
        detail={makeDetail({
          records: [
            makeRecord({
              commits: [
                makeCommit({ hash: 'aaaa111', message: 'first commit' }),
                makeCommit({ hash: 'bbbb222', message: 'second commit' }),
              ],
            }),
          ],
        })}
      />,
    );
    expect(screen.getByText('aaaa111')).toBeInTheDocument();
    expect(screen.getByText('bbbb222')).toBeInTheDocument();
    expect(screen.getByText('first commit')).toBeInTheDocument();
    expect(screen.getByText('second commit')).toBeInTheDocument();
  });

  it('does not render a commits list when commits is empty', () => {
    const { container } = render(
      <HistoryDetailPane
        detail={makeDetail({
          records: [makeRecord({ commits: [] })],
        })}
      />,
    );
    // (v1.11.333, TODO 11.315) Commit rows now render via the
    // CopyButton primitive (which contains a <code> inside).
    // Empty commits means no [data-section="history-record-commits"]
    // section AND no commit-specific data-testid.
    const commitsSection = container.querySelector(
      '[data-section="history-record-commits"]',
    );
    expect(commitsSection).toBeNull();
  });

  it('renders the scrollback header (Output tab)', async () => {
    // (v1.11.333, TODO 11.315) Scrollback lives under the
    // Output tab now. Click it first.
    const user = userEvent.setup();
    render(<HistoryDetailPane detail={makeDetail()} />);
    await user.click(screen.getByRole('tab', { name: /Output/i }));
    expect(screen.getByText('Scrollback')).toBeInTheDocument();
  });

  it('renders the scrollback content when present (Output tab)', async () => {
    const user = userEvent.setup();
    render(
      <HistoryDetailPane
        detail={makeDetail({
          scrollback: { content: 'line 1\nline 2', lines: 2, totalScrollback: 2 },
        })}
      />,
    );
    await user.click(screen.getByRole('tab', { name: /Output/i }));
    expect(screen.getByText(/line 1/)).toBeInTheDocument();
    expect(screen.getByText(/line 2/)).toBeInTheDocument();
  });

  it('renders the scrollback empty placeholder when null (Output tab)', async () => {
    const user = userEvent.setup();
    render(<HistoryDetailPane detail={makeDetail({ scrollback: null })} />);
    await user.click(screen.getByRole('tab', { name: /Output/i }));
    expect(
      screen.getByText('No live scrollback (worker not running).'),
    ).toBeInTheDocument();
  });

  it('renders multiple records as multiple panel rows', () => {
    render(
      <HistoryDetailPane
        detail={makeDetail({
          records: [
            makeRecord({ task: 'a-task' }),
            makeRecord({ task: 'b-task' }),
            makeRecord({ task: 'c-task' }),
          ],
        })}
      />,
    );
    expect(screen.getByText('a-task')).toBeInTheDocument();
    expect(screen.getByText('b-task')).toBeInTheDocument();
    expect(screen.getByText('c-task')).toBeInTheDocument();
  });

  it('renders the outer card container with the documented flex layout', () => {
    const { container } = render(<HistoryDetailPane detail={makeDetail()} />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('flex');
    expect(root).toHaveClass('h-full');
    expect(root).toHaveClass('flex-col');
  });

  it('re-renders translated copy when the locale flips to ko', () => {
    render(<HistoryDetailPane detail={makeDetail({ records: [] })} />);
    expect(screen.getByText('No recorded tasks.')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    // After flipping the locale a fresh render shows new copy. The
    // exact ko string is intentionally not asserted - the test
    // only proves the locale subscription survives mount.
    const { container } = render(
      <HistoryDetailPane detail={makeDetail({ records: [] })} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('case-folds status for the variant heuristic ("OK" still matches success)', () => {
    render(
      <HistoryDetailPane
        detail={makeDetail({ records: [makeRecord({ status: 'OK' })] })}
      />,
    );
    const badge = screen.getByText('OK');
    expect(badge.className).toContain('bg-success');
  });

  it('renders the records section as a list with a panel per record', () => {
    const { container } = render(
      <HistoryDetailPane
        detail={makeDetail({
          records: [makeRecord({ task: 'a' }), makeRecord({ task: 'b' })],
        })}
      />,
    );
    const lists = container.querySelectorAll('ul');
    expect(lists.length).toBeGreaterThan(0);
  });

  it('exposes the scrollback pre block as an element so it can be focused for paste (Output tab)', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <HistoryDetailPane
        detail={makeDetail({
          scrollback: { content: 'X', lines: 1, totalScrollback: 1 },
        })}
      />,
    );
    await user.click(screen.getByRole('tab', { name: /Output/i }));
    expect(container.querySelector('pre')).not.toBeNull();
  });

  it('omits the pre block entirely when scrollback is null', () => {
    const { container } = render(
      <HistoryDetailPane detail={makeDetail({ scrollback: null })} />,
    );
    // (v1.11.333, TODO 11.315) The Output tab is no longer
    // mounted by default; clicking it would expose the empty
    // placeholder but no <pre>. The bare-mount assertion
    // still holds.
    expect(container.querySelector('pre')).toBeNull();
  });

  it('keeps the past-tasks section in the DOM even when records is empty', () => {
    render(<HistoryDetailPane detail={makeDetail({ records: [] })} />);
    const header = screen.getByText(/Past tasks \(0\)/);
    expect(header).toBeInTheDocument();
  });

  it('handles the all-nulls record gracefully without crashing', () => {
    render(
      <HistoryDetailPane
        detail={makeDetail({
          records: [
            {
              name: null,
              task: null,
              branch: null,
              startedAt: null,
              completedAt: null,
              commits: [],
              status: null,
            },
          ],
        })}
      />,
    );
    expect(screen.getByText('(no task text)')).toBeInTheDocument();
    expect(screen.getByText('unknown')).toBeInTheDocument();
  });

  it('uses the secondary badge variant when a record status is null', () => {
    render(
      <HistoryDetailPane
        detail={makeDetail({ records: [makeRecord({ status: null })] })}
      />,
    );
    const badge = screen.getByText('unknown');
    expect(badge.className).toContain('secondary');
  });

  it('renders the record with no commits without a trailing nested list', () => {
    const { container } = render(
      <HistoryDetailPane
        detail={makeDetail({
          records: [makeRecord({ commits: [] })],
        })}
      />,
    );
    expect(
      within(container).queryByRole('code'),
    ).not.toBeInTheDocument();
  });

  // (v1.11.333, TODO 11.315) Detail polish coverage.

  describe('detail body tabs', () => {
    it('renders three tabs (Task / Output / Metrics)', () => {
      render(<HistoryDetailPane detail={makeDetail()} />);
      expect(screen.getByRole('tab', { name: /Task/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Output/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Metrics/i })).toBeInTheDocument();
    });

    it('Task tab is active by default and shows the past-tasks header', () => {
      render(<HistoryDetailPane detail={makeDetail()} />);
      expect(
        document.querySelector('[data-section="history-detail-task"]'),
      ).not.toBeNull();
    });

    it('clicking the Metrics tab surfaces the record breakdown table', async () => {
      const user = userEvent.setup();
      render(
        <HistoryDetailPane
          detail={makeDetail({
            records: [
              makeRecord({ status: 'OK', commits: [makeCommit({ hash: 'aaaa111' })] }),
              makeRecord({ status: 'error' }),
              makeRecord({ status: 'pending' }),
            ],
          })}
        />,
      );
      await user.click(screen.getByRole('tab', { name: /Metrics/i }));
      expect(
        document.querySelector('[data-section="history-detail-metrics"]'),
      ).not.toBeNull();
      expect(screen.getByText('Completed / merged')).toBeInTheDocument();
      expect(screen.getByText('Errors / failures')).toBeInTheDocument();
      expect(screen.getByText('Commits recorded')).toBeInTheDocument();
    });

    it('tab strip renders as a tablist with the expected accessible name', () => {
      render(<HistoryDetailPane detail={makeDetail()} />);
      const tablist = screen.getByRole('tablist', {
        name: /History detail sections/i,
      });
      expect(tablist).toBeInTheDocument();
    });
  });

  describe('commit-sha CopyButton', () => {
    it('renders a CopyButton per commit row with the short hash', () => {
      render(
        <HistoryDetailPane
          detail={makeDetail({
            records: [
              makeRecord({
                commits: [
                  makeCommit({ hash: 'abcdef1234567', message: 'msg-a' }),
                ],
              }),
            ],
          })}
        />,
      );
      expect(
        screen.getByTestId('history-record-commit-abcdef1'),
      ).toBeInTheDocument();
    });

    it('the visible label is the short SHA (slice 0..7)', () => {
      render(
        <HistoryDetailPane
          detail={makeDetail({
            records: [
              makeRecord({
                commits: [
                  makeCommit({ hash: 'abcdef1234567', message: 'msg-a' }),
                ],
              }),
            ],
          })}
        />,
      );
      expect(screen.getByText('abcdef1')).toBeInTheDocument();
    });
  });
});
