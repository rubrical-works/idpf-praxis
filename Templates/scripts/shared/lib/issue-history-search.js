// Rubrical Works (c) 2026
/**
 * @framework-script 0.122.0
 * @description Issue-history retrieval for the prior-art sweep: every term over every repository in one gh api graphql request, matched locally against title and stripped body. Exports searchIssueHistory(), buildRequest(), matchIssue() and main().
 * @checksum sha256:placeholder
 *
 * issue-history-search.js
 *
 * Issue-history retrieval for the prior-art sweep (#3631). Replaces the
 * on-disk cache of #3607: there is nothing to invalidate, because nothing is
 * kept. One sweep is ONE `gh api graphql` request, whatever its term or
 * repository count:
 *
 *   - **One aliased search per term.** `tN: search(type: ISSUE, first: 100,
 *     query: "\"<term>\" repo:<a> repo:<b> is:issue")` returning `issueCount`
 *     and the first page (100 results, GitHub's `first` limit). The term is one
 *     quoted phrase, so an `OR` inside it is never a search operator (#3084).
 *     When the qualifier list would push a search query past GitHub's
 *     MAX_SEARCH_QUERY characters, the repositories are split across aliases
 *     (`tN_0`, `tN_1`, ...) in the SAME request.
 *   - **Reachability probed in the same request.** Search silently ignores a
 *     `repo:` qualifier for a repository that does not exist or cannot be
 *     read, so each repository is also probed with `rN: repository(...)`; a
 *     null probe makes that repository a skipped surface with GitHub's reason,
 *     never a surface with zero hits.
 *   - **Matched locally.** GitHub search tokenizes and also matches comments,
 *     so every result is re-filtered: a hit only when the term occurs,
 *     case-insensitively and as an exact substring, in the title or in
 *     `stripExcludedSections(body)` (prior-art-marker.js, #2874).
 *   - **Never a silent zero.** A term whose `issueCount` exceeds the results
 *     read is reported as counted, not fully read, naming both numbers; a term
 *     whose search errored is `failed` with its reason; a request that fails
 *     outright skips every repository.
 *
 * The request travels by file (`gh api graphql --input <file>`), never inline,
 * and the file is removed afterwards. GitHub's `rateLimit` for the request is
 * returned with the result. Node built-ins and sibling framework modules only
 * (runtime dependency contract, #2418).
 *
 * CLI:
 *   node issue-history-search.js --term <t> [--term <t> ...] [--repo <owner/name> ...] [--root <dir>]
 * No --repo → this repository, from .gh-pmu.json `repositories[0]`.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { stripExcludedSections } = require('./prior-art-marker.js');

/** Results read per search: GitHub's `first` limit. */
const FIRST = 100;
/** GitHub's maximum length of one search query string. */
const MAX_SEARCH_QUERY = 256;
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
/** Bound on the one `gh api graphql` call (#2469 spawn timeout contract). */
const GH_TIMEOUT_MS = 120000;

const errMessage = (e) => (e && e.message ? e.message : String(e));

function defaultRun(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, timeout: GH_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * A term as GitHub searches it: double quotes (which cannot be escaped inside
 * a phrase) become spaces and whitespace runs collapse to one space (#3690).
 * The query and the local re-filter both use this form, so a term GitHub
 * matched is never rejected locally for a quote or a doubled space.
 */
function normalizeTerm(term) {
  return String(term || '').replace(/"/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Does `term` occur in the title or the excluded-sections-stripped body?
 * Both sides are compared in normalized form, case-insensitively.
 */
function matchIssue(issue, term) {
  const t = normalizeTerm(term).toLowerCase();
  if (!t) return false;
  if (normalizeTerm(issue.title).toLowerCase().includes(t)) return true;
  return normalizeTerm(stripExcludedSections(String(issue.body || ''))).toLowerCase().includes(t);
}

/** A term as one search phrase: its normalized form, quoted. */
function phrase(term) {
  return `"${normalizeTerm(term)}"`;
}

/** Split repositories into groups whose qualifiers fit beside `head` in one search query. */
function groupRepos(head, repos) {
  const groups = [];
  let current = [];
  const len = (g) => `${head} ${g.map((r) => `repo:${r}`).join(' ')} is:issue`.length;
  for (const repo of repos) {
    if (current.length && len([...current, repo]) > MAX_SEARCH_QUERY) {
      groups.push(current);
      current = [];
    }
    current.push(repo);
  }
  if (current.length) groups.push(current);
  return groups;
}

/**
 * The single GraphQL request for a sweep: `{ query, searches, probes }`.
 * `searches` maps each alias to its term and repositories; `probes` maps each
 * probe alias to its repository.
 */
function buildRequest({ repos, terms }) {
  const searches = [];
  terms.forEach((term, i) => {
    const head = phrase(term);
    const groups = groupRepos(head, repos);
    groups.forEach((group, g) => {
      const alias = groups.length === 1 ? `t${i}` : `t${i}_${g}`;
      const q = `${head} ${group.map((r) => `repo:${r}`).join(' ')} is:issue`;
      searches.push({ alias, term, repos: group, q });
    });
  });
  const probes = repos.map((repo, i) => ({ alias: `r${i}`, repo }));
  const fields = 'issueCount nodes { ... on Issue { number title state body repository { nameWithOwner } } }';
  const parts = ['rateLimit { cost remaining limit resetAt }'];
  for (const s of searches) parts.push(`${s.alias}: search(type: ISSUE, first: ${FIRST}, query: ${JSON.stringify(s.q)}) { ${fields} }`);
  for (const p of probes) {
    const [owner, name] = p.repo.split('/');
    parts.push(`${p.alias}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { nameWithOwner }`);
  }
  return { query: `query { ${parts.join(' ')} }`, searches, probes };
}

/**
 * Send one request by file and parse the response. gh exits 1 on a response
 * carrying `errors` even when it also carries data, so a partial result is
 * recovered from the failed call's stdout rather than lost.
 */
function sendRequest(query, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-history-search-'));
  const file = path.join(dir, 'request.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ query }));
    let raw;
    try {
      raw = run(['api', 'graphql', '--input', file]);
    } catch (e) {
      raw = e && typeof e.stdout === 'string' ? e.stdout : '';
      if (!raw.trim().startsWith('{')) throw e;
    }
    return JSON.parse(raw);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Search issue history for every term over every repository in one request.
 * Returns `{ ok, requests, rateLimit, terms, surfaces, warnings }`.
 */
function searchIssueHistory({ repos: requestedRepos = [], terms: requested = [], run = defaultRun } = {}) {
  // A batch pools its members' terms, so the same term can arrive twice.
  const allTerms = [...new Set(requested)];
  // A term that normalizes to '' (quote-only, whitespace-only) would search
  // the empty phrase: it is failed here and never sent (#3701).
  const terms = allTerms.filter((term) => normalizeTerm(term));
  const emptyTermReport = (term) => ({ term, status: 'failed', reason: 'term is empty once quotes and whitespace are normalized; not searched' });
  // Repository names are case-insensitive: a repeat (or a case variant) would
  // probe twice and leave the first surface reporting zero hits (#3672).
  const seenRepos = new Set();
  const allRepos = requestedRepos.filter((repo) => {
    const key = String(repo).toLowerCase();
    if (seenRepos.has(key)) return false;
    seenRepos.add(key);
    return true;
  });
  // A library caller is validated here, not only by main(): a name that is not
  // owner/name would make the request invalid GraphQL and fail every surface (#3701).
  const isValidRepo = (repo) => typeof repo === 'string' && REPO_PATTERN.test(repo);
  const repos = allRepos.filter(isValidRepo);
  const invalidSurface = (repo) => ({ repo, status: 'skipped', reason: `invalid repository: must be owner/name; got ${JSON.stringify(repo)}` });
  // Surfaces and term reports in the order requested, invalid entries included.
  const orderSurfaces = (validSurfaces) => {
    const byName = new Map(repos.map((repo, i) => [repo, validSurfaces[i]]));
    return allRepos.map((repo) => (isValidRepo(repo) ? byName.get(repo) : invalidSurface(repo)));
  };
  const orderTerms = (reports) => {
    const byTerm = new Map(terms.map((term, i) => [term, reports[i]]));
    return allTerms.map((term) => byTerm.get(term) || emptyTermReport(term));
  };
  const request = buildRequest({ repos, terms });
  const warnings = [];
  let response;
  try {
    response = sendRequest(request.query, run);
  } catch (e) {
    const reason = `unreachable: ${errMessage(e)}`;
    return {
      ok: true,
      requests: 1,
      rateLimit: null,
      terms: orderTerms(terms.map((term) => ({ term, status: 'failed', reason: `request failed: ${errMessage(e)}` }))),
      surfaces: orderSurfaces(repos.map((repo) => ({ repo, status: 'skipped', reason }))),
      warnings,
    };
  }
  const data = (response && response.data) || {};
  const errorsByAlias = new Map();
  for (const err of (response && response.errors) || []) {
    const alias = Array.isArray(err.path) ? err.path[0] : null;
    if (alias) errorsByAlias.set(alias, err.message || String(err.type || 'error'));
    else warnings.push(err.message || JSON.stringify(err));
  }

  const surfaces = request.probes.map(({ alias, repo }) => (data[alias]
    // No prototype: a `__proto__` term is an own key, not a prototype swap (#3701).
    ? { repo, status: 'ok', hits: Object.create(null) }
    : { repo, status: 'skipped', reason: `unreachable: ${errorsByAlias.get(alias) || 'repository not returned'}` }));
  // Keyed by the name as requested AND the canonical name the probe returned:
  // a renamed or transferred repository's probe follows the redirect, while
  // its search nodes carry the canonical name (#3701).
  const byRepo = new Map(surfaces.map((s) => [s.repo.toLowerCase(), s]));
  request.probes.forEach(({ alias }, i) => {
    const canonical = data[alias] && data[alias].nameWithOwner;
    if (typeof canonical === 'string' && canonical) byRepo.set(canonical.toLowerCase(), surfaces[i]);
  });

  const termReports = terms.map((term) => {
    const own = request.searches.filter((s) => s.term === term);
    const failed = own.filter((s) => !data[s.alias]);
    if (failed.length) {
      return { term, status: 'failed', reason: failed.map((s) => errorsByAlias.get(s.alias) || 'search not returned').join('; ') };
    }
    let issueCount = 0;
    let read = 0;
    for (const s of surfaces) if (s.status === 'ok') s.hits[term] = [];
    for (const s of own) {
      const result = data[s.alias];
      const nodes = Array.isArray(result.nodes) ? result.nodes.filter((n) => n && Number.isInteger(n.number)) : [];
      issueCount += Number(result.issueCount) || 0;
      read += nodes.length;
      for (const n of nodes) {
        const nodeRepo = String((n.repository && n.repository.nameWithOwner) || '');
        const surface = byRepo.get(nodeRepo.toLowerCase());
        if (!surface) {
          warnings.push(`term ${JSON.stringify(term)}: result #${n.number} belongs to ${nodeRepo || 'an unnamed repository'}, which matches no requested repository; not counted`);
          continue;
        }
        if (surface.status !== 'ok' || !matchIssue(n, term)) continue;
        surface.hits[term].push({ number: n.number, title: n.title || '', state: String(n.state || '').toUpperCase() });
      }
    }
    const report = { term, status: 'ok', issueCount, read, overCap: issueCount > read };
    if (report.overCap) report.note = `counted, not fully read: ${issueCount} issues match, the first ${read} were read`;
    return report;
  });

  for (const s of surfaces) if (s.status === 'ok') for (const term of Object.keys(s.hits)) s.hits[term].sort((a, b) => b.number - a.number);

  return { ok: true, requests: 1, rateLimit: data.rateLimit || null, terms: orderTerms(termReports), surfaces: orderSurfaces(surfaces), warnings };
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
  let root = deps.root || process.cwd();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') repos.push(argv[++i]);
    else if (a === '--term') terms.push(argv[++i]);
    else if (a === '--root') root = argv[++i];
    else return fail(`unknown argument: ${a}`);
  }
  if (!terms.length || terms.some((t) => typeof t !== 'string' || !normalizeTerm(t))) return fail('pass at least one non-empty --term <text> (quotes and whitespace alone are empty)');
  if (!repos.length) {
    const own = defaultRepo(root);
    if (!own) return fail('no --repo given and .gh-pmu.json names no repository');
    repos.push(own);
  }
  const badAt = repos.findIndex((r) => typeof r !== 'string' || !REPO_PATTERN.test(r));
  if (badAt !== -1) return fail(`--repo must be owner/name; got ${JSON.stringify(repos[badAt] === undefined ? '' : repos[badAt])}`);
  try {
    emit(searchIssueHistory({ repos, terms, run: deps.run }));
    return 0;
  } catch (e) {
    emit({ ok: false, error: { code: 'SEARCH_FAILED', message: errMessage(e) } });
    return 1;
  }
}

module.exports = {
  FIRST,
  MAX_SEARCH_QUERY,
  matchIssue,
  buildRequest,
  searchIssueHistory,
  main,
};

if (require.main === module) {
  process.exitCode = main();
}
