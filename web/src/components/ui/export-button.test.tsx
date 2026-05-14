import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportButton } from './export-button';

const rows = [
  { name: 'a', count: 1 },
  { name: 'b', count: 2 },
];

describe('<ExportButton>', () => {
  let createURL: ReturnType<typeof vi.fn>;
  let revokeURL: ReturnType<typeof vi.fn>;
  let click: ReturnType<typeof vi.fn>;
  let lastFilename = '';
  let origCreate: typeof URL.createObjectURL;
  let origRevoke: typeof URL.revokeObjectURL;

  beforeEach(() => {
    createURL = vi.fn(() => 'blob:mock');
    revokeURL = vi.fn();
    click = vi.fn();
    lastFilename = '';
    origCreate = URL.createObjectURL;
    origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeURL as unknown as typeof URL.revokeObjectURL;
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = (() => {
          lastFilename = (el as HTMLAnchorElement).download;
          click();
        }) as unknown as () => void;
      }
      return el;
    });
  });

  afterEach(() => {
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
    vi.restoreAllMocks();
  });

  it('renders an Export label with the Download icon', () => {
    render(<ExportButton rows={rows} filename="data" />);
    expect(screen.getByText('Export')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /export/i });
    expect(btn.querySelector('svg')).toBeTruthy();
  });

  it('single-format click triggers an immediate download', async () => {
    const user = userEvent.setup();
    render(
      <ExportButton rows={rows} filename="data.csv" formats={['csv']} />,
    );
    await user.click(screen.getByRole('button', { name: /export/i }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(lastFilename).toBe('data.csv');
  });

  it('multi-format click opens a dropdown menu of formats', async () => {
    const user = userEvent.setup();
    render(<ExportButton rows={rows} filename="data" />);
    await user.click(screen.getByRole('button', { name: /export/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'CSV' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'JSON' })).toBeInTheDocument();
  });

  it('dropdown CSV item triggers a CSV export', async () => {
    const user = userEvent.setup();
    render(<ExportButton rows={rows} filename="data" />);
    await user.click(screen.getByRole('button', { name: /export/i }));
    await user.click(screen.getByRole('menuitem', { name: 'CSV' }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(lastFilename).toMatch(/^data-\d{8}\.csv$/);
  });

  it('dropdown JSON item triggers a JSON export', async () => {
    const user = userEvent.setup();
    render(<ExportButton rows={rows} filename="data" />);
    await user.click(screen.getByRole('button', { name: /export/i }));
    await user.click(screen.getByRole('menuitem', { name: 'JSON' }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(lastFilename).toMatch(/^data-\d{8}\.json$/);
  });

  it('respects the disabled prop', () => {
    render(<ExportButton rows={rows} filename="data" disabled />);
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled();
  });

  it('forwards ref to the trigger button', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<ExportButton ref={ref} rows={rows} filename="data" formats={['csv']} />);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
