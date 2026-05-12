import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';

// MeetingsMaintenancePanel is a collapsible footer with four
// ops actions (integrity / FTS rebuild / hot backup / prune-old).
// Each action lives in its own hook (use-meeting-*) with isolated
// busy + msg + failed state. Those hooks own the network calls and
// have their own unit tests, so this file stubs every hook with
// per-test-tunable flags + vi.fn() handlers. The backup + prune
// hooks also own form fields (path, force, days, terminalOnly,
// vacuum), so their mocks plug into real useState so typing /
// toggling actually drives the controlled inputs in JSX.

let integrityBusy = false;
let integrityMsg: string | null = null;
let integrityFailed = false;
const handleIntegrityMock = vi.fn();

let ftsBusy = false;
let ftsMsg: string | null = null;
let ftsFailed = false;
const handleFtsRebuildMock = vi.fn();

let backupPathInitial = '';
let backupForceInitial = false;
let backupBusyValue = false;
let backupMsgValue: string | null = null;
let backupFailedValue = false;
const setBackupPathMock = vi.fn();
const setBackupForceMock = vi.fn();
const handleBackupMock = vi.fn();

let pruneDaysInitial = '90';
let pruneTerminalInitial = true;
let pruneVacuumInitial = false;
let pruneBusyValue = false;
let pruneMsgValue: string | null = null;
let pruneFailedValue = false;
const setPruneDaysMock = vi.fn();
const setPruneTerminalMock = vi.fn();
const setPruneVacuumMock = vi.fn();
const handlePruneMock = vi.fn();
let lastPruneArgs: { onPruned?: (() => void) | undefined } | null = null;

vi.mock('../lib/use-meeting-integrity', () => ({
  useMeetingIntegrity: () => ({
    integrityBusy,
    integrityMsg,
    integrityFailed,
    handleIntegrity: handleIntegrityMock,
  }),
}));

vi.mock('../lib/use-meeting-fts-rebuild', () => ({
  useMeetingFtsRebuild: () => ({
    ftsBusy,
    ftsMsg,
    ftsFailed,
    handleFtsRebuild: handleFtsRebuildMock,
  }),
}));

vi.mock('../lib/use-meeting-backup', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    useMeetingBackup: () => {
      const [backupPath, setBackupPathState] =
        react.useState<string>(backupPathInitial);
      const [backupForce, setBackupForceState] =
        react.useState<boolean>(backupForceInitial);
      return {
        backupPath,
        setBackupPath: (next: string) => {
          setBackupPathMock(next);
          setBackupPathState(next);
        },
        backupForce,
        setBackupForce: (next: boolean) => {
          setBackupForceMock(next);
          setBackupForceState(next);
        },
        backupBusy: backupBusyValue,
        backupMsg: backupMsgValue,
        backupFailed: backupFailedValue,
        handleBackup: handleBackupMock,
      };
    },
  };
});

vi.mock('../lib/use-meeting-prune', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    useMeetingPrune: (args: { onPruned?: (() => void) | undefined }) => {
      lastPruneArgs = args;
      const [pruneDays, setPruneDaysState] =
        react.useState<string>(pruneDaysInitial);
      const [pruneTerminal, setPruneTerminalState] =
        react.useState<boolean>(pruneTerminalInitial);
      const [pruneVacuum, setPruneVacuumState] =
        react.useState<boolean>(pruneVacuumInitial);
      return {
        pruneDays,
        setPruneDays: (next: string) => {
          setPruneDaysMock(next);
          setPruneDaysState(next);
        },
        pruneTerminal,
        setPruneTerminal: (next: boolean) => {
          setPruneTerminalMock(next);
          setPruneTerminalState(next);
        },
        pruneVacuum,
        setPruneVacuum: (next: boolean) => {
          setPruneVacuumMock(next);
          setPruneVacuumState(next);
        },
        pruneBusy: pruneBusyValue,
        pruneMsg: pruneMsgValue,
        pruneFailed: pruneFailedValue,
        handlePrune: handlePruneMock,
      };
    },
  };
});

import MeetingsMaintenancePanel from './MeetingsMaintenancePanel';

beforeEach(() => {
  setLocale('en');
  integrityBusy = false;
  integrityMsg = null;
  integrityFailed = false;
  ftsBusy = false;
  ftsMsg = null;
  ftsFailed = false;
  backupPathInitial = '';
  backupForceInitial = false;
  backupBusyValue = false;
  backupMsgValue = null;
  backupFailedValue = false;
  pruneDaysInitial = '90';
  pruneTerminalInitial = true;
  pruneVacuumInitial = false;
  pruneBusyValue = false;
  pruneMsgValue = null;
  pruneFailedValue = false;
  handleIntegrityMock.mockReset();
  handleFtsRebuildMock.mockReset();
  setBackupPathMock.mockReset();
  setBackupForceMock.mockReset();
  handleBackupMock.mockReset();
  setPruneDaysMock.mockReset();
  setPruneTerminalMock.mockReset();
  setPruneVacuumMock.mockReset();
  handlePruneMock.mockReset();
  lastPruneArgs = null;
});

const TITLE_INTEGRITY = 'Run SQLite PRAGMA integrity_check on the persist DB';
const TITLE_FTS = 'Force-rebuild the FTS5 index';
const TITLE_BACKUP = 'Hot backup via SQLite VACUUM INTO';
const TITLE_DRYRUN = 'Preview which meetings would be pruned';
const TITLE_PRUNE = 'Permanently delete meetings older than N days';

async function openPanel(
  overrides: Partial<Parameters<typeof MeetingsMaintenancePanel>[0]> = {},
) {
  const props = { ...overrides };
  const utils = render(<MeetingsMaintenancePanel {...props} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /Maintenance/i }));
  return { ...utils, user, props };
}

describe('<MeetingsMaintenancePanel>', () => {
  it('renders the collapsible Maintenance heading button', () => {
    render(<MeetingsMaintenancePanel />);
    expect(
      screen.getByRole('button', { name: /Maintenance/i }),
    ).toBeInTheDocument();
  });

  it('starts collapsed with aria-expanded=false on the heading', () => {
    render(<MeetingsMaintenancePanel />);
    expect(
      screen.getByRole('button', { name: /Maintenance/i }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('does NOT render the Integrity check button while collapsed', () => {
    render(<MeetingsMaintenancePanel />);
    expect(screen.queryByTitle(TITLE_INTEGRITY)).not.toBeInTheDocument();
  });

  it('does NOT render the backup path input while collapsed', () => {
    render(<MeetingsMaintenancePanel />);
    expect(
      screen.queryByLabelText('Backup target path'),
    ).not.toBeInTheDocument();
  });

  it('flips aria-expanded to true after the heading is clicked', async () => {
    const user = userEvent.setup();
    render(<MeetingsMaintenancePanel />);
    await user.click(screen.getByRole('button', { name: /Maintenance/i }));
    expect(
      screen.getByRole('button', { name: /Maintenance/i }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('reveals the integrity / FTS / backup / dry-run / prune buttons once expanded', async () => {
    await openPanel();
    expect(screen.getByTitle(TITLE_INTEGRITY)).toBeInTheDocument();
    expect(screen.getByTitle(TITLE_FTS)).toBeInTheDocument();
    expect(screen.getByTitle(TITLE_BACKUP)).toBeInTheDocument();
    expect(screen.getByTitle(TITLE_DRYRUN)).toBeInTheDocument();
    expect(screen.getByTitle(TITLE_PRUNE)).toBeInTheDocument();
  });

  it('uses the Integrity check label text on the integrity button when not busy', async () => {
    await openPanel();
    expect(screen.getByTitle(TITLE_INTEGRITY)).toHaveTextContent(
      'Integrity check',
    );
  });

  it('calls handleIntegrity once when the Integrity button is clicked', async () => {
    const { user } = await openPanel();
    await user.click(screen.getByTitle(TITLE_INTEGRITY));
    expect(handleIntegrityMock).toHaveBeenCalledTimes(1);
  });

  it('renders the integrity success message with the muted tone when not failed', async () => {
    integrityMsg = 'ok - no integrity errors';
    integrityFailed = false;
    await openPanel();
    const span = screen.getByText('ok - no integrity errors');
    expect(span).toHaveClass('text-muted-foreground');
    expect(span).not.toHaveClass('text-destructive');
  });

  it('renders the integrity failure message with the destructive tone when failed', async () => {
    integrityMsg = 'failed - 1 error(s): mismatch';
    integrityFailed = true;
    await openPanel();
    expect(
      screen.getByText('failed - 1 error(s): mismatch'),
    ).toHaveClass('text-destructive');
  });

  it('does NOT render the integrity message text when integrityMsg is null', async () => {
    integrityMsg = null;
    await openPanel();
    const btn = screen.getByTitle(TITLE_INTEGRITY);
    const row = btn.parentElement as HTMLElement;
    expect(row.querySelector('span')).toBeNull();
  });

  it('disables the integrity button + swaps label to ellipsis when busy', async () => {
    integrityBusy = true;
    await openPanel();
    const btn = screen.getByTitle(TITLE_INTEGRITY);
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(String.fromCharCode(0x2026));
    expect(btn).not.toHaveTextContent('Integrity check');
  });

  it('uses the Rebuild FTS label text on the FTS button when not busy', async () => {
    await openPanel();
    expect(screen.getByTitle(TITLE_FTS)).toHaveTextContent('Rebuild FTS');
  });

  it('calls handleFtsRebuild once when the FTS button is clicked', async () => {
    const { user } = await openPanel();
    await user.click(screen.getByTitle(TITLE_FTS));
    expect(handleFtsRebuildMock).toHaveBeenCalledTimes(1);
  });

  it('disables the FTS button + swaps label to ellipsis when busy', async () => {
    ftsBusy = true;
    await openPanel();
    const btn = screen.getByTitle(TITLE_FTS);
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(String.fromCharCode(0x2026));
  });

  it('renders the FTS failure message with the destructive tone', async () => {
    ftsMsg = 'rebuild failed: 500';
    ftsFailed = true;
    await openPanel();
    expect(screen.getByText('rebuild failed: 500')).toHaveClass(
      'text-destructive',
    );
  });

  it('renders the FTS success message with the muted tone', async () => {
    ftsMsg = 'rebuilt - 42 indexed (40 to 42)';
    ftsFailed = false;
    await openPanel();
    expect(screen.getByText('rebuilt - 42 indexed (40 to 42)')).toHaveClass(
      'text-muted-foreground',
    );
  });

  it('renders the backup path input with the i18n aria label', async () => {
    await openPanel();
    expect(screen.getByLabelText('Backup target path')).toBeInTheDocument();
  });

  it('renders the backup path input with the i18n placeholder', async () => {
    await openPanel();
    expect(
      screen.getByPlaceholderText('/backups/meetings.db'),
    ).toBeInTheDocument();
  });

  it('renders the force-overwrite checkbox', async () => {
    await openPanel();
    expect(screen.getByLabelText(/force overwrite/i)).toBeInTheDocument();
  });

  it('keeps the Backup button disabled when path is empty', async () => {
    await openPanel();
    expect(screen.getByTitle(TITLE_BACKUP)).toBeDisabled();
  });

  it('keeps the Backup button disabled when path is whitespace-only', async () => {
    const { user } = await openPanel();
    await user.type(screen.getByLabelText('Backup target path'), '   ');
    expect(screen.getByTitle(TITLE_BACKUP)).toBeDisabled();
  });

  it('enables the Backup button once a path is typed', async () => {
    const { user } = await openPanel();
    await user.type(screen.getByLabelText('Backup target path'), '/tmp/x.db');
    expect(screen.getByTitle(TITLE_BACKUP)).not.toBeDisabled();
  });

  it('forwards every keystroke into setBackupPath', async () => {
    const { user } = await openPanel();
    await user.type(screen.getByLabelText('Backup target path'), 'ab');
    expect(setBackupPathMock).toHaveBeenCalledTimes(2);
    expect(setBackupPathMock).toHaveBeenLastCalledWith('ab');
  });

  it('reflects the typed path in the controlled input', async () => {
    const { user } = await openPanel();
    const input = screen.getByLabelText('Backup target path') as HTMLInputElement;
    await user.type(input, '/tmp/x.db');
    expect(input.value).toBe('/tmp/x.db');
  });

  it('fires setBackupForce(true) when the force-overwrite checkbox is toggled on', async () => {
    const { user } = await openPanel();
    await user.click(screen.getByLabelText(/force overwrite/i));
    expect(setBackupForceMock).toHaveBeenCalledTimes(1);
    expect(setBackupForceMock).toHaveBeenLastCalledWith(true);
  });

  it('fires handleBackup once when the Backup button is clicked with a non-empty path', async () => {
    backupPathInitial = '/tmp/x.db';
    const { user } = await openPanel();
    await user.click(screen.getByTitle(TITLE_BACKUP));
    expect(handleBackupMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire handleBackup when the Backup button is clicked while disabled', async () => {
    const { user } = await openPanel();
    await user.click(screen.getByTitle(TITLE_BACKUP));
    expect(handleBackupMock).not.toHaveBeenCalled();
  });

  it('disables the path input + force checkbox + backup button when busy', async () => {
    backupBusyValue = true;
    backupPathInitial = '/tmp/x.db';
    await openPanel();
    expect(screen.getByLabelText('Backup target path')).toBeDisabled();
    expect(screen.getByLabelText(/force overwrite/i)).toBeDisabled();
    expect(screen.getByTitle(TITLE_BACKUP)).toBeDisabled();
  });

  it('swaps the backup button label to ellipsis when busy', async () => {
    backupBusyValue = true;
    backupPathInitial = '/tmp/x.db';
    await openPanel();
    expect(screen.getByTitle(TITLE_BACKUP)).toHaveTextContent(
      String.fromCharCode(0x2026),
    );
  });

  it('shows the backup failure tone when backupFailed=true', async () => {
    backupMsgValue = 'backup failed: EACCES';
    backupFailedValue = true;
    await openPanel();
    expect(screen.getByText('backup failed: EACCES')).toHaveClass(
      'text-destructive',
    );
  });

  it('shows the backup success tone when backupFailed=false', async () => {
    backupMsgValue = 'backup ok - /tmp/x.db (12 bytes)';
    backupFailedValue = false;
    await openPanel();
    expect(
      screen.getByText('backup ok - /tmp/x.db (12 bytes)'),
    ).toHaveClass('text-muted-foreground');
  });

  it('renders the prune days input pre-seeded to 90 from the hook default', async () => {
    await openPanel();
    const input = screen.getByDisplayValue('90') as HTMLInputElement;
    expect(input.type).toBe('number');
    expect(input).toHaveAttribute('min', '1');
  });

  it('forwards the cleared prune days value to setPruneDays', async () => {
    const { user } = await openPanel();
    const input = screen.getByDisplayValue('90') as HTMLInputElement;
    await user.clear(input);
    expect(setPruneDaysMock).toHaveBeenLastCalledWith('');
  });

  it('fires setPruneTerminal(false) when the terminal-only checkbox is toggled off', async () => {
    const { user } = await openPanel();
    await user.click(screen.getByLabelText(/terminal-only/i));
    expect(setPruneTerminalMock).toHaveBeenCalledTimes(1);
    expect(setPruneTerminalMock).toHaveBeenLastCalledWith(false);
  });

  it('fires setPruneVacuum(true) when the VACUUM checkbox is toggled on', async () => {
    const { user } = await openPanel();
    await user.click(screen.getByLabelText(/^VACUUM$/i));
    expect(setPruneVacuumMock).toHaveBeenCalledTimes(1);
    expect(setPruneVacuumMock).toHaveBeenLastCalledWith(true);
  });

  it('renders the terminal-only checkbox checked by default from the hook', async () => {
    await openPanel();
    expect(
      screen.getByLabelText(/terminal-only/i) as HTMLInputElement,
    ).toBeChecked();
  });

  it('renders the VACUUM checkbox unchecked by default from the hook', async () => {
    await openPanel();
    expect(
      screen.getByLabelText(/^VACUUM$/i) as HTMLInputElement,
    ).not.toBeChecked();
  });

  it('calls handlePrune(true) when the Dry run button is clicked', async () => {
    const { user } = await openPanel();
    await user.click(screen.getByTitle(TITLE_DRYRUN));
    expect(handlePruneMock).toHaveBeenCalledTimes(1);
    expect(handlePruneMock).toHaveBeenCalledWith(true);
  });

  it('calls handlePrune(false) when the destructive Prune button is clicked', async () => {
    const { user } = await openPanel();
    await user.click(screen.getByTitle(TITLE_PRUNE));
    expect(handlePruneMock).toHaveBeenCalledTimes(1);
    expect(handlePruneMock).toHaveBeenCalledWith(false);
  });

  it('disables all prune controls + buttons when busy', async () => {
    pruneBusyValue = true;
    await openPanel();
    expect(screen.getByDisplayValue('90')).toBeDisabled();
    expect(screen.getByLabelText(/terminal-only/i)).toBeDisabled();
    expect(screen.getByLabelText(/^VACUUM$/i)).toBeDisabled();
    expect(screen.getByTitle(TITLE_DRYRUN)).toBeDisabled();
    expect(screen.getByTitle(TITLE_PRUNE)).toBeDisabled();
  });

  it('swaps both prune button labels to ellipsis when busy', async () => {
    pruneBusyValue = true;
    await openPanel();
    expect(screen.getByTitle(TITLE_DRYRUN)).toHaveTextContent(
      String.fromCharCode(0x2026),
    );
    expect(screen.getByTitle(TITLE_PRUNE)).toHaveTextContent(
      String.fromCharCode(0x2026),
    );
  });

  it('shows the prune failure tone when pruneFailed=true', async () => {
    pruneMsgValue = 'prune failed: locked';
    pruneFailedValue = true;
    await openPanel();
    expect(screen.getByText('prune failed: locked')).toHaveClass(
      'text-destructive',
    );
  });

  it('shows the prune success tone when pruneFailed=false', async () => {
    pruneMsgValue = 'pruned 3 meeting(s) older than 2026-01-01';
    pruneFailedValue = false;
    await openPanel();
    expect(
      screen.getByText('pruned 3 meeting(s) older than 2026-01-01'),
    ).toHaveClass('text-muted-foreground');
  });

  it('forwards the onPruned prop into useMeetingPrune', async () => {
    const onPruned = vi.fn();
    await openPanel({ onPruned });
    expect(lastPruneArgs?.onPruned).toBe(onPruned);
  });

  it('forwards undefined onPruned when the prop is omitted', async () => {
    await openPanel();
    expect(lastPruneArgs?.onPruned).toBeUndefined();
  });

  it('collapses again on a second heading click', async () => {
    const user = userEvent.setup();
    render(<MeetingsMaintenancePanel />);
    const heading = screen.getByRole('button', { name: /Maintenance/i });
    await user.click(heading);
    expect(heading).toHaveAttribute('aria-expanded', 'true');
    await user.click(heading);
    expect(heading).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByLabelText('Backup target path'),
    ).not.toBeInTheDocument();
  });

  it('rerendering with the same props does not duplicate the heading', () => {
    const { rerender } = render(<MeetingsMaintenancePanel />);
    rerender(<MeetingsMaintenancePanel />);
    expect(
      screen.getAllByRole('button', { name: /Maintenance/i }),
    ).toHaveLength(1);
  });

  it('keeps the typed backup path stable across rerenders while expanded', async () => {
    const { rerender, user } = await openPanel();
    await user.type(screen.getByLabelText('Backup target path'), 'x');
    rerender(<MeetingsMaintenancePanel />);
    expect(
      (screen.getByLabelText('Backup target path') as HTMLInputElement).value,
    ).toBe('x');
  });

  it('re-renders translated copy when the locale flips to ko', () => {
    render(<MeetingsMaintenancePanel />);
    expect(
      screen.getByRole('button', { name: /Maintenance/i }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('button', { name: 'Maintenance' }),
    ).not.toBeInTheDocument();
  });
});
