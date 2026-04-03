# c4 send 텍스트가 입력창에 쌓이고 실행 안 되는 버그

## 원인

### 핵심 메커니즘

`send()` 메서드(src/pty-manager.js:2533-2567)는 입력 텍스트에 `\r`(Enter)을 붙인 뒤 `_chunkedWrite()`로 전달한다.

```javascript
// line 2563
this._chunkedWrite(w.proc, input + '\r');
```

`_chunkedWrite()`(line 2572-2585)는 텍스트가 500자를 초과하면 청크 분할 후 `setTimeout`으로 지연 전송한다.

```javascript
_chunkedWrite(proc, text, chunkSize = 500, delayMs = 50) {
  if (text.length <= chunkSize) {
    proc.write(text);    // 500자 이하: 즉시 전송 (안전)
    return;
  }
  for (let i = 0; i < text.length; i += chunkSize) {
    const chunk = text.slice(i, i + chunkSize);
    if (i === 0) {
      proc.write(chunk);  // 첫 청크: 즉시 전송
    } else {
      setTimeout(() => proc.write(chunk), delayMs * (i / chunkSize));  // 나머지: 지연 전송
    }
  }
}
```

### 버그 발생 조건

`\r`은 텍스트 끝에 붙으므로, 텍스트가 500자를 초과하면 `\r`이 두 번째 이후 청크에 포함된다. 이 청크는 `setTimeout`으로 비동기 전송되므로 다음 상황에서 `\r`이 유실된다:

| 조건 | 설명 |
|------|------|
| PTY 프로세스 종료 | setTimeout 콜백 실행 전에 worker가 죽으면 `\r` 유실 |
| 이벤트 루프 블로킹 | 50ms+ 지연 중 이벤트 루프가 멈추면 콜백 지연/유실 |
| proc.write() 실패 | try-catch 없음, 에러 시 무시됨 |
| 타이밍 경합 | 다른 write가 끼어들어 PTY 버퍼 오염 |

### 지연 시간 계산

| 텍스트 길이 | 청크 수 | `\r` 도달 지연 | 위험도 |
|------------|---------|---------------|--------|
| 500자 이하 | 1 | 0ms (즉시) | 안전 |
| 501-1000자 | 2 | 50ms | 중간 |
| 1001-1500자 | 3 | 100ms | 높음 |
| 1500자 초과 | 4+ | 150ms+ | 매우 높음 |

### 과거 수정 이력

커밋 `b34d638`에서 `input`에 `\r`을 붙이지 않던 버그를 수정했으나, `_chunkedWrite`의 타이밍 레이스 문제는 해결되지 않았다.

### 동일 패턴이 존재하는 다른 호출처

| 위치 (line) | 메서드 | 코드 |
|------------|--------|------|
| 971 | `_completeSetupPhase1()` | `this._chunkedWrite(worker.proc, fullTask + '\r')` |
| 2010 | `merge()` | `this._chunkedWrite(w.proc, fullTask + '\r')` |
| 2251 | `_onScreenText()` | `this._chunkedWrite(proc, fullTask + '\r')` |
| 2447 | `_onScreenText()` | `this._chunkedWrite(proc, routineSkip.feedback + '\r')` |
| 2563 | `send()` | `this._chunkedWrite(w.proc, input + '\r')` |

모든 호출처가 동일한 레이스 컨디션에 노출되어 있다.

## 영향

- **사용자 경험**: `c4 send`로 긴 텍스트를 보내면 입력창에 텍스트만 쌓이고 실행되지 않음
- **오류 감지 불가**: `send()`는 항상 `{ success: true }`를 반환하므로 클라이언트에서 실패를 알 수 없음
- **광범위한 영향**: send뿐 아니라 setup, merge, onScreenText 등 5개 호출처 모두 동일한 문제
- **재현 조건**: 500자 초과 텍스트에서만 발생하므로 간헐적으로 보임

## 해결 방안

### 방안 1: `\r`을 청크 분할에서 분리하여 마지막에 동기적으로 보장

`_chunkedWrite`가 텍스트와 `\r`을 분리 처리하도록 변경. 모든 청크가 전송 완료된 후 `\r`을 별도로 전송한다.

```javascript
_chunkedWrite(proc, text, chunkSize = 500, delayMs = 50) {
  const endsWithCR = text.endsWith('\r');
  const body = endsWithCR ? text.slice(0, -1) : text;

  if (body.length <= chunkSize) {
    proc.write(text);  // 원본 그대로 (CR 포함)
    return;
  }

  let lastDelay = 0;
  for (let i = 0; i < body.length; i += chunkSize) {
    const chunk = body.slice(i, i + chunkSize);
    const delay = i === 0 ? 0 : delayMs * (i / chunkSize);
    if (i === 0) {
      proc.write(chunk);
    } else {
      setTimeout(() => proc.write(chunk), delay);
      lastDelay = delay;
    }
  }

  if (endsWithCR) {
    setTimeout(() => proc.write('\r'), lastDelay + delayMs);
  }
}
```

장점: 변경 최소, `\r` 전송 보장. 단점: 여전히 setTimeout 기반이라 근본적 레이스는 남음.

### 방안 2: Promise 기반 순차 전송으로 전환

`setTimeout` 대신 `async/await` + `drain` 이벤트를 사용하여 각 청크 전송 완료를 보장한다.

```javascript
async _chunkedWrite(proc, text, chunkSize = 500, delayMs = 50) {
  if (text.length <= chunkSize) {
    proc.write(text);
    return;
  }
  for (let i = 0; i < text.length; i += chunkSize) {
    const chunk = text.slice(i, i + chunkSize);
    const ok = proc.write(chunk);
    if (!ok) {
      await new Promise(resolve => proc.once('drain', resolve));
    }
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}
```

장점: 전송 순서 보장, 백프레셔 처리. 단점: 호출처 5곳 모두 async 대응 필요.

### 방안 3: 청크 분할 제거 + PTY 버퍼 크기 의존

500자 제한을 제거하고 `proc.write(text)`로 한 번에 전송. 대부분의 PTY는 수 KB 버퍼를 가지므로 일반 사용에서는 문제없다.

```javascript
_chunkedWrite(proc, text) {
  proc.write(text);
}
```

장점: 가장 단순, 레이스 컨디션 완전 제거. 단점: 극단적으로 긴 텍스트에서 PTY 버퍼 오버플로우 가능성.

## 추천안

**방안 2 (Promise 기반 순차 전송)** 추천.

이유:
- `\r` 전송을 구조적으로 보장하여 레이스 컨디션을 근본적으로 제거
- `drain` 이벤트로 백프레셔 처리하여 PTY 버퍼 오버플로우 방지
- 에러 핸들링 추가 가능 (try-catch로 감싸면 실패 시 호출처에 전달)
- 방안 1은 여전히 setTimeout 기반이라 불안정하고, 방안 3은 긴 텍스트에서 새로운 문제 유발 가능
