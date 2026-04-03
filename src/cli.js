#!/usr/bin/env node

// Git Bash (MSYS2) path conversion fix
// MSYS converts /path args to C:/Program Files/Git/path before Node sees them.
// Set MSYS_NO_PATHCONV=1 for any child processes this CLI spawns.
process.env.MSYS_NO_PATHCONV = '1';

// Restore already-converted paths in current process argv
function fixMsysArgs(argv) {
  if (!process.env.MSYSTEM) return argv; // not Git Bash

  // Determine the Git Bash install prefix (e.g. "C:/Program Files/Git")
  const exepath = process.env.EXEPATH || '';
  const prefixes = [];
  if (exepath) {
    prefixes.push(exepath.replace(/\\/g, '/').replace(/\/+$/, '') + '/');
  }
  prefixes.push('C:/Program Files/Git/');

  return argv.map(arg => {
    for (const prefix of prefixes) {
      if (arg.startsWith(prefix)) {
        return '/' + arg.slice(prefix.length);
      }
      // Handle backslash variant
      const bsPrefix = prefix.replace(/\//g, '\\');
      if (arg.startsWith(bsPrefix)) {
        return '/' + arg.slice(bsPrefix.length).replace(/\\/g, '/');
      }
    }
    return arg;
  });
}

process.argv = fixMsysArgs(process.argv);

const http = require('http');

const BASE = process.env.C4_URL || 'http://127.0.0.1:3456';

function request(method, path, body = null, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.on('error', (err) => reject(new Error(`Daemon not running? ${err.message}`)));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  try {
    let result;

    switch (cmd) {
      case 'new': {
        const name = args[0];
        // Parse --target and --cwd flags
        let target = 'local', cwd = '';
        const filteredArgs = [];
        let command = 'claude';
        let commandSet = false;
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--target' && args[i + 1]) { target = args[++i]; }
          else if (args[i] === '--cwd' && args[i + 1]) { cwd = args[++i]; }
          else if (!commandSet) { command = args[i]; commandSet = true; }
          else { filteredArgs.push(args[i]); }
        }
        result = await request('POST', '/create', { name, command, args: filteredArgs, target, cwd });
        break;
      }

      case 'send': {
        const name = args[0];
        const input = args.slice(1).join(' ');
        result = await request('POST', '/send', { name, input });
        break;
      }

      case 'task': {
        const name = args[0];
        let branch = '', useBranch = true;
        const taskParts = [];
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--branch' && args[i + 1]) { branch = args[++i]; }
          else if (args[i] === '--no-branch') { useBranch = false; }
          else { taskParts.push(args[i]); }
        }
        const task = taskParts.join(' ');
        result = await request('POST', '/task', { name, task, branch, useBranch });
        break;
      }

      case 'key': {
        const name = args[0];
        const input = args[1];
        result = await request('POST', '/send', { name, input, keys: true });
        break;
      }

      case 'read': {
        // Read new snapshots (only idle/finished states)
        const name = args[0];
        result = await request('GET', `/read?name=${name}`);
        if (result.content !== undefined) {
          if (result.content) {
            process.stdout.write(result.content + '\n');
          }
          process.stderr.write(`--- status=${result.status} snapshots=${result.snapshotsRead || 0} ---\n`);
          return;
        }
        break;
      }

      case 'read-now': {
        // Read current screen immediately (even if busy)
        const name = args[0];
        result = await request('GET', `/read-now?name=${name}`);
        if (result.content !== undefined) {
          process.stdout.write(result.content + '\n');
          process.stderr.write(`--- status=${result.status} ---\n`);
          return;
        }
        break;
      }

      case 'wait': {
        // Wait until idle, then read
        const name = args[0];
        const timeout = args[1] || '120000';
        process.stderr.write('Waiting for worker to become idle...\n');
        result = await request('GET', `/wait-read?name=${name}&timeout=${timeout}`, null, parseInt(timeout) + 5000);
        if (result.content !== undefined) {
          process.stdout.write(result.content + '\n');
          process.stderr.write(`--- status=${result.status} ---\n`);
          return;
        }
        break;
      }

      case 'list': {
        result = await request('GET', '/list');
        if (result.workers) {
          if (result.workers.length === 0) {
            console.log('No workers running.');
          } else {
            console.log('NAME\t\tSTATUS\t\tUNREAD\tCOMMAND');
            for (const w of result.workers) {
              console.log(`${w.name}\t\t${w.status}\t\t${w.unreadSnapshots}\t${w.command}`);
            }
          }
          return;
        }
        break;
      }

      case 'close': {
        const name = args[0];
        result = await request('POST', '/close', { name });
        break;
      }

      case 'health': {
        result = await request('GET', '/health');
        break;
      }

      case 'config': {
        if (args[0] === 'reload') {
          result = await request('POST', '/config/reload');
          console.log('Config reloaded.');
        } else {
          result = await request('GET', '/config');
        }
        break;
      }

      default:
        console.log(`Usage: c4 <command> [args]

Commands:
  new <name> [command] [--target dgx|local] [--cwd path]   Create a worker
  task <name> <text> [--branch name] [--no-branch]        Send task with auto branch
  send <name> <text>               Send raw text to worker
  key <name> <key>                 Send special key (Enter, C-c, C-b, Tab, etc.)
  read <name>                      Read new output (idle snapshots only)
  read-now <name>                  Read current screen immediately
  wait <name> [timeout_ms]         Wait until idle, then read screen
  list                             List all workers
  close <name>                     Close a worker
  health                           Check daemon status
  config                           Show current config
  config reload                    Reload config.json without restart

Special keys: Enter, C-c, C-b, C-d, C-z, C-l, C-a, C-e, Escape, Tab, Backspace, Up, Down, Left, Right

Examples:
  c4 new arps claude                          # 로컬
  c4 new arps claude --target dgx              # DGX 원격
  c4 new arps claude --target dgx --cwd /home/shinc/arps
  c4 send arps "ARPS에 로깅 추가해줘"
  c4 key arps Enter
  c4 wait arps                  # idle까지 기다렸다가 깨끗한 화면 반환
  c4 read-now arps              # 지금 당장 화면 보기 (스피너 포함)
  c4 list
  c4 close arps`);
        return;
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
