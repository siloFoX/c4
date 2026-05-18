import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  FileUploadProgress,
  formatBytes,
  summarizeUploads,
  type UploadItem,
} from './file-upload-progress';

function makeItem(over: Partial<UploadItem> = {}): UploadItem {
  return {
    id: 'i-1',
    name: 'a.png',
    size: 1024,
    progress: 0,
    status: 'pending',
    ...over,
  };
}

// -- formatBytes ------------------------------------------------

describe('formatBytes()', () => {
  it('formats bytes under 1KiB verbatim', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(500)).toBe('500 B');
  });

  it('formats KiB with one fractional digit', () => {
    expect(formatBytes(1024)).toBe('1.0 KiB');
    expect(formatBytes(1536)).toBe('1.5 KiB');
  });

  it('formats MiB with one fractional digit', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MiB');
    expect(formatBytes(1024 * 1024 * 5.25)).toBe('5.3 MiB');
  });

  it('formats GiB with two fractional digits', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00 GiB');
  });

  it('returns "0 B" for invalid input', () => {
    expect(formatBytes(NaN)).toBe('0 B');
    expect(formatBytes(-1)).toBe('0 B');
  });
});

// -- summarizeUploads -------------------------------------------

describe('summarizeUploads()', () => {
  it('returns zeros for an empty list', () => {
    expect(summarizeUploads([])).toEqual({
      total: 0,
      done: 0,
      failed: 0,
      cancelled: 0,
      uploading: 0,
      pending: 0,
      overallProgress: 0,
      bytesTotal: 0,
      bytesDone: 0,
    });
  });

  it('counts statuses per bucket', () => {
    const items: UploadItem[] = [
      { id: '1', name: 'a', progress: 1, status: 'success' },
      { id: '2', name: 'b', progress: 0.5, status: 'uploading' },
      { id: '3', name: 'c', progress: 0, status: 'pending' },
      { id: '4', name: 'd', progress: 0.2, status: 'error' },
      { id: '5', name: 'e', progress: 0.3, status: 'cancelled' },
    ];
    const s = summarizeUploads(items);
    expect(s.total).toBe(5);
    expect(s.done).toBe(1);
    expect(s.uploading).toBe(1);
    expect(s.pending).toBe(1);
    expect(s.failed).toBe(1);
    expect(s.cancelled).toBe(1);
  });

  it('averages overallProgress across rows', () => {
    const items: UploadItem[] = [
      { id: '1', name: 'a', progress: 1, status: 'success' },
      { id: '2', name: 'b', progress: 0.5, status: 'uploading' },
    ];
    const s = summarizeUploads(items);
    expect(s.overallProgress).toBeCloseTo(0.75, 3);
  });

  it('counts bytesTotal/bytesDone only for rows with size', () => {
    const items: UploadItem[] = [
      { id: '1', name: 'a', size: 1000, progress: 1, status: 'success' },
      { id: '2', name: 'b', size: 1000, progress: 0.5, status: 'uploading' },
      // No size -> excluded from byte aggregates.
      { id: '3', name: 'c', progress: 0.5, status: 'uploading' },
    ];
    const s = summarizeUploads(items);
    expect(s.bytesTotal).toBe(2000);
    expect(s.bytesDone).toBe(1500);
  });

  it('treats success rows as 100% even when the progress field lags', () => {
    const items: UploadItem[] = [
      // host did not flush the progress to 1 before flipping to success;
      // summary should still treat as fully done.
      { id: '1', name: 'a', size: 1000, progress: 0.7, status: 'success' },
    ];
    const s = summarizeUploads(items);
    expect(s.overallProgress).toBe(1);
    expect(s.bytesDone).toBe(1000);
  });

  it('clamps an out-of-range progress', () => {
    const items: UploadItem[] = [
      { id: '1', name: 'a', progress: 2, status: 'uploading' },
      { id: '2', name: 'b', progress: -1, status: 'uploading' },
    ];
    const s = summarizeUploads(items);
    expect(s.overallProgress).toBeCloseTo(0.5, 3);
  });

  it('cancelled / error rows surface the last progress (not zero)', () => {
    const items: UploadItem[] = [
      { id: '1', name: 'a', size: 1000, progress: 0.4, status: 'error' },
    ];
    const s = summarizeUploads(items);
    expect(s.overallProgress).toBeCloseTo(0.4, 3);
    expect(s.bytesDone).toBe(400);
  });
});

// -- <FileUploadProgress> --------------------------------------

describe('<FileUploadProgress>', () => {
  it('renders the empty-state copy when items[] is empty', () => {
    render(<FileUploadProgress items={[]} />);
    expect(
      document.querySelector('[data-section="file-upload-progress-empty"]'),
    ).toHaveTextContent('No uploads.');
  });

  it('omits the summary row when items[] is empty', () => {
    render(<FileUploadProgress items={[]} />);
    expect(
      document.querySelector('[data-section="file-upload-progress-summary"]'),
    ).toBeNull();
  });

  it('renders one li per item with data-status mirror', () => {
    const items = [
      makeItem({ id: '1', name: 'a.png', status: 'uploading' }),
      makeItem({ id: '2', name: 'b.png', status: 'success', progress: 1 }),
    ];
    const { container } = render(<FileUploadProgress items={items} />);
    const rows = container.querySelectorAll(
      '[data-section="file-upload-progress-item"]',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]!.getAttribute('data-status')).toBe('uploading');
    expect(rows[1]!.getAttribute('data-status')).toBe('success');
  });

  it('summary text shows "<done> of <total> done"', () => {
    const items = [
      makeItem({ id: '1', status: 'success', progress: 1 }),
      makeItem({ id: '2', status: 'uploading', progress: 0.5 }),
    ];
    render(<FileUploadProgress items={items} />);
    expect(
      document.querySelector(
        '[data-section="file-upload-progress-summary-text"]',
      ),
    ).toHaveTextContent('1 of 2 done');
  });

  it('summary text appends ", N failed" / ", N cancelled" only when > 0', () => {
    const items = [
      makeItem({ id: '1', status: 'error', error: 'oops' }),
      makeItem({ id: '2', status: 'cancelled' }),
    ];
    render(<FileUploadProgress items={items} />);
    const node = document.querySelector(
      '[data-section="file-upload-progress-summary-text"]',
    );
    expect(node).toHaveTextContent('0 of 2 done');
    expect(node).toHaveTextContent('1 failed');
    expect(node).toHaveTextContent('1 cancelled');
  });

  it('summary bytes row renders when any row has size', () => {
    const items = [
      makeItem({ id: '1', size: 1000, progress: 1, status: 'success' }),
    ];
    render(<FileUploadProgress items={items} />);
    expect(
      document.querySelector(
        '[data-section="file-upload-progress-summary-bytes"]',
      ),
    ).toHaveTextContent('1000 B / 1000 B');
  });

  it('summary bytes row is omitted when no row has size', () => {
    // Construct without `size` rather than `size: undefined`
    // so exactOptionalPropertyTypes is satisfied.
    const items: UploadItem[] = [
      { id: '1', name: 'a.png', progress: 0, status: 'pending' },
    ];
    render(<FileUploadProgress items={items} />);
    expect(
      document.querySelector(
        '[data-section="file-upload-progress-summary-bytes"]',
      ),
    ).toBeNull();
  });

  it('showSummary={false} suppresses the summary row entirely', () => {
    const items = [makeItem({ id: '1', status: 'uploading' })];
    render(<FileUploadProgress items={items} showSummary={false} />);
    expect(
      document.querySelector('[data-section="file-upload-progress-summary"]'),
    ).toBeNull();
  });

  it('cancel button renders for pending + uploading and fires onCancel(id)', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const items = [
      makeItem({ id: 'a', status: 'pending' }),
      makeItem({ id: 'b', status: 'uploading' }),
      makeItem({ id: 'c', status: 'success', progress: 1 }),
      makeItem({ id: 'd', status: 'error' }),
    ];
    render(<FileUploadProgress items={items} onCancel={onCancel} />);
    const cancelBtns = document.querySelectorAll(
      '[data-section="file-upload-progress-cancel"]',
    );
    expect(cancelBtns).toHaveLength(2);
    await user.click(cancelBtns[0] as HTMLElement);
    expect(onCancel).toHaveBeenCalledWith('a');
  });

  it('retry button renders only for error rows + fires onRetry(id)', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const items = [
      makeItem({ id: 'a', status: 'uploading' }),
      makeItem({ id: 'b', status: 'error', error: 'oops' }),
    ];
    render(<FileUploadProgress items={items} onRetry={onRetry} />);
    const retryBtns = document.querySelectorAll(
      '[data-section="file-upload-progress-retry"]',
    );
    expect(retryBtns).toHaveLength(1);
    await user.click(retryBtns[0] as HTMLElement);
    expect(onRetry).toHaveBeenCalledWith('b');
  });

  it('remove button renders for success + cancelled and fires onRemove(id)', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const items = [
      makeItem({ id: 'a', status: 'success', progress: 1 }),
      makeItem({ id: 'b', status: 'cancelled' }),
      makeItem({ id: 'c', status: 'uploading' }),
    ];
    render(<FileUploadProgress items={items} onRemove={onRemove} />);
    const removeBtns = document.querySelectorAll(
      '[data-section="file-upload-progress-remove"]',
    );
    expect(removeBtns).toHaveLength(2);
    await user.click(removeBtns[1] as HTMLElement);
    expect(onRemove).toHaveBeenCalledWith('b');
  });

  it('callbacks that are not provided suppress the corresponding button', () => {
    // No onCancel -> no cancel buttons even on pending rows.
    const items = [makeItem({ id: 'a', status: 'pending' })];
    render(<FileUploadProgress items={items} />);
    expect(
      document.querySelector('[data-section="file-upload-progress-cancel"]'),
    ).toBeNull();
  });

  it('error message renders under the row when status=error', () => {
    const items = [
      makeItem({ id: '1', status: 'error', error: 'Network failed' }),
    ];
    render(<FileUploadProgress items={items} />);
    expect(
      document.querySelector('[data-section="file-upload-progress-error"]'),
    ).toHaveTextContent('Network failed');
  });

  it('does NOT render the error message div on non-error rows', () => {
    const items = [makeItem({ id: '1', status: 'uploading' })];
    render(<FileUploadProgress items={items} />);
    expect(
      document.querySelector('[data-section="file-upload-progress-error"]'),
    ).toBeNull();
  });

  it('size cell renders when size is set', () => {
    const items = [
      makeItem({ id: '1', size: 2048, status: 'pending' }),
    ];
    render(<FileUploadProgress items={items} />);
    expect(
      document.querySelector('[data-section="file-upload-progress-size"]'),
    ).toHaveTextContent('2.0 KiB');
  });

  it('size cell is omitted when size is undefined', () => {
    const items: UploadItem[] = [
      { id: '1', name: 'a.png', progress: 0, status: 'pending' },
    ];
    render(<FileUploadProgress items={items} />);
    expect(
      document.querySelector('[data-section="file-upload-progress-size"]'),
    ).toBeNull();
  });

  it('formatSize override is used in both row + summary', () => {
    const items = [
      makeItem({ id: '1', size: 100, progress: 1, status: 'success' }),
    ];
    render(
      <FileUploadProgress
        items={items}
        formatSize={(b) => `${b} bytes`}
      />,
    );
    expect(
      document.querySelector('[data-section="file-upload-progress-size"]'),
    ).toHaveTextContent('100 bytes');
    expect(
      document.querySelector(
        '[data-section="file-upload-progress-summary-bytes"]',
      ),
    ).toHaveTextContent('100 bytes / 100 bytes');
  });

  it('per-row progress bar reflects the progress value (0..1) as a percent', () => {
    const items = [makeItem({ id: '1', progress: 0.42, status: 'uploading' })];
    render(<FileUploadProgress items={items} />);
    const bar = document.querySelector(
      '[data-section="file-upload-progress-bar"] [role="progressbar"]',
    ) as HTMLElement;
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
  });

  it('uses success ProgressBar variant on success rows', () => {
    const items = [makeItem({ id: '1', progress: 1, status: 'success' })];
    const { container } = render(<FileUploadProgress items={items} />);
    const fill = container.querySelector('[data-progress-fill="true"]') as HTMLElement;
    expect(fill.className).toContain('bg-success');
  });

  it('uses destructive ProgressBar variant on error rows', () => {
    const items = [makeItem({ id: '1', status: 'error', error: 'oops' })];
    const { container } = render(<FileUploadProgress items={items} />);
    const fill = container.querySelector('[data-progress-fill="true"]') as HTMLElement;
    expect(fill.className).toContain('bg-destructive');
  });

  it('uses info ProgressBar variant on uploading rows', () => {
    const items = [makeItem({ id: '1', status: 'uploading' })];
    const { container } = render(<FileUploadProgress items={items} />);
    const fill = container.querySelector('[data-progress-fill="true"]') as HTMLElement;
    expect(fill.className).toContain('bg-info');
  });

  it('status badge text mirrors the per-status label', () => {
    const items = [
      makeItem({ id: 'a', status: 'pending' }),
      makeItem({ id: 'b', status: 'uploading' }),
      makeItem({ id: 'c', status: 'success', progress: 1 }),
      makeItem({ id: 'd', status: 'error' }),
      makeItem({ id: 'e', status: 'cancelled' }),
    ];
    render(<FileUploadProgress items={items} />);
    const badges = document.querySelectorAll(
      '[data-section="file-upload-progress-status"]',
    );
    expect(badges[0]).toHaveTextContent('Queued');
    expect(badges[1]).toHaveTextContent('Uploading');
    expect(badges[2]).toHaveTextContent('Done');
    expect(badges[3]).toHaveTextContent('Failed');
    expect(badges[4]).toHaveTextContent('Cancelled');
  });

  it('cancel button aria-label includes the filename', () => {
    const items = [makeItem({ id: 'a', name: 'snapshot.zip', status: 'uploading' })];
    render(<FileUploadProgress items={items} onCancel={() => {}} />);
    expect(
      screen.getByRole('button', { name: /Cancel snapshot\.zip/ }),
    ).toBeInTheDocument();
  });

  it('retry button aria-label includes the filename', () => {
    const items = [makeItem({ id: 'a', name: 'snapshot.zip', status: 'error', error: 'oops' })];
    render(<FileUploadProgress items={items} onRetry={() => {}} />);
    expect(
      screen.getByRole('button', { name: /Retry snapshot\.zip/ }),
    ).toBeInTheDocument();
  });

  it('remove button aria-label includes the filename', () => {
    const items = [makeItem({ id: 'a', name: 'snapshot.zip', status: 'success', progress: 1 })];
    render(<FileUploadProgress items={items} onRemove={() => {}} />);
    expect(
      screen.getByRole('button', { name: /Remove snapshot\.zip/ }),
    ).toBeInTheDocument();
  });

  it('exposes data-* aggregate counts on the wrapper', () => {
    const items = [
      makeItem({ id: 'a', status: 'uploading' }),
      makeItem({ id: 'b', status: 'success', progress: 1 }),
      makeItem({ id: 'c', status: 'error' }),
    ];
    render(<FileUploadProgress items={items} />);
    const root = document.querySelector(
      '[data-section="file-upload-progress"]',
    ) as HTMLElement;
    expect(root.getAttribute('data-count')).toBe('3');
    expect(root.getAttribute('data-done')).toBe('1');
    expect(root.getAttribute('data-failed')).toBe('1');
    expect(root.getAttribute('data-uploading')).toBe('1');
  });

  it('region role + custom ariaLabel forwarded to the wrapper', () => {
    render(
      <FileUploadProgress items={[]} ariaLabel="Snapshot uploads" />,
    );
    expect(
      screen.getByRole('region', { name: 'Snapshot uploads' }),
    ).toBeInTheDocument();
  });

  it('forwards caller className to the root', () => {
    render(<FileUploadProgress items={[]} className="my-uploads" />);
    expect(
      document.querySelector('[data-section="file-upload-progress"]'),
    ).toHaveClass('my-uploads');
  });

  it('exposes a stable displayName', () => {
    expect(FileUploadProgress.displayName).toBe('FileUploadProgress');
  });
});
