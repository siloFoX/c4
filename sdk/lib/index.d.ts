// Type definitions for c4-sdk (TODO 9.3)
// These types are hand-written and distributed alongside the JavaScript
// source. The SDK has no build step.

export interface C4ClientOptions {
  /** Base URL of the c4 daemon, e.g. http://localhost:3456. */
  base?: string;
  /** Alias for `base`. */
  baseUrl?: string;
  /** JWT token. Required when the daemon has config.auth.enabled. */
  token?: string | null;
  /** Custom fetch implementation. Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /** Per-request timeout in ms. Ignored for watch(). Default 30000. */
  timeoutMs?: number;
}

export interface C4ErrorInit {
  status?: number | null;
  body?: unknown;
  cause?: unknown;
}

export class C4Error extends Error {
  readonly name: 'C4Error';
  readonly status: number | null;
  readonly body: unknown;
  constructor(message: string, init?: C4ErrorInit);
}

export interface HealthResponse {
  ok: boolean;
  workers: number;
  version: string | null;
}

export interface WorkerSummary {
  name: string;
  status?: string;
  target?: string;
  branch?: string | null;
  phase?: string | null;
  intervention?: boolean;
  pid?: number | null;
  [k: string]: unknown;
}

export interface ListWorkersResponse {
  workers: WorkerSummary[];
  queuedTasks?: unknown[];
  lostWorkers?: unknown[];
  [k: string]: unknown;
}

export interface CreateWorkerOptions {
  command?: string;
  args?: string[];
  target?: 'local' | 'dgx' | string;
  cwd?: string;
  parent?: string | null;
}

export interface CreateWorkerResponse {
  name?: string;
  pid?: number;
  error?: string;
  [k: string]: unknown;
}

export interface SendTaskOptions {
  branch?: string;
  useBranch?: boolean;
  useWorktree?: boolean;
  projectRoot?: string;
  cwd?: string;
  scope?: unknown;
  scopePreset?: string;
  after?: string;
  command?: string;
  target?: string;
  contextFrom?: string;
  reuse?: boolean;
  profile?: string;
  autoMode?: boolean;
  budgetUsd?: number;
  maxRetries?: number;
}

export interface SendTaskResponse {
  name?: string;
  queued?: boolean;
  branch?: string;
  error?: string;
  [k: string]: unknown;
}

export interface ReadOutputOptions {
  /** When true, hit /read-now (non-blocking). */
  now?: boolean;
  /** When true, hit /wait-read (waits for idle). */
  wait?: boolean;
  /** Explicit mode selector; overrides `now`/`wait`. */
  mode?: 'default' | 'now' | 'wait';
  /** Milliseconds for /wait-read idle timeout. */
  timeoutMs?: number;
  /** Pass interruptOnIntervention=1 to /wait-read. */
  interruptOnIntervention?: boolean;
}

export interface ReadOutputResponse {
  output?: string;
  idle?: boolean;
  error?: string;
  [k: string]: unknown;
}

export type WatchEventType = 'connected' | 'output' | 'complete' | 'error' | string;

export interface WatchEvent {
  type: WatchEventType;
  /** Base64-encoded PTY data (for type === 'output'). */
  data?: string;
  /** Convenience decoded text when type === 'output'. */
  dataText?: string;
  worker?: string;
  [k: string]: unknown;
}

export interface MergeOptions {
  skipChecks?: boolean;
}

export interface MergeResponse {
  success?: boolean;
  merged?: string;
  error?: string;
  [k: string]: unknown;
}

export interface CloseResponse {
  closed?: boolean;
  name?: string;
  error?: string;
  [k: string]: unknown;
}

export interface FleetOverviewOptions {
  timeoutMs?: number;
}

export interface FleetOverviewResponse {
  self?: {
    alias?: string;
    host?: string;
    port?: number;
    workers?: number;
    version?: string | null;
    [k: string]: unknown;
  };
  machines?: Array<{
    alias?: string;
    host?: string;
    port?: number;
    ok?: boolean;
    workers?: number;
    error?: string;
    [k: string]: unknown;
  }>;
  [k: string]: unknown;
}

export interface WatchOptions {
  signal?: AbortSignal;
}

export type WatchIterable = AsyncIterable<WatchEvent>;

/**
 * C4 daemon HTTP client.
 *
 * @example
 *   const { C4Client } = require('c4-sdk');
 *   const c4 = new C4Client({ base: 'http://localhost:3456', token: 'JWT' });
 *   await c4.createWorker('w1');
 *   await c4.sendTask('w1', 'analyze src/');
 */
export class C4Client {
  readonly base: string;
  readonly token: string | null;
  readonly timeoutMs: number;

  constructor(opts?: C4ClientOptions);

  /** GET /health */
  health(): Promise<HealthResponse>;

  /** GET /list */
  listWorkers(): Promise<ListWorkersResponse>;

  /** GET /list, filtered to a single worker (null if missing). */
  getWorker(name: string): Promise<WorkerSummary | null>;

  /** POST /create */
  createWorker(name: string, opts?: CreateWorkerOptions): Promise<CreateWorkerResponse>;

  /** POST /task */
  sendTask(name: string, task: string, opts?: SendTaskOptions): Promise<SendTaskResponse>;

  /** POST /send */
  sendInput(name: string, text: string): Promise<Record<string, unknown>>;

  /** POST /key */
  sendKey(name: string, key: string): Promise<Record<string, unknown>>;

  /** GET /read | /read-now | /wait-read */
  readOutput(name: string, opts?: ReadOutputOptions): Promise<ReadOutputResponse>;

  /** GET /watch (SSE) as an AsyncIterable of decoded events. */
  watch(name: string, opts?: WatchOptions): WatchIterable;

  /** POST /merge */
  merge(name: string, opts?: MergeOptions): Promise<MergeResponse>;

  /** POST /close */
  close(name: string): Promise<CloseResponse>;

  /** GET /fleet/overview */
  fleetOverview(opts?: FleetOverviewOptions): Promise<FleetOverviewResponse>;
}

export const DEFAULT_BASE: string;
