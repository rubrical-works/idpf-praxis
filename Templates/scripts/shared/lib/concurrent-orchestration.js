// Rubrical Works (c) 2026
/**
 * @framework-script 0.112.0
 * concurrent-orchestration.js — The parent's step sequence for
 * `/work --concurrent` (#3129, PRD Concurrent-Work Story 1.12)
 *
 * A concurrent run splits one `/work` between two roles:
 *   - the PARENT session owns Steps 1, 1c, 2b, 2b-ii, 2c, the Review-State and
 *     Pre-Work Status gates, events 1 and 2, Steps 4 and 4a–4f, merge-back,
 *     Step 5 and Step 6 — every gate, announcement and status move;
 *   - each MEMBER agent owns Step 3 only: the TDD cycle, in its own worktree
 *     (`isolation: "worktree"`), committing per AC with `Refs #N`.
 * So every per-issue guarantee of sequential `/work` holds per member: the
 * gates fire once each, event 1 is matched by event 2, and — in default mode
 * — the Step 4f sweep precedes the `in_review` move. Under `--nonstop` one
 * end-of-run sweep follows every `in_review` move instead, and a halt names
 * the processed members it never covered (#3202).
 *
 * `buildRun` turns a concurrency plan (`concurrency-plan.js` — groups by
 * dependency layer, then the sequential tail) into that sequence:
 *   group: gates + event 1 per member → spawn each member (one slot each) →
 *          the Merge-Back Review Gate per member (Tiers 1–3; the reviewer
 *          reuses its implementer's slot — #3130) → merge-back in Processing
 *          Order → worktree teardown → Steps 4–4f, 5, event 2 and the report
 *          per member → STOP (default mode only)
 *   tail:  each member as sequential `/work`, the parent working Step 3
 *          inline, with the default per-member STOP
 *   end:   one run-level Step 4f over every processed member, then the
 *          nonstop summary (`--nonstop` only)
 * `--nonstop` removes every STOP and reports each member as it reaches
 * `in_review`; it also drops the per-group and per-tail-member Step 4f for
 * that single end-of-run sweep (#3202).
 *
 * The helper returns spawn REQUESTS; the Agent call itself is a model tool
 * call it cannot make, and the Story 1.22 qa-required live run checks that
 * the session passes the request through unchanged.
 *
 * Under `--nonstop` the parent follows `nextSteps` instead — the rolling
 * schedule (#3274): a member starts when a slot frees, not when its group
 * drains. Default mode keeps the fixed groups and their per-group STOP.
 *
 * Pure over its inputs: no gh, no git, no disk — except the CLIs at the
 * bottom (`next-steps`, `replan`, `record-spawn`, `record-regenerated`), which
 * read and write the run's state and ledger files.
 */

/** Steps the parent owns, by the ids rule 08 uses. */
const PARENT_STEPS = Object.freeze([
  '1', '1c', '2b', '2b-ii', '2c',
  'review-state-gate', 'pre-work-status-gate', 'event-1',
  '4', '4a', '4b', '4c', '4d', '4e', '4f',
  'merge-back', '5', 'event-2', '6',
]);

/** Steps a member agent owns. */
const MEMBER_STEPS = Object.freeze(['3']);

const PRE_WORK = ['review-state-gate', 'pre-work-status-gate', 'event-1'];
// Rule 08's order (#3261): Step 4c after 4d/4e, so their commits are logged
// and gated in the same pass.
const POST_WORK = ['4', '4a', '4b', '4d', '4e', '4c', '4f', '5', 'event-2'];

/** The entry points the gate and teardown steps name (#3158). */
const GATE_CLI = 'node .claude/scripts/shared/lib/merge-back-gate.js';
const TEARDOWN_CLI = 'node .claude/scripts/shared/lib/worktree-teardown.js';
const ORCH_CLI = 'node .claude/scripts/shared/lib/concurrent-orchestration.js';

/**
 * Parent step kinds that carry no `instruction`, each with the reason (#3158).
 * Every other parent step names what to run: a live run met a `teardown` step
 * that named nothing, found no entry point, and fell back to
 * `git worktree remove` — the call worktree-teardown.js exists to replace.
 * `kind: 'step'` entries are rule 08's own step ids and need none either;
 * any other id carries an instruction.
 */
const STEP_INSTRUCTION_EXEMPT = Object.freeze({
  spawn: 'Carries its own Agent request (description, isolation, prompt); the parent passes it to the Agent tool unchanged, so there is nothing else to run.',
  'review-skip': 'Carries its reason (--no-review); the parent reports the skip, and Tier 3 is not run, so there is nothing to invoke.',
  'gate-stop': 'Records that the Review-State Gate stopped this member; nothing runs for it, which is the point of the step.',
  'not-started': 'Records a member whose worktree could not be created, with its path and error; the parent reports it and runs nothing for it.',
  halt: 'Carries its own report, the --nonstop halt text; the parent prints it and stops.',
  report: 'Carries its own text, the Sub-issue → In Review line the parent prints.',
  stop: 'Rule 08 Step 6 defines the STOP sequence: prune, report, event 2, STOP.',
  summary: 'Rule 08 Steps 6 and 6a define the nonstop summary; `repeats` names what it repeats.',
});

/**
 * The per-member gate instructions, emitted once per run (#3280). A step
 * carrying `template` and `params` is read through instructionOf(); repeating
 * this text for every member made it half the preamble envelope. `{{n}}` is
 * the member; `{{tip}}` the tracker tip its range starts at (the group's, or
 * under the rolling schedule its own worktree's — #3274); `{{siblings}}` and
 * `{{unswept}}` are pre-rendered flag lists.
 */
const MEMBER_TEMPLATES = Object.freeze({
  'gate-tier1': `Run \`${GATE_CLI} tier1 --issue {{n}} --branch <#{{n}}'s wt/* branch> --worktree <#{{n}}'s worktree path> --tracker-tip {{tip}} --out .tmp-gate-{{n}}-tier1.json\` — it writes the Tier 1 document itself (#3225); record the sha256 its envelope's out reports, and do not redirect stdout into that file. Exit 1 is a Tier 1 failure: carry it to the outcome step, never merge past it.`,
  'gate-tier2': 'Read every file in .tmp-gate-{{n}}-tier1.json tier2.files, file by file, against #{{n}}\'s acceptance criteria, as tier2.instruction says. Record the read as pass or fail with the file and line of anything no AC asks for; the direct-work exemption never applies.',
  'gate-tier3': `Run \`${GATE_CLI} tier3-plan --issue {{n}} --tracker-tip {{tip}} --branch <#{{n}}'s wt/* branch>\`. tier3.skipped → report tier3.message (Tiers 1–2 still decide). Otherwise run \`${GATE_CLI} tree-snapshot --out .tmp-gate-{{n}}-tree-before.txt --clear .tmp-gate-{{n}}-tier3.json\` (it clears an earlier review) and record its sha256, then spawn the reviewer Agent in slot {{slot}} with tier3.request.prompt exactly — never the implementer's summary. The reviewer writes its own review to .tmp-gate-{{n}}-tier3.json (#3204); never re-word it. \`outcome --post-comment\` posts the comment; write no root file. A change in the running members' \`runPaths\` but this member's review, snapshot or a sibling's gate files fails Tier 3 (#3220); one outside is reported as \`external\`, not failed.`,
  'gate-outcome': `Run \`${GATE_CLI} outcome --issue {{n}} --worktree <#{{n}}'s worktree path> --branch <#{{n}}'s wt/* branch> --tier1 .tmp-gate-{{n}}-tier1.json --tier1-sha <sha256 from #{{n}}'s tier1 --out envelope> --tier3 .tmp-gate-{{n}}-tier3.json --tree-before .tmp-gate-{{n}}-tree-before.txt --tree-before-sha <sha256 from #{{n}}'s tree-snapshot envelope>{{siblings}}{{unswept}} --post-comment\` (\`--no-review\` for the three Tier 3 flags when Tier 3 was skipped; add \`--fix-cycles 1\` on the re-run) — decideOutcome decides. action merge → it posted the comment: report posted.url (postError → re-run; never a file); send-findings → SendMessage the message to the same implementer (its worktree intact) and re-run every tier once — exactly one fix cycle; re-review → a reviewer-process failure (#3222), not a fix cycle: when the decision carries outsideContract (#3226), first report those paths and clear them — remove or restore what this run wrote; a path another session is editing is cleared by waiting for that session to settle it, never by deleting or reverting it — and never re-snapshot over them; then run \`${GATE_CLI} tree-snapshot --out .tmp-gate-{{n}}-tree-before.txt --clear .tmp-gate-{{n}}-tier3.json\` again, re-spawn the reviewer in slot {{slot}} with the same tier3.request.prompt, then re-run this outcome with the new sha and \`--review-retries 1\` (a second one halts, attributed to the reviewer); halt → print report: the --nonstop halt, worktree kept, #{{n}} never merged. After compaction add \`--resumed\`: the re-run IS the cycle.`,
});

/**
 * A step's instruction: its own `instruction`, or its template rendered with
 * its params (#3280). An unknown template renders to '' — never a guess.
 */
function instructionOf(step, templates = MEMBER_TEMPLATES) {
  if (!step) return '';
  if (typeof step.instruction === 'string') return step.instruction;
  if (!step.template) return '';
  const text = templates && templates[step.template];
  if (typeof text !== 'string') return '';
  const params = step.params || {};
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => (params[k] === undefined || params[k] === null ? '' : String(params[k])));
}

const titleOf = (members, n) => (members[n] && members[n].title) || `#${n}`;
const acsOf = (members, n) => (members[n] && Array.isArray(members[n].acceptanceCriteria) ? members[n].acceptanceCriteria : []);
const briefDataOf = (members, n) => {
  const m = members[n] || {};
  return {
    description: typeof m.description === 'string' ? m.description : '',
    proposedSolution: typeof m.proposedSolution === 'string' ? m.proposedSolution : '',
    declaredScope: Array.isArray(m.declaredScope) ? m.declaredScope : [],
  };
};

/**
 * The inline brief a member agent receives. It carries everything the member
 * needs and names what it must not do, because the parent owns those steps
 * and a member doing them would double a gate or an announcement.
 *
 * `root` is the parent checkout. Skills are gitignored there and never reach a
 * worktree, so a checklist command naming `.claude/skills/` relatively would
 * resolve to nothing in the member's cwd (#3162); with `root` it names the
 * parent's absolute path instead.
 *
 * @param {{issue: number, title?: string, acceptanceCriteria?: string[], tddChecklist?: object|null, root?: string}} input
 * @returns {string}
 */
function buildMemberBrief({ issue, title, acceptanceCriteria = [], tddChecklist, root, description = '', proposedSolution = '', declaredScope = [] } = {}) {
  const skillsRoot = root ? `${String(root).replace(/\\/g, '/').replace(/\/+$/, '')}/.claude/skills/` : null;
  const resolveSkills = (line) => (skillsRoot ? line.replace(/(^|[\s`'"(])\.claude\/skills\//g, `$1${skillsRoot}`) : line);
  const lines = [`## Work #${issue}: ${title || `#${issue}`}`, ''];

  // The approach and scope the issue was reviewed with (#3203). Without them a
  // member implements from AC text alone, and Tier 1 then enforces a declared
  // scope the member never saw. An absent section is said, never left blank.
  if (description) lines.push('### Description', description, '');
  lines.push('### Proposed solution', proposedSolution || 'No proposed solution was found in the issue body — derive the approach from the acceptance criteria and the code.', '');
  lines.push('### Declared scope');
  if (declaredScope.length > 0) {
    lines.push(...declaredScope.map((p) => `- \`${p}\``));
    // #3272: a path outside this list is reported, not refused — except one
    // another member of the group also changed, which halts its merge-back.
    lines.push('Change only these paths. A path outside them is reported in the merge comment; if another member of your group also changes it, the merge-back halts.');
  } else {
    lines.push('No declared scope (`Files to modify:`) was found in the issue body — keep the change to the files the acceptance criteria need.');
  }
  lines.push('');

  lines.push('### Acceptance criteria');
  if (acceptanceCriteria.length === 0) {
    lines.push('This issue has no acceptance criteria — work it as a single unit and say so in your report.');
  } else {
    lines.push(...acceptanceCriteria.map((ac) => `- [ ] ${ac}`));
  }
  lines.push('');

  lines.push('### TDD cycle (per AC)');
  if (tddChecklist && tddChecklist.red && tddChecklist.green && tddChecklist.refactor) {
    for (const phase of ['red', 'green', 'refactor']) {
      lines.push(`**${phase.toUpperCase()}**`);
      lines.push(...(tddChecklist[phase].required || []).map((r) => `- ${resolveSkills(r)}`));
      lines.push(`- Gate: ${tddChecklist[phase].gate}`);
    }
    if (skillsRoot) {
      lines.push(`Skills are not in this worktree: run any skill script at \`${skillsRoot}\` by that absolute path, with this worktree as cwd, so it reads your commits. `
        + 'If it is missing there too, report `Skipped coverage audit: tdd-refactor-coverage-audit skill not installed.` once, not per cycle.');
    }
  } else {
    lines.push('TDD checklist unavailable — use the inline cycle: RED (a failing test, run and seen to fail), '
      + 'GREEN (minimal code until it passes), REFACTOR (report the decision; tests still pass).');
  }
  lines.push('');

  lines.push('### Commit contract');
  lines.push('- Commit per AC: do not start the next AC until the previous deliverable is committed.');
  lines.push(`- Message: \`Refs #${issue} — <what this commit implements>\`. Never \`Fixes\`, \`Closes\` or \`Resolves\`.`);
  lines.push('- Work only in this worktree. Run the tests scoped to the files you touch.');
  lines.push('');

  lines.push('### Owned by the parent — do not do these');
  lines.push('- Do not push, merge or rebase.');
  lines.push('- Do not run `gh pmu move` or edit the issue body; the parent moves the issue and checks the boxes.');
  lines.push('- Do not send peer announcements.');
  lines.push('- Report: the commits you made, each AC with how it was verified, and anything left unfinished.');
  return lines.join('\n');
}

/**
 * Where a member's brief is written (#3280): `.tmp-brief-<N>.md` at the
 * project root, absolute, because the member reads it from its worktree.
 * The member's scratch-clear step removes it (#3360); the `.tmp-` prefix
 * leaves the startup stale-scratch sweep as the fallback for a halted run.
 */
function briefPathOf(root, issue) {
  return `${String(root).replace(/\\/g, '/').replace(/\/+$/, '')}/.tmp-brief-${issue}.md`;
}

/**
 * The Agent request the parent issues for one member.
 *
 * With `briefPath` the prompt only points at the brief file (#3280): the
 * member reads it itself, so the parent never copies or re-words the brief
 * and the preamble envelope never carries it. Without one — no root to place
 * a file under — the brief is inline, as before.
 *
 * @returns {{description: string, isolation: 'worktree', prompt: string, briefPath?: string}}
 */
function buildSpawnRequest({ issue, title, acceptanceCriteria, tddChecklist, root, description, proposedSolution, declaredScope, briefPath } = {}) {
  const base = { description: `Work #${issue}: ${title || `#${issue}`}`, isolation: 'worktree' };
  if (briefPath) {
    return {
      ...base,
      prompt: `You are implementing #${issue} in this worktree. Read your full brief first, from ${briefPath} by that absolute path, `
        + 'and follow it exactly: it carries the acceptance criteria, the declared scope, the TDD cycle, the commit contract and what the parent owns.',
      briefPath,
    };
  }
  return { ...base, prompt: buildMemberBrief({ issue, title, acceptanceCriteria, tddChecklist, root, description, proposedSolution, declaredScope }) };
}

/**
 * Every group member's brief, for the preamble to write (#3280). `buildRun`
 * stays pure; the caller owns the disk.
 *
 * @returns {Array<{issue: number, path: string, text: string}>}
 */
function memberBriefs({ plan = {}, members = {}, tddChecklist = null, root } = {}) {
  const groups = Array.isArray(plan.groups) ? plan.groups : [];
  return groups.flat().map((n) => ({
    issue: n,
    path: briefPathOf(root, n),
    text: buildMemberBrief({ issue: n, title: titleOf(members, n), acceptanceCriteria: acsOf(members, n), tddChecklist, root, ...briefDataOf(members, n) }),
  }));
}

/**
 * Top-level body headings that end a brief section (#3203). The acceptance-
 * criteria heading is recognized by checkbox-scan.js's shared list, never a
 * local pattern: that file is the one owner of the AC anchor (#2616).
 */
const SECTION_END = /^\*\*(?:Files to modify|Files|Testing considerations|Scope|In scope|Out of scope|Deployment Impact|Prior Art|Related[^*]*|Reviews|Version|Steps to Reproduce|Expected Behavior|Actual Behavior|Motivation|Description|Proposed (?:Fix|Solution)(?: \(Auto-Generated\))?|Doc judgment|External source):\*\*/i;
const isAcHeading = (line) => require('./checkbox-scan.js').ACCEPTANCE_CRITERIA_HEADINGS.some((f) => f.pattern.test(line.toLowerCase()));

/**
 * Markers a Proposed Solution carries inside itself (#3219): review Step 2a-ii
 * writes Approach, Files to modify, Implementation steps and Testing
 * considerations in that order, so these never end the section. The Files
 * block is skipped — it is the declared scope, rendered separately.
 */
const FILES_MARKER = /^\*\*(?:Files to modify|Files):\*\*/i;
const SOLUTION_INNER = /^\*\*(?:Files to modify|Files|Testing considerations):\*\*/i;

/**
 * A heading naming a body section, at any level — it ends a bold-marker
 * section (#3219). The acceptance-criteria heading is absent on purpose:
 * `isAcHeading` ends a section there through checkbox-scan.js's list (#2616).
 */
const SECTION_HEADING = /^#{1,6}\s+(?:Proposed (?:Fix|Solution)|Description|Scope|Files Changed|Prior Art|Motivation|Steps to Reproduce|Expected Behavior|Actual Behavior)\b/i;
const headingLevel = (line) => (/^(#{1,6})\s/.exec(line) || [])[1]?.length || 0;

/**
 * Whether `line` ends a section that began at `startLine` (#3219). A heading
 * start ends at a heading of the same or higher level, so its own `###`
 * sub-sections stay inside. A bold-marker start ends at a heading naming
 * another body section at any level (`#### Proposed Solution` included), or
 * at a heading as high as the body's own section level (`docLevel`).
 */
function endsSection(line, startLine, docLevel) {
  const level = headingLevel(line);
  if (!level) return false;
  const startLevel = headingLevel(startLine);
  if (startLevel) return level <= startLevel;
  return SECTION_HEADING.test(line) || level <= docLevel;
}

function sectionAfter(lines, isStart, { inner = null } = {}) {
  // Fence-aware (#3219): a heading or marker quoted inside a code fence neither
  // starts nor ends a section — checkbox-scan.js owns the fence rule.
  const fenced = require('./checkbox-scan.js').computeFenceMask(lines);
  const start = lines.findIndex((l, i) => !fenced[i] && isStart(l));
  if (start === -1) return '';
  // The body's section level: its first heading before the start, else `##`.
  const docLevel = lines.slice(0, start).map(headingLevel).find(Boolean) || 2;
  const first = lines[start].replace(/^\*\*[^*]+:\*\*\s*/, '').replace(/^#+\s+[^\n]*$/, '');
  const out = first.trim() ? [first.trim()] : [];
  let inFiles = false;
  let filesCollected = false;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (fenced[i]) {
      if (!inFiles) out.push(line);
      continue;
    }
    if (inner && inner.test(line)) {
      inFiles = FILES_MARKER.test(line);
      filesCollected = false;
      if (!inFiles) out.push(line);
      continue;
    }
    if (inFiles && (/^\*\*/.test(line) || headingLevel(line))) {
      // A bold line or heading ends the block (#3231), as in
      // extractFilesToModifySection; the line itself falls through to the
      // normal handling below (inner marker, section end, AC heading).
      inFiles = false;
    }
    if (inFiles) {
      // The Files block is one contiguous list or table, read as
      // extractFilesToModifySection reads it (#3228): a blank line continues
      // the block only while nothing is collected, and ends it after.
      if (line.trim()) filesCollected = true;
      else if (filesCollected) inFiles = false;
      continue;
    }
    if (SECTION_END.test(line) || isAcHeading(line) || endsSection(line, lines[start], docLevel)) break;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * The parts of an issue body a member brief carries (#3203): the description
 * and the Proposed Solution / Proposed Fix, sub-headings included. Each stops
 * at the next top-level heading, so review metadata (`**Reviews:**`, Prior Art,
 * Files Changed) and the `**Files to modify:**` block — rendered separately as
 * the declared scope — never reach it.
 *
 * @param {string} body
 * @returns {{description: string, proposedSolution: string}}
 */
function extractBriefSections(body) {
  const lines = String(body || '').replace(/\r\n/g, '\n').split('\n');
  return {
    description: sectionAfter(lines, (l) => /^\*\*Description:\*\*/i.test(l)),
    proposedSolution: sectionAfter(lines, (l) => /^\*\*Proposed (?:Fix|Solution)(?: \(Auto-Generated\))?:\*\*/i.test(l) || /^#{2,4}\s+Proposed (?:Fix|Solution)/i.test(l), { inner: SOLUTION_INNER }),
  };
}

/**
 * The parent's step sequence for one run.
 *
 * @param {{plan?: {groups?: number[][], tail?: Array<{number: number}>},
 *   members?: Object<number, {title?: string, acceptanceCriteria?: string[]}>,
 *   nonstop?: boolean, tddChecklist?: object|null, noReview?: boolean, root?: string|null,
 *   inlineBriefs?: boolean}} [input]
 *   `noReview` (`--no-review`) replaces each Tier 3 reviewer spawn with a
 *   reported skip; Tiers 1–2 still run. `root` is the parent checkout, passed
 *   into each member's brief so skill paths resolve outside the worktree (#3162);
 *   with a root each spawn request points at the member's brief file instead
 *   of carrying it (#3280), unless `inlineBriefs` says the files could not be
 *   written. `reviewStopped` and `notStarted` are the run-time decisions the
 *   `replan` CLI records; `stateFile` names that run-state file, so each
 *   review gate and spawn says how to re-plan after its decision (#3269).
 * @returns {{steps: object[], total: number, templates: Object<string, string>}}
 *   Each step has `kind` and `owner`; per-issue steps carry `issue` and,
 *   inside a group, `group` (1-based). Implementer and reviewer spawns carry
 *   the member's `slot` (1-based within its group).
 */
function buildRun({ plan = {}, members = {}, nonstop = false, tddChecklist = null, noReview = false, reviewStopped = [], notStarted = [], root = null, inlineBriefs = false, stateFile = null, ledgerFile = null } = {}) {
  const groups = Array.isArray(plan.groups) ? plan.groups : [];
  const tail = (Array.isArray(plan.tail) ? plan.tail : []).map((t) => t.number);
  // #3264: members a resumed run found already merged on the tracker.
  const finishOnly = Array.isArray(plan.finishOnly) ? plan.finishOnly : [];
  const total = groups.reduce((sum, g) => sum + g.length, 0) + tail.length + finishOnly.length;
  const stopped = new Set(Array.isArray(reviewStopped) ? reviewStopped : []);
  const failedCreation = new Map((Array.isArray(notStarted) ? notStarted : []).map((n) => [n.issue, n]));
  const steps = [];
  // The per-member gate templates ride with any run that has a group (#3280).
  const runTemplates = () => (groups.length > 0 ? { ...MEMBER_TEMPLATES } : {});
  // Members that reached in_review, in order; its length is the processed count.
  const swept = [];
  // Under --nonstop every halt after an earlier group's in_review moves names
  // those members as unswept (#3202 merge-back; #3223 outcome, reconcile,
  // post-merge) — a resumed run skips in_review members.
  const unsweptFlags = () => (nonstop && swept.length ? ` ${swept.map((n) => `--unswept ${n}`).join(' ')}` : '');

  // The Review-State Gate runs for every member (#3139); a member it stops
  // gets a `gate-stop` step and NOTHING after it — no Pre-Work gate, no event
  // 1, no spawn — so the ledger never holds an opener for work that never
  // began. Returns the members that proceed.
  // Both decisions are made at run time, after this plan was built (#3269):
  // with a run-state file each names the re-plan that drops the member's
  // later steps, and the parent continues from the steps it prints.
  const replan = (flag) => `\`${ORCH_CLI} replan --state ${stateFile} ${flag}\``;
  const reviewGate = (list, group) => list.filter((n) => {
    step('review-state-gate', n, {
      group,
      ...(stateFile ? { instruction: `If this gate stops #${n}, run ${replan(`--stopped ${n}`)} and continue from #${n}'s gate-stop step in the steps it prints.` } : {}),
    });
    if (!stopped.has(n)) return true;
    steps.push({ kind: 'gate-stop', step: 'gate-stop', owner: 'parent', issue: n, ...(group ? { group } : {}), reason: 'review-state-gate' });
    return false;
  });

  const step = (id, issue, extra = {}) => steps.push({
    kind: 'step', step: id, owner: MEMBER_STEPS.includes(id) && extra.inGroup ? 'member' : 'parent',
    issue, ...(extra.group ? { group: extra.group } : {}),
    // Which suites Step 3 may run (#3132): inside a worktree only parallel
    // suites, the exclusive ones deferred to the parent; the tail runs in
    // the root as sequential /work and defers nothing.
    ...(id === '3' ? { suiteScope: extra.inGroup ? 'worktree-parallel' : 'root' } : {}),
    ...(extra.instruction ? { instruction: extra.instruction } : {}),
    ...(extra.template ? { template: extra.template, params: extra.params } : {}),
  });
  // A member's post-work steps, split at the sweep (#3262): `part` 'pre' is
  // 4–4c (4d/4e commit, so they must precede the group's post-merge pass and
  // its 4f — #3284), 'post' is Step 5 onward; no part emits both, for the tail.
  const SWEEP_AT = POST_WORK.indexOf('4f');
  const finish = (n, group, part) => {
    // Inside a group Step 4f is the GROUP's, run once on the tracker after
    // reconciliation (#3139); a tail member keeps its own, as sequential /work.
    // Under --nonstop neither exists: one run-level sweep follows the last
    // member (#3202).
    const ids = part === 'pre' ? POST_WORK.slice(0, SWEEP_AT) : part === 'post' ? POST_WORK.slice(SWEEP_AT) : POST_WORK;
    for (const id of ids) {
      if (id === '4f' && (group || nonstop)) continue;
      step(id, n, { group });
    }
    if (part === 'pre') return;
    swept.push(n);
    steps.push({
      kind: 'report', step: 'report', owner: 'parent', issue: n, ...(group ? { group } : {}),
      text: `Sub-issue #${n}: ${titleOf(members, n)} → In Review (${swept.length}/${total} processed)`,
    });
  };

  // Finished before any group (#3264): no spawn, no gate, no merge-back —
  // their commits are on the tracker; only their remaining steps run.
  for (const n of finishOnly) {
    steps.push(resumeFinish(n));
    finish(n);
    if (!nonstop) steps.push({ kind: 'stop', step: '6', owner: 'parent', scope: 'member', issue: n });
  }

  for (let i = 0; i < groups.length; i++) {
    const planned = groups[i];
    const group = i + 1;
    steps.push({
      kind: 'group-start', owner: 'parent', group, members: [...planned],
      instruction: `Record the tracker tip before group ${group}: \`git rev-parse HEAD\` on the tracker branch. Every member's Tier 1 range (<tip>..<its wt/* branch>) and the post-merge pass's --base start there. After compaction it is the first parent of the group's first merge-back merge.`,
    });
    // A member whose worktree could not be created is NOT STARTED (#3140):
    // reported with the half-made path, no Pre-Work gate, no event 1, no
    // spawn. Default mode continues with the rest; --nonstop halts here and
    // names the tail that never started — the run's last step.
    const groupMembers = reviewGate(planned, group).filter((n) => {
      if (!failedCreation.has(n)) return true;
      const f = failedCreation.get(n);
      steps.push({ kind: 'not-started', step: 'not-started', owner: 'parent', issue: n, group, path: f.path || null, error: f.error || null });
      return false;
    });
    const failedHere = planned.filter((n) => failedCreation.has(n));
    if (nonstop && failedHere.length > 0) {
      const laterGroups = groups.slice(i + 1).flat();
      steps.push({
        kind: 'halt', step: 'halt', owner: 'parent', group, reason: 'worktree-creation-failed',
        notStarted: failedHere, neverStarted: laterGroups, tailNotStarted: [...tail], unswept: [...swept],
        report: haltReport({
          reason: 'worktree creation failed', processed: swept.length, total, unswept: swept,
          failed: { issue: failedHere[0], worktreePath: failedCreation.get(failedHere[0]).path || null, branch: null, files: [] },
          merged: [], unmerged: [...planned.filter((n) => !failedCreation.has(n)), ...laterGroups], tailNotStarted: tail, worktreesKept: [],
        }),
      });
      return { steps, total, templates: runTemplates() };
    }
    for (const n of groupMembers) for (const id of PRE_WORK.slice(1)) step(id, n, { group });
    groupMembers.forEach((n, j) => {
      steps.push({
        kind: 'spawn', step: 'spawn', owner: 'parent', issue: n, group, slot: j + 1,
        request: buildSpawnRequest({ issue: n, title: titleOf(members, n), acceptanceCriteria: acsOf(members, n), tddChecklist, root, ...briefDataOf(members, n), ...(root && !inlineBriefs ? { briefPath: briefPathOf(root, n) } : {}) }),
        ...(stateFile ? { onFailure: `If #${n}'s worktree cannot be created, run ${replan(`--not-started ${n}[=<half-made worktree path>]`)} and continue from #${n}'s not-started step in the steps it prints.` } : {}),
        ...(ledgerFile ? { onSpawned: spawnRecord(ledgerFile, n) } : {}),
      });
      step('3', n, { group, inGroup: true });
    });
    // Merge-Back Review Gate (#3130, merge-back-gate.js), per member before
    // the group merges. The reviewer takes the slot its implementer freed —
    // a group is at most --agents members, so at most --agents agents of any
    // kind run at once.
    // Every gate step names its merge-back-gate.js subcommand (#3158); the
    // per-member files are .tmp-gate-<n>-* so the steps hand results on and
    // the startup sweep reclaims them.
    // The per-member text is a run-level template (#3280): each step carries
    // its template id and params, rendered by instructionOf().
    groupMembers.forEach((n, j) => {
      step('gate-tier1', n, { group, template: 'gate-tier1', params: { n, tip: `<tip recorded at group ${group} start>` } });
      step('gate-tier2', n, { group, template: 'gate-tier2', params: { n } });
      steps.push(noReview
        ? { kind: 'review-skip', step: 'gate-tier3', owner: 'parent', issue: n, group, reason: 'no-review' }
        : {
          kind: 'review-spawn', step: 'gate-tier3', owner: 'parent', issue: n, group, slot: j + 1,
          template: 'gate-tier3', params: { n, tip: `<tip recorded at group ${group} start>`, slot: j + 1 },
        });
      // The outcome (#3141): merge with a findings comment, or exactly one
      // fix cycle back to the same implementer, or a halt.
      steps.push({
        kind: 'gate-outcome', step: 'gate-outcome', owner: 'parent', issue: n, group,
        template: 'gate-outcome',
        params: { n, slot: j + 1, siblings: groupMembers.filter((m) => m !== n).map((m) => ` --sibling ${m}`).join(''), unswept: unsweptFlags() },
      });
    });
    steps.push({
      kind: 'merge-back', step: 'merge-back', owner: 'parent', group, order: [...groupMembers],
      instruction: `On the tracker branch, run \`${GATE_CLI} merge-back --tracker <tracker branch> ${groupMembers.map((n) => `--member ${n}:<#${n}'s wt/* branch>:<#${n}'s worktree path>`).join(' ')}${unsweptFlags()}\` — members merge --no-ff in that order (${groupMembers.map((n) => `#${n}`).join(', ')}), each onto the current tip. Exit 1 → print report: a residual conflict, or members sharing a path outside their declared scope (check undeclared-overlap, before any merge — #3272), halts the run, nothing later merges, every worktree is kept.`,
    });
    steps.push({
      kind: 'teardown', step: 'teardown', owner: 'parent', group, members: [...groupMembers],
      instruction: `Tear down group ${group}'s worktrees with \`${TEARDOWN_CLI} --root <project-root> ${groupMembers.map((n) => `--worktree <#${n}'s worktree path>`).join(' ')}\` — never \`git worktree remove\` or rm -rf, which delete through the worktree's links. Each result names its branch: once a result is removed, delete that merged branch with \`git branch -d <branch>\` (it refuses an unmerged branch — leave that one and report it). A kept, halted or refused result is reported by path and its worktree left as it is.`,
    });
    // Exclusive suites and Step 4f run on the tracker branch only once no
    // worktree of the group exists (#3132): worktrees sit under the project
    // root, so a run from the root would collect their files, and the
    // framework names no runner it could pass an ignore flag to. Sequencing
    // is the mechanism. A directory still present is reported, never fatal.
    steps.push({
      kind: 'leftover-check', step: 'leftover-check', owner: 'parent', group,
      instruction: 'Run leftoverWorktrees({root}) (test-runner.js). Report each .tmp-wt-* path as possibly collected by the project\'s suites and continue; under --nonstop repeat the report in the final summary.',
    });
    // Reconciliation (#3139): after merge-back the parent regenerates the
    // declared derived artifacts over the group's changed paths, invokes
    // every generator the runner had to defer to the session, and only then
    // runs Step 4f — once, on the tracker, never per worktree. The audits
    // that follow read a concurrent run as they read a sequential one
    // because this is where the group becomes one tree again.
    steps.push({
      kind: 'reconcile', step: 'reconcile', owner: 'parent', group, members: [...groupMembers],
      instruction: `Run runRegeneration({cwd, changedPaths}) (regeneration-runner.js) with changedPaths = the union of every member's changed files; a failed generator or verification halts under the --nonstop contract${nonstop && swept.length ? `, and the halt report lists Not swept: ${list(swept)} (the end-of-run Step 4f never ran for them) — run the declared verification set over their changes before /done` : ''}. Carry its changedPaths into the deferred-suites union and the post-merge review range.`,
    });
    steps.push({
      kind: 'deferred-skills', step: 'deferred-skills', owner: 'parent', group,
      instruction: 'For every deferred-to-session entry the runner returned (deferredSkillInvocations in regeneration-runner.js), invoke that generator through the Skill tool in the parent before the group continues — a script cannot run a Skill-invoked generator. Then run regenerateAfterSkills({cwd, changedPaths}) over the paths they rewrote (#3272): it rebuilds what reads them, e.g. the extension registry, without deferring the skill again. Carry both sets of paths forward.',
    });
    steps.push(regeneratedCommit({ group }, stateFile));
    // After reconciliation (#3272): the exclusive suites test the reconciled
    // tree, not one side's copy of a derived artifact.
    steps.push({
      kind: 'deferred-suites', step: 'deferred-suites', owner: 'parent', group, serial: true,
      members: [...groupMembers], scope: 'group-union', deferredReasons: ['exclusive', 'cannot-narrow'],
      instruction: 'Run deferredInvocations({suites, changedFiles, cannotNarrow}) (test-runner.js) with changedFiles = the union of every member\'s changed files plus the regenerated paths from the reconcile and deferred-skills steps, and cannotNarrow = every suiteId a member\'s Tier 1 deferredSuites lists with reason cannot-narrow (#3159 — this step is the only place those run). Run each returned run once, serially, on the tracker branch: the exclusive suites, then the cannot-narrow ones. Name manualOnly, invalid, unmatchedExclusive, unmatchedCannotNarrow and every warning.',
    });
    // Every member's 4–4c first (#3262, #3284): their 4d/4e commits land on
    // the tracker before the post-merge pass, so the pass reviews them and the
    // group 4f (default mode) sweeps them. Step 5 onward follows both.
    for (const n of groupMembers) finish(n, group, 'pre');
    // Post-merge pass (#3141): Tiers 1–2 once more, in the parent, over the
    // members' diffs ∪ the runner's regenerated paths ∪ the members' 4d/4e
    // commits — a regenerated file no member's diff named is reviewed here —
    // before the group is reported.
    steps.push({
      kind: 'post-merge-pass', step: 'post-merge-pass', owner: 'parent', group, members: [...groupMembers],
      instruction: `Run \`${GATE_CLI} group-tier1${stateFile ? ` --state ${stateFile}` : ''} --base <tip recorded at group ${group} start> ${groupMembers.map((n) => `--member ${n}`).join(' ')} --group ${group}${unsweptFlags()} --epic <root> [--own <the regenerated-commit sha> --regenerated <path> for each path it committed: the reconcile, deferred-skills and regenerateAfterSkills paths] [--own <sha>=<N> per 4d/4e commit]\` — Tiers 1–2 once more, in the parent: this is Tier 1 over the tracker range, skipping the merge-back merges. Then read every path in postMergeSet({memberDiffs, regenerated}) yourself (Tier 2; a regenerated path no member's diff named is read too). outcome.action halt, or a failed read, halts on the second-review-fail terms; add --kept-worktree <path> for each worktree the teardown step kept, so the report names only those.`,
    });
    if (!nonstop) {
      steps.push({ kind: 'step', step: '4f', owner: 'parent', group, cwd: 'tracker', members: [...groupMembers] });
    }
    for (const n of groupMembers) finish(n, group, 'post');
    // #3360: every sibling outcome ran before the group's merge-back, so each
    // member's four scratch files go once the group is reported. Default mode
    // only: under --nonstop the preamble runs groups on the rolling schedule
    // (nextSteps), which emits its own cleanup.
    if (!nonstop) {
      for (const n of groupMembers) steps.push(memberClear(n, { ledgerFile, where: { group } }));
      steps.push({ kind: 'stop', step: '6', owner: 'parent', scope: 'group', group });
    }
  }

  for (const n of reviewGate(tail)) {
    for (const id of PRE_WORK.slice(1)) step(id, n);
    step('3', n);
    finish(n);
    if (!nonstop) steps.push({ kind: 'stop', step: '6', owner: 'parent', scope: 'member', issue: n });
  }

  // --nonstop: the run's only full sweep, over every processed member's
  // changed files, after the last member and before the summary (#3202). A
  // failure halts the run with every processed member left in_review.
  if (nonstop && swept.length > 0) {
    steps.push({ kind: 'step', step: '4f', owner: 'parent', scope: 'run', cwd: 'tracker', members: [...swept] });
  }
  if (nonstop && total > 0) {
    steps.push({ kind: 'summary', step: '6', owner: 'parent', processed: swept.length, repeats: groups.length > 0 ? ['leftover-worktrees'] : [] });
  }
  return { steps, total, templates: runTemplates() };
}

/**
 * The --nonstop rolling schedule (#3274): which steps run next, given what
 * has happened so far. Fixed groups wait for their slowest member and the
 * whole gate tail before the next group starts; here a member starts as soon
 * as a slot frees and every member it depends on has merged back.
 *
 * The parent calls this after each recorded event and executes what it
 * returns. Run state (the parent records `merged` and `passed`; the rest is
 * carried over from the previous call's `state`):
 *   layers, dependsOn  — the plan's layer queues and in-plan dependencies;
 *   maxAgents          — slots; a member holds its slot from spawn until its
 *                        merge-back (its reviewer and fix cycle reuse it);
 *   started, slotOf    — members whose start sequence was emitted, and slots;
 *   merged             — members whose merge-back the parent recorded;
 *   batched, batches   — merged members already handed a post-merge batch;
 *   passed             — members whose batch the parent finished (in_review);
 *   stopped, notStarted — started members the Review-State Gate stopped, or
 *                        whose worktree could not be created ({issue, path,
 *                        error}); either halts the run (#3269);
 *   stateFile          — where the CLI keeps this state; named in the stop
 *                        and failed-creation instructions;
 *   ended              — the end-of-run steps (or a halt) were emitted.
 * A batch is every merged member not yet batched: teardown, reconcile and
 * the post-merge pass over that batch's own range, then each member's Steps
 * 4–5. The exclusive and cannot-narrow suites wait for the run's end, after
 * the last teardown, because a running member's worktree always exists
 * mid-run (#3132). Pure: the input is never mutated.
 *
 * @returns {{start: number[], batch: {id: number, members: number[]}|null,
 *   steps: object[], done: boolean, state: object}}
 */
function nextSteps(runState = {}) {
  const {
    layers = [], dependsOn = {}, maxAgents = 3, members = {}, tddChecklist = null, root = null, noReview = false,
    merged = [], passed: recordedPassed = [],
  } = runState;
  let passed = recordedPassed;
  const started = [...(runState.started || [])];
  const batched = [...(runState.batched || [])];
  const slotOf = { ...(runState.slotOf || {}) };
  let batches = runState.batches || 0;
  const order = layers.flat();
  // #3301: finishOnly members are part of the run and count as passed once
  // finished, so T counts them too — buildRun's total already does.
  const finishOnlyAll = Array.isArray(runState.finishOnly) ? runState.finishOnly : [];
  const total = new Set([...order, ...finishOnlyAll]).size;
  const mergedSet = new Set(merged);
  const steps = [];
  const unswept = passed.length ? ` ${passed.map((n) => `--unswept ${n}`).join(' ')}` : '';

  if (runState.ended) return { start: [], batch: null, steps, done: true, state: { ...runState } };

  // A started member the Review-State Gate stopped, or whose worktree could
  // not be created (#3269), halts the run under the --nonstop contract: none
  // of its later steps runs, nothing new starts, every worktree is kept.
  const stoppedSet = new Set(runState.stopped || []);
  const failedCreation = new Map((runState.notStarted || []).map((f) => [f.issue, f]));
  const halting = started.find((n) => !mergedSet.has(n) && (stoppedSet.has(n) || failedCreation.has(n)));
  if (halting !== undefined) {
    const failed = failedCreation.get(halting);
    const neverStarted = order.filter((n) => !started.includes(n));
    const cause = failed ? `worktree creation failed for #${halting}` : `#${halting} stopped by the review-state-gate`;
    steps.push({
      kind: 'halt', step: 'halt', owner: 'parent', issue: halting, reason: failed ? 'worktree-creation-failed' : 'review-state-gate',
      neverStarted, tailNotStarted: [...(runState.tail || [])], unswept: [...passed],
      report: haltReport({
        reason: `${cause}; never started: ${list(neverStarted)}`, processed: passed.length, total, unswept: passed,
        failed: { issue: halting, worktreePath: (failed && failed.path) || null, branch: null, files: [] },
        merged: [...merged], unmerged: started.filter((n) => !mergedSet.has(n) && n !== halting),
        tailNotStarted: runState.tail || [], worktreesKept: [],
      }),
    });
    return { start: [], batch: null, steps, done: true, state: { ...runState, ended: true, halted: true } };
  }

  // #3264: a resumed run's already-merged members are finished first, once —
  // never started, never spawned — and count as passed from then on.
  const finishing = !runState.resumeFinished && Array.isArray(runState.finishOnly) ? runState.finishOnly : [];
  for (const n of finishing) {
    steps.push(resumeFinish(n));
    for (const sid of POST_WORK) if (sid !== '4f') steps.push({ kind: 'step', step: sid, owner: 'parent', issue: n });
    steps.push({ kind: 'report', step: 'report', owner: 'parent', issue: n, text: `Sub-issue #${n}: ${titleOf(members, n)} → In Review (finished on resume)` });
  }
  if (finishing.length) passed = [...passed, ...finishing];

  // #3360: a merged member's tier1 file held for the members running beside
  // it is removed once they have all merged — each ran its outcome first.
  const ledgerFile = runState.ledgerFile || null;
  const pendingTier1 = { ...(runState.pendingTier1 || {}) };
  for (const [k, holders] of Object.entries(pendingTier1)) {
    if (!holders.every((m) => mergedSet.has(m) || passed.includes(m))) continue;
    steps.push(memberClear(Number(k), { mode: 'tier1-only', ledgerFile }));
    delete pendingTier1[k];
  }

  // A batch: every merged member not yet handed one, in merge order.
  let batch = null;
  const fresh = merged.filter((n) => !batched.includes(n));
  if (fresh.length > 0) {
    batches += 1;
    batch = { id: batches, members: fresh };
    batched.push(...fresh);
    for (const n of fresh) delete slotOf[n];
    const id = batches;
    // Members an earlier batch already passed: inside this range, never this batch's to attribute.
    const priorFlags = (runState.batched || []).map((n) => ` --prior ${n}`).join('');
    steps.push({
      kind: 'teardown', step: 'teardown', owner: 'parent', batch: id, members: [...fresh],
      instruction: `Tear down batch ${id}'s worktrees with \`${TEARDOWN_CLI} --root <project-root> ${fresh.map((n) => `--worktree <#${n}'s worktree path>`).join(' ')}\` — never \`git worktree remove\` or rm -rf, which delete through the worktree's links. Each result names its branch: once a result is removed, delete that merged branch with \`git branch -d <branch>\` (it refuses an unmerged branch — leave that one and report it). A kept, halted or refused result is reported by path and its worktree left as it is.`,
    });
    steps.push({
      kind: 'leftover-check', step: 'leftover-check', owner: 'parent', batch: id,
      instruction: 'Run leftoverWorktrees({root}) (test-runner.js). Report each .tmp-wt-* path as possibly collected by the project\'s suites and continue — under the rolling schedule the running members\' worktrees are expected here; repeat the report in the final summary.',
    });
    steps.push({
      kind: 'reconcile', step: 'reconcile', owner: 'parent', batch: id, members: [...fresh],
      instruction: `Run runRegeneration({cwd, changedPaths}) (regeneration-runner.js) with changedPaths = the union of batch ${id}'s members' changed files; a failed generator or verification halts under the --nonstop contract${passed.length ? `, and the halt report lists Not swept: ${list(passed)} (the end-of-run Step 4f never ran for them) — run the declared verification set over their changes before /done` : ''}. Carry its changedPaths into the post-merge review range and the end-of-run deferred suites.`,
    });
    steps.push({
      kind: 'deferred-skills', step: 'deferred-skills', owner: 'parent', batch: id,
      instruction: 'For every deferred-to-session entry the runner returned (deferredSkillInvocations in regeneration-runner.js), invoke that generator through the Skill tool in the parent before the batch continues — a script cannot run a Skill-invoked generator. Then run regenerateAfterSkills({cwd, changedPaths}) over the paths they rewrote (#3272): it rebuilds what reads them, e.g. the extension registry, without deferring the skill again. Carry both sets of paths forward.',
    });
    steps.push(regeneratedCommit({ batch: id }, runState.stateFile || null));
    // #3284: each member's 4–4c before the pass, so its 4d/4e commits are in
    // the range the pass reviews; Step 5 onward and the report follow it.
    const PRE = POST_WORK.slice(0, POST_WORK.indexOf('4f'));
    const POST = POST_WORK.slice(POST_WORK.indexOf('4f') + 1);
    for (const n of fresh) for (const sid of PRE) steps.push({ kind: 'step', step: sid, owner: 'parent', issue: n, batch: id });
    steps.push({
      kind: 'post-merge-pass', step: 'post-merge-pass', owner: 'parent', batch: id, members: [...fresh],
      instruction: `Run \`${GATE_CLI} batch-range ${fresh.map((n) => `--member ${n}`).join(' ')} --head <batch ${id}'s last commit: its last merge-back, or the regenerated-commit commit after it>\` with \`--base-of <N>=<tip>\` for every member started so far, in the order the tips were recorded; its base is the earliest worktree-creation tip among ${list(fresh)}. Then run \`${GATE_CLI} group-tier1${runState.stateFile ? ` --state ${runState.stateFile}` : ''} --base <earliest worktree-creation tip among ${list(fresh)}> --head <batch ${id}'s last commit> ${fresh.map((n) => `--member ${n}`).join(' ')} --group ${id}${priorFlags}${unswept} --epic <root> [--own <the regenerated-commit sha> --regenerated <path> for each path it committed: the reconcile, deferred-skills and regenerateAfterSkills paths] [--own <sha>=<N> per 4d/4e commit]\` — Tiers 1–2 over this batch's own range: a later commit is outside it, and an earlier batch's members (--prior) are skipped, never failed. Then read every path in postMergeSet({memberDiffs, regenerated}) yourself (Tier 2). outcome.action halt, or a failed read, halts on the second-review-fail terms; add --kept-worktree <path> for each worktree the teardown step kept, so the report names only those. Record batch ${id}'s members as passed once their reports below are printed.`,
    });
    fresh.forEach((n, i) => {
      for (const sid of POST) steps.push({ kind: 'step', step: sid, owner: 'parent', issue: n, batch: id });
      steps.push({
        kind: 'report', step: 'report', owner: 'parent', issue: n, batch: id,
        text: `Sub-issue #${n}: ${titleOf(members, n)} → In Review (${passed.length + i + 1}/${total} processed)`,
      });
    });
    // #3360: after the reports, each member's scratch files. A member still
    // running may name one of these as --sibling, so its tier1 file waits.
    const stillRunning = started.filter((m) => !mergedSet.has(m) && !passed.includes(m));
    for (const n of fresh) {
      if (stillRunning.length) pendingTier1[n] = [...stillRunning];
      steps.push(memberClear(n, { mode: stillRunning.length ? 'keep-tier1' : 'all', ledgerFile, holders: stillRunning, where: { batch: id } }));
    }
  }

  // Start members while a slot is free and their dependencies are done: merged
  // back, or — for a member worked inline (#3342) — passed.
  const passedSet = new Set(passed);
  const doneDep = (d) => mergedSet.has(d) || passedSet.has(d);
  const running = started.filter((n) => !mergedSet.has(n) && !passedSet.has(n));
  const runnable = order.filter((n) => !started.includes(n) && (dependsOn[n] || []).every(doneDep));
  const start = [];
  const used = new Set(running.map((n) => slotOf[n]));
  for (const n of order) {
    if (running.length + start.length >= maxAgents) break;
    if (started.includes(n)) continue;
    if (!(dependsOn[n] || []).every(doneDep)) continue;
    let slot = 1;
    while (used.has(slot)) slot += 1;
    used.add(slot);
    slotOf[n] = slot;
    start.push(n);
  }
  // #3342: a member runnable alone, with nothing running, buys no parallelism
  // from a worktree — it is worked inline in the tracker checkout instead, and
  // recorded passed (never merged) once its report is printed.
  const inline = [...(runState.inline || [])];
  const lone = start.length === 1 && running.length === 0 && runnable.length === 1;
  for (const n of start) {
    started.push(n);
    const slot = slotOf[n];
    const tip = `<tip recorded when #${n}'s worktree was created>`;
    const report = (flag) => `\`${ORCH_CLI} next-steps --state ${runState.stateFile} ${flag}\``;
    for (const sid of PRE_WORK) {
      steps.push({
        kind: 'step', step: sid, owner: 'parent', issue: n,
        ...(sid === 'review-state-gate' && runState.stateFile ? { instruction: `If this gate stops #${n}, run ${report(`--stopped ${n}`)} — it halts the run — and execute the steps it prints.` } : {}),
      });
    }
    if (lone) {
      inline.push(n);
      delete slotOf[n];
      steps.push({
        kind: 'inline', step: 'inline', owner: 'parent', issue: n,
        instruction: `#${n} is the only runnable member and none is running: work it inline in the tracker checkout as standard /work Steps 3–5 — no worktree, no member agent, no merge-back, and so no Merge-Back Review Gate; the Sub-Agent Review Gate is N/A on this direct-work path. Every other gate applies unchanged.`,
      });
      steps.push({ kind: 'step', step: '3', owner: 'parent', issue: n, suiteScope: 'root' });
      for (const sid of POST_WORK) if (sid !== '4f') steps.push({ kind: 'step', step: sid, owner: 'parent', issue: n });
      // #3360: no gate files, but the preamble wrote its brief. Before the
      // report, whose instruction moves the run on.
      steps.push(memberClear(n, { ledgerFile }));
      steps.push({
        kind: 'report', step: 'report', owner: 'parent', issue: n,
        text: `Sub-issue #${n}: ${titleOf(members, n)} → In Review (${passed.length + 1}/${total} processed)`,
        instruction: `Once this report is printed, run ${runState.stateFile ? report(`--passed ${n}`) : `next-steps --passed ${n}`} and execute what it prints.`,
      });
      continue;
    }
    steps.push({
      kind: 'spawn', step: 'spawn', owner: 'parent', issue: n, slot,
      request: buildSpawnRequest({ issue: n, title: titleOf(members, n), acceptanceCriteria: acsOf(members, n), tddChecklist, root, ...briefDataOf(members, n), ...(root && !runState.inlineBriefs ? { briefPath: briefPathOf(root, n) } : {}) }),
      ...(runState.ledgerFile ? { onSpawned: spawnRecord(runState.ledgerFile, n) } : {}),
      ...(runState.stateFile ? { onFailure: `If #${n}'s worktree cannot be created, run ${report(`--not-started ${n}[=<half-made worktree path>]`)} — it halts the run — and execute the steps it prints.` } : {}),
    });
    steps.push({ kind: 'step', step: '3', owner: 'member', issue: n, suiteScope: 'worktree-parallel' });
    steps.push({ kind: 'step', step: 'gate-tier1', owner: 'parent', issue: n, template: 'gate-tier1', params: { n, tip } });
    steps.push({ kind: 'step', step: 'gate-tier2', owner: 'parent', issue: n, template: 'gate-tier2', params: { n } });
    steps.push(noReview
      ? { kind: 'review-skip', step: 'gate-tier3', owner: 'parent', issue: n, reason: 'no-review' }
      : { kind: 'review-spawn', step: 'gate-tier3', owner: 'parent', issue: n, slot, template: 'gate-tier3', params: { n, tip, slot } });
    steps.push({
      kind: 'gate-outcome', step: 'gate-outcome', owner: 'parent', issue: n, template: 'gate-outcome',
      params: { n, slot, siblings: ' --sibling <each other member running when the snapshot was taken>', unswept },
    });
    steps.push({
      kind: 'merge-back', step: 'merge-back', owner: 'parent', issue: n, order: [n],
      instruction: `When #${n}'s outcome is merge: on the tracker branch, run \`${GATE_CLI} merge-back --tracker <tracker branch> --member ${n}:<#${n}'s wt/* branch>:<#${n}'s worktree path>${unswept}\` onto the current tip. Exit 1 → print report: a residual conflict halts the run, nothing later merges, every worktree is kept. Otherwise record #${n} as merged and call nextSteps again — its slot is free.`,
    });
  }

  // The run ends once every member has passed its batch: the sequential tail,
  // worked in the root as standard /work, then the end-of-run steps.
  let ended = false;
  const tail = Array.isArray(runState.tail) ? runState.tail : [];
  const done = total + tail.length > 0 && order.every((n) => passed.includes(n));
  if (done && !batch && start.length === 0) {
    ended = true;
    tail.forEach((n, i) => {
      for (const sid of PRE_WORK) steps.push({ kind: 'step', step: sid, owner: 'parent', issue: n });
      steps.push({ kind: 'step', step: '3', owner: 'parent', issue: n, suiteScope: 'root' });
      for (const sid of POST_WORK) if (sid !== '4f') steps.push({ kind: 'step', step: sid, owner: 'parent', issue: n });
      steps.push({
        kind: 'report', step: 'report', owner: 'parent', issue: n,
        text: `Sub-issue #${n}: ${titleOf(members, n)} → In Review (${passed.length + i + 1}/${total + tail.length} processed)`,
      });
    });
    steps.push({
      kind: 'deferred-suites', step: 'deferred-suites', owner: 'parent', serial: true,
      members: [...order], scope: 'run-union', deferredReasons: ['exclusive', 'cannot-narrow'],
      instruction: 'Now that no member worktree exists, run deferredInvocations({suites, changedFiles, cannotNarrow}) (test-runner.js) with changedFiles = the union of every member\'s changed files plus every reconcile step\'s regenerated paths, and cannotNarrow = every suiteId a member\'s Tier 1 deferredSuites lists with reason cannot-narrow (#3159). Run each returned run once, serially, on the tracker branch: the exclusive suites, then the cannot-narrow ones. Name manualOnly, invalid, unmatchedExclusive, unmatchedCannotNarrow and every warning.',
    });
    steps.push({ kind: 'step', step: '4f', owner: 'parent', scope: 'run', cwd: 'tracker', members: [...passed, ...tail] });
    steps.push({ kind: 'summary', step: '6', owner: 'parent', processed: passed.length + tail.length, repeats: ['leftover-worktrees'] });
    const runFiles = [runState.stateFile, ledgerFile].filter(Boolean);
    if (runFiles.length) steps.push(runClear(runFiles));
  }

  // #3349: keep every set handed out, so an output the parent lost can be
  // printed again verbatim. A rebuild cannot reproduce it: the state holds no
  // per-batch membership or `passed` snapshot.
  const issued = { ...(runState.issued || {}) };
  if (batch) issued[`batch:${batch.id}`] = { batch, steps: steps.filter((s) => s.batch === batch.id) };
  for (const n of start) issued[`start:${n}`] = { start: [n], steps: steps.filter((s) => s.issue === n && s.batch === undefined) };

  return {
    start, batch, steps, done: ended,
    state: { ...runState, started, slotOf, batched, batches, passed, issued, inline, pendingTier1, ...(finishing.length ? { resumeFinished: true } : {}), ...(ended ? { ended: true } : {}) },
  };
}

const list = (nums) => (nums.length ? nums.map((n) => `#${n}`).join(', ') : 'none');

/**
 * A member's scratch-file cleanup step (#3360), once it is merged and In
 * review: `merge-back-gate.js clear-member`, the guarded remover. `mode`
 * 'all' removes its three gate files and its brief; 'keep-tier1' keeps the
 * tier1 file for the running members in `holders`, whose outcome may name
 * this member as --sibling and read that file for its scope; 'tier1-only'
 * removes it once they have all merged. `--ledger` lets clear-member keep all
 * four when teardown kept the member's worktree.
 */
function memberClear(n, { mode = 'all', ledgerFile = null, holders = [], where = {} } = {}) {
  const args = ['clear-member', '--issue', String(n), ...(ledgerFile ? ['--ledger', ledgerFile] : []),
    ...(mode === 'keep-tier1' ? ['--keep-tier1'] : mode === 'tier1-only' ? ['--tier1-only'] : [])];
  const why = mode === 'keep-tier1'
    ? `it keeps .tmp-gate-${n}-tier1.json, since ${list(holders)} ran beside #${n} and an outcome naming it as --sibling reads that file; a later step removes it once they have merged`
    : mode === 'tier1-only'
      ? `every member that ran beside #${n} has merged, so no outcome reads its tier1 file any more`
      : `#${n} is merged and In review, so its gate files and brief have no reader left`;
  return {
    kind: 'scratch-clear', step: 'scratch-clear', owner: 'parent', issue: n, ...where, args,
    instruction: `Run \`${GATE_CLI} ${args.join(' ')}\` — ${why}. It keeps every file while the ledger's worktree for #${n} still exists (teardown kept it), so a resumed run finds them. Never remove them by hand.`,
  };
}

/** The run's last cleanup (#3360): the rolling state and ledger, after the run-level sweep passed. */
function runClear(files) {
  const args = ['clear-run', ...files.flatMap((f) => ['--file', f])];
  return {
    kind: 'scratch-clear', step: 'scratch-clear', owner: 'parent', scope: 'run', args,
    instruction: `Only once the run-level Step 4f passed and the summary is printed: run \`${GATE_CLI} ${args.join(' ')}\` — every member merged, so the run state and ledger have no reader left. A failed sweep halts the run and keeps both for --resumed.`,
  };
}

/** A resumed run's already-merged member (#3264): finished, never re-spawned. */
function resumeFinish(n) {
  return {
    kind: 'resume-finish', step: 'resume-finish', owner: 'parent', issue: n,
    instruction: `#${n}'s commits are already merged on the tracker (a resumed run), so it is not spawned again: run its remaining steps below over the commits already there.`,
  };
}

/**
 * The commit that lands a group's or batch's generated outputs (#3272).
 * Uncommitted they failed group-tier1's uncommitted check; committed under a
 * member they failed its scope; a branch tracker has no epic. So they are
 * committed once, naming the run's root issue — the epic, or the branch
 * tracker's own issue — and passed to group-tier1 as --epic <root> with each
 * path as --regenerated, which accepts exactly that commit.
 *
 * @param {{group?: number, batch?: number}} where
 * @returns {object} A parent step
 */
function regeneratedCommit(where, stateFile = null) {
  const label = where.group !== undefined ? `group ${where.group}` : `batch ${where.batch}`;
  const flag = where.group !== undefined ? `--group ${where.group}` : `--batch ${where.batch}`;
  // #3286: recorded in the run state, the commit reaches group-tier1's
  // regenerated-paths check without the parent typing its sha as --own.
  const record = stateFile
    ? ` Then, with the commit at HEAD, run \`${ORCH_CLI} record-regenerated --state ${stateFile} ${flag} --path <path> for each path it committed\` — the post-merge pass reads the sha from there.`
    : '';
  return {
    kind: 'regenerated-commit', step: 'regenerated-commit', owner: 'parent', ...where,
    instruction: `Commit the paths the reconcile, deferred-skills and regenerateAfterSkills steps rewrote, and only those, as \`Refs #<root> — regenerate derived artifacts (${label})\`; <root> is the epic, or the branch tracker's own issue. Nothing rewritten → no commit.${record}`,
  };
}

/**
 * Record a regenerated-output commit in the run state (#3286). Pure: returns
 * a new state with `regeneratedCommits` holding `{sha, paths, group|batch}`,
 * an earlier entry for the same sha replaced in place.
 */
function recordRegenerated(state, { sha, paths = [], group, batch } = {}) {
  const entry = { sha, paths: [...paths], ...(group !== undefined ? { group } : { batch }) };
  const list = [...((state && state.regeneratedCommits) || [])];
  const at = list.findIndex((e) => e.sha === sha);
  if (at === -1) list.push(entry); else list[at] = entry;
  return { ...(state || {}), regeneratedCommits: list };
}

/**
 * The `--nonstop` halt report for a concurrent run (#3140): what failed,
 * what was kept, what never merged, what never started, and how to resume.
 * Same contract as the sequential halt — sub-issue, completed count, resume
 * instructions — with the worktrees added, because they are the state.
 */
function unsweptLine(unswept) {
  // --nonstop sweeps once after the last member (#3202), so a halt leaves the
  // processed members in_review and unswept; a resumed run skips them. One
  // wording for every halt that can follow them (#3223).
  return `  Not swept (the end-of-run Step 4f never ran): ${list(unswept)} — run the declared verification set over their changes before /done; a resumed run skips in_review members.`;
}

function haltReport({ epic, reason, failed, merged = [], unmerged = [], tailNotStarted = [], processed = 0, total = 0, worktreesKept = [], unswept = [] } = {}) {
  const lines = [`Halted: ${reason}`];
  if (failed) {
    const where = failed.worktreePath ? ` — worktree kept: ${failed.worktreePath}${failed.branch ? ` (${failed.branch})` : ''}` : '';
    lines.push(`  Failed member: #${failed.issue}${where}`);
    if (failed.files && failed.files.length) {
      lines.push(failed.refused ? '  Local changes in the way:' : '  Conflicting files:');
      for (const f of failed.files) lines.push(`    - ${f}`);
    }
    // git's own account, verbatim (#3263): the only record of what it saw.
    const stderr = String(failed.stderr || '').trim();
    if (stderr) {
      lines.push('  git said:');
      for (const l of stderr.split('\n')) lines.push(`    ${l.trimEnd()}`);
    }
  }
  lines.push(`  Merged before the halt: ${list(merged)}`);
  lines.push(`  Not merged: ${list(unmerged)}`);
  lines.push(`  Never started (tail): ${list(tailNotStarted)}`);
  if (worktreesKept.length) {
    lines.push('  Worktrees kept for inspection:');
    for (const w of worktreesKept) lines.push(`    - ${w.worktreePath}${w.branch ? ` (${w.branch})` : ''}`);
  }
  if (unswept.length) lines.push(unsweptLine(unswept));
  lines.push(`  ${processed} of ${total} processed.`);
  lines.push(`  Resume: inspect with git worktree list, resolve in the kept worktree, then /work ${epic || '<epic>'} --nonstop --concurrent; nothing was merged past the halt.`);
  return lines.join('\n');
}

/**
 * Merge each member's worktree branch onto the tracker, in Processing Order,
 * each onto the tracker's CURRENT tip (#3140). The tip is read immediately
 * before every merge, never cached: a peer may have pushed during the group,
 * and a disjoint merge onto the newer tip is the normal case. A merge git
 * cannot complete — a residual conflict once the json-merge driver and
 * reconciliation have had their say, with a member's own commits or a
 * peer's — is aborted so the tracker stays clean, and the run halts: no
 * later member is merged, every worktree is kept, and the report names the
 * conflicting files.
 *
 * @param {{git: (args: string[]) => {status: number, stdout: string, stderr: string},
 *   tracker: string, epic?: number, members: Array<{issue: number, branch: string, worktreePath: string}>,
 *   order: number[], tail?: number[], processed?: number, total?: number, unswept?: number[]}} input
 *   `unswept` names members a `--nonstop` run already moved to in_review with
 *   no sweep yet (#3202); the halt report lists them.
 */
function mergeBack({ git, tracker, epic, members = [], order = [], tail = [], processed = 0, total = 0, unswept = [] } = {}) {
  const byIssue = new Map(members.map((m) => [m.issue, m]));
  const sequence = order.filter((n) => byIssue.has(n));
  const merged = [];
  for (let i = 0; i < sequence.length; i++) {
    const m = byIssue.get(sequence[i]);
    const ontoTip = git(['rev-parse', 'HEAD']).stdout.trim();
    const r = git(['merge', '--no-ff', '--no-edit', m.branch]);
    if (r.status === 0) {
      merged.push({ issue: m.issue, branch: m.branch, ontoTip, tip: git(['rev-parse', 'HEAD']).stdout.trim() });
      continue;
    }
    const conflicted = git(['diff', '--name-only', '--diff-filter=U']).stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    // #3263: git refuses to start a merge that would overwrite local changes
    // at the root (often another session's), naming them in stderr as
    // tab-indented lines; nothing to abort. #3293: only that text means
    // refused — a mistyped branch, a hook or GPG failure or a held index.lock
    // also leave no conflicted path, and are reported as a merge failure.
    const stderr = r.stderr || '';
    const tabbed = stderr.split('\n').filter((l) => /^\t/.test(l)).map((l) => l.trim()).filter(Boolean);
    const refused = conflicted.length === 0 && /would be overwritten by merge/.test(stderr);
    const failedToStart = conflicted.length === 0 && !refused;
    const files = refused ? tabbed : conflicted;
    if (conflicted.length > 0) git(['merge', '--abort']);
    const halted = { issue: m.issue, branch: m.branch, worktreePath: m.worktreePath, ontoTip, files, stderr, ...(refused ? { refused: true } : {}) };
    const unmerged = sequence.slice(i + 1);
    return {
      ok: false, tracker, merged, halted, unmerged, tailNotStarted: [...tail], worktreesKept: [...members],
      report: haltReport({
        epic,
        reason: refused
          ? 'merge refused — local changes at the root would be overwritten (uncommitted or staged, possibly another session\'s); nothing was merged for this member'
          : failedToStart
            ? `merge failed — git could not merge ${m.branch} (see git's output below); nothing was merged for this member`
            : 'residual merge conflict after reconciliation',
        failed: halted,
        merged: merged.map((x) => x.issue), unmerged, tailNotStarted: tail, processed, total, worktreesKept: members, unswept,
      }),
    };
  }
  return { ok: true, tracker, merged, halted: null, unmerged: [], tailNotStarted: [], worktreesKept: [], report: null };
}

/**
 * Create a worktree per member through the injected `create` (the
 * WorktreeCreate hook path), stopping at a failure under --nonstop (#3140).
 * A failed member is reported not started with its half-made path; nothing
 * is removed here — the path is for the user to inspect or tear down.
 *
 * @param {{members: number[], create: (m: {issue: number}) => {ok: boolean, path?: string, branch?: string, error?: string},
 *   nonstop?: boolean, epic?: number, total?: number}} input
 */
function createWorktrees({ members = [], create, nonstop = false, epic, total } = {}) {
  const created = [];
  const notStarted = [];
  let halted = false;
  let neverStarted = [];
  for (let i = 0; i < members.length; i++) {
    const issue = members[i];
    const r = create({ issue });
    if (r && r.ok) {
      created.push({ issue, path: r.path, branch: r.branch || null });
      continue;
    }
    notStarted.push({ issue, path: (r && r.path) || null, error: (r && r.error) || 'worktree creation failed' });
    if (nonstop) {
      halted = true;
      neverStarted = members.slice(i + 1);
      break;
    }
  }
  // The half-made path is a .tmp-wt-* worktree that may hold hub links, so the
  // way out is the unlink-first teardown — never git worktree remove (#3186).
  const lines = notStarted.map((n) => `#${n.issue} not started: ${n.error}${n.path ? ` — half-made worktree at ${n.path} (inspect, or tear it down with \`${TEARDOWN_CLI} --root <project-root> --worktree ${n.path}\` — never git worktree remove)` : ''}`);
  if (halted) {
    lines.unshift(`Halted: worktree creation failed for #${notStarted[notStarted.length - 1].issue}; ${neverStarted.length ? `never started: ${list(neverStarted)}` : 'no member after it'}. Created worktrees are kept. Resume: /work ${epic || '<epic>'} --nonstop --concurrent.`);
  }
  return { ok: notStarted.length === 0, created, notStarted, halted, neverStarted, total: total || members.length, report: lines.length ? lines.join('\n') : null };
}

/**
 * The ledger rows a run produces, in run order (#3139): one `work-started`
 * per event-1 step and one `work-completed` per event-2 step, each naming
 * that member alone — `issues: [n]` is singular by design (rule 08 Step 6).
 * What `announce.js` records when the parent executes the sequence, so the
 * pairing audit can be checked against the run before it is run.
 *
 * @returns {Array<{event: 'work-started'|'work-completed', issues: number[]}>}
 */
function expectedLedger(run) {
  const rows = [];
  for (const s of (run && run.steps) || []) {
    if (s.step === 'event-1') rows.push({ event: 'work-started', issues: [s.issue] });
    if (s.step === 'event-2') rows.push({ event: 'work-completed', issues: [s.issue] });
  }
  return rows;
}

/**
 * Per-member commit attribution (#3139): the `Refs #N` every spawned member
 * is briefed to put on each commit, keyed by member. Only spawned members
 * appear — a tail member is worked by the parent under standard /work.
 *
 * @returns {Object<number, {refs: string, brief: string}>}
 */
function attributionOf(run) {
  const out = {};
  for (const s of (run && run.steps) || []) {
    if (s.kind === 'spawn') out[s.issue] = { refs: `Refs #${s.issue}`, brief: s.request.prompt };
  }
  return out;
}

/**
 * The agent slot a group member holds, or null for a tail member (worked by
 * the parent, no agent). Implementer, reviewer and any fix-cycle re-spawn
 * all use this one slot, which is what keeps a run within `--agents`.
 */
function slotOf(run, issue) {
  const spawn = ((run && run.steps) || []).find((s) => s.kind === 'spawn' && s.issue === issue);
  return spawn ? spawn.slot : null;
}

/** The slot a fix cycle re-spawns the implementer into: its own. */
function fixCycleSlot(run, issue) {
  return slotOf(run, issue);
}

/**
 * One parent TaskList entry per member, naming its group, so compaction
 * recovery can say which group a member belongs to from TaskList alone.
 *
 * @returns {Array<{subject: string, description: string}>}
 */
function memberTasks({ plan = {}, members = {}, rolling = false } = {}) {
  const groups = Array.isArray(plan.groups) ? plan.groups : [];
  const tail = Array.isArray(plan.tail) ? plan.tail : [];
  const tasks = [];
  // Under the rolling schedule (#3274) there are no groups to name; a member
  // is placed by its dependency layer.
  const layers = rolling && Array.isArray(plan.layers) ? plan.layers : null;
  if (layers) {
    layers.forEach((l, i) => {
      for (const n of l) {
        tasks.push({
          subject: `Sub-issue #${n}: ${titleOf(members, n)} (layer ${i + 1})`,
          description: `Rolling member of layer ${i + 1} — starts in its own worktree when a slot frees and every member it depends on has merged back; the parent owns its gates, merge-back and status moves.`,
        });
      }
    });
  }
  (layers ? [] : groups).forEach((g, i) => {
    for (const n of g) {
      tasks.push({
        subject: `Sub-issue #${n}: ${titleOf(members, n)} (group ${i + 1})`,
        description: `Concurrent member of group ${i + 1} — runs in its own worktree; the parent owns its gates, merge-back and status moves.`,
      });
    }
  });
  for (const t of tail) {
    tasks.push({
      subject: `Sub-issue #${t.number}: ${titleOf(members, t.number)} (tail)`,
      description: `Sequential tail${t.reason ? ` — ${t.reason}` : ''}; worked by the parent after every group, as standard /work.`,
    });
  }
  return tasks;
}

module.exports = {
  PARENT_STEPS,
  MEMBER_STEPS,
  STEP_INSTRUCTION_EXEMPT,
  GATE_CLI,
  TEARDOWN_CLI,
  MEMBER_TEMPLATES,
  instructionOf,
  buildMemberBrief,
  buildSpawnRequest,
  briefPathOf,
  memberBriefs,
  extractBriefSections,
  buildRun,
  nextSteps,
  mergeBack,
  createWorktrees,
  haltReport,
  unsweptLine,
  expectedLedger,
  attributionOf,
  slotOf,
  fixCycleSlot,
  memberTasks,
  runNextStepsCli,
  runReplanCli,
  recordSpawn,
  pruneRunLedger,
  runRecordSpawnCli,
  recordRegenerated,
  runRecordRegeneratedCli,
};

/**
 * The run ledger (#3264): which worktree and branch each spawned member got.
 * Branches are harness-named (`wt/<agent-name>`, no issue number), so after
 * a halt or compaction nothing else maps a kept worktree back to its member.
 * Pure upsert by issue.
 *
 * @param {{members?: Array<{issue: number, branch: string, worktreePath: string}>}} ledger
 * @param {{issue: number, branch: string, worktreePath: string}} entry
 * @returns {{members: object[]}}
 */
function recordSpawn(ledger, entry) {
  const members = ((ledger && ledger.members) || []).filter((m) => m.issue !== entry.issue);
  const at = ((ledger && ledger.members) || []).findIndex((m) => m.issue === entry.issue);
  const next = { issue: entry.issue, branch: entry.branch, worktreePath: entry.worktreePath };
  if (at === -1) members.push(next); else members.splice(at, 0, next);
  return { ...(ledger || {}), members };
}

/**
 * Drop run-ledger entries nothing can match any more (#3350). `recordSpawn`
 * only ever adds, so members of a long-finished run stayed in the ledger and
 * could mis-attribute a worktree should a branch name be reused. An entry is
 * dropped only when its worktree is gone AND its member is not in the active
 * set; an entry whose worktree still exists is kept whatever its member's
 * state, since that is a kept worktree #3264's resume matching reports.
 * Paths compare as `matchKeptWorktrees` compares them. Pure.
 *
 * @param {{members: object[]}|null} ledger
 * @param {{worktrees: {worktreePath: string}[], active: number[]}} opts
 * @returns {{ledger: object|null, dropped: number[]}}
 */
function pruneRunLedger(ledger, { worktrees = [], active = [] } = {}) {
  if (!ledger || !Array.isArray(ledger.members)) return { ledger: ledger || null, dropped: [] };
  const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const onDisk = new Set(worktrees.map((w) => norm(w.worktreePath)));
  const dropped = [];
  const members = ledger.members.filter((m) => {
    const keep = onDisk.has(norm(m.worktreePath)) || active.includes(m.issue);
    if (!keep) dropped.push(m.issue);
    return keep;
  });
  return { ledger: { ...ledger, members }, dropped };
}

/** The command a spawn step names for the parent to run once the spawn returns. */
function spawnRecord(ledgerFile, n) {
  return `Once #${n}'s spawn returns, run \`${ORCH_CLI} record-spawn --ledger ${ledgerFile} --issue ${n} --branch <its wt/* branch> --worktree <its worktree path>\`.`;
}

/** `record-spawn --ledger F --issue N --branch B --worktree P` (#3264). */
function runRecordSpawnCli(argv) {
  const fs = require('fs');
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (['--ledger', '--issue', '--branch', '--worktree'].includes(a)) opts[a] = argv[++i];
    else if (a !== 'record-spawn') return { code: 1, envelope: { ok: false, error: `unexpected argument: ${a}` } };
  }
  const missing = ['--ledger', '--issue', '--branch', '--worktree'].filter((k) => !opts[k]);
  if (missing.length) return { code: 1, envelope: { ok: false, error: `missing ${missing.join(', ')}` } };
  let ledger = { members: [] };
  if (fs.existsSync(opts['--ledger'])) {
    try { ledger = JSON.parse(fs.readFileSync(opts['--ledger'], 'utf8')); } catch (e) {
      return { code: 1, envelope: { ok: false, error: `cannot read run ledger ${opts['--ledger']}: ${e.message}` } };
    }
  }
  const next = recordSpawn(ledger, { issue: Number(opts['--issue']), branch: opts['--branch'], worktreePath: opts['--worktree'] });
  fs.writeFileSync(opts['--ledger'], JSON.stringify(next, null, 2));
  return { code: 0, envelope: { ok: true, ledger: opts['--ledger'], members: next.members } };
}

// `--not-started N[=<half-made worktree path>]` (#3269).
function parseNotStarted(v) {
  const [num, ...rest] = String(v || '').split('=');
  return { issue: Number(num), path: rest.length ? rest.join('=') : null, error: null };
}
const addNums = (list, more) => [...(list || []), ...more.filter((n) => Number.isInteger(n) && !(list || []).includes(n))];
const addNotStarted = (list, more) => [...(list || []), ...more.filter((f) => Number.isInteger(f.issue) && !(list || []).some((x) => x.issue === f.issue))];

/**
 * `next-steps` CLI (#3274) — the parent's handle on nextSteps between events.
 *   node .claude/scripts/shared/lib/concurrent-orchestration.js next-steps --state F
 *     [--merged N ...] [--passed N ...] [--stopped N ...] [--not-started N[=<path>] ...]
 *   ... next-steps --state F --show-batch <id> | --show-start <N>   (#3349, read-only replay)
 * Reads the run state the preamble wrote, adds the merges, passes, gate stops
 * and failed worktree creations (#3269) the parent records, prints {ok, start, batch, steps, done, templates} and
 * writes the new state back. With replan below, the only disk access in this
 * module; nextSteps and buildRun themselves stay pure.
 */
function runNextStepsCli(argv) {
  const fs = require('fs');
  const opts = { merged: [], passed: [], stopped: [], notStarted: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--state') opts.state = argv[++i];
    else if (a === '--merged') opts.merged.push(Number(argv[++i]));
    else if (a === '--passed') opts.passed.push(Number(argv[++i]));
    else if (a === '--stopped') opts.stopped.push(Number(argv[++i]));
    else if (a === '--not-started') opts.notStarted.push(parseNotStarted(argv[++i]));
    else if (a === '--show-batch') opts.showBatch = Number(argv[++i]);
    else if (a === '--show-start') opts.showStart = Number(argv[++i]);
    else if (a !== 'next-steps') return { code: 1, envelope: { ok: false, error: `unexpected argument: ${a}` } };
  }
  if (!opts.state) return { code: 1, envelope: { ok: false, error: '--state <file> is required' } };
  let state;
  try {
    state = JSON.parse(fs.readFileSync(opts.state, 'utf8'));
  } catch (e) {
    return { code: 1, envelope: { ok: false, error: `cannot read run state ${opts.state}: ${e.message}` } };
  }
  // #3349: replay a set already handed out, verbatim. Read-only — the state
  // file is never written, so a replay cannot advance the run.
  if (opts.showBatch !== undefined || opts.showStart !== undefined) {
    const key = opts.showBatch !== undefined ? `batch:${opts.showBatch}` : `start:${opts.showStart}`;
    const label = opts.showBatch !== undefined ? `batch ${opts.showBatch}` : `the start of #${opts.showStart}`;
    const set = (state.issued || {})[key];
    if (!set) return { code: 1, envelope: { ok: false, error: `the run state has not issued ${label}` } };
    return {
      code: 0,
      envelope: { ok: true, replay: true, start: set.start || [], batch: set.batch || null, steps: set.steps, done: false, templates: { ...MEMBER_TEMPLATES } },
    };
  }
  const recorded = {
    merged: addNums(state.merged, opts.merged), passed: addNums(state.passed, opts.passed),
    stopped: addNums(state.stopped, opts.stopped), notStarted: addNotStarted(state.notStarted, opts.notStarted),
  };
  const r = nextSteps({ ...state, ...recorded });
  fs.writeFileSync(opts.state, JSON.stringify({ ...r.state, ...recorded }, null, 2));
  return { code: 0, envelope: { ok: true, start: r.start, batch: r.batch, steps: r.steps, done: r.done, templates: { ...MEMBER_TEMPLATES } } };
}

/**
 * `replan --state F [--stopped N]... [--not-started N[=<path>]]...` (#3269):
 * the default-mode counterpart of next-steps. The preamble writes the run's
 * inputs to F; each run-time decision is recorded there and buildRun runs
 * again, so the plan the parent follows drops every later step of a member
 * the Review-State Gate stopped or whose worktree could not be created.
 */
function runReplanCli(argv) {
  const fs = require('fs');
  const opts = { stopped: [], notStarted: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--state') opts.state = argv[++i];
    else if (a === '--stopped') opts.stopped.push(Number(argv[++i]));
    else if (a === '--not-started') opts.notStarted.push(parseNotStarted(argv[++i]));
    else if (a !== 'replan') return { code: 1, envelope: { ok: false, error: `unexpected argument: ${a}` } };
  }
  if (!opts.state) return { code: 1, envelope: { ok: false, error: '--state <file> is required' } };
  let state;
  try {
    state = JSON.parse(fs.readFileSync(opts.state, 'utf8'));
  } catch (e) {
    return { code: 1, envelope: { ok: false, error: `cannot read run state ${opts.state}: ${e.message}` } };
  }
  const next = { ...state, reviewStopped: addNums(state.reviewStopped, opts.stopped), notStarted: addNotStarted(state.notStarted, opts.notStarted) };
  fs.writeFileSync(opts.state, JSON.stringify(next, null, 2));
  const { steps, total, templates } = buildRun({ ...next, stateFile: opts.state });
  return { code: 0, envelope: { ok: true, steps, total, templates } };
}

/**
 * `record-regenerated --state F (--group G | --batch B) [--sha SHA] [--path P]...`
 * (#3286): record the regenerated-output commit in the run state, so the
 * post-merge pass's `group-tier1 --state F` treats it as --own. `--sha`
 * defaults to HEAD — the step runs it right after making the commit.
 */
function runRecordRegeneratedCli(argv, seams = {}) {
  const fs = require('fs');
  const opts = { paths: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--state') opts.state = argv[++i];
    else if (a === '--group') opts.group = Number(argv[++i]);
    else if (a === '--batch') opts.batch = Number(argv[++i]);
    else if (a === '--sha') opts.sha = argv[++i];
    else if (a === '--path') opts.paths.push(argv[++i]);
    else if (a !== 'record-regenerated') return { code: 1, envelope: { ok: false, error: `unexpected argument: ${a}` } };
  }
  if (!opts.state) return { code: 1, envelope: { ok: false, error: '--state <file> is required' } };
  const where = Number.isInteger(opts.group) ? { group: opts.group } : Number.isInteger(opts.batch) ? { batch: opts.batch } : null;
  if (!where) return { code: 1, envelope: { ok: false, error: '--group <G> or --batch <B> is required' } };
  let state;
  try {
    state = JSON.parse(fs.readFileSync(opts.state, 'utf8'));
  } catch (e) {
    return { code: 1, envelope: { ok: false, error: `cannot read run state ${opts.state}: ${e.message}` } };
  }
  let sha = opts.sha;
  if (!sha) {
    const git = seams.git || ((args) => require('child_process').execFileSync('git', args, { encoding: 'utf8', timeout: 60_000 }));
    try { sha = String(git(['rev-parse', 'HEAD'])).trim(); } catch (e) {
      return { code: 1, envelope: { ok: false, error: `cannot resolve HEAD: ${e.message}` } };
    }
  }
  const next = recordRegenerated(state, { sha, paths: opts.paths, ...where });
  fs.writeFileSync(opts.state, JSON.stringify(next, null, 2));
  return { code: 0, envelope: { ok: true, state: opts.state, recorded: next.regeneratedCommits.find((e) => e.sha === sha) } };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const result = argv[0] === 'replan' ? runReplanCli(argv)
    : argv[0] === 'record-spawn' ? runRecordSpawnCli(argv)
      : argv[0] === 'record-regenerated' ? runRecordRegeneratedCli(argv)
        : runNextStepsCli(argv);
  process.stdout.write(JSON.stringify(result.envelope, null, 2) + '\n');
  process.exitCode = result.code;
}
