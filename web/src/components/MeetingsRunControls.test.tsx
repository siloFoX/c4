import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { MeetingBrain } from '../lib/use-meeting-run';

// MeetingsRunControls is hook-owning. Stub useMeetingRun with a
// per-test-tunable shape so the JSX wiring is exercised in
// isolation from the /run POST. Tests cover the brain select +
// option list + aria-label, the brain prop reflected as selected
// value, the Run button + its aria-label + handleRun click
// forwarding, every busy=true gate (button disabled + select
// disabled), the setBrain payload for both option values, the
// error message render, the locale flip.

interface RunHookValue {
  busy: boolean;
  error: string | null;
  brain: MeetingBrain;
  setBrain: (next: MeetingBrain) => void;
  handleRun: () => Promise<void>;
}

let hookValue: RunHookValue = {
  busy: false,
  error: null,
  brain: 'mock',
  setBrain: vi.fn(),
  handleRun: vi.fn(() => Promise.resolve()),
};
const hookSpy = vi.fn<(args: { meetingId: string }) => RunHookValue>();

vi.mock('../lib/use-meeting-run', async () => {
  const actual = await vi.importActual<typeof import('../lib/use-meeting-run')>(
    '../lib/use-meeting-run',
  );
  return {
    ...actual,
    useMeetingRun: (args: { meetingId: string }) => {
      hookSpy(args);
      return hookValue;
    },
  };
});

import MeetingsRunControls from './MeetingsRunControls';

function makeHookValue(over: Partial<RunHookValue> = {}): RunHookValue {
  return {
    busy: false,
    error: null,
    brain: 'mock',
    setBrain: vi.fn(),
    handleRun: vi.fn(() => Promise.resolve()),
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  hookValue = makeHookValue();
  hookSpy.mockClear();
});

describe('<MeetingsRunControls>', () => {
  it('forwards meetingId to useMeetingRun', () => {
    render(<MeetingsRunControls meetingId="m-42" />);
    expect(hookSpy).toHaveBeenCalledWith({ meetingId: 'm-42' });
  });

  it('renders the brain select labelled by the i18n accessible name', () => {
    render(<MeetingsRunControls meetingId="m1" />);
    expect(
      screen.getByRole('combobox', { name: 'Run brain' }),
    ).toBeInTheDocument();
  });

  it('renders the "brain:" label text from the i18n bundle', () => {
    render(<MeetingsRunControls meetingId="m1" />);
    expect(screen.getByText('brain:')).toBeInTheDocument();
  });

  it('renders both brain options on the select', () => {
    render(<MeetingsRunControls meetingId="m1" />);
    const select = screen.getByRole('combobox', {
      name: 'Run brain',
    }) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['mock', 'claude']);
  });

  it('renders the mock option label from the i18n bundle', () => {
    render(<MeetingsRunControls meetingId="m1" />);
    expect(screen.getByText('mock (instant)')).toBeInTheDocument();
  });

  it('renders the claude option label from the i18n bundle', () => {
    render(<MeetingsRunControls meetingId="m1" />);
    expect(screen.getByText('claude (slow, real)')).toBeInTheDocument();
  });

  it('reflects brain="mock" as the selected option', () => {
    hookValue = makeHookValue({ brain: 'mock' });
    render(<MeetingsRunControls meetingId="m1" />);
    const select = screen.getByRole('combobox', {
      name: 'Run brain',
    }) as HTMLSelectElement;
    expect(select.value).toBe('mock');
  });

  it('reflects brain="claude" as the selected option', () => {
    hookValue = makeHookValue({ brain: 'claude' });
    render(<MeetingsRunControls meetingId="m1" />);
    const select = screen.getByRole('combobox', {
      name: 'Run brain',
    }) as HTMLSelectElement;
    expect(select.value).toBe('claude');
  });

  it('fires setBrain("claude") when the user picks the claude option', async () => {
    const setBrain = vi.fn();
    hookValue = makeHookValue({ brain: 'mock', setBrain });
    const user = userEvent.setup();
    render(<MeetingsRunControls meetingId="m1" />);
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Run brain' }),
      'claude',
    );
    expect(setBrain).toHaveBeenCalledTimes(1);
    expect(setBrain).toHaveBeenCalledWith('claude');
  });

  it('fires setBrain("mock") when the user picks the mock option', async () => {
    const setBrain = vi.fn();
    hookValue = makeHookValue({ brain: 'claude', setBrain });
    const user = userEvent.setup();
    render(<MeetingsRunControls meetingId="m1" />);
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Run brain' }),
      'mock',
    );
    expect(setBrain).toHaveBeenCalledWith('mock');
  });

  it('renders the Run button by accessible name from i18n', () => {
    render(<MeetingsRunControls meetingId="m1" />);
    expect(
      screen.getByRole('button', { name: 'Run meeting' }),
    ).toBeInTheDocument();
  });

  it('renders the "Run + auto-finalize" visible label on the button', () => {
    render(<MeetingsRunControls meetingId="m1" />);
    const btn = screen.getByRole('button', { name: 'Run meeting' });
    expect(btn.textContent).toContain('Run + auto-finalize');
  });

  it('marks the run icon aria-hidden so the label stays the accessible name', () => {
    render(<MeetingsRunControls meetingId="m1" />);
    const btn = screen.getByRole('button', { name: 'Run meeting' });
    const icon = btn.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('fires handleRun when the Run button is clicked', async () => {
    const handleRun = vi.fn(() => Promise.resolve());
    hookValue = makeHookValue({ handleRun });
    const user = userEvent.setup();
    render(<MeetingsRunControls meetingId="m1" />);
    await user.click(screen.getByRole('button', { name: 'Run meeting' }));
    expect(handleRun).toHaveBeenCalledTimes(1);
  });

  it('fires handleRun on Enter activation of the Run button', async () => {
    const handleRun = vi.fn(() => Promise.resolve());
    hookValue = makeHookValue({ handleRun });
    const user = userEvent.setup();
    render(<MeetingsRunControls meetingId="m1" />);
    const btn = screen.getByRole('button', { name: 'Run meeting' });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(handleRun).toHaveBeenCalledTimes(1);
  });

  it('disables the Run button when busy is true', () => {
    hookValue = makeHookValue({ busy: true });
    render(<MeetingsRunControls meetingId="m1" />);
    expect(
      screen.getByRole('button', { name: 'Run meeting' }),
    ).toBeDisabled();
  });

  it('enables the Run button when busy is false', () => {
    hookValue = makeHookValue({ busy: false });
    render(<MeetingsRunControls meetingId="m1" />);
    expect(
      screen.getByRole('button', { name: 'Run meeting' }),
    ).toBeEnabled();
  });

  it('disables the brain select when busy is true', () => {
    hookValue = makeHookValue({ busy: true });
    render(<MeetingsRunControls meetingId="m1" />);
    expect(
      screen.getByRole('combobox', { name: 'Run brain' }),
    ).toBeDisabled();
  });

  it('enables the brain select when busy is false', () => {
    hookValue = makeHookValue({ busy: false });
    render(<MeetingsRunControls meetingId="m1" />);
    expect(
      screen.getByRole('combobox', { name: 'Run brain' }),
    ).toBeEnabled();
  });

  it('does NOT fire handleRun when the disabled button is clicked', async () => {
    const handleRun = vi.fn(() => Promise.resolve());
    hookValue = makeHookValue({ busy: true, handleRun });
    const user = userEvent.setup();
    render(<MeetingsRunControls meetingId="m1" />);
    await user.click(screen.getByRole('button', { name: 'Run meeting' }));
    expect(handleRun).not.toHaveBeenCalled();
  });

  it('does NOT render the error span when error is null', () => {
    hookValue = makeHookValue({ error: null });
    const { container } = render(<MeetingsRunControls meetingId="m1" />);
    expect(
      container.querySelector('span.text-destructive'),
    ).toBeNull();
  });

  it('renders the error span with destructive class when error is set', () => {
    hookValue = makeHookValue({ error: 'meeting not pending' });
    render(<MeetingsRunControls meetingId="m1" />);
    const msgEl = screen.getByText('meeting not pending');
    expect(msgEl).toHaveClass('text-destructive');
  });

  it('does NOT fire any callback on initial render', () => {
    const handleRun = vi.fn(() => Promise.resolve());
    const setBrain = vi.fn();
    hookValue = makeHookValue({ handleRun, setBrain });
    render(<MeetingsRunControls meetingId="m1" />);
    expect(handleRun).not.toHaveBeenCalled();
    expect(setBrain).not.toHaveBeenCalled();
  });

  it('rerendering with the same props does not duplicate handleRun calls', async () => {
    const handleRun = vi.fn(() => Promise.resolve());
    hookValue = makeHookValue({ handleRun });
    const user = userEvent.setup();
    const { rerender } = render(<MeetingsRunControls meetingId="m1" />);
    rerender(<MeetingsRunControls meetingId="m1" />);
    await user.click(screen.getByRole('button', { name: 'Run meeting' }));
    expect(handleRun).toHaveBeenCalledTimes(1);
  });

  it('rerendering from idle to busy flips the button to disabled', () => {
    hookValue = makeHookValue({ busy: false });
    const { rerender } = render(<MeetingsRunControls meetingId="m1" />);
    expect(
      screen.getByRole('button', { name: 'Run meeting' }),
    ).toBeEnabled();
    hookValue = makeHookValue({ busy: true });
    rerender(<MeetingsRunControls meetingId="m1" />);
    expect(
      screen.getByRole('button', { name: 'Run meeting' }),
    ).toBeDisabled();
  });

  it('rerendering from no-error to error reveals the error span', () => {
    hookValue = makeHookValue({ error: null });
    const { rerender, container } = render(
      <MeetingsRunControls meetingId="m1" />,
    );
    expect(
      container.querySelector('span.text-destructive'),
    ).toBeNull();
    hookValue = makeHookValue({ error: 'boom' });
    rerender(<MeetingsRunControls meetingId="m1" />);
    expect(screen.getByText('boom')).toHaveClass('text-destructive');
  });

  it('re-renders when the locale flips (useLocale subscription)', () => {
    render(<MeetingsRunControls meetingId="m1" />);
    expect(
      screen.getByRole('button', { name: 'Run meeting' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    // After the locale flip the English aria-label is gone -- the
    // Korean bundle overrides the accessible name copy.
    expect(
      screen.queryByRole('button', { name: 'Run meeting' }),
    ).not.toBeInTheDocument();
  });
});
