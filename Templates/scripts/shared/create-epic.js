#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.91.0
 * @description Shared epic-creation helper (#2408). Used by /add-story and
 * /split-story to create epics through a single, testable code path. Returns
 * the standard JSON envelope { ok, epicNumber, labelsVerified, branchAssigned,
 * branch, errors[], warnings[] }.
 *
 * Behaviors:
 *   - Charter validation: scans CHARTER.md "## Out of Scope" section for
 *     keyword overlap with the requested theme; emits structured warnings.
 *   - Single source-of-truth body template (eliminates drift between callers).
 *   - Post-create label verification — ensures `gh pmu create --label epic`
 *     actually attached the label (catches silent label-miss).
 *   - Optional branch auto-assignment via `--assign-branch`.
 *
 * CLI:
 *   node create-epic.js --theme "<text>" [--source-issue N]
 *                       [--priority p0|p1|p2] [--assign-branch] [--schema]
 *
 * Output: JSON envelope on stdout. Exit 0 when ok, 1 on hard failure
 * (createIssue threw or post-create label check failed).
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const VALID_PRIORITIES = ['p0', 'p1', 'p2'];

const ENVELOPE_SCHEMA = {
  ok: 'boolean — false on createIssue failure or missing epic label',
  epicNumber: 'number|null — issue number returned by gh pmu create',
  labelsVerified: 'boolean — true when post-create label check found `epic`',
  branchAssigned: 'boolean — true when --assign-branch succeeded',
  branch: 'string|null — branch name if assignment was attempted',
  errors: 'string[] — hard failures',
  warnings: 'string[] — charter concerns, branch-assign failures, etc.'
};

// ─── Argument Parsing ───────────────────────────────────────

function parseArgs(argv) {
  const out = {
    theme: null,
    sourceIssue: null,
    priority: 'p2',
    assignBranch: false,
    schema: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--schema') {
      out.schema = true;
    } else if (a === '--theme' && i + 1 < argv.length) {
      out.theme = argv[++i];
    } else if (a === '--source-issue' && i + 1 < argv.length) {
      const n = parseInt(argv[++i], 10);
      if (Number.isNaN(n)) return { error: 'Invalid --source-issue value (must be numeric).' };
      out.sourceIssue = n;
    } else if (a === '--priority' && i + 1 < argv.length) {
      const p = argv[++i];
      if (!VALID_PRIORITIES.includes(p)) {
        return { error: `Invalid --priority "${p}" (must be one of ${VALID_PRIORITIES.join(', ')}).` };
      }
      out.priority = p;
    } else if (a === '--assign-branch') {
      out.assignBranch = true;
    }
  }
  if (out.schema) return out;
  if (out.theme === null || out.theme === '') {
    return { error: 'Missing or empty --theme <text> argument.' };
  }
  return out;
}

// ─── Body Template (single source of truth) ─────────────────

function buildEpicBody({ theme, sourceIssue }) {
  const sourceLine = sourceIssue
    ? `\n**Source issue:** #${sourceIssue}\n`
    : '';
  return `## Epic: ${theme}

### Vision

${theme}

### Stories

Stories will be linked via \`/add-story\`.

### Acceptance Criteria

- [ ] All stories completed
- [ ] Integration tested
- [ ] Documentation updated
${sourceLine}
**Note:** This epic was created via the shared \`create-epic.js\` helper.
Expand with detailed acceptance criteria as scope becomes clearer.
`;
}

// ─── Charter Validation ─────────────────────────────────────

function extractOutOfScopeBlock(charterText) {
  if (!charterText) return '';
  const m = charterText.match(/##\s+Out of Scope\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  return m ? m[1] : '';
}

function tokenize(s) {
  return (s || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3);
}

function validateCharterScope(theme, charterText) {
  const warnings = [];
  if (!charterText) {
    warnings.push('No CHARTER.md content available — skipped scope check.');
    return { warnings };
  }
  const oos = extractOutOfScopeBlock(charterText);
  if (!oos) return { warnings };

  const themeTokens = new Set(tokenize(theme));
  const oosTokens = new Set(tokenize(oos));
  for (const t of themeTokens) {
    if (oosTokens.has(t)) {
      warnings.push(
        `Theme "${theme}" overlaps with charter Out of Scope section (matched token: "${t}").`
      );
      break;
    }
  }
  return { warnings };
}

// ─── Label / Issue-Number Helpers ───────────────────────────

function hasEpicLabel(labels) {
  if (!Array.isArray(labels)) return false;
  for (const l of labels) {
    if (typeof l === 'string' && l === 'epic') return true;
    if (l && typeof l === 'object' && l.name === 'epic') return true;
  }
  return false;
}

function parseCreatedIssueNumber(text) {
  if (!text) return null;
  const m = text.match(/#(\d+)|\/issues\/(\d+)/);
  if (!m) return null;
  return parseInt(m[1] || m[2], 10);
}

// ─── Pure Pipeline ──────────────────────────────────────────

/**
 * @param {{theme:string, sourceIssue?:number, priority?:string, assignBranch?:boolean}} args
 * @param {object} deps - Injected I/O for testability.
 *   readCharter()           → string|null
 *   createIssue({theme, body, priority}) → { number, labels, rawOutput }
 *   verifyLabels(number)    → label[]
 *   currentBranch()         → string|null
 *   assignBranch(number, branch) → { ok }
 */
function run(args, deps) {
  const errors = [];
  const warnings = [];
  let epicNumber = null;
  let labelsVerified = false;
  let branchAssigned = false;
  let branch = null;

  const theme = args.theme;
  const priority = args.priority || 'p2';

  // 1. Charter scope check (warnings only)
  let charterText = null;
  try { charterText = deps.readCharter(); } catch (_e) { charterText = null; }
  warnings.push(...validateCharterScope(theme, charterText).warnings);

  // 2. Create issue
  const body = buildEpicBody({ theme, sourceIssue: args.sourceIssue });
  let created;
  try {
    created = deps.createIssue({ theme, body, priority });
  } catch (e) {
    errors.push(`gh pmu create failed: ${e.message}`);
    return {
      ok: false,
      epicNumber: null,
      labelsVerified: false,
      branchAssigned: false,
      branch: null,
      errors,
      warnings
    };
  }

  epicNumber = created && created.number
    ? created.number
    : parseCreatedIssueNumber(created && created.rawOutput);

  // 3. Verify epic label is actually present (always re-fetch — don't trust
  //    the createIssue return, since the whole point of the gate is to catch
  //    silent label-miss after gh pmu create).
  let labels = [];
  if (epicNumber) {
    try { labels = deps.verifyLabels(epicNumber); } catch (_e) { labels = []; }
  }
  labelsVerified = hasEpicLabel(labels);
  if (!labelsVerified) {
    errors.push(
      `Created issue #${epicNumber} is missing the \`epic\` label after gh pmu create.`
    );
  }

  // 4. Branch assignment (optional)
  if (args.assignBranch && epicNumber) {
    try { branch = deps.currentBranch(); } catch (_e) { branch = null; }
    if (!branch) {
      warnings.push('--assign-branch requested but no current branch detected; skipped.');
    } else {
      try {
        const r = deps.assignBranch(epicNumber, branch);
        if (r && r.ok) {
          branchAssigned = true;
        } else {
          warnings.push(`Branch assignment to "${branch}" did not succeed.`);
        }
      } catch (e) {
        warnings.push(`Branch assignment failed: ${e.message}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    epicNumber,
    labelsVerified,
    branchAssigned,
    branch,
    errors,
    warnings
  };
}

// ─── Real I/O bindings (used only by main) ──────────────────

function readCharterReal() {
  const p = path.resolve(process.cwd(), 'CHARTER.md');
  try { return fs.readFileSync(p, 'utf-8'); } catch (_e) { return null; }
}

function createIssueReal({ theme, body, priority }) {
  const tmp = `.tmp-epic-body-${process.pid}.md`;
  fs.writeFileSync(tmp, body, 'utf-8');
  try {
    const raw = execFileSync('gh', [
      'pmu', 'create',
      '--title', `Epic: ${theme}`,
      '--label', 'epic',
      '--status', 'backlog',
      '--priority', priority,
      '--assignee', '@me',
      '-F', tmp
    ], { encoding: 'utf-8' });
    const number = parseCreatedIssueNumber(raw);
    return { number, labels: null, rawOutput: raw };
  } finally {
    try { fs.unlinkSync(tmp); } catch (_e) { /* best effort */ }
  }
}

function verifyLabelsReal(number) {
  try {
    const raw = execFileSync('gh', [
      'pmu', 'view', String(number), '--json=labels'
    ], { encoding: 'utf-8' });
    return JSON.parse(raw).labels || [];
  } catch (_e) {
    return [];
  }
}

function currentBranchReal() {
  try {
    return execFileSync('git', ['branch', '--show-current'], { encoding: 'utf-8' }).trim() || null;
  } catch (_e) {
    return null;
  }
}

function assignBranchReal(number, _branch) {
  execFileSync('gh', ['pmu', 'move', String(number), '--branch', 'current'], {
    encoding: 'utf-8'
  });
  return { ok: true };
}

// ─── Main ───────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    process.stderr.write(args.error + '\n');
    process.exit(2);
    return;
  }
  if (args.schema) {
    process.stdout.write(JSON.stringify(ENVELOPE_SCHEMA, null, 2) + '\n');
    process.exit(0);
    return;
  }

  const envelope = run(args, {
    readCharter: readCharterReal,
    createIssue: createIssueReal,
    verifyLabels: verifyLabelsReal,
    currentBranch: currentBranchReal,
    assignBranch: assignBranchReal
  });

  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
  process.exit(envelope.ok ? 0 : 1);
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  buildEpicBody,
  validateCharterScope,
  hasEpicLabel,
  parseCreatedIssueNumber,
  run,
  main,
  ENVELOPE_SCHEMA
};
