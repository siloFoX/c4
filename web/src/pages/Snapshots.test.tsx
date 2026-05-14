import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { SnapshotMeta } from './Snapshots';

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
const apiDeleteMock = vi.fn();

vi.mock('../lib/api', () => ({
  apiGet: (url: string) => apiGetMock(url),
  apiPost: (url: string, body: unknown) => apiPostMock(url, body),
  apiDelete: (url: string) => apiDeleteMock(url),
}));

import Snapshots from './Snapshots';

function makeSnap(over: Partial<SnapshotMeta> = {}): SnapshotMeta {
  return {
    id: '2026-05-14T00-00-00-000Z-abcd1234',
    label: 'baseline',
    createdAt: '2026-05-14T00:00:00.000Z',
    configBytes: 1024,
    queueBytes: 512,
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  apiGetMock.mockReset();
  apiPostMock.mockReset();
  apiDeleteMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('<Snapshots>', () => {
  it('renders the page title and the Take snapshot button', async () => {
    apiGetMock.mockResolvedValueOnce({ snapshots: [] });
    render(<Snapshots />);
    await waitFor(() => {
      expect(screen.getAllByText('Snapshots').length).toBeGreaterThan(0);
    });
    expect(screen.getByTestId('snapshots-take-button')).toBeInTheDocument();
  });

  it('renders one table row per fetched snapshot', async () => {
    const snaps = [
      makeSnap({ id: 'snap-1', label: 'first' }),
      makeSnap({ id: 'snap-2', label: 'second' }),
    ];
    apiGetMock.mockResolvedValueOnce({ snapshots: snaps });
    render(<Snapshots />);
    await screen.findByTestId('snapshots-table');
    expect(screen.getByTestId('snapshots-row-snap-1')).toBeInTheDocument();
    expect(screen.getByTestId('snapshots-row-snap-2')).toBeInTheDocument();
    expect(screen.getByText('first')).toBeInTheDocument();
    expect(screen.getByText('second')).toBeInTheDocument();
  });

  it('renders the empty state when zero snapshots come back', async () => {
    apiGetMock.mockResolvedValueOnce({ snapshots: [] });
    render(<Snapshots />);
    await screen.findByText(/No snapshots yet/);
  });

  it('opens the Restore confirm dialog when the restore action is clicked', async () => {
    apiGetMock.mockResolvedValueOnce({
      snapshots: [makeSnap({ id: 'snap-x', label: 'rollback-me' })],
    });
    render(<Snapshots />);
    await screen.findByTestId('snapshots-row-snap-x');
    const btn = screen.getByTestId('snapshots-restore-snap-x');
    const user = userEvent.setup();
    await act(async () => {
      await user.click(btn);
    });
    expect(await screen.findByText(/Restore rollback-me\?/)).toBeInTheDocument();
    expect(screen.getByTestId('snapshots-restore-confirm')).toBeInTheDocument();
  });

  it('takes a snapshot when the Take snapshot dialog is submitted', async () => {
    apiGetMock
      .mockResolvedValueOnce({ snapshots: [] })
      .mockResolvedValueOnce({ snapshots: [makeSnap({ id: 'new', label: 'pre-deploy' })] });
    apiPostMock.mockResolvedValueOnce({
      id: 'new',
      label: 'pre-deploy',
      createdAt: '2026-05-14T00:00:00.000Z',
      configBytes: 1,
      queueBytes: 1,
    });
    render(<Snapshots />);
    await screen.findByText(/No snapshots yet/);
    const user = userEvent.setup();
    await act(async () => {
      await user.click(screen.getByTestId('snapshots-take-button'));
    });
    const labelInput = await screen.findByTestId('snapshots-label-input');
    await act(async () => {
      await user.type(labelInput, 'pre-deploy');
    });
    await act(async () => {
      await user.click(screen.getByTestId('snapshots-take-confirm'));
    });
    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith('/api/snapshots', { label: 'pre-deploy' });
    });
  });
});
