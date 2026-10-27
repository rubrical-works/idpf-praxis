#!/usr/bin/env node
// Rubrical Works (c) 2026
/**
 * @framework-script 0.113.0
 * @description Analyze a project and generate CI improvement recommendations based on detected languages, test tooling, deployment targets, and deprecated action versions. Produces structured recommendation objects consumed by ci-recommend-ui.js and ci-apply.js.
 * @checksum sha256:placeholder
 *
 * This script is provided by the framework and may be updated.
 * Do not modify directly — changes will be overwritten on hub update.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const { analyzeProject } = require('./ci-analyze.js');

const RECOMMENDATION_TYPES = ['Add', 'Remove', 'Alter', 'Improve'];

/**
 * Deprecated action versions — map old to recommended.
 */
const DEPRECATED_ACTIONS = {
  'actions/checkout@v1': 'actions/checkout@v4',
  'actions/checkout@v2': 'actions/checkout@v4',
  'actions/checkout@v3': 'actions/checkout@v4',
  'actions/setup-node@v1': 'actions/setup-node@v4',
  'actions/setup-node@v2': 'actions/setup-node@v4',
  'actions/setup-node@v3': 'actions/setup-node@v4',
  'actions/setup-python@v2': 'actions/setup-python@v5',
  'actions/setup-python@v3': 'actions/setup-python@v5',
  'actions/setup-python@v4': 'actions/setup-python@v5',
  'actions/cache@v1': 'actions/cache@v4',
  'actions/cache@v2': 'actions/cache@v4',
  'actions/cache@v3': 'actions/cache@v4',
  'actions/upload-artifact@v2': 'actions/upload-artifact@v4',
  'actions/upload-artifact@v3': 'actions/upload-artifact@v4'
};

/**
 * End-of-life date of each Node.js LTS line (nodejs.org release schedule),
 * supported through that day (#3383). The outdated set and the upgrade target
 * are derived from today's date, so a line drops out of support on its date
 * with no code change — the flat list this replaces went stale silently.
 * A line absent from the table is never flagged.
 */
const NODE_EOL = {
  '10': '2021-04-30',
  '12': '2022-04-30',
  '14': '2023-04-30',
  '16': '2023-09-11',
  '18': '2025-04-30',
  '20': '2026-04-30',
  '22': '2027-04-30',
  '24': '2028-04-30'
};

/** True when `version`'s end-of-life day has fully passed on `now`. */
function isNodeEol(version, now) {
  const eol = NODE_EOL[version];
  return Boolean(eol) && Date.parse(`${eol}T23:59:59.999Z`) < now.getTime();
}

/**
 * The major line a `node-version` value pins, or null when it pins none
 * (#3383). '18', '18.x', '18.20.4', 'v18', '^18', '~18' and '18.*' all pin
 * 18; an open range ('>=18') or an alias ('lts/*') pins no line, since
 * setup-node resolves it to the newest matching release.
 * @param {*} spec
 * @returns {string|null}
 */
function nodeMajorLine(spec) {
  const [major, ...rest] = String(spec).trim().replace(/^[v^~]/i, '').split('.');
  if (!/^\d+$/.test(major) || !rest.every((p) => /^(\d+|x|\*)$/i.test(p))) return null;
  return String(Number(major));
}

/**
 * Node.js lines past end-of-life on `now`.
 * @param {Date} [now]
 * @returns {string[]}
 */
function outdatedNodeVersions(now = new Date()) {
  return Object.keys(NODE_EOL).filter((v) => isNodeEol(v, now));
}

/**
 * Version an EOL Node.js recommendation upgrades to: the oldest line in the
 * table still in support on `now` (#3369 set 22; #3383 derives it, so the
 * target is never itself end-of-life).
 * @param {Date} [now]
 * @returns {string|null}
 */
function nodeUpgradeTarget(now = new Date()) {
  const supported = Object.keys(NODE_EOL).filter((v) => !isNodeEol(v, now));
  return supported.sort((a, b) => Number(a) - Number(b))[0] || null;
}

/**
 * Inventory all workflow files in a project.
 * @param {string} projectDir - Path to project root
 * @returns {Array<{ file: string, fileName: string, name: string, triggers: string[], jobs: Array, raw: string }>}
 */
function inventoryWorkflows(projectDir) {
  const workflowsDir = path.join(projectDir, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) return [];

  const files = fs.readdirSync(workflowsDir)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

  return files.map(fileName => {
    const filePath = path.join(workflowsDir, fileName);
    const raw = fs.readFileSync(filePath, 'utf8');
    let parsed = null;
    try {
      parsed = yaml.parse(raw);
    } catch (e) {
      // Invalid YAML — minimal entry, carrying the error so a report can name
      // the file rather than drop it (#3430)
      return { file: filePath, fileName, name: fileName, triggers: [], on: null, jobs: [], raw, parseError: e.message };
    }

    if (!parsed) {
      return { file: filePath, fileName, name: fileName, triggers: [], on: null, jobs: [], raw };
    }

    // Extract name
    const name = parsed.name || fileName;

    // Extract triggers
    let triggers = [];
    if (parsed.on) {
      if (typeof parsed.on === 'string') triggers = [parsed.on];
      else if (Array.isArray(parsed.on)) triggers = parsed.on;
      else triggers = Object.keys(parsed.on);
    }

    // Workflow-level defaults.run.working-directory, the fallback below a
    // job's own (#3438): step → job → workflow, as GitHub resolves it.
    const wfDefaultsRun = parsed.defaults && parsed.defaults.run;
    const wfWorkingDirectory = wfDefaultsRun && typeof wfDefaultsRun['working-directory'] === 'string'
      ? wfDefaultsRun['working-directory'] : null;

    // Extract jobs
    const jobs = [];
    if (parsed.jobs && typeof parsed.jobs === 'object') {
      for (const [jobName, jobDef] of Object.entries(parsed.jobs)) {
        if (!jobDef || typeof jobDef !== 'object') continue;

        const steps = Array.isArray(jobDef.steps) ? jobDef.steps : [];
        const hasCache = steps.some(s =>
          s && s.uses && /actions\/cache/i.test(s.uses)
        ) || steps.some(s =>
          s && s.with && s.with.cache
        );

        const matrix = jobDef.strategy && jobDef.strategy.matrix
          ? jobDef.strategy.matrix
          : null;

        const runsOn = jobDef['runs-on'] || null;
        const usesReusable = typeof jobDef.uses === 'string';
        const defaultsRun = jobDef.defaults && jobDef.defaults.run;
        const workingDirectory = defaultsRun && typeof defaultsRun['working-directory'] === 'string'
          ? defaultsRun['working-directory'] : wfWorkingDirectory;

        jobs.push({
          name: jobName,
          runsOn,
          steps,
          stepCount: steps.length,
          hasCache,
          matrix,
          usesReusable,
          condition: jobDef.if === undefined ? null : String(jobDef.if),
          workingDirectory,
          env: jobDef.env && typeof jobDef.env === 'object' ? jobDef.env : {},
          needs: (Array.isArray(jobDef.needs) ? jobDef.needs : (jobDef.needs == null ? [] : [jobDef.needs])).map(String)
        });
      }
    }

    return { file: filePath, fileName, name, triggers, on: parsed.on === undefined ? null : parsed.on, jobs, raw };
  });
}

/**
 * A run step that looks like a test command. Named (#3424) so the
 * paths-ignore offer, the trigger-scope classifier and the per-push
 * duplicate check share one definition of "has a test step". Matched as a
 * whole token (#3438) — `test` bounded by anything but a letter or digit, so
 * `test:unit`, `unit-test` and `test_all.sh` count and `latest` and `attest`
 * do not — plus the runners whose names end in "test".
 */
const TEST_COMMAND = /(?:^|[^a-z0-9])(?:tests?|jest|vitest|pytest|unittest|nextest|ctest|gotestsum)(?:$|[^a-z0-9])/i;

/** @param {object} step @returns {boolean} */
function isTestStep(step) {
  return Boolean(step && typeof step.run === 'string' && TEST_COMMAND.test(step.run));
}

/**
 * Matrix legs one job starts, with include and exclude applied (#3424).
 * Combinations are enumerated as GitHub does: an exclude entry drops each
 * combination it matches; an include entry that matches no original
 * combination adds one, and one that matches extends it in place. An axis
 * whose value is an expression cannot be expanded and counts as one value —
 * named in `unresolved`, so the count is never mistaken for an exact one.
 * @param {object|string|null} matrix - `strategy.matrix`
 * @returns {{legs: number, combos: object[], unresolved: string[]}}
 */
function expandMatrix(matrix) {
  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) {
    return { legs: 1, combos: [{}], unresolved: typeof matrix === 'string' ? ['matrix'] : [] };
  }
  // An include or exclude given as an expression cannot be applied (#3430).
  const unresolved = ['include', 'exclude'].filter((k) => matrix[k] !== undefined && !Array.isArray(matrix[k]));
  const axes = [];
  for (const [axis, values] of Object.entries(matrix)) {
    if (axis === 'include' || axis === 'exclude') continue;
    if (Array.isArray(values)) {
      axes.push([axis, values]);
    } else {
      unresolved.push(axis);
      axes.push([axis, [values]]);
    }
  }
  let combos = [{}];
  for (const [axis, values] of axes) {
    const next = [];
    for (const c of combos) for (const v of values) next.push({ ...c, [axis]: v });
    combos = next;
  }
  if (axes.length === 0) combos = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (Array.isArray(matrix.exclude)) {
    for (const ex of matrix.exclude) {
      if (!ex || typeof ex !== 'object') continue;
      combos = combos.filter((c) => !Object.entries(ex).every(([k, v]) => same(c[k], v)));
    }
  }
  const axisNames = new Set(axes.map(([a]) => a));
  const original = combos.map((c) => ({ ...c }));
  if (Array.isArray(matrix.include)) {
    for (const inc of matrix.include) {
      if (!inc || typeof inc !== 'object') continue;
      const axisPart = Object.entries(inc).filter(([k]) => axisNames.has(k));
      const hits = combos.filter((c, i) => i < original.length
        && axisPart.every(([k, v]) => same(original[i][k], v)));
      if (hits.length) hits.forEach((c) => Object.assign(c, inc));
      else combos.push({ ...inc });
    }
  }
  if (combos.length === 0) combos = [{}];
  return { legs: combos.length, combos, unresolved };
}

/**
 * How a workflow responds to a push of a working branch (#3424).
 * `all` — every branch push starts it; `listed` — only pushes to branches its
 * filter names without a leading wildcard (`branches: [main, 'release/**']`); `none` — no push
 * trigger, or tags only. `pathsFiltered` marks a push that may not start it,
 * depending on the files changed.
 * @param {*} on - Parsed `on:` value
 * @returns {{branchPush: 'all'|'listed'|'none', pathsFiltered: boolean}}
 */
function branchPushScope(on) {
  const none = { branchPush: 'none', pathsFiltered: false };
  if (on == null) return none;
  if (typeof on === 'string') return on === 'push' ? { branchPush: 'all', pathsFiltered: false } : none;
  if (Array.isArray(on)) return on.includes('push') ? { branchPush: 'all', pathsFiltered: false } : none;
  if (typeof on !== 'object' || !Object.prototype.hasOwnProperty.call(on, 'push')) return none;
  const push = on.push;
  if (!push || typeof push !== 'object') return { branchPush: 'all', pathsFiltered: false };
  const pathsFiltered = push.paths !== undefined || push['paths-ignore'] !== undefined;
  const hasBranches = push.branches !== undefined || push['branches-ignore'] !== undefined;
  if (!hasBranches && (push.tags !== undefined || push['tags-ignore'] !== undefined)) return none;
  // Only a pattern that can match an arbitrary working branch — one that
  // starts with a wildcard (`**`, `*`) — means every push; `release/**` has a
  // fixed prefix and lists branches like `main` does (#3430).
  if (Array.isArray(push.branches) && !push.branches.some((b) => /^[*?[]/.test(String(b)))) {
    return { branchPush: 'listed', pathsFiltered };
  }
  return { branchPush: 'all', pathsFiltered };
}

/** Whitespace tokens of a command, each `${{ ... }}` expression kept whole. */
function commandTokens(command) {
  return String(command).replace(/\$\{\{[\s\S]*?\}\}/g, (e) => e.replace(/\s+/g, ''))
    .trim().split(/\s+/).filter(Boolean);
}

/**
 * Command tokens without a leading package runner, which is not part of the
 * tool's identity: `npx jest` and the `jest` an npm script runs are one suite.
 */
function toolTokens(command) {
  let tokens = commandTokens(command);
  // `node [flags] node_modules/jest/bin/jest.js` and `node_modules/.bin/jest`
  // are the jest binary too.
  if (tokens[0] === 'node') {
    const at = tokens.findIndex((t, i) => i > 0 && !t.startsWith('-'));
    if (at > 0 && /node_modules[\\/]/.test(tokens[at])) tokens = tokens.slice(at);
  }
  const parts = String(tokens[0] || '').split(/[\\/]/);
  const nm = parts.indexOf('node_modules');
  if (nm >= 0 && parts[nm + 1]) {
    const scoped = parts[nm + 1].startsWith('@') && parts[nm + 2];
    const tool = parts[nm + 1] === '.bin' ? parts[nm + 2] : (scoped ? `${parts[nm + 1]}/${parts[nm + 2]}` : parts[nm + 1]);
    if (tool) tokens = [tool, ...tokens.slice(1)];
  }
  if (tokens[0] === 'npx' || tokens[0] === 'bunx') return tokens.slice(1);
  if ((tokens[0] === 'pnpm' || tokens[0] === 'yarn') && (tokens[1] === 'exec' || tokens[1] === 'dlx')) return tokens.slice(2);
  return tokens;
}

/**
 * Audit and scanner steps (#3424). `kind` decides what trigger-scope's
 * `paths:` list watches: a dependency audit reads manifests and lockfiles,
 * a code scanner reads source.
 */
const SCANNER_STEPS = [
  { name: 'npm audit', kind: 'dependency', run: /\bnpm audit\b|audit-cooldown-check/i },
  { name: 'pip-audit', kind: 'dependency', run: /\bpip-audit\b/i, uses: /pip-audit/i },
  { name: 'cargo audit', kind: 'dependency', run: /\bcargo audit\b/i, uses: /audit-check/i },
  { name: 'osv-scanner', kind: 'dependency', run: /\bosv-scanner\b/i, uses: /osv-scanner/i },
  { name: 'semgrep', kind: 'code', run: /\bsemgrep\b/i, uses: /semgrep/i },
  { name: 'gitleaks', kind: 'code', run: /\bgitleaks\b/i, uses: /gitleaks/i },
  { name: 'CodeQL', kind: 'code', uses: /github\/codeql-action/i },
  { name: 'Electronegativity', kind: 'code', run: /electronegativity/i, uses: /electronegativity/i }
];

/**
 * Whether trigger-scope should be offered for a workflow (#3424): it runs on
 * every branch push (no branch list, no path filter), has no test step — the
 * same TEST_COMMAND match the paths-ignore offer uses — and has at least one
 * audit or scanner step. A workflow that tests is left to paths-ignore; one
 * that already filters paths is already scoped.
 * @param {{on: *, jobs: object[]}} wf - an inventoryWorkflows entry
 * @returns {{eligible: boolean, reason: string, scanners: {name: string, kind: string}[]}}
 */
function classifyTriggerScope(wf) {
  const scanners = [];
  for (const job of wf.jobs || []) {
    for (const step of job.steps || []) {
      if (!step) continue;
      for (const s of SCANNER_STEPS) {
        const hit = (s.run && typeof step.run === 'string' && s.run.test(step.run))
          || (s.uses && typeof step.uses === 'string' && s.uses.test(step.uses));
        if (hit && !scanners.some((x) => x.name === s.name)) scanners.push({ name: s.name, kind: s.kind });
      }
    }
  }
  const scope = branchPushScope(wf.on);
  if (scope.branchPush !== 'all') return { eligible: false, reason: 'does not run on every branch push', scanners };
  if (scope.pathsFiltered) return { eligible: false, reason: 'push already filters by path', scanners };
  if ((wf.jobs || []).some((j) => (j.steps || []).some(isTestStep))) {
    return { eligible: false, reason: 'has a test step (paths-ignore applies instead)', scanners };
  }
  if (!scanners.length) return { eligible: false, reason: 'has no audit or scanner step', scanners };
  return { eligible: true, reason: `runs ${scanners.map((s) => s.name).join(', ')} on every branch push`, scanners };
}

/** What trigger-scope gives up, stated on the offer and on the applied result. */
const TRIGGER_SCOPE_TRADEOFF = 'Defers scanning of pushes that change no listed path: such a push is scanned only by the scheduled run, '
  + 'which GitHub runs on the default branch alone — a working branch is scanned when it touches a listed path, '
  + 'is run by hand (workflow_dispatch), or reaches the default branch';

/** Events a path filter can narrow — the only ones paths-ignore is offered for. */
const PATH_FILTER_EVENTS = ['push', 'pull_request', 'pull_request_target'];

/**
 * The path filters each event of a parsed `on:` declares (#3424), replacing
 * a substring test for `paths:` that a comment or a step's `with:` block
 * also satisfied. Shorthand forms (`on: push`, `on: [push]`) declare none.
 * @param {*} on - Parsed `on:` value
 * @returns {Object<string, {paths: string[]|null, pathsIgnore: string[]|null}>}
 *   one entry per event present, in declaration order
 */
function eventPathFilters(on) {
  const out = {};
  if (on == null) return out;
  const names = typeof on === 'string' ? [on] : Array.isArray(on) ? on : Object.keys(on);
  for (const event of names) {
    const value = on && typeof on === 'object' && !Array.isArray(on) ? on[event] : null;
    const list = (v) => (Array.isArray(v) ? v.map(String) : v == null ? null : [String(v)]);
    out[event] = value && typeof value === 'object'
      ? { paths: list(value.paths), pathsIgnore: list(value['paths-ignore']) }
      : { paths: null, pathsIgnore: null };
  }
  return out;
}

/**
 * The push / pull_request events a workflow already has that declare no path
 * filter — where paths-ignore can go without adding a trigger (#3424).
 * @param {*} on
 * @returns {string[]}
 */
function unfilteredEvents(on) {
  return Object.entries(eventPathFilters(on))
    .filter(([event, f]) => acceptsPathFilter(on, event) && f.paths === null && f.pathsIgnore === null)
    .map(([event]) => event);
}

/**
 * Whether a path filter on this event can narrow anything. GitHub evaluates
 * path filters for branch pushes only — a tag push ignores them — so a push
 * that names tags and no branches (a release trigger) takes none.
 * @param {*} on - Parsed `on:` value
 * @param {string} event
 * @returns {boolean}
 */
function acceptsPathFilter(on, event) {
  if (!PATH_FILTER_EVENTS.includes(event)) return false;
  const value = on && typeof on === 'object' && !Array.isArray(on) ? on[event] : null;
  if (event !== 'push' || !value || typeof value !== 'object') return true;
  const tagsOnly = (value.tags !== undefined || value['tags-ignore'] !== undefined)
    && value.branches === undefined && value['branches-ignore'] === undefined;
  return !tagsOnly;
}

/**
 * The identity part of a shell command (#3424): the launcher and the tool or
 * script it runs, flags and paths dropped — `npx jest --ci` and
 * `npx jest --shard=1/3` are both `npx jest`. Compared between CI steps, and
 * between a CI step and the local verification set.
 * @param {string} command
 * @returns {string}
 */
function commandSignature(command) {
  const tokens = toolTokens(command);
  if (tokens.length === 0) return '';
  const head = tokens[0];
  const take = (n) => tokens.slice(0, n).join(' ');
  if (['npm', 'yarn', 'pnpm', 'bun'].includes(head)) {
    return tokens[1] === 'run' || tokens[1] === 'run-script' ? take(3) : take(2);
  }
  if (/^python3?$/.test(head) && tokens[1] === '-m') return take(3);
  if (head === 'bundle' && tokens[1] === 'exec') return take(3);
  if (['go', 'cargo', 'dotnet', 'node', 'deno', 'make', 'mvn', 'gradle', './gradlew'].includes(head)) {
    return take(2);
  }
  return head;
}

/**
 * Flags whose value narrows a run to part of the suite, never a shard of it.
 * `-run` is go's test filter; vitest's `--run` is a boolean and is not here
 * (#3430).
 */
const SUBSET_FLAGS = new Set([
  '--testPathPatterns', '--testPathPattern', '--testNamePattern', '-t', '--selectProjects', '--project',
  '-k', '-m', '--grep', '-g', '-run', '--test-name-pattern', '--testMatch', '--package', '-p'
]);

/**
 * Flags whose `=value` changes how a suite runs — output, coverage,
 * parallelism, sharding, retries — never which tests it selects (#3438).
 * Any other `--flag=value` is kept in the suite key: `--config=`, go's
 * `-tags=`, dotnet's `--filter=` and playwright's `--browser=` all pick a
 * different suite, and a flag not listed here is assumed to as well, so a
 * real difference is never reported as a duplicate.
 */
const NON_SELECTING_FLAGS = new Set([
  '--shard', '--maxWorkers', '--max-workers', '--workers', '--parallel', '--jobs', '-j', '--threads', '--pool',
  '--verbose', '--silent', '--ci', '--color', '--colors', '--json', '--bail', '--watch', '--watchAll',
  '--coverage', '--coverageReporters', '--coverageDirectory', '--coverage-reporter', '--cov', '--cov-report',
  '--reporter', '--reporters', '--outputFile', '--output-file', '--logger', '--results-directory', '--verbosity',
  '--timeout', '--testTimeout', '--retries', '--retry', '--runInBand', '--forceExit', '--detectOpenHandles',
  '--passWithNoTests', '--cache', '--cacheDirectory', '--logHeapUsage', '--max-old-space-size', '--tb', '--durations'
]);

/**
 * Which suite a test command runs (#3424): its signature plus whatever
 * narrows it — positional paths, the values of SUBSET_FLAGS, and any
 * `--flag=value` not in NON_SELECTING_FLAGS (#3438). Other flags are
 * dropped, so `npx jest --ci` and `npx jest --shard=1/3` are the same suite
 * and `npx jest --testPathPatterns worktree` is a different one.
 * @param {string} command
 * @returns {string}
 */
function suiteKey(command) {
  const signature = commandSignature(command);
  const tokens = toolTokens(command).slice(signature.split(' ').filter(Boolean).length);
  const narrowing = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith('-')) {
      const [flag, value] = t.split(/=(.*)/s);
      const next = tokens[i + 1];
      if (SUBSET_FLAGS.has(flag)) {
        // A following flag is never the value (#3430).
        const v = value !== undefined ? value : (next !== undefined && !next.startsWith('-') ? tokens[++i] : undefined);
        if (v !== undefined) narrowing.push(`${flag}=${v}`);
      } else if (value !== undefined && !NON_SELECTING_FLAGS.has(flag)) {
        narrowing.push(t);
      } else if (value === undefined && next !== undefined && /^\d+%?$/.test(next)) {
        i++; // a numeric value (`--maxWorkers 4`, `-n 4`) belongs to the flag
      }
      // Any other following token is positional (`pytest -x tests`): reading
      // it as a value merged runs over different paths into one suite (#3430).
      continue;
    }
    narrowing.push(t);
  }
  return [signature, ...narrowing].join(' ');
}

/**
 * Evaluate a job's `if:` for a push of a working branch (#3424), so a job
 * gated to `main` or to pull requests is not counted as running on every
 * push. Handles `==`, `!=`, `&&`, `||`, `!`, parentheses, `startsWith` and
 * the `github.event_name` / `ref` / `ref_name` / `ref_type` / `base_ref`
 * contexts. Anything else is unknown — `null` — and the job is counted,
 * marked conditional.
 * @param {string|null} condition
 * @param {Object<string,string>} [extra] - further contexts, e.g.
 *   `{'matrix.os': 'ubuntu-latest'}` to evaluate a step's `if:` for one leg
 * @returns {boolean|null}
 */
function runsOnBranchPush(condition, extra = {}) {
  if (condition == null) return true;
  const ctx = {
    'github.event_name': 'push',
    'github.ref': 'refs/heads/feature-branch',
    'github.ref_name': 'feature-branch',
    'github.ref_type': 'branch',
    'github.base_ref': '',
    'github.head_ref': '',
    ...extra
  };
  const src = String(condition).trim().replace(/^\$\{\{\s*([\s\S]*?)\s*\}\}$/, '$1');
  const tokens = src.match(/'(?:[^']|'')*'|==|!=|&&|\|\||[()!,]|[\w.-]+|\S/g) || [];
  let i = 0;
  const peek = () => tokens[i];
  const UNKNOWN = Symbol('unknown');
  const truthy = (v) => (v === UNKNOWN ? UNKNOWN : Boolean(v));
  const primary = () => {
    const t = tokens[i++];
    if (t === undefined) throw new Error('end');
    if (t === '(') { const v = or(); if (tokens[i++] !== ')') throw new Error(')'); return v; }
    if (t === '!') { const v = truthy(primary()); return v === UNKNOWN ? UNKNOWN : !v; }
    if (t.startsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
    if (t === 'true' || t === 'false') return t === 'true';
    if (/^(startsWith|endsWith|contains)$/i.test(t) && peek() === '(') {
      i++;
      const a = or(); if (tokens[i++] !== ',') throw new Error(',');
      const b = or(); if (tokens[i++] !== ')') throw new Error(')');
      if (a === UNKNOWN || b === UNKNOWN) return UNKNOWN;
      const [x, y] = [String(a).toLowerCase(), String(b).toLowerCase()];
      if (/^startsWith$/i.test(t)) return x.startsWith(y);
      if (/^endsWith$/i.test(t)) return x.endsWith(y);
      return x.includes(y);
    }
    return Object.prototype.hasOwnProperty.call(ctx, t) ? ctx[t] : UNKNOWN;
  };
  const cmp = () => {
    let v = primary();
    while (peek() === '==' || peek() === '!=') {
      const op = tokens[i++];
      const r = primary();
      if (v === UNKNOWN || r === UNKNOWN) v = UNKNOWN;
      else v = (String(v).toLowerCase() === String(r).toLowerCase()) === (op === '==');
    }
    return v;
  };
  // A value is booleanized only where an operator needs it, so a function
  // argument (`startsWith(github.ref, …)`) keeps its string.
  const and = () => {
    let v = cmp();
    while (peek() === '&&') {
      i++;
      const [a, b] = [truthy(v), truthy(cmp())];
      v = a === false || b === false ? false : (a === UNKNOWN || b === UNKNOWN ? UNKNOWN : true);
    }
    return v;
  };
  const or = () => {
    let v = and();
    while (peek() === '||') {
      i++;
      const [a, b] = [truthy(v), truthy(and())];
      v = a === true || b === true ? true : (a === UNKNOWN || b === UNKNOWN ? UNKNOWN : false);
    }
    return v;
  };
  try {
    const v = or();
    if (i !== tokens.length) return null;
    return v === UNKNOWN ? null : Boolean(v);
  } catch (_e) {
    return null;
  }
}

/**
 * Each job's branch-push gate with `needs:` applied (#3430): runsOnBranchPush
 * of its own `if:`, but `false` when any job it needs is skipped, directly or
 * transitively — GitHub skips a job whose needs were skipped — unless its
 * `if:` calls always(), failure() or cancelled(), which run regardless.
 * @param {Array<{name: string, condition: string|null, needs?: string[]}>} jobs
 * @returns {Map<string, boolean|null>} job name → true, false or null (unknown)
 */
function skippedOnBranchPush(jobs) {
  const gates = new Map(jobs.map((j) => [j.name, runsOnBranchPush(j.condition)]));
  const overrides = (j) => /\b(always|failure|cancelled)\s*\(/.test(j.condition || '');
  let changed = true;
  while (changed) {
    changed = false;
    for (const j of jobs) {
      if (gates.get(j.name) === false || overrides(j)) continue;
      if ((j.needs || []).some((n) => gates.get(n) === false)) {
        gates.set(j.name, false);
        changed = true;
      }
    }
  }
  return gates;
}

/**
 * Resolve `npm test` / `npm run <x>` (and the yarn, pnpm and bun forms) to
 * the package.json script it runs, so `npm test` and `npx jest` are seen as
 * one suite. Anything else, or a script that cannot be read, is returned
 * unchanged.
 * @param {string} command
 * @param {object|null} scripts - package.json `scripts`
 * @returns {string}
 */
function resolvePackageScript(command, scripts) {
  if (!scripts) return command;
  const t = String(command).trim().split(/\s+/);
  if (!['npm', 'yarn', 'pnpm', 'bun'].includes(t[0])) return command;
  let name = null;
  let restAt = 2;
  if (t[1] === 'run' || t[1] === 'run-script') { name = t[2]; restAt = 3; }
  else if (['test', 't', 'tst'].includes(t[1])) name = 'test';
  else if (t[0] !== 'npm' && t[1] && !t[1].startsWith('-')) name = t[1];
  if (!name || typeof scripts[name] !== 'string') return command;
  // Arguments the script receives (#3430): after `--` for npm (its own flags
  // otherwise), everything after the name for yarn, pnpm and bun. Dropping
  // them made `npm test -- --testPathPattern=unit` and `=e2e` one suite.
  let rest = t.slice(restAt);
  const sep = rest.indexOf('--');
  if (t[0] === 'npm') rest = sep >= 0 ? rest.slice(sep + 1) : [];
  else if (rest[0] === '--') rest = rest.slice(1);
  return [scripts[name], ...rest].join(' ');
}

function readPackageScripts(projectDir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
    return pkg && pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : null;
  } catch (_e) {
    return null;
  }
}

/**
 * A working directory as a project-relative POSIX path; '' for the root.
 * Only a leading `./` is stripped: `..`, `../x` and hidden directories such
 * as `.storybook` keep their leading dot (#3438).
 */
function normalizeWorkDir(dir) {
  if (dir == null) return '';
  const p = path.posix.normalize(String(dir).replace(/\\/g, '/')).replace(/^\.\//, '').replace(/\/+$/, '');
  return p === '.' ? '' : p;
}

/**
 * Suite key of a command run in `dir` (#3430): the script resolved from that
 * directory's package.json, and the directory named when it is not the root.
 * Without it every package's `npm test` keyed as the root suite, so a monorepo's
 * per-package jobs read as one suite run several times.
 * @param {string} command
 * @param {string} dir - normalized working directory ('' = root)
 * @param {(dir: string) => object|null} scriptsFor
 * @returns {string}
 */
function scopedSuiteKey(command, dir, scriptsFor) {
  const target = npmTarget(command);
  if (target) {
    // `npm test -w packages/a` runs packages/a's script, not the root's (#3438).
    dir = normalizeWorkDir(dir ? `${dir}/${target.dir}` : target.dir);
    command = target.command;
  }
  const key = suiteKey(resolvePackageScript(command, scriptsFor(dir)));
  return dir ? `${key} (in ${dir})` : key;
}

/**
 * The package an npm command is pointed at with `-w`, `--workspace` or
 * `--prefix` (#3438), and the command without that flag; null when it names
 * none. Only npm's own flags count — anything after `--` goes to the script.
 * @param {string} command
 * @returns {{dir: string, command: string}|null}
 */
function npmTarget(command) {
  const t = String(command).trim().split(/\s+/);
  if (t[0] !== 'npm') return null;
  const end = t.indexOf('--') >= 0 ? t.indexOf('--') : t.length;
  for (let i = 1; i < end; i++) {
    const [flag, value] = t[i].split(/=(.*)/s);
    if (!['-w', '--workspace', '--prefix'].includes(flag)) continue;
    const dir = value !== undefined ? value : t[i + 1];
    if (dir === undefined) return null;
    const rest = t.filter((_, j) => j !== i && !(value === undefined && j === i + 1));
    return { dir, command: rest.join(' ') };
  }
  return null;
}

/** Memoized package.json `scripts` per working directory under projectDir. */
function scriptsReader(projectDir, rootScripts) {
  const cache = new Map([['', rootScripts]]);
  return (dir) => {
    if (!cache.has(dir)) cache.set(dir, readPackageScripts(path.join(projectDir, dir)));
    return cache.get(dir);
  };
}

/** The command lines of a run step, with comments, blanks and `\` continuations folded. */
function runLines(run) {
  return String(run).replace(/\\\r?\n/g, ' ').split(/\r?\n/)
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

/**
 * The commands of one run line, split at `&&`, `||` and `;` (#3430), so
 * `cd app && npm run lint` is a setup segment and a check rather than one
 * line the leading `cd` classifies as setup. Quoting is not parsed: a
 * separator inside quotes splits too, which only ever adds a segment.
 * @param {string} line
 * @returns {string[]}
 */
function commandSegments(line) {
  return String(line).split(/\s*(?:&&|\|\||;)\s*/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Matrix axes a command splits its suite across: `--shard=${{ matrix.shard }}/3`,
 * or an env variable set from the axis and used by the command
 * (`SHARD: ${{ matrix.shard }}` with `--shard=$SHARD/3`) (#3430).
 * Axis names come from the expanded combinations, so an axis declared only
 * through `include:` counts (#3438). An env name that is not an identifier
 * is skipped rather than built into a RegExp (#3438).
 * @param {string} command
 * @param {object[]} combos - expandMatrix combinations
 * @param {Object<string,*>} [env] - job env merged with step env
 * @returns {string[]}
 */
function shardAxes(command, combos, env = {}) {
  const viaEnv = (axis) => Object.entries(env).some(([name, value]) => /^[A-Za-z_]\w*$/.test(name)
    && String(value).includes(`matrix.${axis}`)
    && new RegExp(String.raw`\$\{?${name}\b|env\.${name}\b|%${name}%`).test(command));
  return [...new Set(combos.flatMap((c) => Object.keys(c)))].filter((axis) =>
    /shard|chunk|split|part|slice|index/i.test(axis)
    && (command.includes(`matrix.${axis}`) || viaEnv(axis)));
}

/**
 * A command line with one combination's matrix values in place (#3438), so
 * `npm run test:${{ matrix.suite }}` keys as `test:unit` and `test:e2e`. A
 * shard axis is replaced by a fixed placeholder — its legs split one suite —
 * and an axis whose value is unknown is left as the expression. A
 * `${{ env.X }}` the job or step env defines is expanded first, so an env
 * carrying a matrix value resolves the same way.
 */
function substituteMatrix(line, combo, sharded, env = {}) {
  const expanded = line.replace(/\$\{\{\s*env\.(\w+)\s*\}\}/g, (all, name) =>
    (Object.prototype.hasOwnProperty.call(env, name) ? String(env[name]) : all));
  return expanded.replace(/\$\{\{\s*matrix\.([\w-]+)\s*\}\}/g, (all, axis) => {
    if (sharded.includes(axis)) return `<${axis}>`;
    const v = combo[axis];
    return v === undefined || isExpression(v) ? all : String(v);
  });
}

/**
 * Full runs a set of legs makes of one sharded suite (#3438): legs are grouped
 * by their non-shard values, and a group is one full run only when it covers
 * every shard the job declares — so an `exclude` that drops some shards from
 * one group leaves that group a partial run, never rounded up to a full one.
 * @param {object[]} legs - the combinations running this command
 * @param {object[]} all - every combination of the job
 * @param {string[]} sharded - shard axes
 * @returns {number}
 */
function fullRunsOf(legs, all, sharded) {
  if (!sharded.length) return legs.length;
  const shardOf = (c) => JSON.stringify(sharded.map((a) => c[a]));
  const restOf = (c) => JSON.stringify(Object.keys(c).filter((a) => !sharded.includes(a)).sort().map((a) => [a, c[a]]));
  const required = new Set(all.map(shardOf));
  const groups = new Map();
  for (const c of legs) {
    if (!groups.has(restOf(c))) groups.set(restOf(c), new Set());
    groups.get(restOf(c)).add(shardOf(c));
  }
  return [...groups.values()].filter((have) => [...required].every((s) => have.has(s))).length;
}

/** True for a value the analysis cannot know: a `${{ }}` expression. */
const isExpression = (v) => typeof v === 'string' && v.includes('${{');

/**
 * Matrix contexts of one combination for an `if:`: each value keeps its type,
 * so `false` is falsy (#3438); an expression is left out, so it reads unknown.
 */
function matrixContext(combo) {
  return Object.fromEntries(Object.entries(combo)
    .filter(([, v]) => !isExpression(v))
    .map(([axis, v]) => [`matrix.${axis}`, typeof v === 'boolean' || typeof v === 'number' ? v : String(v)]));
}

/** Matrix combinations on which a step runs: all of them unless its `if:` excludes some (#3430). */
function stepCombos(step, combos) {
  if (!step || step.if === undefined || step.if === null) return combos;
  return combos.filter((c) => runsOnBranchPush(String(step.if), matrixContext(c)) !== false);
}

/** `runs-on` for one matrix combination, `${{ matrix.x }}` substituted. */
function resolveRunsOn(runsOn, combo) {
  if (runsOn == null) return '(reusable workflow)';
  // The map form (#3430): `labels` (string or list) name the runner and carry
  // its OS; a `group` alone is all there is to name.
  if (typeof runsOn === 'object' && !Array.isArray(runsOn)) {
    const labels = runsOn.labels == null ? [] : [].concat(runsOn.labels);
    runsOn = labels.length ? labels : (runsOn.group == null ? '(runner group)' : String(runsOn.group));
  }
  const value = Array.isArray(runsOn) ? runsOn.join(',') : String(runsOn);
  return value.replace(/\$\{\{\s*matrix\.([\w-]+)\s*\}\}/g,
    (all, axis) => (combo && combo[axis] !== undefined ? String(combo[axis]) : all));
}

/**
 * Per-push job inventory (#3424): for each workflow a working-branch push
 * starts, its jobs with matrix legs expanded and the test commands those legs
 * run. `totalJobs` sums the workflows every branch push starts; a workflow
 * whose filter lists named branches is reported but not summed. `duplicates`
 * names each test command that runs as a full suite more than once on one
 * push — shard legs of one job together count as one full run.
 * `localComparison` labels each job against the local verification set.
 * @param {string} projectDir
 * @param {{platform?: string, local?: object}} [options] - `platform` is the
 *   local sweep's OS (default: this process's); `local` replaces resolveSuites()
 * @returns {{workflows: object[], totalJobs: number, duplicates: object[], localComparison: object, unparsed: string[]}}
 *   `unparsed` names workflow files whose YAML did not parse (#3430)
 */
function inventoryPushJobs(projectDir, options = {}) {
  const scripts = readPackageScripts(projectDir);
  const scriptsFor = scriptsReader(projectDir, scripts);
  const workflows = [];
  const unparsed = [];
  const runsBySignature = new Map();
  for (const wf of inventoryWorkflows(projectDir)) {
    if (wf.parseError) { unparsed.push(wf.fileName); continue; }
    const scope = branchPushScope(wf.on);
    if (scope.branchPush === 'none') continue;
    const jobs = [];
    const gates = skippedOnBranchPush(wf.jobs);
    for (const job of wf.jobs) {
      const gate = gates.get(job.name);
      if (gate === false) {
        jobs.push({ name: job.name, legs: 0, skippedByCondition: true, unresolved: [], runsOn: [], conditional: true, reusable: job.usesReusable, testCommands: [] });
        continue;
      }
      const m = expandMatrix(job.matrix);
      const runsOn = [...new Set(m.combos.map((c) => resolveRunsOn(job.runsOn, c)))];
      const testCommands = [];
      const stepDir = (step) => normalizeWorkDir(step && typeof step['working-directory'] === 'string'
        ? step['working-directory'] : job.workingDirectory);
      for (const step of job.steps) {
        if (!isTestStep(step)) continue;
        // Per segment, setup skipped first: `pip install -r requirements-test.txt`
        // names a test tool but runs no suite (#3430).
        const running = stepCombos(step, m.combos);
        if (running.length === 0) continue;
        const env = { ...job.env, ...(step.env && typeof step.env === 'object' ? step.env : {}) };
        for (const line of runLines(step.run).flatMap(commandSegments)) {
          if (isSetupCommand(line) || !TEST_COMMAND.test(line)) continue;
          const sharded = shardAxes(line, m.combos, env);
          // Key each leg's own command (#3438): legs selecting different
          // suites are different suites, not repeat runs of one.
          const byCommand = new Map();
          for (const c of running) {
            const command = substituteMatrix(line, c, sharded, env);
            if (!byCommand.has(command)) byCommand.set(command, []);
            byCommand.get(command).push(c);
          }
          for (const [command, legs] of byCommand) {
            const fullRuns = fullRunsOf(legs, m.combos, sharded);
            // A value the analysis cannot resolve is unknown: reported, never
            // counted toward a duplicate (#3438).
            if (isExpression(command) || isExpression(stepDir(step))) {
              testCommands.push({ command, signature: null, sharded: sharded.length > 0, fullRuns, unresolved: true });
              continue;
            }
            const signature = scopedSuiteKey(command, stepDir(step), scriptsFor);
            testCommands.push({ command, signature, sharded: sharded.length > 0, fullRuns });
            if (scope.branchPush !== 'all') continue;
            if (!runsBySignature.has(signature)) runsBySignature.set(signature, []);
            runsBySignature.get(signature).push({
              workflow: wf.fileName, job: job.name, legs: m.legs, fullRuns, sharded: sharded.length > 0, runsOn
            });
          }
        }
      }
      const checks = [];
      for (const step of job.steps) {
        if (step && typeof step.run === 'string') {
          for (const segment of runLines(step.run).flatMap(commandSegments)) {
            if (!isSetupCommand(segment)) checks.push({ run: segment, key: scopedSuiteKey(segment, stepDir(step), scriptsFor) });
          }
        } else if (step && typeof step.uses === 'string' && !SETUP_ACTION.test(step.uses)) {
          checks.push({ uses: step.uses });
        }
      }
      jobs.push({
        name: job.name, legs: m.legs, skippedByCondition: false, unresolved: m.unresolved, runsOn,
        conditional: gate === null, reusable: job.usesReusable, testCommands, checks
      });
    }
    const jobCount = jobs.reduce((n, j) => n + j.legs, 0);
    workflows.push({ fileName: wf.fileName, name: wf.name, ...scope, jobCount, jobs });
  }
  const totalJobs = workflows.filter((w) => w.branchPush === 'all').reduce((n, w) => n + w.jobCount, 0);

  const duplicates = [];
  for (const [signature, where] of runsBySignature) {
    const runs = where.reduce((n, w) => n + w.fullRuns, 0);
    if (runs < 2) continue;
    const runners = [...new Set(where.flatMap((w) => w.runsOn))];
    const places = where.map((w) => `${w.workflow}:${w.job} (${w.legs} ${w.sharded ? 'shard leg' : 'leg'}${w.legs === 1 ? '' : 's'})`);
    duplicates.push({
      kind: 'duplicate-suite',
      signature,
      runs,
      where,
      description: `\`${signature}\` runs as a full suite ${runs} times on one branch push: ${places.join(', ')}`,
      suggestion: 'Keep one full run on branch pushes; move the others to pull_request, or drop them',
      tradeoff: runners.length > 1
        ? `Removes or defers the other runs' environments (${runners.join(', ')}): a failure only one of them shows surfaces at PR time, or not at all`
        : 'Removes a repeat run on the same runner: only failures that show on a second run of the same suite (flaky tests) go unseen'
    });
  }
  const localComparison = compareWithLocalSweep(workflows, projectDir, { scripts, platform: options.platform, local: options.local });
  return { workflows, totalJobs, duplicates, localComparison, unparsed };
}

/**
 * True when a command segment prepares a job rather than checks anything.
 * Matched per segment of a compound line (commandSegments). `yarn` is setup
 * only bare or as `yarn install`, with flags at most: `yarn test` is a check
 * (#3430). Tested on tokens rather than by regex, which would need a nested
 * quantifier.
 * @param {string} segment
 * @returns {boolean}
 */
function isSetupCommand(segment) {
  const t = String(segment).trim().split(/\s+/);
  if (t[0] === 'yarn') return t.slice(1).every((tok, i) => (i === 0 && tok === 'install') || tok.startsWith('-'));
  return SETUP_COMMAND.test(segment);
}

/**
 * Setup commands other than yarn, which isSetupCommand tests on its tokens.
 * npm's and pnpm's subcommand must end at whitespace or the line's end
 * (#3438): `\b` matched inside `install-test`, so a test run read as setup.
 */
const SETUP_COMMAND = /^(npm (ci|install|i)(?=\s|$)|pnpm (install|i)(?=\s|$)|bun install\b|pip3? install\b|python3? -m pip install\b|poetry install\b|bundle install\b|go mod download\b|cargo fetch\b|echo\b|cd\b|git config\b|export\b|mkdir\b|cp\b|ls\b)/;

/** Actions that prepare a job: checkout, toolchain setup, caching, artifact moves. */
const SETUP_ACTION = /^(actions\/(checkout|setup-[\w-]+|cache|upload-artifact|download-artifact)|[\w-]+\/setup-[\w-]+)@/i;

/** OS family of a runner label, or null when it names none. */
function runnerOs(label) {
  const s = String(label).toLowerCase();
  if (/windows/.test(s)) return 'windows';
  if (/macos|osx/.test(s)) return 'macos';
  if (/ubuntu|linux/.test(s)) return 'linux';
  return null;
}

const PLATFORM_OS = { win32: 'windows', darwin: 'macos', linux: 'linux' };

/**
 * Compare each CI job a branch push runs with the local verification set
 * (#3424) — the suites `/work` Step 4f sweeps before In review, from
 * `resolveSuites()`. A job `duplicates` the sweep when every check it runs is
 * a local suite and it runs on the local OS family; otherwise it `adds-signal`
 * and names each: a runner OS the local sweep does not run on (a Windows
 * runner also checks out with CRLF line endings), a command no local suite
 * runs, or a non-setup action.
 * @param {object[]} workflows - inventoryPushJobs' workflows
 * @param {string} projectDir
 * @param {{scripts?: object|null, platform?: string, local?: {suites: object[], source: string}}} [options]
 * @returns {{source: string, localOs: string|null, jobs: object[], advisories: object[], note?: string}}
 */
function compareWithLocalSweep(workflows, projectDir, options = {}) {
  const local = options.local || require('./lib/test-runner.js').resolveSuites(projectDir);
  const localOs = PLATFORM_OS[options.platform || process.platform] || null;
  if (local.source === 'none' || local.source === 'unreadable' || !local.suites.length) {
    return {
      source: local.source,
      localOs,
      jobs: [],
      advisories: [],
      note: local.source === 'unreadable'
        ? `framework-config.json does not parse (${local.error}) — no comparison made`
        : 'No local verification set is declared, so every CI job adds signal'
    };
  }
  const scripts = options.scripts === undefined ? readPackageScripts(projectDir) : options.scripts;
  const scriptsFor = scriptsReader(projectDir, scripts);
  const localKeys = new Map();
  for (const suite of local.suites) {
    if (typeof suite.full === 'string' && suite.full.trim()) {
      localKeys.set(scopedSuiteKey(suite.full, normalizeWorkDir(suite.cwd), scriptsFor), suite.id);
    }
  }
  const jobs = [];
  const advisories = [];
  for (const wf of workflows) {
    if (wf.branchPush !== 'all') continue;
    for (const job of wf.jobs) {
      if (job.skippedByCondition) continue;
      const signals = [];
      const matched = [];
      // A runner naming no OS — a group, an expression, a bare self-hosted
      // label — cannot be the local OS by default (#3438): it adds signal.
      for (const label of job.runsOn) {
        if (label === '(reusable workflow)' || runnerOs(label)) continue;
        signals.push(`runner \`${label}\` — its OS is not determined, so it is not compared with the local sweep`);
      }
      for (const os of [...new Set(job.runsOn.map(runnerOs).filter(Boolean))]) {
        if (os === localOs) continue;
        signals.push(os === 'windows'
          ? 'a Windows runner — Windows paths and a CRLF line-ending checkout the local sweep does not exercise'
          : `a ${os} runner the local sweep (${localOs || 'unknown OS'}) does not run on`);
      }
      for (const c of job.checks || []) {
        if (c.uses) signals.push(`action ${c.uses} is not in the local set`);
        else if (localKeys.has(c.key)) matched.push(localKeys.get(c.key));
        else signals.push(`\`${c.run}\` is not in the local set`);
      }
      if (!matched.length && !signals.length) signals.push('no check recognized — review by hand');
      const verdict = signals.length ? 'adds-signal' : 'duplicates';
      jobs.push({ workflow: wf.fileName, job: job.name, verdict, signals, matched: [...new Set(matched)] });
      if (verdict === 'duplicates') {
        advisories.push({
          kind: 'local-duplicate',
          workflow: wf.fileName,
          job: job.name,
          description: `${wf.fileName}:${job.name} repeats the local verification sweep (${[...new Set(matched)].join(', ')}) on every branch push`,
          suggestion: 'Run it on pull_request only, or drop it from the push trigger',
          tradeoff: 'Defers these checks to PR time: a push made without the local sweep (outside /work, or with a suite skipped) is not checked in CI until a PR opens'
        });
      }
    }
  }
  return { source: local.source, localOs, jobs, advisories };
}

/**
 * Analyze gaps between current workflows and best practices.
 * @param {string} projectDir - Path to project root
 * @param {{ now?: Date }} [options] - `now` is the date Node end-of-life is judged on (#3383)
 * @returns {Array<{ type: string, description: string, impact: string, feature?: string, file?: string }>}
 */
function analyzeGaps(projectDir, { now = new Date() } = {}) {
  const recommendations = [];
  const workflows = inventoryWorkflows(projectDir);
  const outdatedNode = outdatedNodeVersions(now);
  const nodeTarget = nodeUpgradeTarget(now);
  // #3388: with every table line past end-of-life there is no target, so a
  // per-pin "upgrade to null" is withheld and the exhausted table is named once.
  const stalePins = [];
  const flagEol = (rec) => {
    if (nodeTarget) recommendations.push(rec);
    else stalePins.push(`${rec.nodeVersion} in ${rec.file}`);
  };
  const analysis = analyzeProject(projectDir);

  // Check each workflow for issues
  for (const wf of workflows) {
    // --- Alter: Deprecated actions ---
    for (const job of wf.jobs) {
      for (const step of job.steps) {
        if (step && step.uses) {
          const actionRef = step.uses;
          const upgrade = DEPRECATED_ACTIONS[actionRef];
          if (upgrade) {
            recommendations.push({
              type: 'Alter',
              description: `Upgrade deprecated ${actionRef} to ${upgrade} in ${wf.fileName}`,
              impact: 'Security and compatibility improvements',
              file: wf.fileName,
              // ci-apply.js applyAlter hard-requires actionRef + upgrade for the
              // string replacement. Both are available here from DEPRECATED_ACTIONS.
              actionRef,
              upgrade
            });
          }
        }
      }
    }

    // --- Alter: Outdated Node versions ---
    for (const job of wf.jobs) {
      for (const step of job.steps) {
        if (step && step.uses && /actions\/setup-node/i.test(step.uses) && step.with) {
          const nodeVersion = String(step.with['node-version'] || '');
          if (outdatedNode.includes(nodeMajorLine(nodeVersion))) {
            flagEol({
              type: 'Alter',
              description: `Node.js ${nodeVersion} is EOL — upgrade to ${nodeTarget} in ${wf.fileName}`,
              impact: 'Security: EOL versions no longer receive patches',
              file: wf.fileName,
              // ci-apply.js applyAlter routes kind 'node-version' to a document
              // edit; the actionRef string replacement cannot express it (#3369).
              kind: 'node-version',
              nodeVersion,
              upgrade: nodeTarget
            });
          }
        }
      }

      // Check matrix for outdated versions too
      if (job.matrix && job.matrix['node-version']) {
        const versions = Array.isArray(job.matrix['node-version'])
          ? job.matrix['node-version']
          : [job.matrix['node-version']];
        for (const v of versions) {
          if (outdatedNode.includes(nodeMajorLine(v))) {
            flagEol({
              type: 'Alter',
              description: `Node.js ${v} in matrix is EOL — replace with ${nodeTarget} in ${wf.fileName}`,
              impact: 'Security: EOL versions no longer receive patches',
              file: wf.fileName,
              kind: 'node-version',
              nodeVersion: String(v),
              upgrade: nodeTarget
            });
          }
        }
      }
    }

    // --- Improve: push + pull_request run twice on one head (#3364) ---
    // Once a PR is open, every push fires both events for the same commit. A
    // github.ref key puts them in different groups, so concurrency-groups
    // cannot dedupe them; the directional head.sha group (#2571) can. Offered
    // INSTEAD of concurrency-groups for these workflows, never beside it.
    const pushAndPR = wf.triggers.includes('push') && wf.triggers.includes('pull_request');
    if (pushAndPR) {
      if (!/pull_request\.head\.sha/.test(wf.raw)) {
        recommendations.push({
          type: 'Improve',
          description: `Key ${wf.fileName}'s concurrency group on the PR head SHA so a push and its pull_request run test the commit once`,
          impact: 'Efficiency: the push run of a commit with an open PR is cancelled by its pull_request run',
          feature: 'push-pr-dedup',
          file: wf.fileName
        });
      }
    } else if (wf.triggers.includes('pull_request') && !wf.raw.includes('concurrency')) {
      // --- Improve: Missing concurrency groups on PR workflows ---
      recommendations.push({
        type: 'Improve',
        description: `Add concurrency groups to ${wf.fileName} to cancel superseded PR runs`,
        impact: 'Efficiency: reduces wasted CI minutes on superseded commits',
        feature: 'concurrency-groups',
        file: wf.fileName
      });
    }

    // --- Improve: scope an audit/scanner workflow off every push (#3424) ---
    const scoping = classifyTriggerScope(wf);
    if (scoping.eligible) {
      const { triggerScopePaths } = require('./ci-add.js');
      const planned = triggerScopePaths(projectDir, scoping.scanners, wf.fileName);
      if (planned.paths.length) {
        recommendations.push({
          type: 'Improve',
          description: `Scope ${wf.fileName} (${scoping.scanners.map((s) => s.name).join(', ')}) to paths: ${planned.paths.join(', ')}, plus a weekly schedule and workflow_dispatch`,
          impact: 'Efficiency: the scan stops running on every branch push',
          tradeoff: TRIGGER_SCOPE_TRADEOFF,
          feature: 'trigger-scope',
          file: wf.fileName,
          paths: planned.paths
        });
      }
    }

    // --- Improve: Missing paths-ignore on push/PR workflows ---
    // Parsed, not a substring test (#3424): `paths:` in a comment or a step's
    // `with:` block hid the offer, and one filtered event hid it for the other.
    const unfiltered = unfilteredEvents(wf.on);
    if (unfiltered.length && wf.jobs.some(j => j.steps.some(isTestStep))) {
      const { layoutPathsIgnore } = require('./ci-add.js');
      const existing = Object.values(eventPathFilters(wf.on)).flatMap((f) => f.pathsIgnore || []);
      const layout = layoutPathsIgnore(projectDir, existing);
      if (layout.patterns.length) {
        recommendations.push({
          type: 'Improve',
          description: `Add paths-ignore to ${wf.fileName} (${unfiltered.join(', ')}): ${layout.patterns.join(', ')}`
            + (layout.warnings.length ? ` — warning: ${layout.warnings.join('; ')}` : ''),
          impact: 'Efficiency: avoids unnecessary CI runs for documentation changes',
          tradeoff: `Removes CI on pushes that change only ${layout.patterns.join(', ')}: a test that reads one of those files is not run for that change`,
          feature: 'paths-ignore',
          file: wf.fileName,
          events: unfiltered,
          patterns: layout.patterns,
          warnings: layout.warnings
        });
      }
    }
  }

  // --- Alter: the EOL table itself is exhausted (#3388) ---
  // No `upgrade`, so ci-apply refuses it rather than writing null into a
  // workflow: the fix is a newer line in NODE_EOL, not a workflow edit.
  if (stalePins.length) {
    recommendations.push({
      type: 'Alter',
      kind: 'node-eol-table',
      description: `Every Node.js line in the NODE_EOL table is past end-of-life on ${now.toISOString().slice(0, 10)} — `
        + `add a newer LTS line to NODE_EOL in ci-recommend.js so EOL pins have an upgrade target (${stalePins.join(', ')})`,
      impact: 'Security: EOL versions no longer receive patches, and no supported target is known'
    });
  }

  // --- Improve: Missing artifact retention ---
  for (const wf of workflows) {
    for (const job of wf.jobs) {
      for (const step of job.steps) {
        if (step && step.uses && /actions\/upload-artifact/.test(step.uses)) {
          const hasRetention = step.with && step.with['retention-days'];
          if (!hasRetention) {
            recommendations.push({
              type: 'Improve',
              description: `Add retention-days to upload-artifact in ${wf.fileName} to avoid exhausting free-tier quota`,
              impact: 'Cost: default 90-day retention can exhaust 500 MB free quota in a few builds',
              feature: 'artifact-retention',
              file: wf.fileName
            });
          }
        }
      }
    }
  }

  // --- Add: Missing caching ---
  const hasAnyCaching = workflows.some(wf =>
    wf.jobs.some(j => j.hasCache)
  );
  if (!hasAnyCaching && analysis.buildSystem.length > 0) {
    recommendations.push({
      type: 'Add',
      description: 'Add dependency caching to speed up CI runs',
      impact: 'Performance: typically reduces install time by 50-70%',
      feature: 'dependency-caching'
    });
  }

  // --- Add: Missing security audit ---
  const hasAudit = workflows.some(wf =>
    wf.raw.includes('npm audit') || wf.raw.includes('pip-audit') ||
    wf.raw.includes('cargo audit') || wf.raw.includes('dependency-audit')
  );
  if (!hasAudit && analysis.buildSystem.length > 0) {
    recommendations.push({
      type: 'Add',
      description: 'Add dependency audit step to detect vulnerable packages',
      impact: 'Security: catches known vulnerabilities in dependencies',
      feature: 'dependency-audit'
    });
  }

  // --- Add: Missing security scanning ---
  const hasCodeQL = workflows.some(wf =>
    wf.raw.includes('codeql') || wf.raw.includes('CodeQL')
  );
  if (!hasCodeQL && analysis.languages.length > 0) {
    recommendations.push({
      type: 'Add',
      description: 'Add CodeQL analysis for automated security scanning',
      impact: 'Security: detects common vulnerability patterns in code',
      feature: 'codeql-analysis'
    });
  }

  // --- Add: Missing cross-OS testing ---
  const hasCrossOS = workflows.some(wf =>
    wf.jobs.some(j => j.matrix && j.matrix.os && Array.isArray(j.matrix.os) && j.matrix.os.length > 1)
  );
  if (!hasCrossOS && workflows.length > 0) {
    recommendations.push({
      type: 'Add',
      description: 'Add cross-OS testing to verify compatibility on Ubuntu, Windows, macOS',
      impact: 'Reliability: catches platform-specific issues early',
      feature: 'cross-os-testing'
    });
  }

  return recommendations;
}

/**
 * The per-push report `/ci --recommend` prints before its menu (#3424):
 * jobs per workflow and in total, then each advisory with what it gives up.
 * Advisories are hand edits, never menu items — no feature applies them.
 * @param {{workflows: object[], totalJobs: number, duplicates: object[]}} report
 * @returns {string}
 */
function formatPushReport(report) {
  const lines = ['Jobs started by one working-branch push:'];
  if (report.workflows.length === 0) lines.push('  (no workflow runs on a branch push)');
  for (const wf of report.workflows) {
    const notes = [];
    if (wf.branchPush === 'listed') notes.push('listed branches only — not in the total');
    if (wf.pathsFiltered) notes.push('path-filtered — some pushes skip it');
    lines.push(`  ${wf.fileName}: ${wf.jobCount} job(s)${notes.length ? ` (${notes.join('; ')})` : ''}`);
    for (const job of wf.jobs) {
      const extra = [];
      if (job.legs > 1) extra.push(`${job.legs} matrix legs`);
      if (job.unresolved.length) extra.push(`matrix ${job.unresolved.join(', ')} is an expression, counted as one`);
      if (job.skippedByCondition) extra.push('if: excludes a branch push — not counted');
      else if (job.conditional) extra.push('if: condition not evaluated — counted');
      lines.push(`    - ${job.name}${extra.length ? ` (${extra.join('; ')})` : ''}`);
    }
  }
  for (const file of report.unparsed || []) {
    lines.push(`  ${file}: could not be parsed — not counted; fix its YAML and re-run`);
  }
  lines.push(`  Total: ${report.totalJobs} job(s) per branch push`);
  const advisories = [...(report.duplicates || []), ...(report.localComparison ? report.localComparison.advisories : [])];
  if (report.localComparison) {
    lines.push('', `CI jobs against the local verification set (${report.localComparison.source}):`);
    if (report.localComparison.note) lines.push(`  ${report.localComparison.note}`);
    for (const j of report.localComparison.jobs) {
      lines.push(`  ${j.workflow}:${j.job} — ${j.verdict === 'duplicates' ? 'duplicates the local sweep' : `adds signal: ${j.signals.join('; ')}`}`);
    }
  }
  if (advisories.length) {
    lines.push('', 'Advisories (edit the workflow by hand):');
    advisories.forEach((a, i) => {
      lines.push(`  ${i + 1}. ${a.description}`);
      lines.push(`     Suggestion: ${a.suggestion}`);
      lines.push(`     Gives up: ${a.tradeoff}`);
    });
  }
  return lines.join('\n');
}

// CLI entry point
if (require.main === module) {
  const dir = process.argv[2] || process.cwd();
  console.log(formatPushReport(inventoryPushJobs(dir)) + '\n');
  const recs = analyzeGaps(dir);
  if (recs.length === 0) {
    console.log('Your CI configuration looks good — no recommendations.');
  } else {
    console.log(`Found ${recs.length} recommendation(s):\n`);
    recs.forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.type}] ${r.description}`);
      console.log(`     Impact: ${r.impact}`);
      if (r.tradeoff) console.log(`     Gives up: ${r.tradeoff}`);
    });
  }
}

module.exports = {
  inventoryWorkflows, analyzeGaps, RECOMMENDATION_TYPES, NODE_EOL, outdatedNodeVersions, nodeUpgradeTarget,
  TEST_COMMAND, isTestStep, expandMatrix, branchPushScope, commandSignature, suiteKey, runsOnBranchPush,
  resolvePackageScript, normalizeWorkDir, isSetupCommand, inventoryPushJobs, compareWithLocalSweep, eventPathFilters, unfilteredEvents, acceptsPathFilter, PATH_FILTER_EVENTS,
  classifyTriggerScope, SCANNER_STEPS, TRIGGER_SCOPE_TRADEOFF,
  formatPushReport
};
