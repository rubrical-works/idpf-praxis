// Rubrical Works (c) 2026
/**
 * @framework-script 0.112.0
 * worktree-teardown.js — Non-destructive teardown of a framework worktree
 * (#3124, PRD Concurrent-Work Story 1.7)
 *
 * THE INCIDENT THIS EXISTS FOR. `git worktree remove --force` on a worktree
 * holding a node_modules junction deleted THROUGH the junction and emptied
 * the parent checkout's node_modules (Git for Windows 2.53). In a Praxis Hub
 * Manager project the same operation would traverse the hub links and delete
 * the hub for every project on the machine. The spike on #3123 then showed
 * that dropping `--force` is NOT the safeguard: `git worktree remove` deletes
 * through gitignored junctions with or without it. Unlinking first is.
 *
 * So teardown is a fixed sequence, and the order is the safety argument:
 *   1. REFUSE anything that is not a registered framework worktree whose real
 *      path lies under the project root and whose given path IS that worktree
 *      — not an alias link to it, not a hub link that resolves outside the
 *      root, not the main checkout, not a user's own worktree. Nothing is
 *      touched for a refused path.
 *   2. UNLINK every junction or symlink inside the worktree, without ever
 *      descending into one, and VERIFY each target still exists afterwards.
 *   3. If any link could not be removed, a re-walk still finds one, or a hub
 *      link candidate (`frameworkPath` included, #3195) is still a link, HALT:
 *      report the worktree and the remaining links by path, and never reach
 *      step 4. A link left in place is precisely what the remove would
 *      delete through.
 *   4. `git worktree remove <path>` WITHOUT `--force`. Git refuses dirty or
 *      untracked state rather than deleting it; such a worktree is KEPT and
 *      reported with its path, and the run continues. Never `rm -rf`: the
 *      only commands this module issues are `git worktree list` and
 *      `git worktree remove`, and the result lists every one.
 *
 * From a session: `node .claude/scripts/shared/lib/worktree-teardown.js
 * --root <root> --worktree <path> [--worktree <path> ...]` prints `{ok, results}`
 * (#3158) — the entry point the concurrent run's teardown step names.
 * `--workstream-prefix <prefix>` (#3194) also accepts a `/plan-workstreams`
 * worktree outside the root: registered, on a branch carrying that prefix,
 * given by its own path. Every other refusal, and the sequence, is unchanged.
 *
 * The branch `wt/<name>` is reported, never deleted — merge-back decides
 * what happens to it. Git calls and the unlink are injectable so a test can
 * pin call order and simulate an unremovable link without any fault
 * injection living here. Node built-ins and a relative require only (#2418).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { removeDirLink, detectLayout } = require('./worktree-links');

/** Where framework worktrees live; equal to the hook's constant by test. */
const WORKTREE_PREFIX = '.tmp-wt-';

/** Branch prefix, kept distinct from `workstream/*` so /plan-workstreams' cleanup never matches it. */
const BRANCH_PREFIX = 'wt/';

/** Bound on each git call (#2469). */
const GIT_TIMEOUT_MS = 60_000;

function defaultExec(argv, { cwd }) {
  const r = spawnSync('git', argv, { cwd, encoding: 'utf8', timeout: GIT_TIMEOUT_MS });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error || null };
}

/**
 * The real path, through the native resolver: on Windows `fs.realpathSync`
 * leaves 8.3 short names (`RUNNER~1`) unexpanded while git reports the long
 * form, so the two never compared equal and every teardown was refused (#3150).
 */
function realOrNull(p) {
  try { return fs.realpathSync.native(p); } catch { return null; }
}

function isUnder(child, parent) {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Every link inside a worktree, with its target. Never descends into a link
 * — listing a link's contents would list the very thing teardown protects.
 *
 * @param {string} worktree
 * @returns {Array<{linkPath: string, target: string|null}>}
 */
function findLinks(worktree) {
  const found = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === '.git') continue;
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) {
        let target = null;
        try {
          target = fs.readlinkSync(full);
          if (!path.isAbsolute(target)) target = path.resolve(dir, target);
        } catch { target = null; }
        found.push({ linkPath: full, target });
      } else if (e.isDirectory()) {
        walk(full);
      }
    }
  };
  walk(worktree);
  return found;
}

/**
 * The root's hub link candidates (`frameworkPath` included, #3195) that are
 * still links inside the worktree.
 *
 * @returns {Array<{linkPath: string, target: string|null}>}
 */
function uncoveredCandidateLinks(root, worktree) {
  let candidates;
  try { candidates = detectLayout({ root }).candidates; } catch { return []; }
  const left = [];
  for (const rel of candidates) {
    const linkPath = path.join(worktree, rel);
    let st;
    try { st = fs.lstatSync(linkPath); } catch { continue; }
    if (!st.isSymbolicLink()) continue;
    let target = null;
    try { target = fs.readlinkSync(linkPath); } catch { target = null; }
    left.push({ linkPath, target });
  }
  return left;
}

/** The registered worktrees of a repository, main checkout first. */
function registeredWorktrees(root, exec) {
  const r = exec(['worktree', 'list', '--porcelain'], { cwd: root });
  if (r.error || r.status !== 0) return { ok: false, error: r.error ? r.error.message : (r.stderr || `git exited ${r.status}`), entries: [] };
  const entries = [];
  let current = null;
  for (const line of r.stdout.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length), branch: null };
      entries.push(current);
    } else if (current && line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    }
  }
  return { ok: true, error: null, entries };
}

/**
 * Whether a path may be torn down at all. Refusals name their reason; nothing
 * is touched here.
 *
 * @param {{root: string, worktreePath: string, exec: Function}} input
 * @returns {{ok: boolean, reason: string|null, resolved: string|null, branch: string|null}}
 */
function checkTarget({ root, worktreePath, exec, workstreamPrefix = null }) {
  const refuse = (reason) => ({ ok: false, reason, resolved: null, branch: null });

  const realRoot = realOrNull(root);
  if (!realRoot) return refuse(`project root does not exist: ${root}`);
  const lexical = path.resolve(worktreePath);
  const resolved = realOrNull(lexical);
  if (!resolved) return refuse(`path does not exist: ${worktreePath}`);

  if (resolved === realRoot) return refuse('refusing to tear down the main checkout itself');

  if (workstreamPrefix !== null && workstreamPrefix !== undefined) {
    const prefix = String(workstreamPrefix).trim();
    if (prefix === '') return refuse('an empty workstream prefix would match every branch; give the run\'s prefix');
    const frameworkShaped = isUnder(resolved, realRoot) && path.basename(resolved).startsWith(WORKTREE_PREFIX);
    if (!frameworkShaped) return checkWorkstreamTarget({ root, worktreePath, lexical, resolved, prefix, exec });
  }
  if (!isUnder(resolved, realRoot)) {
    return refuse(`path resolves outside the project root (${resolved}); a path through a link to the hub is refused`);
  }
  // The given path must BE the worktree, not an alias link to it: compare the
  // path's position relative to the root with its real position.
  const lexicalRel = path.relative(path.resolve(root), lexical);
  const realRel = path.relative(realRoot, resolved);
  if (lexicalRel !== realRel) {
    return refuse(`path resolves through a link (${worktreePath} -> ${resolved}); give the worktree's own path`);
  }
  if (!path.basename(resolved).startsWith(WORKTREE_PREFIX)) {
    return refuse(`not a framework worktree: expected a ${WORKTREE_PREFIX}* directory under the project root, got ${path.basename(resolved)}`);
  }

  const listed = registeredWorktrees(root, exec);
  if (!listed.ok) return refuse(`cannot list worktrees: ${listed.error}`);
  const hit = listed.entries.slice(1).find((e) => realOrNull(e.path) === resolved);
  if (!hit) return refuse(`not a registered worktree of ${root}: ${worktreePath}`);
  return { ok: true, reason: null, resolved, branch: hit.branch };
}

/**
 * Whether a branch carries a workstream prefix (#3207). A prefix ending in
 * `/` or `-` is its own boundary; any other prefix matches only the branch
 * equal to it or one whose next character is `/` or `-`, so a short prefix
 * (`f`) cannot accept an unrelated branch (`feature/x`).
 *
 * @param {string|null} branch
 * @param {string} prefix - non-empty
 * @returns {boolean}
 */
function matchesWorkstreamPrefix(branch, prefix) {
  if (!branch || !branch.startsWith(prefix)) return false;
  if (prefix.endsWith('/') || prefix.endsWith('-')) return true;
  const next = branch.charAt(prefix.length);
  return next === '' || next === '/' || next === '-';
}

/**
 * The workstream allowance (#3194): `/plan-workstreams` worktrees live beside
 * the root (`../<prefix-as-dashes>N`), so its cleanup reminder can name this
 * teardown only if a path outside the root is accepted. It is accepted ONLY
 * when it is the worktree itself (not a link to one), registered in the
 * root's `git worktree list`, and checked out on a branch carrying the run's
 * prefix. The main-checkout refusal has already run.
 */
function checkWorkstreamTarget({ root, worktreePath, lexical, resolved, prefix, exec }) {
  const refuse = (reason) => ({ ok: false, reason, resolved: null, branch: null });
  let leafIsLink = false;
  try { leafIsLink = fs.lstatSync(lexical).isSymbolicLink(); } catch { leafIsLink = false; }
  const parentReal = realOrNull(path.dirname(lexical));
  if (leafIsLink || !parentReal || path.join(parentReal, path.basename(lexical)) !== resolved) {
    return refuse(`path resolves through a link (${worktreePath} -> ${resolved}); give the worktree's own path`);
  }
  const listed = registeredWorktrees(root, exec);
  if (!listed.ok) return refuse(`cannot list worktrees: ${listed.error}`);
  const hit = listed.entries.slice(1).find((e) => realOrNull(e.path) === resolved);
  if (!hit) return refuse(`not a registered worktree of ${root}: ${worktreePath}`);
  if (!matchesWorkstreamPrefix(hit.branch, prefix)) {
    if (hit.branch && hit.branch.startsWith(prefix)) {
      return refuse(`branch ${hit.branch} starts with the workstream prefix ${prefix} but not at a boundary: the prefix must equal the branch or be followed by / or -; not a workstream worktree`);
    }
    return refuse(`branch ${hit.branch || '(detached)'} does not start with the workstream prefix ${prefix}; not a workstream worktree`);
  }
  return { ok: true, reason: null, resolved, branch: hit.branch };
}

/**
 * Tear a framework worktree down: refuse → unlink → verify → confirm → remove.
 *
 * @param {{root: string, worktreePath: string, execFn?: Function, unlinkFn?: Function}} input
 * @returns {{ok: boolean, status: 'removed'|'kept'|'halted'|'refused', worktreePath: string,
 *   reason: string|null, branch: string|null,
 *   unlinked: Array<{linkPath: string, target: string|null}>,
 *   verified: Array<{target: string|null, ok: boolean}>,
 *   remaining: Array<{linkPath: string, target: string|null, error?: string}>,
 *   commands: string[][]}}
 *   `ok` is true only for `removed`. `kept` and `halted` leave the worktree in
 *   place and name it; `refused` touched nothing. `commands` lists every git
 *   argv issued — the proof that nothing else ever was.
 */
function teardownWorktree({
  root, worktreePath, workstreamPrefix = null, execFn = defaultExec, unlinkFn = removeDirLink, findLinksFn = findLinks,
}) {
  const out = {
    ok: false, status: null, worktreePath, reason: null, branch: null,
    unlinked: [], verified: [], remaining: [], commands: [],
  };
  const exec = (argv, opts) => { out.commands.push(argv.slice()); return execFn(argv, opts); };

  const check = checkTarget({ root, worktreePath, exec, workstreamPrefix });
  if (!check.ok) {
    out.status = 'refused';
    out.reason = check.reason;
    return out;
  }
  out.branch = check.branch;

  for (const link of findLinksFn(worktreePath)) {
    let r;
    try { r = unlinkFn({ linkPath: link.linkPath }); } catch (err) { r = { ok: false, error: err.message }; }
    if (!r || r.ok === false) {
      out.remaining.push({ ...link, error: (r && r.error) || 'unknown error' });
      continue;
    }
    out.unlinked.push(link);
    out.verified.push({ target: link.target, ok: link.target !== null && fs.existsSync(link.target) });
  }
  if (out.remaining.length > 0) {
    out.status = 'halted';
    out.reason = `cannot unlink ${out.remaining.map((l) => `${l.linkPath} (${l.error})`).join(', ')} — git worktree remove not run; worktree left at ${worktreePath}`;
    return out;
  }

  const stillThere = findLinksFn(worktreePath);
  if (stillThere.length > 0) {
    out.remaining = stillThere.map((l) => ({ ...l, error: 'still present after unlink' }));
    out.status = 'halted';
    out.reason = `links remain after unlink: ${stillThere.map((l) => l.linkPath).join(', ')} — git worktree remove not run; worktree left at ${worktreePath}`;
    return out;
  }

  // Coverage (#3195): every path recreateLinks could have made — the hub
  // candidates, `frameworkPath` included — must no longer be a link. The walk
  // above is the unlink set; this is an independent check that it reached
  // them, so a link to a whole hub version folder can never be left for git.
  const uncovered = uncoveredCandidateLinks(root, worktreePath);
  if (uncovered.length > 0) {
    out.remaining = uncovered.map((l) => ({ ...l, error: 'hub link candidate not unlinked' }));
    out.status = 'halted';
    out.reason = `hub link candidate(s) not unlinked: ${uncovered.map((l) => l.linkPath).join(', ')} — git worktree remove not run; worktree left at ${worktreePath}`;
    return out;
  }

  const remove = exec(['worktree', 'remove', worktreePath], { cwd: root });
  if (remove.error || remove.status !== 0) {
    out.status = 'kept';
    out.reason = `git worktree remove refused; worktree left at ${worktreePath}: ${(remove.error ? remove.error.message : remove.stderr).trim()}`;
    return out;
  }
  out.ok = true;
  out.status = 'removed';
  return out;
}

/**
 * Keep worktrees for inspection after a halt (#3140) — the deliberate
 * opposite of teardown. Issues no git command and removes nothing: the
 * worktrees ARE the recoverable state, so this only names them, with the
 * reason and the way to see them again.
 *
 * @param {{worktrees: Array<{issue?: number, worktreePath: string, branch?: string}>, reason?: string}} input
 * @returns {{kept: object[], report: string, commands: []}}
 */
function keepForInspection({ worktrees = [], reason = 'halt' } = {}) {
  const kept = worktrees.map((w) => ({ issue: w.issue === undefined ? null : w.issue, worktreePath: w.worktreePath, branch: w.branch || null }));
  const lines = [`Worktrees kept for inspection (${reason}); nothing was removed — git worktree list shows them:`];
  for (const k of kept) lines.push(`  - ${k.worktreePath}${k.branch ? ` (${k.branch})` : ''}${k.issue !== null ? ` — #${k.issue}` : ''}`);
  return { kept, report: lines.join('\n'), commands: [] };
}

/**
 * Parse `--root <dir> [--workstream-prefix <prefix>] --worktree <path> [--worktree <path> ...]`.
 *
 * @param {string[]} argv
 * @returns {{root: string|null, worktrees: string[], workstreamPrefix: string|null, error: string|null}}
 */
function parseArgs(argv) {
  const out = { root: null, worktrees: [], workstreamPrefix: null, error: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root' || a === '--worktree' || a === '--workstream-prefix') {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) {
        out.error = `${a} requires ${a === '--workstream-prefix' ? 'a branch prefix' : 'a path'}`;
        return out;
      }
      if (a === '--root') out.root = v;
      else if (a === '--workstream-prefix') out.workstreamPrefix = v;
      else out.worktrees.push(v);
      i++;
    } else {
      out.error = `unrecognized argument: ${a}`;
      return out;
    }
  }
  if (!out.root) out.error = 'missing --root <project root>';
  else if (out.worktrees.length === 0) out.error = 'missing --worktree <path> (give it once per worktree)';
  return out;
}

/**
 * The command-line entry point the concurrent run's teardown step names
 * (#3158). Without one, a live run fell back to `git worktree remove` — the
 * very call this module replaces. Prints `{ok, results}`, one
 * `teardownWorktree` result per `--worktree`, in order; exit 0 only when
 * every worktree was removed, 1 when any was refused, kept or halted, 2 on a
 * usage error. Never deletes a branch: each result names it for the caller.
 */
function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.error) {
    process.stdout.write(JSON.stringify({ ok: false, error: args.error, results: [] }, null, 2) + '\n');
    return 2;
  }
  const results = args.worktrees.map((worktreePath) => teardownWorktree({
    root: args.root, worktreePath, workstreamPrefix: args.workstreamPrefix,
  }));
  const ok = results.every((r) => r.ok);
  process.stdout.write(JSON.stringify({ ok, results }, null, 2) + '\n');
  return ok ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  WORKTREE_PREFIX,
  BRANCH_PREFIX,
  findLinks,
  registeredWorktrees,
  checkTarget,
  matchesWorkstreamPrefix,
  teardownWorktree,
  keepForInspection,
  parseArgs,
  main,
};
