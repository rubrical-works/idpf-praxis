// Rubrical Works (c) 2026
/**
 * @framework-script 0.118.0
 * issue-history-cache.js
 *
 * Issue-history retrieval for the prior-art sweep (#3607). The sweep used to
 * run one `gh issue list --search` per term per repository, so its cost grew
 * with terms × repos; a 13-issue batch needed about 300 calls. This fetches
 * each repository's issues once, matches every term locally, and keeps the
 * result for reuse:
 *
 *   - **Fetched in full once.** REST `repos/<owner/name>/issues?state=all`,
 *     paged until GitHub returns fewer than a full page, at most `maxPages`
 *     pages. Pull requests in that listing are dropped.
 *   - **Cached on disk.** `.claude/.cache/issue-history/<owner>-<name>.json`
 *     (gitignored) is the unit of reuse: every invocation in a batch reads it,
 *     and a later one refreshes it incrementally with `since=<fetchedAt>`.
 *     Within one process a repository is loaded at most once. The cache is a
 *     disposable per-host copy, so GitHub stays the only source of truth —
 *     the reason #2877's persistent index is not pursued.
 *   - **Matched locally.** A term is a hit when it occurs, case-insensitively
 *     and as an exact substring, in the title or in
 *     `stripExcludedSections(body)` (prior-art-marker.js, #2874), so
 *     identifiers like `review-finalize.js` are not tokenized the way GitHub
 *     search does, and earlier sweeps' sections are not evidence.
 *   - **Never a silent zero.** A fetch that stops at the cap is reported as
 *     possibly truncated; an unreachable repository is `skipped` with its
 *     reason and no hits; a repository that cannot refresh serves its cache
 *     marked `stale`.
 *
 * Page size and cap come from prior-art-sweep.json
 * `searchSurfaces.issueHistory.fetch`, else DEFAULTS. Node built-ins and
 * sibling framework modules only (runtime dependency contract, #2418).
 *
 * CLI:
 *   node issue-history-cache.js --term <t> [--term <t> ...] [--repo <owner/name> ...]
 *                               [--refresh] [--root <dir>]
 * No --repo → this repository, from .gh-pmu.json `repositories[0]`.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { stripExcludedSections } = require('./prior-art-marker.js');

const DEFAULTS = Object.freeze({ pageSize: 100, maxPages: 100 });
const CACHE_DIR = path.join('.claude', '.cache', 'issue-history');
const CONFIG_PATH = path.join('.claude', 'metadata', 'prior-art-sweep.json');
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const errMessage = (e) => (e && e.message ? e.message : String(e));

/** The on-disk cache file for `owner/name`. */
function cacheFilePath(root, repo) {
  return path.join(root, CACHE_DIR, `${String(repo).replace('/', '-')}.json`);
}

/** `{ pageSize, maxPages }` from prior-art-sweep.json, each falling back to DEFAULTS. */
function readFetchConfig(root = process.cwd()) {
  let fetchCfg = {};
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, CONFIG_PATH), 'utf8'));
    fetchCfg = (cfg && cfg.searchSurfaces && cfg.searchSurfaces.issueHistory && cfg.searchSurfaces.issueHistory.fetch) || {};
  } catch {
    fetchCfg = {};
  }
  const positive = (v, d) => (Number.isInteger(v) && v > 0 ? v : d);
  return {
    pageSize: positive(fetchCfg.pageSize, DEFAULTS.pageSize),
    maxPages: positive(fetchCfg.maxPages, DEFAULTS.maxPages),
  };
}

/** Per-page bound on one `gh api` call (#2469 spawn timeout contract). */
const GH_PAGE_TIMEOUT_MS = 60000;

function defaultRun(args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: GH_PAGE_TIMEOUT_MS });
}

/**
 * Page through a repository's issues. `truncated` is true when the cap was
 * reached on a full page, so more may exist.
 */
function fetchPages(repo, { run, pageSize, maxPages, since }) {
  const issues = [];
  let pages = 0;
  for (let page = 1; ; page++) {
    if (page > maxPages) return { issues, pages, truncated: true };
    let query = `repos/${repo}/issues?state=all&per_page=${pageSize}&page=${page}`;
    if (since) query += `&since=${encodeURIComponent(since)}`;
    const raw = JSON.parse(run(['api', query]));
    if (!Array.isArray(raw)) {
      throw new Error(`response for ${repo} page ${page} is not a list${raw && raw.message ? `: ${raw.message}` : ''}`);
    }
    pages++;
    for (const it of raw) {
      if (!it || it.pull_request) continue;
      issues.push({
        number: it.number,
        title: it.title || '',
        state: String(it.state || '').toUpperCase(),
        body: it.body || '',
        updatedAt: it.updated_at || null,
      });
    }
    if (raw.length < pageSize) return { issues, pages, truncated: false };
  }
}

/** Does `term` occur in the title or the excluded-sections-stripped body? */
function matchIssue(issue, term) {
  const t = String(term || '').toLowerCase();
  if (!t) return false;
  if (String(issue.title || '').toLowerCase().includes(t)) return true;
  return stripExcludedSections(String(issue.body || '')).toLowerCase().includes(t);
}

/**
 * A history bound to one root, runner and config. `load(repo)` returns the
 * repository's surface; `search({repos, terms})` matches terms over each.
 */
function createIssueHistory(opts = {}) {
  const root = opts.root || process.cwd();
  const run = opts.run || defaultRun;
  const now = opts.now || (() => new Date().toISOString());
  const cfg = readFetchConfig(root);
  const pageSize = opts.pageSize || cfg.pageSize;
  const maxPages = opts.maxPages || cfg.maxPages;
  const memo = new Map();

  function readCache(repo) {
    try {
      const data = JSON.parse(fs.readFileSync(cacheFilePath(root, repo), 'utf8'));
      return data && data.repo === repo && Array.isArray(data.issues) && data.fetchedAt ? data : null;
    } catch {
      return null;
    }
  }

  function writeCache(repo, data) {
    const file = cacheFilePath(root, repo);
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data));
      return null;
    } catch (e) {
      return `cache not written (${file}): ${errMessage(e)}`;
    }
  }

  function load(repo) {
    if (memo.has(repo)) return memo.get(repo);
    const cached = readCache(repo);
    const startedAt = now();
    let surface;
    try {
      const got = fetchPages(repo, { run, pageSize, maxPages, since: cached ? cached.fetchedAt : null });
      let issues = got.issues;
      if (cached) {
        const byNumber = new Map(cached.issues.map((i) => [i.number, i]));
        for (const i of got.issues) byNumber.set(i.number, i);
        issues = [...byNumber.values()];
      }
      issues.sort((a, b) => b.number - a.number);
      const truncated = Boolean(got.truncated || (cached && cached.truncated));
      const warning = writeCache(repo, { repo, fetchedAt: startedAt, truncated, issues });
      surface = { repo, status: 'ok', source: cached ? 'refreshed' : 'fetched', truncated, issues, pages: got.pages };
      if (warning) surface.warning = warning;
    } catch (e) {
      surface = cached
        ? { repo, status: 'ok', source: 'stale-cache', stale: true, truncated: Boolean(cached.truncated), issues: cached.issues,
          warning: `could not refresh ${repo} (${errMessage(e)}); serving the cache fetched ${cached.fetchedAt}` }
        : { repo, status: 'skipped', reason: `unreachable: ${errMessage(e)}`, truncated: false, issues: [] };
    }
    memo.set(repo, surface);
    return surface;
  }

  function invalidate(repo) {
    memo.delete(repo);
    try { fs.unlinkSync(cacheFilePath(root, repo)); } catch { /* already gone */ }
  }

  function search({ repos = [], terms = [] } = {}) {
    const surfaces = repos.map((repo) => {
      const s = load(repo);
      const out = { repo, status: s.status };
      if (s.status === 'skipped') return { ...out, reason: s.reason };
      out.source = s.source;
      out.issueCount = s.issues.length;
      out.truncated = s.truncated;
      if (s.truncated) out.note = `possibly truncated: the fetch stopped at its cap of ${maxPages} pages of ${pageSize}`;
      if (s.stale) out.stale = true;
      if (s.warning) out.warning = s.warning;
      out.hits = {};
      for (const term of terms) {
        out.hits[term] = s.issues.filter((i) => matchIssue(i, term)).map((i) => ({ number: i.number, title: i.title, state: i.state }));
      }
      return out;
    });
    return { ok: true, surfaces };
  }

  return { load, search, invalidate };
}

/** This repository, from .gh-pmu.json `repositories[0]`. */
function defaultRepo(root) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.gh-pmu.json'), 'utf8'));
    return Array.isArray(cfg.repositories) ? cfg.repositories[0] : null;
  } catch {
    return null;
  }
}

function main(argv = process.argv.slice(2), deps = {}) {
  const write = deps.write || ((s) => process.stdout.write(s));
  const emit = (obj) => write(`${JSON.stringify(obj, null, 2)}\n`);
  const fail = (message) => { emit({ ok: false, error: { code: 'INVALID_ARGUMENT', message } }); return 1; };
  const repos = [];
  const terms = [];
  let root = process.cwd();
  let refresh = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') repos.push(argv[++i]);
    else if (a === '--term') terms.push(argv[++i]);
    else if (a === '--root') root = argv[++i];
    else if (a === '--refresh') refresh = true;
    else return fail(`unknown argument: ${a}`);
  }
  if (!terms.length || terms.some((t) => typeof t !== 'string' || !t.trim())) return fail('pass at least one non-empty --term <text>');
  if (!repos.length) {
    const own = defaultRepo(root);
    if (!own) return fail('no --repo given and .gh-pmu.json names no repository');
    repos.push(own);
  }
  // findIndex, not find: a trailing --repo pushes undefined, which find()
  // would return as "no bad value" and let through to gh and the cache.
  const badAt = repos.findIndex((r) => typeof r !== 'string' || !REPO_PATTERN.test(r));
  if (badAt !== -1) return fail(`--repo must be owner/name; got ${JSON.stringify(repos[badAt] === undefined ? '' : repos[badAt])}`);
  try {
    const history = createIssueHistory({ root, run: deps.run });
    if (refresh) for (const r of repos) history.invalidate(r);
    emit(history.search({ repos, terms }));
    return 0;
  } catch (e) {
    emit({ ok: false, error: { code: 'SEARCH_FAILED', message: errMessage(e) } });
    return 1;
  }
}

module.exports = {
  DEFAULTS,
  cacheFilePath,
  readFetchConfig,
  matchIssue,
  createIssueHistory,
  main,
};

if (require.main === module) {
  process.exitCode = main();
}
