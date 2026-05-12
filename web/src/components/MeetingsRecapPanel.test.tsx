import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { RecapResponse } from './MeetingsRecapPanel';

// MeetingsRecapPanel is a pure display component — the parent
// fetches the recap payload and this just renders. The hook
// stub here is only useToggle (the collapsible state) and we
// keep it real so the panel test exercises the actual click /
// aria-expanded transition. Recap data fixtures cover:
//   - null gating
//   - the no-firstTurn gating (every stage's firstTurn is null)
//   - the loaded path
//   - the escalation list path
//   - the deep "specialistId fallback to ?" and turn singular /
//     plural pluralization

import MeetingsRecapPanel from './MeetingsRecapPanel';

const RECAP_BASIC: RecapResponse = {
  id: 'mtg-1',
  status: 'in-progress',
  stages: [
    {
      stage: 'discuss',
      round: 1,
      consensus: null,
      turnCount: 3,
      firstTurn: {
        specialistId: 'sec-auditor',
        round: 1,
        text: 'rotate the staging secret on Monday',
        ts: '2026-05-01T00:00:00Z',
      },
    },
    {
      stage: 'consensus',
      round: 2,
      consensus: null,
      turnCount: 1,
      firstTurn: {
        specialistId: 'arch-1',
        round: 2,
        text: 'lock down the cache key prefix',
        ts: null,
      },
    },
  ],
  actions: { count: 0, byType: { decision: 0, action: 0, todo: 0, blocker: 0 } },
  escalations: [],
};

const RECAP_WITH_ESCALATIONS: RecapResponse = {
  id: 'mtg-1',
  status: 'failed',
  stages: [
    {
      stage: 'discuss',
      round: 1,
      consensus: null,
      turnCount: 1,
      firstTurn: {
        specialistId: 'sec-1',
        round: 1,
        text: 'opening turn',
        ts: null,
      },
    },
  ],
  actions: { count: 0, byType: { decision: 0, action: 0, todo: 0, blocker: 0 } },
  escalations: [
    { ts: '2026-05-01T01:00:00Z', reason: 'consensus stalled' },
    { ts: '2026-05-01T02:00:00Z', reason: 'round cap reached', terminal: true },
  ],
};

const RECAP_NO_FIRST_TURN: RecapResponse = {
  id: 'mtg-2',
  status: 'pending',
  stages: [
    {
      stage: 'discuss',
      round: 1,
      consensus: null,
      turnCount: 0,
      firstTurn: null,
    },
  ],
  actions: { count: 0, byType: { decision: 0, action: 0, todo: 0, blocker: 0 } },
  escalations: [],
};

const RECAP_NULL_SPECIALIST: RecapResponse = {
  id: 'mtg-3',
  status: 'in-progress',
  stages: [
    {
      stage: 'discuss',
      round: 1,
      consensus: null,
      turnCount: 1,
      firstTurn: {
        specialistId: null,
        round: 1,
        text: 'speaker unknown',
        ts: null,
      },
    },
  ],
  actions: { count: 0, byType: { decision: 0, action: 0, todo: 0, blocker: 0 } },
  escalations: [],
};

const RECAP_PLURAL_TURNS: RecapResponse = {
  id: 'mtg-4',
  status: 'in-progress',
  stages: [
    {
      stage: 'discuss',
      round: 1,
      consensus: null,
      turnCount: 1,
      firstTurn: {
        specialistId: 'sec-1',
        round: 1,
        text: 'singular',
        ts: null,
      },
    },
    {
      stage: 'consensus',
      round: 2,
      consensus: null,
      turnCount: 5,
      firstTurn: {
        specialistId: 'sec-1',
        round: 2,
        text: 'plural',
        ts: null,
      },
    },
  ],
  actions: { count: 0, byType: { decision: 0, action: 0, todo: 0, blocker: 0 } },
  escalations: [],
};

beforeEach(() => {
  setLocale('en');
});

async function expand() {
  const user = userEvent.setup();
  const heading = screen.getByRole('button', { name: /Recap/i });
  await user.click(heading);
  return user;
}

describe('<MeetingsRecapPanel>', () => {
  it('renders nothing when recap is null', () => {
    const { container } = render(<MeetingsRecapPanel recap={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no stage has a firstTurn', () => {
    const { container } = render(
      <MeetingsRecapPanel recap={RECAP_NO_FIRST_TURN} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the Recap heading button when at least one stage has a firstTurn', () => {
    render(<MeetingsRecapPanel recap={RECAP_BASIC} />);
    expect(
      screen.getByRole('button', { name: /Recap/i }),
    ).toBeInTheDocument();
  });

  it('starts collapsed with aria-expanded=false on the heading', () => {
    render(<MeetingsRecapPanel recap={RECAP_BASIC} />);
    expect(
      screen.getByRole('button', { name: /Recap/i }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('does NOT render any stage turn text while collapsed', () => {
    render(<MeetingsRecapPanel recap={RECAP_BASIC} />);
    expect(
      screen.queryByText('rotate the staging secret on Monday'),
    ).not.toBeInTheDocument();
  });

  it('flips aria-expanded to true after the heading is clicked', async () => {
    render(<MeetingsRecapPanel recap={RECAP_BASIC} />);
    await expand();
    expect(
      screen.getByRole('button', { name: /Recap/i }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('reveals the first stage firstTurn body once expanded', async () => {
    render(<MeetingsRecapPanel recap={RECAP_BASIC} />);
    await expand();
    expect(
      screen.getByText('rotate the staging secret on Monday'),
    ).toBeInTheDocument();
  });

  it('reveals every stage firstTurn body once expanded', async () => {
    render(<MeetingsRecapPanel recap={RECAP_BASIC} />);
    await expand();
    expect(
      screen.getByText('rotate the staging secret on Monday'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('lock down the cache key prefix'),
    ).toBeInTheDocument();
  });

  it('renders the specialistId for each stage', async () => {
    render(<MeetingsRecapPanel recap={RECAP_BASIC} />);
    await expand();
    expect(screen.getByText('sec-auditor')).toBeInTheDocument();
    expect(screen.getByText('arch-1')).toBeInTheDocument();
  });

  it('falls back to "?" when the firstTurn specialistId is null', async () => {
    render(<MeetingsRecapPanel recap={RECAP_NULL_SPECIALIST} />);
    await expand();
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('uses the singular "turn" suffix when turnCount=1', async () => {
    render(<MeetingsRecapPanel recap={RECAP_PLURAL_TURNS} />);
    await expand();
    expect(screen.getByText(/r1 . 1 turn$/)).toBeInTheDocument();
  });

  it('uses the plural "turns" suffix when turnCount > 1', async () => {
    render(<MeetingsRecapPanel recap={RECAP_PLURAL_TURNS} />);
    await expand();
    expect(screen.getByText(/r2 . 5 turns$/)).toBeInTheDocument();
  });

  it('does NOT render the escalations section when escalations is empty', async () => {
    render(<MeetingsRecapPanel recap={RECAP_BASIC} />);
    await expand();
    expect(screen.queryByText(/Escalations \(/)).not.toBeInTheDocument();
  });

  it('renders the escalations section with the i18n count when escalations is non-empty', async () => {
    render(<MeetingsRecapPanel recap={RECAP_WITH_ESCALATIONS} />);
    await expand();
    expect(screen.getByText('Escalations (2)')).toBeInTheDocument();
  });

  it('renders each escalation reason in the list', async () => {
    render(<MeetingsRecapPanel recap={RECAP_WITH_ESCALATIONS} />);
    await expand();
    expect(screen.getByText(/consensus stalled/)).toBeInTheDocument();
    expect(screen.getByText(/round cap reached/)).toBeInTheDocument();
  });

  it('marks the terminal escalation with the " (terminal)" suffix', async () => {
    render(<MeetingsRecapPanel recap={RECAP_WITH_ESCALATIONS} />);
    await expand();
    expect(
      screen.getByText(/round cap reached \(terminal\)/),
    ).toBeInTheDocument();
  });

  it('omits the (terminal) suffix on non-terminal escalations', async () => {
    render(<MeetingsRecapPanel recap={RECAP_WITH_ESCALATIONS} />);
    await expand();
    expect(
      screen.getByText(/consensus stalled/).textContent,
    ).not.toContain('(terminal)');
  });

  it('collapses again on a second heading click', async () => {
    render(<MeetingsRecapPanel recap={RECAP_BASIC} />);
    const user = await expand();
    expect(
      screen.getByText('rotate the staging secret on Monday'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Recap/i }));
    expect(
      screen.queryByText('rotate the staging secret on Monday'),
    ).not.toBeInTheDocument();
  });

  it('switches the chevron glyph from collapsed to expanded', async () => {
    render(<MeetingsRecapPanel recap={RECAP_BASIC} />);
    const heading = screen.getByRole('button', { name: /Recap/i });
    expect(heading.textContent).toContain(String.fromCharCode(0x25b8));
    await expand();
    expect(heading.textContent).toContain(String.fromCharCode(0x25be));
  });

  it('renders the "first turn per stage" hint text in the heading', () => {
    render(<MeetingsRecapPanel recap={RECAP_BASIC} />);
    expect(
      screen.getByText(/first turn per stage/i),
    ).toBeInTheDocument();
  });

  it('skips stages with a null firstTurn while still rendering the others', async () => {
    const mixed: RecapResponse = {
      id: 'mtg-x',
      status: 'in-progress',
      stages: [
        ...RECAP_BASIC.stages,
        {
          stage: 'verify',
          round: 3,
          consensus: null,
          turnCount: 0,
          firstTurn: null,
        },
      ],
      actions: RECAP_BASIC.actions,
      escalations: [],
    };
    render(<MeetingsRecapPanel recap={mixed} />);
    await expand();
    expect(screen.queryByText(/\[verify\]/)).not.toBeInTheDocument();
    expect(
      screen.getByText('rotate the staging secret on Monday'),
    ).toBeInTheDocument();
  });

  it('rerendering with the same props does not duplicate the heading', () => {
    const { rerender } = render(<MeetingsRecapPanel recap={RECAP_BASIC} />);
    rerender(<MeetingsRecapPanel recap={RECAP_BASIC} />);
    expect(
      screen.getAllByRole('button', { name: /Recap/i }),
    ).toHaveLength(1);
  });

  it('preserves the expanded state across rerenders with the same recap', async () => {
    const { rerender } = render(<MeetingsRecapPanel recap={RECAP_BASIC} />);
    await expand();
    rerender(<MeetingsRecapPanel recap={RECAP_BASIC} />);
    expect(
      screen.getByText('rotate the staging secret on Monday'),
    ).toBeInTheDocument();
  });

  it('re-renders translated copy when the locale flips to ko', () => {
    render(<MeetingsRecapPanel recap={RECAP_BASIC} />);
    expect(screen.getByText('Recap')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Recap')).not.toBeInTheDocument();
  });
});
