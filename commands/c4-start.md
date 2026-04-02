# /c4-start

C4 데몬을 시작하고 상태를 확인합니다.

## Steps

1. 기존 데몬이 돌고 있는지 확인:
   ```bash
   c4 health 2>/dev/null || echo "NOT_RUNNING"
   ```

2. 안 돌고 있으면 시작:
   ```bash
   nohup node $(npm root -g)/c4-cli/src/daemon.js > /dev/null 2>&1 & disown
   ```

3. 시작 확인:
   ```bash
   sleep 2 && c4 health
   ```
