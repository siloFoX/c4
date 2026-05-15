import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DecisionLog from './DecisionLog';
import { DECISION_LOG_ENTRIES } from './decision-log-entries';

describe('<DecisionLog>', () => {
  it('renders the PageFrame title + description', () => {
    render(<DecisionLog />);
    expect(screen.getByText('Decision Log')).toBeInTheDocument();
    expect(
      screen.getByText(/ADR-style log of architectural decisions/i),
    ).toBeInTheDocument();
  });

  it('renders one card per entry in the seed log', () => {
    render(<DecisionLog />);
    const list = screen.getByTestId('decision-log-list');
    expect(list.children.length).toBe(DECISION_LOG_ENTRIES.length);
    for (const entry of DECISION_LOG_ENTRIES) {
      expect(screen.getByTestId(`decision-${entry.id}`)).toBeInTheDocument();
    }
  });

  it('renders the entry title + id for each card', () => {
    render(<DecisionLog />);
    for (const entry of DECISION_LOG_ENTRIES) {
      expect(screen.getByText(entry.title)).toBeInTheDocument();
      expect(screen.getByText(entry.id)).toBeInTheDocument();
    }
  });

  it('renders a status Badge per entry (Accepted for the 5 seed entries)', () => {
    render(<DecisionLog />);
    // The seed log is all-Accepted; assert at least one Accepted
    // badge plus the same count as the entry list.
    const accepted = screen.getAllByText('Accepted');
    expect(accepted.length).toBe(DECISION_LOG_ENTRIES.length);
  });

  it('renders date + version chips for every entry', () => {
    render(<DecisionLog />);
    // Multiple seed entries share the same date (2026-05-15) so a
    // direct getByText would collide; assert that each unique date
    // string appears in the rendered DOM.
    const uniqueDates = new Set(DECISION_LOG_ENTRIES.map((e) => e.date));
    for (const date of uniqueDates) {
      expect(screen.getAllByText(date).length).toBeGreaterThan(0);
    }
    for (const entry of DECISION_LOG_ENTRIES) {
      if (entry.version) {
        expect(screen.getByText(entry.version)).toBeInTheDocument();
      }
    }
  });

  it('filters by title substring', async () => {
    const user = userEvent.setup();
    render(<DecisionLog />);
    const filter = screen.getByLabelText('Filter decision log');
    await user.type(filter, 'pino');
    // Only the "Structured logging via pino" entry should remain.
    expect(screen.getByText(/Structured logging via pino/)).toBeInTheDocument();
    expect(screen.queryByText('Daemon checkpoint protocol')).toBeNull();
    expect(screen.getByTestId('decision-log-count').textContent).toContain('1 / 5');
  });

  it('shows the empty-state message when nothing matches', async () => {
    const user = userEvent.setup();
    render(<DecisionLog />);
    const filter = screen.getByLabelText('Filter decision log');
    await user.type(filter, 'totally-nonexistent-keyword-zzz');
    expect(screen.getByRole('status')).toHaveTextContent(
      /No decisions match/i,
    );
    expect(screen.queryByTestId('decision-log-list')).toBeNull();
  });

  it('renders the three ADR sections (Context / Decision / Consequences) per card', () => {
    render(<DecisionLog />);
    const headings = screen.getAllByRole('heading', { level: 3 });
    // Three sections per entry.
    expect(headings.length).toBe(DECISION_LOG_ENTRIES.length * 3);
    const labels = new Set(headings.map((h) => h.textContent ?? ''));
    expect(labels.has('Context')).toBe(true);
    expect(labels.has('Decision')).toBe(true);
    expect(labels.has('Consequences')).toBe(true);
  });
});
