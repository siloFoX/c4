```
     ██████╗ ██╗  ██╗
    ██╔════╝ ██║  ██║
    ██║      ███████║   Claude { Claude Code } Code
    ██║      ╚════██║   에이전트 온 에이전트 오케스트레이터
    ╚██████╗      ██║
     ╚═════╝      ╚═╝
```

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node >= 18](https://img.shields.io/badge/node-%3E%3D18%20(tested%20v24.11.1)-brightgreen.svg)
![Claude Code](https://img.shields.io/badge/Claude_Code-v2.1.85--2.1.110-8A2BE2.svg)
![Platform](https://img.shields.io/badge/platform-Win11%2022H2%2B%20%7C%20Ubuntu%2022.04%2B-blue.svg)
![Version](https://img.shields.io/badge/version-1.6.10-green.svg)

> **Claude Code 전용 멀티 에이전트 오케스트레이터** — 병렬 작업자, 관리자 자동 교체, 재귀적 위임, 밤새 자율 코딩. 스크린샷 없이, PTY로.

**[English](README.md)**

자율 코딩을 위한 멀티 에이전트 오케스트레이터. Claude Code가 여러 Claude Code 작업자를 가상 터미널로 생성·감독·머지합니다 — 계층적 작업 위임, 관리자 자동 교체(Manager Rotation), 에이전트 스웜 지원. 화면 캡쳐 없이, 토큰 낭비 없이.

```
사용자 ↔ Claude Code (관리자) ↔ C4 데몬 ↔ 작업자 A (Claude Code)
                                         ↔ 작업자 B (Claude Code)
                                         ↔ 작업자 C (Claude Code, 원격 SSH)
```

## 어떻게 동작하나요?

Claude Code를 열고 평소처럼 대화하면 됩니다. Claude Code가 `c4` 명령어로 작업자 Claude Code 인스턴스를 생성하고 관리합니다. `c4`를 직접 실행할 필요 없습니다 — Claude Code가 관리자이자 인터페이스입니다.

```
사용자: "ARPS 프로젝트에 로깅 추가하고 테스트까지 해줘"

Claude Code (관리자):
  → c4 daemon start
  → c4 new worker-a claude --target dgx
  → c4 task worker-a "로깅 추가해" --branch c4/add-logging
  → c4 wait worker-a          (진행 상황 모니터링)
  → c4 key worker-a Enter     (안전한 작업 승인)
  → c4 read worker-a          (결과 읽고 사용자에게 보고)
```

## 왜 C4인가요?

Claude Desktop의 Dispatch는 **화면 캡쳐**로 터미널과 상호작용합니다:
- 느림 (이미지 인코딩/디코딩)
- 비쌈 (이미지 토큰 >> 텍스트 토큰)
- 부정확 (OCR 수준)

C4는 **PTY 네이티브 가상 터미널** 텍스트를 사용합니다:
- PTY로 원시 출력 캡쳐 → ScreenBuffer가 이스케이프 시퀀스 처리 → 깨끗한 텍스트
- 유휴 감지 → 터미널 출력이 멈출 때만 스냅샷
- **스크린샷 기반 에이전트 오케스트레이션 대비 10~100배 효율적**

이 효율성 덕분에 여러 병렬 작업자로 밤새 자율 코딩이 가능합니다 — 스크린샷 기반 방식으로는 불가능한 규모입니다.

## 사전 요구사항

- [Node.js](https://nodejs.org/) >= 18
- [Claude Code](https://claude.ai/code) CLI 설치

## 설치

```bash
git clone https://github.com/siloFoX/c4.git
cd c4
npm install
```

그 다음 Claude Code를 열고 다음을 실행하도록 요청하세요:
```
c4 init
```

`c4 init`이 모든 것을 자동으로 처리합니다:
- `~/.claude/settings.json` — c4 bash 권한 추가
- `config.json` — `config.example.json`에서 복사, claude 경로 자동 감지
- `c4` 명령어 — 전역 등록 (npm link, Windows에서는 wrapper 스크립트 폴백)
- `CLAUDE.md` 심링크 — 프로젝트 안내 문서
- `.githooks` — main 브랜치 보호 (pre-commit hook)

## 사용법

### 관리자 모드 (권장)

관리자 에이전트로 시작하면 규칙이 강제됩니다 (복합 명령 금지, 코드 직접 수정 금지):

```bash
claude --agent .claude/agents/manager.md
```

작업을 지시하면 관리자가 `c4` 명령어로 워커를 생성해서 처리합니다.

### 기본 사용법

아무 프로젝트 디렉토리에서 Claude Code를 열고 작업을 지시하세요:

```
사용자: "이 프로젝트 TODO를 정리해줘. 작업자 2개 띄워서 병렬로 해"

Claude Code가 알아서:
1. c4 daemon start
2. c4 new worker-a claude
3. c4 new worker-b claude
4. c4 task worker-a "TODO 분석" --branch c4/todo-analysis
5. c4 task worker-b "코드 정리" --branch c4/cleanup
6. 모니터링, 승인, 결과 보고
```

### 원격 작업자 (SSH)

작업자를 원격 서버에서 실행할 수 있습니다:

```
사용자: "DGX 서버에서 모델 학습시켜줘"

Claude Code가 알아서:
1. c4 new trainer claude --target dgx
2. c4 task trainer "모델 학습 시작해"
```

### 재귀적 C4 (실험적)

작업자가 C4를 사용해서 하위 작업자를 만들 수 있습니다:

```
사용자 ↔ 관리자 (Claude Code)
           ├─ 작업자 A (중간 관리자)
           │    ├─ 하위 작업자 A1
           │    ├─ 하위 작업자 A2
           │    └─ 하위 작업자 A3
           └─ 작업자 B
```

모든 작업자가 같은 데몬(localhost:3456)을 공유하므로, `c4`가 PATH에 있는 작업자라면 하위 작업자를 생성/관리할 수 있습니다.

> **상태**: 아키텍처 상 지원, 프로덕션 테스트 예정.

`config.json`에서 타겟 설정:
```json
{
  "targets": {
    "dgx": {
      "type": "ssh",
      "host": "user@192.168.1.100",
      "defaultCwd": "/home/user/project",
      "commandMap": {
        "claude": "/home/user/.local/bin/claude"
      }
    }
  }
}
```

## 설정

`config.example.json`을 `config.json`으로 복사하고 편집하세요:

| 섹션 | 설명 |
|------|------|
| `daemon` | 포트, 호스트, 유휴 감지 시간 |
| `pty` | 터미널 크기, 스크롤백 |
| `targets` | 로컬 및 SSH 원격 타겟 |
| `autoApprove` | 안전한 명령 자동 승인, 위험한 명령 자동 거부 |
| `workerDefaults` | 폴더 신뢰, effort 레벨, 모델 |
| `maxWorkers` | 동시 실행 작업자 수 제한 (0 = 무제한) |
| `scope` | 작업별 파일/명령 제한 프리셋 |
| `intervention` | 질문/에스컬레이션 감지 설정 |
| `templates` | 역할별 작업자 프리셋 (Planner/Executor/Reviewer) |
| `profiles` | 작업자별 `.claude/settings.json` 프로필 |
| `pool` | 작업자 풀링 (유휴 재활용) 설정 |
| `effort` | 동적 effort 조절 임계값 |
| `hooks` | Hook 아키텍처 (PreToolUse/PostToolUse) |
| `swarm` | 서브에이전트 스웜 모니터링 |
| `autoMode` | Claude classifier 안전성 위임 |
| `notifications` | Slack webhook + 이메일 알림 (언어: ko/en) |
| `ssh` | SSH ControlMaster 및 재연결 설정 |
| `tokenMonitor` | 일일 토큰 사용량 한도 및 경고 |
| `scribe` | 세션 컨텍스트 기록 |
| `compatibility` | Claude Code TUI 패턴 (버전 호환성) |
| `worktree` | git worktree 설정 (멀티 에이전트 격리) |
| `logs` | 로그 기록, 로테이션, 자동 정리 |

### 자동 승인

안전한 명령은 자동 승인, 위험한 명령은 자동 거부:

```json
{
  "autoApprove": {
    "enabled": true,
    "rules": [
      { "pattern": "Read", "action": "approve" },
      { "pattern": "Bash(ls:*)", "action": "approve" },
      { "pattern": "Bash(find:*)", "action": "approve" },
      { "pattern": "Write", "action": "ask" },
      { "pattern": "Bash(rm:*)", "action": "deny" },
      { "pattern": "Bash(sudo:*)", "action": "deny" }
    ],
    "defaultAction": "ask"
  }
}
```

## 명령어 참고

Claude Code(관리자)가 사용하는 명령어입니다. 사용자가 직접 실행하는 것이 아닙니다:

| 명령어 | 설명 |
|--------|------|
| `c4 init` | 최초 설정 (권한, 설정, CLAUDE.md, hooks) |
| `c4 daemon start\|stop\|restart\|status` | 데몬 관리 |
| `c4 new <이름> [--target t] [--template T]` | 작업자 생성 (역할 템플릿 지원) |
| `c4 task <이름> <내용> [플래그]` | git 브랜치/worktree 격리와 함께 작업 지시 |
| `c4 merge <작업자\|브랜치>` | 브랜치를 main에 머지 (테스트/문서 체크 후) |
| `c4 rollback <작업자>` | 작업자 브랜치를 작업 전 상태로 되돌리기 |
| `c4 plan <이름> <내용>` | 계획만 생성 (실행 없음) |
| `c4 send <이름> <텍스트>` | 작업자에게 텍스트 전송 |
| `c4 key <이름> <키>` | 특수키 전송 (Enter, C-c 등) |
| `c4 read <이름>` | 새 출력 읽기 (유휴 스냅샷) |
| `c4 read-now <이름>` | 현재 화면 즉시 읽기 |
| `c4 wait <이름> [타임아웃]` | 유휴 상태까지 대기 후 읽기 |
| `c4 list` | 모든 작업자 목록 (개입/큐 상태 포함) |
| `c4 close <이름>` | 작업자 종료 |
| `c4 history [작업자]` | 작업 히스토리 조회 |
| `c4 token-usage` | 일일 토큰 사용량 표시 |
| `c4 scrollback <이름>` | 스크롤백 버퍼 읽기 |
| `c4 templates` | 역할 템플릿 목록 |
| `c4 swarm <이름>` | 서브에이전트 스웜 상태 |
| `c4 auto <내용>` | 원커맨드 자율 모드 (관리자 + scribe + 전체 권한) |
| `c4 morning` | 아침 보고서 생성 (`c4 auto` 완료 시 자동 호출) |
| `c4 resume <이름> [세션ID]` | 이전 세션으로 작업자 재개 |
| `c4 session-id <이름>` | 작업자 세션 ID 조회 |
| `c4 status <이름> <메시지>` | Slack에 상태 메시지 전송 |
| `c4 scribe start\|stop\|status\|scan` | 세션 컨텍스트 기록 관리 |
| `c4 cleanup [--dry-run]` | 고아 worktree/브랜치 일괄 정리 |
| `c4 approve <이름> [option_number]` | critical 명령 수동 승인. 번호로 TUI 옵션 선택 가능 |
| `c4 batch <내용> [--count N] [--file tasks.txt]` | 배치 작업 실행 |
| `c4 config [reload]` | 설정 보기 또는 핫리로드 |

**Task 플래그**: `--repo /path` (다른 프로젝트에 worktree 생성), `--branch`, `--after <작업자>`, `--scope <json>`, `--scope-preset`, `--context <작업자>`, `--reuse`, `--template`, `--auto-mode`

## 아키텍처

```
┌─────────────────────────────────────────┐
│  사용자 (사람)                          │
└──────────────┬──────────────────────────┘
               │ 대화
┌──────────────▼──────────────────────────┐
│  관리자 (Claude Code CLI)               │
│  - 사용자와 대화                        │
│  - c4 명령어로 작업자 관리              │
│  - 작업자 출력 검토                     │
│  - 작업자 행동 승인/거부                │
│  - 결과를 사용자에게 보고               │
└──────────────┬──────────────────────────┘
               │ HTTP (localhost:3456)
┌──────────────▼──────────────────────────┐
│  C4 데몬 (Node.js)                      │
│  - PTY 프로세스 관리                    │
│  - ScreenBuffer (가상 터미널)           │
│  - 유휴 감지 + 스냅샷                   │
│  - 자동 승인 엔진                       │
│  - Git worktree 격리                    │
└──┬───────────┬──────────────────────────┘
   │           │
┌──▼──┐    ┌──▼──┐
│PTY A│    │PTY B│    ...
│로컬 │    │ SSH │
│(wt) │    │(wt) │
└─────┘    └─────┘
  wt = git worktree (격리된 브랜치)
```

## 주요 기능

**핵심**
- **자동 초기 설정**: 작업자 생성 시 폴더 신뢰 + effort 레벨 자동 설정
- **자동 승인**: 패턴 기반 작업자 행동 승인/거부 (Read, Write, Bash 명령)
- **Git worktree**: 각 작업자가 격리된 디렉토리에서 작업 — 병렬 충돌 없음
- **SSH 원격 작업자**: 원격 서버에 작업자 생성 + 끊김 시 자동 재연결
- **재귀적 C4 (Recursive Workers)**: 작업자가 하위 작업자를 생성해서 다단계 계층적 작업 위임

**자율 운영**
- **`c4 auto`**: 원커맨드 밤새 자율 코딩 — 관리자 + scribe + 전체 권한, 무인 운영
- **글로벌 오토 모드**: 모든 워커가 deny 목록 외 명령 자동 승인 (밤새 멈추지 않음)
- **PostCompact 복구**: 컨텍스트 압축 후 CLAUDE.md + 세션 컨텍스트 자동 재주입
- **세션 이어가기**: 재시작 시 이전 Claude Code 세션 자동 복구 (--resume 플래그)
- **관리자 자동 교체 (Manager Rotation)**: 컨텍스트 한계 도달 시 관리자 자동 교체 — 의사결정 요약을 새 관리자에게 주입 (PostCompact hook)
- **자율 레벨 4**: 완전 자율 모드 -- deny 룰도 approve로 오버라이드
- **알림**: 멀티 채널 (Slack, Discord, Telegram, KakaoWork) + 이메일. alertOnly 모드로 긴급 알림만 전송 가능

**오케스트레이션**
- **작업 큐 / 배치 실행**: 동시 실행 제한 (`maxWorkers`), 의존성 (`--after`), 중복 방지, 배치 처리
- **스코프 가드**: 작업별 파일/명령 제한 + 이탈 키워드 감지
- **개입 프로토콜**: 작업자 질문, 반복 에러, 루틴 이탈 자동 감지
- **역할 템플릿**: Planner(Opus), Executor(Sonnet), Reviewer(Haiku) 프리셋
- **작업자 풀링**: 유휴 작업자 재활용
- **컨텍스트 전달**: 이전 작업자 출력을 새 작업에 주입

**모니터링**
- **SSE 이벤트**: 실시간 permission/complete/error/question 이벤트 스트리밍
- **토큰 모니터링**: 일일 토큰 소비 추적 + 한도 설정
- **작업 히스토리**: 완료된 모든 작업의 영구 JSONL 기록
- **Scribe**: 세션 컨텍스트 추출, PostCompact hook으로 compact 후 맥락 복원
- **상태 머신**: 작업자 단계 추적 (plan/edit/test/fix) + 에스컬레이션
- **대시보드**: GET /dashboard 웹 UI -- 작업자 상태, 통계, 대기열/유실 섹션 (다크 테마)
- **멈춤 감지**: 개입 상태 및 5분+ 무출력 작업자 자동 감지, Slack 즉시 알림
- **Worktree 자동 정리**: healthCheck에서 LOST worker worktree 자동 정리 -- dirty 상태 안전 검사로 미커밋 변경사항 보존 + [LOST DIRTY] 알림
- **Dirty worktree 경고**: worktree에 미커밋 변경사항이 있을 때 Slack 알림

**안전성**
- **L4 Critical Deny List**: 파괴적 명령 절대 차단 (rm -rf, drop table 등)
- **CI feedback loop**: 커밋 후 자동 npm test 실행
- **Intervention Slack 알림**: 작업자 개입 시 즉시 알림
- **Manager Handoff Summary**: 관리자 교체 시 의사결정 컨텍스트 주입
- **Custom Agent 정의**: `.claude/agents/manager.md`로 에이전트 역할 정의

**인프라**
- **Hook 아키텍처**: PreToolUse/PostToolUse JSON 이벤트 처리
- **MCP 서버**: 외부 도구 연동용 HTTP MCP 프로토콜
- **적응형 폴링**: 출력 활동량 기반 동적 유휴 감지 주기
- **ScreenBuffer**: 강화된 ANSI CSI 파서 + 스크롤백 API
- **크로스 플랫폼**: Windows, Linux, macOS 지원

## FAQ

**Q: C4는 독립 실행형 CLI 도구가 아닌가요?**
A: 맞습니다. C4는 Claude Code(관리자)가 사용하는 도구입니다. 사용자는 Claude Code와 대화하고, Claude Code가 `c4` 명령어로 작업자를 관리합니다.

**Q: Claude 외 다른 모델도 지원하나요?**
A: 현재 C4는 Claude Code CLI 전용입니다. TUI 패턴 매칭과 자동 승인 엔진이 Claude Code 인터페이스에 맞춰져 있습니다.

**Q: 작업자를 몇 개까지 만들 수 있나요?**
A: Claude Max 플랜 제한에 따라 다릅니다. 각 작업자는 별도의 Claude Code 세션으로 토큰을 소비합니다.

**Q: 데몬이 죽으면?**
A: `c4 daemon start`로 재시작하세요. config에서 `healthCheck.autoRestart`를 활성화하면 작업자 자동 복구됩니다.

**Q: 밤새 돌려놔도 되나요?**
A: 네. `c4 auto "작업"` 으로 자율 모드를 시작하세요. 모든 워커에 자동 승인(deny 목록 제외), PostCompact hook으로 컨텍스트 복구, Slack 알림으로 진행 상황을 확인할 수 있습니다.

**Q: 작업자가 다른 작업자를 관리할 수 있나요?**
A: 네 (실험적). 모든 작업자가 같은 데몬을 공유하므로, `c4`가 PATH에 있는 작업자라면 하위 작업자를 생성할 수 있습니다.

## 기여하기

기여를 환영합니다!

1. 레포를 Fork하세요
2. 기능 브랜치를 만드세요 (`git checkout -b feature/amazing`)
3. 변경사항을 커밋하세요
4. 브랜치를 Push하세요
5. Pull Request를 열어주세요

[TODO.md](TODO.md)에서 로드맵과 미완료 작업을 확인하세요.

## 로드맵

Phase 1/2/3/4 전체 65개 이상 항목 구현 완료. 자세한 내용은 [TODO.md](TODO.md)와 [CHANGELOG.md](CHANGELOG.md) 참고.

## 만든 사람

**siloFoX** — [GitHub](https://github.com/siloFoX) · [Instagram](https://instagram.com/_chobo___)

## 라이선스

MIT
