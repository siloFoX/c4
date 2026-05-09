import { useEffect, useState } from 'react';
import { apiGet } from './api';

// (v1.10.682) Extracted from SpecialistsAuditPanel. The
// audit-log poll — GET /api/specialists/audit?limit=50
// every 30s while the panel is open. The window
// selector ('all' | '1h' | '24h' | '7d') translates
// into the `since` URL param. Cancelled-flag race
// guard so a fast open→close→open won't stamp a stale
// list.

export interface AuditEntry {
  ts: string;
  action: string;
  id?: string | null;
  actor?: string | null;
  reason?: string | null;
  mode?: string | null;
  meetingId?: string | null;
}

export type AuditWindow = 'all' | '1h' | '24h' | '7d';

interface SpecialistsAuditState {
  auditEntries: AuditEntry[];
  auditLoading: boolean;
  auditWindow: AuditWindow;
  setAuditWindow: (next: AuditWindow) => void;
}

export function useSpecialistsAudit(args: {
  auditOpen: boolean;
}): SpecialistsAuditState {
  const { auditOpen } = args;
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditWindow, setAuditWindow] = useState<AuditWindow>('all');

  useEffect(() => {
    if (!auditOpen) return undefined;
    let cancelled = false;
    const fetchAudit = () => {
      setAuditLoading(true);
      const qs = new URLSearchParams({ limit: '50' });
      if (auditWindow !== 'all') {
        const hours = auditWindow === '1h' ? 1 : auditWindow === '24h' ? 24 : 24 * 7;
        const sinceMs = Date.now() - hours * 60 * 60 * 1000;
        qs.set('since', new Date(sinceMs).toISOString());
      }
      apiGet<{ count: number; entries: AuditEntry[] }>(`/api/specialists/audit?${qs.toString()}`)
        .then((res) => { if (!cancelled) setAuditEntries(res.entries || []); })
        .catch(() => { /* tolerate */ })
        .finally(() => { if (!cancelled) setAuditLoading(false); });
    };
    fetchAudit();
    const id = window.setInterval(fetchAudit, 30000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [auditOpen, auditWindow]);

  return { auditEntries, auditLoading, auditWindow, setAuditWindow };
}
