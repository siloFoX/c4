# Claude Code --worktree vs C4 Worktree 비교 검토

> 작성일: 2026-04-16 (TODO 5.9)

## 목차

1. [배경](#배경)
2. [Claude Code 네이티브 worktree](#claude-code-네이티브-worktree)
3. [C4 worktree 구현](#c4-worktree-구현)
4. [기능 비교표](#기능-비교표)
5. [병합 가능 영역](#병합-가능-영역)
6. [C4 고유 장점 (대체 불가)](#c4-고유-장점-대체-불가)
7. [결론 및 권장사항](#결론-및-권장사항)

---

## 배경

Claude Code v2.0.60+에서 `--worktree` 플래그와 Agent 도구의 `isolation: "worktree"` 파라미터가 도입되었다. C4는 1.12부터 자체 git worktree 관리를 구현해 왔다. 이 문서는 네이티브 기능이 C4의 worktree를 대체할 수 있는지, 어떤 부분이 병합 가능하고 어떤 부분이 C4 고유인지 평가한다.

---

## Claude Code 네이티브 worktree

### 사용법

```bash
# CLI에서 worktree 생성 + 세션 시작
claude --worktree feature-auth

# 자동 이름 생성 (bright-running-fox 같은 형태)
claude --worktree

# tmux 연동
claude --worktree feature-auth --tmux
```

### Agent 도구 isolation

```typescript
// 서브에이전트에 worktree 격리 적용
Agent({
  description: "Refactor auth module",
  prompt: "...",
  isolation: "worktree"
})
```

에이전트 프론트매터(.claude/agents/my-agent.md)에서도 지정 가능:

```yaml
---
name: my-agent
isolation: worktree
---
```

### 생성 위치 및 브랜치

| 항목 | 값 |
|------|------|
| 경로 | `<repo>/.claude/worktrees/<name>/` |
| 브랜치 | `worktree-<name>` |
| 베이스 | `origin/HEAD` (remote default branch) |
| 베이스 변경 | `git remote set-head origin -a` 또는 WorktreeCreate hook |

### 라이프사이클

1. **생성**: `--worktree` 또는 `isolation: "worktree"` 지정 시 자동 생성
2. **실행**: 격리된 worktree 내에서 모든 파일 조작/bash 실행
3. **정리**:
   - 변경 없음 → worktree + 브랜치 자동 삭제
   - 변경 있음 → 유지 (사용자에게 keep/remove 프롬프트)
   - cleanupPeriodDays (기본 30일) 이후 자동 정리

### Hook 커스터마이징

```json
{
  "hooks": {
    "WorktreeCreate": [{
      "hooks": [{
        "type": "command",
        "command": "custom-worktree-setup.sh"
      }]
    }],
    "WorktreeRemove": [{
      "hooks": [{
        "type": "command",
        "command": "custom-worktree-cleanup.sh"
      }]
    }]
  }
}
```

- WorktreeCreate: stdin으로 JSON(base_directory, worktree_name, worktree_path) 수신, stdout으로 경로 반환
- WorktreeRemove: 정리 시 호출, 실패해도 삭제는 진행

### .worktreeinclude

gitignore된 파일(.env 등)을 worktree에 자동 복사:

```text
.env
.env.local
config/secrets.json
```

### 세션 재개

```bash
# 메인 repo 디렉토리에서 worktree 세션 재개 가능
claude --resume auth-refactor
```

### 제한사항

- 베이스 브랜치를 CLI 플래그로 지정 불가 (git 명령 또는 hook 필요)
- 서브에이전트가 다른 서브에이전트를 스폰할 수 없음 (1단계 제한)
- agent teams + isolation: "worktree" 조합 시 silent failure 버그 (GitHub #37549)
- 내장 cleanup 명령 없음 (git worktree remove 직접 사용)
- 태스크 큐, 작업자 간 조율, 헬스체크 없음

---

## C4 worktree 구현

### 핵심 코드 (pty-manager.js)

| 메서드 | 위치 | 역할 |
|--------|------|------|
| `sendTask()` | L961-998 | worktree 생성 → settings 주입 → worker 스폰 |
| `_detectRepoRoot()` | L1586-1598 | projectRoot / config / git rev-parse 폴백 |
| `_worktreePath()` | L1601-1603 | `../c4-worktree-{name}` 경로 계산 |
| `_createWorktree()` | L1605-1638 | 생성 + stale 정리 + hooks 적용 |
| `_removeWorktree()` | L1640-1664 | 삭제 + prune + fs.rmSync 폴백 |
| `_isWorktreeDirty()` | L1671-1682 | `git status --porcelain`으로 dirty 상태 확인 |
| `_writeWorkerSettings()` | L1573-1579 | worktree별 .claude/settings.json 생성 |
| `_buildWorkerSettings()` | L1440-1568 | permissions + hooks + profiles 조합 |
| `_cleanupLostWorktrees()` | L1700-1837 | 2-pass orphan 감지 + dirty-state 안전 정리 |
| `close()` | L3869-3908 | worktree 삭제 + 브랜치 삭제 + worker 정리 |

### 생성 위치 및 브랜치

| 항목 | 값 |
|------|------|
| 경로 | `<repo>/../c4-worktree-<name>` (sibling 디렉토리) |
| 브랜치 | `c4/<name>` (커스텀 가능: `--branch`) |
| 베이스 | 현재 HEAD (main) |
| 설정 | config.worktree.enabled / projectRoot |

### 라이프사이클

1. **생성** (sendTask, L961-998):
   - repo root 감지 → stale worktree 정리 → `git worktree add` → hooks 적용
   - `.claude/settings.json` 자동 생성 (permissions + PreToolUse/PostToolUse hooks)
   - worker PTY를 worktree cwd로 스폰

2. **실행**:
   - worker가 격리된 worktree에서 독립 작업
   - hook으로 daemon에 실시간 이벤트 전달 (tool_use, errors, progress)
   - healthCheck에서 주기적 alive 체크
   - scope-guard로 파일/명령 스코프 이탈 감지

3. **정리** (close, L3869-3908):
   - `git worktree remove --force` → prune → fs.rmSync 폴백
   - `git branch -D c4/<name>` 브랜치 삭제
   - dirty 상태면 보존 + Slack 알림

4. **고아 정리** (_cleanupLostWorktrees, L1700-1837):
   - Pass 1: `c4-worktree-*` 디렉토리 스캔
   - Pass 2: `git worktree list --porcelain` 파싱
   - dirty 상태: 보존 + `[LOST DIRTY]` 알림
   - clean 상태: git remove + filesystem 삭제

### 자동 주입되는 settings.json 구조

```json
{
  "permissions": {
    "allow": ["npm test", "git status", "..."],
    "deny": ["rm -rf /", "git push --force", "..."]
  },
  "hooks": {
    "PreToolUse": [
      { "compound-command-blocker": "&&, |, ; 감지 시 경고" },
      { "daemon-hook": "tool_use 이벤트를 daemon에 POST" }
    ],
    "PostToolUse": [
      { "daemon-hook": "tool_result를 daemon에 POST" }
    ],
    "PostCompact": [
      { "context-reload": "session-context.md 재주입" }
    ]
  }
}
```

---

## 기능 비교표

| 기능 | Claude Code --worktree | C4 worktree |
|------|:---------------------:|:-----------:|
| **기본 격리** | | |
| worktree 생성 | O | O |
| 브랜치 자동 생성 | O (`worktree-<name>`) | O (`c4/<name>`) |
| 병렬 worktree | O | O |
| dirty 상태 보존 | O (프롬프트) | O (자동 + 알림) |
| **설정/권한** | | |
| .claude/settings.json 자동 생성 | X (부모 상속) | O (역할별 프리셋) |
| PreToolUse hook 자동 삽입 | X | O (복합 명령 차단 등) |
| 권한 프로파일 (web/ml/infra) | X | O |
| autonomyLevel (L0-L4) | X | O |
| **라이프사이클 관리** | | |
| 고아 worktree 자동 감지 | X (수동 정리) | O (2-pass 스캔) |
| dirty-state 안전 정리 | 부분 (프롬프트) | O (보존 + Slack 알림) |
| healthCheck 연동 | X | O (alive 체크 + 자동 재시작) |
| worktree prune 자동화 | X | O |
| **브랜치 관리** | | |
| main 보호 hook | X | O (pre-commit hook) |
| close 시 브랜치 자동 삭제 | X | O |
| 관리자만 merge 허용 | X | O (c4 merge) |
| **오케스트레이션** | | |
| 태스크 큐잉 | X | O |
| 작업자 간 의존성 | X | O (--after) |
| 배치 처리 | X | O (c4 batch) |
| 관리자-작업자 계층 | X | O |
| Hook 이벤트 수신 | X | O (JSONL 영속화) |
| **알림/모니터링** | | |
| Slack/Discord 알림 | X | O |
| STALL 감지 | X | O |
| 실시간 스트리밍 (c4 watch) | X | O (SSE) |
| **편의** | | |
| .worktreeinclude | O | X |
| 세션 재개 (--resume) | O | X (scribe 기반 컨텍스트 복구) |
| WorktreeCreate/Remove hook | O | X (자체 로직) |
| tmux 연동 | O | X (PTY 직접 관리) |

---

## 병합 가능 영역

네이티브 기능으로 대체하여 C4 코드를 줄일 수 있는 영역:

### 1. WorktreeCreate hook으로 생성 로직 위임

**현재 C4**: `_createWorktree()`에서 `git worktree add`, stale 정리, hooks 적용을 직접 수행.

**병합 방안**: Claude Code WorktreeCreate hook을 활용하여 C4의 생성 로직을 hook 스크립트로 이전. worker 스폰 시 `--worktree <name>` 플래그를 전달하면 Claude Code가 hook을 호출하고, hook 내에서 C4 고유 설정(hooksPath, settings.json)을 적용.

**절감**: `_createWorktree()` 30줄, `_detectRepoRoot()` 12줄 → hook 스크립트 1개로 대체.

**주의사항**: WorktreeCreate hook이 C4 daemon 없이도 동작해야 하므로 standalone 스크립트 필요. .worktreeinclude 기능은 hook 사용 시 자동 처리되지 않으므로 hook 내에서 직접 복사해야 함.

### 2. WorktreeRemove hook으로 정리 로직 위임

**현재 C4**: `_removeWorktree()`에서 `git worktree remove --force`, prune, fs.rmSync 폴백을 직접 수행.

**병합 방안**: WorktreeRemove hook에서 C4의 브랜치 삭제(`git branch -D c4/<name>`)와 daemon 알림을 처리. 기본 worktree 삭제는 Claude Code에 위임.

**절감**: `_removeWorktree()` 25줄 축소 가능.

**주의사항**: hook 실패가 삭제를 막지 않으므로 브랜치 삭제 순서에 주의. dirty-state 체크는 C4가 별도로 유지해야 함 (네이티브는 프롬프트만 제공).

### 3. .worktreeinclude 활용

**현재 C4**: gitignore 파일 복사 미지원.

**병합 방안**: `.worktreeinclude` 파일 생성하여 .env 등 환경 파일을 자동 복사. 별도 코드 없이 선언적으로 해결.

**절감**: 새 기능 획득 (코드 증가 없음).

### 4. 세션 재개 (--resume) 활용

**현재 C4**: scribe 시스템으로 컨텍스트를 기록하고 새 worker에게 session-context.md를 읽히는 방식.

**병합 방안**: worker 재시작 시 `claude --resume`으로 이전 세션을 직접 이어받기. scribe의 요약 기반 복구보다 정확한 컨텍스트 복원.

**주의사항**: --resume은 같은 머신/사용자에서만 동작. SSH target worker에는 적용 불가.

---

## C4 고유 장점 (대체 불가)

네이티브 worktree로 대체할 수 없는 C4 고유 기능:

### 1. 관리자-작업자 계층 오케스트레이션

네이티브 worktree는 독립 세션을 격리할 뿐, 세션 간 조율이 없다. C4는 관리자가 작업자를 생성→감시→머지하는 계층 구조를 제공하며, 재귀적 3단계(관리자→중간관리자→작업자)까지 가능하다. `c4 wait`, `c4 read`, `c4 send`로 세션 간 통신이 가능하다.

**왜 대체 불가**: Claude Code 서브에이전트는 1단계만 가능하고, worktree 간 메시지 패싱이 없다.

### 2. Hook 기반 실시간 감시

C4는 worker의 `.claude/settings.json`에 PreToolUse/PostToolUse hook을 자동 삽입하여 모든 tool_use를 daemon이 실시간 수신한다. 이를 기반으로:
- 스코프 이탈 감지 (허용 범위 밖 파일 수정 시도)
- 복합 명령 차단 (`&&`, `|`, `;`)
- 위험 명령 거부 (Critical Deny List)
- 진행률 추적

**왜 대체 불가**: 네이티브 worktree에는 외부 daemon과 통신하는 hook 인프라가 없다.

### 3. 태스크 큐 + 의존성 + 배치 처리

C4는 `--after worker-a`로 의존성 정의, `c4 batch --count 5`로 병렬 배치, maxWorkers 제한으로 rate limit 관리를 지원한다.

**왜 대체 불가**: 네이티브 worktree는 독립 세션이므로 큐잉이나 의존성 개념이 없다.

### 4. dirty-state 인지 고아 정리

C4의 `_cleanupLostWorktrees()`는 2-pass 스캔(디렉토리 + git worktree list)으로 고아 worktree를 찾고, dirty 상태면 보존 + Slack 알림을 보낸다. 데이터 손실 없이 자동 정리.

**왜 대체 불가**: 네이티브는 수동 `git worktree remove`만 제공. 자동 고아 감지나 dirty-state 안전 장치가 없다.

### 5. 권한 프로파일 + autonomyLevel

C4는 web/ml/infra 프로파일로 역할별 auto-approve 규칙을 적용하고, L0~L4 자율성 레벨로 사람 개입 정도를 세밀하게 조절한다.

**왜 대체 불가**: 네이티브 worktree는 부모 세션의 권한을 상속할 뿐, 역할별 분리나 자율성 레벨이 없다.

### 6. Slack/알림 통합

STALL, ERROR, 완료, 헬스체크 이벤트를 Slack/Discord/Telegram/KakaoWork로 실시간 전달. `c4 approve`로 원격 승인.

**왜 대체 불가**: 네이티브 worktree에는 알림 채널 개념이 없다.

### 7. main 보호 + 관리자 merge 게이트

C4는 pre-commit hook으로 worker의 main 직접 커밋을 차단하고, `c4 merge`로 관리자만 테스트/문서 체크 후 merge 할 수 있다.

**왜 대체 불가**: 네이티브 worktree는 브랜치 보호 정책이 없다.

### 8. SSH 원격 worker

로컬 worktree가 아닌 SSH로 원격 서버에 worker를 스폰. isSshTarget 시 worktree 생성을 건너뛰는 로직(L966)도 C4 고유.

**왜 대체 불가**: 네이티브 worktree는 로컬 git repo에서만 동작.

---

## 결론 및 권장사항

### 평가 요약

| 영역 | 네이티브 대체 가능? | 비고 |
|------|:---:|------|
| worktree 생성/삭제 기본 로직 | O | WorktreeCreate/Remove hook 활용 |
| .env 파일 복사 | O | .worktreeinclude |
| 세션 재개 | 부분 | --resume (로컬 한정) |
| settings.json 자동 주입 | X | 역할별 프리셋, daemon hook 필요 |
| 고아 worktree 정리 | X | 2-pass 스캔, dirty-state 보존 |
| 관리자-작업자 오케스트레이션 | X | C4 핵심 기능 |
| Hook 기반 감시 | X | daemon 통신 필수 |
| 태스크 큐/의존성/배치 | X | 오케스트레이터 기능 |
| 알림/원격 승인 | X | 외부 시스템 연동 |
| main 보호 | X | merge 게이트 |

### 권장사항

1. **단기**: 병합 가능 영역 중 `.worktreeinclude` 즉시 도입 (코드 변경 없이 환경 파일 복사 획득)
2. **중기**: WorktreeCreate/Remove hook을 C4 worktree 생성/삭제에 연동하여 네이티브 기능과 공존. C4가 hook 스크립트를 제공하고, Claude Code가 worktree 기본 생성을 처리하는 구조
3. **장기 유지**: C4의 오케스트레이션 계층(관리자-작업자, 큐, 감시, 알림)은 네이티브로 대체 불가하므로 계속 자체 관리

**핵심 결론**: Claude Code 네이티브 worktree는 "단일 세션 격리"에 최적화되어 있고, C4 worktree는 "멀티 세션 오케스트레이션의 격리 계층"이다. 기본 git 조작은 네이티브에 위임할 수 있지만, C4의 핵심 가치(감시, 조율, 알림, 자율성 정책)는 네이티브 기능과 무관하게 유지되어야 한다.
