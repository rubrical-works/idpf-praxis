/**
 * @framework-script 0.96.0
 *
 * Zero-dependency static file server for /mockups --serve (#2377).
 *
 * Composes the shared local-server infrastructure
 * (.claude/scripts/shared/lib/local-server.js, #2430) for bind + port-fallback;
 * keeps its own static-file handler and banner contract that /mockups --serve relies on.
 *
 * CLI:
 *   node mockups-serve.js --root <dir> [--port <N>]
 *
 * Programmatic:
 *   const { startServer, findAvailablePort, formatBanner } = require('./mockups-serve');
 *   const { server, port } = await startServer({ root, port });
 *
 * Port-in-use behavior (legacy from #2377): if the requested port is occupied,
 * falls back to an OS-assigned free port (via lib's fallbackToZero option) and
 * reports the actual port used.
 *
 * Rubrical Works (c) 2026
 */

'use strict';

const fs = require('fs');
const path = require('path');
const lib = require('./lib/local-server.js');
// Shared request-safety primitives (#2468) — one implementation, both servers.
const { resolveSafe, isLoopbackHost } = lib;

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

function handleRequest(root, req, res) {
  // DNS-rebinding defence (#2468): without this, a malicious page resolving to
  // 127.0.0.1 becomes same-origin and can read arbitrary files from the served
  // tree. This server is a pure file server, so rebinding here yields reads —
  // the wider consequence of the two servers.
  if (!isLoopbackHost(req.headers && req.headers.host)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('403 Forbidden: non-loopback Host');
    return;
  }
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

// Backwards-compatible findAvailablePort: try preferred only, fall back to OS-assigned.
// Matches the pre-#2430 behavior; mockups-serve callers expect this shape.
async function findAvailablePort(preferred) {
  return lib.findAvailablePort(preferred, { range: 1, fallbackToZero: true });
}

async function startServer({ root, port }) {
  if (!root) throw new Error('startServer: root is required');
  const requested = typeof port === 'number' ? port : 3000;
  return lib.bindLoopbackServer({
    requestHandler: (req, res) => handleRequest(root, req, res),
    port: requested,
    portOpts: { range: 1, fallbackToZero: true },
  });
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
