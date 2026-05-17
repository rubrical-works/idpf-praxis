/**
 * @framework-script 0.92.0
 *
 * Shared 127.0.0.1 server infrastructure used by /mockups --serve (#2377) and
 * /design-system --showcase (#2429, Story 1.1). Provides:
 *
 *   - tryListen(server, port)                — promise-wrapped listen on 127.0.0.1
 *   - findAvailablePort(preferred, opts)    — try preferred then walk a small range;
 *                                              optional fallback to OS-assigned port
 *   - bindLoopbackServer(opts)              — composed: create + bind + return port
 *   - openBrowserCrossPlatform(url)         — process.platform dispatch (no throw on fail)
 *   - attachGracefulShutdown(server, onClose) — SIGINT/SIGTERM clean shutdown wiring
 *
 * Zero npm dependencies. Built-ins only: http, child_process. Both consumers run from
 * a framework root without populated node_modules — see
 * .claude/rules/04-deployment-awareness.md "Runtime Dependency Contract".
 *
 * Rubrical Works (c) 2026
 */

'use strict';

const http = require('http');
const { spawn } = require('child_process');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_RANGE = 10; // try preferred + next 9 consecutive ports before exhaustion

/**
 * Bind `server` to `port` on `host`. Resolves with the actual port number (matters
 * when `port === 0` — OS assigns one). Rejects with the underlying listen error.
 */
function tryListen(server, port, host = DEFAULT_HOST) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener('listening', onListen);
      reject(err);
    };
    const onListen = () => {
      server.removeListener('error', onError);
      const addr = server.address();
      resolve(addr && typeof addr === 'object' ? addr.port : port);
    };
    server.once('error', onError);
    server.once('listening', onListen);
    server.listen(port, host);
  });
}

/**
 * Find a free port on 127.0.0.1.
 *
 * @param {number} preferred  Starting port. Required.
 * @param {object} [opts]
 * @param {number} [opts.range=10]            How many consecutive ports to try
 *                                            (preferred, preferred+1, ..., preferred+range-1).
 * @param {boolean} [opts.fallbackToZero=false] If true, after the range is exhausted, attempt
 *                                              listen(0) for an OS-assigned port. Used by
 *                                              mockups-serve.js for backwards-compat with #2377.
 * @returns {Promise<number>} The available port.
 * @throws Error 'PORT_EXHAUSTED' (code='PORT_EXHAUSTED') with `tried` (number[]) when
 *         the entire range is occupied and fallbackToZero is false.
 */
async function findAvailablePort(preferred, opts) {
  if (typeof preferred !== 'number' || preferred < 0) {
    throw new TypeError('findAvailablePort: preferred port must be a non-negative number');
  }
  const range = (opts && typeof opts.range === 'number' && opts.range > 0) ? opts.range : DEFAULT_RANGE;
  const fallbackToZero = !!(opts && opts.fallbackToZero);

  const tried = [];
  for (let i = 0; i < range; i++) {
    const candidate = preferred + i;
    tried.push(candidate);
    const probe = http.createServer();
    try {
      const actual = await tryListen(probe, candidate);
      await new Promise((r) => probe.close(r));
      return actual;
    } catch (err) {
      try { probe.close(); } catch (_) { /* ignore */ }
      if (err && err.code === 'EADDRINUSE') {
        // try next port in range
        continue;
      }
      throw err;
    }
  }

  if (fallbackToZero) {
    const probe = http.createServer();
    try {
      const actual = await tryListen(probe, 0);
      await new Promise((r) => probe.close(r));
      return actual;
    } catch (err) {
      try { probe.close(); } catch (_) { /* ignore */ }
      throw err;
    }
  }

  const exhausted = new Error(
    `PORT_EXHAUSTED: no free port in range ${tried[0]}..${tried[tried.length - 1]} on ${DEFAULT_HOST}. ` +
    `Free a port in that range or pass a different starting port.`,
  );
  exhausted.code = 'PORT_EXHAUSTED';
  exhausted.tried = tried;
  throw exhausted;
}

/**
 * Create an HTTP server bound to 127.0.0.1, with port-range fallback.
 *
 * @param {object} opts
 * @param {function} opts.requestHandler  (req, res) => void
 * @param {number} opts.port              Preferred starting port. Use 0 for OS-assigned.
 * @param {object} [opts.portOpts]        Forwarded to findAvailablePort (range, fallbackToZero).
 * @returns {Promise<{server: http.Server, port: number}>}
 */
async function bindLoopbackServer({ requestHandler, port, portOpts }) {
  if (typeof requestHandler !== 'function') {
    throw new TypeError('bindLoopbackServer: requestHandler is required');
  }
  if (typeof port !== 'number') {
    throw new TypeError('bindLoopbackServer: port is required (use 0 for OS-assigned)');
  }
  const chosenPort = port === 0 ? 0 : await findAvailablePort(port, portOpts);
  const server = http.createServer(requestHandler);
  const listened = await tryListen(server, chosenPort);
  return { server, port: listened };
}

/**
 * Open a URL in the user's default browser. Cross-platform via process.platform.
 *
 * Does NOT throw on failure — returns {ok:false, error} so callers can keep the
 * server up and print the URL for manual open (AC1.1.6 / Story 1.1).
 *
 * @param {string} url
 * @param {object} [opts]
 * @param {function} [opts._spawn=child_process.spawn]  Injection point for tests.
 * @returns {Promise<{ok: boolean, command?: string, error?: Error}>}
 */
function openBrowserCrossPlatform(url, opts) {
  return new Promise((resolve) => {
    if (typeof url !== 'string' || !url) {
      resolve({ ok: false, error: new Error('openBrowserCrossPlatform: url is required') });
      return;
    }
    const spawnFn = (opts && opts._spawn) ? opts._spawn : spawn;
    let cmd;
    let args;
    if (process.platform === 'win32') {
      // `start` is a cmd builtin; route through cmd /c.
      // Empty quoted "" prevents start from treating the URL as a window title.
      cmd = 'cmd';
      args = ['/c', 'start', '""', url];
    } else if (process.platform === 'darwin') {
      cmd = 'open';
      args = [url];
    } else {
      cmd = 'xdg-open';
      args = [url];
    }
    try {
      const child = spawnFn(cmd, args, { stdio: 'ignore', detached: true });
      let settled = false;
      const settle = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      child.once('error', (err) => settle({ ok: false, command: cmd, error: err }));
      // If spawn succeeds, the child detaches; we resolve optimistically. On most
      // platforms there is no way to know the browser actually opened — that's
      // acceptable per AC1.1.6 (CLI prints URL regardless).
      child.once('spawn', () => settle({ ok: true, command: cmd }));
      // Safety: resolve ok after a short grace period if no spawn/error fires
      // (rare on broken child_process mocks in tests).
      setTimeout(() => settle({ ok: true, command: cmd }), 250).unref();
      try { child.unref(); } catch (_) { /* not all envs */ }
    } catch (err) {
      resolve({ ok: false, command: cmd, error: err });
    }
  });
}

/**
 * Attach SIGINT + SIGTERM handlers that close the server gracefully, optionally
 * running an async `onShutdown(signal)` first (for flush/persist work).
 *
 * Returns a `detach()` function that removes the handlers — used by tests to avoid
 * cross-test pollution.
 *
 * @param {http.Server} server
 * @param {function} [onShutdown] async (signal: string) => void
 * @returns {function} detach()
 */
function attachGracefulShutdown(server, onShutdown) {
  let shuttingDown = false;
  const handler = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      if (typeof onShutdown === 'function') {
        await onShutdown(signal);
      }
    } catch (_) {
      // best-effort shutdown — don't block server.close on user callback errors
    }
    server.close(() => {
      // server.close fires once all in-flight connections close; tests can verify
      // no zombie ports remain after this.
    });
  };
  const sigint = () => handler('SIGINT');
  const sigterm = () => handler('SIGTERM');
  process.on('SIGINT', sigint);
  process.on('SIGTERM', sigterm);
  return function detach() {
    process.removeListener('SIGINT', sigint);
    process.removeListener('SIGTERM', sigterm);
  };
}

module.exports = {
  tryListen,
  findAvailablePort,
  bindLoopbackServer,
  openBrowserCrossPlatform,
  attachGracefulShutdown,
  // exposed for tests / introspection
  DEFAULT_HOST,
  DEFAULT_RANGE,
};
