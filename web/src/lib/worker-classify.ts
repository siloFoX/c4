// (v1.10.572) Worker classification helpers — pure functions
// over the Worker type. Lifted from WorkerList + HierarchyTree
// where they had drifted (HierarchyTree's isInterventionActive
// missed the v8.21 string-enum form). Shared lib means a single
// source of truth.

import type { BadgeVariant } from '../components/ui';
import type { Worker } from '../types';

// (v1.10.780) BadgeVariant alias adopted from ui/badge —
// was redeclared here as `NonNullable<BadgeProps['variant']>`.

// (8.21) Server emits the narrowed string enum:
//   'approval_pending' | 'background_exit' | 'past_resolved' | null
// Only approval_pending counts as "needs human"; bg-exit and
// past_resolved are informational breadcrumbs.
//
// Legacy object form `{ active?, reason? }` still observed in
// older daemon versions; we keep the fallback so a half-upgraded
// fleet renders correctly.
export function isInterventionActive(w: Worker | null | undefined): boolean {
  if (!w || !w.intervention) return false;
  if (typeof w.intervention === 'string') {
    return w.intervention === 'approval_pending';
  }
  const active = (w.intervention as { active?: unknown }).active;
  return active === undefined ? true : Boolean(active);
}

export function mapWorkerStatusToBadgeVariant(w: Worker): BadgeVariant {
  if (isInterventionActive(w)) return 'destructive';
  if (w.status === 'busy') return 'warning';
  if (w.status === 'idle') return 'success';
  return 'secondary';
}

export function statusLabel(w: Worker): string {
  return isInterventionActive(w) ? 'intervention' : w.status;
}

// (TODO 8.37) Resolve a worker's group bucket from its `tier` field
// (added by daemon's /api/list in 8.37). Falls back to a name-pattern
// heuristic for compatibility with pre-8.37 daemons that don't fold
// tier into the response.
export function groupOf(w: Worker): 'manager' | 'worker' {
  if (w.tier === 'manager') return 'manager';
  if (w.tier && w.tier !== 'worker') return 'worker';
  // Fallback: c4-mgr-*, auto-mgr, *-mgr-* are conventional manager names.
  if (/^c4-mgr/i.test(w.name)) return 'manager';
  if (/^auto-mgr/i.test(w.name)) return 'manager';
  if (/-mgr-/i.test(w.name)) return 'manager';
  return 'worker';
}
