#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.91.1
 * @description Concurrent workstream planning — argument parsing, analysis, and execution. Handles deterministic operations for /plan-workstreams: argument validation, directory scanning, module boundary detection, conflict risk matrix computation, workstream grouping via union-find, and branch creation with .workstreams.json metadata.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const { execSync } = require('child_process');

/**
 * Parse command arguments for /plan-workstreams.
 *
 * @param {string[]} args - Raw argument tokens
 * @returns {object} Parsed options or { error: string }
 */
function parseArgs(args) {
  if (!args || args.length === 0) {
    return { error: 'No arguments provided. Usage: /plan-workstreams <epic-numbers> [--streams N] [--dry-run] [--prefix <prefix>] [--cancel]' };
  }

  const result = {
    epics: [],
    streams: 2,
    prefix: 'workstream/',
    dryRun: false,
    force: false,
    mode: 'plan'
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--cancel') {
      result.mode = 'cancel';
      i++;
      continue;
    }

    if (arg === '--force') {
      result.force = true;
      i++;
      continue;
    }

    if (arg === '--dry-run') {
      result.dryRun = true;
      i++;
      continue;
    }

    if (arg === '--streams') {
      i++;
      const val = parseInt(args[i], 10);
      if (isNaN(val) || val < 1) {
        return { error: '--streams must be a positive integer (got: ' + args[i] + ')' };
      }
      result.streams = val;
      i++;
      continue;
    }

    if (arg === '--prefix') {
      i++;
      if (!args[i]) {
        return { error: '--prefix requires a value' };
      }
      result.prefix = args[i];
      i++;
      continue;
    }

    if (arg.startsWith('--')) {
      return { error: 'Unknown flag: ' + arg + '. Usage: /plan-workstreams <epic-numbers> [--streams N] [--dry-run] [--prefix <prefix>] [--cancel]' };
    }

    // Parse as epic number
    const num = parseInt(arg.replace(/^#/, ''), 10);
    if (isNaN(num)) {
      return { error: 'Invalid epic reference: ' + arg + '. Epic numbers must be numeric (e.g., #100 or 100).' };
    }
    if (!result.epics.includes(num)) {
      result.epics.push(num);
    }
    i++;
  }

  // Validation
  if (result.force && result.mode !== 'cancel') {
    return { error: '--force can only be used with --cancel' };
  }

  if (result.mode === 'cancel') {
    // Cancel mode does not require epic numbers
    return result;
  }

  if (result.epics.length < 2) {
    return { error: 'at least 2 epic numbers required for workstream planning. Got: ' + result.epics.length };
  }

  return result;
}

/**
 * Validate that epic issues exist and have the epic label.
 *
 * @param {number[]} epics - Epic issue numbers
 * @returns {Promise<{valid: object[], errors: string[]}>}
 */
async function validateEpics(epics) {
  const valid = [];
  const errors = [];

  for (const num of epics) {
    try {
      const output = execSync(
        `gh issue view ${num} --json number,title,labels,state`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      const issue = JSON.parse(output);

      if (issue.state !== 'OPEN') {
        errors.push(`Issue #${num} is ${issue.state.toLowerCase()}, not open.`);
        continue;
      }

      const labels = issue.labels.map(l => l.name);
      if (!labels.includes('epic')) {
        errors.push(`Issue #${num} ("${issue.title}") is not an epic — missing "epic" label.`);
        continue;
      }

      valid.push({ number: issue.number, title: issue.title });
    } catch {
      errors.push(`Issue #${num} not found.`);
    }
  }

  return { valid, errors };
}

/**
 * Extract module hints (directory/file path references) from text.
 *
 * Scans for path-like patterns in backtick-delimited references and
 * bare path patterns. Returns deduplicated array of path strings.
 *
 * @param {string|null|undefined} text - Text to scan for path references
 * @returns {string[]} Deduplicated array of extracted path references
 */
function extractModuleHints(text) {
  if (!text) return [];

  const hints = new Set();

  // Match backtick-delimited paths: `some/path/` or `file.ext`
  const backtickPaths = text.match(/`([^`]*\/[^`]*)`|`([^`]*\.[a-z]{1,5})`/g);
  if (backtickPaths) {
    for (const match of backtickPaths) {
      const path = match.replace(/`/g, '');
      if (path && !path.startsWith('http') && !path.startsWith('#')) {
        hints.add(path);
      }
    }
  }

  // Match bare directory paths in text (word/word/ pattern)
  const barePaths = text.match(/(?:^| )(\.?[a-zA-Z][a-zA-Z0-9_.-]*\/[a-zA-Z0-9_./-]+)/gm);
  if (barePaths) {
    for (const match of barePaths) {
      const path = match.trim();
      if (path && !path.startsWith('http') && !path.startsWith('#')) {
        hints.add(path);
      }
    }
  }

  return Array.from(hints);
}

/**
 * Build a structured epic-to-module mapping.
 *
 * Combines module hints from the epic body and all sub-issue bodies
 * into a single deduplicated mapping structure.
 *
 * @param {object} epic - Epic data { number, title, body }
 * @param {object[]} subIssues - Sub-issue data [{ number, title, body }]
 * @returns {object} Mapping { epic, title, modules, subIssueCount }
 */
function buildEpicMapping(epic, subIssues) {
  const allModules = new Set();

  // Extract from epic body
  const epicHints = extractModuleHints(epic.body);
  for (const hint of epicHints) {
    allModules.add(hint);
  }

  // Extract from sub-issue bodies
  for (const sub of subIssues) {
    const subHints = extractModuleHints(sub.body);
    for (const hint of subHints) {
      allModules.add(hint);
    }
  }

  return {
    epic: epic.number,
    title: epic.title,
    modules: Array.from(allModules),
    subIssueCount: subIssues.length
  };
}

/**
 * Patterns that indicate utility/shared modules (LOW risk when shared).
 */
const UTILITY_PATTERNS = ['lib/', 'utils/', 'shared/', 'helpers/', 'common/'];

/**
 * Scan repository directory structure to identify module boundaries.
 *
 * Returns a map of top-level directories to their file counts.
 *
 * @param {string} repoRoot - Absolute path to repository root
 * @returns {object} Map of directory name → { fileCount }
 */
function scanDirectories(repoRoot) {
  const result = {};

  try {
    const entries = require('fs').readdirSync(repoRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Skip hidden dirs (except .claude, .github) and node_modules
      if (entry.name === 'node_modules') continue;
      if (entry.name.startsWith('.') && entry.name !== '.claude' && entry.name !== '.github') continue;

      const dirPath = require('path').join(repoRoot, entry.name);
      const fileCount = countFiles(dirPath);
      result[entry.name] = { fileCount };
    }
  } catch {
    // Return empty map for non-existent paths
  }

  return result;
}

/**
 * Count files recursively in a directory.
 * @param {string} dir - Directory path
 * @returns {number}
 */
function countFiles(dir) {
  let count = 0;
  try {
    const entries = require('fs').readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;
      if (entry.isFile()) {
        count++;
      } else if (entry.isDirectory()) {
        count += countFiles(require('path').join(dir, entry.name));
      }
    }
  } catch {
    // skip unreadable dirs
  }
  return count;
}

/**
 * Check if a module path matches utility/shared patterns.
 * @param {string} modulePath
 * @returns {boolean}
 */
function isUtilityModule(modulePath) {
  const normalized = modulePath.toLowerCase();
  return UTILITY_PATTERNS.some(p => normalized.includes(p));
}

/**
 * Compute conflict risk between two epic mappings.
 *
 * @param {object} epicA - Mapping { epic, modules }
 * @param {object} epicB - Mapping { epic, modules }
 * @returns {object} { epicA, epicB, risk, sharedModules }
 */
function computeConflictRisk(epicA, epicB) {
  const shared = epicA.modules.filter(m => epicB.modules.includes(m));

  if (shared.length === 0) {
    return { epicA: epicA.epic, epicB: epicB.epic, risk: 'NONE', sharedModules: [] };
  }

  // Check if any shared module is non-utility (primary)
  const hasPrimaryShared = shared.some(m => !isUtilityModule(m));

  return {
    epicA: epicA.epic,
    epicB: epicB.epic,
    risk: hasPrimaryShared ? 'HIGH' : 'LOW',
    sharedModules: shared
  };
}

/**
 * Build a full conflict risk matrix for all epic pairs.
 *
 * @param {object[]} mappings - Array of { epic, modules }
 * @returns {object[]} Array of { epicA, epicB, risk, sharedModules }
 */
function buildConflictMatrix(mappings) {
  const matrix = [];
  for (let i = 0; i < mappings.length; i++) {
    for (let j = i + 1; j < mappings.length; j++) {
      matrix.push(computeConflictRisk(mappings[i], mappings[j]));
    }
  }
  return matrix;
}

/**
 * Group epics into workstreams using a greedy partitioning algorithm.
 *
 * Strategy:
 * 1. Build connected components from HIGH-risk pairs (must be co-located)
 * 2. Sort components by story count descending
 * 3. Greedily assign to workstreams, balancing story count
 *
 * @param {object[]} conflictMatrix - Array of { epicA, epicB, risk, sharedModules }
 * @param {object[]} epicData - Array of { epic, title, modules, subIssueCount }
 * @param {object} options - { streams: number }
 * @returns {object} { workstreams: [{ epics, storyCount, rationale }] }
 */
function groupWorkstreams(conflictMatrix, epicData, options) {
  const { streams } = options;

  // Build adjacency map for HIGH-risk pairs (union-find approach)
  const parent = {};
  for (const ed of epicData) {
    parent[ed.epic] = ed.epic;
  }

  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  // Merge HIGH-risk pairs into connected components
  for (const pair of conflictMatrix) {
    if (pair.risk === 'HIGH') {
      union(pair.epicA, pair.epicB);
    }
  }

  // Build component groups
  const componentMap = {};
  for (const ed of epicData) {
    const root = find(ed.epic);
    if (!componentMap[root]) componentMap[root] = [];
    componentMap[root].push(ed.epic);
  }

  // Convert to array with story counts
  const components = Object.values(componentMap).map(epics => {
    const storyCount = epics.reduce((sum, e) => {
      const data = epicData.find(d => d.epic === e);
      return sum + (data ? data.subIssueCount : 0);
    }, 0);
    return { epics, storyCount };
  });

  // Sort components by story count descending (largest first for better balancing)
  components.sort((a, b) => b.storyCount - a.storyCount);

  // Initialize workstreams
  const workstreams = [];
  for (let i = 0; i < streams; i++) {
    workstreams.push({ epics: [], storyCount: 0, rationale: '' });
  }

  // Greedy assignment: place each component into the workstream with fewest stories
  for (const component of components) {
    // Find workstream with minimum story count
    let minIdx = 0;
    for (let i = 1; i < workstreams.length; i++) {
      if (workstreams[i].storyCount < workstreams[minIdx].storyCount) {
        minIdx = i;
      }
    }
    workstreams[minIdx].epics.push(...component.epics);
    workstreams[minIdx].storyCount += component.storyCount;
  }

  // Generate rationale for each workstream
  for (const ws of workstreams) {
    if (ws.epics.length === 0) continue;

    const hasHighRisk = ws.epics.length > 1 && conflictMatrix.some(p =>
      p.risk === 'HIGH' && ws.epics.includes(p.epicA) && ws.epics.includes(p.epicB)
    );

    if (hasHighRisk) {
      ws.rationale = 'HIGH-risk pairs co-located to avoid merge conflicts';
    } else if (ws.epics.length === 1) {
      ws.rationale = 'Isolated scope — no cross-epic conflicts';
    } else {
      ws.rationale = 'Balanced by story count — no HIGH-risk conflicts';
    }
  }

  return { workstreams };
}

/**
 * Validate a user adjustment to the workstream grouping.
 *
 * Rejects adjustments that would split HIGH-risk pairs across workstreams.
 *
 * @param {object} plan - Current plan { workstreams: [{ epics, storyCount, rationale }] }
 * @param {object} adjustment - { epic, fromStream, toStream }
 * @param {object[]} conflictMatrix - Conflict risk matrix
 * @returns {object} { valid: boolean, warning?: string }
 */
function validateAdjustment(plan, adjustment, conflictMatrix) {
  const { epic, fromStream } = adjustment;

  // Get the epics that will remain in fromStream after the move
  const remainingInSource = plan.workstreams[fromStream].epics.filter(e => e !== epic);

  // Check if moving this epic away splits a HIGH-risk pair
  for (const otherEpic of remainingInSource) {
    const pair = conflictMatrix.find(p =>
      p.risk === 'HIGH' &&
      ((p.epicA === epic && p.epicB === otherEpic) ||
       (p.epicA === otherEpic && p.epicB === epic))
    );
    if (pair) {
      return {
        valid: false,
        warning: `Cannot split HIGH-risk pair: #${epic} and #${otherEpic} share primary modules (${pair.sharedModules.join(', ')})`
      };
    }
  }

  return { valid: true };
}

/**
 * Build the final plan output for writing to .tmp-plan.json.
 *
 * @param {object} grouping - { workstreams: [{ epics, storyCount, rationale }] }
 * @param {object[]} epicData - Array of { epic, title, modules, subIssueCount }
 * @param {object} options - { streams, prefix, dryRun }
 * @returns {object} Plan object for JSON serialization
 */
function buildPlanOutput(grouping, epicData, options) {
  const workstreams = grouping.workstreams.map((ws, index) => {
    const epicDetails = ws.epics.map(epicNum => {
      const data = epicData.find(d => d.epic === epicNum);
      return {
        number: epicNum,
        title: data ? data.title : `Epic #${epicNum}`,
        storyCount: data ? data.subIssueCount : 0
      };
    });

    return {
      index: index + 1,
      branch: `${options.prefix}${index + 1}`,
      epics: ws.epics,
      epicDetails,
      storyCount: ws.storyCount,
      rationale: ws.rationale
    };
  });

  return {
    workstreams,
    options: {
      streams: options.streams,
      prefix: options.prefix,
      dryRun: options.dryRun
    }
  };
}

/**
 * Build .workstreams.json metadata from an execution plan.
 *
 * @param {object} plan - Plan from buildPlanOutput()
 * @param {string} sourceBranch - Current branch name
 * @param {string} sourceCommit - Current HEAD SHA
 * @returns {object} Metadata for .workstreams.json
 */
function buildWorkstreamsMetadata(plan, sourceBranch, sourceCommit) {
  const streams = plan.workstreams.map(ws => ({
    branch: ws.branch,
    epics: ws.epics,
    epicDetails: ws.epicDetails,
    storyCount: ws.storyCount,
    rationale: ws.rationale,
    status: 'active'
  }));

  return {
    created: new Date().toISOString(),
    sourceBranch,
    sourceCommit,
    streams,
    mergeOrder: plan.workstreams.map(ws => ws.branch)
  };
}

/**
 * Generate shell commands for plan execution.
 *
 * Returns an ordered list of commands to create branches and assign epics.
 * The caller is responsible for executing these commands.
 *
 * @param {object} plan - Plan from buildPlanOutput()
 * @returns {object[]} Array of { type, command, branch?, epic? }
 */
function generateExecutionCommands(plan) {
  const commands = [];

  for (const ws of plan.workstreams) {
    // Branch creation
    commands.push({
      type: 'branch-start',
      branch: ws.branch,
      command: `gh pmu branch start --name ${ws.branch}`
    });

    // Epic assignments
    for (const epicNum of ws.epics) {
      commands.push({
        type: 'assign-epic',
        branch: ws.branch,
        epic: epicNum,
        command: `gh pmu move ${epicNum} --branch ${ws.branch}`
      });
    }
  }

  return commands;
}

/**
 * Format a worktree setup guide from execution metadata.
 *
 * Produces copy-pasteable git worktree commands, epic context,
 * and merge order recommendations.
 *
 * @param {object} metadata - From buildWorkstreamsMetadata()
 * @returns {string} Formatted guide text
 */
function formatWorktreeGuide(metadata) {
  const lines = [];

  lines.push('## Worktree Setup Guide');
  lines.push('');
  lines.push(`Source branch: ${metadata.sourceBranch}`);
  lines.push(`Source commit: ${metadata.sourceCommit}`);
  lines.push('');
  lines.push('### Setup Commands');
  lines.push('');

  for (const stream of metadata.streams) {
    const worktreePath = `../${stream.branch.replace(/\//g, '-')}`;
    lines.push(`# ${stream.branch}`);
    const epicSummary = stream.epicDetails
      .map(e => `#${e.number}: ${e.title} (${e.storyCount} stories)`)
      .join(', ');
    lines.push(`# Epics: ${epicSummary}`);
    lines.push(`git worktree add ${worktreePath} ${stream.branch}`);
    lines.push('');
  }

  if (metadata.mergeOrder.length > 1) {
    lines.push('### Merge Order');
    lines.push('');
    lines.push('When workstreams complete, merge in this order to minimize conflicts:');
    metadata.mergeOrder.forEach((branch, i) => {
      lines.push(`${i + 1}. ${branch}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Load and parse .workstreams.json metadata.
 *
 * @param {string} filePath - Path to .workstreams.json
 * @returns {object} { found: boolean, metadata?: object, error?: string }
 */
function loadWorkstreamsMetadata(filePath) {
  try {
    const content = require('fs').readFileSync(filePath, 'utf8');
    const metadata = JSON.parse(content);
    return { found: true, metadata };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { found: false, error: 'No active workstream plan found. Run /plan-workstreams first.' };
    }
    return { found: false, error: `Failed to parse .workstreams.json: ${err.message}` };
  }
}

/**
 * Check if a branch has commits beyond the source commit.
 *
 * Uses git log to count commits between sourceCommit and branch tip.
 *
 * @param {string} branch - Branch name or ref
 * @param {string} sourceCommit - SHA or ref of the source commit
 * @returns {object} { safe: boolean, commitCount: number, requiresForce?: boolean, error?: string }
 */
function checkBranchCommits(branch, sourceCommit) {
  try {
    const output = execSync(
      `git log --oneline ${sourceCommit}..${branch}`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const lines = output.trim().split('\n').filter(l => l.length > 0);
    const commitCount = lines.length;

    if (commitCount === 0) {
      return { safe: true, commitCount: 0 };
    }

    return { safe: false, commitCount, requiresForce: true };
  } catch {
    return { safe: false, commitCount: -1, requiresForce: true, error: 'Could not determine commit history — branch or commit may not exist' };
  }
}

/**
 * Build a cancellation plan from metadata and commit checks.
 *
 * @param {object} metadata - From loadWorkstreamsMetadata()
 * @param {object[]} commitChecks - Array of { branch, safe, commitCount, requiresForce? }
 * @returns {object} { safe: boolean, requiresForce?: boolean, branches: [{ branch, safe, commitCount, epicDetails, action }] }
 */
function buildCancelPlan(metadata, commitChecks) {
  const branches = metadata.streams.map(stream => {
    const check = commitChecks.find(c => c.branch === stream.branch) || { safe: true, commitCount: 0 };
    return {
      branch: stream.branch,
      safe: check.safe,
      commitCount: check.commitCount,
      epicDetails: stream.epicDetails,
      action: check.safe ? 'delete branch' : `${check.commitCount} commits found — requires --force`
    };
  });

  const allSafe = branches.every(b => b.safe);

  return {
    safe: allSafe,
    requiresForce: !allSafe,
    sourceBranch: metadata.sourceBranch,
    branches
  };
}

/**
 * Build commands for epic disposition during cancel.
 *
 * @param {object} metadata - From loadWorkstreamsMetadata()
 * @param {string} disposition - 'return' | 'backlog' | 'reassign'
 * @param {string} [targetBranch] - Required when disposition is 'reassign'
 * @returns {object[]} Array of { type, command, epic }
 */
function buildEpicDispositionCommands(metadata, disposition, targetBranch) {
  const commands = [];

  // Collect all epics from all streams
  const allEpics = [];
  for (const stream of metadata.streams) {
    for (const epicNum of stream.epics) {
      if (!allEpics.includes(epicNum)) {
        allEpics.push(epicNum);
      }
    }
  }

  for (const epicNum of allEpics) {
    let command;
    if (disposition === 'return') {
      command = `gh pmu move ${epicNum} --branch ${metadata.sourceBranch}`;
    } else if (disposition === 'backlog') {
      command = `gh pmu move ${epicNum} --backlog`;
    } else if (disposition === 'reassign') {
      command = `gh pmu move ${epicNum} --branch ${targetBranch}`;
    }

    commands.push({
      type: 'move-epic',
      epic: epicNum,
      command
    });
  }

  return commands;
}

/**
 * Build commands for branch cleanup during cancel.
 *
 * Processes branches in reverse mergeOrder (last created → first created)
 * to avoid dependency issues.
 *
 * @param {object} metadata - From loadWorkstreamsMetadata()
 * @returns {object[]} Array of { type, command, branch? }
 */
function buildBranchCleanupCommands(metadata) {
  const commands = [];
  const reversedBranches = [...metadata.mergeOrder].reverse();

  for (const branch of reversedBranches) {
    // Close branch tracker via gh pmu
    commands.push({
      type: 'close-branch',
      branch,
      command: `gh pmu branch close --name ${branch} --yes`
    });

    // Delete remote branch
    commands.push({
      type: 'delete-remote',
      branch,
      command: `git push origin --delete ${branch}`
    });

    // Delete local branch
    commands.push({
      type: 'delete-local',
      branch,
      command: `git branch -D ${branch}`
    });
  }

  // Remove .workstreams.json metadata
  commands.push({
    type: 'remove-metadata',
    command: 'git rm .workstreams.json'
  });

  return commands;
}

/**
 * Check if solo mode is active and return advisory info.
 *
 * Reads reviewMode from framework-config.json. When "solo", returns
 * an advisory message informing the user that workstreams are designed
 * for parallel sessions.
 *
 * @param {string} configPath - Path to framework-config.json
 * @returns {object} { showAdvisory: boolean, message?: string }
 */
function checkSoloMode(configPath) {
  try {
    const content = require('fs').readFileSync(configPath, 'utf8');
    const config = JSON.parse(content);

    if (config.reviewMode === 'solo') {
      return {
        showAdvisory: true,
        message: 'Workstreams are designed for parallel Claude Code sessions. In solo mode, you\'ll need to switch between worktrees manually.'
      };
    }

    return { showAdvisory: false };
  } catch {
    return { showAdvisory: false };
  }
}

/**
 * Format a worktree cleanup reminder after cancel.
 *
 * Checks worktree list against cancelled branches and generates
 * copy-pasteable removal commands for stale worktrees.
 *
 * @param {string[]} cancelledBranches - Branch names that were deleted
 * @param {object[]} worktreeList - Parsed worktrees [{ path, branch }]
 * @returns {string|null} Reminder text, or null if no stale worktrees
 */
function formatWorktreeCleanupReminder(cancelledBranches, worktreeList) {
  if (!cancelledBranches || cancelledBranches.length === 0) return null;
  if (!worktreeList || worktreeList.length === 0) return null;

  const stale = worktreeList.filter(wt => cancelledBranches.includes(wt.branch));
  if (stale.length === 0) return null;

  const lines = [];
  lines.push('## Worktree Cleanup Reminder');
  lines.push('');
  lines.push(`Found ${stale.length} stale worktree${stale.length > 1 ? 's' : ''} referencing cancelled branches.`);
  lines.push('Remove them manually with:');
  lines.push('');

  for (const wt of stale) {
    const quotedPath = wt.path.includes(' ') ? `"${wt.path}"` : wt.path;
    lines.push(`git worktree remove ${quotedPath}`);
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Check if a merged branch is a workstream and detect active siblings.
 *
 * Returns information about the merge's impact on the workstream plan:
 * updated metadata with the merged branch's status changed, active siblings
 * that need rebasing, and whether all workstreams are now merged.
 *
 * @param {object|null} metadata - From loadWorkstreamsMetadata(), or null if absent
 * @param {string} mergedBranch - Branch name that was just merged
 * @returns {object} { isWorkstream, updatedMetadata?, activeSiblings, allMerged }
 */
function postMergeWorkstreamCheck(metadata, mergedBranch) {
  if (!metadata) {
    return { isWorkstream: false, activeSiblings: [], allMerged: false };
  }

  const streamIndex = metadata.streams.findIndex(s => s.branch === mergedBranch);
  if (streamIndex === -1) {
    return { isWorkstream: false, activeSiblings: [], allMerged: false };
  }

  // Deep clone to avoid mutation
  const updated = JSON.parse(JSON.stringify(metadata));
  updated.streams[streamIndex].status = 'merged';

  const activeSiblings = updated.streams.filter(
    s => s.branch !== mergedBranch && s.status === 'active'
  );

  const allMerged = updated.streams.every(s => s.status === 'merged');

  return {
    isWorkstream: true,
    updatedMetadata: updated,
    activeSiblings,
    allMerged
  };
}

/**
 * Format a warning about active sibling workstreams that need rebasing.
 *
 * @param {object[]} siblings - Active sibling streams [{ branch, epics, epicDetails, status }]
 * @param {string[]} [sharedModules] - Optional list of shared modules for conflict warning
 * @returns {string} Formatted warning text, or empty string if no siblings
 */
function formatSiblingWarning(siblings, sharedModules) {
  if (!siblings || siblings.length === 0) return '';

  const lines = [];
  lines.push('## Active Sibling Workstreams');
  lines.push('');
  lines.push('The following workstreams are still active and should rebase onto main:');
  lines.push('');

  for (const sibling of siblings) {
    const epicSummary = sibling.epicDetails
      .map(e => `#${e.number}: ${e.title}`)
      .join(', ');
    lines.push(`- **${sibling.branch}** — Epics: ${epicSummary}`);
  }

  lines.push('');
  lines.push('### Rebase Instructions');
  lines.push('');
  lines.push('For each active workstream, run:');
  lines.push('```');
  lines.push('git fetch origin main && git rebase origin/main');
  lines.push('```');

  if (sharedModules && sharedModules.length > 0) {
    lines.push('');
    lines.push('### Potential Merge Conflicts');
    lines.push('');
    lines.push('These shared modules may cause conflicts during rebase:');
    for (const mod of sharedModules) {
      lines.push(`- \`${mod}\``);
    }
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Check if a branch targeted for destruction is a workstream member.
 *
 * Returns expanded confirmation context: assigned epics, active siblings,
 * and an orphan warning if epics will lose their branch assignment.
 *
 * @param {object|null} metadata - From loadWorkstreamsMetadata(), or null if absent
 * @param {string} branchName - Branch being destroyed
 * @returns {object} { isWorkstream, assignedEpics?, activeSiblings, orphanWarning? }
 */
function preDestroyWorkstreamCheck(metadata, branchName) {
  if (!metadata) {
    return { isWorkstream: false, activeSiblings: [] };
  }

  const stream = metadata.streams.find(s => s.branch === branchName);
  if (!stream) {
    return { isWorkstream: false, activeSiblings: [] };
  }

  const activeSiblings = metadata.streams.filter(
    s => s.branch !== branchName && s.status === 'active'
  );

  const assignedEpics = stream.epicDetails || [];
  const orphanWarning = assignedEpics.length > 0
    ? `${assignedEpics.length} epic(s) will be orphaned: ${assignedEpics.map(e => `#${e.number}`).join(', ')}`
    : null;

  return {
    isWorkstream: true,
    assignedEpics,
    activeSiblings,
    orphanWarning
  };
}

/**
 * Update workstream metadata after branch destruction.
 *
 * Sets the destroyed branch's status to "destroyed" and provides
 * epic reassignment options based on available active siblings.
 *
 * @param {object} metadata - From loadWorkstreamsMetadata()
 * @param {string} branchName - Branch that was destroyed
 * @returns {object} { updatedMetadata, orphanedEpics, reassignmentOptions }
 */
function postDestroyWorkstreamUpdate(metadata, branchName) {
  // Deep clone to avoid mutation
  const updated = JSON.parse(JSON.stringify(metadata));

  const streamIndex = updated.streams.findIndex(s => s.branch === branchName);
  if (streamIndex !== -1) {
    updated.streams[streamIndex].status = 'destroyed';
  }

  // Collect orphaned epics
  const stream = metadata.streams.find(s => s.branch === branchName);
  const orphanedEpics = stream ? [...stream.epics] : [];

  // Build reassignment options from active siblings
  const activeSiblings = updated.streams.filter(
    s => s.branch !== branchName && s.status === 'active'
  );

  const reassignmentOptions = activeSiblings.map(s => ({
    branch: s.branch,
    epics: s.epicDetails,
    label: `Move to ${s.branch} (${s.epicDetails.map(e => `#${e.number}`).join(', ')})`
  }));

  return {
    updatedMetadata: updated,
    orphanedEpics,
    reassignmentOptions
  };
}

async function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  if (parsed.error) {
    console.error('Error: ' + parsed.error);
    process.exit(1);
  }

  console.log(JSON.stringify(parsed, null, 2));
}

// Export for testing
module.exports = {
  parseArgs, validateEpics, extractModuleHints, buildEpicMapping,
  scanDirectories, computeConflictRisk, buildConflictMatrix,
  groupWorkstreams, validateAdjustment, buildPlanOutput,
  buildWorkstreamsMetadata, generateExecutionCommands, formatWorktreeGuide,
  checkSoloMode, loadWorkstreamsMetadata, checkBranchCommits, buildCancelPlan,
  buildEpicDispositionCommands, buildBranchCleanupCommands,
  formatWorktreeCleanupReminder,
  postMergeWorkstreamCheck, formatSiblingWarning,
  preDestroyWorkstreamCheck, postDestroyWorkstreamUpdate
};

if (require.main === module) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
