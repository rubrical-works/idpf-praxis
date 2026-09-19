#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.104.0
 * @description Collects the structured per-day facts behind /idpf-stats --daily-log (issues transitioned, bugs and qa-required opened/closed, review outcomes, releases, blockers, activity), plans one report file per active day, and verifies that every issue a written report cites traces to those facts.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 *
 * Why the collector is split in two (#2925): the daily log is prose written
 * OVER collected data, and every issue number, count and claim in it must trace
 * to a fact this script returned — derive, never compose (#2790). The I/O half
 * (`fetchDayRaw`) talks to git and gh; the derivation half (`buildDayFacts`) is
 * pure, so each fact the report may cite is pinned against fixture data.
 *
 * A metric that could not be collected is `null` with a reason in
 * `unavailable`, never `0` (#2675). A day that found nothing only because its
 * probes failed is `undetermined`, not "no activity" — the two must not share
 * the one outcome (no file written) without saying which it was.
 *
 * Node built-ins and sibling modules only — deployed helpers may not require
 * undeclared externals (Reference/Deployment-Awareness.md § Runtime Dependency
 * Contract).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileTimed } = require('./lib/exec.js');
const stats = require('./stats-collect.js');

const CONFIG_PATH = path.resolve(__dirname, '../../metadata/stats-config.json');

const DEFAULTS = {
  reportDir: 'Construction/Reports/Daily-Logs',
  statsReportDir: 'Construction/Reports/Stats',
  sections: ['Product', 'Quality', 'Engineering', 'Activity'],
  labels: { bug: 'bug', qaRequired: 'qa-required', blocked: ['blocked'] },
  statuses: { inReview: 'In review', done: 'Done' },
  issueSearchLimit: 200,
  graphqlBatchSize: 25,
};

/** The `dailyLog` block of stats-config.json over the defaults above. */
function loadDailyLogConfig(configPath) {
  let block = {};
  try {
    block = JSON.parse(fs.readFileSync(configPath || CONFIG_PATH, 'utf8')).dailyLog || {};
  } catch { /* defaults stand */ }
  return {
    ...DEFAULTS,
    ...block,
    labels: { ...DEFAULTS.labels, ...(block.labels || {}) },
    statuses: { ...DEFAULTS.statuses, ...(block.statuses || {}) },
  };
}

// ─── dates and paths ──────────────────────────────────────────

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value) {
  if (!DATE_SHAPE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/**
 * Validate the explicit date list a --daily-log prose phrase resolved to.
 * The phrase itself is interpreted by the command and confirmed with the user;
 * this only refuses a list that is not a list of real calendar dates.
 */
function validateDateList(input) {
  const items = (Array.isArray(input) ? input : String(input || '').split(','))
    .map((s) => String(s).trim())
    .filter(Boolean);
  const invalid = items.filter((s) => !isRealDate(s));
  const dates = [...new Set(items.filter(isRealDate))].sort();
  return { ok: items.length > 0 && invalid.length === 0, dates, invalid };
}

function todayLocalDate(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function dailyLogPath(date, config = DEFAULTS) {
  return `${config.reportDir}/${date}.md`;
}

function statsReportPath(since, until, config = DEFAULTS) {
  const name = since === until ? since : `${since}--${until}`;
  return `${config.statsReportDir}/${name}.md`;
}

// ─── I/O half ─────────────────────────────────────────────────

/**
 * gh runner that keeps stdout on a non-zero exit. `gh api graphql` exits 1 on a
 * PARTIAL error — one unresolvable number in a batch — while stdout still holds
 * every issue that did resolve; discarding it would lose the whole batch.
 */
function runGhKeepOutput(args, cwd, input) {
  try {
    const out = execFileTimed('gh', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], input, shell: false });
    return { ok: true, output: String(out), error: null };
  } catch (e) {
    const detail = (e && e.stderr ? String(e.stderr).trim() : '') || (e && e.message) || 'unknown error';
    return { ok: false, output: e && e.stdout ? String(e.stdout) : '', error: `gh ${args[0] || ''} failed: ${detail}` };
  }
}

const SEARCH_FIELDS = 'number,title,state,labels,createdAt,closedAt';

function searchIssues(runGh, cwd, repo, state, query, limit) {
  const args = ['issue', 'list', '--state', state, '--search', query, '--limit', String(limit), '--json', SEARCH_FIELDS];
  if (repo) args.push('--repo', repo);
  const res = runGh(args, cwd);
  if (!res.ok) return { ok: false, error: res.error };
  try {
    const items = JSON.parse(res.output || '[]');
    return { ok: true, truncated: items.length >= limit, items };
  } catch (e) {
    return { ok: false, error: `gh issue list returned unparseable output: ${e.message}` };
  }
}

const DETAIL_SELECTION = `__typename ... on Issue { number title state labels(first: 20) { nodes { name } } timelineItems(last: 50, itemTypes: [PROJECT_V2_ITEM_STATUS_CHANGED_EVENT]) { nodes { ... on ProjectV2ItemStatusChangedEvent { createdAt previousStatus status } } } comments(last: 30) { nodes { createdAt body } } }`;

function fetchDetails(runGh, cwd, repo, numbers, batchSize) {
  const issues = {};
  const errors = [];
  if (!repo) return { ok: false, error: 'repository slug unresolvable (no .gh-pmu.json repositories[0] and no GitHub origin remote)' };
  const [owner, name] = repo.split('/');
  let anyAnswered = numbers.length === 0;
  let lastError = null;
  for (let i = 0; i < numbers.length; i += batchSize) {
    const batch = numbers.slice(i, i + batchSize);
    const fields = batch.map((n) => `i${n}: issueOrPullRequest(number: ${n}) { ${DETAIL_SELECTION} }`).join(' ');
    const query = `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`;
    const res = runGh(['api', 'graphql', '--input', '-'], cwd, JSON.stringify({ query, variables: { owner, name } }));
    let body = null;
    try { body = JSON.parse(res.output || 'null'); } catch { body = null; }
    const repoData = body && body.data && body.data.repository;
    if (!repoData) {
      lastError = res.error || 'gh api graphql returned no data';
      errors.push(lastError);
      continue;
    }
    anyAnswered = true;
    for (const e of (body.errors || [])) errors.push(e.message || String(e));
    for (const node of Object.values(repoData)) {
      if (!node || node.__typename !== 'Issue') continue;
      issues[node.number] = {
        number: node.number,
        title: node.title,
        state: node.state,
        labels: ((node.labels && node.labels.nodes) || []).map((l) => l.name),
        statusEvents: ((node.timelineItems && node.timelineItems.nodes) || []).filter((ev) => ev && ev.createdAt),
        comments: ((node.comments && node.comments.nodes) || []).filter((c) => c && c.createdAt),
      };
    }
  }
  if (!anyAnswered) return { ok: false, error: lastError };
  return { ok: true, errors, issues };
}

/**
 * Everything the facts for one local calendar day are derived from.
 * `deps` is injectable so tests drive the runners; the defaults are the real
 * git/gh probes.
 */
function fetchDayRaw(date, deps = {}) {
  const cwd = deps.cwd || process.cwd();
  const config = deps.config || loadDailyLogConfig();
  const runGh = deps.runGh || runGhKeepOutput;
  const collectMetrics = deps.collectMetrics || stats.collectMetrics;
  const collectTags = deps.collectTags || stats.collectTags;
  const repo = deps.repo !== undefined ? deps.repo : stats.getRepoSlug(cwd);

  // Same range semantics /idpf-stats already uses — no second date engine.
  // A bare --daily-log (deps.today) takes the --today range, midnight to now;
  // an explicit date takes --date, T00:00:00 to T23:59:59.
  const { since, until } = stats.parseArgs(deps.today ? ['--today'] : ['--date', date]);
  const range = { since, until };
  const window = `${since}..${until}`;
  const limit = config.issueSearchLimit;

  const metrics = collectMetrics({ since, until, cwd });
  const created = searchIssues(runGh, cwd, repo, 'all', `created:${window}`, limit);
  const closed = searchIssues(runGh, cwd, repo, 'closed', `closed:${window}`, limit);
  const updated = searchIssues(runGh, cwd, repo, 'all', `updated:${window}`, limit);
  const blockers = searchIssues(runGh, cwd, repo, 'open', `label:${[].concat(config.labels.blocked).join(',')}`, limit);

  const candidates = new Set();
  for (const src of [created, closed, updated]) {
    if (src.ok) src.items.forEach((it) => candidates.add(Number(it.number)));
  }
  for (const ref of (metrics && metrics.issues) || []) candidates.add(Number(String(ref).replace('#', '')));
  const numbers = [...candidates].filter(Number.isInteger).sort((a, b) => a - b);

  const details = fetchDetails(runGh, cwd, repo, numbers, config.graphqlBatchSize);
  const tags = collectTags(cwd);

  return { date, range, repo, metrics, created, closed, updated, details, tags, blockers };
}

// ─── pure derivation half ─────────────────────────────────────

const labelNames = (labels) => (labels || []).map((l) => (typeof l === 'string' ? l : l.name));
const brief = (it) => ({ number: Number(it.number), title: it.title, labels: labelNames(it.labels) });
const byNumber = (a, b) => a.number - b.number;

function inRange(stamp, range) {
  const t = Date.parse(stamp);
  return Number.isFinite(t) && t >= Date.parse(range.since) && t <= Date.parse(range.until);
}

const REVIEW_HEADER = /^## [A-Za-z ]*Review #(\d+)/m;
const RECOMMENDATION = /### Recommendation\s*\n\*\*([^*]+)\*\*/;

/** Derive the day's facts from fetchDayRaw output. Pure. */
function buildDayFacts(raw, config = DEFAULTS) {
  const { range } = raw;
  const unavailable = {};
  const warnings = [];
  const cfg = { ...DEFAULTS, ...config, labels: { ...DEFAULTS.labels, ...(config.labels || {}) }, statuses: { ...DEFAULTS.statuses, ...(config.statuses || {}) } };

  const withLabel = (src, key, labelName, stamp) => {
    if (!src.ok) {
      unavailable[key] = src.error;
      return null;
    }
    return src.items
      .filter((it) => labelNames(it.labels).includes(labelName) && inRange(it[stamp], range))
      .map(brief)
      .sort(byNumber);
  };

  for (const [key, src] of [['created', raw.created], ['closed', raw.closed], ['updated', raw.updated], ['blockers', raw.blockers]]) {
    if (src && src.ok && src.truncated) warnings.push(`${key} search returned its limit and is possibly truncated`);
  }

  const bugs = {
    opened: withLabel(raw.created, 'bugs.opened', cfg.labels.bug, 'createdAt'),
    closed: withLabel(raw.closed, 'bugs.closed', cfg.labels.bug, 'closedAt'),
  };
  const qaRequired = {
    opened: withLabel(raw.created, 'qaRequired.opened', cfg.labels.qaRequired, 'createdAt'),
    closed: withLabel(raw.closed, 'qaRequired.closed', cfg.labels.qaRequired, 'closedAt'),
  };

  let closedIssues = null;
  if (raw.closed.ok) closedIssues = raw.closed.items.filter((it) => inRange(it.closedAt, range)).map(brief).sort(byNumber);
  else unavailable['issues.closed'] = raw.closed.error;

  let transitioned = null;
  let movedToInReview = null;
  let movedToDone = null;
  let reviews = null;
  if (raw.details.ok) {
    const details = Object.values(raw.details.issues).sort(byNumber);
    transitioned = details
      .map((d) => ({
        number: d.number,
        title: d.title,
        labels: labelNames(d.labels),
        transitions: d.statusEvents
          .filter((ev) => inRange(ev.createdAt, range))
          .map((ev) => ({ at: ev.createdAt, from: ev.previousStatus, to: ev.status })),
      }))
      .filter((d) => d.transitions.length > 0);
    const movedTo = (status) => transitioned
      .filter((d) => d.transitions.some((t) => t.to === status))
      .map(({ number, title, labels }) => ({ number, title, labels }));
    movedToInReview = movedTo(cfg.statuses.inReview);
    movedToDone = movedTo(cfg.statuses.done);

    reviews = { passed: [], findings: [] };
    for (const d of details) {
      for (const c of d.comments) {
        if (!inRange(c.createdAt, range)) continue;
        const header = REVIEW_HEADER.exec(c.body || '');
        const rec = RECOMMENDATION.exec(c.body || '');
        if (!header || !rec) continue;
        const entry = { number: d.number, title: d.title, reviewNumber: Number(header[1]), recommendation: rec[1].trim() };
        (entry.recommendation.startsWith('Ready') ? reviews.passed : reviews.findings).push(entry);
      }
    }
    for (const e of raw.details.errors || []) warnings.push(`issue detail lookup: ${e}`);
  } else {
    for (const key of ['issues.transitioned', 'issues.movedToInReview', 'issues.movedToDone', 'reviews']) {
      unavailable[key] = raw.details.error;
    }
  }

  let releases = null;
  if (raw.tags && raw.tags.tags) {
    releases = raw.tags.tags
      .filter((t) => inRange(new Date(t.date).toISOString(), range))
      .map((t) => ({ name: t.name, date: new Date(t.date).toISOString() }));
  } else {
    unavailable.releases = (raw.tags && raw.tags.reason) || 'tag list unreadable';
  }

  let blockers = null;
  if (raw.blockers && raw.blockers.ok) {
    blockers = { asOf: 'collection-time', open: raw.blockers.items.map(brief).sort(byNumber) };
  } else {
    unavailable.blockers = (raw.blockers && raw.blockers.error) || 'blocker search did not run';
  }

  const m = raw.metrics || {};
  const volume = m.volume || {};
  const testing = m.testing || {};
  const mu = m.unavailable || {};
  const activity = {
    commits: volume.commits === undefined ? null : volume.commits,
    filesChanged: volume.filesChanged === undefined ? null : volume.filesChanged,
    linesAdded: volume.linesAdded === undefined ? null : volume.linesAdded,
    linesRemoved: volume.linesRemoved === undefined ? null : volume.linesRemoved,
    byType: volume.byType || {},
    testsAdded: testing.newTestFiles === undefined ? null : testing.newTestFiles,
  };
  const activityReasons = { commits: 'commits', filesChanged: 'filesChanged', linesAdded: 'linesAdded', linesRemoved: 'linesRemoved', testsAdded: 'newTestFiles' };
  for (const [field, source] of Object.entries(activityReasons)) {
    if (activity[field] === null) unavailable[`activity.${field}`] = mu[source] || 'metric not collected';
  }

  return {
    date: raw.date,
    range,
    repo: raw.repo,
    issues: { transitioned, movedToInReview, movedToDone, closed: closedIssues },
    bugs,
    qaRequired,
    reviews,
    releases,
    blockers,
    activity,
    referencedIssues: (m.issues || []).slice(),
    unavailable,
    warnings,
  };
}

/** Lists that record the day's work. Blockers are current state, not the day's work. */
function dayLists(facts) {
  return [
    facts.issues.transitioned, facts.issues.closed,
    facts.bugs.opened, facts.bugs.closed,
    facts.qaRequired.opened, facts.qaRequired.closed,
    facts.reviews && facts.reviews.passed, facts.reviews && facts.reviews.findings,
    facts.releases,
  ];
}

function hasActivity(facts) {
  if (typeof facts.activity.commits === 'number' && facts.activity.commits > 0) return true;
  return dayLists(facts).some((list) => Array.isArray(list) && list.length > 0);
}

/**
 * One file per active day. A quiet day writes nothing and is listed as skipped;
 * a day that found nothing only because probes failed is undetermined, with its
 * reasons, so a missing file is never left unexplained.
 */
function planDailyLogWrites(days, config = DEFAULTS) {
  const writes = [];
  const skipped = [];
  const undetermined = [];
  for (const facts of days) {
    if (hasActivity(facts)) {
      writes.push({ date: facts.date, path: dailyLogPath(facts.date, config) });
    } else if (Object.keys(facts.unavailable).length > 0) {
      undetermined.push({ date: facts.date, reasons: facts.unavailable });
    } else {
      skipped.push(facts.date);
    }
  }
  return { writes, skipped, undetermined };
}

function collectKnownNumbers(value, known) {
  if (Array.isArray(value)) {
    value.forEach((v) => collectKnownNumbers(v, known));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'number' && Number.isInteger(Number(v))) known.add(Number(v));
      else collectKnownNumbers(v, known);
    }
  } else if (typeof value === 'string' && /^#\d+$/.test(value)) {
    known.add(Number(value.slice(1)));
  }
  return known;
}

/**
 * Every `#N` a written report cites that the collector output does not contain.
 * Empty means every citation traces to a collected fact. A `#` preceded by a
 * word character, `&`, `/`, `(` or another `#` is a heading, entity or anchor,
 * not a citation.
 */
function verifyCitations(reportText, collectorJson) {
  const known = collectKnownNumbers(collectorJson, new Set());
  const unknown = new Set();
  const pattern = /(^|[^\w&/#(])#(\d+)\b/g;
  let match;
  while ((match = pattern.exec(String(reportText || ''))) !== null) {
    const n = Number(match[2]);
    if (!known.has(n)) unknown.add(n);
  }
  return [...unknown].sort((a, b) => a - b).map((n) => `#${n}`);
}

// ─── CLI ──────────────────────────────────────────────────────

const IGNORED_FLAGS = new Set(['--repos', '--repos-edit']);

function parseCliArgs(argv) {
  const out = { dates: null, ignored: [], verifyCitations: null, facts: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dates' && argv[i + 1]) out.dates = argv[++i];
    else if (a === '--verify-citations' && argv[i + 1]) out.verifyCitations = argv[++i];
    else if (a === '--facts' && argv[i + 1]) out.facts = argv[++i];
    else if (IGNORED_FLAGS.has(a)) {
      out.ignored.push(a);
      if (a === '--repos' && argv[i + 1] && !argv[i + 1].startsWith('--')) i++;
    }
  }
  return out;
}

/** --daily-log is current-repository only: name every multi-repo source it set aside. */
function ignoredSources(flags, cachedRepos) {
  const sources = [...flags];
  if (Array.isArray(cachedRepos) && cachedRepos.length > 0) sources.push('repos.json');
  return sources;
}

function main(argv) {
  const opts = parseCliArgs(argv);

  if (opts.verifyCitations) {
    const report = fs.readFileSync(opts.verifyCitations, 'utf8');
    const facts = JSON.parse(fs.readFileSync(opts.facts, 'utf8'));
    const unknown = verifyCitations(report, facts);
    process.stdout.write(JSON.stringify({ ok: unknown.length === 0, unknown }, null, 2) + '\n');
    return unknown.length === 0 ? 0 : 1;
  }

  const today = opts.dates === null;
  const validated = today ? { ok: true, dates: [todayLocalDate()], invalid: [] } : validateDateList(opts.dates);
  if (!validated.ok) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'invalid date list', invalid: validated.invalid }, null, 2) + '\n');
    return 1;
  }

  const config = loadDailyLogConfig();
  const days = validated.dates.map((date) => buildDayFacts(fetchDayRaw(date, { config, today }), config));
  const ignored = ignoredSources(opts.ignored, stats.readRepoCache());
  process.stdout.write(JSON.stringify({
    ok: true,
    dates: validated.dates,
    days,
    plan: planDailyLogWrites(days, config),
    sections: config.sections,
    ignored,
  }, null, 2) + '\n');
  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  loadDailyLogConfig, validateDateList, todayLocalDate, dailyLogPath, statsReportPath,
  fetchDayRaw, buildDayFacts, hasActivity, planDailyLogWrites, verifyCitations,
  parseCliArgs, ignoredSources, runGhKeepOutput, DEFAULTS,
};
