import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { setLocale } from '../lib/i18n';
import type { AuditEntry, MeetingMeta } from './SpecialistsView';

// SpecialistsEnrichmentPanels is pure display: parent owns the
// recentAudit + recentMeetings arrays from the detail-fetch
// response. Tests render the component with varied fixtures
// and assert each section's heading, the per-row formatting
// (timestamp + action chip + by-actor + reason for audit;
// id + status chip + track + title for meetings), the
// reverse-order rendering of the audit list, and the absent /
// empty / undefined branches that suppress an entire section.

import SpecialistsEnrichmentPanels from './SpecialistsEnrichmentPanels';

function makeAudit(over: Partial<AuditEntry> = {}): AuditEntry {
  return {
    ts: '2026-05-01T00:00:00Z',
    action: 'add',
    id: 'arch-1',
    actor: 'alice',
    reason: 'initial',
    ...over,
  };
}

function makeMeeting(over: Partial<MeetingMeta> = {}): MeetingMeta {
  return {
    id: 'm-1',
    status: 'open',
    title: 'Kickoff',
    track: 'design',
    createdAt: '2026-05-01T00:00:00Z',
    completedAt: null,
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
});

function renderPanels(
  overrides: Partial<Parameters<typeof SpecialistsEnrichmentPanels>[0]> = {},
) {
  const props = {
    recentAudit: undefined as AuditEntry[] | undefined,
    recentMeetings: undefined as MeetingMeta[] | undefined,
    ...overrides,
  };
  const utils = render(<SpecialistsEnrichmentPanels {...props} />);
  return { ...utils, props };
}

describe('<SpecialistsEnrichmentPanels>', () => {
  it('renders nothing when both props are undefined', () => {
    const { container } = renderPanels();
    expect(container.querySelectorAll('ul')).toHaveLength(0);
  });

  it('renders nothing when both props are empty arrays', () => {
    const { container } = renderPanels({
      recentAudit: [],
      recentMeetings: [],
    });
    expect(container.querySelectorAll('ul')).toHaveLength(0);
  });

  it('does NOT render the recent audit heading when recentAudit is undefined', () => {
    renderPanels({ recentMeetings: [makeMeeting()] });
    expect(screen.queryByText(/recent audit/i)).not.toBeInTheDocument();
  });

  it('does NOT render the recent audit heading when recentAudit is an empty array', () => {
    renderPanels({ recentAudit: [], recentMeetings: [makeMeeting()] });
    expect(screen.queryByText(/recent audit/i)).not.toBeInTheDocument();
  });

  it('does NOT render the recent meetings heading when recentMeetings is undefined', () => {
    renderPanels({ recentAudit: [makeAudit()] });
    expect(screen.queryByText(/recent meetings/i)).not.toBeInTheDocument();
  });

  it('does NOT render the recent meetings heading when recentMeetings is empty', () => {
    renderPanels({ recentAudit: [makeAudit()], recentMeetings: [] });
    expect(screen.queryByText(/recent meetings/i)).not.toBeInTheDocument();
  });

  it('renders the recent audit heading with the entry count', () => {
    renderPanels({ recentAudit: [makeAudit(), makeAudit({ id: 'arch-2' })] });
    expect(screen.getByText('recent audit (2)')).toBeInTheDocument();
  });

  it('renders the recent meetings heading with the entry count', () => {
    renderPanels({
      recentMeetings: [makeMeeting(), makeMeeting({ id: 'm-2' })],
    });
    expect(screen.getByText('recent meetings (2)')).toBeInTheDocument();
  });

  it('renders one li per audit entry inside the audit list', () => {
    const { container } = renderPanels({
      recentAudit: [
        makeAudit({ ts: '2026-05-01T00:00:00Z' }),
        makeAudit({ ts: '2026-05-02T00:00:00Z', id: 'arch-2' }),
      ],
    });
    const lists = container.querySelectorAll('ul');
    expect(lists).toHaveLength(1);
    expect(within(lists[0] as HTMLElement).getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders one li per meeting inside the meetings list', () => {
    const { container } = renderPanels({
      recentMeetings: [
        makeMeeting({ id: 'm-1' }),
        makeMeeting({ id: 'm-2' }),
        makeMeeting({ id: 'm-3' }),
      ],
    });
    const lists = container.querySelectorAll('ul');
    expect(lists).toHaveLength(1);
    expect(within(lists[0] as HTMLElement).getAllByRole('listitem')).toHaveLength(3);
  });

  it('renders the audit action chip per audit row', () => {
    renderPanels({
      recentAudit: [
        makeAudit({ action: 'add' }),
        makeAudit({ action: 'remove', id: 'arch-2' }),
      ],
    });
    expect(screen.getByText('add')).toBeInTheDocument();
    expect(screen.getByText('remove')).toBeInTheDocument();
  });

  it('renders the by-actor copy when actor is present', () => {
    renderPanels({ recentAudit: [makeAudit({ actor: 'bob' })] });
    expect(screen.getByText('by bob')).toBeInTheDocument();
  });

  it('does NOT render the by-actor span when actor is null', () => {
    renderPanels({ recentAudit: [makeAudit({ actor: null })] });
    expect(screen.queryByText(/^by /)).not.toBeInTheDocument();
  });

  it('does NOT render the by-actor span when actor is undefined', () => {
    renderPanels({ recentAudit: [makeAudit({ actor: undefined })] });
    expect(screen.queryByText(/^by /)).not.toBeInTheDocument();
  });

  it('renders the reason copy prefixed with em-dash when reason is present', () => {
    renderPanels({
      recentAudit: [makeAudit({ reason: 'first import' })],
    });
    expect(screen.getByText('— first import')).toBeInTheDocument();
  });

  it('does NOT render a reason span when reason is null', () => {
    renderPanels({ recentAudit: [makeAudit({ reason: null })] });
    expect(screen.queryByText(/^— /)).not.toBeInTheDocument();
  });

  it('does NOT render a reason span when reason is undefined', () => {
    renderPanels({ recentAudit: [makeAudit({ reason: undefined })] });
    expect(screen.queryByText(/^— /)).not.toBeInTheDocument();
  });

  it('renders the audit list in reverse order (newest first)', () => {
    const { container } = renderPanels({
      recentAudit: [
        makeAudit({ action: 'add', id: 'first' }),
        makeAudit({ action: 'remove', id: 'second' }),
      ],
    });
    const items = within(container.querySelector('ul') as HTMLElement).getAllByRole(
      'listitem',
    );
    expect(within(items[0]).getByText('remove')).toBeInTheDocument();
    expect(within(items[1]).getByText('add')).toBeInTheDocument();
  });

  it('renders the meeting id per meeting row', () => {
    renderPanels({
      recentMeetings: [makeMeeting({ id: 'm-1' }), makeMeeting({ id: 'm-2' })],
    });
    expect(screen.getByText('m-1')).toBeInTheDocument();
    expect(screen.getByText('m-2')).toBeInTheDocument();
  });

  it('renders the meeting status chip per meeting row', () => {
    renderPanels({
      recentMeetings: [
        makeMeeting({ id: 'm-1', status: 'open' }),
        makeMeeting({ id: 'm-2', status: 'closed' }),
      ],
    });
    expect(screen.getByText('open')).toBeInTheDocument();
    expect(screen.getByText('closed')).toBeInTheDocument();
  });

  it('renders the meeting track per meeting row', () => {
    renderPanels({
      recentMeetings: [
        makeMeeting({ id: 'm-1', track: 'design' }),
        makeMeeting({ id: 'm-2', track: 'audit' }),
      ],
    });
    expect(screen.getByText('design')).toBeInTheDocument();
    expect(screen.getByText('audit')).toBeInTheDocument();
  });

  it('renders the meeting title prefixed with em-dash per meeting row', () => {
    renderPanels({
      recentMeetings: [
        makeMeeting({ id: 'm-1', title: 'Kickoff' }),
        makeMeeting({ id: 'm-2', title: 'Sync' }),
      ],
    });
    expect(screen.getByText('— Kickoff')).toBeInTheDocument();
    expect(screen.getByText('— Sync')).toBeInTheDocument();
  });

  it('renders the meeting list in source order (not reversed)', () => {
    const { container } = renderPanels({
      recentMeetings: [
        makeMeeting({ id: 'm-first', title: 'First' }),
        makeMeeting({ id: 'm-second', title: 'Second' }),
      ],
    });
    const items = within(container.querySelector('ul') as HTMLElement).getAllByRole(
      'listitem',
    );
    expect(within(items[0]).getByText('m-first')).toBeInTheDocument();
    expect(within(items[1]).getByText('m-second')).toBeInTheDocument();
  });

  it('renders both sections side by side when both props have entries', () => {
    const { container } = renderPanels({
      recentAudit: [makeAudit()],
      recentMeetings: [makeMeeting()],
    });
    expect(container.querySelectorAll('ul')).toHaveLength(2);
    expect(screen.getByText('recent audit (1)')).toBeInTheDocument();
    expect(screen.getByText('recent meetings (1)')).toBeInTheDocument();
  });

  it('renders the timestamp via toLocaleString per audit row', () => {
    const ts = '2026-05-01T00:00:00Z';
    renderPanels({ recentAudit: [makeAudit({ ts })] });
    expect(screen.getByText(new Date(ts).toLocaleString())).toBeInTheDocument();
  });

  it('does NOT render any audit-list ul when recentAudit is a non-array value (defensive)', () => {
    const { container } = renderPanels({
      recentAudit: undefined,
      recentMeetings: [makeMeeting()],
    });
    expect(container.querySelectorAll('ul')).toHaveLength(1);
  });

  it('rerendering with identical props does not duplicate rows', () => {
    const props = {
      recentAudit: [makeAudit()],
      recentMeetings: [makeMeeting()],
    };
    const { rerender } = render(<SpecialistsEnrichmentPanels {...props} />);
    rerender(<SpecialistsEnrichmentPanels {...props} />);
    expect(screen.getAllByText('m-1')).toHaveLength(1);
    expect(screen.getAllByText('add')).toHaveLength(1);
  });

  it('re-renders translated headings when the locale flips to ko', () => {
    renderPanels({
      recentAudit: [makeAudit()],
      recentMeetings: [makeMeeting()],
    });
    expect(screen.getByText('recent audit (1)')).toBeInTheDocument();
    expect(screen.getByText('recent meetings (1)')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('recent audit (1)')).not.toBeInTheDocument();
    expect(screen.queryByText('recent meetings (1)')).not.toBeInTheDocument();
  });
});
