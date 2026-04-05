# 5.13 L4 Critical Deny List

## 목표
L4(full autonomy)에서도 파괴적 명령은 절대 차단. 현재 L4는 모든 deny를 approve로 override하는데, critical 명령은 예외 처리.

## 수정: src/pty-manager.js

### 1. critical deny list 상수 추가 (파일 상단 상수 영역에)
```js
const CRITICAL_DENY_PATTERNS = [
  /\brm\s+-rf\s+[\/\\]/,
  /\bgit\s+push\s+--force/,
  /\bgit\s+push\s+-f\b/,
  /\bDROP\s+(TABLE|DATABASE)/i,
  /\bsudo\s+rm\b/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\bgit\s+reset\s+--hard\s+origin/,
];
```

### 2. L4 override 로직 수정 (약 1774~1788번 줄)
L4에서 deny를 approve로 override하기 전에, command가 CRITICAL_DENY_PATTERNS에 매치되면 deny 유지:
```js
if (autonomyLevel >= 4 && action === 'deny') {
  const command = this._extractBashCommand(screenText) || '';
  // Critical commands are NEVER auto-approved, even at L4
  const isCritical = CRITICAL_DENY_PATTERNS.some(p => p.test(command));
  if (isCritical) {
    // Log but do NOT override
    worker.snapshots.push({
      time: Date.now(),
      screen: `[AUTONOMY L4 BLOCKED] critical command denied: ${command.substring(0, 100)}`,
      autoAction: true
    });
    // Notify via Slack if available
    if (this._notifications) {
      this._notifications.notifyStall(worker._taskText ? 'worker' : 'unknown', `CRITICAL DENY: ${command.substring(0, 80)}`);
    }
    return 'deny';
  }
  // ... existing L4 override logic
}
```

## 테스트 추가
tests/에 critical-deny.test.js 추가. CRITICAL_DENY_PATTERNS 각 패턴에 대해 매칭 테스트.

## 문서
- TODO.md: 5.13 done 표시
- CHANGELOG.md: 최상단에 버전 추가
- patches/ 추가

npm test 후 커밋. 메시지: `feat: add L4 critical deny list - block destructive commands even in full autonomy (5.13)`
