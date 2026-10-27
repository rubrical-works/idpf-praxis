/**
 * @framework-script 0.113.0
 *
 * Static file server for /mockups --serve, built on http-server (#3023).
 *
 * File serving — MIME types, index.html, the directory listing for a set with
 * no index.html — is delegated to http-server's programmatic createServer.
 * This wrapper keeps the three contracts http-server does not provide:
 *   - the single-line boot banner /mockups Step 9 parses for the URL;
 *   - port fallback through the shared lib/local-server.js (#2430);
 *   - the shared request-safety primitives (#2468), run as an http-server
 *     `before` middleware so they see every request before http-server does.
 *
 * Directory listing is http-server's own: `/dir` redirects (302) to `/dir/`
 * and entries are relative `./name` hrefs, so the trailing slash is restored
 * before any link is followed. This replaces the hand-rolled absolute-href
 * listing of #2590.
 *
 * CLI:
 *   node mockups-server.js --root <dir> [--port <N>]
 *
 * Programmatic:
 *   const { startServer, findAvailablePort, formatBanner } = require('./mockups-server');
 *   const { server, port } = await startServer({ root, port });
 *
 * Port-in-use behavior (from #2377): if the requested port is occupied, falls
 * back to an OS-assigned free port (lib's fallbackToZero option) and reports
 * the actual port used.
 *
 * Rubrical Works (c) 2026
 */

'use strict';

const fs = require('fs');
const path = require('path');
const httpServer = require('http-server');
const lib = require('./lib/local-server.js');
// Shared request-safety primitives (#2468) — one implementation for every
// local server; local-server-call-sites.test.js fails on a private copy.
const { resolveSafe, decodePathname, isLoopbackHost } = lib;

/**
 * http-server `before` middleware: refuse what the shared primitives refuse,
 * then hand the request on with res.emit('next').
 *
 * - Non-loopback Host → 403. DNS-rebinding defense: a page resolving to
 *   127.0.0.1 would otherwise be same-origin and read the served tree.
 * - Malformed percent-encoding (decodePathname returns null) → 400. An
 *   unguarded decode in a request handler throws URIError and kills the
 *   process; http-server is never handed a path it would have to decode.
 * - A path resolveSafe rejects (traversal above the root, encoded traversal)
 *   → 400, so http-server's own containment is never the only defense.
 */
function requestGuard(root) {
  return function guard(req, res) {
    if (!isLoopbackHost(req.headers && req.headers.host)) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('403 Forbidden: non-loopback Host');
      return;
    }
    const rawUrl = req.url || '/';
    if (decodePathname(rawUrl) === null) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('400 Bad Request: malformed percent-encoding');
      return;
    }
    // The root itself is a directory request, not a file; resolveSafe maps it
    // to /index.html, which is inside the root by construction.
    if (!resolveSafe(root, rawUrl)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('400 Bad Request');
      return;
    }
    res.emit('next');
  };
}

// Try the preferred port only, then fall back to OS-assigned.
async function findAvailablePort(preferred) {
  return lib.findAvailablePort(preferred, { range: 1, fallbackToZero: true });
}

async function startServer({ root, port }) {
  if (!root) throw new Error('startServer: root is required');
  const absRoot = path.resolve(root);
  const requested = typeof port === 'number' ? port : 3000;
  const chosen = requested === 0 ? 0 : await findAvailablePort(requested);
  const instance = httpServer.createServer({
    root: absRoot,
    cache: -1, // mockups are edited and reloaded; never serve a stale copy
    showDir: true,
    autoIndex: true,
    before: [requestGuard(absRoot)],
  });
  const listened = await lib.tryListen(instance.server, chosen);
  return { server: instance.server, port: listened };
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
    process.stderr.write('usage: mockups-server.js --root <dir> [--port <N>]\n');
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
    process.stderr.write(`mockups-server error: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  startServer,
  findAvailablePort,
  formatBanner,
  requestGuard,
  resolveSafe,
  parseArgs,
};
