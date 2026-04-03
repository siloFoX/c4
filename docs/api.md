# HTTP API Reference

C4 daemon listens on `http://127.0.0.1:3456` (configurable via `daemon.port` / `daemon.host`).

All endpoints return JSON. Error responses include `{ "error": "message" }` with HTTP 400.

## Worker Management

### POST /create

새 worker 생성.

```json
{
  "name": "worker-a",
  "command": "claude",
  "args": [],
  "target": "local",
  "cwd": ""
}
```

- `command`: 실행할 명령 (default: `claude`). `config.targets.<target>.commandMap`에서 매핑됨.
- `target`: `local` 또는 `config.targets`에 정의된 SSH target 이름.
- `cwd`: 작업 디렉토리 (SSH target의 경우 리모트 경로).

Response:
```json
{ "name": "worker-a", "pid": 12345, "target": "local", "status": "running" }
```

### POST /task

worker에 task 전송. worker가 없으면 자동 생성. git worktree 격리 포함.

```json
{
  "name": "worker-a",
  "task": "Add logging module",
  "branch": "c4/add-logging",
  "useBranch": true,
  "useWorktree": true,
  "projectRoot": "",
  "scope": { "allowFiles": ["src/**"], "denyBash": ["rm", "sudo"] },
  "scopePreset": "backend",
  "after": "worker-b",
  "contextFrom": "worker-b",
  "reuse": false,
  "profile": "executor",
  "autoMode": false
}
```

- `branch`: git 브랜치명 (default: `c4/<name>`).
- `useBranch`: false이면 브랜치 생성 안 함.
- `scope`: 파일/명령 스코프 제한. `scopePreset`으로 config 프리셋 사용 가능.
- `after`: dependency — 지정된 worker 완료 후 실행 (queue).
- `contextFrom`: 다른 worker의 최근 스냅샷 3개를 task에 주입.
- `reuse`: true이면 idle worker를 pool에서 재활용.
- `profile`: worker settings 프로파일 (`config.profiles`).
- `autoMode`: true이면 `permissions.defaultMode: "auto"` 적용.

Response:
```json
{
  "success": true,
  "branch": "c4/worker-a",
  "worktree": "C:/Users/silof/c4-worktree-worker-a",
  "scope": { "active": true, "description": "Backend files only" },
  "contextFrom": "worker-b",
  "startCommit": "abc1234",
  "task": "..."
}
```

Queue 상태일 때:
```json
{ "queued": true, "name": "worker-a", "after": "worker-b", "position": 2, "reason": "waiting for worker-b" }
```

### POST /send

worker에 텍스트 또는 특수키 전송.

```json
{ "name": "worker-a", "input": "Hello", "keys": false }
```

- `keys`: true이면 `input`을 특수키로 해석 (Enter, C-c, Tab, Up, Down 등).

### POST /close

worker 종료 및 worktree 정리.

```json
{ "name": "worker-a" }
```

### POST /rollback

worker를 task 시작 전 커밋으로 되돌림 (`git reset --soft`).

```json
{ "name": "worker-a" }
```

Response:
```json
{ "success": true, "from": "def5678", "to": "abc1234" }
```

## Reading Output

### GET /read?name=worker-a

새 idle 스냅샷만 반환. 읽은 스냅샷은 다시 반환하지 않음.

Response:
```json
{
  "content": "screen text...",
  "status": "idle",
  "snapshotsRead": 3,
  "summarized": false
}
```

- `status`: `idle` | `busy` | `exited`
- `summarized`: true이면 SummaryLayer가 긴 출력을 요약함.

### GET /read-now?name=worker-a

현재 화면을 즉시 반환 (busy 상태에서도).

Response:
```json
{ "content": "current screen...", "status": "busy" }
```

### GET /wait-read?name=worker-a&timeout=120000

worker가 idle 상태가 될 때까지 대기 후 화면 반환.

- `timeout`: ms 단위 (default: 120000).

Response:
```json
{ "content": "screen text...", "status": "idle" }
```

`status`가 `timeout`이면 시간 초과.

### GET /scrollback?name=worker-a&lines=200

scrollback 버퍼 반환 (현재 화면 제외).

Response:
```json
{ "content": "scrollback text...", "lines": 200, "totalScrollback": 1500 }
```

## Listing & Status

### GET /health

데몬 상태.

```json
{ "ok": true, "workers": 3 }
```

### GET /list

모든 worker 목록 (queue, lost workers 포함).

Response:
```json
{
  "workers": [
    {
      "name": "worker-a",
      "status": "idle",
      "unreadSnapshots": 2,
      "command": "claude",
      "intervention": "question",
      "smSummary": "phase=test fails=1 tests=3"
    }
  ],
  "queuedTasks": [
    { "name": "worker-c", "branch": "c4/worker-c", "after": "worker-a", "queuedAt": 1712160000000 }
  ],
  "lostWorkers": [],
  "lastHealthCheck": 1712160000000
}
```

### GET /history?worker=worker-a&limit=10

task 히스토리 (history.jsonl).

Response:
```json
{
  "records": [
    {
      "name": "worker-a",
      "task": "Add logging",
      "branch": "c4/worker-a",
      "status": "completed",
      "startedAt": "2026-04-03T10:00:00Z",
      "completedAt": "2026-04-03T10:30:00Z",
      "commits": [{ "hash": "abc1234", "message": "feat: add logging" }]
    }
  ]
}
```

### GET /token-usage

일일 토큰 사용량.

Response:
```json
{
  "today": "2026-04-03",
  "input": 150000,
  "output": 50000,
  "total": 200000,
  "dailyLimit": 0,
  "history": { "2026-04-03": { "input": 150000, "output": 50000 } }
}
```

## Hook Architecture

### POST /hook-event

Claude Code hook (PreToolUse/PostToolUse)에서 구조화된 이벤트 수신.

```json
{
  "worker": "worker-a",
  "hook_type": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "ls -la" }
}
```

PreToolUse response (scope deny):
```json
{ "received": true, "worker": "worker-a", "hook_type": "PreToolUse", "action": "deny", "reason": "bash command denied: rm" }
```

### GET /hook-events?name=worker-a&limit=50

worker의 hook 이벤트 버퍼 조회.

```json
{ "worker": "worker-a", "events": [...], "total": 150 }
```

## SSE (Server-Sent Events)

### GET /events

실시간 이벤트 스트리밍. `text/event-stream` 형식.

```
data: {"type":"connected"}

data: {"type":"permission","worker":"worker-a","promptType":"bash","detail":"npm test","timestamp":1712160000000}

data: {"type":"complete","worker":"worker-a","exitCode":0,"timestamp":1712160000000}

data: {"type":"question","worker":"worker-a","line":"A vs B?","pattern":"A or B","timestamp":1712160000000}

data: {"type":"error","worker":"worker-a","line":"test failed","count":3,"escalation":true,"timestamp":1712160000000}

data: {"type":"hook","worker":"worker-a","event":{...},"timestamp":1712160000000}

data: {"type":"scope_deny","worker":"worker-a","tool":"Bash","command":"rm -rf","reason":"...","timestamp":1712160000000}

data: {"type":"subagent","worker":"worker-a","count":2,"prompt":"...","timestamp":1712160000000}
```

## Planner

### POST /plan

plan-only 모드 — worker가 `plan.md`만 작성.

```json
{
  "name": "planner-1",
  "task": "Refactor auth module",
  "branch": "c4/plan-auth",
  "outputPath": "plan.md",
  "scopePreset": "backend",
  "contextFrom": "worker-a"
}
```

### GET /plan?name=planner-1&outputPath=plan.md

생성된 plan 파일 내용 읽기.

```json
{ "success": true, "path": "/path/to/plan.md", "content": "# Plan\n..." }
```

## Scribe

### POST /scribe/start

세션 컨텍스트 기록 시작 (주기적 JSONL 스캔).

### POST /scribe/stop

기록 중지.

### GET /scribe/status

```json
{
  "enabled": true,
  "running": true,
  "intervalMs": 300000,
  "outputPath": "docs/session-context.md",
  "totalEntries": 200,
  "trackedFiles": 86
}
```

### POST /scribe/scan

즉시 한 번 스캔 실행.

```json
{ "scanned": 86, "newEntries": 5, "totalEntries": 200 }
```

## Config

### GET /config

현재 config.json 전체 반환.

### POST /config/reload

config.json 재로드 (데몬 재시작 없이).

## Templates

### GET /templates

사용 가능한 역할 템플릿 목록.

```json
{
  "templates": {
    "planner": { "model": "opus", "effort": "max", "profile": "planner", "source": "builtin", "description": "..." },
    "executor": { "model": "sonnet", "effort": "high", "profile": "executor", "source": "builtin", "description": "..." },
    "reviewer": { "model": "haiku", "effort": "high", "profile": "reviewer", "source": "builtin", "description": "..." }
  }
}
```

## Swarm

### GET /swarm?name=worker-a

worker의 subagent swarm 상태.

```json
{
  "worker": "worker-a",
  "enabled": true,
  "maxSubagents": 10,
  "subagentCount": 3,
  "subagentLog": [
    { "index": 1, "prompt": "...", "subagentType": "general-purpose", "timestamp": 1712160000000, "status": "spawned" }
  ]
}
```

## MCP (Model Context Protocol)

### POST /mcp

JSON-RPC 2.0 endpoint. MCP 프로토콜로 외부 도구 통합.

```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {} }
```

Available tools: `create_worker`, `send_task`, `list_workers`, `read_output`, `close_worker`.

Initialize:
```json
{ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {} }
```

Response:
```json
{ "jsonrpc": "2.0", "id": 1, "result": { "protocolVersion": "2024-11-05", "capabilities": { "tools": {} }, "serverInfo": { "name": "c4-mcp", "version": "0.13.0" } } }
```
