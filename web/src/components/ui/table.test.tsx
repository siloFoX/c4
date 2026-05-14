import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Table } from './table';
import type { TableColumn, TableSortDir } from './table';

interface Row {
  id: number;
  name: string;
  count: number;
}

const COLUMNS: TableColumn<Row>[] = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'count', label: 'Count', sortable: true, align: 'right' },
  { key: 'id', label: 'ID' },
];

const ROWS: Row[] = [
  { id: 1, name: 'alpha', count: 10 },
  { id: 2, name: 'bravo', count: 20 },
  { id: 3, name: 'charlie', count: 30 },
];

describe('<Table>', () => {
  it('renders columns + rows in a semantic table', () => {
    render(<Table columns={COLUMNS} rows={ROWS} ariaLabel="Test" />);
    const table = screen.getByRole('table', { name: 'Test' });
    expect(table.tagName).toBe('TABLE');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(3);
    const bodyRows = within(table).getAllByRole('row');
    // 1 header row + 3 data rows
    expect(bodyRows).toHaveLength(4);
    expect(within(table).getByText('alpha')).toBeInTheDocument();
    expect(within(table).getByText('30')).toBeInTheDocument();
  });

  it('sortable header is a button; non-sortable header is plain text', () => {
    render(<Table columns={COLUMNS} rows={ROWS} />);
    const headers = screen.getAllByRole('columnheader');
    // name + count have a button child
    expect(within(headers[0]!).getByRole('button', { name: /Name/ })).toBeInTheDocument();
    expect(within(headers[1]!).getByRole('button', { name: /Count/ })).toBeInTheDocument();
    // id is plain text -- no button
    expect(within(headers[2]!).queryByRole('button')).toBeNull();
    expect(headers[2]!.textContent).toContain('ID');
  });

  it('aria-sort reflects active sortKey and direction', () => {
    const { rerender } = render(
      <Table columns={COLUMNS} rows={ROWS} sortKey="name" sortDir="asc" />,
    );
    let headers = screen.getAllByRole('columnheader');
    expect(headers[0]!).toHaveAttribute('aria-sort', 'ascending');
    expect(headers[1]!).toHaveAttribute('aria-sort', 'none');
    rerender(
      <Table columns={COLUMNS} rows={ROWS} sortKey="count" sortDir="desc" />,
    );
    headers = screen.getAllByRole('columnheader');
    expect(headers[0]!).toHaveAttribute('aria-sort', 'none');
    expect(headers[1]!).toHaveAttribute('aria-sort', 'descending');
  });

  it('non-sortable headers omit aria-sort', () => {
    render(<Table columns={COLUMNS} rows={ROWS} sortKey="name" sortDir="asc" />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers[2]!).not.toHaveAttribute('aria-sort');
  });

  it('clicking a sortable header toggles asc -> desc -> asc via onSortChange', async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    const Wrapper = () => {
      const [key, setKey] = useState<string | undefined>(undefined);
      const [dir, setDir] = useState<TableSortDir | undefined>(undefined);
      const extra: { sortKey?: string; sortDir?: TableSortDir } = {};
      if (key !== undefined) extra.sortKey = key;
      if (dir !== undefined) extra.sortDir = dir;
      return (
        <Table
          columns={COLUMNS}
          rows={ROWS}
          {...extra}
          onSortChange={(k, d) => {
            onSortChange(k, d);
            setKey(k);
            setDir(d);
          }}
        />
      );
    };
    render(<Wrapper />);
    const nameBtn = screen.getByRole('button', { name: /Name/ });
    await user.click(nameBtn);
    expect(onSortChange).toHaveBeenLastCalledWith('name', 'asc');
    await user.click(nameBtn);
    expect(onSortChange).toHaveBeenLastCalledWith('name', 'desc');
    await user.click(nameBtn);
    expect(onSortChange).toHaveBeenLastCalledWith('name', 'asc');
  });

  it('non-sortable header click does not fire onSortChange', async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    render(
      <Table columns={COLUMNS} rows={ROWS} onSortChange={onSortChange} />,
    );
    const headers = screen.getAllByRole('columnheader');
    await user.click(headers[2]!);
    expect(onSortChange).not.toHaveBeenCalled();
  });

  it('applies striped class to odd data rows when striped=true', () => {
    const { container } = render(
      <Table columns={COLUMNS} rows={ROWS} striped />,
    );
    const bodyRows = container.querySelectorAll('tbody tr');
    expect(bodyRows[0]!.className).not.toContain('bg-muted/40');
    expect(bodyRows[1]!.className).toContain('bg-muted/40');
    expect(bodyRows[2]!.className).not.toContain('bg-muted/40');
  });

  it('does not apply striped class when striped is omitted', () => {
    const { container } = render(<Table columns={COLUMNS} rows={ROWS} />);
    const bodyRows = container.querySelectorAll('tbody tr');
    for (const r of bodyRows) {
      expect(r.className).not.toContain('bg-muted/40');
    }
  });

  it('stickyHeader=true applies sticky + bg classes to thead', () => {
    const { container } = render(
      <Table columns={COLUMNS} rows={ROWS} stickyHeader />,
    );
    const thead = container.querySelector('thead');
    expect(thead?.className).toContain('sticky');
    expect(thead?.className).toContain('top-0');
    expect(thead?.className).toContain('z-10');
    expect(thead?.className).toContain('bg-background');
  });

  it('omits sticky classes when stickyHeader is not set', () => {
    const { container } = render(<Table columns={COLUMNS} rows={ROWS} />);
    const thead = container.querySelector('thead');
    expect(thead?.className).not.toContain('sticky');
  });

  it('ariaLabel is applied to the underlying <table>', () => {
    render(<Table columns={COLUMNS} rows={ROWS} ariaLabel="My data" />);
    const table = screen.getByRole('table', { name: 'My data' });
    expect(table).toHaveAttribute('aria-label', 'My data');
  });

  it('uses col.render when provided, else falls back to row[key]', () => {
    const cols: TableColumn<Row>[] = [
      { key: 'name', label: 'Name' },
      {
        key: 'count',
        label: 'Count',
        render: (row) => <strong data-testid={`bold-${row.id}`}>x{row.count}</strong>,
      },
    ];
    render(<Table columns={cols} rows={ROWS} />);
    expect(screen.getByTestId('bold-1').textContent).toBe('x10');
    expect(screen.getByText('alpha')).toBeInTheDocument();
  });

  it('renders empty message when rows are empty + emptyMessage provided', () => {
    render(
      <Table columns={COLUMNS} rows={[]} emptyMessage="No data" />,
    );
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('uses rowKey when supplied to derive keys (does not crash)', () => {
    const { container } = render(
      <Table
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => `row-${r.id}`}
      />,
    );
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
  });

  it('exposes a stable displayName', () => {
    expect(Table.displayName).toBe('Table');
  });
});
