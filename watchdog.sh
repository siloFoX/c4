#!/bin/bash
# C4 Watchdog — keeps daemon and manager alive
# Run: nohup bash watchdog.sh &

C4="node $(dirname "$0")/src/cli.js"
LOG="$(dirname "$0")/logs/watchdog.log"
CHECK_INTERVAL=60  # seconds

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"
}

log "Watchdog started"

while true; do
  # 1. Check daemon
  HEALTH=$($C4 health 2>/dev/null)
  if echo "$HEALTH" | grep -q '"ok": true'; then
    : # daemon alive
  else
    log "Daemon dead. Restarting..."
    $C4 daemon start >> "$LOG" 2>&1
    sleep 5
  fi

  # 2. Check manager worker
  LIST=$($C4 list 2>/dev/null)
  if echo "$LIST" | grep -q "manager"; then
    STATUS=$(echo "$LIST" | grep "manager" | awk '{print $2}')
    if [ "$STATUS" = "exited" ]; then
      log "Manager exited. Recreating..."
      $C4 close manager >> "$LOG" 2>&1
      $C4 new manager claude >> "$LOG" 2>&1
      sleep 30
      # Resend mission
      $C4 send manager "너는 C4 프로젝트의 자율 개발 관리자야. TODO.md를 읽고 남은 작업을 순서대로 개발해. c4 new/task/wait/read/close로 작업자를 관리하고, 완료되면 머지하고 push해. 규칙: 복합 명령 금지, git -C 사용, c4 wait 사용, main 직접 커밋 금지, 단위 작업마다 구현→테스트→문서→커밋." >> "$LOG" 2>&1
      $C4 key manager Enter >> "$LOG" 2>&1
      log "Manager recreated and mission sent"
    fi
  else
    log "Manager not found. Creating..."
    $C4 new manager claude >> "$LOG" 2>&1
    sleep 30
    $C4 send manager "너는 C4 프로젝트의 자율 개발 관리자야. TODO.md를 읽고 남은 작업을 순서대로 개발해. c4 new/task/wait/read/close로 작업자를 관리하고, 완료되면 머지하고 push해. 규칙: 복합 명령 금지, git -C 사용, c4 wait 사용, main 직접 커밋 금지, 단위 작업마다 구현→테스트→문서→커밋." >> "$LOG" 2>&1
    $C4 key manager Enter >> "$LOG" 2>&1
    log "Manager created and mission sent"
  fi

  # 3. Check scribe
  SCRIBE=$($C4 scribe status 2>/dev/null)
  if echo "$SCRIBE" | grep -q "stopped"; then
    log "Scribe stopped. Starting..."
    $C4 scribe start >> "$LOG" 2>&1
  fi

  sleep $CHECK_INTERVAL
done
