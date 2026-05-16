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

  // (v1.11.282, TODO 11.264) showFirstLast + showJumpToPage extensions.

  it('does NOT render First / Last buttons by default', () => {
    render(<Pagination page={3} totalPages={5} onPageChange={() => {}} />);
    expect(screen.queryByRole('button', { name: 'First' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Last' })).toBeNull();
  });

  it('renders First / Last buttons when showFirstLast is true', () => {
    render(
      <Pagination
        page={3}
        totalPages={5}
        onPageChange={() => {}}
        showFirstLast
      />,
    );
    expect(screen.getByRole('button', { name: 'First' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Last' })).toBeInTheDocument();
  });

  it('First button jumps to page 1', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <Pagination
        page={5}
        totalPages={20}
        onPageChange={onPageChange}
        showFirstLast
      />,
    );
    await user.click(screen.getByRole('button', { name: 'First' }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('Last button jumps to the final page', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <Pagination
        page={5}
        totalPages={20}
        onPageChange={onPageChange}
        showFirstLast
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Last' }));
    expect(onPageChange).toHaveBeenCalledWith(20);
  });

  it('First is disabled on page 1; Last is disabled on the final page', () => {
    const { rerender } = render(
      <Pagination
        page={1}
        totalPages={5}
        onPageChange={() => {}}
        showFirstLast
      />,
    );
    expect(screen.getByRole('button', { name: 'First' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Last' })).not.toBeDisabled();
    rerender(
      <Pagination
        page={5}
        totalPages={5}
        onPageChange={() => {}}
        showFirstLast
      />,
    );
    expect(screen.getByRole('button', { name: 'First' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Last' })).toBeDisabled();
  });

  it('firstLabel / lastLabel override the visible button text', () => {
    render(
      <Pagination
        page={3}
        totalPages={5}
        onPageChange={() => {}}
        showFirstLast
        firstLabel="<<"
        lastLabel=">>"
      />,
    );
    expect(screen.getByRole('button', { name: '<<' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '>>' })).toBeInTheDocument();
  });

  it('does NOT render the jump-to-page form by default', () => {
    const { container } = render(
      <Pagination page={3} totalPages={5} onPageChange={() => {}} />,
    );
    expect(
      container.querySelector('[data-pagination-jump-form]'),
    ).toBeNull();
  });

  it('renders a jump-to-page input + Go button when showJumpToPage is true', () => {
    render(
      <Pagination
        page={3}
        totalPages={50}
        onPageChange={() => {}}
        showJumpToPage
      />,
    );
    expect(
      screen.getByRole('spinbutton', { name: 'Jump to page' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
  });

  it('Go is disabled while the input is empty', () => {
    render(
      <Pagination
        page={3}
        totalPages={50}
        onPageChange={() => {}}
        showJumpToPage
      />,
    );
    expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled();
  });

  it('typing then clicking Go fires onPageChange with the parsed value', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <Pagination
        page={3}
        totalPages={50}
        onPageChange={onPageChange}
        showJumpToPage
      />,
    );
    const input = screen.getByRole('spinbutton', { name: 'Jump to page' });
    await user.type(input, '17');
    await user.click(screen.getByRole('button', { name: 'Go' }));
    expect(onPageChange).toHaveBeenCalledWith(17);
  });

  it('pressing Enter inside the jump input also submits', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <Pagination
        page={3}
        totalPages={50}
        onPageChange={onPageChange}
        showJumpToPage
      />,
    );
    const input = screen.getByRole('spinbutton', { name: 'Jump to page' });
    await user.type(input, '8{Enter}');
    expect(onPageChange).toHaveBeenCalledWith(8);
  });

  it('clamps out-of-range jumps to [1, totalPages]', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <Pagination
        page={3}
        totalPages={10}
        onPageChange={onPageChange}
        showJumpToPage
      />,
    );
    const input = screen.getByRole('spinbutton', { name: 'Jump to page' });
    await user.type(input, '99{Enter}');
    expect(onPageChange).toHaveBeenCalledWith(10);
  });

  it('does NOT fire onPageChange when the jump target equals the current page', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <Pagination
        page={3}
        totalPages={10}
        onPageChange={onPageChange}
        showJumpToPage
      />,
    );
    const input = screen.getByRole('spinbutton', { name: 'Jump to page' });
    await user.type(input, '3{Enter}');
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('non-numeric draft does not submit and clears Go', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <Pagination
        page={3}
        totalPages={10}
        onPageChange={onPageChange}
        showJumpToPage
      />,
    );
    const input = screen.getByRole('spinbutton', { name: 'Jump to page' });
    // Numeric input filters non-digits; typing letters yields ''.
    await user.type(input, 'abc');
    expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled();
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('exposes data-section + data-current-page + data-total-pages on the nav root', () => {
    const { container } = render(
      <Pagination page={3} totalPages={20} onPageChange={() => {}} />,
    );
    const nav = container.querySelector('[data-section="pagination"]');
    expect(nav).not.toBeNull();
    expect(nav!.getAttribute('data-current-page')).toBe('3');
    expect(nav!.getAttribute('data-total-pages')).toBe('20');
  });

  it('exposes data-pagination-action on Prev / Next (and First / Last when shown)', () => {
    const { container } = render(
      <Pagination
        page={3}
        totalPages={20}
        onPageChange={() => {}}
        showFirstLast
      />,
    );
    expect(
      container.querySelector('[data-pagination-action="prev"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-pagination-action="next"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-pagination-action="first"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-pagination-action="last"]'),
    ).not.toBeNull();
  });

  it('exposes data-pagination-page on every numbered button', () => {
    const { container } = render(
      <Pagination page={3} totalPages={5} onPageChange={() => {}} />,
    );
    for (let i = 1; i <= 5; i++) {
      expect(
        container.querySelector(`[data-pagination-page="${i}"]`),
      ).not.toBeNull();
    }
  });
});
