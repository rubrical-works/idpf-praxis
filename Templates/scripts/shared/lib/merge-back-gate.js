// Rubrical Works (c) 2026
/**
 * @framework-script 0.113.0
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
 * is #3141's. This module only guarantees that `mayMerge` is false for any
 * Tier 1 failure, so unattributed work can never merge.
 *
 * git and the suite runner are injected into every function; only the
 * command-line entry point at the bottom (#3158) spawns — real git, and each
 * declared suite command verbatim. Its subcommands (tier1, tier3-plan,
 * outcome, merge-back, group-tier1) are what the concurrent run's gate steps
 * name; `--help` with no subcommand prints the usage.
 */

const path = require('path');
const scopeDrift = require('../scope-drift-check.js');
const logChangedFiles = require('../log-changed-files.js');
const { extractAcceptanceCriteria } = require('./checkbox-scan.js');
const { scopedInvocations } = require('./test-runner.js');
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
  for (const n of scoped.notRun || []) named.push(`${n.suiteId} (${n.reason})`);
  for (const i of scoped.invalid || []) named.push(`${i.suiteId} (invalid concurrency declaration)`);
  if (named.length === 0) return null;
  return { check: 'suites', message: `Suite(s) not run: ${named.join(', ')}.` };
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
 * Tier 1 — mechanical checks over one member's branch.
 *
 * @param {{issue: number, body: string, trackerTip: string, branch: string,
 *   worktreePath: string, git: (args: string[], opts?: {cwd?: string}) => string,
 *   suites?: object[], runSuite?: (run: {command: string, cwd: string, suiteIds: string[], files: string[], mode: string}) => {exitCode: number},
 *   protectedPaths?: Array<{pattern: string}>, registrarExemption?: object}} input
 *   `suites` is `resolveSuites().suites`; `protectedPaths` defaults to the
 *   drift gate's own metadata.
 * @returns {{tier: 1, ok: boolean, failures: Array<{check: string, message: string}>,
 *   commits: Array<{sha: string, attributed: boolean}>, uncommitted: string[],
 *   scope: object, filesChanged: string, acceptanceCriteria: object, suiteRuns: object[],
 *   deferredSuites: Array<{suiteId: string, concurrency: string, reason: 'exclusive'|'cannot-narrow'}>}}
 */
function runTier1({
  issue, body, trackerTip, branch, worktreePath, git,
  suites = [], runSuite, protectedPaths, registrarExemption,
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
  const suiteRuns = [];
  const scoped = scopedInvocations({ suites, changedFiles: scope.touched, inWorktree: true });
  const deferredSuites = (scoped.deferred || []).map((d) => ({ ...d, reason: 'exclusive' }));
  for (const run of scoped.runs.filter((r) => !r.narrowed)) {
    for (const suiteId of run.suiteIds || [run.suiteId]) {
      deferredSuites.push({ suiteId, concurrency: 'parallel', reason: 'cannot-narrow' });
    }
  }
  for (const run of scoped.runs.filter((r) => r.narrowed)) {
    const cwd = run.cwd && run.cwd !== '.' ? path.posix.join(worktreePath, run.cwd) : worktreePath;
    const suiteIds = run.suiteIds || [run.suiteId];
    const files = [...(run.files || [])];
    const result = runSuite ? runSuite({ command: run.command, cwd, suiteIds, files, mode: run.mode }) : { exitCode: null };
    const ok = result.exitCode === 0;
    suiteRuns.push({ suiteIds, command: run.command, cwd, files, exitCode: result.exitCode, ok });
  }
  const failed = suiteRuns.filter((r) => !r.ok);
  if (failed.length > 0) {
    failures.push({ check: 'suites', message: `Suite run(s) failed in the worktree: ${failed.map((r) => `${r.suiteIds.join('+')} (exit ${r.exitCode})`).join(', ')}.` });
  }
  const notRun = notRunFailure(scoped);
  if (notRun) failures.push(notRun);

  return {
    tier: 1,
    ok: failures.length === 0,
    failures,
    range,
    commits,
    uncommitted,
    scope: { ok: scope.ok, mode: scope.mode, violations: scope.violations, declaredScope: scope.declaredScope, touched: scope.touched },
    filesChanged,
    acceptanceCriteria,
    suiteRuns,
    deferredSuites,
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
 *   range: string, charterPath?: string, noReview?: boolean, skillPresent?: boolean}} input
 */
function planTier3({ issue, acceptanceCriteria = [], filesToModify = [], range, charterPath = 'CHARTER.md', noReview = false, skillPresent }) {
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
    '',
    'Inputs:',
    `- Issue: #${issue}. Acceptance criteria:`,
    ...(acceptanceCriteria.length ? acceptanceCriteria.map((ac) => `  - [ ] ${ac}`) : ['  (none declared)']),
    `  Files to modify: ${filesToModify.length ? filesToModify.join(', ') : '(none declared)'}`,
    `- Charter: ${charterPath}`,
    '- Domain ids: none',
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
    request: { description: `Review #${issue}`, writes: [outputPath], prompt },
  };
}

/** The path a `git status --porcelain` line names — the destination of a rename, unquoted. */
function porcelainPath(line) {
  const rest = line.slice(3);
  const arrow = rest.indexOf(' -> ');
  return unquoteGitPath(arrow === -1 ? rest : rest.slice(arrow + 4));
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

/** A member's four scratch files (#3360): its three gate files, then its brief. */
const memberScratch = (n) => [`.tmp-gate-${n}-tier1.json`, `.tmp-gate-${n}-tier3.json`, `.tmp-gate-${n}-tree-before.txt`, `.tmp-brief-${n}.md`];

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
 * @returns {{ok: boolean, outsideContract: string[], hostWritten?: string[], external?: string[]}}
 */
/**
 * Could run path `runPath` name a file inside the directory `dir` (`a/b/`)?
 * A literal path under it does; so does a glob that matches a file there, or
 * one whose literal prefix (up to the first wildcard) lies under or above it —
 * `src/**` and `src/*\/x.js` both reach into a new `src/new/` (#3293). Over-
 * inclusive on purpose: a missed directory lets a stray write pass Tier 3.
 */
function dirMayHoldRunPath(dir, runPath) {
  if (runPath.startsWith(dir)) return true;
  const wild = runPath.search(/[*?[{]/);
  if (wild === -1) return false;
  if (scopeDrift.matchesAny(`${dir}x`, [runPath])) return true;
  const prefix = runPath.slice(0, runPath.lastIndexOf('/', wild) + 1);
  return dir.startsWith(prefix);
}

function checkReviewerTree({ before = '', after = '', issue, outputPath = `.tmp-gate-${issue}-tier3.json`, siblings = [], runPaths } = {}) {
  const lines = (s) => String(s).split(/\r?\n/).filter((l) => l.trim() !== '');
  const prior = new Set(lines(before));
  const allowed = new Set([outputPath, `.tmp-gate-${issue}-tree-before.txt`]);
  for (const m of siblings) for (const f of ['tier1.json', 'tier3.json', 'tree-before.txt']) allowed.add(`.tmp-gate-${m}-${f}`);
  const changed = [...new Set(lines(after).filter((l) => !prior.has(l)).map(porcelainPath).filter((p) => !allowed.has(p)))].sort();
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
  return { ok: outsideContract.length === 0, outsideContract, ...(hostWritten.length ? { hostWritten } : {}), ...(external.length ? { external } : {}) };
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
function evaluateTier3({ issue, outputPath = `.tmp-gate-${issue}-tier3.json`, exists, text, treeBefore, treeBeforeIntact = true, treeAfter, siblings = [], runPaths, schema, root } = {}) {
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
  const tree = checkReviewerTree({ before: treeBefore, after: treeAfter, issue, outputPath, siblings, runPaths });
  if (!tree.ok) {
    return fail('tier-3-wrote-outside-contract',
      `The working tree changed outside the reviewer's contract during the review: ${tree.outsideContract.join(', ')}. `
      + 'Reviewers in a group share the root, so this fails Tier 3 for every member whose review window overlapped.',
      { outsideContract: tree.outsideContract });
  }
  const review = parseReview(text, { issue, schema, root });
  // Reported, never failed (#3263).
  return { ...review, ...(tree.external ? { external: tree.external } : {}), ...(tree.hostWritten ? { hostWritten: tree.hostWritten } : {}) };
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
  let doc;
  try {
    doc = JSON.parse(String(text).trim());
  } catch (e) {
    return fail([`Reviewer output is not one JSON document: ${e.message}`]);
  }

  let outputSchema = schema;
  if (!outputSchema) {
    try {
      outputSchema = JSON.parse(require('fs').readFileSync(path.join(root, SKILL_DIR, 'output-schema.json'), 'utf8'));
    } catch (e) {
      return fail([`Cannot read the diff-review output schema: ${e.message}`]);
    }
  }
  const Ajv = require('ajv');
  const ajv = new Ajv({ allErrors: true, strict: false });
  // The draft-07 meta-schema id is Ajv's default dialect; compiling with it
  // named would make Ajv look the meta-schema up rather than use its own.
  const body = { ...outputSchema };
  delete body.$schema;
  const validate = ajv.compile(body);
  if (!validate(doc)) {
    return fail(validate.errors.map((e) => `${e.instancePath || '(root)'} ${e.message}`));
  }
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
function decideOutcome({ member = {}, tier1, tier3, fixCycles = 0, reviewRetries = 0, resumedFromCompaction = false, epic, unswept = [] } = {}) {
  const cycles = resumedFromCompaction ? Math.max(fixCycles, 1) : fixCycles;
  const issue = member.issue;
  if (gatePassed(tier1, tier3)) {
    return { action: 'merge', issue, fixCycles: cycles, comment: { issue, body: formatFindingsComment({ issue, tier1, tier3, fixCycles: cycles }) } };
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
      `Fix these in your worktree (${member.worktreePath}) and commit each fix as \`Refs #${issue} — <what>\`. Do not push, do not merge, do not move the issue. Reply when done; every tier re-runs once, and a second fail halts the run.`,
    ].join('\n');
    return { action: 'send-findings', issue, to: member.agent, worktreePath: member.worktreePath, fixCycle: 1, rerunAllTiers: true, findings, message };
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
 *   prior?: number[], own?: string[], recorded?: Array<{sha: string, paths?: string[]}>}} input
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
  suites = [], runSuite, protectedPaths, registrarExemption, prior = [], own: givenOwn = [], recorded = [],
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
  const scoped = scopedInvocations({ suites, changedFiles: [...touched], inWorktree: true });
  for (const run of scoped.runs) {
    const runCwd = run.cwd && run.cwd !== '.' ? path.join(cwd, run.cwd) : cwd;
    const suiteIds = run.suiteIds || [run.suiteId];
    const files = [...(run.files || [])];
    const result = runSuite ? runSuite({ command: run.command, cwd: runCwd, suiteIds, files, mode: run.mode }) : { exitCode: null };
    suiteRuns.push({ suiteIds, command: run.command, cwd: runCwd, files, exitCode: result.exitCode, ok: result.exitCode === 0 });
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
    deferredSuites: scoped.deferred || [],
  };
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
  if (ok) return { action: 'report-group', group, ...(external.length ? { external } : {}) };
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
 * message. Everything else is what runTier1 and planTier3 take.
 */
function evaluateMember({
  member = {}, body, trackerTip, git, suites = [], runSuite, protectedPaths, registrarExemption,
  acceptanceCriteria, filesToModify = [], charterPath, noReview = false, skillPresent, review, schema,
  fixCycles = 0, resumedFromCompaction = false, epic,
} = {}) {
  const tier1 = runTier1({
    issue: member.issue, body, trackerTip, branch: member.branch, worktreePath: member.worktreePath,
    git, suites, runSuite, protectedPaths, registrarExemption,
  });
  const acs = acceptanceCriteria || tier1.acceptanceCriteria.items;
  const plan = planTier3({ issue: member.issue, acceptanceCriteria: acs, filesToModify, range: `${memberBase({ git, trackerTip, branch: member.branch })}..${member.branch}`, charterPath, noReview, skillPresent });
  let tier3 = plan;
  if (!plan.skipped) {
    let text;
    try {
      text = review(plan.request);
    } catch (e) {
      text = `reviewer failed: ${e.message}`;
    }
    tier3 = parseReview(text, { issue: member.issue, schema });
  }
  const tier2 = buildTier2({ issue: member.issue, files: tier1.scope.touched, acceptanceCriteria: acs });
  return { tier1, tier2, tier3, ...decideOutcome({ member, tier1, tier3, fixCycles, resumedFromCompaction, epic }) };
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
 * forbids it. A reported skip does not.
 */
function mayMerge({ tier1, tier3 } = {}) {
  if (!tier1 || !tier1.ok) return false;
  if (!tier3 || tier3.skipped === true) return true;
  return tier3.verdict === 'pass' || tier3.verdict === 'warn';
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
  '  tree-snapshot --out F [--clear F ...]',
  '  outcome     --issue N --worktree P [--branch B] --tier1 F --tier1-sha SHA [--tier3 F --tree-before F --tree-before-sha SHA [--sibling N ...] | --no-review] [--fix-cycles N] [--review-retries N] [--resumed] [--epic N] [--unswept N ...] [--post-comment]',
  '  merge-back  --tracker T --member N:BRANCH[:WORKTREE] ... [--epic N] [--unswept N ...] [--body-file N=F ...] — with two or more members, fails before merging when they share a path outside their declared scope',
  '  group-tier1 --base SHA [--head H] --member N ... [--body-file N=F ...] [--epic N: the root issue — the epic, or the own issue of a branch tracker] [--regenerated P ...] [--group G] [--unswept N ...] [--prior N ...] [--kept-worktree P ...] [--own SHA ...] [--state F: the run-state file; its recorded regenerated commits count as --own]',
  '  batch-range --member N ... --base-of N=SHA ... --head H',
  '  clear-member --issue N [--ledger F] [--keep-tier1 | --tier1-only] — removes the member\'s gate files and brief; keeps all when the ledger\'s worktree for N still exists',
  '  clear-run   --file F ... — removes the run\'s state and ledger; top-level .tmp-gate-/brief-/rolling-/concurrent- files only',
  '  Common: --root DIR (default: the current directory). Bodies not given by --body-file are read with gh pmu view N --body-stdout.',
].join('\n');

const REPEATABLE = new Set(['--member', '--regenerated', '--body-file', '--unswept', '--clear', '--sibling', '--prior', '--base-of', '--kept-worktree', '--own', '--file']);
const BOOLEAN = new Set(['--no-review', '--resumed', '--post-comment', '--keep-tier1', '--tier1-only']);

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
  return { issue: Number(n), branch, worktreePath: worktreePath || null };
}

/**
 * @param {string[]} argv
 * @param {{git?: Function, runSuite?: Function, readBody?: Function, ghExec?: Function}} [seams]
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
  const bodyOf = seams.readBody || ((n, files) => readBody(root, n, files));
  const num = (v) => (v === undefined ? undefined : Number(v));

  if (sub === 'tier1') {
    const miss = requireOpts(opts, ['--issue', '--branch', '--worktree', '--tracker-tip']);
    if (miss) return fail(miss);
    const issue = num(opts['--issue']);
    const { resolveSuites } = require('./test-runner.js');
    const tier1 = runTier1({
      issue, body: bodyOf(issue, bodyFileMap(opts['--body-file'], issue)), trackerTip: opts['--tracker-tip'],
      branch: opts['--branch'], worktreePath: path.resolve(root, opts['--worktree']), git,
      suites: resolveSuites(root).suites, runSuite,
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
      skillPresent: diffReviewSkillPresent(root),
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
      tier3 = evaluateTier3({
        issue, outputPath: opts['--tier3'], exists, text: exists ? fs.readFileSync(out, 'utf8') : '',
        treeBefore, treeBeforeIntact: sha256(treeBefore) === String(opts['--tree-before-sha']).toLowerCase(),
        treeAfter: git(TREE_STATUS_ARGS), root, siblings,
        ...(scopesRead === 1 + siblings.length ? { runPaths } : {}),
      });
    }
    const decision = decideOutcome({
      member: { issue, worktreePath: opts['--worktree'], branch: opts['--branch'] },
      tier1, tier3, fixCycles: num(opts['--fix-cycles']) || 0, reviewRetries: num(opts['--review-retries']) || 0, resumedFromCompaction: !!opts['--resumed'], epic: num(opts['--epic']), unswept: unsweptOf(opts),
    });
    if (opts['--post-comment'] && decision.action === 'merge') {
      try {
        const posted = postComment({ issue, body: decision.comment.body, root, ghExec: seams.ghExec || cliGhExec });
        return { code: 0, envelope: { ok: true, subcommand: sub, tier3, ...decision, posted } };
      } catch (e) {
        return { code: 1, envelope: { ok: true, subcommand: sub, tier3, ...decision, posted: null, postError: String(e.stderr || e.message).trim() } };
      }
    }
    return { code: 0, envelope: { ok: true, subcommand: sub, tier3, ...decision } };
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
        return { code: 1, envelope: { ok: false, subcommand: sub, check: 'undeclared-overlap', overlaps: overlap.overlaps, merged: [], worktreesKept: members, report: `Halted before merge-back: ${overlapMessage(overlap.overlaps)} Nothing was merged; every worktree is kept.` } };
      }
    }
    const result = mergeBack({ git: seams.gitStatus || gitStatus, tracker: opts['--tracker'], epic: num(opts['--epic']), members, order: members.map((m) => m.issue), unswept });
    return { code: result.ok ? 0 : 1, envelope: { subcommand: sub, ...result } };
  }

  if (sub === 'group-tier1') {
    const miss = requireOpts(opts, ['--base', '--member']);
    if (miss) return fail(miss);
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
    const { resolveSuites } = require('./test-runner.js');
    const tier1 = runGroupTier1({
      recorded,
      base: opts['--base'], head: opts['--head'] || 'HEAD', members, epic: num(opts['--epic']),
      regenerated: opts['--regenerated'] || [], cwd: root, git, suites: resolveSuites(root).suites, runSuite,
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
    const bases = (opts['--base-of'] || []).map((spec) => {
      const i = spec.indexOf('=');
      return { issue: Number(spec.slice(0, i)), tip: spec.slice(i + 1) };
    });
    const range = batchRange({ members: opts['--member'].map(Number), bases, head: opts['--head'] });
    return { code: range.ok ? 0 : 1, envelope: { subcommand: sub, ...range } };
  }

  if (sub === 'clear-member') {
    // #3360: a member merged and In review leaves no scratch file. Its tier1
    // file outlives every outcome that names it as --sibling (--keep-tier1,
    // then --tier1-only), and a worktree teardown kept keeps all four, so a
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
  notRunFailure,
  runTier1,
  memberBase,
  buildTier2,
  planTier3,
  parseReview,
  checkReviewerTree,
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
