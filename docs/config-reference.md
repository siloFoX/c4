# Config Reference

`config.json` — `config.example.json`에서 복사하여 사용. `c4 init`이 자동 생성.
런타임 재로드: `c4 config reload` (데몬 재시작 불필요).

## daemon

데몬 서버 설정.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `port` | number | `3456` | HTTP 포트 |
| `host` | string | `"127.0.0.1"` | 바인드 주소 |
| `idleThresholdMs` | number | `3000` | worker 출력이 멈춘 후 idle로 판정하는 ms. AdaptivePolling의 base interval로도 사용 |

## pty

PTY (가상 터미널) 설정.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `cols` | number | `160` | 터미널 컬럼 수 |
| `rows` | number | `48` | 터미널 행 수 |
| `scrollback` | number | `2000` | ScreenBuffer scrollback 최대 줄 수 |
| `defaultCommand` | string | `"claude"` | worker 생성 시 기본 명령 |
| `defaultShell` | string | `"auto"` | 셸 (auto = 플랫폼 자동 감지) |

## targets

worker 실행 대상. `local`과 SSH 원격 서버 정의.

```json
{
  "local": {
    "type": "local",
    "defaultCwd": "",
    "commandMap": { "claude": "claude" }
  },
  "my-server": {
    "type": "ssh",
    "host": "user@192.168.1.100",
    "defaultCwd": "/home/user/project",
    "commandMap": { "claude": "/home/user/.local/bin/claude" }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"local"` \| `"ssh"` | 실행 타입 |
| `host` | string | SSH 접속 주소 (`user@host`) |
| `defaultCwd` | string | 기본 작업 디렉토리 |
| `commandMap` | object | 명령어 → 실제 경로 매핑 |
| `port` | number | SSH 포트 (생략 시 22) |
| `identityFile` | string | SSH identity file 경로 |

## compatibility

Claude Code TUI 버전별 패턴 설정. Claude Code 업데이트 시 여기만 수정하면 됨.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `testedVersions` | string[] | `["2.1.85","2.1.90"]` | 테스트된 Claude Code 버전 |
| `minVersion` | string | `"2.1.0"` | 최소 지원 버전 |
| `patterns.trustPrompt` | string | `"trust this folder"` | Trust folder 프롬프트 텍스트 |
| `patterns.permissionPrompt` | string | `"Do you want to proceed?"` | 권한 프롬프트 |
| `patterns.fileCreatePrompt` | string | `"Do you want to create"` | 파일 생성 프롬프트 |
| `patterns.fileEditPrompt` | string | `"Do you want to make this edit"` | 파일 편집 프롬프트 |
| `patterns.bashHeader` | string | `"Bash command"` | Bash 명령 헤더 |
| `patterns.editHeader` | string | `"Edit file"` | 파일 편집 헤더 |
| `patterns.createHeader` | string | `"Create file"` | 파일 생성 헤더 |
| `patterns.yesOption` | string | `"1. Yes"` | 승인 옵션 텍스트 |
| `patterns.noOption` | string | `"No"` | 거부 옵션 텍스트 |
| `patterns.promptFooter` | string | `"Esc to cancel"` | 프롬프트 하단 텍스트 |

## autoApprove

worker 권한 요청 자동 처리.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | 자동 승인/거부 활성화 |
| `alwaysApproveForSession` | boolean | `false` | true이면 "don't ask again" 옵션 선택 |
| `rules` | array | (see below) | 패턴-액션 규칙 목록 |
| `defaultAction` | string | `"ask"` | 규칙 미매칭 시 기본 동작 |

### Rules

```json
{ "pattern": "Read", "action": "approve" }
{ "pattern": "Bash(git:*)", "action": "approve" }
{ "pattern": "Bash(rm:*)", "action": "deny" }
{ "pattern": "Write", "action": "ask" }
```

- `pattern`: `ToolName` (exact) 또는 `Bash(command:*)` (prefix match)
- `action`: `"approve"` | `"deny"` | `"ask"`
- 규칙은 순서대로 매칭, 첫 매칭 적용

## worktree

git worktree 격리 설정.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | worktree 사용 여부 |
| `projectRoot` | string | `""` | git repo root (빈 문자열이면 auto-detect) |

worktree 경로: `<projectRoot>/../c4-worktree-<name>`

## maxWorkers

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxWorkers` | number | `5` | 동시 활성 worker 최대 수. 초과 시 queue 대기. 0 = 무제한 |

## healthCheck

worker 헬스체크 + 자동 재시작.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | 주기적 헬스체크 활성화 |
| `intervalMs` | number | `30000` | 체크 주기 (ms) |
| `timeoutMs` | number | `600000` | worker idle timeout (10분). 초과 시 `[HEALTH] timeout` 스냅샷 |
| `autoRestart` | boolean | `false` | 죽은 worker 자동 재시작 |

## effort

동적 effort 조절 (3.3).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dynamic` | boolean | `true` | task 길이 기반 effort 자동 결정 |
| `thresholds.high` | number | `100` | task 길이 < 100자 → `high` |
| `thresholds.max` | number | `500` | task 길이 >= 500자 → `max` |
| `default` | string | `"high"` | 기본 effort level |

## workerDefaults

worker 초기 설정.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `trustFolder` | boolean | `true` | 자동 trust folder 응답 |
| `effortLevel` | string | `"max"` | effort level (`low`/`medium`/`high`/`max`) |
| `effortSetup.retries` | number | `3` | effort 설정 실패 시 재시도 횟수 |
| `effortSetup.phaseTimeoutMs` | number | `8000` | 메뉴 감지 타임아웃 (ms) |
| `effortSetup.inputDelayMs` | number | `500` | 키 입력 전 딜레이 (ms) |
| `effortSetup.confirmDelayMs` | number | `500` | Enter 전 딜레이 (ms) |
| `model` | string | `"default"` | 기본 모델 |

## logs

로그 관리.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `rawLog` | boolean | `true` | worker별 raw PTY 로그 기록 (`logs/<name>.raw.log`) |
| `maxLogSizeMb` | number | `50` | 로그 로테이션 임계값 (MB) |
| `cleanupAfterMinutes` | number | `60` | 종료된 worker 로그 자동 삭제 대기 시간 |

## scope

작업 스코프 제한.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `defaultScope` | object | `{}` | 모든 task에 적용되는 기본 스코프 |
| `presets.<name>` | object | — | 이름 붙인 스코프 프리셋 |

### Scope Object

```json
{
  "description": "Backend files only",
  "allowFiles": ["src/**", "tests/**"],
  "denyFiles": [],
  "allowBash": ["grep", "find", "git", "npm"],
  "denyBash": ["rm", "sudo", "docker"]
}
```

- `allowFiles`: glob 패턴 — 매칭되는 파일만 수정 허용
- `denyFiles`: glob 패턴 — 매칭되는 파일 수정 금지
- `allowBash`: 명령어 prefix — 허용된 명령만 실행
- `denyBash`: 명령어 prefix — 금지된 명령

기본 제공 프리셋: `backend`, `frontend`, `docs-only`

## rules

task에 자동 삽입되는 규칙.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `appendToTask` | boolean | `true` | task 본문에 규칙 요약 자동 삽입 |
| `summary` | string | `""` | 커스텀 규칙 텍스트 (빈 문자열이면 기본 규칙 사용) |

기본 규칙: 복합 명령 금지, `git -C` 사용, `c4 wait` 사용, main 직접 커밋 금지, 작업 루틴 준수.

## scribe

세션 컨텍스트 기록 (Scribe 시스템).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | scribe 활성화 |
| `intervalMs` | number | `300000` | 스캔 주기 (5분) |
| `outputPath` | string | `"docs/session-context.md"` | 출력 파일 경로 |
| `projectId` | string | `""` | Claude 프로젝트 ID (빈 문자열이면 auto-detect) |
| `maxEntries` | number | `200` | 최대 기록 항목 수 |

## ssh

SSH 연결 설정 (원격 worker용).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `controlMaster` | boolean | `true` | ControlMaster 영속 연결 (Unix만) |
| `controlPersist` | number | `60` | ControlMaster 유지 시간 (초) |
| `serverAliveInterval` | number | `15` | ServerAlive 체크 간격 (초) |
| `serverAliveCountMax` | number | `3` | ServerAlive 실패 허용 횟수 |
| `reconnect` | boolean | `true` | 끊김 시 자동 재연결 |
| `maxReconnects` | number | `3` | 최대 재연결 시도 횟수 |
| `reconnectDelayMs` | number | `5000` | 재연결 시도 간격 (ms) |

## tokenMonitor

일일 토큰 사용량 모니터링.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | 모니터링 활성화 |
| `dailyLimit` | number | `0` | 일일 토큰 한도 (0 = 무제한) |
| `warnThreshold` | number | `0.8` | 경고 임계값 (한도 대비 비율) |
| `projectId` | string | `""` | JSONL 프로젝트 ID (빈 문자열이면 auto-detect) |

## pool

worker 풀링 (idle worker 재활용).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | 풀링 활성화 |
| `maxIdleMs` | number | `300000` | idle 상태 최대 유지 시간 (5분). 초과하면 재활용 대상에서 제외 |

## autoMode

Claude 자체 classifier로 안전성 판단 위임.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | 기본적으로 auto mode 적용 |
| `allowOverride` | boolean | `true` | `--auto-mode` 플래그로 개별 task에서 override 허용 |

활성화 시 worker의 `.claude/settings.json`에 `permissions.defaultMode: "auto"` 설정.

## templates

역할별 worker 프리셋.

```json
{
  "planner": {
    "description": "Planner — 설계 전담, Opus 모델",
    "model": "opus",
    "effort": "max",
    "profile": "planner",
    "promptPrefix": "[역할: Planner] 설계와 분석에 집중..."
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | 템플릿 설명 |
| `model` | string | 모델 (opus/sonnet/haiku) |
| `effort` | string | effort level (low/medium/high/max) |
| `profile` | string | `profiles` 섹션의 프로파일명 |
| `promptPrefix` | string | task 앞에 자동 삽입되는 역할 지시문 |

기본 제공: `planner` (Opus), `executor` (Sonnet), `reviewer` (Haiku).

## swarm

Subagent swarm 모니터링.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | swarm 추적 활성화 |
| `maxSubagents` | number | `10` | worker당 최대 subagent 수 |
| `trackUsage` | boolean | `true` | subagent 사용량 추적 |

## hooks

Hook 아키텍처 (PreToolUse/PostToolUse).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | hook 시스템 활성화 |
| `injectToWorkers` | boolean | `true` | worker의 `.claude/settings.json`에 hook 자동 주입 |

활성화 시 worker가 tool 사용할 때마다 `POST /hook-event`로 구조화된 JSON 전송.

## profiles

worker별 `.claude/settings.json` 프로파일.

```json
{
  "default": {
    "permissions": {
      "allow": ["Bash(c4:*)", "Bash(git:*)", "Bash(grep:*)"],
      "deny": ["Bash(rm:*)", "Bash(sudo:*)"]
    }
  },
  "executor": {
    "permissions": {
      "allow": ["Bash(c4:*)", "Bash(git:*)", "Bash(npm:*)", "Edit", "Write"],
      "deny": ["Bash(rm:*)", "Bash(sudo:*)"]
    }
  },
  "reviewer": {
    "permissions": {
      "allow": ["Bash(c4:*)", "Bash(git:*)", "Bash(grep:*)"],
      "deny": ["Edit", "Write", "Bash(rm:*)"]
    }
  }
}
```

모든 worker에 `Bash(c4:*)`, `Bash(git:*)` 권한이 자동 추가됨.

## gitBash

Git Bash (MSYS2) 호환 설정.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `disablePathConversion` | boolean | `true` | `MSYS_NO_PATHCONV=1` 자동 설정 |
