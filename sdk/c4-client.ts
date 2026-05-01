// Auto-generated TypeScript client for the C4 daemon API.
// Generated from /openapi.json via src/openapi-sdk-gen.js.
// Do not edit by hand — re-run `c4 openapi --sdk` to refresh.

// Spec version: 1.10.3
// Generated at: 2026-05-01T11:31:38.357Z

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

// Error class — typed wrapper around non-2xx responses.
// Carries the HTTP status, the parsed body (when JSON), and
// the operationId so callers can switch on it.
export class C4ApiError extends Error {
  status: number;
  statusText: string;
  body: unknown;
  operationId?: string;
  constructor(status: number, statusText: string, body: unknown, operationId?: string) {
    super(`HTTP ${status} ${statusText}${operationId ? ` (${operationId})` : ""}`);
    this.name = "C4ApiError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
    this.operationId = operationId;
  }
}

export interface C4ClientOptions {
  baseUrl?: string;
  token?: string;
  fetch?: typeof fetch;
  /** Number of retry attempts on transient failures (5xx, network). 0 = no retry. */
  retries?: number;
  /** Base backoff in ms — exponential 2^n * backoffMs between attempts. */
  backoffMs?: number;
}

interface RequestSpec {
  method: string;
  path: string;
  params?: Record<string, unknown>;
  body?: unknown;
  operationId?: string;
}

export class C4Client {
  private baseUrl: string;
  private token?: string;
  private fetch: typeof fetch;
  private retries: number;
  private backoffMs: number;
  constructor(opts: C4ClientOptions = {}) {
    this.baseUrl = opts.baseUrl || "http://localhost:3456";
    this.token = opts.token;
    this.fetch = opts.fetch || fetch;
    this.retries = opts.retries ?? 0;
    this.backoffMs = opts.backoffMs ?? 200;
  }
  setToken(token: string | undefined): void {
    this.token = token;
  }
  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }
  /**
   * Central request helper — applies retries on transient failures
   * (5xx + network errors). Throws C4ApiError on non-2xx that
   * survive the retry budget. Returns parsed JSON when the response
   * Content-Type is JSON, raw text otherwise.
   */
  async request<T>(spec: RequestSpec): Promise<T> {
    const url = new URL(spec.path, this.baseUrl);
    if (spec.params) {
      for (const [k, v] of Object.entries(spec.params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    const init: RequestInit = {
      method: spec.method,
      headers: this.headers(),
    };
    if (spec.body !== undefined) init.body = JSON.stringify(spec.body);
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const res = await this.fetch(url.toString(), init);
        if (!res.ok) {
          const ct = res.headers.get("content-type") || "";
          const body = ct.includes("json") ? await res.json() : await res.text();
          // 5xx is retryable; 4xx is not.
          if (res.status >= 500 && attempt < this.retries) {
            await this._sleep(this.backoffMs * Math.pow(2, attempt));
            continue;
          }
          throw new C4ApiError(res.status, res.statusText, body, spec.operationId);
        }
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("json")) return await res.json() as T;
        return await res.text() as unknown as T;
      } catch (e) {
        if (e instanceof C4ApiError) throw e;
        lastErr = e;
        if (attempt < this.retries) {
          await this._sleep(this.backoffMs * Math.pow(2, attempt));
          continue;
        }
      }
    }
    throw lastErr;
  }
  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Authenticate with username/password — returns JWT. */
  async postAuthLogin(body: postAuthLoginBody): Promise<postAuthLoginResponse> {
    return this.request<postAuthLoginResponse>({
      method: 'POST',
      path: '/api/auth/login',
      body: body as unknown,
    });
  }

  /** Invalidate the caller's session. */
  async postAuthLogout(): Promise<postAuthLogoutResponse> {
    return this.request<postAuthLogoutResponse>({
      method: 'POST',
      path: '/api/auth/logout',
    });
  }

  /** Whether auth is enabled + which actions allowed. */
  async getAuthStatus(): Promise<getAuthStatusResponse> {
    return this.request<getAuthStatusResponse>({
      method: 'GET',
      path: '/api/auth/status',
    });
  }

  /** Daemon liveness probe — returns {ok, version, workers}. */
  async getHealth(): Promise<getHealthResponse> {
    return this.request<getHealthResponse>({
      method: 'GET',
      path: '/api/health',
    });
  }

  /** Per-worker + daemon CPU/RSS snapshot (worker-metrics module). */
  async getMetrics(): Promise<getMetricsResponse> {
    return this.request<getMetricsResponse>({
      method: 'GET',
      path: '/api/metrics',
    });
  }

  /** Multi-repo workspace listing (config.workspaces). */
  async getWorkspaces(): Promise<getWorkspacesResponse> {
    return this.request<getWorkspacesResponse>({
      method: 'GET',
      path: '/api/workspaces',
    });
  }

  /** This document — auto-generated OpenAPI spec. */
  async getOpenapiJson(): Promise<getOpenapiJsonResponse> {
    return this.request<getOpenapiJsonResponse>({
      method: 'GET',
      path: '/api/openapi.json',
    });
  }

  /** Same spec as /openapi.json, serialised as YAML. */
  async getOpenapiYaml(): Promise<getOpenapiYamlResponse> {
    return this.request<getOpenapiYamlResponse>({
      method: 'GET',
      path: '/api/openapi.yaml',
    });
  }

  /** Landing page — picks between Swagger UI and Redoc. Lets operators choose the renderer that fits their workflow (Swagger UI = "Try it out" interactive; Redoc = polished 3-pane reference docs). */
  async getApiDocsIndex(): Promise<getApiDocsIndexResponse> {
    return this.request<getApiDocsIndexResponse>({
      method: 'GET',
      path: '/api/api-docs/index',
    });
  }

  /** Redoc rendering of the openapi.json spec (alternative to Swagger UI). */
  async getApiDocsRedoc(): Promise<getApiDocsRedocResponse> {
    return this.request<getApiDocsRedocResponse>({
      method: 'GET',
      path: '/api/api-docs/redoc',
    });
  }

  /** Swagger UI rendering of the openapi.json spec. Static HTML that loads swagger-ui-dist from node_modules/ via the /api-docs/<asset> static handler below — works offline / air-gapped (no CDN dependency). Whitelisted in OPEN_API_ROUTES so introspection works without auth. Sister route /api-docs/redoc renders the same spec via Redoc for teams who prefer that layout. */
  async getApiDocs(): Promise<getApiDocsResponse> {
    return this.request<getApiDocsResponse>({
      method: 'GET',
      path: '/api/api-docs',
    });
  }

  /** Create a new worker. */
  async postCreate(body: postCreateBody): Promise<postCreateResponse> {
    return this.request<postCreateResponse>({
      method: 'POST',
      path: '/api/create',
      body: body as unknown,
    });
  }

  /** Send text to a worker PTY. */
  async postSend(body: postSendBody): Promise<postSendResponse> {
    return this.request<postSendResponse>({
      method: 'POST',
      path: '/api/send',
      body: body as unknown,
    });
  }

  /** Send a special key (Enter / Escape / etc) to a worker. */
  async postKey(body: postKeyBody): Promise<postKeyResponse> {
    return this.request<postKeyResponse>({
      method: 'POST',
      path: '/api/key',
      body: body as unknown,
    });
  }

  /** Read worker output (idle-state only). */
  async getRead(params: getReadParams): Promise<getReadResponse> {
    return this.request<getReadResponse>({
      method: 'GET',
      path: '/api/read',
      params: params as unknown as Record<string, unknown> | undefined,
    });
  }

  /** Read worker output immediately (any state). */
  async getReadNow(params: getReadNowParams): Promise<getReadNowResponse> {
    return this.request<getReadNowResponse>({
      method: 'GET',
      path: '/api/read-now',
      params: params as unknown as Record<string, unknown> | undefined,
    });
  }

  /** Block until a worker is idle, then return its scrollback. */
  async getWaitRead(): Promise<getWaitReadResponse> {
    return this.request<getWaitReadResponse>({
      method: 'GET',
      path: '/api/wait-read',
    });
  }

  /** Multi-worker waitRead — first idle worker returns first. */
  async getWaitReadMulti(): Promise<getWaitReadMultiResponse> {
    return this.request<getWaitReadMultiResponse>({
      method: 'GET',
      path: '/api/wait-read-multi',
    });
  }

  /** List all known workers (live + queued + lost). */
  async getList(): Promise<getListResponse> {
    return this.request<getListResponse>({
      method: 'GET',
      path: '/api/list',
    });
  }

  /** Hierarchical worker tree (parent/child topology). */
  async getTree(): Promise<getTreeResponse> {
    return this.request<getTreeResponse>({
      method: 'GET',
      path: '/api/tree',
    });
  }

  /** Send a task to a worker (auto-spawn if missing). */
  async postTask(body: postTaskBody): Promise<postTaskResponse> {
    return this.request<postTaskResponse>({
      method: 'POST',
      path: '/api/task',
      body: body as unknown,
    });
  }

  /** Merge a worker branch to main after pre-merge checks. */
  async postMerge(body: postMergeBody): Promise<postMergeResponse> {
    return this.request<postMergeResponse>({
      method: 'POST',
      path: '/api/merge',
      body: body as unknown,
    });
  }

  /** Approve a critical command awaiting human review. */
  async postApprove(body: postApproveBody): Promise<postApproveResponse> {
    return this.request<postApproveResponse>({
      method: 'POST',
      path: '/api/approve',
      body: body as unknown,
    });
  }

  /** Roll back a worker branch (reset --hard to base). */
  async postRollback(body: postRollbackBody): Promise<postRollbackResponse> {
    return this.request<postRollbackResponse>({
      method: 'POST',
      path: '/api/rollback',
      body: body as unknown,
    });
  }

  /** 8.4: manual recovery pass. Runs the same strategy picker as the automatic escalation hook but forces enabled=true so operators can trigger recovery even when config.recovery.enabled is false. */
  async postRecover(body: postRecoverBody): Promise<postRecoverResponse> {
    return this.request<postRecoverResponse>({
      method: 'POST',
      path: '/api/recover',
      body: body as unknown,
    });
  }

  /** 8.4: read the append-only history for audit / debugging. */
  async getRecoveryHistory(params?: getRecoveryHistoryParams): Promise<getRecoveryHistoryResponse> {
    return this.request<getRecoveryHistoryResponse>({
      method: 'GET',
      path: '/api/recovery-history',
      params: params as unknown as Record<string, unknown> | undefined,
    });
  }

  /** 8.8: cancel pending/queued/active task without destroying the worker. */
  async postCancel(body: postCancelBody): Promise<postCancelResponse> {
    return this.request<postCancelResponse>({
      method: 'POST',
      path: '/api/cancel',
      body: body as unknown,
    });
  }

  /** 8.8: kill + respawn a worker's PTY while preserving branch/worktree. */
  async postRestart(body: postRestartBody): Promise<postRestartResponse> {
    return this.request<postRestartResponse>({
      method: 'POST',
      path: '/api/restart',
      body: body as unknown,
    });
  }

  /** (10.2) Filtered audit log query. Every param is optional; omit all to dump the full log. Limit defaults to 0 (no cap). */
  async getAuditQuery(params?: getAuditQueryParams): Promise<getAuditQueryResponse> {
    return this.request<getAuditQueryResponse>({
      method: 'GET',
      path: '/api/audit/query',
      params: params as unknown as Record<string, unknown> | undefined,
    });
  }

  /** Excel-friendly CSV export of the audit log. Defaults to UTF-8 BOM + CRLF; ?bom=0 / ?lineEnd=lf opt out for shell pipelines. */
  async getAuditExport(params?: getAuditExportParams): Promise<getAuditExportResponse> {
    return this.request<getAuditExportResponse>({
      method: 'GET',
      path: '/api/audit/export',
      params: params as unknown as Record<string, unknown> | undefined,
    });
  }

  /** Verify the audit-log hash chain (?includeRotated=1 for full history). */
  async getAuditVerify(params?: getAuditVerifyParams): Promise<getAuditVerifyResponse> {
    return this.request<getAuditVerifyResponse>({
      method: 'GET',
      path: '/api/audit/verify',
      params: params as unknown as Record<string, unknown> | undefined,
    });
  }

  /** (10.1) Role + action matrix dump. Useful for the Web UI to render a permissions table without recomputing the matrix in the browser. */
  async getRbacRoles(): Promise<getRbacRolesResponse> {
    return this.request<getRbacRolesResponse>({
      method: 'GET',
      path: '/api/rbac/roles',
    });
  }

  /** (10.1) List every RBAC user with role + grant lists. */
  async getRbacUsers(): Promise<getRbacUsersResponse> {
    return this.request<getRbacUsersResponse>({
      method: 'GET',
      path: '/api/rbac/users',
    });
  }

  /** (10.1) Assign a role. Body: { username, role }. */
  async postRbacRoleAssign(body: postRbacRoleAssignBody): Promise<postRbacRoleAssignResponse> {
    return this.request<postRbacRoleAssignResponse>({
      method: 'POST',
      path: '/api/rbac/role/assign',
      body: body as unknown,
    });
  }

  /** (10.1) Grant project access. Body: { username, projectId }. */
  async postRbacGrantProject(body: postRbacGrantProjectBody): Promise<postRbacGrantProjectResponse> {
    return this.request<postRbacGrantProjectResponse>({
      method: 'POST',
      path: '/api/rbac/grant/project',
      body: body as unknown,
    });
  }

  /** (10.1) Grant machine access. Body: { username, alias }. */
  async postRbacGrantMachine(body: postRbacGrantMachineBody): Promise<postRbacGrantMachineResponse> {
    return this.request<postRbacGrantMachineResponse>({
      method: 'POST',
      path: '/api/rbac/grant/machine',
      body: body as unknown,
    });
  }

  /** (10.1) Revoke project access. Body: { username, projectId }. */
  async postRbacRevokeProject(body: postRbacRevokeProjectBody): Promise<postRbacRevokeProjectResponse> {
    return this.request<postRbacRevokeProjectResponse>({
      method: 'POST',
      path: '/api/rbac/revoke/project',
      body: body as unknown,
    });
  }

  /** (10.1) Revoke machine access. Body: { username, alias }. */
  async postRbacRevokeMachine(body: postRbacRevokeMachineBody): Promise<postRbacRevokeMachineResponse> {
    return this.request<postRbacRevokeMachineResponse>({
      method: 'POST',
      path: '/api/rbac/revoke/machine',
      body: body as unknown,
    });
  }

  /** (10.1) Check a permission. Body: { username, action, resource? }. Useful for the Web UI to hide buttons the caller cannot reach. */
  async postRbacCheck(body: postRbacCheckBody): Promise<postRbacCheckResponse> {
    return this.request<postRbacCheckResponse>({
      method: 'POST',
      path: '/api/rbac/check',
      body: body as unknown,
    });
  }

  /** (10.5) Cost + token aggregation over the daemon's history.jsonl. Never touches live worker state so it is safe to call at any time — the report is pure aggregation over immutable rows. */
  async getCostReport(): Promise<getCostReportResponse> {
    return this.request<getCostReportResponse>({
      method: 'GET',
      path: '/api/cost/report',
    });
  }

  /** (10.5) Budget check. Body: { limit, period, group, warnAt }. Returns exceeded=true once used >= limit, warning=true once used crosses warnAt (defaults to 0.8) but has not yet exceeded. */
  async postCostBudget(): Promise<postCostBudgetResponse> {
    return this.request<postCostBudgetResponse>({
      method: 'POST',
      path: '/api/cost/budget',
    });
  }

  /** (10.6) Organization tree. Returns root departments with nested subdepts, teams, and a deduped member list per node. Protected with the ORG_READ action so viewers can see the chart without getting write access. */
  async getOrgsTree(): Promise<getOrgsTreeResponse> {
    return this.request<getOrgsTreeResponse>({
      method: 'GET',
      path: '/api/orgs/tree',
    });
  }

  /** (10.6) Create a department. Body: { id, name, parentId? }. */
  async postOrgsDept(): Promise<postOrgsDeptResponse> {
    return this.request<postOrgsDeptResponse>({
      method: 'POST',
      path: '/api/orgs/dept',
    });
  }

  /** (10.6) Create a team under a department. Body: { id, deptId, name }. */
  async postOrgsTeam(): Promise<postOrgsTeamResponse> {
    return this.request<postOrgsTeamResponse>({
      method: 'POST',
      path: '/api/orgs/team',
    });
  }

  /** (10.7) List every schedule. Filters: ?enabled=true|false, ?projectId=, ?assignee=. Read-only so viewers can inspect the timeline without getting write access. */
  async getSchedules(): Promise<getSchedulesResponse> {
    return this.request<getSchedulesResponse>({
      method: 'GET',
      path: '/api/schedules',
    });
  }

  /** (10.7) Create a schedule. Body: { id?, name, cronExpr, taskTemplate, projectId?, assignee?, timezone?, enabled? }. */
  async postSchedules(body: postSchedulesBody): Promise<postSchedulesResponse> {
    return this.request<postSchedulesResponse>({
      method: 'POST',
      path: '/api/schedules',
      body: body as unknown,
    });
  }

  /** (11.4) Natural-language chat turn. Body: { sessionId?, text }. Returns { sessionId, response, intent, params, confidence, result, actions }. Missing sessionId starts a fresh session. */
  async postNlChat(body: postNlChatBody): Promise<postNlChatResponse> {
    return this.request<postNlChatResponse>({
      method: 'POST',
      path: '/api/nl/chat',
      body: body as unknown,
    });
  }

  /** (11.4) List all chat sessions with lightweight metadata. */
  async getNlSessions(): Promise<getNlSessionsResponse> {
    return this.request<getNlSessionsResponse>({
      method: 'GET',
      path: '/api/nl/sessions',
    });
  }

  /** (11.1) List every MCP server in the hub. Filters: ?enabled= true|false, ?transport=stdio|http. Read-only so viewers can inspect the registry without mcp.manage. */
  async getMcpServers(): Promise<getMcpServersResponse> {
    return this.request<getMcpServersResponse>({
      method: 'GET',
      path: '/api/mcp/servers',
    });
  }

  /** (11.1) Register a new MCP server. Body: { name, command, args?, env?, description?, enabled?, transport? }. Duplicate names and invalid transports are rejected by the hub. */
  async postMcpServers(body: postMcpServersBody): Promise<postMcpServersResponse> {
    return this.request<postMcpServersResponse>({
      method: 'POST',
      path: '/api/mcp/servers',
      body: body as unknown,
    });
  }

  /** List defined workflows. */
  async getWorkflows(params?: getWorkflowsParams): Promise<getWorkflowsResponse> {
    return this.request<getWorkflowsResponse>({
      method: 'GET',
      path: '/api/workflows',
      params: params as unknown as Record<string, unknown> | undefined,
    });
  }

  /** Create a new workflow definition. */
  async postWorkflows(body: postWorkflowsBody): Promise<postWorkflowsResponse> {
    return this.request<postWorkflowsResponse>({
      method: 'POST',
      path: '/api/workflows',
      body: body as unknown,
    });
  }

  /** (11.2) List computer-use sessions with their recorded actions and screenshots. Single powerful `computer.use` action guards the whole surface — granting this is effectively remote desktop. */
  async getComputerUseSessions(): Promise<getComputerUseSessionsResponse> {
    return this.request<getComputerUseSessionsResponse>({
      method: 'GET',
      path: '/api/computer-use/sessions',
    });
  }

  /** (11.2) Start a computer-use session. Body: { backend? }. Refuses when config.computerUse.enabled is false. */
  async postComputerUseSessions(): Promise<postComputerUseSessionsResponse> {
    return this.request<postComputerUseSessionsResponse>({
      method: 'POST',
      path: '/api/computer-use/sessions',
    });
  }

  /** (10.8) List all projects. Returns the full board objects so a caller can render a per-project dashboard without a second trip per project. */
  async getProjects(): Promise<getProjectsResponse> {
    return this.request<getProjectsResponse>({
      method: 'GET',
      path: '/api/projects',
    });
  }

  /** (10.8) Create a project. Body: { id, name, description }. */
  async postProjects(body: postProjectsBody): Promise<postProjectsResponse> {
    return this.request<postProjectsResponse>({
      method: 'POST',
      path: '/api/projects',
      body: body as unknown,
    });
  }

  /** (10.4) GitHub webhook receiver. Auth is HMAC-SHA256 over the raw body matching X-Hub-Signature-256; no JWT expected. Translate X-GitHub-Event + payload.action into our internal event name and forward to handleWebhook. Error codes follow the spec:   200  dispatched (including "no pipeline matched")   400  header/event missing or unroutable   401  bad / missing signature */
  async postCicdWebhook(body: postCicdWebhookBody): Promise<postCicdWebhookResponse> {
    return this.request<postCicdWebhookResponse>({
      method: 'POST',
      path: '/api/cicd/webhook',
      body: body as unknown,
    });
  }

  /** (10.4) List every registered pipeline. */
  async getCicdPipelines(): Promise<getCicdPipelinesResponse> {
    return this.request<getCicdPipelinesResponse>({
      method: 'GET',
      path: '/api/cicd/pipelines',
    });
  }

  /** (10.4) Register a pipeline. Body matches the schema in patches/1.9.5-cicd-integration.md. */
  async postCicdPipelines(body: postCicdPipelinesBody): Promise<postCicdPipelinesResponse> {
    return this.request<postCicdPipelinesResponse>({
      method: 'POST',
      path: '/api/cicd/pipelines',
      body: body as unknown,
    });
  }

  /** (10.4) Manual run of a registered pipeline. Body:   { id }                     -> replay every action on the pipeline   { repo, workflow, inputs } -> one-off workflow_dispatch without a pipeline */
  async postCicdTrigger(): Promise<postCicdTriggerResponse> {
    return this.request<postCicdTriggerResponse>({
      method: 'POST',
      path: '/api/cicd/trigger',
    });
  }

  /** Sweep orphaned worktrees / branches / temp dirs. */
  async postCleanup(body: postCleanupBody): Promise<postCleanupResponse> {
    return this.request<postCleanupResponse>({
      method: 'POST',
      path: '/api/cleanup',
      body: body as unknown,
    });
  }

  /** (8.20B) Batch task dispatch. Mirrors `c4 batch` on the CLI: accepts either a string `task` + `count` (same task N times), or an array `tasks` (one task per entry). Each task is dispatched through manager.sendTask as `batch-<N>` unless the caller provides an explicit `namePrefix`. Returns per-item outcomes so the UI can render a results table without looping /task itself. */
  async postBatch(body: postBatchBody): Promise<postBatchResponse> {
    return this.request<postBatchResponse>({
      method: 'POST',
      path: '/api/batch',
      body: body as unknown,
    });
  }

  /** Close a worker. */
  async postClose(body: postCloseBody): Promise<postCloseResponse> {
    return this.request<postCloseResponse>({
      method: 'POST',
      path: '/api/close',
      body: body as unknown,
    });
  }

  /** Get the live daemon config (sans secrets). */
  async getConfig(): Promise<getConfigResponse> {
    return this.request<getConfigResponse>({
      method: 'GET',
      path: '/api/config',
    });
  }

  /** Reload config.json from disk; restart sub-systems as needed. */
  async postConfigReload(): Promise<postConfigReloadResponse> {
    return this.request<postConfigReloadResponse>({
      method: 'POST',
      path: '/api/config/reload',
    });
  }

  /** (8.28) Autonomous dispatcher inspection. Returns a static disabled payload when the instance is null so the CLI never has to disambiguate a 404 from a real response. */
  async getAutonomousStatus(): Promise<getAutonomousStatusResponse> {
    return this.request<getAutonomousStatusResponse>({
      method: 'GET',
      path: '/api/autonomous/status',
    });
  }

  /** Pause the TODO auto-dispatch loop (8.28). */
  async postAutonomousPause(body: postAutonomousPauseBody): Promise<postAutonomousPauseResponse> {
    return this.request<postAutonomousPauseResponse>({
      method: 'POST',
      path: '/api/autonomous/pause',
      body: body as unknown,
    });
  }

  /** Resume the TODO auto-dispatch loop. */
  async postAutonomousResume(): Promise<postAutonomousResumeResponse> {
    return this.request<postAutonomousResumeResponse>({
      method: 'POST',
      path: '/api/autonomous/resume',
    });
  }

  /** Manual tick for tests + operators who want to kick the loop without waiting for the throttle window. */
  async postAutonomousTick(): Promise<postAutonomousTickResponse> {
    return this.request<postAutonomousTickResponse>({
      method: 'POST',
      path: '/api/autonomous/tick',
    });
  }

  /** Start a scribe session — record manager context periodically. */
  async postScribeStart(body: postScribeStartBody): Promise<postScribeStartResponse> {
    return this.request<postScribeStartResponse>({
      method: 'POST',
      path: '/api/scribe/start',
      body: body as unknown,
    });
  }

  /** Stop the active scribe session. */
  async postScribeStop(): Promise<postScribeStopResponse> {
    return this.request<postScribeStopResponse>({
      method: 'POST',
      path: '/api/scribe/stop',
    });
  }

  /** Get scribe session state (active / interval / last record). */
  async getScribeStatus(): Promise<getScribeStatusResponse> {
    return this.request<getScribeStatusResponse>({
      method: 'GET',
      path: '/api/scribe/status',
    });
  }

  /** Force one immediate scribe scan (debug). */
  async postScribeScan(): Promise<postScribeScanResponse> {
    return this.request<postScribeScanResponse>({
      method: 'POST',
      path: '/api/scribe/scan',
    });
  }

  /** (10.9) Structured event timeline. Powers `c4 events`. Every query param is optional; omit them all to get every recorded event. Types / workers accept comma-separated lists. */
  async getEventsQuery(params?: getEventsQueryParams): Promise<getEventsQueryResponse> {
    return this.request<getEventsQueryResponse>({
      method: 'GET',
      path: '/api/events/query',
      params: params as unknown as Record<string, unknown> | undefined,
    });
  }

  /** (10.9) Surrounding events for a given id or timestamp. Powers `c4 events --around <ts>`. */
  async getEventsContext(params: getEventsContextParams): Promise<getEventsContextResponse> {
    return this.request<getEventsContextResponse>({
      method: 'GET',
      path: '/api/events/context',
      params: params as unknown as Record<string, unknown> | undefined,
    });
  }

  /** Per-worker token usage roll-up + cost estimate. */
  async getTokenUsage(params?: getTokenUsageParams): Promise<getTokenUsageResponse> {
    return this.request<getTokenUsageResponse>({
      method: 'GET',
      path: '/api/token-usage',
      params: params as unknown as Record<string, unknown> | undefined,
    });
  }

  /** (8.3) Snapshot of tier quota usage. CLI: `c4 quota`. */
  async getQuota(): Promise<getQuotaResponse> {
    return this.request<getQuotaResponse>({
      method: 'GET',
      path: '/api/quota',
    });
  }

  /** Get worker terminal scrollback (?lines=N). */
  async getScrollback(params: getScrollbackParams): Promise<getScrollbackResponse> {
    return this.request<getScrollbackResponse>({
      method: 'GET',
      path: '/api/scrollback',
      params: params as unknown as Record<string, unknown> | undefined,
    });
  }

  /** 8.13: Web UI viewport resize -> server PTY + ScreenBuffer resize */
  async postResize(body: postResizeBody): Promise<postResizeResponse> {
    return this.request<postResizeResponse>({
      method: 'POST',
      path: '/api/resize',
      body: body as unknown,
    });
  }

  /** Hook architecture (3.15): receive structured events from Claude Code hooks */
  async postHookEvent(): Promise<postHookEventResponse> {
    return this.request<postHookEventResponse>({
      method: 'POST',
      path: '/api/hook-event',
    });
  }

  /** Query hook events for a worker (3.15) */
  async getHookEvents(): Promise<getHookEventsResponse> {
    return this.request<getHookEventsResponse>({
      method: 'GET',
      path: '/api/hook-events',
    });
  }

  /** SSE stream of all daemon events. */
  async getEvents(): Promise<getEventsResponse> {
    return this.request<getEventsResponse>({
      method: 'GET',
      path: '/api/events',
    });
  }

  /** (8.26) Snapshot of the approval_pending set. Cheap to call, used by `c4 watch-interventions` on initial connect and by tests that want a non-streaming view. */
  async getApprovals(): Promise<getApprovalsResponse> {
    return this.request<getApprovalsResponse>({
      method: 'GET',
      path: '/api/approvals',
    });
  }

  /** (8.26) Persistent SSE stream of approval_pending transitions. Reviewer sessions subscribe once and receive enter / exit / slack_alert / timeout events for every worker without needing to poll read-now or re-arm a per-worker wait. */
  async getApprovalsStream(): Promise<getApprovalsStreamResponse> {
    return this.request<getApprovalsStreamResponse>({
      method: 'GET',
      path: '/api/approvals/stream',
    });
  }

  /** Send a planner-mode task to a worker (--branch, --output). */
  async postPlan(): Promise<postPlanResponse> {
    return this.request<postPlanResponse>({
      method: 'POST',
      path: '/api/plan',
    });
  }

  /** Read the most recent plan output for a worker. */
  async getPlan(): Promise<getPlanResponse> {
    return this.request<getPlanResponse>({
      method: 'GET',
      path: '/api/plan',
    });
  }

  /** (9.12) Planner Back-propagation loop entry point. */
  async postPlanUpdate(): Promise<postPlanUpdateResponse> {
    return this.request<postPlanUpdateResponse>({
      method: 'POST',
      path: '/api/plan-update',
    });
  }

  /** List plan revisions for a worker. */
  async getPlanRevisions(): Promise<getPlanRevisionsResponse> {
    return this.request<getPlanRevisionsResponse>({
      method: 'GET',
      path: '/api/plan-revisions',
    });
  }

  /** MCP tool invocation passthrough. */
  async postMcp(): Promise<postMcpResponse> {
    return this.request<postMcpResponse>({
      method: 'POST',
      path: '/api/mcp',
    });
  }

  /** List built-in worker templates (planner / executor / reviewer / generic). */
  async getTemplates(): Promise<getTemplatesResponse> {
    return this.request<getTemplatesResponse>({
      method: 'GET',
      path: '/api/templates',
    });
  }

  /** List configured permission profiles (RBAC). */
  async getProfiles(): Promise<getProfilesResponse> {
    return this.request<getProfilesResponse>({
      method: 'GET',
      path: '/api/profiles',
    });
  }

  /** Get sub-worker swarm topology for a manager. */
  async getSwarm(): Promise<getSwarmResponse> {
    return this.request<getSwarmResponse>({
      method: 'GET',
      path: '/api/swarm',
    });
  }

  /** Spawn the autonomous manager + scribe pair. */
  async postAuto(): Promise<postAutoResponse> {
    return this.request<postAutoResponse>({
      method: 'POST',
      path: '/api/auto',
    });
  }

  /** Generate the morning report (overnight activity summary). */
  async postMorning(): Promise<postMorningResponse> {
    return this.request<postMorningResponse>({
      method: 'POST',
      path: '/api/morning',
    });
  }

  /** Post a manual Slack status message tagged with a worker. */
  async postStatusUpdate(): Promise<postStatusUpdateResponse> {
    return this.request<postStatusUpdateResponse>({
      method: 'POST',
      path: '/api/status-update',
    });
  }

  /** (8.15) Tail of the in-memory event buffer. Open to any authenticated caller so dashboards can render the recent feed without holding the SLACK_WRITE permission. */
  async getSlackEvents(): Promise<getSlackEventsResponse> {
    return this.request<getSlackEventsResponse>({
      method: 'GET',
      path: '/api/slack/events',
    });
  }

  /** (8.15) Manual event injection. Only operators with SLACK_WRITE can call this — the CLI `c4 slack test` uses the same route so a viewer JWT cannot flood the channel. */
  async postSlackEmit(): Promise<postSlackEmitResponse> {
    return this.request<postSlackEmitResponse>({
      method: 'POST',
      path: '/api/slack/emit',
    });
  }

  /** 8.7: richer summary shape for the Web UI. Query params stay backwards compatible with the 3.7 CLI (`worker`, `limit`) and add search/filter parameters (`q`, `status`, `since`, `until`). */
  async getHistory(params?: getHistoryParams): Promise<getHistoryResponse> {
    return this.request<getHistoryResponse>({
      method: 'GET',
      path: '/api/history',
      params: params as unknown as Record<string, unknown> | undefined,
    });
  }

  /** 8.7: scribe session-context.md viewer. Reads docs/session-context.md from the project root (or from config.scribe.outputPath if set). */
  async getScribeContext(): Promise<getScribeContextResponse> {
    return this.request<getScribeContextResponse>({
      method: 'GET',
      path: '/api/scribe-context',
    });
  }

  /** Claude Code session JSONL listing. */
  async getSessions(params?: getSessionsParams): Promise<getSessionsResponse> {
    return this.request<getSessionsResponse>({
      method: 'GET',
      path: '/api/sessions',
      params: params as unknown as Record<string, unknown> | undefined,
    });
  }

  /** Attach an external claude session by JSONL path. */
  async postAttach(body: postAttachBody): Promise<postAttachResponse> {
    return this.request<postAttachResponse>({
      method: 'POST',
      path: '/api/attach',
      body: body as unknown,
    });
  }

  /** List all attached external sessions. */
  async getAttachList(): Promise<getAttachListResponse> {
    return this.request<getAttachListResponse>({
      method: 'GET',
      path: '/api/attach/list',
    });
  }

  /** Fleet management (9.6): aggregate this daemon's state plus every registered peer in ~/.c4/fleet.json. Best-effort with a per-machine timeout so one unreachable peer cannot stall the endpoint — see src/fleet.js for the sampling contract. */
  async getFleetOverview(): Promise<getFleetOverviewResponse> {
    return this.request<getFleetOverviewResponse>({
      method: 'GET',
      path: '/api/fleet/overview',
    });
  }

  /** Fleet task distribution (9.7). Build a placement plan across reachable fleet machines (plus the local daemon) using the requested strategy, then fan out /create + /task to each slot. When no fleet machines are configured everything lands on localhost. Every remote unreachable -> fall back to local too. */
  async postDispatch(): Promise<postDispatchResponse> {
    return this.request<postDispatchResponse>({
      method: 'POST',
      path: '/api/dispatch',
    });
  }

  /** Machine-to-machine file transfer (9.8). Accepts either   { alias, type: 'rsync', src, dest, opts? } -> rsync over ssh or   { alias, type: 'git',   src, remoteRepoPath, branch, opts? } -> git push The HTTP response returns immediately with { started, pid } so the caller can poll /events for the progress stream. Progress, completion and error events arrive on the existing SSE bus. */
  async postTransfer(body: postTransferBody): Promise<postTransferResponse> {
    return this.request<postTransferResponse>({
      method: 'POST',
      path: '/api/transfer',
      body: body as unknown,
    });
  }

  /** Manager auto-replacement (4.7): compact event from PostCompact hook */
  async postCompactEvent(): Promise<postCompactEventResponse> {
    return this.request<postCompactEventResponse>({
      method: 'POST',
      path: '/api/compact-event',
    });
  }

  /** Resume support (4.1): get session ID for a worker */
  async getSessionId(): Promise<getSessionIdResponse> {
    return this.request<getSessionIdResponse>({
      method: 'GET',
      path: '/api/session-id',
    });
  }

  /** Resume support (4.1): restart worker with --resume */
  async postResume(body: postResumeBody): Promise<postResumeResponse> {
    return this.request<postResumeResponse>({
      method: 'POST',
      path: '/api/resume',
      body: body as unknown,
    });
  }

  /** Watch worker output stream (5.42) — SSE with base64-encoded PTY data */
  async getWatch(params: getWatchParams): Promise<getWatchResponse> {
    return this.request<getWatchResponse>({
      method: 'GET',
      path: '/api/watch',
      params: params as unknown as Record<string, unknown> | undefined,
    });
  }

  /** Dashboard Web UI (4.3) */
  async getDashboard(): Promise<getDashboardResponse> {
    return this.request<getDashboardResponse>({
      method: 'GET',
      path: '/api/dashboard',
    });
  }
}
