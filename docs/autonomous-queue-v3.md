# 자동 실행 큐 v3 (v2 완료 후 이어서)

v2 완료 감지 시 monitor가 이 큐로 자동 dispatch. 규칙은 v2와 동일 (manager.md 7.26 rules).

**우선순위 변경**: 8.14 세션 관리/인증을 task [1]로 땡김 (v3 시작과 동시에 가장 먼저). 인증 구현 전까지 web UI 외부 바인딩 금지 (injection 위험).

## 태스크 큐 (우선순위 순)

### [1] TODO 8.14 — **긴급** Web UI 세션 관리 + 인증 (땡겨서 최우선)
- 워커: session-auth
- 브랜치: c4/session-auth
- 내용: TODO 8.14 읽고 구현. daemon HTTP 인증 미들웨어 + JWT 발급/검증 + Web UI 로그인 페이지 + 토큰 저장/전송 + config `auth.enabled`. 초기 사용자 생성 두 가지 모드: (a) `c4 init` 대화형 프롬프트, (b) **`c4 init --user <name> --password-file <path>` 비대화형 모드** (자동화용, password-file 읽어 bcrypt 해시 후 config 저장, 원본 파일은 건드리지 않음). 이 태스크 완료 전까지 daemon/vite 외부 바인딩 금지.

### [2] TODO 8.13 — Web UI 터미널 뷰 해상도/줄바꿈 개선
- 워커: term-view-fix
- 브랜치: c4/term-view-fix
- 내용: TODO 8.13 읽고 구현. WorkerDetail의 `<pre>` 가로 스크롤 보장, xterm.js 도입 검토, viewport-aware cols 조정.

### [2] TODO 8.2 — 재귀 계층 트리 (parent-child 시각화)
- 워커: hierarchy-tree
- 브랜치: c4/hierarchy-tree
- 내용: TODO 8.2 읽고 구현. `c4 list --tree` CLI + worker 메타데이터에 parent 필드 + Web UI 트리 시각화.

### [3] TODO 8.6 — Web UI 채팅 인터페이스
- 워커: web-chat
- 브랜치: c4/web-chat
- 내용: TODO 8.6 읽고 구현. worker별 채팅 뷰, 메시지 입력 → POST /send, SSE /watch로 수신, 말풍선 UI.

### [4] TODO 8.7 — Web UI 대화/작업 이력
- 워커: web-history
- 브랜치: c4/web-history
- 내용: TODO 8.7 읽고 구현. scrollback + history.jsonl 기반 과거 task 목록, 검색/필터, scribe viewer.

### [5] TODO 8.8 — Web UI Worker 제어 패널
- 워커: web-control
- 브랜치: c4/web-control
- 내용: TODO 8.8 읽고 구현. 중단/일시정지/재개/롤백/재시작 버튼, 배치 제어, task 취소.

### [6] TODO 8.4 — 지능형 예외 복구
- 워커: smart-recovery
- 브랜치: c4/smart-recovery
- 내용: TODO 8.4 읽고 구현. 단순 재시도 + 작업 재정의 + 대안 경로. 실패 패턴 학습 기반 자가 치유.

### [7] TODO 9.4 — MCP 서버 고도화
- 워커: mcp-upgrade
- 브랜치: c4/mcp-upgrade
- 내용: TODO 9.4 읽고 구현. mcp-handler.js를 최신 MCP 스펙으로 업그레이드. Claude Desktop/claude.ai에서 c4 사용 가능하게.

### [8] TODO 9.6 — 멀티 머신 Fleet 관리
- 워커: fleet-mgmt
- 브랜치: c4/fleet-mgmt
- 내용: TODO 9.6 읽고 구현. IP별 alias 등록, Fleet config, daemon 간 상태 동기화. 40+DGX+15 각자 daemon.

## 실행 패턴

v2와 동일. 각 태스크:
1. c4 new → c4 task (spec 파일 있으면 경로, 없으면 TODO.md 참조 지시) → c4 wait
2. approval 승인/거부 판단
3. merge → push → daemon restart (필요 시) → close
4. autonomous-log.md 업데이트

## 완료 시

이 파일 8개 태스크 끝나면 monitor가 v4로 dispatch. v4도 미리 준비됨 (아직 없으면 monitor가 사용자에게 알림).
