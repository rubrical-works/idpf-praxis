// Rubrical Works (c) 2026
/**
 * @framework-script 0.117.0
 * @description The /code-review reviewer split (#3167). Exports partitionQueue(), mergeShardResults() and validateShardResult(): shard the Step 4 queue for at most N reviewer Agents, then validate and merge their results with the parent assigning every --diff tag.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * lib/code-review-shards.js — partition and merge for `/code-review --agents N`
 *
 * The parent owns every piece of state: it partitions, spawns, merges and is
 * the only writer of .code-review-manifest.json. A reviewer only reads its
 * shard and returns one result shaped by code-review-findings-schema.json.
 * Nothing a reviewer returns is trusted unchecked: a result that fails the
 * schema, a finding on a file outside its shard, or a line range past the end
 * of the file is rejected and reported, and a shard with no valid result
 * leaves every one of its files unreviewed — never approved.
 *
 * Node built-ins plus the declared `ajv` runtime dependency only.
 *
 * Refs #3167
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { classifyFindingRange } = require('./branch-diff.js');

const SCHEMA_PATH = path.join(__dirname, 'code-review-findings-schema.json');
/** The schema as the project-relative path a reviewer's brief names. */
const SCHEMA_REL = '.claude/scripts/shared/lib/code-review-findings-schema.json';

let compiled = null;

function compileSchema() {
  if (compiled) return compiled;
  const Ajv = require('ajv');
  const ajv = new Ajv({ allErrors: true, strict: false });
  const body = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  // Ajv's default dialect is draft-07; naming it would make Ajv look the
  // meta-schema up rather than use its own.
  delete body.$schema;
  compiled = ajv.compile(body);
  return compiled;
}

/** Validate one reviewer result against the findings schema. */
function validateShardResult(result) {
  const validate = compileSchema();
  if (validate(result)) return { ok: true, errors: [] };
  return {
    ok: false,
    errors: validate.errors.map((e) => `${e.instancePath || '(root)'} ${e.message}`),
  };
}

const toEntry = (f) => (typeof f === 'string' ? { path: f, lines: 1 } : { path: f.path, lines: Math.max(1, f.lines || 1) });

/**
 * Split the queue into at most `n` non-empty shards, each file in exactly one.
 * Files are grouped by directory and the groups placed largest-first on the
 * lightest shard, by line count. When there are fewer directories than `n`,
 * the heaviest groups are split file by file so every reviewer gets work.
 *
 * @param {Array<string|{path:string,lines?:number}>} files
 * @param {number} n positive integer — the --agents cap
 * @returns {string[][]}
 */
function partitionQueue(files, n) {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`partitionQueue: n must be a positive integer, got ${String(n)}`);
  }
  const entries = (files || []).map(toEntry);
  if (entries.length === 0) return [];

  const byDir = new Map();
  for (const e of entries) {
    const dir = path.posix.dirname(e.path.replace(/\\/g, '/'));
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(e);
  }
  let groups = [...byDir.values()];
  const weight = (g) => g.reduce((sum, e) => sum + e.lines, 0);
  const target = Math.min(n, entries.length);

  // Fewer groups than reviewers: split the heaviest multi-file group in half.
  while (groups.length < target) {
    groups.sort((a, b) => weight(b) - weight(a));
    const idx = groups.findIndex((g) => g.length > 1);
    if (idx < 0) break;
    const g = [...groups[idx]].sort((a, b) => b.lines - a.lines);
    const left = [];
    const right = [];
    for (const e of g) (weight(left) <= weight(right) ? left : right).push(e);
    groups.splice(idx, 1, left, right);
  }

  groups.sort((a, b) => weight(b) - weight(a) || a[0].path.localeCompare(b[0].path));
  const shards = Array.from({ length: target }, () => ({ files: [], load: 0 }));
  for (const g of groups) {
    const lightest = shards.reduce((min, s) => (s.load < min.load ? s : min), shards[0]);
    lightest.files.push(...g.map((e) => e.path));
    lightest.load += weight(g);
  }
  return shards.map((s) => s.files).filter((s) => s.length > 0);
}

function lineCountOf(file, options, cache) {
  if (options.lineCounts && Object.prototype.hasOwnProperty.call(options.lineCounts, file)) {
    return options.lineCounts[file];
  }
  if (cache.has(file)) return cache.get(file);
  let count = null;
  try {
    const text = fs.readFileSync(path.join(options.cwd || process.cwd(), file), 'utf8');
    count = text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  } catch {
    count = null;
  }
  cache.set(file, count);
  return count;
}

/**
 * Validate and merge reviewer results.
 *
 * @param {string[][]} shards — as partitionQueue() returned them
 * @param {Array<object|null|undefined>} results — aligned with `shards`; a
 *   missing entry is a reviewer that failed or returned nothing
 * @param {object} [options]
 * @param {object} [options.ranges] — Step 3's changed ranges; present means
 *   --diff, and every merged finding is tagged with classifyFindingRange()
 * @param {object} [options.lineCounts] — path → line count; read from
 *   `options.cwd` (default process.cwd()) for any file not listed
 * @returns {{findings: object[], reviewed: string[], unreviewed: string[], rejected: object[]}}
 */
function mergeShardResults(shards, results, options = {}) {
  const findings = [];
  const reviewed = [];
  const unreviewed = [];
  const rejected = [];
  const diff = options.ranges !== undefined && options.ranges !== null;
  const cache = new Map();

  (shards || []).forEach((shardFiles, shard) => {
    const result = results ? results[shard] : undefined;
    if (result === undefined || result === null) {
      rejected.push({ shard, reason: 'no-result', errors: [] });
      unreviewed.push(...shardFiles);
      return;
    }
    const v = validateShardResult(result);
    if (!v.ok) {
      rejected.push({ shard, reason: 'schema-invalid', errors: v.errors });
      unreviewed.push(...shardFiles);
      return;
    }

    const inShard = new Set(shardFiles);
    const claimed = new Set(result.filesReviewed);
    for (const file of shardFiles) (claimed.has(file) ? reviewed : unreviewed).push(file);

    for (const f of result.findings) {
      if (!inShard.has(f.path)) {
        rejected.push({ shard, reason: 'outside-shard', finding: f });
        continue;
      }
      const lines = lineCountOf(f.path, options, cache);
      if (lines === null || f.endLine < f.startLine || f.endLine > lines) {
        rejected.push({ shard, reason: 'line-range-past-end', finding: f, lines });
        continue;
      }
      const merged = { ...f };
      delete merged.diffTag;
      if (diff) merged.diffTag = classifyFindingRange(options.ranges, f.path, f.startLine, f.endLine);
      findings.push(merged);
    }
  });

  return { findings, reviewed, unreviewed, rejected };
}

/**
 * The Agent request for one shard reviewer (#3504): the read-only
 * `idpf-code-reviewer` type, with the parent's not-found fallback step
 * (#3500). The prompt carries facts only — the shard's files, the Step 5
 * criteria, the Step 5c domain questions and the --diff changed ranges when
 * present — and names the result schema the parent validates against.
 *
 * @param {object} input
 * @param {number} input.shard          1-based shard number
 * @param {string[]} input.files        the shard's files, from partitionQueue()
 * @param {string} input.criteria       the Step 5 criteria, as text
 * @param {string} [input.domainQuestions] Step 5c questions, under --with
 * @param {Object<string, number[][]>} [input.ranges] path → [[start, end], …], under --diff
 * @param {string} [input.root]          project root for the brief context (default: cwd)
 * @returns {{description: string, subagent_type: string, prompt: string, onNotFound?: string}}
 */
function buildShardRequest({ shard, files = [], criteria = '', domainQuestions = '', ranges, base, skills = [], root = process.cwd() } = {}) {
  const lines = [
    `Review code-review shard ${shard}: read each file below in full and judge it against the criteria. Supply no diffTag.`,
    '',
  ];
  // Specialist, domains and absolute frameworkPath, resolved at spawn (#3501):
  // always present — root defaults to the project the parent runs in.
  const { resolveBriefContext, briefContextLines } = require('./specialist-resolver.js');
  lines.push(...briefContextLines(resolveBriefContext({ root })));
  // Facts the gate's reviewer needs and the charter to judge against (#3505):
  // the base, the charter path, the skill paths — never the branch's account
  // of itself (commit messages, issue bodies, CHANGELOG text, a summary).
  const abs = (p) => path.resolve(root, p).split(path.sep).join('/');
  if (base && base.sha) lines.push(`- Base: \`${base.ref || base.sha}\` (${base.sha})`);
  lines.push(`- CHARTER.md: \`${abs('CHARTER.md')}\``);
  if (skills.length > 0) lines.push(`- Skills: ${skills.map((s) => `\`${abs(s)}\``).join(', ')}`);
  lines.push('');
  lines.push(
    '### Files',
    ...files.map((f) => `- \`${f}\``),
    '',
    '### Criteria',
    criteria,
  );
  if (domainQuestions) lines.push('', '### Domain questions', domainQuestions);
  if (ranges && Object.keys(ranges).length > 0) {
    lines.push('', '### Changed ranges (context only)');
    for (const [file, spans] of Object.entries(ranges)) {
      lines.push(`- \`${file}\`: ${(spans || []).map(([a, b]) => `${a}-${b}`).join(', ')}`);
    }
  }
  lines.push('', '### Result', `Reply with ONE JSON document valid against ${SCHEMA_REL}: filesReviewed[] and findings[] — and nothing else.`);
  return require('./subagent-fallback.js').withFallback({
    description: `Code review shard ${shard}`,
    subagent_type: 'idpf-code-reviewer',
    prompt: lines.join('\n'),
  });
}

/**
 * The Release Review Gate's shard requests (#3505): the gate always splits, so
 * Step 6 never runs in the release session. Partitions the queued files for N
 * reviewers — N defaults to the `/work --concurrent` agents default — and
 * builds one author-free brief per shard: facts only (base, files, ranges,
 * charter path, criteria, domain questions, skills, project context). Any other
 * field the caller passes — a commit list, an issue body, a summary — is
 * ignored by construction, never forwarded.
 *
 * @param {object} input
 * @param {{ref: string, sha: string}} input.base  the base the gate resolved
 * @param {Array<{path: string, lines: number}>} input.files  the Step 4 queue
 * @param {Object<string, number[][]>} [input.ranges]  path → [[start, end], …]
 * @param {string} input.criteria  the Step 5 criteria, as text
 * @param {string} [input.domainQuestions]  Step 5c questions
 * @param {string[]} [input.skills]  skill file paths, relative to root
 * @param {number} [input.agents]  N; default the /work --concurrent default
 * @param {string} [input.root]  project root (default: cwd)
 * @returns {object[]} one spawn request per non-empty shard
 */
function buildGateShardRequests({ base, files = [], ranges = {}, criteria = '', domainQuestions = '', skills = [], agents, root = process.cwd() } = {}) {
  const n = agents === undefined ? require('./concurrency-plan.js').DEFAULT_MAX_AGENTS : agents;
  const shards = partitionQueue(files, n);
  return shards.map((shardFiles, i) => buildShardRequest({
    shard: `${i + 1}/${shards.length}`,
    files: shardFiles,
    criteria,
    domainQuestions,
    // branch-diff.js returns {start, end}; the brief takes [start, end] — accept both.
    ranges: Object.fromEntries(shardFiles.filter((f) => ranges[f]).map((f) => [f,
      ranges[f].map((r) => (Array.isArray(r) ? r : [r.start, r.end]))])),
    base,
    skills,
    root,
  }));
}

module.exports = {
  buildGateShardRequests,
  SCHEMA_PATH,
  partitionQueue,
  mergeShardResults,
  validateShardResult,
  buildShardRequest,
};
