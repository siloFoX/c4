# pendingTask 간헐적 실패 - worktree 없이 시작 시 task 미전달

## 원인

`_createAndSendTask()`와 `sendTask()`의 worktree 생성 로직 불일치로 인한 race condition.

### 핵심 코드 흐름

**정상 경로 (기존 워커에 sendTask)** - `pty-manager.js:1934-1981`:
```
sendTask() → _createWorktree() → w.worktree = worktreePath → _buildTaskText() → 즉시 전송
```
worktree를 먼저 만들고, `w.worktree`에 할당한 후, task를 빌드하여 바로 전송한다.

**문제 경로 (새 워커에 _createAndSendTask)** - `pty-manager.js:912-979`:
```
_createAndSendTask() → create() → _pendingTask 저장 → return
  ... (3-5초 후) idle handler → _buildTaskText() → 전송
```
worktree를 생성하는 코드가 아예 없다. `_pendingTask`에 `useWorktree: true` 옵션만 저장하고 끝난다.

### Race Condition 상세

| 시점 | 동작 | `w.worktree` 값 |
|------|------|-----------------|
| T=0ms | `_createAndSendTask()` 호출 | `undefined` |
| T=0ms | `create()` - PTY 프로세스 생성 (line 924) | `undefined` |
| T=0ms | `_pendingTask` 저장 (line 948-961) | `undefined` |
| T=0ms | 30초 fallback 타이머 설정 (line 965-976) | `undefined` |
| T=0ms | return (line 978) - **worktree 미생성** | `undefined` |
| T=100-500ms | PTY 데이터 수신, idle 타이머 시작 | `undefined` |
| T=3000-5000ms | idle handler 실행 (line 2246) | `undefined` |
| T=3000-5000ms | `_buildTaskText()` 호출 (line 2249) | `undefined` |
| T=3000-5000ms | `worker.worktree` 체크 (line 983) - **null** | `undefined` |
| T=3000-5000ms | `cd worktree` 없이 task 전송 | `undefined` |

### 관련 코드

**`_createAndSendTask()`** (line 912-979): worktree 관련 로직 전무. `entry.useWorktree` 값을 `_pendingTask.options`에 저장만 할 뿐, `_createWorktree()` 호출이 없다.

**`_buildTaskText()`** (line 981-998): `worker.worktree`가 truthy일 때만 `cd` 명령을 앞에 붙인다. `_createAndSendTask` 경로에서는 항상 null이므로 cd 명령이 누락된다.

**idle handler** (line 2246-2255): `_pendingTask`가 있으면 `_buildTaskText()`로 빌드 후 전송. worktree 유무를 별도 검증하지 않는다.

**30초 fallback** (line 965-976): 동일하게 `_buildTaskText()`를 사용하므로 같은 문제 발생.

## 영향

- 새 워커 생성과 동시에 task를 전달하는 모든 케이스에서 발생
- task가 worktree가 아닌 원본 repo 디렉토리에서 실행됨
- 브랜치 격리 실패 - 다른 워커와 파일 충돌 가능
- "간헐적"으로 보이는 이유: 워커 재사용 시(기존 워커)에는 정상 동작하므로, 새 워커 생성이 필요한 경우에만 실패

## 해결 방안

### 방안 1: _createAndSendTask에 worktree 생성 로직 추가

`_createAndSendTask()` (line 924 이후)에 `sendTask()`의 line 1944-1981과 동일한 worktree 생성 로직을 삽입한다.

```
_createAndSendTask(entry) 내부:
  create() 이후, _pendingTask 저장 전에:
  if (entry.useWorktree) {
    repoRoot = _detectRepoRoot(entry.projectRoot)
    worktreePath = _worktreePath(repoRoot, name)
    _createWorktree(repoRoot, worktreePath, entry.branch)
    w.worktree = worktreePath
    w.worktreeRepoRoot = repoRoot
    w.branch = entry.branch
  }
```

- 장점: 기존 sendTask 경로와 동일한 패턴, 검증됨
- 단점: worktree 생성 로직이 두 곳에 중복

### 방안 2: worktree 생성을 공통 메서드로 추출

`_setupWorktree(worker, options)` 메서드를 만들어 `sendTask()`와 `_createAndSendTask()` 양쪽에서 호출한다.

- 장점: 코드 중복 제거, 유지보수 용이
- 단점: 리팩토링 범위가 넓어짐

### 방안 3: idle handler에서 worktree 지연 생성

idle handler (line 2246)에서 `_pendingTask.options.useWorktree`가 true이고 `worker.worktree`가 null이면, 그때 worktree를 생성한다.

- 장점: 최소 변경
- 단점: idle handler에 부수효과 추가, worktree 생성 실패 시 에러 핸들링 복잡

## 추천안

**방안 1** 추천.

이유:
- `sendTask()`에서 이미 검증된 패턴을 그대로 복제하므로 안전
- `_createAndSendTask()`는 create() 직후 동기적으로 worktree를 설정할 수 있어 타이밍 문제가 원천 차단됨
- 방안 2의 리팩토링은 이후 별도로 진행해도 됨 (현재는 버그 수정이 우선)
- 방안 3은 idle handler의 책임이 과도해지고, worktree 생성 실패 시 task 전달 자체가 불가능해지는 문제가 있음

수정 위치: `src/pty-manager.js` line 924 이후 (create() 호출과 _pendingTask 저장 사이)

## 2차 수정 (5.51) - idle handler effort setup 관통 문제

### 근본 원인

1차 수정으로 worktree 미생성 문제는 해결됐지만, task 전달 자체가 실패하는 근본 원인이 남아있었다.

`_executeSetupPhase2()`가 `setupPhase = 'done'`을 설정한 후, 중첩 setTimeout으로 `setupDone = true`를 설정하기까지 ~1000ms 창이 존재한다 (inputDelayMs + confirmDelayMs).

이 창 동안 idle handler가 fire하면:
1. effort 블록 진입 (`!worker.setupDone` = true)
2. `!worker.setupPhase` = false (setupPhase가 'done'이므로), `setupPhase === 'waitMenu'` = false
3. 두 조건 모두 불일치 → effort 블록을 **관통**
4. pendingTask 블록 도달 → 모델 메뉴가 아직 활성 상태인데 task 전송
5. task 텍스트가 모델 메뉴 입력으로 소비됨 (먹힘)
6. `_pendingTaskSent = true` 설정으로 timeout fallback도 재시도 안 함

### 수정 내용

1. **idle handler pendingTask 블록에 setupDone 가드 추가**: effort 설정이 있고 setupDone이 false면 pendingTask 전송을 차단
2. **_executeSetupPhase2 post-setup 전달 트리거**: setupDone = true 설정 후 2초 딜레이로 isReady 확인 후 pendingTask 직접 전달 (active polling 보조)
3. **active polling _chunkedWrite await**: setInterval 콜백을 async로 변경하여 긴 task 텍스트의 부분 전송 방지

## 3차 수정 (7.1) — 모든 delivery 경로에서 CR 분리 전송

### 증상

5.51 수정 이후에도 `w-docs-final` 등 일부 세션에서 동일한 증상 재현. task 텍스트는 Claude Code의 prompt에 정상적으로 보이지만 Enter가 인식되지 않아 worker가 입력 대기 상태로 멈춤.

### 근본 원인

이미 5.18에서 `c4 send` 경로에 대해 동일한 증상을 해결한 이력이 있었다.

**5.18 핵심 원인:**
> `_chunkedWrite()`가 input과 CR(`\r`)을 같은 스트림으로 전송하면 PTY/Claude Code가 CR을 인식 못하는 타이밍 문제. 해결책: input 전송 후 100ms 대기, 별도 `proc.write('\r')`로 Enter 전송.

이 수정은 `send()` 메서드에만 적용됐고, pendingTask 전달 경로 9곳은 여전히 `_chunkedWrite(proc, text + '\r')` 형태로 CR을 합쳐서 전송하고 있었다:

1. `_createAndSendTask()` active polling (line 1078)
2. `_createAndSendTask()` timeout fallback (line 1097)
3. `_executeSetupPhase2()` post-setup trigger (line 1191)
4. `sendTask()` existing worker path (line 2475)
5. idle handler pendingTask block (line 2729)
6. idle handler auto-resume queue (line 2744)
7. `_processQueue()` existing worker re-send (line 928)
8. CI feedback auto-send (line 462)
9. routine skip feedback (line 2954)

모든 경로가 5.18과 동일한 PTY 타이밍 문제에 노출돼 있었으나 수정이 전파되지 않았다.

### 왜 간헐적인가

PTY 버퍼 상태, Claude Code TUI 렌더링 타이밍, 작업자 머신 부하 등 환경 요인에 따라 CR이 인식되기도 하고 누락되기도 한다. w-test2처럼 빠르게 Enter가 인식되는 세션은 성공, w-docs-final처럼 누락되는 세션은 실패로 나뉜다.

### 수정 내용

`_writeTaskAndEnter(proc, text, enterDelayMs=100)` 헬퍼를 `_chunkedWrite` 바로 아래에 추가:

```javascript
async _writeTaskAndEnter(proc, text, enterDelayMs = 100) {
  await this._chunkedWrite(proc, text);
  await new Promise(resolve => setTimeout(resolve, enterDelayMs));
  try { proc.write('\r'); } catch { /* proc closed */ }
}
```

위 9개 경로의 `_chunkedWrite(proc, text + '\r')` 호출을 모두 `_writeTaskAndEnter(proc, text)`로 교체.

### 검증

`tests/pending-task-cr-split.test.js`에 5개 단위 테스트 추가:
- text와 CR이 별개의 `proc.write` 호출로 분리되는지
- payload에 `\r`이 embed되지 않는지
- delay 파라미터가 전달되는지
- 긴 text 청크 분할 후에도 CR은 별도 호출로 전송되는지
- 닫힌 proc에서 에러 발생 시 swallow 되는지

전체 테스트(48개) 모두 통과.
