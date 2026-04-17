export type WorkerStatus = 'idle' | 'busy' | 'exited';

export interface InterventionState {
  active?: boolean;
  reason?: string;
  since?: number;
  [key: string]: unknown;
}

export interface Worker {
  name: string;
  command: string;
  target: string;
  branch: string | null;
  worktree: string | null;
  parent: string | null;
  scope: boolean;
  pid: number | null;
  status: WorkerStatus;
  unreadSnapshots: number;
  totalSnapshots: number;
  intervention: InterventionState | null;
  lastQuestion: unknown | null;
  errorCount: number;
  phase: string | null;
  testFailCount: number;
}

export interface QueuedTask {
  name: string;
  task: string;
  branch: string | null;
  after: string | null;
  queuedAt: string;
  status: 'queued';
}

export interface LostWorker {
  name: string;
  branch?: string | null;
  worktree?: string | null;
  lostAt?: string;
  [key: string]: unknown;
}

export interface ListResponse {
  workers: Worker[];
  queuedTasks: QueuedTask[];
  lostWorkers: LostWorker[];
  lastHealthCheck: unknown;
}

export interface SSEEvent {
  type: string;
  worker?: string;
  [key: string]: unknown;
}
