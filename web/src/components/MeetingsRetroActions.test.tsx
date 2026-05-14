import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type {
  MeetingRetroBusy,
  RetroResult,
} from '../lib/use-meeting-retro';

// MeetingsRetroActions is a thin button-row around the
// useMeetingRetro hook (busy / result / error / handleRetro).
// The hook itself owns the POST + retry logic and has its own
// unit tests, so this file stubs the hook to a deterministic
// shape per test and asserts the button states / labels /
// click-wiring in isolation.

const handleRetroMock = vi.fn();
let busyValue: MeetingRetroBusy = null;
let resultValue: RetroResult | null = null;
let errorValue: string | null = null;
let lastRetroArgs: { meetingId: string } | null = null;

vi.mock('../lib/use-meeting-retro', () => ({
  useMeetingRetro: (args: { meetingId: string }) => {
    lastRetroArgs = args;
    return {
      busy: busyValue,
      result: resultValue,
      error: errorValue,
      handleRetro: handleRetroMock,
    };
  },
}));

import MeetingsRetroActions from './MeetingsRetroActions';

beforeEach(() => {
  setLocale('en');
  handleRetroMock.mockReset();
  busyValue = null;
  resultValue = null;
  errorValue = null;
  lastRetroArgs = null;
});

function renderRow(
  overrides: Partial<Parameters<typeof MeetingsRetroActions>[0]> = {},
) {
  const props = {
    meetingId: 'mtg-1',
    ...overrides,
  };
  const utils = render(<MeetingsRetroActions {...props} />);
  return { ...utils, props };
}

describe('<MeetingsRetroActions>', () => {
  it('renders the Retro preview button with the i18n aria label', () => {
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Preview retro deltas' }),
    ).toBeInTheDocument();
  });

  it('renders the Finalize button with the i18n aria label', () => {
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Finalize retro (apply deltas)' }),
    ).toBeInTheDocument();
  });

  it('uses the preview label text on the preview button when not busy', () => {
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Preview retro deltas' }),
    ).toHaveTextContent('Retro preview');
  });

  it('uses the finalize label text on the finalize button when not busy', () => {
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Finalize retro (apply deltas)' }),
    ).toHaveTextContent('Finalize');
  });

  it('wraps the preview button with a Tooltip carrying the preview hint', () => {
    renderRow();
    const tip = screen.getByText('Compute retro score deltas without applying');
    expect(tip).toHaveAttribute('role', 'tooltip');
  });

  it('wraps the finalize button with a Tooltip carrying the finalize hint', () => {
    renderRow();
    const tip = screen.getByText('Apply retro deltas to the registry score record');
    expect(tip).toHaveAttribute('role', 'tooltip');
  });

  it('calls handleRetro(false) when the preview button is clicked', async () => {
    const user = userEvent.setup();
    renderRow();
    await user.click(
      screen.getByRole('button', { name: 'Preview retro deltas' }),
    );
    expect(handleRetroMock).toHaveBeenCalledTimes(1);
    expect(handleRetroMock).toHaveBeenCalledWith(false);
  });

  it('calls handleRetro(true) when the finalize button is clicked', async () => {
    const user = userEvent.setup();
    renderRow();
    await user.click(
      screen.getByRole('button', { name: 'Finalize retro (apply deltas)' }),
    );
    expect(handleRetroMock).toHaveBeenCalledTimes(1);
    expect(handleRetroMock).toHaveBeenCalledWith(true);
  });

  it('disables both buttons when busy=preview', () => {
    busyValue = 'preview';
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Preview retro deltas' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Finalize retro (apply deltas)' }),
    ).toBeDisabled();
  });

  it('disables both buttons when busy=finalize', () => {
    busyValue = 'finalize';
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Preview retro deltas' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Finalize retro (apply deltas)' }),
    ).toBeDisabled();
  });

  it('swaps the preview button label to ellipsis when busy=preview', () => {
    busyValue = 'preview';
    renderRow();
    const btn = screen.getByRole('button', { name: 'Preview retro deltas' });
    expect(btn.textContent).toBe(String.fromCharCode(0x2026));
    expect(btn.textContent).not.toContain('Retro preview');
  });

  it('keeps the finalize button label intact when only preview is busy', () => {
    busyValue = 'preview';
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Finalize retro (apply deltas)' }),
    ).toHaveTextContent('Finalize');
  });

  it('swaps the finalize button label to ellipsis when busy=finalize', () => {
    busyValue = 'finalize';
    renderRow();
    const btn = screen.getByRole('button', {
      name: 'Finalize retro (apply deltas)',
    });
    expect(btn.textContent).toBe(String.fromCharCode(0x2026));
    expect(btn.textContent).not.toContain('Finalize');
  });

  it('keeps the preview button label intact when only finalize is busy', () => {
    busyValue = 'finalize';
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Preview retro deltas' }),
    ).toHaveTextContent('Retro preview');
  });

  it('does NOT fire handleRetro when a busy preview button is clicked', async () => {
    const user = userEvent.setup();
    busyValue = 'preview';
    renderRow();
    await user.click(
      screen.getByRole('button', { name: 'Preview retro deltas' }),
    );
    expect(handleRetroMock).not.toHaveBeenCalled();
  });

  it('does NOT render the error span when error is null', () => {
    renderRow();
    expect(
      document.querySelector('.text-destructive'),
    ).toBeNull();
  });

  it('renders the error string when the hook surfaces an error', () => {
    errorValue = 'retro failed: 500';
    renderRow();
    expect(screen.getByText('retro failed: 500')).toBeInTheDocument();
  });

  it('applies the destructive tone class to the error span', () => {
    errorValue = 'retro failed: 500';
    renderRow();
    expect(screen.getByText('retro failed: 500')).toHaveClass(
      'text-destructive',
    );
  });

  it('does NOT render the result span when result is null', () => {
    renderRow();
    expect(screen.queryByText(/retro:/)).not.toBeInTheDocument();
  });

  it('renders "retro: applied" when result.applied=true', () => {
    resultValue = { applied: true };
    renderRow();
    expect(screen.getByText(/retro: applied/)).toBeInTheDocument();
  });

  it('renders "retro: skipped" when result.skipped=true and no note', () => {
    resultValue = { skipped: true };
    renderRow();
    expect(screen.getByText('retro: skipped')).toBeInTheDocument();
  });

  it('renders "retro: skipped (note)" when result.skipped=true with a note', () => {
    resultValue = { skipped: true, note: 'no specialists' };
    renderRow();
    expect(
      screen.getByText('retro: skipped (no specialists)'),
    ).toBeInTheDocument();
  });

  it('renders "retro: N delta(s)" when result.deltas has N keys', () => {
    resultValue = { deltas: { 'sec-1': 0.1, 'arch-2': -0.05 } };
    renderRow();
    expect(screen.getByText('retro: 2 delta(s)')).toBeInTheDocument();
  });

  it('renders "retro: 0 delta(s)" when result.deltas is an empty object', () => {
    resultValue = { deltas: {} };
    renderRow();
    expect(screen.getByText('retro: 0 delta(s)')).toBeInTheDocument();
  });

  it('renders "retro: ok" when result has neither applied / skipped / deltas', () => {
    resultValue = { note: 'placeholder' };
    renderRow();
    expect(screen.getByText('retro: ok')).toBeInTheDocument();
  });

  it('puts the full result JSON in the result span title attr', () => {
    resultValue = { applied: true };
    renderRow();
    expect(screen.getByText(/retro: applied/)).toHaveAttribute(
      'title',
      JSON.stringify({ applied: true }),
    );
  });

  it('prefers applied over skipped when both are true on the result', () => {
    resultValue = { applied: true, skipped: true };
    renderRow();
    expect(screen.getByText(/retro: applied/)).toBeInTheDocument();
    expect(screen.queryByText(/skipped/)).not.toBeInTheDocument();
  });

  it('forwards meetingId into the useMeetingRetro hook', () => {
    renderRow({ meetingId: 'mtg-zz' });
    expect(lastRetroArgs?.meetingId).toBe('mtg-zz');
  });

  it('exposes both buttons in tab order: preview then finalize', async () => {
    const user = userEvent.setup();
    renderRow();
    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Preview retro deltas' }),
    ).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Finalize retro (apply deltas)' }),
    ).toHaveFocus();
  });

  it('rerendering with the same props does not duplicate the button row', () => {
    const { rerender, props } = renderRow();
    rerender(<MeetingsRetroActions {...props} />);
    expect(
      screen.getAllByRole('button', { name: 'Preview retro deltas' }),
    ).toHaveLength(1);
  });

  it('keeps handler firing intact across rerenders with the same hook output', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderRow();
    rerender(<MeetingsRetroActions {...props} />);
    await user.click(
      screen.getByRole('button', { name: 'Preview retro deltas' }),
    );
    expect(handleRetroMock).toHaveBeenCalledTimes(1);
  });

  it('re-renders translated copy when the locale flips (useLocale subscription)', () => {
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Preview retro deltas' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: 'Preview retro deltas' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});
