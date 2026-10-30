#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.115.0
 *
 * The one place a `qa-required` issue is created (#3453).
 *
 * Two shapes, chosen by whether a parent is given:
 *   - sub-issue  — `gh pmu sub create --parent N`, used by /work Step 4a
 *                  (qa-extract.js). `gh pmu sub create` takes no --status, so
 *                  the issue is moved to `qa_required` as a separate step.
 *   - standalone — `gh pmu create --status qa_required`, used by the /done
 *                  release-gate hand-off. No parent and, by default, no branch:
 *                  a QA issue on the branch tracker would be moved to Backlog
 *                  when /prepare-release closes it.
 * A branch is assigned only when one is given, through assign-branch.js — the
 * owner of the branch-field contract — never `gh pmu move --branch` here.
 * Either way the issue ends in `qa_required`, the column /work and /qa use.
 *
 * Before #3453 the filing lived inside qa-extract.js, and rule 02 restated
 * two `gh pmu` command lines for every other caller; the standalone line said
 * `--status backlog`, so a QA issue filed by hand landed in a different column
 * from one /work extracted. qa-extract.js now re-exports these functions.
 *
 * Every value reaches `gh` as a discrete execFileSync argument: titles come
 * from AC text in issue bodies, so the shell is never a trust boundary (#2456).
 * Node built-ins only (deployed scripts resolve from the hub, #2418).
 *
 * CLI (rule 02 § QA-Issue Creation Ownership):
 *   node qa-issue.js --title "QA: <check>" --body-file <path> [--parent N] [--branch <name>]
 * Prints the fileQaIssue envelope as JSON; exit 1 when nothing was filed.
 */

'use strict';

// execFileTimed is execFileSync with a timeout, so a hung gh fails with
// ETIMEDOUT instead of blocking /done or /work (lib/exec.js).
const { execFileTimed: execFileSync } = require('./exec.js');

const QA_LABEL = 'qa-required';
// The `.gh-pmu.json` alias, not the board option name ("QA required"):
// `gh pmu move --status` resolves the alias and rejects the column label.
const QA_STATUS_ALIAS = 'qa_required';

/** The issue number in `gh pmu` creation output, or null. */
function issueNumberFrom(raw) {
  const m = String(raw).match(/\/issues\/(\d+)/) || String(raw).match(/#(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function createSubIssue(parentIssue, title, bodyPath, execFileFn = execFileSync) {
  const args = ['pmu', 'sub', 'create', '--parent', String(parentIssue), '--title', title, '--label', QA_LABEL, '-F', bodyPath];
  const raw = execFileFn('gh', args, { encoding: 'utf8' });
  const n = issueNumberFrom(raw);
  if (n === null) throw new Error(`gh pmu sub create output did not include an issue number:\n${raw}`);
  return n;
}

function createStandaloneIssue(title, bodyPath, execFileFn = execFileSync) {
  const args = ['pmu', 'create', '--title', title, '--label', QA_LABEL, '-F', bodyPath, '--status', QA_STATUS_ALIAS];
  const raw = execFileFn('gh', args, { encoding: 'utf8' });
  const n = issueNumberFrom(raw);
  if (n === null) throw new Error(`gh pmu create output did not include an issue number:\n${raw}`);
  return n;
}

function setSubIssueStatus(subIssueNumber, execFileFn = execFileSync) {
  return execFileFn('gh', ['pmu', 'move', String(subIssueNumber), '--status', QA_STATUS_ALIAS], { encoding: 'utf8' });
}

function defaultAssignFn(issueNumber, branch) {
  const { assignToBranch } = require('../assign-branch.js');
  return assignToBranch(issueNumber, branch);
}

/**
 * Put a freshly-created QA sub-issue where /work and /qa can find it: on the
 * parent's branch, in the qa_required column (#2821).
 *
 * Never throws. A placement failure leaves a real sub-issue that is simply less
 * reachable, and that state must be *reported*, because from the outside it is
 * indistinguishable from a successful run.
 */
async function placeSubIssue({ subIssueNumber, parentBranch, assignFn = defaultAssignFn, statusFn = setSubIssueStatus }) {
  const placement = { branch: null, status: null };
  const warnings = [];

  if (parentBranch) {
    let assigned = false;
    let threw = false;
    try {
      assigned = await assignFn(subIssueNumber, parentBranch);
    } catch (e) {
      threw = true;
      warnings.push(`#${subIssueNumber} branch assignment to ${parentBranch} threw: ${e.message}`);
    }
    // Keyed to `threw`, not to warnings.length: a length test would silently
    // swallow this warning the moment anything else warns earlier.
    if (assigned) placement.branch = parentBranch;
    else if (!threw) warnings.push(`#${subIssueNumber} was not assigned to branch ${parentBranch}`);
  } else {
    warnings.push(`#${subIssueNumber} has no parent branch to inherit — left unassigned`);
  }

  try {
    statusFn(subIssueNumber);
    placement.status = QA_STATUS_ALIAS;
  } catch (e) {
    warnings.push(`#${subIssueNumber} status not set to ${QA_STATUS_ALIAS}: ${e.message}`);
  }

  return { placement, warnings };
}

/**
 * File one `qa-required` issue.
 * @param {{title: string, bodyPath: string, parent?: number|null, branch?: string|null,
 *   execFileFn?: Function, assignFn?: Function}} opts
 * @returns {Promise<{ok: boolean, number: number|null, parent: number|null, branch: string|null,
 *   status: string|null, warnings: string[], error?: string}>}
 */
async function fileQaIssue({ title, bodyPath, parent = null, branch = null, execFileFn = execFileSync, assignFn = defaultAssignFn }) {
  const base = { ok: false, number: null, parent: parent || null, branch: null, status: null, warnings: [] };
  let number;
  try {
    number = parent ? createSubIssue(parent, title, bodyPath, execFileFn) : createStandaloneIssue(title, bodyPath, execFileFn);
  } catch (e) {
    return { ...base, error: e.message };
  }

  if (parent) {
    const { placement, warnings } = await placeSubIssue({
      subIssueNumber: number, parentBranch: branch, assignFn, statusFn: (n) => setSubIssueStatus(n, execFileFn),
    });
    // A sub-issue without a branch is a choice here, not a fault: only warn
    // about a branch that was asked for and not set.
    const kept = branch ? warnings : warnings.filter((w) => !/no parent branch to inherit/.test(w));
    return { ...base, ok: true, number, branch: placement.branch, status: placement.status, warnings: kept };
  }

  // Standalone: the status was set at creation.
  const result = { ...base, ok: true, number, status: QA_STATUS_ALIAS };
  if (branch) {
    try {
      if (await assignFn(number, branch)) result.branch = branch;
      else result.warnings.push(`#${number} was not assigned to branch ${branch}`);
    } catch (e) {
      result.warnings.push(`#${number} branch assignment to ${branch} threw: ${e.message}`);
    }
  }
  return result;
}

function parseArgs(argv) {
  const out = { title: null, bodyPath: null, parent: null, branch: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--title') out.title = argv[++i];
    else if (a === '--body-file') out.bodyPath = argv[++i];
    else if (a === '--parent') out.parent = parseInt(argv[++i], 10) || null;
    else if (a === '--branch') out.branch = argv[++i];
  }
  return out;
}

async function main(argv, deps = {}) {
  const args = parseArgs(argv);
  if (!args.title || !args.bodyPath) {
    return { ok: false, error: 'Usage: qa-issue.js --title "QA: <check>" --body-file <path> [--parent N] [--branch <name>]' };
  }
  return fileQaIssue({ ...args, ...deps });
}

module.exports = {
  QA_LABEL,
  QA_STATUS_ALIAS,
  issueNumberFrom,
  createSubIssue,
  createStandaloneIssue,
  setSubIssueStatus,
  placeSubIssue,
  fileQaIssue,
  parseArgs,
  main,
};

if (require.main === module) {
  main(process.argv.slice(2)).then((r) => {
    process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
    process.exitCode = r.ok ? 0 : 1;
  });
}
