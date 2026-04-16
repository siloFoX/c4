// PreToolUse hook: warn on compound commands (&&, ||, |, ;)
// Changed from block(exit 2) to warning(exit 0) — blocking stalls workers completely
// Used by _buildCompoundBlockCommand() in pty-manager.js
let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const j = JSON.parse(d);
    const cmd = j.tool_input && j.tool_input.command || '';
    if (/&&|\|\||(?<![>12])\||;/.test(cmd)) {
      console.error('WARNING: compound commands (&&, ||, |, ;) detected. Use single commands instead.');
      // exit 0 = allow but warn (was exit 2 = block, which stalled workers)
    }
  } catch {}
  process.exit(0);
});
