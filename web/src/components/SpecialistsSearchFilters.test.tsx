import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLocale } from '../lib/i18n';
import { TIER_BADGE } from './SpecialistsView';

// SpecialistsSearchFilters is pure controlled JSX: the parent
// owns the filter / tierFilter / vetoOnly state and feeds the
// counts in. Tests render with each prop variation and assert
// the search input value + placeholder + aria-label, the
// clear-filter X button conditional rendering and payload, the
// tier <select> options (every TIER_BADGE key plus the "any"
// fallback), the tier select value reflecting the prop, the
// vetoOnly checkbox checked state, the per-callback payload
// shape on type / clear / select-change / checkbox-change,
// the filteredCount/totalCount display, and the locale flip.

import SpecialistsSearchFilters from './SpecialistsSearchFilters';

beforeEach(() => {
  setLocale('en');
});

function renderFilters(
  overrides: Partial<Parameters<typeof SpecialistsSearchFilters>[0]> = {},
) {
  const props = {
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
  const utils = render(<SpecialistsSearchFilters {...props} />);
  const user = userEvent.setup();
  return { ...utils, user, props };
}

describe('<SpecialistsSearchFilters>', () => {
  it('renders the search input with the configured aria-label', () => {
    renderFilters();
    expect(
      screen.getByRole('textbox', { name: 'Filter specialists' }),
    ).toBeInTheDocument();
  });

  it('uses the search placeholder copy on the input', () => {
    renderFilters();
    const input = screen.getByRole('textbox', { name: 'Filter specialists' });
    expect(input).toHaveAttribute(
      'placeholder',
      'Search id / displayName / systemPrompt / domain / keywords (whitespace = AND)',
    );
  });

  it('renders the search input controlled by the filter prop (empty)', () => {
    renderFilters({ filter: '' });
    const input = screen.getByRole('textbox', {
      name: 'Filter specialists',
    }) as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('renders the search input controlled by the filter prop (populated)', () => {
    renderFilters({ filter: 'auth' });
    const input = screen.getByRole('textbox', {
      name: 'Filter specialists',
    }) as HTMLInputElement;
    expect(input.value).toBe('auth');
  });

  it('does NOT render the clear filter button when filter is empty', () => {
    renderFilters({ filter: '' });
    expect(
      screen.queryByRole('button', { name: 'Clear filter' }),
    ).not.toBeInTheDocument();
  });

  it('renders the clear filter button when filter is non-empty', () => {
    renderFilters({ filter: 'eng' });
    expect(
      screen.getByRole('button', { name: 'Clear filter' }),
    ).toBeInTheDocument();
  });

  it('fires onFilter with empty string when the clear filter button is clicked', async () => {
    const onFilter = vi.fn();
    const { user } = renderFilters({ filter: 'eng', onFilter });
    await user.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(onFilter).toHaveBeenCalledWith('');
  });

  it('fires onFilter with each typed character as the user types', async () => {
    const onFilter = vi.fn();
    const { user } = renderFilters({ filter: '', onFilter });
    const input = screen.getByRole('textbox', { name: 'Filter specialists' });
    await user.type(input, 'abc');
    expect(onFilter).toHaveBeenCalledTimes(3);
    expect(onFilter).toHaveBeenNthCalledWith(1, 'a');
    expect(onFilter).toHaveBeenNthCalledWith(2, 'b');
    expect(onFilter).toHaveBeenNthCalledWith(3, 'c');
  });

  it('renders the tier filter select with the configured aria-label', () => {
    renderFilters();
    expect(
      screen.getByRole('combobox', { name: 'Tier filter' }),
    ).toBeInTheDocument();
  });

  it('renders one option per TIER_BADGE key plus the any fallback', () => {
    renderFilters();
    const select = screen.getByRole('combobox', { name: 'Tier filter' });
    const options = select.querySelectorAll('option');
    const tierKeyCount = Object.keys(TIER_BADGE).length;
    expect(options).toHaveLength(tierKeyCount + 1);
  });

  it('renders the any option first', () => {
    renderFilters();
    const select = screen.getByRole('combobox', { name: 'Tier filter' });
    const first = select.querySelectorAll('option')[0] as HTMLOptionElement;
    expect(first.value).toBe('any');
    expect(first.textContent).toBe('any');
  });

  it('renders every TIER_BADGE key as a select option value', () => {
    renderFilters();
    const select = screen.getByRole('combobox', { name: 'Tier filter' });
    const values = Array.from(select.querySelectorAll('option')).map(
      (o) => (o as HTMLOptionElement).value,
    );
    for (const tier of Object.keys(TIER_BADGE)) {
      expect(values).toContain(tier);
    }
  });

  it('reflects the tierFilter prop as the selected option value', () => {
    renderFilters({ tierFilter: 'audit' });
    const select = screen.getByRole('combobox', {
      name: 'Tier filter',
    }) as HTMLSelectElement;
    expect(select.value).toBe('audit');
  });

  it('defaults the selected value to any when tierFilter is any', () => {
    renderFilters({ tierFilter: 'any' });
    const select = screen.getByRole('combobox', {
      name: 'Tier filter',
    }) as HTMLSelectElement;
    expect(select.value).toBe('any');
  });

  it('fires onTierFilter with the new value when the tier select changes', async () => {
    const onTierFilter = vi.fn();
    const { user } = renderFilters({ tierFilter: 'any', onTierFilter });
    const select = screen.getByRole('combobox', { name: 'Tier filter' });
    await user.selectOptions(select, 'implement');
    expect(onTierFilter).toHaveBeenCalledWith('implement');
  });

  it('renders the veto-only checkbox with the configured aria-label', () => {
    renderFilters();
    expect(
      screen.getByRole('checkbox', { name: 'Veto-only' }),
    ).toBeInTheDocument();
  });

  it('renders the veto-only checkbox unchecked when vetoOnly is false', () => {
    renderFilters({ vetoOnly: false });
    expect(screen.getByRole('checkbox', { name: 'Veto-only' })).not.toBeChecked();
  });

  it('renders the veto-only checkbox checked when vetoOnly is true', () => {
    renderFilters({ vetoOnly: true });
    expect(screen.getByRole('checkbox', { name: 'Veto-only' })).toBeChecked();
  });

  it('fires onVetoOnly(true) when the checkbox is toggled on', async () => {
    const onVetoOnly = vi.fn();
    const { user } = renderFilters({ vetoOnly: false, onVetoOnly });
    await user.click(screen.getByRole('checkbox', { name: 'Veto-only' }));
    expect(onVetoOnly).toHaveBeenCalledWith(true);
  });

  it('fires onVetoOnly(false) when the checkbox is toggled off', async () => {
    const onVetoOnly = vi.fn();
    const { user } = renderFilters({ vetoOnly: true, onVetoOnly });
    await user.click(screen.getByRole('checkbox', { name: 'Veto-only' }));
    expect(onVetoOnly).toHaveBeenCalledWith(false);
  });

  it('renders the filtered/total count when both are zero', () => {
    renderFilters({ filteredCount: 0, totalCount: 0 });
    expect(screen.getByText('0/0')).toBeInTheDocument();
  });

  it('renders the filtered/total count when both are positive', () => {
    renderFilters({ filteredCount: 7, totalCount: 42 });
    expect(screen.getByText('7/42')).toBeInTheDocument();
  });

  it('renders the filtered/total count when filtered is less than total', () => {
    renderFilters({ filteredCount: 3, totalCount: 10 });
    expect(screen.getByText('3/10')).toBeInTheDocument();
  });

  it('renders the filtered/total count when filtered equals total', () => {
    renderFilters({ filteredCount: 5, totalCount: 5 });
    expect(screen.getByText('5/5')).toBeInTheDocument();
  });

  it('does NOT fire any callback on initial render', () => {
    const onFilter = vi.fn();
    const onTierFilter = vi.fn();
    const onVetoOnly = vi.fn();
    renderFilters({ onFilter, onTierFilter, onVetoOnly });
    expect(onFilter).not.toHaveBeenCalled();
    expect(onTierFilter).not.toHaveBeenCalled();
    expect(onVetoOnly).not.toHaveBeenCalled();
  });

  it('rerendering with a new filter value updates the input', () => {
    const { rerender, props } = renderFilters({ filter: '' });
    expect(
      (screen.getByRole('textbox', { name: 'Filter specialists' }) as HTMLInputElement)
        .value,
    ).toBe('');
    rerender(<SpecialistsSearchFilters {...props} filter="role-x" />);
    expect(
      (screen.getByRole('textbox', { name: 'Filter specialists' }) as HTMLInputElement)
        .value,
    ).toBe('role-x');
  });

  it('rerendering filter from non-empty to empty hides the clear filter button', () => {
    const { rerender, props } = renderFilters({ filter: 'auth' });
    expect(
      screen.getByRole('button', { name: 'Clear filter' }),
    ).toBeInTheDocument();
    rerender(<SpecialistsSearchFilters {...props} filter="" />);
    expect(
      screen.queryByRole('button', { name: 'Clear filter' }),
    ).not.toBeInTheDocument();
  });

  it('rerendering with a new tierFilter value updates the select', () => {
    const { rerender, props } = renderFilters({ tierFilter: 'any' });
    let select = screen.getByRole('combobox', {
      name: 'Tier filter',
    }) as HTMLSelectElement;
    expect(select.value).toBe('any');
    rerender(<SpecialistsSearchFilters {...props} tierFilter="review" />);
    select = screen.getByRole('combobox', {
      name: 'Tier filter',
    }) as HTMLSelectElement;
    expect(select.value).toBe('review');
  });

  it('rerendering with new counts updates the displayed numbers', () => {
    const { rerender, props } = renderFilters({
      filteredCount: 0,
      totalCount: 0,
    });
    expect(screen.getByText('0/0')).toBeInTheDocument();
    rerender(
      <SpecialistsSearchFilters
        {...props}
        filteredCount={12}
        totalCount={99}
      />,
    );
    expect(screen.getByText('12/99')).toBeInTheDocument();
    expect(screen.queryByText('0/0')).not.toBeInTheDocument();
  });

  it('re-renders translated labels when the locale flips to ko', () => {
    renderFilters();
    expect(
      screen.getByRole('textbox', { name: 'Filter specialists' }),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByRole('textbox', { name: 'Filter specialists' }),
    ).not.toBeInTheDocument();
  });
});
