import { useContext, useEffect, useRef, useState } from 'react';
import { AlertOctagon, AlertTriangle } from 'lucide-react';
import { NotificationBanner } from './ui/notification-banner';
import { apiGet } from '../lib/api';
import { AnnounceContext } from '../hooks/use-announce';

interface AutonomousStatus {
  enabled: boolean;
  paused?: boolean;
  pauseReason?: string | null;
  consecutiveHalts?: number;
  circuitThreshold?: number;
  pendingEscalations?: number;
}

type LifecycleKind = 'dispatch' | 'complete' | 'halt' | 'escalation';

export default function AutonomousStatusBanner() {
  const [status, setStatus] = useState<AutonomousStatus | null>(null);
  const announce = useContext(AnnounceContext);
  const lastKindRef = useRef<LifecycleKind | null>(null);

  useEffect(() => {
    if (!status || !announce) return;
    const halted =
      typeof status.consecutiveHalts === 'number' &&
      typeof status.circuitThreshold === 'number' &&
      status.circuitThreshold > 0 &&
      status.consecutiveHalts >= status.circuitThreshold;
    const hasEscalation = (status.pendingEscalations || 0) > 0;
    let kind: LifecycleKind | null = null;
    let title = '';
    if (halted) {
      kind = 'halt';
      title = `Autonomous loop halted (${status.consecutiveHalts} consecutive halts)`;
    } else if (hasEscalation) {
      kind = 'escalation';
      title = `${status.pendingEscalations} pending escalation${
        (status.pendingEscalations || 0) === 1 ? '' : 's'
      }`;
    } else if (status.paused) {
      kind = 'dispatch';
      title = status.pauseReason || 'Autonomous loop paused';
    } else if (status.enabled) {
      kind = 'complete';
      title = 'Autonomous loop running';
    }
    if (kind && kind !== lastKindRef.current) {
      lastKindRef.current = kind;
      const priority = kind === 'halt' || kind === 'escalation' ? 'assertive' : 'polite';
      announce(`[${kind}] ${title}`, priority);
    }
  }, [status, announce]);

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

  // (v1.11.1116, TODO 11.1098) text-foreground raises the banner text
  // to WCAG AA on the light destructive/10 (and warning/10) tint -- the
  // NotificationBanner variants default to text-*-foreground, which is
  // near-white (0 0% 98%) and washed out (~1:1) on the light-pink/amber
  // background. The colored AlertOctagon / AlertTriangle icon keeps the
  // critical / warning cue, and the counts are bold.
  if (halted) {
    return (
      <NotificationBanner
        variant="critical"
        className="text-foreground"
        icon={<AlertOctagon className="h-5 w-5 text-destructive" aria-hidden="true" />}
        data-section="autonomous-status-banner"
        title="Autonomous loop halted"
        description={
          <span>
            Circuit breaker tripped after{' '}
            <span className="font-bold">{status.consecutiveHalts}</span> consecutive halts.
          </span>
        }
      />
    );
  }
  if (hasEscalation) {
    return (
      <NotificationBanner
        variant="critical"
        className="text-foreground"
        icon={<AlertOctagon className="h-5 w-5 text-destructive" aria-hidden="true" />}
        data-section="autonomous-status-banner"
        title="Reviewer attention required"
        description={
          <span>
            <span className="font-bold" data-testid="banner-pending-count">
              {status.pendingEscalations}
            </span>{' '}
            pending escalation{(status.pendingEscalations || 0) === 1 ? '' : 's'}.
          </span>
        }
      />
    );
  }
  if (status.paused) {
    return (
      <NotificationBanner
        variant="warn"
        className="text-foreground"
        icon={<AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" />}
        data-section="autonomous-status-banner"
        title="Autonomous loop paused"
        description={status.pauseReason || 'Paused manually.'}
      />
    );
  }
  return null;
}
