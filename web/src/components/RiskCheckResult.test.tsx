import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { setLocale } from '../lib/i18n';
import type { CheckResponse } from '../pages/Risk';
import RiskCheckResult from './RiskCheckResult';

// (v1.11.107) RiskCheckResult is pure display over a CheckResponse
// from the classifier endpoint. The parent owns the result value and
// all fetch plumbing -- the component only needs to render the
// level/action badges + threshold caption + the conditional
// reasons / decoded / inspectedSource / intent rollups. Each test
// drives one branch of the result shape; no module mocks needed.

function makeResult(over: Partial<CheckResponse> = {}): CheckResponse {
  return {
    level: 'low',
    suggestedAction: 'allow',
    reasons: [],
    decoded: null,
    denyForced: false,
    wouldDeny: false,
    autoDenyLevel: 'high',
    enforcementEnabled: true,
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
});

describe('<RiskCheckResult>', () => {
  it('renders the level value inside an uppercase badge', () => {
    render(<RiskCheckResult result={makeResult({ level: 'critical' })} />);
    const badge = screen.getByText('critical');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/uppercase/);
  });

  it('renders the suggestedAction value inside an uppercase badge', () => {
    render(<RiskCheckResult result={makeResult({ suggestedAction: 'deny' })} />);
    const badge = screen.getByText('deny');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/uppercase/);
  });

  it('hides the "would deny" badge when wouldDeny=false', () => {
    render(<RiskCheckResult result={makeResult({ wouldDeny: false })} />);
    expect(screen.queryByText('would deny')).not.toBeInTheDocument();
  });

  it('renders the "would deny" badge when wouldDeny=true', () => {
    render(<RiskCheckResult result={makeResult({ wouldDeny: true })} />);
    expect(screen.getByText('would deny')).toBeInTheDocument();
  });

  it('hides the "denyList" badge when denyForced=false', () => {
    render(<RiskCheckResult result={makeResult({ denyForced: false })} />);
    expect(screen.queryByText('denyList')).not.toBeInTheDocument();
  });

  it('renders the "denyList" badge when denyForced=true', () => {
    render(<RiskCheckResult result={makeResult({ denyForced: true })} />);
    expect(screen.getByText('denyList')).toBeInTheDocument();
  });

  it('renders the threshold caption with autoDenyLevel interpolated', () => {
    render(
      <RiskCheckResult
        result={makeResult({ autoDenyLevel: 'medium', enforcementEnabled: true })}
      />,
    );
    expect(screen.getByText('threshold: medium')).toBeInTheDocument();
  });

  it('appends the "enforcement OFF" suffix when enforcementEnabled=false', () => {
    render(
      <RiskCheckResult
        result={makeResult({ autoDenyLevel: 'high', enforcementEnabled: false })}
      />,
    );
    expect(
      screen.getByText(/threshold: high.*enforcement OFF/),
    ).toBeInTheDocument();
  });

  it('hides the reasons block when reasons=[]', () => {
    render(<RiskCheckResult result={makeResult({ reasons: [] })} />);
    expect(screen.queryByText(/^Reasons \(/)).not.toBeInTheDocument();
  });

  it('renders the reasons header with the count + per-row code and label', () => {
    render(
      <RiskCheckResult
        result={makeResult({
          reasons: [
            { code: 'rm-rf', label: 'recursive remove' },
            { code: 'sudo', label: 'privileged escalation' },
          ],
        })}
      />,
    );
    expect(screen.getByText('Reasons (2)')).toBeInTheDocument();
    expect(screen.getByText('rm-rf')).toBeInTheDocument();
    expect(screen.getByText(/recursive remove/)).toBeInTheDocument();
    expect(screen.getByText('sudo')).toBeInTheDocument();
    expect(screen.getByText(/privileged escalation/)).toBeInTheDocument();
  });

  it('renders the snippet span for a reason when snippet is set', () => {
    render(
      <RiskCheckResult
        result={makeResult({
          reasons: [{ code: 'rm-rf', label: 'recursive remove', snippet: 'rm -rf /tmp' }],
        })}
      />,
    );
    expect(screen.getByText(/rm -rf \/tmp/)).toBeInTheDocument();
  });

  it('hides the decoded block when decoded=null', () => {
    render(<RiskCheckResult result={makeResult({ decoded: null })} />);
    expect(screen.queryByText('Decoded (post-denoise)')).not.toBeInTheDocument();
  });

  it('renders the decoded block with header + pre when decoded is set', () => {
    const { container } = render(
      <RiskCheckResult result={makeResult({ decoded: 'rm -rf /tmp' })} />,
    );
    expect(screen.getByText('Decoded (post-denoise)')).toBeInTheDocument();
    const pres = container.querySelectorAll('pre');
    expect(pres.length).toBeGreaterThanOrEqual(1);
    expect(pres[0].textContent).toBe('rm -rf /tmp');
  });

  it('hides the inspectedSource block when inspectedSource is omitted', () => {
    render(<RiskCheckResult result={makeResult({ inspectedSource: undefined })} />);
    expect(
      screen.queryByText('Inspected source (regex input)'),
    ).not.toBeInTheDocument();
  });

  it('renders the inspectedSource block when inspectedSource is set', () => {
    render(
      <RiskCheckResult
        result={makeResult({ inspectedSource: 'rm -rf $TMP' })}
      />,
    );
    expect(
      screen.getByText('Inspected source (regex input)'),
    ).toBeInTheDocument();
    expect(screen.getByText('rm -rf $TMP')).toBeInTheDocument();
  });

  it('hides the static-intent block when intent is omitted', () => {
    render(<RiskCheckResult result={makeResult({ intent: undefined })} />);
    expect(screen.queryByText('Static intent')).not.toBeInTheDocument();
  });

  it('hides the static-intent block when intent.empty=true', () => {
    render(
      <RiskCheckResult result={makeResult({ intent: { empty: true } })} />,
    );
    expect(screen.queryByText('Static intent')).not.toBeInTheDocument();
  });

  it('renders the privileged badge inside the static-intent block', () => {
    render(
      <RiskCheckResult result={makeResult({ intent: { privileged: true } })} />,
    );
    expect(screen.getByText('Static intent')).toBeInTheDocument();
    expect(screen.getByText('privileged')).toBeInTheDocument();
  });

  it('renders the writes row with file codes when filesWritten is non-empty', () => {
    render(
      <RiskCheckResult
        result={makeResult({
          intent: { filesWritten: ['/etc/hosts', '/tmp/out'] },
        })}
      />,
    );
    expect(screen.getByText('writes:')).toBeInTheDocument();
    expect(screen.getByText('/etc/hosts')).toBeInTheDocument();
    expect(screen.getByText('/tmp/out')).toBeInTheDocument();
  });

  it('renders the reads / network / destructive rows when their lists are non-empty', () => {
    render(
      <RiskCheckResult
        result={makeResult({
          intent: {
            filesRead: ['/etc/passwd'],
            networkPeers: ['1.1.1.1'],
            destructiveVerbs: ['rm', 'unlink'],
          },
        })}
      />,
    );
    expect(screen.getByText('reads:')).toBeInTheDocument();
    expect(screen.getByText('/etc/passwd')).toBeInTheDocument();
    expect(screen.getByText('network:')).toBeInTheDocument();
    expect(screen.getByText('1.1.1.1')).toBeInTheDocument();
    expect(screen.getByText('destructive:')).toBeInTheDocument();
    expect(screen.getByText('rm')).toBeInTheDocument();
    expect(screen.getByText('unlink')).toBeInTheDocument();
  });

  it('drops the English "Static intent" header when the locale flips to ko', () => {
    render(
      <RiskCheckResult result={makeResult({ intent: { privileged: true } })} />,
    );
    expect(screen.getByText('Static intent')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Static intent')).not.toBeInTheDocument();
  });
});
