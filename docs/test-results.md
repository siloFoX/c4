# Test Results

> C4 v1.0.1 — Node.js v24.11.1, Windows 11  
> Last run: 2026-04-03

## Summary

| Category | Files | Tests | Pass | Fail |
|----------|-------|-------|------|------|
| node:test (built-in) | 9 | 119 | 119 | 0 |
| Plain (console.log assert) | 3 | 25+ | all | 0 |
| jest-style (no runner) | 6 | — | — | — |
| **Total runnable** | **12** | **144+** | **all** | **0** |

jest-style 테스트 6개는 `describe`를 bare로 사용하여 jest 없이 실행 불가. 프로젝트에 jest 의존성이 없으므로 현재 실행되지 않음.

## node:test (built-in test runner)

`node --test tests/<file>.test.js` — 9 files, 119 tests, 0 failures.

| File | Tests | Status |
|------|-------|--------|
| auto-mode.test.js | 10 | PASS |
| effort-dynamic.test.js | 8 | PASS |
| hook-architecture.test.js | 18 | PASS |
| platform.test.js | 12 | PASS |
| role-templates.test.js | 15 | PASS |
| screen-buffer.test.js | 16 | PASS |
| sse.test.js | 6 | PASS |
| subagent-swarm.test.js | 13 | PASS |
| worker-settings.test.js | 21 | PASS |

### Covered Features

- **Auto Mode (3.19)**: `permissions.defaultMode: "auto"` 적용, config override, 비활성 시 미적용
- **Dynamic Effort (3.3)**: task 길이 기반 effort 자동 결정, threshold 매칭
- **Hook Architecture (3.15)**: PreToolUse scope 검사, PostToolUse 에러 추적/루틴 감시/subagent 추적, hook event 버퍼 관리
- **Platform (3.20)**: `platformShell()`, `platformShellArgs()`, `platformSshPath()`, `platformClaudePaths()` — win32/linux/darwin 분기
- **Role Templates (3.18)**: builtin 3종 (planner/executor/reviewer), config override, template 적용 (model/effort/profile/promptPrefix)
- **ScreenBuffer (3.8)**: CSI P/@ /X/s/u/r/b/I/Z 처리, scrollback API, getFullHistory
- **SSE (3.5)**: 이벤트 emit, client 관리, permission/complete/error/question 이벤트
- **Subagent Swarm (3.17)**: Agent tool 감지, subagent 카운트/로그, limit 경고
- **Worker Settings (3.16)**: profile 기반 permissions/hooks 생성, `.claude/settings.json` 자동 작성

## Plain Tests (console.log assertions)

`node tests/<file>.test.js` — 3 files, all passed.

| File | Tests | Status |
|------|-------|--------|
| scope-guard.test.js | 20+ | PASS |
| task-queue.test.js | 15+ | PASS |
| history.test.js | 25 | PASS |

### Covered Features

- **Scope Guard (1.8)**: checkFile (allow/deny glob), checkBash (command prefix), detectDrift (한국어+영어 키워드), resolveScope (explicit > preset > default)
- **Task Queue (2.2/2.3/2.8)**: enqueue 구조, dependency 체크, maxWorkers 제한, duplicate 방지
- **History (3.7)**: JSONL 파싱, 필드 검증 (name/task/branch/status/startedAt/completedAt/commits)

## jest-style (실행 불가)

`describe`/`it`를 import 없이 사용. jest 의존성 없어 `ReferenceError: describe is not defined` 발생.

| File | Target Feature |
|------|---------------|
| adaptive-polling.test.js | AdaptivePolling (3.12) |
| mcp-handler.test.js | MCP JSON-RPC 2.0 (3.9) |
| planner.test.js | Planner plan mode (3.10) |
| state-machine.test.js | StateMachine phase tracking (3.11) |
| summary-layer.test.js | SummaryLayer snapshot 요약 (3.14) |
| terminal-interface.test.js | TerminalInterface 패턴 매칭 (3.13) |

해결 방법: 각 파일 상단에 `const { describe, it } = require('node:test');` 추가하면 실행 가능.

## Module Require Tests

모든 소스 모듈이 정상적으로 `require()` 가능:

```
src/adaptive-polling.js   ✓
src/cli.js                ✓ (entry point)
src/daemon.js             ✓ (서버 시작 side-effect)
src/daemon-manager.js     ✓
src/mcp-handler.js        ✓
src/planner.js            ✓
src/pty-manager.js        ✓
src/scope-guard.js        ✓
src/screen-buffer.js      ✓
src/scribe.js             ✓
src/state-machine.js      ✓
src/summary-layer.js      ✓
src/terminal-interface.js ✓
```

## Test Coverage by Phase

| Phase | Items | Tested |
|-------|-------|--------|
| Phase 1 (Core) | 17 | scope-guard, hook-architecture (intervention/routine), worker-settings |
| Phase 2 (Ops) | 8 | task-queue (dependency/dedup/rate-limit), history |
| Phase 3 (Ext) | 20 | screen-buffer, auto-mode, effort-dynamic, hook-architecture, platform, role-templates, sse, subagent-swarm, worker-settings |
