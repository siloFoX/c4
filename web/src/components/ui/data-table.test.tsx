import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { DataTable, type DataTableColumn } from './data-table';
import type {
  ColumnFilter,
  SortDescriptor,
} from '../../lib/data-table-state';

interface Row {
  id: string;
  name: string;
  age: number;
  status: 'open' | 'closed';
}

const SAMPLE: Row[] = [
  { id: '1', name: 'Alice', age: 25, status: 'open' },
  { id: '2', name: 'Bob', age: 30, status: 'closed' },
  { id: '3', name: 'Carol', age: 27, status: 'open' },
];

const COLUMNS: DataTableColumn<Row>[] = [
  { key: 'name', label: 'Name', sortable: true, filter: { type: 'text' } },
  { key: 'age', label: 'Age', sortable: true, filter: { type: 'range' } },
  {
    key: 'status',
    label: 'Status',
    sortable: true,
    filter: {
      type: 'select',
      options: [
        { value: 'open' },
        { value: 'closed' },
      ],
    },
  },
];

interface HarnessProps {
  initialSort?: SortDescriptor[];
  initialFilters?: Record<string, ColumnFilter>;
}

function Harness({ initialSort = [], initialFilters = {} }: HarnessProps) {
  const [sortBy, setSortBy] = useState<SortDescriptor[]>(initialSort);
  const [filters, setFilters] =
    useState<Record<string, ColumnFilter>>(initialFilters);
  return (
    <DataTable
      columns={COLUMNS}
      rows={SAMPLE}
      sortBy={sortBy}
      onSortByChange={(next) => setSortBy([...next])}
      filters={filters}
      onFilterChange={(col, filter) =>
        setFilters((prev) => {
          const out = { ...prev };
          if (filter == null) delete out[col];
          else out[col] = filter;
          return out;
        })
      }
      rowKey={(row) => row.id}
      data-testid="harness-table"
    />
  );
}

describe('DataTable rendering', () => {
  it('renders one row per data row + a sortable header per column', () => {
    render(<Harness />);
    const table = screen.getByTestId('harness-table');
    const rows = within(table).getAllByRole('row');
    // header row + filter row + 3 data rows
    expect(rows.length).toBe(5);
    expect(screen.getByTestId('data-table-sort-name')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-sort-age')).toBeInTheDocument();
    expect(screen.getByTestId('data-table-sort-status')).toBeInTheDocument();
  });

  it('renders the empty message when no rows pass the filter', () => {
    const Wrap = () => (
      <DataTable
        columns={COLUMNS}
        rows={SAMPLE}
        sortBy={[]}
        onSortByChange={() => {}}
        filters={{ name: { type: 'text', value: 'zzz-nomatch' } }}
        onFilterChange={() => {}}
        emptyMessage="No results"
      />
    );
    render(<Wrap />);
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('sets aria-sort on the active column', () => {
    render(<Harness initialSort={[{ key: 'age', dir: 'desc' }]} />);
    const ageHeader = screen
      .getByTestId('harness-table')
      .querySelector('[data-column-key="age"]') as HTMLElement;
    expect(ageHeader.getAttribute('aria-sort')).toBe('descending');
  });
});

describe('DataTable sorting', () => {
  it('clicking a sortable header sorts asc', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('data-table-sort-name'));
    const rows = within(screen.getByTestId('harness-table'))
      .getAllByRole('row')
      .slice(2); // drop header + filter rows
    expect(rows[0]?.textContent).toContain('Alice');
    expect(rows[1]?.textContent).toContain('Bob');
    expect(rows[2]?.textContent).toContain('Carol');
  });

  it('second click flips to desc', () => {
    render(<Harness />);
    const trigger = screen.getByTestId('data-table-sort-name');
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    const rows = within(screen.getByTestId('harness-table'))
      .getAllByRole('row')
      .slice(2);
    expect(rows[0]?.textContent).toContain('Carol');
    expect(rows[1]?.textContent).toContain('Bob');
    expect(rows[2]?.textContent).toContain('Alice');
  });

  it('third click clears the sort', () => {
    render(<Harness />);
    const trigger = screen.getByTestId('data-table-sort-name');
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    const rows = within(screen.getByTestId('harness-table'))
      .getAllByRole('row')
      .slice(2);
    // Back to insertion order.
    expect(rows[0]?.textContent).toContain('Alice');
    expect(rows[1]?.textContent).toContain('Bob');
    expect(rows[2]?.textContent).toContain('Carol');
  });

  it('shift-click appends a secondary sort + shows priority badges', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('data-table-sort-status'));
    fireEvent.click(screen.getByTestId('data-table-sort-name'), {
      shiftKey: true,
    });
    // Two active sorts -> both show priority badges.
    expect(
      screen.getByTestId('data-table-sort-priority-status'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('data-table-sort-priority-name'),
    ).toBeInTheDocument();
    const rows = within(screen.getByTestId('harness-table'))
      .getAllByRole('row')
      .slice(2);
    // 'closed' comes before 'open' alphabetically;
    // within each status, names ascending.
    expect(rows[0]?.textContent).toContain('Bob');
    expect(rows[1]?.textContent).toContain('Alice');
    expect(rows[2]?.textContent).toContain('Carol');
  });

  it('only one priority badge is hidden when a single column is sorted', () => {
    render(<Harness initialSort={[{ key: 'age', dir: 'asc' }]} />);
    expect(
      screen.queryByTestId('data-table-sort-priority-age'),
    ).not.toBeInTheDocument();
  });
});

describe('DataTable filtering', () => {
  it('text filter narrows the visible rows', () => {
    render(<Harness />);
    fireEvent.change(screen.getByTestId('data-table-filter-text-name'), {
      target: { value: 'al' },
    });
    const rows = within(screen.getByTestId('harness-table'))
      .getAllByRole('row')
      .slice(2);
    expect(rows.length).toBe(1);
    expect(rows[0]?.textContent).toContain('Alice');
  });

  it('clearing the text filter restores all rows', () => {
    render(<Harness initialFilters={{ name: { type: 'text', value: 'al' } }} />);
    expect(
      within(screen.getByTestId('harness-table'))
        .getAllByRole('row')
        .slice(2).length,
    ).toBe(1);
    fireEvent.change(screen.getByTestId('data-table-filter-text-name'), {
      target: { value: '' },
    });
    expect(
      within(screen.getByTestId('harness-table'))
        .getAllByRole('row')
        .slice(2).length,
    ).toBe(3);
  });

  it('range filter respects min + max numeric bounds', () => {
    render(<Harness />);
    fireEvent.change(screen.getByTestId('data-table-filter-range-min-age'), {
      target: { value: '27' },
    });
    const rows = within(screen.getByTestId('harness-table'))
      .getAllByRole('row')
      .slice(2);
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Bob'),
        expect.stringContaining('Carol'),
      ]),
    );
  });

  it('select filter narrows by a single value', () => {
    render(<Harness />);
    fireEvent.change(screen.getByTestId('data-table-filter-select-status'), {
      target: { value: 'open' },
    });
    const rows = within(screen.getByTestId('harness-table'))
      .getAllByRole('row')
      .slice(2);
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Alice'),
        expect.stringContaining('Carol'),
      ]),
    );
  });
});

describe('DataTable accessor + render', () => {
  it('honours per-column render + accessor functions', () => {
    interface Item {
      id: string;
      title: string;
      tagsRaw: string;
    }
    const items: Item[] = [
      { id: 'a', title: 'AA', tagsRaw: 'low' },
      { id: 'b', title: 'BB', tagsRaw: 'high' },
    ];
    const cols: DataTableColumn<Item>[] = [
      {
        key: 'tags',
        label: 'Tags',
        sortable: true,
        accessor: (row) => row.tagsRaw,
        render: (row) => `T:${row.tagsRaw}`,
      },
      { key: 'title', label: 'Title' },
    ];
    const TestHarness = () => {
      const [sort, setSort] = useState<SortDescriptor[]>([
        { key: 'tags', dir: 'asc' },
      ]);
      return (
        <DataTable
          columns={cols}
          rows={items}
          sortBy={sort}
          onSortByChange={(next) => setSort([...next])}
          filters={{}}
          onFilterChange={() => {}}
          data-testid="test-accessor"
        />
      );
    };
    render(<TestHarness />);
    const rows = within(screen.getByTestId('test-accessor'))
      .getAllByRole('row')
      .slice(1); // no filter row -> skip header only
    expect(rows[0]?.textContent).toContain('T:high');
    expect(rows[1]?.textContent).toContain('T:low');
  });

  it('omits the filter row when no column declares a filter', () => {
    interface Item { name: string }
    const cols: DataTableColumn<Item>[] = [
      { key: 'name', label: 'Name', sortable: true },
    ];
    const items: Item[] = [{ name: 'x' }];
    const TestHarness = () => (
      <DataTable
        columns={cols}
        rows={items}
        sortBy={[]}
        onSortByChange={() => {}}
        filters={{}}
        onFilterChange={() => {}}
        data-testid="no-filter-table"
      />
    );
    render(<TestHarness />);
    const tableRows = within(screen.getByTestId('no-filter-table')).getAllByRole(
      'row',
    );
    // 1 header row + 1 data row, no filter row
    expect(tableRows.length).toBe(2);
  });
});

describe('DataTable callbacks', () => {
  it('emits onSortByChange with the next descriptor list', () => {
    const onSort = vi.fn();
    render(
      <DataTable
        columns={COLUMNS}
        rows={SAMPLE}
        sortBy={[]}
        onSortByChange={onSort}
        filters={{}}
        onFilterChange={() => {}}
        data-testid="cb-table"
      />,
    );
    fireEvent.click(screen.getByTestId('data-table-sort-age'));
    expect(onSort).toHaveBeenCalledWith([{ key: 'age', dir: 'asc' }]);
  });

  it('emits onFilterChange(col, filter) on text input', () => {
    const onFilter = vi.fn();
    render(
      <DataTable
        columns={COLUMNS}
        rows={SAMPLE}
        sortBy={[]}
        onSortByChange={() => {}}
        filters={{}}
        onFilterChange={onFilter}
        data-testid="cb-filter-table"
      />,
    );
    fireEvent.change(screen.getByTestId('data-table-filter-text-name'), {
      target: { value: 'xx' },
    });
    expect(onFilter).toHaveBeenCalledWith('name', {
      type: 'text',
      value: 'xx',
    });
  });

  it('emits onFilterChange(col, null) when the filter clears', () => {
    const onFilter = vi.fn();
    render(
      <DataTable
        columns={COLUMNS}
        rows={SAMPLE}
        sortBy={[]}
        onSortByChange={() => {}}
        filters={{ name: { type: 'text', value: 'foo' } }}
        onFilterChange={onFilter}
        data-testid="cb-clear-table"
      />,
    );
    fireEvent.change(screen.getByTestId('data-table-filter-text-name'), {
      target: { value: '' },
    });
    expect(onFilter).toHaveBeenCalledWith('name', null);
  });
});
