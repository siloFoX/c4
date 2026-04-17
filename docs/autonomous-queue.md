# 자동 실행 큐 (2026-04-17 야간)

사용자는 퇴근. c4-mgr-auto가 아래 큐를 순서대로 실행한다.

## 엄격한 규칙 (위반 시 halt = 자동화 실패)

### Bash 명령 규칙
- **복합 명령 절대 금지**: `&&`, `||`, `;`, `|`, `for`, `while`, `cd &&`
- 각 명령은 개별 Bash tool call로 분리 (병렬 실행 가능)
- `cd /path && cmd` 대신 `git -C /path cmd` / `npm --prefix /path cmd`
- `sleep N` 대신 `c4 wait <name>` (idle 감지 시 즉시 반환)
- 파일 조회는 Bash `cat` 대신 Read tool 사용

### c4 task 메시지 규칙
- shell 인자로 전달되는 메시지에 **markdown 헤더(`##`, `###`) 포함 금지**
- 긴 스펙 전달: `Write` tool로 `/tmp/task-<name>.md` 저장 → `c4 task name "read /tmp/task-<name>.md and execute"` 패턴
- 인라인 메시지는 한 문단 plain text

## 태스크 큐 (순서대로 실행)

### [1] TODO 7.26 — manager halt 방지 (최우선)
**스펙**: `/root/c4/docs/tasks/7.26.md` (이미 작성됨)
**워커**: halt-fix
**브랜치**: c4/halt-fix

단계:
1. `c4 new halt-fix`
2. `c4 task halt-fix --auto-mode --branch c4/halt-fix "read /root/c4/docs/tasks/7.26.md and execute"`
3. `c4 wait halt-fix --timeout 1800000` (30분)
4. `c4 read-now halt-fix` 로 상태 확인
5. 승인 요청 있으면: 내용 검증 후 `c4 key halt-fix Enter` (범위 밖 요청은 거부)
6. 완료되면 `npm --prefix /root/c4-worktree-halt-fix test` 로 검증 (cd 금지!)
7. `git -C /root/c4-worktree-halt-fix log --oneline -3` 확인
8. `c4 merge halt-fix`
9. 충돌 발생 시 `/root/c4/TODO.md` 읽고 수동 resolve (Edit tool 사용), commit
10. `git -C /root/c4 push origin main` (인증은 URL embed된 PAT로 자동)
11. `c4 close halt-fix`

### [2] TODO 7.27 — src/cli.js 실행 bit 고정
**워커**: exec-bit
**브랜치**: c4/exec-bit

TODO.md 7.27 섹션 읽고 원인 조사. 수정 방향:
- `.gitattributes`에 `src/cli.js text eol=lf` + `core.filemode` 설정
- 또는 worker spawn 시 executable bit 보존 로직 추가
- permanent commit으로 100755 고정

단계: halt-fix와 동일 패턴 (c4 new → c4 task → c4 wait → 검증 → c4 merge → c4 close)

### [3] TODO 7.28 — c4 merge uncommitted guard
**워커**: merge-guard
**브랜치**: c4/merge-guard

TODO.md 7.28 섹션 읽고 구현:
- c4 merge 전 `git -C <repo> status --porcelain` 체크
- uncommitted 변경 있으면 명확 에러 + exit 1 (`git status 또는 c4 cleanup 확인` 안내)
- `--auto-stash` 플래그로 자동 stash→pop 옵션 제공 (conflict 시 명확 안내)

단계: 동일 패턴

## 승인 정책

워커가 권한 요청하면 (`c4 read-now <name>` 결과에 approval prompt):
- 파일 Edit/Write/Read (task scope 내): 승인 (`c4 key <name> Enter`)
- npm test, git 명령 (안전): 승인
- 거부: rm, sudo, chmod, git push --force, 범위 밖 파일 수정

## Halt 발생 시

permission prompt에서 막히면:
1. `/root/c4/docs/autonomous-log.md`에 타임스탬프 + 명령 + 원인 append
2. 다른 접근으로 재시도 (명령 분리, 파일 기반 전달 등)
3. 3회 연속 halt 시 현재 태스크 skip, 다음으로 이동
4. skip 사유 autonomous-log.md에 기록

## 완료 시

모든 태스크 끝나면:
- `/root/c4/docs/autonomous-log.md`에 요약 append
- 마지막 `git -C /root/c4 push origin main` 로 최종 상태 반영
- idle 대기

## Push 규칙
- 각 태스크의 merge 직후 push (문서/커밋/푸시 일관성)
- push 실패 시 (rejected 등) fetch → rebase → push 재시도
- force push 절대 금지 (`--force` / `-f` 금지)

## 태스크별 실패 시 복구

- 워커 stuck: `c4 close <name>` → `c4 new <name>` 재생성, task 재전송
- 테스트 실패: 워커에게 수정 지시 (`c4 send <name> "<짧은 plain text 지시>"`)
- 머지 실패 (conflict): 수동 resolve, 재시도
- 머지 실패 (check fail): 워커에게 TODO/CHANGELOG 추가 지시

## 참고

- 오늘 완료: 7.25 git identity (merge c4399aa)
- 머신: 192.168.10.40, /root/c4
- daemon PID: 2529438 (c4 health 로 확인)
- 기존 human 매니저는 퇴근 후 닫힘 예정 (동시 작업 충돌 주의)
