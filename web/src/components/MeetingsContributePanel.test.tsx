import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { MeetingVote } from '../lib/use-meeting-contribute';

// MeetingsContributePanel is a thin controlled wrapper around
// the useMeetingContribute hook. The hook owns the four field
// state slots + the contribute / vote-only handlers and has
// its own unit tests. The component test mocks the hook with
// real useState so:
//   - typing into specialist / text / reason actually reflects
//     in the controlled inputs (real React state inside the mock)
//   - each setter is also a vi.fn() so calls can be asserted
//   - busy / msg / failed can be driven per test
// The handlers themselves stay as vi.fn() so we can verify they
// fire on click.

let specialistInitial = '';
let textInitial = '';
let voteInitial: '' | MeetingVote = '';
let reasonInitial = '';
let busyValue = false;
let msgValue: string | null = null;
let failedValue = false;

const setSpecialistMock = vi.fn();
const setTextMock = vi.fn();
const setVoteMock = vi.fn();
const setReasonMock = vi.fn();
const handleContributeMock = vi.fn();
const handleVoteOnlyMock = vi.fn();
let lastContributeArgs: { meetingId: string } | null = null;

vi.mock('../lib/use-meeting-contribute', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    useMeetingContribute: (args: { meetingId: string }) => {
      lastContributeArgs = args;
      const [specialist, setSpecialistState] =
        react.useState<string>(specialistInitial);
      const [text, setTextState] = react.useState<string>(textInitial);
      const [vote, setVoteState] = react.useState<'' | MeetingVote>(
        voteInitial,
      );
      const [reason, setReasonState] = react.useState<string>(reasonInitial);
      return {
        specialist,
        setSpecialist: (next: string) => {
          setSpecialistMock(next);
          setSpecialistState(next);
        },
        text,
        setText: (next: string) => {
          setTextMock(next);
          setTextState(next);
        },
        vote,
        setVote: (next: '' | MeetingVote) => {
          setVoteMock(next);
          setVoteState(next);
        },
        reason,
        setReason: (next: string) => {
          setReasonMock(next);
          setReasonState(next);
        },
        busy: busyValue,
        msg: msgValue,
        failed: failedValue,
        handleContribute: handleContributeMock,
        handleVoteOnly: handleVoteOnlyMock,
      };
    },
  };
});

import MeetingsContributePanel from './MeetingsContributePanel';

beforeEach(() => {
  setLocale('en');
  specialistInitial = '';
  textInitial = '';
  voteInitial = '';
  reasonInitial = '';
  busyValue = false;
  msgValue = null;
  failedValue = false;
  setSpecialistMock.mockReset();
  setTextMock.mockReset();
  setVoteMock.mockReset();
  setReasonMock.mockReset();
  handleContributeMock.mockReset();
  handleVoteOnlyMock.mockReset();
  lastContributeArgs = null;
});

function renderOpen(
  overrides: Partial<Parameters<typeof MeetingsContributePanel>[0]> = {},
) {
  const props = {
    open: true as const,
    meetingId: 'mtg-1',
    ...overrides,
  };
  const utils = render(<MeetingsContributePanel {...props} />);
  return { ...utils, props };
}

describe('<MeetingsContributePanel>', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <MeetingsContributePanel open={false} meetingId="mtg-1" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the specialist id input with the i18n aria label', () => {
    renderOpen();
    expect(screen.getByLabelText('Specialist id')).toBeInTheDocument();
  });

  it('renders the specialist id placeholder', () => {
    renderOpen();
    expect(
      screen.getByPlaceholderText(/specialistId/i),
    ).toBeInTheDocument();
  });

  it('renders the contribution body textarea with the i18n aria label', () => {
    renderOpen();
    expect(screen.getByLabelText('Contribution text')).toBeInTheDocument();
  });

  it('renders the contribution body placeholder', () => {
    renderOpen();
    expect(
      screen.getByPlaceholderText(/contribution body/i),
    ).toBeInTheDocument();
  });

  it('renders the vote reason input with the i18n aria label', () => {
    renderOpen();
    expect(screen.getByLabelText('Vote reason')).toBeInTheDocument();
  });

  it('renders the vote-with-contrib select with all three options', () => {
    renderOpen();
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    const values = Array.from(select.querySelectorAll('option')).map(
      (o) => o.value,
    );
    expect(values).toEqual(['', 'accept', 'object']);
  });

  it('renders the Post contribution button with the i18n aria label', () => {
    renderOpen();
    expect(
      screen.getByRole('button', { name: 'Post contribution' }),
    ).toBeInTheDocument();
  });

  it('renders the Vote accept button with the i18n aria label', () => {
    renderOpen();
    expect(
      screen.getByRole('button', { name: 'Vote accept' }),
    ).toBeInTheDocument();
  });

  it('renders the Vote object button with the i18n aria label', () => {
    renderOpen();
    expect(
      screen.getByRole('button', { name: 'Vote object' }),
    ).toBeInTheDocument();
  });

  it('renders the vote-only row label', () => {
    renderOpen();
    expect(screen.getByText('vote-only:')).toBeInTheDocument();
  });

  it('reflects typed text in the controlled specialist input', async () => {
    const user = userEvent.setup();
    renderOpen();
    const input = screen.getByLabelText(
      'Specialist id',
    ) as HTMLInputElement;
    await user.type(input, 'security-auditor');
    expect(input.value).toBe('security-auditor');
  });

  it('fires setSpecialist for every keystroke', async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.type(screen.getByLabelText('Specialist id'), 'sec');
    expect(setSpecialistMock).toHaveBeenCalledTimes(3);
    expect(setSpecialistMock).toHaveBeenLastCalledWith('sec');
  });

  it('reflects typed text in the controlled body textarea', async () => {
    const user = userEvent.setup();
    renderOpen();
    const ta = screen.getByLabelText(
      'Contribution text',
    ) as HTMLTextAreaElement;
    await user.type(ta, 'note');
    expect(ta.value).toBe('note');
  });

  it('fires setText for every keystroke in the body', async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.type(screen.getByLabelText('Contribution text'), 'ab');
    expect(setTextMock).toHaveBeenCalledTimes(2);
    expect(setTextMock).toHaveBeenLastCalledWith('ab');
  });

  it('reflects typed text in the controlled reason input', async () => {
    const user = userEvent.setup();
    renderOpen();
    const input = screen.getByLabelText('Vote reason') as HTMLInputElement;
    await user.type(input, 'concerns');
    expect(input.value).toBe('concerns');
  });

  it('fires setVote when the vote select is changed', async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.selectOptions(screen.getByRole('combobox'), 'accept');
    expect(setVoteMock).toHaveBeenCalledWith('accept');
  });

  it('reflects the vote choice in the controlled select', async () => {
    const user = userEvent.setup();
    renderOpen();
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    await user.selectOptions(select, 'object');
    expect(select.value).toBe('object');
  });

  it('starts the post button disabled when specialist + text are empty', () => {
    renderOpen();
    expect(
      screen.getByRole('button', { name: 'Post contribution' }),
    ).toBeDisabled();
  });

  it('keeps post disabled when only specialist is typed (no body)', async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.type(screen.getByLabelText('Specialist id'), 'sec');
    expect(
      screen.getByRole('button', { name: 'Post contribution' }),
    ).toBeDisabled();
  });

  it('keeps post disabled when only body is typed (no specialist)', async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.type(screen.getByLabelText('Contribution text'), 'note');
    expect(
      screen.getByRole('button', { name: 'Post contribution' }),
    ).toBeDisabled();
  });

  it('keeps post disabled when both are whitespace-only', async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.type(screen.getByLabelText('Specialist id'), '   ');
    await user.type(screen.getByLabelText('Contribution text'), '   ');
    expect(
      screen.getByRole('button', { name: 'Post contribution' }),
    ).toBeDisabled();
  });

  it('enables post once specialist and text are both non-empty', async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.type(screen.getByLabelText('Specialist id'), 'sec');
    await user.type(screen.getByLabelText('Contribution text'), 'note');
    expect(
      screen.getByRole('button', { name: 'Post contribution' }),
    ).not.toBeDisabled();
  });

  it('calls handleContribute exactly once when post is clicked', async () => {
    const user = userEvent.setup();
    specialistInitial = 'sec';
    textInitial = 'note';
    renderOpen();
    await user.click(
      screen.getByRole('button', { name: 'Post contribution' }),
    );
    expect(handleContributeMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT call handleContribute when post is clicked while disabled', async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.click(
      screen.getByRole('button', { name: 'Post contribution' }),
    );
    expect(handleContributeMock).not.toHaveBeenCalled();
  });

  it('starts the vote-only Accept disabled when specialist is empty', () => {
    renderOpen();
    expect(
      screen.getByRole('button', { name: 'Vote accept' }),
    ).toBeDisabled();
  });

  it('starts the vote-only Object disabled when specialist is empty', () => {
    renderOpen();
    expect(
      screen.getByRole('button', { name: 'Vote object' }),
    ).toBeDisabled();
  });

  it('enables both vote-only buttons once specialist is typed', async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.type(screen.getByLabelText('Specialist id'), 'sec');
    expect(
      screen.getByRole('button', { name: 'Vote accept' }),
    ).not.toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Vote object' }),
    ).not.toBeDisabled();
  });

  it('calls handleVoteOnly("accept") when the Vote accept button is clicked', async () => {
    const user = userEvent.setup();
    specialistInitial = 'sec';
    renderOpen();
    await user.click(screen.getByRole('button', { name: 'Vote accept' }));
    expect(handleVoteOnlyMock).toHaveBeenCalledTimes(1);
    expect(handleVoteOnlyMock).toHaveBeenCalledWith('accept');
  });

  it('calls handleVoteOnly("object") when the Vote object button is clicked', async () => {
    const user = userEvent.setup();
    specialistInitial = 'sec';
    renderOpen();
    await user.click(screen.getByRole('button', { name: 'Vote object' }));
    expect(handleVoteOnlyMock).toHaveBeenCalledTimes(1);
    expect(handleVoteOnlyMock).toHaveBeenCalledWith('object');
  });

  it('disables the specialist input when busy', () => {
    busyValue = true;
    renderOpen();
    expect(screen.getByLabelText('Specialist id')).toBeDisabled();
  });

  it('disables the body textarea when busy', () => {
    busyValue = true;
    renderOpen();
    expect(screen.getByLabelText('Contribution text')).toBeDisabled();
  });

  it('disables the reason input when busy', () => {
    busyValue = true;
    renderOpen();
    expect(screen.getByLabelText('Vote reason')).toBeDisabled();
  });

  it('disables the vote select when busy', () => {
    busyValue = true;
    renderOpen();
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('disables the post button when busy regardless of field values', () => {
    busyValue = true;
    specialistInitial = 'sec';
    textInitial = 'note';
    renderOpen();
    expect(
      screen.getByRole('button', { name: 'Post contribution' }),
    ).toBeDisabled();
  });

  it('disables both vote-only buttons when busy', () => {
    busyValue = true;
    specialistInitial = 'sec';
    renderOpen();
    expect(
      screen.getByRole('button', { name: 'Vote accept' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Vote object' }),
    ).toBeDisabled();
  });

  it('swaps the post button label to ellipsis when busy', () => {
    busyValue = true;
    renderOpen();
    expect(
      screen.getByRole('button', { name: 'Post contribution' }),
    ).toHaveTextContent(String.fromCharCode(0x2026));
  });

  it('keeps the post label text intact when not busy', () => {
    renderOpen();
    expect(
      screen.getByRole('button', { name: 'Post contribution' }),
    ).toHaveTextContent('Post contribution');
  });

  it('does NOT render any banner text when msg is null', () => {
    renderOpen();
    expect(
      document.querySelector('.text-destructive'),
    ).toBeNull();
  });

  it('renders the success message with the muted tone when failed=false', () => {
    msgValue = 'contribution recorded';
    failedValue = false;
    renderOpen();
    const banner = screen.getByText('contribution recorded');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveClass('text-muted-foreground');
    expect(banner).not.toHaveClass('text-destructive');
  });

  it('renders the failure message with the destructive tone when failed=true', () => {
    msgValue = 'contribute failed: 500';
    failedValue = true;
    renderOpen();
    const banner = screen.getByText('contribute failed: 500');
    expect(banner).toHaveClass('text-destructive');
    expect(banner).not.toHaveClass('text-muted-foreground');
  });

  it('forwards meetingId into the useMeetingContribute hook', () => {
    renderOpen({ meetingId: 'mtg-zz' });
    expect(lastContributeArgs?.meetingId).toBe('mtg-zz');
  });

  it('rerendering with the same props does not duplicate the form', () => {
    const { rerender, props } = renderOpen();
    rerender(<MeetingsContributePanel {...props} />);
    expect(screen.getAllByLabelText('Specialist id')).toHaveLength(1);
  });

  it('keeps the typed specialist value stable across rerenders', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderOpen();
    await user.type(screen.getByLabelText('Specialist id'), 'x');
    rerender(<MeetingsContributePanel {...props} />);
    expect(
      (screen.getByLabelText('Specialist id') as HTMLInputElement).value,
    ).toBe('x');
  });

  it('re-renders translated copy when the locale flips to ko', () => {
    renderOpen();
    expect(
      screen.getByRole('button', { name: 'Post contribution' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: 'Post contribution' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});
