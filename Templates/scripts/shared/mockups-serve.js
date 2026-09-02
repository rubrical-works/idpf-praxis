/**
 * @framework-script 0.100.0
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
// decodePathname is the same guarded percent-decode resolveSafe runs; the
// directory listing (#2590) needs the URL form to build hrefs, and decoding
// privately here would put an unguarded decode back in a request handler —
// the exact divergence local-server-call-sites.test.js exists to catch.
const { resolveSafe, decodePathname, isLoopbackHost } = lib;

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

// #2589: the consolidation step retires superseded sets here. Serving them
// beside the live ones reintroduces the "which rendition is current?" ambiguity
// that consolidation exists to remove.
const DEPRECATED_DIR = 'Deprecated';

/**
 * True when a decoded URL path enters the served root's top-level Deprecated/.
 *
 * Anchored at the root's FIRST segment, deliberately. Matching the segment
 * anywhere would also refuse `/SomeSet/Deprecated/...`, which is a user's own
 * directory name and none of this exclusion's business. Serving that tree
 * explicitly (`--serve Deprecated`) still works: the root itself is never
 * tested, only paths beneath it.
 */
function isDeprecatedPath(pathname) {
  if (typeof pathname !== 'string') return false;
  const first = pathname.replace(/^\/+/, '').split('/')[0];
  return first === DEPRECATED_DIR;
}

function contentTypeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function sendFile(filePath, res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', contentTypeFor(filePath));
  fs.createReadStream(filePath).pipe(res);
}

function sendNotFound(what, res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('404 Not Found: ' + what);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render a directory listing.
 *
 * hrefs are absolute (rooted at the served root), not relative: a request for
 * `/Card-Groups` and one for `/Card-Groups/` must produce the same working
 * links, and relative hrefs resolve differently between the two. Absolute
 * hrefs make the trailing slash irrelevant instead of requiring a redirect.
 *
 * Only `urlDir` and entry names are rendered — never the filesystem path, which
 * would leak the served root's location into every listing.
 */
function renderListing(urlDir, entries) {
  const sorted = entries.slice().sort((a, b) => {
    const ad = a.isDirectory() ? 0 : 1;
    const bd = b.isDirectory() ? 0 : 1;
    if (ad !== bd) return ad - bd;
    return a.name.localeCompare(b.name);
  });

  const items = sorted.map((entry) => {
    const isDir = entry.isDirectory();
    const href = urlDir + encodeURIComponent(entry.name) + (isDir ? '/' : '');
    const label = entry.name + (isDir ? '/' : '');
    return `    <li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`;
  });

  // Root has no parent to offer; anywhere else, strip the last segment.
  const parent = urlDir === '/'
    ? null
    : urlDir.slice(0, urlDir.lastIndexOf('/', urlDir.length - 2) + 1);
  if (parent) items.unshift(`    <li><a href="${escapeHtml(parent)}">../</a></li>`);

  const heading = escapeHtml(urlDir);
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    `  <title>Mockups: ${heading}</title>`,
    '  <style>',
    '    body { font-family: system-ui, sans-serif; margin: 2rem; }',
    '    ul { list-style: none; padding: 0; }',
    '    li { padding: 0.15rem 0; }',
    '  </style>',
    '</head>',
    '<body>',
    `  <h1>${heading}</h1>`,
    '  <ul>',
    items.join('\n'),
    '  </ul>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/**
 * Serve a directory: its index.html when present, otherwise a generated listing.
 *
 * index-first keeps the pre-#2590 contract intact — resolveSafe maps `/` to
 * `/index.html`, and a tree that ships one still gets it.
 */
function serveDirectory(dirAbs, pathname, res) {
  const urlDir = pathname.endsWith('/') ? pathname : pathname + '/';
  const indexPath = path.join(dirAbs, 'index.html');

  fs.stat(indexPath, (indexErr, indexStat) => {
    if (!indexErr && indexStat.isFile()) {
      sendFile(indexPath, res);
      return;
    }
    fs.readdir(dirAbs, { withFileTypes: true }, (readErr, entries) => {
      if (readErr) {
        sendNotFound(urlDir, res);
        return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      // #2589: never offer the deprecated tree as a browsable sibling of the
      // live sets. Scoped to the served root's own top level — a set legitimately
      // named Deprecated deeper in the tree is not what this excludes.
      const visible = urlDir === '/' ? entries.filter((e) => e.name !== DEPRECATED_DIR) : entries;
      res.end(renderListing(urlDir, visible));
    });
  });
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
  const rawUrl = req.url || '/';
  const filePath = resolveSafe(root, rawUrl);
  if (!filePath) {
    res.statusCode = 400;
    res.end('400 Bad Request');
    return;
  }
  const pathname = decodePathname(rawUrl);
  // #2589: filtering the listing hides the link; this refuses the path. Without
  // both, Deprecated/ stays reachable by typing or by a stale bookmark, and
  // "excluded from the served tree" would mean only "harder to notice".
  if (isDeprecatedPath(pathname)) {
    sendNotFound(rawUrl, res);
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) {
      sendFile(filePath, res);
      return;
    }
    if (!err && stat.isDirectory()) {
      serveDirectory(filePath, pathname, res);
      return;
    }
    // The root is the one path resolveSafe rewrites (`/` -> `/index.html`), so
    // a missing root index arrives here as ENOENT on a file that was never
    // requested. Before #2590 that returned 404 — the reported bug, since
    // /mockups writes README.md and never an index.html.
    if (pathname === '/') {
      serveDirectory(path.resolve(root), '/', res);
      return;
    }
    sendNotFound(rawUrl, res);
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
