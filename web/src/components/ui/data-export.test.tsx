import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  DEFAULT_EXPORT_BASE_FILENAME,
  DEFAULT_EXPORT_FORMAT,
  DEFAULT_EXPORT_FORMATS,
  DEFAULT_EXPORT_SCOPE,
  DataExport,
  EXPORT_FORMAT_LABELS,
  ensureFilenameHasExtension,
  formatProgressPercent,
  getDefaultExportFilename,
  getFileExtensionForFormat,
  sanitizeFilename,
} from './data-export';

afterEach(() => {
  cleanup();
});

describe('getFileExtensionForFormat', () => {
  it('maps each format to its extension', () => {
    expect(getFileExtensionForFormat('csv')).toBe('csv');
    expect(getFileExtensionForFormat('json')).toBe('json');
    expect(getFileExtensionForFormat('xlsx')).toBe('xlsx');
  });
});

describe('sanitizeFilename', () => {
  it('returns empty for empty input', () => {
    expect(sanitizeFilename('')).toBe('');
  });
  it('strips path separators', () => {
    expect(sanitizeFilename('a/b\\c')).toBe('abc');
  });
  it('strips reserved shell chars', () => {
    expect(sanitizeFilename('a:b*c?d"e<f>g|h')).toBe('abcdefgh');
  });
  it('collapses whitespace + trims', () => {
    expect(sanitizeFilename('   hello   world  ')).toBe(
      'hello world',
    );
  });
  it('strips control chars', () => {
    expect(sanitizeFilename('a\x00b\x1Fc')).toBe('abc');
  });
});

describe('ensureFilenameHasExtension', () => {
  it('appends extension when missing', () => {
    expect(ensureFilenameHasExtension('orders', 'csv')).toBe(
      'orders.csv',
    );
  });
  it('passes through when extension already matches', () => {
    expect(ensureFilenameHasExtension('orders.csv', 'csv')).toBe(
      'orders.csv',
    );
  });
  it('swaps a known extension to match the new format', () => {
    expect(ensureFilenameHasExtension('orders.csv', 'json')).toBe(
      'orders.json',
    );
    expect(ensureFilenameHasExtension('orders.xlsx', 'csv')).toBe(
      'orders.csv',
    );
  });
  it('empty filename -> default base + extension', () => {
    expect(ensureFilenameHasExtension('', 'csv')).toBe(
      `${DEFAULT_EXPORT_BASE_FILENAME}.csv`,
    );
  });
  it('preserves multi-dot filenames + appends extension', () => {
    expect(ensureFilenameHasExtension('q1.2026', 'csv')).toBe(
      'q1.2026.csv',
    );
  });
});

describe('getDefaultExportFilename', () => {
  it('view scope -> base.ext', () => {
    expect(getDefaultExportFilename('csv', 'view')).toBe('data.csv');
  });
  it('all scope -> base-all.ext', () => {
    expect(getDefaultExportFilename('json', 'all')).toBe(
      'data-all.json',
    );
  });
  it('honours base override', () => {
    expect(
      getDefaultExportFilename('xlsx', 'view', 'orders-2026'),
    ).toBe('orders-2026.xlsx');
  });
  it('sanitises the base', () => {
    expect(
      getDefaultExportFilename('csv', 'view', 'or/d?ers'),
    ).toBe('orders.csv');
  });
});

describe('formatProgressPercent', () => {
  it('0 for 0 / negative / NaN', () => {
    expect(formatProgressPercent(0)).toBe('0%');
    expect(formatProgressPercent(-1)).toBe('0%');
    expect(formatProgressPercent(Number.NaN)).toBe('0%');
  });
  it('100 for >= 1', () => {
    expect(formatProgressPercent(1)).toBe('100%');
    expect(formatProgressPercent(1.5)).toBe('100%');
  });
  it('rounds to integer percent', () => {
    expect(formatProgressPercent(0.5)).toBe('50%');
    expect(formatProgressPercent(0.337)).toBe('34%');
  });
});

describe('Constants', () => {
  it('DEFAULT_EXPORT_FORMAT = csv', () => {
    expect(DEFAULT_EXPORT_FORMAT).toBe('csv');
  });
  it('DEFAULT_EXPORT_SCOPE = view', () => {
    expect(DEFAULT_EXPORT_SCOPE).toBe('view');
  });
  it('DEFAULT_EXPORT_FORMATS has CSV/JSON/XLSX', () => {
    expect(DEFAULT_EXPORT_FORMATS).toEqual(['csv', 'json', 'xlsx']);
  });
  it('EXPORT_FORMAT_LABELS maps every format', () => {
    expect(EXPORT_FORMAT_LABELS.csv).toBe('CSV');
    expect(EXPORT_FORMAT_LABELS.json).toBe('JSON');
    expect(EXPORT_FORMAT_LABELS.xlsx).toBe('XLSX');
  });
});

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

describe('DataExport component', () => {
  it('renders a form with default aria-label', () => {
    render(<DataExport onExport={() => {}} />);
    expect(screen.getByRole('form')).toHaveAttribute(
      'aria-label',
      'Data export',
    );
  });

  it('honors custom ariaLabel', () => {
    render(
      <DataExport
        onExport={() => {}}
        ariaLabel="Download rows"
      />,
    );
    expect(screen.getByRole('form')).toHaveAttribute(
      'aria-label',
      'Download rows',
    );
  });

  it('format select shows three options by default', () => {
    render(<DataExport onExport={() => {}} />);
    const select = screen.getByLabelText(
      'Export format',
    ) as HTMLSelectElement;
    const opts = Array.from(select.querySelectorAll('option')).map(
      (o) => o.value,
    );
    expect(opts).toEqual(['csv', 'json', 'xlsx']);
  });

  it('format select can be narrowed via formats prop', () => {
    render(
      <DataExport
        onExport={() => {}}
        formats={['csv', 'json']}
      />,
    );
    const opts = Array.from(
      (screen.getByLabelText('Export format') as HTMLSelectElement)
        .querySelectorAll('option'),
    ).map((o) => o.value);
    expect(opts).toEqual(['csv', 'json']);
  });

  it('default filename is data.csv', () => {
    render(<DataExport onExport={() => {}} />);
    expect(
      (screen.getByLabelText('Export filename') as HTMLInputElement)
        .value,
    ).toBe('data.csv');
  });

  it('default scope is view', () => {
    render(<DataExport onExport={() => {}} />);
    expect(screen.getByRole('form')).toHaveAttribute(
      'data-scope',
      'view',
    );
  });

  it('scope toggle switches active state + emits onScopeChange', () => {
    const onScopeChange = vi.fn();
    render(
      <DataExport
        onExport={() => {}}
        onScopeChange={onScopeChange}
      />,
    );
    fireEvent.click(screen.getByText('All data'));
    expect(onScopeChange).toHaveBeenCalledWith('all');
    expect(screen.getByRole('form')).toHaveAttribute(
      'data-scope',
      'all',
    );
  });

  it('changing the format updates the filename extension (uncontrolled filename)', () => {
    render(<DataExport onExport={() => {}} />);
    const filename = screen.getByLabelText(
      'Export filename',
    ) as HTMLInputElement;
    fireEvent.change(filename, {
      target: { value: 'orders' },
    });
    fireEvent.change(screen.getByLabelText('Export format'), {
      target: { value: 'json' },
    });
    expect(filename.value).toBe('orders.json');
  });

  it('controlled filename does not auto-update when format changes', () => {
    const onFilenameChange = vi.fn();
    render(
      <DataExport
        onExport={() => {}}
        filename="custom.csv"
        onFilenameChange={onFilenameChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Export format'), {
      target: { value: 'json' },
    });
    // The host controls filename; only onFilenameChange would
    // be called if the host wanted to rename
    expect(onFilenameChange).not.toHaveBeenCalled();
  });

  it('controlled scope reflects on data-scope', () => {
    const { rerender } = render(
      <DataExport onExport={() => {}} scope="view" />,
    );
    expect(screen.getByRole('form')).toHaveAttribute(
      'data-scope',
      'view',
    );
    rerender(<DataExport onExport={() => {}} scope="all" />);
    expect(screen.getByRole('form')).toHaveAttribute(
      'data-scope',
      'all',
    );
  });

  it('controlled format reflects on data-format', () => {
    render(<DataExport onExport={() => {}} format="json" />);
    expect(screen.getByRole('form')).toHaveAttribute(
      'data-format',
      'json',
    );
  });

  it('onFormatChange fires with the new value', () => {
    const onFormatChange = vi.fn();
    render(
      <DataExport
        onExport={() => {}}
        onFormatChange={onFormatChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Export format'), {
      target: { value: 'xlsx' },
    });
    expect(onFormatChange).toHaveBeenCalledWith('xlsx');
  });

  it('onFilenameChange fires with sanitised value', () => {
    const onFilenameChange = vi.fn();
    render(
      <DataExport
        onExport={() => {}}
        onFilenameChange={onFilenameChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Export filename'), {
      target: { value: 'order/s' },
    });
    expect(onFilenameChange).toHaveBeenCalledWith('orders');
  });

  it('clicking Export fires onExport with the current selection', async () => {
    const onExport = vi.fn(() => Promise.resolve());
    render(<DataExport onExport={onExport} />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Export data'));
    });
    expect(onExport).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'csv',
        scope: 'view',
        filename: 'data.csv',
        onProgress: expect.any(Function),
      }),
    );
  });

  it('Export keeps filename extension in sync at click time', async () => {
    const onExport = vi.fn(() => Promise.resolve());
    render(<DataExport onExport={onExport} />);
    fireEvent.change(screen.getByLabelText('Export filename'), {
      target: { value: 'orders' },
    });
    fireEvent.change(screen.getByLabelText('Export format'), {
      target: { value: 'json' },
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Export data'));
    });
    expect(onExport).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'orders.json',
        format: 'json',
      }),
    );
  });

  it('Export disabled when filename is empty', () => {
    render(
      <DataExport
        onExport={() => {}}
        filename=""
      />,
    );
    expect(screen.getByLabelText('Export data')).toBeDisabled();
  });

  it('Export disabled while exporting', async () => {
    let resolveExport: (() => void) | null = null;
    const onExport = vi.fn(
      () =>
        new Promise<void>((res) => {
          resolveExport = res;
        }),
    );
    render(<DataExport onExport={onExport} />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Export data'));
    });
    expect(screen.getByLabelText('Export data')).toBeDisabled();
    await act(async () => {
      resolveExport?.();
    });
  });

  it('disabled prop disables all interactive controls', () => {
    render(<DataExport onExport={() => {}} disabled />);
    expect(screen.getByLabelText('Export format')).toBeDisabled();
    expect(screen.getByLabelText('Export filename')).toBeDisabled();
    expect(screen.getByLabelText('Export data')).toBeDisabled();
  });

  it('progress prop renders the progressbar with the right value', () => {
    render(
      <DataExport
        onExport={() => {}}
        isExporting
        progress={0.5}
      />,
    );
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(bar).toHaveAttribute('aria-valuetext', '50%');
  });

  it('progress bar is hidden when not exporting', () => {
    const { container } = render(
      <DataExport onExport={() => {}} progress={0.5} />,
    );
    expect(
      container.querySelector('[data-section="data-export-progress"]'),
    ).toBeNull();
  });

  it('onProgress callback received by host updates the bar', async () => {
    let capturedOnProgress: ((p: number) => void) | undefined;
    const onExport = vi.fn((invocation) => {
      capturedOnProgress = invocation.onProgress;
      return new Promise<void>(() => {
        // hold open
      });
    });
    render(<DataExport onExport={onExport} />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Export data'));
    });
    await act(async () => {
      capturedOnProgress?.(0.4);
    });
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '40');
  });

  it('errorMessage renders the error alert', () => {
    render(
      <DataExport
        onExport={() => {}}
        errorMessage="Network down"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Network down',
    );
  });

  it('showScopeToggle=false hides the scope buttons', () => {
    const { container } = render(
      <DataExport onExport={() => {}} showScopeToggle={false} />,
    );
    expect(
      container.querySelector('[data-section="data-export-scope"]'),
    ).toBeNull();
  });

  it('custom scopeLabels override defaults', () => {
    render(
      <DataExport
        onExport={() => {}}
        scopeLabels={{ view: 'Filtered', all: 'Everything' }}
      />,
    );
    expect(screen.getByText('Filtered')).toBeInTheDocument();
    expect(screen.getByText('Everything')).toBeInTheDocument();
  });

  it('custom formatLabels override defaults', () => {
    render(
      <DataExport
        onExport={() => {}}
        formatLabels={{ csv: 'Comma-Separated' }}
      />,
    );
    const opt = (
      screen.getByLabelText('Export format') as HTMLSelectElement
    ).querySelector('option[value="csv"]');
    expect(opt?.textContent).toBe('Comma-Separated');
  });

  it('data-exporting reflects state when isExporting is controlled', () => {
    const { rerender } = render(
      <DataExport onExport={() => {}} isExporting={false} />,
    );
    expect(screen.getByRole('form')).toHaveAttribute(
      'data-exporting',
      'false',
    );
    rerender(<DataExport onExport={() => {}} isExporting />);
    expect(screen.getByRole('form')).toHaveAttribute(
      'data-exporting',
      'true',
    );
  });

  it('exposes a stable displayName', () => {
    expect(DataExport.displayName).toBe('DataExport');
  });

  it('forwards ref to the form element', () => {
    const ref = createRef<HTMLFormElement>();
    render(<DataExport ref={ref} onExport={() => {}} />);
    expect(ref.current?.tagName.toLowerCase()).toBe('form');
  });

  it('scope buttons are role=radio with aria-checked', () => {
    render(<DataExport onExport={() => {}} />);
    const view = screen.getByText('Current view');
    const all = screen.getByText('All data');
    expect(view).toHaveAttribute('role', 'radio');
    expect(view).toHaveAttribute('aria-checked', 'true');
    expect(all).toHaveAttribute('role', 'radio');
    expect(all).toHaveAttribute('aria-checked', 'false');
  });
});
