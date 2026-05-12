import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { setLocale } from '../lib/i18n';
import MeetingsStagesView, { type StageView } from './MeetingsStagesView';

// MeetingsStagesView is a pure-display per-stage card list. Parent
// owns both the `stages` array and the parallel `transcripts`
// matrix (one Turn[] per stage, by index). Tests drive the full
// prop union directly: empty stages, single + multi-stage rosters,
// the consensus reached / pending toggle, the accepts / objects /
// missing tally, the roster comma-join, the per-turn rendering,
// the empty-turns fallback, the transcripts-shorter-than-stages
// branch, the rerender stability contracts, and the locale flip.

interface Turn {
  stage: string;
  round: number;
  specialistId: string;
  text: string;
  ts: string;
}

function makeStage(over: Partial<StageView> = {}): StageView {
  return {
    stage: 'design',
    round: 1,
    specialists: [
      { id: 'alice', displayName: 'Alice' },
      { id: 'bob', displayName: 'Bob' },
    ],
    consensus: {
      mode: 'majority',
      accepts: ['alice'],
      objects: [],
      missing: ['bob'],
      reached: false,
      round: 1,
    },
    ...over,
  };
}

function makeTurn(over: Partial<Turn> = {}): Turn {
  return {
    stage: 'design',
    round: 1,
    specialistId: 'alice',
    text: 'looks good',
    ts: '2026-05-01T00:00:00Z',
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
});

describe('<MeetingsStagesView>', () => {
  it('renders an empty wrapper when stages array is empty', () => {
    const { container } = render(
      <MeetingsStagesView stages={[]} transcripts={[]} />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.children.length).toBe(0);
  });

  it('renders one card per stage entry', () => {
    const { container } = render(
      <MeetingsStagesView
        stages={[
          makeStage({ stage: 'design' }),
          makeStage({ stage: 'review' }),
          makeStage({ stage: 'ship' }),
        ]}
        transcripts={[[], [], []]}
      />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.children.length).toBe(3);
  });

  it('renders the stage name in bracket notation in the heading', () => {
    render(
      <MeetingsStagesView
        stages={[makeStage({ stage: 'design' })]}
        transcripts={[[]]}
      />,
    );
    expect(screen.getByText('[design]')).toBeInTheDocument();
  });

  it('renders the consensus mode and "pending" status when not reached', () => {
    render(
      <MeetingsStagesView
        stages={[
          makeStage({
            consensus: {
              mode: 'majority',
              accepts: [],
              objects: [],
              missing: [],
              reached: false,
              round: 1,
            },
          }),
        ]}
        transcripts={[[]]}
      />,
    );
    expect(
      screen.getByText(/consensus=majority · pending/),
    ).toBeInTheDocument();
  });

  it('renders the consensus mode and "reached" status when reached=true', () => {
    render(
      <MeetingsStagesView
        stages={[
          makeStage({
            consensus: {
              mode: 'unanimous',
              accepts: ['alice', 'bob'],
              objects: [],
              missing: [],
              reached: true,
              round: 2,
            },
          }),
        ]}
        transcripts={[[]]}
      />,
    );
    expect(
      screen.getByText(/consensus=unanimous · reached/),
    ).toBeInTheDocument();
  });

  it('renders the accepts / objects / missing tally counts', () => {
    render(
      <MeetingsStagesView
        stages={[
          makeStage({
            consensus: {
              mode: 'majority',
              accepts: ['a', 'b', 'c'],
              objects: [
                { id: 'd', reason: 'no' },
                { id: 'e', reason: null },
              ],
              missing: ['f'],
              reached: false,
              round: 1,
            },
          }),
        ]}
        transcripts={[[]]}
      />,
    );
    expect(
      screen.getByText(/accepts=3 \/ objects=2 \/ missing=1/),
    ).toBeInTheDocument();
  });

  it('renders zero counts when accepts / objects / missing are empty', () => {
    render(
      <MeetingsStagesView
        stages={[
          makeStage({
            consensus: {
              mode: 'majority',
              accepts: [],
              objects: [],
              missing: [],
              reached: false,
              round: 1,
            },
          }),
        ]}
        transcripts={[[]]}
      />,
    );
    expect(
      screen.getByText(/accepts=0 \/ objects=0 \/ missing=0/),
    ).toBeInTheDocument();
  });

  it('renders the roster as a comma-joined list of specialist ids', () => {
    render(
      <MeetingsStagesView
        stages={[
          makeStage({
            specialists: [
              { id: 'alice', displayName: 'Alice' },
              { id: 'bob', displayName: 'Bob' },
              { id: 'carol', displayName: 'Carol' },
            ],
          }),
        ]}
        transcripts={[[]]}
      />,
    );
    expect(
      screen.getByText('roster: alice, bob, carol'),
    ).toBeInTheDocument();
  });

  it('renders an empty roster suffix when specialists is []', () => {
    render(
      <MeetingsStagesView
        stages={[makeStage({ specialists: [] })]}
        transcripts={[[]]}
      />,
    );
    expect(screen.getByText(/roster:\s*$/)).toBeInTheDocument();
  });

  it('uses specialist id (not displayName) for the roster join', () => {
    render(
      <MeetingsStagesView
        stages={[
          makeStage({
            specialists: [
              { id: 'a-id', displayName: 'A Display' },
              { id: 'b-id', displayName: 'B Display' },
            ],
          }),
        ]}
        transcripts={[[]]}
      />,
    );
    expect(screen.getByText('roster: a-id, b-id')).toBeInTheDocument();
    expect(screen.queryByText(/A Display/)).not.toBeInTheDocument();
  });

  it('renders the "(no turns yet)" placeholder when transcripts[idx] is empty', () => {
    render(
      <MeetingsStagesView
        stages={[makeStage()]}
        transcripts={[[]]}
      />,
    );
    expect(screen.getByText('(no turns yet)')).toBeInTheDocument();
  });

  it('renders the "(no turns yet)" placeholder when transcripts is shorter than stages', () => {
    render(
      <MeetingsStagesView
        stages={[
          makeStage({ stage: 'design' }),
          makeStage({ stage: 'review' }),
        ]}
        transcripts={[[makeTurn()]]}
      />,
    );
    // The second stage has no transcript slot — falls through to the
    // `[]` default and renders the placeholder.
    expect(screen.getByText('(no turns yet)')).toBeInTheDocument();
  });

  it('does NOT render the "(no turns yet)" placeholder when turns exist', () => {
    render(
      <MeetingsStagesView
        stages={[makeStage()]}
        transcripts={[[makeTurn()]]}
      />,
    );
    expect(screen.queryByText('(no turns yet)')).not.toBeInTheDocument();
  });

  it('renders one list item per turn in the transcript', () => {
    const { container } = render(
      <MeetingsStagesView
        stages={[makeStage()]}
        transcripts={[[
          makeTurn({ specialistId: 'a', text: 'first', round: 1 }),
          makeTurn({ specialistId: 'b', text: 'second', round: 1 }),
          makeTurn({ specialistId: 'c', text: 'third', round: 2 }),
        ]]}
      />,
    );
    const ul = container.querySelector('ul');
    expect(ul).not.toBeNull();
    const items = within(ul as HTMLElement).getAllByRole('listitem');
    expect(items).toHaveLength(3);
  });

  it('renders the turn round, specialist id, and text in each turn item', () => {
    render(
      <MeetingsStagesView
        stages={[makeStage()]}
        transcripts={[[
          makeTurn({
            round: 2,
            specialistId: 'carol',
            text: 'I propose option B',
          }),
        ]]}
      />,
    );
    expect(screen.getByText('[r2]')).toBeInTheDocument();
    expect(screen.getByText('carol:')).toBeInTheDocument();
    expect(screen.getByText('I propose option B')).toBeInTheDocument();
  });

  it('renders multiple stages with their own transcript bodies in order', () => {
    const { container } = render(
      <MeetingsStagesView
        stages={[
          makeStage({ stage: 'design' }),
          makeStage({ stage: 'review' }),
        ]}
        transcripts={[
          [makeTurn({ specialistId: 'alice', text: 'design idea' })],
          [makeTurn({ specialistId: 'bob', text: 'review note' })],
        ]}
      />,
    );
    expect(screen.getByText('[design]')).toBeInTheDocument();
    expect(screen.getByText('[review]')).toBeInTheDocument();
    expect(screen.getByText('design idea')).toBeInTheDocument();
    expect(screen.getByText('review note')).toBeInTheDocument();
    // Order check: design card precedes review card in the DOM.
    const wrapper = container.firstChild as HTMLElement;
    const cards = Array.from(wrapper.children) as HTMLElement[];
    expect(cards[0].textContent).toContain('[design]');
    expect(cards[1].textContent).toContain('[review]');
  });

  it('renders distinct cards even when two stages share the same name (idx differentiates the key)', () => {
    const { container } = render(
      <MeetingsStagesView
        stages={[
          makeStage({ stage: 'design' }),
          makeStage({ stage: 'design' }),
        ]}
        transcripts={[[], []]}
      />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.children.length).toBe(2);
    expect(screen.getAllByText('[design]')).toHaveLength(2);
  });

  it('rerendering with a new stages array replaces the rendered cards', () => {
    const { rerender, container } = render(
      <MeetingsStagesView
        stages={[makeStage({ stage: 'old' })]}
        transcripts={[[]]}
      />,
    );
    expect(screen.getByText('[old]')).toBeInTheDocument();
    rerender(
      <MeetingsStagesView
        stages={[makeStage({ stage: 'new' })]}
        transcripts={[[]]}
      />,
    );
    expect(screen.queryByText('[old]')).not.toBeInTheDocument();
    expect(screen.getByText('[new]')).toBeInTheDocument();
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.children.length).toBe(1);
  });

  it('rerendering from no-turns to with-turns swaps placeholder for the turn list', () => {
    const { rerender } = render(
      <MeetingsStagesView
        stages={[makeStage()]}
        transcripts={[[]]}
      />,
    );
    expect(screen.getByText('(no turns yet)')).toBeInTheDocument();
    rerender(
      <MeetingsStagesView
        stages={[makeStage()]}
        transcripts={[[makeTurn({ text: 'first turn' })]]}
      />,
    );
    expect(screen.queryByText('(no turns yet)')).not.toBeInTheDocument();
    expect(screen.getByText('first turn')).toBeInTheDocument();
  });

  it('rerendering from reached=false to reached=true updates the consensus phrase', () => {
    const { rerender } = render(
      <MeetingsStagesView
        stages={[
          makeStage({
            consensus: {
              mode: 'majority',
              accepts: [],
              objects: [],
              missing: [],
              reached: false,
              round: 1,
            },
          }),
        ]}
        transcripts={[[]]}
      />,
    );
    expect(
      screen.getByText(/consensus=majority · pending/),
    ).toBeInTheDocument();
    rerender(
      <MeetingsStagesView
        stages={[
          makeStage({
            consensus: {
              mode: 'majority',
              accepts: [],
              objects: [],
              missing: [],
              reached: true,
              round: 1,
            },
          }),
        ]}
        transcripts={[[]]}
      />,
    );
    expect(
      screen.queryByText(/consensus=majority · pending/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/consensus=majority · reached/),
    ).toBeInTheDocument();
  });

  it('re-renders without crashing when the locale flips (useLocale subscription)', () => {
    render(
      <MeetingsStagesView
        stages={[makeStage({ stage: 'design' })]}
        transcripts={[[makeTurn({ text: 'hello' })]]}
      />,
    );
    // Component subscribes to locale via useLocale but uses no t() lookups,
    // so the rendered copy is locale-invariant. Assert it still renders
    // after the flip and the bracketed stage name + turn text are intact.
    expect(screen.getByText('[design]')).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.getByText('[design]')).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
});
