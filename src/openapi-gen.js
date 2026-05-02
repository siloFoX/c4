'use strict';

// Auto-generate a minimal OpenAPI 3.0 spec from daemon.js route handlers.
// The grep-based extractor walks the if/else-if chain in dispatchRequest,
// pairs each (method, route) with the immediate JSDoc-style comment block
// above its branch (when present), and produces a paths{} map. Run-time
// generation keeps the spec in sync with the code without a separate
// build step or hand-maintained YAML file.
//
// Limitations: schemas live as `application/json` blobs without
// concrete type info — operators get the route list and HTTP method,
// not the parameter shapes (those still live in `docs/api.md` / each
// patch note). The 1.6.17-cumulative cherry-pick (8a43044) had curated
// per-route summaries baked in; follow-up work can fold those into
// ROUTE_SUMMARIES below as they're collected.

const fs = require('fs');
const path = require('path');

// Optional curated summaries — keyed as `<METHOD> <route>`.
// New entries land here as operator docs evolve.
const ROUTE_SUMMARIES = {
  'GET /health': 'Daemon liveness probe — returns {ok, version, workers}.',
  'GET /metrics': 'Per-worker + daemon CPU/RSS snapshot (worker-metrics module).',
  'GET /workspaces': 'Multi-repo workspace listing (config.workspaces).',
  'GET /list': 'List all known workers (live + queued + lost).',
  'POST /create': 'Create a new worker.',
  'POST /send': 'Send text to a worker PTY.',
  'POST /key': 'Send a special key (Enter / Escape / etc) to a worker.',
  'GET /read': 'Read worker output (idle-state only).',
  'GET /read-now': 'Read worker output immediately (any state).',
  'POST /task': 'Send a task to a worker (auto-spawn if missing).',
  'POST /merge': 'Merge a worker branch to main after pre-merge checks.',
  'POST /close': 'Close a worker.',
  'GET /events': 'SSE stream of all daemon events.',
  'GET /sessions': 'Claude Code session JSONL listing.',
  'POST /attach': 'Attach an external claude session by JSONL path.',
  'GET /attach/list': 'List all attached external sessions.',
  'GET /workflows': 'List defined workflows.',
  'POST /workflows': 'Create a new workflow definition.',
  'GET /openapi.json': 'This document — auto-generated OpenAPI spec.',
  'GET /openapi.yaml': 'Same spec as /openapi.json, serialised as YAML.',
  'GET /api-docs/redoc': 'Redoc rendering of the openapi.json spec (alternative to Swagger UI).',
  'POST /auth/login': 'Authenticate with username/password — returns JWT.',
  'POST /auth/logout': 'Invalidate the caller\'s session.',
  'GET /auth/status': 'Whether auth is enabled + which actions allowed.',
  'GET /audit/verify': 'Verify the audit-log hash chain (?includeRotated=1 for full history).',
  'GET /wait-read': 'Block until a worker is idle, then return its scrollback.',
  'GET /wait-read-multi': 'Multi-worker waitRead — first idle worker returns first.',
  'GET /tree': 'Hierarchical worker tree (parent/child topology).',
  'POST /approve': 'Approve a critical command awaiting human review.',
  'POST /rollback': 'Roll back a worker branch (reset --hard to base).',
  'POST /cleanup': 'Sweep orphaned worktrees / branches / temp dirs.',
  'GET /config': 'Get the live daemon config (sans secrets).',
  'POST /config/reload': 'Reload config.json from disk; restart sub-systems as needed.',
  'POST /autonomous/pause': 'Pause the TODO auto-dispatch loop (8.28).',
  'POST /autonomous/resume': 'Resume the TODO auto-dispatch loop.',
  'POST /scribe/start': 'Start a scribe session — record manager context periodically.',
  'POST /scribe/stop': 'Stop the active scribe session.',
  'GET /scribe/status': 'Get scribe session state (active / interval / last record).',
  'POST /scribe/scan': 'Force one immediate scribe scan (debug).',
  'GET /token-usage': 'Per-worker token usage roll-up + cost estimate.',
  'GET /scrollback': 'Get worker terminal scrollback (?lines=N).',
  'POST /plan': 'Send a planner-mode task to a worker (--branch, --output).',
  'GET /plan': 'Read the most recent plan output for a worker.',
  'GET /plan-revisions': 'List plan revisions for a worker.',
  'POST /mcp': 'MCP tool invocation passthrough.',
  'GET /templates': 'List built-in worker templates (planner / executor / reviewer / generic).',
  'GET /profiles': 'List configured permission profiles (RBAC).',
  'GET /swarm': 'Get sub-worker swarm topology for a manager.',
  'POST /auto': 'Spawn the autonomous manager + scribe pair.',
  'POST /morning': 'Generate the morning report (overnight activity summary).',
  'POST /status-update': 'Post a manual Slack status message tagged with a worker.',
  'GET /validation': 'Read the worker\'s .c4-validation.json (typecheck/lint/tests results) — synthesised from git state when missing.',
  'POST /risk/check': 'Run a Bash command through the risk classifier without dispatching it. Mirrors `c4 risk` + the PreToolUse hook so the Web UI can preview risk levels before sending.',
  'POST /risk/preview': 'Pure builder — return the OS-binary argv that the configured (or operator-supplied) sandbox runtime would use to isolate `command`. No exec, no classification. HTTP equivalent of `c4 risk <cmd> --sandbox-preview`.',
  'POST /risk/exec': 'Shadow execution. Refuses unless `riskClassifier.sandbox.allowExec===true` in config (defaults off). Refuses NullRuntime. Captures stdout/stderr/exitCode/duration with hard timeout + buffer caps; emits scribe-v2 `risk_shadow_exec` + audit-chain `risk.shadow_exec`. Returns the result envelope on every code path (incl. refused).',
  'GET /risk/stats': 'Aggregate risk.denied + risk.dryRun audit events from the last N hours (windowHours, default 24, max 720). Returns total + breakdown by level + top reasons + top workers. (v1.10.90) Also includes shadowExec / shadowExecKilled / shadowExecNonZero counts so operators see classifier denials AND shadow exec runs in one window.',
  'GET /risk/patterns': 'Built-in risk classifier pattern catalog + operator-configured customRules / allowList / denyList counts. Useful for policy reviewers auditing the effective rule set.',
  'POST /risk/ai-feedback': 'AI second-pass feedback hook. External LLM (operator-supplied) POSTs its level assessment of a command; daemon records to audit chain, broadcasts via SSE, and Slack-alerts when the AI escalates a command past the autoDenyLevel that the catalog missed.',
};

// Optional curated request/response schemas — populates the OpenAPI
// `requestBody` (for POST/PUT/PATCH) and `parameters` (for GET query
// strings). Only seed routes operators actually call from Swagger UI;
// the rest get the bare `summary + responses[200..500]` envelope.
//
// Schema dialect: subset of JSON Schema Draft-07 (OpenAPI 3.0
// compatible). When a route has no entry here, the generated spec
// is still valid — Swagger UI just shows "(no parameters)".
//
// Standard error body for 4xx/5xx responses. Every daemon error
// response goes through `res.end(JSON.stringify({ error: <msg> }))`
// so the schema is uniform across the surface. Hoisting it to a
// constant keeps the per-route response envelope thin.
//
// `details` populates on the validation 400 path
// (`{error: 'Validation failed', details: ['body.X: required', ...]}`)
// — kept optional so unrelated 4xx responses don't get penalised.
const ERROR_BODY_SCHEMA = {
  type: 'object',
  properties: {
    error: { type: 'string', description: 'Human-readable error message' },
    details: {
      type: 'array',
      items: { type: 'string' },
      description: 'Per-field validation errors (only present on 400 from validateRequests)',
    },
  },
};

const ROUTE_SCHEMAS = {
  'POST /auth/login': {
    requestBody: {
      required: ['user', 'password'],
      properties: {
        user: { type: 'string', description: 'Username' },
        password: { type: 'string', description: 'Plain-text password' },
      },
      example: { user: 'admin', password: 'admin123' },
    },
    response: {
      properties: {
        token: { type: 'string', description: 'JWT bearer token' },
        user: { type: 'string' },
        role: { type: 'string', enum: ['admin', 'manager', 'viewer'] },
      },
    },
  },
  'POST /auth/logout': {
    response: { properties: { ok: { type: 'boolean' } } },
  },
  'GET /auth/status': {
    response: {
      properties: {
        enabled: { type: 'boolean' },
      },
    },
  },
  'GET /health': {
    response: {
      properties: {
        ok: { type: 'boolean' },
        workers: { type: 'integer' },
        version: { type: 'string', nullable: true },
      },
    },
  },
  'GET /metrics': {
    response: {
      properties: {
        daemon: {
          type: 'object',
          properties: {
            pid: { type: 'integer' },
            uptimeSec: { type: 'number' },
            rssKb: { type: 'number' },
            heapUsedKb: { type: 'number' },
            heapTotalKb: { type: 'number' },
            cpus: { type: 'integer' },
            loadavg: { type: 'array', items: { type: 'number' } },
          },
        },
        workers: {
          type: 'array',
          items: {
            properties: {
              name: { type: 'string' },
              pid: { type: 'integer', nullable: true },
              status: { type: 'string', description: 'idle / busy / exited / etc' },
              cpuPct: { type: 'number', nullable: true },
              rssKb: { type: 'number', nullable: true },
              threads: { type: 'integer', nullable: true },
            },
          },
        },
        totals: {
          type: 'object',
          properties: {
            liveWorkers: { type: 'integer' },
            totalWorkers: { type: 'integer' },
            totalRssKb: { type: 'number' },
            totalCpuPct: { type: 'number' },
          },
        },
      },
    },
  },
  'GET /workspaces': {
    response: {
      properties: {
        workspaces: {
          type: 'array',
          items: {
            properties: {
              name: { type: 'string' },
              path: { type: 'string' },
              exists: { type: 'boolean' },
              isGitRepo: { type: 'boolean' },
            },
          },
        },
      },
    },
  },
  'POST /create': {
    requestBody: {
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Worker name (unique)' },
        command: { type: 'string', description: 'Override claude binary path' },
        args: { type: 'array', items: { type: 'string' }, description: 'Additional CLI args passed to the worker process' },
        target: { type: 'string', description: "'local' | 'dgx' | fleet alias" },
        cwd: { type: 'string', description: 'Working directory' },
        parent: { type: 'string', description: 'Parent worker name (for hierarchy)' },
        tier: { type: 'string', description: "'manager' | 'worker' | string" },
        pinnedMemory: { type: 'array', items: { type: 'string' } },
        pinRole: { type: 'string', enum: ['manager', 'worker', 'attached'] },
      },
      example: { name: 'worker-1', target: 'local', tier: 'worker' },
    },
    response: {
      properties: {
        success: { type: 'boolean' },
        name: { type: 'string' },
        pid: { type: 'integer' },
        branch: { type: 'string' },
      },
    },
  },
  'POST /send': {
    requestBody: {
      required: ['name', 'input'],
      properties: {
        name: { type: 'string' },
        input: { type: 'string', description: 'Text or keystrokes to write to the PTY' },
        keys: { type: 'boolean', description: 'When true, treat input as keys (Enter / C-c / etc) — see /key for the canonical surface' },
      },
      example: { name: 'worker-1', input: 'List the files in src/' },
    },
    response: {
      properties: {
        success: { type: 'boolean' },
        bytesWritten: { type: 'integer' },
      },
    },
  },
  'POST /key': {
    requestBody: {
      required: ['name', 'key'],
      properties: {
        name: { type: 'string' },
        key: { type: 'string', description: 'Enter | Escape | Tab | C-c | Up | Down | etc' },
      },
      example: { name: 'worker-1', key: 'Enter' },
    },
    response: {
      properties: {
        success: { type: 'boolean' },
        key: { type: 'string', description: 'Echoed back for confirmation' },
      },
    },
  },
  'GET /read': {
    parameters: [
      { name: 'name', in: 'query', required: true, schema: { type: 'string' } },
    ],
    response: {
      properties: {
        content: { type: 'string', description: 'Latest PTY snapshot since the last read (ANSI stripped). Empty when no new snapshots are pending.' },
        status: { type: 'string', enum: ['idle', 'busy', 'exited'] },
        snapshotsRead: { type: 'integer', description: 'How many pending snapshots were consumed by this call' },
        pendingSnapshots: { type: 'integer', description: 'Always 0 on the empty path; informational' },
        exitCode: { type: 'integer', nullable: true, description: 'Exit code on the last snapshot when the worker has exited' },
        summarized: { type: 'boolean', description: '3.14 summary layer applied (true when the snapshot was long enough to trigger a summary)' },
      },
    },
  },
  'GET /read-now': {
    parameters: [
      { name: 'name', in: 'query', required: true, schema: { type: 'string' } },
    ],
    response: {
      properties: {
        content: { type: 'string', description: 'Current PTY screen contents (rendered, not snapshot history)' },
        status: { type: 'string', enum: ['idle', 'busy', 'exited'] },
      },
    },
  },
  'POST /task': {
    requestBody: {
      required: ['task'],
      properties: {
        name: { type: 'string', description: 'Worker name (auto-generated if omitted)' },
        task: { type: 'string', description: 'Task prompt' },
        branch: { type: 'string' },
        useBranch: { type: 'boolean' },
        useWorktree: { type: 'boolean' },
        projectRoot: { type: 'string' },
        cwd: { type: 'string' },
        scope: { type: 'string', description: 'Path scope hint passed to the worker (whitelist for tool access)' },
        scopePreset: { type: 'string', description: 'Named scope preset from config' },
        after: { type: 'string', description: 'Wait for this worker to idle before starting' },
        command: { type: 'string', description: 'Override claude binary path' },
        target: { type: 'string' },
        contextFrom: { type: 'string', description: 'Worker name to inherit context from' },
        reuse: { type: 'boolean', description: 'Reuse an existing worker if name matches' },
        tier: { type: 'string', description: "'manager' | 'worker' | string" },
        workspace: { type: 'string', description: 'config.workspaces[name] lookup' },
        profile: { type: 'string', description: 'Built-in template alias' },
        autoMode: { type: 'boolean' },
        budgetUsd: { type: 'number' },
        maxRetries: { type: 'integer' },
        model: { type: 'string', description: 'Override Claude model' },
        planDocPath: { type: 'string', description: 'Anchor a plan-back-prop loop to this doc' },
      },
      example: { task: 'Add a unit test for the parseConfig() helper', autoMode: true },
    },
    response: {
      properties: {
        success: { type: 'boolean' },
        name: { type: 'string', description: 'Auto-generated when caller omitted name' },
        tier: { type: 'string' },
        model: { type: 'string', nullable: true },
        queued: { type: 'boolean', description: 'true when worker spawned + task queued' },
      },
    },
  },
  'POST /merge': {
    requestBody: {
      properties: {
        name: { type: 'string' },
        branch: { type: 'string' },
        skipChecks: { type: 'boolean' },
      },
      example: { name: 'worker-1' },
    },
    response: {
      properties: {
        success: { type: 'boolean' },
        branch: { type: 'string' },
        sha: { type: 'string', description: 'Merge commit SHA' },
        summary: { type: 'string' },
        reasons: { type: 'array', items: { type: 'string' } },
        resolvedFrom: { type: 'string', enum: ['name', 'branch'] },
      },
    },
  },
  'POST /close': {
    requestBody: {
      required: ['name'],
      properties: {
        name: { type: 'string' },
      },
      example: { name: 'worker-1' },
    },
    response: {
      properties: {
        success: { type: 'boolean' },
        name: { type: 'string' },
      },
    },
  },
  'GET /list': {
    response: {
      properties: {
        workers: {
          type: 'array',
          items: {
            properties: {
              name: { type: 'string' },
              kind: { type: 'string', description: "spawned (PTY-backed) | attached (imported JSONL)" },
              command: { type: 'string', nullable: true },
              target: { type: 'string', description: 'local / dgx / fleet alias' },
              branch: { type: 'string', nullable: true },
              worktree: { type: 'string', nullable: true },
              parent: { type: 'string', nullable: true, description: 'Parent worker name (hierarchy)' },
              tier: { type: 'string', description: 'manager / worker' },
              pid: { type: 'integer', nullable: true },
              status: { type: 'string', enum: ['idle', 'busy', 'exited'] },
              unreadSnapshots: { type: 'integer' },
              totalSnapshots: { type: 'integer' },
              intervention: { type: 'string', nullable: true, enum: [null, 'approval_pending', 'background_exit', 'past_resolved'] },
              hasPastIntervention: { type: 'boolean' },
              lastInterventionAt: { type: 'string', nullable: true },
              cpuPct: { type: 'number', nullable: true },
              rssKb: { type: 'number', nullable: true },
              threads: { type: 'integer', nullable: true },
              errorCount: { type: 'integer' },
              phase: { type: 'string', nullable: true },
              testFailCount: { type: 'integer' },
              failureHint: { type: 'object', nullable: true },
            },
          },
        },
        queuedTasks: {
          type: 'array',
          items: {
            properties: {
              name: { type: 'string' },
              task: { type: 'string' },
              branch: { type: 'string', nullable: true },
              after: { type: 'string', nullable: true },
              queuedAt: { type: 'string' },
              status: { type: 'string', enum: ['queued'] },
            },
          },
        },
        lostWorkers: {
          type: 'array',
          items: {
            properties: {
              name: { type: 'string' },
              pid: { type: 'integer', nullable: true },
              branch: { type: 'string', nullable: true },
              worktree: { type: 'string', nullable: true },
              parent: { type: 'string', nullable: true },
              sessionId: { type: 'string', nullable: true },
              pinnedMemory: { type: 'object', nullable: true },
              lostAt: { type: 'string', description: 'ISO timestamp of last save before daemon restart' },
            },
          },
        },
        lastHealthCheck: { type: 'integer', nullable: true, description: 'Unix epoch milliseconds; null on a fresh daemon' },
      },
    },
  },
  'GET /sessions': {
    parameters: [
      { name: 'workerName', in: 'query', schema: { type: 'string', description: 'When set, returns the single Conversation for that worker instead of the list shape' } },
      { name: 'q', in: 'query', schema: { type: 'string', description: 'Substring filter against project path / session id / last assistant snippet' } },
    ],
    response: {
      // Two response shapes depending on the `workerName` parameter:
      //   - workerName set: { sessionId, conversation, workerName }
      //   - else:           { rootDir, sessions, groups, total }
      // We document both in one envelope; SDK callers branch on
      // workerName presence at the call site.
      properties: {
        // Shape A (workerName branch)
        sessionId: { type: 'string', nullable: true, description: '(workerName branch) Resolved session UUID for the worker, or null if no JSONL is available yet' },
        conversation: { type: 'object', nullable: true, description: '(workerName branch) Parsed Conversation from the JSONL' },
        workerName: { type: 'string', description: '(workerName branch) Echo of the request param' },
        // Shape B (list branch)
        rootDir: { type: 'string', description: '(list branch) Resolved Claude Code projects root the daemon is scanning' },
        sessions: {
          type: 'array',
          description: '(list branch) All sessions found under rootDir',
          items: {
            properties: {
              sessionId: { type: 'string' },
              path: { type: 'string' },
              projectPath: { type: 'string', nullable: true },
              projectDir: { type: 'string', nullable: true },
              lastAssistantSnippet: { type: 'string', nullable: true },
            },
          },
        },
        groups: { type: 'array', items: { type: 'object' }, description: '(list branch) Sessions grouped by project directory' },
        total: { type: 'integer', description: '(list branch) Total session count' },
      },
    },
  },
  'POST /attach': {
    requestBody: {
      // Accept either path OR sessionId — at least one must be set.
      // The validator can't express the "either-or" rule, so neither
      // field is `required`; the route handler returns 400 when both
      // are absent.
      properties: {
        path: { type: 'string', description: 'Absolute path to claude session JSONL' },
        sessionId: { type: 'string', description: 'Bare UUID — daemon resolves to JSONL via sessions.projectsDir' },
        name: { type: 'string', description: 'Display name (defaults to UUID)' },
        role: { type: 'string', enum: ['manager', 'worker', 'planner', 'executor', 'reviewer', 'generic'] },
      },
      example: { path: '/home/user/.claude/projects/-myproject/abc-uuid.jsonl' },
    },
    response: {
      properties: {
        name: { type: 'string', description: 'Display name (UUID-derived when not supplied)' },
        sessionId: { type: 'string', nullable: true },
        projectPath: { type: 'string', nullable: true, description: 'Original project root the JSONL was recorded in' },
        jsonlPath: { type: 'string' },
        createdAt: { type: 'string', nullable: true },
        turns: { type: 'integer', description: 'Number of conversation turns parsed from the JSONL' },
        tokens: { type: 'integer', description: 'Total tokens summed across all turns' },
        model: { type: 'string', nullable: true, description: 'Last model id seen in the transcript' },
        warnings: { type: 'array', items: { type: 'string' }, description: 'Non-fatal parse warnings' },
      },
    },
  },
  'POST /approve': {
    requestBody: {
      required: ['name'],
      properties: {
        name: { type: 'string' },
        optionNumber: { type: 'integer', description: 'Option number for TUI prompts (1 = Yes/proceed, others = decline/custom)' },
      },
      example: { name: 'worker-1', optionNumber: 1 },
    },
    response: { properties: { success: { type: 'boolean' } } },
  },
  'POST /rollback': {
    requestBody: {
      required: ['name'],
      properties: {
        name: { type: 'string' },
      },
      example: { name: 'worker-1' },
    },
    response: {
      properties: {
        success: { type: 'boolean' },
        rolled_back: { type: 'string', description: 'Branch reset target' },
      },
    },
  },
  'GET /scrollback': {
    parameters: [
      { name: 'name', in: 'query', required: true, schema: { type: 'string' } },
      { name: 'lines', in: 'query', schema: { type: 'integer', description: 'Last N lines to return (default 200)' } },
    ],
    response: {
      properties: {
        content: { type: 'string', description: 'PTY scrollback as a single newline-joined string' },
        lines: { type: 'integer', description: 'Actual number of lines returned (capped by lastN and total scrollback)' },
        totalScrollback: { type: 'integer', description: 'Total lines in the buffer regardless of lastN' },
      },
    },
  },
  'GET /audit/verify': {
    parameters: [
      { name: 'includeRotated', in: 'query', schema: { type: 'string', enum: ['0', '1'] } },
    ],
    response: {
      properties: {
        valid: { type: 'boolean' },
        corruptedAt: { type: 'integer', nullable: true },
        total: { type: 'integer' },
        rotatedTotal: { type: 'integer' },
      },
    },
  },
  'GET /audit/export': {
    parameters: [
      { name: 'from', in: 'query', schema: { type: 'string', description: 'ISO timestamp' } },
      { name: 'to', in: 'query', schema: { type: 'string' } },
      { name: 'type', in: 'query', schema: { type: 'string' } },
      { name: 'target', in: 'query', schema: { type: 'string' } },
      { name: 'limit', in: 'query', schema: { type: 'integer' } },
      { name: 'bom', in: 'query', schema: { type: 'string', enum: ['0', '1'], description: 'Set 0 to omit the UTF-8 BOM (default 1 for Excel-friendliness)' } },
      { name: 'lineEnd', in: 'query', schema: { type: 'string', enum: ['crlf', 'lf'], description: 'Set lf for Unix line endings (default crlf for Windows/Excel)' } },
    ],
    response: {
      contentType: 'text/csv',
      description: 'CSV body with UTF-8 BOM + CRLF (text/csv content-type)',
      type: 'string',
    },
  },
  'GET /openapi.json': {
    response: {
      properties: {
        openapi: { type: 'string', example: '3.0.3' },
        info: { type: 'object' },
        paths: { type: 'object' },
      },
    },
  },
  'GET /audit/query': {
    parameters: [
      { name: 'from', in: 'query', schema: { type: 'string', description: 'ISO timestamp' } },
      { name: 'to', in: 'query', schema: { type: 'string' } },
      { name: 'type', in: 'query', schema: { type: 'string' } },
      { name: 'target', in: 'query', schema: { type: 'string' } },
      { name: 'limit', in: 'query', schema: { type: 'integer' } },
    ],
    response: {
      properties: {
        events: {
          type: 'array',
          items: {
            properties: {
              timestamp: { type: 'string' },
              type: { type: 'string' },
              actor: { type: 'string' },
              target: { type: 'string' },
              details: { type: 'object' },
              hash: { type: 'string', description: 'SHA-256 hash chain link' },
            },
          },
        },
        count: { type: 'integer' },
        path: { type: 'string', description: 'Path to the live audit log file' },
      },
    },
  },
  'GET /rbac/roles': {
    response: {
      properties: {
        roles: {
          type: 'array',
          items: {
            properties: {
              name: { type: 'string', enum: ['admin', 'manager', 'viewer'] },
              actions: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
  },
  'GET /rbac/users': {
    response: {
      properties: {
        users: {
          type: 'array',
          items: {
            properties: {
              user: { type: 'string' },
              role: { type: 'string' },
              grants: { type: 'object' },
            },
          },
        },
      },
    },
  },
  'POST /rbac/role/assign': {
    requestBody: {
      required: ['username', 'role'],
      properties: {
        username: { type: 'string' },
        role: { type: 'string', enum: ['admin', 'manager', 'viewer'] },
      },
      example: { username: 'alice', role: 'manager' },
    },
    response: {
      properties: {
        username: { type: 'string' },
        role: { type: 'string' },
        projectIds: { type: 'array', items: { type: 'string' }, description: 'Project ids the user already had access to (preserved on role change)' },
        machineAliases: { type: 'array', items: { type: 'string' }, description: 'Fleet machine aliases the user already had access to' },
      },
    },
  },
  'POST /rbac/grant/project': {
    requestBody: {
      required: ['username', 'projectId'],
      properties: {
        username: { type: 'string' },
        projectId: { type: 'string' },
      },
      example: { username: 'alice', projectId: 'main' },
    },
    response: {
      properties: {
        username: { type: 'string' },
        projectId: { type: 'string' },
        projectIds: { type: 'array', items: { type: 'string' }, description: 'Full updated project access list for the user' },
      },
    },
  },
  'POST /rbac/grant/machine': {
    requestBody: {
      required: ['username', 'alias'],
      properties: {
        username: { type: 'string' },
        alias: { type: 'string', description: 'Fleet peer alias' },
      },
      example: { username: 'alice', alias: 'dgx' },
    },
    response: {
      properties: {
        username: { type: 'string' },
        alias: { type: 'string' },
        machineAliases: { type: 'array', items: { type: 'string' }, description: 'Full updated machine access list for the user' },
      },
    },
  },
  'POST /rbac/revoke/project': {
    requestBody: {
      required: ['username', 'projectId'],
      properties: {
        username: { type: 'string' },
        projectId: { type: 'string' },
      },
      example: { username: 'alice', projectId: 'main' },
    },
    response: { properties: { ok: { type: 'boolean' } } },
  },
  'POST /rbac/revoke/machine': {
    requestBody: {
      required: ['username', 'alias'],
      properties: {
        username: { type: 'string' },
        alias: { type: 'string' },
      },
      example: { username: 'alice', alias: 'dgx' },
    },
    response: { properties: { ok: { type: 'boolean' } } },
  },
  'POST /rbac/check': {
    requestBody: {
      required: ['username', 'action'],
      properties: {
        username: { type: 'string' },
        action: { type: 'string', description: 'Canonical action name (e.g., worker.create)' },
        resource: {
          properties: {
            type: { type: 'string', enum: ['project', 'machine'] },
            id: { type: 'string' },
          },
        },
      },
      example: { username: 'alice', action: 'worker.create', resource: { type: 'project', id: 'main' } },
    },
    response: {
      properties: {
        allowed: { type: 'boolean' },
        username: { type: 'string', description: 'Echo of the requested username' },
        action: { type: 'string', description: 'Echo of the requested action' },
      },
    },
  },
  'GET /tree': {
    response: {
      properties: {
        roots: {
          type: 'array',
          description: 'Top-level workers (no parent or unresolved parent). Each root carries a `children` array of TreeNode and a `rollup` summary aggregated across the subtree.',
          items: {
            properties: {
              name: { type: 'string' },
              parent: { type: 'string', nullable: true },
              status: { type: 'string', nullable: true, enum: [null, 'idle', 'busy', 'exited'] },
              intervention: { type: 'string', nullable: true },
              branch: { type: 'string', nullable: true },
              errorCount: { type: 'integer' },
              unreadSnapshots: { type: 'integer' },
              children: { type: 'array', items: { type: 'object' }, description: 'Recursive: same shape as roots[i]' },
              rollup: {
                type: 'object',
                nullable: true,
                properties: {
                  total: { type: 'integer' },
                  idle: { type: 'integer' },
                  busy: { type: 'integer' },
                  exited: { type: 'integer' },
                  intervention: { type: 'integer' },
                  error: { type: 'integer' },
                },
              },
            },
          },
        },
        queuedTasks: { type: 'array', items: { type: 'object' } },
        lostWorkers: { type: 'array', items: { type: 'object' } },
      },
    },
  },
  'POST /workflows': {
    requestBody: {
      required: ['name', 'nodes', 'edges'],
      properties: {
        id: { type: 'string', description: 'Auto-generated if omitted' },
        name: { type: 'string' },
        description: { type: 'string' },
        nodes: {
          type: 'array',
          items: {
            properties: {
              id: { type: 'string' },
              type: { type: 'string', enum: ['task', 'condition', 'parallel', 'wait', 'audit', 'notify', 'end'] },
              name: { type: 'string' },
              config: { type: 'object', description: 'Node-type-specific knobs (template, expression, durationMs, etc)' },
            },
          },
        },
        edges: {
          type: 'array',
          items: {
            properties: {
              from: { type: 'string', description: 'Source node id' },
              to: { type: 'string', description: 'Target node id' },
              condition: { type: 'string', description: 'Optional guard expression for conditional branches' },
            },
          },
        },
        config: {
          properties: {
            maxConcurrency: { type: 'integer', default: 1 },
          },
        },
      },
      example: {
        id: 'wf-deploy',
        name: 'Deploy pipeline',
        nodes: [
          { id: 'a', type: 'task', name: 'build', config: { template: 'executor' } },
          { id: 'b', type: 'task', name: 'test', config: { template: 'reviewer' } },
          { id: 'end1', type: 'end', name: 'end' },
        ],
        edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'end1' }],
        config: { maxConcurrency: 2 },
      },
    },
    response: {
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        enabled: { type: 'boolean' },
        createdAt: { type: 'string' },
      },
    },
  },
  'GET /workflows': {
    parameters: [
      { name: 'enabled', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
      { name: 'nameContains', in: 'query', schema: { type: 'string', description: 'Substring match against workflow name' } },
    ],
    response: {
      properties: {
        workflows: {
          type: 'array',
          items: {
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              enabled: { type: 'boolean' },
              nodes: { type: 'array', items: { type: 'object' } },
              edges: { type: 'array', items: { type: 'object' } },
              config: { type: 'object', description: 'Executor knobs (maxConcurrency, etc)' },
            },
          },
        },
        count: { type: 'integer' },
      },
    },
  },
  'POST /schedules': {
    requestBody: {
      required: ['name', 'cronExpr', 'taskTemplate'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        cronExpr: { type: 'string', description: 'Cron expression — minute hour dom month dow' },
        taskTemplate: { type: 'string', description: 'Task prompt template' },
        projectId: { type: 'string' },
        assignee: { type: 'string' },
        timezone: { type: 'string', description: 'IANA tz name (e.g., Asia/Seoul)' },
        enabled: { type: 'boolean', default: true },
      },
      example: { name: 'morning-report', cronExpr: '0 9 * * 1-5', taskTemplate: 'Run morning report', timezone: 'Asia/Seoul', enabled: true },
    },
    response: {
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        nextRunAt: { type: 'string', nullable: true },
      },
    },
  },
  'GET /schedules': {
    parameters: [
      { name: 'enabled', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
      { name: 'projectId', in: 'query', schema: { type: 'string' } },
      { name: 'assignee', in: 'query', schema: { type: 'string', description: 'Worker name the schedule dispatches to' } },
    ],
    response: {
      properties: {
        schedules: {
          type: 'array',
          items: {
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              cronExpr: { type: 'string' },
              taskTemplate: { type: 'string' },
              projectId: { type: 'string', nullable: true },
              assignee: { type: 'string', nullable: true },
              enabled: { type: 'boolean' },
              timezone: { type: 'string' },
              nextRun: { type: 'string', nullable: true },
              lastRun: { type: 'string', nullable: true },
              createdAt: { type: 'string', nullable: true },
              updatedAt: { type: 'string', nullable: true },
              history: { type: 'array', items: { type: 'object' } },
            },
          },
        },
        count: { type: 'integer' },
      },
    },
  },
  'POST /projects': {
    requestBody: {
      required: ['id', 'name'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        repoPath: { type: 'string', description: 'Filesystem path to the project repo (for TODO sync)' },
        todoPath: { type: 'string', description: 'Path to TODO.md within the repo (default: TODO.md)' },
      },
      example: { id: 'c4', name: 'C4 Daemon', repoPath: '/home/shinc/c4', todoPath: 'TODO.md' },
    },
    response: {
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        createdAt: { type: 'string' },
      },
    },
  },
  'GET /projects': {
    response: {
      properties: {
        projects: {
          type: 'array',
          items: {
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string', nullable: true },
              repoPath: { type: 'string', nullable: true },
              todoPath: { type: 'string', nullable: true },
              createdAt: { type: 'string' },
              milestones: { type: 'array', items: { type: 'object' } },
              sprints: { type: 'array', items: { type: 'object' } },
              tasks: { type: 'array', items: { type: 'object' } },
              backlog: { type: 'array', items: { type: 'object' } },
            },
          },
        },
        count: { type: 'integer' },
      },
    },
  },
  'POST /recover': {
    requestBody: {
      required: ['name'],
      properties: {
        name: { type: 'string' },
        category: { type: 'string', enum: ['tool-deny', 'timeout', 'test-fail', 'build-fail', 'dependency', 'unknown'] },
      },
      example: { name: 'worker-1', category: 'test-fail' },
    },
    response: {
      properties: {
        recovered: { type: 'boolean' },
        strategy: { type: 'string' },
        category: { type: 'string' },
        attempt: { type: 'integer' },
        action: { type: 'string' },
      },
    },
  },
  'GET /recovery-history': {
    parameters: [
      { name: 'name', in: 'query', schema: { type: 'string', description: 'Filter to records for this worker' } },
      { name: 'limit', in: 'query', schema: { type: 'integer', description: 'Cap to the latest N entries (0 = all)' } },
    ],
    response: {
      properties: {
        records: {
          type: 'array',
          items: {
            properties: {
              time: { type: 'string', description: 'ISO timestamp' },
              worker: { type: 'string' },
              category: { type: 'string', enum: ['tool-deny', 'timeout', 'test-fail', 'build-fail', 'dependency', 'unknown'] },
              signal: { type: 'string', nullable: true },
              attempt: { type: 'integer' },
              strategy: { type: 'string', description: 'Recovery strategy chosen (e.g., retry, ask-manager)' },
              phase: { type: 'string', description: 'Strategy phase (e.g., dispatched, give-up, notified)' },
              reason: { type: 'string', nullable: true },
              manual: { type: 'boolean' },
            },
          },
        },
        path: { type: 'string', description: 'Filesystem path to the recovery-history JSONL' },
      },
    },
  },
  'POST /cancel': {
    requestBody: {
      required: ['name'],
      properties: { name: { type: 'string' } },
      example: { name: 'worker-1' },
    },
    response: { properties: { success: { type: 'boolean' } } },
  },
  'POST /restart': {
    requestBody: {
      required: ['name'],
      properties: { name: { type: 'string' } },
      example: { name: 'worker-1' },
    },
    response: { properties: { success: { type: 'boolean' }, pid: { type: 'integer' } } },
  },
  'POST /resize': {
    requestBody: {
      required: ['name', 'cols', 'rows'],
      properties: {
        name: { type: 'string' },
        cols: { type: 'integer' },
        rows: { type: 'integer' },
      },
      example: { name: 'worker-1', cols: 120, rows: 32 },
    },
    response: { properties: { success: { type: 'boolean' } } },
  },
  'POST /resume': {
    requestBody: {
      required: ['name'],
      properties: {
        name: { type: 'string' },
        sessionId: { type: 'string', description: 'Specific JSONL session id to resume (default: latest)' },
      },
      example: { name: 'worker-1' },
    },
    response: { properties: { success: { type: 'boolean' }, sessionId: { type: 'string' } } },
  },

  // Bulk-defined response shapes for the long tail. Each is the
  // canonical {success: boolean} envelope used by daemon mutators
  // that don't carry richer state. Listed individually so future
  // edits to a specific route don't fall through to a shared shape.
  'POST /auto': {
    requestBody: {
      required: ['task'],
      properties: {
        task: { type: 'string', description: 'Initial task prompt for the autonomous manager' },
        name: { type: 'string', description: 'Manager name (auto-generated when omitted)' },
      },
      example: { task: 'Triage open issues and propose fixes' },
    },
    response: { properties: { success: { type: 'boolean' }, name: { type: 'string' } } },
  },
  'POST /morning': { response: { properties: { success: { type: 'boolean' }, path: { type: 'string', description: 'Path to the generated report' } } } },
  'POST /status-update': {
    requestBody: {
      required: ['message'],
      properties: {
        worker: { type: 'string', description: 'Worker name (defaults to "C4" when omitted)' },
        message: { type: 'string', description: 'Slack message body' },
      },
      example: { worker: 'demo-worker', message: 'Test status update' },
    },
    response: { properties: { sent: { type: 'boolean' } } },
  },
  'POST /scribe/start': { response: { properties: { active: { type: 'boolean' }, intervalMs: { type: 'integer' } } } },
  'POST /scribe/stop': { response: { properties: { success: { type: 'boolean' } } } },
  'POST /scribe/scan': { response: { properties: { success: { type: 'boolean' }, scannedAt: { type: 'string' } } } },
  'GET /scribe/status': { response: { properties: { active: { type: 'boolean' }, intervalMs: { type: 'integer' }, lastRecordAt: { type: 'string', nullable: true } } } },
  'POST /autonomous/resume': { response: { properties: { paused: { type: 'boolean' } } } },
  'POST /autonomous/tick': { response: { properties: { dispatched: { type: 'string', nullable: true }, skipped: { type: 'string', nullable: true }, reason: { type: 'string', nullable: true } } } },
  'POST /config/reload': { response: { properties: { ok: { type: 'boolean' } } } },
  'GET /config': { response: { properties: { config: { type: 'object', description: 'Sanitised config (secrets stripped)' } } } },
  'GET /templates': {
    response: {
      properties: {
        templates: {
          type: 'object',
          description: 'Map keyed by template name. Each value carries the template config (model, profile, scope) plus source = builtin | config.',
        },
      },
    },
  },
  'GET /profiles': {
    response: {
      properties: {
        profiles: {
          type: 'object',
          description: 'Map keyed by profile name. Each value: { description, allow[], deny[], mcpServers[] }',
        },
      },
    },
  },
  'GET /quota': {
    response: {
      properties: {
        date: { type: 'string', description: 'ISO date the snapshot was generated for (rolls over at UTC midnight)' },
        tiers: {
          type: 'object',
          description: 'Map keyed by tier name. Each value: { dailyTokens, models[], used, remaining }',
        },
      },
    },
  },
  'GET /swarm': { parameters: [{ name: 'name', in: 'query', schema: { type: 'string' } }], response: { properties: { swarm: { type: 'array' } } } },
  'POST /plan': {
    requestBody: {
      required: ['name', 'task'],
      properties: {
        name: { type: 'string' },
        task: { type: 'string' },
        branch: { type: 'string' },
        outputPath: { type: 'string', description: 'Path for the plan markdown output' },
        scopePreset: { type: 'string' },
        contextFrom: { type: 'string' },
      },
      example: { name: 'planner-1', task: 'Design the migration plan', branch: 'plan/migration', outputPath: 'docs/plan.md' },
    },
    response: { properties: { success: { type: 'boolean' }, planPath: { type: 'string' } } },
  },
  'GET /plan': {
    parameters: [
      { name: 'name', in: 'query', required: true, schema: { type: 'string' } },
      { name: 'outputPath', in: 'query', schema: { type: 'string', description: 'Override the plan markdown path (defaults to the worker config)' } },
    ],
    response: { properties: { plan: { type: 'string' }, path: { type: 'string' } } },
  },
  'GET /plan-revisions': {
    parameters: [{ name: 'name', in: 'query', required: true, schema: { type: 'string' } }],
    response: { properties: { revisions: { type: 'array', items: { type: 'object' } } } },
  },
  'POST /plan-update': {
    requestBody: {
      required: ['name'],
      properties: {
        name: { type: 'string' },
        reason: { type: 'string', description: 'Why the plan is being updated' },
        evidence: { type: 'string', description: 'Supporting evidence / scrollback excerpt' },
        replan: { type: 'boolean', description: 'Trigger a fresh planning pass' },
        redispatch: { type: 'boolean', description: 'Redispatch the plan to its anchor task' },
      },
      example: { name: 'planner-1', reason: 'Coverage gap on auth flow', replan: true },
    },
    response: { properties: { success: { type: 'boolean' }, revision: { type: 'integer' } } },
  },
  'GET /api-docs/redoc': {
    response: { type: 'string', description: 'Redoc HTML page (text/html)' },
  },
  'GET /api-docs/index': {
    response: { type: 'string', description: 'Docs landing page HTML (Swagger UI / Redoc picker)' },
  },
  'POST /mcp': {
    requestBody: {
      required: ['method'],
      properties: {
        method: { type: 'string', description: 'MCP tool name' },
        params: { type: 'object' },
      },
      example: { method: 'figma__get_screenshot', params: { fileKey: 'abc123' } },
    },
    response: { properties: { result: { type: 'object' } } },
  },
  'GET /mcp/servers': {
    parameters: [
      { name: 'enabled', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
      { name: 'transport', in: 'query', schema: { type: 'string', enum: ['stdio', 'http'] } },
    ],
    response: {
      properties: {
        servers: {
          type: 'array',
          items: {
            properties: {
              name: { type: 'string' },
              command: { type: 'string' },
              args: { type: 'array', items: { type: 'string' } },
              env: { type: 'object', description: 'String→string env var map' },
              description: { type: 'string' },
              enabled: { type: 'boolean' },
              transport: { type: 'string', enum: ['stdio', 'http'] },
            },
          },
        },
        count: { type: 'integer' },
      },
    },
  },
  'GET /computer-use/sessions': {
    response: {
      properties: {
        sessions: {
          type: 'array',
          items: {
            properties: {
              id: { type: 'string' },
              backend: { type: 'string', enum: ['stub', 'xdotool', 'mock'] },
              actions: { type: 'array', items: { type: 'object' } },
              screenshots: { type: 'array', items: { type: 'object' } },
              startedAt: { type: 'string' },
              endedAt: { type: 'string', nullable: true },
            },
          },
        },
        count: { type: 'integer' },
        backends: {
          type: 'object',
          description: 'Map of backend name → availability boolean ({stub, mock, xdotool})',
        },
      },
    },
  },
  'POST /computer-use/sessions': {
    requestBody: {
      // Action-multiplexer route — backend selects the session, x/y/
      // button/text/delayMs/key are action-specific args. The router
      // dispatches to click / move / type / keyPress / etc based on
      // which fields are populated.
      properties: {
        backend: { type: 'string', enum: ['stub', 'xdotool', 'mock', 'auto'] },
        x: { type: 'integer', description: 'Click / move x coordinate' },
        y: { type: 'integer', description: 'Click / move y coordinate' },
        button: { type: 'string', enum: ['left', 'right', 'middle'] },
        text: { type: 'string', description: 'Text to type' },
        delayMs: { type: 'integer', description: 'Inter-keystroke delay' },
        key: { type: 'string', description: 'Key name (e.g., Return / Escape / Ctrl+A)' },
      },
      example: { backend: 'auto', x: 100, y: 200, button: 'left' },
    },
    response: {
      properties: {
        id: { type: 'string' },
        backend: { type: 'string' },
        actions: { type: 'array', items: { type: 'object' } },
        screenshots: { type: 'array', items: { type: 'object' } },
        startedAt: { type: 'string' },
        endedAt: { type: 'string', nullable: true },
      },
    },
  },
  'GET /events': {
    response: { type: 'string', description: 'SSE stream — Content-Type: text/event-stream' },
  },
  'GET /watch': {
    parameters: [
      { name: 'name', in: 'query', required: true, schema: { type: 'string', description: 'Worker name to tail' } },
    ],
    response: { type: 'string', description: 'SSE stream of worker output — Content-Type: text/event-stream' },
  },
  'GET /approvals': {
    response: {
      properties: {
        type: { type: 'string', enum: ['snapshot'] },
        ts: { type: 'integer', description: 'Unix epoch milliseconds when the snapshot was taken' },
        workers: {
          type: 'array',
          items: {
            properties: {
              name: { type: 'string' },
              enteredAt: { type: 'integer' },
              internalState: { type: 'object', nullable: true },
              pendingMs: { type: 'integer', description: 'How long the worker has been waiting for approval' },
              slackAlertedAt: { type: 'integer', nullable: true },
              timeoutFiredAt: { type: 'integer', nullable: true },
            },
          },
        },
      },
    },
  },
  'GET /approvals/stream': {
    response: { type: 'string', description: 'SSE stream of approval transitions' },
  },
  'GET /slack/events': {
    parameters: [
      { name: 'limit', in: 'query', schema: { type: 'integer', description: 'Cap the number of returned events (default: full in-memory buffer)' } },
    ],
    response: {
      properties: {
        events: { type: 'array', items: { type: 'object' }, description: 'Recent slack events from the in-memory buffer' },
        count: { type: 'integer' },
        config: { type: 'object', description: 'Effective slack config (channel, webhook URL stripped)' },
      },
    },
  },
  'POST /slack/emit': {
    requestBody: {
      required: ['eventType'],
      properties: {
        eventType: { type: 'string', description: 'One of slackEvents.EVENT_TYPES' },
        payload: { type: 'object', description: 'Event-specific payload (worker, message, etc)' },
      },
      example: { eventType: 'worker.created', payload: { worker: 'demo' } },
    },
    response: { properties: { success: { type: 'boolean' } } },
  },
  'GET /scribe-context': {
    parameters: [
      { name: 'maxBytes', in: 'query', schema: { type: 'integer', description: 'Cap the response body size (omit to read full session-context.md)' } },
    ],
    response: {
      properties: {
        path: { type: 'string', description: 'Resolved session-context.md path' },
        body: { type: 'string', description: 'File contents (capped to maxBytes when set)' },
        bytes: { type: 'integer', description: 'Total file size on disk' },
        truncated: { type: 'boolean', description: 'True when bytes > maxBytes' },
      },
    },
  },
  'GET /fleet/overview': {
    parameters: [
      { name: 'timeout', in: 'query', schema: { type: 'integer', description: 'Per-peer probe timeout in ms (0 / unset uses fleet defaults)' } },
    ],
    response: {
      properties: {
        peers: { type: 'array', items: { type: 'object' }, description: 'Per-machine probe result (alias, host, ok, workers, version)' },
        totalWorkers: { type: 'integer' },
        self: { type: 'object', description: 'Local daemon snapshot' },
      },
    },
  },
  'POST /dispatch': {
    requestBody: {
      properties: {
        task: { type: 'string' },
        target: { type: 'string' },
      },
      example: { task: 'Lint the src/ tree', target: 'local' },
    },
    response: { properties: { success: { type: 'boolean' }, dispatched: { type: 'string' } } },
  },
  'GET /session-id': {
    parameters: [{ name: 'name', in: 'query', required: true, schema: { type: 'string' } }],
    response: {
      properties: {
        name: { type: 'string', description: 'Echo of the requested worker name' },
        sessionId: { type: 'string', nullable: true },
      },
    },
  },
  'POST /hook-event': {
    requestBody: {
      properties: {
        worker: { type: 'string', description: 'Worker name the hook fired for' },
        hook_type: { type: 'string', description: 'PreToolUse / PostToolUse / etc' },
        tool_name: { type: 'string' },
        tool_input: { type: 'object' },
        tool_response: { type: 'object' },
      },
      example: { worker: 'worker-1', hook_type: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } },
    },
    response: { properties: { success: { type: 'boolean' } } },
  },
  'GET /hook-events': {
    parameters: [
      { name: 'name', in: 'query', schema: { type: 'string' } },
      { name: 'limit', in: 'query', schema: { type: 'integer' } },
    ],
    response: { properties: { events: { type: 'array', items: { type: 'object' } } } },
  },
  'POST /compact-event': {
    requestBody: {
      required: ['worker'],
      properties: {
        worker: { type: 'string', description: 'Worker name the compact event fired for' },
      },
      example: { worker: 'worker-1' },
    },
    response: { properties: { success: { type: 'boolean' } } },
  },
  'POST /cicd/trigger': {
    requestBody: {
      properties: {
        id: { type: 'string', description: 'Pipeline id (replay)' },
        repo: { type: 'string', description: 'For one-off workflow_dispatch' },
        workflow: { type: 'string' },
        ref: { type: 'string' },
        inputs: { type: 'object' },
      },
      example: { repo: 'siloFoX/c4', workflow: 'test.yml', ref: 'main' },
    },
    response: { properties: { success: { type: 'boolean' } } },
  },
  'GET /cicd/pipelines': {
    response: {
      properties: {
        pipelines: {
          type: 'array',
          items: {
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              provider: { type: 'string', enum: ['github-actions'] },
              repo: { type: 'string' },
              workflow: { type: 'string' },
              triggers: { type: 'array', items: { type: 'string', enum: ['pr.opened', 'pr.merged', 'pr.closed', 'merge.main', 'tag.created'] } },
              actions: { type: 'array', items: { type: 'object' } },
              createdAt: { type: 'string' },
            },
          },
        },
        count: { type: 'integer' },
      },
    },
  },
  'GET /nl/sessions': {
    response: {
      properties: {
        sessions: {
          type: 'array',
          items: {
            properties: {
              id: { type: 'string' },
              createdAt: { type: 'string' },
              updatedAt: { type: 'string' },
              messageCount: { type: 'integer' },
              lastWorker: { type: 'string', nullable: true },
            },
          },
        },
        count: { type: 'integer' },
      },
    },
  },
  'POST /batch': {
    requestBody: {
      properties: {
        task: { type: 'string', description: 'Task prompt for all workers' },
        count: { type: 'integer', description: 'Number of workers (count mode)' },
        tasksText: { type: 'string', description: 'Newline-separated tasks (file mode)' },
        branch: { type: 'string', description: 'Branch prefix' },
        autoMode: { type: 'boolean' },
        profile: { type: 'string' },
      },
      example: { task: 'Fix lint errors in src/', count: 3, autoMode: true },
    },
    response: {
      properties: {
        success: { type: 'boolean' },
        spawned: { type: 'array', items: { type: 'string' } },
        count: { type: 'integer' },
      },
    },
  },
  'POST /cleanup': {
    requestBody: {
      properties: {
        dryRun: { type: 'boolean', default: false },
      },
      example: { dryRun: true },
    },
    response: {
      properties: {
        branchesRemoved: { type: 'array', items: { type: 'string' } },
        worktreesRemoved: { type: 'array', items: { type: 'string' } },
        directoriesRemoved: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  'POST /autonomous/pause': {
    requestBody: {
      properties: {
        reason: { type: 'string', description: 'Operator-supplied pause reason' },
      },
      example: { reason: 'manual via cli' },
    },
    response: {
      properties: {
        paused: { type: 'boolean' },
        reason: { type: 'string' },
      },
    },
  },
  'GET /autonomous/status': {
    response: {
      properties: {
        enabled: { type: 'boolean' },
        paused: { type: 'boolean' },
        pauseReason: { type: 'string', nullable: true },
        consecutiveHalts: { type: 'integer' },
        circuitThreshold: { type: 'integer' },
        lastDispatchId: { type: 'string', nullable: true },
        lastDispatchAt: { type: 'string', nullable: true },
      },
    },
  },
  'GET /history': {
    parameters: [
      { name: 'worker', in: 'query', schema: { type: 'string' } },
      { name: 'limit', in: 'query', schema: { type: 'integer' } },
      { name: 'status', in: 'query', schema: { type: 'string', description: 'Filter to records matching status (e.g., completed, failed)' } },
      { name: 'since', in: 'query', schema: { type: 'string', description: 'ISO timestamp — inclusive lower bound' } },
      { name: 'until', in: 'query', schema: { type: 'string', description: 'ISO timestamp — exclusive upper bound' } },
      { name: 'q', in: 'query', schema: { type: 'string', description: 'Substring filter against task / worker / branch' } },
    ],
    response: {
      properties: {
        records: {
          type: 'array',
          items: {
            properties: {
              name: { type: 'string', nullable: true, description: 'Worker name (history-view normaliser sets null when absent)' },
              task: { type: 'string', nullable: true, description: 'Null on resume / non-task lifecycle events' },
              branch: { type: 'string', nullable: true },
              startedAt: { type: 'string', nullable: true },
              completedAt: { type: 'string', nullable: true },
              commits: { type: 'array', items: { type: 'object' } },
              status: { type: 'string', nullable: true },
            },
          },
        },
        workers: { type: 'array', items: { type: 'object' }, description: 'Per-worker rollup summary' },
        total: { type: 'integer', description: 'Total record count before filtering' },
      },
    },
  },
  'GET /events/query': {
    parameters: [
      { name: 'from', in: 'query', schema: { type: 'string', description: 'ISO timestamp — inclusive lower bound' } },
      { name: 'to', in: 'query', schema: { type: 'string', description: 'ISO timestamp — exclusive upper bound' } },
      { name: 'types', in: 'query', schema: { type: 'string', description: 'Comma-separated event types (e.g., "worker.created,task.completed")' } },
      { name: 'workers', in: 'query', schema: { type: 'string', description: 'Comma-separated worker names' } },
      { name: 'limit', in: 'query', schema: { type: 'integer' } },
      { name: 'reverse', in: 'query', schema: { type: 'string', enum: ['0', '1', 'true', 'false'], description: 'Set 1/true for newest-first ordering' } },
    ],
    response: {
      properties: {
        events: {
          type: 'array',
          items: {
            properties: {
              id: { type: 'string', description: 'Monotonic event id' },
              ts: { type: 'string', description: 'ISO timestamp' },
              type: { type: 'string', description: 'Event type (dotted: domain.action)' },
              worker: { type: 'string', nullable: true },
              data: { type: 'object', description: 'Event-specific payload' },
            },
          },
        },
        count: { type: 'integer' },
      },
    },
  },
  'GET /events/context': {
    parameters: [
      { name: 'target', in: 'query', required: true, schema: { type: 'string', description: 'Event id or ISO timestamp to anchor the window' } },
      { name: 'minutesBefore', in: 'query', schema: { type: 'number', description: 'Window before target (default 1)' } },
      { name: 'minutesAfter', in: 'query', schema: { type: 'number', description: 'Window after target (default 1)' } },
    ],
    response: {
      properties: {
        events: { type: 'array', items: { type: 'object' } },
        count: { type: 'integer' },
        target: { type: 'string' },
      },
    },
  },
  'GET /token-usage': {
    parameters: [
      { name: 'perTask', in: 'query', schema: { type: 'string', enum: ['0', '1'], description: 'Set 1 to include per-task usage breakdown' } },
    ],
    response: {
      properties: {
        today: { type: 'string', description: 'ISO date (UTC)' },
        input: { type: 'integer' },
        output: { type: 'integer' },
        total: { type: 'integer' },
        dailyLimit: { type: 'integer', description: 'Configured daily cap (0 = unlimited)' },
        history: { type: 'object', description: 'Daily history map keyed by date' },
        perTask: { type: 'object', description: 'Populated when ?perTask=1' },
      },
    },
  },
  'POST /transfer': {
    requestBody: {
      required: ['alias', 'type'],
      properties: {
        alias: { type: 'string', description: 'Fleet peer alias' },
        type: { type: 'string', enum: ['rsync', 'git'] },
        src: { type: 'string', description: 'For type=rsync' },
        dest: { type: 'string', description: 'For type=rsync' },
        branch: { type: 'string', description: 'For type=git' },
        remoteRepoPath: { type: 'string', description: 'For type=git' },
        opts: { type: 'object' },
      },
      example: { alias: 'dgx', type: 'rsync', src: '/home/local/proj/', dest: '/home/remote/proj/', opts: { delete: true } },
    },
    response: {
      properties: {
        started: { type: 'boolean' },
        pid: { type: 'integer' },
        alias: { type: 'string', description: 'Echo of the requested fleet alias' },
        type: { type: 'string', enum: ['rsync', 'git'] },
        transferId: { type: 'string', description: 'Use this id when listening on /events for transfer-progress / -complete / -error frames' },
        cmd: { type: 'string', description: 'Resolved CLI binary (rsync or git)' },
        args: { type: 'array', items: { type: 'string' }, description: 'Full argv passed to the spawned process' },
      },
    },
  },
  'POST /nl/chat': {
    requestBody: {
      required: ['text'],
      properties: {
        text: { type: 'string', description: 'Natural-language command' },
        sessionId: { type: 'string' },
      },
      example: { text: 'Spawn a worker called demo and run the linter on src/' },
    },
    response: {
      properties: {
        sessionId: { type: 'string' },
        response: { type: 'string' },
        intent: { type: 'string' },
        params: { type: 'object' },
        confidence: { type: 'number' },
        result: { type: 'object' },
        actions: { type: 'array' },
      },
    },
  },
  'POST /mcp/servers': {
    requestBody: {
      required: ['name', 'command'],
      properties: {
        name: { type: 'string' },
        command: { type: 'string' },
        args: { type: 'array', items: { type: 'string' } },
        env: { type: 'object' },
      },
      example: { name: 'figma', command: 'npx', args: ['-y', '@figma/mcp-server'] },
    },
    response: {
      properties: {
        name: { type: 'string' },
        transport: { type: 'string' },
        enabled: { type: 'boolean' },
      },
    },
  },
  'POST /cicd/webhook': {
    requestBody: {
      description: 'GitHub webhook payload (HMAC verified via X-Hub-Signature-256)',
      properties: {
        action: { type: 'string' },
        repository: { type: 'object' },
        pull_request: { type: 'object' },
      },
      example: {
        action: 'opened',
        repository: { full_name: 'siloFoX/c4' },
        pull_request: { number: 42, head: { ref: 'feature-branch' } },
      },
    },
    response: {
      properties: {
        ok: { type: 'boolean' },
        event: { type: 'string', description: 'Internal event name (e.g., pr.opened)' },
        dispatched: { type: 'integer', description: 'Number of pipelines triggered' },
      },
    },
  },
  'POST /cicd/pipelines': {
    requestBody: {
      required: ['name', 'repo', 'workflow', 'triggers', 'actions'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        repo: { type: 'string' },
        workflow: { type: 'string' },
        triggers: {
          type: 'array',
          items: { type: 'string', enum: ['pr.opened', 'pr.merged', 'pr.closed', 'merge.main', 'tag.created'] },
        },
        actions: { type: 'array', items: { type: 'object' } },
      },
      example: {
        id: 'pr-test',
        name: 'PR test runner',
        repo: 'siloFoX/c4',
        workflow: 'test.yml',
        triggers: ['pr.opened'],
        actions: [{ type: 'spawn-worker', task: 'Run npm test' }],
      },
    },
    response: {
      properties: {
        id: { type: 'string' },
        repo: { type: 'string' },
        triggers: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  'GET /api-docs': {
    response: {
      description: 'Swagger UI HTML page (Content-Type: text/html)',
      type: 'string',
    },
  },
  'GET /validation': {
    parameters: [
      { name: 'name', in: 'query', required: true, schema: { type: 'string' } },
    ],
    response: {
      properties: {
        name: { type: 'string' },
        validation: {
          type: 'object',
          nullable: true,
          description: 'Parsed JSON from <worktree>/.c4-validation.json, or a synthesised object from git state when the file is missing. Null when the worker exists but has no validation data yet.',
        },
      },
    },
  },
  'GET /risk/patterns': {
    response: {
      properties: {
        builtin: {
          type: 'object',
          properties: {
            critical: { type: 'array', items: { properties: { code: { type: 'string' }, label: { type: 'string' } } } },
            high: { type: 'array', items: { properties: { code: { type: 'string' }, label: { type: 'string' } } } },
            medium: { type: 'array', items: { properties: { code: { type: 'string' }, label: { type: 'string' } } } },
          },
        },
        custom: {
          type: 'object',
          description: 'Operator-configured customRules — shape mirrors the config (uncompiled, so a malformed regex still appears here for debugging)',
          properties: {
            critical: { type: 'array', items: { type: 'object' } },
            high: { type: 'array', items: { type: 'object' } },
            medium: { type: 'array', items: { type: 'object' } },
          },
        },
        counts: {
          type: 'object',
          properties: {
            builtin: {
              type: 'object',
              properties: {
                critical: { type: 'integer' },
                high: { type: 'integer' },
                medium: { type: 'integer' },
                total: { type: 'integer' },
              },
            },
            custom: {
              type: 'object',
              properties: {
                critical: { type: 'integer' },
                high: { type: 'integer' },
                medium: { type: 'integer' },
                total: { type: 'integer' },
              },
            },
          },
        },
        allowList: { type: 'integer', description: 'Number of configured allowList entries' },
        denyList: { type: 'integer', description: 'Number of configured denyList entries' },
      },
    },
  },
  'GET /risk/stats': {
    parameters: [
      { name: 'windowHours', in: 'query', schema: { type: 'integer', default: 24, description: 'Lookback window in hours. Min 1, max 720 (30 days). Default 24.' } },
    ],
    response: {
      properties: {
        windowHours: { type: 'integer' },
        from: { type: 'string', description: 'ISO timestamp — inclusive lower bound used for the audit query' },
        to: { type: 'string' },
        total: { type: 'integer', description: 'Total events in the window (enforced + dryRun)' },
        enforced: { type: 'integer', description: 'risk.denied events — gate actually blocked the command' },
        dryRun: { type: 'integer', description: 'risk.dryRun events — would have been blocked if dryRun was off' },
        shadowExec: { type: 'integer', description: '(v1.10.90) risk.shadow_exec events — explicit /risk/exec calls that ran in the configured sandbox. Separate from `total` since shadow exec is operator-initiated, not a denial.' },
        shadowExecKilled: { type: 'integer', description: '(v1.10.90) Subset of shadowExec where killed=true (timeout fired)' },
        shadowExecNonZero: { type: 'integer', description: '(v1.10.90) Subset of shadowExec where exitCode != 0' },
        byLevel: {
          type: 'object',
          properties: {
            critical: { type: 'integer' },
            high: { type: 'integer' },
            medium: { type: 'integer' },
            low: { type: 'integer' },
          },
        },
        topReasons: {
          type: 'array',
          items: {
            properties: {
              key: { type: 'string', description: 'Reason code (e.g., rm-rf-root)' },
              count: { type: 'integer' },
            },
          },
        },
        topWorkers: {
          type: 'array',
          items: {
            properties: {
              key: { type: 'string', description: 'Worker name' },
              count: { type: 'integer' },
            },
          },
        },
      },
    },
  },
  'POST /risk/ai-feedback': {
    requestBody: {
      required: ['worker', 'command', 'classifierLevel', 'suggestedLevel'],
      properties: {
        worker: { type: 'string' },
        command: { type: 'string', description: 'The candidate Bash command the AI evaluated' },
        classifierLevel: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: "What the built-in classifier returned" },
        suggestedLevel: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: "The AI's verdict" },
        reason: { type: 'string', description: 'Free-text rationale (truncated to 500 chars in audit)' },
        model: { type: 'string', description: 'Optional — provider/model name for audit traceability' },
      },
      example: {
        worker: 'demo-1', command: 'tar czf /tmp/x.tgz /home/alice/.ssh',
        classifierLevel: 'low', suggestedLevel: 'high',
        reason: 'archives an entire .ssh directory which contains private keys',
        model: 'claude-haiku-4-5',
      },
    },
    response: {
      properties: {
        recorded: { type: 'boolean' },
        escalated: { type: 'boolean', description: 'True when suggestedLevel > classifierLevel' },
        wouldHaveBeenDenied: { type: 'boolean', description: 'True when AI level ≥ autoDenyLevel AND classifier level was below — i.e., catalog miss the AI caught' },
        severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'max(classifierLevel, suggestedLevel)' },
      },
    },
  },
  'POST /risk/check': {
    requestBody: {
      required: ['command'],
      properties: {
        command: { type: 'string', description: 'Candidate Bash command to classify' },
        includeInspected: { type: 'boolean', description: 'When true, the response carries the post-denoise inspectedSource' },
      },
      example: { command: 'rm -rf /tmp/test', includeInspected: false },
    },
    response: {
      properties: {
        level: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        suggestedAction: { type: 'string', enum: ['allow', 'review', 'deny'] },
        reasons: {
          type: 'array',
          items: {
            properties: {
              code: { type: 'string', description: 'Stable rule id (e.g., rm-rf-root, allowlist-bypass)' },
              label: { type: 'string', description: 'Human-readable description' },
              snippet: { type: 'string', description: 'Matched substring (capped at 160 chars)' },
            },
          },
        },
        decoded: { type: 'string', nullable: true, description: 'Denoised command when obfuscation was detected (base64 / $() / quote splitting)' },
        inspectedSource: { type: 'string', description: 'Post-denoise text actually fed to the regex pass — only present when includeInspected=true' },
        denyForced: { type: 'boolean', description: 'True when the level was forced by the denyList (independent of the built-in catalog)' },
        wouldDeny: { type: 'boolean', description: 'True when the in-process hook would block this command at the current autoDenyLevel' },
        autoDenyLevel: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'The currently configured threshold (so callers don\'t have to fetch /config)' },
        enforcementEnabled: { type: 'boolean', description: 'config.riskClassifier.enabled — when false, wouldDeny is always false' },
        intent: {
          type: 'object',
          description: '(v1.10.68) Static intent report — what files / network peers / privileges this command would touch, extracted via risk-sandbox.extractIntent without executing anything.',
          properties: {
            filesWritten: { type: 'array', items: { type: 'string' } },
            filesRead: { type: 'array', items: { type: 'string' } },
            networkPeers: { type: 'array', items: { type: 'string' } },
            privileged: { type: 'boolean' },
            scriptSources: { type: 'array', items: { type: 'string' } },
            destructiveVerbs: { type: 'array', items: { type: 'string' } },
            empty: { type: 'boolean', description: 'True when no signal extracted; pair with classifier level for actual gating' },
          },
        },
        sandbox: {
          type: 'object',
          nullable: true,
          description: '(v1.10.82) When config.riskClassifier.sandbox is configured, this echoes the same shape POST /risk/preview returns — pure builder, no exec. null when sandbox is unset.',
          properties: {
            binary: { type: 'string', nullable: true },
            args: { type: 'array', items: { type: 'string' } },
            env: { type: 'object', additionalProperties: { type: 'string' } },
            command: { type: 'string' },
            isolation: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                network: { type: 'string' },
                filesystem: { type: 'string' },
                resources: { type: 'string' },
              },
            },
            available: {
              type: 'object',
              properties: {
                ok: { type: 'boolean' },
                reason: { type: 'string', nullable: true },
              },
            },
            runtime: { type: 'string', enum: ['docker', 'null'] },
          },
        },
      },
    },
  },
  'POST /risk/exec': {
    requestBody: {
      required: ['command'],
      properties: {
        command: { type: 'string' },
        runtime: { type: 'string', enum: ['docker', 'null'], nullable: true },
        opts: { type: 'object', additionalProperties: true, nullable: true },
        timeoutMs: { type: 'number', nullable: true, description: 'Clamped to [100, 300000]ms by the runtime' },
        bufferLimit: { type: 'number', nullable: true, description: 'Clamped to [1024, 1048576] bytes per stream' },
      },
      example: { command: 'echo hi', runtime: 'docker', timeoutMs: 5000 },
    },
    response: {
      properties: {
        exitCode: { type: 'number', nullable: true, description: 'null when killed by signal/timeout' },
        stdout: { type: 'string', description: 'Truncated to bufferLimit; appended marker `\\n[...truncated]\\n`' },
        stderr: { type: 'string' },
        stdoutHash: { type: 'string', description: '(v1.10.86) 16-char SHA-256 hex fingerprint of stdout (post-truncation). Empty stdout still gets a hash so audit rows have stable shape.' },
        stderrHash: { type: 'string', description: '(v1.10.86) 16-char SHA-256 hex fingerprint of stderr.' },
        durationMs: { type: 'number' },
        killed: { type: 'boolean', description: 'True when the host-side timeout fired' },
        command: { type: 'string', description: 'Echoed verbatim for audit cross-checks' },
        runtime: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            isolation: { type: 'object', additionalProperties: true },
          },
        },
        spawnError: { type: 'string', nullable: true, description: 'Set when the spawn itself failed (binary missing / not-available probe / runtime construction)' },
        refused: { type: 'boolean', nullable: true, description: 'True when the request was refused before exec (allowExec=false or NullRuntime)' },
        refusedReason: { type: 'string', nullable: true },
      },
    },
  },
  'POST /risk/preview': {
    requestBody: {
      required: ['command'],
      properties: {
        command: { type: 'string', description: 'Candidate Bash command — echoed verbatim into sh -c <cmd>' },
        runtime: { type: 'string', enum: ['docker', 'null'], nullable: true, description: 'Override the daemon-configured sandbox runtime (config.riskClassifier.sandbox.name)' },
        opts: { type: 'object', additionalProperties: true, nullable: true, description: 'Override runtime opts (image / network / memory / cpus / mounts / env / dockerBinary). Forwarded verbatim to getRuntime(name, opts).' },
      },
      example: { command: 'rm -rf /tmp/test', runtime: 'docker' },
    },
    response: {
      properties: {
        binary: { type: 'string', nullable: true, description: 'OS binary that would run (e.g., "docker"); null for NullRuntime' },
        args: { type: 'array', items: { type: 'string' }, description: 'argv to pass `binary`. Pure builder — never executed.' },
        env: { type: 'object', additionalProperties: { type: 'string' } },
        command: { type: 'string', description: 'Echoed verbatim from request body for audit cross-checks' },
        isolation: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'docker | null | abstract' },
            network: { type: 'string', description: 'host | none | bridge | etc.' },
            filesystem: { type: 'string', description: 'host | "read-only root + tmpfs /tmp (NNm)" | "rw root"' },
            resources: { type: 'string', description: 'memory=NNm cpus=N pids=N timeout=NNms' },
          },
        },
        available: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            reason: { type: 'string', nullable: true, description: 'When ok=false — e.g., "docker probe failed: <msg>"' },
          },
        },
        runtime: { type: 'string', enum: ['docker', 'null'], description: 'Effective runtime name (request override OR config default OR "null" fallback)' },
      },
    },
  },
  'GET /attach/list': {
    response: {
      properties: {
        sessions: {
          type: 'array',
          items: {
            properties: {
              name: { type: 'string', description: 'Display name (may equal session UUID)' },
              jsonlPath: { type: 'string', description: 'Absolute path to the claude session JSONL' },
              sessionId: { type: 'string', nullable: true },
              projectPath: { type: 'string', nullable: true, description: 'Original project root the JSONL was recorded in' },
              createdAt: { type: 'string', nullable: true },
              lastOffset: { type: 'integer', description: 'Byte offset into JSONL of the last replayed line' },
              role: { type: 'string', enum: ['manager', 'worker', 'planner', 'executor', 'reviewer', 'generic'] },
            },
          },
        },
        total: { type: 'integer' },
      },
    },
  },
  'GET /openapi.yaml': {
    response: { type: 'string', description: 'Spec serialised as YAML — Content-Type: application/yaml' },
  },
  'GET /dashboard': {
    response: { type: 'string', description: 'Web UI shell HTML — Content-Type: text/html' },
  },
  'GET /wait-read': {
    parameters: [
      { name: 'name', in: 'query', required: true, schema: { type: 'string' } },
      { name: 'timeout', in: 'query', schema: { type: 'integer', default: 120000, description: 'Idle timeout in ms' } },
      { name: 'interruptOnIntervention', in: 'query', schema: { type: 'string', enum: ['0', '1'] } },
    ],
    response: {
      properties: {
        success: { type: 'boolean' },
        idle: { type: 'boolean' },
        output: { type: 'string', description: 'Worker scrollback at the moment idle was detected' },
        timedOut: { type: 'boolean' },
        intervention: { type: 'object', nullable: true, description: 'Populated if interruptOnIntervention=1 and an intervention was detected' },
      },
    },
  },
  'GET /wait-read-multi': {
    parameters: [
      { name: 'names', in: 'query', required: true, schema: { type: 'string', description: 'Comma-separated worker names' } },
      { name: 'timeout', in: 'query', schema: { type: 'integer', default: 120000 } },
      { name: 'interruptOnIntervention', in: 'query', schema: { type: 'string', enum: ['0', '1'] } },
      { name: 'waitAll', in: 'query', schema: { type: 'string', enum: ['0', '1'], description: 'When 1, wait for every worker to be idle (default: first idle wins)' } },
    ],
    response: {
      properties: {
        success: { type: 'boolean' },
        firstIdle: { type: 'string', nullable: true, description: 'Name of the worker that hit idle first (single-winner mode)' },
        results: { type: 'array', items: { type: 'object' }, description: 'Per-worker {name, idle, output} records' },
        timedOut: { type: 'boolean' },
      },
    },
  },
  'GET /cost/report': {
    parameters: [
      { name: 'from', in: 'query', schema: { type: 'string', description: 'ISO date — inclusive lower bound' } },
      { name: 'to', in: 'query', schema: { type: 'string', description: 'ISO date — exclusive upper bound' } },
      { name: 'group', in: 'query', schema: { type: 'string', enum: ['project', 'tier', 'dept', 'session'], default: 'project' } },
      { name: 'models', in: 'query', schema: { type: 'string', enum: ['0', '1'], description: 'Set 1 to break out per-model totals (lands as `perModel` map on each byGroup row)' } },
    ],
    response: {
      properties: {
        total: {
          type: 'object',
          properties: {
            tokens: { type: 'integer' },
            inputTokens: { type: 'integer' },
            outputTokens: { type: 'integer' },
            costUSD: { type: 'number' },
            records: { type: 'integer' },
          },
        },
        byGroup: {
          type: 'array',
          description: 'Per-group rows sorted by costUSD descending',
          items: {
            properties: {
              name: { type: 'string', description: 'Group key (project id / tier name / etc; "unknown" for missing)' },
              tokens: { type: 'integer' },
              inputTokens: { type: 'integer' },
              outputTokens: { type: 'integer' },
              costUSD: { type: 'number' },
              records: { type: 'integer' },
              perModel: { type: 'object', description: 'Populated when ?models=1; keyed by model name' },
            },
          },
        },
        groupBy: { type: 'string', enum: ['project', 'tier', 'dept', 'session'] },
        period: {
          type: 'object',
          properties: {
            from: { type: 'string', nullable: true },
            to: { type: 'string', nullable: true },
          },
        },
      },
    },
  },
  'POST /cost/budget': {
    requestBody: {
      required: ['limit'],
      properties: {
        limit: { type: 'number', description: 'Budget limit in dollars' },
        period: { type: 'string', enum: ['day', 'week', 'month'], default: 'month' },
        group: { type: 'string', nullable: true, description: 'Specific group key (project id, tier name, dept id) — omit for global' },
        groupBy: { type: 'string', enum: ['project', 'tier', 'dept'], default: 'project' },
        warnAt: { type: 'number', description: 'Fractional threshold for warning (default 0.8)' },
      },
      example: { limit: 100, period: 'month', groupBy: 'project', warnAt: 0.8 },
    },
    response: {
      properties: {
        used: { type: 'number' },
        limit: { type: 'number' },
        remaining: { type: 'number' },
        exceeded: { type: 'boolean' },
        warning: { type: 'boolean' },
        period: { type: 'string' },
      },
    },
  },
  'GET /orgs/tree': {
    response: {
      properties: {
        roots: {
          type: 'array',
          description: 'Top-level departments. Each node has dept (the dept record), subdepts (recursive), teams, and a deduped members[] across the dept + its teams.',
          items: {
            properties: {
              dept: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  parentId: { type: 'string', nullable: true },
                  memberUserIds: { type: 'array', items: { type: 'string' } },
                },
              },
              subdepts: { type: 'array', items: { type: 'object' }, description: 'Recursive: same shape as roots[i]' },
              teams: {
                type: 'array',
                items: {
                  properties: {
                    id: { type: 'string' },
                    deptId: { type: 'string' },
                    name: { type: 'string' },
                    memberUserIds: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
              members: { type: 'array', items: { type: 'string' }, description: 'Deduped user ids from the dept + its teams' },
            },
          },
        },
        count: { type: 'integer' },
      },
    },
  },
  'POST /orgs/dept': {
    requestBody: {
      required: ['id', 'name'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        parentId: { type: 'string', nullable: true, description: 'Parent department id (null for root)' },
      },
      example: { id: 'eng', name: 'Engineering', parentId: null },
    },
    response: {
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        parentId: { type: 'string', nullable: true },
      },
    },
  },
  'POST /orgs/team': {
    requestBody: {
      required: ['id', 'deptId', 'name'],
      properties: {
        id: { type: 'string' },
        deptId: { type: 'string' },
        name: { type: 'string' },
      },
      example: { id: 'platform', deptId: 'eng', name: 'Platform Team' },
    },
    response: {
      properties: {
        id: { type: 'string' },
        deptId: { type: 'string' },
        name: { type: 'string' },
      },
    },
  },
};

function _readDaemonSource(daemonPath) {
  return fs.readFileSync(daemonPath, 'utf8');
}

// Extract every `req.method === 'X' && route === '/y'` clause.
// The route portion may be a literal string or a startsWith / regex check;
// we only emit literal-string branches because those are the only ones
// the operator can reliably hit with a fixed URL.
//
// Also harvests an inline summary from the first `//` comment line
// inside each branch's body (the convention daemon.js follows
// consistently): a single-line note immediately after the opening
// brace describing what the route does. Multi-line comment blocks
// concatenate up to the first non-comment line. Result lands on the
// route entry as `inlineSummary`. Curated `ROUTE_SUMMARIES` still
// wins; this is the fallback for routes the curated map has not
// caught up with yet.
function extractRoutes(source) {
  // Two-pass scan. Pass 1 locates each `req.method === 'X' && route
  // === '/y') {` marker and records its line index. Pass 2 walks
  // forward up to 40 lines from each marker, harvesting:
  //   (a) the leading `//` comment block (already-existing summary
  //       behaviour)
  //   (b) the first `requireRole(authCheck, rbac.ACTIONS.<NAME>, ...)`
  //       inside the route body (new — feeds `x-rbac-action`).
  // The regex-only approach hit a ceiling on routes with destructured
  // `parseBody` calls because `[^}]` stopped at the destructuring
  // closing brace before the rbac line; the line-window walk is more
  // forgiving without giving up the dedup semantics.
  const lines = source.split('\n');
  // Match `req.method === 'X' && route === '/y'` AND the parenthesised
  // form `req.method === 'X' && (route === '/y' || ...)` — the latter
  // shows up when a handler dispatches to either a literal route or a
  // dynamic match (e.g., `(route === '/validation' || workerValidationName)`).
  const re = /req\.method\s*===\s*'(GET|POST|PUT|DELETE|PATCH)'\s*&&\s*\(?\s*route\s*===\s*'([^']+)'/;
  const seen = new Set();
  const routes = [];
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (!m) continue;
    const method = m[1];
    const routePath = m[2];
    const key = `${method} ${routePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Comment harvest: scan forward until first non-empty,
    // non-`//` line.
    const commentLines = [];
    for (let j = i + 1; j < Math.min(i + 40, lines.length); j++) {
      const l = lines[j].trim();
      if (l === '') {
        if (commentLines.length === 0) continue;
        break;
      }
      if (l.startsWith('//')) commentLines.push(l.replace(/^\/\/\s?/, ''));
      else break;
    }
    const inlineSummary = commentLines.join(' ').trim();
    // RBAC action: walk forward up to 40 lines for the first
    // requireRole(...) call. Once we hit `else if (req.method === 'X'`
    // for a different route we stop — no rbac → null.
    let rbacAction = null;
    for (let j = i + 1; j < Math.min(i + 40, lines.length); j++) {
      if (re.test(lines[j])) break; // entered the next route
      const r = lines[j].match(/requireRole\s*\(\s*\w+\s*,\s*rbac\.ACTIONS\.([A-Z_]+)/);
      if (r) { rbacAction = r[1]; break; }
    }
    routes.push({ method, path: routePath, inlineSummary, rbacAction });
  }
  return routes;
}

// Auto-generate a stable operationId from `<method> <path>` —
// required for Swagger UI's "Generate Client" / Redoc / OpenAPI
// codegen tooling. The id is camelCase, idempotent, and dedupes
// against the global seen-set so duplicate ids never escape.
//
//   GET /api/health                → getHealth
//   POST /api/auth/login           → postAuthLogin
//   GET /api/audit/verify          → getAuditVerify
//   POST /api/rbac/role/assign     → postRbacRoleAssign
function _operationIdFor(method, routePath, seen) {
  const parts = String(routePath).split('/').filter(Boolean);
  const camel = parts
    .map((p) => p.replace(/[^a-zA-Z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')))
    .map((p) => p.replace(/^[a-z]/, (c) => c.toUpperCase()))
    .join('');
  let id = method.toLowerCase() + camel;
  if (!seen.has(id)) {
    seen.add(id);
    return id;
  }
  // Disambiguate via numeric suffix (rare — only happens if path
  // collides after camel-case collapse).
  let n = 2;
  while (seen.has(`${id}${n}`)) n++;
  const dedup = `${id}${n}`;
  seen.add(dedup);
  return dedup;
}

function buildSpec({ daemonPath, version, baseUrl } = {}) {
  const dp = daemonPath || path.join(__dirname, 'daemon.js');
  const source = _readDaemonSource(dp);
  const routes = extractRoutes(source);

  const paths = {};
  const seenOpIds = new Set();
  for (const r of routes) {
    const apiPath = `/api${r.path}`;
    if (!paths[apiPath]) paths[apiPath] = {};
    // Resolution order: curated > inline-comment harvest > fallback.
    const key = `${r.method} ${r.path}`;
    const curated = ROUTE_SUMMARIES[key] || '';
    const harvested = !curated && r.inlineSummary ? r.inlineSummary : '';
    const summary = curated || harvested || key;
    const op = {
      operationId: _operationIdFor(r.method, r.path, seenOpIds),
      summary,
      ...(r.rbacAction ? { 'x-rbac-action': r.rbacAction } : {}),
      responses: {
        '200': { description: 'Success' },
        '400': {
          description: 'Bad request (invalid params)',
          content: { 'application/json': { schema: ERROR_BODY_SCHEMA } },
        },
        '401': {
          description: 'Unauthorized (auth required)',
          content: { 'application/json': { schema: ERROR_BODY_SCHEMA } },
        },
        '403': {
          description: 'Forbidden (RBAC)',
          content: { 'application/json': { schema: ERROR_BODY_SCHEMA } },
        },
        '404': {
          description: 'Not found',
          content: { 'application/json': { schema: ERROR_BODY_SCHEMA } },
        },
        '500': {
          description: 'Internal error',
          content: { 'application/json': { schema: ERROR_BODY_SCHEMA } },
        },
      },
    };
    // Curated parameter / requestBody / response schemas. Each entry
    // is a partial spec — buildSpec coerces the body schema into the
    // OpenAPI 3.0 `requestBody.content.application/json.schema`
    // envelope and the response schema into `responses.200.content.
    // application/json.schema`.
    const schemas = ROUTE_SCHEMAS[key];
    if (schemas) {
      if (schemas.parameters) {
        op.parameters = schemas.parameters;
      }
      if (schemas.requestBody) {
        // OpenAPI 3.0 distinguishes between schema (the type
        // contract) and example (a concrete value rendered in
        // Swagger UI's "Try it out" surface). Pull out `example`
        // before merging so it lands on the mediaType, not the
        // schema, and keeps `additionalProperties: false`-style
        // validators happy.
        const { example, ...bodyShape } = schemas.requestBody;
        const mediaType = {
          schema: { type: 'object', ...bodyShape },
        };
        if (example !== undefined) mediaType.example = example;
        op.requestBody = {
          required: true,
          content: { 'application/json': mediaType },
        };
      }
      if (schemas.response) {
        // Pick the content-type. Curated `contentType` wins; otherwise
        // detect non-JSON shapes (SSE / HTML / YAML / plain string) so
        // Swagger UI renders them correctly. Default: application/json.
        const explicitCT = schemas.response.contentType;
        const { contentType: _ct, ...respShape } = schemas.response;
        const isString = respShape.type === 'string';
        let mediaType = explicitCT;
        if (!mediaType) {
          if (isString) {
            const desc = (respShape.description || '').toLowerCase();
            if (desc.includes('text/event-stream') ||
                desc.includes('sse stream') ||
                desc.includes('event stream')) mediaType = 'text/event-stream';
            else if (desc.includes('text/html') ||
                     desc.includes('html page') ||
                     desc.includes(' html')) mediaType = 'text/html';
            else if (desc.includes('application/yaml') ||
                     desc.includes(' yaml')) mediaType = 'application/yaml';
            else mediaType = 'text/plain';
          } else {
            mediaType = 'application/json';
          }
        }
        const schemaBody = isString ? respShape : { type: 'object', ...respShape };
        op.responses['200'] = {
          description: 'Success',
          content: { [mediaType]: { schema: schemaBody } },
        };
      }
    }
    paths[apiPath][r.method.toLowerCase()] = op;
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'C4 daemon API',
      version: version || '1.7.0',
      description:
        'Auto-generated from src/daemon.js route handlers. ' +
        'See `docs/api-reference.md` for the curated mapping table ' +
        'and `docs/api.md` for payload shape examples.',
    },
    servers: baseUrl ? [{ url: baseUrl }] : [{ url: 'http://localhost:3456' }],
    paths,
  };
}

// Minimal JSON-to-YAML serializer for the spec — handles the subset
// of YAML the OpenAPI envelope needs (strings, numbers, bools, null,
// arrays, objects). Avoids a runtime YAML dep + keeps the daemon
// stays lean. Strings get quoted only when they contain special
// chars; numbers + booleans + null pass through unquoted.
function _yamlSerialize(value, indent = 0) {
  const pad = (n) => '  '.repeat(n);
  const needsQuote = (s) => /[:#&*!|>'"%@`,\[\]{}\n]/.test(s) || /^[\s]/.test(s) || /[\s]$/.test(s) || /^(?:true|false|null|yes|no|on|off|~|-?\d)/i.test(s) || s === '';
  const quoteString = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'string') return needsQuote(value) ? quoteString(value) : value;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value.map((v) => {
      const inner = _yamlSerialize(v, indent + 1);
      // Object/array element: continue on next line (each key indents
      // under the dash). Scalar: keep inline after the dash.
      if (typeof v === 'object' && v !== null) {
        const lines = inner.split('\n').filter((l) => l.length);
        if (lines.length === 0) return `\n${pad(indent)}- {}`;
        // First line attaches to the dash; subsequent lines indent.
        return `\n${pad(indent)}- ${lines[0].trimStart()}` +
          lines.slice(1).map((l) => `\n${pad(indent)}  ${l.replace(/^ {2}/, '')}`).join('');
      }
      return `\n${pad(indent)}- ${inner.replace(/^\n/, '')}`;
    }).join('');
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    return keys.map((k) => {
      const v = _yamlSerialize(value[k], indent + 1);
      const isComplex = (typeof value[k] === 'object' && value[k] !== null && (Array.isArray(value[k]) ? value[k].length : Object.keys(value[k]).length));
      if (isComplex) return `\n${pad(indent)}${k}:${v}`;
      return `\n${pad(indent)}${k}: ${v}`;
    }).join('');
  }
  return 'null';
}

function buildYaml(opts) {
  const spec = buildSpec(opts);
  return _yamlSerialize(spec).replace(/^\n/, '');
}

module.exports = {
  buildSpec,
  buildYaml,
  extractRoutes,
  ROUTE_SUMMARIES,
  ROUTE_SCHEMAS,
};
