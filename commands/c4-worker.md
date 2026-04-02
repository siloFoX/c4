# /c4-worker

C4 작업자를 생성하고 작업을 지시합니다.

## Arguments
- `<name>` — 작업자 이름
- `[--target dgx|local]` — 실행 위치 (기본: local)

## Steps

1. 데몬 확인:
   ```bash
   c4 health
   ```

2. 작업자 생성:
   ```bash
   c4 new <name> claude --target <target>
   ```

3. 신뢰 프롬프트 대기 후 승인:
   ```bash
   c4 wait <name> 30000
   c4 key <name> Enter
   ```

4. Claude Code 로딩 대기:
   ```bash
   c4 wait <name> 15000
   ```

5. 작업자 준비 완료. 이제 작업 지시:
   ```bash
   c4 send <name> "작업 내용"
   c4 key <name> Enter
   c4 wait <name> 120000
   ```
