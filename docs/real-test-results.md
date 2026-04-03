# C4 Real Test Results

> Tested: 2026-04-03 KST
> Node.js: v24.11.1 | Platform: Win11 + Ubuntu 22.04 | node-pty: OK
> Method: Unit tests (direct module) + Integration tests (daemon + real git)

## Summary

| | Total | PASS | FAIL |
|---|---|---|---|
| **Unit** | **160** | **160** | **0** |
| **Integration** | **17** | **17** | **0** |
| **All** | **177** | **177** | **0** |

## Results by Category

### Unit Tests

| # | Category | Tests | PASS | FAIL | Status |
|---|----------|-------|------|------|--------|
| 1 | SSE /events | 6 | 6 | 0 | PASS |
| 2 | ScopeGuard | 22 | 22 | 0 | PASS |
| 3 | Worker Pooling | 6 | 6 | 0 | PASS |
| 4 | Rollback | 10 | 10 | 0 | PASS |
| 5 | StateMachine | 22 | 22 | 0 | PASS |
| 6 | Planner | 10 | 10 | 0 | PASS |
| 7 | MCP Server | 17 | 17 | 0 | PASS |
| 8 | AdaptivePolling | 11 | 11 | 0 | PASS |
| 9 | SummaryLayer | 18 | 18 | 0 | PASS |
| 10 | Scribe Scan | 26 | 26 | 0 | PASS |
| + | ScreenBuffer | 12 | 12 | 0 | PASS |

### Integration Tests

| # | Category | Tests | PASS | FAIL | Status |
|---|----------|-------|------|------|--------|
| 11 | SSE Integration | 4 | 4 | 0 | PASS |
| 12 | MCP Integration | 4 | 4 | 0 | PASS |
| 13 | Worktree Integration | 5 | 5 | 0 | PASS |
| 14 | Linux Cross-Platform | 4 | 4 | 0 | PASS |

## 1. SSE /events (6/6 PASS)

HTTP SSE 서버 + 클라이언트 연결 실사용 테스트. EventEmitter 기반 이벤트 스트리밍.

| Test | Status |
|------|--------|
| connected event received | PASS |
| permission event relay | PASS |
| complete event relay | PASS |
| error event relay | PASS |
| timestamp present on events | PASS |
| client tracking (Set) | PASS |

## 2. ScopeGuard (22/22 PASS)

파일/명령 스코프 제한, drift 감지, resolveScope 우선순위.

| Test | Status |
|------|--------|
| no restrictions allows all | PASS |
| hasRestrictions false | PASS |
| allow src/foo.js (glob `src/**/*.js`) | PASS |
| deny test/foo.js | PASS |
| deny src/secret/key.js | PASS |
| hasRestrictions true | PASS |
| allow npm test | PASS |
| allow git status | PASS |
| deny rm -rf | PASS |
| deny sudo | PASS |
| deny unlisted cmd | PASS |
| drift: refactor | PASS |
| drift: Korean | PASS |
| drift: better way | PASS |
| no drift normal text | PASS |
| summary contains desc | PASS |
| summary contains allow | PASS |
| resolveScope explicit wins | PASS |
| resolveScope preset | PASS |
| resolveScope default | PASS |
| resolveScope null | PASS |
| Windows backslash path | PASS |

## 3. Worker Pooling (6/6 PASS)

idle worker 탐색, 리네임, 상태 리셋 로직.

| Test | Status |
|------|--------|
| config enabled | PASS |
| maxIdleMs default 300000 | PASS |
| finds idle worker | PASS |
| rename worker (Map swap) | PASS |
| reset state on reuse | PASS |
| disabled pool returns null | PASS |

## 4. Rollback (10/10 PASS)

커밋 기록, short hash, noop 감지, snapshot 기록.

| Test | Status |
|------|--------|
| start commit recorded | PASS |
| start commit format (>7 chars) | PASS |
| short commit (7 chars) | PASS |
| same commit = noop | PASS |
| different commit = needs rollback | PASS |
| snapshot recorded after rollback | PASS |
| snapshot has [ROLLBACK] marker | PASS |
| result format (success/from/to) | PASS |
| no worker error handling | PASS |
| no startCommit error handling | PASS |

## 5. StateMachine (22/22 PASS)

phase 감지, test result 감지, 자동 전환, escalation.

| Test | Status |
|------|--------|
| initial phase = edit | PASS |
| initial failCount = 0 | PASS |
| detect plan phase | PASS |
| detect edit phase | PASS |
| detect test phase | PASS |
| detect fix phase (Korean) | PASS |
| detect test fail | PASS |
| detect test pass | PASS |
| detect FAIL keyword | PASS |
| detect PASS keyword | PASS |
| no result for normal text | PASS |
| transition edit -> test | PASS |
| failCount increments | PASS |
| auto transition test -> fix | PASS |
| escalation at 3 consecutive fails | PASS |
| escalation result object | PASS |
| escalation reason contains count | PASS |
| pass resets failCount | PASS |
| pass resets escalated flag | PASS |
| summary format | PASS |
| summary null state | PASS |
| history recorded | PASS |

## 6. Planner (10/10 PASS)

plan prompt 생성, sendPlan 위임, readPlan 에러 처리.

| Test | Status |
|------|--------|
| prompt has [C4 PLAN MODE] | PASS |
| prompt includes task text | PASS |
| prompt references plan.md | PASS |
| prompt has sections 1-5 | PASS |
| prompt has no-execute instruction | PASS |
| custom output path | PASS |
| sendPlan delegates to sendTask | PASS |
| sendPlan passes worker name | PASS |
| readPlan worker not found error | PASS |
| readPlan file not found error | PASS |

## 7. MCP Server (17/17 PASS)

JSON-RPC 2.0 프로토콜, tool registration, error handling.

| Test | Status |
|------|--------|
| initialize returns protocol version | PASS |
| server info (c4-mcp) | PASS |
| tools/list returns 5+ tools | PASS |
| has create_worker tool | PASS |
| has send_task tool | PASS |
| has list_workers tool | PASS |
| has read_output tool | PASS |
| has close_worker tool | PASS |
| create_worker call success | PASS |
| list_workers call success | PASS |
| read_output mode=now | PASS |
| invalid jsonrpc version rejected | PASS |
| unknown method -> -32601 | PASS |
| missing tool name -> -32602 | PASS |
| unknown tool -> -32602 | PASS |
| send_task missing required field | PASS |
| notifications/initialized | PASS |

## 8. AdaptivePolling (11/11 PASS)

idle/moderate/busy 감지, interval 동적 조정.

| Test | Status |
|------|--------|
| initial interval = base (3000ms) | PASS |
| idle -> max interval (5000ms) | PASS |
| idle activity level | PASS |
| 2 events -> moderate | PASS |
| moderate interval range | PASS |
| busy -> min interval (500ms) | PASS |
| busy activity level | PASS |
| null state returns base | PASS |
| null activity = unknown | PASS |
| null recordActivity safe | PASS |
| custom threshold works | PASS |

## 9. SummaryLayer (18/18 PASS)

긴 출력 요약, 섹션 추출, 자동 truncation.

| Test | Status |
|------|--------|
| short text no summary | PASS |
| long text needs summary | PASS |
| null text no summary | PASS |
| short text passthrough | PASS |
| long text summarized | PASS |
| has originalLength | PASS |
| has C4 markers | PASS |
| has errors section | PASS |
| has tests section | PASS |
| has tail section | PASS |
| process short unchanged | PASS |
| process long summarized | PASS |
| autoAction skips summary | PASS |
| null text returns empty | PASS |
| process null returns null | PASS |
| maxSummary truncation | PASS |
| file operation detected | PASS |
| decision detected | PASS |

## 10. Scribe Scan (26/26 PASS)

세션 JSONL 파싱, 콘텐츠 분류, 스캔 실행.

| Test | Status |
|------|--------|
| instance created | PASS |
| default disabled | PASS |
| status returns object | PASS |
| status has enabled field | PASS |
| status has running field | PASS |
| project dir detection | PASS |
| classify: decision | PASS |
| classify: error | PASS |
| classify: fix | PASS |
| classify: intent | PASS |
| classify: progress | PASS |
| classify: null for normal text | PASS |
| extract user text | PASS |
| skip short text | PASS |
| skip command caveat | PASS |
| skip meta message | PASS |
| extract tool uses | PASS |
| shorten path | PASS |
| shorten null path | PASS |
| format time | PASS |
| format null time | PASS |
| truncate long text | PASS |
| truncate short text | PASS |
| scan returns result | PASS |
| scan scanned count | PASS |
| scan newEntries count | PASS |

## Bonus: ScreenBuffer (12/12 PASS)

ANSI escape 파싱, 커서 이동, scrollback.

| Test | Status |
|------|--------|
| basic write | PASS |
| newline | PASS |
| carriage return | PASS |
| cursor back (CSI D) | PASS |
| overwrite at cursor | PASS |
| erase to end (CSI K) | PASS |
| scrollback populated | PASS |
| getScrollback | PASS |
| getFullHistory | PASS |
| clear screen (CSI 2J) | PASS |
| tab handling | PASS |
| cursor position (CSI H) | PASS |

## 11. SSE Integration (4/4 PASS)

실제 데몬 + HTTP SSE 연결 통합 테스트.

| Test | Status |
|------|--------|
| SSE 연결 성공 (GET /events) | PASS |
| 작업자 이벤트 실시간 수신 | PASS |
| 멀티 클라이언트 동시 연결 | PASS |
| 클라이언트 disconnect 정리 | PASS |

## 12. MCP Integration (4/4 PASS)

실제 데몬 + JSON-RPC 2.0 통합 테스트.

| Test | Status |
|------|--------|
| MCP initialize 핸드셰이크 | PASS |
| tools/list 전체 도구 반환 | PASS |
| 작업자 생명주기 (create→task→read→close) | PASS |
| 에러 응답 코드 검증 | PASS |

## 13. Worktree Integration (5/5 PASS)

실제 git worktree 생성/정리 통합 테스트.

| Test | Status |
|------|--------|
| task 시 worktree 자동 생성 | PASS |
| 브랜치 격리 확인 | PASS |
| close 시 worktree 정리 | PASS |
| stale worktree 감지/정리 | PASS |
| worktree에 hooks path 전파 | PASS |

## 14. Linux Cross-Platform (4/4 PASS)

Ubuntu 22.04에서 전체 흐름 검증.

| Test | Status |
|------|--------|
| 데몬 start/stop 정상 동작 | PASS |
| 작업자 생성 + PTY 연결 | PASS |
| 플랫폼별 경로 해석 | PASS |
| npm link 등록 | PASS |

## Test Script

`tests/_real_test.js` (177 assertions, ~780 lines)
