import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ColumnPicker } from './column-picker';
import type { ColumnPickerColumn } from './column-picker';

const COLUMNS: ColumnPickerColumn[] = [
  { id: 'name', label: 'Name', alwaysVisible: true },
  { id: 'status', label: 'Status' },
  { id: 'branch', label: 'Branch' },
];

function Harness({
  initial,
  storageKey,
}: {
  initial?: string[];
  storageKey?: string;
}) {
  const [value, setValue] = useState<string[]>(
    initial ?? COLUMNS.map((c) => c.id),
  );
  return (
    <div>
      {storageKey ? (
        <ColumnPicker
          columns={COLUMNS}
          value={value}
          onChange={setValue}
          storageKey={storageKey}
        />
      ) : (
        <ColumnPicker
          columns={COLUMNS}
          value={value}
          onChange={setValue}
        />
      )}
      <div data-testid="value">{value.join(',')}</div>
    </div>
  );
}

describe('<ColumnPicker>', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders button with default Columns label', () => {
    render(
      <ColumnPicker columns={COLUMNS} value={['name']} onChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /columns/i })).toBeInTheDocument();
  });

  it('opens the popover on trigger click and lists all columns', async () => {
    const user = userEvent.setup();
    render(
      <ColumnPicker
        columns={COLUMNS}
        value={['name', 'status']}
        onChange={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /columns/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Visible columns')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Branch')).toBeInTheDocument();
  });

  it('toggles a column visibility via checkbox click and calls onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ColumnPicker
        columns={COLUMNS}
        value={['name', 'status', 'branch']}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: /columns/i }));
    await user.click(screen.getByLabelText('Status'));
    expect(onChange).toHaveBeenCalledWith(['name', 'branch']);
  });

  it('disables alwaysVisible columns in the UI', async () => {
    const user = userEvent.setup();
    render(
      <ColumnPicker
        columns={COLUMNS}
        value={['name']}
        onChange={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /columns/i }));
    expect(screen.getByLabelText('Name')).toBeDisabled();
    expect(screen.getByLabelText('Status')).not.toBeDisabled();
  });

  it('Reset restores all columns to visible', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ColumnPicker
        columns={COLUMNS}
        value={['name']}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: /columns/i }));
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onChange).toHaveBeenLastCalledWith(['name', 'status', 'branch']);
  });

  it('seeds initial value from localStorage when storageKey is provided', async () => {
    window.localStorage.setItem(
      'test:column-picker',
      JSON.stringify(['name', 'branch']),
    );
    render(<Harness storageKey="test:column-picker" />);
    // Effect runs synchronously after mount; verify projected value
    expect(screen.getByTestId('value').textContent).toBe('name,branch');
  });

  it('persists onChange writes to localStorage when storageKey is provided', async () => {
    const user = userEvent.setup();
    render(<Harness storageKey="test:column-picker-write" />);
    await user.click(screen.getByRole('button', { name: /columns/i }));
    await user.click(screen.getByLabelText('Branch'));
    const stored = window.localStorage.getItem('test:column-picker-write');
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored as string)).toEqual(['name', 'status']);
  });

  it('merges className on the trigger', () => {
    render(
      <ColumnPicker
        columns={COLUMNS}
        value={['name']}
        onChange={vi.fn()}
        className="extra-class"
      />,
    );
    expect(
      screen.getByRole('button', { name: /columns/i }).className,
    ).toContain('extra-class');
  });

  it('forwards ref to the trigger button', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <ColumnPicker
        columns={COLUMNS}
        value={['name']}
        onChange={vi.fn()}
        ref={ref}
      />,
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('renders a custom buttonLabel', () => {
    render(
      <ColumnPicker
        columns={COLUMNS}
        value={['name']}
        onChange={vi.fn()}
        buttonLabel="Fields"
      />,
    );
    expect(screen.getByRole('button', { name: /fields/i })).toBeInTheDocument();
  });
});
