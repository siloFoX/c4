// PreToolUse hook: block compound commands (&&, ||, |, ;)
// Used by _buildCompoundBlockCommand() in pty-manager.js
let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const j = JSON.parse(d);
    const cmd = j.tool_input && j.tool_input.command || '';
    if (/&&|\|\||[|;]/.test(cmd)) {
      console.error('BLOCKED: compound commands (&&, ||, |, ;) are not allowed. Use single commands.');
      process.exit(2);
    }
  } catch {}
  process.exit(0);
});
