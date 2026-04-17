# Known Issues

실사용 중 발견된 문제와 해결 방법. troubleshooting.md는 일반적인 운영 문제, 이 문서는 특정 사건/실패 사례 기록.

---

## 해결된 이슈

### 복합 명령 차단으로 worker 작업 불가 (5.46/5.47)

**상황:** c4 auto로 5개 worker 병렬 실행. 그 중 2개(w-535, w-536)가 커밋 0건으로 종료. PreToolUse hook이 `&&`, `|`, `;` 포함 명령을 `exit(2)`로 차단하여 worker가 완전 정지.

**원인:** PreToolUse hook의 복합 명령 차단이 너무 공격적. `exit(2)`는 도구 사용 자체를 block하므로 worker가 권한 프롬프트조차 받지 못하고 멈춤. Claude Code는 block된 도구를 재시도하지 않아서 worker가 아무 진행 없이 대기 상태에 빠짐.

**해결:** 5.47에서 `exit(2)` block을 `exit(0)` warning으로 변경 (커밋 `7998125`). worker가 경고만 표시하고 명령은 정상 실행. worker가 멈추지 않으면서도 복합 명령 사용을 인지할 수 있게 됨.

**교훈:**
- PreToolUse hook에서 `exit(2)` block은 worker를 완전히 멈추게 한다. 안전성과 가용성의 균형 필요.
- 자율 모드에서는 block보다 warning이 적합. 관리자가 사후 리뷰로 보완.
- hook 정책 변경 전 소규모 테스트 필수 (5개 worker 한번에 돌리기 전에 1개로 확인).

---

### 관리자가 c4 list 무한 반복 (5.39)

**상황:** 관리자(auto-mgr)가 worker 완료를 기다리면서 `c4 list`를 324번 호출. 사용자 메시지는 3개뿐. 토큰 낭비 + 컨텍스트 소진 가속.

**원인:** 관리자 에이전트 프롬프트에 "주기적으로 상태 확인"이라고만 적혀있어 Claude가 list를 반복 호출. `c4 wait` 사용 지시가 없었음.

**해결:**
1. CLAUDE.md에 "`c4 wait` 사용, `c4 list` 폴링 금지" 명시
2. `c4 list`에 10초 cooldown 캐시 도입 (커밋 `93022f8`)
3. Custom Agent(manager.md)에 "wait만 사용" 규칙 추가

**교훈:**
- LLM은 명시적 금지 없이는 같은 명령을 반복 호출하는 경향이 있다.
- 기술적 제한(cooldown)과 프롬프트 규칙을 함께 적용해야 효과적.
- `c4 wait`처럼 "기다리는 전용 명령"을 제공하면 폴링 문제 해결.

---

### 긴 task 메시지 PTY 잘림 (5.35)

**상황:** `c4 task worker "긴 작업 설명..."` 실행 시 1000자 이상 메시지가 PTY 버퍼에서 잘림. worker가 불완전한 지시를 받아 엉뚱한 작업 수행.

**원인:** PTY의 입력 버퍼에 한계가 있어 긴 문자열을 한번에 write하면 뒷부분이 유실. `_chunkedWrite()`로 분할 전송해도 근본 해결이 안 됨.

**해결:** 1000자 초과 task는 worktree 내 `.c4-task.md` 파일에 저장, PTY에는 파일 경로만 전달 (커밋 `6f5a851`). `_maybeWriteTaskFile()` 헬퍼로 `_buildTaskText`와 `sendTask` 인라인 모두 적용.

**교훈:**
- PTY는 긴 텍스트 입력에 적합하지 않다. 파일 기반 전달이 근본 해결.
- 분할 전송(`_chunkedWrite`)은 임시방편이었고, 메시지 길이 제한이 있다는 전제 자체가 틀렸음.

---

### Slack task 요약 절단 (5.19/5.38)

**상황:** Slack 알림에서 worker의 task 요약이 파일명의 `.`에서 잘림. 예: `src/daemon.js 수정` -> `src/daemon` 까지만 표시.

**원인:** `_fmtWorker()`에서 `split(/[.\n]/)`으로 첫 문장을 추출하려 했으나, 파일명의 `.`도 구분자로 인식.

**해결:** `split('\n')`으로 변경하여 줄바꿈만 구분자로 사용 (커밋 `65365a4`). 추가로 Slack 메시지 전체를 2000자로 truncate하여 API 에러 방지.

**교훈:**
- 정규식 구분자에 `.`을 포함하면 파일 경로가 잘린다. 코드 관련 텍스트에서 `.`은 흔한 문자.

---

### worker 이름이 의미 없어서 관리 불가 (5.40)

**상황:** 자동 생성된 worker 이름이 `w-535`, `w-536` 등 숫자 기반. 5개 이상 병렬 실행 시 어떤 worker가 무슨 작업을 하는지 `c4 list`만으로 파악 불가.

**원인:** 기존 이름 생성이 단순 카운터 기반.

**해결:** task 기반 자동 네이밍 도입 (커밋 `7c2c68d`). `c4 task` 시 task 첫 단어를 기반으로 의미있는 이름 자동 생성. 관리자에게 의미있는 이름 사용 강제.

**교훈:**
- 병렬 worker 운영에서 이름은 가독성의 핵심. 의미 없는 이름은 관리 비용을 높인다.

---

### 관리자가 worker 권한 요청을 맹목적으로 승인 (5.28/5.45)

**상황:** 관리자(auto-mgr)가 worker의 권한 요청에 내용 확인 없이 자동 Enter 전송. cron으로 주기적 `c4 key worker Enter` 실행하여 위험 명령도 무분별 승인.

**원인:** 관리자 에이전트에 "권한 요청이 오면 승인해라"라고만 적혀있어 판단 없이 일괄 승인. 자동화 스크립트가 이를 더 악화.

**해결:**
1. 5.28: cron 자동 Enter 패턴 차단
2. 5.45: CLAUDE.md에 관리자 승인 프로토콜 명확화 (read-now -> 판단 -> 승인/수정)
3. 5.13: L4 Critical Deny List로 파괴적 명령은 레벨과 무관하게 절대 차단

**교훈:**
- "승인"은 "확인"이 선행되어야 한다. 맹목적 Enter는 보안 구멍.
- 자율 모드라도 Critical Deny List 같은 최후 방어선 필요.
- 관리자 역할은 단순 전달이 아니라 판단. CLAUDE.md에 이를 명시해야 함.

---

### send() 후 Enter 누락 (5.18)

**상황:** `c4 send worker "텍스트"` 후 worker가 입력을 받았으나 Enter가 안 눌려서 대기 상태 지속.

**원인:** `_chunkedWrite()`가 input과 CR(`\r`)을 같은 스트림으로 전송. 청크 분할 과정에서 CR이 이전 청크에 포함되거나 유실.

**해결:** input과 CR을 분리 전송 (커밋 `b697a27`). `_chunkedWrite`로 input 전송 후 100ms 대기, 별도 `proc.write('\r')`로 Enter 전송.

**교훈:**
- PTY에서 입력 완료와 실행(Enter)은 분리해야 안전하다.
- 타이밍 문제는 단순 sleep보다 이벤트 기반으로 해결하는 게 이상적이나, PTY 특성상 딜레이가 현실적.

---

### PreToolUse hook이 worktree에서 작동 안 함 (5.19)

**상황:** PreToolUse 복합 명령 차단 hook을 설정했으나 worktree에서 생성된 worker에게 적용 안 됨.

**원인:** worker가 home directory에서 스폰된 후 worktree로 이동하는 구조. Claude Code가 스폰 시점의 `.claude/settings.json`을 로드하므로 worktree의 settings.json이 무시됨.

**해결:** worktree 생성 후 worker 스폰 순서로 변경. standalone hook script 분리하여 경로 의존성 제거 (커밋 `789398e`).

**교훈:**
- Claude Code의 settings.json 로딩 시점은 프로세스 시작 시. 이후 디렉토리 이동은 설정에 영향 없음.
- hook 스크립트는 절대 경로 또는 standalone으로 작성해야 이식성 확보.

---

## 미해결 이슈

### ~~Claude Code 자체 compound command 승인 prompt (5.48)~~ -- 해결됨

**상황:** `cd path && git commit` 같은 복합 명령 실행 시 Claude Code가 "bare repository attacks" 보안 경고로 승인 프롬프트 표시. C4 hook과는 별개의 Claude Code 내부 동작.

**해결:** `_buildWorkerSettings()`의 `defaultPerms`에 `Bash(cd * && *)` 패턴 추가. Worker worktree의 `.claude/settings.json` permissions.allow에 자동 포함되어 Claude Code가 cd-based compound command를 승인 없이 실행.

---

### web/package-lock.json 자발적 수정 — npm 버전/플랫폼 드리프트 (7.29)

**상황:** 세션 시작부터 `git -C /root/c4 status`가 `modified: web/package-lock.json`을 보고. 로컬에서 의도적 수정 없음. 머지 때마다 stash 대상이 되고 의미 없는 diff를 생성.

**원인:** npm 버전/플랫폼 간 드리프트. 커밋된 lockfile은 `"peer": true` 메타데이터 8개를 포함 (Windows 측 silof 환경 npm이 emit). 로컬 Linux의 npm 10.8.2는 `npm install`을 돌릴 때마다 이 `"peer": true` 라인을 strip. 결과 — 실제 의존성은 바뀌지 않았지만 lockfile이 항상 modified로 보임.

재현:

```bash
# 커밋된 lockfile을 임시 디렉토리에 복사
git -C /root/c4 show HEAD:web/package-lock.json > /tmp/pl/package-lock.json
cp /root/c4/web/package.json /tmp/pl/package.json

# --package-lock-only로 lockfile만 재계산 — node_modules 영향 없음
npm --prefix /tmp/pl install --package-lock-only

# 8개 "peer": true 라인이 사라진 diff 확인
grep -c '"peer": true' /tmp/pl/package-lock.json
# 출력: 0 (원본은 8)
```

영향받는 패키지 (전부 peer 엣지로도 도달하는 transitive/direct dep): `@babel/core` 계열, `@types/react`, `browserslist`, `jiti`, `postcss`, `react`, `yaml`, `@vitejs/plugin-react`.

c4 데몬/워커 코드 경로 어디에서도 `npm install`을 자동 실행하지 않음 (`src/` grep 결과 0건). 트리거는 사용자가 수동으로 `npm --prefix web install` 또는 `npm --prefix web run dev`를 실행할 때 npm이 lockfile을 rewrite하면서 발생.

**대응:** 은폐 대신 원인 surface. `src/pkglock-guard.js` + `.githooks/pre-commit`이 `"peer": true`-only diff 시그니처를 감지해 커밋 시점에 경고 출력 ("commit proceeds" — block 아님). `tests/fixtures/pkglock-peer-drift.diff`가 실제 8라인 드리프트 diff 페이로드를 고정.

**권장 워크플로우:**
1. `web/package-lock.json`이 dirty로 보이면 먼저 `git -C /root/c4 diff web/package-lock.json`으로 diff 확인.
2. 내용이 `"peer": true` 제거/추가뿐이면 env 드리프트 — 의도적 수정이 아니므로 `git checkout -- web/package-lock.json`으로 되돌림.
3. 같은 기계에서 `npm install` 후 즉시 diff가 재발생하면: 해당 기계의 npm 버전이 upstream과 다름. `npm --version` 확인 후 일치하는 버전으로 통일 (`engines.npm` pin 고려).
4. 실제 의존성 변경이 필요할 때만 lockfile 커밋 — 그 경우 커밋 메시지에 어느 기계/npm 버전에서 생성했는지 기록.

**gitignore 금지:** lockfile을 gitignore하면 `npm ci` 재현성이 깨지고 CI/fresh-install이 비결정적이 됨. surface warning + 운영 수칙이 올바른 대응.

**교훈:**
- lockfile dirty의 80%는 실제 코드 변경이 아니라 toolchain 버전 차이. 진단 없이 커밋하면 같은 churn이 상대 환경에서 되돌려져 무한 ping-pong.
- 드리프트 시그니처(`"peer": true`-only)는 고정된 패턴이라 정적으로 탐지 가능. pre-commit 경고로 "환경 차이"라는 컨텍스트를 커밋 시점에 제공하면 맹목적 커밋 방지.
- 실제 코드 경로가 아닌 환경 차이 이슈는 테스트로 덮기 어려움 — fixture 파일(`tests/fixtures/pkglock-peer-drift.diff`)로 payload를 버전 관리해 regression을 정적으로 감지.

---

## 패턴 요약

실사용에서 반복되는 실패 패턴:

| 패턴 | 사례 | 대응 |
|------|------|------|
| LLM 반복 행동 | c4 list 324회 | 프롬프트 금지 + 기술적 cooldown |
| hook 과잉 차단 | exit(2) block으로 worker 정지 | warning으로 완화 + 사후 리뷰 |
| PTY 한계 | 긴 메시지 잘림, Enter 누락 | 파일 기반 전달, 분리 전송 |
| 맹목적 자동화 | cron Enter, 무분별 승인 | 판단 프로토콜 + Critical Deny List |
| 설정 로딩 시점 | worktree hook 미적용 | 스폰 순서 변경, standalone script |
| 이름/라벨 부재 | w-535 구분 불가 | 의미있는 자동 네이밍 |
| 환경 드리프트 | web/package-lock.json "peer":true churn | 시그니처 감지 + pre-commit 경고 (7.29) |
