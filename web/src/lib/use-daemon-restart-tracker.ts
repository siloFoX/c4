import { useEffect, useState } from 'react';

// (v1.11.249, TODO 11.231) Operator-local restart counter. The
// daemon does not expose a "how many times have I restarted"
// counter today, so this hook tracks the daemon's pid +
// startedAt across renders and bumps a localStorage-backed
// counter every time either value changes. The count is per
// browser session-window per origin, which is exactly the
// "since I started watching" semantic an operator wants on the
// Uptime page.
//
// The contract is intentionally narrow:
//   - input:  { pid: number | undefined, startedAt: string | undefined }
//   - output: { restartCount, sinceFirstSeen }
//   - clearing localStorage resets the counter; the page does
//     not surface a "reset" affordance because the count is
//     not a permanent record.

const STORAGE_KEY = 'c4:uptime:restart-tracker';

interface TrackerState {
  // Snapshot of the last (pid, startedAt) pair we observed.
  lastPid: number | null;
  lastStartedAt: string | null;
  // First ISO timestamp we ever saw -- used to scope the
  // counter under a "since X" label.
  firstSeen: string | null;
  // Monotonically-increasing counter; bumped when either pid
  // or startedAt changes from its last-observed value.
  restartCount: number;
}

const EMPTY_STATE: TrackerState = {
  lastPid: null,
  lastStartedAt: null,
  firstSeen: null,
  restartCount: 0,
};

function readStored(): TrackerState {
  if (typeof window === 'undefined') return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<TrackerState>;
    return {
      lastPid: typeof parsed.lastPid === 'number' ? parsed.lastPid : null,
      lastStartedAt:
        typeof parsed.lastStartedAt === 'string' ? parsed.lastStartedAt : null,
      firstSeen: typeof parsed.firstSeen === 'string' ? parsed.firstSeen : null,
      restartCount:
        typeof parsed.restartCount === 'number' &&
        Number.isFinite(parsed.restartCount)
          ? parsed.restartCount
          : 0,
    };
  } catch {
    return EMPTY_STATE;
  }
}

function writeStored(state: TrackerState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // private mode or quota -- silently drop, the counter will
    // start fresh next time.
  }
}

export interface UseDaemonRestartTrackerArgs {
  pid?: number | null | undefined;
  startedAt?: string | null | undefined;
}

export interface UseDaemonRestartTrackerState {
  restartCount: number;
  /** ISO timestamp the operator first opened the tracker. */
  sinceFirstSeen: string | null;
}

export function useDaemonRestartTracker(
  args: UseDaemonRestartTrackerArgs,
): UseDaemonRestartTrackerState {
  const { pid, startedAt } = args;
  const [state, setState] = useState<TrackerState>(() => readStored());

  useEffect(() => {
    // Skip until we have *something* to anchor against -- a
    // null fetch should not bump the counter.
    if (pid == null && startedAt == null) return;
    setState((prev) => {
      const samePid =
        pid == null ? prev.lastPid === null : prev.lastPid === pid;
      const sameStarted =
        startedAt == null
          ? prev.lastStartedAt === null
          : prev.lastStartedAt === startedAt;
      const first = prev.firstSeen ?? new Date().toISOString();
      // First observation -- record but do NOT count a restart.
      if (prev.lastPid === null && prev.lastStartedAt === null) {
        const next: TrackerState = {
          lastPid: pid ?? null,
          lastStartedAt: startedAt ?? null,
          firstSeen: first,
          restartCount: prev.restartCount,
        };
        writeStored(next);
        return next;
      }
      if (samePid && sameStarted) {
        if (prev.firstSeen) return prev;
        const next: TrackerState = { ...prev, firstSeen: first };
        writeStored(next);
        return next;
      }
      const next: TrackerState = {
        lastPid: pid ?? null,
        lastStartedAt: startedAt ?? null,
        firstSeen: first,
        restartCount: prev.restartCount + 1,
      };
      writeStored(next);
      return next;
    });
  }, [pid, startedAt]);

  return {
    restartCount: state.restartCount,
    sinceFirstSeen: state.firstSeen,
  };
}

// Test helper -- clears the tracker so a unit test can run
// against a clean storage slot without colliding with other tests.
export function _resetDaemonRestartTracker(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
