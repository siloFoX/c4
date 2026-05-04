# Multi-Specialist System — Design Doc

> Status: **draft / discussion**
> Owner: 사용자 + assistant 협의 (2026-05-03 세션)
> Scope: c4가 단일 manager/worker 이분법을 넘어, 회사형 유기체(전문가 풀 + 회의 + 위키 + 자가 개선 루프)로 진화하는 설계.
> Code is **NOT** changed by this doc. This is the alignment artifact before any implementation lands.

---

## 1. Vision

c4는 현재 manager(오케스트레이션) + worker(코드 작성) 이분법으로 동작한다.
다음 단계에서 **하나의 회사처럼** 움직이는 유기체로 확장한다:

- **요구 발굴 → 설계 → 구현 → 리뷰 → 감사 → 테스트 → 배포 → 문서화** 의 단계 파이프라인
- 단계마다 **on-demand specialist** 가 소집되는 dispatch 모델
- 각 specialist 는 **brain (LLM backend) 교체 가능** — Claude Code / Codex / Gemini / 로컬 LLM
- 작업 후 **회고 미팅 + 투표** 로 next-time 재선임 가중치 학습 (auto-feedback)
- **위키** 가 회사 기억 — 이전 결정 / ADR / 회의록 / post-mortem 누적, 미팅이 zero-base 시작 안 함
- 위키 페이지의 **"Reopen this decision"** 으로 재안건 트리거 → 새 미팅 spawn

> 회사가 일하는 방식을 그대로 대입했을 때 자연스러운 흐름을 그대로 따라가는 게 목표.
> 새로운 추상 발명보다, 회사 운영에서 검증된 패턴을 LLM 환경에 녹임.

---

## 2. Architecture — three pillars

```
┌─────────────────────────────────────────────────────────────────┐
│                        Coordination Layer                       │
│  Dispatcher  ·  Meeting Orchestrator  ·  Retro/Feedback Loop    │
└────────────┬───────────────────┬────────────────┬───────────────┘
             │                   │                │
   ┌─────────▼──────────┐ ┌──────▼─────────┐ ┌────▼───────────┐
   │ Specialist         │ │ Brain Layer    │ │ Memory / Wiki  │
   │ Registry           │ │ (Adapter)      │ │                │
   │                    │ │                │ │ - ADR pages    │
   │ - id, tier, domain │ │ - claude-code  │ │ - meeting min. │
   │ - system_prompt    │ │ - codex        │ │ - retros       │
   │ - triggers         │ │ - gemini       │ │ - search-then- │
   │ - deliverables     │ │ - local-*      │ │   fetch        │
   │ - score_by_domain  │ │ - mock         │ │ - reopen action│
   └────────────────────┘ └────────────────┘ └────────────────┘
```

세 기둥:
1. **Specialist Registry** — 누가 일할 수 있는지 카탈로그
2. **Coordination Layer** — 누구를 부르고, 어떻게 회의시키고, 어떻게 평가할지
3. **Memory / Wiki** — 무엇을 기억하고, 어떻게 다음 회의에 가져올지

---

## 3. Specialist Registry

### 3.1 Schema (sketch)

```jsonc
{
  "id": "backend-engineer",                    // unique key
  "displayName": "Backend Engineer",
  "tier": "implement",                          // pipeline stage
  "domain": ["backend", "api", "data-flow"],    // multi-domain ok
  "brain": {
    "adapter": "claude-code",                   // which adapter
    "model": "sonnet",                          // model hint
    "effort": "high"
  },
  "systemPrompt": "[Role: Backend Engineer] ...",
  "triggers": {                                 // dispatcher hints
    "keywords": ["api", "endpoint", "schema", "migration"],
    "stages": ["design", "implement", "review"]
  },
  "deliverables": [
    "API design diff",
    "implementation patch",
    "migration script"
  ],
  "score": {                                    // updated by retro
    "by_domain": { "backend": 0.84, "data": 0.71 },
    "by_stage":  { "implement": 0.82, "design": 0.65 },
    "samples":   { "backend": 23, "data": 9 },
    "lastUpdated": "2026-05-03T..."
  }
}
```

### 3.2 Seed list (10–15 starter specialists)

| id                      | tier        | domain                  | 비고 |
|-------------------------|-------------|-------------------------|------|
| `pm`                    | meeting     | scope, users, metrics   | 요구·우선순위 |
| `architect`             | design      | system, integration     | 큰 그림 결정 |
| `ux-designer`           | design      | ui, ux, a11y            | UI 변경 시 |
| `backend-engineer`      | implement   | backend, api, data-flow | 서버측 |
| `frontend-engineer`     | implement   | ui, web, react          | 클라이언트 |
| `dba`                   | implement   | data, schema, migration | DB 작업 시 |
| `devops-sre`            | deploy      | infra, ci, rollback     | 배포·관측 |
| `code-reviewer`         | review      | quality, idioms         | 코드 정합성 |
| `security-auditor`      | audit       | secret, authn, supply   | 비가역·민감 작업 |
| `qa-engineer`           | test        | edge cases, regression  | 테스트 시나리오 |
| `tech-writer`           | docs        | docs, examples          | 변경 후 문서 |
| `network-engineer`      | implement   | networking, protocols   | 통신 작업 시 |
| `low-level-engineer`    | implement   | systems, perf, kernel   | 하부 |

**가이드라인**:
- 너무 많이 깔지 말 것 — dispatcher 자체가 헷갈림. 시드 10–15가 적정.
- 추가 specialist 는 사용자가 운영하면서 부족한 영역이 발견될 때 점진 추가.
- 각 specialist 의 `systemPrompt` 는 처음부터 완벽 X — 운영 중 retro 피드백으로 자동 iterate (advanced, follow-up).

### 3.3 Specialist 추가/수정 governance

조직 메타-결정. 사용자 결정(2026-05-03): **미팅 합의로도 specialist 추가 가능**.

추가/수정 절차:

1. **누가 trigger 하나**
   - 사용자 직접 (`c4 specialist add ...` 같은 CLI)
   - 또는 미팅 중 어느 specialist 가 "이 영역은 우리 중에 적임자 없음 — 새 specialist 필요" 라고 제안

2. **승인 게이트** (자가 증식 안전장치)
   - 미팅 합의: 참여 specialist 중 거부권 role(`security-auditor`, `sre`) 0 명 거부 + 단순 다수 찬성
   - 새 specialist 의 초안 system_prompt + tier + domain 은 제안 specialist 또는 `tech-writer` 가 작성
   - 추가 후 첫 N건(예: 3건)은 **probation** 상태 — exploration budget 와 별개로 슬롯 확보, 신뢰구간 좁아질 때까지 가중치 보수적

3. **삭제/수정**
   - 같은 게이트로 가능
   - 단, 거부권 role 본인의 거부권 박탈은 사용자 명시 승인 필요 (self-modification 방지)

4. **감사 추적**
   - 모든 추가/수정/삭제는 `~/.c4/specialist-audit.jsonl` 에 누적 로그
   - 누가/언제/왜/어느 미팅에서 의결 — 회사처럼 인사 기록 남김
   - actions: `add`, `remove`, `import`, `score-applied`,
     `prompt-revised`, `tags-updated` (§11 Phase 6 참조)

> 이 governance 자체도 §10 결정 처럼 doc 변경으로 진화 — 운영 중 룰 부족 발견되면 ADR + §10 신규 row.

**구현 상태 (2026-05-04)** — `proposeSpecialist()` 모듈 + `POST /specialists/propose` HTTP route + `c4 specialist propose` CLI 로 정식 시행. meta-meeting 의 consensus 가 거부 0 + accept ≥ 1 일 때 `registry.add()` 가 `actor: 'proposal'` + `meetingId` + `reason: 'meeting consensus'` 와 함께 호출되어 audit log 에 기록됨.

---

## 4. Brain Layer (이미 존재)

c4 의 [`docs/agent-framework.md`](agent-framework.md) 가 이미 7 개 adapter 를 지원:

| key                | shape       | use case                       |
|--------------------|-------------|--------------------------------|
| `claude-code`      | PTY-binary  | production Claude Code CLI     |
| `codex`            | PTY-binary  | OpenAI codex CLI               |
| `local-ollama`     | HTTP-stream | self-hosted Ollama             |
| `local-llama-cpp`  | HTTP-stream | llama.cpp server               |
| `local-vllm`       | HTTP-stream | vLLM server                    |
| `claude-agent-sdk` | DI-callable | Anthropic Agent SDK            |
| `mock`             | in-memory   | test fixture                   |

본 시스템에서 brain 교체는 **registry 의 `brain.adapter` 필드만 바꾸면 끝**. 새 코드 거의 불필요 — 기존 framework 그대로 재사용.

확장 후보: `gemini-cli`, `chatgpt-api`, `bedrock-*`. 각 adapter 추가는 framework 컨트랙트만 따르면 되므로 specialist 시스템 자체와는 독립.

---

## 5. Dispatcher

### 5.1 Inputs
- task description (free text)
- current stage (`meeting` | `design` | `implement` | …)
- 가용 specialist 리스트 (registry)
- track (`lightweight` | `full` — §6 참조)

### 5.2 Selection logic (hybrid)

```
1. Rule-based pre-filter
   - tier match (현재 단계와 specialist.tier 일치)
   - domain match (task 키워드와 specialist.domain 교집합)
   → 후보 N명

2. Score-weighted ranking
   - per-domain score 가중치 적용 (낮은 sample_count 는 신뢰구간 보정)

3. Exploration budget
   - top-K 외에 1~2 명 의도적으로 "rank 낮은 specialist" 포함
   - 신규/저득점 specialist 회복 채널 보장

4. Cap by track
   - lightweight: 1명 (DRI 모델)
   - full: tier 별 1명씩 (보통 4~6명)
```

### 5.3 LLM router fallback

룰만으로 결정 모호한 경우(예: "이 변경이 backend 인지 infra 인지 애매"), router LLM 한 번 더 호출해서 specialist set 결정. 토큰 예산 예측 가능하도록 router 호출은 1회/dispatch 로 제한.

---

## 6. Pipeline Stages & Tracks

### 6.1 Stages

`회의 → 설계 → 구현 → 리뷰 → 감사 → 테스트 → 배포 → 문서`

각 stage 는 입력/출력 정형화:

| stage    | 입력                  | 출력                           |
|----------|-----------------------|--------------------------------|
| meeting  | feature request       | scope card (problem/users/risks) |
| design   | scope card            | ADR + interface sketch         |
| implement| ADR                   | code patch                     |
| review   | code patch            | review comments / approval     |
| audit    | code patch + threat   | security report                |
| test     | code patch + spec     | test plan + run result         |
| deploy   | approved patch        | deployment plan + rollback     |
| docs     | merged change         | wiki update + user-facing docs |

### 6.2 Tracks

Modern 개발은 **tier 모델** 이 현실적:

| track       | trigger                              | 거치는 stage           | dispatcher cap |
|-------------|--------------------------------------|-----------------------|----------------|
| lightweight | bug fix / one-line / typo            | implement → review    | 1~2명 (DRI)    |
| standard    | normal feature                       | design → impl → review → test → docs | 3~5명 |
| full        | architectural / 비가역 / 보안 영향   | 전 stage              | 6~8명          |

> 모든 작업이 full 트랙으로 돌면 1줄 fix 가 마라톤이 됨.
> 시작 단계에서 트랙 분류기(rule + 사용자 force flag)를 박는 게 안 망하는 핵심.

---

## 7. Meeting Mechanics

### 7.1 합의 정의

순수 만장일치는 deadlock 위험. 실용 모델:

- **Consensus**: 모든 selected specialist 가 "object | accept" 의견 제출, **objector 0명** = 통과
- **Veto roles**: `security-auditor` 같은 일부 role 만 거부권 보유 (compliance)
- **Quorum**: 단순 다수 (lightweight 트랙용)

→ 트랙별 정책 다름:
- lightweight: DRI 단독 결정
- standard: quorum (다수)
- full: consensus + security-auditor 거부권

### 7.2 Circuit breaker (필수)

```
- 라운드 N=3 도달 시 미합의면 → 인간 escalation
- 한 specialist 가 같은 반박 2회 반복 → "speak once more" 경고 → 3회면 mute
- 회의 토큰 budget 초과 → summary + 강제 종료
```

### 7.3 Interrupt 권한

- 발언 큐 + 한 발언당 토큰 budget
- "지금 끼어들 가치 있는 정보" 만 인터럽트 허용 (LLM self-judge 기반 우선순위)
- code-write 단계 진입 후에는 interrupt 비활성 — 그 시점 인터럽트는 비싸짐 (PR comment 로 강등)

### 7.4 Context 3 layer

```
┌─────────────────────────────────────┐
│ Layer A: 전체 결정 로그              │ ← 모든 agent 공유
│  - scope card, ADR, 합의된 결정       │   (compact summary)
├─────────────────────────────────────┤
│ Layer B: 페어와이즈 Q&A              │ ← 두 agent 간 직접 대화
│  - architect ↔ dba 의 schema 토론     │   (둘만 공유)
├─────────────────────────────────────┤
│ Layer C: agent 내부 노트             │ ← 본인만
│  - chain-of-thought, draft           │
└─────────────────────────────────────┘
```

`Layer A` 만 공유로 가야 8 agent × N 라운드 토큰 폭발 안 남.

---

## 8. Retro & Auto-Feedback Loop

### 8.1 Trigger

- lightweight 트랙: retro 생략 (작업 < 회고 비용)
- standard / full 트랙: 작업 완료 후 retro 미팅 자동 spawn

### 8.2 Signals (outcome-grounded 우선)

순서대로 가중:

1. **Outcome signal** (가장 강함)
   - 코드가 실제로 동작했나? (테스트 통과율)
   - 리뷰가 진짜 버그를 잡았나? (post-merge 회귀 발생 여부)
   - 설계가 재작업 없이 살았나? (ADR revisit count)

2. **Process signal**
   - 합의 라운드 수 (적을수록 좋음, 단 너무 적으면 무비판 의심)
   - 인터럽트 활용도 (적절한 시점에 들어왔나)

3. **Peer signal** (가장 약함, sycophancy 방지용 가중치 ↓)
   - 미팅 참여 specialist 들의 상호 평가

### 8.3 Bias 방지

- **Per-domain 점수** — 글로벌 score X. DBA 는 DB 태스크에서만 잘하는 게 정상.
- **Confidence interval** — sample 적은 specialist 는 점수 변동성 크게 (Wilson score 등)
- **Exploration budget** — dispatcher 가 매 회 N% (예: 15%) slot 을 의도적으로 rank 낮은 specialist 에 할당
- **Decay** — 최근 N건만 가중, 오래된 retro 는 가중치 감쇠 (역량 변화 반영)

### 8.4 System prompt 자동 iterate (advanced, follow-up)

같은 specialist 가 같은 도메인에서 반복 저득점 → retro 가 system prompt 개선안 제출 → 사람 검토 후 반영.

**구현 상태 (2026-05-04)** — Phase 5 follow-up 으로 두 단계 모두 시행됨:

1. *Suggest* — `POST /specialists/:id/suggest-prompt` (review-only).
   `analyzeSpecialist()` 가 weak buckets 식별 → brain 에게 revision
   draft 요청 → REVISION/RATIONALE 블록 파싱 → return. Daemon 은 절대
   자동 적용 X.
2. *Apply via consensus* — `POST /specialists/:id/prompt-apply`.
   suggest path 결과를 meta-meeting 에 올림 → consensus 시
   `registry.updatePrompt()` 호출 + audit log
   `action: 'prompt-revised'`. veto-holder 단독 거부도 차단됨.

`updatePrompt()` 는 `[Role: ...]` prefix 보존 강제 + 동일 prompt
시 idempotent no-op + 감사 entry 의 `before` 에 이전 prompt 보존.

---

## 9. Wiki / Institutional Memory

### 9.1 저장 형식

**markdown-in-git** 채택, **별도 repo `c4-wiki`** 로 분리 (사용자 결정 2026-05-03).

- repo: `c4-wiki` (siloFoX/c4-wiki) — c4 본 repo 와 분리
- versionable, diff 가능, git revert 로 의사결정 롤백 가능
- 분리 이유: 위키 변경량이 코드 변경량보다 빠르게 늘어나서 main repo 히스토리 노이즈 됨, 위키만 별도 권한/CI/검색 인프라 붙이기 용이
- c4 데몬은 `config.wiki.path` 로 c4-wiki clone 위치 가리킴 (default: `~/.c4/wiki`)
- 외부 시스템 연동(Notion MCP / Confluence) 은 follow-up — 초기엔 markdown-in-git 만

### 9.2 페이지 종류

> 경로는 c4-wiki repo root 기준.

| 종류              | 경로 패턴                       | 작성자                |
|-------------------|---------------------------------|----------------------|
| ADR (decision)    | `adr/0042-<slug>.md`            | architect 가 미팅 후 |
| 회의록 (minutes)  | `meetings/<date>-<slug>.md`     | meeting orchestrator |
| Retro             | `retros/<date>-<slug>.md`       | retro orchestrator   |
| Specialist profile| `specialists/<id>.md`           | tech-writer + retro  |
| 일반 문서          | `docs/...`                      | tech-writer          |

### 9.3 메타데이터

각 페이지 frontmatter:

```yaml
---
title: "Switch to event-sourced audit"
type: adr
status: accepted | superseded | reopened
last_reviewed: 2026-05-03
superseded_by: adr/0058-event-stream-v2.md
related: [adr/0021, meetings/2026-04-30-audit-rebuild]
---
```

`status: superseded` 면 dispatcher 가 자동으로 stale 표시 — 신규 미팅에 stale ADR 를 컨텍스트로 주지 않음.

### 9.4 Search-then-fetch

미팅 시작 시:

1. orchestrator 가 task 키워드로 wiki 검색 (간이 grep + tag 매칭, 추후 BM25/embedding)
2. top-K (예: 5) 페이지 메타만 반환
3. specialist 가 필요한 페이지를 골라서 본문 요청 (lazy fetch)
4. 페이지 본문은 Layer A (공유) 에 들어감

→ 위키 전체를 컨텍스트에 주입하지 않음. 토큰 예산 예측 가능.

### 9.5 Reopen 액션

위키 페이지의 "Reopen this decision" 버튼/CLI:

```
1. 그 페이지 + 직접 related 페이지 + 영향 받은 코드 영역(grep)을
   초기 컨텍스트로 묶음
2. dispatcher 호출 — 원래 결정의 stage 와 관련 specialist 들 소집
3. 기존 페이지는 status: reopened 로 표시
4. 새 회의 결과로 새 ADR 생성 → 옛 ADR 의 superseded_by 갱신
```

회사가 작년 결정 다시 들춰서 재논의하는 그 흐름 그대로.

---

## 10. Resolved decisions (2026-05-03)

| #  | 항목                       | 결정                                                                 | 비고 |
|----|----------------------------|----------------------------------------------------------------------|------|
| 1  | 위키 위치                  | **별도 repo `c4-wiki`**                                              | §9.1 반영 |
| 2  | Track 자동 분류기           | **hybrid** — 자동 추천(rule + LLM) + 사용자 override 가능              | §6.2 |
| 3  | Specialist 추가 권한        | **미팅 합의로 추가 가능** (사용자 단독뿐 아니라 시스템 자가 증식 허용) | §3.3 신설 |
| 4  | Retro score 적용 주기       | **즉시 반영 + decay** (오래된 retro 가중치 감쇠)                       | §8.3 (이미 decay 항목 있음) |
| 5  | 거부권 가진 role            | **`security-auditor` + `sre`** (prod 배포 비가역 영역)                 | §7.1 |
| 6  | 위키 외부 연동              | **시작은 안 함** — markdown-in-git 만, 외부 sync(Notion/Confluence) follow-up | §9.1 |
| 7  | 시드 specialist 13개        | **§3.2 표 그대로 시작**, 운영 중 공백 발견 시 §3.3 governance 통해 추가 | §3.2 |

위 결정으로 doc 잠금. 추가 변경은 본 §10 에 신규 row 누적 + 해당 섹션 동기화.

---

## 11. 단계별 구현 순서 (제안)

```
Phase 1 (foundation, ~1주)
  - Specialist Registry 스키마 확정 + seed JSON 작성
  - Brain 필드 매핑 (existing adapter framework 재사용)
  - 단순 dispatcher (rule-based pre-filter only, no scoring yet)

Phase 2 (meeting MVP, ~1주)
  - Track 분류기 (lightweight/standard/full)
  - Layer A context 공유 메커니즘
  - Circuit breaker (라운드 cap, 토큰 budget)
  - 합의 정책 (트랙별)

Phase 3 (memory, ~1주)
  - wiki/ 디렉토리 구조 + frontmatter 컨벤션
  - Search-then-fetch (간이 grep 기반)
  - ADR / 회의록 자동 생성

Phase 4 (feedback loop, ~1주)
  - Retro 미팅 자동 spawn
  - Outcome signal 수집 (테스트 통과율 등)
  - Per-domain score 누적

Phase 5 (advanced, follow-up)
  - LLM router fallback
  - Reopen 액션
  - System prompt auto-iterate
  - 외부 위키 연동 (Notion/Confluence)

Phase 6 (operator polish, shipped 2026-05-04 — v1.10.256~v1.10.274)
  Phase 1.5 — proposeSpecialist via meta-meeting consensus
              (POST /specialists/propose; 미팅 합의 통한 governance add)
  Phase 1.6 — specialist tags 필드 + 전체 lifecycle
              (PATCH /specialists/:id/tags edit, list/export ?tag&?domain
               필터, AND-compose semantics 모든 surface 통일)
  Phase 5.2 — applyPromptRevision: brain draft → meta-meeting →
              consensus 시 registry.updatePrompt() 자동 적용
              (POST /specialists/:id/prompt-apply, action 'prompt-revised')
  Phase 6.2 — global meetings SSE (GET /meetings/stream): all-meetings
              live state aggregator로 web UI 단일 connection 가능
  Phase 6.3 — meeting fork: replan / reuse 모드 + forkOf 체인
              (POST /meetings/:id/fork)
  Phase 6.4 — workflow 'meeting' node type: workflow run에서 meta-meeting
              spawn → consensus 결과를 다음 노드의 prev로 흘려보냄
  Phase 6.5 — action-items extractor: transcript의
              [DECISION]/[ACTION]/[TODO]/[BLOCKER] 마커 → 구조화 list
              (GET /meetings/:id/action-items + wiki ## Action Items 섹션
               자동 생성)
  Phase 6.6 — track classifier preview (GET /meetings/classify-track):
              task 문구가 어느 track으로 분류되는지 + 매칭 키워드 + reason
  Phase 6.7 — bulk wiki publish-all: terminal meeting 일괄 발행
              (POST /wiki/publish-all, idempotent + --force)
  Phase 6.8 — specialist describe enrichment:
              GET /specialists/:id?include=audit,scoreHistory,meetings
  Phase 6.9 — meeting lineage: forkOf 체인 walk
              (GET /meetings/:id/lineage)
  Phase 6.10 — meeting recap combo: status + per-stage consensus +
               first-turn + actions in 단일 envelope
               (GET /meetings/:id/recap)
  Phase 6.11 — meeting list 필터 강화: ?track ?since ?limit + createdAt
               desc 정렬 + forkOf 응답 필드
  Phase 6.12 — wiki related-pages auto-derive: transcript scan으로
               frontmatter related[] 자동 생성 (markdown links + meeting
               ids + ADR refs)

Phase 7 (persistent backend, shipped 2026-05-04 — v1.10.282~v1.10.289)
  Phase 7.1 — MeetingPersist SQLite 모듈 (better-sqlite3, WAL,
              schema decoupled via JSON `data` column, save/load/
              loadAll/listByStatus/count/remove API)
  Phase 7.2 — MeetingStore save 훅: put / state 이벤트 / remove 시
              persist 자동 기록. 재-put idempotent. Memory store 와
              persist 분리 (clear()는 디스크 안 건드림)
  Phase 7.3 — boot rehydrate: MeetingSession.fromJSON() 팩토리 +
              MeetingStore.rehydrate() — 데몬 hard restart 후에도
              미팅 상태(status / transcripts / votes / escalations
              / stage cursor) 그대로 복구. Phase 7 의 핵심 페이오프.
  Phase 7.5 — pruneOlderThan({days, terminalOnly, dryRun}): 기본
              90일 + terminal-only. 트랜잭션으로 묶음. POST
              /meetings/prune-old + c4 meeting prune-old.
  Phase 7.6 — visibility: GET /specialists/summary 응답에
              persist:{enabled, dbPath, dbSizeBytes, rowCount}
              추가. c4 specialist summary 출력에 persist 라인.
              follow-up: prune --vacuum 옵션 (DELETE 후 SQLite
              VACUUM + WAL checkpoint TRUNCATE 로 실제 파일 축소).
  Phase 7.7 — integrity check: PRAGMA integrity_check 통한 DB 손상
              감지. c4 doctor 가 매 헬스 패스마다 호출 → "persist:
              integrity OK (N row(s), XX.YKB)" 또는 INTEGRITY
              FAILED 보고.
  Phase 7.8 — hot backup: VACUUM INTO 기반 데몬-라이브 백업.
              POST /meetings/persist-backup + c4 meeting backup
              --out path.db. Point-in-time consistent (트랜잭션
              read snapshot), 기존 target 덮어쓰기 거부 (operator
              가 의도적으로 cleanup).

  → Phase 7 종료 시점에서 c4 의 persistent backend 가 운영 완비:
    save / load / visibility / cleanup / health / backup 6 axis 다
    operator-facing CLI + HTTP 로 노출됨. SQLite 파일 한 개에
    의존 (외부 DB 서비스 0). 일반 사용자 install 시나리오 유지.
```

각 phase 끝나면 동작하는 스라이스 — 점진 배포, 한 번에 전부 구현 X.

---

## 12. 비고

- 본 문서는 **alignment artifact**. 코드 변경 0줄.
- 사용자 합의 후 phase 1 부터 별도 패치로 진행.
- 본 문서 자체가 첫 wiki 페이지의 archetype — frontmatter 등 컨벤션은 여기서 도출.
