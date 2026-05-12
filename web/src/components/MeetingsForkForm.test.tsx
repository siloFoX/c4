import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';

// MeetingsForkForm is a thin controlled wrapper around the
// useMeetingFork hook (the network POST + form-state owner
// already has its own unit tests). The form-component test
// stubs the hook so:
//   - typing into title / task actually reflects in the
//     controlled inputs (real React state inside the mock)
//   - each setter is also a vi.fn() so calls can be asserted
//   - busy / error / handleSubmit can be driven per test
// The four state slots (mode, task, title, track) are
// `useState`d inside the mock so the rendered form behaves
// like the real one without exercising the real network /
// reset effect.

type MeetingForkMode = 'replan' | 'reuse';
type MeetingTrackOrAuto = 'auto' | 'lightweight' | 'standard' | 'full';

let modeInitial: MeetingForkMode = 'replan';
let taskInitial = '';
let titleInitial = '';
let trackInitial: MeetingTrackOrAuto = 'auto';
let busyValue = false;
let errorValue: string | null = null;

const setModeMock = vi.fn();
const setTaskMock = vi.fn();
const setTitleMock = vi.fn();
const setTrackMock = vi.fn();
const handleSubmitMock = vi.fn();
let lastForkArgs: {
  meetingId: string;
  onForked: (id: string) => void;
  onClose: () => void;
} | null = null;

vi.mock('../lib/use-meeting-fork', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    useMeetingFork: (args: {
      meetingId: string;
      onForked: (id: string) => void;
      onClose: () => void;
    }) => {
      lastForkArgs = args;
      const [mode, setModeState] = react.useState<MeetingForkMode>(modeInitial);
      const [task, setTaskState] = react.useState<string>(taskInitial);
      const [title, setTitleState] = react.useState<string>(titleInitial);
      const [track, setTrackState] =
        react.useState<MeetingTrackOrAuto>(trackInitial);
      return {
        mode,
        setMode: (next: MeetingForkMode) => {
          setModeMock(next);
          setModeState(next);
        },
        task,
        setTask: (next: string) => {
          setTaskMock(next);
          setTaskState(next);
        },
        title,
        setTitle: (next: string) => {
          setTitleMock(next);
          setTitleState(next);
        },
        track,
        setTrack: (next: MeetingTrackOrAuto) => {
          setTrackMock(next);
          setTrackState(next);
        },
        busy: busyValue,
        error: errorValue,
        handleSubmit: handleSubmitMock,
      };
    },
  };
});

import MeetingsForkForm from './MeetingsForkForm';

const SAMPLE_MEETING = { id: 'mtg-1', title: 'Source title' };

beforeEach(() => {
  setLocale('en');
  modeInitial = 'replan';
  taskInitial = '';
  titleInitial = '';
  trackInitial = 'auto';
  busyValue = false;
  errorValue = null;
  setModeMock.mockReset();
  setTaskMock.mockReset();
  setTitleMock.mockReset();
  setTrackMock.mockReset();
  handleSubmitMock.mockReset();
  lastForkArgs = null;
});

function renderOpen(
  overrides: Partial<Parameters<typeof MeetingsForkForm>[0]> = {},
) {
  const props = {
    open: true as const,
    meeting: SAMPLE_MEETING,
    busy: false,
    onClose: vi.fn(),
    onForked: vi.fn(),
    ...overrides,
  };
  const utils = render(<MeetingsForkForm {...props} />);
  return { ...utils, props };
}

describe('<MeetingsForkForm>', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <MeetingsForkForm
        open={false}
        meeting={SAMPLE_MEETING}
        busy={false}
        onClose={vi.fn()}
        onForked={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the mode label', () => {
    renderOpen();
    expect(screen.getByText(/mode:/i)).toBeInTheDocument();
  });

  it('renders the mode select with both options (replan + reuse)', () => {
    renderOpen();
    const [modeSelect] = screen.getAllByRole('combobox');
    const values = Array.from(
      (modeSelect as HTMLSelectElement).querySelectorAll('option'),
    ).map((o) => o.value);
    expect(values).toEqual(['replan', 'reuse']);
  });

  it('renders the title input with the i18n aria label', () => {
    renderOpen();
    expect(screen.getByLabelText('Fork title override')).toBeInTheDocument();
  });

  it('renders the task textarea with the i18n aria label', () => {
    renderOpen();
    expect(screen.getByLabelText('Fork task override')).toBeInTheDocument();
  });

  it('renders the Submit button with the i18n aria label', () => {
    renderOpen();
    expect(
      screen.getByRole('button', { name: 'Submit fork' }),
    ).toBeInTheDocument();
  });

  it('shows the track select when mode=replan (default)', () => {
    renderOpen();
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });

  it('hides the track select when mode=reuse', () => {
    modeInitial = 'reuse';
    renderOpen();
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });

  it('hides the track select live after the user toggles mode to reuse', async () => {
    const user = userEvent.setup();
    renderOpen();
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    const [modeSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(modeSelect, 'reuse');
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });

  it('shows "Fork (replan)" on the submit button by default', () => {
    renderOpen();
    expect(
      screen.getByRole('button', { name: 'Submit fork' }),
    ).toHaveTextContent('Fork (replan)');
  });

  it('shows "Fork (reuse)" on the submit button when mode=reuse', () => {
    modeInitial = 'reuse';
    renderOpen();
    expect(
      screen.getByRole('button', { name: 'Submit fork' }),
    ).toHaveTextContent('Fork (reuse)');
  });

  it('uses the meeting title in the title input placeholder', () => {
    renderOpen();
    expect(screen.getByPlaceholderText(/Source title/i)).toBeInTheDocument();
  });

  it('falls back to "same as source" when the meeting has no title', () => {
    renderOpen({ meeting: { id: 'mtg-2', title: '' } });
    // The textarea placeholder also mentions "same as source" -- scope
    // the lookup to the title input via its aria-label.
    const titleInput = screen.getByLabelText(
      'Fork title override',
    ) as HTMLInputElement;
    expect(titleInput.placeholder.toLowerCase()).toContain('same as source');
  });

  it('renders the track select with the four options when mode=replan', () => {
    renderOpen();
    const trackSelect = screen.getAllByRole('combobox')[1] as HTMLSelectElement;
    const values = Array.from(trackSelect.querySelectorAll('option')).map(
      (o) => o.value,
    );
    expect(values).toEqual(['auto', 'lightweight', 'standard', 'full']);
  });

  it('reflects typed text in the controlled title input', async () => {
    const user = userEvent.setup();
    renderOpen();
    const input = screen.getByLabelText(
      'Fork title override',
    ) as HTMLInputElement;
    await user.type(input, 'My override');
    expect(input.value).toBe('My override');
  });

  it('fires the title setter from the mocked hook on every keystroke', async () => {
    const user = userEvent.setup();
    renderOpen();
    const input = screen.getByLabelText('Fork title override');
    await user.type(input, 'abc');
    expect(setTitleMock).toHaveBeenCalledTimes(3);
    expect(setTitleMock).toHaveBeenLastCalledWith('abc');
  });

  it('reflects typed text in the controlled task textarea', async () => {
    const user = userEvent.setup();
    renderOpen();
    const ta = screen.getByLabelText(
      'Fork task override',
    ) as HTMLTextAreaElement;
    await user.type(ta, 'sharper scope');
    expect(ta.value).toBe('sharper scope');
  });

  it('fires the task setter from the mocked hook on every keystroke', async () => {
    const user = userEvent.setup();
    renderOpen();
    const ta = screen.getByLabelText('Fork task override');
    await user.type(ta, 'xy');
    expect(setTaskMock).toHaveBeenCalledTimes(2);
    expect(setTaskMock).toHaveBeenLastCalledWith('xy');
  });

  it('fires setMode when the mode select is changed', async () => {
    const user = userEvent.setup();
    renderOpen();
    const [modeSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(modeSelect, 'reuse');
    expect(setModeMock).toHaveBeenCalledWith('reuse');
  });

  it('fires setTrack when the track select is changed', async () => {
    const user = userEvent.setup();
    renderOpen();
    const trackSelect = screen.getAllByRole('combobox')[1];
    await user.selectOptions(trackSelect, 'standard');
    expect(setTrackMock).toHaveBeenCalledWith('standard');
  });

  it('fires handleSubmit exactly once when the submit button is clicked', async () => {
    const user = userEvent.setup();
    renderOpen();
    await user.click(screen.getByRole('button', { name: 'Submit fork' }));
    expect(handleSubmitMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire handleSubmit on Enter inside the title input (no form-level submit)', async () => {
    const user = userEvent.setup();
    renderOpen();
    const input = screen.getByLabelText('Fork title override');
    await user.click(input);
    await user.keyboard('hello{Enter}');
    expect(handleSubmitMock).not.toHaveBeenCalled();
  });

  it('disables the submit button when the hook busy flag is true', () => {
    busyValue = true;
    renderOpen();
    expect(
      screen.getByRole('button', { name: 'Submit fork' }),
    ).toBeDisabled();
  });

  it('disables the submit button when the parentBusy prop is true', () => {
    renderOpen({ busy: true });
    expect(
      screen.getByRole('button', { name: 'Submit fork' }),
    ).toBeDisabled();
  });

  it('disables the mode select when busy', () => {
    busyValue = true;
    renderOpen();
    const [modeSelect] = screen.getAllByRole('combobox');
    expect(modeSelect).toBeDisabled();
  });

  it('disables the title input when busy', () => {
    busyValue = true;
    renderOpen();
    expect(screen.getByLabelText('Fork title override')).toBeDisabled();
  });

  it('disables the task textarea when busy', () => {
    busyValue = true;
    renderOpen();
    expect(screen.getByLabelText('Fork task override')).toBeDisabled();
  });

  it('disables the track select when busy', () => {
    busyValue = true;
    renderOpen();
    const trackSelect = screen.getAllByRole('combobox')[1];
    expect(trackSelect).toBeDisabled();
  });

  it('disables every control via the parentBusy prop too', () => {
    renderOpen({ busy: true });
    expect(screen.getByLabelText('Fork title override')).toBeDisabled();
    expect(screen.getByLabelText('Fork task override')).toBeDisabled();
    expect(screen.getAllByRole('combobox')[0]).toBeDisabled();
    expect(screen.getAllByRole('combobox')[1]).toBeDisabled();
  });

  it('marks the title input disabled exactly once when busy (no double-disable)', () => {
    busyValue = true;
    renderOpen();
    const input = screen.getByLabelText(
      'Fork title override',
    ) as HTMLInputElement;
    expect(input.disabled).toBe(true);
    // Only the HTML disabled attribute itself counts -- the Input's
    // CSS class set carries the tailwind "disabled:" pseudo-class
    // tokens, so don't string-match on outerHTML.
    expect(input.hasAttribute('disabled')).toBe(true);
  });

  it('renders the busy ellipsis glyph on the submit button when busy', () => {
    busyValue = true;
    renderOpen();
    const btn = screen.getByRole('button', { name: 'Submit fork' });
    expect(btn.textContent).toBe(String.fromCharCode(0x2026));
    expect(btn.textContent).not.toContain('Fork');
  });

  it('does NOT call handleSubmit when the submit button is clicked while busy', async () => {
    const user = userEvent.setup();
    busyValue = true;
    renderOpen();
    await user.click(screen.getByRole('button', { name: 'Submit fork' }));
    expect(handleSubmitMock).not.toHaveBeenCalled();
  });

  it('renders the hook-surfaced error text', () => {
    errorValue = 'fork failed (409)';
    renderOpen();
    expect(screen.getByText('fork failed (409)')).toBeInTheDocument();
  });

  it('does NOT render any error text when null', () => {
    renderOpen();
    expect(screen.queryByText(/fork failed/i)).not.toBeInTheDocument();
  });

  it('forwards onForked + onClose + meetingId into the useMeetingFork hook', () => {
    const onForked = vi.fn();
    const onClose = vi.fn();
    renderOpen({
      onForked,
      onClose,
      meeting: { id: 'mtg-zz', title: 'zz' },
    });
    expect(lastForkArgs?.onForked).toBe(onForked);
    expect(lastForkArgs?.onClose).toBe(onClose);
    expect(lastForkArgs?.meetingId).toBe('mtg-zz');
  });

  it('tabs forward through mode -> track -> title -> task -> submit', async () => {
    const user = userEvent.setup();
    renderOpen();
    const [modeSelect, trackSelect] = screen.getAllByRole('combobox');
    await user.tab();
    expect(modeSelect).toHaveFocus();
    await user.tab();
    expect(trackSelect).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Fork title override')).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Fork task override')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Submit fork' })).toHaveFocus();
  });

  it('rerendering with the same props does not duplicate the form', () => {
    const { rerender, props } = renderOpen();
    rerender(<MeetingsForkForm {...props} />);
    expect(screen.getAllByLabelText('Fork title override')).toHaveLength(1);
  });

  it('keeps the form stable across rerenders with the same hook output', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderOpen();
    await user.type(screen.getByLabelText('Fork title override'), 'x');
    rerender(<MeetingsForkForm {...props} />);
    expect(
      (screen.getByLabelText('Fork title override') as HTMLInputElement).value,
    ).toBe('x');
  });

  it('re-renders translated copy when the locale flips (useLocale subscription)', () => {
    renderOpen();
    expect(
      screen.getByRole('button', { name: 'Submit fork' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    // After flip, the English "Submit fork" aria-label is gone
    // because the Korean bundle ships its own translation.
    expect(
      screen.queryByRole('button', { name: 'Submit fork' }),
    ).not.toBeInTheDocument();
    // The Submit button itself is still mounted (re-rendered, not
    // unmounted), just with a different aria-label.
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});
