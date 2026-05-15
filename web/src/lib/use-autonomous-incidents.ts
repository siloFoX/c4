import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';

// (v1.11.249, TODO 11.231) Pulls /api/autonomous/status and
// extracts a unified list of "incidents" -- the autonomous
// loop's halt + dispatch-error events from `recent[]` plus the
// reviewer escalations from `escalations[]`. The page surface
// (pages/Uptime.tsx) renders the top-N by recency so an operator
// gets a one-glance answer to "what went wrong lately".

// The daemon's auto-dispatcher emits these `recent[]` entry
// types today (see src/auto-dispatcher.js _append paths):
//   dispatch       -- a worker was sent a task
//   success        -- the worker reported success
//   halt           -- the loop tripped the halt path
//   dispatch-error -- the daemon could not dispatch
// Plus optional fields { kind, reason, id }. The Incident view
// keeps the union narrow -- only halt + dispatch-error count as
// "things that broke" alongside escalations.

export type RecentEntryType =
  | 'dispatch'
  | 'success'
  | 'halt'
  | 'dispatch-error';

export interface RecentEntry {
  type: RecentEntryType;
  id?: string | null;
  at: number;
  kind?: string;
  reason?: string;
  [key: string]: unknown;
}

export interface EscalationEntry {
  id: number;
  todoId?: string | null;
  reason?: string;
  kind?: string;
  suggestedAction?: string;
  status?: 'pending' | 'resolved';
  createdAt: number;
  resolvedAt?: number | null;
  [key: string]: unknown;
}

export interface AutonomousStatusPayload {
  enabled?: boolean;
  paused?: boolean;
  recent?: RecentEntry[];
  escalations?: EscalationEntry[];
  pendingEscalations?: number;
  [key: string]: unknown;
}

export interface Incident {
  /** Stable key for React lists. */
  readonly key: string;
  /** Canonical kind. `halt` covers both the loop halt + dispatch-error;
   *  `escalation` covers the reviewer escalations queue. */
  readonly kind: 'halt' | 'escalation' | 'dispatch-error';
  /** Optional TODO / dispatch id, used to anchor the row to context. */
  readonly id: string | null;
  /** Human-readable description (the entry's reason or a fallback). */
  readonly reason: string;
  /** Epoch ms timestamp. */
  readonly at: number;
}

const POLL_INTERVAL_MS = 30000;
const MAX_INCIDENTS = 5;

function recentToIncident(entry: RecentEntry, index: number): Incident | null {
  if (entry.type !== 'halt' && entry.type !== 'dispatch-error') return null;
  return {
    key: `recent-${entry.type}-${entry.at}-${index}`,
    kind: entry.type,
    id: entry.id ?? null,
    reason: entry.reason ?? entry.kind ?? entry.type,
    at: entry.at,
  };
}

function escalationToIncident(entry: EscalationEntry): Incident {
  return {
    key: `escalation-${entry.id}`,
    kind: 'escalation',
    id: entry.todoId ?? null,
    reason: entry.reason ?? entry.kind ?? 'escalation',
    at: entry.createdAt,
  };
}

export function toIncidents(
  payload: AutonomousStatusPayload | null,
): Incident[] {
  if (!payload) return [];
  const out: Incident[] = [];
  for (const [i, entry] of (payload.recent ?? []).entries()) {
    const inc = recentToIncident(entry, i);
    if (inc) out.push(inc);
  }
  for (const entry of payload.escalations ?? []) {
    out.push(escalationToIncident(entry));
  }
  // Newest first; cap to MAX_INCIDENTS.
  out.sort((a, b) => b.at - a.at);
  return out.slice(0, MAX_INCIDENTS);
}

export interface UseAutonomousIncidentsState {
  status: AutonomousStatusPayload | null;
  incidents: Incident[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useAutonomousIncidents(): UseAutonomousIncidentsState {
  const [status, setStatus] = useState<AutonomousStatusPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiGet<AutonomousStatusPayload>('/api/autonomous/status');
      setStatus(r);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  return { status, incidents: toIncidents(status), loading, error, refresh };
}
