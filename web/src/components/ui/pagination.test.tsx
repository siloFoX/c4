import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from './pagination';

describe('<Pagination>', () => {
  it('renders only the single page button when totalPages=1 (no ellipsis, prev+next disabled)', () => {
    render(<Pagination page={1} totalPages={1} onPageChange={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Pagination' });
    expect(nav).toBeInTheDocument();
    expect(within(nav).queryAllByTestId('pagination-ellipsis')).toHaveLength(0);
    expect(within(nav).getByRole('button', { name: 'Prev' })).toBeDisabled();
    expect(within(nav).getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(within(nav).getByRole('button', { name: 'Page 1' })).toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: 'Page 2' })).toBeNull();
  });

  it('renders all 5 numbered buttons without ellipsis when total=5 and page=3', () => {
    render(<Pagination page={3} totalPages={5} onPageChange={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Pagination' });
    expect(within(nav).queryAllByTestId('pagination-ellipsis')).toHaveLength(0);
    for (let i = 1; i <= 5; i++) {
      expect(within(nav).getByRole('button', { name: `Page ${i}` })).toBeInTheDocument();
    }
  });

  it('renders truncated form with two ellipsis spans when total=20 and page=10', () => {
    render(<Pagination page={10} totalPages={20} onPageChange={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Pagination' });
    expect(within(nav).queryAllByTestId('pagination-ellipsis')).toHaveLength(2);
    expect(within(nav).getByRole('button', { name: 'Page 1' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Page 9' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Page 10' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Page 11' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Page 20' })).toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: 'Page 5' })).toBeNull();
  });

  it('shows the expected sequence 1 ... 4 5 6 ... 20 when page=5 of 20 with default siblingCount', () => {
    render(<Pagination page={5} totalPages={20} onPageChange={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Pagination' });
    const pageButtons = within(nav)
      .getAllByRole('button')
      .filter((b) => /^Page \d+$/.test(b.getAttribute('aria-label') || ''))
      .map((b) => Number(b.textContent));
    expect(pageButtons).toEqual([1, 4, 5, 6, 20]);
    expect(within(nav).queryAllByTestId('pagination-ellipsis')).toHaveLength(2);
  });

  it('calls onPageChange with the page number when a numbered button is clicked', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={10} totalPages={20} onPageChange={onPageChange} />);
    await user.click(screen.getByRole('button', { name: 'Page 11' }));
    expect(onPageChange).toHaveBeenCalledWith(11);
  });

  it('calls onPageChange with page-1 on Prev click and page+1 on Next click', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={5} totalPages={20} onPageChange={onPageChange} />);
    await user.click(screen.getByRole('button', { name: 'Prev' }));
    expect(onPageChange).toHaveBeenLastCalledWith(4);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenLastCalledWith(6);
  });

  it('marks the active page button with aria-current="page"', () => {
    render(<Pagination page={3} totalPages={5} onPageChange={() => {}} />);
    const active = screen.getByRole('button', { name: 'Page 3' });
    expect(active).toHaveAttribute('aria-current', 'page');
    const other = screen.getByRole('button', { name: 'Page 2' });
    expect(other).not.toHaveAttribute('aria-current');
  });

  it('disables Prev on page 1 and Next on the final page', () => {
    const { rerender } = render(
      <Pagination page={1} totalPages={5} onPageChange={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Prev' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled();
    rerender(<Pagination page={5} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Prev' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('does not fire onPageChange when clicking the already-active page', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={3} totalPages={5} onPageChange={onPageChange} />);
    await user.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(onPageChange).not.toHaveBeenCalled();
  });
});
