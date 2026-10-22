// Rubrical Works (c) 2026
/**
 * @framework-script 0.110.0
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
 * Pure over its inputs: no gh, no git, no disk.
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
const POST_WORK = ['4', '4a', '4b', '4c', '4d', '4e', '4f', '5', 'event-2'];

/** The entry points the gate and teardown steps name (#3158). */
const GATE_CLI = 'node .claude/scripts/shared/lib/merge-back-gate.js';
const TEARDOWN_CLI = 'node .claude/scripts/shared/lib/worktree-teardown.js';

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
    lines.push('Change only these paths; the parent\'s merge-back gate checks scope drift against them.');
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
 * The Agent request the parent issues for one member.
 *
 * @returns {{description: string, isolation: 'worktree', prompt: string}}
 */
function buildSpawnRequest({ issue, title, acceptanceCriteria, tddChecklist, root, description, proposedSolution, declaredScope } = {}) {
  return {
    description: `Work #${issue}: ${title || `#${issue}`}`,
    isolation: 'worktree',
    prompt: buildMemberBrief({ issue, title, acceptanceCriteria, tddChecklist, root, description, proposedSolution, declaredScope }),
  };
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
 *   nonstop?: boolean, tddChecklist?: object|null, noReview?: boolean, root?: string|null}} [input]
 *   `noReview` (`--no-review`) replaces each Tier 3 reviewer spawn with a
 *   reported skip; Tiers 1–2 still run. `root` is the parent checkout, passed
 *   into each member's brief so skill paths resolve outside the worktree (#3162).
 * @returns {{steps: object[], total: number}}
 *   Each step has `kind` and `owner`; per-issue steps carry `issue` and,
 *   inside a group, `group` (1-based). Implementer and reviewer spawns carry
 *   the member's `slot` (1-based within its group).
 */
function buildRun({ plan = {}, members = {}, nonstop = false, tddChecklist = null, noReview = false, reviewStopped = [], notStarted = [], root = null } = {}) {
  const groups = Array.isArray(plan.groups) ? plan.groups : [];
  const tail = (Array.isArray(plan.tail) ? plan.tail : []).map((t) => t.number);
  const total = groups.reduce((sum, g) => sum + g.length, 0) + tail.length;
  const stopped = new Set(Array.isArray(reviewStopped) ? reviewStopped : []);
  const failedCreation = new Map((Array.isArray(notStarted) ? notStarted : []).map((n) => [n.issue, n]));
  const steps = [];
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
  const reviewGate = (list, group) => list.filter((n) => {
    step('review-state-gate', n, { group });
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
  });
  const finish = (n, group) => {
    // Inside a group Step 4f is the GROUP's, run once on the tracker after
    // reconciliation (#3139); a tail member keeps its own, as sequential /work.
    // Under --nonstop neither exists: one run-level sweep follows the last
    // member (#3202).
    for (const id of POST_WORK) {
      if (id === '4f' && (group || nonstop)) continue;
      step(id, n, { group });
    }
    swept.push(n);
    steps.push({
      kind: 'report', step: 'report', owner: 'parent', issue: n, ...(group ? { group } : {}),
      text: `Sub-issue #${n}: ${titleOf(members, n)} → In Review (${swept.length}/${total} processed)`,
    });
  };

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
      return { steps, total };
    }
    for (const n of groupMembers) for (const id of PRE_WORK.slice(1)) step(id, n, { group });
    groupMembers.forEach((n, j) => {
      steps.push({
        kind: 'spawn', step: 'spawn', owner: 'parent', issue: n, group, slot: j + 1,
        request: buildSpawnRequest({ issue: n, title: titleOf(members, n), acceptanceCriteria: acsOf(members, n), tddChecklist, root, ...briefDataOf(members, n) }),
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
    groupMembers.forEach((n, j) => {
      step('gate-tier1', n, {
        group,
        instruction: `Run \`${GATE_CLI} tier1 --issue ${n} --branch <#${n}'s wt/* branch> --worktree <#${n}'s worktree path> --tracker-tip <tip recorded at group ${group} start> --out .tmp-gate-${n}-tier1.json\` — it writes the Tier 1 document itself (#3225); record the sha256 its envelope's out reports, and do not redirect stdout into that file. Exit 1 is a Tier 1 failure: carry it to the outcome step, never merge past it.`,
      });
      step('gate-tier2', n, {
        group,
        instruction: `Read every file in .tmp-gate-${n}-tier1.json tier2.files, file by file, against #${n}'s acceptance criteria, as tier2.instruction says. Record the read as pass or fail with the file and line of anything no AC asks for; the direct-work exemption never applies.`,
      });
      steps.push(noReview
        ? { kind: 'review-skip', step: 'gate-tier3', owner: 'parent', issue: n, group, reason: 'no-review' }
        : {
          kind: 'review-spawn', step: 'gate-tier3', owner: 'parent', issue: n, group, slot: j + 1,
          instruction: `Run \`${GATE_CLI} tier3-plan --issue ${n} --tracker-tip <tip recorded at group ${group} start> --branch <#${n}'s wt/* branch>\`. tier3.skipped → report tier3.message (Tiers 1–2 still decide). Otherwise run \`${GATE_CLI} tree-snapshot --out .tmp-gate-${n}-tree-before.txt --clear .tmp-gate-${n}-tier3.json\` (it removes any earlier cycle's review first) and record the sha256 its envelope reports, then spawn the reviewer Agent in slot ${j + 1} with tier3.request.prompt exactly — never the implementer's summary. The reviewer writes its own review to .tmp-gate-${n}-tier3.json (#3204); do not copy or re-word its reply. Write no other file in the project root while the review runs: any change other than this member's own review and snapshot, or a running-group sibling's own gate files, fails Tier 3 (#3220).`,
        });
      // The outcome (#3141): merge with a findings comment, or exactly one
      // fix cycle back to the same implementer, or a halt.
      steps.push({
        kind: 'gate-outcome', step: 'gate-outcome', owner: 'parent', issue: n, group,
        instruction: `Run \`${GATE_CLI} outcome --issue ${n} --worktree <#${n}'s worktree path> --branch <#${n}'s wt/* branch> --tier1 .tmp-gate-${n}-tier1.json --tier1-sha <sha256 from #${n}'s tier1 --out envelope> --tier3 .tmp-gate-${n}-tier3.json --tree-before .tmp-gate-${n}-tree-before.txt --tree-before-sha <sha256 from #${n}'s tree-snapshot envelope>${groupMembers.filter((m) => m !== n).map((m) => ` --sibling ${m}`).join('')}${unsweptFlags()}\` (\`--no-review\` in place of --tier3, --tree-before and --tree-before-sha when Tier 3 was skipped; add \`--fix-cycles 1\` on the re-run) — it runs decideOutcome on the tiers. action merge → post comment.body on #${n} and continue; send-findings → SendMessage the message to the same implementer (its worktree intact) and re-run every tier once — exactly one fix cycle; re-review → a reviewer-process failure (#3222), not a fix cycle: when the decision carries outsideContract (#3226), first report those paths and clear them — remove or restore what this run wrote; a path another session is editing is cleared by waiting for that session to settle it, never by deleting or reverting it — and never re-snapshot over them; then run \`${GATE_CLI} tree-snapshot --out .tmp-gate-${n}-tree-before.txt --clear .tmp-gate-${n}-tier3.json\` again, re-spawn the reviewer in slot ${j + 1} with the same tier3.request.prompt, then re-run this outcome with the new sha and \`--review-retries 1\` (a second one halts, attributed to the reviewer); halt → print report: the --nonstop halt, worktree kept, #${n} never merged. After compaction add \`--resumed\`: the re-run IS the cycle.`,
      });
    });
    steps.push({
      kind: 'merge-back', step: 'merge-back', owner: 'parent', group, order: [...groupMembers],
      instruction: `On the tracker branch, run \`${GATE_CLI} merge-back --tracker <tracker branch> ${groupMembers.map((n) => `--member ${n}:<#${n}'s wt/* branch>:<#${n}'s worktree path>`).join(' ')}${unsweptFlags()}\` — members merge --no-ff in that order (${groupMembers.map((n) => `#${n}`).join(', ')}), each onto the current tip. Exit 1 → print report: a residual conflict halts the run, nothing later merges, every worktree is kept.`,
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
    steps.push({
      kind: 'deferred-suites', step: 'deferred-suites', owner: 'parent', group, serial: true,
      members: [...groupMembers], scope: 'group-union', deferredReasons: ['exclusive', 'cannot-narrow'],
      instruction: 'Run deferredInvocations({suites, changedFiles, cannotNarrow}) (test-runner.js) with changedFiles = the union of every member\'s changed files plus the regenerated paths from merge-back, and cannotNarrow = every suiteId a member\'s Tier 1 deferredSuites lists with reason cannot-narrow (#3159 — this step is the only place those run). Run each returned run once, serially, on the tracker branch: the exclusive suites, then the cannot-narrow ones. Name manualOnly, invalid, unmatchedExclusive, unmatchedCannotNarrow and every warning.',
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
      instruction: 'For every deferred-to-session entry the runner returned (deferredSkillInvocations in regeneration-runner.js), invoke that generator through the Skill tool in the parent before the group continues — a script cannot run a Skill-invoked generator.',
    });
    // Post-merge pass (#3141): Tiers 1–2 once more, in the parent, over the
    // members' diffs ∪ the runner's regenerated paths — a regenerated file no
    // member's diff named is reviewed here — before the group is reported.
    steps.push({
      kind: 'post-merge-pass', step: 'post-merge-pass', owner: 'parent', group, members: [...groupMembers],
      instruction: `Run \`${GATE_CLI} group-tier1 --base <tip recorded at group ${group} start> ${groupMembers.map((n) => `--member ${n}`).join(' ')} --group ${group}${unsweptFlags()} [--epic <epic>] [--regenerated <path> for each path the reconcile step's runner rewrote]\` — Tiers 1–2 once more, in the parent: this is Tier 1 over the tracker range, skipping the merge-back merges. Then read every path in postMergeSet({memberDiffs, regenerated}) yourself (Tier 2; a regenerated path no member's diff named is read too). outcome.action halt, or a failed read, halts on the second-review-fail terms, worktrees kept.`,
    });
    if (!nonstop) steps.push({ kind: 'step', step: '4f', owner: 'parent', group, cwd: 'tracker', members: [...groupMembers] });
    for (const n of groupMembers) finish(n, group);
    if (!nonstop) steps.push({ kind: 'stop', step: '6', owner: 'parent', scope: 'group', group });
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
  return { steps, total };
}

const list = (nums) => (nums.length ? nums.map((n) => `#${n}`).join(', ') : 'none');

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
      lines.push('  Conflicting files:');
      for (const f of failed.files) lines.push(`    - ${f}`);
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
    const files = git(['diff', '--name-only', '--diff-filter=U']).stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    git(['merge', '--abort']);
    const halted = { issue: m.issue, branch: m.branch, worktreePath: m.worktreePath, ontoTip, files, stderr: r.stderr || '' };
    const unmerged = sequence.slice(i + 1);
    return {
      ok: false, tracker, merged, halted, unmerged, tailNotStarted: [...tail], worktreesKept: [...members],
      report: haltReport({
        epic, reason: 'residual merge conflict after reconciliation', failed: halted,
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
function memberTasks({ plan = {}, members = {} } = {}) {
  const groups = Array.isArray(plan.groups) ? plan.groups : [];
  const tail = Array.isArray(plan.tail) ? plan.tail : [];
  const tasks = [];
  groups.forEach((g, i) => {
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
  buildMemberBrief,
  buildSpawnRequest,
  extractBriefSections,
  buildRun,
  mergeBack,
  createWorktrees,
  haltReport,
  unsweptLine,
  expectedLedger,
  attributionOf,
  slotOf,
  fixCycleSlot,
  memberTasks,
};
