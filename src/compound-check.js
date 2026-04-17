// PreToolUse hook: warn on compound commands (&&, ||, |, ;)
// Changed from block(exit 2) to warning(exit 0) -- blocking stalls workers completely
// Used by _buildCompoundBlockCommand() in pty-manager.js
// IMPORTANT (7.16): All stderr output MUST be ASCII only. Windows PTY mangles
// non-ASCII bytes to "?" which then repeats as "Failed with non-blocking status
// code" noise and triggers false escalation.
let d = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const j = JSON.parse(d);
    const cmd = j.tool_input && j.tool_input.command || '';
    if (/&&|\|\||(?<![>12])\||;/.test(cmd)) {
      process.stderr.write('WARNING: compound commands (&&, ||, |, ;) detected. Use single commands instead.\n');
      // exit 0 = allow but warn (was exit 2 = block, which stalled workers)
    }
  } catch {
    // Swallow parse errors silently -- never emit non-ASCII or localized errors
  }
  process.exit(0);
});
