import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Uptime from './Uptime';
import { _resetDaemonRestartTracker } from '../lib/use-daemon-restart-tracker';
import * as api from '../lib/api';

beforeEach(() => {
  _resetDaemonRestartTracker();
  vi.restoreAllMocks();
});

function stubHealthAndStatus(opts: {
  health?: Partial<import('../lib/use-health').HealthPayload>;
  status?: Partial<import('../lib/use-autonomous-incidents').AutonomousStatusPayload>;
}) {
  vi.spyOn(api, 'apiGet').mockImplementation(async (path: string) => {
    if (path === '/api/health') {
      return {
        ok: true,
        pid: 12345,
        uptime: 3600, // 1 hour
        startedAt: '2026-05-15T09:00:00Z',
        version: '1.11.249',
        workers: 2,
        ...(opts.health ?? {}),
      };
    }
    if (path === '/api/autonomous/status') {
      return {
        enabled: true,
        recent: [],
        escalations: [],
        ...(opts.status ?? {}),
      };
    }
    return {} as unknown;
  });
}

describe('<Uptime>', () => {
  it('renders the PageFrame title + description', async () => {
    stubHealthAndStatus({});
    render(<Uptime />);
    await waitFor(() => {
      expect(screen.getByText('Uptime')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Daemon process uptime, operator-local restart count/i),
    ).toBeInTheDocument();
  });

  it('renders the daemon process card with pid + version', async () => {
    stubHealthAndStatus({});
    render(<Uptime />);
    await waitFor(() => {
      expect(screen.getByTestId('uptime-card')).toBeInTheDocument();
    });
    expect(screen.getByText('12345')).toBeInTheDocument();
    expect(screen.getByText('1.11.249')).toBeInTheDocument();
  });

  it('renders the restart counter card with the initial value 0', async () => {
    stubHealthAndStatus({});
    render(<Uptime />);
    await waitFor(() => {
      expect(screen.getByTestId('restart-card')).toBeInTheDocument();
    });
    expect(screen.getByTestId('restart-count').textContent).toBe('0');
  });

  it('renders the "All clear" empty-state when there are no incidents', async () => {
    stubHealthAndStatus({});
    render(<Uptime />);
    await waitFor(() => {
      expect(screen.getByText('All clear')).toBeInTheDocument();
    });
  });

  it('renders a list of incidents when status.recent + escalations are populated', async () => {
    stubHealthAndStatus({
      status: {
        recent: [
          { type: 'halt', id: '11.42', at: 1000, reason: 'circuit-breaker' },
          { type: 'dispatch-error', id: '11.43', at: 2000, reason: 'config bad' },
        ],
        escalations: [
          { id: 7, todoId: '11.44', reason: 'reviewer pause', createdAt: 3000 },
        ],
      },
    });
    render(<Uptime />);
    await waitFor(() => {
      const list = screen.queryByTestId('incidents-list');
      expect(list).not.toBeNull();
    });
    const list = screen.getByTestId('incidents-list');
    expect(list.children.length).toBe(3);
    // Newest-first ordering.
    expect(screen.getByText('reviewer pause')).toBeInTheDocument();
    expect(screen.getByText('config bad')).toBeInTheDocument();
    expect(screen.getByText('circuit-breaker')).toBeInTheDocument();
  });

  it('caps the incident list at 5 entries even when the status payload has more', async () => {
    stubHealthAndStatus({
      status: {
        recent: [
          { type: 'halt', at: 10, reason: 'r1' },
          { type: 'halt', at: 20, reason: 'r2' },
          { type: 'halt', at: 30, reason: 'r3' },
          { type: 'halt', at: 40, reason: 'r4' },
          { type: 'halt', at: 50, reason: 'r5' },
          { type: 'halt', at: 60, reason: 'r6' },
          { type: 'halt', at: 70, reason: 'r7' },
        ],
      },
    });
    render(<Uptime />);
    await waitFor(() => {
      expect(screen.getByTestId('incidents-list')).toBeInTheDocument();
    });
    expect(screen.getByTestId('incidents-list').children.length).toBe(5);
  });
});
