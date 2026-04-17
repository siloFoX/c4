# API Reference

`src/daemon.js` `handleRequest`에 정의된 모든 HTTP 라우트 목록.
데몬은 기본값 `http://127.0.0.1:3456` 에서 수신한다 (`daemon.port` / `daemon.host` 로 덮어쓰기 가능).

- 응답 `Content-Type`은 별도 표기가 없으면 `application/json`.
- 실패 응답은 `{ "error": "..." }` + HTTP 400 (예외 발생 시 500).
- SSE 응답은 `text/event-stream`, HTML 응답은 `text/html`.
- POST body는 JSON. 미리보기 값이 누락되어 있으면 `parseBody` 가 `{}` 로 대체하므로 필수 필드는 엔드포인트가 자체 검증.

기존 `docs/api.md` 는 페이로드 상세 예시(스키마 샘플) 중심 문서이고, 본 문서는 daemon.js 라우트 **전수 매핑표** 이다.

---

## 1. 전체 라우트 요약

| # | Method | Path | 주요 용도 |
|---|--------|------|-----------|
| 1 | GET | `/health` | 데몬 health check |
| 2 | GET | `/list` | 모든 worker / 큐 / lost 조회 |
| 3 | GET | `/config` | 현재 config 조회 |
| 4 | POST | `/config/reload` | config.json 재로드 |
| 5 | POST | `/create` | worker 생성 |
| 6 | POST | `/task` | worker 에 task 전송 (자동 생성 + worktree 포함) |
| 7 | POST | `/send` | worker 에 텍스트/키 전송 |
| 8 | POST | `/approve` | 권한 프롬프트 승인 |
| 9 | POST | `/close` | worker 종료 + worktree 정리 |
| 10 | POST | `/rollback` | task 시작 커밋으로 soft reset |
| 11 | POST | `/cleanup` | 고아 worktree/브랜치 일괄 정리 |
| 12 | POST | `/resume` | `--resume <sessionId>` 로 worker 재시작 |
| 13 | GET | `/session-id` | worker의 Claude Code 세션 ID 조회 |
| 14 | GET | `/read` | 새 idle 스냅샷만 반환 |
| 15 | GET | `/read-now` | 현재 화면 즉시 반환 (busy 포함) |
| 16 | GET | `/wait-read` | idle 될 때까지 대기 후 반환 |
| 17 | GET | `/wait-read-multi` | 여러 worker 중 첫 완료 대기 |
| 18 | GET | `/scrollback` | scrollback 버퍼 반환 |
| 19 | GET | `/events` | 전역 SSE 이벤트 스트림 |
| 20 | GET | `/watch` | 특정 worker PTY 출력 실시간 스트림 (SSE, base64) |
| 21 | POST | `/hook-event` | Claude Code hook 이벤트 수신 |
| 22 | GET | `/hook-events` | worker 의 hook 이벤트 버퍼 조회 |
| 23 | POST | `/compact-event` | PostCompact hook 이벤트 수신 |
| 24 | GET | `/token-usage` | 일일 토큰 사용량 |
| 25 | GET | `/history` | task 히스토리 (history.jsonl) |
| 26 | POST | `/scribe/start` | scribe 시작 |
| 27 | POST | `/scribe/stop` | scribe 중지 |
| 28 | GET | `/scribe/status` | scribe 상태 |
| 29 | POST | `/scribe/scan` | scribe 즉시 스캔 |
| 30 | POST | `/plan` | plan-only 모드 task 전송 |
| 31 | GET | `/plan` | plan 결과 파일 읽기 |
| 32 | POST | `/mcp` | MCP JSON-RPC 엔드포인트 |
| 33 | GET | `/templates` | 역할 템플릿 목록 |
| 34 | GET | `/profiles` | 권한 프로파일 목록 |
| 35 | GET | `/swarm` | worker subagent swarm 상태 |
| 36 | POST | `/auto` | 자율 모드 시작 (manager + scribe 자동) |
| 37 | POST | `/morning` | morning report 생성 |
| 38 | POST | `/status-update` | Slack 상태 메시지 송신 |
| 39 | GET | `/dashboard` | HTML 대시보드 (자동 30초 refresh) |

기타: 매칭되지 않는 path 는 `{ "error": "Not found" }` + HTTP 404.

---

## 2. Worker lifecycle

| Method | Path | Query / Body | Response (JSON) |
|--------|------|--------------|-----------------|
| POST | `/create` | body: `{ name, command, args?, target?, cwd? }` | `manager.create()` 결과: `{ name, pid, target, status }` 등 |
| POST | `/task` | body: `{ name, task, branch?, useBranch?, useWorktree?, projectRoot?, cwd?, scope?, scopePreset?, after?, command?, target?, contextFrom?, reuse?, profile?, autoMode? }` | 실행 시 `{ success, branch, worktree, scope, contextFrom, startCommit, task }`. 큐잉 시 `{ queued, name, after, position, reason }` |
| POST | `/send` | body: `{ name, input, keys? }` | `manager.send()` 반환 (`{ ok: true, ... }`) |
| POST | `/approve` | body: `{ name, optionNumber? }` | `manager.approve()` 결과 |
| POST | `/close` | body: `{ name }` | `manager.close()` 결과 |
| POST | `/rollback` | body: `{ name }` | `{ success, from, to }` |
| POST | `/cleanup` | body: `{ dryRun? }` | `{ removedWorktrees, removedBranches, dryRun }` 형태 |
| POST | `/resume` | body: `{ name, sessionId? }` | sessionId 가 없거나 못 찾으면 `{ error }`. 성공 시 `manager.create()` 결과 (`claude --resume <sid>`) |
| GET | `/session-id` | query: `name` | `{ name, sessionId }` (없으면 `sessionId: null`) |

비고
- `/task` 는 worker 가 없으면 `manager.sendTask` 내부에서 자동 생성한다.
- `/resume` 는 살아있는 worker 가 있으면 먼저 close 후 새로 생성한다 (세션 타이머/로그 스트림 정리).

---

## 3. Reading worker output

| Method | Path | Query | Response |
|--------|------|-------|----------|
| GET | `/read` | `name` | `{ content, status, snapshotsRead, summarized }` |
| GET | `/read-now` | `name` | `{ content, status }` (busy 상태에서도 즉시) |
| GET | `/wait-read` | `name`, `timeout?` (ms, default 120000), `interruptOnIntervention?` (`1` 이면 true) | idle 도달 시 `{ content, status }`. 타임아웃 시 `status: "timeout"` |
| GET | `/wait-read-multi` | `names` (CSV), `timeout?`, `interruptOnIntervention?` | 이름이 없으면 `{ error }`. 정상이면 `manager.waitAndReadMulti()` 결과 (첫 완료 worker 이름 + content) |
| GET | `/scrollback` | `name`, `lines?` (default 200) | `{ content, lines, totalScrollback }` |

---

## 4. Listing / Monitoring

| Method | Path | Query / Body | Response |
|--------|------|--------------|----------|
| GET | `/health` | (없음) | `{ ok: true, workers, version }` |
| GET | `/list` | (없음) | `{ workers[], queuedTasks[], lostWorkers[], lastHealthCheck }` |
| GET | `/history` | `worker?`, `limit?` | `{ records: [...] }` (history.jsonl) |
| GET | `/token-usage` | (없음) | `{ today, input, output, total, dailyLimit, history }` |
| GET | `/swarm` | `name` (필수, 없으면 `{ error }`) | `{ worker, enabled, maxSubagents, subagentCount, subagentLog }` |
| GET | `/templates` | (없음) | `{ templates }` |
| GET | `/profiles` | (없음) | `{ profiles }` |

---

## 5. 실시간 스트림 (SSE)

| Method | Path | Query | Stream content |
|--------|------|-------|----------------|
| GET | `/events` | (없음) | 전역 이벤트. 연결 시 `data: {"type":"connected"}`. 이후 `type: permission / complete / question / error / hook / scope_deny / subagent` 등을 푸시 |
| GET | `/watch` | `name` (필수) | 특정 worker 의 raw PTY 출력. `data: {"type":"connected","worker":name}` → `data: {"type":"output","data":"<base64>"}`. worker 없으면 HTTP 404 + `{ error }`, `name` 누락 시 HTTP 400 + `{ error }` |

공통
- 헤더: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
- 클라이언트가 연결을 닫으면 (`req.on('close')`) 내부 리스너를 해제.

---

## 6. Hook 아키텍처 (3.15+)

| Method | Path | Query / Body | Response |
|--------|------|--------------|----------|
| POST | `/hook-event` | body: `{ worker, hook_type, tool_name?, tool_input?, ... }` | worker 없으면 `{ error: "Missing worker name in hook event" }`. 정상이면 `manager.hookEvent()` 결과 (`{ received, worker, hook_type, action?, reason? }`) |
| GET | `/hook-events` | `name` (필수), `limit?` (default 50) | `{ worker, events, total }`. `name` 누락 시 `{ error: "Missing name parameter" }` |
| POST | `/compact-event` | body: `{ worker }` | worker 없으면 `{ error }`. 정상이면 `manager.compactEvent()` 결과 (관리자 auto-replacement, 4.7) |

서버 로그: `/hook-event` 수신 시 `[DAEMON] /hook-event received: worker=... hook_type=... tool=...` 로 stderr 출력.

---

## 7. Config / Scribe / Planner / Auto

| Method | Path | Query / Body | Response |
|--------|------|--------------|----------|
| GET | `/config` | (없음) | config.json 전체 |
| POST | `/config/reload` | (없음) | reload 결과 (`{ ok: true, ... }`) |
| POST | `/scribe/start` | (없음) | scribe 시작 결과 |
| POST | `/scribe/stop` | (없음) | scribe 중지 결과 |
| GET | `/scribe/status` | (없음) | `{ enabled, running, intervalMs, outputPath, totalEntries, trackedFiles }` |
| POST | `/scribe/scan` | (없음) | `{ scanned, newEntries, totalEntries }` |
| POST | `/plan` | body: `{ name, task, branch?, outputPath?, scopePreset?, contextFrom? }` | `planner.sendPlan()` 결과 |
| GET | `/plan` | `name`, `outputPath?` | `{ success, path, content }` (파일 없으면 `{ error }`) |
| POST | `/auto` | body: `{ task, name? }` | `manager.autoStart()` 결과 |
| POST | `/morning` | (없음) | `{ report: "..." }` (morning report Markdown) |
| POST | `/status-update` | body: `{ worker?, message }` | `{ sent: true }` (worker 기본값 `"C4"`) |

---

## 8. MCP

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/mcp` | JSON-RPC 2.0 payload (`{ jsonrpc, id, method, params }`) | JSON-RPC 2.0 응답. `mcpHandler.handle()` 반환값을 그대로 전달 (`res.writeHead(200)` 후 즉시 `res.end`) |

지원 method: `initialize`, `tools/list`, `tools/call` 등. 자세한 tool 목록은 `docs/api.md` MCP 절 참조.

---

## 9. Dashboard (HTML)

| Method | Path | Response |
|--------|------|----------|
| GET | `/dashboard` | `text/html; charset=utf-8`. `renderDashboard(manager.list())` 결과. 자동 30초 refresh 스크립트 포함. workers / queuedTasks / lostWorkers 테이블 렌더링 |

이 라우트는 `Content-Type` 기본값(JSON)을 덮어쓰고 HTML 로 응답한다.

---

## 10. 공통 에러 / 상태 코드

| 상황 | 상태 | 응답 |
|------|------|------|
| 정상 결과 | 200 | JSON payload |
| 결과에 `result.error` 필드 존재 | 400 | 해당 JSON |
| 존재하지 않는 path | 404 | `{ "error": "Not found" }` |
| `/watch` name 누락 | 400 | `{ "error": "Missing name parameter" }` |
| `/watch` worker 없음 | 404 | `{ "error": "Worker '<name>' not found" }` |
| `handleRequest` 내부 예외 | 500 | `{ "error": err.message }` (헤더 이미 전송 시 그대로 종료) |

---

## 11. Web UI 실시간 모니터링용 API 권장 세트

아래가 Web UI (대시보드, worker 상세, 라이브 뷰어) 구현 시 필요한 **최소 세트** 이다.

### (A) Polling / 정적 정보

| 용도 | 엔드포인트 | 주기 / 트리거 |
|------|-----------|---------------|
| 데몬 생존 확인 | `GET /health` | 5~10초 주기 또는 초기 접속 |
| worker / 큐 / lost 한 번에 | `GET /list` | 5~10초 주기 (SSE 보조) |
| 선택한 worker 의 현재 화면 | `GET /read-now?name=<worker>` | 상세 패널 열 때 1회 + 3~5초 주기 폴백 |
| 스크롤백 뷰 | `GET /scrollback?name=<worker>&lines=500` | 사용자가 "이전 출력 보기" 클릭 시 |
| hook 이벤트 로그 | `GET /hook-events?name=<worker>&limit=100` | 상세 패널 열 때 + 주기 refresh (또는 `/events` type=hook 으로 대체) |
| 토큰 사용량 위젯 | `GET /token-usage` | 1분 주기 |
| 히스토리 | `GET /history?worker=<name>&limit=20` | 상세 패널 열 때 1회 |
| config 뷰 | `GET /config` | 설정 탭 진입 시 |
| 템플릿 / 프로파일 / swarm | `GET /templates`, `GET /profiles`, `GET /swarm?name=...` | 관련 UI 진입 시 |

### (B) 실시간 스트림 (SSE 우선)

| 용도 | 엔드포인트 | 비고 |
|------|-----------|------|
| 전역 이벤트 브로드캐스트 (permission / complete / question / error / hook / scope_deny / subagent) | `GET /events` | 대시보드가 상시 하나 유지. 이벤트 수신 시 해당 worker 카드만 부분 갱신 |
| 특정 worker 의 raw PTY 출력 "라이브 뷰" | `GET /watch?name=<worker>` | data 는 base64 → xterm.js 등에 직접 write. 상세 뷰 열릴 때 연결, 닫힐 때 종료 |

### (C) 제어 (action 버튼)

| 용도 | 엔드포인트 |
|------|-----------|
| 새 task / worker 시작 | `POST /task` (worker 없으면 자동 생성) |
| 권한 프롬프트 승인 | `POST /approve` |
| 텍스트/키 전송 | `POST /send` |
| 종료 | `POST /close` |
| 롤백 | `POST /rollback` |
| 고아 정리 | `POST /cleanup` |
| resume | `POST /resume` (+ 사전 `GET /session-id`) |
| config reload | `POST /config/reload` |
| scribe 토글 | `POST /scribe/start` / `POST /scribe/stop` + `GET /scribe/status` |
| plan 생성 / 읽기 | `POST /plan`, `GET /plan` |
| Slack 상태 전송 | `POST /status-update` |
| auto 모드 시작 | `POST /auto` |
| morning report | `POST /morning` |

### (D) 최소 MVP 구성 (실시간 모니터링 코어)

가장 먼저 구현해야 할 5개:

1. `GET /list` — 상단 요약 / worker 테이블.
2. `GET /events` (SSE) — 이벤트 기반 부분 갱신 (폴링 대체).
3. `GET /watch?name=…` (SSE) — 선택한 worker 라이브 터미널.
4. `GET /read-now?name=…` — 상세 패널 오픈 시 즉시 스냅샷.
5. `GET /scrollback?name=…&lines=N` — 과거 출력 탐색.

+ hook 인사이트가 필요하면 `GET /hook-events?name=…` 보조.
+ 쓰기 동작 (`POST /send`, `/approve`, `/close`, `/task`) 은 UI 버튼 바인딩.

---

## 12. 참고

- 소스: `src/daemon.js` (`handleRequest` 함수).
- 구체적 payload / scope / profile 스키마: `docs/api.md`.
- 설정 키: `docs/config-reference.md`.
