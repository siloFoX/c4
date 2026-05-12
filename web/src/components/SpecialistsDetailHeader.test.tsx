import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import type { Specialist } from './SpecialistsView';

// SpecialistsDetailHeader is pure display: parent owns selection
// + busy state + remove handler. Tests render with varied props
// and assert the title (placeholder vs selected.id/displayName),
// remove button (aria-label, disabled gating, click wiring),
// confirm-remove block (alert role, cancel + confirm wiring,
// busy gating).

import SpecialistsDetailHeader from './SpecialistsDetailHeader';

function makeSpecialist(over: Partial<Specialist> = {}): Specialist {
  return {
    id: 'arch-1',
    displayName: 'Arch One',
    tier: 'design',
    domain: ['design'],
    brain: { adapter: 'claude', model: 'opus-4', effort: null },
    systemPrompt: 'p',
    triggers: { keywords: [], stages: [] },
    deliverables: [],
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

const SPEC = makeSpecialist();

beforeEach(() => {
  setLocale('en');
});

function renderHeader(
  overrides: Partial<Parameters<typeof SpecialistsDetailHeader>[0]> = {},
) {
  const onConfirmRemove = vi.fn();
  const onRemove = vi.fn();
  const props = {
    selected: SPEC as Specialist | null,
    confirmRemoveId: null as string | null,
    removeBusy: false,
    onConfirmRemove,
    onRemove,
    ...overrides,
  };
  const utils = render(<SpecialistsDetailHeader {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, onConfirmRemove, onRemove, props };
}

describe('<SpecialistsDetailHeader>', () => {
  it('renders the placeholder title when selected is null', () => {
    renderHeader({ selected: null });
    expect(screen.getByText('Select a specialist')).toBeInTheDocument();
  });

  it('renders the selected title with id + displayName when a specialist is selected', () => {
    renderHeader();
    expect(screen.getByText(/arch-1/)).toBeInTheDocument();
    expect(screen.getByText(/Arch One/)).toBeInTheDocument();
  });

  it('does NOT render the Remove button when nothing is selected', () => {
    renderHeader({ selected: null });
    expect(
      screen.queryByRole('button', { name: /Remove/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the Remove button when a specialist is selected', () => {
    renderHeader();
    expect(
      screen.getByRole('button', { name: 'Remove arch-1' }),
    ).toBeInTheDocument();
  });

  it('Remove button uses the templated aria-label including the id', () => {
    renderHeader({ selected: makeSpecialist({ id: 'sec-1' }) });
    expect(
      screen.getByRole('button', { name: 'Remove sec-1' }),
    ).toBeInTheDocument();
  });

  it('Remove button has the destructive tone class', () => {
    renderHeader();
    const btn = screen.getByRole('button', { name: 'Remove arch-1' });
    expect(btn.className).toMatch(/text-destructive/);
  });

  it('Remove button is not disabled when removeBusy is false', () => {
    renderHeader();
    const btn = screen.getByRole('button', { name: 'Remove arch-1' });
    expect(btn).not.toBeDisabled();
  });

  it('Remove button is disabled when removeBusy is true', () => {
    renderHeader({ removeBusy: true });
    const btn = screen.getByRole('button', { name: 'Remove arch-1' });
    expect(btn).toBeDisabled();
  });

  it('fires onConfirmRemove with the selected id when Remove is clicked', async () => {
    const { user, onConfirmRemove } = renderHeader();
    await user.click(screen.getByRole('button', { name: 'Remove arch-1' }));
    expect(onConfirmRemove).toHaveBeenCalledTimes(1);
    expect(onConfirmRemove).toHaveBeenCalledWith('arch-1');
  });

  it('does NOT render the confirm block when confirmRemoveId is null', () => {
    renderHeader();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does NOT render the confirm block when confirmRemoveId does not match selected.id', () => {
    renderHeader({ confirmRemoveId: 'other-id' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does NOT render the confirm block when selected is null even if confirmRemoveId is set', () => {
    renderHeader({ selected: null, confirmRemoveId: 'arch-1' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the confirm block with role=alert when confirmRemoveId matches selected.id', () => {
    renderHeader({ confirmRemoveId: 'arch-1' });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('confirm block surfaces the selected.id inside the warning text', () => {
    renderHeader({ confirmRemoveId: 'arch-1' });
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('arch-1')).toBeInTheDocument();
  });

  it('renders both Cancel and Confirm remove buttons inside the confirm block', () => {
    renderHeader({ confirmRemoveId: 'arch-1' });
    const alert = screen.getByRole('alert');
    expect(
      within(alert).getByRole('button', { name: /Cancel/ }),
    ).toBeInTheDocument();
    expect(
      within(alert).getByRole('button', { name: /Confirm remove/ }),
    ).toBeInTheDocument();
  });

  it('fires onConfirmRemove(null) when Cancel inside the confirm block is clicked', async () => {
    const { user, onConfirmRemove } = renderHeader({
      confirmRemoveId: 'arch-1',
    });
    const alert = screen.getByRole('alert');
    await user.click(within(alert).getByRole('button', { name: /Cancel/ }));
    expect(onConfirmRemove).toHaveBeenCalledWith(null);
  });

  it('fires onRemove with the selected id when Confirm remove is clicked', async () => {
    const { user, onRemove } = renderHeader({
      confirmRemoveId: 'arch-1',
    });
    const alert = screen.getByRole('alert');
    await user.click(
      within(alert).getByRole('button', { name: /Confirm remove/ }),
    );
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith('arch-1');
  });

  it('disables both Cancel and Confirm buttons when removeBusy is true', () => {
    renderHeader({ confirmRemoveId: 'arch-1', removeBusy: true });
    const alert = screen.getByRole('alert');
    expect(
      within(alert).getByRole('button', { name: /Cancel/ }),
    ).toBeDisabled();
    expect(
      within(alert).getByRole('button', { name: /Confirm remove/ }),
    ).toBeDisabled();
  });

  it('does not fire any callbacks on initial mount', () => {
    const { onConfirmRemove, onRemove } = renderHeader({
      confirmRemoveId: 'arch-1',
    });
    expect(onConfirmRemove).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('rerendering with the same props does not duplicate the Remove button', () => {
    const { rerender, props } = renderHeader();
    rerender(<SpecialistsDetailHeader {...props} />);
    expect(
      screen.getAllByRole('button', { name: 'Remove arch-1' }),
    ).toHaveLength(1);
  });

  it('switching selected from one specialist to another updates the aria-label', () => {
    const { rerender, props } = renderHeader();
    expect(
      screen.getByRole('button', { name: 'Remove arch-1' }),
    ).toBeInTheDocument();
    rerender(
      <SpecialistsDetailHeader
        {...props}
        selected={makeSpecialist({ id: 'sec-2' })}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Remove sec-2' }),
    ).toBeInTheDocument();
  });

  it('re-renders translated copy when the locale flips to ko', () => {
    renderHeader({ selected: null });
    expect(screen.getByText('Select a specialist')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.queryByText('Select a specialist')).not.toBeInTheDocument();
  });
});
