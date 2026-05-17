import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NativeSelect } from './select';
import type { NativeSelectOption } from './select';

const BASE_OPTIONS: NativeSelectOption[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
  { value: 'tsv', label: 'TSV', disabled: true },
];

function Harness({
  initial = 'csv',
  ...props
}: Partial<React.ComponentProps<typeof NativeSelect>> & {
  initial?: string;
}) {
  const [value, setValue] = useState<string>(initial);
  return (
    <NativeSelect
      options={BASE_OPTIONS}
      value={value}
      onChange={setValue}
      aria-label="format"
      {...props}
    />
  );
}

describe('<NativeSelect>', () => {
  it('renders one <option> per item plus their labels', () => {
    render(<Harness />);
    const select = screen.getByRole('combobox', {
      name: 'format',
    }) as HTMLSelectElement;
    expect(select.options).toHaveLength(3);
    expect(select.options[0]!.value).toBe('csv');
    expect(select.options[0]!.textContent).toBe('CSV');
    expect(select.options[1]!.value).toBe('json');
    expect(select.options[2]!.value).toBe('tsv');
    expect(select.options[2]!.disabled).toBe(true);
  });

  it('reflects the controlled value via the select element', () => {
    render(<Harness initial="json" />);
    const select = screen.getByRole('combobox', {
      name: 'format',
    }) as HTMLSelectElement;
    expect(select.value).toBe('json');
  });

  it('onChange fires with the picked value on user selection', async () => {
    const onChange = vi.fn();
    render(
      <NativeSelect
        options={BASE_OPTIONS}
        value="csv"
        onChange={onChange}
        aria-label="format"
      />,
    );
    const select = screen.getByRole('combobox', { name: 'format' });
    await userEvent.selectOptions(select, 'json');
    expect(onChange).toHaveBeenCalledWith('json');
  });

  it('default size="md" applies the h-10 px-3 dimensions + data-size attr', () => {
    render(<Harness />);
    const select = screen.getByRole('combobox', { name: 'format' });
    expect(select).toHaveClass('h-10');
    expect(select.getAttribute('data-size')).toBe('md');
  });

  it('size="sm" applies the h-8 px-2 dimensions + data-size attr', () => {
    render(<Harness size="sm" />);
    const select = screen.getByRole('combobox', { name: 'format' });
    expect(select).toHaveClass('h-8');
    expect(select.getAttribute('data-size')).toBe('sm');
  });

  it('error=true flips aria-invalid + swaps in the destructive border', () => {
    render(<Harness error />);
    const select = screen.getByRole('combobox', { name: 'format' });
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveClass('border-destructive');
    expect(select).not.toHaveClass('border-input');
    expect(select.getAttribute('data-error')).toBe('true');
  });

  it('error=false (default) leaves aria-invalid unset + keeps border-input', () => {
    render(<Harness />);
    const select = screen.getByRole('combobox', { name: 'format' });
    expect(select).not.toHaveAttribute('aria-invalid');
    expect(select).toHaveClass('border-input');
    expect(select.getAttribute('data-error')).toBe('false');
  });

  it('icon slot renders inside data-section="native-select-icon" wrapper', () => {
    const { container } = render(
      <Harness icon={<span data-testid="my-icon">F</span>} />,
    );
    expect(
      container.querySelector('[data-section="native-select-icon"]'),
    ).not.toBeNull();
    expect(screen.getByTestId('my-icon')).toBeInTheDocument();
  });

  it('icon slot adds the per-size leading padding to the select', () => {
    render(
      <Harness icon={<span>x</span>} size="md" />,
    );
    expect(screen.getByRole('combobox', { name: 'format' })).toHaveClass(
      'pl-9',
    );
  });

  it('chevron renders inside data-section="native-select-chevron" wrapper', () => {
    const { container } = render(<Harness />);
    expect(
      container.querySelector('[data-section="native-select-chevron"]'),
    ).not.toBeNull();
  });

  it('placeholder renders as a hidden disabled first option', () => {
    render(<Harness placeholder="Pick one" initial="" />);
    const select = screen.getByRole('combobox', {
      name: 'format',
    }) as HTMLSelectElement;
    expect(select.options[0]!.value).toBe('');
    expect(select.options[0]!.hidden).toBe(true);
    expect(select.options[0]!.disabled).toBe(true);
    expect(select.options[0]!.textContent).toBe('Pick one');
  });

  it('disabled prop disables the select element', () => {
    render(<Harness disabled />);
    const select = screen.getByRole('combobox', { name: 'format' });
    expect(select).toBeDisabled();
  });

  it('exposes data-section="native-select" on the select element', () => {
    render(<Harness />);
    expect(
      screen.getByRole('combobox', { name: 'format' }).getAttribute(
        'data-section',
      ),
    ).toBe('native-select');
  });

  it('exposes data-section="native-select-root" on the wrapper span', () => {
    const { container } = render(<Harness />);
    expect(
      container.querySelector('[data-section="native-select-root"]'),
    ).not.toBeNull();
  });

  it('merges caller className onto the select', () => {
    render(<Harness className="extra" />);
    expect(
      screen.getByRole('combobox', { name: 'format' }),
    ).toHaveClass('extra');
  });

  it('forwards extra props (id) onto the select element', () => {
    render(<Harness id="fmt-input" />);
    expect(
      screen.getByRole('combobox', { name: 'format' }).getAttribute('id'),
    ).toBe('fmt-input');
  });

  it('exposes a stable displayName for devtools', () => {
    expect(NativeSelect.displayName).toBe('NativeSelect');
  });

  it('handles a native fireEvent.change for non-userEvent contexts', () => {
    const onChange = vi.fn();
    render(
      <NativeSelect
        options={BASE_OPTIONS}
        value="csv"
        onChange={onChange}
        aria-label="format"
      />,
    );
    const select = screen.getByRole('combobox', { name: 'format' });
    fireEvent.change(select, { target: { value: 'json' } });
    expect(onChange).toHaveBeenCalledWith('json');
  });
});
