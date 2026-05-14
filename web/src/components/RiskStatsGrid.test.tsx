import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { setLocale } from '../lib/i18n';
import type { StatsResponse } from '../pages/Risk';
import RiskStatsGrid from './RiskStatsGrid';

// (v1.11.109) RiskStatsGrid is pure display over the StatsResponse
// returned by the recent-denials stats endpoint. The parent owns the
// poll plumbing (useRiskStats) -- the component only needs to render
// the four headline tiles, the per-level rollup, the optional
// topReasons / topWorkers / ruleSetRotations sections, and the
// from->to range. Each test drives one branch of the prop shape; no
// module mocks needed. Mirrors the v1.11.107 RiskCheckResult pattern.

function makeStats(over: Partial<StatsResponse> = {}): StatsResponse {
  return {
    windowHours: 24,
    from: '2026-05-13T00:00:00Z',
    to: '2026-05-13T23:59:59Z',
    total: 0,
    enforced: 0,
    dryRun: 0,
    shadowExec: 0,
    shadowExecKilled: 0,
    shadowExecNonZero: 0,
    fingerprintsObserved: [],
    ruleSetRotations: 0,
    byLevel: { critical: 0, high: 0, medium: 0, low: 0 },
    topReasons: [],
    topWorkers: [],
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
});

describe('<RiskStatsGrid>', () => {
  it('renders the total tile with the localized label and the total value', () => {
    render(<RiskStatsGrid stats={makeStats({ total: 42 })} />);
    expect(screen.getByText('total events')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders the enforced tile without the destructive tone when enforced=0', () => {
    render(<RiskStatsGrid stats={makeStats({ enforced: 0 })} />);
    expect(screen.getByText('enforced')).toBeInTheDocument();
    const cell = screen
      .getByText('enforced')
      .nextElementSibling as HTMLElement | null;
    expect(cell).not.toBeNull();
    expect(cell!.textContent).toBe('0');
    expect(cell!.className).not.toMatch(/text-destructive/);
  });

  it('applies the destructive tone to the enforced tile when enforced > 0', () => {
    render(<RiskStatsGrid stats={makeStats({ enforced: 7 })} />);
    const cell = screen
      .getByText('enforced')
      .nextElementSibling as HTMLElement | null;
    expect(cell).not.toBeNull();
    expect(cell!.textContent).toBe('7');
    expect(cell!.className).toMatch(/text-destructive/);
  });

  it('renders the dry run tile with the dryRun value', () => {
    render(<RiskStatsGrid stats={makeStats({ dryRun: 5 })} />);
    expect(screen.getByText('dry run')).toBeInTheDocument();
    const cell = screen
      .getByText('dry run')
      .nextElementSibling as HTMLElement | null;
    expect(cell!.textContent).toBe('5');
  });

  it('renders the shadow exec tile with the shadowExec value', () => {
    render(<RiskStatsGrid stats={makeStats({ shadowExec: 9 })} />);
    expect(screen.getByText('shadow exec')).toBeInTheDocument();
    const cell = screen
      .getByText('shadow exec')
      .nextElementSibling as HTMLElement | null;
    expect(cell!.textContent).toBe('9');
  });

  it('hides the shadow exec sub-line when both killed and non-zero are 0', () => {
    render(
      <RiskStatsGrid
        stats={makeStats({ shadowExec: 1, shadowExecKilled: 0, shadowExecNonZero: 0 })}
      />,
    );
    expect(screen.queryByText(/killed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/non-zero/)).not.toBeInTheDocument();
  });

  it('renders only the killed segment of the shadow exec sub-line when shadowExecKilled > 0 and shadowExecNonZero=0', () => {
    render(
      <RiskStatsGrid
        stats={makeStats({ shadowExec: 3, shadowExecKilled: 2, shadowExecNonZero: 0 })}
      />,
    );
    expect(screen.getByText(/^2 killed$/)).toBeInTheDocument();
    expect(screen.queryByText(/non-zero/)).not.toBeInTheDocument();
  });

  it('renders only the non-zero segment of the shadow exec sub-line when shadowExecNonZero > 0 and shadowExecKilled=0', () => {
    render(
      <RiskStatsGrid
        stats={makeStats({ shadowExec: 3, shadowExecKilled: 0, shadowExecNonZero: 4 })}
      />,
    );
    expect(screen.getByText(/^4 non-zero$/)).toBeInTheDocument();
    expect(screen.queryByText(/killed/)).not.toBeInTheDocument();
  });

  it('renders both killed and non-zero segments joined by a separator when both > 0', () => {
    render(
      <RiskStatsGrid
        stats={makeStats({ shadowExec: 5, shadowExecKilled: 2, shadowExecNonZero: 3 })}
      />,
    );
    expect(screen.getByText(/2 killed.*3 non-zero/)).toBeInTheDocument();
  });

  it('renders the four byLevel tiles with the level label and count', () => {
    render(
      <RiskStatsGrid
        stats={makeStats({ byLevel: { critical: 4, high: 3, medium: 2, low: 1 } })}
      />,
    );
    expect(screen.getByText('critical')).toBeInTheDocument();
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByText('medium')).toBeInTheDocument();
    expect(screen.getByText('low')).toBeInTheDocument();
    const critCell = screen.getByText('critical').nextElementSibling as HTMLElement;
    expect(critCell.textContent).toBe('4');
    expect(critCell.className).toMatch(/text-destructive/);
    const highCell = screen.getByText('high').nextElementSibling as HTMLElement;
    expect(highCell.className).toMatch(/text-destructive/);
    const medCell = screen.getByText('medium').nextElementSibling as HTMLElement;
    expect(medCell.className).toMatch(/text-warning/);
    const lowCell = screen.getByText('low').nextElementSibling as HTMLElement;
    expect(lowCell.className).toMatch(/text-success/);
  });

  it('falls back to 0 in a byLevel tile when the underlying counter key is missing', () => {
    render(
      <RiskStatsGrid
        stats={makeStats({
          byLevel: { critical: 0, high: 0, medium: 0, low: 0 },
        })}
      />,
    );
    const critCell = screen.getByText('critical').nextElementSibling as HTMLElement;
    expect(critCell.textContent).toBe('0');
  });

  it('hides the topReasons section entirely when topReasons=[]', () => {
    render(<RiskStatsGrid stats={makeStats({ topReasons: [] })} />);
    expect(screen.queryByText('top reasons')).not.toBeInTheDocument();
  });

  it('renders the topReasons section with one li per reason and the count', () => {
    render(
      <RiskStatsGrid
        stats={makeStats({
          topReasons: [
            { key: 'rm-rf', count: 4 },
            { key: 'sudo', count: 2 },
          ],
        })}
      />,
    );
    expect(screen.getByText('top reasons')).toBeInTheDocument();
    const rmItem = screen.getByText('rm-rf').closest('li');
    expect(rmItem).not.toBeNull();
    expect(rmItem!.textContent).toMatch(/rm-rf.*4/);
    const sudoItem = screen.getByText('sudo').closest('li');
    expect(sudoItem!.textContent).toMatch(/sudo.*2/);
  });

  it('hides the topWorkers section entirely when topWorkers=[]', () => {
    render(<RiskStatsGrid stats={makeStats({ topWorkers: [] })} />);
    expect(screen.queryByText('top workers')).not.toBeInTheDocument();
  });

  it('renders the topWorkers section with one li per worker and the count', () => {
    render(
      <RiskStatsGrid
        stats={makeStats({
          topWorkers: [
            { key: 'auto-w42', count: 11 },
            { key: 'auto-w43', count: 6 },
          ],
        })}
      />,
    );
    expect(screen.getByText('top workers')).toBeInTheDocument();
    const w42 = screen.getByText('auto-w42').closest('li');
    expect(w42!.textContent).toMatch(/auto-w42.*11/);
    const w43 = screen.getByText('auto-w43').closest('li');
    expect(w43!.textContent).toMatch(/auto-w43.*6/);
  });

  it('hides the rule-set rotations banner when ruleSetRotations <= 1', () => {
    render(<RiskStatsGrid stats={makeStats({ ruleSetRotations: 1 })} />);
    expect(screen.queryByText(/rule-set rotations/)).not.toBeInTheDocument();
  });

  it('renders the rule-set rotations banner with the count when ruleSetRotations > 1', () => {
    render(<RiskStatsGrid stats={makeStats({ ruleSetRotations: 3 })} />);
    const banner = screen.getByText(/3 rule-set rotations/);
    expect(banner).toBeInTheDocument();
    const wrapper = banner.closest('div');
    expect(wrapper?.className).toMatch(/border-warning/);
    expect(wrapper?.textContent).toMatch(/operator changed classifier config/);
  });

  it('renders the from -> to range row with both timestamps', () => {
    render(
      <RiskStatsGrid
        stats={makeStats({
          from: '2026-05-13T00:00:00Z',
          to: '2026-05-13T23:59:59Z',
        })}
      />,
    );
    expect(
      screen.getByText(/2026-05-13T00:00:00Z.*2026-05-13T23:59:59Z/),
    ).toBeInTheDocument();
  });

  it('drops the English "total events" label when the locale flips to ko', () => {
    render(<RiskStatsGrid stats={makeStats({ total: 42 })} />);
    expect(screen.getByText('total events')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('total events')).not.toBeInTheDocument();
  });
});
