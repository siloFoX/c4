// 9.3 SDK type declarations for `require('c4-cli/sdk')`.

export interface ClientOptions {
  host?: string;
  port?: number;
  protocol?: 'http' | 'https';
  timeout?: number;
}

export interface RequestOptions {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
  timeout?: number;
}

export interface ApiResponse {
  error?: string;
  _httpStatus?: number;
  [key: string]: unknown;
}

export interface WaitMultiResult extends ApiResponse {
  status?: 'first' | 'all' | 'done' | 'timeout' | 'idle' | 'busy' | 'exited' | 'intervention';
  results?: Array<{
    name: string;
    status: string;
    intervention?: string | null;
    content?: string;
  }>;
}

export interface FleetPeerStatus {
  name: string;
  label?: string;
  host?: string;
  port?: number;
  status: 'online' | 'unreachable';
  latencyMs: number;
  health?: { ok: boolean; workers: number; version: string } | null;
  error?: string | null;
}

export interface FleetListResult extends ApiResponse {
  peers: Array<{
    peer: string;
    label?: string;
    ok: boolean;
    workers?: Array<Record<string, unknown>>;
    error?: string;
  }>;
}

export interface SSEStream {
  close: () => void;
}

export class C4Client {
  constructor(opts?: ClientOptions);
  host: string;
  port: number;
  protocol: string;
  timeout: number;

  request(method: string, path: string, opts?: RequestOptions): Promise<ApiResponse>;

  // Worker lifecycle
  create(name: string, command?: string, opts?: { args?: string[]; target?: string; cwd?: string }): Promise<ApiResponse>;
  task(name: string, taskText: string, opts?: Record<string, unknown>): Promise<ApiResponse>;
  send(name: string, input: string): Promise<ApiResponse>;
  key(name: string, key: string): Promise<ApiResponse>;
  approve(name: string, optionNumber?: number): Promise<ApiResponse>;
  rollback(name: string): Promise<ApiResponse>;
  suspend(name: string): Promise<ApiResponse>;
  resume(name: string): Promise<ApiResponse>;
  restart(name: string, opts?: { resumeSession?: boolean }): Promise<ApiResponse>;
  cancel(name: string): Promise<ApiResponse>;
  batchAction(names: string[], action: string, args?: Record<string, unknown>): Promise<ApiResponse>;
  merge(name: string, opts?: { skipChecks?: boolean }): Promise<ApiResponse>;
  close(name: string): Promise<ApiResponse>;

  // Read paths
  read(name: string): Promise<ApiResponse>;
  readNow(name: string): Promise<ApiResponse>;
  scrollback(name: string, lines?: number): Promise<ApiResponse>;
  wait(name: string, opts?: { timeoutMs?: number; interruptOnIntervention?: boolean }): Promise<ApiResponse>;
  waitMulti(names: string[], opts?: { timeoutMs?: number; mode?: 'first' | 'all'; interruptOnIntervention?: boolean }): Promise<WaitMultiResult>;
  list(): Promise<ApiResponse>;
  history(opts?: { worker?: string; limit?: number }): Promise<ApiResponse>;
  health(): Promise<ApiResponse>;
  config(): Promise<ApiResponse>;

  // Scribe
  scribeStart(): Promise<ApiResponse>;
  scribeStop(): Promise<ApiResponse>;
  scribeStatus(): Promise<ApiResponse>;
  scribeContext(): Promise<ApiResponse>;
  scribeScan(): Promise<ApiResponse>;

  // Fleet (9.6)
  fleetPeers(): Promise<{ peers: FleetPeerStatus[] }>;
  fleetList(): Promise<FleetListResult>;
  fleetCreate(peer: string, args: { name: string; command?: string; target?: string; cwd?: string }): Promise<ApiResponse>;
  fleetTask(peer: string, name: string, task: string, opts?: Record<string, unknown>): Promise<ApiResponse>;
  fleetClose(peer: string, name: string): Promise<ApiResponse>;
  fleetSend(peer: string, name: string, input: string): Promise<ApiResponse>;
  fleetKey(peer: string, name: string, key: string): Promise<ApiResponse>;

  // Convenience
  untilIdle(name: string, opts?: { timeoutMs?: number; pollMs?: number }): Promise<ApiResponse>;
  events(opts?: { onMessage?: (msg: unknown) => void; onError?: (e: Error) => void }): SSEStream;
}

export function create(opts?: ClientOptions): C4Client;
