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
| 2.7 | 로그 관리 및 세션 복구 | **done** | 로그 로테이션(50MB). 종료 작업자 로그 자동 정리. 데몬 재시작 시 lost workers 표시 |
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
| 4.1 | 완전 무인 운영 모드 | **partial** | global auto mode로 권한 자동 승인 구현. PostCompact hook으로 컨텍스트 복구. 남은 과제: claude --resume 연동 |
| 4.2 | Hook 이벤트 JSONL 영속화 | **done** | PostToolUse/PreToolUse 이벤트를 logs/events-<worker>.jsonl에 저장. 리플레이/디버깅 |
| 4.3 | 승인 요청 웹 UI | todo | 작업자 권한 요청을 웹 대시보드에 표시. 폰에서 승인/거부 |
| 4.4 | 아침 보고서 자동 생성 | **done** | 야간 작업 완료 후 docs/morning-report.md 자동 생성. 완료/실패/수정 필요 항목 요약 |
| 4.5 | 관리자 자동 컨펌 정책 | **partial** | global auto mode로 Level 3 구현 (deny 외 전부 자동 승인). Level 4(완전 자율) 미구현 |
| 4.6 | PreToolUse hook으로 복합 명령 차단 | **done** | 작업자 .claude/settings.json에 hook 자동 삽입. &&, |, ; 감지 시 block. 승인 요청 자체가 안 뜨게 |
| 4.7 | 관리자 컨텍스트 한계 자동 대응 | **partial** | PostCompact hook이 CLAUDE.md+session-context.md 자동 주입. 남은 과제: 관리자 자동 교체 |
| 4.8 | c4 auto 원커맨드 실행 | **done** | c4 auto "작업 내용" 하면 관리자+scribe+작업자 전부 자동 생성, 완료 시 morning-report 생성 |
| 4.9 | 작업자 .claude/settings.json 프리셋 | **done** | worktree 생성 시 역할별 permissions+hooks 자동 삽입. 복합 명령 차단 hook 포함 |
| 4.10 | 관리자-작업자 간 Hook 기반 통신 | **done** | Notifications 모듈(Slack webhook+Email). healthCheck 연동. 작업 완료/에러/헬스 이벤트 알림 |
| 4.11 | c4 status 명령 + AI 요약 알림 | **done** | `c4 status <name> "msg"` — worker가 직접 Slack에 상태 메시지 전송. daemon /status-update 라우트 |
| 4.12 | 메시지 채널 확장 | todo | 카카오톡(KakaoWork API), 텔레그램(Bot API), Discord(Webhook) 알림 채널 추가. notifications.js 플러그인 구조로 |
| 4.13 | config.example.json + CLAUDE.md 최신화 | **done** | config.example.json에 intervention, notifications.language 추가. CLAUDE.md에 CLI 전체 명령어 레퍼런스 추가 |

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

이러면 밤새 사람 개입 없이 돌아감.

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
