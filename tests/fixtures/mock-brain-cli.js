#!/usr/bin/env node
'use strict';

// Test fixture for ClaudeBrainProvider — stands in for the `claude`
// binary. Reads a prompt from stdin, echoes a deterministic reply
// to stdout so the spawn-and-parse code path can be exercised
// without invoking real Claude.
//
// Usage from a test:
//   const provider = new ClaudeBrainProvider({
//     command: process.execPath,
//     args: [require.resolve('./fixtures/mock-brain-cli.js'), 'accept'],
//   });
//
// Modes (passed as argv[2]):
//   accept   reply with [VOTE: accept]
//   object   reply with [VOTE: object — fixture]
//   crash    exit 1 with stderr noise
//   slow     sleep 5s before replying (for timeout tests)
//   echo     echo the stdin prompt verbatim (no vote marker)

const mode = process.argv[2] || 'accept';
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  switch (mode) {
    case 'accept':
      process.stdout.write(`mock reply for: ${prompt.slice(0, 40)}…\n[VOTE: accept]\n`);
      process.exit(0);
      break;
    case 'object':
      process.stdout.write(`mock objection\n[VOTE: object — fixture]\n`);
      process.exit(0);
      break;
    case 'crash':
      process.stderr.write('fixture crash\n');
      process.exit(1);
      break;
    case 'slow':
      setTimeout(() => {
        process.stdout.write('finally [VOTE: accept]\n');
        process.exit(0);
      }, 5000);
      break;
    case 'echo':
      process.stdout.write(prompt);
      process.exit(0);
      break;
    default:
      process.stderr.write(`unknown mode: ${mode}\n`);
      process.exit(2);
  }
});
