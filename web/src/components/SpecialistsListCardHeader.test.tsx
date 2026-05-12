import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';

// SpecialistsListCardHeader is a pure composite: it renders
// SpecialistsListTitleBar + SpecialistsSearchFilters inside a
// CardHeader and forwards every prop straight through. Each
// child owns its own tests, so this file stubs them with thin
// markers and asserts composition + prop wiring + callback
// firing only -- no real form state, no real network.

vi.mock('./SpecialistsListTitleBar', () => ({
  default: ({
    loading,
    addOpen,
    actionError,
    onToggleAdd,
    onCloseAdd,
    onAdded,
    onRefresh,
  }: {
    loading: boolean;
    addOpen: boolean;
    actionError: string | null;
    onToggleAdd: () => void;
    onCloseAdd: () => void;
    onAdded: (id: string) => void;
    onRefresh: () => void;
  }) => (
    <div
      data-testid="title-bar"
      data-loading={loading ? 'true' : 'false'}
      data-add-open={addOpen ? 'true' : 'false'}
      data-action-error={actionError ?? ''}
    >
      <button type="button" data-testid="title-toggle" onClick={onToggleAdd}>
        toggle
      </button>
      <button type="button" data-testid="title-close" onClick={onCloseAdd}>
        close
      </button>
      <button
        type="button"
        data-testid="title-added"
        onClick={() => onAdded('new-spec-id')}
      >
        added
      </button>
      <button type="button" data-testid="title-refresh" onClick={onRefresh}>
        refresh
      </button>
    </div>
  ),
}));

vi.mock('./SpecialistsSearchFilters', () => ({
  default: ({
    filter,
    onFilter,
    tierFilter,
    onTierFilter,
    vetoOnly,
    onVetoOnly,
    filteredCount,
    totalCount,
  }: {
    filter: string;
    onFilter: (next: string) => void;
    tierFilter: string;
    onTierFilter: (next: string) => void;
    vetoOnly: boolean;
    onVetoOnly: (next: boolean) => void;
    filteredCount: number;
    totalCount: number;
  }) => (
    <div
      data-testid="search-filters"
      data-filter={filter}
      data-tier={tierFilter}
      data-veto={vetoOnly ? 'true' : 'false'}
      data-filtered={String(filteredCount)}
      data-total={String(totalCount)}
    >
      <button
        type="button"
        data-testid="filter-set-filter"
        onClick={() => onFilter('typed-text')}
      >
        set filter
      </button>
      <button
        type="button"
        data-testid="filter-set-tier"
        onClick={() => onTierFilter('design')}
      >
        set tier
      </button>
      <button
        type="button"
        data-testid="filter-set-veto"
        onClick={() => onVetoOnly(true)}
      >
        set veto
      </button>
    </div>
  ),
}));

import SpecialistsListCardHeader from './SpecialistsListCardHeader';

beforeEach(() => {
  setLocale('en');
});

function renderHeader(
  overrides: Partial<Parameters<typeof SpecialistsListCardHeader>[0]> = {},
) {
  const props = {
    loading: false,
    addOpen: false,
    actionError: null as string | null,
    onToggleAdd: vi.fn(),
    onCloseAdd: vi.fn(),
    onAdded: vi.fn(),
    onRefresh: vi.fn(),
    filter: '',
    onFilter: vi.fn(),
    tierFilter: 'any',
    onTierFilter: vi.fn(),
    vetoOnly: false,
    onVetoOnly: vi.fn(),
    filteredCount: 0,
    totalCount: 0,
    ...overrides,
  };
  const utils = render(<SpecialistsListCardHeader {...props} />);
  return { ...utils, props };
}

describe('<SpecialistsListCardHeader>', () => {
  it('renders the TitleBar child marker', () => {
    renderHeader();
    expect(screen.getByTestId('title-bar')).toBeInTheDocument();
  });

  it('renders the SearchFilters child marker', () => {
    renderHeader();
    expect(screen.getByTestId('search-filters')).toBeInTheDocument();
  });

  it('renders both children inside a single CardHeader wrapper', () => {
    const { container } = renderHeader();
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.querySelectorAll('[data-testid="title-bar"]').length).toBe(1);
    expect(
      wrapper.querySelectorAll('[data-testid="search-filters"]').length,
    ).toBe(1);
  });

  it('applies the border-b CardHeader class on the wrapper', () => {
    const { container } = renderHeader();
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('border-b');
  });

  it('applies the flex-col layout class on the wrapper', () => {
    const { container } = renderHeader();
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('flex-col');
  });

  it('forwards loading=false to the TitleBar', () => {
    renderHeader({ loading: false });
    expect(screen.getByTestId('title-bar')).toHaveAttribute(
      'data-loading',
      'false',
    );
  });

  it('forwards loading=true to the TitleBar', () => {
    renderHeader({ loading: true });
    expect(screen.getByTestId('title-bar')).toHaveAttribute(
      'data-loading',
      'true',
    );
  });

  it('forwards addOpen=false to the TitleBar', () => {
    renderHeader({ addOpen: false });
    expect(screen.getByTestId('title-bar')).toHaveAttribute(
      'data-add-open',
      'false',
    );
  });

  it('forwards addOpen=true to the TitleBar', () => {
    renderHeader({ addOpen: true });
    expect(screen.getByTestId('title-bar')).toHaveAttribute(
      'data-add-open',
      'true',
    );
  });

  it('forwards null actionError to the TitleBar', () => {
    renderHeader({ actionError: null });
    expect(screen.getByTestId('title-bar')).toHaveAttribute(
      'data-action-error',
      '',
    );
  });

  it('forwards string actionError to the TitleBar', () => {
    renderHeader({ actionError: 'add failed: bad json' });
    expect(screen.getByTestId('title-bar')).toHaveAttribute(
      'data-action-error',
      'add failed: bad json',
    );
  });

  it('forwards filter prop to the SearchFilters', () => {
    renderHeader({ filter: 'eng' });
    expect(screen.getByTestId('search-filters')).toHaveAttribute(
      'data-filter',
      'eng',
    );
  });

  it('forwards tierFilter prop to the SearchFilters', () => {
    renderHeader({ tierFilter: 'implement' });
    expect(screen.getByTestId('search-filters')).toHaveAttribute(
      'data-tier',
      'implement',
    );
  });

  it('forwards vetoOnly=false to the SearchFilters', () => {
    renderHeader({ vetoOnly: false });
    expect(screen.getByTestId('search-filters')).toHaveAttribute(
      'data-veto',
      'false',
    );
  });

  it('forwards vetoOnly=true to the SearchFilters', () => {
    renderHeader({ vetoOnly: true });
    expect(screen.getByTestId('search-filters')).toHaveAttribute(
      'data-veto',
      'true',
    );
  });

  it('forwards filteredCount to the SearchFilters', () => {
    renderHeader({ filteredCount: 7 });
    expect(screen.getByTestId('search-filters')).toHaveAttribute(
      'data-filtered',
      '7',
    );
  });

  it('forwards totalCount to the SearchFilters', () => {
    renderHeader({ totalCount: 42 });
    expect(screen.getByTestId('search-filters')).toHaveAttribute(
      'data-total',
      '42',
    );
  });

  it('forwards zero counts to the SearchFilters', () => {
    renderHeader({ filteredCount: 0, totalCount: 0 });
    const sf = screen.getByTestId('search-filters');
    expect(sf).toHaveAttribute('data-filtered', '0');
    expect(sf).toHaveAttribute('data-total', '0');
  });

  it('fires onToggleAdd when the TitleBar fires its toggle callback', async () => {
    const user = userEvent.setup();
    const onToggleAdd = vi.fn();
    renderHeader({ onToggleAdd });
    await user.click(screen.getByTestId('title-toggle'));
    expect(onToggleAdd).toHaveBeenCalledTimes(1);
  });

  it('fires onCloseAdd when the TitleBar fires its close callback', async () => {
    const user = userEvent.setup();
    const onCloseAdd = vi.fn();
    renderHeader({ onCloseAdd });
    await user.click(screen.getByTestId('title-close'));
    expect(onCloseAdd).toHaveBeenCalledTimes(1);
  });

  it('fires onAdded with the new id from the TitleBar', async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();
    renderHeader({ onAdded });
    await user.click(screen.getByTestId('title-added'));
    expect(onAdded).toHaveBeenCalledWith('new-spec-id');
  });

  it('fires onRefresh when the TitleBar fires its refresh callback', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    renderHeader({ onRefresh });
    await user.click(screen.getByTestId('title-refresh'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('fires onFilter with the next value from the SearchFilters', async () => {
    const user = userEvent.setup();
    const onFilter = vi.fn();
    renderHeader({ onFilter });
    await user.click(screen.getByTestId('filter-set-filter'));
    expect(onFilter).toHaveBeenCalledWith('typed-text');
  });

  it('fires onTierFilter with the next tier from the SearchFilters', async () => {
    const user = userEvent.setup();
    const onTierFilter = vi.fn();
    renderHeader({ onTierFilter });
    await user.click(screen.getByTestId('filter-set-tier'));
    expect(onTierFilter).toHaveBeenCalledWith('design');
  });

  it('fires onVetoOnly with the next boolean from the SearchFilters', async () => {
    const user = userEvent.setup();
    const onVetoOnly = vi.fn();
    renderHeader({ onVetoOnly });
    await user.click(screen.getByTestId('filter-set-veto'));
    expect(onVetoOnly).toHaveBeenCalledWith(true);
  });

  it('does not fire any callback on initial render', () => {
    const onToggleAdd = vi.fn();
    const onRefresh = vi.fn();
    const onFilter = vi.fn();
    const onTierFilter = vi.fn();
    const onVetoOnly = vi.fn();
    renderHeader({ onToggleAdd, onRefresh, onFilter, onTierFilter, onVetoOnly });
    expect(onToggleAdd).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onFilter).not.toHaveBeenCalled();
    expect(onTierFilter).not.toHaveBeenCalled();
    expect(onVetoOnly).not.toHaveBeenCalled();
  });

  it('rerendering with the same props does not duplicate the children', () => {
    const { rerender, props } = renderHeader();
    rerender(<SpecialistsListCardHeader {...props} />);
    expect(screen.getAllByTestId('title-bar')).toHaveLength(1);
    expect(screen.getAllByTestId('search-filters')).toHaveLength(1);
  });

  it('rerendering with a new actionError updates the marker', () => {
    const { rerender, props } = renderHeader({ actionError: null });
    expect(screen.getByTestId('title-bar')).toHaveAttribute(
      'data-action-error',
      '',
    );
    rerender(
      <SpecialistsListCardHeader {...props} actionError="something broke" />,
    );
    expect(screen.getByTestId('title-bar')).toHaveAttribute(
      'data-action-error',
      'something broke',
    );
  });

  it('rerendering with a new filter updates the marker', () => {
    const { rerender, props } = renderHeader({ filter: '' });
    expect(screen.getByTestId('search-filters')).toHaveAttribute(
      'data-filter',
      '',
    );
    rerender(<SpecialistsListCardHeader {...props} filter="auth" />);
    expect(screen.getByTestId('search-filters')).toHaveAttribute(
      'data-filter',
      'auth',
    );
  });

  it('re-renders after locale flip (useLocale subscription)', () => {
    renderHeader();
    expect(screen.getByTestId('title-bar')).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(screen.getByTestId('title-bar')).toBeInTheDocument();
    expect(screen.getByTestId('search-filters')).toBeInTheDocument();
  });
});
