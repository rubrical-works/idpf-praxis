#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.116.0
 * @description Merge a pull request with state re-read, transient retry and a REST fallback (#3491). Exports mergePr() and parseArgs(); the CLI prints one JSON envelope naming the path that merged it (graphql, rest-fallback, already-merged), the merge commit and every failed attempt.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * merge-pr.js — the PR merge, owned by a script rather than a spec line
 *
 * The merge is the first irreversible step of a release, and a bare
 * `gh pr merge` left recovery to whatever the session improvised. On
 * 2026-10-30 two GraphQL server errors stopped the v0.115.0 merge; the REST
 * endpoint merged it two minutes later. This script makes that recovery
 * deterministic:
 *
 *   1. `gh pr merge <n> --<method>` over GraphQL.
 *   2. After ANY failed attempt, re-read the PR. Already merged → report
 *      `already-merged` and stop: a merge that may have landed is never
 *      re-issued. Closed unmerged → fail.
 *   3. A non-transient failure (not mergeable, conflict, required check, head
 *      modified) fails immediately — no retry, no fallback.
 *   4. A transient one (lib/gh.js isTransientError) is retried with backoff.
 *   5. GraphQL attempts exhausted → one `PUT /repos/{o}/{r}/pulls/{n}/merge`
 *      with the same merge method, then a last re-read on failure.
 *
 * `gh` is spawned with an argv array, never a shell string.
 *
 * Usage: node merge-pr.js --pr <n> [--method merge|squash|rebase] [--repo owner/name]
 * Exit 0 when merged (by any path), 1 otherwise, 2 on bad arguments.
 *
 * Refs #3491
 */

'use strict';

const { spawnSync } = require('child_process');
const { isTransientError } = require('./lib/gh.js');
const { validateRepo } = require('./lib/input-validation.js');

const METHODS = Object.freeze(['merge', 'squash', 'rebase']);
const GH_TIMEOUT_MS = 60000;

/**
 * Spawn `gh`. `MERGE_PR_GH` names another binary — a test seam, so the CLI
 * can be exercised end to end against a stub; a `.js` path runs under node.
 */
function defaultRun(argv) {
  const bin = process.env.MERGE_PR_GH || 'gh';
  const r = bin.endsWith('.js')
    ? spawnSync(process.execPath, [bin, ...argv], { encoding: 'utf8', timeout: GH_TIMEOUT_MS })
    : spawnSync(bin, argv, { encoding: 'utf8', timeout: GH_TIMEOUT_MS });
  if (r.error) return { status: null, stdout: '', stderr: r.error.message };
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** The GitHub request id a GraphQL error asks to be quoted, when present. */
function requestIdOf(message) {
  // Token by token rather than one nested-quantifier regex (unsafe-regex):
  // an id is hex groups joined by at least three colons, e.g. FE3E:35E93D:13E4DA:413655:6AE4A89C.
  const tokens = String(message || '').split(/[\s`'"()]+/);
  const id = tokens.find((t) => /^[0-9A-F:]+$/i.test(t) && t.split(':').length >= 4 && t.split(':').every((g) => g.length >= 2));
  return id || null;
}

const errorText = (r) => (String(r.stderr || '').trim() || String(r.stdout || '').trim() || `exit ${r.status}`).split(/\r?\n/).slice(0, 3).join(' ');

function resolveRepo(repo, run) {
  if (repo) return repo;
  const r = run(['repo', 'view', '--json', 'nameWithOwner']);
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout).nameWithOwner || null;
  } catch {
    return null;
  }
}

function readState(pr, repo, run) {
  const argv = ['pr', 'view', String(pr), '--json', 'state,mergedAt,mergeCommit'];
  if (repo) argv.push('--repo', repo);
  const r = run(argv);
  if (r.status !== 0) return { state: null, error: errorText(r) };
  try {
    const j = JSON.parse(r.stdout);
    return { state: j.state || null, mergeCommit: j.mergeCommit && j.mergeCommit.oid ? j.mergeCommit.oid : null };
  } catch (e) {
    return { state: null, error: `unreadable pr view output: ${e.message}` };
  }
}

/**
 * Merge `pr` with `method`.
 * @returns {{ok:boolean, pr:number, method:string, repo:string|null, path:'graphql'|'rest-fallback'|'already-merged'|null,
 *   mergeCommit:string|null, attempts:Array<{via:string, error:string, requestId:string|null}>, reason?:string, error?:string}}
 */
function mergePr({ pr, method = 'merge', repo = null, run = defaultRun, sleep = sleepSync, retries = 2, retryDelay = 2000 } = {}) {
  const attempts = [];
  const out = (fields) => ({ pr, method, repo, path: null, mergeCommit: null, attempts, ...fields });
  const targetRepo = resolveRepo(repo, run);
  const repoArgs = targetRepo ? ['--repo', targetRepo] : [];

  /** After a failure: decide from the PR's own state, never from the error. */
  const settle = () => {
    const s = readState(pr, targetRepo, run);
    if (s.state === 'MERGED') return out({ ok: true, repo: targetRepo, path: 'already-merged', mergeCommit: s.mergeCommit });
    if (s.state === 'CLOSED') return out({ ok: false, repo: targetRepo, reason: 'closed', error: `PR #${pr} is closed without being merged.` });
    return null;
  };

  let delay = retryDelay;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = run(['pr', 'merge', String(pr), `--${method}`, ...repoArgs]);
    if (r.status === 0) {
      // A zero exit is not a merge: on a branch with a merge queue, or with
      // required checks pending, gh queues the PR or enables auto-merge and
      // exits 0 (gh pr merge --help). Only the re-read state decides.
      const s = readState(pr, targetRepo, run);
      if (s.state === 'MERGED') return out({ ok: true, repo: targetRepo, path: 'graphql', mergeCommit: s.mergeCommit || null });
      return out({
        ok: false,
        repo: targetRepo,
        reason: 'not-merged',
        error: `gh pr merge exited 0 but PR #${pr} reads ${s.state || `unreadable (${s.error})`} — queued or set to auto-merge, not merged.`,
      });
    }
    const error = errorText(r);
    attempts.push({ via: 'graphql', error, requestId: requestIdOf(error) });
    const settled = settle();
    if (settled) return settled;
    if (!isTransientError(error)) {
      return out({ ok: false, repo: targetRepo, reason: 'non-transient', error });
    }
    if (attempt < retries) {
      sleep(delay);
      delay *= 2;
    }
  }

  if (!targetRepo) {
    return out({ ok: false, repo: null, reason: 'exhausted', error: 'GraphQL attempts exhausted and the repository could not be resolved for the REST fallback.' });
  }
  const rest = run(['api', '-X', 'PUT', `repos/${targetRepo}/pulls/${pr}/merge`, '-f', `merge_method=${method}`]);
  if (rest.status === 0) {
    // The endpoint answers { sha, merged, message } (GitHub REST "Merge a pull
    // request"); `merged` false is a refusal even on a 200.
    let body = null;
    try {
      body = JSON.parse(rest.stdout);
    } catch {
      body = null;
    }
    if (body && body.merged === false) {
      return out({ ok: false, repo: targetRepo, reason: 'not-merged', error: body.message || 'REST merge answered merged: false.' });
    }
    if (body && body.sha) return out({ ok: true, repo: targetRepo, path: 'rest-fallback', mergeCommit: body.sha });
    // No readable body: a zero exit alone is not a merge — confirm from state.
    const s = readState(pr, targetRepo, run);
    if (s.state === 'MERGED') return out({ ok: true, repo: targetRepo, path: 'rest-fallback', mergeCommit: s.mergeCommit || null });
    return out({
      ok: false,
      repo: targetRepo,
      reason: 'not-merged',
      error: `REST merge exited 0 with no readable response and PR #${pr} reads ${s.state || `unreadable (${s.error})`}.`,
    });
  }
  const restError = errorText(rest);
  attempts.push({ via: 'rest', error: restError, requestId: requestIdOf(restError) });
  const settled = settle();
  if (settled) return settled;
  return out({ ok: false, repo: targetRepo, reason: 'exhausted', error: restError });
}

function parseArgs(argv) {
  const out = { pr: null, method: 'merge', repo: null, errors: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pr' && argv[i + 1] !== undefined) {
      const raw = String(argv[++i]).replace(/^#/, '');
      out.pr = /^\d+$/.test(raw) && Number(raw) > 0 ? Number(raw) : null;
      if (out.pr === null) out.errors.push(`--pr must be a positive integer, got ${JSON.stringify(argv[i])}`);
    } else if (a === '--method' && argv[i + 1] !== undefined) {
      out.method = argv[++i];
    } else if (a === '--repo' && argv[i + 1] !== undefined) {
      out.repo = argv[++i];
    } else {
      out.errors.push(`Unrecognized argument: ${a}`);
    }
  }
  if (out.pr === null && !out.errors.some((e) => e.startsWith('--pr'))) out.errors.push('--pr <number> is required');
  if (!METHODS.includes(out.method)) out.errors.push(`--method must be one of ${METHODS.join(', ')}, got ${JSON.stringify(out.method)}`);
  if (out.repo !== null) {
    try {
      validateRepo(out.repo);
    } catch (e) {
      out.errors.push(e.message);
    }
  }
  return out;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (args.errors.length > 0) {
    process.stdout.write(`${JSON.stringify({ ok: false, reason: 'bad-arguments', errors: args.errors }, null, 2)}\n`);
    process.exit(2);
  }
  const result = mergePr({ pr: args.pr, method: args.method, repo: args.repo });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}

module.exports = { mergePr, parseArgs, requestIdOf, METHODS };
