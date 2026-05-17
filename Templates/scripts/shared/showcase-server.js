/**
 * @framework-script 0.92.0
 *
 * Living Style Guide showcase server (#2430, Story 1.1).
 *
 * Zero-dependency loopback HTTP server that serves the showcase bundle written by
 * `showcase-bundle.js` and accepts reviewer decisions via `POST /record`.
 *
 *   GET *                  Static-file serve from the bundle dir
 *   POST /record           Validate payload against decisions.schema.json; append
 *                          valid records (one per line, JSON-Lines) to decisions.json
 *   POST /done             Graceful shutdown
 *   SIGINT / SIGTERM       Graceful shutdown (same path)
 *
 * Composes `.claude/scripts/shared/lib/local-server.js` for bind/launch/fallback/shutdown.
 * No npm dependencies — built-ins only.
 *
 * CLI:
 *   node showcase-server.js --bundle <dir> --decisions <path> [--port <N>] [--schema <path>] [--no-open]
 *
 * Programmatic:
 *   const { startShowcaseServer } = require('./showcase-server.js');
 *   const { server, port, shutdown } = await startShowcaseServer({
 *     bundleDir, decisionsPath, schemaPath, port, openBrowser
 *   });
 *
 * Rubrical Works (c) 2026
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const lib = require('./lib/local-server.js');

const DEFAULT_BUNDLE_DIR = 'Design-System/showcase';
const DEFAULT_DECISIONS = 'Design-System/showcase/decisions.json';
const DEFAULT_SCHEMA = '.claude/metadata/decisions.schema.json';
const DEFAULT_PORT = 3001; // one past mockups-serve default to avoid collision

const MIME = {
  '.html': 'text/html; charset=utf-8',
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
};

// ─── Schema-driven validation (zero-dep, vendored) ────────────────────────
//
// Per `.claude/rules/04-deployment-awareness.md` Runtime Dependency Contract:
// deployed helpers must not require external npm packages. The framework root
// in user projects has no node_modules — `require('ajv')` would crash. We
// vendor a minimal validator that reads the schema file and enforces the
// specific keywords decisions.schema.json uses: type, required, enum, pattern,
// minLength, maxLength, additionalProperties (literal false), format date-time
// (loose ISO-8601). See tests/metadata/decisions-schema.test.js for the Ajv-backed
// schema-shape tests; this validator is a runtime mirror.

// Validate an ISO-8601 date-time string without a single regex (avoids
// `security/detect-unsafe-regex` lint false-positive on nested quantifiers).
// Accepted shape: YYYY-MM-DDTHH:MM:SS[.fffffffff](Z|+HH:MM|-HH:MM)
function isIso8601DateTime(s) {
  if (typeof s !== 'string' || s.length < 20 || s.length > 35) return false;
  // Cheap structural checks — single-pass, no backtracking.
  if (s[4] !== '-' || s[7] !== '-' || s[10] !== 'T' || s[13] !== ':' || s[16] !== ':') return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s.slice(0, 19))) return false;
  let i = 19;
  if (s[i] === '.') {
    i++;
    const frac = s.slice(i);
    const m = /^\d{1,9}/.exec(frac);
    if (!m) return false;
    i += m[0].length;
  }
  const tz = s.slice(i);
  if (tz === 'Z') return true;
  return /^[+-]\d{2}:\d{2}$/.test(tz);
}

function validateAgainstSchema(schema, payload) {
  const errors = [];
  if (schema.type === 'object') {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      errors.push({ instancePath: '', keyword: 'type', message: 'must be object', params: { type: 'object' } });
      return { ok: false, errors };
    }
    const allowed = schema.properties || {};
    const required = schema.required || [];
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(payload, key)) {
        errors.push({ instancePath: '', keyword: 'required', message: `must have required property '${key}'`, params: { missingProperty: key } });
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(payload)) {
        if (!Object.prototype.hasOwnProperty.call(allowed, key)) {
          errors.push({ instancePath: '', keyword: 'additionalProperties', message: `must NOT have additional properties`, params: { additionalProperty: key } });
        }
      }
    }
    for (const key of Object.keys(allowed)) {
      if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
      const propSchema = allowed[key];
      const value = payload[key];
      const propErrors = validateProp(propSchema, value, `/${key}`);
      errors.push(...propErrors);
    }
  }
  return { ok: errors.length === 0, errors };
}

function validateProp(schema, value, instancePath) {
  const errors = [];
  if (schema.type === 'string') {
    if (typeof value !== 'string') {
      errors.push({ instancePath, keyword: 'type', message: 'must be string', params: { type: 'string' } });
      return errors;
    }
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      errors.push({ instancePath, keyword: 'minLength', message: `must NOT have fewer than ${schema.minLength} characters`, params: { limit: schema.minLength } });
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
      errors.push({ instancePath, keyword: 'maxLength', message: `must NOT have more than ${schema.maxLength} characters`, params: { limit: schema.maxLength } });
    }
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
      errors.push({ instancePath, keyword: 'enum', message: 'must be equal to one of the allowed values', params: { allowedValues: schema.enum } });
    }
    if (typeof schema.pattern === 'string') {
      const re = new RegExp(schema.pattern);
      if (!re.test(value)) {
        errors.push({ instancePath, keyword: 'pattern', message: `must match pattern "${schema.pattern}"`, params: { pattern: schema.pattern } });
      }
    }
    if (schema.format === 'date-time' && !isIso8601DateTime(value)) {
      errors.push({ instancePath, keyword: 'format', message: 'must match format "date-time"', params: { format: 'date-time' } });
    }
  }
  return errors;
}

let _validator = null;
function loadValidator(schemaPath) {
  if (_validator && _validator.schemaPath === schemaPath) return _validator.validate;
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  // Return an Ajv-shaped function: validate(payload) -> bool, with validate.errors populated.
  const validate = function validate(payload) {
    const { ok, errors } = validateAgainstSchema(schema, payload);
    validate.errors = ok ? null : errors;
    return ok;
  };
  validate.errors = null;
  _validator = { schemaPath, validate };
  return validate;
}

function clearValidatorCache() {
  _validator = null;
}

// ─── Static file serving (within bundle dir, no traversal) ────────────────

function contentTypeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function resolveSafe(root, urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  if (p === '/' || p === '') p = '/index.html';
  const resolved = path.resolve(root, '.' + p);
  if (!resolved.startsWith(path.resolve(root))) return null;
  return resolved;
}

function serveStatic(bundleDir, req, res) {
  const filePath = resolveSafe(bundleDir, req.url || '/');
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

// ─── Request body reader (bounded) ────────────────────────────────────────

const MAX_BODY_BYTES = 16 * 1024; // 16KB cap — decisions records are tiny

function readBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        const err = new Error('PAYLOAD_TOO_LARGE');
        err.code = 'PAYLOAD_TOO_LARGE';
        req.destroy(err);
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ─── POST /record handler (AC1.1.3, AC1.6.4) ──────────────────────────────

async function handleRecord(req, res, ctx) {
  // Cross-origin defense (AC1.6.2): require the per-run nonce in the
  // X-Showcase-Nonce header. The bundle's JS fetches /nonce on load and
  // attaches it to every POST. Non-browser clients without the nonce — and
  // browsers from other origins that never saw GET /nonce — are rejected.
  const presented = req.headers['x-showcase-nonce'];
  if (!presented || presented !== ctx.nonce) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'NONCE_MISSING_OR_MISMATCH' }));
    return;
  }
  let raw;
  try {
    raw = await readBody(req);
  } catch (err) {
    res.statusCode = err.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: err.code || 'BAD_REQUEST' }));
    return;
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'INVALID_JSON', message: err.message }));
    return;
  }
  const validate = loadValidator(ctx.schemaPath);
  if (!validate(payload)) {
    const errors = validate.errors.map((e) => ({
      path: e.instancePath || '/',
      keyword: e.keyword,
      message: e.message,
      params: e.params,
    }));
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'SCHEMA_VALIDATION_FAILED', errors }));
    return;
  }
  // Append-only write: one JSON record per line (JSONL), so concurrent appends
  // don't corrupt a single JSON-array structure. decisions.json files are read
  // line-by-line by the resume helper (Story 1.3 / #2432).
  try {
    const dir = path.dirname(ctx.decisionsPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(ctx.decisionsPath, JSON.stringify(payload) + '\n');
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'APPEND_FAILED', message: err.message }));
    return;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ ok: true }));
}

// ─── GET /nonce handler (AC1.6.2 cross-origin defense — per-run nonce) ───

function handleNonce(_req, res, ctx) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // CORS not enabled — browser can fetch from same origin via the bundle HTML.
  res.end(JSON.stringify({ nonce: ctx.nonce }));
}

// ─── POST /done handler (AC1.1.4) ─────────────────────────────────────────

function handleDone(_req, res, ctx) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ ok: true, shuttingDown: true }));
  // Defer close to next tick so the 200 flushes before the socket dies.
  setImmediate(() => {
    try { ctx.server.close(); } catch (_) { /* ignore */ }
  });
}

// ─── Request router ───────────────────────────────────────────────────────

function makeRequestHandler(ctx) {
  return (req, res) => {
    // Use WHATWG URL with a dummy origin so we get pathname stably.
    const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
    if (req.method === 'POST' && pathname === '/record') {
      return handleRecord(req, res, ctx);
    }
    if (req.method === 'POST' && pathname === '/done') {
      return handleDone(req, res, ctx);
    }
    if (req.method === 'GET' && pathname === '/nonce') {
      return handleNonce(req, res, ctx);
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      return serveStatic(ctx.bundleDir, req, res);
    }
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, POST');
    res.end('405 Method Not Allowed');
  };
}

// ─── Main entry: startShowcaseServer ──────────────────────────────────────

/**
 * Start the showcase server.
 *
 * @param {object} opts
 * @param {string} opts.bundleDir       Path to the rendered bundle (e.g., Design-System/showcase)
 * @param {string} opts.decisionsPath   Path to decisions.json (will be created if missing)
 * @param {string} [opts.schemaPath]    Path to decisions.schema.json (default .claude/metadata/decisions.schema.json)
 * @param {number} [opts.port=3001]     Preferred starting port (range walk on collision)
 * @param {object} [opts.portOpts]      Forwarded to lib.findAvailablePort
 * @param {boolean} [opts.openBrowser=true]  If true, attempts to launch the default browser
 * @param {function} [opts._spawn]      Test injection for openBrowserCrossPlatform
 * @returns {Promise<{server, port, url, browser, shutdown}>}
 */
async function startShowcaseServer(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new TypeError('startShowcaseServer: opts is required');
  }
  if (!opts.bundleDir) throw new TypeError('startShowcaseServer: opts.bundleDir is required');
  if (!opts.decisionsPath) throw new TypeError('startShowcaseServer: opts.decisionsPath is required');
  const schemaPath = opts.schemaPath || path.resolve(DEFAULT_SCHEMA);
  const port = typeof opts.port === 'number' ? opts.port : DEFAULT_PORT;
  const openBrowser = opts.openBrowser !== false;

  // Per-run nonce — unguessable, rotates each launch. Bundle JS fetches /nonce
  // and includes it in X-Showcase-Nonce header on every POST (AC1.6.2).
  const nonce = (opts && opts._nonce) || crypto.randomBytes(16).toString('hex');

  const ctx = {
    bundleDir: path.resolve(opts.bundleDir),
    decisionsPath: path.resolve(opts.decisionsPath),
    schemaPath: path.resolve(schemaPath),
    nonce,
    server: null, // filled in below
  };

  const { server, port: actualPort } = await lib.bindLoopbackServer({
    requestHandler: makeRequestHandler(ctx),
    port,
    portOpts: opts.portOpts,
  });
  ctx.server = server;

  const detach = lib.attachGracefulShutdown(server);

  const urlStr = `http://127.0.0.1:${actualPort}/`;
  let browser = { attempted: false };
  if (openBrowser) {
    browser = await lib.openBrowserCrossPlatform(urlStr, { _spawn: opts._spawn });
    browser.attempted = true;
  }

  const shutdown = () => {
    detach();
    return new Promise((r) => server.close(r));
  };

  return { server, port: actualPort, url: urlStr, browser, shutdown, nonce };
}

// ─── CLI ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {
    bundleDir: DEFAULT_BUNDLE_DIR,
    decisionsPath: DEFAULT_DECISIONS,
    schemaPath: DEFAULT_SCHEMA,
    port: DEFAULT_PORT,
    openBrowser: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--bundle' && i + 1 < argv.length) out.bundleDir = argv[++i];
    else if (a === '--decisions' && i + 1 < argv.length) out.decisionsPath = argv[++i];
    else if (a === '--schema' && i + 1 < argv.length) out.schemaPath = argv[++i];
    else if (a === '--port' && i + 1 < argv.length) out.port = Number(argv[++i]);
    else if (a === '--no-open') out.openBrowser = false;
  }
  return out;
}

async function main(argv) {
  const args = parseArgs(argv);
  try {
    const { url: u, browser, port } = await startShowcaseServer(args);
    process.stdout.write(`Showcase server: ${u} (port ${port})\n`);
    if (browser.attempted && !browser.ok) {
      process.stdout.write(`Browser did not launch (${browser.error && browser.error.message}). Open the URL manually.\n`);
    }
    // keep process alive
  } catch (err) {
    if (err && err.code === 'PORT_EXHAUSTED') {
      process.stderr.write(
        `showcase-server: ${err.message}\n` +
        `Tip: free a port in the range, or pass --port <other-port> to start elsewhere.\n`,
      );
      process.exit(2);
    }
    process.stderr.write(`showcase-server error: ${err.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = {
  startShowcaseServer,
  makeRequestHandler,
  handleRecord,
  handleDone,
  serveStatic,
  resolveSafe,
  contentTypeFor,
  loadValidator,
  clearValidatorCache,
  parseArgs,
  DEFAULT_BUNDLE_DIR,
  DEFAULT_DECISIONS,
  DEFAULT_SCHEMA,
  DEFAULT_PORT,
};
