import { describe, it, expect } from 'vitest';
import {
  isInterventionActive,
  mapWorkerStatusToBadgeVariant,
  statusLabel,
  groupOf,
} from './worker-classify';
import type { Worker } from '../types';

// worker-classify exposes four pure helpers shared between WorkerList,
// HierarchyTree, and ControlPanel. Tests pin the v8.21 string-enum
// contract for intervention plus the v8.37 tier-based grouping with
// its name-pattern fallback.

function makeWorker(overrides: Partial<Worker> = {}): Worker {
  return {
    name: 'w1',
    command: 'claude',
    target: 'local',
    branch: null,
    worktree: null,
    parent: null,
    scope: false,
    pid: null,
    status: 'idle',
    unreadSnapshots: 0,
    totalSnapshots: 0,
    intervention: null,
    lastQuestion: null,
    errorCount: 0,
    phase: null,
    testFailCount: 0,
    ...overrides,
  };
}

describe('isInterventionActive', () => {
  it('returns false for null / undefined / blank intervention', () => {
    expect(isInterventionActive(null)).toBe(false);
    expect(isInterventionActive(undefined)).toBe(false);
    expect(isInterventionActive(makeWorker({ intervention: null }))).toBe(false);
  });

  it('returns true only for the "approval_pending" string-enum value (v8.21 narrowed contract)', () => {
    expect(
      isInterventionActive(makeWorker({ intervention: 'approval_pending' })),
    ).toBe(true);
  });

  it('returns false for the other string-enum members ("background_exit", "past_resolved") -- informational only', () => {
    expect(
      isInterventionActive(makeWorker({ intervention: 'background_exit' })),
    ).toBe(false);
    expect(
      isInterventionActive(makeWorker({ intervention: 'past_resolved' })),
    ).toBe(false);
  });

  it('returns true for the legacy object form when active is undefined (legacy default-truthy fallback)', () => {
    expect(
      isInterventionActive(makeWorker({ intervention: { reason: 'x' } })),
    ).toBe(true);
  });

  it('returns true for the legacy object form when active is true', () => {
    expect(
      isInterventionActive(makeWorker({ intervention: { active: true } })),
    ).toBe(true);
  });

  it('returns false for the legacy object form when active is false', () => {
    expect(
      isInterventionActive(makeWorker({ intervention: { active: false } })),
    ).toBe(false);
  });
});

describe('mapWorkerStatusToBadgeVariant', () => {
  it('maps an active intervention to "destructive" regardless of status', () => {
    expect(
      mapWorkerStatusToBadgeVariant(
        makeWorker({ intervention: 'approval_pending', status: 'idle' }),
      ),
    ).toBe('destructive');
    expect(
      mapWorkerStatusToBadgeVariant(
        makeWorker({ intervention: 'approval_pending', status: 'busy' }),
      ),
    ).toBe('destructive');
  });

  it('maps status="busy" (without intervention) to "warning"', () => {
    expect(
      mapWorkerStatusToBadgeVariant(makeWorker({ status: 'busy' })),
    ).toBe('warning');
  });

  it('maps status="idle" (without intervention) to "success"', () => {
    expect(
      mapWorkerStatusToBadgeVariant(makeWorker({ status: 'idle' })),
    ).toBe('success');
  });

  it('maps status="exited" (without intervention) to "secondary"', () => {
    expect(
      mapWorkerStatusToBadgeVariant(makeWorker({ status: 'exited' })),
    ).toBe('secondary');
  });

  it('intervention precedence overrides exited', () => {
    expect(
      mapWorkerStatusToBadgeVariant(
        makeWorker({ status: 'exited', intervention: 'approval_pending' }),
      ),
    ).toBe('destructive');
  });
});

describe('statusLabel', () => {
  it('returns "intervention" when an intervention is active', () => {
    expect(
      statusLabel(makeWorker({ intervention: 'approval_pending' })),
    ).toBe('intervention');
  });

  it('returns the raw worker.status when no intervention is active', () => {
    expect(statusLabel(makeWorker({ status: 'idle' }))).toBe('idle');
    expect(statusLabel(makeWorker({ status: 'busy' }))).toBe('busy');
    expect(statusLabel(makeWorker({ status: 'exited' }))).toBe('exited');
  });

  it('background_exit / past_resolved still surface the raw status (only approval_pending masks)', () => {
    expect(
      statusLabel(makeWorker({ status: 'busy', intervention: 'background_exit' })),
    ).toBe('busy');
    expect(
      statusLabel(makeWorker({ status: 'idle', intervention: 'past_resolved' })),
    ).toBe('idle');
  });
});

describe('groupOf', () => {
  it('returns "manager" when tier="manager" regardless of name', () => {
    expect(
      groupOf(makeWorker({ name: 'anything', tier: 'manager' })),
    ).toBe('manager');
  });

  it('returns "worker" when tier="worker"', () => {
    expect(
      groupOf(makeWorker({ name: 'anything', tier: 'worker' })),
    ).toBe('worker');
  });

  it('returns "worker" when tier is an unknown non-"manager" string', () => {
    expect(
      groupOf(makeWorker({ name: 'anything', tier: 'scribe' as unknown as 'worker' })),
    ).toBe('worker');
  });

  it('falls back to the c4-mgr-* name pattern when tier is absent', () => {
    expect(groupOf(makeWorker({ name: 'c4-mgr-foo' }))).toBe('manager');
    expect(groupOf(makeWorker({ name: 'C4-MGR-bar' }))).toBe('manager');
  });

  it('falls back to the auto-mgr* name pattern when tier is absent', () => {
    expect(groupOf(makeWorker({ name: 'auto-mgr' }))).toBe('manager');
    expect(groupOf(makeWorker({ name: 'auto-mgr-3' }))).toBe('manager');
  });

  it('falls back to the *-mgr-* name pattern when tier is absent', () => {
    expect(groupOf(makeWorker({ name: 'team-mgr-1' }))).toBe('manager');
    expect(groupOf(makeWorker({ name: 'TEAM-MGR-1' }))).toBe('manager');
  });

  it('defaults to "worker" when neither tier nor a manager-pattern name matches', () => {
    expect(groupOf(makeWorker({ name: 'worker-1' }))).toBe('worker');
    expect(groupOf(makeWorker({ name: 'demo-3' }))).toBe('worker');
    expect(groupOf(makeWorker({ name: 'manager-no-dash' }))).toBe('worker');
  });

  it('tier="manager" wins over a non-manager-pattern name', () => {
    expect(
      groupOf(makeWorker({ name: 'worker-1', tier: 'manager' })),
    ).toBe('manager');
  });

  it('tier="worker" falls through to the name pattern (a manager-pattern name still classifies as manager)', () => {
    // The `if (w.tier && w.tier !== 'worker')` short-circuit only fires
    // for *unknown* tiers; tier="worker" specifically lets the
    // name-pattern fallback run. This preserves the pre-8.37 behaviour
    // for daemons that populate tier="worker" by default.
    expect(
      groupOf(makeWorker({ name: 'c4-mgr-foo', tier: 'worker' })),
    ).toBe('manager');
  });
});
