import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';

// MeetingsPublishControls is hook-owning. Stub useMeetingPublish
// with a per-test-tunable shape so the JSX wiring is exercised in
// isolation from the wiki /publish POST. Tests cover the default
// render, the Publish button + its aria-label + handlePublish
// click forwarding, the gitCommit checkbox + toggleGitCommit
// payload, the gitPush checkbox + toggleGitPush payload, every
// busy=true gate (button disabled + both checkboxes disabled),
// the msg branch (success vs failed style), the no-msg branch,
// and the locale flip.

interface PublishHookValue {
  busy: boolean;
  msg: string | null;
  failed: boolean;
  gitCommit: boolean;
  toggleGitCommit: (next: boolean) => void;
  gitPush: boolean;
  toggleGitPush: (next: boolean) => void;
  handlePublish: () => Promise<void>;
}

let hookValue: PublishHookValue = {
  busy: false,
  msg: null,
  failed: false,
  gitCommit: false,
  toggleGitCommit: vi.fn(),
  gitPush: false,
  toggleGitPush: vi.fn(),
  handlePublish: vi.fn(() => Promise.resolve()),
};
const hookSpy = vi.fn<(args: { meetingId: string }) => PublishHookValue>();

vi.mock('../lib/use-meeting-publish', () => ({
  useMeetingPublish: (args: { meetingId: string }) => {
    hookSpy(args);
    return hookValue;
  },
}));

import MeetingsPublishControls from './MeetingsPublishControls';

function makeHookValue(over: Partial<PublishHookValue> = {}): PublishHookValue {
  return {
    busy: false,
    msg: null,
    failed: false,
    gitCommit: false,
    toggleGitCommit: vi.fn(),
    gitPush: false,
    toggleGitPush: vi.fn(),
    handlePublish: vi.fn(() => Promise.resolve()),
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  hookValue = makeHookValue();
  hookSpy.mockClear();
});

describe('<MeetingsPublishControls>', () => {
  it('forwards meetingId to useMeetingPublish', () => {
    render(<MeetingsPublishControls meetingId="m-42" />);
    expect(hookSpy).toHaveBeenCalledWith({ meetingId: 'm-42' });
  });

  it('renders the Publish button by accessible name from i18n', () => {
    render(<MeetingsPublishControls meetingId="m1" />);
    expect(
      screen.getByRole('button', { name: 'Publish meeting to wiki' }),
    ).toBeInTheDocument();
  });

  it('renders the "Publish to wiki" visible label on the button', () => {
    render(<MeetingsPublishControls meetingId="m1" />);
    const btn = screen.getByRole('button', {
      name: 'Publish meeting to wiki',
    });
    expect(btn.textContent).toContain('Publish to wiki');
  });

  it('marks the publish icon aria-hidden so the label stays the accessible name', () => {
    render(<MeetingsPublishControls meetingId="m1" />);
    const btn = screen.getByRole('button', {
      name: 'Publish meeting to wiki',
    });
    const icon = btn.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders the gitCommit checkbox labelled by the i18n bundle', () => {
    render(<MeetingsPublishControls meetingId="m1" />);
    expect(
      screen.getByRole('checkbox', { name: 'git commit' }),
    ).toBeInTheDocument();
  });

  it('renders the gitPush checkbox labelled by the i18n bundle', () => {
    render(<MeetingsPublishControls meetingId="m1" />);
    expect(
      screen.getByRole('checkbox', { name: '+ push' }),
    ).toBeInTheDocument();
  });

  it('reflects gitCommit=false in the checkbox checked state', () => {
    hookValue = makeHookValue({ gitCommit: false });
    render(<MeetingsPublishControls meetingId="m1" />);
    expect(
      screen.getByRole('checkbox', { name: 'git commit' }),
    ).not.toBeChecked();
  });

  it('reflects gitCommit=true in the checkbox checked state', () => {
    hookValue = makeHookValue({ gitCommit: true });
    render(<MeetingsPublishControls meetingId="m1" />);
    expect(
      screen.getByRole('checkbox', { name: 'git commit' }),
    ).toBeChecked();
  });

  it('reflects gitPush=false in the checkbox checked state', () => {
    hookValue = makeHookValue({ gitPush: false });
    render(<MeetingsPublishControls meetingId="m1" />);
    expect(
      screen.getByRole('checkbox', { name: '+ push' }),
    ).not.toBeChecked();
  });

  it('reflects gitPush=true in the checkbox checked state', () => {
    hookValue = makeHookValue({ gitPush: true, gitCommit: true });
    render(<MeetingsPublishControls meetingId="m1" />);
    expect(
      screen.getByRole('checkbox', { name: '+ push' }),
    ).toBeChecked();
  });

  it('fires handlePublish when the Publish button is clicked', async () => {
    const handlePublish = vi.fn(() => Promise.resolve());
    hookValue = makeHookValue({ handlePublish });
    const user = userEvent.setup();
    render(<MeetingsPublishControls meetingId="m1" />);
    await user.click(
      screen.getByRole('button', { name: 'Publish meeting to wiki' }),
    );
    expect(handlePublish).toHaveBeenCalledTimes(1);
  });

  it('fires handlePublish on Enter activation of the Publish button', async () => {
    const handlePublish = vi.fn(() => Promise.resolve());
    hookValue = makeHookValue({ handlePublish });
    const user = userEvent.setup();
    render(<MeetingsPublishControls meetingId="m1" />);
    const btn = screen.getByRole('button', {
      name: 'Publish meeting to wiki',
    });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(handlePublish).toHaveBeenCalledTimes(1);
  });

  it('fires toggleGitCommit(true) when the unchecked gitCommit box is clicked', async () => {
    const toggleGitCommit = vi.fn();
    hookValue = makeHookValue({ gitCommit: false, toggleGitCommit });
    const user = userEvent.setup();
    render(<MeetingsPublishControls meetingId="m1" />);
    await user.click(screen.getByRole('checkbox', { name: 'git commit' }));
    expect(toggleGitCommit).toHaveBeenCalledWith(true);
  });

  it('fires toggleGitCommit(false) when the checked gitCommit box is clicked', async () => {
    const toggleGitCommit = vi.fn();
    hookValue = makeHookValue({ gitCommit: true, toggleGitCommit });
    const user = userEvent.setup();
    render(<MeetingsPublishControls meetingId="m1" />);
    await user.click(screen.getByRole('checkbox', { name: 'git commit' }));
    expect(toggleGitCommit).toHaveBeenCalledWith(false);
  });

  it('fires toggleGitPush(true) when the unchecked gitPush box is clicked', async () => {
    const toggleGitPush = vi.fn();
    hookValue = makeHookValue({ gitPush: false, toggleGitPush });
    const user = userEvent.setup();
    render(<MeetingsPublishControls meetingId="m1" />);
    await user.click(screen.getByRole('checkbox', { name: '+ push' }));
    expect(toggleGitPush).toHaveBeenCalledWith(true);
  });

  it('fires toggleGitPush(false) when the checked gitPush box is clicked', async () => {
    const toggleGitPush = vi.fn();
    hookValue = makeHookValue({
      gitCommit: true,
      gitPush: true,
      toggleGitPush,
    });
    const user = userEvent.setup();
    render(<MeetingsPublishControls meetingId="m1" />);
    await user.click(screen.getByRole('checkbox', { name: '+ push' }));
    expect(toggleGitPush).toHaveBeenCalledWith(false);
  });

  it('disables the Publish button when busy is true', () => {
    hookValue = makeHookValue({ busy: true });
    render(<MeetingsPublishControls meetingId="m1" />);
    expect(
      screen.getByRole('button', { name: 'Publish meeting to wiki' }),
    ).toBeDisabled();
  });

  it('enables the Publish button when busy is false', () => {
    hookValue = makeHookValue({ busy: false });
    render(<MeetingsPublishControls meetingId="m1" />);
    expect(
      screen.getByRole('button', { name: 'Publish meeting to wiki' }),
    ).toBeEnabled();
  });

  it('disables the gitCommit checkbox when busy is true', () => {
    hookValue = makeHookValue({ busy: true });
    render(<MeetingsPublishControls meetingId="m1" />);
    expect(
      screen.getByRole('checkbox', { name: 'git commit' }),
    ).toBeDisabled();
  });

  it('disables the gitPush checkbox when busy is true', () => {
    hookValue = makeHookValue({ busy: true });
    render(<MeetingsPublishControls meetingId="m1" />);
    expect(
      screen.getByRole('checkbox', { name: '+ push' }),
    ).toBeDisabled();
  });

  it('does NOT fire handlePublish when the disabled button is clicked', async () => {
    const handlePublish = vi.fn(() => Promise.resolve());
    hookValue = makeHookValue({ busy: true, handlePublish });
    const user = userEvent.setup();
    render(<MeetingsPublishControls meetingId="m1" />);
    await user.click(
      screen.getByRole('button', { name: 'Publish meeting to wiki' }),
    );
    expect(handlePublish).not.toHaveBeenCalled();
  });

  it('does NOT render the message span when msg is null', () => {
    hookValue = makeHookValue({ msg: null });
    const { container } = render(<MeetingsPublishControls meetingId="m1" />);
    // No span carrying the result message — only the button + label texts.
    const muted = container.querySelector('span.text-muted-foreground');
    const destructive = container.querySelector('span.text-destructive');
    expect(muted).toBeNull();
    expect(destructive).toBeNull();
  });

  it('renders the success message span when msg is set and failed is false', () => {
    hookValue = makeHookValue({
      msg: 'published 2 file(s) to /wiki',
      failed: false,
    });
    render(<MeetingsPublishControls meetingId="m1" />);
    const msgEl = screen.getByText('published 2 file(s) to /wiki');
    expect(msgEl).toHaveClass('text-muted-foreground');
    expect(msgEl).not.toHaveClass('text-destructive');
  });

  it('renders the failure message span with destructive class when failed is true', () => {
    hookValue = makeHookValue({
      msg: 'publish failed: wiki conflict',
      failed: true,
    });
    render(<MeetingsPublishControls meetingId="m1" />);
    const msgEl = screen.getByText('publish failed: wiki conflict');
    expect(msgEl).toHaveClass('text-destructive');
    expect(msgEl).not.toHaveClass('text-muted-foreground');
  });

  it('does NOT fire any callback on initial render', () => {
    const handlePublish = vi.fn(() => Promise.resolve());
    const toggleGitCommit = vi.fn();
    const toggleGitPush = vi.fn();
    hookValue = makeHookValue({
      handlePublish,
      toggleGitCommit,
      toggleGitPush,
    });
    render(<MeetingsPublishControls meetingId="m1" />);
    expect(handlePublish).not.toHaveBeenCalled();
    expect(toggleGitCommit).not.toHaveBeenCalled();
    expect(toggleGitPush).not.toHaveBeenCalled();
  });

  it('rerendering with the same props does not duplicate handlePublish calls', async () => {
    const handlePublish = vi.fn(() => Promise.resolve());
    hookValue = makeHookValue({ handlePublish });
    const user = userEvent.setup();
    const { rerender } = render(
      <MeetingsPublishControls meetingId="m1" />,
    );
    rerender(<MeetingsPublishControls meetingId="m1" />);
    await user.click(
      screen.getByRole('button', { name: 'Publish meeting to wiki' }),
    );
    expect(handlePublish).toHaveBeenCalledTimes(1);
  });

  it('rerendering from idle to busy flips the button to disabled', () => {
    hookValue = makeHookValue({ busy: false });
    const { rerender } = render(
      <MeetingsPublishControls meetingId="m1" />,
    );
    expect(
      screen.getByRole('button', { name: 'Publish meeting to wiki' }),
    ).toBeEnabled();
    hookValue = makeHookValue({ busy: true });
    rerender(<MeetingsPublishControls meetingId="m1" />);
    expect(
      screen.getByRole('button', { name: 'Publish meeting to wiki' }),
    ).toBeDisabled();
  });

  it('re-renders when the locale flips (useLocale subscription)', () => {
    render(<MeetingsPublishControls meetingId="m1" />);
    expect(
      screen.getByRole('button', { name: 'Publish meeting to wiki' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    // After the locale flip the English aria-label is gone -- the
    // Korean bundle overrides the accessible name copy.
    expect(
      screen.queryByRole('button', { name: 'Publish meeting to wiki' }),
    ).not.toBeInTheDocument();
  });
});
