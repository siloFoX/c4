# auto-mgr idle 후 자동 작업 재개 불가

## 원인

### 핵심 원인: idle 콜백에 "다음 작업 할당" 로직 부재

auto-mgr이 태스크를 완료하고 idle 상태가 되면, idle 타이머 콜백이 정상적으로 실행되지만 **다음 태스크를 자동으로 시작하는 코드가 없다.**

**idle 감지 흐름** (`pty-manager.js:2173-2467`):

1. PTY의 `onData` 이벤트 발생 시 idle 타이머 초기화 (line 2174)
2. 새 idle 타이머 설정 - `AdaptivePolling.getInterval()` 기반 (500ms~5000ms) (line 2175-2177)
3. idle 타임아웃 시 콜백 실행 (line 2178-2467)

**콜백 내부에서 태스크 전송은 단 한 곳** (line 2246):

```javascript
if (worker._pendingTask && !worker._pendingTaskSent) {
  // 부트스트랩 시점의 대기 태스크만 전송
  return; // 조기 종료
}
```

이 조건은 워커 초기 설정 시 `_pendingTask`에 저장된 태스크만 처리한다. 첫 태스크 완료 후 `_pendingTask`는 null이 되므로, 이후 idle 콜백은 스냅샷 캡처(line 2462-2465)만 하고 종료한다.

### 태스크 큐 처리가 트리거되는 곳 (2곳뿐)

| 위치 | 트리거 조건 | 문제점 |
|------|------------|--------|
| `pty-manager.js:2513` (proc.onExit) | 워커 프로세스 종료 시 | 워커가 죽어야 실행됨 - idle 워커에는 해당 없음 |
| `pty-manager.js:2855` (healthCheck) | 30초 주기 헬스체크 | `_taskQueue`만 처리 - idle 워커에 재할당하지 않음 |

### `_processQueue()` 함수의 한계 (`pty-manager.js:852-910`)

`_processQueue()`는 다음 조건의 태스크만 처리한다:
- 워커가 아직 생성되지 않은 경우
- 의존성(`after` 옵션) 완료 대기 중인 경우
- max workers 제한으로 대기 중인 경우

**이미 존재하고 idle 상태인 워커에 새 태스크를 할당하는 로직은 없다.**

### auto 모드 시작 로직 (`pty-manager.js:3220-3239`)

```javascript
// autoStart()
// 1. auto-mgr 워커 생성
// 2. _globalAutoMode = true 설정
// 3. sendTask()로 초기 태스크 전송
// 4. 후속 태스크 전송 메커니즘 없음
```

## 영향

- `c4 auto` 워크플로우가 단일 태스크 실행 후 멈춤
- 사용자가 매번 `c4 task auto-mgr "다음 작업"` 수동 입력 필요
- auto 모드의 "자동" 의미가 퇴색 - 실질적으로 수동 모드와 차이 없음
- 연속 작업 시나리오(빌드-테스트-배포 등)에서 자동화 불가

## 해결 방안

### 방안 1: idle 콜백에 큐 확인 로직 추가

idle 타이머 콜백(`pty-manager.js:2246` 부근)에서 `_pendingTask` 확인 후, 태스크 큐에서 해당 워커용 다음 태스크를 자동으로 할당하는 로직 추가.

```
idle 감지 -> _pendingTask 확인 -> 없으면 _taskQueue에서 이 워커용 태스크 검색 -> 있으면 sendTask()
```

- 장점: 기존 idle 감지 인프라 활용, 변경 최소화
- 단점: idle 콜백의 복잡도 증가

### 방안 2: 워커별 개인 태스크 큐 도입

각 워커에 `_workerTaskQueue` 배열을 추가하여 여러 태스크를 미리 할당. 태스크 완료 감지 시 자동으로 다음 태스크 dequeue.

- 장점: 워커별 독립적 작업 흐름 관리 가능
- 단점: 태스크 완료 감지 로직 추가 필요, 구조 변경 큼

### 방안 3: 태스크 완료 이벤트 기반 재개

Claude의 출력에서 태스크 완료 패턴(예: 프롬프트 복귀)을 감지하는 이벤트를 추가하고, 이 이벤트가 `_processQueue()`를 트리거하되 idle 워커도 대상에 포함하도록 확장.

- 장점: 이벤트 기반으로 깔끔한 설계
- 단점: 완료 패턴 감지의 신뢰성 확보 필요

## 추천안

**방안 1 (idle 콜백에 큐 확인 로직 추가)** 추천.

이유:
1. 기존 idle 감지 인프라가 정상 동작하므로 그 위에 로직만 추가하면 됨
2. `_processQueue()` 함수를 확장하여 idle 워커 재할당을 지원하면 방안 3의 장점도 일부 흡수
3. 변경 범위가 `pty-manager.js`의 idle 콜백과 `_processQueue()` 두 곳으로 한정
4. 기존 `_taskQueue` 자료구조를 그대로 활용 가능

구체적으로:
- idle 콜백(line 2246 부근)에서 `_pendingTask`가 없을 때 `_taskQueue`에서 현재 워커명과 매칭되는 태스크를 검색
- 매칭 태스크가 있으면 `sendTask()`로 전송
- `_processQueue()`에 idle 워커 감지 로직 추가하여 healthCheck에서도 자동 할당 가능하게 함
