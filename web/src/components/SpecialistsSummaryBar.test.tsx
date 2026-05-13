import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { setLocale } from '../lib/i18n';
import type { OrganismSummary } from '../lib/use-specialists-summary';

// SpecialistsSummaryBar owns the polling fetch via the
// useSpecialistsSummary hook. Tests stub the hook with a
// per-test-tunable summary value so the JSX wiring is
// exercised in isolation from /api/specialists/summary. Pure
// display once the hook resolves -- the panel hides entirely
// while the hook returns null (older daemons / network blips),
// and renders the registry / meetings / underperformer / persist
// rollup once data arrives. Tests cover the null-hides branch,
// every conditional sub-segment of the bar (veto count, recent
// 24h badge, underperformer chip, persist row count, persist
// row count unknown, db size in MB vs KB, audit entries +
// audit bytes MB clause, backup age hours vs days, the warning
// classes that flip on size / age thresholds, persist disabled,
// and the locale flip.

let hookValue: OrganismSummary | null = null;

vi.mock('../lib/use-specialists-summary', () => ({
  useSpecialistsSummary: () => hookValue,
}));

import SpecialistsSummaryBar from './SpecialistsSummaryBar';

function makeSummary(over: Partial<OrganismSummary> = {}): OrganismSummary {
  return {
    registry: { count: 5, vetoCount: 0 },
    meetings: { total: 12, recent24h: 0 },
    scores: { specialistsWithSamples: 4, underperformerCount: 0 },
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  hookValue = null;
});

describe('<SpecialistsSummaryBar>', () => {
  it('renders nothing when the hook returns null', () => {
    hookValue = null;
    const { container } = render(<SpecialistsSummaryBar />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the registry count when the hook returns a summary', () => {
    hookValue = makeSummary({ registry: { count: 7, vetoCount: 0 } });
    render(<SpecialistsSummaryBar />);
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('renders the specialists label after the registry count', () => {
    hookValue = makeSummary({ registry: { count: 4, vetoCount: 0 } });
    render(<SpecialistsSummaryBar />);
    expect(screen.getByText(/specialists/)).toBeInTheDocument();
  });

  it('renders the meetings count', () => {
    hookValue = makeSummary({ meetings: { total: 31, recent24h: 0 } });
    render(<SpecialistsSummaryBar />);
    expect(screen.getByText('31')).toBeInTheDocument();
  });

  it('renders the meetings label after the meetings count', () => {
    hookValue = makeSummary({ meetings: { total: 1, recent24h: 0 } });
    render(<SpecialistsSummaryBar />);
    expect(screen.getByText(/meetings/)).toBeInTheDocument();
  });

  it('does NOT render the veto-count clause when registry.vetoCount is 0', () => {
    hookValue = makeSummary({ registry: { count: 5, vetoCount: 0 } });
    render(<SpecialistsSummaryBar />);
    expect(screen.queryByText(/veto\)/)).not.toBeInTheDocument();
  });

  it('renders the veto-count clause when registry.vetoCount is positive', () => {
    hookValue = makeSummary({ registry: { count: 5, vetoCount: 2 } });
    render(<SpecialistsSummaryBar />);
    expect(screen.getByText(/\(2 veto\)/)).toBeInTheDocument();
  });

  it('does NOT render the recent24h clause when meetings.recent24h is 0', () => {
    hookValue = makeSummary({ meetings: { total: 10, recent24h: 0 } });
    render(<SpecialistsSummaryBar />);
    expect(screen.queryByText(/last 24h/)).not.toBeInTheDocument();
  });

  it('renders the recent24h clause when meetings.recent24h is positive', () => {
    hookValue = makeSummary({ meetings: { total: 10, recent24h: 3 } });
    render(<SpecialistsSummaryBar />);
    expect(screen.getByText(/\(3 last 24h\)/)).toBeInTheDocument();
  });

  it('does NOT render the underperformers chip when scores.underperformerCount is 0', () => {
    hookValue = makeSummary({
      scores: { specialistsWithSamples: 0, underperformerCount: 0 },
    });
    render(<SpecialistsSummaryBar />);
    expect(screen.queryByText(/underperformer/)).not.toBeInTheDocument();
  });

  it('renders the underperformers chip when scores.underperformerCount is positive', () => {
    hookValue = makeSummary({
      scores: { specialistsWithSamples: 4, underperformerCount: 2 },
    });
    render(<SpecialistsSummaryBar />);
    expect(
      screen.getByText('2 underperformer(s)'),
    ).toBeInTheDocument();
  });

  it('uses the amber tone on the underperformers chip', () => {
    hookValue = makeSummary({
      scores: { specialistsWithSamples: 4, underperformerCount: 1 },
    });
    render(<SpecialistsSummaryBar />);
    const chip = screen.getByText('1 underperformer(s)');
    expect(chip.className).toMatch(/text-warning/);
  });

  it('does NOT render any persist clause when the persist block is absent', () => {
    hookValue = makeSummary();
    render(<SpecialistsSummaryBar />);
    expect(screen.queryByText(/persist/)).not.toBeInTheDocument();
  });

  it('renders the persist disabled clause when persist.enabled is false', () => {
    hookValue = makeSummary({ persist: { enabled: false } });
    render(<SpecialistsSummaryBar />);
    expect(screen.getByText('· persist DISABLED')).toBeInTheDocument();
  });

  it('uses the amber tone on the persist disabled clause', () => {
    hookValue = makeSummary({ persist: { enabled: false } });
    render(<SpecialistsSummaryBar />);
    const chip = screen.getByText('· persist DISABLED');
    expect(chip.className).toMatch(/text-warning/);
  });

  it('renders the persistRows clause when persist.rowCount is set', () => {
    hookValue = makeSummary({
      persist: { enabled: true, rowCount: 123 },
    });
    render(<SpecialistsSummaryBar />);
    expect(screen.getByText(/persist 123 rows/)).toBeInTheDocument();
  });

  it('renders the unknown-rows fallback when persist.rowCount is null', () => {
    hookValue = makeSummary({
      persist: { enabled: true, rowCount: null },
    });
    render(<SpecialistsSummaryBar />);
    expect(screen.getByText(/persist \? rows/)).toBeInTheDocument();
  });

  it('renders the unknown-rows fallback when persist.rowCount is omitted', () => {
    hookValue = makeSummary({
      persist: { enabled: true },
    });
    render(<SpecialistsSummaryBar />);
    expect(screen.getByText(/persist \? rows/)).toBeInTheDocument();
  });

  it('renders the dbSizeKb clause when dbSizeBytes is below 1 MB', () => {
    hookValue = makeSummary({
      persist: { enabled: true, rowCount: 10, dbSizeBytes: 512 * 1024 },
    });
    render(<SpecialistsSummaryBar />);
    expect(screen.getByText(/\(512\.0KB\)/)).toBeInTheDocument();
  });

  it('renders the dbSizeMb clause when dbSizeBytes is above 1 MB', () => {
    hookValue = makeSummary({
      persist: {
        enabled: true,
        rowCount: 10,
        dbSizeBytes: 5 * 1024 * 1024,
      },
    });
    render(<SpecialistsSummaryBar />);
    expect(screen.getByText(/\(5\.0MB\)/)).toBeInTheDocument();
  });

  it('does NOT render any db size clause when dbSizeBytes is omitted', () => {
    hookValue = makeSummary({
      persist: { enabled: true, rowCount: 10 },
    });
    render(<SpecialistsSummaryBar />);
    expect(screen.queryByText(/\d+\.\dMB\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+\.\dKB\)/)).not.toBeInTheDocument();
  });

  it('does NOT highlight the persistRows clause with amber when dbSizeBytes is small', () => {
    hookValue = makeSummary({
      persist: {
        enabled: true,
        rowCount: 10,
        dbSizeBytes: 1024 * 1024,
      },
    });
    render(<SpecialistsSummaryBar />);
    const chip = screen.getByText(/persist 10 rows/);
    expect(chip.className).not.toMatch(/text-warning/);
  });

  it('highlights the persistRows clause with amber when dbSizeBytes exceeds 100 MB', () => {
    hookValue = makeSummary({
      persist: {
        enabled: true,
        rowCount: 10,
        dbSizeBytes: 200 * 1024 * 1024,
      },
    });
    render(<SpecialistsSummaryBar />);
    const chip = screen.getByText(/persist 10 rows/);
    expect(chip.className).toMatch(/text-warning/);
  });

  it('renders the audit entries clause when auditLog.entries is set', () => {
    hookValue = makeSummary({
      persist: {
        enabled: true,
        rowCount: 5,
        auditLog: { entries: 87 },
      },
    });
    render(<SpecialistsSummaryBar />);
    expect(screen.getByText(/audit 87 entries/)).toBeInTheDocument();
  });

  it('does NOT render the audit entries clause when auditLog is absent', () => {
    hookValue = makeSummary({
      persist: { enabled: true, rowCount: 5 },
    });
    render(<SpecialistsSummaryBar />);
    expect(screen.queryByText(/audit \d+ entries/)).not.toBeInTheDocument();
  });

  it('appends the audit bytes MB clause when auditLog.bytes is above 1 MB', () => {
    hookValue = makeSummary({
      persist: {
        enabled: true,
        rowCount: 5,
        auditLog: { entries: 100, bytes: 2 * 1024 * 1024 },
      },
    });
    render(<SpecialistsSummaryBar />);
    expect(screen.getByText(/audit 100 entries.*\(2\.0MB\)/)).toBeInTheDocument();
  });

  it('omits the audit bytes MB clause when auditLog.bytes is below 1 MB', () => {
    hookValue = makeSummary({
      persist: {
        enabled: true,
        rowCount: 5,
        auditLog: { entries: 100, bytes: 100 * 1024 },
      },
    });
    render(<SpecialistsSummaryBar />);
    const chip = screen.getByText(/audit 100 entries/);
    expect(chip.textContent).not.toMatch(/MB\)/);
  });

  it('highlights the audit entries clause with amber when bytes exceeds 1 MB', () => {
    hookValue = makeSummary({
      persist: {
        enabled: true,
        rowCount: 5,
        auditLog: { entries: 50, bytes: 5 * 1024 * 1024 },
      },
    });
    render(<SpecialistsSummaryBar />);
    const chip = screen.getByText(/audit 50 entries/);
    expect(chip.className).toMatch(/text-warning/);
  });

  it('renders the backupAgeHours clause when lastKnownGood.ageDays is below 1', () => {
    hookValue = makeSummary({
      persist: {
        enabled: true,
        rowCount: 5,
        lastKnownGood: { exists: true, ageDays: 0.5 },
      },
    });
    render(<SpecialistsSummaryBar />);
    expect(screen.getByText(/backup 12\.0h ago/)).toBeInTheDocument();
  });

  it('renders the backupAgeDays clause when lastKnownGood.ageDays is at least 1', () => {
    hookValue = makeSummary({
      persist: {
        enabled: true,
        rowCount: 5,
        lastKnownGood: { exists: true, ageDays: 3 },
      },
    });
    render(<SpecialistsSummaryBar />);
    expect(screen.getByText(/backup 3\.0d ago/)).toBeInTheDocument();
  });

  it('highlights the backup clause with amber when ageDays exceeds 7', () => {
    hookValue = makeSummary({
      persist: {
        enabled: true,
        rowCount: 5,
        lastKnownGood: { exists: true, ageDays: 14 },
      },
    });
    render(<SpecialistsSummaryBar />);
    const chip = screen.getByText(/backup 14\.0d ago/);
    expect(chip.className).toMatch(/text-warning/);
  });

  it('does NOT render the backup clause when lastKnownGood.exists is false', () => {
    hookValue = makeSummary({
      persist: {
        enabled: true,
        rowCount: 5,
        lastKnownGood: { exists: false, ageDays: 2 },
      },
    });
    render(<SpecialistsSummaryBar />);
    expect(screen.queryByText(/backup/)).not.toBeInTheDocument();
  });

  it('does NOT render the backup clause when lastKnownGood is omitted', () => {
    hookValue = makeSummary({
      persist: { enabled: true, rowCount: 5 },
    });
    render(<SpecialistsSummaryBar />);
    expect(screen.queryByText(/backup/)).not.toBeInTheDocument();
  });

  it('renders multiple persist sub-segments together when all are populated', () => {
    hookValue = makeSummary({
      registry: { count: 8, vetoCount: 1 },
      meetings: { total: 20, recent24h: 4 },
      scores: { specialistsWithSamples: 8, underperformerCount: 1 },
      persist: {
        enabled: true,
        rowCount: 200,
        dbSizeBytes: 3 * 1024 * 1024,
        auditLog: { entries: 50, bytes: 200 * 1024 },
        lastKnownGood: { exists: true, ageDays: 2.5 },
      },
    });
    render(<SpecialistsSummaryBar />);
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText(/1 underperformer/)).toBeInTheDocument();
    expect(screen.getByText(/persist 200 rows/)).toBeInTheDocument();
    expect(screen.getByText(/audit 50 entries/)).toBeInTheDocument();
    expect(screen.getByText(/backup 2\.5d ago/)).toBeInTheDocument();
  });

  it('re-renders translated labels when the locale flips to ko', () => {
    hookValue = makeSummary({ registry: { count: 3, vetoCount: 0 } });
    render(<SpecialistsSummaryBar />);
    expect(screen.getByText(/specialists/)).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    // The Korean translation differs ("전문가"), so the English
    // literal is gone after the locale flip.
    expect(screen.queryByText(/^specialists$/)).not.toBeInTheDocument();
  });
});
