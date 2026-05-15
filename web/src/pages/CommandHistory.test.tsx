import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CommandHistory from './CommandHistory';
import {
  COMMAND_HISTORY_STORAGE_KEY,
  recordCommandHistory,
} from '../lib/command-history';

beforeEach(() => {
  window.localStorage.removeItem(COMMAND_HISTORY_STORAGE_KEY);
});

afterEach(() => {
  window.localStorage.removeItem(COMMAND_HISTORY_STORAGE_KEY);
});

describe('<CommandHistory>', () => {
  it('renders the empty state when there is no history', () => {
    render(<CommandHistory />);
    expect(screen.getByText('No history yet')).toBeInTheDocument();
  });

  it('disables the Clear button when there is no history', () => {
    render(<CommandHistory />);
    expect(screen.getByTestId('command-history-clear')).toBeDisabled();
  });

  it('renders one row per persisted entry, newest first', () => {
    recordCommandHistory({ id: 'a', label: 'A', section: 'Navigate', at: 100 });
    recordCommandHistory({ id: 'b', label: 'B', section: 'Workers', at: 200 });
    recordCommandHistory({ id: 'c', label: 'C', section: 'Queue', at: 300 });
    render(<CommandHistory />);
    const list = screen.getByTestId('command-history-list');
    expect(list.children.length).toBe(3);
    const labels = Array.from(list.querySelectorAll('span')).map(
      (el) => el.textContent ?? '',
    );
    // First card should be C, then B, then A.
    expect(labels[0]).toBe('Queue');
  });

  it('shows the Rerun button when the id resolves against the current registry', () => {
    recordCommandHistory({
      id: 'nav:settings-page',
      label: 'Settings',
      section: 'Navigate',
      at: 1000,
    });
    render(<CommandHistory />);
    // The settings-page command is one of the known FEATURES, so
    // its rerun button must render.
    expect(
      screen.getByTestId('command-history-rerun-nav:settings-page-1000'),
    ).toBeInTheDocument();
  });

  it('shows "Unavailable" when the id no longer resolves', () => {
    recordCommandHistory({
      id: 'nav:i-do-not-exist',
      label: 'Phantom',
      section: 'Navigate',
      at: 9999,
    });
    render(<CommandHistory />);
    expect(
      screen.getByTestId(
        'command-history-unavailable-nav:i-do-not-exist-9999',
      ),
    ).toBeInTheDocument();
  });

  it('clears the history when the Clear button is pressed', async () => {
    recordCommandHistory({ id: 'a', label: 'A', section: 'Navigate', at: 100 });
    const user = userEvent.setup();
    render(<CommandHistory />);
    await user.click(screen.getByTestId('command-history-clear'));
    expect(screen.queryByTestId('command-history-list')).toBeNull();
    expect(screen.getByText('No history yet')).toBeInTheDocument();
  });

  it('section badge variant maps Navigate -> info, Workers -> success, Queue -> warning', () => {
    recordCommandHistory({ id: 'nav:x', label: 'Nav X', section: 'Navigate', at: 100 });
    recordCommandHistory({ id: 'work:x', label: 'Work X', section: 'Workers', at: 200 });
    recordCommandHistory({ id: 'queue:x', label: 'Queue X', section: 'Queue', at: 300 });
    render(<CommandHistory />);
    // The Badge component emits classNames keyed by the variant
    // (bg-info / bg-success / bg-warning). Confirm at least one
    // of each survives the render.
    const list = screen.getByTestId('command-history-list');
    expect(list.innerHTML).toMatch(/bg-info\b/);
    expect(list.innerHTML).toMatch(/bg-success\b/);
    expect(list.innerHTML).toMatch(/bg-warning\b/);
  });
});
