// Rubrical Works (c) 2026
/**
 * @framework-script 0.123.0
 * merge-back-gate.js — The Merge-Back Review Gate for concurrent `/work`
 * (#3130, PRD Concurrent-Work Story 1.13)
 *
 * No member's worktree branch reaches the shared tracker branch unchecked.
 * Three tiers, in order:
 *   Tier 1 — mechanical, unconditional, over `<tracker-tip>..wt/<name>`:
 *     every commit carries `Refs #N` for this member; the worktree has
 *     nothing uncommitted; the declared scope holds (scope-drift-check.js);
 *     the changed files are logged (log-changed-files.js); the AC checklist
 *     is read (checkbox-scan.js); and the member's path-scoped suites re-run
 *     with `cwd` at the worktree, by the parent.
 *   Tier 2 — the parent's own read, unconditional: the branch diff file by
 *     file against the member's ACs. Rule 08's Sub-Agent Review Gate; the
 *     direct-work exemption never applies, because a member is always an
 *     Agent.
 *   Tier 3 — independent review, on by default: a read-only reviewer Agent
 *     in the parent's cwd running the `diff-review` skill over the range,
 *     handed the issue, its ACs and the charter — never the implementer's
 *     summary — returning one findings document with exactly one verdict.
 *     `--no-review` skips it, and an absent skill degrades to Tiers 1–2;
 *     both are reported, never silent.
 *
 * What the parent does with the result — merge, the one fix cycle, a halt —
 * is #3141's, decided by `decideOutcome`. There is one admission rule:
 * `mayMerge` is true exactly when `decideOutcome(...).action` is `merge` for
 * the same inputs (#3935), and both are false for any Tier 1 failure, so
 * unattributed work can never merge.
 *
 * git and the suite runner are injected into every function; only the
 * command-line entry point at the bottom (#3158) spawns — real git, and each
 * declared suite command verbatim. One disk read remains outside the CLI:
 * evaluateMember and planSequentialReview call projectContext(root), which
 * reads framework-config.json and resolves the specialist, unless the caller
 * injects a resolved `briefContext` ({domains, frameworkPath}) (#3575).
 *
 * The same Tier 3 review also gates sequential `/work` (#3457): Step 4g
 * plans it over the issue's own `Refs #N` commits since the branch base and
 * settles it with no worktree and no merge.
 *
 * Subcommands — what the gate steps name; `--help` or no subcommand prints
 * the usage with each one's options:
 *   Concurrent `/work`, per member:
 *     tier1, tier3-plan, outcome, merge-back
 *   Concurrent `/work`, per group or batch:
 *     group-tier1, batch-range
 *   Sequential `/work` (Step 4g):
 *     review-plan, review-outcome
 *   Either:
 *     tree-snapshot — the tree before the reviewer spawns
 *   Cleanup:
 *     clear-member, clear-run, reclaim
 */

const path = require('path');
const scopeDrift = require('../scope-drift-check.js');
const logChangedFiles = require('../log-changed-files.js');
const { extractAcceptanceCriteria } = require('./checkbox-scan.js');
const { scopedInvocations, selectorInvocations } = require('./test-runner.js');
// A path as git wrote it, unquoted (#3377); shared since #3382.
const { unquoteGitPath } = require('./git-path.js');

const refPattern = (issue) => new RegExp(`\\bRefs #${issue}(?!\\d)`);

/** Paths named by `git status --porcelain` (rename → new path), unquoted (#3377). */
function parsePorcelain(raw) {
  return String(raw || '')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map(porcelainPath);
}

/** Commits in the range as `{sha, message}`, from a `%H%x1f%B%x1e` log. */
function parseCommits(raw) {
  return String(raw || '')
    .split('\x1e')
    .map((record) => record.replace(/^\s+/, ''))
    .filter(Boolean)
    .map((record) => {
      const sep = record.indexOf('\x1f');
      return { sha: record.slice(0, sep), message: record.slice(sep + 1).trim() };
    });
}

/**
 * A suite scopedInvocations() could not run — a placeholder expansion error
 * (`notRun`) or an invalid concurrency declaration (`invalid`) — is in
 * neither `runs` nor `deferred`, so a tier reading only those passed over it
 * (#3169). Read from the structured lists only, never the warning text,
 * whose wording is not a contract (#3175). One `suites` failure naming each
 * such suite, or null.
 * @param {{notRun?: Array<{suiteId: string, reason: string}>, invalid?: Array<{suiteId: string}>}} scoped
 * @returns {{check: string, message: string}|null}
 */
function notRunFailure(scoped) {
  const named = [];
  // #3880: a suite reached only by a selector that fell back, matching none of
  // the touched files, is what Tier 1 never reached before it ran selectors —
  // advisory (notRunAdvisory), never a failure. The Step 4f sweep runs it.
  for (const n of scoped.notRun || []) if (!n.selectorFallback) named.push(`${n.suiteId} (${n.reason})`);
  for (const i of scoped.invalid || []) named.push(`${i.suiteId} (invalid concurrency declaration)`);
  if (named.length === 0) return null;
  return { check: 'suites', message: `Suite(s) not run: ${named.join(', ')}.` };
}

/** The selector-fallback suites notRunFailure leaves out, named for the report (#3880). */
function notRunAdvisory(scoped) {
  return (scoped.notRun || []).filter((n) => n.selectorFallback).map((n) => ({ suiteId: n.suiteId, reason: n.reason }));
}

/**
 * Where a member's branch left the tracker (#3263): the merge base of the
 * tracker's current HEAD and the branch. The worktree hook branches from
 * HEAD at spawn, so a commit another session made between the recorded
 * group tip and the spawn is shared history here, never the member's. Falls
 * back to the recorded tip when git cannot answer.
 *
 * @param {{git: Function, trackerTip: string, branch: string}} input
 * @returns {string}
 */
function memberBase({ git, trackerTip, branch }) {
  try {
    const out = git(['merge-base', 'HEAD', branch]);
    const sha = String(out && out.stdout !== undefined ? out.stdout : out || '').trim();
    return /^[0-9a-f]{7,40}$/.test(sha) ? sha : trackerTip;
  } catch (_e) {
    return trackerTip;
  }
}

/**
 * The tree hash of a commit-ish (#3774), or null when git cannot answer.
 * @param {Function} git
 * @param {string} rev
 * @returns {string|null}
 */
function treeOf(git, rev) {
  try {
    const out = git(['rev-parse', `${rev}^{tree}`]);
    const sha = String(out && out.stdout !== undefined ? out.stdout : out || '').trim();
    return /^[0-9a-f]{40,64}$/.test(sha) ? sha : null;
  } catch (_e) {
    return null;
  }
}

/**
 * Whether the post-merge pass may reuse the members' Tier 1 suite results
 * (#3774). Only when the tree it would test is the tree Tier 1 tested: the
 * merge-back was clean, the reconcile, deferred-skills and
 * regenerateAfterSkills steps rewrote nothing, and the batch head's tree
 * equals every member's tested tree. Hashes of the members' own files are not
 * enough — their tests read modules other merges may have changed.
 *
 * @param {{reuse?: {cleanMerge?: boolean, tier1?: Object<number, object>, untrusted?: Array<{issue: number, reason: string}>},
 *   regenerated: string[], members: Array<{issue: number}>, head: string, git: Function}} input
 * @returns {{reused: boolean, reason: string, message: string, tree?: string|null, sources?: Array<{issue: number, tier1: object}>}}
 */
function decideSuiteReuse({ reuse, regenerated = [], members = [], head, git }) {
  const no = (reason, message) => ({ reused: false, reason, message: `Suites re-run on the tracker: ${message}.` });
  if (!reuse) return no('not-requested', 'no member Tier 1 results were given');
  if (reuse.cleanMerge !== true) return no('merge-not-clean', 'the merge-back was not reported clean (--clean-merge absent)');
  if (regenerated.length > 0) return no('regenerated', `regeneration rewrote ${regenerated.join(', ')}`);
  const untrusted = reuse.untrusted || [];
  if (untrusted.length > 0) return no('tier-1-document-untrusted', untrusted.map((u) => `#${u.issue}'s Tier 1 document ${u.reason}`).join('; '));
  const sources = members.map((m) => ({ issue: m.issue, tier1: (reuse.tier1 || {})[m.issue] }));
  const missing = sources.filter((s) => !s.tier1 || !s.tier1.testedTree).map((s) => `#${s.issue}`);
  if (missing.length > 0) return no('no-tested-tree', `no tested tree recorded for ${missing.join(', ')}`);
  const tree = treeOf(git, head);
  if (!tree) return no('tree-unreadable', `git could not read the tree of ${head}`);
  const differ = sources.filter((s) => s.tier1.testedTree !== tree);
  if (differ.length > 0) {
    return { ...no('tree-differs', `the batch head's tree ${tree} differs from the tree Tier 1 tested (${differ.map((s) => `#${s.issue}: ${s.tier1.testedTree}`).join(', ')})`), tree };
  }
  return {
    reused: true,
    reason: 'tree-matches',
    tree,
    sources,
    message: `Suite results reused from ${sources.map((s) => `#${s.issue}`).join(', ')}'s Tier 1: the batch head's tree ${tree} is the tree Tier 1 tested (clean merge, nothing regenerated).`,
  };
}

/**
 * The Tier 1 runs one post-merge run may stand on (#3774): every suite in
 * the run passed in a member's Tier 1 over a file set covering the run's, and
 * none of them is one Tier 1 deferred. Null when any suite is not covered —
 * that run executes.
 */
function reusableRun(run, sources) {
  const suiteIds = run.suiteIds || [run.suiteId];
  const issues = new Set();
  for (const id of suiteIds) {
    const covered = new Set();
    for (const s of sources) {
      if ((s.tier1.deferredSuites || []).some((d) => d.suiteId === id)) return null;
      for (const r of s.tier1.suiteRuns || []) {
        if (!r.ok || !(r.suiteIds || []).includes(id)) continue;
        (r.files || []).forEach((f) => covered.add(f));
        issues.add(s.issue);
      }
    }
    if (!(run.files || []).every((f) => covered.has(f)) || covered.size === 0) return null;
  }
  return [...issues];
}

/**
 * What a deferred suite's Tier 1 entry says (#3730): it was not run before
 * merge, why, and where it runs instead.
 *
 * @param {string} suiteId
 * @param {'exclusive'|'cannot-narrow'|'selected-none'} reason
 * @returns {string}
 */
function deferredNote(suiteId, reason) {
  const why = {
    exclusive: 'it is exclusive, so it never runs inside a worktree',
    'selected-none': "its selector chose no test over the member's files, though the suite's globs match them",
  }[reason] || "its command cannot be narrowed to the member's files (declare scoped.mode: path with a {files} command to run it here)";
  return `${suiteId} was not run before merge: ${why}; it runs once on the tracker after merge-back.`;
}

/**
 * The selected-none suites whose own globs match the member's files (#3889),
 * as cannot-narrow deferrals. Before #3880 such a suite ran on those files;
 * left in `selectedNone` alone it was neither run, deferred nor failed, so
 * Tier 1 passed as though it had been checked. `reason` stays
 * `cannot-narrow` — the class the tracker's deferred-suites run consumes,
 * running the suite over the matched files without a selector — and `cause`
 * names why. A suite matching none of the files was never reached before
 * #3880 and stays in `selectedNone` only.
 */
function selectedNoneDeferrals({ suites, changedFiles, selectedNone = [] }) {
  const ids = new Set(selectedNone.map((s) => s.suiteId));
  const matched = scopedInvocations({ suites: suites.filter((s) => ids.has(s.id)), changedFiles, inWorktree: true });
  const reached = new Set([
    ...matched.runs.flatMap((r) => r.suiteIds || [r.suiteId]),
    ...(matched.notRun || []).map((n) => n.suiteId),
  ]);
  return selectedNone.filter((s) => reached.has(s.suiteId)).map((s) => ({
    suiteId: s.suiteId, concurrency: 'parallel', reason: 'cannot-narrow', cause: 'selected-none', note: deferredNote(s.suiteId, 'selected-none'),
  }));
}

/**
 * The selector results Tier 1 hands to scopedInvocations (#3880), or
 * undefined when no selector runner is wired — which leaves the runs exactly
 * as before. Tier 1 is a gate, so it runs the sweep tier (`sweepSelect`),
 * never the per-AC `scopedSelect`: a test the full tier selects — a contract
 * test reading a member's changed source — then runs before the merge rather
 * than first at the tracker's Step 4f sweep.
 *
 * @param {{suites: object[], changedFiles: string[], root: string,
 *   runSelector?: (run: {suiteId: string, command: string, cwd: string|null}, opts: {root: string}) =>
 *     {exitCode: number|null, stdout: string, spawnError?: string}}} input
 * @returns {object|undefined} selector results keyed by suite id
 */
function selectorSelections({ suites, changedFiles, root, runSelector }) {
  if (typeof runSelector !== 'function') return undefined;
  const selections = {};
  for (const run of selectorInvocations({ suites, changedFiles }).runs) {
    selections[run.suiteId] = runSelector(run, { root });
  }
  return selections;
}

/** A Tier 1 suite run's record, carrying the selection report when the run has one (#3880). */
function suiteRunRecord(run, fields) {
  return { ...fields, ...(run.selection ? { selection: run.selection.report } : {}) };
}

/**
 * Tier 1 — mechanical checks over one member's branch.
 *
 * @param {{issue: number, body: string, trackerTip: string, branch: string,
 *   worktreePath: string, git: (args: string[], opts?: {cwd?: string}) => string,
 *   suites?: object[], runSuite?: (run: {command: string, cwd: string, suiteIds: string[], files: string[], mode: string}) => {exitCode: number},
 *   runSelector?: Function, protectedPaths?: Array<{pattern: string}>, registrarExemption?: object}} input
 *   `suites` is `resolveSuites().suites`; `protectedPaths` defaults to the
 *   drift gate's own metadata. `runSelector` runs a suite's selector in the
 *   worktree (#3880, selectorSelections); absent, no selector runs.
 * @returns {{tier: 1, ok: boolean, failures: Array<{check: string, message: string}>,
 *   commits: Array<{sha: string, attributed: boolean}>, uncommitted: string[],
 *   scope: object, filesChanged: string, acceptanceCriteria: object, suiteRuns: object[],
 *   deferredSuites: Array<{suiteId: string, concurrency: string, reason: 'exclusive'|'cannot-narrow', cause?: 'selected-none', note: string}>}}
 */
function runTier1({
  issue, body, trackerTip, branch, worktreePath, git,
  suites = [], runSuite, runSelector, protectedPaths, registrarExemption,
}) {
  const range = `${memberBase({ git, trackerTip, branch })}..${branch}`;
  const failures = [];

  const ref = refPattern(issue);
  const commits = parseCommits(git(['log', '--format=%H%x1f%B%x1e', range]))
    .map((c) => ({ sha: c.sha, attributed: ref.test(c.message) }));
  const unattributed = commits.filter((c) => !c.attributed).map((c) => c.sha);
  if (commits.length === 0) {
    failures.push({ check: 'attribution', message: `No commits in ${range} — nothing attributable to #${issue} to merge.` });
  } else if (unattributed.length > 0) {
    failures.push({ check: 'attribution', message: `Commit(s) without Refs #${issue}: ${unattributed.join(', ')}.` });
  }

  const uncommitted = parsePorcelain(git(['status', '--porcelain'], { cwd: worktreePath })).filter((p) => !isHostWritten(p));
  if (uncommitted.length > 0) {
    failures.push({ check: 'uncommitted', message: `Uncommitted work in ${worktreePath}: ${uncommitted.join(', ')}.` });
  }

  const nameStatus = git(['log', '--name-status', '--pretty=format:', range]);
  const scope = scopeDrift.run({
    issue,
    body,
    gitLog: nameStatus,
    protectedPaths: protectedPaths || scopeDrift.loadProtectedPaths(),
    registrarExemption: registrarExemption === undefined ? scopeDrift.loadRegistrarExemption() : registrarExemption,
  });
  if (!scope.ok) {
    failures.push({ check: 'scope-drift', message: `Scope-drift halt: ${scope.violations.map((v) => v.path || v.file || JSON.stringify(v)).join(', ')}.` });
  }

  const filesChanged = logChangedFiles.run(issue, () => nameStatus);

  const acs = extractAcceptanceCriteria(body || '').items;
  const acceptanceCriteria = {
    total: acs.length,
    unchecked: acs.filter((i) => !i.checked).length,
    items: acs.map((i) => i.text),
  };

  // In a worktree only parallel suites run; exclusive ones are deferred to the
  // parent's run on the tracker (rule 08). The runner gets the member's files
  // with the command (#3158): narrowing is the runner's, in the project's own
  // terms — this module still composes no command.
  // A run that narrowed nothing is the whole suite, which may read root state
  // a worktree lacks (gitignored node_modules, imported skills) and fail
  // whatever the member changed (#3159). It is deferred to the parent's
  // deferred-suites run on the tracker, never dropped.
  // Each deferred entry says in words that it never ran before the merge
  // (#3730): `reason` alone read as a classification, and a suite that
  // declares no narrowed command — a linter, until this repo declared one —
  // left no tier checking it before merge-back. A suite opts in by declaring
  // `scoped.mode: path` with a `{files}` command.
  // #3880: the selector reaches tests the member's files do not match.
  const suiteRuns = [];
  const selections = selectorSelections({ suites, changedFiles: scope.touched, root: worktreePath, runSelector });
  const scoped = scopedInvocations({ suites, changedFiles: scope.touched, inWorktree: true, selections, selectionTier: 'sweep' });
  const deferredSuites = (scoped.deferred || []).map((d) => ({ ...d, reason: 'exclusive', note: deferredNote(d.suiteId, 'exclusive') }));
  for (const run of scoped.runs.filter((r) => !r.narrowed)) {
    for (const suiteId of run.suiteIds || [run.suiteId]) {
      deferredSuites.push({ suiteId, concurrency: 'parallel', reason: 'cannot-narrow', note: deferredNote(suiteId, 'cannot-narrow') });
    }
  }
  // #3889: a selector that chose nothing over files the suite matches is not a check.
  deferredSuites.push(...selectedNoneDeferrals({ suites, changedFiles: scope.touched, selectedNone: scoped.selectedNone }));
  for (const run of scoped.runs.filter((r) => r.narrowed)) {
    const cwd = run.cwd && run.cwd !== '.' ? path.posix.join(worktreePath, run.cwd) : worktreePath;
    const suiteIds = run.suiteIds || [run.suiteId];
    const files = [...(run.files || [])];
    const result = runSuite ? runSuite({ command: run.command, cwd, suiteIds, files, mode: run.mode }) : { exitCode: null };
    const ok = result.exitCode === 0;
    suiteRuns.push(suiteRunRecord(run, { suiteIds, command: run.command, cwd, files, exitCode: result.exitCode, ok }));
  }
  const failed = suiteRuns.filter((r) => !r.ok);
  if (failed.length > 0) {
    // The command is named (#3730), so the fix cycle's implementer can re-run
    // exactly what failed in its own worktree.
    failures.push({ check: 'suites', message: `Suite run(s) failed in the worktree: ${failed.map((r) => `${r.suiteIds.join('+')} (exit ${r.exitCode}: ${r.command})`).join(', ')}.` });
  }
  const notRun = notRunFailure(scoped);
  if (notRun) failures.push(notRun);

  return {
    tier: 1,
    ok: failures.length === 0,
    failures,
    range,
    // #3774: the tree these suites ran over — the branch tip's, the worktree
    // being clean or this Tier 1 failing. The post-merge pass reuses the
    // results only when the batch head's tree is this one.
    testedTree: treeOf(git, branch),
    commits,
    uncommitted,
    scope: { ok: scope.ok, mode: scope.mode, violations: scope.violations, declaredScope: scope.declaredScope, touched: scope.touched },
    filesChanged,
    acceptanceCriteria,
    suiteRuns,
    deferredSuites,
    suitesAdvisory: notRunAdvisory(scoped),
    ...(scoped.selectedNone ? { selectedNone: scoped.selectedNone } : {}),
  };
}

/**
 * Tier 2 — the parent's own read. Not mechanical, so this returns what the
 * read must cover; the parent performs it.
 *
 * @param {{issue: number, files: string[], acceptanceCriteria: string[]}} input
 */
function buildTier2({ issue, files = [], acceptanceCriteria = [] }) {
  return {
    tier: 2,
    required: true,
    directWorkExemption: false,
    files: [...files],
    acceptanceCriteria: [...acceptanceCriteria],
    instruction: `Read the branch diff for #${issue} file by file and map each change to an acceptance criterion; `
      + 'flag any change no AC asks for. This is rule 08\'s Sub-Agent Review Gate — file content must be read and verified, '
      + 'and the direct-work exemption never applies: a concurrent member is always an Agent.',
  };
}

const SKILL_DIR = path.join('.claude', 'skills', 'diff-review');

/** The project's resolved domain ids and absolute frameworkPath for the Tier 3 prompt (#3501), read at plan time. */
function projectContext(root = process.cwd()) {
  const ctx = require('./specialist-resolver.js').resolveBriefContext({ root });
  return { domains: ctx.domains, frameworkPath: ctx.frameworkPath };
}

/** An injected `briefContext`'s domains and frameworkPath, else projectContext(root)'s disk read (#3575). */
function briefOf(briefContext, root) {
  return briefContext ? { domains: briefContext.domains || [], frameworkPath: briefContext.frameworkPath } : projectContext(root);
}

/** Whether the `diff-review` skill is installed under `root`. */
function diffReviewSkillPresent(root = process.cwd()) {
  const fs = require('fs');
  return fs.existsSync(path.join(root, SKILL_DIR, 'SKILL.md'))
    && fs.existsSync(path.join(root, SKILL_DIR, 'output-schema.json'));
}

/**
 * Tier 3 — the reviewer request, or the reported skip.
 *
 * Deliberately has no summary parameter: the implementer's account is never
 * an input, so the read stays independent (diff-review § Input Contract).
 *
 * @param {{issue: number, acceptanceCriteria?: string[], filesToModify?: string[],
 *   range: string, commits?: string[], charterPath?: string, noReview?: boolean,
 *   skillPresent?: boolean, domains?: string[], frameworkPath?: string}} input
 *   `commits` are the issue's own commit SHAs inside `range`, oldest first
 *   (#3457): when given, the prompt confines the review to them, since a
 *   sequential range can hold other issues' commits; omitted or empty, the
 *   whole range is under review.
 *   `domains` and `frameworkPath` are the project's resolved domain ids and
 *   absolute framework path, named in the prompt (#3501).
 */
function planTier3({ issue, acceptanceCriteria = [], filesToModify = [], range, commits = [], charterPath = 'CHARTER.md', noReview = false, skillPresent, domains = [], frameworkPath }) {
  if (noReview) {
    return { tier: 3, skipped: true, reason: 'no-review', message: `Tier 3 skipped for #${issue}: --no-review was passed. Tiers 1–2 still ran.` };
  }
  const present = skillPresent === undefined ? diffReviewSkillPresent() : skillPresent;
  if (!present) {
    return { tier: 3, skipped: true, reason: 'skill-absent', message: `Tier 3 skipped for #${issue}: the diff-review skill is not installed, so the gate ran Tiers 1–2 only.` };
  }

  // The reviewer writes its own output file (#3204): with the parent as the
  // only conduit, a transcription that drifted from the reviewer's words passed
  // every check. The Agent tool has no parameter restricting writes to one
  // path, so `writes` states the contract and `outcome`'s tree check against
  // the pre-spawn snapshot enforces it.
  const outputPath = `.tmp-gate-${issue}-tier3.json`;
  const treeBeforePath = `.tmp-gate-${issue}-tree-before.txt`;
  const prompt = [
    `You are a code reviewer. Review ONLY the commit range ${range}.`,
    // Sequential /work (#3457): other issues' commits can sit inside the range.
    ...(commits.length ? [`Within it, review ONLY #${issue}'s own commits: ${commits.join(', ')} (git show -W <sha>, the skill's per-commit function-context read); changes from any other commit are not under review.`] : []),
    '',
    'Inputs:',
    `- Issue: #${issue}. Acceptance criteria:`,
    ...(acceptanceCriteria.length ? acceptanceCriteria.map((ac) => `  - [ ] ${ac}`) : ['  (none declared)']),
    `  Files to modify: ${filesToModify.length ? filesToModify.join(', ') : '(none declared)'}`,
    `- Charter: ${charterPath}`,
    `- Domain ids: ${domains.length ? domains.join(', ') : 'none'}`,
    ...(frameworkPath ? [`- frameworkPath: ${frameworkPath}`] : []),
    '',
    "Not inputs: you have not been given the implementer's summary, and you must not",
    'ask for it or infer one from commit messages. Judge the diff against the',
    'acceptance criteria and the charter only.',
    '',
    'Procedure: follow .claude/skills/diff-review/SKILL.md — read',
    '.claude/skills/diff-review/review-criteria.json from disk, count first (git diff --numstat',
    'with three dots, git log with two), read within the budget, evaluate every criterion,',
    'and derive the verdict from the verdict rule.',
    '',
    `Output: Write your final JSON document to ${outputPath} in the current directory —`,
    'ONE JSON document valid against .claude/skills/diff-review/output-schema.json, and',
    `nothing else — then reply with only that path. ${outputPath} is the one file you may`,
    'write. Do not create, edit or delete any other file: the gate compares the working tree',
    'with a snapshot taken before you started and fails this review on any other change.',
  ].join('\n');

  return {
    tier: 3,
    skipped: false,
    outputPath,
    treeBeforePath,
    // A typed request carries the parent's fallback step (#3500).
    // idpf-diff-reviewer since #3507's comparison passed (Construction/Design-
    // Decisions/2026-11-01-diff-reviewer-comparison.md); Step 4g and Tier 3 share it.
    request: require('./subagent-fallback.js').withFallback({ description: `Review #${issue}`, subagent_type: 'idpf-diff-reviewer', writes: [outputPath], prompt }),
  };
}

/** The path a `git status --porcelain` line names — the destination of a rename, unquoted. */
function porcelainPath(line) {
  const rest = line.slice(3);
  const arrow = rest.indexOf(' -> ');
  return unquoteGitPath(arrow === -1 ? rest : rest.slice(arrow + 4));
}

/**
 * A CLI-given path in the form porcelainPath reports (#3625): relative to
 * `root`, forward slashes — so `./x` and an absolute path name the same file.
 */
function rootRelative(root, p) {
  return path.relative(root, path.resolve(root, p)).split(path.sep).join('/');
}

/**
 * Paths the host writes on its own (#3263): Claude Code rewrites
 * `.claude/settings.local.json` — git-tracked in some projects — when a
 * permission is granted with "always allow". A change there during a run is
 * neither a member's nor a reviewer's, and restoring it would revert the
 * user's grant, so it is reported apart and never halts or fails a tier.
 */
const HOST_WRITTEN_PATHS = Object.freeze(['.claude/settings.local.json']);
const isHostWritten = (p) => HOST_WRITTEN_PATHS.includes(String(p).replace(/\\/g, '/'));

/**
 * The uncommitted tracker paths a concurrent run would inherit (#3277): every
 * `git status --porcelain` path but the host-written ones. The preamble
 * reports them as TRACKER_TREE_DIRTY before any worktree is spawned.
 */
function dirtyTrackerPaths(raw) {
  return parsePorcelain(raw).filter((p) => !isHostWritten(p));
}

/** A top-level `.tmp-gate-*` entry — the gate's own files, any member's. */
const GATE_FILE = /^\.tmp-gate-[^/]+$/;

/**
 * A concurrent run's scratch files (#3360): the gate documents, member
 * briefs, the rolling state and the run ledger. `clearScratch` removes only
 * these, as `--clear` removes only GATE_FILE entries.
 */
const SCRATCH_FILE = /^\.tmp-(?:gate|brief|rolling|concurrent)-[^/\\]+$/;

/**
 * A member's five scratch files (#3360, #3558): its three gate files, its
 * brief, then the result file the implementer writes at the root. tier1 stays
 * first — `--tier1-only` and `--keep-tier1` slice on that position.
 */
const memberScratch = (n) => [`.tmp-gate-${n}-tier1.json`, `.tmp-gate-${n}-tier3.json`, `.tmp-gate-${n}-tree-before.txt`, `.tmp-brief-${n}.md`, `.tmp-gate-${n}-member.json`, `.tmp-gate-${n}-fix-record.json`];

/**
 * Remove a run's scratch files (#3360) — the one remover, so no step names a
 * shell `rm` on a variable path. Every path must resolve to a file directly in
 * `root` whose name is a SCRATCH_FILE; one that does not refuses the whole
 * call, and nothing is removed. A path already gone is reported absent.
 *
 * @param {{root: string, files: string[], fs?: object}} input
 * @returns {{ok: boolean, removed: string[], absent: string[], refused: string[]}}
 *   removed/absent name each file relative to `root`; refused, as given.
 */
function clearScratch({ root, files = [], fs = require('fs') } = {}) {
  const base = path.resolve(root);
  const resolved = files.map((f) => ({ given: f, abs: path.resolve(base, f) }));
  const refused = resolved.filter(({ abs }) => {
    const rel = path.relative(base, abs);
    if (rel !== path.basename(abs) || !SCRATCH_FILE.test(rel)) return true;
    return fs.existsSync(abs) && !fs.statSync(abs).isFile();
  }).map((r) => r.given);
  if (refused.length) return { ok: false, removed: [], absent: [], refused };
  const removed = [];
  const absent = [];
  for (const { abs } of resolved) {
    const name = path.basename(abs);
    if (!fs.existsSync(abs)) { absent.push(name); continue; }
    fs.unlinkSync(abs);
    removed.push(name);
  }
  return { ok: true, removed, absent, refused: [] };
}

/**
 * The tree-snapshot status call, shared by `tree-snapshot` and `outcome`. The
 * untracked-files mode is explicit (#3221): inherited, a project's
 * status.showUntrackedFiles=no hides every new file from both snapshots.
 */
const TREE_STATUS_ARGS = ['status', '--porcelain', '--ignored', '--untracked-files=normal'];

const sha256 = (text) => require('crypto').createHash('sha256').update(String(text)).digest('hex');

/**
 * Could run path `runPath` name a file inside the directory `dir` (`a/b/`)?
 * A literal path under it does; so does a glob that matches a file there, or
 * one whose literal prefix (up to the first wildcard) lies under or above it —
 * `src/**` and `src/*\/x.js` both reach into a new `src/new/` (#3293). Over-
 * inclusive on purpose: a missed directory lets a stray write pass Tier 3.
 * A declared directory written without a trailing slash (`src/new`, `src`)
 * counts as the directory itself or an ancestor of it (#3601).
 */
function dirMayHoldRunPath(dir, runPath) {
  if (runPath.startsWith(dir)) return true;
  if (dir.startsWith(`${runPath.replace(/\/+$/, '')}/`)) return true;
  const wild = runPath.search(/[*?[{]/);
  if (wild === -1) return false;
  if (scopeDrift.matchesAny(`${dir}x`, [runPath])) return true;
  const prefix = runPath.slice(0, runPath.lastIndexOf('/', wild) + 1);
  return dir.startsWith(prefix);
}

/**
 * Whether a reviewer kept to its write contract (#3204): compare
 * `git status --porcelain --ignored` after the review with the snapshot taken
 * before the spawn. A line present after and not before is a change; any
 * whose path is not a top-level `.tmp-gate-*` file is outside the contract.
 * `--ignored` is what lets a write to a gitignored path show at all.
 *
 * The exemption is per member, not every `.tmp-gate-*` path (#3220). This
 * member may add only its own review file and its own snapshot. Reviewers in
 * one group run at once and share the root, so each running-group sibling's
 * own Tier 1, review and snapshot files — the parent writes the first and
 * last during the window — are expected too. Any other gate file, another
 * group's included, is outside the contract. Known blind spots, stated rather
 * than hidden: a write inside an already-listed untracked or ignored
 * directory, or to a file whose status line does not change, leaves no new
 * line — `outcome --tree-before-sha` covers the snapshot itself; a
 * sibling-shaped write is indistinguishable without per-spawn write
 * restriction, and `parseReview`'s issue check catches one at the sibling's
 * own outcome.
 *
 * @param {{before: string, after: string, issue?: number, outputPath?: string, siblings?: number[], runPaths?: string[]}} input
 *   `runPaths` (#3263): the running members' declared scope. Given, only a
 *   change inside it is outside the contract; any other change is listed as
 *   `external` (another session's) and does not fail. Host-written paths
 *   (HOST_WRITTEN_PATHS) are listed as `hostWritten` either way.
 *   `runWorktrees` (#3729): the root-relative worktree directories the run
 *   ledger names. Under the rolling schedule the parent spawns the next
 *   member, or tears a merged one down, while a sibling's reviewer runs; such
 *   a directory appearing or disappearing is the run's own, so it is listed
 *   under `runWorktrees` and never fails. A directory no ledger names — any
 *   other `.tmp-wt-*` included — is judged as before.
 * @returns {{ok: boolean, outsideContract: string[], hostWritten?: string[], external?: string[], runWorktrees?: {appeared: string[], removed: string[]}}}
 */
function checkReviewerTree({ before = '', after = '', issue, outputPath = `.tmp-gate-${issue}-tier3.json`, siblings = [], runPaths, runWorktrees } = {}) {
  const lines = (s) => String(s).split(/\r?\n/).filter((l) => l.trim() !== '');
  const prior = new Set(lines(before));
  const allowed = new Set([outputPath, `.tmp-gate-${issue}-tree-before.txt`]);
  // #3559: member.json too — a sibling still running writes its result file at
  // the root during this member's Tier 3 window.
  for (const m of siblings) for (const f of ['tier1.json', 'tier3.json', 'tree-before.txt', 'member.json', 'fix-record.json']) allowed.add(`.tmp-gate-${m}-${f}`);
  // #3729: only a directory line (`dir/`) can be a ledgered worktree.
  const ledgered = new Set((runWorktrees || []).map(normalizeDir));
  const isRunWorktree = (p) => p.endsWith('/') && ledgered.has(normalizeDir(p));
  const posterior = new Set(lines(after));
  const added = [...new Set(lines(after).filter((l) => !prior.has(l)).map(porcelainPath))];
  const appeared = added.filter(isRunWorktree).sort();
  const removed = [...new Set(lines(before).filter((l) => !posterior.has(l)).map(porcelainPath).filter(isRunWorktree))].sort();
  const changed = added.filter((p) => !allowed.has(p) && !isRunWorktree(p)).sort();
  // #3263: a path the host itself writes (a permission grant) is not the
  // reviewer's. With the run's paths given, a change outside them is another
  // session's — reported as external; only a change inside them fails, which
  // is where a stray reviewer write would do harm. No run paths: strict.
  const hostWritten = changed.filter(isHostWritten);
  const rest = changed.filter((p) => !isHostWritten(p));
  const scoped = Array.isArray(runPaths);
  // A new untracked or ignored directory is listed as `dir/`; it is inside
  // the run when any run path could name a file in it (#3293).
  const inRun = (p) => (p.endsWith('/') ? runPaths.some((r) => dirMayHoldRunPath(p, String(r))) : scopeDrift.matchesAny(p, runPaths));
  const outsideContract = scoped ? rest.filter(inRun) : rest;
  const external = scoped ? rest.filter((p) => !inRun(p)) : [];
  return {
    ok: outsideContract.length === 0, outsideContract,
    ...(hostWritten.length ? { hostWritten } : {}), ...(external.length ? { external } : {}),
    ...(appeared.length || removed.length ? { runWorktrees: { appeared, removed } } : {}),
  };
}

/** A directory path in comparable form (#3729), as concurrency-plan.js normalizeWorktreePath compares worktrees. */
const normalizeDir = (p) => require('./concurrency-plan.js').normalizeWorktreePath(p);

/**
 * The worktree directories the run ledger (`.tmp-concurrent-<tracker>.json`,
 * written by `record-spawn`) names, root-relative (#3729). An absent ledger
 * names none; an unreadable one names none and says why, so the tree check
 * stays strict rather than guessing. A path outside `root` is dropped: it
 * can never be a line in the root's status.
 *
 * @returns {{worktrees: string[], error: string|null}}
 */
function readLedgerWorktrees(root, ledgerPath) {
  let ledger;
  try {
    ledger = JSON.parse(require('fs').readFileSync(path.resolve(root, ledgerPath), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return { worktrees: [], error: null };
    return { worktrees: [], error: `cannot read run ledger ${ledgerPath}: ${e.message}` };
  }
  const members = ledger && Array.isArray(ledger.members) ? ledger.members : [];
  const worktrees = members.map((m) => (m && typeof m.worktreePath === 'string' ? rootRelative(root, m.worktreePath.replace(/\\/g, '/')) : null))
    .filter((p) => p && !p.startsWith('..') && !path.isAbsolute(p));
  return { worktrees, error: null };
}

/**
 * Tier 3 from the reviewer's own file (#3204). Checked in order: the snapshot
 * still matches the sha256 tree-snapshot reported (`tier-3-snapshot-changed`,
 * #3220), the file exists (`tier-3-missing`), it was not already listed in the
 * snapshot (`tier-3-stale-output`), the tree shows no write outside the contract
 * (`tier-3-wrote-outside-contract`, naming the paths), then the document
 * itself through `parseReview`. Each failure fails Tier 3 the way an
 * unreadable review does.
 */
function evaluateTier3({ issue, outputPath = `.tmp-gate-${issue}-tier3.json`, exists, text, treeBefore, treeBeforeIntact = true, treeAfter, siblings = [], runPaths, runWorktrees, schema, root } = {}) {
  const fail = (error, message, extra = {}) => ({ tier: 3, skipped: false, ok: false, verdict: null, findings: [], error, errors: [message], ...extra });
  // The snapshot is the trust anchor for every check below (#3220): changed
  // after it was taken, it proves nothing, so nothing else is read.
  if (!treeBeforeIntact) {
    return fail('tier-3-snapshot-changed', `.tmp-gate-${issue}-tree-before.txt no longer matches the sha256 tree-snapshot reported, so the write-contract check has no baseline.`);
  }
  if (!exists) {
    return fail('tier-3-missing', `The reviewer wrote no ${outputPath}, so there is no review to decide from.`);
  }
  // A file the pre-spawn snapshot already lists predates this reviewer — a
  // fix-cycle or resumed re-run would otherwise decide from the previous
  // cycle's review (code review H2). `tree-snapshot --clear` removes it first.
  const priorLines = String(treeBefore || '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (priorLines.some((l) => porcelainPath(l) === outputPath)) {
    return fail('tier-3-stale-output', `${outputPath} already existed before the reviewer started, so it may be an earlier cycle's review. Clear it with tree-snapshot --clear before the spawn.`);
  }
  const tree = checkReviewerTree({ before: treeBefore, after: treeAfter, issue, outputPath, siblings, runPaths, runWorktrees });
  if (!tree.ok) {
    return fail('tier-3-wrote-outside-contract',
      `The working tree changed outside the reviewer's contract during the review: ${tree.outsideContract.join(', ')}. `
      + 'Reviewers in a group share the root, so this fails Tier 3 for every member whose review window overlapped.',
      { outsideContract: tree.outsideContract, ...(tree.runWorktrees ? { runWorktrees: tree.runWorktrees } : {}) });
  }
  const review = parseReview(text, { issue, schema, root });
  // Reported, never failed (#3263, #3729).
  return {
    ...review, ...(tree.external ? { external: tree.external } : {}), ...(tree.hostWritten ? { hostWritten: tree.hostWritten } : {}),
    ...(tree.runWorktrees ? { runWorktrees: tree.runWorktrees } : {}),
  };
}

/**
 * Parse and validate the reviewer's final message. Anything that is not one
 * schema-valid document for this issue is reported with `verdict: null` —
 * and `mayMerge` treats that as not passing.
 *
 * @param {string} text
 * @param {{issue: number, schema?: object, root?: string}} opts
 *   `schema` defaults to the installed skill's `output-schema.json`.
 */
function parseReview(text, { issue, schema, root = process.cwd() } = {}) {
  const fail = (errors) => ({ tier: 3, skipped: false, ok: false, verdict: null, findings: [], errors });
  // One validator for every framework role's return (#3499): an empty reply,
  // prose, or a schema-invalid document is this reviewer's error.
  const checked = require('./subagent-result.js').validateResult({ role: 'idpf-diff-reviewer', text, schema, root });
  if (!checked.ok) return fail(checked.errors);
  const doc = checked.result;
  if (doc.issue !== issue) {
    return fail([`Review is of #${doc.issue}, not #${issue}.`]);
  }
  return { tier: 3, skipped: false, ok: true, verdict: doc.verdict, findings: doc.findings, budget: doc.budget, errors: [] };
}

// ─── Outcomes (#3141) ───

const EMOJI = { pass: '✅', warn: '⚠️', fail: '❌' };
const at = (f) => `${f.file || '(no file)'}${f.line === null || f.line === undefined ? '' : `:${f.line}`}`;

/** Whether the gate's tiers, taken together, admit the member. */
function gatePassed(tier1, tier3) {
  if (!tier1 || !tier1.ok) return false;
  if (!tier3 || tier3.skipped) return true;
  return tier3.verdict === 'pass' || tier3.verdict === 'warn';
}

/** The findings and Tier 1 failures as `file:line — evidence` lines. */
function findingLines(tier1, tier3) {
  const lines = [];
  for (const f of (tier1 && tier1.failures) || []) lines.push(`- ❌ tier-1/${f.check} — ${f.message}`);
  // A Tier 3 that produced no usable review says why (#3204), or the message
  // the implementer gets — or the halt — names no reason at all.
  if (tier3 && !tier3.skipped && tier3.ok === false) {
    for (const e of tier3.errors || []) lines.push(`- ❌ tier-3/${tier3.error || 'unreadable'} — ${e}`);
  }
  for (const f of (tier3 && tier3.findings) || []) lines.push(`- ${EMOJI[f.status] || f.status} ${f.criterion} ${at(f)} — ${f.evidence}`);
  return lines;
}

/** The orchestrator's unswept line (#3223), required lazily: that module requires this one's CLI. */
const unsweptLines = (unswept) => (unswept && unswept.length ? [require('./concurrent-orchestration.js').unsweptLine(unswept)] : []);
const unsweptOf = (opts) => (opts['--unswept'] || []).map(Number).filter(Number.isInteger);

/**
 * Tier 3 errors that describe the reviewer process rather than the member's
 * code (#3222): `evaluateTier3`'s pre-parse failures. A document the reviewer
 * wrote that fails to parse is still the review's own content, so it is not
 * listed here.
 */
const REVIEWER_PROCESS_ERRORS = new Set(['tier-3-snapshot-changed', 'tier-3-missing', 'tier-3-stale-output', 'tier-3-wrote-outside-contract']);
const isReviewerProcessFailure = (tier3) => !!(tier3 && !tier3.skipped && REVIEWER_PROCESS_ERRORS.has(tier3.error));

// ─── Correctness criteria (#3907) ───
//
// Which diff-review criteria are correctness — a warn on one is a defect
// report, fixed before merge — is data, never a list here. A criterion the
// file does not list is treated as correctness and named unclassified.

const CRITERION_CLASSES_FILE = path.join('.claude', 'metadata', 'review-criterion-classes.json');
const CRITERION_CLASSES_SCHEMA = path.join('.claude', 'metadata', 'review-criterion-classes-schema.json');

/**
 * The project's criterion classes, schema-validated. NEVER THROWS: a missing,
 * unparseable or invalid file returns `ok: false` with the error and empty
 * sets, so every non-pass finding is unclassified — fix-first, reported.
 *
 * @returns {{ok: boolean, error?: string, correctness: Set<string>, process: Set<string>, codeReviewCategories: Map<string, string[]>}}
 */
function loadCriterionClasses(root = process.cwd()) {
  const fs = require('fs');
  const empty = (error) => ({ ok: false, error, correctness: new Set(), process: new Set(), codeReviewCategories: new Map() });
  let data;
  let schema;
  try {
    data = JSON.parse(fs.readFileSync(path.join(root, CRITERION_CLASSES_FILE), 'utf8'));
    schema = JSON.parse(fs.readFileSync(path.join(root, CRITERION_CLASSES_SCHEMA), 'utf8'));
  } catch (e) {
    return empty(`${CRITERION_CLASSES_FILE.replace(/\\/g, '/')} unreadable: ${String(e.message).split('\n')[0]}`);
  }
  try {
    const Ajv = require('ajv/dist/2020');
    const { $schema: _dialect, ...body } = schema;
    const validate = new Ajv({ allErrors: true, strict: false }).compile(body);
    if (!validate(data)) {
      return empty(`${CRITERION_CLASSES_FILE.replace(/\\/g, '/')} fails its schema: ${(validate.errors || []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ')}`);
    }
  } catch (e) {
    return empty(`${CRITERION_CLASSES_FILE.replace(/\\/g, '/')} could not be validated: ${String(e.message).split('\n')[0]}`);
  }
  const out = { ok: true, correctness: new Set(), process: new Set(), codeReviewCategories: new Map() };
  for (const c of data.criteria) {
    if (out.correctness.has(c.id) || out.process.has(c.id)) return empty(`${CRITERION_CLASSES_FILE.replace(/\\/g, '/')} lists ${c.id} twice`);
    out[c.class].add(c.id);
    out.codeReviewCategories.set(c.id, Array.isArray(c.codeReviewCategories) ? [...c.codeReviewCategories] : []);
  }
  return out;
}

/**
 * Split a review's NON-PASS findings by class. A criterion in neither set is
 * correctness and its id is listed in `unclassified`, once.
 */
function classifyFindings(findings = [], classes = { correctness: new Set(), process: new Set() }) {
  const out = { correctness: [], process: [], unclassified: [] };
  for (const f of Array.isArray(findings) ? findings : []) {
    if (!f || f.status === 'pass') continue;
    if (classes.process.has(f.criterion)) {
      out.process.push(f);
      continue;
    }
    out.correctness.push(f);
    if (!classes.correctness.has(f.criterion) && !out.unclassified.includes(f.criterion)) out.unclassified.push(f.criterion);
  }
  return out;
}

/** Why a correctness finding is filed instead of fixed — the two the fallback admits. */
const FILE_REASONS = {
  outsideScope: 'fixing it needs a change outside the declared scope',
  stillFlagged: 'the re-review still flags it after the fix cycle',
};

/**
 * Whether `file` lies in the declared scope: an exact or glob match
 * (scope-drift-check.js `matchesAny`), or under a declared directory. A
 * finding with no file, or an issue declaring nothing, is in scope — the fix
 * cycle is never skipped for want of a declaration.
 */
function inDeclaredScope(file, scope = []) {
  if (!file || !Array.isArray(scope) || scope.length === 0) return true;
  const f = String(file).replace(/\\/g, '/');
  if (scopeDrift.matchesAny(f, scope)) return true;
  return scope.some((p) => {
    const d = String(p).replace(/\\/g, '/');
    return d.endsWith('/') && f.startsWith(d);
  });
}

/**
 * What a Tier 3 `warn` asks for once its findings are classified (#3907).
 * Null for anything but a readable warn. Otherwise:
 *   admit — every non-pass finding is on a process criterion: as before;
 *   fix   — a correctness finding in the declared scope, no cycle spent yet:
 *           the one fix cycle, as a fail gets (out-of-scope ones wait in
 *           `toFile` for the fallback);
 *   file  — the fallback: a correctness finding the fix cycle cannot reach
 *           (outside the declared scope) or did not clear (the re-review
 *           still flags it). Each is filed, then the gate admits.
 * The order is fixed — no prompt chooses between fix and file.
 */
function correctnessDisposition({ tier3, classes, fixCycles = 0, declaredScope = [] } = {}) {
  if (!tier3 || tier3.skipped || tier3.ok === false || tier3.verdict !== 'warn') return null;
  const cls = classifyFindings(tier3.findings, classes);
  const base = { correctness: cls.correctness, process: cls.process, unclassified: cls.unclassified };
  if (!cls.correctness.length) return { action: 'admit', ...base, toFix: [], toFile: [] };
  const outside = cls.correctness.filter((f) => !inDeclaredScope(f.file, declaredScope));
  const inside = cls.correctness.filter((f) => inDeclaredScope(f.file, declaredScope));
  if (fixCycles === 0 && inside.length) {
    return { action: 'fix', ...base, toFix: inside, toFile: outside.map((finding) => ({ finding, reason: FILE_REASONS.outsideScope })) };
  }
  return {
    action: 'file', ...base, toFix: [],
    toFile: [
      ...outside.map((finding) => ({ finding, reason: FILE_REASONS.outsideScope })),
      ...inside.map((finding) => ({ finding, reason: FILE_REASONS.stillFlagged })),
    ],
  };
}

/** The run report's line naming unclassified criteria, or none. */
const unclassifiedLines = (ids = []) => (ids.length ? [`Unclassified criteria, treated as correctness (fix-first): ${ids.join(', ')} — classify them in ${CRITERION_CLASSES_FILE.replace(/\\/g, '/')}.`] : []);

/**
 * The structured comment the parent posts on the sub-issue when a member
 * merges (#3141): every tier's result and every finding, so the review is
 * on the record where the issue is.
 */
function formatFindingsComment({ issue, tier1, tier3, fixCycles = 0 } = {}) {
  const verdict = !tier3 || tier3.skipped ? (tier1 && tier1.ok ? 'pass' : 'fail') : (tier3.verdict || 'fail');
  const lines = [`## Merge-Back Review — #${issue}`, '', `Verdict: **${verdict}**${fixCycles > 0 ? ` (after ${fixCycles} fix cycle${fixCycles === 1 ? '' : 's'})` : ''}`];
  lines.push(`Tier 1: **${tier1 && tier1.ok ? 'pass' : 'fail'}**`);
  if (!tier3 || tier3.skipped) {
    lines.push(`Tier 3 skipped${tier3 && tier3.reason ? ` (${tier3.reason})` : ''}${tier3 && tier3.message ? `: ${tier3.message}` : ''}`);
  } else {
    lines.push(`Tier 3: **${tier3.verdict}**${tier3.ok === false ? ' (document invalid)' : ''}`);
  }
  const findings = findingLines(tier1, tier3);
  if (findings.length) lines.push('', '### Findings', ...findings);
  // Advisory per issue (#2520), but recorded (#3272): nothing else says a member strayed.
  const outside = ((tier1 && tier1.scope && tier1.scope.violations) || []).filter((v) => v.reason === 'outside-declared-scope');
  if (outside.length) lines.push('', '### Outside declared scope (advisory)', ...outside.map((v) => `- \`${v.path || v.file}\``));
  return lines.join('\n');
}

/**
 * What the parent does with a member's gate result (#3141):
 *   pass/warn → `merge`, with the comment to post;
 *   fail, no cycle used → `send-findings` to the SAME implementer, its
 *     worktree intact, every tier to re-run once;
 *   fail, cycle used → `halt`: files and lines, worktree kept, never merged.
 * A resume after compaction counts the re-run as the one cycle.
 *
 * A reviewer-PROCESS failure with a passing Tier 1 (#3222) is not a finding
 * in the member's code, so it never reaches the implementer: the first is
 * `re-review` (the parent re-snapshots and re-spawns the reviewer in the same
 * slot; the fix-cycle count is left as it was), the second (`reviewRetries`
 * 1) is a `halt` attributed to the reviewer.
 *
 * `unswept` (#3223): members a --nonstop run already moved to in_review with
 * no sweep yet; every halt here names them, as merge-back's does (#3202).
 */
/**
 * The one admission rule (#3935), shared by `decideOutcome` and `mayMerge` so
 * the two can never disagree: the tiers must pass (`gatePassed`), and a warn's
 * correctness disposition (#3907) must not be `fix` — `admit` and the filing
 * fallback `file` both merge. `cycles` is the fix-cycle count after the
 * compaction adjustment.
 */
function admission({ tier1, tier3, cycles = 0, classes, root = process.cwd() } = {}) {
  // #3907: a warn is classified before it is admitted — a correctness finding
  // gets the fix cycle, or the filing fallback once that cycle is spent.
  const disp = tier1 && tier1.ok && tier3 && tier3.verdict === 'warn'
    ? correctnessDisposition({ tier3, classes: classes || loadCriterionClasses(root), fixCycles: cycles, declaredScope: (tier1.scope && tier1.scope.declaredScope) || [] })
    : null;
  return { admitted: gatePassed(tier1, tier3) && !(disp && disp.action === 'fix'), disp };
}

function decideOutcome({ member = {}, tier1, tier3, fixCycles = 0, reviewRetries = 0, resumedFromCompaction = false, epic, unswept = [], classes, root = process.cwd() } = {}) {
  const cycles = resumedFromCompaction ? Math.max(fixCycles, 1) : fixCycles;
  const issue = member.issue;
  const { admitted, disp } = admission({ tier1, tier3, cycles, classes, root });
  const correctnessFields = disp ? { correctness: disp.correctness, unclassified: disp.unclassified, toFile: disp.toFile } : { correctness: [], unclassified: [], toFile: [] };
  if (admitted) {
    return { action: 'merge', issue, fixCycles: cycles, ...correctnessFields, comment: { issue, body: formatFindingsComment({ issue, tier1, tier3, fixCycles: cycles }) } };
  }
  const findings = findingLines(tier1, tier3);
  if (tier1 && tier1.ok && isReviewerProcessFailure(tier3)) {
    if (reviewRetries === 0) {
      // The stray paths travel as data (#3226), so the parent can report and
      // clear them before re-snapshotting — never absorb them into the baseline.
      const stray = tier3.error === 'tier-3-wrote-outside-contract' && Array.isArray(tier3.outsideContract) ? { outsideContract: [...tier3.outsideContract] } : {};
      return { action: 're-review', issue, fixCycles: cycles, reviewRetry: 1, error: tier3.error, findings, ...stray };
    }
    const report = [
      `Halted: the Tier 3 reviewer for #${issue} failed twice (${tier3.error}) — a reviewer-process failure, not a finding in #${issue}'s code; the implementer's fix cycle was not spent on it.`,
      ...findings.map((l) => `  ${l}`),
      `  Worktree kept: ${member.worktreePath}${member.branch ? ` (${member.branch})` : ''} — never merged.`,
      ...unsweptLines(unswept),
      `  Resume: check what wrote outside the reviewer's contract (or why no review was written), then /work ${epic || '<epic>'} --nonstop --concurrent.`,
    ].join('\n');
    return { action: 'halt', issue, attributedTo: 'reviewer', worktreeKept: member.worktreePath, findings, report };
  }
  if (cycles === 0) {
    const message = [
      `Merge-Back Review findings for #${issue} — fix cycle 1 of 1`,
      ...findings,
      ...(disp ? [`The verdict is warn, but ${disp.toFix.length} finding${disp.toFix.length === 1 ? ' is' : 's are'} on a correctness criterion: fix ${disp.toFix.length === 1 ? 'it' : 'them'} before merge (#3907).`] : []),
      ...unclassifiedLines(correctnessFields.unclassified),
      `Fix these in your worktree (${member.worktreePath}) and commit each fix as \`Refs #${issue} — <what>\`. Do not push, do not merge, do not move the issue. Reply when done; every tier re-runs once, and a second fail halts the run.`,
    ].join('\n');
    return { action: 'send-findings', issue, to: member.agent, worktreePath: member.worktreePath, fixCycle: 1, rerunAllTiers: true, findings, ...correctnessFields, message };
  }
  const report = [
    `Halted: Merge-Back Review Gate failed for #${issue} after one fix cycle${resumedFromCompaction ? ' (resumed after compaction — the resumed re-run was the cycle)' : ''}.`,
    '  Findings (file:line):',
    ...findings.map((l) => `  ${l}`),
    `  Worktree kept: ${member.worktreePath}${member.branch ? ` (${member.branch})` : ''} — never merged.`,
    ...unsweptLines(unswept),
    `  Resume: fix in the kept worktree, then /work ${epic || '<epic>'} --nonstop --concurrent.`,
  ].join('\n');
  return { action: 'halt', issue, worktreeKept: member.worktreePath, findings, report };
}

/**
 * Whether `sha` has a parent (#3625): a root commit has none, so `sha~1` does
 * not resolve. A git failure keeps the parent assumed — the range as before.
 */
function hasParent(git, sha) {
  try {
    return String(git(['rev-list', '--parents', '-n', '1', sha]) || '').trim().split(/\s+/).length > 1;
  } catch (_e) {
    return true;
  }
}

/**
 * Sequential /work's independent review (#3457) — Tier 3 without a worktree.
 * The range is the issue's own `Refs #N` commits since `base` (the branch's
 * merge-base), oldest first; other issues' commits can fall inside it, so the
 * commits are named to the reviewer too. Skips are reported, never passes:
 * `--no-review`, `workReview` off (or `nonstop-only` outside --nonstop),
 * no commits to review, and an absent diff-review skill.
 *
 * @param {{issue: number, body: string, base: string, git: Function,
 *   workReview?: string, nonstop?: boolean, noReview?: boolean,
 *   skillPresent?: boolean, charterPath?: string, root?: string,
 *   briefContext?: {domains: string[], frameworkPath: string}}} input
 *   `root` (string) is the project whose framework-config.json supplies the
 *   prompt's domains and frameworkPath when no `briefContext` is injected.
 */
function planSequentialReview({ issue, body = '', base, git, workReview = 'always', nonstop = false, noReview = false, skillPresent, charterPath = 'CHARTER.md', root = process.cwd(), briefContext } = {}) {
  const skip = (reason, message) => ({ tier: 3, skipped: true, reason, message });
  if (noReview) return skip('no-review', `Review skipped for #${issue}: --no-review was passed.`);
  if (workReview === 'off') return skip('work-review-off', `Review skipped for #${issue}: framework-config.json workReview is off.`);
  if (workReview === 'nonstop-only' && !nonstop) return skip('work-review-nonstop-only', `Review skipped for #${issue}: workReview is nonstop-only and this run is not --nonstop.`);
  const { issueRefGrepPattern } = require('./issue-ref-match.js');
  const commits = String(git(['log', '--reverse', `--grep=${issueRefGrepPattern(issue)}`, '--format=%H', `${base}..HEAD`]) || '')
    .split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!commits.length) return skip('no-commits', `Review skipped for #${issue}: no Refs #${issue} commits since ${base}, so there is nothing to review.`);
  const filesToModify = scopeDrift.parseDeclaredScope(body).paths;
  const range = `${hasParent(git, commits[0]) ? `${commits[0]}~1` : base}..${commits[commits.length - 1]}`;
  const tier3 = planTier3({
    issue, acceptanceCriteria: extractAcceptanceCriteria(body).items.map((i) => i.text), filesToModify,
    range, commits, charterPath, skillPresent, ...briefOf(briefContext, root),
  });
  if (tier3.skipped) return skip(tier3.reason, `Review skipped for #${issue}: the diff-review skill is not installed.`);
  return { ...tier3, range, commits, runPaths: filesToModify };
}

/** The review's comment on the issue (#3457): verdict and every finding. */
function formatReviewComment({ issue, tier3, fixCycles = 0 }) {
  const lines = [`## Work Review — #${issue}`, '', `Verdict: **${tier3.verdict}**${fixCycles > 0 ? ` (after ${fixCycles} fix cycle${fixCycles === 1 ? '' : 's'})` : ''}`];
  const findings = findingLines(null, tier3);
  if (findings.length) lines.push('', '### Findings', ...findings);
  return lines.join('\n');
}

/**
 * What sequential /work does with the review (#3457), on the gate's terms:
 * pass/warn → `proceed`, with the findings comment to post; a first fail →
 * `fix` (one fix cycle, then a re-review); a second fail → `halt` before
 * in_review. A reviewer-process failure re-reviews once without spending the
 * fix cycle, then halts on the reviewer (#3222). A skip proceeds, reported.
 */
function decideReviewOutcome({ issue, tier3, fixCycles = 0, reviewRetries = 0, classes, declaredScope = [], root = process.cwd() } = {}) {
  if (!tier3 || tier3.skipped) {
    return { action: 'proceed', issue, skipped: true, reason: tier3 && tier3.reason, comment: null, report: (tier3 && tier3.message) || `Review skipped for #${issue}.` };
  }
  // #3907: a correctness warn is fixed first, and filed only when the fix
  // cycle cannot reach it or did not clear it.
  const disp = tier3.verdict === 'warn'
    ? correctnessDisposition({ tier3, classes: classes || loadCriterionClasses(root), fixCycles, declaredScope })
    : null;
  const correctnessFields = disp ? { correctness: disp.correctness, unclassified: disp.unclassified, toFile: disp.toFile } : { correctness: [], unclassified: [], toFile: [] };
  if (tier3.verdict === 'pass' || (tier3.verdict === 'warn' && disp && disp.action !== 'fix')) {
    return { action: 'proceed', issue, verdict: tier3.verdict, fixCycles, ...correctnessFields, comment: { issue, body: formatReviewComment({ issue, tier3, fixCycles }) } };
  }
  if (disp && disp.action === 'fix') {
    const message = [
      `Work Review findings for #${issue} — fix cycle 1 of 1`,
      ...findingLines(null, tier3),
      `The verdict is warn, but ${disp.toFix.length} finding${disp.toFix.length === 1 ? ' is' : 's are'} on a correctness criterion: fix ${disp.toFix.length === 1 ? 'it' : 'them'} before in_review (#3907).`,
      ...unclassifiedLines(disp.unclassified),
      `Fix each in a \`Refs #${issue} — <what>\` commit, re-run the sweep, then re-review; a correctness finding the re-review still flags is filed as a bug, and a fail halts before in_review.`,
    ].join('\n');
    return { action: 'fix', issue, fixCycle: 1, rereview: true, findings: findingLines(null, tier3), ...correctnessFields, message };
  }
  const findings = findingLines(null, tier3);
  if (isReviewerProcessFailure(tier3)) {
    if (reviewRetries === 0) return { action: 're-review', issue, fixCycles, reviewRetry: 1, error: tier3.error, findings };
    return {
      action: 'halt', issue, attributedTo: 'reviewer', findings,
      report: [`Halted before in_review: the reviewer for #${issue} failed twice (${tier3.error}) — a reviewer-process failure, not a finding in #${issue}'s code; the fix cycle was not spent on it.`, ...findings.map((l) => `  ${l}`)].join('\n'),
    };
  }
  if (fixCycles === 0) {
    const message = [`Work Review findings for #${issue} — fix cycle 1 of 1`, ...findings, `Fix each in a \`Refs #${issue} — <what>\` commit, re-run the sweep, then re-review; a second fail halts before in_review.`].join('\n');
    return { action: 'fix', issue, fixCycle: 1, rereview: true, findings, message };
  }
  return {
    action: 'halt', issue, findings,
    report: [`Halted before in_review: the review of #${issue} failed again after one fix cycle.`, '  Findings (file:line):', ...findings.map((l) => `  ${l}`), `  Resume: fix, commit Refs #${issue}, then /work ${issue}.`].join('\n'),
  };
}

// ─── Correctness fix cycle: record and filing fallback (#3907) ───
//
// The fix action writes a fix record — each correctness finding and the head
// it was found at. When the gate later admits, the record becomes a
// `### Correctness fix cycle` section of the comment posted on the issue: per
// finding, its fixing commits and the re-review's result. A finding the cycle
// could not reach or did not clear is filed through file-issue.js first, and
// its number goes in the same section; a filing that fails is never admitted.

/** The fix record of issue N, a top-level gate file of the member. */
const fixRecordFile = (n) => `.tmp-gate-${n}-fix-record.json`;

const sameFinding = (a, b) => !!(a && b && a.criterion === b.criterion && String(a.file || '') === String(b.file || ''));

/**
 * Pair each earlier finding with at most one later finding on the same
 * criterion and file — the nearest line first, since a fix moves lines — so
 * two findings of one criterion in one file are never conflated. Returns a
 * Map from the earlier finding to its later match (absent: no match).
 */
function pairFindings(earlier = [], later = []) {
  const lineOf = (f) => (Number.isInteger(f && f.line) ? f.line : null);
  const candidates = [];
  earlier.forEach((e, i) => later.forEach((l, j) => {
    if (!sameFinding(e, l)) return;
    const a = lineOf(e);
    const b = lineOf(l);
    candidates.push({ i, j, d: a === null || b === null ? Number.MAX_SAFE_INTEGER : Math.abs(a - b) });
  }));
  candidates.sort((x, y) => x.d - y.d || x.i - y.i || x.j - y.j);
  const usedE = new Set();
  const usedL = new Set();
  const out = new Map();
  for (const c of candidates) {
    if (usedE.has(c.i) || usedL.has(c.j)) continue;
    usedE.add(c.i);
    usedL.add(c.j);
    out.set(earlier[c.i], later[c.j]);
  }
  return out;
}
const findingAt = (f) => `${f.criterion} ${at(f)}`;
const mdAt = (f) => `${f.criterion} \`${f.file || '(no file)'}\`${f.line === null || f.line === undefined ? '' : `:${f.line}`}`;

/**
 * `Refs #N` commits between the head a finding was found at and `head` that
 * touch its file — the fixing commits. `head` is HEAD on the sequential path
 * and the member branch on the concurrent one. A git failure is no commits.
 */
function fixingCommits({ git, issue, from, head = 'HEAD', file }) {
  if (!from || !file) return [];
  const { issueRefGrepPattern } = require('./issue-ref-match.js');
  try {
    return String(git(['log', '--format=%H', `--grep=${issueRefGrepPattern(issue)}`, `${from}..${head}`, '--', file]) || '')
      .split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch (_e) {
    return [];
  }
}

/**
 * The marker a fallback-filed bug carries in its body, read by
 * issue-duplicates.js so `/code-review --diff` reports the finding as
 * `already filed #N` instead of filing it again.
 */
function formatFindingMarker({ issue, finding, categories = [] }) {
  const line = Number.isInteger(finding.line) ? finding.line : null;
  const lineEnd = Number.isInteger(finding.lineEnd) ? finding.lineEnd : line;
  const payload = { from: issue, file: finding.file || null, criterion: finding.criterion, lines: line === null ? null : [line, lineEnd], categories };
  return `<!-- review-finding: ${JSON.stringify(payload)} -->`;
}

/** The file-issue.js entry for one finding the fix cycle did not resolve. */
function buildFindingBug({ issue, finding, reason, categories = [] }) {
  const where = at(finding);
  const evidence = finding.evidence || '(no evidence recorded)';
  const short = evidence.length > 70 ? `${evidence.slice(0, 67)}...` : evidence;
  return {
    type: 'bug',
    title: `${finding.criterion} in ${where}: ${short}`,
    priority: 'p2',
    status: 'backlog',
    fields: {
      description: [
        `The independent review of #${issue} flagged a correctness finding (\`${finding.criterion}\`) at \`${where}\` that was not fixed before merge: ${reason}.`,
        '',
        `**Evidence:** ${evidence}`,
        '',
        formatFindingMarker({ issue, finding, categories }),
      ].join('\n'),
      stepsToReproduce: `Read \`${where}\` against the evidence: ${evidence}`,
      expectedBehavior: `The \`${finding.criterion}\` criterion passes for \`${finding.file || '(no file)'}\`.`,
      actualBehavior: evidence,
      inScope: `The ${finding.criterion} finding at ${where}`,
      outOfScope: `Other findings of the #${issue} review`,
      acceptanceCriteria: [`The \`${finding.criterion}\` finding at \`${where}\` is fixed, with a test that fails without the fix`],
    },
    source: { file: finding.file || null, lines: Number.isInteger(finding.line) ? String(finding.line) : '', severity: 'medium', category: finding.criterion },
  };
}

/** The `### Correctness fix cycle` section: one row per finding. */
function formatFixCycleRecord(rows = [], unclassified = []) {
  if (!rows.length && !unclassified.length) return '';
  const lines = ['### Correctness fix cycle', ''];
  if (rows.length) {
    lines.push('| Finding | Fixing commit | Re-review |', '|---|---|---|');
    for (const r of rows) {
      const commits = r.commits && r.commits.length ? r.commits.map((c) => `\`${c.slice(0, 8)}\``).join(', ') : '—';
      lines.push(`| ${mdAt(r.finding)} — ${String(r.finding.evidence || '').replace(/\|/g, '\\|')} | ${commits} | ${r.result} |`);
    }
  }
  lines.push(...unclassifiedLines(unclassified).map((l) => `\n${l}`));
  return lines.join('\n');
}

function readFixRecord(root, issue) {
  try {
    return JSON.parse(require('fs').readFileSync(path.join(root, fixRecordFile(issue)), 'utf8'));
  } catch (_e) {
    return null;
  }
}

/**
 * Remove the fix record once the comment carrying its `### Correctness fix
 * cycle` table has been posted (#3913). Absent already is not an error.
 */
function clearFixRecord(root, issue) {
  try { require('fs').unlinkSync(path.join(root, fixRecordFile(issue))); } catch (_e) { /* already gone */ }
}

const defaultFileIssues = (entries, deps) => require('../file-issue.js').fileIssues(entries, deps);

/**
 * Carry a gate decision through the #3907 record and fallback. On a fix
 * action, writes the fix record. On an admitting action (`proceed`/`merge`),
 * files every `toFile` finding, then adds the record section to the comment
 * and `correctnessReport` + `report` to the result — or returns a `halt`
 * when a filing failed, since an unfiled finding must never merge silently.
 * Any other action passes through unchanged.
 */
function settleCorrectness({ issue, decision, tier3, root = process.cwd(), git, head = 'HEAD', fileIssues = defaultFileIssues, classes } = {}) {
  const fs = require('fs');
  const recordPath = path.join(root, fixRecordFile(issue));
  if (decision.action === 'fix' || decision.action === 'send-findings') {
    if (!(decision.correctness || []).length) return decision;
    let reviewedHead = null;
    try { reviewedHead = String(git(['rev-parse', head]) || '').trim() || null; } catch (_e) { reviewedHead = null; }
    const outside = (decision.toFile || []).map((t) => t.finding);
    const findings = decision.correctness.map((f) => ({ ...f, outOfScope: outside.some((o) => sameFinding(o, f)) }));
    // Numbers an earlier filing halt kept stay in the record (#3907 review).
    const kept = (readFixRecord(root, issue) || {}).filed;
    fs.writeFileSync(recordPath, JSON.stringify({ issue, reviewedHead, head, findings, ...(Array.isArray(kept) && kept.length ? { filed: kept } : {}) }, null, 2) + '\n');
    return { ...decision, fixRecord: fixRecordFile(issue) };
  }
  if (decision.action !== 'proceed' && decision.action !== 'merge') return decision;
  if (decision.skipped) return decision;

  const prior = readFixRecord(root, issue);
  const toFile = (decision.toFile || []).map((t) => {
    const was = prior && (prior.findings || []).find((p) => sameFinding(p, t.finding));
    return was && was.outOfScope ? { ...t, reason: FILE_REASONS.outsideScope } : t;
  });
  const cls = classes || loadCriterionClasses(root);
  const categoriesOf = (criterion) => (cls.codeReviewCategories && cls.codeReviewCategories.get(criterion)) || [];

  // A filing made by an earlier, halted run of this step is in the record's
  // `filed` list: it is reused, never filed again (#3907 review).
  const alreadyFiledList = ((prior && prior.filed) || []).map((x) => ({ ...x }));
  const reuse = (t) => {
    const i = alreadyFiledList.findIndex((x) => !x.used && x.criterion === t.finding.criterion && String(x.file || '') === String(t.finding.file || '') && x.line === (Number.isInteger(t.finding.line) ? t.finding.line : null));
    if (i === -1) return null;
    alreadyFiledList[i].used = true;
    return alreadyFiledList[i];
  };
  const numberText = (n) => (Number.isInteger(n) ? `#${n}` : '(number not reported — check the board)');

  let filed = [];
  // Writes the record with every number filed so far: the earlier ones kept,
  // this run's successes added. Both the filing halt and a clean filing call
  // it, so no re-run ever files a finding twice (#3907 review, #3913).
  const persistFiled = () => {
    const record = { ...(prior || { issue, reviewedHead: null, head, findings: [] }) };
    record.filed = [
      ...((prior && prior.filed) || []),
      ...filed.filter((f) => f.ok && !f.reused).map((f) => ({ criterion: f.finding.criterion, file: f.finding.file || null, line: Number.isInteger(f.finding.line) ? f.finding.line : null, number: f.number })),
    ];
    fs.writeFileSync(recordPath, JSON.stringify(record, null, 2) + '\n');
  };
  if (toFile.length) {
    const reused = toFile.map((t) => reuse(t));
    const pending = toFile.map((t, i) => ({ t, i })).filter(({ i }) => !reused[i]);
    const entries = pending.map(({ t }) => buildFindingBug({ issue, finding: t.finding, reason: t.reason, categories: categoriesOf(t.finding.criterion) }));
    let result = { ok: true, results: [] };
    if (entries.length) {
      try {
        // Body files go to the OS temp dir, never the root a sibling reviewer
        // is watching (#3907; the parent-scratch rule of --concurrent).
        result = fileIssues(entries, { cwd: require('os').tmpdir() });
      } catch (e) {
        result = { ok: false, results: entries.map((_e, index) => ({ index, ok: false, number: null, error: String(e && e.message ? e.message : e).split('\n')[0] })) };
      }
    }
    filed = toFile.map((t, i) => {
      if (reused[i]) return { ...t, ok: true, number: reused[i].number, reused: true };
      const r = (result.results || []).find((x) => x.index === pending.findIndex((p) => p.i === i)) || {};
      // ok with no number is file-issue.js's "created, number not parsed":
      // the issue exists, so it is filed — re-filing would duplicate it.
      return { ...t, ok: !!r.ok, number: Number.isInteger(r.number) ? r.number : null, error: r.ok ? null : (r.error || 'not filed'), warning: r.ok && !Number.isInteger(r.number) ? (r.warning || 'filed, but no issue number was reported') : null };
    });
    const failed = filed.filter((f) => !f.ok);
    if (failed.length) {
      // Persist what did file, so the resumed step files only the rest.
      persistFiled();
      const report = [
        `Halted: #${issue} has correctness finding${failed.length === 1 ? '' : 's'} the fix cycle did not resolve, and filing ${failed.length === 1 ? 'it' : 'them'} through file-issue.js failed — an unfiled finding is never admitted (#3907).`,
        ...failed.map((f) => `  - ${findingAt(f.finding)} — ${f.reason}: ${f.error}`),
        ...filed.filter((f) => f.ok).map((f) => `  - filed ${numberText(f.number)}: ${findingAt(f.finding)} (kept in ${fixRecordFile(issue)}; not filed again)`),
        `  Resume: re-run the outcome step — it files only what is left — or fix ${failed.length === 1 ? 'it' : 'them'} first.`,
      ].join('\n');
      return { action: 'halt', issue, attributedTo: 'filing', findings: decision.findings || findingLines(null, tier3), filed: filed.filter((f) => f.ok).map((f) => ({ number: f.number, criterion: f.finding.criterion, file: f.finding.file, line: f.finding.line })), report };
    }
  }

  // Each earlier finding pairs with at most one re-review finding (nearest
  // line), so two findings of one criterion in one file stay two rows.
  const priorFindings = (prior && prior.findings) || [];
  const nonPass = ((tier3 && tier3.findings) || []).filter((x) => x.status !== 'pass');
  const paired = pairFindings(priorFindings, nonPass);
  const rows = [];
  const fixed = [];
  const filedShown = new Set();
  for (const p of priorFindings) {
    const commits = fixingCommits({ git, issue, from: prior.reviewedHead, head, file: p.file });
    const now = paired.get(p);
    let fl = now ? filed.find((x) => x.finding === now) : null;
    // A finding filed with no re-review match (outside scope at the first
    // review) pairs with its own earlier finding.
    if (!fl && !now) fl = filed.find((x) => !filedShown.has(x) && !nonPass.includes(x.finding) && sameFinding(x.finding, p) && x.finding.line === p.line) || null;
    if (fl) filedShown.add(fl);
    const result = fl ? `${now ? 'still flagged' : 'not fixed'} → filed ${numberText(fl.number)} (${fl.reason})` : now ? 'still flagged' : 'resolved';
    rows.push({ finding: p, commits, result });
    if (!fl && !now) fixed.push({ criterion: p.criterion, file: p.file, line: p.line, commits });
  }
  for (const fl of filed) {
    if (filedShown.has(fl)) continue;
    rows.push({ finding: fl.finding, commits: [], result: `filed ${numberText(fl.number)} (${fl.reason})` });
  }
  // The record outlives this call (#3913): it is removed by clearFixRecord()
  // only once the comment carrying its table is posted, so a failed post
  // re-runs with the filed numbers and the prior-findings rows intact.
  if (prior || filed.some((f) => f.ok && !f.reused)) persistFiled();
  const unclassified = decision.unclassified || [];
  const section = formatFixCycleRecord(rows, unclassified);
  const correctnessReport = {
    fixed,
    filed: filed.map((f) => ({ number: f.number, criterion: f.finding.criterion, file: f.finding.file, line: f.finding.line, reason: f.reason, ...(f.warning ? { warning: f.warning } : {}) })),
    unclassified,
  };
  const reportLines = [
    ...fixed.map((f) => `Correctness finding fixed: ${findingAt(f)}${f.commits.length ? ` (${f.commits.map((c) => c.slice(0, 8)).join(', ')})` : ''}`),
    ...correctnessReport.filed.map((f) => `Correctness finding filed ${numberText(f.number)}: ${findingAt(f)} — ${f.reason}`),
    ...unclassifiedLines(unclassified),
  ];
  const out = { ...decision, correctnessReport };
  if (reportLines.length) out.report = [decision.report, ...reportLines].filter(Boolean).join('\n');
  if (section && decision.comment) out.comment = { ...decision.comment, body: `${decision.comment.body}\n\n${section}` };
  return out;
}

/**
 * Resume after compaction mid fix cycle (#3141, Corner Case 5): the parent
 * re-reads the worktree branch and re-runs every tier once; that run is the
 * single fix cycle, whatever was or was not sent before the loss. Given
 * `git`, the range starts at memberBase() (#3293), as Tier 1's does since
 * #3263; without it, at the recorded tip.
 */
function resumeFixCycle({ member = {}, trackerTip = '<tracker-tip>', git } = {}) {
  const base = git ? memberBase({ git, trackerTip, branch: member.branch }) : trackerTip;
  const range = `${base}..${member.branch}`;
  return {
    fixCycles: 1,
    resumedFromCompaction: true,
    rerunAllTiers: true,
    range,
    instruction: `Re-read the worktree branch ${member.branch} at ${member.worktreePath} and re-run Tiers 1–3 once over ${range}; trust no verdict from before compaction. This re-run counts as the one fix cycle: a pass merges, a fail halts.`,
  };
}

/**
 * The paths the post-merge pass reviews (#3141, Corner Case 2): the union of
 * every member's diff and the paths the regeneration runner rewrote — a
 * regenerated file no member's diff named is reviewed too, and named as such.
 */
function postMergeSet({ memberDiffs = {}, regenerated = [] } = {}) {
  const inDiffs = new Set(Object.values(memberDiffs).flat());
  const paths = [...new Set([...inDiffs, ...regenerated])].sort();
  return { paths, regeneratedOutsideDiffs: regenerated.filter((p) => !inDiffs.has(p)).sort() };
}

/** Commits in the range as `{sha, parents, message}`, from a `%H%x1f%P%x1f%B%x1e` log. */
function parseCommitsWithParents(raw) {
  return String(raw || '')
    .split('\x1e')
    .map((record) => record.replace(/^\s+/, ''))
    .filter(Boolean)
    .map((record) => {
      const [sha, parents, ...rest] = record.split('\x1f');
      return { sha, parents: (parents || '').trim().split(/\s+/).filter(Boolean), message: rest.join('\x1f').trim() };
    });
}

/**
 * Paths two or more group members changed outside their declared scope
 * (#3272). Per issue, `outside-declared-scope` stays advisory (#2520); two
 * members sharing an undeclared path is a group fact that one member's
 * check cannot see, and it is what turns into a merge conflict or a silent
 * overwrite. Pure.
 *
 * @param {Array<{issue: number, body: string, changed: string[]}>} members
 * @returns {{ok: boolean, overlaps: Array<{path: string, members: number[]}>}}
 */
function undeclaredOverlap(members = []) {
  const byPath = new Map();
  for (const m of members) {
    const declared = scopeDrift.parseDeclaredScope(m.body || '').paths;
    for (const p of new Set(m.changed || [])) {
      if (scopeDrift.matchesAny(p, declared)) continue;
      if (!byPath.has(p)) byPath.set(p, []);
      byPath.get(p).push(m.issue);
    }
  }
  const overlaps = [...byPath]
    .filter(([, issues]) => issues.length > 1)
    .map(([p, issues]) => ({ path: p, members: issues }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return { ok: overlaps.length === 0, overlaps };
}

/** The halt text for an undeclared overlap, naming every member involved. */
function overlapMessage(overlaps) {
  return `Group members changed the same file outside their declared scope: ${overlaps.map((o) => `${o.path} (${o.members.map((n) => `#${n}`).join(', ')})`).join('; ')}. Declare the path in one member's Files to modify, or run those members in separate groups.`;
}

/**
 * Tier 1 for the group's post-merge pass, on the tracker (#3158).
 *
 * The per-member Tier 1 cannot stand in for it over `<base>..<head>`: merge-
 * back merges with `--no-ff`, and those merge commits carry no `Refs #N`, so
 * every one would fail attribution. Here a merge commit is SKIPPED and listed
 * — mergeBack aborts any merge git cannot complete, so a merge it made carries
 * no authored content of its own — and every other commit must name a member
 * (or, for the regenerated-commit step's commit, the root issue — the epic,
 * or the branch tracker's own issue: `epic` carries either, #3272). Scope is
 * checked per member over that member's own commits; a root-only commit may
 * touch only the regenerated paths. Suites run at the root over the
 * union of touched files, parallel suites only: the group's exclusive suites
 * are the deferred-suites step's, already run before this pass.
 *
 * @param {{base: string, head?: string, members: Array<{issue: number, body: string}>,
 *   epic?: number, regenerated?: string[], cwd: string, git: Function,
 *   suites?: object[], runSuite?: Function, protectedPaths?: object[], registrarExemption?: object,
 *   prior?: number[], own?: string[], recorded?: Array<{sha: string, paths?: string[]}>,
 *   reuse?: {cleanMerge?: boolean, tier1?: Object<number, object>, untrusted?: Array<{issue: number, reason: string}>}}} input
 *   `reuse` (#3774): each member's Tier 1 result and whether its merge-back
 *   was clean. The suites Tier 1 ran are not re-run when decideSuiteReuse()
 *   finds the head's tree is the tree Tier 1 tested; `suiteReuse` reports the
 *   decision either way, naming the tree.
 *   `recorded` (#3286): the regenerated commits the run state holds. Each
 *   one on this range's first-parent line counts as `own`, and its paths join
 *   `regenerated`, so the regenerated-paths check runs without a typed --own.
 *   `prior` (#3274): run members merged in an EARLIER rolling batch. A batch's
 *   range starts at its members' earliest worktree tip, which can predate an
 *   earlier batch's merge; those members' commits are listed in
 *   `priorSkipped`, never attributed here and never failed — that batch's own
 *   pass already covered them.
 */
function runGroupTier1({
  base, head = 'HEAD', members = [], epic, regenerated: givenRegenerated = [], cwd, git,
  suites = [], runSuite, runSelector, protectedPaths, registrarExemption, prior = [], own: givenOwn = [], recorded = [], reuse,
}) {
  const range = `${base}..${head}`;
  const failures = [];
  const issues = members.map((m) => m.issue);
  const owner = (message) => {
    const hit = issues.find((n) => refPattern(n).test(message));
    if (hit !== undefined) return hit;
    return epic !== undefined && refPattern(epic).test(message) ? epic : null;
  };

  // Classified by structure, never by message (#3263). The tracker's first-
  // parent line holds the merge-backs, the parent's own commits (--own, e.g.
  // the regenerated-commit) and anything another session committed there,
  // which is external: reported, never failed. A member's commits are its
  // merge-back's second-parent side; only those are attributed by message.
  const LOG = '--format=%H%x1f%P%x1f%B%x1e';
  const line = parseCommitsWithParents(git(['log', '--first-parent', LOG, range]));
  const mergeBacks = line.filter((c) => c.parents.length > 1);
  // #3286: the regenerated-commit step records its sha (and the paths it
  // committed) in the run state, so the commit is the parent's own whether or
  // not --own names it. Matched by sha against this range's first-parent line —
  // a recorded sha outside the range adds nothing — and never by message.
  const lineShas = new Set(line.filter((c) => c.parents.length <= 1).map((c) => c.sha));
  const recordedHere = (recorded || []).filter((r) => r && lineShas.has(r.sha));
  const own = [...givenOwn, ...recordedHere.map((r) => r.sha)];
  const regenerated = [...new Set([...givenRegenerated, ...recordedHere.flatMap((r) => r.paths || [])])];
  // #3284: an --own entry is `<sha>` (the parent's root-issue commit, e.g. the
  // regenerated-output commit) or `<sha>=<member>` (a commit Steps 4d/4e made
  // on the tracker FOR that member after its merge-back). The second is
  // credited to the member, so its scope-drift — the registrar exemption
  // included — reads it; credited to the root it was checked against the
  // regenerated paths only, and as a bare unnamed sha it was external.
  // #3293: each sha is resolved to its full form first — matched by string, an
  // abbreviated one never equaled a line sha and its commit read as external.
  // An entry that resolves to no commit on this range's first-parent line is
  // reported in `ownUnmatched`, never dropped silently.
  const resolveSha = (sha) => {
    try {
      const out = git(['rev-parse', '--verify', '--quiet', `${sha}^{commit}`]);
      const full = String(out && out.stdout !== undefined ? out.stdout : out || '').trim();
      return /^[0-9a-f]{40}$/.test(full) ? full : sha;
    } catch (_e) {
      return sha;
    }
  };
  const ownMember = new Map();
  const ownUnmatched = [];
  const ownShas = own.map((entry) => {
    const [given, member] = String(entry).split('=');
    const sha = lineShas.has(given) ? given : resolveSha(given);
    if (!lineShas.has(sha)) ownUnmatched.push(String(entry));
    if (member !== undefined && /^\d+$/.test(member)) ownMember.set(sha, Number(member));
    return sha;
  });
  const ownSet = new Set(ownShas);
  const external = line.filter((c) => c.parents.length <= 1 && !ownSet.has(c.sha)).map((c) => c.sha);
  const memberSide = [];
  const mergesSkipped = mergeBacks.map((c) => c.sha);
  for (const m of mergeBacks) {
    for (const c of parseCommitsWithParents(git(['log', LOG, `${m.parents[0]}..${m.parents[1]}`]))) {
      if (c.parents.length > 1) { if (!mergesSkipped.includes(c.sha)) mergesSkipped.push(c.sha); continue; }
      if (!memberSide.some((x) => x.sha === c.sha)) memberSide.push(c);
    }
  }
  const priorOf = (message) => prior.find((n) => !issues.includes(n) && refPattern(n).test(message));
  const priorSkipped = memberSide.filter((c) => owner(c.message) === null && priorOf(c.message) !== undefined).map((c) => c.sha);
  const ownCommits = line.filter((c) => c.parents.length <= 1 && ownSet.has(c.sha)).map((c) => ({
    sha: c.sha,
    issue: ownMember.has(c.sha) ? ownMember.get(c.sha) : (epic === undefined ? 'root' : epic),
  }));
  const commits = [
    ...memberSide.filter((c) => !priorSkipped.includes(c.sha)).map((c) => ({ sha: c.sha, issue: owner(c.message) })),
    ...ownCommits,
  ];
  const unattributed = commits.filter((c) => c.issue === null).map((c) => c.sha);
  if (unattributed.length > 0) {
    failures.push({ check: 'attribution', message: `Commit(s) on the tracker naming no group member${epic !== undefined ? ` or root issue #${epic}` : ''}: ${unattributed.join(', ')}.` });
  }

  const dirty = parsePorcelain(git(['status', '--porcelain'], { cwd }));
  const hostWritten = dirty.filter(isHostWritten);
  const dirtyPaths = dirty.filter((p) => !isHostWritten(p));

  // core.quotePath=false (#3377): a non-ASCII name arrives as itself, not as a
  // C-quoted octal string scope-drift would compare against the declaration.
  const nameStatusOf = (shas) => shas.map((sha) => git(['-c', 'core.quotePath=false', 'show', '--name-status', '--pretty=format:', sha])).join('\n');
  const touched = new Set();
  const perMember = {};
  for (const m of members) {
    const shas = commits.filter((c) => c.issue === m.issue).map((c) => c.sha);
    const scope = scopeDrift.run({
      issue: m.issue,
      body: m.body,
      gitLog: nameStatusOf(shas),
      protectedPaths: protectedPaths || scopeDrift.loadProtectedPaths(),
      registrarExemption: registrarExemption === undefined ? scopeDrift.loadRegistrarExemption() : registrarExemption,
    });
    scope.touched.forEach((p) => touched.add(p));
    perMember[m.issue] = { ok: scope.ok, violations: scope.violations, touched: scope.touched };
    if (!scope.ok) {
      failures.push({ check: 'scope-drift', message: `Scope-drift halt for #${m.issue}: ${scope.violations.map((v) => v.path || v.file || JSON.stringify(v)).join(', ')}.` });
    }
  }
  // #3272: members that merged cleanly can still share an undeclared path.
  const overlap = undeclaredOverlap(members.map((m) => ({ issue: m.issue, body: m.body, changed: perMember[m.issue].touched })));
  if (!overlap.ok) failures.push({ check: 'undeclared-overlap', message: overlapMessage(overlap.overlaps), overlaps: overlap.overlaps });

  // The root issue's commits and the parent's own (--own) may touch only the
  // regenerated paths.
  const rootShas = commits.filter((c) => c.issue === 'root' || (epic !== undefined && !issues.includes(epic) && c.issue === epic)).map((c) => c.sha);
  if (rootShas.length) {
    const rootPaths = parseNameStatus(nameStatusOf(rootShas)).map((r) => r.path);
    rootPaths.forEach((p) => touched.add(p));
    const allowed = new Set(regenerated);
    const outside = [...new Set(rootPaths.filter((p) => !allowed.has(p)))];
    if (outside.length > 0) {
      failures.push({ check: 'regenerated', message: `Commit(s) naming only root issue #${epic === undefined ? '<root>' : epic} touch paths no regeneration step reported: ${outside.join(', ')}.` });
    }
  }

  // #3277: only an uncommitted path the group touched — members' diffs ∪
  // regenerated — fails; any other (a pre-existing bump, a peer's edit) is
  // named as advisory. A new untracked directory is listed as `dir/`, not its
  // files, so it is inside the set when a touched path lies under it (#3263).
  const groupSet = [...new Set([...touched, ...regenerated])];
  const inGroup = (p) => (p.endsWith('/') ? groupSet.some((t) => String(t).startsWith(p)) : groupSet.includes(p));
  const uncommitted = dirtyPaths.filter(inGroup);
  const uncommittedAdvisory = dirtyPaths.filter((p) => !inGroup(p));
  if (uncommitted.length > 0) {
    failures.push({ check: 'uncommitted', message: `Uncommitted work on the tracker in paths the group touched: ${uncommitted.join(', ')}.` });
  }

  const suiteRuns = [];
  const selections = selectorSelections({ suites, changedFiles: [...touched], root: cwd, runSelector });
  const scoped = scopedInvocations({ suites, changedFiles: [...touched], inWorktree: true, selections, selectionTier: 'sweep' });
  // #3774: a clean merge, nothing regenerated and the head's tree equal to the
  // tree Tier 1 tested — the suites Tier 1 ran would repeat its verdict, so
  // their results stand, named. A suite Tier 1 deferred always runs.
  const suiteReuse = decideSuiteReuse({ reuse, regenerated, members, head, git });
  const reusedIds = [];
  for (const run of scoped.runs) {
    const runCwd = run.cwd && run.cwd !== '.' ? path.join(cwd, run.cwd) : cwd;
    const suiteIds = run.suiteIds || [run.suiteId];
    const files = [...(run.files || [])];
    const from = suiteReuse.reused ? reusableRun(run, suiteReuse.sources) : null;
    if (from) {
      reusedIds.push(...suiteIds);
      suiteRuns.push({ suiteIds, command: run.command, cwd: runCwd, files, exitCode: 0, ok: true, reused: { from, tree: suiteReuse.tree } });
      continue;
    }
    const result = runSuite ? runSuite({ command: run.command, cwd: runCwd, suiteIds, files, mode: run.mode }) : { exitCode: null };
    suiteRuns.push(suiteRunRecord(run, { suiteIds, command: run.command, cwd: runCwd, files, exitCode: result.exitCode, ok: result.exitCode === 0 }));
  }
  const failed = suiteRuns.filter((r) => !r.ok);
  if (failed.length > 0) {
    failures.push({ check: 'suites', message: `Suite run(s) failed on the tracker: ${failed.map((r) => `${r.suiteIds.join('+')} (exit ${r.exitCode})`).join(', ')}.` });
  }
  const notRun = notRunFailure(scoped);
  if (notRun) failures.push(notRun);

  return {
    tier: 1,
    level: 'group',
    ok: failures.length === 0,
    failures,
    range,
    commits,
    mergesSkipped,
    priorSkipped,
    external,
    ...(ownUnmatched.length ? { ownUnmatched } : {}),
    hostWritten,
    uncommitted,
    uncommittedAdvisory,
    perMember,
    touched: [...touched],
    suiteRuns,
    suiteReuse: reuseReport(suiteReuse, reusedIds, suiteRuns),
    deferredSuites: scoped.deferred || [],
    suitesAdvisory: notRunAdvisory(scoped),
  };
}

/** The suiteReuse entry a group pass reports (#3774): the decision, the suites reused and those run. */
function reuseReport(decision, reusedIds, suiteRuns) {
  // `sources` carries whole Tier 1 documents; the report keeps only the decision.
  const rest = { ...decision };
  delete rest.sources;
  const rerun = suiteRuns.filter((r) => !r.reused).flatMap((r) => r.suiteIds);
  if (!decision.reused) return { ...rest, suites: [], rerun };
  // Reuse was allowed but no run qualified: say so, never a silent reuse claim.
  if (reusedIds.length === 0) {
    return { ...rest, reused: false, reason: 'no-matching-run', message: `Suites re-run on the tracker: the tree ${decision.tree} matches, but no member Tier 1 run covers these suites.`, suites: [], rerun };
  }
  const tail = rerun.length ? ` Run here: ${rerun.join(', ')}.` : '';
  return { ...rest, suites: reusedIds, rerun, message: `${decision.message} Reused: ${reusedIds.join(', ')}.${tail}` };
}

/**
 * A rolling batch's post-merge range (#3274): from the earliest worktree tip
 * among the batch's members to the batch's last commit. `bases` is every
 * member's tip in the order it was recorded at worktree creation — on one
 * tracker branch the first recorded is the ancestor of the rest. A member
 * with no recorded tip is refused, never guessed.
 *
 * @param {{members: number[], bases: Array<{issue: number, tip: string}>, head: string}} input
 * @returns {{ok: boolean, base: string|null, head: string|null, error: string|null}}
 */
function batchRange({ members = [], bases = [], head } = {}) {
  const missing = members.filter((n) => !bases.some((b) => b.issue === n && b.tip));
  if (missing.length > 0) {
    return { ok: false, base: null, head: null, error: `No recorded worktree tip for ${missing.map((n) => `#${n}`).join(', ')}.` };
  }
  if (!head) return { ok: false, base: null, head: null, error: 'No --head: name the batch\'s last commit.' };
  const first = bases.find((b) => members.includes(b.issue));
  return { ok: true, base: first.tip, head, error: null };
}

/**
 * The group's post-merge pass verdict: Tiers 1–2 over `postMergeSet` on the
 * tracker. A fail halts on the second-review-fail terms. `tier1` is
 * `runGroupTier1`'s result (#3158).
 */
function postMergeOutcome({ group, tier1, tier2, worktreesKept = [], epic, unswept = [] } = {}) {
  const ok = tier1 && tier1.ok && (!tier2 || tier2.ok !== false);
  // Another session's commits on the tracker are reported, never failed (#3263).
  const external = (tier1 && tier1.external) || [];
  // #3774: a reuse is named in the report, never a silent skip.
  const reuse = tier1 && tier1.suiteReuse && tier1.suiteReuse.reused ? { suiteReuse: tier1.suiteReuse.message } : {};
  if (ok) return { action: 'report-group', group, ...(external.length ? { external } : {}), ...reuse };
  const report = [
    `Halted: post-merge pass failed for group ${group} on the tracker.`,
    ...findingLines(tier1, null).map((l) => `  ${l}`),
    ...(tier2 && tier2.ok === false && tier2.reason ? [`  Tier 2: ${tier2.reason}`] : []),
    // This pass runs after teardown (#3264): only what teardown kept is still there.
    ...(worktreesKept.length
      ? ['  Worktrees kept for inspection:', ...worktreesKept.map((w) => `    - ${w.worktreePath}${w.branch ? ` (${w.branch})` : ''}`)]
      : ['  Worktrees: none kept — teardown removed the group\'s worktrees before this pass; the merged commits are on the tracker.']),
    ...unsweptLines(unswept),
    `  Resume: inspect the tracker, then /work ${epic || '<epic>'} --nonstop --concurrent.`,
  ].join('\n');
  return { action: 'halt', group, report };
}

/**
 * Run every tier for one member and decide (#3141). `review` is the injected
 * reviewer: it takes the Tier 3 request and returns the reviewer's final
 * message. Everything else is what runTier1 and planTier3 take. `briefContext`
 * ({domains, frameworkPath}), when given, replaces projectContext(root)'s
 * read of framework-config.json (#3575).
 */
function evaluateMember({
  member = {}, body, trackerTip, git, suites = [], runSuite, runSelector, protectedPaths, registrarExemption,
  acceptanceCriteria, filesToModify = [], charterPath, noReview = false, skillPresent, review, schema,
  fixCycles = 0, resumedFromCompaction = false, epic, root = process.cwd(), briefContext,
} = {}) {
  const tier1 = runTier1({
    issue: member.issue, body, trackerTip, branch: member.branch, worktreePath: member.worktreePath,
    git, suites, runSuite, runSelector, protectedPaths, registrarExemption,
  });
  const acs = acceptanceCriteria || tier1.acceptanceCriteria.items;
  const plan = planTier3({ issue: member.issue, acceptanceCriteria: acs, filesToModify, range: tier1.range, charterPath, noReview, skillPresent, ...briefOf(briefContext, root) });
  let tier3 = plan;
  if (!plan.skipped) {
    let text;
    try {
      text = review(plan.request);
    } catch (e) {
      // A non-Error throw (a string, undefined) keeps its cause (#3604).
      text = `reviewer failed: ${e && e.message ? e.message : String(e)}`;
    }
    tier3 = parseReview(text, { issue: member.issue, schema, root });
  }
  const tier2 = buildTier2({ issue: member.issue, files: tier1.scope.touched, acceptanceCriteria: acs });
  return { tier1, tier2, tier3, ...decideOutcome({ member, tier1, tier3, fixCycles, resumedFromCompaction, epic, root }) };
}

// ─── Reviewed hashes in .code-review-manifest.json (#3131) ───

const MANIFEST_FILENAME = '.code-review-manifest.json';

/** `git diff --name-status` rows as `{status, path, oldPath}`; a rename carries both paths. */
function parseNameStatus(raw) {
  return String(raw || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [code, rawA, rawB] = line.split('\t');
      // Still C-quoted for a quote, backslash or control byte (#3377).
      const a = rawA === undefined ? rawA : unquoteGitPath(rawA);
      const b = rawB === undefined ? rawB : unquoteGitPath(rawB);
      const status = code[0];
      if ((status === 'R' || status === 'C') && b) return { status: 'R', path: b, oldPath: a };
      return { status, path: a, oldPath: null };
    });
}

/** The manifest's `sha256:` content hash of a file, as /code-review computes it. */
function hashFile(cwd, rel) {
  const crypto = require('crypto');
  const fs = require('fs');
  return 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(path.join(cwd, rel))).digest('hex');
}

/** Why a Tier 3 result records nothing, or null when it records. */
function recordingBlocked(tier3) {
  if (!tier3 || tier3.skipped) return 'tier-3-skipped';
  if (tier3.ok === false || !tier3.verdict) return 'tier-3-unreadable';
  if (tier3.verdict === 'fail') return 'tier-3-failed';
  return null;
}

/** A diff-review finding in the manifest's finding shape. */
function toManifestFinding(f) {
  return {
    file: f.file,
    lineStart: f.line === null || f.line === undefined ? 0 : f.line,
    lineEnd: f.line === null || f.line === undefined ? 0 : f.line,
    category: f.criterion,
    domain: null,
    severity: f.status === 'fail' ? 'high' : 'low',
    description: f.evidence || '',
    recommendation: '',
  };
}

/**
 * The manifest after a member's Tier 3 verdict (#3131), pure over its input.
 *
 * pass → every file in the merged range is `approved` at its merge-time
 * hash, zero findings. warn → every such file is `flagged`, carrying the
 * reviewer's non-pass findings that name it (possibly none), so
 * `/code-review` re-queues it. A deleted file loses its entry; a renamed
 * file's entry moves to the new path, keeping `issueRefs` and `domains`, as a
 * modified file keeps its own. Everything else — other entries, `version`,
 * `lastRun`, `charter` — is untouched. fail, skipped or unreadable → the
 * same manifest back, unchanged, with the reason.
 */
function applyReviewedHashes(manifest, { cwd, tier3, changes = [], today } = {}) {
  const reason = recordingBlocked(tier3);
  const report = { written: false, reason, approved: [], flagged: [], removed: [], moved: [] };
  if (reason) return { manifest, ...report };

  const next = JSON.parse(JSON.stringify(manifest || {}));
  if (next.version === undefined) next.version = 1;
  if (next.lastRun === undefined) next.lastRun = today;
  if (!next.charter) next.charter = {};
  if (!next.files) next.files = {};

  const warnOnly = tier3.verdict === 'warn';
  const findingsFor = (rel) => (warnOnly ? (tier3.findings || []).filter((f) => f.file === rel && f.status !== 'pass').map(toManifestFinding) : []);

  for (const c of changes) {
    if (c.status === 'D') {
      if (next.files[c.path]) { delete next.files[c.path]; report.removed.push(c.path); }
      continue;
    }
    let prior = next.files[c.path];
    if (c.status === 'R' && c.oldPath) {
      prior = next.files[c.oldPath] || prior;
      delete next.files[c.oldPath];
      report.moved.push({ from: c.oldPath, to: c.path });
    }
    const findings = findingsFor(c.path);
    next.files[c.path] = {
      contentHash: hashFile(cwd, c.path),
      status: warnOnly ? 'flagged' : 'approved',
      reviewedAt: today,
      findingCount: findings.length,
      findings,
      issueRefs: prior && Array.isArray(prior.issueRefs) ? [...prior.issueRefs] : [],
      domains: prior && Array.isArray(prior.domains) ? [...prior.domains] : [],
    };
    (warnOnly ? report.flagged : report.approved).push(c.path);
  }
  return { manifest: next, ...report, written: true };
}

/**
 * Read, apply and write the project's manifest. Nothing is written when the
 * verdict records nothing, so a fail or a skip leaves the file byte-identical.
 */
function recordReviewedHashes({ cwd = process.cwd(), issue, tier3, changes = [], today = new Date().toISOString().slice(0, 10) } = {}) {
  const fs = require('fs');
  const file = path.join(cwd, MANIFEST_FILENAME);
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    manifest = { version: 1, lastRun: today, charter: {}, files: {} };
  }
  const result = applyReviewedHashes(manifest, { cwd, tier3, changes, today });
  if (result.written) fs.writeFileSync(file, JSON.stringify(result.manifest, null, 2) + '\n');
  return { issue, file, ...result };
}

/** Which recorded entries still match the file on disk — a changed file is `stale`. */
function verifyRecordedHashes({ cwd = process.cwd(), manifest, paths = [] } = {}) {
  const current = [];
  const stale = [];
  for (const rel of paths) {
    const entry = manifest && manifest.files && manifest.files[rel];
    let hash = null;
    try { hash = hashFile(cwd, rel); } catch { hash = null; }
    (entry && hash === entry.contentHash ? current : stale).push(rel);
  }
  return { current, stale };
}

/**
 * Whether the gate permits the merge. Any Tier 1 failure forbids it — so an
 * unattributed or uncommitted member never merges. A Tier 3 that ran must
 * have returned `pass` or `warn`; a `fail`, or a document nobody could read,
 * forbids it. A reported skip does not. A `warn` carrying a correctness
 * finding (#3907) forbids it while the fix cycle is still due (an in-scope
 * finding, `fixCycles` 0); after it, the filing fallback admits it.
 *
 * It takes `decideOutcome`'s inputs and applies the same `admission` rule, so
 * for the same inputs it is true exactly when `decideOutcome(...).action` is
 * `merge` (#3935) — the declared scope is read from `tier1.scope.declaredScope`.
 */
function mayMerge({ tier1, tier3, fixCycles = 0, resumedFromCompaction = false, classes, root = process.cwd() } = {}) {
  const cycles = resumedFromCompaction ? Math.max(fixCycles, 1) : fixCycles;
  return admission({ tier1, tier3, cycles, classes, root }).admitted;
}

// ─── Command-line entry point (#3158) ───
//
// The concurrent run's gate steps name these subcommands. Before them the
// tiers were library functions only, and a live run's parent wrote its own
// driver to call them. Every subcommand prints one JSON envelope on stdout;
// suite output goes to stderr so the envelope stays parseable.

const USAGE = [
  'Usage: node .claude/scripts/shared/lib/merge-back-gate.js <subcommand> [options]',
  '  tier1       --issue N --branch B --worktree P --tracker-tip SHA [--body-file F] [--out F]',
  '  tier3-plan  --issue N --tracker-tip SHA --branch B [--body-file F] [--no-review]',
  '  review-plan --issue N [--base SHA] [--body-file F] [--no-review] [--nonstop] — sequential /work (#3457): the issue\'s Refs #N commits since the branch base, or the reported skip',
  '  review-outcome --issue N --tier3 F --tree-before F --tree-before-sha SHA [--body-file F] [--fix-cycles N] [--review-retries N] [--post-comment]',
  '  tree-snapshot --out F [--clear F ...]',
  '  outcome     --issue N --worktree P [--branch B] --tier1 F --tier1-sha SHA [--tier3 F --tree-before F --tree-before-sha SHA [--sibling N ...] [--ledger F: the run ledger; a worktree it names appearing or disappearing during the review is reported as runWorktrees, never failed] | --no-review] [--fix-cycles N] [--review-retries N] [--resumed] [--epic N] [--unswept N ...] [--post-comment]',
  '  merge-back  --tracker T --member N:BRANCH[:WORKTREE] ... [--epic N] [--unswept N ...] [--body-file N=F ...] [--hold-tier1 N ...] — with two or more members, fails before merging when they share a path outside their declared scope; after a clean merge it reclaims each merged member (#3799: re-check, worktree-teardown.js, git branch -d, its scratch — tier1 kept for each --hold-tier1 N) and reports reclaimed and kept; a halt reclaims nothing',
  '  group-tier1 --base SHA [--head H] --member N ... [--body-file N=F ...] [--epic N: the root issue — the epic, or the own issue of a branch tracker] [--regenerated P ...] [--group G] [--unswept N ...] [--prior N ...] [--kept-worktree P ...] [--own SHA ...] [--state F: the run-state file; its recorded regenerated commits count as --own] [--member-tier1-sha N=SHA ... [--member-tier1 N=F, default .tmp-gate-<N>-tier1.json] --clean-merge: #3774 — reuse each member\'s Tier 1 suite results when the merge was clean, nothing was regenerated and the head\'s tree is the tree Tier 1 tested]',
  '  batch-range --member N ... --base-of N=SHA ... --head H',
  '  clear-member --issue N [--ledger F] [--keep-tier1 | --tier1-only] — removes the member\'s gate files and brief; keeps all when the ledger\'s worktree for N still exists',
  '  reclaim     --reclaim [N:]wt/<branch>:<path> ... — #3714: re-checks each worktree is on the tracker and clean, removes a lock left by its own creation (reason initializing, #3853), tears it down through worktree-teardown.js, deletes its branch with git branch -d and clears a recorded member\'s scratch',
  '  clear-run   --file F ... — removes the run\'s state and ledger; top-level .tmp-gate-/brief-/rolling-/concurrent- files only',
  '  Common: --root DIR (default: the current directory). Bodies not given by --body-file are read with gh pmu view N --body-stdout.',
].join('\n');

const REPEATABLE = new Set(['--member', '--member-tier1', '--member-tier1-sha', '--regenerated', '--body-file', '--unswept', '--clear', '--sibling', '--prior', '--base-of', '--kept-worktree', '--own', '--file', '--reclaim', '--hold-tier1']);
/** A commit SHA as review-plan --base accepts it (#3468): 4-40 hex characters, nothing git could read as an option or a range. */
const BASE_SHA_PATTERN = /^[0-9a-fA-F]{4,40}$/;
const BOOLEAN = new Set(['--no-review', '--resumed', '--post-comment', '--keep-tier1', '--tier1-only', '--nonstop', '--clean-merge']);

/** `<subcommand> --flag value ...` → `{sub, opts}`; repeatable flags collect arrays. */
function parseCliArgs(argv) {
  const [sub, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) return { sub, opts, error: `unexpected argument: ${a}` };
    if (BOOLEAN.has(a)) { opts[a] = true; continue; }
    const v = rest[i + 1];
    if (v === undefined || v.startsWith('--')) return { sub, opts, error: `${a} requires a value` };
    i++;
    if (REPEATABLE.has(a)) (opts[a] = opts[a] || []).push(v);
    else opts[a] = v;
  }
  return { sub, opts, error: null };
}

/** Bounds on the CLI's spawns (#2469): git and gh calls, and one declared suite run. */
const CLI_GIT_TIMEOUT_MS = 60_000;
const CLI_SUITE_TIMEOUT_MS = 30 * 60_000;

function cliGit(root) {
  const { execFileSync } = require('child_process');
  return (args, opts = {}) => execFileSync('git', args, { cwd: opts.cwd || root, encoding: 'utf8', maxBuffer: 1e8, timeout: CLI_GIT_TIMEOUT_MS });
}

/** Runs a declared suite command verbatim — the project's command, never one composed here. */
function cliRunSuite({ command, cwd }) {
  const { spawnSync } = require('child_process');
  const r = spawnSync(command, { cwd, shell: true, encoding: 'utf8', maxBuffer: 1e8, stdio: ['ignore', 'pipe', 'pipe'], timeout: CLI_SUITE_TIMEOUT_MS });
  process.stderr.write(`$ ${command}  (cwd ${cwd})\n${r.stdout || ''}${r.stderr || ''}`);
  return { exitCode: r.error ? (r.error.code === 'ENOENT' ? 127 : null) : r.status };
}

/**
 * Post a merge decision's comment on the issue (#3276). The body goes to gh on
 * stdin (`--body-file -`), never through a file: while any Tier 3 reviewer
 * runs, a root write outside the gate files fails that review.
 * @returns {{issue: number, id: number|null, url: string}}
 */
function postComment({ issue, body, root, ghExec }) {
  const url = String(ghExec(['issue', 'comment', String(issue), '--body-file', '-'], { cwd: root, input: body })).trim();
  const m = url.match(/#issuecomment-(\d+)/);
  return { issue, id: m ? Number(m[1]) : null, url };
}

function cliGhExec(args, { cwd, input }) {
  const { execFileSync } = require('child_process');
  return execFileSync('gh', args, { cwd, input, encoding: 'utf8', timeout: CLI_GIT_TIMEOUT_MS, stdio: ['pipe', 'pipe', 'pipe'] });
}

function readBody(root, issue, bodyFiles = {}) {
  const fs = require('fs');
  if (bodyFiles[issue]) return fs.readFileSync(path.resolve(root, bodyFiles[issue]), 'utf8');
  const { execFileSync } = require('child_process');
  return execFileSync('gh', ['pmu', 'view', String(issue), '--body-stdout'], { cwd: root, encoding: 'utf8', timeout: CLI_GIT_TIMEOUT_MS });
}

/** `--body-file F` (one issue) or `--body-file N=F` (several) → `{N: F}`. */
function bodyFileMap(values = [], soleIssue) {
  const map = {};
  for (const v of values) {
    const eq = v.indexOf('=');
    if (eq > 0 && /^\d+$/.test(v.slice(0, eq))) map[Number(v.slice(0, eq))] = v.slice(eq + 1);
    else if (soleIssue !== undefined) map[soleIssue] = v;
  }
  return map;
}

function requireOpts(opts, names) {
  const missing = names.filter((n) => opts[n] === undefined);
  return missing.length ? `missing ${missing.join(', ')}` : null;
}

function readJsonFile(root, file) {
  return JSON.parse(require('fs').readFileSync(path.resolve(root, file), 'utf8'));
}

/**
 * Parse a merge-back `--member` value, N:BRANCH[:WORKTREE] (#3168). A git
 * branch name cannot contain ':', but a Windows absolute worktree path does
 * (E:/...), so split at most twice and rejoin the remainder as the path.
 * @param {string} spec
 * @returns {{issue: number, branch: string, worktreePath: string|null}}
 */
function parseMemberSpec(spec) {
  const [n, branch, ...rest] = String(spec).split(':');
  const worktreePath = rest.length ? rest.join(':') : '';
  // #3694: the text is tested, not the conversion — Number('') is 0 and
  // Number('1e2') is 100, so a malformed N reads as NaN and is refused.
  const { isIssueNumber } = require('./input-validation.js');
  return { issue: isIssueNumber(n) ? Number(n) : NaN, branch, worktreePath: worktreePath || null };
}

/**
 * Parse a `reclaim --reclaim` value, `[N:]wt/<branch>:<path>` (#3714): the
 * issue is present for a ledger-recorded worktree, absent for one a cancelled
 * run never recorded. The path may hold ':' (E:/...), so it is the remainder.
 * @param {string} spec
 * @returns {{issue: number|null, branch: string, worktreePath: string, error?: string}}
 */
function parseReclaimSpec(spec) {
  const parts = String(spec).split(':');
  let issue = null;
  if (parts.length > 1 && !parts[0].startsWith('wt/')) {
    if (!/^[1-9][0-9]*$/.test(parts[0])) return { error: `not an issue number: ${parts[0]}` };
    issue = Number(parts.shift());
  }
  const branch = parts.shift() || '';
  const worktreePath = parts.join(':');
  if (!branch.startsWith('wt/')) return { error: `not a framework member branch: ${branch || '(none)'}` };
  if (!worktreePath) return { error: `no worktree path for ${branch}` };
  return { issue, branch, worktreePath };
}

/** A thrown value's message, trimmed — git errors end in a newline. */
const errText = (e) => String(e && e.message ? e.message : e).trim();

/**
 * Reclaim worktrees the user accepted (#3714). Per worktree: resolve a
 * relative path against `root`; read the branch the worktree has checked
 * out and refuse a detached HEAD or one differing from the `--reclaim`
 * branch (#3716); re-check that branch is an ancestor of the tracker HEAD
 * (exit 1 — commits off the tracker; any other failure — unresolvable) and
 * its tree is clean (untracked files count), else `refused` and nothing
 * touched; remove a lock with reason `initializing`, left by a creation
 * killed at its bound (#3853: `unlocked: true`, set only then), and no other
 * lock; tear down through `teardown` (worktree-teardown.js); once
 * `removed`, delete the branch the teardown reports with `git branch -d`
 * (refuses an unmerged branch — reported, never forced) and, for a recorded
 * member, clear its kept gate files and brief. A throw while reclaiming one
 * worktree is that worktree's `error` result; the rest are still processed.
 *
 * @param {{root: string, worktrees: Array<{issue: number|null, branch: string, worktreePath: string}>,
 *   git: Function, teardown: Function}} input
 * @returns {Array<{issue: number|null, branch: string, worktreePath: string,
 *   status: 'removed'|'kept'|'halted'|'refused'|'error', reason: string|null,
 *   branchDeleted: boolean, branchError?: string, cleared: string[]}>}
 */
function reclaimWorktrees({ root, worktrees = [], git, teardown }) {
  return worktrees.map(({ issue, branch, worktreePath: given, scratch }) => {
    // #3716: a relative path names a worktree under the tracker root, so it
    // is resolved there before any git call runs in it or the teardown sees it.
    const worktreePath = path.isAbsolute(given) ? given : path.resolve(root, given);
    const out = { issue, branch, worktreePath, status: null, reason: null, branchDeleted: false, cleared: [] };
    try {
      return reclaimOne({ root, out, git, teardown, scratch });
    } catch (e) {
      return { ...out, status: 'error', reason: `reclaiming ${worktreePath} threw: ${errText(e)}` };
    }
  });
}

/**
 * The lock reason `git worktree list --porcelain` reports for `worktreePath`
 * (#3853): the reason text, `''` for a lock with none, or null when the
 * worktree is not locked, not listed or the list cannot be read — the caller
 * then removes no lock and the teardown decides.
 * @param {{git: Function, worktreePath: string}} input
 * @returns {string|null}
 */
function creationLockOf({ git, worktreePath }) {
  // Real paths, so a form git does not print — an 8.3 short name (#3150), a
  // link — still finds its entry; a path that does not exist compares as given.
  const norm = (p) => {
    let real = path.resolve(p);
    try { real = require('fs').realpathSync.native(real); } catch (_) { /* compared as given */ }
    const n = real.replace(/\\/g, '/');
    return process.platform === 'win32' ? n.toLowerCase() : n;
  };
  let listed;
  try {
    listed = String(git(['worktree', 'list', '--porcelain']) || '');
  } catch (_) {
    return null;
  }
  for (const block of listed.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/);
    const head = lines.find((l) => l.startsWith('worktree '));
    if (!head || norm(head.slice('worktree '.length)) !== norm(worktreePath)) continue;
    const lock = lines.find((l) => l === 'locked' || l.startsWith('locked '));
    return lock === undefined ? null : lock.slice('locked'.length).trim();
  }
  return null;
}

/**
 * One worktree's reclaim, for `reclaimWorktrees()`; `out` is its result
 * skeleton. `scratch` narrows a recorded member's cleared files (#3799) —
 * default all five, `memberScratch()`.
 */
function reclaimOne({ root, out, git, teardown, scratch }) {
  const { issue, branch, worktreePath } = out;
  // #3716: the re-check guards the worktree, so it reads the branch the
  // worktree has checked out — a stale or hand-edited argument naming
  // another branch must not pass the ancestor check on the wrong branch.
  // `symbolic-ref -q` exits 1, silently, on a detached HEAD.
  let checkedOut;
  try {
    checkedOut = String(git(['symbolic-ref', '--short', '-q', 'HEAD'], { cwd: worktreePath }) || '').trim();
  } catch (e) {
    if (e && e.status === 1) return { ...out, status: 'refused', reason: `${worktreePath} has a detached HEAD, not ${branch} — kept` };
    return { ...out, status: 'refused', reason: `cannot read the branch of ${worktreePath}: ${errText(e)} — kept` };
  }
  if (checkedOut !== branch) {
    return { ...out, status: 'refused', reason: `${worktreePath} has ${checkedOut || '(no branch)'} checked out, not ${branch} as --reclaim names — kept` };
  }
  try {
    git(['merge-base', '--is-ancestor', checkedOut, 'HEAD']);
  } catch (e) {
    // Exit 1 is git's "not an ancestor"; anything else (128: a bad ref)
    // means the branch could not be resolved at all.
    if (e && e.status === 1) return { ...out, status: 'refused', reason: `${checkedOut} has commits not on the tracker — kept` };
    return { ...out, status: 'refused', reason: `cannot resolve ${checkedOut} against the tracker: ${errText(e)} — kept` };
  }
  let dirty;
  try {
    dirty = String(git(['status', '--porcelain', '--untracked-files=all'], { cwd: worktreePath }) || '').trim();
  } catch (e) {
    return { ...out, status: 'refused', reason: `cannot read the tree of ${worktreePath}: ${errText(e)} — kept` };
  }
  if (dirty) return { ...out, status: 'refused', reason: `${worktreePath} has uncommitted or untracked changes — kept` };
  // #3853: a creation killed at its bound leaves the worktree locked with
  // reason `initializing`, and git refuses to remove a locked worktree.
  // The re-check above has passed, so that lock — and no other — is removed.
  if (creationLockOf({ git, worktreePath }) === 'initializing') {
    try {
      git(['worktree', 'unlock', worktreePath]);
      out.unlocked = true;
    } catch (e) {
      return { ...out, status: 'refused', reason: `cannot remove the initializing lock on ${worktreePath}: ${errText(e)} — kept` };
    }
  }
  const t = teardown({ root, worktreePath });
  out.status = t && t.status ? t.status : 'kept';
  out.reason = t && t.reason ? t.reason : null;
  if (!t || !t.ok) return out;
  // #3716: delete the branch the teardown found on the worktree it removed
  // (the branch read above when it reports none), never the argument's.
  try {
    git(['branch', '-d', t.branch || checkedOut]);
    out.branchDeleted = true;
  } catch (e) {
    out.branchError = errText(e);
  }
  if (issue) out.cleared = clearScratch({ root, files: scratch || memberScratch(issue) }).removed;
  return out;
}

/** One POSIX shell word (#3717's rule): single-quoted, an embedded ' as '\''. */
const shWord = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

/**
 * Reclaim the members a clean merge-back merged (#3799) — the same routine as
 * the `reclaim` subcommand (#3714), so teardown is never left to commands a
 * session composes. Each merged member is re-checked (its checked-out branch,
 * an ancestor of the new tracker tip, a clean tree), torn down through
 * `teardown` (worktree-teardown.js — never `git worktree remove`), its wt/*
 * branch deleted with `git branch -d`, and its scratch cleared; `holdTier1`
 * names members whose tier1 file a later step still reads, so it stays.
 *
 * A member that fails a check, has no worktree path, or whose teardown keeps
 * or halts is `kept`: worktree, branch and scratch untouched, with its reason
 * and the worktree-teardown.js command that tears it down once resolved.
 *
 * @param {{root: string, members: Array<{issue: number, branch: string, worktreePath: string|null}>,
 *   merged: Array<{issue: number}>, git: Function, teardown: Function, holdTier1?: number[]}} input
 * @returns {{reclaimed: object[], kept: object[]}}
 */
function reclaimMerged({ root, members = [], merged = [], git, teardown, holdTier1 = [] }) {
  const mergedSet = new Set(merged.map((m) => m.issue));
  const hold = new Set(holdTier1);
  const reclaimed = [];
  const kept = [];
  const command = (worktreePath) => `node .claude/scripts/shared/lib/worktree-teardown.js --root ${shWord(root)} --worktree ${shWord(worktreePath)}`;
  for (const m of members.filter((x) => mergedSet.has(x.issue))) {
    if (!m.worktreePath) {
      kept.push({ issue: m.issue, branch: m.branch, worktreePath: null, reason: 'no worktree path given in --member — nothing was torn down', command: null });
      continue;
    }
    const [r] = reclaimWorktrees({
      root, git, teardown,
      worktrees: [{ issue: m.issue, branch: m.branch, worktreePath: m.worktreePath, scratch: hold.has(m.issue) ? memberScratch(m.issue).slice(1) : undefined }],
    });
    if (r.status === 'removed') reclaimed.push(r);
    else kept.push({ issue: r.issue, branch: r.branch, worktreePath: r.worktreePath, status: r.status, reason: r.reason || `teardown reported ${r.status}`, command: command(r.worktreePath) });
  }
  return { reclaimed, kept };
}

/** The teardown seam, else worktree-teardown.js — the one remover (#3124, #3186). */
const teardownOf = (seams) => seams.teardown || ((input) => require('./worktree-teardown.js').teardownWorktree(input));

/**
 * @param {string[]} argv
 * @param {{git?: Function, runSuite?: Function, readBody?: Function, ghExec?: Function, teardown?: Function}} [seams]
 * @returns {{code: number, envelope: object}}
 */
function runCli(argv, seams = {}) {
  const { sub, opts, error } = parseCliArgs(argv);
  const fail = (message, code = 2) => ({ code, envelope: { ok: false, subcommand: sub || null, error: message, usage: USAGE } });
  if (!sub || sub === '--help') return fail('missing subcommand');
  if (error) return fail(error);
  const root = path.resolve(opts['--root'] || process.cwd());
  const git = seams.git || cliGit(root);
  const runSuite = seams.runSuite || cliRunSuite;
  // #3880: Tier 1 runs each suite's selector; the spawn is runner-probe.js's.
  const runSelector = seams.runSelector || ((run, o) => require('./runner-probe.js').runSelectorCommand(run, o));
  const bodyOf = seams.readBody || ((n, files) => readBody(root, n, files));
  const num = (v) => (v === undefined ? undefined : Number(v));
  // #3668: a positive integer written as one — Number('') is 0 and Number('7 ')
  // is 7, so the text is tested, not the conversion. One rule, shared with
  // validateIssueNumber (#3675).
  const { isIssueNumber } = require('./input-validation.js');
  // #3694: every subcommand reading --issue tests it here, before any git or
  // gh call — Number('abc') is NaN and Number('1e2') silently became #100.
  if (opts['--issue'] !== undefined && !isIssueNumber(opts['--issue'])) return fail('--issue takes an issue number');

  if (sub === 'tier1') {
    const miss = requireOpts(opts, ['--issue', '--branch', '--worktree', '--tracker-tip']);
    if (miss) return fail(miss);
    const issue = num(opts['--issue']);
    const { resolveSuites } = require('./test-runner.js');
    const tier1 = runTier1({
      issue, body: bodyOf(issue, bodyFileMap(opts['--body-file'], issue)), trackerTip: opts['--tracker-tip'],
      branch: opts['--branch'], worktreePath: path.resolve(root, opts['--worktree']), git,
      suites: resolveSuites(root).suites, runSuite, runSelector,
    });
    const tier2 = buildTier2({ issue, files: tier1.scope.touched, acceptanceCriteria: tier1.acceptanceCriteria.items });
    const doc = { ok: tier1.ok, subcommand: sub, tier1, tier2 };
    if (!opts['--out']) return { code: tier1.ok ? 0 : 1, envelope: doc };
    // --out writes the document itself and reports the sha256 of the bytes it
    // wrote (#3225), as tree-snapshot does: the file sits in the root reviewers
    // write to, so outcome --tier1-sha verifies it rather than trusting it.
    const text = JSON.stringify(doc, null, 2);
    require('fs').writeFileSync(path.resolve(root, opts['--out']), text);
    return { code: tier1.ok ? 0 : 1, envelope: { ...doc, out: { path: opts['--out'], sha256: sha256(text) } } };
  }

  if (sub === 'tier3-plan') {
    const miss = requireOpts(opts, ['--issue', '--tracker-tip', '--branch']);
    if (miss) return fail(miss);
    const issue = num(opts['--issue']);
    const body = bodyOf(issue, bodyFileMap(opts['--body-file'], issue));
    const filesToModify = scopeDrift.parseDeclaredScope(body).paths;
    const tier3 = planTier3({
      issue, acceptanceCriteria: extractAcceptanceCriteria(body).items.map((i) => i.text), filesToModify,
      range: `${memberBase({ git, trackerTip: opts['--tracker-tip'], branch: opts['--branch'] })}..${opts['--branch']}`, noReview: !!opts['--no-review'],
      skillPresent: diffReviewSkillPresent(root), ...projectContext(root),
    });
    return { code: 0, envelope: { ok: true, subcommand: sub, tier3 } };
  }

  if (sub === 'outcome') {
    const miss = requireOpts(opts, ['--issue', '--worktree', '--tier1']);
    if (miss) return fail(miss);
    if (!opts['--tier1-sha']) return fail('give --tier1-sha <the sha256 the tier1 --out envelope reported> with --tier1');
    if (!opts['--tier3'] && !opts['--no-review']) return fail('give --tier3 <reviewer output file> or --no-review');
    if (opts['--tier3'] && !opts['--tree-before']) return fail('give --tree-before <the tree-snapshot taken before the reviewer spawned> with --tier3');
    if (opts['--tier3'] && !opts['--tree-before-sha']) return fail('give --tree-before-sha <the sha256 the tree-snapshot envelope reported> with --tier3');
    const issue = num(opts['--issue']);
    const t1text = require('fs').readFileSync(path.resolve(root, opts['--tier1']), 'utf8');
    if (sha256(t1text) !== String(opts['--tier1-sha']).toLowerCase()) {
      // The Tier 1 document sits in the reviewer-writable root (#3225): an edit
      // could turn a failing member into a merge, so a mismatch never merges.
      const report = [
        `Halted: ${opts['--tier1']} no longer matches the sha256 tier1 reported (tier-1-document-changed) — #${issue}'s Tier 1 result cannot be trusted, so it is never merged.`,
        `  Worktree kept: ${opts['--worktree']}${opts['--branch'] ? ` (${opts['--branch']})` : ''}.`,
        ...unsweptLines(unsweptOf(opts)),
        '  Resume: find what rewrote the file, re-run tier1 --out for the member, then outcome with the new sha.',
      ].join('\n');
      return { code: 1, envelope: { ok: false, subcommand: sub, action: 'halt', issue, error: 'tier-1-document-changed', file: opts['--tier1'], worktreeKept: opts['--worktree'], report } };
    }
    const t1doc = JSON.parse(t1text);
    const tier1 = t1doc.tier1 || t1doc;
    let tier3;
    if (opts['--no-review']) {
      tier3 = planTier3({ issue, range: '', noReview: true });
    } else {
      const fs = require('fs');
      const out = path.resolve(root, opts['--tier3']);
      const exists = fs.existsSync(out);
      const treeBefore = fs.readFileSync(path.resolve(root, opts['--tree-before']), 'utf8');
      const siblings = (opts['--sibling'] || []).map(Number).filter(Number.isInteger);
      // The run's paths (#3263): the declared scope each running member's
      // Tier 1 document recorded. A tree change outside them during the review
      // is another session's — reported, never failed. None readable: strict.
      const scopeOf = (doc) => ((doc && (doc.tier1 || doc).scope) || {}).declaredScope;
      const runPaths = [];
      let scopesRead = Array.isArray(scopeOf(t1doc)) ? 1 : 0;
      if (scopesRead) runPaths.push(...scopeOf(t1doc));
      for (const m of siblings) {
        try {
          const d = scopeOf(JSON.parse(fs.readFileSync(path.resolve(root, `.tmp-gate-${m}-tier1.json`), 'utf8')));
          if (Array.isArray(d)) { runPaths.push(...d); scopesRead += 1; }
        } catch (_e) { /* that sibling's scope stays unknown */ }
      }
      // #3729: the run ledger's worktrees — a member spawned or torn down by
      // the rolling schedule during this review is the run's, not the reviewer's.
      const ledger = opts['--ledger'] ? readLedgerWorktrees(root, opts['--ledger']) : { worktrees: [], error: null };
      tier3 = evaluateTier3({
        issue, outputPath: rootRelative(root, opts['--tier3']), exists, text: exists ? fs.readFileSync(out, 'utf8') : '',
        treeBefore, treeBeforeIntact: sha256(treeBefore) === String(opts['--tree-before-sha']).toLowerCase(),
        treeAfter: git(TREE_STATUS_ARGS), root, siblings, runWorktrees: ledger.worktrees,
        ...(scopesRead === 1 + siblings.length ? { runPaths } : {}),
      });
      if (ledger.error) tier3 = { ...tier3, ledgerError: ledger.error };
    }
    const decided = decideOutcome({
      member: { issue, worktreePath: opts['--worktree'], branch: opts['--branch'] },
      tier1, tier3, fixCycles: num(opts['--fix-cycles']) || 0, reviewRetries: num(opts['--review-retries']) || 0, resumedFromCompaction: !!opts['--resumed'], epic: num(opts['--epic']), unswept: unsweptOf(opts),
      root,
    });
    // #3907: the fix record on a fix cycle; the filing fallback and the record
    // section on a merge — read against the member branch, not HEAD.
    const decision = settleCorrectness({ issue, decision: decided, tier3, root, git, head: opts['--branch'] || 'HEAD', fileIssues: seams.fileIssues });
    if (decision.action === 'halt' && decision.attributedTo === 'filing') {
      return { code: 1, envelope: { ok: true, subcommand: sub, tier3, ...decision, worktreeKept: opts['--worktree'] } };
    }
    if (opts['--post-comment'] && decision.action === 'merge') {
      try {
        const posted = postComment({ issue, body: decision.comment.body, root, ghExec: seams.ghExec || cliGhExec });
        if (!decision.skipped) clearFixRecord(root, issue); // #3913: only once its table is posted
        return { code: 0, envelope: { ok: true, subcommand: sub, tier3, ...decision, posted } };
      } catch (e) {
        return { code: 1, envelope: { ok: true, subcommand: sub, tier3, ...decision, posted: null, postError: String(e.stderr || e.message).trim() } };
      }
    }
    return { code: 0, envelope: { ok: true, subcommand: sub, tier3, ...decision } };
  }

  if (sub === 'review-plan') {
    const miss = requireOpts(opts, ['--issue']);
    if (miss) return fail(miss);
    const issue = num(opts['--issue']);
    let base = opts['--base'];
    // #3468: the base reaches git as `${base}..HEAD`, where a value starting
    // with '-' is read as an option — only a hex SHA may be one, the rule
    // log-changed-files.js applies to --since-commit (#3290).
    if (base !== undefined && !BASE_SHA_PATTERN.test(base)) return fail('--base takes a 4-40 character hex commit SHA');
    if (!base) {
      const r = require('./branch-diff.js').resolveBranchBase({ cwd: root });
      if (!r.ok) return fail(`cannot resolve the branch base: ${r.error || r.reason || 'unknown'} — pass --base SHA`, 1);
      base = r.sha;
    }
    const workReview = require('./framework-config.js').resolveWorkReview(root);
    const review = planSequentialReview({
      issue, body: bodyOf(issue, bodyFileMap(opts['--body-file'], issue)), base, git,
      workReview: workReview.mode, nonstop: !!opts['--nonstop'], noReview: !!opts['--no-review'], skillPresent: diffReviewSkillPresent(root),
      root, // #3560: the brief's domains and frameworkPath come from --root, not process.cwd()
    });
    return { code: 0, envelope: { ok: true, subcommand: sub, workReview, base, review } };
  }

  if (sub === 'review-outcome') {
    const miss = requireOpts(opts, ['--issue', '--tier3', '--tree-before', '--tree-before-sha']);
    if (miss) return fail(miss);
    const issue = num(opts['--issue']);
    const fs = require('fs');
    const out = path.resolve(root, opts['--tier3']);
    const exists = fs.existsSync(out);
    const treeBefore = fs.readFileSync(path.resolve(root, opts['--tree-before']), 'utf8');
    // The issue's declared scope is the run (#3263): another session's write
    // outside it during the review is reported, never failed.
    const runPaths = scopeDrift.parseDeclaredScope(bodyOf(issue, bodyFileMap(opts['--body-file'], issue))).paths;
    const tier3 = evaluateTier3({
      issue, outputPath: rootRelative(root, opts['--tier3']), exists, text: exists ? fs.readFileSync(out, 'utf8') : '',
      treeBefore, treeBeforeIntact: sha256(treeBefore) === String(opts['--tree-before-sha']).toLowerCase(),
      treeAfter: git(TREE_STATUS_ARGS), root, ...(runPaths.length ? { runPaths } : {}),
    });
    const decided = decideReviewOutcome({ issue, tier3, fixCycles: num(opts['--fix-cycles']) || 0, reviewRetries: num(opts['--review-retries']) || 0, declaredScope: runPaths, root });
    // #3907: the fix record on a fix cycle; the filing fallback and the record section on proceed.
    const decision = settleCorrectness({ issue, decision: decided, tier3, root, git, head: 'HEAD', fileIssues: seams.fileIssues });
    if (opts['--post-comment'] && decision.comment && decision.action !== 'halt') {
      try {
        const posted = postComment({ issue, body: decision.comment.body, root, ghExec: seams.ghExec || cliGhExec });
        // #3913: only once its table is posted; a fix action keeps its record.
        if (decision.action === 'proceed' && !decision.skipped) clearFixRecord(root, issue);
        return { code: 0, envelope: { ok: true, subcommand: sub, tier3, ...decision, posted } };
      } catch (e) {
        return { code: 1, envelope: { ok: true, subcommand: sub, tier3, ...decision, posted: null, postError: String(e.stderr || e.message).trim() } };
      }
    }
    return { code: decision.action === 'halt' ? 1 : 0, envelope: { ok: true, subcommand: sub, tier3, ...decision } };
  }

  if (sub === 'tree-snapshot') {
    // Taken before the Tier 3 reviewer spawns (#3204); `outcome --tree-before`
    // compares the tree after the review against it.
    const miss = requireOpts(opts, ['--out']);
    if (miss) return fail(miss);
    // --clear removes an earlier cycle's review file before the snapshot, so
    // the re-run's reviewer starts from an absent output (code review H2).
    const clear = opts['--clear'] || [];
    const bad = clear.filter((p) => !GATE_FILE.test(p));
    if (bad.length) return fail(`--clear takes only top-level .tmp-gate-* files: ${bad.join(', ')}`);
    const fs = require('fs');
    const cleared = clear.filter((p) => fs.existsSync(path.resolve(root, p)));
    for (const p of cleared) fs.unlinkSync(path.resolve(root, p));
    const snapshot = git(TREE_STATUS_ARGS);
    fs.writeFileSync(path.resolve(root, opts['--out']), snapshot);
    // sha256 is what `outcome --tree-before-sha` verifies (#3220): the snapshot
    // sits in the root the reviewer writes to, so its integrity is checked, not assumed.
    return { code: 0, envelope: { ok: true, subcommand: sub, out: opts['--out'], cleared, sha256: sha256(snapshot), lines: snapshot.split(/\r?\n/).filter((l) => l.trim() !== '').length } };
  }

  if (sub === 'merge-back') {
    const miss = requireOpts(opts, ['--tracker', '--member']);
    if (miss) return fail(miss);
    const members = opts['--member'].map(parseMemberSpec);
    if (members.some((m) => !Number.isInteger(m.issue) || !m.branch)) return fail('--member takes N:BRANCH[:WORKTREE]');
    // #3834: checked before any merge — a NaN hold would let reclaimMerged
    // delete the tier1 file the post-merge readers still need.
    const holdSpecs = opts['--hold-tier1'] || [];
    if (!holdSpecs.every(isIssueNumber)) return fail('--hold-tier1 takes an issue number');
    const { mergeBack } = require('./concurrent-orchestration.js');
    const gitStatus = (args) => {
      const { spawnSync } = require('child_process');
      const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: CLI_GIT_TIMEOUT_MS });
      return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
    };
    const current = gitStatus(['branch', '--show-current']).stdout.trim();
    if (current !== opts['--tracker']) return fail(`not on the tracker: current branch is ${current || '(detached)'}, expected ${opts['--tracker']}`, 1);
    // --unswept: members a --nonstop run already moved to in_review with no
    // sweep yet (#3202); a residual-conflict halt names them.
    const unswept = unsweptOf(opts);
    // #3272: before any merge, so a shared undeclared file is named as such
    // rather than surfacing as a residual conflict after reconciliation.
    if (members.length > 1) {
      const files = bodyFileMap(opts['--body-file']);
      const overlap = undeclaredOverlap(members.map((m) => ({
        issue: m.issue,
        body: bodyOf(m.issue, files),
        changed: gitStatus(['diff', '--name-only', `HEAD...${m.branch}`]).stdout.split('\n').map((l) => l.trim()).filter(Boolean),
      })));
      if (!overlap.ok) {
        return { code: 1, envelope: { ok: false, subcommand: sub, check: 'undeclared-overlap', overlaps: overlap.overlaps, merged: [], worktreesKept: members, reclaimed: [], report: `Halted before merge-back: ${overlapMessage(overlap.overlaps)} Nothing was merged; every worktree is kept.` } };
      }
    }
    const result = mergeBack({ git: seams.gitStatus || gitStatus, tracker: opts['--tracker'], epic: num(opts['--epic']), members, order: members.map((m) => m.issue), unswept });
    // #3799: a halt reclaims nothing — every worktree stays for KEPT_WORKTREE
    // on resume. A clean merge-back reclaims each merged member itself.
    if (!result.ok) return { code: 1, envelope: { subcommand: sub, ...result, reclaimed: [] } };
    const holdTier1 = holdSpecs.map(Number);
    const { reclaimed, kept } = reclaimMerged({ root, members, merged: result.merged, git, teardown: teardownOf(seams), holdTier1 });
    return { code: 0, envelope: { subcommand: sub, ...result, reclaimed, kept } };
  }

  if (sub === 'group-tier1') {
    const miss = requireOpts(opts, ['--base', '--member']);
    if (miss) return fail(miss);
    if (!opts['--member'].every(isIssueNumber)) return fail('--member takes an issue number');
    const files = bodyFileMap(opts['--body-file']);
    // #3286: --state is the run-state file; its regeneratedCommits are --own.
    let recorded = [];
    if (opts['--state']) {
      try {
        recorded = readJsonFile(root, opts['--state']).regeneratedCommits || [];
      } catch (e) {
        return fail(`cannot read run state ${opts['--state']}: ${e.message}`, 1);
      }
    }
    const members = opts['--member'].map((n) => ({ issue: Number(n), body: bodyOf(Number(n), files) }));
    // #3774: --member-tier1-sha N=SHA [--member-tier1 N=F] [--clean-merge] —
    // each member's Tier 1 document (default .tmp-gate-<N>-tier1.json), verified
    // as outcome verifies it; a document whose sha is absent or differs is
    // never reused.
    let reuse;
    if (opts['--member-tier1'] || opts['--member-tier1-sha'] || opts['--clean-merge']) {
      const shas = bodyFileMap(opts['--member-tier1-sha']);
      const docs = { ...Object.fromEntries(Object.keys(shas).map((n) => [n, `.tmp-gate-${n}-tier1.json`])), ...bodyFileMap(opts['--member-tier1']) };
      reuse = { cleanMerge: !!opts['--clean-merge'], tier1: {}, untrusted: [] };
      const { safePath } = require('./input-validation.js');
      for (const [n, file] of Object.entries(docs)) {
        // A CLI-named path is contained in the root before any read (merge-back
        // review): one that escapes is untrusted and never opened.
        let resolved;
        try {
          resolved = safePath(root, file);
        } catch (_e) {
          reuse.untrusted.push({ issue: Number(n), reason: `${file} escapes the project root, so it was not read` });
          continue;
        }
        let text;
        try {
          text = require('fs').readFileSync(resolved, 'utf8');
        } catch (e) {
          reuse.untrusted.push({ issue: Number(n), reason: `${file} is unreadable (${e.code || e.message})` });
          continue;
        }
        if (!shas[n]) { reuse.untrusted.push({ issue: Number(n), reason: `${file} has no --member-tier1-sha` }); continue; }
        if (sha256(text) !== String(shas[n]).toLowerCase()) { reuse.untrusted.push({ issue: Number(n), reason: `${file} no longer matches its sha256` }); continue; }
        const doc = JSON.parse(text);
        reuse.tier1[Number(n)] = doc.tier1 || doc;
      }
    }
    const { resolveSuites } = require('./test-runner.js');
    const tier1 = runGroupTier1({
      reuse,
      recorded,
      base: opts['--base'], head: opts['--head'] || 'HEAD', members, epic: num(opts['--epic']),
      regenerated: opts['--regenerated'] || [], cwd: root, git, suites: resolveSuites(root).suites, runSuite, runSelector,
      prior: (opts['--prior'] || []).map(Number).filter(Number.isInteger),
      own: opts['--own'] || [],
    });
    // Tier 2 is the parent's own read; this decides on Tier 1 and the parent
    // halts on its read independently, on the same terms.
    const worktreesKept = (opts['--kept-worktree'] || []).map((p) => ({ worktreePath: p }));
    const outcome = postMergeOutcome({ group: num(opts['--group']) || 1, tier1, epic: num(opts['--epic']), unswept: unsweptOf(opts), worktreesKept });
    return { code: tier1.ok ? 0 : 1, envelope: { ok: tier1.ok, subcommand: sub, tier1, outcome } };
  }

  if (sub === 'batch-range') {
    const miss = requireOpts(opts, ['--member', '--head']);
    if (miss) return fail(miss);
    if (!opts['--member'].every(isIssueNumber)) return fail('--member takes an issue number');
    // #3668: a spec with no '=' became issue NaN and tip = the whole spec, so
    // the error named a missing tip rather than the malformed flag.
    const specs = opts['--base-of'] || [];
    if (!specs.every((spec) => spec.indexOf('=') > 0 && isIssueNumber(spec.slice(0, spec.indexOf('='))))) {
      return fail('--base-of takes N=SHA');
    }
    const bases = specs.map((spec) => {
      const i = spec.indexOf('=');
      return { issue: Number(spec.slice(0, i)), tip: spec.slice(i + 1) };
    });
    const range = batchRange({ members: opts['--member'].map(Number), bases, head: opts['--head'] });
    return { code: range.ok ? 0 : 1, envelope: { subcommand: sub, ...range } };
  }

  if (sub === 'clear-member') {
    // #3360: a member merged and In review leaves no scratch file. Its tier1
    // file outlives every outcome that names it as --sibling (--keep-tier1,
    // then --tier1-only), and a worktree teardown kept keeps all five, so a
    // resumed run still finds them.
    const miss = requireOpts(opts, ['--issue']);
    if (miss) return fail(miss);
    const issue = num(opts['--issue']);
    if (!Number.isInteger(issue)) return fail('--issue takes an issue number');
    if (opts['--keep-tier1'] && opts['--tier1-only']) return fail('give --keep-tier1 or --tier1-only, not both');
    const fs = require('fs');
    if (opts['--ledger']) {
      let entry;
      try {
        entry = (readJsonFile(root, opts['--ledger']).members || []).find((m) => m.issue === issue);
      } catch (e) {
        return { code: 1, envelope: { ok: false, subcommand: sub, issue, removed: [], error: `cannot read run ledger ${opts['--ledger']}: ${e.message} — every file kept` } };
      }
      if (entry && entry.worktreePath && fs.existsSync(path.resolve(root, entry.worktreePath))) {
        return { code: 0, envelope: { ok: true, subcommand: sub, issue, kept: true, worktreePath: entry.worktreePath, removed: [], absent: [] } };
      }
    }
    const all = memberScratch(issue);
    const files = opts['--tier1-only'] ? all.slice(0, 1) : opts['--keep-tier1'] ? all.slice(1) : all;
    const r = clearScratch({ root, files });
    return { code: r.ok ? 0 : 2, envelope: { subcommand: sub, issue, kept: false, ...r } };
  }

  if (sub === 'reclaim') {
    // #3714: the accepted reclaim offer. Each worktree is re-checked first —
    // its state may have changed since the preamble offered it — then torn
    // down through worktree-teardown.js, never `git worktree remove` or rm.
    const miss = requireOpts(opts, ['--reclaim']);
    if (miss) return fail(miss);
    const specs = opts['--reclaim'].map(parseReclaimSpec);
    const bad = specs.find((s) => s.error);
    if (bad) return fail(`--reclaim takes [N:]wt/<branch>:<path> — ${bad.error}`);
    const results = reclaimWorktrees({ root, worktrees: specs, git, teardown: teardownOf(seams) });
    // Reclaimed means the worktree AND its branch are gone: a branch
    // `git branch -d` refused is a failure to report, not a success.
    const ok = results.every((r) => r.status === 'removed' && r.branchDeleted);
    return { code: ok ? 0 : 1, envelope: { ok, subcommand: sub, results } };
  }

  if (sub === 'clear-run') {
    // #3360: the run's state and ledger, once no member is left unmerged.
    const miss = requireOpts(opts, ['--file']);
    if (miss) return fail(miss);
    const r = clearScratch({ root, files: opts['--file'] });
    if (!r.ok) return { code: 2, envelope: { subcommand: sub, ...r, error: `clear-run takes only top-level .tmp-gate-/brief-/rolling-/concurrent- files: ${r.refused.join(', ')}` } };
    return { code: 0, envelope: { subcommand: sub, ...r } };
  }

  return fail(`unknown subcommand: ${sub}`);
}

if (require.main === module) {
  let result;
  try {
    result = runCli(process.argv.slice(2));
  } catch (e) {
    result = { code: 1, envelope: { ok: false, error: e.message } };
  }
  process.stdout.write(JSON.stringify(result.envelope, null, 2) + '\n');
  process.exitCode = result.code;
}

module.exports = {
  runCli,
  SCRATCH_FILE,
  clearScratch,
  memberScratch,
  postComment,
  undeclaredOverlap,
  parseCliArgs,
  parseMemberSpec,
  parseReclaimSpec,
  reclaimWorktrees,
  reclaimMerged,
  notRunFailure,
  runTier1,
  memberBase,
  buildTier2,
  planTier3,
  planSequentialReview,
  decideReviewOutcome,
  formatReviewComment,
  loadCriterionClasses,
  classifyFindings,
  correctnessDisposition,
  fixingCommits,
  formatFindingMarker,
  buildFindingBug,
  formatFixCycleRecord,
  settleCorrectness,
  clearFixRecord,
  fixRecordFile,
  parseReview,
  checkReviewerTree,
  readLedgerWorktrees,
  HOST_WRITTEN_PATHS,
  dirtyTrackerPaths,
  parsePorcelain,
  unquoteGitPath,
  evaluateTier3,
  diffReviewSkillPresent,
  mayMerge,
  decideOutcome,
  formatFindingsComment,
  resumeFixCycle,
  postMergeSet,
  runGroupTier1,
  decideSuiteReuse,
  batchRange,
  postMergeOutcome,
  evaluateMember,
  MANIFEST_FILENAME,
  parseNameStatus,
  hashFile,
  applyReviewedHashes,
  recordReviewedHashes,
  verifyRecordedHashes,
};
