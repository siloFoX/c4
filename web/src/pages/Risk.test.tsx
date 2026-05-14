import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { CheckResponse, SandboxPreview, StatsResponse } from './Risk';

// Risk.tsx composes three feature hooks (useRiskCheck for POST
// /api/risk/check, useRiskSandboxPreview for POST /api/risk/preview,
// useRiskStats for GET /api/risk/stats) and four sibling sub-panels
// (RiskRuleCatalogPanel, RiskSandboxPreview, RiskCheckResult,
// RiskStatsGrid). vi.mock each one to a thin marker so the tests
// stay focused on what Risk.tsx itself wires up -- the command
// textarea, two action buttons, the post-denoise toggle, the
// stats refresh + window selector.

interface RiskCheckState {
  checkBusy: boolean;
  checkResult: CheckResponse | null;
  checkError: string | null;
  runCheck: () => Promise<void>;
}

interface RiskSandboxPreviewState {
  sandboxBusy: boolean;
  sandbox: SandboxPreview | null;
  sandboxError: string | null;
  runPreview: () => Promise<void>;
}

interface RiskStatsState {
  windowHours: number;
  setWindowHours: (next: number) => void;
  stats: StatsResponse | null;
  statsLoading: boolean;
  statsError: string | null;
  refreshStats: () => Promise<void>;
}

const runCheckMock = vi.fn(async () => {});
const runPreviewMock = vi.fn(async () => {});
const refreshStatsMock = vi.fn(async () => {});
const setWindowHoursMock = vi.fn();

let checkState: RiskCheckState = {
  checkBusy: false,
  checkResult: null,
  checkError: null,
  runCheck: runCheckMock,
};

let sandboxState: RiskSandboxPreviewState = {
  sandboxBusy: false,
  sandbox: null,
  sandboxError: null,
  runPreview: runPreviewMock,
};

let statsState: RiskStatsState = {
  windowHours: 24,
  setWindowHours: setWindowHoursMock,
  stats: null,
  statsLoading: false,
  statsError: null,
  refreshStats: refreshStatsMock,
};

vi.mock('../lib/use-risk-check', () => ({
  useRiskCheck: (): RiskCheckState => checkState,
}));

vi.mock('../lib/use-risk-sandbox-preview', () => ({
  useRiskSandboxPreview: (): RiskSandboxPreviewState => sandboxState,
}));

vi.mock('../lib/use-risk-stats', () => ({
  useRiskStats: (): RiskStatsState => statsState,
}));

vi.mock('../components/RiskRuleCatalogPanel', () => ({
  default: () => <div data-testid="rule-catalog-panel" />,
}));

vi.mock('../components/RiskSandboxPreview', () => ({
  default: (props: { sandbox: SandboxPreview }) => (
    <div
      data-testid="sandbox-preview"
      data-runtime={props.sandbox.runtime}
    />
  ),
}));

vi.mock('../components/RiskCheckResult', () => ({
  default: (props: { result: CheckResponse }) => (
    <div
      data-testid="check-result"
      data-level={props.result.level}
      data-action={props.result.suggestedAction}
    />
  ),
}));

vi.mock('../components/RiskStatsGrid', () => ({
  default: (props: { stats: StatsResponse }) => (
    <div
      data-testid="stats-grid"
      data-total={String(props.stats.total)}
    />
  ),
}));

import Risk from './Risk';

function makeCheck(over: Partial<CheckResponse> = {}): CheckResponse {
  return {
    level: 'low',
    suggestedAction: 'allow',
    reasons: [],
    decoded: null,
    denyForced: false,
    wouldDeny: false,
    autoDenyLevel: 'critical',
    enforcementEnabled: true,
    ...over,
  };
}

function makeSandbox(over: Partial<SandboxPreview> = {}): SandboxPreview {
  return {
    binary: '/usr/bin/docker',
    args: ['run', '--rm'],
    env: {},
    command: 'echo ok',
    isolation: {
      name: 'docker',
      network: 'none',
      filesystem: 'ro',
      resources: 'capped',
    },
    available: { ok: true, reason: null },
    runtime: 'docker',
    ...over,
  };
}

function makeStats(over: Partial<StatsResponse> = {}): StatsResponse {
  return {
    windowHours: 24,
    from: '2026-05-11T00:00:00.000Z',
    to: '2026-05-12T00:00:00.000Z',
    total: 100,
    enforced: 50,
    dryRun: 50,
    shadowExec: 0,
    shadowExecKilled: 0,
    shadowExecNonZero: 0,
    fingerprintsObserved: [],
    ruleSetRotations: 0,
    byLevel: { critical: 1, high: 2, medium: 3, low: 4 },
    topReasons: [],
    topWorkers: [],
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
  runCheckMock.mockReset();
  runCheckMock.mockResolvedValue(undefined);
  runPreviewMock.mockReset();
  runPreviewMock.mockResolvedValue(undefined);
  refreshStatsMock.mockReset();
  refreshStatsMock.mockResolvedValue(undefined);
  setWindowHoursMock.mockReset();
  checkState = {
    checkBusy: false,
    checkResult: null,
    checkError: null,
    runCheck: runCheckMock,
  };
  sandboxState = {
    sandboxBusy: false,
    sandbox: null,
    sandboxError: null,
    runPreview: runPreviewMock,
  };
  statsState = {
    windowHours: 24,
    setWindowHours: setWindowHoursMock,
    stats: null,
    statsLoading: false,
    statsError: null,
    refreshStats: refreshStatsMock,
  };
});

describe('<Risk>', () => {
  it('renders the page title in the frame header', () => {
    render(<Risk />);
    expect(screen.getByText('Risk Inspector')).toBeInTheDocument();
  });

  it('renders the page description in the frame header', () => {
    render(<Risk />);
    expect(
      screen.getByText(/Preview a command's risk classification/),
    ).toBeInTheDocument();
  });

  it('renders the refresh-stats button with the visible Refresh label', () => {
    render(<Risk />);
    expect(
      screen.getByRole('button', { name: 'Refresh' }),
    ).toBeInTheDocument();
  });

  it('fires refreshStats when the Refresh button is clicked', async () => {
    const user = userEvent.setup();
    render(<Risk />);
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(refreshStatsMock).toHaveBeenCalledTimes(1);
  });

  it('disables the Refresh button while statsLoading', () => {
    statsState = { ...statsState, statsLoading: true };
    render(<Risk />);
    expect(
      screen.getByRole('button', { name: 'Refresh' }),
    ).toBeDisabled();
  });

  it('applies animate-spin on the Refresh icon while statsLoading', () => {
    statsState = { ...statsState, statsLoading: true };
    render(<Risk />);
    const btn = screen.getByRole('button', { name: 'Refresh' });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').toContain('animate-spin');
  });

  it('does NOT apply animate-spin on the Refresh icon when idle', () => {
    render(<Risk />);
    const btn = screen.getByRole('button', { name: 'Refresh' });
    const icon = btn.querySelector('svg');
    expect(icon?.getAttribute('class') || '').not.toContain('animate-spin');
  });

  it('renders the intro text mentioning the c4 risk CLI', () => {
    render(<Risk />);
    expect(screen.getByText('c4 risk')).toBeInTheDocument();
  });

  it('renders the Classify a command heading', () => {
    render(<Risk />);
    expect(screen.getByText('Classify a command')).toBeInTheDocument();
  });

  it('renders the command textarea with the aria-label', () => {
    render(<Risk />);
    expect(
      screen.getByLabelText('Command to classify'),
    ).toBeInTheDocument();
  });

  it('renders the command textarea with the placeholder', () => {
    render(<Risk />);
    expect(
      screen.getByPlaceholderText('e.g., rm -rf /tmp/test'),
    ).toBeInTheDocument();
  });

  it('renders the Check action button', () => {
    render(<Risk />);
    expect(
      screen.getByRole('button', { name: 'Check' }),
    ).toBeInTheDocument();
  });

  it('renders the Sandbox preview action button', () => {
    render(<Risk />);
    expect(
      screen.getByRole('button', { name: 'Sandbox preview' }),
    ).toBeInTheDocument();
  });

  it('disables the Check button when the command is empty', () => {
    render(<Risk />);
    expect(
      screen.getByRole('button', { name: 'Check' }),
    ).toBeDisabled();
  });

  it('disables the Sandbox preview button when the command is empty', () => {
    render(<Risk />);
    expect(
      screen.getByRole('button', { name: 'Sandbox preview' }),
    ).toBeDisabled();
  });

  it('enables the Check button once the command textarea has a value', async () => {
    const user = userEvent.setup();
    render(<Risk />);
    await user.type(
      screen.getByLabelText('Command to classify'),
      'echo hi',
    );
    expect(
      screen.getByRole('button', { name: 'Check' }),
    ).toBeEnabled();
  });

  it('fires runCheck when the Check button is clicked with a populated command', async () => {
    const user = userEvent.setup();
    render(<Risk />);
    await user.type(
      screen.getByLabelText('Command to classify'),
      'echo hi',
    );
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(runCheckMock).toHaveBeenCalledTimes(1);
  });

  it('fires runPreview when the Sandbox preview button is clicked with a populated command', async () => {
    const user = userEvent.setup();
    render(<Risk />);
    await user.type(
      screen.getByLabelText('Command to classify'),
      'echo hi',
    );
    await user.click(
      screen.getByRole('button', { name: 'Sandbox preview' }),
    );
    expect(runPreviewMock).toHaveBeenCalledTimes(1);
  });

  it('flips the Check button label to Checking… while busy', () => {
    checkState = { ...checkState, checkBusy: true };
    render(<Risk />);
    expect(
      screen.getByRole('button', { name: /Checking/ }),
    ).toBeInTheDocument();
  });

  it('flips the Sandbox preview button label to Building… while busy', () => {
    sandboxState = { ...sandboxState, sandboxBusy: true };
    render(<Risk />);
    expect(
      screen.getByRole('button', { name: /Building/ }),
    ).toBeInTheDocument();
  });

  it('disables the command textarea while checkBusy', () => {
    checkState = { ...checkState, checkBusy: true };
    render(<Risk />);
    expect(
      screen.getByLabelText('Command to classify'),
    ).toBeDisabled();
  });

  it('renders the show post-denoise text toggle', () => {
    render(<Risk />);
    expect(
      screen.getByLabelText(/show post-denoise text/),
    ).toBeInTheDocument();
  });

  it('toggles the post-denoise switch when clicked', async () => {
    const user = userEvent.setup();
    render(<Risk />);
    const cb = screen.getByLabelText(/show post-denoise text/);
    expect(cb).toHaveAttribute('aria-checked', 'false');
    await user.click(cb);
    expect(cb).toHaveAttribute('aria-checked', 'true');
  });

  it('renders the ⌘+Enter submit hint', () => {
    render(<Risk />);
    expect(
      screen.getByText(/Enter to submit/),
    ).toBeInTheDocument();
  });

  it('renders the Recent denials section heading', () => {
    render(<Risk />);
    expect(screen.getByText('Recent denials')).toBeInTheDocument();
  });

  it('renders the windowHours number input with the current value', () => {
    render(<Risk />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('24');
  });

  it('disables the windowHours input while statsLoading', () => {
    statsState = { ...statsState, statsLoading: true };
    render(<Risk />);
    expect(screen.getByRole('spinbutton')).toBeDisabled();
  });

  it('renders the check error panel when checkError is set', () => {
    checkState = { ...checkState, checkError: 'classifier blew up' };
    render(<Risk />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'classifier blew up',
    );
  });

  it('renders the sandbox error panel when sandboxError is set', () => {
    sandboxState = { ...sandboxState, sandboxError: 'no docker' };
    render(<Risk />);
    expect(screen.getByRole('alert')).toHaveTextContent('no docker');
  });

  it('renders the stats error panel when statsError is set', () => {
    statsState = { ...statsState, statsError: 'stats fail' };
    render(<Risk />);
    expect(screen.getByRole('alert')).toHaveTextContent('stats fail');
  });

  it('renders the stats loading hint when stats is null and no statsError', () => {
    render(<Risk />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it('hides the stats loading hint when statsError is set', () => {
    statsState = { ...statsState, statsError: 'stats fail', stats: null };
    render(<Risk />);
    expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();
  });

  it('renders the RiskStatsGrid marker when stats is non-null', () => {
    statsState = { ...statsState, stats: makeStats({ total: 999 }) };
    render(<Risk />);
    expect(screen.getByTestId('stats-grid')).toBeInTheDocument();
    expect(
      screen.getByTestId('stats-grid').getAttribute('data-total'),
    ).toBe('999');
  });

  it('renders the RiskSandboxPreview marker when sandbox is non-null', () => {
    sandboxState = { ...sandboxState, sandbox: makeSandbox() };
    render(<Risk />);
    expect(screen.getByTestId('sandbox-preview')).toBeInTheDocument();
    expect(
      screen.getByTestId('sandbox-preview').getAttribute('data-runtime'),
    ).toBe('docker');
  });

  it('renders the RiskCheckResult marker when checkResult is non-null', () => {
    checkState = {
      ...checkState,
      checkResult: makeCheck({ level: 'critical', suggestedAction: 'deny' }),
    };
    render(<Risk />);
    expect(screen.getByTestId('check-result')).toBeInTheDocument();
    expect(
      screen.getByTestId('check-result').getAttribute('data-level'),
    ).toBe('critical');
    expect(
      screen.getByTestId('check-result').getAttribute('data-action'),
    ).toBe('deny');
  });

  it('always mounts the RiskRuleCatalogPanel sibling', () => {
    render(<Risk />);
    expect(
      screen.getByTestId('rule-catalog-panel'),
    ).toBeInTheDocument();
  });

  it('fires setWindowHours when the windowHours input changes', async () => {
    const user = userEvent.setup();
    render(<Risk />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '48');
    expect(setWindowHoursMock).toHaveBeenCalled();
  });

  it('forwards rerender state changes through hookState mutation', () => {
    const { rerender } = render(<Risk />);
    expect(screen.queryByTestId('check-result')).not.toBeInTheDocument();
    checkState = {
      ...checkState,
      checkResult: makeCheck({ level: 'medium' }),
    };
    rerender(<Risk />);
    expect(screen.getByTestId('check-result')).toBeInTheDocument();
    expect(
      screen.getByTestId('check-result').getAttribute('data-level'),
    ).toBe('medium');
  });

  it('re-renders after the locale flips without crashing', () => {
    const { container } = render(<Risk />);
    expect(screen.getByText('Risk Inspector')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(container.firstChild).toBeInTheDocument();
  });
});
