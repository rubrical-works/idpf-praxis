#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.110.0
 * @description Collision profiler (#3133, PRD Concurrent-Work Story 1.16).
 * Replays git history grouped by issue reference, measures how often two
 * issues touched the same file — the collision rate a concurrent run would
 * pay — ranks the files that cause it, and shows the rate left once those
 * files are reconciled by kind (Phase 1). Proposes a `concurrency` block
 * for review. ADVISORY: it never writes framework-config.json or anything
 * else.
 *
 * Usage:
 *   node .claude/scripts/shared/collision-profiler.js [--since <ref>] [--min-pairs N] [--json]
 *
 * Two histories must never read as "0% collisions" — one with no issue
 * references, and a shallow clone whose history is cut off. Both yield an
 * EMPTY profile that says why (`reason`, `message`), with `rate: null`.
 * A history whose references name a single issue has no pairs, said as
 * such, with `rate: null` too.
 *
 * Exits 0 on a report (empty or not), 2 on bad arguments.
 */

// Bounded spawn (#2469): a hung git must not hang the profiler.
const { execFileTimed } = require('./lib/exec.js');

const DEFAULT_MIN_PAIRS = 2;
const ISSUE_REF = /#(\d+)\b/g;

/** Every `#N` in a subject, in order, deduplicated. */
function issueRefsIn(subject) {
  const out = [];
  for (const m of String(subject || '').matchAll(ISSUE_REF)) {
    const n = Number(m[1]);
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/** The default git: run in `cwd`, return stdout. */
function realGit(cwd) {
  return (args) => execFileTimed('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/**
 * Parse `git log --format=%x1e%H%x1f%s --name-only` into commits.
 * @returns {Array<{sha: string, subject: string, files: string[]}>}
 */
function parseHistory(raw) {
  return String(raw || '')
    .split('\x1e')
    .filter((rec) => rec.trim() !== '')
    .map((rec) => {
      const [head, ...rest] = rec.split('\n');
      const sep = head.indexOf('\x1f');
      return {
        sha: head.slice(0, sep),
        subject: head.slice(sep + 1),
        files: rest.map((l) => l.trim()).filter(Boolean),
      };
    });
}

/** Issue → the set of files its commits touched; plus the unreferenced count. */
function groupByIssue(commits) {
  const byIssue = new Map();
  let unreferenced = 0;
  for (const c of commits) {
    const refs = issueRefsIn(c.subject);
    if (refs.length === 0) {
      unreferenced++;
      continue;
    }
    for (const n of refs) {
      if (!byIssue.has(n)) byIssue.set(n, new Set());
      for (const f of c.files) byIssue.get(n).add(f);
    }
  }
  return { byIssue, unreferenced };
}

/** Pairwise collisions over issue file sets, optionally ignoring some files. */
function collide(byIssue, ignore = new Set()) {
  const issues = [...byIssue.keys()].sort((a, b) => a - b);
  const perFile = new Map();
  let pairs = 0;
  let colliding = 0;
  for (let i = 0; i < issues.length; i++) {
    for (let j = i + 1; j < issues.length; j++) {
      pairs++;
      let hit = false;
      for (const f of byIssue.get(issues[i])) {
        if (ignore.has(f) || !byIssue.get(issues[j]).has(f)) continue;
        hit = true;
        if (!perFile.has(f)) perFile.set(f, { pairs: 0, issues: new Set() });
        const entry = perFile.get(f);
        entry.pairs++;
        entry.issues.add(issues[i]);
        entry.issues.add(issues[j]);
      }
      if (hit) colliding++;
    }
  }
  const files = [...perFile.entries()]
    .map(([file, e]) => ({ path: file, pairs: e.pairs, issues: [...e.issues].sort((a, b) => a - b) }))
    .sort((a, b) => b.pairs - a.pairs || a.path.localeCompare(b.path));
  return { issues, pairs, collidingPairs: colliding, rate: pairs === 0 ? null : colliding / pairs, files };
}

/**
 * The profile.
 *
 * @param {{git?: (args: string[]) => string, cwd?: string, since?: string, minPairs?: number}} [input]
 */
function profile({ git, cwd = process.cwd(), since, minPairs = DEFAULT_MIN_PAIRS } = {}) {
  const run = git || realGit(cwd);
  const empty = (reason, message, extra = {}) => ({
    empty: true, reason, message, rate: null, pairs: 0, collidingPairs: 0, issues: [], files: [],
    accumulators: [], residual: null, unreferencedCommits: 0, minPairs, ...extra,
  });

  let shallow;
  let raw;
  let depth = null;
  try {
    shallow = run(['rev-parse', '--is-shallow-repository']).trim() === 'true';
    if (shallow) depth = Number(run(['rev-list', '--count', 'HEAD']).trim());
    raw = run(['log', '--format=%x1e%H%x1f%s', '--name-only', ...(since ? [`${since}..HEAD`] : [])]);
  } catch (e) {
    return empty('git-error', `git failed: ${e.message}`);
  }
  if (shallow) {
    return empty('shallow', `History truncated at the clone depth (${depth} commits) — a shallow clone cannot be profiled; fetch the full history (git fetch --unshallow) and re-run.`, { depth });
  }

  const commits = parseHistory(raw);
  const { byIssue, unreferenced } = groupByIssue(commits);
  if (byIssue.size === 0) {
    return empty('no-references', `No issue references found in ${commits.length} commit(s) — nothing to group by, so no collision rate can be stated.`, { unreferencedCommits: unreferenced });
  }

  const all = collide(byIssue);
  const accumulators = all.files.filter((f) => f.pairs >= minPairs);
  const excluded = accumulators.map((f) => f.path);
  const residual = collide(byIssue, new Set(excluded));

  const message = all.pairs === 0
    ? `References name one issue (#${all.issues[0]}) — no pairs, so no collision rate can be stated.`
    : `${all.collidingPairs} of ${all.pairs} pairs collided; ${excluded.length} accumulator file(s) at ≥${minPairs} pairs; residual ${residual.collidingPairs} of ${residual.pairs}.`;

  return {
    empty: false,
    reason: null,
    message,
    issues: all.issues,
    pairs: all.pairs,
    collidingPairs: all.collidingPairs,
    rate: all.rate,
    files: all.files,
    accumulators,
    residual: { pairs: residual.pairs, collidingPairs: residual.collidingPairs, rate: residual.rate, excluded },
    unreferencedCommits: unreferenced,
    minPairs,
  };
}

/**
 * A `concurrency` block proposed from the profile, valid against the schema
 * fragment. The fields only a human knows — an accumulator's record key, a
 * derived artifact's regeneration command — are left as marked placeholders.
 */
function candidateBlock(p) {
  const block = { derivedArtifacts: [], accumulators: [], recomputed: [] };
  if (!p || p.empty) return block;
  for (const f of p.accumulators) {
    if (/\.json$/i.test(f.path)) {
      block.accumulators.push({ path: f.path, strategy: 'json-merge', key: '<set the record key>' });
    } else {
      block.derivedArtifacts.push({ paths: [f.path], regenerate: '<set the regeneration command>' });
    }
  }
  return block;
}

const pct = (r) => (r === null ? 'n/a' : `${(r * 100).toFixed(1)}%`);

function formatReport(p) {
  const lines = ['Collision profile (advisory — nothing is written):'];
  if (p.empty) {
    lines.push(`  ${p.message}`);
    return lines.join('\n');
  }
  lines.push(`  Issues: ${p.issues.length}; unreferenced commits: ${p.unreferencedCommits}`);
  lines.push(`  Collision rate: ${p.collidingPairs} of ${p.pairs} pairs (${pct(p.rate)})`);
  if (p.files.length > 0) {
    lines.push('  Files by pair count:');
    for (const f of p.files) lines.push(`    ${f.pairs}  ${f.path}  (#${f.issues.join(', #')})`);
  }
  if (p.residual) {
    lines.push(`  Accumulators (≥${p.minPairs} pairs): ${p.residual.excluded.length ? p.residual.excluded.join(', ') : 'none'}`);
    lines.push(`  Residual rate without them: ${p.residual.collidingPairs} of ${p.residual.pairs} pairs (${pct(p.residual.rate)})`);
  }
  lines.push('  Candidate concurrency block (review, then write by hand):');
  lines.push(JSON.stringify(candidateBlock(p), null, 2).split('\n').map((l) => `    ${l}`).join('\n'));
  return lines.join('\n');
}

const HELP = `Usage: node .claude/scripts/shared/collision-profiler.js [--since <ref>] [--min-pairs N] [--json]

Replays git history grouped by issue reference (#N in commit subjects) and
reports the pairwise collision rate, the files ranked by how many issue pairs
shared them, and the residual rate once files at or above --min-pairs
(default ${DEFAULT_MIN_PAIRS}) are excluded. Proposes a concurrency block.

Advisory: it never writes framework-config.json or any other file. Review the
candidate block and copy what you accept into framework-config.json by hand.

  --since <ref>    Profile <ref>..HEAD only
  --min-pairs N    Pair count at which a file counts as an accumulator
  --json           Print the profile and candidate block as JSON
  --help           This text
`;

function parseArgs(argv) {
  const out = { since: undefined, minPairs: DEFAULT_MIN_PAIRS, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--json') out.json = true;
    else if (a === '--since') out.since = argv[++i];
    else if (a === '--min-pairs') {
      const v = argv[++i];
      if (!/^[1-9]\d*$/.test(String(v))) return { error: `--min-pairs requires a positive integer (got ${JSON.stringify(v)}).` };
      out.minPairs = Number(v);
    } else return { error: `Unknown argument: ${a}` };
  }
  if (out.since !== undefined && (!out.since || out.since.startsWith('--'))) return { error: '--since requires a ref.' };
  return out;
}

/** Profile and format; reads git, writes nothing. */
function run({ git, cwd, since, minPairs, json } = {}) {
  const p = profile({ git, cwd, since, minPairs });
  return json ? JSON.stringify({ ...p, candidateBlock: candidateBlock(p) }, null, 2) : formatReport(p);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    process.stderr.write(`${args.error}\n${HELP}`);
    process.exit(2);
  }
  if (args.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  process.stdout.write(run({ cwd: process.cwd(), since: args.since, minPairs: args.minPairs, json: args.json }) + '\n');
  process.exit(0);
}

module.exports = {
  DEFAULT_MIN_PAIRS,
  issueRefsIn,
  parseHistory,
  groupByIssue,
  profile,
  candidateBlock,
  formatReport,
  parseArgs,
  run,
  main,
};

if (require.main === module) main();
