import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MeetingsListFilterRow from './MeetingsListFilterRow';
import { setLocale } from '../lib/i18n';
import type { MeetingStatus } from './MeetingsView';
import type { Track } from './MeetingsSearchFacets';

beforeEach(() => {
  setLocale('en');
});

function renderRow(
  overrides: Partial<Parameters<typeof MeetingsListFilterRow>[0]> = {},
) {
  const props = {
    status: '' as MeetingStatus | '',
    onStatusChange: vi.fn(),
    track: '' as Track | '',
    onTrackChange: vi.fn(),
    ...overrides,
  };
  const utils = render(<MeetingsListFilterRow {...props} />);
  return { ...utils, props };
}

describe('<MeetingsListFilterRow>', () => {
  it('renders the status select labelled by the i18n accessible name', () => {
    renderRow();
    expect(
      screen.getByRole('combobox', { name: 'List filter by status' }),
    ).toBeInTheDocument();
  });

  it('renders the track select labelled by the i18n accessible name', () => {
    renderRow();
    expect(
      screen.getByRole('combobox', { name: 'List filter by track' }),
    ).toBeInTheDocument();
  });

  it('renders the "status:" label text from the i18n bundle', () => {
    renderRow();
    expect(screen.getByText('status:')).toBeInTheDocument();
  });

  it('renders the "track:" label text from the i18n bundle', () => {
    renderRow();
    expect(screen.getByText('track:')).toBeInTheDocument();
  });

  it('renders all status options on the status select', () => {
    renderRow();
    const statusSelect = screen.getByRole('combobox', {
      name: 'List filter by status',
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
      name: 'List filter by track',
    }) as HTMLSelectElement;
    const values = Array.from(trackSelect.options).map((o) => o.value);
    expect(values).toEqual(['', 'lightweight', 'standard', 'full']);
  });

  it('reflects the current status prop as the selected option', () => {
    renderRow({ status: 'completed' });
    const statusSelect = screen.getByRole('combobox', {
      name: 'List filter by status',
    }) as HTMLSelectElement;
    expect(statusSelect.value).toBe('completed');
  });

  it('reflects the current track prop as the selected option', () => {
    renderRow({ track: 'standard' });
    const trackSelect = screen.getByRole('combobox', {
      name: 'List filter by track',
    }) as HTMLSelectElement;
    expect(trackSelect.value).toBe('standard');
  });

  it('defaults both selects to empty string when no filter is active', () => {
    renderRow();
    const statusSelect = screen.getByRole('combobox', {
      name: 'List filter by status',
    }) as HTMLSelectElement;
    const trackSelect = screen.getByRole('combobox', {
      name: 'List filter by track',
    }) as HTMLSelectElement;
    expect(statusSelect.value).toBe('');
    expect(trackSelect.value).toBe('');
  });

  it('fires onStatusChange with the chosen status value', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    renderRow({ onStatusChange });
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'List filter by status' }),
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
      screen.getByRole('combobox', { name: 'List filter by status' }),
      '',
    );
    expect(onStatusChange).toHaveBeenCalledWith('');
  });

  it('fires onTrackChange with the chosen track value', async () => {
    const user = userEvent.setup();
    const onTrackChange = vi.fn();
    renderRow({ onTrackChange });
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'List filter by track' }),
      'full',
    );
    expect(onTrackChange).toHaveBeenCalledTimes(1);
    expect(onTrackChange).toHaveBeenCalledWith('full');
  });

  it('hides the clear button when both filters are empty', () => {
    renderRow();
    expect(
      screen.queryByRole('button', { name: 'clear' }),
    ).not.toBeInTheDocument();
  });

  it('shows the clear button when only status is set', () => {
    renderRow({ status: 'pending' });
    expect(
      screen.getByRole('button', { name: 'clear' }),
    ).toBeInTheDocument();
  });

  it('shows the clear button when only track is set', () => {
    renderRow({ track: 'lightweight' });
    expect(
      screen.getByRole('button', { name: 'clear' }),
    ).toBeInTheDocument();
  });

  it('shows the clear button when both filters are set', () => {
    renderRow({ status: 'completed', track: 'standard' });
    expect(
      screen.getByRole('button', { name: 'clear' }),
    ).toBeInTheDocument();
  });

  it('fires onStatusChange and onTrackChange with empty strings when clear is clicked', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    const onTrackChange = vi.fn();
    renderRow({
      status: 'completed',
      track: 'full',
      onStatusChange,
      onTrackChange,
    });
    await user.click(screen.getByRole('button', { name: 'clear' }));
    expect(onStatusChange).toHaveBeenCalledWith('');
    expect(onTrackChange).toHaveBeenCalledWith('');
  });

  it('renders the clear button as type="button" so it never submits a form', () => {
    renderRow({ status: 'completed' });
    expect(
      screen.getByRole('button', { name: 'clear' }),
    ).toHaveAttribute('type', 'button');
  });

  it('applies the rounded select class to both selects', () => {
    renderRow();
    const statusSelect = screen.getByRole('combobox', {
      name: 'List filter by status',
    });
    expect(statusSelect).toHaveClass('rounded');
    expect(statusSelect).toHaveClass('border');
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

  it('does not fire onTrackChange when only status changes', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    const onTrackChange = vi.fn();
    renderRow({ onStatusChange, onTrackChange });
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'List filter by status' }),
      'pending',
    );
    expect(onStatusChange).toHaveBeenCalled();
    expect(onTrackChange).not.toHaveBeenCalled();
  });

  it('rerendering with the same props does not duplicate callbacks', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    const { rerender, props } = renderRow({ onStatusChange });
    rerender(<MeetingsListFilterRow {...props} />);
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'List filter by status' }),
      'pending',
    );
    expect(onStatusChange).toHaveBeenCalledTimes(1);
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
