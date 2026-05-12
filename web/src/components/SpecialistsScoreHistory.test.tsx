import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { Specialist } from './SpecialistsView';

// SpecialistsScoreHistory is pure display: parent owns the
// confirmResetId flag + resetBusy gate + reset handler. Tests
// drive the full prop space through fixture variants and assert
// the empty-history fallback, the byDomain / byStage list
// rendering with the inline ScoreBar widget (width + sign +
// sample count + value text), the lastUpdated vs noUpdates
// audit line, the reset button vs Wipe? confirm row swap, the
// resetBusy disabled gating on Cancel / Confirm, every callback
// payload (onConfirmReset(id) on Reset score, onConfirmReset(null)
// on Cancel, onScoreReset(id) on Confirm), and the locale flip.

import SpecialistsScoreHistory from './SpecialistsScoreHistory';

function makeSpec(over: Partial<Specialist> = {}): Specialist {
  return {
    id: 'arch-1',
    displayName: 'Architect',
    tier: 'design',
    domain: ['arch'],
    brain: { adapter: 'claude-code', model: 'sonnet', effort: 'max' },
    systemPrompt: '[Role: Architect]',
    triggers: { keywords: [], stages: [] },
    deliverables: [],
    tags: [],
    vetoPower: false,
    probation: 'stable',
    score: {
      byDomain: { arch: 0.5, api: -0.25 },
      byStage: { design: 0.0, review: 0.75 },
      samples: {
        'domain:arch': 8,
        'domain:api': 3,
        'stage:design': 5,
        'stage:review': 11,
      },
      lastUpdated: '2026-05-01T00:00:00Z',
    },
    ...over,
  };
}

function emptySpec(over: Partial<Specialist> = {}): Specialist {
  return makeSpec({
    score: {
      byDomain: {},
      byStage: {},
      samples: {},
      lastUpdated: null,
    },
    ...over,
  });
}

beforeEach(() => {
  setLocale('en');
});

function renderHistory(
  overrides: Partial<Parameters<typeof SpecialistsScoreHistory>[0]> = {},
) {
  const props = {
    specialist: makeSpec(),
    confirmResetId: null as string | null,
    resetBusy: false,
    onConfirmReset: vi.fn(),
    onScoreReset: vi.fn(),
    ...overrides,
  };
  const utils = render(<SpecialistsScoreHistory {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, props };
}

describe('<SpecialistsScoreHistory>', () => {
  it('renders the empty-history fallback copy when byDomain and byStage are both empty', () => {
    renderHistory({ specialist: emptySpec() });
    expect(
      screen.getByText(/No score history yet/),
    ).toBeInTheDocument();
  });

  it('does NOT render the Score history heading when there is no history', () => {
    renderHistory({ specialist: emptySpec() });
    expect(screen.queryByText('Score history')).not.toBeInTheDocument();
  });

  it('does NOT render the Reset score button when there is no history', () => {
    renderHistory({ specialist: emptySpec() });
    expect(
      screen.queryByRole('button', { name: 'Reset score' }),
    ).not.toBeInTheDocument();
  });

  it('renders the Score history heading when byDomain alone is populated', () => {
    renderHistory({
      specialist: makeSpec({
        score: {
          byDomain: { arch: 0.4 },
          byStage: {},
          samples: { 'domain:arch': 2 },
          lastUpdated: null,
        },
      }),
    });
    expect(screen.getByText('Score history')).toBeInTheDocument();
  });

  it('renders the Score history heading when byStage alone is populated', () => {
    renderHistory({
      specialist: makeSpec({
        score: {
          byDomain: {},
          byStage: { review: 0.3 },
          samples: { 'stage:review': 4 },
          lastUpdated: null,
        },
      }),
    });
    expect(screen.getByText('Score history')).toBeInTheDocument();
  });

  it('renders the lastUpdated audit line when score.lastUpdated is set', () => {
    renderHistory({
      specialist: makeSpec({
        score: {
          byDomain: { arch: 0.5 },
          byStage: {},
          samples: { 'domain:arch': 1 },
          lastUpdated: '2026-04-30T12:00:00Z',
        },
      }),
    });
    expect(
      screen.getByText(/last updated 2026-04-30T12:00:00Z/),
    ).toBeInTheDocument();
  });

  it('renders the noUpdates fallback when score.lastUpdated is null', () => {
    renderHistory({
      specialist: makeSpec({
        score: {
          byDomain: { arch: 0.5 },
          byStage: {},
          samples: { 'domain:arch': 1 },
          lastUpdated: null,
        },
      }),
    });
    expect(screen.getByText('no updates yet')).toBeInTheDocument();
  });

  it('renders the by domain section header when byDomain is populated', () => {
    renderHistory();
    expect(screen.getByText('by domain')).toBeInTheDocument();
  });

  it('does NOT render the by domain section header when byDomain is empty', () => {
    renderHistory({
      specialist: makeSpec({
        score: {
          byDomain: {},
          byStage: { design: 0.5 },
          samples: { 'stage:design': 2 },
          lastUpdated: null,
        },
      }),
    });
    expect(screen.queryByText('by domain')).not.toBeInTheDocument();
  });

  it('renders the by stage section header when byStage is populated', () => {
    renderHistory();
    expect(screen.getByText('by stage')).toBeInTheDocument();
  });

  it('does NOT render the by stage section header when byStage is empty', () => {
    renderHistory({
      specialist: makeSpec({
        score: {
          byDomain: { arch: 0.5 },
          byStage: {},
          samples: { 'domain:arch': 2 },
          lastUpdated: null,
        },
      }),
    });
    expect(screen.queryByText('by stage')).not.toBeInTheDocument();
  });

  it('renders one listitem per byDomain entry', () => {
    const { container } = renderHistory({
      specialist: makeSpec({
        score: {
          byDomain: { a: 0.1, b: 0.2, c: 0.3 },
          byStage: {},
          samples: {},
          lastUpdated: null,
        },
      }),
    });
    const ul = container.querySelector('ul');
    expect(ul).not.toBeNull();
    const items = within(ul as HTMLElement).getAllByRole('listitem');
    expect(items).toHaveLength(3);
  });

  it('renders one listitem per byStage entry', () => {
    const { container } = renderHistory({
      specialist: makeSpec({
        score: {
          byDomain: {},
          byStage: { design: 0.1, review: 0.2 },
          samples: {},
          lastUpdated: null,
        },
      }),
    });
    const ul = container.querySelector('ul');
    expect(ul).not.toBeNull();
    const items = within(ul as HTMLElement).getAllByRole('listitem');
    expect(items).toHaveLength(2);
  });

  it('renders byDomain entries sorted alphabetically by key', () => {
    const { container } = renderHistory({
      specialist: makeSpec({
        score: {
          byDomain: { zebra: 0.1, apple: 0.2, mango: 0.3 },
          byStage: {},
          samples: {},
          lastUpdated: null,
        },
      }),
    });
    const uls = container.querySelectorAll('ul');
    expect(uls.length).toBeGreaterThanOrEqual(1);
    const items = within(uls[0] as HTMLElement).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('apple');
    expect(items[1]).toHaveTextContent('mango');
    expect(items[2]).toHaveTextContent('zebra');
  });

  it('renders the per-entry score value (two-decimal-padded text)', () => {
    renderHistory({
      specialist: makeSpec({
        score: {
          byDomain: { arch: 0.4 },
          byStage: {},
          samples: { 'domain:arch': 1 },
          lastUpdated: null,
        },
      }),
    });
    expect(screen.getByText(/0\.40/)).toBeInTheDocument();
  });

  it('renders the per-entry samples count with the n= prefix', () => {
    renderHistory({
      specialist: makeSpec({
        score: {
          byDomain: { arch: 0.5 },
          byStage: {},
          samples: { 'domain:arch': 17 },
          lastUpdated: null,
        },
      }),
    });
    expect(screen.getByText('n=17')).toBeInTheDocument();
  });

  it('falls back to n=0 when there is no sample entry for a domain key', () => {
    renderHistory({
      specialist: makeSpec({
        score: {
          byDomain: { arch: 0.5 },
          byStage: {},
          samples: {},
          lastUpdated: null,
        },
      }),
    });
    expect(screen.getByText('n=0')).toBeInTheDocument();
  });

  it('renders the byDomain key as a font-mono label per row', () => {
    const { container } = renderHistory({
      specialist: makeSpec({
        score: {
          byDomain: { auth: 0.5 },
          byStage: {},
          samples: { 'domain:auth': 1 },
          lastUpdated: null,
        },
      }),
    });
    const monoLabels = container.querySelectorAll('span.font-mono');
    const hasAuth = Array.from(monoLabels).some(
      (el) => el.textContent === 'auth',
    );
    expect(hasAuth).toBe(true);
  });

  it('renders the byStage key as a font-mono label per row', () => {
    const { container } = renderHistory({
      specialist: makeSpec({
        score: {
          byDomain: {},
          byStage: { review: 0.3 },
          samples: { 'stage:review': 1 },
          lastUpdated: null,
        },
      }),
    });
    const monoLabels = container.querySelectorAll('span.font-mono');
    const hasReview = Array.from(monoLabels).some(
      (el) => el.textContent === 'review',
    );
    expect(hasReview).toBe(true);
  });

  it('renders the Reset score button when confirmResetId does not match', () => {
    renderHistory({ confirmResetId: null });
    expect(
      screen.getByRole('button', { name: 'Reset score' }),
    ).toBeInTheDocument();
  });

  it('renders the Reset score button when confirmResetId matches a different id', () => {
    renderHistory({ confirmResetId: 'other-id' });
    expect(
      screen.getByRole('button', { name: 'Reset score' }),
    ).toBeInTheDocument();
  });

  it('uses the score-reset tooltip on the Reset score button title attribute', () => {
    renderHistory();
    const btn = screen.getByRole('button', { name: 'Reset score' });
    expect(btn.getAttribute('title')).toContain('Wipe score record');
  });

  it('does NOT render the Wipe? confirm row when confirmResetId is null', () => {
    renderHistory({ confirmResetId: null });
    expect(screen.queryByText('Wipe?')).not.toBeInTheDocument();
  });

  it('renders the Wipe? confirm row when confirmResetId equals specialist.id', () => {
    renderHistory({
      specialist: makeSpec({ id: 'arch-1' }),
      confirmResetId: 'arch-1',
    });
    expect(screen.getByText('Wipe?')).toBeInTheDocument();
  });

  it('renders the Cancel button on the confirm row', () => {
    renderHistory({
      specialist: makeSpec({ id: 'arch-1' }),
      confirmResetId: 'arch-1',
    });
    expect(
      screen.getByRole('button', { name: 'Cancel' }),
    ).toBeInTheDocument();
  });

  it('renders the Confirm button on the confirm row', () => {
    renderHistory({
      specialist: makeSpec({ id: 'arch-1' }),
      confirmResetId: 'arch-1',
    });
    expect(
      screen.getByRole('button', { name: 'Confirm' }),
    ).toBeInTheDocument();
  });

  it('hides the Reset score button while the confirm row is active', () => {
    renderHistory({
      specialist: makeSpec({ id: 'arch-1' }),
      confirmResetId: 'arch-1',
    });
    expect(
      screen.queryByRole('button', { name: 'Reset score' }),
    ).not.toBeInTheDocument();
  });

  it('does NOT disable Cancel/Confirm when resetBusy is false', () => {
    renderHistory({
      specialist: makeSpec({ id: 'arch-1' }),
      confirmResetId: 'arch-1',
      resetBusy: false,
    });
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirm' })).not.toBeDisabled();
  });

  it('disables Cancel when resetBusy is true', () => {
    renderHistory({
      specialist: makeSpec({ id: 'arch-1' }),
      confirmResetId: 'arch-1',
      resetBusy: true,
    });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('disables Confirm when resetBusy is true', () => {
    renderHistory({
      specialist: makeSpec({ id: 'arch-1' }),
      confirmResetId: 'arch-1',
      resetBusy: true,
    });
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });

  it('fires onConfirmReset(specialist.id) when the Reset score button is clicked', async () => {
    const onConfirmReset = vi.fn();
    const { user } = renderHistory({
      specialist: makeSpec({ id: 'arch-7' }),
      onConfirmReset,
    });
    await user.click(screen.getByRole('button', { name: 'Reset score' }));
    expect(onConfirmReset).toHaveBeenCalledWith('arch-7');
  });

  it('fires onConfirmReset(null) when the Cancel button is clicked', async () => {
    const onConfirmReset = vi.fn();
    const { user } = renderHistory({
      specialist: makeSpec({ id: 'arch-1' }),
      confirmResetId: 'arch-1',
      onConfirmReset,
    });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirmReset).toHaveBeenCalledWith(null);
  });

  it('fires onScoreReset(specialist.id) when the Confirm button is clicked', async () => {
    const onScoreReset = vi.fn();
    const { user } = renderHistory({
      specialist: makeSpec({ id: 'arch-1' }),
      confirmResetId: 'arch-1',
      onScoreReset,
    });
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onScoreReset).toHaveBeenCalledWith('arch-1');
  });

  it('does NOT fire onConfirmReset on initial render', () => {
    const onConfirmReset = vi.fn();
    renderHistory({ onConfirmReset });
    expect(onConfirmReset).not.toHaveBeenCalled();
  });

  it('does NOT fire onScoreReset on initial render', () => {
    const onScoreReset = vi.fn();
    renderHistory({
      specialist: makeSpec({ id: 'arch-1' }),
      confirmResetId: 'arch-1',
      onScoreReset,
    });
    expect(onScoreReset).not.toHaveBeenCalled();
  });

  it('rerendering with confirmResetId flipping to the id replaces the button with the confirm row', () => {
    const { rerender, props } = renderHistory({
      specialist: makeSpec({ id: 'arch-1' }),
      confirmResetId: null,
    });
    expect(
      screen.getByRole('button', { name: 'Reset score' }),
    ).toBeInTheDocument();
    rerender(
      <SpecialistsScoreHistory {...props} confirmResetId="arch-1" />,
    );
    expect(screen.getByText('Wipe?')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reset score' }),
    ).not.toBeInTheDocument();
  });

  it('rerendering with new score data replaces the listed entries', () => {
    const { rerender, props } = renderHistory({
      specialist: makeSpec({
        score: {
          byDomain: { aaa: 0.1 },
          byStage: {},
          samples: { 'domain:aaa': 1 },
          lastUpdated: null,
        },
      }),
    });
    expect(screen.getByText('aaa')).toBeInTheDocument();
    rerender(
      <SpecialistsScoreHistory
        {...props}
        specialist={makeSpec({
          score: {
            byDomain: { bbb: 0.2 },
            byStage: {},
            samples: { 'domain:bbb': 1 },
            lastUpdated: null,
          },
        })}
      />,
    );
    expect(screen.getByText('bbb')).toBeInTheDocument();
    expect(screen.queryByText('aaa')).not.toBeInTheDocument();
  });

  it('rerendering from history to empty drops the wrapper', () => {
    const { rerender, props } = renderHistory();
    expect(screen.getByText('Score history')).toBeInTheDocument();
    rerender(
      <SpecialistsScoreHistory {...props} specialist={emptySpec()} />,
    );
    expect(screen.queryByText('Score history')).not.toBeInTheDocument();
    expect(screen.getByText(/No score history yet/)).toBeInTheDocument();
  });

  it('re-renders after locale flip (useLocale subscription)', () => {
    renderHistory();
    expect(screen.getByText('Score history')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    // After locale flip the English literal is gone (ko bundle
    // overrides the heading copy); the component re-rendered.
    expect(screen.queryByText('Score history')).not.toBeInTheDocument();
  });
});
