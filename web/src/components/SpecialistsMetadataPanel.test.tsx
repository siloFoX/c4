import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { setLocale } from '../lib/i18n';
import type { Specialist } from './SpecialistsView';

// SpecialistsMetadataPanel is pure display -- it receives a
// Specialist record and renders the 4-column tier/brain/model/
// effort grid plus the domains / triggers / deliverables fields.
// Tests drive the full prop space through fixture variants and
// assert the rendered labels, the per-cell value formatting,
// the '-' fallback for empty model/effort, the comma-joined
// arrays, the deliverables list rendering + listitem count,
// the conditional hide of the deliverables block when empty,
// and the locale flip.

import SpecialistsMetadataPanel from './SpecialistsMetadataPanel';

function makeSpec(over: Partial<Specialist> = {}): Specialist {
  return {
    id: 'arch-1',
    displayName: 'Architect',
    tier: 'design',
    domain: ['arch', 'api'],
    brain: { adapter: 'claude-code', model: 'sonnet', effort: 'max' },
    systemPrompt: '[Role: Architect]',
    triggers: { keywords: ['design', 'plan'], stages: ['design', 'review'] },
    deliverables: ['adr', 'diagram'],
    tags: [],
    vetoPower: false,
    probation: 'stable',
    score: {
      byDomain: {},
      byStage: {},
      samples: {},
      lastUpdated: null,
    },
    ...over,
  };
}

beforeEach(() => {
  setLocale('en');
});

function renderPanel(spec: Specialist = makeSpec()) {
  return render(<SpecialistsMetadataPanel specialist={spec} />);
}

describe('<SpecialistsMetadataPanel>', () => {
  it('renders the tier label', () => {
    renderPanel();
    expect(screen.getByText('tier')).toBeInTheDocument();
  });

  it('renders the brain label', () => {
    renderPanel();
    expect(screen.getByText('brain')).toBeInTheDocument();
  });

  it('renders the model label', () => {
    renderPanel();
    expect(screen.getByText('model')).toBeInTheDocument();
  });

  it('renders the effort label', () => {
    renderPanel();
    expect(screen.getByText('effort')).toBeInTheDocument();
  });

  it('renders the tier value from the specialist record', () => {
    renderPanel(makeSpec({ tier: 'implement' }));
    expect(screen.getByText('implement')).toBeInTheDocument();
  });

  it('renders the brain.adapter value', () => {
    renderPanel(
      makeSpec({ brain: { adapter: 'mock-brain', model: null, effort: null } }),
    );
    expect(screen.getByText('mock-brain')).toBeInTheDocument();
  });

  it('renders the brain.model value when set', () => {
    renderPanel(
      makeSpec({
        brain: { adapter: 'claude-code', model: 'opus', effort: 'max' },
      }),
    );
    expect(screen.getByText('opus')).toBeInTheDocument();
  });

  it('renders the brain.effort value when set', () => {
    renderPanel(
      makeSpec({
        brain: { adapter: 'claude-code', model: 'sonnet', effort: 'medium' },
      }),
    );
    expect(screen.getByText('medium')).toBeInTheDocument();
  });

  it('falls back to "-" when brain.model is null', () => {
    renderPanel(
      makeSpec({
        brain: { adapter: 'claude-code', model: null, effort: 'max' },
      }),
    );
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to "-" when brain.model is an empty string', () => {
    renderPanel(
      makeSpec({
        brain: { adapter: 'claude-code', model: '', effort: 'max' },
      }),
    );
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to "-" when brain.effort is null', () => {
    renderPanel(
      makeSpec({
        brain: { adapter: 'claude-code', model: 'sonnet', effort: null },
      }),
    );
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to "-" when brain.effort is an empty string', () => {
    renderPanel(
      makeSpec({
        brain: { adapter: 'claude-code', model: 'sonnet', effort: '' },
      }),
    );
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders both model and effort as "-" when both are null', () => {
    renderPanel(
      makeSpec({ brain: { adapter: 'noop', model: null, effort: null } }),
    );
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the domains label', () => {
    renderPanel();
    expect(screen.getByText('domains')).toBeInTheDocument();
  });

  it('renders the joined domain array (comma-space separator)', () => {
    renderPanel(makeSpec({ domain: ['arch', 'api', 'data'] }));
    expect(screen.getByText('arch, api, data')).toBeInTheDocument();
  });

  it('renders an empty domain array as the empty string', () => {
    const { container } = renderPanel(makeSpec({ domain: [] }));
    const domainsLabel = within(container).getByText('domains');
    const valueDiv = domainsLabel.nextElementSibling as HTMLElement | null;
    expect(valueDiv).not.toBeNull();
    expect(valueDiv?.textContent).toBe('');
  });

  it('renders the triggers stages label', () => {
    renderPanel();
    expect(screen.getByText(/triggers .* stages/)).toBeInTheDocument();
  });

  it('renders the joined triggers.stages array', () => {
    renderPanel(
      makeSpec({
        triggers: { keywords: ['k'], stages: ['design', 'implement', 'audit'] },
      }),
    );
    expect(
      screen.getByText('design, implement, audit'),
    ).toBeInTheDocument();
  });

  it('renders the triggers keywords label', () => {
    renderPanel();
    expect(screen.getByText(/triggers .* keywords/)).toBeInTheDocument();
  });

  it('renders the joined triggers.keywords array', () => {
    renderPanel(
      makeSpec({
        triggers: { keywords: ['eng', 'data', 'auth'], stages: [] },
      }),
    );
    expect(screen.getByText('eng, data, auth')).toBeInTheDocument();
  });

  it('does NOT render the deliverables label when the array is empty', () => {
    renderPanel(makeSpec({ deliverables: [] }));
    expect(screen.queryByText('deliverables')).not.toBeInTheDocument();
  });

  it('renders the deliverables label when at least one entry is present', () => {
    renderPanel(makeSpec({ deliverables: ['adr'] }));
    expect(screen.getByText('deliverables')).toBeInTheDocument();
  });

  it('renders the deliverables list with one li per entry', () => {
    const { container } = renderPanel(
      makeSpec({ deliverables: ['adr', 'diagram', 'spec'] }),
    );
    const ul = container.querySelector('ul');
    expect(ul).not.toBeNull();
    const items = within(ul as HTMLElement).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('adr');
    expect(items[1]).toHaveTextContent('diagram');
    expect(items[2]).toHaveTextContent('spec');
  });

  it('does NOT render any ul when deliverables is empty', () => {
    const { container } = renderPanel(makeSpec({ deliverables: [] }));
    expect(container.querySelector('ul')).toBeNull();
  });

  it('renders a single ul when deliverables has one entry', () => {
    const { container } = renderPanel(makeSpec({ deliverables: ['adr'] }));
    expect(container.querySelectorAll('ul')).toHaveLength(1);
  });

  it('applies the sm:grid-cols-4 layout class on the top grid', () => {
    const { container } = renderPanel();
    const grid = container.querySelector('.grid');
    expect(grid).not.toBeNull();
    expect(grid as HTMLElement).toHaveClass('sm:grid-cols-4');
  });

  it('rerendering with a new specialist replaces every field cleanly', () => {
    const { rerender } = renderPanel(
      makeSpec({
        tier: 'design',
        brain: { adapter: 'A', model: 'sonnet', effort: 'max' },
      }),
    );
    expect(screen.getByText('design')).toBeInTheDocument();
    rerender(
      <SpecialistsMetadataPanel
        specialist={makeSpec({
          tier: 'implement',
          brain: { adapter: 'B', model: 'opus', effort: 'medium' },
        })}
      />,
    );
    expect(screen.getByText('implement')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('opus')).toBeInTheDocument();
    expect(screen.getByText('medium')).toBeInTheDocument();
    expect(screen.queryByText('design')).not.toBeInTheDocument();
  });

  it('rerendering from non-empty deliverables to empty drops the list', () => {
    const { rerender } = renderPanel(makeSpec({ deliverables: ['adr'] }));
    expect(screen.getByText('deliverables')).toBeInTheDocument();
    rerender(
      <SpecialistsMetadataPanel
        specialist={makeSpec({ deliverables: [] })}
      />,
    );
    expect(screen.queryByText('deliverables')).not.toBeInTheDocument();
  });

  it('rerendering from empty deliverables to non-empty adds the list', () => {
    const { rerender } = renderPanel(makeSpec({ deliverables: [] }));
    expect(screen.queryByText('deliverables')).not.toBeInTheDocument();
    rerender(
      <SpecialistsMetadataPanel
        specialist={makeSpec({ deliverables: ['adr', 'spec'] })}
      />,
    );
    expect(screen.getByText('deliverables')).toBeInTheDocument();
    expect(screen.getByText('adr')).toBeInTheDocument();
    expect(screen.getByText('spec')).toBeInTheDocument();
  });

  it('re-renders translated labels when the locale flips to ko', () => {
    renderPanel();
    expect(screen.getByText('tier')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    // English labels disappear after the locale flips (ko bundle
    // overrides them); we only assert the English literal is gone.
    expect(screen.queryByText('domains')).not.toBeInTheDocument();
  });
});
