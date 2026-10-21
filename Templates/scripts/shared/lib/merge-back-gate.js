// Rubrical Works (c) 2026
/**
 * @framework-script 0.109.1
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

const refPattern = (issue) => new RegExp(`\\bRefs #${issue}(?!\\d)`);

/** Paths named by `git status --porcelain` (rename → new path). */
function parsePorcelain(raw) {
  return String(raw || '')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const p = line.slice(3);
      const arrow = p.indexOf(' -> ');
      return arrow === -1 ? p : p.slice(arrow + 4);
    });
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
  const range = `${trackerTip}..${branch}`;
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

  const uncommitted = parsePorcelain(git(['status', '--porcelain'], { cwd: worktreePath }));
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

  const prompt = [
    `You are a read-only code reviewer. Review ONLY the commit range ${range}.`,
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
    'acceptance criteria and the charter only. Do not edit any file.',
    '',
    'Procedure: follow .claude/skills/diff-review/SKILL.md — read',
    '.claude/skills/diff-review/review-criteria.json from disk, count first (git diff --numstat',
    'with three dots, git log with two), read within the budget, evaluate every criterion,',
    'and derive the verdict from the verdict rule.',
    '',
    'Output: your final message is ONE JSON document valid against',
    '.claude/skills/diff-review/output-schema.json, and nothing else.',
  ].join('\n');

  return {
    tier: 3,
    skipped: false,
    request: { description: `Review #${issue}`, readOnly: true, prompt },
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
  for (const f of (tier3 && tier3.findings) || []) lines.push(`- ${EMOJI[f.status] || f.status} ${f.criterion} ${at(f)} — ${f.evidence}`);
  return lines;
}

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
  return lines.join('\n');
}

/**
 * What the parent does with a member's gate result (#3141):
 *   pass/warn → `merge`, with the comment to post;
 *   fail, no cycle used → `send-findings` to the SAME implementer, its
 *     worktree intact, every tier to re-run once;
 *   fail, cycle used → `halt`: files and lines, worktree kept, never merged.
 * A resume after compaction counts the re-run as the one cycle.
 */
function decideOutcome({ member = {}, tier1, tier3, fixCycles = 0, resumedFromCompaction = false, epic } = {}) {
  const cycles = resumedFromCompaction ? Math.max(fixCycles, 1) : fixCycles;
  const issue = member.issue;
  if (gatePassed(tier1, tier3)) {
    return { action: 'merge', issue, fixCycles: cycles, comment: { issue, body: formatFindingsComment({ issue, tier1, tier3, fixCycles: cycles }) } };
  }
  const findings = findingLines(tier1, tier3);
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
    `  Resume: fix in the kept worktree, then /work ${epic || '<epic>'} --nonstop --concurrent.`,
  ].join('\n');
  return { action: 'halt', issue, worktreeKept: member.worktreePath, findings, report };
}

/**
 * Resume after compaction mid fix cycle (#3141, Corner Case 5): the parent
 * re-reads the worktree branch and re-runs every tier once; that run is the
 * single fix cycle, whatever was or was not sent before the loss.
 */
function resumeFixCycle({ member = {}, trackerTip = '<tracker-tip>' } = {}) {
  return {
    fixCycles: 1,
    resumedFromCompaction: true,
    rerunAllTiers: true,
    range: `${trackerTip}..${member.branch}`,
    instruction: `Re-read the worktree branch ${member.branch} at ${member.worktreePath} and re-run Tiers 1–3 once over ${trackerTip}..${member.branch}; trust no verdict from before compaction. This re-run counts as the one fix cycle: a pass merges, a fail halts.`,
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
 * Tier 1 for the group's post-merge pass, on the tracker (#3158).
 *
 * The per-member Tier 1 cannot stand in for it over `<base>..<head>`: merge-
 * back merges with `--no-ff`, and those merge commits carry no `Refs #N`, so
 * every one would fail attribution. Here a merge commit is SKIPPED and listed
 * — mergeBack aborts any merge git cannot complete, so a merge it made carries
 * no authored content of its own — and every other commit must name a member
 * (or, for the reconcile step's regeneration commits, the epic). Scope is
 * checked per member over that member's own commits; an epic-only commit may
 * touch only the runner's regenerated paths. Suites run at the root over the
 * union of touched files, parallel suites only: the group's exclusive suites
 * are the deferred-suites step's, already run before this pass.
 *
 * @param {{base: string, head?: string, members: Array<{issue: number, body: string}>,
 *   epic?: number, regenerated?: string[], cwd: string, git: Function,
 *   suites?: object[], runSuite?: Function, protectedPaths?: object[], registrarExemption?: object}} input
 */
function runGroupTier1({
  base, head = 'HEAD', members = [], epic, regenerated = [], cwd, git,
  suites = [], runSuite, protectedPaths, registrarExemption,
}) {
  const range = `${base}..${head}`;
  const failures = [];
  const issues = members.map((m) => m.issue);
  const owner = (message) => {
    const hit = issues.find((n) => refPattern(n).test(message));
    if (hit !== undefined) return hit;
    return epic !== undefined && refPattern(epic).test(message) ? epic : null;
  };

  const all = parseCommitsWithParents(git(['log', '--format=%H%x1f%P%x1f%B%x1e', range]));
  const mergesSkipped = all.filter((c) => c.parents.length > 1).map((c) => c.sha);
  const commits = all.filter((c) => c.parents.length <= 1).map((c) => ({ sha: c.sha, issue: owner(c.message) }));
  const unattributed = commits.filter((c) => c.issue === null).map((c) => c.sha);
  if (unattributed.length > 0) {
    failures.push({ check: 'attribution', message: `Commit(s) on the tracker naming no group member${epic !== undefined ? ` or epic #${epic}` : ''}: ${unattributed.join(', ')}.` });
  }

  const uncommitted = parsePorcelain(git(['status', '--porcelain'], { cwd }));
  if (uncommitted.length > 0) {
    failures.push({ check: 'uncommitted', message: `Uncommitted work on the tracker: ${uncommitted.join(', ')}.` });
  }

  const nameStatusOf = (shas) => shas.map((sha) => git(['show', '--name-status', '--pretty=format:', sha])).join('\n');
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

  if (epic !== undefined && !issues.includes(epic)) {
    const epicShas = commits.filter((c) => c.issue === epic).map((c) => c.sha);
    const epicPaths = parseNameStatus(nameStatusOf(epicShas)).map((r) => r.path);
    epicPaths.forEach((p) => touched.add(p));
    const allowed = new Set(regenerated);
    const outside = [...new Set(epicPaths.filter((p) => !allowed.has(p)))];
    if (outside.length > 0) {
      failures.push({ check: 'regenerated', message: `Commit(s) naming only epic #${epic} touch paths the regeneration runner did not report: ${outside.join(', ')}.` });
    }
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
    uncommitted,
    perMember,
    touched: [...touched],
    suiteRuns,
    deferredSuites: scoped.deferred || [],
  };
}

/**
 * The group's post-merge pass verdict: Tiers 1–2 over `postMergeSet` on the
 * tracker. A fail halts on the second-review-fail terms. `tier1` is
 * `runGroupTier1`'s result (#3158).
 */
function postMergeOutcome({ group, tier1, tier2, worktreesKept = [], epic } = {}) {
  const ok = tier1 && tier1.ok && (!tier2 || tier2.ok !== false);
  if (ok) return { action: 'report-group', group };
  const report = [
    `Halted: post-merge pass failed for group ${group} on the tracker.`,
    ...findingLines(tier1, null).map((l) => `  ${l}`),
    ...(tier2 && tier2.ok === false && tier2.reason ? [`  Tier 2: ${tier2.reason}`] : []),
    ...(worktreesKept.length ? ['  Worktrees kept for inspection:', ...worktreesKept.map((w) => `    - ${w.worktreePath}${w.branch ? ` (${w.branch})` : ''}`)] : []),
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
  const plan = planTier3({ issue: member.issue, acceptanceCriteria: acs, filesToModify, range: `${trackerTip}..${member.branch}`, charterPath, noReview, skillPresent });
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
      const [code, a, b] = line.split('\t');
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
  '  tier1       --issue N --branch B --worktree P --tracker-tip SHA [--body-file F]',
  '  tier3-plan  --issue N --tracker-tip SHA --branch B [--body-file F] [--no-review]',
  '  outcome     --issue N --worktree P [--branch B] --tier1 F [--tier3 F | --no-review] [--fix-cycles N] [--resumed] [--epic N]',
  '  merge-back  --tracker T --member N:BRANCH[:WORKTREE] ... [--epic N]',
  '  group-tier1 --base SHA [--head H] --member N ... [--body-file N=F ...] [--epic N] [--regenerated P ...] [--group G]',
  '  Common: --root DIR (default: the current directory). Bodies not given by --body-file are read with gh pmu view N --body-stdout.',
].join('\n');

const REPEATABLE = new Set(['--member', '--regenerated', '--body-file']);
const BOOLEAN = new Set(['--no-review', '--resumed']);

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
 * @param {string[]} argv
 * @param {{git?: Function, runSuite?: Function, readBody?: Function}} [seams]
 * @returns {{code: number, envelope: object}}
 */
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
    return { code: tier1.ok ? 0 : 1, envelope: { ok: tier1.ok, subcommand: sub, tier1, tier2 } };
  }

  if (sub === 'tier3-plan') {
    const miss = requireOpts(opts, ['--issue', '--tracker-tip', '--branch']);
    if (miss) return fail(miss);
    const issue = num(opts['--issue']);
    const body = bodyOf(issue, bodyFileMap(opts['--body-file'], issue));
    const filesToModify = scopeDrift.parseDeclaredScope(body).paths;
    const tier3 = planTier3({
      issue, acceptanceCriteria: extractAcceptanceCriteria(body).items.map((i) => i.text), filesToModify,
      range: `${opts['--tracker-tip']}..${opts['--branch']}`, noReview: !!opts['--no-review'],
      skillPresent: diffReviewSkillPresent(root),
    });
    return { code: 0, envelope: { ok: true, subcommand: sub, tier3 } };
  }

  if (sub === 'outcome') {
    const miss = requireOpts(opts, ['--issue', '--worktree', '--tier1']);
    if (miss) return fail(miss);
    if (!opts['--tier3'] && !opts['--no-review']) return fail('give --tier3 <reviewer output file> or --no-review');
    const issue = num(opts['--issue']);
    const t1doc = readJsonFile(root, opts['--tier1']);
    const tier1 = t1doc.tier1 || t1doc;
    const tier3 = opts['--no-review']
      ? planTier3({ issue, range: '', noReview: true })
      : parseReview(require('fs').readFileSync(path.resolve(root, opts['--tier3']), 'utf8'), { issue, root });
    const decision = decideOutcome({
      member: { issue, worktreePath: opts['--worktree'], branch: opts['--branch'] },
      tier1, tier3, fixCycles: num(opts['--fix-cycles']) || 0, resumedFromCompaction: !!opts['--resumed'], epic: num(opts['--epic']),
    });
    return { code: 0, envelope: { ok: true, subcommand: sub, tier3, ...decision } };
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
    const result = mergeBack({ git: seams.gitStatus || gitStatus, tracker: opts['--tracker'], epic: num(opts['--epic']), members, order: members.map((m) => m.issue) });
    return { code: result.ok ? 0 : 1, envelope: { subcommand: sub, ...result } };
  }

  if (sub === 'group-tier1') {
    const miss = requireOpts(opts, ['--base', '--member']);
    if (miss) return fail(miss);
    const files = bodyFileMap(opts['--body-file']);
    const members = opts['--member'].map((n) => ({ issue: Number(n), body: bodyOf(Number(n), files) }));
    const { resolveSuites } = require('./test-runner.js');
    const tier1 = runGroupTier1({
      base: opts['--base'], head: opts['--head'] || 'HEAD', members, epic: num(opts['--epic']),
      regenerated: opts['--regenerated'] || [], cwd: root, git, suites: resolveSuites(root).suites, runSuite,
    });
    // Tier 2 is the parent's own read; this decides on Tier 1 and the parent
    // halts on its read independently, on the same terms.
    const outcome = postMergeOutcome({ group: num(opts['--group']) || 1, tier1, epic: num(opts['--epic']) });
    return { code: tier1.ok ? 0 : 1, envelope: { ok: tier1.ok, subcommand: sub, tier1, outcome } };
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
  parseCliArgs,
  parseMemberSpec,
  notRunFailure,
  runTier1,
  buildTier2,
  planTier3,
  parseReview,
  diffReviewSkillPresent,
  mayMerge,
  decideOutcome,
  formatFindingsComment,
  resumeFixCycle,
  postMergeSet,
  runGroupTier1,
  postMergeOutcome,
  evaluateMember,
  MANIFEST_FILENAME,
  parseNameStatus,
  hashFile,
  applyReviewedHashes,
  recordReviewedHashes,
  verifyRecordedHashes,
};
