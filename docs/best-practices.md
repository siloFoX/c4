# C4 Best Practices

> 작성일: 2026-04-16
> 대상: C4 v1.5.0
> 환경: Windows 11 + Git Bash, Node.js v24, DGX (Ubuntu 22.04, SSH)

실사용에서 검증된 패턴, 데모 녹화 가이드, MCP 등록 절차, Build in Public 전략을 정리한다.

---

## 목차

1. [실사용 패턴 6선](#실사용-패턴-6선)
2. [데모 시나리오 + 녹화 가이드](#데모-시나리오--녹화-가이드)
3. [MCP 서버 등록 가이드](#mcp-서버-등록-가이드)
4. [Build in Public 방안](#build-in-public-방안)

---

## 실사용 패턴 6선

### 패턴 1: 단일 작업자 빠른 구현

가장 기본적인 사용법. 하나의 기능을 하나의 워커에 위임하고 결과만 확인한다.

**적합한 상황:** 단일 파일/모듈 수정, 버그 수정, 테스트 추가, 문서 작성

```bash
# 1. 작업 전송 (워커 생성 + 브랜치 자동 생성)
c4 task add-logger --auto-mode "src/utils.js에 Logger 클래스 추가. info/warn/error 메서드. tests/utils.test.js에 유닛 테스트 작성."

# 2. 완료 대기
c4 wait add-logger

# 3. 결과 확인 + 머지
c4 read add-logger
c4 merge add-logger

# 4. 정리
c4 close add-logger
```

**핵심 포인트:**
- `--auto-mode` 로 권한 승인 자동화. 수동 개입 최소화.
- 워커 이름에 작업 내용을 반영 (`add-logger`). `w-1` 같은 이름 금지.
- `c4 list` 반복 호출 대신 `c4 wait` 사용. 완료 시 즉시 반환.
- 머지 전 `c4 read`로 결과 확인. 맹목적 머지 금지.

---

### 패턴 2: 병렬 멀티 워커 분업

서로 다른 파일을 수정하는 작업을 병렬로 처리한다. 같은 파일을 건드리지 않으면 머지 충돌이 없다.

**적합한 상황:** 모듈별 기능 추가, 독립적인 버그 수정 여러 건, 테스트 병렬 작성

```bash
# 1. 독립 작업 3개를 각각 워커에 전송
c4 task impl-auth --auto-mode "src/auth.js에 JWT 검증 미들웨어 구현"
c4 task impl-rate --auto-mode "src/rate-limiter.js에 토큰 버킷 rate limiter 구현"
c4 task impl-cache --auto-mode "src/cache.js에 LRU 캐시 구현. TTL 지원"

# 2. 전체 대기 (intervention 발생 시 즉시 반환)
c4 wait --all --interrupt-on-intervention

# 3. 결과 확인
c4 read impl-auth
c4 read impl-rate
c4 read impl-cache

# 4. 순차 머지 (충돌 없는 순서대로)
c4 merge impl-auth
c4 merge impl-rate
c4 merge impl-cache

# 5. 전체 정리
c4 close impl-auth
c4 close impl-rate
c4 close impl-cache
```

**핵심 포인트:**
- 각 워커가 독립 worktree에서 작업하므로 파일 충돌 없음.
- `c4 wait --all`로 전체 완료를 한 번에 대기. 개별 wait보다 효율적.
- `--interrupt-on-intervention` 으로 권한 요청 즉시 감지.
- `maxWorkers` 설정 확인. 초과 시 자동 큐잉.

---

### 패턴 3: Planner → Executor → Reviewer 파이프라인

설계→구현→리뷰를 역할별 워커로 분리한다. 각 역할에 최적 모델을 배정한다.

**적합한 상황:** 아키텍처 변경, 복잡한 기능 추가, 코드 품질이 중요한 작업

```bash
# 1. 설계 (Opus — 깊은 분석)
c4 plan planner-api "src/api/ 디렉토리에 RESTful CRUD 엔드포인트 설계. 인증, 에러 처리, 페이지네이션 포함." --output docs/api-plan.md

# 2. 설계 결과 확인
c4 plan-read planner-api

# 3. 구현 (Sonnet — 빠른 코드 생성)
c4 task exec-api --auto-mode "docs/api-plan.md 설계대로 src/api/ 구현. 테스트도 작성."

# 4. 구현 완료 대기
c4 wait exec-api

# 5. 리뷰 (별도 워커로 코드 리뷰)
c4 task review-api --auto-mode --branch c4/review-api "exec-api 워커의 c4/exec-api 브랜치 diff를 리뷰. 보안 취약점, 성능 문제, 코드 스타일 체크. 결과를 docs/review-api.md에 작성."

# 6. 리뷰 완료 후 머지
c4 wait review-api
c4 read review-api
c4 merge exec-api
c4 close planner-api
c4 close exec-api
c4 close review-api
```

**핵심 포인트:**
- `c4 plan`으로 설계만 먼저 뽑아내면 구현 워커가 명확한 스펙대로 작업.
- 리뷰 워커는 코드 수정 권한 없이 리뷰만 수행 (`reviewer` 프로파일).
- 템플릿 활용: `config.json`의 `templates.planner`, `templates.executor`, `templates.reviewer`.

---

### 패턴 4: c4 auto 야간 무인 운영

`c4 auto` 한 줄로 관리자+scribe+워커를 전부 생성하고, 자고 일어나면 결과만 확인한다.

**적합한 상황:** 대규모 리팩토링, 테스트 커버리지 확대, 문서 일괄 작성

**사전 설정:**
```json
{
  "autoApprove": { "autonomyLevel": 3 },
  "healthCheck": { "autoRestart": true },
  "notifications": {
    "slack": { "enabled": true, "webhookUrl": "https://hooks.slack.com/...", "alertOnly": true }
  }
}
```

```bash
# 1. 야간 작업 투입
c4 auto "TODO.md에서 Phase 6 남은 항목을 전부 처리해. 각 항목별로 워커 생성하고 병렬 진행. 완료 후 morning-report 작성."

# 2. (자고 일어난 후) 결과 확인
cat docs/morning-report.md    # 아침 보고서
c4 history --last 10           # 작업 히스토리
git log --oneline -10          # 커밋 확인
```

**핵심 포인트:**
- `autonomyLevel: 3`으로 일반 작업 자동 승인. 위험 명령만 거부.
- `alertOnly: true`로 Slack에 STALL/ERROR만 전송. 일반 알림 억제.
- `healthCheck.autoRestart: true`로 죽은 워커 자동 재시작.
- 아침에 `morning-report.md`와 `git log`로 결과 확인.
- Critical Deny List가 `rm -rf /`, `git push --force` 등 파괴적 명령을 절대 차단.

---

### 패턴 5: SSH 원격 + 로컬 연동

GPU 서버(DGX)에서 ML 작업을 돌리면서 로컬에서 문서/설정을 병렬 작업한다.

**적합한 상황:** ML 학습/추론, GPU 의존 작업, 로컬+원격 분업

**사전 설정 (config.json targets):**
```json
{
  "targets": {
    "dgx": {
      "type": "ssh",
      "host": "shinc@192.168.10.222",
      "defaultCwd": "/home/shinc/arps",
      "commandMap": { "claude": "/home/shinc/.local/bin/claude" }
    }
  }
}
```

```bash
# 1. DGX에서 ML 작업 실행
c4 new train-model --target dgx
c4 task train-model "arps/src/rag.py의 embedding 모델을 all-MiniLM-L6-v2로 교체. 기존 테스트 유지."

# 2. 로컬에서 문서 작업 동시 진행
c4 task update-docs --auto-mode "README.md에 새 embedding 모델 사용법 추가. 설치 가이드 업데이트."

# 3. 양쪽 대기
c4 wait train-model
c4 wait update-docs

# 4. 결과 확인
c4 read train-model    # DGX 작업 결과
c4 read update-docs    # 로컬 문서 변경

# 5. 로컬 머지 + 정리
c4 merge update-docs
c4 close train-model
c4 close update-docs
```

**핵심 포인트:**
- SSH 타겟 워커는 로컬에 worktree를 생성하지 않음 (4.22).
- SSH ControlMaster로 끊김 자동 복구 (2.4).
- DGX 작업은 별도 머지 불필요 (원격 repo에서 직접 커밋).
- `ml` 프로파일로 `python`, `pip`, `nvidia-smi` 등 ML 도구 자동 허용.

---

### 패턴 6: Batch 일괄 처리 + 순차 머지

동일 패턴의 작업 여러 건을 한 번에 제출한다.

**적합한 상황:** 모듈별 테스트 추가, 페이지별 컴포넌트 생성, 일괄 리팩토링

```bash
# 방법 A: tasks.txt 파일로 제출
cat > tasks.txt << 'EOF'
# API 엔드포인트별 테스트 추가
tests/auth.test.js — JWT 인증 플로우 테스트 작성
tests/users.test.js — 유저 CRUD API 테스트 작성
tests/products.test.js — 상품 검색/필터 API 테스트 작성
tests/orders.test.js — 주문 생성/조회 API 테스트 작성
EOF

c4 batch --file tasks.txt --auto-mode

# 방법 B: 동일 패턴 N개 워커
c4 batch "src/pages/ 디렉토리의 lint 에러 수정" --count 3

# 대기
c4 wait --all

# 순차 머지
c4 merge batch-1
c4 merge batch-2
c4 merge batch-3
c4 merge batch-4
```

**핵심 포인트:**
- 워커 이름 자동 생성: `batch-1`, `batch-2`, ...
- `maxWorkers` 초과 시 자동 큐잉. 완료된 슬롯에 다음 작업 배정.
- 순차 머지로 충돌 최소화. 같은 파일을 건드리는 작업은 분리.
- `--file`과 `--count`를 혼용하지 말 것.

---

## 데모 시나리오 + 녹화 가이드

### asciinema 설치

```bash
# Linux/macOS
pip install asciinema

# Windows (WSL 또는 Git Bash에서)
pip install asciinema
```

### 추천 데모 시나리오

#### 데모 1: "60초 안에 3개 기능 병렬 구현" (가장 임팩트 있는 시나리오)

핵심 메시지: C4는 하나의 Claude Code 세션으로 여러 작업을 동시에 처리한다.

```bash
# 녹화 시작
asciinema rec demo-parallel.cast -t "C4: 3 Features in 60 Seconds"

# 실제 데모 흐름
c4 daemon start
c4 task feat-auth --auto-mode "src/auth.js에 JWT 미들웨어 구현"
c4 task feat-logger --auto-mode "src/logger.js에 Winston 로거 구현"
c4 task feat-cache --auto-mode "src/cache.js에 Redis 캐시 래퍼 구현"
c4 list                           # 3개 워커 동시 실행 확인
c4 wait --all                     # 전체 완료 대기
c4 read feat-auth                 # 결과 확인
c4 merge feat-auth                # 머지
c4 merge feat-logger
c4 merge feat-cache
git log --oneline -5              # 결과 커밋 확인

# 녹화 종료: Ctrl+D 또는 exit
```

#### 데모 2: "c4 auto — 자고 일어나면 끝" (자율 운영 데모)

```bash
asciinema rec demo-auto.cast -t "C4: Autonomous Overnight Development"

# 설정 확인
cat config.json | grep autonomyLevel
c4 auto "calculator 모듈 구현: add, subtract, multiply, divide. 유닛 테스트. README 업데이트."
c4 list                           # 관리자+워커 자동 생성 확인
c4 watch auto-mgr                 # 실시간 관리자 출력 스트리밍 (Ctrl+C로 종료)
# (시간 경과 후)
cat docs/morning-report.md        # 결과 보고서
```

#### 데모 3: "MCP로 다른 Claude Code에서 C4 제어" (MCP 연동 데모)

```bash
asciinema rec demo-mcp.cast -t "C4: MCP Server Integration"

c4 daemon start
# 다른 Claude Code 세션에서 MCP 도구로 워커 생성
# (MCP 호출 예시를 보여주는 시나리오)
curl -X POST http://localhost:3456/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"send_task","arguments":{"name":"mcp-test","task":"src/hello.js에 Hello World 함수 작성"}}}'
c4 wait mcp-test
c4 read mcp-test
```

### GIF 변환 + README 삽입

```bash
# asciinema → GIF 변환 (agg 사용)
pip install agg
agg demo-parallel.cast demo-parallel.gif --cols 120 --rows 30 --speed 2

# 또는 svg 변환 (더 선명)
cat demo-parallel.cast | svg-term --out demo-parallel.svg --width 120

# README.md에 삽입
# ![C4 Demo](docs/assets/demo-parallel.gif)
```

### asciinema 웹 업로드

```bash
asciinema upload demo-parallel.cast
# 반환된 URL을 README.md에 삽입:
# [![asciicast](https://asciinema.org/a/XXXX.svg)](https://asciinema.org/a/XXXX)
```

---

## MCP 서버 등록 가이드

C4 데몬은 JSON-RPC 2.0 기반 MCP 서버를 내장하고 있다 (엔드포인트: `POST /mcp`). 다른 Claude Code 세션이나 MCP 호환 클라이언트에서 C4를 도구로 호출할 수 있다.

### MCP 도구 목록

| 도구 | 설명 |
|------|------|
| `create_worker` | 새 Claude Code 워커 생성 |
| `send_task` | 워커에 작업 전송 (자동 브랜치/worktree 격리) |
| `list_workers` | 전체 워커 상태 조회 |
| `read_output` | 워커 출력 읽기 (snapshots/now/wait 모드) |
| `close_worker` | 워커 종료 + worktree 정리 |

### Claude Code에서 MCP 서버로 등록

`~/.claude/settings.json`에 다음을 추가:

```json
{
  "mcpServers": {
    "c4": {
      "type": "url",
      "url": "http://localhost:3456/mcp"
    }
  }
}
```

또는 프로젝트 레벨 `.claude/settings.json`에 추가:

```json
{
  "mcpServers": {
    "c4": {
      "type": "url",
      "url": "http://localhost:3456/mcp"
    }
  }
}
```

등록 후 Claude Code에서 MCP 도구로 C4를 호출할 수 있다:
```
> c4 워커를 만들어서 src/utils.js에 함수 추가해
→ Claude Code가 mcp__c4__send_task 도구를 호출
→ C4 데몬이 워커 생성 + 작업 전송
```

### smithery.ai 등록

[smithery.ai](https://smithery.ai)는 MCP 서버 디렉토리다. C4를 등록하면 검색 가능성이 높아진다.

#### 등록 절차

1. **smithery.yaml 작성** (프로젝트 루트에)

```yaml
name: c4
description: "Agent-on-agent orchestrator for Claude Code. Manage multiple Claude Code workers through virtual terminals."
icon: terminal
tags:
  - claude-code
  - agent-orchestrator
  - multi-agent
  - pty
  - terminal
startCommand:
  type: stdio
  configSchema:
    type: object
    properties:
      port:
        type: number
        default: 3456
        description: "C4 daemon port"
    required: []
  commandFunction: |-
    (config) => ({
      command: 'node',
      args: ['src/daemon.js'],
      env: { C4_PORT: String(config.port || 3456) }
    })
```

2. **smithery CLI로 등록**

```bash
npx @anthropic-ai/smithery publish
```

3. **검증**: smithery.ai에서 "c4" 검색하여 등록 확인

#### npm 패키지로 배포

npm에 공개하면 `npx`로 설치 없이 바로 사용 가능:

```bash
# 패키지 게시
npm publish

# 사용자가 설치 없이 실행
npx c4-cli daemon start
```

### 수동 MCP 연결 테스트

```bash
# 데몬 시작
c4 daemon start

# initialize 핸드셰이크
curl -X POST http://localhost:3456/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# 도구 목록 확인
curl -X POST http://localhost:3456/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# 워커 생성 + 작업 전송
curl -X POST http://localhost:3456/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"send_task","arguments":{"name":"mcp-demo","task":"src/hello.js에 greet 함수 작성"}}}'

# 상태 확인
curl -X POST http://localhost:3456/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_workers","arguments":{}}}'
```

---

## Build in Public 방안

### 전략 개요

C4의 개발 과정 자체를 콘텐츠로 활용한다. "AI가 AI를 관리하는 도구를 AI가 만든다"는 내러티브가 핵심.

### 콘텐츠 소스

C4는 이미 콘텐츠 생성에 필요한 데이터를 자동 수집하고 있다:

| 소스 | 경로 | 활용 |
|------|------|------|
| Scribe 요약 | `docs/session-context.md` | 개발 과정 서술 |
| 아침 보고서 | `docs/morning-report.md` | "어젯밤 AI가 한 일" 시리즈 |
| 작업 히스토리 | `history.jsonl` | 정량 데이터 (워커 수, 작업 시간, 토큰 사용량) |
| 실패 사례 | `docs/known-issues.md` | "삽질 기록" 시리즈 |
| 경쟁 분석 | `docs/competitive-analysis.md` | 포지셔닝 콘텐츠 |
| 테스트 시나리오 | `docs/test-scenarios.md` | 기능 소개 자료 |

### 콘텐츠 유형별 채널

#### 1. Twitter/X — 짧은 기술 인사이트

매일 1-2개. Scribe 요약에서 핵심 한 줄을 뽑는다.

포맷:
```
🔧 C4 개발 일지 Day N

오늘 발견: [인사이트]
해결: [접근법]

#ClaudeCode #AgentOrchestration #BuildInPublic
```

예시:
```
🔧 C4 개발 일지 Day 14

관리자 AI가 worker 상태를 확인하려고 c4 list를 324번 호출했다.
해결: c4 wait 전용 명령으로 교체 + 10초 cooldown 캐시.

LLM은 명시적 금지 없이는 같은 명령을 무한 반복한다.

#ClaudeCode #MultiAgent #BuildInPublic
```

#### 2. dev.to / Zenn — 기술 블로그

주 1회. 특정 주제를 깊게 다룬다.

추천 주제:
- "AI가 AI를 관리할 때 생기는 문제들" (known-issues 기반)
- "Git Worktree로 멀티 에이전트 파일 충돌 해결하기"
- "5단계 자율성 레벨: 완전 수동에서 완전 자율까지"
- "PTY vs Screen Capture: 왜 텍스트가 이미지보다 나은가"
- "Claude Code Hook으로 AI 에이전트 행동 감시하기"
- "Recursive C4: AI가 AI 관리자를 관리하는 구조"

#### 3. GitHub Discussions / Reddit — 커뮤니티

주 1-2회. 사용 사례, Q&A, 피드백 수집.

채널:
- `r/ClaudeAI` — Claude 사용자 커뮤니티
- `r/LocalLLaMA` — 로컬 AI 도구 관심 커뮤니티
- GitHub Discussions — 프로젝트 내 토론

#### 4. YouTube / Loom — 데모 영상

월 1-2회. asciinema 녹화를 활용하거나 화면 녹화.

추천 영상:
- "C4 in 3 Minutes" — 빠른 소개
- "Overnight AI Development with c4 auto" — 야간 무인 개발 데모
- "Managing 5 Claude Code Workers Simultaneously" — 병렬 워커 데모

### Scribe 기반 자동화 파이프라인

Scribe가 생성하는 `session-context.md`를 파싱하여 콘텐츠를 반자동 생성한다.

```
Scribe 스캔 (5분마다)
  → session-context.md 업데이트
  → 핵심 결정/에러/해결 추출
  → 포스트 초안 생성 (수동 또는 Claude API)
  → SNS 포스팅 (수동 검토 후)
```

구현 아이디어:

1. **PostCompact hook 확장** — compact 이벤트 발생 시 session-context.md의 새 항목을 `docs/posts/` 디렉토리에 초안으로 저장

2. **c4 status 연동** — 워커 완료 알림을 Slack 뿐 아니라 Twitter Bot으로도 전송

3. **morning-report 파싱** — 아침 보고서에서 "완료 N건, 실패 M건" 정량 데이터를 추출하여 주간 리포트 자동 생성

### 콘텐츠 일정 템플릿

| 요일 | 채널 | 콘텐츠 유형 |
|------|------|-------------|
| 월 | Twitter/X | 주말 개발 요약 |
| 화 | - | (개발 집중) |
| 수 | Twitter/X | 기술 인사이트 1줄 |
| 목 | dev.to/Zenn | 주간 기술 블로그 |
| 금 | Twitter/X | 주간 정량 리포트 (워커 N개, 커밋 M건) |
| 토-일 | GitHub | Discussion 답변, Issue 정리 |

### 핵심 내러티브

C4의 Build in Public에서 반복해야 할 메시지:

1. **"Agent-on-Agent"** — AI가 AI를 관리하는 구조는 단일 에이전트의 한계를 넘는다
2. **"npm install 하나로 시작"** — Docker도 클라우드 VM도 불필요. 경량 로컬 도구
3. **"시켜놓고 자면 아침에 결과만"** — 완전 무인 야간 개발의 현실
4. **"삽질의 기록"** — 실패 사례를 투명하게 공유하여 신뢰 구축
5. **"Claude Code 생태계 확장"** — Claude Code의 힘을 증폭시키는 도구

---

## 참고 문서

- [test-scenarios.md](test-scenarios.md) — 테스트 시나리오 11종
- [competitive-analysis.md](competitive-analysis.md) — 경쟁 도구 비교 분석
- [known-issues.md](known-issues.md) — 실패 사례 기록
- [troubleshooting.md](troubleshooting.md) — 일반 운영 문제 해결
- [config-reference.md](config-reference.md) — 설정 항목 상세
