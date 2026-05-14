import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BulkActionToolbar } from './bulk-action-toolbar';

const noop = () => undefined;

describe('<BulkActionToolbar>', () => {
  it('does not render when selectedCount is 0', () => {
    const { container } = render(
      <BulkActionToolbar selectedCount={0} actions={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders when selectedCount >= 1', () => {
    render(<BulkActionToolbar selectedCount={1} actions={[]} />);
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
  });

  it('shows N selected count label (singular)', () => {
    render(<BulkActionToolbar selectedCount={1} actions={[]} />);
    expect(screen.getByText('1 item selected')).toBeInTheDocument();
  });

  it('shows N selected count label (plural)', () => {
    render(<BulkActionToolbar selectedCount={3} actions={[]} />);
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('renders action buttons', () => {
    render(
      <BulkActionToolbar
        selectedCount={2}
        actions={[
          { id: 'a', label: 'Archive', onClick: noop },
          { id: 'b', label: 'Tag', onClick: noop },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tag' })).toBeInTheDocument();
  });

  it('calls onClick when an action button is clicked', async () => {
    const onClick = vi.fn();
    render(
      <BulkActionToolbar
        selectedCount={2}
        actions={[{ id: 'kill', label: 'Kill', onClick }]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Kill' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies destructive variant for tone="danger"', () => {
    render(
      <BulkActionToolbar
        selectedCount={1}
        actions={[{ id: 'd', label: 'Delete', onClick: noop, tone: 'danger' }]}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Delete' });
    expect(btn.className).toContain('bg-destructive');
  });

  it('renders the clear button when onClearSelection is provided', () => {
    render(
      <BulkActionToolbar
        selectedCount={1}
        actions={[]}
        onClearSelection={noop}
      />,
    );
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeInTheDocument();
  });

  it('fires onClearSelection when the clear button is clicked', async () => {
    const onClear = vi.fn();
    render(
      <BulkActionToolbar
        selectedCount={1}
        actions={[]}
        onClearSelection={onClear}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('omits the clear button when onClearSelection is absent', () => {
    render(<BulkActionToolbar selectedCount={1} actions={[]} />);
    expect(screen.queryByRole('button', { name: 'Clear selection' })).toBeNull();
  });

  it('applies bottom fixed classes by default', () => {
    render(<BulkActionToolbar selectedCount={1} actions={[]} />);
    const root = screen.getByRole('toolbar');
    expect(root.className).toContain('fixed');
    expect(root.className).toContain('bottom-4');
  });

  it('applies sticky top classes when position="top"', () => {
    render(<BulkActionToolbar selectedCount={1} actions={[]} position="top" />);
    const root = screen.getByRole('toolbar');
    expect(root.className).toContain('sticky');
    expect(root.className).toContain('top-0');
  });

  it('merges caller-provided className', () => {
    render(
      <BulkActionToolbar selectedCount={1} actions={[]} className="my-bar" />,
    );
    expect(screen.getByRole('toolbar').className).toContain('my-bar');
  });

  it('has role="toolbar" with forwarded aria-label', () => {
    render(
      <BulkActionToolbar
        selectedCount={1}
        actions={[]}
        ariaLabel="Worker bulk actions"
      />,
    );
    expect(
      screen.getByRole('toolbar', { name: 'Worker bulk actions' }),
    ).toBeInTheDocument();
  });

  it('forwards refs to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<BulkActionToolbar ref={ref} selectedCount={1} actions={[]} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('respects disabled flag on actions', () => {
    render(
      <BulkActionToolbar
        selectedCount={1}
        actions={[{ id: 'x', label: 'Nope', onClick: noop, disabled: true }]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Nope' })).toBeDisabled();
  });
});
