import { useEffect, useState } from 'react';
import { NotificationBanner } from './ui/notification-banner';
import { apiGet } from '../lib/api';

interface AutonomousStatus {
  enabled: boolean;
  paused?: boolean;
  pauseReason?: string | null;
  consecutiveHalts?: number;
  circuitThreshold?: number;
  pendingEscalations?: number;
}

export default function AutonomousStatusBanner() {
  const [status, setStatus] = useState<AutonomousStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const s = await apiGet<AutonomousStatus>('/api/autonomous/status');
        if (!cancelled) setStatus(s);
      } catch {
        if (!cancelled) setStatus(null);
      }
    };
    load();
    const id = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (!status || !status.enabled) return null;

  const halted =
    typeof status.consecutiveHalts === 'number' &&
    typeof status.circuitThreshold === 'number' &&
    status.circuitThreshold > 0 &&
    status.consecutiveHalts >= status.circuitThreshold;
  const hasEscalation = (status.pendingEscalations || 0) > 0;

  if (halted) {
    return (
      <NotificationBanner
        variant="critical"
        title="Autonomous loop halted"
        description={`Circuit breaker tripped after ${status.consecutiveHalts} consecutive halts.`}
      />
    );
  }
  if (hasEscalation) {
    return (
      <NotificationBanner
        variant="critical"
        title="Reviewer attention required"
        description={`${status.pendingEscalations} pending escalation${
          (status.pendingEscalations || 0) === 1 ? '' : 's'
        }.`}
      />
    );
  }
  if (status.paused) {
    return (
      <NotificationBanner
        variant="warn"
        title="Autonomous loop paused"
        description={status.pauseReason || 'Paused manually.'}
      />
    );
  }
  return null;
}
