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

## 4차 조사 (7.17) — 7.1 적용 후에도 3/3 worker Enter 미인식 재발

### 증상 요약

7.1 수정(`_writeTaskAndEnter` 9개 경로 교체) 이후에도 동일 세션에서 생성된 worker 3개 모두 Enter가 먹히지 않는 현상이 관찰됐다. prompt에 task 텍스트는 도달했지만 submit이 일어나지 않아 입력 대기 상태로 정지.

### 코드 확인 (2026-04-17 현재)

`src/pty-manager.js`에서 `_chunkedWrite(proc, text + '\r')` 패턴은 완전히 제거됐다. pendingTask를 전달하는 9개 경로 모두 `_writeTaskAndEnter(proc, text)`를 호출:

| 경로 | line | await 여부 |
|------|------|-----------|
| CI 실패 feedback | 473 | X (fire-and-forget) |
| `_processQueue()` 기존 워커 재전송 | 939 | X |
| `_createAndSendTask()` active polling | 1089 | O |
| `_createAndSendTask()` timeout fallback | 1108 | O |
| `_executeSetupPhase2()` post-setup trigger | 1202 | O |
| `sendTask()` 기존 워커 경로 | 2486 | X |
| idle handler pendingTask 블록 | 2740 | O |
| idle handler auto-resume queue | 2755 | X |
| routine skip feedback | 2965 | O |

비-task 경로의 잔여 `text + '\r'` 패턴(영향 없음):
- `pty-manager.js:2654` — SSH shell 초기화용 `pendingCommands`
- `pty-manager.js:1182` — effort 메뉴 확인용 standalone Enter
- `pty-manager.js:3126, 3152` — `send()`/`approve()` (별도 경로)

즉 **7.1 수정은 올바르게 전파**됐고 코드 레벨에서 CR이 합쳐져 전송되는 task 경로는 남아있지 않다. 따라서 7.17 재발 원인은 7.1 이외의 다른 지점이다.

### 근본 원인 후보 (가중치 순)

#### 후보 A (유력) — setupDone=true 직후 active polling의 transient 상태 관통

5.51이 idle handler pendingTask 블록에는 `!setupNeeded` 가드를 추가했지만, active polling(`_pendingTaskTimer`, line 1069-1094)에도 동일 가드가 있긴 하다(line 1080 `needsSetup`). 문제는 **가드 자체는 있어도 타이밍 윈도우를 보호하지 못한다**는 점:

시나리오:
1. `_executeSetupPhase2()` 내부에서 effort 메뉴 Enter(`proc.write('\r')`) 전송 후 동기적으로 `worker.setupDone = true` 설정 (line 1182-1183).
2. 이 시점에서 **메뉴 닫힘 애니메이션은 아직 진행 중**. Claude Code TUI의 입력 포커스가 prompt로 완전히 복귀하기까지 ~수십 ms의 전이 구간 존재.
3. active polling의 setInterval은 500ms 주기로 독립 실행 중이며, `setupDone=true`가 되는 순간 다음 tick에서 `isReady && !needsSetup` 체크를 통과할 수 있다.
4. `isReady()`(`terminal-interface.js:60`)는 `❯` + `for shortcuts` 두 문자열의 동시 존재만 본다. 메뉴 닫힘 과정에서 이 두 문자열이 먼저 복구되고 입력 핸들러가 마지막으로 복구될 수 있다 → **false-positive ready**.
5. 이 순간 `_writeTaskAndEnter(proc, fullTask)` 실행:
   - `_chunkedWrite`로 text 청크 전송
   - 100ms 대기
   - `proc.write('\r')` 전송
6. TUI가 아직 menu-close 전이 상태면 text의 일부 또는 전부가 메뉴 잔여 입력으로 소비되고, CR이 menu confirm으로 재해석되거나 노쓰롭된다. **결과: prompt에는 task 일부만 남고 Enter 안 먹힘.**

`_pendingTaskSent = true`가 await 이전에 설정되므로 post-setup trigger(2s 뒤)와 timeout fallback(30s 뒤)이 **재시도하지 않고 early return**한다. "한 번 실패하면 회복 불가" 구조.

후보 A가 유력한 이유:
- 3개 worker가 동시 기동 시 Windows conpty가 공유되어 렌더링 지연 증가 → 전이 윈도우가 100ms보다 길어질 가능성 ↑
- 3개 동시 실패는 환경적 load와 일치하는 패턴
- 5.51의 post-setup trigger(2s 대기)는 안전하지만 active polling은 먼저 fire하면 win-race
- isReady 패턴이 `❯` + `for shortcuts`라는 단순 문자열 두 개 — 메뉴 overlay 해제 순서에 따라 둘 다 true인 transient 존재 가능

#### 후보 B — `_chunkedWrite` 단일-청크 fast path의 drain 누락

`pty-manager.js:3160-3164`:
```javascript
async _chunkedWrite(proc, text, chunkSize = 500, delayMs = 50) {
  if (text.length <= chunkSize) {
    proc.write(text);
    return;  // drain 대기 없음
  }
  // 청크 루프 — !ok면 'drain' 이벤트 대기
}
```

500자 이하 짧은 task text(대부분)는 짧은 경로로 처리돼 drain을 기다리지 않는다. `proc.write`가 백프레셔로 false를 반환해도 무시. 그 상태에서 `_writeTaskAndEnter`가 100ms 뒤 `proc.write('\r')`을 호출하면 CR이 **아직 flush 안 된 text 앞에 끼어들거나** conpty 내부 큐잉 순서가 역전될 가능성. 3-worker 병렬 기동 시 버퍼 압력이 높아 발생 확률 ↑.

동일 패턴이 긴 청크 루프의 **마지막 청크**에도 있다: 마지막 `proc.write(chunk)`의 리턴 값이 true여도 flush는 미보장. Windows conpty는 write 수락과 child read가 비동기이므로 100ms가 타이트한 예산.

#### 후보 C — timeout fallback의 setupDone 가드 부재

`_createAndSendTask()` timeout fallback(line 1098-1119):
```javascript
w._pendingTaskTimeoutTimer = setTimeout(async () => {
  if (w._pendingTaskTimer) { clearInterval(...) }
  const worker = this.workers.get(entry.name);
  if (worker && worker.alive && worker._pendingTask && !worker._pendingTaskSent) {
    worker._pendingTaskSent = true;
    // setupDone/setupPhase 체크 없음!
    ...
    await this._writeTaskAndEnter(worker.proc, fullTask);
    ...
  }
}, pendingTimeoutMs);  // 30000ms
```

30초 초과 시 세팅 상태 관계없이 강제 전송. 정상 케이스에선 안 도달하지만 effort 메뉴 검출 실패·retry 지연 등으로 setup이 30초를 넘기면 메뉴 활성 상태에서 task 전송 → 동일 증상. 3-worker 동시 기동 시 setup polling이 순차적으로 처리되며 뒤쪽 워커의 setup이 지연돼 fallback에 도달할 가능성.

#### 후보 D — enterDelayMs=100ms가 Windows conpty 부하 상황에서 부족

5.18에서 `send()`에 100ms가 적용돼 동작하는 것이 확인됐지만, `send()`는 일반적으로 짧은 텍스트를 한 번에 다룬다. pendingTask는 rules summary + scope guard + context + 실제 task로 최대 1000자에 가까운 텍스트를 청크 분할로 보낼 수 있다.

Windows conpty의 write→child read 지연은 평시 10-30ms 수준이지만 3 worker 동시 렌더링이면 50-150ms까지 늘어날 수 있다(node-pty 이슈 트래커의 유사 보고 참조). 100ms는 이 영역에 들어가는 경계값.

### 권장 수정 방향 (검증 필요)

1. **active polling에 "setupDone 안정화" 지연 추가** (후보 A 대응)
   - `needsSetup = effortLevel && !worker.setupDone` 외에 `worker._setupStableAt` 같은 timestamp 추가
   - `_executeSetupPhase2`에서 setupDone=true 설정 시 `_setupStableAt = Date.now() + 1000` 기록
   - active polling에서 `Date.now() < _setupStableAt`이면 한 tick 더 대기
   - 결과: menu close 애니메이션이 끝날 때까지 최소 1초 보장

2. **isReady 검증 강화: 연속 2회 ready 요구** (후보 A 보조)
   - active polling에서 첫 tick에 isReady면 `_readyCount++`, 아니면 리셋
   - `_readyCount >= 2`일 때만 실제 전송 (최소 500ms 연속 ready 확인)

3. **timeout fallback에 setupDone 가드 추가** (후보 C 대응)
   - `if (!worker.setupDone) { reschedule fallback }` 또는 단순히 setupNeeded면 skip하고 active polling 재시작

4. **`_chunkedWrite` 단일-청크 경로에도 drain 동기화** (후보 B 대응)
   - `if (!ok) await new Promise(resolve => proc.once('drain', resolve));`를 fast path에도 적용
   - 청크 루프의 마지막 write 이후에도 drain 확인

5. **enterDelayMs 환경 변수화** (후보 D 대응)
   - `config.workerDefaults.enterDelayMs` 추가 (default 200ms로 상향)
   - Windows conpty 부하 상황에서 250-500ms까지 조정 가능하도록

### 재현·검증 플랜

1. **OS 비교**: Windows(conpty)와 Linux(ptmx)에서 3-worker 배치 기동 (`c4 batch --count 3 --auto-mode "간단 작업"`) 후 Enter 인식 실패율 측정. Linux에서 발생하지 않으면 conpty 특성 확정.
2. **타이밍 로깅**: `_writeTaskAndEnter` 내부에 `Date.now()` 기록 → text write 시작/완료/CR 전송 시각을 `worker.snapshots`에 남겨 사후 분석.
3. **수정 효과 측정**: 위 권장안 1+3을 먼저 적용(가장 가설 A에 직접 대응), 10회 연속 3-worker 기동 실패율 비교.
4. **회귀 방지 테스트**: `tests/setup-done-race.test.js` 신설 — setupDone=true 직후 isReady가 transient true가 되는 가짜 PTY 모킹으로 active polling이 메뉴 전이 중 전송을 하지 않는지 검증.

### 미해결 질문

- Claude Code 2.x의 실제 메뉴 close 애니메이션 타이밍(ms 단위)?
- Windows conpty에서 `proc.write` → child read 지연의 분포? (3-worker vs 1-worker 비교)
- `isReady` false-positive가 실제로 얼마나 자주 발생하는가? (스냅샷 샘플링 필요)

이 3개 질문은 코드만 보고 답할 수 없고 실측이 필요. 본 분석은 **코드 경로 검토 기반 가설**이며 실측으로 가설 A/B/C/D의 기여도 분리가 필요하다.
