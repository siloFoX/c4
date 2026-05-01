// Auto-generated TypeScript client for the C4 daemon API.
// Generated from /openapi.json via src/openapi-sdk-gen.js.
// Do not edit by hand — re-run `c4 openapi --sdk` to refresh.

// Spec version: 1.10.2
// Generated at: 2026-05-01T11:24:02.206Z

export interface postAuthLoginBody {
  user: string; /** Username */
  password: string; /** Plain-text password */
}
export interface postAuthLoginResponse {
  token?: string; /** JWT bearer token */
  user?: string;
  role?: "admin" | "manager" | "viewer";
}

export interface postAuthLogoutResponse {
  ok?: boolean;
}

export interface getAuthStatusResponse {
  enabled?: boolean;
}

export interface getHealthResponse {
  ok?: boolean;
  workers?: number;
  version?: string | null;
}

export interface getMetricsResponse {
  daemon?: unknown;
  workers?: unknown[];
  totals?: Record<string, unknown>;
}

export interface getWorkspacesResponse {
  workspaces?: unknown[];
}

export interface getOpenapiJsonResponse {
  openapi?: string;
  info?: Record<string, unknown>;
  paths?: Record<string, unknown>;
}

export type getOpenapiYamlResponse = unknown;

export type getApiDocsIndexResponse = unknown;

export type getApiDocsRedocResponse = unknown;

export type getApiDocsResponse = Record<string, unknown>;

export interface postCreateBody {
  name: string; /** Worker name (unique) */
  command?: string; /** Override claude binary path */
  target?: string; /** 'local' | 'dgx' | fleet alias */
  cwd?: string; /** Working directory */
  parent?: string; /** Parent worker name (for hierarchy) */
  tier?: string; /** 'manager' | 'worker' | string */
  pinnedMemory?: string[];
  pinRole?: "manager" | "worker" | "attached";
}
export interface postCreateResponse {
  success?: boolean;
  name?: string;
  pid?: number;
  branch?: string;
}

export interface postSendBody {
  name: string;
  text: string;
}
export interface postSendResponse {
  success?: boolean;
  bytesWritten?: number;
}

export interface postKeyBody {
  name: string;
  key: string; /** Enter | Escape | Tab | C-c | Up | Down | etc */
}
export interface postKeyResponse {
  success?: boolean;
  key?: string; /** Echoed back for confirmation */
}

export interface getReadParams {
  name: string;
}
export interface getReadResponse {
  name?: string;
  scrollback?: string; /** PTY output (ANSI stripped) */
  cursor?: number; /** Last byte offset read */
}

export interface getReadNowParams {
  name: string;
}
export interface getReadNowResponse {
  name?: string;
  scrollback?: string;
  idle?: boolean;
}

export type getWaitReadResponse = unknown;

export type getWaitReadMultiResponse = unknown;

export interface getListResponse {
  workers?: unknown[];
  queuedTasks?: unknown[];
  lostWorkers?: unknown[];
}

export interface getTreeResponse {
  tree?: unknown[]; /** Worker tree (nested by parent/child) */
}

export interface postTaskBody {
  name?: string; /** Worker name (auto-generated if omitted) */
  task: string; /** Task prompt */
  branch?: string;
  useBranch?: boolean;
  useWorktree?: boolean;
  projectRoot?: string;
  cwd?: string;
  workspace?: string; /** config.workspaces[name] lookup */
  profile?: string; /** Built-in template alias */
  autoMode?: boolean;
  budgetUsd?: number;
  maxRetries?: number;
  model?: string; /** Override Claude model */
}
export interface postTaskResponse {
  success?: boolean;
  name?: string; /** Auto-generated when caller omitted name */
  tier?: string;
  model?: string | null;
  queued?: boolean; /** true when worker spawned + task queued */
}

export interface postMergeBody {
  name?: string;
  branch?: string;
  skipChecks?: boolean;
}
export interface postMergeResponse {
  success?: boolean;
  branch?: string;
  sha?: string; /** Merge commit SHA */
  summary?: string;
  reasons?: string[];
  resolvedFrom?: "name" | "branch";
}

export interface postApproveBody {
  name: string;
  option?: number; /** Option number for TUI prompts */
}
export interface postApproveResponse {
  success?: boolean;
}

export interface postRollbackBody {
  name: string;
}
export interface postRollbackResponse {
  success?: boolean;
  rolled_back?: string; /** Branch reset target */
}

export interface postRecoverBody {
  name: string;
  category?: "tool-deny" | "timeout" | "test-fail" | "build-fail" | "dependency" | "unknown";
}
export interface postRecoverResponse {
  recovered?: boolean;
  strategy?: string;
  category?: string;
  attempt?: number;
  action?: string;
}

export interface getRecoveryHistoryParams {
  name?: string;
  limit?: number;
}
export type getRecoveryHistoryResponse = unknown;

export interface postCancelBody {
  name: string;
}
export interface postCancelResponse {
  success?: boolean;
}

export interface postRestartBody {
  name: string;
}
export interface postRestartResponse {
  success?: boolean;
  pid?: number;
}

export interface getAuditQueryParams {
  from?: string;
  to?: string;
  type?: string;
  target?: string;
  actor?: string;
  limit?: number;
}
export interface getAuditQueryResponse {
  events?: unknown[];
}

export interface getAuditExportParams {
  from?: string;
  to?: string;
  type?: string;
  target?: string;
  limit?: number;
  bom?: "0" | "1";
}
export type getAuditExportResponse = Record<string, unknown>;

export interface getAuditVerifyParams {
  includeRotated?: "0" | "1";
}
export interface getAuditVerifyResponse {
  valid?: boolean;
  corruptedAt?: number | null;
  total?: number;
  rotatedTotal?: number;
}

export interface getRbacRolesResponse {
  roles?: unknown[];
}

export interface getRbacUsersResponse {
  users?: unknown[];
}

export interface postRbacRoleAssignBody {
  user: string;
  role: "admin" | "manager" | "viewer";
}
export type postRbacRoleAssignResponse = unknown;

export interface postRbacGrantProjectBody {
  user: string;
  project: string;
}
export type postRbacGrantProjectResponse = unknown;

export interface postRbacGrantMachineBody {
  user: string;
  machine: string;
}
export type postRbacGrantMachineResponse = unknown;

export interface postRbacRevokeProjectBody {
  user: string;
  project: string;
}
export type postRbacRevokeProjectResponse = unknown;

export interface postRbacRevokeMachineBody {
  user: string;
  machine: string;
}
export type postRbacRevokeMachineResponse = unknown;

export interface postRbacCheckBody {
  user: string;
  action: string; /** Canonical action name (e.g., worker.create) */
  resource?: unknown;
}
export interface postRbacCheckResponse {
  allowed?: boolean;
}

export type getCostReportResponse = unknown;

export type postCostBudgetResponse = unknown;

export type getOrgsTreeResponse = unknown;

export type postOrgsDeptResponse = unknown;

export type postOrgsTeamResponse = unknown;

export interface getSchedulesResponse {
  schedules?: unknown[];
}

export interface postSchedulesBody {
  id?: string;
  name: string;
  cron: string;
  task: string; /** Task prompt */
  target?: string;
  enabled?: boolean;
}
export interface postSchedulesResponse {
  id?: string;
  name?: string;
  nextRunAt?: string | null;
}

export interface postNlChatBody {
  text: string; /** Natural-language command */
  sessionId?: string;
}
export type postNlChatResponse = unknown;

export type getNlSessionsResponse = unknown;

export type getMcpServersResponse = unknown;

export interface postMcpServersBody {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, unknown>;
}
export type postMcpServersResponse = unknown;

export interface getWorkflowsParams {
  enabled?: "true" | "false";
  nameContains?: string;
}
export interface getWorkflowsResponse {
  workflows?: Record<string, unknown>[];
}

export interface postWorkflowsBody {
  id?: string; /** Auto-generated if omitted */
  name: string;
  description?: string;
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  config?: unknown;
}
export interface postWorkflowsResponse {
  id?: string;
  name?: string;
  enabled?: boolean;
  createdAt?: string;
}

export type getComputerUseSessionsResponse = unknown;

export type postComputerUseSessionsResponse = unknown;

export interface getProjectsResponse {
  projects?: unknown[];
}

export interface postProjectsBody {
  id: string;
  name: string;
  description?: string;
}
export interface postProjectsResponse {
  id?: string;
  name?: string;
  createdAt?: string;
}

export interface postCicdWebhookBody {
  action?: string;
  repository?: Record<string, unknown>;
  pull_request?: Record<string, unknown>;
}
export type postCicdWebhookResponse = unknown;

export type getCicdPipelinesResponse = unknown;

export interface postCicdPipelinesBody {
  id?: string;
  name: string;
  repo: string;
  workflow: string;
  triggers: "pr.opened" | "pr.merged" | "pr.closed" | "merge.main" | "tag.created"[];
  actions: Record<string, unknown>[];
}
export type postCicdPipelinesResponse = unknown;

export type postCicdTriggerResponse = unknown;

export interface postCleanupBody {
  dryRun?: boolean;
}
export interface postCleanupResponse {
  branchesRemoved?: string[];
  worktreesRemoved?: string[];
  directoriesRemoved?: string[];
}

export interface postBatchBody {
  task?: string; /** Task prompt for all workers */
  count?: number; /** Number of workers (count mode) */
  tasksText?: string; /** Newline-separated tasks (file mode) */
  branch?: string; /** Branch prefix */
  autoMode?: boolean;
  profile?: string;
}
export interface postBatchResponse {
  success?: boolean;
  spawned?: string[];
  count?: number;
}

export interface postCloseBody {
  name: string;
}
export interface postCloseResponse {
  success?: boolean;
  name?: string;
}

export type getConfigResponse = unknown;

export type postConfigReloadResponse = unknown;

export interface getAutonomousStatusResponse {
  enabled?: boolean;
  paused?: boolean;
  pauseReason?: string | null;
  consecutiveHalts?: number;
  circuitThreshold?: number;
  lastDispatchId?: string | null;
  lastDispatchAt?: string | null;
}

export interface postAutonomousPauseBody {
  reason?: string; /** Operator-supplied pause reason */
}
export type postAutonomousPauseResponse = unknown;

export type postAutonomousResumeResponse = unknown;

export type postAutonomousTickResponse = unknown;

export interface postScribeStartBody {
  intervalMs?: number; /** Sampling interval (default 5min) */
}
export type postScribeStartResponse = unknown;

export type postScribeStopResponse = unknown;

export type getScribeStatusResponse = unknown;

export type postScribeScanResponse = unknown;

export interface getEventsQueryParams {
  from?: string;
  to?: string;
  type?: string;
  worker?: string;
  limit?: number;
  reverse?: "0" | "1";
}
export type getEventsQueryResponse = unknown;

export interface getEventsContextParams {
  around: string;
  window?: number;
}
export type getEventsContextResponse = unknown;

export interface getTokenUsageParams {
  name?: string;
  groupBy?: "session" | "project" | "tier" | "dept";
}
export type getTokenUsageResponse = unknown;

export interface getQuotaResponse {
  tiers?: unknown[];
  depts?: unknown[];
}

export interface getScrollbackParams {
  name: string;
  lines?: number;
}
export interface getScrollbackResponse {
  scrollback?: string;
  lines?: number;
}

export interface postResizeBody {
  name: string;
  cols: number;
  rows: number;
}
export interface postResizeResponse {
  success?: boolean;
}

export type postHookEventResponse = unknown;

export type getHookEventsResponse = unknown;

export interface getEventsResponse {
  type?: string; /** SSE event type ("connected" first, then live events) */
}

export type getApprovalsResponse = unknown;

export type getApprovalsStreamResponse = unknown;

export type postPlanResponse = unknown;

export type getPlanResponse = unknown;

export type postPlanUpdateResponse = unknown;

export type getPlanRevisionsResponse = unknown;

export type postMcpResponse = unknown;

export type getTemplatesResponse = unknown;

export type getProfilesResponse = unknown;

export type getSwarmResponse = unknown;

export type postAutoResponse = unknown;

export type postMorningResponse = unknown;

export type postStatusUpdateResponse = unknown;

export type getSlackEventsResponse = unknown;

export type postSlackEmitResponse = unknown;

export interface getHistoryParams {
  name?: string;
  last?: number;
}
export interface getHistoryResponse {
  history?: unknown[];
}

export type getScribeContextResponse = unknown;

export interface getSessionsParams {
  workerName?: string;
  limit?: number;
}
export interface getSessionsResponse {
  sessions?: unknown[];
}

export interface postAttachBody {
  jsonlPath: string; /** Absolute path to claude session JSONL */
  name?: string; /** Display name (defaults to UUID) */
  role?: "manager" | "worker" | "planner" | "executor" | "reviewer" | "generic";
}
export interface postAttachResponse {
  success?: boolean;
  name?: string;
  role?: string;
}

export interface getAttachListResponse {
  sessions?: unknown[];
  total?: number;
}

export type getFleetOverviewResponse = unknown;

export type postDispatchResponse = unknown;

export interface postTransferBody {
  alias: string; /** Fleet peer alias */
  type: "rsync" | "git";
  src?: string; /** For type=rsync */
  dest?: string; /** For type=rsync */
  branch?: string; /** For type=git */
  remoteRepoPath?: string; /** For type=git */
  opts?: Record<string, unknown>;
}
export interface postTransferResponse {
  started?: boolean;
  pid?: number;
  transferId?: string;
  cmd?: string;
}

export type postCompactEventResponse = unknown;

export type getSessionIdResponse = unknown;

export interface postResumeBody {
  name: string;
}
export interface postResumeResponse {
  success?: boolean;
  sessionId?: string;
}

export interface getWatchParams {
  name: string;
}
export type getWatchResponse = unknown;

export type getDashboardResponse = unknown;

export interface C4ClientOptions {
  baseUrl?: string;
  token?: string;
  fetch?: typeof fetch;
}

export class C4Client {
  private baseUrl: string;
  private token?: string;
  private fetch: typeof fetch;
  constructor(opts: C4ClientOptions = {}) {
    this.baseUrl = opts.baseUrl || "http://localhost:3456";
    this.token = opts.token;
    this.fetch = opts.fetch || fetch;
  }
  private headers(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  /** Authenticate with username/password — returns JWT. */
  async postAuthLogin(body: postAuthLoginBody): Promise<postAuthLoginResponse> {
    const url = new URL('/api/auth/login', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Invalidate the caller's session. */
  async postAuthLogout(): Promise<postAuthLogoutResponse> {
    const url = new URL('/api/auth/logout', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Whether auth is enabled + which actions allowed. */
  async getAuthStatus(): Promise<getAuthStatusResponse> {
    const url = new URL('/api/auth/status', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Daemon liveness probe — returns {ok, version, workers}. */
  async getHealth(): Promise<getHealthResponse> {
    const url = new URL('/api/health', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Per-worker + daemon CPU/RSS snapshot (worker-metrics module). */
  async getMetrics(): Promise<getMetricsResponse> {
    const url = new URL('/api/metrics', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Multi-repo workspace listing (config.workspaces). */
  async getWorkspaces(): Promise<getWorkspacesResponse> {
    const url = new URL('/api/workspaces', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** This document — auto-generated OpenAPI spec. */
  async getOpenapiJson(): Promise<getOpenapiJsonResponse> {
    const url = new URL('/api/openapi.json', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Same spec as /openapi.json, serialised as YAML. */
  async getOpenapiYaml(): Promise<getOpenapiYamlResponse> {
    const url = new URL('/api/openapi.yaml', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Landing page — picks between Swagger UI and Redoc. Lets operators choose the renderer that fits their workflow (Swagger UI = "Try it out" interactive; Redoc = polished 3-pane reference docs). */
  async getApiDocsIndex(): Promise<getApiDocsIndexResponse> {
    const url = new URL('/api/api-docs/index', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Redoc rendering of the openapi.json spec (alternative to Swagger UI). */
  async getApiDocsRedoc(): Promise<getApiDocsRedocResponse> {
    const url = new URL('/api/api-docs/redoc', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Swagger UI rendering of the openapi.json spec. Static HTML that loads swagger-ui-dist from node_modules/ via the /api-docs/<asset> static handler below — works offline / air-gapped (no CDN dependency). Whitelisted in OPEN_API_ROUTES so introspection works without auth. Sister route /api-docs/redoc renders the same spec via Redoc for teams who prefer that layout. */
  async getApiDocs(): Promise<getApiDocsResponse> {
    const url = new URL('/api/api-docs', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Create a new worker. */
  async postCreate(body: postCreateBody): Promise<postCreateResponse> {
    const url = new URL('/api/create', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Send text to a worker PTY. */
  async postSend(body: postSendBody): Promise<postSendResponse> {
    const url = new URL('/api/send', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Send a special key (Enter / Escape / etc) to a worker. */
  async postKey(body: postKeyBody): Promise<postKeyResponse> {
    const url = new URL('/api/key', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Read worker output (idle-state only). */
  async getRead(params: getReadParams): Promise<getReadResponse> {
    const url = new URL('/api/read', this.baseUrl);
    if (params) {
      if (params.name !== undefined) url.searchParams.set('name', String(params.name));
    }
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Read worker output immediately (any state). */
  async getReadNow(params: getReadNowParams): Promise<getReadNowResponse> {
    const url = new URL('/api/read-now', this.baseUrl);
    if (params) {
      if (params.name !== undefined) url.searchParams.set('name', String(params.name));
    }
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Block until a worker is idle, then return its scrollback. */
  async getWaitRead(): Promise<getWaitReadResponse> {
    const url = new URL('/api/wait-read', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Multi-worker waitRead — first idle worker returns first. */
  async getWaitReadMulti(): Promise<getWaitReadMultiResponse> {
    const url = new URL('/api/wait-read-multi', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** List all known workers (live + queued + lost). */
  async getList(): Promise<getListResponse> {
    const url = new URL('/api/list', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Hierarchical worker tree (parent/child topology). */
  async getTree(): Promise<getTreeResponse> {
    const url = new URL('/api/tree', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Send a task to a worker (auto-spawn if missing). */
  async postTask(body: postTaskBody): Promise<postTaskResponse> {
    const url = new URL('/api/task', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Merge a worker branch to main after pre-merge checks. */
  async postMerge(body: postMergeBody): Promise<postMergeResponse> {
    const url = new URL('/api/merge', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Approve a critical command awaiting human review. */
  async postApprove(body: postApproveBody): Promise<postApproveResponse> {
    const url = new URL('/api/approve', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Roll back a worker branch (reset --hard to base). */
  async postRollback(body: postRollbackBody): Promise<postRollbackResponse> {
    const url = new URL('/api/rollback', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** 8.4: manual recovery pass. Runs the same strategy picker as the automatic escalation hook but forces enabled=true so operators can trigger recovery even when config.recovery.enabled is false. */
  async postRecover(body: postRecoverBody): Promise<postRecoverResponse> {
    const url = new URL('/api/recover', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** 8.4: read the append-only history for audit / debugging. */
  async getRecoveryHistory(params?: getRecoveryHistoryParams): Promise<getRecoveryHistoryResponse> {
    const url = new URL('/api/recovery-history', this.baseUrl);
    if (params) {
      if (params.name !== undefined) url.searchParams.set('name', String(params.name));
      if (params.limit !== undefined) url.searchParams.set('limit', String(params.limit));
    }
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** 8.8: cancel pending/queued/active task without destroying the worker. */
  async postCancel(body: postCancelBody): Promise<postCancelResponse> {
    const url = new URL('/api/cancel', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** 8.8: kill + respawn a worker's PTY while preserving branch/worktree. */
  async postRestart(body: postRestartBody): Promise<postRestartResponse> {
    const url = new URL('/api/restart', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.2) Filtered audit log query. Every param is optional; omit all to dump the full log. Limit defaults to 0 (no cap). */
  async getAuditQuery(params?: getAuditQueryParams): Promise<getAuditQueryResponse> {
    const url = new URL('/api/audit/query', this.baseUrl);
    if (params) {
      if (params.from !== undefined) url.searchParams.set('from', String(params.from));
      if (params.to !== undefined) url.searchParams.set('to', String(params.to));
      if (params.type !== undefined) url.searchParams.set('type', String(params.type));
      if (params.target !== undefined) url.searchParams.set('target', String(params.target));
      if (params.actor !== undefined) url.searchParams.set('actor', String(params.actor));
      if (params.limit !== undefined) url.searchParams.set('limit', String(params.limit));
    }
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Excel-friendly CSV export of the audit log. Defaults to UTF-8 BOM + CRLF; ?bom=0 / ?lineEnd=lf opt out for shell pipelines. */
  async getAuditExport(params?: getAuditExportParams): Promise<getAuditExportResponse> {
    const url = new URL('/api/audit/export', this.baseUrl);
    if (params) {
      if (params.from !== undefined) url.searchParams.set('from', String(params.from));
      if (params.to !== undefined) url.searchParams.set('to', String(params.to));
      if (params.type !== undefined) url.searchParams.set('type', String(params.type));
      if (params.target !== undefined) url.searchParams.set('target', String(params.target));
      if (params.limit !== undefined) url.searchParams.set('limit', String(params.limit));
      if (params.bom !== undefined) url.searchParams.set('bom', String(params.bom));
    }
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Verify the audit-log hash chain (?includeRotated=1 for full history). */
  async getAuditVerify(params?: getAuditVerifyParams): Promise<getAuditVerifyResponse> {
    const url = new URL('/api/audit/verify', this.baseUrl);
    if (params) {
      if (params.includeRotated !== undefined) url.searchParams.set('includeRotated', String(params.includeRotated));
    }
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.1) Role + action matrix dump. Useful for the Web UI to render a permissions table without recomputing the matrix in the browser. */
  async getRbacRoles(): Promise<getRbacRolesResponse> {
    const url = new URL('/api/rbac/roles', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.1) List every RBAC user with role + grant lists. */
  async getRbacUsers(): Promise<getRbacUsersResponse> {
    const url = new URL('/api/rbac/users', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.1) Assign a role. Body: { username, role }. */
  async postRbacRoleAssign(body: postRbacRoleAssignBody): Promise<postRbacRoleAssignResponse> {
    const url = new URL('/api/rbac/role/assign', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.1) Grant project access. Body: { username, projectId }. */
  async postRbacGrantProject(body: postRbacGrantProjectBody): Promise<postRbacGrantProjectResponse> {
    const url = new URL('/api/rbac/grant/project', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.1) Grant machine access. Body: { username, alias }. */
  async postRbacGrantMachine(body: postRbacGrantMachineBody): Promise<postRbacGrantMachineResponse> {
    const url = new URL('/api/rbac/grant/machine', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.1) Revoke project access. Body: { username, projectId }. */
  async postRbacRevokeProject(body: postRbacRevokeProjectBody): Promise<postRbacRevokeProjectResponse> {
    const url = new URL('/api/rbac/revoke/project', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.1) Revoke machine access. Body: { username, alias }. */
  async postRbacRevokeMachine(body: postRbacRevokeMachineBody): Promise<postRbacRevokeMachineResponse> {
    const url = new URL('/api/rbac/revoke/machine', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.1) Check a permission. Body: { username, action, resource? }. Useful for the Web UI to hide buttons the caller cannot reach. */
  async postRbacCheck(body: postRbacCheckBody): Promise<postRbacCheckResponse> {
    const url = new URL('/api/rbac/check', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.5) Cost + token aggregation over the daemon's history.jsonl. Never touches live worker state so it is safe to call at any time — the report is pure aggregation over immutable rows. */
  async getCostReport(): Promise<getCostReportResponse> {
    const url = new URL('/api/cost/report', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.5) Budget check. Body: { limit, period, group, warnAt }. Returns exceeded=true once used >= limit, warning=true once used crosses warnAt (defaults to 0.8) but has not yet exceeded. */
  async postCostBudget(): Promise<postCostBudgetResponse> {
    const url = new URL('/api/cost/budget', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.6) Organization tree. Returns root departments with nested subdepts, teams, and a deduped member list per node. Protected with the ORG_READ action so viewers can see the chart without getting write access. */
  async getOrgsTree(): Promise<getOrgsTreeResponse> {
    const url = new URL('/api/orgs/tree', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.6) Create a department. Body: { id, name, parentId? }. */
  async postOrgsDept(): Promise<postOrgsDeptResponse> {
    const url = new URL('/api/orgs/dept', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.6) Create a team under a department. Body: { id, deptId, name }. */
  async postOrgsTeam(): Promise<postOrgsTeamResponse> {
    const url = new URL('/api/orgs/team', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.7) List every schedule. Filters: ?enabled=true|false, ?projectId=, ?assignee=. Read-only so viewers can inspect the timeline without getting write access. */
  async getSchedules(): Promise<getSchedulesResponse> {
    const url = new URL('/api/schedules', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.7) Create a schedule. Body: { id?, name, cronExpr, taskTemplate, projectId?, assignee?, timezone?, enabled? }. */
  async postSchedules(body: postSchedulesBody): Promise<postSchedulesResponse> {
    const url = new URL('/api/schedules', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (11.4) Natural-language chat turn. Body: { sessionId?, text }. Returns { sessionId, response, intent, params, confidence, result, actions }. Missing sessionId starts a fresh session. */
  async postNlChat(body: postNlChatBody): Promise<postNlChatResponse> {
    const url = new URL('/api/nl/chat', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (11.4) List all chat sessions with lightweight metadata. */
  async getNlSessions(): Promise<getNlSessionsResponse> {
    const url = new URL('/api/nl/sessions', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (11.1) List every MCP server in the hub. Filters: ?enabled= true|false, ?transport=stdio|http. Read-only so viewers can inspect the registry without mcp.manage. */
  async getMcpServers(): Promise<getMcpServersResponse> {
    const url = new URL('/api/mcp/servers', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (11.1) Register a new MCP server. Body: { name, command, args?, env?, description?, enabled?, transport? }. Duplicate names and invalid transports are rejected by the hub. */
  async postMcpServers(body: postMcpServersBody): Promise<postMcpServersResponse> {
    const url = new URL('/api/mcp/servers', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** List defined workflows. */
  async getWorkflows(params?: getWorkflowsParams): Promise<getWorkflowsResponse> {
    const url = new URL('/api/workflows', this.baseUrl);
    if (params) {
      if (params.enabled !== undefined) url.searchParams.set('enabled', String(params.enabled));
      if (params.nameContains !== undefined) url.searchParams.set('nameContains', String(params.nameContains));
    }
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Create a new workflow definition. */
  async postWorkflows(body: postWorkflowsBody): Promise<postWorkflowsResponse> {
    const url = new URL('/api/workflows', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (11.2) List computer-use sessions with their recorded actions and screenshots. Single powerful `computer.use` action guards the whole surface — granting this is effectively remote desktop. */
  async getComputerUseSessions(): Promise<getComputerUseSessionsResponse> {
    const url = new URL('/api/computer-use/sessions', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (11.2) Start a computer-use session. Body: { backend? }. Refuses when config.computerUse.enabled is false. */
  async postComputerUseSessions(): Promise<postComputerUseSessionsResponse> {
    const url = new URL('/api/computer-use/sessions', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.8) List all projects. Returns the full board objects so a caller can render a per-project dashboard without a second trip per project. */
  async getProjects(): Promise<getProjectsResponse> {
    const url = new URL('/api/projects', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.8) Create a project. Body: { id, name, description }. */
  async postProjects(body: postProjectsBody): Promise<postProjectsResponse> {
    const url = new URL('/api/projects', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.4) GitHub webhook receiver. Auth is HMAC-SHA256 over the raw body matching X-Hub-Signature-256; no JWT expected. Translate X-GitHub-Event + payload.action into our internal event name and forward to handleWebhook. Error codes follow the spec:   200  dispatched (including "no pipeline matched")   400  header/event missing or unroutable   401  bad / missing signature */
  async postCicdWebhook(body: postCicdWebhookBody): Promise<postCicdWebhookResponse> {
    const url = new URL('/api/cicd/webhook', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.4) List every registered pipeline. */
  async getCicdPipelines(): Promise<getCicdPipelinesResponse> {
    const url = new URL('/api/cicd/pipelines', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.4) Register a pipeline. Body matches the schema in patches/1.9.5-cicd-integration.md. */
  async postCicdPipelines(body: postCicdPipelinesBody): Promise<postCicdPipelinesResponse> {
    const url = new URL('/api/cicd/pipelines', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.4) Manual run of a registered pipeline. Body:   { id }                     -> replay every action on the pipeline   { repo, workflow, inputs } -> one-off workflow_dispatch without a pipeline */
  async postCicdTrigger(): Promise<postCicdTriggerResponse> {
    const url = new URL('/api/cicd/trigger', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Sweep orphaned worktrees / branches / temp dirs. */
  async postCleanup(body: postCleanupBody): Promise<postCleanupResponse> {
    const url = new URL('/api/cleanup', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (8.20B) Batch task dispatch. Mirrors `c4 batch` on the CLI: accepts either a string `task` + `count` (same task N times), or an array `tasks` (one task per entry). Each task is dispatched through manager.sendTask as `batch-<N>` unless the caller provides an explicit `namePrefix`. Returns per-item outcomes so the UI can render a results table without looping /task itself. */
  async postBatch(body: postBatchBody): Promise<postBatchResponse> {
    const url = new URL('/api/batch', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Close a worker. */
  async postClose(body: postCloseBody): Promise<postCloseResponse> {
    const url = new URL('/api/close', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Get the live daemon config (sans secrets). */
  async getConfig(): Promise<getConfigResponse> {
    const url = new URL('/api/config', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Reload config.json from disk; restart sub-systems as needed. */
  async postConfigReload(): Promise<postConfigReloadResponse> {
    const url = new URL('/api/config/reload', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (8.28) Autonomous dispatcher inspection. Returns a static disabled payload when the instance is null so the CLI never has to disambiguate a 404 from a real response. */
  async getAutonomousStatus(): Promise<getAutonomousStatusResponse> {
    const url = new URL('/api/autonomous/status', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Pause the TODO auto-dispatch loop (8.28). */
  async postAutonomousPause(body: postAutonomousPauseBody): Promise<postAutonomousPauseResponse> {
    const url = new URL('/api/autonomous/pause', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Resume the TODO auto-dispatch loop. */
  async postAutonomousResume(): Promise<postAutonomousResumeResponse> {
    const url = new URL('/api/autonomous/resume', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Manual tick for tests + operators who want to kick the loop without waiting for the throttle window. */
  async postAutonomousTick(): Promise<postAutonomousTickResponse> {
    const url = new URL('/api/autonomous/tick', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Start a scribe session — record manager context periodically. */
  async postScribeStart(body: postScribeStartBody): Promise<postScribeStartResponse> {
    const url = new URL('/api/scribe/start', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Stop the active scribe session. */
  async postScribeStop(): Promise<postScribeStopResponse> {
    const url = new URL('/api/scribe/stop', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Get scribe session state (active / interval / last record). */
  async getScribeStatus(): Promise<getScribeStatusResponse> {
    const url = new URL('/api/scribe/status', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Force one immediate scribe scan (debug). */
  async postScribeScan(): Promise<postScribeScanResponse> {
    const url = new URL('/api/scribe/scan', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.9) Structured event timeline. Powers `c4 events`. Every query param is optional; omit them all to get every recorded event. Types / workers accept comma-separated lists. */
  async getEventsQuery(params?: getEventsQueryParams): Promise<getEventsQueryResponse> {
    const url = new URL('/api/events/query', this.baseUrl);
    if (params) {
      if (params.from !== undefined) url.searchParams.set('from', String(params.from));
      if (params.to !== undefined) url.searchParams.set('to', String(params.to));
      if (params.type !== undefined) url.searchParams.set('type', String(params.type));
      if (params.worker !== undefined) url.searchParams.set('worker', String(params.worker));
      if (params.limit !== undefined) url.searchParams.set('limit', String(params.limit));
      if (params.reverse !== undefined) url.searchParams.set('reverse', String(params.reverse));
    }
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (10.9) Surrounding events for a given id or timestamp. Powers `c4 events --around <ts>`. */
  async getEventsContext(params: getEventsContextParams): Promise<getEventsContextResponse> {
    const url = new URL('/api/events/context', this.baseUrl);
    if (params) {
      if (params.around !== undefined) url.searchParams.set('around', String(params.around));
      if (params.window !== undefined) url.searchParams.set('window', String(params.window));
    }
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Per-worker token usage roll-up + cost estimate. */
  async getTokenUsage(params?: getTokenUsageParams): Promise<getTokenUsageResponse> {
    const url = new URL('/api/token-usage', this.baseUrl);
    if (params) {
      if (params.name !== undefined) url.searchParams.set('name', String(params.name));
      if (params.groupBy !== undefined) url.searchParams.set('groupBy', String(params.groupBy));
    }
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (8.3) Snapshot of tier quota usage. CLI: `c4 quota`. */
  async getQuota(): Promise<getQuotaResponse> {
    const url = new URL('/api/quota', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Get worker terminal scrollback (?lines=N). */
  async getScrollback(params: getScrollbackParams): Promise<getScrollbackResponse> {
    const url = new URL('/api/scrollback', this.baseUrl);
    if (params) {
      if (params.name !== undefined) url.searchParams.set('name', String(params.name));
      if (params.lines !== undefined) url.searchParams.set('lines', String(params.lines));
    }
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** 8.13: Web UI viewport resize -> server PTY + ScreenBuffer resize */
  async postResize(body: postResizeBody): Promise<postResizeResponse> {
    const url = new URL('/api/resize', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Hook architecture (3.15): receive structured events from Claude Code hooks */
  async postHookEvent(): Promise<postHookEventResponse> {
    const url = new URL('/api/hook-event', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Query hook events for a worker (3.15) */
  async getHookEvents(): Promise<getHookEventsResponse> {
    const url = new URL('/api/hook-events', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** SSE stream of all daemon events. */
  async getEvents(): Promise<getEventsResponse> {
    const url = new URL('/api/events', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (8.26) Snapshot of the approval_pending set. Cheap to call, used by `c4 watch-interventions` on initial connect and by tests that want a non-streaming view. */
  async getApprovals(): Promise<getApprovalsResponse> {
    const url = new URL('/api/approvals', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (8.26) Persistent SSE stream of approval_pending transitions. Reviewer sessions subscribe once and receive enter / exit / slack_alert / timeout events for every worker without needing to poll read-now or re-arm a per-worker wait. */
  async getApprovalsStream(): Promise<getApprovalsStreamResponse> {
    const url = new URL('/api/approvals/stream', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Send a planner-mode task to a worker (--branch, --output). */
  async postPlan(): Promise<postPlanResponse> {
    const url = new URL('/api/plan', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Read the most recent plan output for a worker. */
  async getPlan(): Promise<getPlanResponse> {
    const url = new URL('/api/plan', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (9.12) Planner Back-propagation loop entry point. */
  async postPlanUpdate(): Promise<postPlanUpdateResponse> {
    const url = new URL('/api/plan-update', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** List plan revisions for a worker. */
  async getPlanRevisions(): Promise<getPlanRevisionsResponse> {
    const url = new URL('/api/plan-revisions', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** MCP tool invocation passthrough. */
  async postMcp(): Promise<postMcpResponse> {
    const url = new URL('/api/mcp', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** List built-in worker templates (planner / executor / reviewer / generic). */
  async getTemplates(): Promise<getTemplatesResponse> {
    const url = new URL('/api/templates', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** List configured permission profiles (RBAC). */
  async getProfiles(): Promise<getProfilesResponse> {
    const url = new URL('/api/profiles', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Get sub-worker swarm topology for a manager. */
  async getSwarm(): Promise<getSwarmResponse> {
    const url = new URL('/api/swarm', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Spawn the autonomous manager + scribe pair. */
  async postAuto(): Promise<postAutoResponse> {
    const url = new URL('/api/auto', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Generate the morning report (overnight activity summary). */
  async postMorning(): Promise<postMorningResponse> {
    const url = new URL('/api/morning', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Post a manual Slack status message tagged with a worker. */
  async postStatusUpdate(): Promise<postStatusUpdateResponse> {
    const url = new URL('/api/status-update', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (8.15) Tail of the in-memory event buffer. Open to any authenticated caller so dashboards can render the recent feed without holding the SLACK_WRITE permission. */
  async getSlackEvents(): Promise<getSlackEventsResponse> {
    const url = new URL('/api/slack/events', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** (8.15) Manual event injection. Only operators with SLACK_WRITE can call this — the CLI `c4 slack test` uses the same route so a viewer JWT cannot flood the channel. */
  async postSlackEmit(): Promise<postSlackEmitResponse> {
    const url = new URL('/api/slack/emit', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** 8.7: richer summary shape for the Web UI. Query params stay backwards compatible with the 3.7 CLI (`worker`, `limit`) and add search/filter parameters (`q`, `status`, `since`, `until`). */
  async getHistory(params?: getHistoryParams): Promise<getHistoryResponse> {
    const url = new URL('/api/history', this.baseUrl);
    if (params) {
      if (params.name !== undefined) url.searchParams.set('name', String(params.name));
      if (params.last !== undefined) url.searchParams.set('last', String(params.last));
    }
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** 8.7: scribe session-context.md viewer. Reads docs/session-context.md from the project root (or from config.scribe.outputPath if set). */
  async getScribeContext(): Promise<getScribeContextResponse> {
    const url = new URL('/api/scribe-context', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Claude Code session JSONL listing. */
  async getSessions(params?: getSessionsParams): Promise<getSessionsResponse> {
    const url = new URL('/api/sessions', this.baseUrl);
    if (params) {
      if (params.workerName !== undefined) url.searchParams.set('workerName', String(params.workerName));
      if (params.limit !== undefined) url.searchParams.set('limit', String(params.limit));
    }
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Attach an external claude session by JSONL path. */
  async postAttach(body: postAttachBody): Promise<postAttachResponse> {
    const url = new URL('/api/attach', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** List all attached external sessions. */
  async getAttachList(): Promise<getAttachListResponse> {
    const url = new URL('/api/attach/list', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Fleet management (9.6): aggregate this daemon's state plus every registered peer in ~/.c4/fleet.json. Best-effort with a per-machine timeout so one unreachable peer cannot stall the endpoint — see src/fleet.js for the sampling contract. */
  async getFleetOverview(): Promise<getFleetOverviewResponse> {
    const url = new URL('/api/fleet/overview', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Fleet task distribution (9.7). Build a placement plan across reachable fleet machines (plus the local daemon) using the requested strategy, then fan out /create + /task to each slot. When no fleet machines are configured everything lands on localhost. Every remote unreachable -> fall back to local too. */
  async postDispatch(): Promise<postDispatchResponse> {
    const url = new URL('/api/dispatch', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Machine-to-machine file transfer (9.8). Accepts either   { alias, type: 'rsync', src, dest, opts? } -> rsync over ssh or   { alias, type: 'git',   src, remoteRepoPath, branch, opts? } -> git push The HTTP response returns immediately with { started, pid } so the caller can poll /events for the progress stream. Progress, completion and error events arrive on the existing SSE bus. */
  async postTransfer(body: postTransferBody): Promise<postTransferResponse> {
    const url = new URL('/api/transfer', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Manager auto-replacement (4.7): compact event from PostCompact hook */
  async postCompactEvent(): Promise<postCompactEventResponse> {
    const url = new URL('/api/compact-event', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Resume support (4.1): get session ID for a worker */
  async getSessionId(): Promise<getSessionIdResponse> {
    const url = new URL('/api/session-id', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Resume support (4.1): restart worker with --resume */
  async postResume(body: postResumeBody): Promise<postResumeResponse> {
    const url = new URL('/api/resume', this.baseUrl);
    const init: RequestInit = { method: 'POST' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    init.body = JSON.stringify(body);
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Watch worker output stream (5.42) — SSE with base64-encoded PTY data */
  async getWatch(params: getWatchParams): Promise<getWatchResponse> {
    const url = new URL('/api/watch', this.baseUrl);
    if (params) {
      if (params.name !== undefined) url.searchParams.set('name', String(params.name));
    }
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }

  /** Dashboard Web UI (4.3) */
  async getDashboard(): Promise<getDashboardResponse> {
    const url = new URL('/api/dashboard', this.baseUrl);
    const init: RequestInit = { method: 'GET' };
    init.headers = { 'Content-Type': 'application/json', ...this.headers() };
    const res = await this.fetch(url.toString(), init);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) return await res.json();
    return await res.text() as any;
  }
}
