import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { MeetingBrain } from '../lib/use-meeting-run';

// MeetingsPeerRetroControls is a thin brain-selector + run-button
// row around the useMeetingPeerRetro hook. The hook owns the POST
// + busy + msg + failed + brain slots and has its own unit tests.
// The component test mocks the hook with real useState so the
// brain select reflects user changes, and stubs the setter +
// handler as vi.fn() so the wiring can be asserted in isolation.

let brainInitial: MeetingBrain = 'mock';
let busyValue = false;
let msgValue: string | null = null;
let failedValue = false;

const setBrainMock = vi.fn();
const handlePeerRetroMock = vi.fn();
let lastPeerRetroArgs: { meetingId: string } | null = null;

vi.mock('../lib/use-meeting-peer-retro', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    useMeetingPeerRetro: (args: { meetingId: string }) => {
      lastPeerRetroArgs = args;
      const [brain, setBrainState] =
        react.useState<MeetingBrain>(brainInitial);
      return {
        busy: busyValue,
        msg: msgValue,
        failed: failedValue,
        brain,
        setBrain: (next: MeetingBrain) => {
          setBrainMock(next);
          setBrainState(next);
        },
        handlePeerRetro: handlePeerRetroMock,
      };
    },
  };
});

import MeetingsPeerRetroControls from './MeetingsPeerRetroControls';

beforeEach(() => {
  setLocale('en');
  brainInitial = 'mock';
  busyValue = false;
  msgValue = null;
  failedValue = false;
  setBrainMock.mockReset();
  handlePeerRetroMock.mockReset();
  lastPeerRetroArgs = null;
});

function renderRow(
  overrides: Partial<Parameters<typeof MeetingsPeerRetroControls>[0]> = {},
) {
  const props = {
    meetingId: 'mtg-1',
    ...overrides,
  };
  const utils = render(<MeetingsPeerRetroControls {...props} />);
  return { ...utils, props };
}

describe('<MeetingsPeerRetroControls>', () => {
  it('renders the peer-brain label text', () => {
    renderRow();
    expect(screen.getByText('peer brain:')).toBeInTheDocument();
  });

  it('renders the brain select with the i18n aria label', () => {
    renderRow();
    expect(screen.getByLabelText('Peer-retro brain')).toBeInTheDocument();
  });

  it('exposes the two brain options in order (mock then claude)', () => {
    renderRow();
    const select = screen.getByLabelText(
      'Peer-retro brain',
    ) as HTMLSelectElement;
    const values = Array.from(select.querySelectorAll('option')).map(
      (o) => o.value,
    );
    expect(values).toEqual(['mock', 'claude']);
  });

  it('renders the Run peer retro button with the i18n aria label', () => {
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Run peer retro' }),
    ).toBeInTheDocument();
  });

  it('uses the Peer retro label text on the run button', () => {
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Run peer retro' }),
    ).toHaveTextContent('Peer retro');
  });

  it('attaches the peer-retro tooltip text to the run button title', () => {
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Run peer retro' }),
    ).toHaveAttribute(
      'title',
      'Each speaker rates their peers; aggregate folds into the registry score',
    );
  });

  it('starts the brain select at "mock"', () => {
    renderRow();
    expect(
      (screen.getByLabelText('Peer-retro brain') as HTMLSelectElement).value,
    ).toBe('mock');
  });

  it('initial brain follows the hook initial value (claude)', () => {
    brainInitial = 'claude';
    renderRow();
    expect(
      (screen.getByLabelText('Peer-retro brain') as HTMLSelectElement).value,
    ).toBe('claude');
  });

  it('fires setBrain when the brain select is changed to claude', async () => {
    const user = userEvent.setup();
    renderRow();
    await user.selectOptions(
      screen.getByLabelText('Peer-retro brain'),
      'claude',
    );
    expect(setBrainMock).toHaveBeenCalledWith('claude');
  });

  it('reflects the brain choice in the controlled select after change', async () => {
    const user = userEvent.setup();
    renderRow();
    const select = screen.getByLabelText(
      'Peer-retro brain',
    ) as HTMLSelectElement;
    await user.selectOptions(select, 'claude');
    expect(select.value).toBe('claude');
  });

  it('fires handlePeerRetro exactly once when the run button is clicked', async () => {
    const user = userEvent.setup();
    renderRow();
    await user.click(screen.getByRole('button', { name: 'Run peer retro' }));
    expect(handlePeerRetroMock).toHaveBeenCalledTimes(1);
  });

  it('forwards the click event as the only argument to handlePeerRetro', async () => {
    const user = userEvent.setup();
    renderRow();
    await user.click(screen.getByRole('button', { name: 'Run peer retro' }));
    expect(handlePeerRetroMock.mock.calls[0]).toHaveLength(1);
    expect(handlePeerRetroMock.mock.calls[0][0]).toHaveProperty(
      'type',
      'click',
    );
  });

  it('disables the run button when busy', () => {
    busyValue = true;
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Run peer retro' }),
    ).toBeDisabled();
  });

  it('disables the brain select when busy', () => {
    busyValue = true;
    renderRow();
    expect(screen.getByLabelText('Peer-retro brain')).toBeDisabled();
  });

  it('does NOT fire handlePeerRetro when a busy button is clicked', async () => {
    const user = userEvent.setup();
    busyValue = true;
    renderRow();
    await user.click(screen.getByRole('button', { name: 'Run peer retro' }));
    expect(handlePeerRetroMock).not.toHaveBeenCalled();
  });

  it('does NOT render any banner text when msg is null', () => {
    renderRow();
    expect(
      document.querySelector('.text-destructive'),
    ).toBeNull();
  });

  it('renders the success message with the muted tone when failed=false', () => {
    msgValue =
      'peer-retro ok — 4 raters, 12 ratings, 3 specialist(s) updated';
    failedValue = false;
    renderRow();
    const banner = screen.getByText(/peer-retro ok/);
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveClass('text-muted-foreground');
    expect(banner).not.toHaveClass('text-destructive');
  });

  it('renders the failure message with the destructive tone when failed=true', () => {
    msgValue = 'peer-retro failed: timeout';
    failedValue = true;
    renderRow();
    const banner = screen.getByText('peer-retro failed: timeout');
    expect(banner).toHaveClass('text-destructive');
    expect(banner).not.toHaveClass('text-muted-foreground');
  });

  it('forwards meetingId into the useMeetingPeerRetro hook', () => {
    renderRow({ meetingId: 'mtg-zz' });
    expect(lastPeerRetroArgs?.meetingId).toBe('mtg-zz');
  });

  it('exposes a tab order: brain select then run button', async () => {
    const user = userEvent.setup();
    renderRow();
    await user.tab();
    expect(screen.getByLabelText('Peer-retro brain')).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Run peer retro' }),
    ).toHaveFocus();
  });

  it('rerendering with the same props does not duplicate the brain select', () => {
    const { rerender, props } = renderRow();
    rerender(<MeetingsPeerRetroControls {...props} />);
    expect(screen.getAllByLabelText('Peer-retro brain')).toHaveLength(1);
  });

  it('keeps the typed brain value stable across rerenders', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderRow();
    await user.selectOptions(
      screen.getByLabelText('Peer-retro brain'),
      'claude',
    );
    rerender(<MeetingsPeerRetroControls {...props} />);
    expect(
      (screen.getByLabelText('Peer-retro brain') as HTMLSelectElement).value,
    ).toBe('claude');
  });

  it('re-renders translated copy when the locale flips to ko', () => {
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Run peer retro' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: 'Run peer retro' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});
