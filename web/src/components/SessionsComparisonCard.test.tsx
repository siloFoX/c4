import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { setLocale } from '../lib/i18n';

// SessionsComparisonCard is a pure-display side-by-side comparison
// table. The component owns no hooks of its own beyond useLocale
// (i18n subscription) so tests drive the only prop (className)
// directly and assert the rendered structure: title, table header
// columns, one row per COMPARISON_ROW_KEYS entry, and the i18n
// lookups for label/attached/live cell copy. No callbacks to wire
// or busy state to flip — locale flip is the only state mutation.

import SessionsComparisonCard from './SessionsComparisonCard';

beforeEach(() => {
  setLocale('en');
});

describe('<SessionsComparisonCard>', () => {
  // ---- title + heading -------------------------------------------

  it('renders the comparison title from the i18n bundle', () => {
    render(<SessionsComparisonCard />);
    expect(
      screen.getByText('Attached session vs Live worker'),
    ).toBeInTheDocument();
  });

  it('marks the BookOpen icon as aria-hidden so it does not steal the title accessible name', () => {
    const { container } = render(<SessionsComparisonCard />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  // ---- table structure -------------------------------------------

  it('renders the comparison table with the i18n aria-label', () => {
    render(<SessionsComparisonCard />);
    const table = screen.getByRole('table', {
      name: 'Attached vs Live comparison',
    });
    expect(table).toBeInTheDocument();
  });

  it('renders exactly three column headers (empty + Attached + Live worker)', () => {
    render(<SessionsComparisonCard />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(3);
  });

  it('renders the empty first column header (spacer for the row label column)', () => {
    render(<SessionsComparisonCard />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers[0].textContent).toBe('');
  });

  it('renders the "Attached" column header from the i18n bundle', () => {
    render(<SessionsComparisonCard />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers[1]).toHaveTextContent('Attached');
  });

  it('renders the "Live worker" column header from the i18n bundle', () => {
    render(<SessionsComparisonCard />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers[2]).toHaveTextContent('Live worker');
  });

  // ---- row body --------------------------------------------------

  it('renders one tbody row per COMPARISON_ROW_KEYS entry (four rows)', () => {
    const { container } = render(<SessionsComparisonCard />);
    const tbody = container.querySelector('tbody');
    expect(tbody).not.toBeNull();
    const rows = within(tbody as HTMLElement).getAllByRole('row');
    expect(rows).toHaveLength(4);
  });

  it('renders the Mode row label, attached cell, and live cell', () => {
    render(<SessionsComparisonCard />);
    expect(screen.getByText('Mode')).toBeInTheDocument();
    expect(screen.getByText('Read-only view')).toBeInTheDocument();
    expect(screen.getByText('Interactive PTY')).toBeInTheDocument();
  });

  it('renders the Source row label, attached cell, and live cell', () => {
    render(<SessionsComparisonCard />);
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('JSONL transcript')).toBeInTheDocument();
    expect(screen.getByText('Live pty stream')).toBeInTheDocument();
  });

  it('renders the Updates row label, attached cell, and live cell', () => {
    render(<SessionsComparisonCard />);
    expect(screen.getByText('Updates')).toBeInTheDocument();
    expect(screen.getByText('Re-parse on refresh')).toBeInTheDocument();
    expect(screen.getByText('Real-time SSE')).toBeInTheDocument();
  });

  it('renders the Resume row label, attached cell, and live cell', () => {
    render(<SessionsComparisonCard />);
    expect(screen.getByText('Resume')).toBeInTheDocument();
    expect(screen.getByText('claude --resume <id>')).toBeInTheDocument();
    expect(screen.getByText('Already running')).toBeInTheDocument();
  });

  it('renders three cells per body row (label + attached + live)', () => {
    const { container } = render(<SessionsComparisonCard />);
    const tbody = container.querySelector('tbody');
    const rows = within(tbody as HTMLElement).getAllByRole('row');
    for (const row of rows) {
      expect(within(row).getAllByRole('cell')).toHaveLength(3);
    }
  });

  // ---- className wiring ------------------------------------------

  it('applies the default max-w-md class to the Card wrapper when no className is passed', () => {
    const { container } = render(<SessionsComparisonCard />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toMatch(/max-w-md/);
  });

  it('merges the caller-provided className onto the Card wrapper', () => {
    const { container } = render(
      <SessionsComparisonCard className="self-end" />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toMatch(/self-end/);
  });

  it('keeps the default max-w-md class even when a custom className is also provided', () => {
    const { container } = render(
      <SessionsComparisonCard className="self-end" />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toMatch(/max-w-md/);
    expect(card.className).toMatch(/self-end/);
  });

  it('treats an undefined className the same as no className', () => {
    const { container } = render(
      <SessionsComparisonCard className={undefined} />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toMatch(/max-w-md/);
  });

  // ---- rerender stability ----------------------------------------

  it('rerendering with the same props does not duplicate the title', () => {
    const { rerender } = render(<SessionsComparisonCard />);
    rerender(<SessionsComparisonCard />);
    expect(
      screen.getAllByText('Attached session vs Live worker'),
    ).toHaveLength(1);
  });

  it('rerendering with a new className swaps the wrapper class', () => {
    const { rerender, container } = render(
      <SessionsComparisonCard className="self-end" />,
    );
    expect((container.firstChild as HTMLElement).className).toMatch(/self-end/);
    rerender(<SessionsComparisonCard className="self-start" />);
    expect((container.firstChild as HTMLElement).className).toMatch(/self-start/);
    expect((container.firstChild as HTMLElement).className).not.toMatch(/self-end/);
  });

  // ---- locale flip ----------------------------------------------

  it('re-renders the title in Korean when the locale flips to ko', () => {
    render(<SessionsComparisonCard />);
    expect(
      screen.getByText('Attached session vs Live worker'),
    ).toBeInTheDocument();
    act(() => {
      setLocale('ko');
    });
    expect(
      screen.queryByText('Attached session vs Live worker'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Attached 세션 vs Live 워커'),
    ).toBeInTheDocument();
  });

  it('re-renders the column headers when the locale flips to ko', () => {
    render(<SessionsComparisonCard />);
    act(() => {
      setLocale('ko');
    });
    const headers = screen.getAllByRole('columnheader');
    expect(headers[1]).toHaveTextContent('연결됨');
    expect(headers[2]).toHaveTextContent('실행 중 워커');
  });

  it('re-renders the row labels when the locale flips to ko', () => {
    render(<SessionsComparisonCard />);
    act(() => {
      setLocale('ko');
    });
    expect(screen.getByText('모드')).toBeInTheDocument();
    expect(screen.getByText('소스')).toBeInTheDocument();
    expect(screen.getByText('업데이트')).toBeInTheDocument();
    expect(screen.getByText('재개')).toBeInTheDocument();
  });
});
