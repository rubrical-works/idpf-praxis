// Rubrical Works (c) 2026
/**
 * @framework-script 0.111.0
 * regeneration-runner.js — Post-merge regeneration of derived artifacts and
 * verification of recomputed values (#3120, PRD Concurrent-Work Story 1.3)
 *
 * After a merge, a derived file must reflect the merged sources rather than
 * either side's stale copy, so the policy for a derived artifact is: discard
 * both sides, re-run the generator. This runner does that for the project's
 * `concurrency.derivedArtifacts` (read through derived-artifacts.js, the one
 * read path) and then verifies each `concurrency.recomputed` entry.
 *
 * THREE RULES THE SHAPE OF THE RESULT ENFORCES:
 *   - A STRING generator is a shell command and is executed, from the project
 *     root, when any changed path falls under the entry's globs (or for every
 *     entry when no changed set is given — "regenerate everything").
 *   - An OBJECT generator `{ skill, args }` is NEVER executed here. A
 *     Skill-invoked LLM task cannot be run by a script (rule 04 Step 4d says
 *     so of /fw-minimize-files, the live example), so it is returned as a
 *     `deferred-to-session` entry for the parent session to invoke through
 *     the Skill tool before continuing. The exec spy in the tests pins that
 *     no process is ever spawned for one.
 *   - A `recomputed` entry is verified AFTER regeneration by running its
 *     `verifiedBy` test through the project's own declared suites
 *     (`resolveSuites` + `scopedInvocations`, exactly as /work scopes a
 *     test run) — this runner names no test runner of its own. A failing
 *     verification is reported as `fail` and makes the run not ok; a file no
 *     declared suite covers is `unverifiable`, reported, and never a pass.
 *
 * THE CHANGED-PATH REPORT is measured, not inferred: the files each entry's
 * globs cover are hashed before and after its generator runs, and the
 * difference — rewritten, created or removed — is the report. A generator
 * that reproduces identical output therefore reports nothing, and a file a
 * generator rewrites that no member's diff ever named is still reported,
 * which is what Story 1.24's post-merge review range and Story 1.15's
 * exclusive-suite union need.
 *
 * Never throws: an absent block runs nothing and is ok; a rejected block
 * runs nothing and is not ok, with the validation errors carried.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const {
  loadConcurrency, regenerateKind, globToRegex, matchesAnyGlob, normalizePath,
} = require('./derived-artifacts');

/** The status a skill generator comes back with. */
const DEFERRED_TO_SESSION = 'deferred-to-session';

/**
 * Upper bound on one generator or verification command (#2469 spawn
 * contract). Generous because a generator may be a build; the bound is for
 * a hung process, not a slow one.
 */
const DEFAULT_TIMEOUT_MS = 600_000;

/** Directories a glob walk never descends into. */
const WALK_SKIP = new Set(['.git', 'node_modules']);

/**
 * Run a shell command string from `cwd`. Injectable, so tests can spy on
 * what was spawned — the AC2 property is "never spawned", which only an
 * exec seam can assert.
 *
 * @param {string} command
 * @param {{cwd: string, timeout?: number}} opts
 * @returns {{status: number|null, stdout: string, stderr: string, error: Error|null}}
 */
function defaultExec(command, opts = {}) {
  const timeout = opts.timeout || DEFAULT_TIMEOUT_MS;
  const r = spawnSync(command, {
    cwd: opts.cwd,
    shell: true,
    encoding: 'utf8',
    timeout: timeout,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error || null };
}

/** The literal directory a glob starts in, so a walk need not start at root. */
function literalPrefix(glob) {
  const segs = normalizePath(glob).split('/');
  const out = [];
  for (const s of segs) {
    if (s.includes('*')) break;
    out.push(s);
  }
  return out;
}

function walk(dir, root, acc) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (WALK_SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, root, acc);
    else if (e.isFile()) acc.push(normalizePath(path.relative(root, full)));
  }
}

/**
 * Hash every file under `root` that any of `globs` covers.
 *
 * @returns {Map<string, string>} relative path → sha256
 */
function snapshot(root, globs) {
  const regexes = globs.map((g) => globToRegex(normalizePath(g)));
  const files = new Set();
  for (const glob of globs) {
    const prefix = literalPrefix(glob);
    const isLiteral = prefix.length === normalizePath(glob).split('/').length;
    if (isLiteral) {
      const rel = prefix.join('/');
      try {
        if (fs.statSync(path.join(root, rel)).isFile()) files.add(rel);
      } catch { /* not present on this side — nothing to hash */ }
      continue;
    }
    const start = path.join(root, ...prefix);
    const acc = [];
    walk(start, root, acc);
    for (const rel of acc) if (regexes.some((re) => re.test(rel))) files.add(rel);
  }
  const out = new Map();
  for (const rel of files) {
    try {
      out.set(rel, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex'));
    } catch { /* vanished between listing and reading — treated as absent */ }
  }
  return out;
}

/** Paths whose hash differs, appeared or disappeared between two snapshots. */
function diffSnapshots(before, after) {
  const changed = new Set();
  for (const [rel, hash] of after) if (before.get(rel) !== hash) changed.add(rel);
  for (const rel of before.keys()) if (!after.has(rel)) changed.add(rel);
  return [...changed].sort();
}

/** Exit code as a number: a spawn that never produced one reads as -1. */
function exitCodeOf(r) {
  return typeof r.status === 'number' ? r.status : -1;
}

/**
 * Verify one `recomputed` entry through the project's declared suites.
 */
function verifyRecomputed(entry, { cwd, execFn, timeout }) {
  // Function-scoped: test-runner.js requires framework-config.js lazily for
  // the same reason, and keeping this lazy too makes load order irrelevant.
  const { resolveSuites, scopedInvocations } = require('./test-runner.js');
  const verifiedBy = normalizePath(entry.verifiedBy);
  const base = { path: entry.path, verifiedBy, commands: [], exitCode: null, reason: null };

  let suites;
  try {
    suites = resolveSuites(cwd).suites;
  } catch (err) {
    return { ...base, status: 'unverifiable', reason: `declared suites could not be resolved: ${err.message}` };
  }
  const inv = scopedInvocations({ suites, changedFiles: [verifiedBy] });
  if (inv.runs.length === 0) {
    return { ...base, status: 'unverifiable', reason: `no declared suite covers ${verifiedBy}` };
  }

  const commands = [];
  let exitCode = 0;
  let stderr = '';
  for (const run of inv.runs) {
    commands.push(run.command);
    const r = execFn(run.command, { cwd: run.cwd ? path.join(cwd, run.cwd) : cwd, timeout });
    const code = exitCodeOf(r);
    if (code !== 0 && exitCode === 0) {
      exitCode = code;
      stderr = r.stderr;
    }
  }
  return exitCode === 0
    ? { ...base, status: 'pass', commands, exitCode: 0 }
    : { ...base, status: 'fail', commands, exitCode, reason: (stderr || '').trim().split('\n').slice(-5).join('\n') || `exit ${exitCode}` };
}

/**
 * Regenerate derived artifacts for a changed set and verify recomputed ones.
 *
 * @param {{cwd?: string, changedPaths?: string[], execFn?: Function, timeoutMs?: number}} [opts]
 *   `changedPaths` omitted → every string generator runs; given (even empty)
 *   → only entries one of its `paths` or `inputs` globs covers. `skillsRan`
 *   (set by regenerateAfterSkills, #3272) skips every skill entry instead of
 *   deferring it.
 * @returns {{ok: boolean, declared: boolean, valid: boolean, errors: string[],
 *   executed: object[], deferred: object[], failed: object[], skipped: object[],
 *   changedPaths: string[], verifications: object[]}}
 *   `ok` is false on any failed generator, any failed or unverifiable
 *   verification, or a rejected block. `changedPaths` is the union of what
 *   every executed generator rewrote, relative to the root, sorted.
 */
function runRegeneration(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const execFn = typeof opts.execFn === 'function' ? opts.execFn : defaultExec;
  const timeout = opts.timeoutMs || DEFAULT_TIMEOUT_MS;

  const loaded = loadConcurrency(cwd);
  const result = {
    ok: true,
    declared: loaded.declared,
    valid: loaded.valid,
    errors: loaded.errors,
    executed: [],
    deferred: [],
    failed: [],
    skipped: [],
    changedPaths: [],
    verifications: [],
  };
  if (!loaded.valid) return { ...result, ok: false };
  if (!loaded.declared) return result;

  const everything = opts.changedPaths === undefined;
  const changed = (Array.isArray(opts.changedPaths) ? opts.changedPaths : []).map(normalizePath);
  const changedSet = new Set();

  for (const entry of loaded.derivedArtifacts) {
    // Outputs OR declared inputs (#3152): a merge that took one side of a
    // derived file leaves the output unchanged, so only the source can say
    // the output is stale.
    const triggers = [...entry.paths, ...(Array.isArray(entry.inputs) ? entry.inputs : [])];
    const matched = everything || changed.some((p) => matchesAnyGlob(p, triggers));
    if (!matched) {
      result.skipped.push({ paths: entry.paths, reason: 'no changed path matched' });
      continue;
    }
    const kind = regenerateKind(entry.regenerate);
    if (kind === 'skill' && opts.skillsRan) {
      result.skipped.push({ paths: entry.paths, reason: 'deferred skill already ran' });
      continue;
    }
    if (kind === 'skill') {
      result.deferred.push({
        paths: entry.paths,
        skill: entry.regenerate.skill,
        args: entry.regenerate.args === undefined ? null : entry.regenerate.args,
        status: DEFERRED_TO_SESSION,
      });
      continue;
    }
    const command = entry.regenerate;
    const before = snapshot(cwd, entry.paths);
    const r = execFn(command, { cwd, timeout });
    const after = snapshot(cwd, entry.paths);
    const rewritten = diffSnapshots(before, after);
    const exitCode = exitCodeOf(r);
    const record = { paths: entry.paths, command, exitCode, stdout: r.stdout || '', stderr: r.stderr || '', changed: rewritten };
    result.executed.push(record);
    if (exitCode !== 0) {
      result.failed.push({ paths: entry.paths, command, exitCode, stderr: r.error ? `${r.error.message}\n${record.stderr}` : record.stderr });
    }
    for (const p of rewritten) changedSet.add(p);
  }

  for (const entry of loaded.recomputed) {
    result.verifications.push(verifyRecomputed(entry, { cwd, execFn, timeout }));
  }

  result.changedPaths = [...changedSet].sort();
  result.ok = result.failed.length === 0 && result.verifications.every((v) => v.status === 'pass');
  return result;
}

/**
 * The deferred-to-session entries of a run result, as the Skill invocations
 * the parent session makes (#3139). A script cannot run a Skill-invoked
 * generator, so this is the hand-off: each entry names the skill, its args
 * and the paths it regenerates, plus the literal call to make.
 *
 * @param {{deferred?: object[]}} result - A runRegeneration result
 * @returns {Array<{skill: string, args: string|null, paths: string[], invoke: string}>}
 */
function deferredSkillInvocations(result) {
  const deferred = result && Array.isArray(result.deferred) ? result.deferred : [];
  return deferred.map((d) => ({
    skill: d.skill,
    args: d.args === undefined ? null : d.args,
    paths: Array.isArray(d.paths) ? [...d.paths] : [],
    invoke: d.args ? `Skill(${JSON.stringify(d.skill)}, ${JSON.stringify(d.args)})` : `Skill(${JSON.stringify(d.skill)})`,
  }));
}

/**
 * The pass after the deferred skills ran (#3272). A skill's outputs can be
 * another generator's inputs — fw-minimize-files rewrites
 * `.claude/commands/**`, which the extension registry is built from — but
 * the reconcile pass ran that generator before the skill existed. Running
 * runRegeneration again over the skill's outputs would defer the skill
 * again, since those outputs are its own globs; this pass skips every skill
 * entry and runs each string generator the skill's rewrites trigger.
 *
 * @param {{cwd?: string, changedPaths: string[], execFn?: Function, timeoutMs?: number}} opts
 *   `changedPaths` is what the skills rewrote.
 * @returns {object} A runRegeneration result; `deferred` is always empty.
 */
function regenerateAfterSkills(opts = {}) {
  return runRegeneration({ ...opts, changedPaths: Array.isArray(opts.changedPaths) ? opts.changedPaths : [], skillsRan: true });
}

module.exports = {
  DEFERRED_TO_SESSION,
  deferredSkillInvocations,
  regenerateAfterSkills,
  DEFAULT_TIMEOUT_MS,
  runRegeneration,
  defaultExec,
  snapshot,
  diffSnapshots,
};
