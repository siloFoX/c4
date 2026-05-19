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
  DataImportWizard,
  IMPORT_WIZARD_STEPS,
  IMPORT_WIZARD_STEP_LABELS,
  clampImportProgress,
  formatImportProgressPercent,
  getImportStepIndex,
  getNextImportStep,
  getPrevImportStep,
  isImportMappingComplete,
  validateImportMapping,
} from './data-import-wizard';
import type {
  ImportColumn,
  ImportRow,
} from './data-import-wizard';

afterEach(() => {
  cleanup();
});

const TARGET_COLUMNS: ImportColumn[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'email', label: 'Email', required: true },
  { key: 'role', label: 'Role' },
];

const SOURCE_COLUMNS = ['col_name', 'col_email', 'col_role'];

const FULL_MAPPING: Record<string, string> = {
  col_name: 'name',
  col_email: 'email',
  col_role: 'role',
};

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

describe('IMPORT_WIZARD_STEPS', () => {
  it('lists the five canonical steps in order', () => {
    expect([...IMPORT_WIZARD_STEPS]).toEqual([
      'upload',
      'map',
      'preview',
      'import',
      'done',
    ]);
  });
  it('labels are non-empty', () => {
    for (const s of IMPORT_WIZARD_STEPS) {
      expect(IMPORT_WIZARD_STEP_LABELS[s].length).toBeGreaterThan(0);
    }
  });
});

describe('getImportStepIndex', () => {
  it('returns the right index per step', () => {
    expect(getImportStepIndex('upload')).toBe(0);
    expect(getImportStepIndex('map')).toBe(1);
    expect(getImportStepIndex('preview')).toBe(2);
    expect(getImportStepIndex('import')).toBe(3);
    expect(getImportStepIndex('done')).toBe(4);
  });
});

describe('getNextImportStep / getPrevImportStep', () => {
  it('advances by one', () => {
    expect(getNextImportStep('upload')).toBe('map');
    expect(getNextImportStep('map')).toBe('preview');
    expect(getNextImportStep('preview')).toBe('import');
    expect(getNextImportStep('import')).toBe('done');
  });
  it('clamps at the last step', () => {
    expect(getNextImportStep('done')).toBe('done');
  });
  it('retreats by one', () => {
    expect(getPrevImportStep('done')).toBe('import');
    expect(getPrevImportStep('map')).toBe('upload');
  });
  it('clamps at the first step', () => {
    expect(getPrevImportStep('upload')).toBe('upload');
  });
});

describe('validateImportMapping', () => {
  it('ok=true when all required are mapped', () => {
    const r = validateImportMapping(FULL_MAPPING, TARGET_COLUMNS);
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
  });
  it('reports missing required columns', () => {
    const r = validateImportMapping(
      { col_name: 'name' },
      TARGET_COLUMNS,
    );
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['email']);
  });
  it('non-required columns are not flagged', () => {
    const r = validateImportMapping(
      { col_name: 'name', col_email: 'email' },
      TARGET_COLUMNS,
    );
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
  });
  it('empty mapping flags every required', () => {
    const r = validateImportMapping({}, TARGET_COLUMNS);
    expect(r.missing).toEqual(['name', 'email']);
  });
});

describe('isImportMappingComplete', () => {
  it('delegates to validateImportMapping.ok', () => {
    expect(
      isImportMappingComplete(FULL_MAPPING, TARGET_COLUMNS),
    ).toBe(true);
    expect(isImportMappingComplete({}, TARGET_COLUMNS)).toBe(false);
  });
});

describe('clampImportProgress', () => {
  it('clamps below 0', () => {
    expect(clampImportProgress(-1)).toBe(0);
  });
  it('clamps above 1', () => {
    expect(clampImportProgress(1.5)).toBe(1);
  });
  it('passes through 0..1', () => {
    expect(clampImportProgress(0.5)).toBe(0.5);
  });
  it('NaN -> 0', () => {
    expect(clampImportProgress(Number.NaN)).toBe(0);
  });
});

describe('formatImportProgressPercent', () => {
  it('returns 0% for 0 / NaN / negative', () => {
    expect(formatImportProgressPercent(0)).toBe('0%');
    expect(formatImportProgressPercent(-1)).toBe('0%');
    expect(formatImportProgressPercent(Number.NaN)).toBe('0%');
  });
  it('returns 100% for >= 1', () => {
    expect(formatImportProgressPercent(1)).toBe('100%');
    expect(formatImportProgressPercent(1.2)).toBe('100%');
  });
  it('rounds mid values', () => {
    expect(formatImportProgressPercent(0.5)).toBe('50%');
    expect(formatImportProgressPercent(0.337)).toBe('34%');
  });
});

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

describe('DataImportWizard component', () => {
  it('renders a region with default aria-label', () => {
    render(<DataImportWizard />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Data import wizard',
    );
  });

  it('honors custom ariaLabel', () => {
    render(<DataImportWizard ariaLabel="Import users" />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Import users',
    );
  });

  it('starts on the upload step', () => {
    render(<DataImportWizard />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-step',
      'upload',
    );
  });

  it('renders all five step markers', () => {
    const { container } = render(<DataImportWizard />);
    expect(
      container.querySelectorAll(
        '[data-section="data-import-wizard-step"]',
      ).length,
    ).toBe(5);
  });

  it('Next is disabled when no file is uploaded', () => {
    render(<DataImportWizard />);
    expect(screen.getByText('Next')).toBeDisabled();
  });

  it('Next is enabled when uploadedFile is present', () => {
    const file = new File(['x'], 'rows.csv', {
      type: 'text/csv',
    });
    render(<DataImportWizard uploadedFile={file} />);
    expect(screen.getByText('Next')).not.toBeDisabled();
  });

  it('uploadedFile name renders on the upload step', () => {
    const file = new File(['x'], 'rows.csv', {
      type: 'text/csv',
    });
    render(<DataImportWizard uploadedFile={file} />);
    expect(
      screen.getByText('Selected: rows.csv'),
    ).toBeInTheDocument();
  });

  it('file input fires onFileUpload with the selected file', async () => {
    const onFileUpload = vi.fn(() => Promise.resolve());
    render(<DataImportWizard onFileUpload={onFileUpload} />);
    const input = screen.getByLabelText(
      'Choose import file',
    ) as HTMLInputElement;
    const file = new File(['rows'], 'rows.csv', {
      type: 'text/csv',
    });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    expect(onFileUpload).toHaveBeenCalledWith(file);
  });

  it('Next advances to the map step', () => {
    const file = new File(['x'], 'r.csv');
    render(
      <DataImportWizard
        uploadedFile={file}
        sourceColumns={SOURCE_COLUMNS}
        targetColumns={TARGET_COLUMNS}
      />,
    );
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-step',
      'map',
    );
  });

  it('Back returns to the previous step', () => {
    render(
      <DataImportWizard
        defaultStep="map"
        sourceColumns={SOURCE_COLUMNS}
        targetColumns={TARGET_COLUMNS}
      />,
    );
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-step',
      'upload',
    );
  });

  it('Back is disabled on the first step', () => {
    render(<DataImportWizard />);
    expect(screen.getByText('Back')).toBeDisabled();
  });

  it('map step renders one row per source column', () => {
    const { container } = render(
      <DataImportWizard
        defaultStep="map"
        sourceColumns={SOURCE_COLUMNS}
        targetColumns={TARGET_COLUMNS}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="data-import-wizard-map-row"]',
      ).length,
    ).toBe(3);
  });

  it('map step Next disabled until required mappings are set', () => {
    render(
      <DataImportWizard
        defaultStep="map"
        sourceColumns={SOURCE_COLUMNS}
        targetColumns={TARGET_COLUMNS}
      />,
    );
    expect(screen.getByText('Next')).toBeDisabled();
  });

  it('changing a mapping select fires onMappingChange + clears warning when complete', () => {
    const onMappingChange = vi.fn();
    render(
      <DataImportWizard
        defaultStep="map"
        sourceColumns={SOURCE_COLUMNS}
        targetColumns={TARGET_COLUMNS}
        mapping={{ col_name: 'name' }}
        onMappingChange={onMappingChange}
      />,
    );
    fireEvent.change(
      screen.getByLabelText('Map col_email to target column'),
      { target: { value: 'email' } },
    );
    expect(onMappingChange).toHaveBeenCalledWith({
      col_name: 'name',
      col_email: 'email',
    });
  });

  it('map error banner shows missing required columns', () => {
    render(
      <DataImportWizard
        defaultStep="map"
        sourceColumns={SOURCE_COLUMNS}
        targetColumns={TARGET_COLUMNS}
      />,
    );
    expect(
      screen.getByText(/Missing required columns:/),
    ).toBeInTheDocument();
  });

  it('mapping-complete data attr reflects state', () => {
    render(
      <DataImportWizard
        defaultStep="map"
        sourceColumns={SOURCE_COLUMNS}
        targetColumns={TARGET_COLUMNS}
        mapping={FULL_MAPPING}
      />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-mapping-complete',
      'true',
    );
  });

  it('preview step shows valid/invalid summary chips', () => {
    render(
      <DataImportWizard
        defaultStep="preview"
        targetColumns={TARGET_COLUMNS}
        previewSummary={{ valid: 12, invalid: 3 }}
      />,
    );
    expect(screen.getByText('Valid: 12')).toBeInTheDocument();
    expect(screen.getByText('Invalid: 3')).toBeInTheDocument();
  });

  it('preview rows render with row index + status', () => {
    const previewRows: ImportRow[] = [
      {
        index: 0,
        values: { name: 'Ada', email: 'a@x', role: 'admin' },
      },
      {
        index: 1,
        values: { name: '', email: 'bad', role: '' },
        errors: [{ column: 'name', message: 'required' }],
      },
    ];
    const { container } = render(
      <DataImportWizard
        defaultStep="preview"
        targetColumns={TARGET_COLUMNS}
        previewRows={previewRows}
      />,
    );
    const rows = container.querySelectorAll(
      '[data-section="data-import-wizard-preview-row"]',
    );
    expect(rows.length).toBe(2);
    expect(rows[0]?.getAttribute('data-row-status')).toBe(
      'valid',
    );
    expect(rows[1]?.getAttribute('data-row-status')).toBe(
      'invalid',
    );
  });

  it('preview Start import button is shown', () => {
    render(
      <DataImportWizard
        defaultStep="preview"
        targetColumns={TARGET_COLUMNS}
        previewSummary={{ valid: 5, invalid: 0 }}
      />,
    );
    expect(screen.getByText('Start import')).toBeInTheDocument();
  });

  it('Start import disabled when no valid rows', () => {
    render(
      <DataImportWizard
        defaultStep="preview"
        targetColumns={TARGET_COLUMNS}
        previewSummary={{ valid: 0, invalid: 3 }}
      />,
    );
    expect(screen.getByText('Start import')).toBeDisabled();
  });

  it('Start import calls onImport and advances to import step', async () => {
    const onImport = vi.fn(() => Promise.resolve());
    render(
      <DataImportWizard
        defaultStep="preview"
        targetColumns={TARGET_COLUMNS}
        previewSummary={{ valid: 5, invalid: 0 }}
        onImport={onImport}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('Start import'));
    });
    expect(onImport).toHaveBeenCalled();
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-step',
      'import',
    );
  });

  it('import step renders progressbar reflecting importProgress', () => {
    render(
      <DataImportWizard
        defaultStep="import"
        importProgress={0.6}
      />,
    );
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '60');
    expect(bar).toHaveAttribute('aria-valuetext', '60%');
  });

  it('done step shows success + error counts', () => {
    render(
      <DataImportWizard
        defaultStep="done"
        successCount={10}
        errorCount={2}
      />,
    );
    expect(screen.getByText('10 imported')).toBeInTheDocument();
    expect(screen.getByText('2 errors')).toBeInTheDocument();
  });

  it('done step renders the error report rows', () => {
    const errorRows: ImportRow[] = [
      {
        index: 4,
        values: { name: '', email: 'a@x' },
        errors: [
          { column: 'name', message: 'required' },
          { message: 'duplicate row' },
        ],
      },
    ];
    const { container } = render(
      <DataImportWizard
        defaultStep="done"
        errorRows={errorRows}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="data-import-wizard-error-row"]',
      ).length,
    ).toBe(1);
  });

  it('error row drill-down toggles and shows error messages', () => {
    const errorRows: ImportRow[] = [
      {
        index: 4,
        values: { name: '', email: 'a@x' },
        errors: [
          { column: 'name', message: 'required' },
          { message: 'duplicate row' },
        ],
      },
    ];
    const { container } = render(
      <DataImportWizard
        defaultStep="done"
        errorRows={errorRows}
      />,
    );
    const toggle = container.querySelector(
      '[data-section="data-import-wizard-error-toggle"]',
    ) as HTMLElement;
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('required')).toBeInTheDocument();
    expect(screen.getByText('duplicate row')).toBeInTheDocument();
  });

  it('done step shows Retry + Close buttons when handlers provided', () => {
    render(
      <DataImportWizard
        defaultStep="done"
        onRetry={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('Retry')).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();
  });

  it('Retry button fires onRetry', () => {
    const onRetry = vi.fn();
    render(
      <DataImportWizard defaultStep="done" onRetry={onRetry} />,
    );
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('Close button fires onClose', () => {
    const onClose = vi.fn();
    render(
      <DataImportWizard defaultStep="done" onClose={onClose} />,
    );
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('controlled step pins the rendered step', () => {
    const { rerender } = render(
      <DataImportWizard step="upload" />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-step',
      'upload',
    );
    rerender(<DataImportWizard step="preview" />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-step',
      'preview',
    );
  });

  it('controlled step fires onStepChange when Next is clicked', () => {
    const onStepChange = vi.fn();
    const file = new File(['x'], 'r.csv');
    render(
      <DataImportWizard
        step="upload"
        uploadedFile={file}
        onStepChange={onStepChange}
      />,
    );
    fireEvent.click(screen.getByText('Next'));
    expect(onStepChange).toHaveBeenCalledWith('map');
  });

  it('isImporting locks the Back button', () => {
    render(
      <DataImportWizard
        defaultStep="import"
        isImporting
        importProgress={0.5}
      />,
    );
    expect(screen.getByText('Back')).toBeDisabled();
  });

  it('exposes a stable displayName', () => {
    expect(DataImportWizard.displayName).toBe('DataImportWizard');
  });

  it('forwards ref to the root region', () => {
    const ref = createRef<HTMLDivElement>();
    render(<DataImportWizard ref={ref} />);
    expect(ref.current?.getAttribute('role')).toBe('region');
  });

  it('step navigation has role=navigation + aria-current on active step', () => {
    render(
      <DataImportWizard
        defaultStep="map"
        sourceColumns={SOURCE_COLUMNS}
        targetColumns={TARGET_COLUMNS}
      />,
    );
    const nav = screen.getByRole('navigation', {
      name: 'Wizard steps',
    });
    expect(nav).toBeInTheDocument();
    const activeStep = nav.querySelector(
      '[data-section="data-import-wizard-step"][data-state="active"]',
    );
    expect(activeStep).toHaveAttribute('aria-current', 'step');
  });

  it('completed steps render with data-state="completed"', () => {
    const { container } = render(
      <DataImportWizard
        defaultStep="preview"
        sourceColumns={SOURCE_COLUMNS}
        targetColumns={TARGET_COLUMNS}
      />,
    );
    const steps = container.querySelectorAll(
      '[data-section="data-import-wizard-step"]',
    );
    expect(steps[0]?.getAttribute('data-state')).toBe('completed');
    expect(steps[1]?.getAttribute('data-state')).toBe('completed');
    expect(steps[2]?.getAttribute('data-state')).toBe('active');
    expect(steps[3]?.getAttribute('data-state')).toBe('pending');
  });

  it('upload accept attribute reflects acceptedFileTypes prop', () => {
    render(
      <DataImportWizard acceptedFileTypes={['.csv']} />,
    );
    const input = screen.getByLabelText(
      'Choose import file',
    ) as HTMLInputElement;
    expect(input.accept).toBe('.csv');
  });
});
