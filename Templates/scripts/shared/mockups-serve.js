/**
 * @framework-script 0.91.0
 *
 * Zero-dependency static file server for /mockups --serve (#2377).
 * Uses only Node built-ins (http, fs, path) — no npm dependencies, offline-safe.
 *
 * CLI:
 *   node mockups-serve.js --root <dir> [--port <N>]
 *
 * Programmatic:
 *   const { startServer, findAvailablePort, formatBanner } = require('./mockups-serve');
 *   const { server, port } = await startServer({ root, port });
 *
 * Port-in-use behavior: if the requested port is occupied, falls back to the
 * next free port via findAvailablePort and reports the actual port used.
 *
 * Rubrical Works (c) 2026
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function contentTypeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function resolveSafe(root, urlPath) {
  // Map "/" → "/index.html"; strip query/hash; prevent path traversal.
  let p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  if (p === '/' || p === '') p = '/index.html';
  const resolved = path.resolve(root, '.' + p);
  if (!resolved.startsWith(path.resolve(root))) return null;
  return resolved;
}

function handleRequest(root, req, res) {
  const filePath = resolveSafe(root, req.url || '/');
  if (!filePath) {
    res.statusCode = 400;
    res.end('400 Bad Request');
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('404 Not Found: ' + (req.url || '/'));
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', contentTypeFor(filePath));
    fs.createReadStream(filePath).pipe(res);
  });
}

function tryListen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener('listening', onListen);
      reject(err);
    };
    const onListen = () => {
      server.removeListener('error', onError);
      resolve(server.address().port);
    };
    server.once('error', onError);
    server.once('listening', onListen);
    server.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(preferred) {
  // Try preferred; on EADDRINUSE, let the OS assign a free port (listen 0).
  const probe = http.createServer();
  try {
    const actual = await tryListen(probe, preferred).catch(async (err) => {
      if (err && err.code === 'EADDRINUSE') {
        return tryListen(probe, 0);
      }
      throw err;
    });
    await new Promise((r) => probe.close(r));
    return actual;
  } catch (err) {
    try { probe.close(); } catch (_) { /* ignore */ }
    throw err;
  }
}

async function startServer({ root, port }) {
  if (!root) throw new Error('startServer: root is required');
  const requested = typeof port === 'number' ? port : 3000;
  const actualPort = requested === 0 ? 0 : await findAvailablePort(requested);
  const server = http.createServer((req, res) => handleRequest(root, req, res));
  const listenedPort = await tryListen(server, actualPort);
  return { server, port: listenedPort };
}

function formatBanner(root, port) {
  return `Serving ${root} at http://localhost:${port}/`;
}

function parseArgs(argv) {
  const out = { root: null, port: 3000 };
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === '--root') && i + 1 < argv.length) out.root = argv[++i];
    else if ((argv[i] === '--port' || argv[i] === '-p') && i + 1 < argv.length) out.port = Number(argv[++i]);
  }
  return out;
}

async function main(argv) {
  const { root, port } = parseArgs(argv);
  if (!root) {
    process.stderr.write('usage: mockups-serve.js --root <dir> [--port <N>]\n');
    process.exit(2);
  }
  const absRoot = path.resolve(root);
  if (!fs.existsSync(absRoot)) {
    process.stderr.write(`error: root not found: ${absRoot}\n`);
    process.exit(1);
  }
  const { port: actualPort } = await startServer({ root: absRoot, port });
  process.stdout.write(formatBanner(absRoot, actualPort) + '\n');
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`mockups-serve error: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  startServer,
  findAvailablePort,
  formatBanner,
  handleRequest,
  resolveSafe,
  contentTypeFor,
  parseArgs,
};
