# Slack _getLastActivity가 의미있는 내용을 보내지 못하는 문제

## 원인

events.jsonl 기반 아키텍처는 올바르게 구현되어 있으나, **hook 이벤트가 실제로 기록되지 않아** events.jsonl 파일이 생성되지 않는다.

### 데이터 흐름 분석

```
[Claude Code Worker]
  ↓ PreToolUse/PostToolUse hook 발생
  ↓ powershell로 HTTP POST 전송
[Daemon /hook-event 엔드포인트]  ← daemon.js:214-222
  ↓ manager.hookEvent(workerName, body) 호출
[hookEvent()]  ← pty-manager.js:286-327
  ↓ hookEntry 생성 (line 295-298)
  ↓ _appendEventLog(workerName, hookEntry) 호출 (line 310)
[_appendEventLog()]  ← pty-manager.js:457-472
  ↓ logs/events-<workerName>.jsonl에 append
[_getLastActivity()]  ← pty-manager.js:712-759
  ↓ logs/events-<workerName>.jsonl 읽기
  ↓ 마지막 20줄에서 tool_name 추출
  ↓ "Edit: foo.js, Write: bar.js" 형태 반환
[_fmtWorker()]  ← notifications.js:384-400
  ↓ Slack 메시지에 lastActivity 포함
```

### 경로 일치 여부

| 구분 | 경로 패턴 | 일치 |
|------|-----------|------|
| 쓰기 (_appendEventLog, line 466) | `path.join(this.logsDir, 'events-${workerName}.jsonl')` | O |
| 읽기 (_getLastActivity, line 718) | `path.join(this.logsDir, 'events-${workerName}.jsonl')` | O |
| logsDir getter (line 142-144) | `path.join(__dirname, '..', 'logs')` | - |

경로 자체는 동일하다. 문제는 경로가 아니라 **데이터가 도착하지 않는 것**이다.

### 실제 파일 시스템 확인

`logs/` 디렉토리에 `events-*.jsonl` 파일이 존재하지 않는다. `*.raw.log` 파일만 존재한다.

이는 hook 이벤트가 daemon에 도달하지 않거나, `_appendEventLog()`가 호출되지 않는다는 뜻이다.

### 의심되는 원인 3가지

**1. Hook 설정의 workerName 전달 문제**

`.claude/settings.json`의 hook 명령:
```
powershell -NoProfile -Command "$input = [Console]::In.ReadToEnd(); Invoke-RestMethod -Uri 'http://127.0.0.1:3456/hook-event' -Method Post -ContentType 'application/json' -Body $input"
```

Hook은 stdin으로 이벤트 JSON을 받아 daemon에 POST한다. 하지만 이 JSON에 **workerName이 포함되어 있지 않을 수 있다**. Claude Code의 hook payload에는 `session_id`는 있지만, 커스텀 `workerName` 필드는 없다.

daemon.js의 `/hook-event` 핸들러(line 214-222)에서 workerName을 어떻게 결정하는지가 핵심이다.

**2. Daemon이 실행 중이 아닌 경우**

워커가 시작될 때 daemon이 아직 준비되지 않았거나, 포트 3456이 사용 불가한 경우 hook POST가 실패한다. 실패는 조용히 무시된다 (powershell의 Invoke-RestMethod 에러가 hook의 exit code에 반영되지만, Claude Code가 이를 무시할 수 있다).

**3. _getLastActivity의 fallback 동작**

events.jsonl이 없으면 fallback으로 `w._taskText`의 첫 줄을 반환한다 (line 750-754):
```javascript
if (w._taskText) {
  const firstLine = w._taskText.split(/[\n.]/)[0].trim();
  if (firstLine) return firstLine.substring(0, 80);
}
```

이것이 현재 Slack에 보이는 "의미없는 내용"일 가능성이 높다 - task 설명의 첫 문장만 반복 표시.

### _getLastActivity의 필수 필드 요건

```javascript
const tool = evt.tool_name;        // 필수 - 없으면 skip (line 730)
const input = evt.tool_input || {}; // 선택
const file = input.file_path || input.command || ''; // 선택
```

hook 이벤트가 도착하더라도 `tool_name` 필드가 없으면 모든 이벤트가 skip된다.

### 테스트 커버리지

- `tests/hook-event-log.test.js` (16개 테스트): _appendEventLog 쓰기 검증 - 통과
- `tests/stall-detection.test.js` (line 58-177): _getLastActivity 읽기 검증 - 통과

단위 테스트는 모두 통과한다. 문제는 **통합 수준**에서 hook 이벤트가 daemon까지 도달하는 전체 경로이다.

## 영향

- Slack 알림에 워커의 실제 작업 내용(Edit, Write 등 tool 사용)이 표시되지 않음
- 대신 task 설명 첫 줄만 반복 표시되어 진행 상황 파악 불가
- 워커가 멈췄는지, 활발히 작업 중인지 구분 불가능
- stall detection에도 영향 가능 (events.jsonl 기반 활동 감지가 작동하지 않으면)

## 해결 방안

### 방안 1: Hook 이벤트 수신 경로 디버깅 및 수정

daemon의 `/hook-event` 엔드포인트에 로깅을 추가하여 실제로 요청이 도착하는지 확인한다.

확인 항목:
1. hook 명령이 실제로 실행되는지 (powershell 프로세스 확인)
2. POST 요청이 daemon에 도달하는지 (엔드포인트 로깅)
3. workerName이 올바르게 매핑되는지 (hookEvent 호출 시 파라미터)
4. _appendEventLog가 호출되는지 (메서드 내 로깅)

- 장점: 근본 원인 파악 가능
- 단점: 디버깅 단계이므로 수정은 원인에 따라 달라짐

### 방안 2: PTY 출력 파싱으로 fallback 활동 감지

events.jsonl이 없을 때, 워커의 raw.log (PTY 출력)에서 tool 사용 패턴을 파싱하여 활동을 추출한다. ANSI escape 제거 후 "Edit", "Write", "Bash" 등의 패턴을 감지한다.

- 장점: hook에 의존하지 않는 독립적 경로
- 단점: PTY 출력 파싱이 불안정할 수 있음, 정규식 유지보수 부담

### 방안 3: Hook 대신 PTY 출력에서 직접 이벤트 추출

`onData` 콜백(line 2154)에서 tool 사용 패턴을 감지하고 직접 `_appendEventLog()`를 호출한다. Hook 의존성을 제거한다.

- 장점: 외부 HTTP 통신 불필요, 동기적으로 확실히 기록
- 단점: PTY 출력 형식 변경에 취약, 파싱 로직 복잡

## 추천안

**방안 1 우선 실행 후, 필요 시 방안 2 병행**.

이유:
- events.jsonl 기반 아키텍처 자체는 올바르게 설계되어 있고, 테스트도 통과한다
- 문제는 hook -> daemon 간 통합 경로에 있으므로, 디버깅으로 정확한 단절 지점을 찾는 것이 우선
- 가능한 단절 지점: (a) hook 명령 미실행, (b) daemon 미수신, (c) workerName 매핑 실패
- 단절 지점이 확인되면 최소한의 수정으로 해결 가능
- 방안 2는 hook 경로가 구조적으로 불안정할 경우의 보험으로 병행

디버깅 우선순위:
1. `daemon.js` `/hook-event` 핸들러에 요청 수신 로그 추가
2. `hookEvent()` 진입 시 workerName과 event 내용 로그 추가
3. 수동으로 hook 명령 실행하여 daemon 응답 확인
4. Claude Code가 hook stdin에 전달하는 JSON 구조 확인 (tool_name 필드 유무)
