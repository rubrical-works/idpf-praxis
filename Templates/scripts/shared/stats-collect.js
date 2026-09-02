#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.100.1
 * @description Collects development statistics from git history using config-driven
 *   metric definitions. Returns structured JSON for the /idpf-stats command to render.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

// Spawns bounded via lib/exec.js (#2469) — aliased to the original names
// so call sites are unchanged.
const { execTimed: execSync, execFileTimed } = require('./lib/exec.js');
const path = require('path');
const fs = require('fs');

/**
 * Parse command-line arguments for date range.
 * All dates use the user's local timezone.
 * @param {string[]} args - Command-line arguments
 * @returns {{ since: string, until: string }}
 */
const OLD_CACHE_PATH = path.resolve(__dirname, '../../metadata/idpf-stats-repos.json');
const STATS_DIR = path.resolve(__dirname, '../../../idpf-stats');
const CACHE_PATH = path.join(STATS_DIR, 'repos.json');

function parseArgs(args) {
  let since = null;
  let until = null;
  let today = false;
  let date = null;
  let repos;
  let useCache;
  let reposEdit = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--since' && args[i + 1]) {
      since = args[++i];
    } else if (args[i] === '--until' && args[i + 1]) {
      until = args[++i];
    } else if (args[i] === '--today') {
      today = true;
    } else if (args[i] === '--date' && args[i + 1]) {
      date = args[++i];
    } else if (args[i] === '--repos') {
      if (args[i + 1] && !args[i + 1].startsWith('--')) {
        repos = args[++i].split(',').map(s => s.trim()).filter(Boolean);
      } else {
        repos = [];
        useCache = true;
      }
    } else if (args[i] === '--repos-edit') {
      reposEdit = true;
    }
  }

  // Mutual-exclusion validation for --today and --date
  if (today && (since || until || date)) {
    throw new Error('--today cannot be combined with --since/--until/--date');
  }
  if (date && (since || until || today)) {
    throw new Error('--date cannot be combined with --since/--until/--today');
  }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Invalid date format. Use YYYY-MM-DD.');
  }

  // --date is a shortcut for --since DATE --until DATE
  if (date) {
    since = date;
    until = date;
  }
  // --today is a shortcut for the no-flag default; leaves since/until null
  // so the existing default block computes midnight..now.

  const tzOffset = getTzOffset();

  if (!since) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    since = formatLocalISO(d, tzOffset);
  } else {
    const d = new Date(since + 'T00:00:00');
    since = formatLocalISO(d, tzOffset);
  }

  if (!until) {
    until = formatLocalISO(new Date(), tzOffset);
  } else {
    const d = new Date(until + 'T23:59:59');
    until = formatLocalISO(d, tzOffset);
  }

  const result = { since, until };
  if (repos !== undefined) result.repos = repos;
  if (useCache) result.useCache = true;
  if (reposEdit) result.reposEdit = true;
  return result;
}

/**
 * Get local timezone offset string like "+05:00" or "-04:00".
 * @returns {string}
 */
function getTzOffset() {
  const match = new Date().toString().match(/([+-]\d{4})/);
  if (!match) return '+00:00';
  const raw = match[1];
  return raw.replace(/(\d{2})(\d{2})/, '$1:$2');
}

/**
 * Format a Date as local ISO 8601 with timezone offset.
 * @param {Date} d
 * @param {string} tzOffset - e.g., "-05:00"
 * @returns {string}
 */
function formatLocalISO(d, tzOffset) {
  const pad = (n) => String(n).padStart(2, '0');
  const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return iso + tzOffset;
}

/**
 * Safely execute a shell command, returning stdout as string.
 * Returns empty string on error.
 *
 * RETAINED for non-metric callers only. Do NOT route a metric probe through
 * this: it collapses failure into '', which every caller then coerces to 0, so
 * a broken probe and a genuine zero become the same number (#2675). Metric
 * probes use runGit()/walkTree(), which report failure as a reason string.
 *
 * @param {string} cmd
 * @param {string} [cwd]
 * @returns {string}
 */
function exec(cmd, cwd) {
  try {
    const result = execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return (typeof result === 'string' ? result : result.toString()).trim();
  } catch (e) {
    return '';
  }
}

/**
 * Run git with an argv array and NO shell.
 *
 * Every metric used to travel through a POSIX pipeline in execSync with no
 * `shell` option, which on win32 spawns cmd.exe rather than Git Bash. Measured
 * while fixing #2675, the failing SET turned out to be PATH-order dependent:
 * where Git's usr/bin precedes System32, `sort` and `find` resolve to the GNU
 * builds and those pipelines work, while `2>/dev/null` still fails (cmd.exe has
 * no /dev/null) and cmd.exe strips the backslashes out of a passed regex. A
 * different PATH order breaks a different subset.
 *
 * That is why this removes the shell instead of choosing a better one: the
 * defect is environmental, so repairing the three observed instances would
 * leave the class intact on the next machine. It also drops the quoting hazard
 * entirely — argv elements reach git verbatim.
 *
 * execFileTimed keeps the #2469 timeout bound; no external package is added,
 * which the deployed-helper dependency contract requires.
 *
 * @param {string[]} args
 * @param {string} [cwd]
 * @returns {{ ok: boolean, output: string, error: string|null }}
 */
function runGit(args, cwd) {
  try {
    const result = execFileTimed('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false
    });
    const output = typeof result === 'string' ? result : result.toString();
    return { ok: true, output: output.replace(/\s+$/, ''), error: null };
  } catch (e) {
    const detail = (e && e.stderr ? e.stderr.toString().trim() : '') || (e && e.message) || 'unknown error';
    return { ok: false, output: '', error: `git ${args[0] || ''} failed: ${detail}` };
  }
}

/** Non-empty lines of a command's stdout. */
function lines(output) {
  return output ? output.split('\n').map((l) => l.trim()).filter(Boolean) : [];
}

/** Directory names never counted as project sources. */
const SKIP_DIRS = new Set(['node_modules', '.git', '.min-mirror', 'dist', 'build', 'coverage', '.next', 'out']);

const TEST_FILE_RE = /(\.test\.|\.spec\.|^test_.*\.py$|_test\.go$)/;

/**
 * Walk a tree, yielding files matching a predicate.
 *
 * Replaces `find ... 2>/dev/null | grep -v node_modules`. The redirect was the
 * construct that actually broke under cmd.exe on the machine this was measured
 * on — cmd.exe has no /dev/null, so the whole pipeline failed and the caller
 * reported an inventory of 0 for a repo with 396 test files on disk.
 *
 * @returns {{ ok: boolean, files: string[], error: string|null }}
 */
function walkTree(root, predicate) {
  const files = [];
  try {
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop();
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue;
          stack.push(path.join(dir, entry.name));
        } else if (predicate(entry.name)) {
          files.push(path.join(dir, entry.name));
        }
      }
    }
    return { ok: true, files, error: null };
  } catch (e) {
    return { ok: false, files: [], error: `tree walk failed: ${(e && e.message) || 'unknown error'}` };
  }
}

/**
 * Collect all metrics for a given date range.
 * @param {{ since: string, until: string, cwd?: string }} opts
 * @returns {{ volume: object, testing: object, throughput: object|null, issues: string[], displayRange: object }}
 */
function collectMetrics(opts) {
  const { since, until, cwd } = opts;

  // Every probe records WHY it could not answer, rather than answering 0.
  // Present-and-empty on a clean run, so a consumer cannot mistake an older
  // payload for a healthy one (#2675 AC6).
  const unavailable = {};
  const range = [`--after=${since}`, `--until=${until}`];

  // Volume metrics
  const commitsResult = runGit(['log', ...range, '--oneline'], cwd);
  let commitCount = null;
  if (commitsResult.ok) commitCount = lines(commitsResult.output).length;
  else unavailable.commits = commitsResult.error;

  const filesResult = runGit(['log', ...range, '--pretty=format:', '--name-only'], cwd);
  let filesChanged = null;
  if (filesResult.ok) {
    // The `sort -u` the shell used to do, done in-process so the answer no
    // longer depends on which sort.exe wins on PATH.
    filesChanged = new Set(lines(filesResult.output)).size;
  } else {
    unavailable.filesChanged = filesResult.error;
  }

  const numstatResult = runGit(['log', ...range, '--pretty=format:', '--numstat'], cwd);
  let linesAdded = null;
  let linesRemoved = null;
  let byType = {};
  let byExtension = {};
  if (numstatResult.ok) {
    ({ added: linesAdded, removed: linesRemoved, byType, byExtension } = parseNumstat(numstatResult.output));
  } else {
    unavailable.linesAdded = numstatResult.error;
    unavailable.linesRemoved = numstatResult.error;
  }

  // Issue references
  let issues = [];
  const issueResult = runGit(['log', ...range, '--pretty=format:%s %b'], cwd);
  if (issueResult.ok) {
    issues = [...new Set(issueResult.output.match(/#[0-9]+/g) || [])].sort();
  } else {
    unavailable.issues = issueResult.error;
  }

  // Test metrics
  const testFiles = countTestFiles(cwd);
  if (testFiles === null) unavailable.testFiles = 'test-file inventory unreadable';
  const testCases = countTestCases(cwd);
  if (testCases === null) unavailable.testCases = 'test-case inventory unreadable';

  const newTestResult = runGit(['log', ...range, '--diff-filter=A', '--name-only', '--pretty=format:'], cwd);
  let newTestFiles = null;
  if (newTestResult.ok) {
    newTestFiles = lines(newTestResult.output).filter((f) => /\.(test|spec)\./.test(f)).length;
  } else {
    unavailable.newTestFiles = newTestResult.error;
  }

  // testsBefore is DERIVED, so it inherits its inputs' availability. Deriving
  // it from a zeroed testCases is what propagated a wrong number even where
  // its own probe worked (#2675 AC5).
  const testsBefore = testCases === null || newTestFiles === null ? null : testCases - newTestFiles;
  if (testsBefore === null) {
    unavailable.testsBefore = unavailable.testCases || unavailable.newTestFiles || 'derived from an unavailable input';
  }

  // Throughput
  let throughput = null;
  if (commitCount > 0) {
    const stampResult = runGit(['log', ...range, '--format=%aI'], cwd);
    const stamps = stampResult.ok ? lines(stampResult.output) : [];
    const earliest = stamps.length ? stamps[stamps.length - 1] : '';
    const latest = stamps.length ? stamps[0] : '';
    if (!stampResult.ok) unavailable.throughput = stampResult.error;
    const hours = computeHours(earliest, latest);
    throughput = {
      hours,
      commitsPerHour: round2(commitCount / hours),
      linesPerHour: round2(linesAdded / hours),
      issuesPerHour: round2(issues.length / hours)
    };
  }

  // Display range
  const sinceDate = since.slice(0, 10);
  const untilDate = until.slice(0, 10);
  const isSingleDay = sinceDate === untilDate;

  return {
    volume: {
      commits: commitCount,
      filesChanged,
      linesAdded,
      linesRemoved,
      netLines: linesAdded === null || linesRemoved === null ? null : linesAdded - linesRemoved,
      byType,
      byExtension
    },
    testing: {
      testFiles,
      testCases,
      newTestFiles,
      testsBefore
    },
    throughput,
    issues,
    unavailable,
    displayRange: {
      since: sinceDate,
      until: untilDate,
      isSingleDay
    }
  };
}

// File extension to category mappings (overridable via stats-config.json)
const DEFAULT_EXT_CATEGORIES = {
  Code: ['.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx', '.svelte', '.vue', '.py', '.go', '.rs', '.java', '.rb', '.php', '.sh', '.bash', '.zsh', '.ps1', '.css', '.scss', '.less', '.html', '.htm'],
  Documentation: ['.md', '.mdx', '.txt', '.rst', '.adoc'],
  Config: ['.json', '.yaml', '.yml', '.toml', '.ini', '.env', '.cfg', '.conf', '.xml']
};

/**
 * Categorize a filename into Code, Documentation, Config, or Other.
 * @param {string} filename
 * @param {object} [extCategories] - Override extension mappings
 * @returns {string}
 */
function categorizeFile(filename, extCategories) {
  const cats = extCategories || DEFAULT_EXT_CATEGORIES;
  const ext = path.extname(filename).toLowerCase();
  if (!ext) return 'Other';
  for (const [category, extensions] of Object.entries(cats)) {
    if (extensions.includes(ext)) return category;
  }
  return 'Other';
}

/**
 * Parse git numstat output into added/removed totals with file-type breakdown.
 * @param {string} output
 * @param {object} [extCategories] - Override extension-to-category mappings
 * @returns {{ added: number, removed: number, byType: object }}
 */
function parseNumstat(output, extCategories) {
  let added = 0;
  let removed = 0;
  const byType = {
    Code: { added: 0, removed: 0 },
    Documentation: { added: 0, removed: 0 },
    Config: { added: 0, removed: 0 },
    Other: { added: 0, removed: 0 }
  };
  const extCounts = {}; // per-extension raw counts
  if (!output) return { added, removed, byType, byExtension: {} };
  for (const line of output.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 3 && parts[0] !== '-') {
      const lineAdded = parseInt(parts[0], 10) || 0;
      const lineRemoved = parseInt(parts[1], 10) || 0;
      const filename = parts.slice(2).join(' ');
      added += lineAdded;
      removed += lineRemoved;
      const category = categorizeFile(filename, extCategories);
      byType[category].added += lineAdded;
      byType[category].removed += lineRemoved;
      // Per-extension counting with test file distinction
      const ext = getExtension(filename);
      if (ext && (lineAdded > 0 || lineRemoved > 0)) {
        if (!extCounts[ext]) extCounts[ext] = { added: 0, removed: 0 };
        extCounts[ext].added += lineAdded;
        extCounts[ext].removed += lineRemoved;
      }
    }
  }
  // Sort by added descending, filter out zero entries
  const byExtension = {};
  Object.entries(extCounts)
    .filter(([, v]) => v.added > 0 || v.removed > 0)
    .sort((a, b) => b[1].added - a[1].added)
    .forEach(([k, v]) => { byExtension[k] = v; });
  return { added, removed, byType, byExtension };
}

/**
 * Extract file extension with test/spec distinction.
 * ".test.js" and ".spec.js" are reported separately from ".js".
 */
function getExtension(filename) {
  if (!filename) return null;
  // Check for test/spec compound extensions first
  const testMatch = filename.match(/\.(test|spec)\.[^.]+$/);
  if (testMatch) return testMatch[0]; // e.g., ".test.js"
  // Standard extension
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx <= 0) return null;
  return filename.slice(dotIdx); // e.g., ".js"
}

/**
 * Count test files in the repository.
 *
 * A tree walk, not `find ... 2>/dev/null | grep -v node_modules`. That
 * redirect is what actually failed under cmd.exe on the machine #2675 was
 * measured on, and the swallowed failure reported 0 test files for a repo
 * carrying 396.
 *
 * @param {string} [cwd]
 * @returns {number|null} null when the tree cannot be read — NOT 0, which is
 *   a legitimate answer for a repo with no tests.
 */
function countTestFiles(cwd) {
  const { ok, files } = walkTree(cwd || '.', (name) => TEST_FILE_RE.test(name));
  return ok ? files.length : null;
}

/**
 * Count individual test cases.
 *
 * Reads matched files and counts regex hits in-process. The old pipeline
 * passed `^\s*(it|test)\(` through a shell that stripped its backslashes,
 * leaving grep the invalid pattern `^s*(it|test)(` — a non-zero exit that
 * exec() turned into 0. No shell means nothing to strip.
 *
 * @param {string} [cwd]
 * @returns {number|null} null when the tree cannot be read.
 */
function countTestCases(cwd) {
  // One walk, not one per language: the tree is walked for its own sake, and
  // a second pass over a large repo costs real time for no extra information.
  const { ok, files } = walkTree(
    cwd || '.',
    (name) => /\.(test|spec)\./.test(name) || name.endsWith('.py')
  );
  if (!ok) return null;

  let count = 0;
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (_e) {
      continue; // unreadable single file — the tree itself was readable
    }
    const pattern = file.endsWith('.py') ? /^[ \t]*def test_/gm : /^[ \t]*(it|test)\(/gm;
    count += (text.match(pattern) || []).length;
  }
  return count;
}

/**
 * Compute hours between two ISO timestamps. Minimum 1 hour.
 * @param {string} earliest
 * @param {string} latest
 * @returns {number}
 */
function computeHours(earliest, latest) {
  if (!earliest || !latest) return 1;
  const ms = new Date(latest).getTime() - new Date(earliest).getTime();
  const hours = ms / (1000 * 60 * 60);
  return Math.max(hours, 1);
}

function parseIntSafe(str) {
  const n = parseInt(str, 10);
  return isNaN(n) ? 0 : n;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ─── Multi-repo support ─────────────────────────────────────────

/**
 * Derive the GitHub owner/repo slug for a directory.
 * Tries .gh-pmu.json first, then git remote origin URL.
 * @param {string} dir
 * @returns {string|null} e.g., "rubrical-works/idpf-praxis-dev" or null
 */
function getRepoSlug(dir) {
  // Try .gh-pmu.json first
  const pmuPath = path.join(dir, '.gh-pmu.json');
  if (fs.existsSync(pmuPath)) {
    try {
      const pmu = JSON.parse(fs.readFileSync(pmuPath, 'utf8'));
      if (pmu.repositories && pmu.repositories[0]) {
        return pmu.repositories[0];
      }
    } catch (e) { /* fall through */ }
  }

  // Fall back to git remote
  try {
    const raw = execSync('git remote get-url origin', {
      cwd: dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
    });
    const url = (typeof raw === 'string' ? raw : raw.toString()).trim();
    // Handle HTTPS: https://github.com/owner/repo.git
    const httpsMatch = url.match(/github\.com\/([^/]+\/[^/.]+)/);
    if (httpsMatch) return httpsMatch[1];
    // Handle SSH: git@github.com:owner/repo.git
    const sshMatch = url.match(/github\.com:([^/]+\/[^/.]+)/);
    if (sshMatch) return sshMatch[1];
  } catch (e) { /* no remote */ }

  return null;
}

/**
 * Validate that a directory is a git repository.
 * @param {string} dir
 * @returns {boolean}
 */
function validateRepoDir(dir) {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Read cached repo list from disk.
 * Checks new location (idpf-stats/repos.json) first, falls back to old (.claude/metadata/).
 * @returns {string[]}
 */
function readRepoCache() {
  // Try new location first
  if (fs.existsSync(CACHE_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      return data.repos || [];
    } catch (e) { /* fall through */ }
  }
  // Fall back to old location
  if (fs.existsSync(OLD_CACHE_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(OLD_CACHE_PATH, 'utf8'));
      return data.repos || [];
    } catch (e) { /* fall through */ }
  }
  return [];
}

/**
 * Write repo list to cache file at new location (idpf-stats/repos.json).
 * Creates idpf-stats/ directory if missing. Removes old cache location after migration.
 * @param {string[]} repos
 */
function writeRepoCache(repos) {
  if (!fs.existsSync(STATS_DIR)) {
    fs.mkdirSync(STATS_DIR, { recursive: true });
  }
  fs.writeFileSync(CACHE_PATH, JSON.stringify({ repos }, null, 2), 'utf8');
  // Migrate: remove old cache location
  if (fs.existsSync(OLD_CACHE_PATH)) {
    try { fs.unlinkSync(OLD_CACHE_PATH); } catch (e) { /* non-critical */ }
  }
}

/**
 * Collect metrics across multiple repositories and aggregate.
 * @param {{ since: string, until: string, repos: string[] }} opts
 * @returns {{ aggregate: object, perRepo: object[], warnings: string[] }}
 */
function collectMultiRepo(opts) {
  const { since, until, repos } = opts;
  const perRepo = [];
  const warnings = [];

  for (const dir of repos) {
    if (!validateRepoDir(dir)) {
      warnings.push(dir);
      continue;
    }
    const result = collectMetrics({ since, until, cwd: dir });
    // Qualify issues with repo slug for cross-repo identification
    const repoSlug = getRepoSlug(dir);
    if (repoSlug) {
      result.issues = result.issues.map(issue => ({
        number: parseInt(issue.replace('#', ''), 10),
        repo: repoSlug
      }));
    }
    perRepo.push({ dir, ...result });
  }

  // Aggregate across all repos
  const aggregate = {
    volume: {
      commits: 0, filesChanged: 0, linesAdded: 0, linesRemoved: 0, netLines: 0,
      byType: {
        Code: { added: 0, removed: 0 },
        Documentation: { added: 0, removed: 0 },
        Config: { added: 0, removed: 0 },
        Other: { added: 0, removed: 0 }
      },
      byExtension: {}
    },
    testing: { testFiles: 0, testCases: 0, newTestFiles: 0, testsBefore: 0 },
    issues: []
  };

  for (const repo of perRepo) {
    aggregate.volume.commits += repo.volume.commits;
    aggregate.volume.filesChanged += repo.volume.filesChanged;
    aggregate.volume.linesAdded += repo.volume.linesAdded;
    aggregate.volume.linesRemoved += repo.volume.linesRemoved;
    aggregate.volume.netLines += repo.volume.netLines;
    // Aggregate byType
    if (repo.volume.byType) {
      for (const [cat, counts] of Object.entries(repo.volume.byType)) {
        if (!aggregate.volume.byType[cat]) aggregate.volume.byType[cat] = { added: 0, removed: 0 };
        aggregate.volume.byType[cat].added += counts.added;
        aggregate.volume.byType[cat].removed += counts.removed;
      }
    }
    // Aggregate byExtension
    if (repo.volume.byExtension) {
      for (const [ext, counts] of Object.entries(repo.volume.byExtension)) {
        if (!aggregate.volume.byExtension[ext]) aggregate.volume.byExtension[ext] = { added: 0, removed: 0 };
        aggregate.volume.byExtension[ext].added += counts.added;
        aggregate.volume.byExtension[ext].removed += counts.removed;
      }
    }
    aggregate.testing.testFiles += repo.testing.testFiles;
    aggregate.testing.testCases += repo.testing.testCases;
    aggregate.testing.newTestFiles += repo.testing.newTestFiles;
    aggregate.testing.testsBefore += repo.testing.testsBefore;
    // Repo-qualified issues: deduplicate by number+repo pair
    for (const issue of repo.issues) {
      const isDuplicate = aggregate.issues.some(
        existing => existing.number === issue.number && existing.repo === issue.repo
      );
      if (!isDuplicate) aggregate.issues.push(issue);
    }
  }

  // Sort aggregate byExtension by added descending
  const sortedExt = {};
  Object.entries(aggregate.volume.byExtension)
    .filter(([, v]) => v.added > 0 || v.removed > 0)
    .sort((a, b) => b[1].added - a[1].added)
    .forEach(([k, v]) => { sortedExt[k] = v; });
  aggregate.volume.byExtension = sortedExt;

  // Aggregate throughput from total metrics
  const totalCommits = aggregate.volume.commits;
  if (totalCommits > 0) {
    // Use combined hours from all repos (max span)
    const allHours = perRepo
      .filter(r => r.throughput)
      .map(r => r.throughput.hours);
    const maxHours = allHours.length > 0 ? Math.max(...allHours) : 1;
    aggregate.throughput = {
      hours: maxHours,
      commitsPerHour: round2(totalCommits / maxHours),
      linesPerHour: round2(aggregate.volume.linesAdded / maxHours),
      issuesPerHour: round2(aggregate.issues.length / maxHours)
    };
  } else {
    aggregate.throughput = null;
  }

  const sinceDate = since.slice(0, 10);
  const untilDate = until.slice(0, 10);
  aggregate.displayRange = { since: sinceDate, until: untilDate, isSingleDay: sinceDate === untilDate };

  return { aggregate, perRepo, warnings };
}

// ─── Velocity assessment ───────────────────────────────────────

const STATS_CONFIG_PATH = path.resolve(__dirname, '../../metadata/stats-config.json');

/**
 * Load stats-config.json.
 *
 * Returns null rather than throwing: every probe here already distinguishes
 * "could not answer" from "answered zero" (#2675), and a config read failure is
 * the same kind of fact as a failed git probe.
 */
function loadStatsConfig(configPath) {
  try {
    return JSON.parse(fs.readFileSync(configPath || STATS_CONFIG_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Assess throughput against the configured benchmark bands.
 *
 * #2676 removed the DEFAULT_BENCHMARKS constant that used to sit here. It
 * duplicated stats-config.json exactly, so the two could drift apart with
 * nothing to detect it — and the duplicate silently won whenever a caller
 * omitted the argument, which was every caller. Benchmarks now come from config
 * or not at all.
 *
 * The `multiplier` return went with it. It produced the "~Nx typical developer
 * velocity" line, which divided this repository's rates by an uncited median and
 * reported the quotient as a fact about developers. Its replacement is
 * `computeTrailingBaseline()`, which compares against this repository's own
 * recent history and so needs no external population at all.
 *
 * @param {object|null} throughput - Throughput metrics from collectMetrics
 * @param {object} [benchmarks] - velocityBenchmarks block; loaded from config when omitted
 * @returns {object|null} - { ratings, benchmarks } or null
 */
function assessVelocity(throughput, benchmarks) {
  if (!throughput) return null;

  let bench = benchmarks;
  if (!bench) {
    const config = loadStatsConfig();
    bench = config && config.velocityBenchmarks;
  }
  // No benchmarks anywhere is a missing answer, not a zero one.
  if (!bench) return null;

  function rate(value, thresholds) {
    if (!thresholds) return null;
    if (value >= thresholds.high) return 'high';
    if (value >= thresholds.low) return 'moderate';
    return 'low';
  }

  const ratings = {
    commitsPerHour: rate(throughput.commitsPerHour, bench.commitsPerHour),
    linesPerHour: rate(throughput.linesPerHour, bench.linesPerHour),
    issuesPerHour: rate(throughput.issuesPerHour, bench.issuesPerHour)
  };

  // Returned so a renderer can satisfy the mandatory assumptions disclosure
  // without re-reading config. The spec requires population and source to be
  // shown, and a renderer that cannot see them cannot show them.
  return { ratings, benchmarks: bench };
}

// ─── DORA collection (#2676) ────────────────────────────────────
//
// Every collector returns { value, reason }. A null value is ALWAYS paired with
// a reason, never reported as 0 — "no releases in range" is not a deployment
// frequency of zero, and reporting it as zero would place the repository in the
// Low tier on the strength of a missing measurement (#2675's contract).

/** Median of a non-empty numeric array. */
function median(nums) {
  const sorted = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Run a gh command, mirroring runGit's { ok, output, error } shape. */
function runGh(args, cwd) {
  try {
    const result = execFileTimed('gh', args, {
      cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], shell: false
    });
    const output = typeof result === 'string' ? result : result.toString();
    return { ok: true, output: output.replace(/\s+$/, ''), error: null };
  } catch (e) {
    const detail = (e && e.stderr ? e.stderr.toString().trim() : '') || (e && e.message) || 'unknown error';
    return { ok: false, output: '', error: 'gh ' + (args[0] || '') + ' failed: ' + detail };
  }
}

/** Annotated tags in creation order, oldest first. */
function collectTags(cwd) {
  const res = runGit(['tag', '--sort=creatordate', '--format=%(refname:short)|%(creatordate:iso-strict)'], cwd);
  if (!res.ok) return { tags: null, reason: res.error };
  const tags = lines(res.output).map((l) => {
    const [name, date] = l.split('|');
    const ts = Date.parse(date);
    return name && Number.isFinite(ts) ? { name, date: new Date(ts) } : null;
  }).filter(Boolean);
  return { tags, reason: null };
}

/** Deployment frequency: releases per week across the window. */
function collectDeploymentFrequency(tags, since, until) {
  if (!tags) return { value: null, reason: 'tag list unreadable' };
  const from = new Date(since), to = new Date(until);
  const inRange = tags.filter((x) => x.date >= from && x.date <= to);
  if (inRange.length === 0) {
    return { value: null, reason: 'no releases in range — not a deployment frequency of zero' };
  }
  const days = Math.max((to - from) / 86400000, 1);
  return {
    value: { releases: inRange.length, perWeek: round2(inRange.length / (days / 7)), windowDays: round2(days) },
    reason: null
  };
}

/** Lead time for changes: commit authored → first release containing it. */
function collectLeadTime(cwd, tags, since, until) {
  if (!tags || tags.length === 0) return { value: null, reason: 'no releases available to contain a commit' };
  const res = runGit(['log', '--after=' + since, '--until=' + until, '--pretty=format:%H|%aI'], cwd);
  if (!res.ok) return { value: null, reason: res.error };

  const deltas = [];
  for (const line of lines(res.output)) {
    const iso = line.split('|')[1];
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) continue;
    const committed = new Date(ts);
    const containing = tags.find((tag) => tag.date >= committed);
    // A commit with no later release is not yet delivered. Counting it as zero
    // lead time would reward unreleased work.
    if (containing) deltas.push((containing.date - committed) / 3600000);
  }
  if (deltas.length === 0) return { value: null, reason: 'no commits in range are contained by a later release' };
  return { value: { medianHours: round2(median(deltas)), sampled: deltas.length }, reason: null };
}

/**
 * Change failure rate PROXY — issue-derived, not a measured DORA value.
 *
 * Attribution rule (#2676): a bug issue attributes to the most recent release
 * tag preceding its createdAt. Issues predating the first tag in range are
 * EXCLUDED rather than attributed to it — attributing them would blame the
 * first release for every bug that already existed.
 */
function collectChangeFailureProxy(bugIssues, tags) {
  if (!bugIssues) return { value: null, reason: 'issue data unavailable (gh not reachable)' };
  if (!tags || tags.length === 0) return { value: null, reason: 'no releases to attribute bugs to' };

  const first = tags[0].date;
  const excluded = bugIssues.filter((i) => i.createdAt < first).length;
  const attributable = bugIssues.filter((i) => i.createdAt >= first);

  const releasesWithBugs = new Set();
  for (const issue of attributable) {
    let owner = null;
    for (const tag of tags) {
      if (tag.date <= issue.createdAt) owner = tag.name; else break;
    }
    if (owner) releasesWithBugs.add(owner);
  }
  return {
    value: {
      rate: round2(releasesWithBugs.size / tags.length),
      releasesWithBugs: releasesWithBugs.size,
      totalReleases: tags.length,
      excludedPreFirstTag: excluded,
      isProxy: true
    },
    reason: null
  };
}

/** Time-to-restore PROXY — bug issue open → closed. Issue-derived, not measured. */
function collectTimeToRestoreProxy(bugIssues) {
  if (!bugIssues) return { value: null, reason: 'issue data unavailable (gh not reachable)' };
  const closed = bugIssues.filter((i) => i.closedAt);
  if (closed.length === 0) {
    return { value: null, reason: 'no closed bug issues in range — not a restore time of zero' };
  }
  const hours = closed.map((i) => (i.closedAt - i.createdAt) / 3600000);
  return { value: { medianHours: round2(median(hours)), sampled: closed.length, isProxy: true }, reason: null };
}

/** Place a value in a published DORA tier. Null when there is nothing to place. */
function placeInTier(value, tierBlock, key) {
  if (value == null || !tierBlock) return null;
  for (const name of ['elite', 'high', 'medium', 'low']) {
    const tier = tierBlock[name];
    if (!tier) continue;
    if (key === 'minPerWeek') {
      if (tier.minPerWeek != null && value >= tier.minPerWeek) return { tier: name, label: tier.label };
    } else {
      const bound = tier[key];
      if (bound == null) return { tier: name, label: tier.label };
      if (value <= bound) return { tier: name, label: tier.label };
    }
  }
  return { tier: 'low', label: (tierBlock.low && tierBlock.low.label) || 'Low' };
}

/**
 * Trailing baseline — deviation from THIS repository's own recent history.
 *
 * Replaces the "~Nx typical developer velocity" figure. Fewer usable points than
 * minDataPoints reports not-collected with a reason: a median over two active
 * days is not a baseline, and presenting one would be a confident number resting
 * on nothing.
 */
function computeTrailingBaseline(cwd, config, until) {
  const settings = config && config.baseline;
  if (!settings) return { value: null, reason: 'no baseline block in stats-config.json' };

  const end = new Date(until);
  const start = new Date(end.getTime() - settings.windowDays * 86400000);
  const res = runGit(
    ['log', '--after=' + start.toISOString(), '--until=' + end.toISOString(), '--pretty=format:%aI'],
    cwd
  );
  if (!res.ok) return { value: null, reason: res.error };

  const perDay = new Map();
  for (const iso of lines(res.output)) {
    const day = iso.slice(0, 10);
    perDay.set(day, (perDay.get(day) || 0) + 1);
  }
  const counts = [...perDay.values()];
  if (counts.length < settings.minDataPoints) {
    return {
      value: null,
      reason: 'insufficient history: ' + counts.length + ' active day(s) in the ' +
        settings.windowDays + '-day window, minimum ' + settings.minDataPoints
    };
  }
  return {
    value: {
      medianCommitsPerActiveDay: round2(median(counts)),
      activeDays: counts.length,
      windowDays: settings.windowDays
    },
    reason: null
  };
}

/**
 * Collect the DORA block. Every absent metric carries a reason.
 *
 * The two proxies are flagged `isProxy: true` in their own payloads AND grouped
 * under `proxies` here, separate from `measured`. A renderer walking the shape
 * cannot present them as measured DORA values by accident, which is the specific
 * misuse this issue guards against — change failure rate and time to restore are
 * derived from issue labels and timestamps, not from deployment telemetry.
 */
function collectDora(opts) {
  const { since, until, cwd, config, bugIssues } = opts;
  const unavailable = {};

  const tagResult = collectTags(cwd);
  if (tagResult.reason) unavailable.tags = tagResult.reason;
  const tags = tagResult.tags;

  const df = collectDeploymentFrequency(tags, since, until);
  if (df.reason) unavailable.deploymentFrequency = df.reason;

  const lt = collectLeadTime(cwd, tags, since, until);
  if (lt.reason) unavailable.leadTimeForChanges = lt.reason;

  const cfr = collectChangeFailureProxy(bugIssues, tags);
  if (cfr.reason) unavailable.changeFailureRate = cfr.reason;

  const ttr = collectTimeToRestoreProxy(bugIssues);
  if (ttr.reason) unavailable.timeToRestoreService = ttr.reason;

  const tierCfg = config && config.doraTiers;
  const tiers = tierCfg && tierCfg.tiers;

  return {
    measured: { deploymentFrequency: df.value, leadTimeForChanges: lt.value },
    proxies: { changeFailureRate: cfr.value, timeToRestoreService: ttr.value },
    tierPlacement: {
      deploymentFrequency: placeInTier(df.value && df.value.perWeek, tiers && tiers.deploymentFrequency, 'minPerWeek'),
      leadTimeForChanges: placeInTier(lt.value && lt.value.medianHours, tiers && tiers.leadTimeForChanges, 'maxHours'),
      changeFailureRate: placeInTier(cfr.value && cfr.value.rate, tiers && tiers.changeFailureRate, 'maxRate'),
      timeToRestoreService: placeInTier(ttr.value && ttr.value.medianHours, tiers && tiers.timeToRestoreService, 'maxHours')
    },
    tierSource: tierCfg
      ? { source: tierCfg.source, reportYear: tierCfg.reportYear, retrievedAt: tierCfg.retrievedAt }
      : null,
    unavailable
  };
}

// ─── CLI entry point ────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const opts = parseArgs(args);

  if (opts.repos !== undefined || opts.useCache || opts.reposEdit) {
    // Multi-repo mode
    let repos = opts.repos || [];
    if (opts.useCache || (repos.length === 0 && !opts.reposEdit)) {
      repos = readRepoCache();
    }
    if (repos.length > 0) {
      writeRepoCache(repos);
    }
    const result = collectMultiRepo({ since: opts.since, until: opts.until, repos });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    // Auto-detect: if idpf-stats/repos.json exists, use it for multi-repo mode
    const autoRepos = readRepoCache();
    if (autoRepos.length > 0) {
      const result = collectMultiRepo({ since: opts.since, until: opts.until, repos: autoRepos });
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      // Single-repo mode
      const result = collectMetrics(opts);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  }
}

module.exports = {
  parseArgs, collectMetrics, parseNumstat, computeHours, formatLocalISO, getTzOffset,
  categorizeFile, assessVelocity, getRepoSlug, validateRepoDir,
  readRepoCache, writeRepoCache, collectMultiRepo,
  // Exported so the inventory probes can be checked against a fixture tree
  // with a known answer (#2675) — the shell versions returned 0 for every
  // tree, so there was nothing a test could pin them to.
  countTestFiles, countTestCases,
  // #2676 — DORA collection, tier placement, and the trailing baseline that
  // replaced the uncited "~Nx typical developer velocity" multiplier.
  loadStatsConfig, runGh, collectTags, collectDeploymentFrequency, collectLeadTime,
  collectChangeFailureProxy, collectTimeToRestoreProxy, placeInTier,
  computeTrailingBaseline, collectDora, median,
  STATS_DIR, OLD_CACHE_PATH
};
