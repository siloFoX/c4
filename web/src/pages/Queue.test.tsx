import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { QueueRow, QueueStatus } from './Queue';

// Queue.tsx hits the daemon via apiGet / apiPost from ../lib/api.
// Stub those two functions so every test drives the page through a
// scripted response sequence rather than a real fetch. The
// PageDescriptionBanner + HelpUIRoot stubs are not required since
// Queue.tsx does not import them, but the illustrations module pulls
// in lucide-react icons which jsdom can render fine.

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();

vi.mock('../lib/api', () => ({
  apiGet: (url: string) => apiGetMock(url),
  apiPost: (url: string, body: unknown) => apiPostMock(url, body),
}));

import Queue from './Queue';

function makeRow(id: string, over: Partial<QueueRow> = {}): QueueRow {
  return {
    id,
    title: `Task ${id}`,
    status: 'todo',
    detail: `Detail for ${id}`,
    ...over,
  };
}

function makeFetchResponse(rows: QueueRow[], raw = 'raw markdown') {
  return { rows, raw, source: 'docs/autonomous-queue-v10.md' };
}

let resolveGet: ((value: unknown) => void) | null = null;
let resolvePost: ((value: unknown) => void) | null = null;

beforeEach(() => {
  setLocale('en');
  apiGetMock.mockReset();
  apiPostMock.mockReset();
  resolveGet = null;
  resolvePost = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('<Queue>', () => {
  it('renders a six-row skeleton while the initial GET is pending', async () => {
    apiGetMock.mockImplementation(() => new Promise(() => { /* never */ }));
    render(<Queue />);
    const status = await screen.findByTestId('queue-loading');
    expect(status).toBeInTheDocument();
    expect(status.children.length).toBe(6);
  });

  it('renders one table row per fetched queue row, with id + title visible', async () => {
    apiGetMock.mockResolvedValueOnce(makeFetchResponse([
      makeRow('1.1', { title: 'First' }),
      makeRow('1.2', { title: 'Second', status: 'doing' }),
    ]));
    render(<Queue />);
    await screen.findByTestId('queue-table');
    expect(screen.getByTestId('queue-row-1.1')).toBeInTheDocument();
    expect(screen.getByTestId('queue-row-1.2')).toBeInTheDocument();
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('renders the empty illustration when the daemon returns zero rows', async () => {
    apiGetMock.mockResolvedValueOnce(makeFetchResponse([]));
    render(<Queue />);
    await screen.findByText(/Queue is empty/);
  });

  it('renders the error panel with a retry button when GET rejects, and retry re-fetches', async () => {
    apiGetMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(makeFetchResponse([makeRow('2.1')]));
    render(<Queue />);
    await screen.findByText(/Could not load queue/);
    const retry = screen.getByRole('button', { name: 'Retry' });
    expect(retry).toBeInTheDocument();
    await act(async () => {
      retry.click();
    });
    await screen.findByTestId('queue-row-2.1');
    expect(apiGetMock).toHaveBeenCalledTimes(2);
  });

  it('fires POST with the new status when the dropdown changes', async () => {
    apiGetMock.mockResolvedValueOnce(makeFetchResponse([
      makeRow('1.1', { title: 'First' }),
    ]));
    apiPostMock.mockResolvedValueOnce({
      ok: true,
      rows: [makeRow('1.1', { title: 'First', status: 'doing' as QueueStatus })],
      raw: 'updated',
    });
    render(<Queue />);
    await screen.findByTestId('queue-table');
    const select = screen.getByTestId('queue-status-1.1') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'doing' } });
    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledTimes(1);
    });
    const [url, body] = apiPostMock.mock.calls[0]!;
    expect(url).toBe('/api/autonomous/queue');
    const payload = body as { rows: QueueRow[] };
    expect(payload.rows).toHaveLength(1);
    expect(payload.rows[0]!.status).toBe('doing');
  });

  it('opens the edit modal when the Edit button is clicked', async () => {
    apiGetMock.mockResolvedValueOnce(makeFetchResponse([
      makeRow('3.1', { title: 'Editme', detail: 'old detail' }),
    ]));
    const user = userEvent.setup();
    render(<Queue />);
    await screen.findByTestId('queue-table');
    await user.click(screen.getByTestId('queue-edit-3.1'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const textarea = within(dialog).getByLabelText('Row detail') as HTMLTextAreaElement;
    expect(textarea.value).toBe('old detail');
  });

  it('persists the textarea content and fires POST with the new detail on Save', async () => {
    apiGetMock.mockResolvedValueOnce(makeFetchResponse([
      makeRow('3.1', { title: 'Editme', detail: 'old detail' }),
    ]));
    apiPostMock.mockResolvedValueOnce({
      ok: true,
      rows: [makeRow('3.1', { title: 'Editme', detail: 'new detail' })],
      raw: 'updated',
    });
    const user = userEvent.setup();
    render(<Queue />);
    await screen.findByTestId('queue-table');
    await user.click(screen.getByTestId('queue-edit-3.1'));
    const dialog = await screen.findByRole('dialog');
    const textarea = within(dialog).getByLabelText('Row detail') as HTMLTextAreaElement;
    await user.clear(textarea);
    await user.type(textarea, 'new detail');
    await user.click(within(dialog).getByRole('button', { name: /Save/ }));
    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledTimes(1);
    });
    const [, body] = apiPostMock.mock.calls[0]!;
    expect((body as { rows: QueueRow[] }).rows[0]!.detail).toBe('new detail');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('closes the modal on Cancel without firing POST', async () => {
    apiGetMock.mockResolvedValueOnce(makeFetchResponse([
      makeRow('3.1', { title: 'Editme', detail: 'old detail' }),
    ]));
    const user = userEvent.setup();
    render(<Queue />);
    await screen.findByTestId('queue-table');
    await user.click(screen.getByTestId('queue-edit-3.1'));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('reorders rows on drop and fires POST with the new order', async () => {
    apiGetMock.mockResolvedValueOnce(makeFetchResponse([
      makeRow('1.1'),
      makeRow('1.2'),
      makeRow('1.3'),
    ]));
    apiPostMock.mockResolvedValueOnce({
      ok: true,
      rows: [makeRow('1.2'), makeRow('1.1'), makeRow('1.3')],
      raw: 'updated',
    });
    render(<Queue />);
    await screen.findByTestId('queue-table');
    const source = screen.getByTestId('queue-row-1.1');
    const target = screen.getByTestId('queue-row-1.2');
    fireEvent.dragStart(source);
    fireEvent.dragOver(target);
    fireEvent.drop(target);
    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledTimes(1);
    });
    const [, body] = apiPostMock.mock.calls[0]!;
    const order = (body as { rows: QueueRow[] }).rows.map((r) => r.id);
    expect(order).toEqual(['1.2', '1.1', '1.3']);
  });

  it('rolls back the row order when POST fails and surfaces the error banner', async () => {
    apiGetMock.mockResolvedValueOnce(makeFetchResponse([
      makeRow('1.1'),
      makeRow('1.2'),
    ]));
    apiPostMock.mockRejectedValueOnce(new Error('write failed'));
    render(<Queue />);
    await screen.findByTestId('queue-table');
    const source = screen.getByTestId('queue-row-1.1');
    const target = screen.getByTestId('queue-row-1.2');
    fireEvent.dragStart(source);
    fireEvent.dragOver(target);
    fireEvent.drop(target);
    await screen.findByText(/Save failed: write failed/);
    // After rollback the first row should still be 1.1 (visible order).
    const rows = screen
      .getByTestId('queue-table')
      .querySelectorAll('tbody tr');
    expect(rows[0]!.getAttribute('data-row-id')).toBe('1.1');
  });

  it('renders all four status options in the dropdown', async () => {
    apiGetMock.mockResolvedValueOnce(makeFetchResponse([
      makeRow('1.1'),
    ]));
    render(<Queue />);
    await screen.findByTestId('queue-table');
    const select = screen.getByTestId('queue-status-1.1') as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.value);
    expect(labels).toEqual(['todo', 'doing', 'done', 'partial']);
  });

  it('refreshes the data when the header refresh button is clicked', async () => {
    apiGetMock
      .mockResolvedValueOnce(makeFetchResponse([makeRow('1.1')]))
      .mockResolvedValueOnce(makeFetchResponse([
        makeRow('1.1'),
        makeRow('1.2'),
      ]));
    const user = userEvent.setup();
    render(<Queue />);
    await screen.findByTestId('queue-row-1.1');
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByTestId('queue-row-1.2');
    expect(apiGetMock).toHaveBeenCalledTimes(2);
  });

  it('renders a truncated detail preview when detail exceeds the preview limit', async () => {
    const longDetail = 'x'.repeat(400);
    apiGetMock.mockResolvedValueOnce(makeFetchResponse([
      makeRow('1.1', { detail: longDetail }),
    ]));
    render(<Queue />);
    await screen.findByTestId('queue-table');
    const preview = screen.getByTestId('queue-detail-1.1');
    expect(preview.textContent || '').toContain('...');
    expect((preview.textContent || '').length).toBeLessThan(longDetail.length);
  });
});
