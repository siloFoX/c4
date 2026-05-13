import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { ActionItemsResponse } from './MeetingsActionItemsPanel';

// MeetingsActionItemsPanel renders 4 grouped lists with category
// filter chips + a JSON / Markdown export pair. The export
// handlers live in useActionItemsExport — that hook builds the
// blob URL + downloads / writes the Markdown body to the
// clipboard, and has its own unit test. This file mocks the
// hook so the panel test asserts the visible filter / export
// wiring in isolation, without booting URL.createObjectURL,
// document.body click(), or navigator.clipboard.

const handleDownloadJsonMock = vi.fn();
const handleCopyMdMock = vi.fn();
let lastExportArgs:
  | { actions: ActionItemsResponse | null; meetingId: string }
  | null = null;

vi.mock('../lib/use-action-items-export', () => ({
  useActionItemsExport: (args: {
    actions: ActionItemsResponse | null;
    meetingId: string;
  }) => {
    lastExportArgs = args;
    return {
      handleDownloadJson: handleDownloadJsonMock,
      handleCopyMd: handleCopyMdMock,
    };
  },
}));

import MeetingsActionItemsPanel from './MeetingsActionItemsPanel';

const FULL_ACTIONS: ActionItemsResponse = {
  count: 4,
  byType: { decision: 1, action: 1, todo: 1, blocker: 1 },
  items: [
    {
      type: 'decision',
      text: 'pin the lock file',
      owner: 'alice',
      stage: 'discuss',
      round: 1,
      specialistId: 'arch-1',
      ts: '2026-05-01T00:00:00Z',
    },
    {
      type: 'action',
      text: 'wire the alarm',
      owner: null,
      stage: 'consensus',
      round: 2,
      specialistId: 'sec-1',
      ts: null,
    },
    {
      type: 'todo',
      text: 'rename the column',
      owner: 'bob',
      stage: 'discuss',
      round: 1,
      specialistId: null,
      ts: null,
    },
    {
      type: 'blocker',
      text: 'license review pending',
      owner: null,
      stage: 'consensus',
      round: 3,
      specialistId: 'ops-1',
      ts: null,
    },
  ],
};

const TWO_DECISIONS: ActionItemsResponse = {
  count: 2,
  byType: { decision: 2, action: 0, todo: 0, blocker: 0 },
  items: [
    {
      type: 'decision',
      text: 'ship on Friday',
      owner: null,
      stage: 'discuss',
      round: 1,
      specialistId: 'pm-1',
      ts: null,
    },
    {
      type: 'decision',
      text: 'roll back if 5xx',
      owner: 'eve',
      stage: 'consensus',
      round: 2,
      specialistId: 'ops-1',
      ts: null,
    },
  ],
};

beforeEach(() => {
  setLocale('en');
  handleDownloadJsonMock.mockReset();
  handleCopyMdMock.mockReset();
  lastExportArgs = null;
});

function renderPanel(
  overrides: Partial<Parameters<typeof MeetingsActionItemsPanel>[0]> = {},
) {
  const props = {
    actions: FULL_ACTIONS,
    meetingId: 'mtg-1',
    ...overrides,
  };
  const utils = render(<MeetingsActionItemsPanel {...props} />);
  return { ...utils, props };
}

describe('<MeetingsActionItemsPanel>', () => {
  it('renders nothing when actions is null', () => {
    const { container } = render(
      <MeetingsActionItemsPanel actions={null} meetingId="mtg-1" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when actions.count is 0', () => {
    const { container } = render(
      <MeetingsActionItemsPanel
        actions={{
          count: 0,
          byType: { decision: 0, action: 0, todo: 0, blocker: 0 },
          items: [],
        }}
        meetingId="mtg-1"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the Action Items heading when actions are non-empty', () => {
    renderPanel();
    expect(screen.getByText('Action Items')).toBeInTheDocument();
  });

  it('renders the "all" chip with the total count', () => {
    renderPanel();
    expect(screen.getByText(/all . 4/)).toBeInTheDocument();
  });

  it('renders the decision chip when byType.decision > 0', () => {
    renderPanel();
    expect(
      screen.getByRole('button', { name: /decision . 1/i }),
    ).toBeInTheDocument();
  });

  it('renders the action chip when byType.action > 0', () => {
    renderPanel();
    expect(
      screen.getByRole('button', { name: /^action . 1/i }),
    ).toBeInTheDocument();
  });

  it('renders the todo chip when byType.todo > 0', () => {
    renderPanel();
    expect(
      screen.getByRole('button', { name: /todo . 1/i }),
    ).toBeInTheDocument();
  });

  it('renders the blocker chip when byType.blocker > 0', () => {
    renderPanel();
    expect(
      screen.getByRole('button', { name: /blocker . 1/i }),
    ).toBeInTheDocument();
  });

  it('does NOT render chips for zero-count categories', () => {
    render(
      <MeetingsActionItemsPanel
        actions={TWO_DECISIONS}
        meetingId="mtg-1"
      />,
    );
    expect(
      screen.queryByRole('button', { name: /^action . /i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /todo . /i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /blocker . /i }),
    ).not.toBeInTheDocument();
  });

  it('renders the JSON download button with its tooltip', () => {
    renderPanel();
    const btn = screen.getByTitle('Download action items as JSON');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent(/JSON/);
  });

  it('renders the Markdown copy button with its tooltip', () => {
    renderPanel();
    const btn = screen.getByTitle('Copy action items as Markdown');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent(/MD/);
  });

  it('calls handleDownloadJson once when JSON button is clicked', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByTitle('Download action items as JSON'));
    expect(handleDownloadJsonMock).toHaveBeenCalledTimes(1);
  });

  it('calls handleCopyMd once when MD button is clicked', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByTitle('Copy action items as Markdown'));
    expect(handleCopyMdMock).toHaveBeenCalledTimes(1);
  });

  it('renders all four action item text bodies', () => {
    renderPanel();
    expect(screen.getByText('pin the lock file')).toBeInTheDocument();
    expect(screen.getByText('wire the alarm')).toBeInTheDocument();
    expect(screen.getByText('rename the column')).toBeInTheDocument();
    expect(screen.getByText('license review pending')).toBeInTheDocument();
  });

  it('renders the owner chip for an item that has an owner', () => {
    renderPanel();
    expect(screen.getByText('@alice')).toBeInTheDocument();
    expect(screen.getByText('@bob')).toBeInTheDocument();
  });

  it('renders the stage/round/specialist trailer for each item', () => {
    renderPanel();
    expect(screen.getByText('discuss/r1/arch-1')).toBeInTheDocument();
    expect(screen.getByText('consensus/r2/sec-1')).toBeInTheDocument();
    expect(screen.getByText('consensus/r3/ops-1')).toBeInTheDocument();
  });

  it('falls back to "?" for the specialistId in the trailer when null', () => {
    renderPanel();
    expect(screen.getByText('discuss/r1/?')).toBeInTheDocument();
  });

  it('filters the rendered items down to just the chosen category', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: /decision . 1/i }));
    expect(screen.getByText('pin the lock file')).toBeInTheDocument();
    expect(screen.queryByText('wire the alarm')).not.toBeInTheDocument();
    expect(screen.queryByText('rename the column')).not.toBeInTheDocument();
    expect(
      screen.queryByText('license review pending'),
    ).not.toBeInTheDocument();
  });

  it('shows the active filter chip with the type-specific tone class', async () => {
    const user = userEvent.setup();
    renderPanel();
    const decisionChip = screen.getByRole('button', { name: /decision . 1/i });
    await user.click(decisionChip);
    expect(decisionChip.className).toMatch(/info/);
  });

  it('clears the filter when the active chip is clicked again', async () => {
    const user = userEvent.setup();
    renderPanel();
    const decisionChip = screen.getByRole('button', { name: /decision . 1/i });
    await user.click(decisionChip);
    expect(screen.queryByText('wire the alarm')).not.toBeInTheDocument();
    await user.click(decisionChip);
    expect(screen.getByText('wire the alarm')).toBeInTheDocument();
  });

  it('clears the filter when the all chip is clicked from a filtered view', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: /decision . 1/i }));
    expect(screen.queryByText('wire the alarm')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /all . 4/i }));
    expect(screen.getByText('wire the alarm')).toBeInTheDocument();
  });

  it('renders a group heading for each non-empty type', () => {
    renderPanel();
    const headings = screen
      .getAllByText(/^(decision|action|todo|blocker) . \d+$/)
      .filter((el) => el.tagName !== 'BUTTON');
    expect(headings).toHaveLength(4);
  });

  it('renders only the matching group heading when filtered to one type', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: /decision . 1/i }));
    const headings = screen
      .getAllByText(/^(decision|action|todo|blocker) . \d+$/)
      .filter((el) => el.tagName !== 'BUTTON');
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(/decision/);
  });

  it('renders the two decisions in the same list under the decision group', () => {
    const { container } = render(
      <MeetingsActionItemsPanel
        actions={TWO_DECISIONS}
        meetingId="mtg-1"
      />,
    );
    const list = container.querySelector('ul');
    expect(list).not.toBeNull();
    if (list) {
      const items = within(list as HTMLElement).getAllByRole('listitem');
      expect(items).toHaveLength(2);
    }
  });

  it('forwards actions + meetingId into the useActionItemsExport hook', () => {
    renderPanel({ meetingId: 'mtg-zz' });
    expect(lastExportArgs?.meetingId).toBe('mtg-zz');
    expect(lastExportArgs?.actions).toBe(FULL_ACTIONS);
  });

  it('rerendering with the same props does not duplicate the heading', () => {
    const { rerender, props } = renderPanel();
    rerender(<MeetingsActionItemsPanel {...props} />);
    expect(screen.getAllByText('Action Items')).toHaveLength(1);
  });

  it('preserves the filter selection across rerenders with the same props', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderPanel();
    await user.click(screen.getByRole('button', { name: /decision . 1/i }));
    rerender(<MeetingsActionItemsPanel {...props} />);
    expect(screen.queryByText('wire the alarm')).not.toBeInTheDocument();
  });

  it('re-renders translated copy when the locale flips to ko', () => {
    renderPanel();
    expect(screen.getByText('Action Items')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Action Items')).not.toBeInTheDocument();
  });
});
