import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type {
  AuditEntry,
  AuditWindow,
} from '../lib/use-specialists-audit';
import type { AuditVerifyResult } from '../lib/use-audit-verify';

// SpecialistsAuditPanel composes three hooks: useSpecialistsAudit
// (poll + window selector), useAuditVerify (verify chain + result
// banner), useAuditExport (CSV download). Tests stub all three
// with per-test-tunable flags so the JSX wiring is exercised in
// isolation. useToggle stays real so click-to-toggle on the
// section header drives the closed -> open branch the same way
// the daemon does. Covered: header expansion, window selector
// aria-pressed + dispatch, verify / + rotated buttons,
// export CSV button, verify result banner ok / corrupt branches,
// entry list rendering with reverse order + per-action tone, the
// empty / loading branches.

let auditState: {
  auditEntries: AuditEntry[];
  auditLoading: boolean;
  auditWindow: AuditWindow;
} = {
  auditEntries: [],
  auditLoading: false,
  auditWindow: 'all',
};

const setAuditWindowMock = vi.fn();

let verifyState: {
  verifyBusy: boolean;
  verifyResult: AuditVerifyResult | null;
} = {
  verifyBusy: false,
  verifyResult: null,
};

const handleVerifyMock = vi.fn();

let exportState: {
  exportAuditBusy: boolean;
} = { exportAuditBusy: false };

const handleAuditExportMock = vi.fn();

vi.mock('../lib/use-specialists-audit', () => ({
  useSpecialistsAudit: () => ({
    auditEntries: auditState.auditEntries,
    auditLoading: auditState.auditLoading,
    auditWindow: auditState.auditWindow,
    setAuditWindow: setAuditWindowMock,
  }),
}));

vi.mock('../lib/use-audit-verify', () => ({
  useAuditVerify: () => ({
    verifyBusy: verifyState.verifyBusy,
    verifyResult: verifyState.verifyResult,
    handleVerify: handleVerifyMock,
  }),
}));

vi.mock('../lib/use-audit-export', () => ({
  useAuditExport: () => ({
    exportAuditBusy: exportState.exportAuditBusy,
    handleAuditExport: handleAuditExportMock,
  }),
}));

import SpecialistsAuditPanel from './SpecialistsAuditPanel';

beforeEach(() => {
  setLocale('en');
  auditState = {
    auditEntries: [],
    auditLoading: false,
    auditWindow: 'all',
  };
  verifyState = { verifyBusy: false, verifyResult: null };
  exportState = { exportAuditBusy: false };
  setAuditWindowMock.mockReset();
  handleVerifyMock.mockReset();
  handleAuditExportMock.mockReset();
});

function makeEntry(over: Partial<AuditEntry> = {}): AuditEntry {
  return {
    ts: '2026-05-01T00:00:00Z',
    action: 'add',
    id: 'arch-1',
    actor: 'alice',
    reason: 'initial',
    ...over,
  };
}

function renderPanel() {
  const utils = render(<SpecialistsAuditPanel />);
  const user = userEvent.setup();
  return { ...utils, user };
}

async function openSection(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Audit log/i }));
}

describe('<SpecialistsAuditPanel>', () => {
  it('renders the audit log heading button collapsed by default', () => {
    renderPanel();
    const header = screen.getByRole('button', { name: /Audit log/i });
    expect(header).toBeInTheDocument();
    expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders the "· last 50 entries" subheading', () => {
    renderPanel();
    expect(screen.getByText('· last 50 entries')).toBeInTheDocument();
  });

  it('does NOT render the loading copy when auditLoading is false', () => {
    renderPanel();
    expect(screen.queryByText('loading…')).not.toBeInTheDocument();
  });

  it('renders the loading copy when auditLoading is true', () => {
    auditState.auditLoading = true;
    renderPanel();
    expect(screen.getByText('loading…')).toBeInTheDocument();
  });

  it('does NOT render the window-selector row when collapsed', () => {
    auditState.auditEntries = [makeEntry()];
    renderPanel();
    expect(screen.queryByText('window:')).not.toBeInTheDocument();
  });

  it('does NOT render the entry-count chip when collapsed even with entries', () => {
    auditState.auditEntries = [makeEntry(), makeEntry({ id: 'arch-2' })];
    renderPanel();
    expect(screen.queryByText(/^\d+ entries$/)).not.toBeInTheDocument();
  });

  it('expands and shows the window-selector row when the header is clicked', async () => {
    const { user } = renderPanel();
    await openSection(user);
    expect(screen.getByText('window:')).toBeInTheDocument();
  });

  it('flips aria-expanded to true after the header is clicked', async () => {
    const { user } = renderPanel();
    await openSection(user);
    expect(
      screen.getByRole('button', { name: /Audit log/i }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders the entry-count chip when open with entries', async () => {
    auditState.auditEntries = [makeEntry(), makeEntry({ id: 'arch-2' })];
    const { user } = renderPanel();
    await openSection(user);
    expect(screen.getByText('2 entries')).toBeInTheDocument();
  });

  it('renders all four window pills (all / 1h / 24h / 7d) when open', async () => {
    const { user } = renderPanel();
    await openSection(user);
    expect(screen.getByRole('button', { name: 'all' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'last 1h' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'last 24h' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'last 7d' }),
    ).toBeInTheDocument();
  });

  it('marks the active window pill aria-pressed=true (default all)', async () => {
    const { user } = renderPanel();
    await openSection(user);
    expect(screen.getByRole('button', { name: 'all' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'last 1h' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('marks the active window pill aria-pressed=true when window is 24h', async () => {
    auditState.auditWindow = '24h';
    const { user } = renderPanel();
    await openSection(user);
    expect(screen.getByRole('button', { name: 'last 24h' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'all' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('fires setAuditWindow with the literal value when a pill is clicked', async () => {
    const { user } = renderPanel();
    await openSection(user);
    await user.click(screen.getByRole('button', { name: 'last 1h' }));
    expect(setAuditWindowMock).toHaveBeenCalledTimes(1);
    expect(setAuditWindowMock).toHaveBeenCalledWith('1h');
  });

  it('fires setAuditWindow with 7d when the 7d pill is clicked', async () => {
    const { user } = renderPanel();
    await openSection(user);
    await user.click(screen.getByRole('button', { name: 'last 7d' }));
    expect(setAuditWindowMock).toHaveBeenCalledWith('7d');
  });

  it('renders the Export CSV button when open', async () => {
    const { user } = renderPanel();
    await openSection(user);
    expect(
      screen.getByRole('button', { name: 'Export CSV' }),
    ).toBeInTheDocument();
  });

  it('uses the Export CSV tooltip text on the title attribute', async () => {
    const { user } = renderPanel();
    await openSection(user);
    expect(
      screen.getByRole('button', { name: 'Export CSV' }),
    ).toHaveAttribute(
      'title',
      'Download CSV of audit entries in the current window',
    );
  });

  it('fires handleAuditExport when Export CSV is clicked', async () => {
    const { user } = renderPanel();
    await openSection(user);
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(handleAuditExportMock).toHaveBeenCalledTimes(1);
  });

  it('disables Export CSV while exportAuditBusy=true', async () => {
    exportState.exportAuditBusy = true;
    const { user } = renderPanel();
    await openSection(user);
    expect(screen.getByTitle('Download CSV of audit entries in the current window')).toBeDisabled();
  });

  it('renders the Verify chain button when open', async () => {
    const { user } = renderPanel();
    await openSection(user);
    expect(
      screen.getByRole('button', { name: 'Verify chain' }),
    ).toBeInTheDocument();
  });

  it('renders the + rotated button when open', async () => {
    const { user } = renderPanel();
    await openSection(user);
    expect(
      screen.getByRole('button', { name: '+ rotated' }),
    ).toBeInTheDocument();
  });

  it('fires handleVerify(false) when Verify chain is clicked', async () => {
    const { user } = renderPanel();
    await openSection(user);
    await user.click(screen.getByRole('button', { name: 'Verify chain' }));
    expect(handleVerifyMock).toHaveBeenCalledTimes(1);
    expect(handleVerifyMock).toHaveBeenCalledWith(false);
  });

  it('fires handleVerify(true) when + rotated is clicked', async () => {
    const { user } = renderPanel();
    await openSection(user);
    await user.click(screen.getByRole('button', { name: '+ rotated' }));
    expect(handleVerifyMock).toHaveBeenCalledTimes(1);
    expect(handleVerifyMock).toHaveBeenCalledWith(true);
  });

  it('disables both verify buttons while verifyBusy=true', async () => {
    verifyState.verifyBusy = true;
    const { user } = renderPanel();
    await openSection(user);
    expect(
      screen.getByTitle('Verify the live audit-log hash chain'),
    ).toBeDisabled();
    expect(
      screen.getByTitle('Verify the live audit-log + rotated archives'),
    ).toBeDisabled();
  });

  it('does NOT render the verify result banner when verifyResult is null', async () => {
    const { user } = renderPanel();
    await openSection(user);
    expect(screen.queryByText(/^ok \(/)).not.toBeInTheDocument();
    expect(screen.queryByText('CORRUPT')).not.toBeInTheDocument();
  });

  it('renders the OK verify banner with emerald tone when verifyResult.valid=true', async () => {
    verifyState.verifyResult = {
      valid: true,
      corruptedAt: null,
      total: 42,
      rotatedTotal: 8,
    };
    const { user } = renderPanel();
    await openSection(user);
    const banner = screen.getByText('ok (50)');
    expect(banner).toBeInTheDocument();
    expect(banner.className).toMatch(/text-emerald-700/);
  });

  it('renders the CORRUPT verify banner with destructive tone when valid=false', async () => {
    verifyState.verifyResult = {
      valid: false,
      corruptedAt: 7,
      total: 10,
      rotatedTotal: 0,
    };
    const { user } = renderPanel();
    await openSection(user);
    const banner = screen.getByText('CORRUPT');
    expect(banner).toBeInTheDocument();
    expect(banner.className).toMatch(/text-destructive/);
  });

  it('includes the corruptedAt clause in the title on the corrupt banner', async () => {
    verifyState.verifyResult = {
      valid: false,
      corruptedAt: 13,
      total: 20,
      rotatedTotal: 0,
    };
    const { user } = renderPanel();
    await openSection(user);
    const banner = screen.getByText('CORRUPT');
    expect(banner.getAttribute('title')).toContain('corruptedAt 13');
  });

  it('omits the corruptedAt clause when corruptedAt is null', async () => {
    verifyState.verifyResult = {
      valid: false,
      corruptedAt: null,
      total: 5,
      rotatedTotal: 0,
    };
    const { user } = renderPanel();
    await openSection(user);
    const banner = screen.getByText('CORRUPT');
    expect(banner.getAttribute('title')).not.toContain('corruptedAt');
  });

  it('renders the all-empty message when window=all and no entries', async () => {
    auditState.auditEntries = [];
    auditState.auditWindow = 'all';
    const { user } = renderPanel();
    await openSection(user);
    expect(screen.getByText('No audit entries yet.')).toBeInTheDocument();
  });

  it('renders the window-empty message templated with the window value', async () => {
    auditState.auditEntries = [];
    auditState.auditWindow = '1h';
    const { user } = renderPanel();
    await openSection(user);
    expect(
      screen.getByText('No audit entries in the last 1h.'),
    ).toBeInTheDocument();
  });

  it('falls back to common.loading copy in the empty branch while auditLoading=true', async () => {
    auditState.auditEntries = [];
    auditState.auditLoading = true;
    const { user } = renderPanel();
    await openSection(user);
    expect(screen.getAllByText(/loading/i).length).toBeGreaterThan(0);
  });

  it('renders one li per audit entry inside the expanded list', async () => {
    auditState.auditEntries = [
      makeEntry({ id: 'arch-1' }),
      makeEntry({ id: 'arch-2', action: 'remove' }),
      makeEntry({ id: 'arch-3', action: 'import' }),
    ];
    const { user, container } = renderPanel();
    await openSection(user);
    const lists = container.querySelectorAll('ul');
    expect(lists.length).toBe(1);
    expect(within(lists[0] as HTMLElement).getAllByRole('listitem')).toHaveLength(3);
  });

  it('renders entries in reverse order (newest first)', async () => {
    auditState.auditEntries = [
      makeEntry({ id: 'arch-first', action: 'add' }),
      makeEntry({ id: 'arch-second', action: 'remove' }),
    ];
    const { user, container } = renderPanel();
    await openSection(user);
    const items = within(container.querySelector('ul') as HTMLElement).getAllByRole(
      'listitem',
    );
    expect(within(items[0]).getByText('arch-second')).toBeInTheDocument();
    expect(within(items[1]).getByText('arch-first')).toBeInTheDocument();
  });

  it('renders the by-actor copy when actor is set', async () => {
    auditState.auditEntries = [makeEntry({ actor: 'bob' })];
    const { user } = renderPanel();
    await openSection(user);
    expect(screen.getByText('by bob')).toBeInTheDocument();
  });

  it('does NOT render the actor span when actor is null', async () => {
    auditState.auditEntries = [makeEntry({ actor: null })];
    const { user } = renderPanel();
    await openSection(user);
    expect(screen.queryByText(/^by /)).not.toBeInTheDocument();
  });

  it('renders the reason copy when reason is set', async () => {
    auditState.auditEntries = [makeEntry({ reason: 'manual cleanup' })];
    const { user } = renderPanel();
    await openSection(user);
    expect(screen.getByText('— manual cleanup')).toBeInTheDocument();
  });

  it('does NOT render the reason span when reason is null', async () => {
    auditState.auditEntries = [makeEntry({ reason: null })];
    const { user } = renderPanel();
    await openSection(user);
    expect(screen.queryByText(/^— /)).not.toBeInTheDocument();
  });

  it('applies the per-action tone class on the action chip (add → emerald)', async () => {
    auditState.auditEntries = [makeEntry({ action: 'add' })];
    const { user } = renderPanel();
    await openSection(user);
    const chip = screen.getByText('add');
    expect(chip.className).toMatch(/text-emerald-700/);
  });

  it('applies the per-action tone class on remove (rose)', async () => {
    auditState.auditEntries = [makeEntry({ action: 'remove' })];
    const { user } = renderPanel();
    await openSection(user);
    const chip = screen.getByText('remove');
    expect(chip.className).toMatch(/text-rose-700/);
  });

  it('falls back to muted tone for an unknown action', async () => {
    auditState.auditEntries = [makeEntry({ action: 'mystery' })];
    const { user } = renderPanel();
    await openSection(user);
    const chip = screen.getByText('mystery');
    expect(chip.className).toMatch(/text-muted-foreground/);
  });

  it('does not duplicate rows across rerenders while open', async () => {
    auditState.auditEntries = [makeEntry({ id: 'arch-1' })];
    const { user, rerender } = renderPanel();
    await openSection(user);
    rerender(<SpecialistsAuditPanel />);
    expect(screen.getAllByText('arch-1')).toHaveLength(1);
  });

  it('re-renders translated labels when the locale flips to ko', () => {
    renderPanel();
    expect(screen.getByText('· last 50 entries')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('· last 50 entries')).not.toBeInTheDocument();
  });

  it('collapses back when the header is toggled twice', async () => {
    const { user } = renderPanel();
    const header = screen.getByRole('button', { name: /Audit log/i });
    await user.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
    await user.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('window:')).not.toBeInTheDocument();
  });
});
