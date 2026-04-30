export type WorkerStatus = 'idle' | 'busy' | 'exited' | 'suspended';

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
  scope: boolean;
  pid: number | null;
  status: WorkerStatus;
  suspended?: boolean;
  unreadSnapshots: number;
  totalSnapshots: number;
  intervention: InterventionState | null;
  lastQuestion: unknown | null;
  errorCount: number;
  phase: string | null;
  testFailCount: number;
  cpuPct?: number | null;
  rssKb?: number | null;
  threads?: number | null;
  parent?: string | null;
  failureHint?: {
    id: string;
    label: string;
    hint: string;
    sample?: string | null;
    count: number;
  } | null;
}

export interface MetricsResponse {
  daemon: {
    platform: string;
    pid: number;
    uptimeSec: number;
    rssKb: number;
    heapUsedKb: number;
    heapTotalKb: number;
    cpus: number;
    loadavg: number[];
  };
  workers: Array<{
    name: string;
    pid: number | null;
    status: WorkerStatus;
    cpuPct: number | null;
    rssKb: number | null;
    threads: number | null;
  }>;
  totals: {
    liveWorkers: number;
    totalWorkers: number;
    totalRssKb: number;
    totalCpuPct: number;
  };
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
