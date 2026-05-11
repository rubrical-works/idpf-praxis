#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.91.1
 * @description Collects development statistics from git history using config-driven
 *   metric definitions. Returns structured JSON for the /idpf-stats command to render.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const { execSync } = require('child_process');
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
 * Collect all metrics for a given date range.
 * @param {{ since: string, until: string, cwd?: string }} opts
 * @returns {{ volume: object, testing: object, throughput: object|null, issues: string[], displayRange: object }}
 */
function collectMetrics(opts) {
  const { since, until, cwd } = opts;

  // Volume metrics
  const commitCount = parseIntSafe(exec(
    `git log --after="${since}" --until="${until}" --oneline | wc -l`, cwd
  ));

  const filesOutput = exec(
    `git log --after="${since}" --until="${until}" --pretty=format: --name-only | sort -u | grep -v '^$'`, cwd
  );
  const filesChanged = filesOutput ? filesOutput.split('\n').filter(Boolean).length : 0;

  const numstatOutput = exec(
    `git log --after="${since}" --until="${until}" --pretty=format: --numstat`, cwd
  );
  const { added: linesAdded, removed: linesRemoved, byType, byExtension } = parseNumstat(numstatOutput);

  // Issue references
  let issues = [];
  const issueOutput = exec(
    `git log --after="${since}" --until="${until}" --pretty=format:"%s %b" | grep -oE '#[0-9]+' | sort -u`, cwd
  );
  if (issueOutput) {
    issues = issueOutput.split('\n').filter(Boolean);
  }

  // Test metrics
  const testFiles = countTestFiles(cwd);
  const testCases = countTestCases(cwd);
  const newTestFiles = parseIntSafe(exec(
    `git log --after="${since}" --until="${until}" --diff-filter=A --name-only --pretty=format: | grep -E '\\.(test|spec)\\.' | wc -l`, cwd
  ));

  // Throughput
  let throughput = null;
  if (commitCount > 0) {
    const earliest = exec(
      `git log --after="${since}" --until="${until}" --format="%aI" | tail -1`, cwd
    );
    const latest = exec(
      `git log --after="${since}" --until="${until}" --format="%aI" | head -1`, cwd
    );
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
      netLines: linesAdded - linesRemoved,
      byType,
      byExtension
    },
    testing: {
      testFiles,
      testCases,
      newTestFiles,
      testsBefore: testCases - newTestFiles
    },
    throughput,
    issues,
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
 * @param {string} [cwd]
 * @returns {number}
 */
function countTestFiles(cwd) {
  const output = exec(
    'find . -name "*.test.*" -o -name "*.spec.*" -o -name "test_*.py" -o -name "*_test.go" 2>/dev/null | grep -v node_modules',
    cwd
  );
  return output ? output.split('\n').filter(Boolean).length : 0;
}

/**
 * Count individual test cases.
 * @param {string} [cwd]
 * @returns {number}
 */
function countTestCases(cwd) {
  let count = 0;
  // JavaScript/TypeScript
  const jsOutput = exec(
    'grep -rE "^\\s*(it|test)\\(" --include="*.test.*" --include="*.spec.*" . 2>/dev/null | grep -v node_modules',
    cwd
  );
  if (jsOutput) count += jsOutput.split('\n').filter(Boolean).length;
  // Python
  const pyOutput = exec(
    'grep -rE "^\\s*def test_" --include="*.py" . 2>/dev/null | grep -v node_modules',
    cwd
  );
  if (pyOutput) count += pyOutput.split('\n').filter(Boolean).length;
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

// Default benchmarks for human developer throughput (configurable via stats-config.json)
const DEFAULT_BENCHMARKS = {
  commitsPerHour: { low: 1, high: 3, median: 1.5 },
  linesPerHour: { low: 50, high: 200, median: 75 },
  issuesPerHour: { low: 0.5, high: 2, median: 0.75 }
};

/**
 * Assess velocity against human developer benchmarks.
 * @param {object|null} throughput - Throughput metrics from collectMetrics
 * @param {object} [benchmarks] - Override benchmarks from stats-config.json
 * @returns {object|null} - { multiplier, ratings, codeToDocsRatio }
 */
function assessVelocity(throughput, benchmarks) {
  if (!throughput) return null;
  const bench = benchmarks || DEFAULT_BENCHMARKS;

  function rate(value, thresholds) {
    if (value >= thresholds.high) return 'high';
    if (value >= thresholds.low) return 'moderate';
    return 'low';
  }

  const ratings = {
    commitsPerHour: rate(throughput.commitsPerHour, bench.commitsPerHour),
    linesPerHour: rate(throughput.linesPerHour, bench.linesPerHour),
    issuesPerHour: rate(throughput.issuesPerHour, bench.issuesPerHour)
  };

  // Multiplier: average ratio to median benchmarks
  const ratios = [
    throughput.commitsPerHour / bench.commitsPerHour.median,
    throughput.linesPerHour / bench.linesPerHour.median,
    throughput.issuesPerHour / bench.issuesPerHour.median
  ];
  const multiplier = round2(ratios.reduce((a, b) => a + b, 0) / ratios.length);

  return { multiplier, ratings };
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
  STATS_DIR, OLD_CACHE_PATH
};
