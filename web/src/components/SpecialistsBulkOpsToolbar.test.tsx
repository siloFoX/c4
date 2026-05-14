import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type {
  ImportResult,
  SpecialistsImportMode,
} from '../lib/use-specialists-import';

// SpecialistsBulkOpsToolbar wires three hooks: useSpecialistsExport,
// useSpecialistsImport, useAuditRotate. Tests stub all three with
// per-test-tunable flags so the JSX wiring is exercised in isolation
// of the network. The import-mode dropdown is owned by the component
// itself (real useState) so we drive it through change events and
// assert the mode is forwarded to the import hook on the next render.
// Covered: export button click + busy gating + msg banner;
// import-mode select wiring + busy gating; import file input change
// invokes handleImportFile + resets target value; import preview
// chip ("preview" vs "applied" + counts); Apply button (dryRun
// branch only) + handleImportApply; audit rotate button + busy +
// msg banner; failure-tone class flip on each banner; locale flip.

let exportState: {
  exportBusy: boolean;
  exportMsg: string | null;
  exportFailed: boolean;
} = {
  exportBusy: false,
  exportMsg: null,
  exportFailed: false,
};

const handleExportMock = vi.fn();

let importState: {
  importBusy: boolean;
  importPreview: ImportResult | null;
  importError: string | null;
} = {
  importBusy: false,
  importPreview: null,
  importError: null,
};

const handleImportFileMock = vi.fn();
const handleImportApplyMock = vi.fn();

let lastImportArgs: {
  importMode: SpecialistsImportMode;
  onChange: () => void | Promise<void>;
} | null = null;

let rotateState: {
  rotateBusy: boolean;
  rotateMsg: string | null;
  rotateFailed: boolean;
} = {
  rotateBusy: false,
  rotateMsg: null,
  rotateFailed: false,
};

const handleAuditRotateMock = vi.fn();

vi.mock('../lib/use-specialists-export', () => ({
  useSpecialistsExport: () => ({
    exportBusy: exportState.exportBusy,
    exportMsg: exportState.exportMsg,
    exportFailed: exportState.exportFailed,
    handleExport: handleExportMock,
  }),
}));

vi.mock('../lib/use-specialists-import', () => ({
  useSpecialistsImport: (args: {
    importMode: SpecialistsImportMode;
    onChange: () => void | Promise<void>;
  }) => {
    lastImportArgs = args;
    return {
      importBusy: importState.importBusy,
      importPreview: importState.importPreview,
      importBundle: null,
      importError: importState.importError,
      handleImportFile: handleImportFileMock,
      handleImportApply: handleImportApplyMock,
    };
  },
}));

vi.mock('../lib/use-audit-rotate', () => ({
  useAuditRotate: () => ({
    rotateBusy: rotateState.rotateBusy,
    rotateMsg: rotateState.rotateMsg,
    rotateFailed: rotateState.rotateFailed,
    handleAuditRotate: handleAuditRotateMock,
  }),
}));

import SpecialistsBulkOpsToolbar from './SpecialistsBulkOpsToolbar';

function makePreview(over: Partial<ImportResult> = {}): ImportResult {
  return {
    mode: 'merge',
    dryRun: true,
    added: [],
    updated: [],
    removed: [],
    skipped: [],
    errors: [],
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  exportState = { exportBusy: false, exportMsg: null, exportFailed: false };
  importState = {
    importBusy: false,
    importPreview: null,
    importError: null,
  };
  rotateState = { rotateBusy: false, rotateMsg: null, rotateFailed: false };
  handleExportMock.mockReset();
  handleImportFileMock.mockReset();
  handleImportApplyMock.mockReset();
  handleAuditRotateMock.mockReset();
  lastImportArgs = null;
});

function renderToolbar(
  overrides: Partial<Parameters<typeof SpecialistsBulkOpsToolbar>[0]> = {},
) {
  const onChange = vi.fn();
  const props = { onChange, ...overrides };
  const utils = render(<SpecialistsBulkOpsToolbar {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onChange, props };
}

describe('<SpecialistsBulkOpsToolbar>', () => {
  it('renders the Export button with default idle label', () => {
    renderToolbar();
    expect(
      screen.getByRole('button', { name: 'Export' }),
    ).toBeInTheDocument();
  });

  it('uses the export tooltip on the Export button title', () => {
    renderToolbar();
    expect(screen.getByRole('button', { name: 'Export' })).toHaveAttribute(
      'title',
      'Download a self-contained JSON bundle of the registry',
    );
  });

  it('replaces the Export label with a horizontal ellipsis when exportBusy=true', () => {
    exportState.exportBusy = true;
    renderToolbar();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
    expect(
      screen.getByTitle('Download a self-contained JSON bundle of the registry'),
    ).toBeDisabled();
  });

  it('fires handleExport when the Export button is clicked', async () => {
    const { user } = renderToolbar();
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(handleExportMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT render the export message span when exportMsg is null', () => {
    const { container } = renderToolbar();
    expect(container.textContent).not.toMatch(/exported \d+ specialist/);
  });

  it('renders the export success message with muted tone when exportFailed=false', () => {
    exportState.exportMsg = 'exported 3 specialist(s)';
    exportState.exportFailed = false;
    renderToolbar();
    const banner = screen.getByText('exported 3 specialist(s)');
    expect(banner.className).toMatch(/text-muted-foreground/);
    expect(banner.className).not.toMatch(/text-destructive/);
  });

  it('renders the export failure message with destructive tone when exportFailed=true', () => {
    exportState.exportMsg = 'export failed: 500';
    exportState.exportFailed = true;
    renderToolbar();
    const banner = screen.getByText('export failed: 500');
    expect(banner.className).toMatch(/text-destructive/);
  });

  it('renders the import mode select with merge as default', () => {
    renderToolbar();
    const select = screen.getByRole('combobox', {
      name: 'Import mode',
    });
    expect(select).toHaveTextContent('merge');
  });

  it('renders both merge / replace options inside the mode select', async () => {
    const { user } = renderToolbar();
    await user.click(screen.getByRole('combobox', { name: 'Import mode' }));
    expect(screen.getByRole('option', { name: 'merge' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'replace' })).toBeInTheDocument();
  });

  it('forwards the initial importMode=merge into the import hook args', () => {
    renderToolbar();
    expect(lastImportArgs?.importMode).toBe('merge');
  });

  it('forwards onChange into the import hook args', () => {
    const { onChange } = renderToolbar();
    expect(lastImportArgs?.onChange).toBe(onChange);
  });

  it('updates the import hook args when the mode select changes to replace', async () => {
    const { user } = renderToolbar();
    await user.click(screen.getByRole('combobox', { name: 'Import mode' }));
    await user.click(screen.getByRole('option', { name: 'replace' }));
    expect(lastImportArgs?.importMode).toBe('replace');
  });

  it('disables the mode select when importBusy=true', () => {
    importState.importBusy = true;
    renderToolbar();
    expect(
      screen.getByRole('combobox', { name: 'Import mode' }),
    ).toBeDisabled();
  });

  it('renders the import file input with accept=.json', () => {
    renderToolbar();
    const input = screen.getByLabelText(
      'Import specialist bundle',
    ) as HTMLInputElement;
    expect(input.type).toBe('file');
    expect(input.accept).toBe('application/json,.json');
  });

  it('disables the import file input while importBusy=true', () => {
    importState.importBusy = true;
    renderToolbar();
    expect(screen.getByLabelText('Import specialist bundle')).toBeDisabled();
  });

  it('fires handleImportFile with the picked file when the input changes', async () => {
    const { user } = renderToolbar();
    const input = screen.getByLabelText(
      'Import specialist bundle',
    ) as HTMLInputElement;
    const file = new File(['{"specialists":[]}'], 'bundle.json', {
      type: 'application/json',
    });
    await user.upload(input, file);
    expect(handleImportFileMock).toHaveBeenCalledTimes(1);
    const arg = handleImportFileMock.mock.calls[0][0] as File;
    expect(arg.name).toBe('bundle.json');
  });

  it('resets the file input value to "" after a successful pick (allow re-pick)', async () => {
    const { user } = renderToolbar();
    const input = screen.getByLabelText(
      'Import specialist bundle',
    ) as HTMLInputElement;
    const file = new File(['{}'], 'b.json', { type: 'application/json' });
    await user.upload(input, file);
    expect(input.value).toBe('');
  });

  it('renders the import "previewing…" copy while importBusy=true', () => {
    importState.importBusy = true;
    renderToolbar();
    expect(screen.getByText('previewing…')).toBeInTheDocument();
  });

  it('renders the import error banner with destructive tone when importError is set', () => {
    importState.importError = 'invalid bundle: missing version';
    renderToolbar();
    const banner = screen.getByText('invalid bundle: missing version');
    expect(banner.className).toMatch(/text-destructive/);
  });

  it('does NOT render the import preview chip when importPreview is null', () => {
    renderToolbar();
    expect(screen.queryByText(/preview/i)).not.toBeInTheDocument();
  });

  it('renders the preview chip with "preview" label when dryRun=true', () => {
    importState.importPreview = makePreview({
      dryRun: true,
      added: ['a'],
      updated: ['b', 'c'],
      removed: [],
      errors: [],
    });
    renderToolbar();
    expect(screen.getByText(/preview · \+1 ~2 -0/)).toBeInTheDocument();
  });

  it('renders the preview chip with "applied" label when dryRun=false', () => {
    importState.importPreview = makePreview({
      dryRun: false,
      added: ['a'],
      updated: [],
      removed: ['x'],
      errors: [],
    });
    renderToolbar();
    expect(screen.getByText(/applied · \+1 ~0 -1/)).toBeInTheDocument();
  });

  it('renders the error count when importPreview.errors is non-empty', () => {
    importState.importPreview = makePreview({
      dryRun: true,
      added: [],
      updated: [],
      removed: [],
      errors: [{ id: 'broken' }, { id: 'also-broken' }],
    });
    renderToolbar();
    expect(screen.getByText(/preview · \+0 ~0 -0 ! 2/)).toBeInTheDocument();
  });

  it('renders the Apply button only when importPreview.dryRun=true', () => {
    importState.importPreview = makePreview({ dryRun: true });
    renderToolbar();
    expect(
      screen.getByRole('button', { name: 'Apply' }),
    ).toBeInTheDocument();
  });

  it('does NOT render the Apply button when importPreview.dryRun=false', () => {
    importState.importPreview = makePreview({ dryRun: false });
    renderToolbar();
    expect(
      screen.queryByRole('button', { name: 'Apply' }),
    ).not.toBeInTheDocument();
  });

  it('fires handleImportApply when the Apply button is clicked', async () => {
    importState.importPreview = makePreview({ dryRun: true });
    const { user } = renderToolbar();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(handleImportApplyMock).toHaveBeenCalledTimes(1);
  });

  it('uses the apply-import tooltip on the Apply button title', () => {
    importState.importPreview = makePreview({ dryRun: true });
    renderToolbar();
    expect(screen.getByRole('button', { name: 'Apply' })).toHaveAttribute(
      'title',
      'Apply the bundle for real (governance event — audited)',
    );
  });

  it('disables the Apply button while importBusy=true', () => {
    importState.importBusy = true;
    importState.importPreview = makePreview({ dryRun: true });
    renderToolbar();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('renders the Rotate audit button with idle label', () => {
    renderToolbar();
    expect(
      screen.getByRole('button', { name: 'Rotate audit' }),
    ).toBeInTheDocument();
  });

  it('uses the rotate-audit tooltip on the Rotate audit button title', () => {
    renderToolbar();
    expect(
      screen.getByRole('button', { name: 'Rotate audit' }),
    ).toHaveAttribute(
      'title',
      'Rotate the audit JSONL into a timestamped archive',
    );
  });

  it('fires handleAuditRotate when the Rotate audit button is clicked', async () => {
    const { user } = renderToolbar();
    await user.click(screen.getByRole('button', { name: 'Rotate audit' }));
    expect(handleAuditRotateMock).toHaveBeenCalledTimes(1);
  });

  it('disables the Rotate audit button while rotateBusy=true', () => {
    rotateState.rotateBusy = true;
    renderToolbar();
    expect(
      screen.getByTitle('Rotate the audit JSONL into a timestamped archive'),
    ).toBeDisabled();
  });

  it('renders the rotate success message with muted tone when rotateFailed=false', () => {
    rotateState.rotateMsg = 'rotated → /var/audit/2026-05-12.jsonl';
    rotateState.rotateFailed = false;
    renderToolbar();
    const banner = screen.getByText('rotated → /var/audit/2026-05-12.jsonl');
    expect(banner.className).toMatch(/text-muted-foreground/);
  });

  it('renders the rotate failure message with destructive tone when rotateFailed=true', () => {
    rotateState.rotateMsg = 'rotate failed: locked';
    rotateState.rotateFailed = true;
    renderToolbar();
    const banner = screen.getByText('rotate failed: locked');
    expect(banner.className).toMatch(/text-destructive/);
  });

  it('does NOT render the rotate message span when rotateMsg is null', () => {
    renderToolbar();
    expect(screen.queryByText(/rotated →/)).not.toBeInTheDocument();
    expect(screen.queryByText(/rotate failed:/)).not.toBeInTheDocument();
  });

  it('does not fire any callbacks on initial render', () => {
    renderToolbar();
    expect(handleExportMock).not.toHaveBeenCalled();
    expect(handleImportFileMock).not.toHaveBeenCalled();
    expect(handleImportApplyMock).not.toHaveBeenCalled();
    expect(handleAuditRotateMock).not.toHaveBeenCalled();
  });

  it('re-renders translated labels when the locale flips to ko', () => {
    renderToolbar();
    expect(screen.getByText('mode:')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('mode:')).not.toBeInTheDocument();
  });

  it('rerendering with identical props does not duplicate buttons', () => {
    const { rerender, props } = renderToolbar();
    rerender(<SpecialistsBulkOpsToolbar {...props} />);
    expect(
      screen.getAllByRole('button', { name: 'Export' }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole('button', { name: 'Rotate audit' }),
    ).toHaveLength(1);
  });
});
