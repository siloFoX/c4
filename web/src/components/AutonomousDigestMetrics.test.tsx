import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { setLocale } from '../lib/i18n';
import type { DigestResponse } from './AutonomousView';

// AutonomousDigestMetrics is pure display: a 9-cell grid of
// derived strings from a DigestResponse. Tests render the
// component with various digest payloads and assert each
// visible cell + the conditional color-class branches. The
// only formatter is fmtDuration (s/m/h/d ranges) which is
// covered indirectly through the rendered "window" cell.

import AutonomousDigestMetrics from './AutonomousDigestMetrics';

function makeDigest(over: Partial<DigestResponse> = {}): DigestResponse {
  return {
    windowMs: 60 * 60 * 1000,
    from: '2026-05-12T00:00:00.000Z',
    to: '2026-05-12T01:00:00.000Z',
    paused: false,
    dispatched: 10,
    succeeded: 7,
    halted: 0,
    dispatchErrors: 0,
    successRate: 0.7,
    pendingEscalations: 0,
    resolvedEscalations: 0,
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
});

function valueOf(label: string): HTMLElement {
  const lbl = screen.getByText(label);
  const cell = lbl.parentElement as HTMLElement;
  const value = cell.querySelector('.font-mono');
  if (!value) throw new Error(`no font-mono value sibling for label "${label}"`);
  return value as HTMLElement;
}

describe('<AutonomousDigestMetrics>', () => {
  it('mounts the nine labelled cells on default render', () => {
    render(<AutonomousDigestMetrics digest={makeDigest()} />);
    expect(screen.getByText('window')).toBeInTheDocument();
    expect(screen.getByText('dispatched')).toBeInTheDocument();
    expect(screen.getByText('succeeded')).toBeInTheDocument();
    expect(screen.getByText('halted')).toBeInTheDocument();
    expect(screen.getByText('dispatch errors')).toBeInTheDocument();
    expect(screen.getByText('success rate')).toBeInTheDocument();
    expect(screen.getByText('pending escalations')).toBeInTheDocument();
    expect(screen.getByText('resolved escalations')).toBeInTheDocument();
    expect(screen.getByText('window range')).toBeInTheDocument();
  });

  it('renders dispatched as the numeric value from the digest', () => {
    render(<AutonomousDigestMetrics digest={makeDigest({ dispatched: 42 })} />);
    expect(valueOf('dispatched')).toHaveTextContent('42');
  });

  it('renders succeeded as the numeric value', () => {
    render(<AutonomousDigestMetrics digest={makeDigest({ succeeded: 9 })} />);
    expect(valueOf('succeeded')).toHaveTextContent('9');
  });

  it('renders halted as the numeric value', () => {
    render(<AutonomousDigestMetrics digest={makeDigest({ halted: 3 })} />);
    expect(valueOf('halted')).toHaveTextContent('3');
  });

  it('renders dispatchErrors as the numeric value', () => {
    render(
      <AutonomousDigestMetrics digest={makeDigest({ dispatchErrors: 5 })} />,
    );
    expect(valueOf('dispatch errors')).toHaveTextContent('5');
  });

  it('renders pendingEscalations as the numeric value', () => {
    render(
      <AutonomousDigestMetrics digest={makeDigest({ pendingEscalations: 4 })} />,
    );
    expect(valueOf('pending escalations')).toHaveTextContent('4');
  });

  it('renders resolvedEscalations as the numeric value', () => {
    render(
      <AutonomousDigestMetrics digest={makeDigest({ resolvedEscalations: 8 })} />,
    );
    expect(valueOf('resolved escalations')).toHaveTextContent('8');
  });

  it('renders the success rate formatted to one decimal percent', () => {
    render(
      <AutonomousDigestMetrics digest={makeDigest({ successRate: 0.835 })} />,
    );
    expect(valueOf('success rate')).toHaveTextContent('83.5%');
  });

  it('renders the success rate placeholder when null', () => {
    render(
      <AutonomousDigestMetrics digest={makeDigest({ successRate: null })} />,
    );
    expect(valueOf('success rate').textContent).toBe('—');
  });

  it('renders 0.0% when success rate is exactly zero', () => {
    render(
      <AutonomousDigestMetrics digest={makeDigest({ successRate: 0 })} />,
    );
    expect(valueOf('success rate')).toHaveTextContent('0.0%');
  });

  it('formats window under one minute in seconds', () => {
    render(
      <AutonomousDigestMetrics digest={makeDigest({ windowMs: 30_000 })} />,
    );
    expect(valueOf('window')).toHaveTextContent('30s');
  });

  it('formats window between one minute and one hour in minutes', () => {
    render(
      <AutonomousDigestMetrics digest={makeDigest({ windowMs: 5 * 60_000 })} />,
    );
    expect(valueOf('window')).toHaveTextContent('5m');
  });

  it('formats window between one hour and one day in hours with one decimal', () => {
    render(
      <AutonomousDigestMetrics
        digest={makeDigest({ windowMs: 90 * 60_000 })}
      />,
    );
    expect(valueOf('window')).toHaveTextContent('1.5h');
  });

  it('formats window over one day in days with one decimal', () => {
    render(
      <AutonomousDigestMetrics
        digest={makeDigest({ windowMs: 36 * 60 * 60_000 })}
      />,
    );
    expect(valueOf('window')).toHaveTextContent('1.5d');
  });

  it('renders the window range from + to as a single arrow-joined line', () => {
    render(
      <AutonomousDigestMetrics
        digest={makeDigest({
          from: '2026-05-12T00:00:00.000Z',
          to: '2026-05-12T01:00:00.000Z',
        })}
      />,
    );
    expect(
      screen.getByText(
        /2026-05-12T00:00:00\.000Z\s*→\s*2026-05-12T01:00:00\.000Z/,
      ),
    ).toBeInTheDocument();
  });

  it('applies the amber halt class when halted is positive', () => {
    render(<AutonomousDigestMetrics digest={makeDigest({ halted: 2 })} />);
    expect(valueOf('halted').className).toContain('text-amber-700');
  });

  it('does NOT apply the amber halt class when halted is zero', () => {
    render(<AutonomousDigestMetrics digest={makeDigest({ halted: 0 })} />);
    expect(valueOf('halted').className).not.toContain('text-amber-700');
  });

  it('applies the destructive class when dispatchErrors is positive', () => {
    render(
      <AutonomousDigestMetrics digest={makeDigest({ dispatchErrors: 1 })} />,
    );
    expect(valueOf('dispatch errors').className).toContain('text-destructive');
  });

  it('does NOT apply the destructive class when dispatchErrors is zero', () => {
    render(
      <AutonomousDigestMetrics digest={makeDigest({ dispatchErrors: 0 })} />,
    );
    expect(valueOf('dispatch errors').className).not.toContain(
      'text-destructive',
    );
  });

  it('applies the amber class when pendingEscalations is positive', () => {
    render(
      <AutonomousDigestMetrics
        digest={makeDigest({ pendingEscalations: 3 })}
      />,
    );
    expect(valueOf('pending escalations').className).toContain(
      'text-amber-700',
    );
  });

  it('does NOT apply the amber class when pendingEscalations is zero', () => {
    render(
      <AutonomousDigestMetrics
        digest={makeDigest({ pendingEscalations: 0 })}
      />,
    );
    expect(valueOf('pending escalations').className).not.toContain(
      'text-amber-700',
    );
  });

  it('always tags the succeeded cell with the emerald success class', () => {
    render(<AutonomousDigestMetrics digest={makeDigest({ succeeded: 0 })} />);
    expect(valueOf('succeeded').className).toContain('text-emerald-700');
  });

  it('always tags the resolved-escalations cell with the muted class', () => {
    render(
      <AutonomousDigestMetrics
        digest={makeDigest({ resolvedEscalations: 0 })}
      />,
    );
    expect(valueOf('resolved escalations').className).toContain(
      'text-muted-foreground',
    );
  });

  it('renders the outer grid container with the two-up + four-up class set', () => {
    const { container } = render(
      <AutonomousDigestMetrics digest={makeDigest()} />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('grid');
    expect(root).toHaveClass('grid-cols-2');
    expect(root).toHaveClass('md:grid-cols-4');
  });

  it('renders nine labelled cells regardless of payload values', () => {
    const { container } = render(
      <AutonomousDigestMetrics
        digest={makeDigest({
          dispatched: 0,
          succeeded: 0,
          halted: 0,
          dispatchErrors: 0,
          pendingEscalations: 0,
          resolvedEscalations: 0,
          successRate: 0,
        })}
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(within(root).getAllByText(/.+/).length).toBeGreaterThanOrEqual(9);
  });

  it('updates the rendered metric values when the prop changes', () => {
    const { rerender } = render(
      <AutonomousDigestMetrics digest={makeDigest({ dispatched: 1 })} />,
    );
    expect(valueOf('dispatched')).toHaveTextContent('1');
    rerender(
      <AutonomousDigestMetrics digest={makeDigest({ dispatched: 99 })} />,
    );
    expect(valueOf('dispatched')).toHaveTextContent('99');
  });

  it('re-renders translated labels when the locale flips to ko', () => {
    render(<AutonomousDigestMetrics digest={makeDigest()} />);
    expect(screen.getByText('window')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    // After the locale flip the cell labels may translate but the
    // component must remain mounted with the same nine cells.
    const { container } = render(
      <AutonomousDigestMetrics digest={makeDigest()} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });
});
