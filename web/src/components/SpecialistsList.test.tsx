import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { Specialist } from './SpecialistsView';

// SpecialistsList is pure display: parent owns selection +
// flagged-id set + filtered list. Tests render the component
// with varied fixtures and assert error / empty / list states,
// per-row badge variants (veto / probation / underperform /
// brain summary / sample total / tag chips), selection
// highlight + onSelect wiring. No hooks of its own except
// useLocale which we exercise via setLocale().

import SpecialistsList from './SpecialistsList';

function makeSpecialist(over: Partial<Specialist> = {}): Specialist {
  return {
    id: 'arch-1',
    displayName: 'Arch One',
    tier: 'design',
    domain: ['design', 'platform'],
    brain: { adapter: 'claude', model: 'opus-4', effort: null },
    systemPrompt: 'You are a design specialist.',
    triggers: { keywords: ['design'], stages: ['design'] },
    deliverables: ['plan'],
    tags: ['core', 'design'],
    vetoPower: false,
    probation: 'stable',
    score: {
      byDomain: { design: 0.8 },
      byStage: { design: 0.9 },
      samples: { design: 3 },
      lastUpdated: '2026-05-01T00:00:00Z',
    },
    ...over,
  };
}

const A: Specialist = makeSpecialist({ id: 'arch-1', tier: 'design' });
const B: Specialist = makeSpecialist({
  id: 'sec-1',
  displayName: 'Sec One',
  tier: 'audit',
  domain: ['security'],
  brain: { adapter: 'gpt', model: null, effort: null },
  vetoPower: true,
  probation: 'probation',
  tags: undefined,
  score: {
    byDomain: {},
    byStage: {},
    samples: {},
    lastUpdated: null,
  },
});
const C: Specialist = makeSpecialist({
  id: 'ops-1',
  displayName: 'Ops One',
  tier: 'deploy',
  domain: ['ops'],
  brain: { adapter: 'mistral', model: 'small', effort: null },
  tags: ['a', 'b', 'c', 'd', 'e', 'f'],
  score: {
    byDomain: { ops: 0.5 },
    byStage: { deploy: 0.5 },
    samples: { deploy: 11 },
    lastUpdated: '2026-05-02T00:00:00Z',
  },
});

beforeEach(() => {
  setLocale('en');
});

function renderList(
  overrides: Partial<Parameters<typeof SpecialistsList>[0]> = {},
) {
  const onSelect = vi.fn();
  const props = {
    filtered: [A, B, C],
    error: null,
    loading: false,
    selectedId: null as string | null,
    onSelect,
    flaggedIds: new Set<string>(),
    ...overrides,
  };
  const utils = render(<SpecialistsList {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onSelect, props };
}

describe('<SpecialistsList>', () => {
  it('renders the error message when an error string is passed', () => {
    renderList({ error: 'load failed' });
    const banner = screen.getByText('load failed');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveClass('text-destructive');
  });

  it('does NOT render any rows when an error is set', () => {
    renderList({ error: 'load failed' });
    expect(screen.queryByText('arch-1')).not.toBeInTheDocument();
    expect(screen.queryByText('sec-1')).not.toBeInTheDocument();
  });

  it('renders the loading copy when empty + loading', () => {
    renderList({ filtered: [], loading: true });
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders the shared <Spinner> component (data-testid=specialists-list-spinner) when empty + loading', () => {
    renderList({ filtered: [], loading: true });
    expect(screen.getByTestId('specialists-list-spinner')).toBeInTheDocument();
  });

  it('renders the no-match copy when empty + not loading', () => {
    renderList({ filtered: [], loading: false });
    expect(
      screen.getByText('No specialists match the filter.'),
    ).toBeInTheDocument();
  });

  it('renders one row per filtered specialist as a list', () => {
    const { container } = renderList();
    const list = container.querySelector('ul');
    expect(list).not.toBeNull();
    if (list) {
      const items = within(list as HTMLElement).getAllByRole('listitem');
      expect(items).toHaveLength(3);
    }
  });

  it('renders the id of each row', () => {
    renderList();
    expect(screen.getByText('arch-1')).toBeInTheDocument();
    expect(screen.getByText('sec-1')).toBeInTheDocument();
    expect(screen.getByText('ops-1')).toBeInTheDocument();
  });

  it('renders the tier label per row', () => {
    renderList();
    expect(screen.getByText('design')).toBeInTheDocument();
    expect(screen.getByText('audit')).toBeInTheDocument();
    expect(screen.getByText('deploy')).toBeInTheDocument();
  });

  it('renders the brain adapter/model summary per row', () => {
    renderList();
    expect(screen.getByText('claude/opus-4')).toBeInTheDocument();
    expect(screen.getByText('gpt/-')).toBeInTheDocument();
  });

  it('renders the veto pill only for specialists with vetoPower', () => {
    renderList();
    const vetoPills = screen.getAllByText('veto');
    expect(vetoPills).toHaveLength(1);
    const row = vetoPills[0].closest('li') as HTMLElement;
    expect(within(row).getByText('sec-1')).toBeInTheDocument();
  });

  it('renders the probation badge only for probation specialists', () => {
    renderList();
    const badges = screen.getAllByText(/probation/i);
    expect(badges.length).toBeGreaterThan(0);
    const row = badges[0].closest('li') as HTMLElement;
    expect(within(row).getByText('sec-1')).toBeInTheDocument();
  });

  it('renders the sample total when samples > 0', () => {
    renderList();
    expect(screen.getByText('11')).toBeInTheDocument();
    expect(screen.getAllByText('3')).toHaveLength(1);
  });

  it('does NOT render the sample total chip when total is 0', () => {
    renderList({ filtered: [B] });
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  it('renders the underperform pill only when id is in flaggedIds', () => {
    renderList({ flaggedIds: new Set(['arch-1']) });
    const pills = screen.getAllByText('underperform');
    expect(pills).toHaveLength(1);
    const row = pills[0].closest('li') as HTMLElement;
    expect(within(row).getByText('arch-1')).toBeInTheDocument();
  });

  it('uses the underperform tooltip title on the flagged pill', () => {
    renderList({ flaggedIds: new Set(['arch-1']) });
    const pill = screen.getByText('underperform');
    expect(pill).toHaveAttribute(
      'title',
      'Sustained negative retro score in at least one bucket',
    );
  });

  it('does NOT render any underperform pills when flaggedIds is empty', () => {
    renderList();
    expect(screen.queryByText('underperform')).not.toBeInTheDocument();
  });

  it('renders the joined domain string for each specialist', () => {
    renderList();
    expect(screen.getByText('design, platform')).toBeInTheDocument();
    expect(screen.getByText('security')).toBeInTheDocument();
    expect(screen.getByText('ops')).toBeInTheDocument();
  });

  it('renders up to four tag chips per row', () => {
    renderList({ filtered: [C] });
    expect(screen.getByText('#a')).toBeInTheDocument();
    expect(screen.getByText('#b')).toBeInTheDocument();
    expect(screen.getByText('#c')).toBeInTheDocument();
    expect(screen.getByText('#d')).toBeInTheDocument();
    expect(screen.queryByText('#e')).not.toBeInTheDocument();
    expect(screen.queryByText('#f')).not.toBeInTheDocument();
  });

  it('renders the overflow tag counter when tags.length > 4', () => {
    renderList({ filtered: [C] });
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('does NOT render tag chips when tags is undefined', () => {
    renderList({ filtered: [B] });
    expect(screen.queryByText(/^#/)).not.toBeInTheDocument();
  });

  it('does NOT render tag chips when tags is an empty array', () => {
    const empty = makeSpecialist({ id: 'empty-tags', tags: [] });
    renderList({ filtered: [empty] });
    expect(screen.queryByText(/^#/)).not.toBeInTheDocument();
  });

  it('applies the active highlight class on the selected row', () => {
    renderList({ selectedId: 'arch-1' });
    const row = screen.getByText('arch-1').closest('li') as HTMLElement;
    expect(row.className).toMatch(/bg-primary/);
  });

  it('applies the hover class on a non-selected row', () => {
    renderList({ selectedId: 'arch-1' });
    const row = screen.getByText('sec-1').closest('li') as HTMLElement;
    expect(row.className).toMatch(/hover:bg-accent/);
  });

  it('fires onSelect with the id when a row is clicked', async () => {
    const { user, onSelect } = renderList();
    const row = screen.getByText('sec-1').closest('li') as HTMLElement;
    await user.click(row);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('sec-1');
  });

  it('fires onSelect for each row independently across multiple clicks', async () => {
    const { user, onSelect } = renderList();
    await user.click(screen.getByText('arch-1').closest('li') as HTMLElement);
    await user.click(screen.getByText('ops-1').closest('li') as HTMLElement);
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenNthCalledWith(1, 'arch-1');
    expect(onSelect).toHaveBeenNthCalledWith(2, 'ops-1');
  });

  it('does not fire onSelect on initial render', () => {
    const { onSelect } = renderList();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('applies the fallback tier class for an unknown tier value', () => {
    const unknownTier = makeSpecialist({ id: 'x-1', tier: 'mystery' });
    renderList({ filtered: [unknownTier] });
    const tier = screen.getByText('mystery');
    expect(tier.className).toMatch(/text-muted-foreground/);
  });

  it('does not duplicate rows across rerenders with the same data', () => {
    const { rerender, props } = renderList();
    rerender(<SpecialistsList {...props} />);
    expect(screen.getAllByText('arch-1')).toHaveLength(1);
  });

  it('re-renders translated copy when the locale flips to ko in the empty branch', () => {
    renderList({ filtered: [], loading: false });
    expect(
      screen.getByText('No specialists match the filter.'),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByText('No specialists match the filter.'),
    ).not.toBeInTheDocument();
  });
});
