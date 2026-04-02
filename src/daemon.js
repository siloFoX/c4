const http = require('http');
const PtyManager = require('./pty-manager');

const manager = new PtyManager();
const cfg = manager.getConfig();
const PORT = parseInt(process.env.PORT || cfg.daemon?.port || '3456');
const HOST = cfg.daemon?.host || '127.0.0.1';

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

async function handleRequest(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const url = new URL(req.url, `http://${HOST}`);
  const route = url.pathname;

  try {
    let result;

    if (req.method === 'GET' && route === '/health') {
      result = { ok: true, workers: manager.list().workers.length };

    } else if (req.method === 'POST' && route === '/create') {
      const { name, command, args, target, cwd } = await parseBody(req);
      result = manager.create(name, command, args || [], { target, cwd });

    } else if (req.method === 'POST' && route === '/send') {
      const { name, input, keys } = await parseBody(req);
      result = manager.send(name, input, keys || false);

    } else if (req.method === 'GET' && route === '/read') {
      const name = url.searchParams.get('name');
      result = manager.read(name);

    } else if (req.method === 'GET' && route === '/read-now') {
      const name = url.searchParams.get('name');
      result = manager.readNow(name);

    } else if (req.method === 'GET' && route === '/wait-read') {
      const name = url.searchParams.get('name');
      const timeout = parseInt(url.searchParams.get('timeout') || '120000');
      result = await manager.waitAndRead(name, timeout);

    } else if (req.method === 'GET' && route === '/list') {
      result = manager.list();

    } else if (req.method === 'POST' && route === '/task') {
      const { name, task, branch, useBranch } = await parseBody(req);
      result = manager.sendTask(name, task, { branch, useBranch });

    } else if (req.method === 'POST' && route === '/close') {
      const { name } = await parseBody(req);
      result = manager.close(name);

    } else if (req.method === 'GET' && route === '/config') {
      result = manager.getConfig();

    } else if (req.method === 'POST' && route === '/config/reload') {
      result = manager.reloadConfig();

    } else {
      res.writeHead(404);
      result = { error: 'Not found' };
    }

    if (result.error) {
      res.writeHead(400);
    } else {
      res.writeHead(200);
    }
    res.end(JSON.stringify(result));

  } catch (err) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  }
}

const server = http.createServer(handleRequest);

server.listen(PORT, HOST, () => {
  console.log(`C4 daemon running on http://${HOST}:${PORT}`);
});

process.on('SIGINT', () => {
  manager.closeAll();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  manager.closeAll();
  server.close();
  process.exit(0);
});
