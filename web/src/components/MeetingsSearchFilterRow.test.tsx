import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MeetingsSearchFilterRow from './MeetingsSearchFilterRow';
import { setLocale } from '../lib/i18n';
import type { MeetingStatus } from './MeetingsView';
import type { Track } from './MeetingsSearchFacets';

// MeetingsSearchFilterRow is a pure controlled input strip: status /
// track selects plus since / until date inputs and a clear-dates
// button that only appears when at least one date is set. Parent
// owns all state and the change handlers. Tests drive the full prop
// union directly: every select option, every controlled value, every
// callback, the dates-clear visibility branches, and the locale flip.

beforeEach(() => {
  setLocale('en');
});

function renderRow(
  overrides: Partial<Parameters<typeof MeetingsSearchFilterRow>[0]> = {},
) {
  const props = {
    status: '' as MeetingStatus | '',
    onStatusChange: vi.fn(),
    track: '' as Track | '',
    onTrackChange: vi.fn(),
    since: '',
    onSinceChange: vi.fn(),
    until: '',
    onUntilChange: vi.fn(),
    ...overrides,
  };
  const utils = render(<MeetingsSearchFilterRow {...props} />);
  return { ...utils, props };
}

describe('<MeetingsSearchFilterRow>', () => {
  it('renders the status select labelled by the i18n accessible name', () => {
    renderRow();
    expect(
      screen.getByRole('combobox', { name: 'Filter by status' }),
    ).toBeInTheDocument();
  });

  it('renders the track select labelled by the i18n accessible name', () => {
    renderRow();
    expect(
      screen.getByRole('combobox', { name: 'Filter by track' }),
    ).toBeInTheDocument();
  });

  it('renders the since date input labelled by the i18n accessible name', () => {
    renderRow();
    expect(screen.getByLabelText('Search since date')).toBeInTheDocument();
  });

  it('renders the until date input labelled by the i18n accessible name', () => {
    renderRow();
    expect(screen.getByLabelText('Search until date')).toBeInTheDocument();
  });

  it('renders the "status:" label text from the i18n bundle', () => {
    renderRow();
    expect(screen.getByText('status:')).toBeInTheDocument();
  });

  it('renders the "track:" label text from the i18n bundle', () => {
    renderRow();
    expect(screen.getByText('track:')).toBeInTheDocument();
  });

  it('renders the "since:" label text from the i18n bundle', () => {
    renderRow();
    expect(screen.getByText('since:')).toBeInTheDocument();
  });

  it('renders the "until:" label text from the i18n bundle', () => {
    renderRow();
    expect(screen.getByText('until:')).toBeInTheDocument();
  });

  it('renders all status options on the status select', () => {
    renderRow();
    const statusSelect = screen.getByRole('combobox', {
      name: 'Filter by status',
    }) as HTMLSelectElement;
    const values = Array.from(statusSelect.options).map((o) => o.value);
    expect(values).toEqual([
      '',
      'pending',
      'in-progress',
      'completed',
      'escalated',
      'aborted',
    ]);
  });

  it('renders all track options on the track select', () => {
    renderRow();
    const trackSelect = screen.getByRole('combobox', {
      name: 'Filter by track',
    }) as HTMLSelectElement;
    const values = Array.from(trackSelect.options).map((o) => o.value);
    expect(values).toEqual(['', 'lightweight', 'standard', 'full']);
  });

  it('reflects the current status prop as the selected option', () => {
    renderRow({ status: 'completed' });
    const statusSelect = screen.getByRole('combobox', {
      name: 'Filter by status',
    }) as HTMLSelectElement;
    expect(statusSelect.value).toBe('completed');
  });

  it('reflects the current track prop as the selected option', () => {
    renderRow({ track: 'standard' });
    const trackSelect = screen.getByRole('combobox', {
      name: 'Filter by track',
    }) as HTMLSelectElement;
    expect(trackSelect.value).toBe('standard');
  });

  it('reflects the current since prop as the date input value', () => {
    renderRow({ since: '2026-05-01' });
    const sinceInput = screen.getByLabelText('Search since date') as HTMLInputElement;
    expect(sinceInput.value).toBe('2026-05-01');
  });

  it('reflects the current until prop as the date input value', () => {
    renderRow({ until: '2026-05-12' });
    const untilInput = screen.getByLabelText('Search until date') as HTMLInputElement;
    expect(untilInput.value).toBe('2026-05-12');
  });

  it('defaults both selects to empty string when no filter is active', () => {
    renderRow();
    const statusSelect = screen.getByRole('combobox', {
      name: 'Filter by status',
    }) as HTMLSelectElement;
    const trackSelect = screen.getByRole('combobox', {
      name: 'Filter by track',
    }) as HTMLSelectElement;
    expect(statusSelect.value).toBe('');
    expect(trackSelect.value).toBe('');
  });

  it('defaults both date inputs to empty when no dates are set', () => {
    renderRow();
    const sinceInput = screen.getByLabelText('Search since date') as HTMLInputElement;
    const untilInput = screen.getByLabelText('Search until date') as HTMLInputElement;
    expect(sinceInput.value).toBe('');
    expect(untilInput.value).toBe('');
  });

  it('fires onStatusChange with the chosen status value', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    renderRow({ onStatusChange });
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filter by status' }),
      'pending',
    );
    expect(onStatusChange).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenCalledWith('pending');
  });

  it('fires onStatusChange with the empty string when "any" is picked', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    renderRow({ status: 'completed', onStatusChange });
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filter by status' }),
      '',
    );
    expect(onStatusChange).toHaveBeenCalledWith('');
  });

  it('fires onStatusChange with in-progress when that option is picked', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    renderRow({ onStatusChange });
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filter by status' }),
      'in-progress',
    );
    expect(onStatusChange).toHaveBeenCalledWith('in-progress');
  });

  it('fires onTrackChange with the chosen track value', async () => {
    const user = userEvent.setup();
    const onTrackChange = vi.fn();
    renderRow({ onTrackChange });
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filter by track' }),
      'full',
    );
    expect(onTrackChange).toHaveBeenCalledTimes(1);
    expect(onTrackChange).toHaveBeenCalledWith('full');
  });

  it('fires onTrackChange with the empty string when "any" is picked', async () => {
    const user = userEvent.setup();
    const onTrackChange = vi.fn();
    renderRow({ track: 'standard', onTrackChange });
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filter by track' }),
      '',
    );
    expect(onTrackChange).toHaveBeenCalledWith('');
  });

  it('fires onSinceChange with the typed date value', async () => {
    const user = userEvent.setup();
    const onSinceChange = vi.fn();
    renderRow({ onSinceChange });
    await user.type(
      screen.getByLabelText('Search since date'),
      '2026-05-01',
    );
    expect(onSinceChange).toHaveBeenCalled();
    const last = onSinceChange.mock.calls.at(-1)![0];
    expect(last).toBe('2026-05-01');
  });

  it('fires onUntilChange with the typed date value', async () => {
    const user = userEvent.setup();
    const onUntilChange = vi.fn();
    renderRow({ onUntilChange });
    await user.type(
      screen.getByLabelText('Search until date'),
      '2026-05-12',
    );
    expect(onUntilChange).toHaveBeenCalled();
    const last = onUntilChange.mock.calls.at(-1)![0];
    expect(last).toBe('2026-05-12');
  });

  it('hides the clear-dates button when neither since nor until is set', () => {
    renderRow();
    expect(
      screen.queryByRole('button', { name: 'clear dates' }),
    ).not.toBeInTheDocument();
  });

  it('shows the clear-dates button when only since is set', () => {
    renderRow({ since: '2026-05-01' });
    expect(
      screen.getByRole('button', { name: 'clear dates' }),
    ).toBeInTheDocument();
  });

  it('shows the clear-dates button when only until is set', () => {
    renderRow({ until: '2026-05-12' });
    expect(
      screen.getByRole('button', { name: 'clear dates' }),
    ).toBeInTheDocument();
  });

  it('shows the clear-dates button when both since and until are set', () => {
    renderRow({ since: '2026-05-01', until: '2026-05-12' });
    expect(
      screen.getByRole('button', { name: 'clear dates' }),
    ).toBeInTheDocument();
  });

  it('keeps the clear-dates button hidden while only status / track filters are set', () => {
    renderRow({ status: 'completed', track: 'full' });
    expect(
      screen.queryByRole('button', { name: 'clear dates' }),
    ).not.toBeInTheDocument();
  });

  it('fires both onSinceChange and onUntilChange with empty strings when clear-dates is clicked', async () => {
    const user = userEvent.setup();
    const onSinceChange = vi.fn();
    const onUntilChange = vi.fn();
    renderRow({
      since: '2026-05-01',
      until: '2026-05-12',
      onSinceChange,
      onUntilChange,
    });
    await user.click(screen.getByRole('button', { name: 'clear dates' }));
    expect(onSinceChange).toHaveBeenCalledWith('');
    expect(onUntilChange).toHaveBeenCalledWith('');
  });

  it('renders the clear-dates button as type="button" so it never submits a form', () => {
    renderRow({ since: '2026-05-01' });
    expect(
      screen.getByRole('button', { name: 'clear dates' }),
    ).toHaveAttribute('type', 'button');
  });

  it('renders the since date input with type="date"', () => {
    renderRow();
    const sinceInput = screen.getByLabelText('Search since date') as HTMLInputElement;
    expect(sinceInput.type).toBe('date');
  });

  it('renders the until date input with type="date"', () => {
    renderRow();
    const untilInput = screen.getByLabelText('Search until date') as HTMLInputElement;
    expect(untilInput.type).toBe('date');
  });

  it('does not fire onStatusChange on initial render', () => {
    const onStatusChange = vi.fn();
    renderRow({ onStatusChange });
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('does not fire onTrackChange on initial render', () => {
    const onTrackChange = vi.fn();
    renderRow({ onTrackChange });
    expect(onTrackChange).not.toHaveBeenCalled();
  });

  it('does not fire onSinceChange on initial render', () => {
    const onSinceChange = vi.fn();
    renderRow({ onSinceChange });
    expect(onSinceChange).not.toHaveBeenCalled();
  });

  it('does not fire onUntilChange on initial render', () => {
    const onUntilChange = vi.fn();
    renderRow({ onUntilChange });
    expect(onUntilChange).not.toHaveBeenCalled();
  });

  it('does not fire onTrackChange when only status changes', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    const onTrackChange = vi.fn();
    renderRow({ onStatusChange, onTrackChange });
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filter by status' }),
      'pending',
    );
    expect(onStatusChange).toHaveBeenCalled();
    expect(onTrackChange).not.toHaveBeenCalled();
  });

  it('does not fire date callbacks when a select changes', async () => {
    const user = userEvent.setup();
    const onSinceChange = vi.fn();
    const onUntilChange = vi.fn();
    renderRow({ onSinceChange, onUntilChange });
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filter by status' }),
      'pending',
    );
    expect(onSinceChange).not.toHaveBeenCalled();
    expect(onUntilChange).not.toHaveBeenCalled();
  });

  it('rerendering with the same props does not duplicate callbacks', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    const { rerender, props } = renderRow({ onStatusChange });
    rerender(<MeetingsSearchFilterRow {...props} />);
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filter by status' }),
      'pending',
    );
    expect(onStatusChange).toHaveBeenCalledTimes(1);
  });

  it('rerendering with new status updates the select value', () => {
    const { rerender, props } = renderRow({ status: '' });
    expect(
      (screen.getByRole('combobox', { name: 'Filter by status' }) as HTMLSelectElement).value,
    ).toBe('');
    rerender(<MeetingsSearchFilterRow {...props} status="aborted" />);
    expect(
      (screen.getByRole('combobox', { name: 'Filter by status' }) as HTMLSelectElement).value,
    ).toBe('aborted');
  });

  it('rerendering from no dates to set dates surfaces the clear-dates button', () => {
    const { rerender, props } = renderRow();
    expect(
      screen.queryByRole('button', { name: 'clear dates' }),
    ).not.toBeInTheDocument();
    rerender(
      <MeetingsSearchFilterRow {...props} since="2026-05-01" />,
    );
    expect(
      screen.getByRole('button', { name: 'clear dates' }),
    ).toBeInTheDocument();
  });

  it('re-renders the label copy when the locale flips to ko', () => {
    renderRow();
    expect(screen.getByText('status:')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('status:')).not.toBeInTheDocument();
  });
});
